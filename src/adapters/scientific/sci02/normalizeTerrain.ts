import type { TerrainDataset, ProjectedCoordinate, RasterTransform } from '../../../domain/terrain/types';
import { projectedToRaster, rasterToProjected } from '../../../domain/terrain/coordinates';
import { validateTerrainDataset } from '../../../domain/terrain/validateDataset';
import type { TerrainGrid } from './routeplanner';

export const MAX_SCI02_GRID_CELLS = 2_000_000;

export interface NormalizedSci02Terrain {
  grid: TerrainGrid;
  transform: RasterTransform;
  resampled: boolean;
  noDataCellCount: number;
  hazardCellCount: number;
  warnings: string[];
}

export class TerrainNormalizationError extends Error {
  constructor(message: string, readonly code: 'invalid-terrain' | 'grid-too-large') {
    super(message);
    this.name = 'TerrainNormalizationError';
  }
}

/**
 * Keep orthogonal rasters byte-for-byte as views; affine skew is regridded to a
 * north-up local metric grid. The source dataset is never mutated.
 */
export function normalizeTerrainForSci02(dataset: TerrainDataset): NormalizedSci02Terrain {
  const issues = validateTerrainDataset(dataset);
  if (issues.length) {
    throw new TerrainNormalizationError(`TerrainDataset failed validation: ${issues.join(' ')}`, 'invalid-terrain');
  }

  const [, a, b, , d, e] = dataset.transform.coefficients;
  const columnLength = Math.hypot(a, d);
  const rowLength = Math.hypot(b, e);
  const dotProduct = a * b + d * e;
  const orthogonalityTolerance = Math.max(columnLength * rowLength * 1e-10, Number.EPSILON);
  const noDataCellCount = dataset.validMask.reduce((count, valid) => count + (valid === 0 ? 1 : 0), 0);
  const hazardCellCount = dataset.hazardMask?.reduce((count, hazard) => count + (hazard === 1 ? 1 : 0), 0) ?? 0;

  if (Math.abs(dotProduct) <= orthogonalityTolerance) {
    return {
      grid: {
        width: dataset.width,
        height: dataset.height,
        cellSizeX: columnLength,
        cellSizeY: rowLength,
        elevationMeters: dataset.elevationMeters,
        validMask: dataset.validMask,
        ...(dataset.hazardMask ? { hazardMask: dataset.hazardMask } : {}),
      },
      transform: dataset.transform,
      resampled: false,
      noDataCellCount,
      hazardCellCount,
      warnings: [],
    };
  }

  return resampleSkewedGrid(dataset, columnLength, rowLength, noDataCellCount, hazardCellCount);
}

function resampleSkewedGrid(
  dataset: TerrainDataset,
  cellSizeX: number,
  cellSizeY: number,
  sourceNoDataCount: number,
  sourceHazardCount: number,
): NormalizedSci02Terrain {
  const [x0, a, b, y0, d, e] = dataset.transform.coefficients;
  const corners = [
    { x: x0, y: y0 },
    { x: x0 + dataset.width * a, y: y0 + dataset.width * d },
    { x: x0 + dataset.height * b, y: y0 + dataset.height * e },
    { x: x0 + dataset.width * a + dataset.height * b, y: y0 + dataset.width * d + dataset.height * e },
  ];
  const minX = Math.min(...corners.map(point => point.x));
  const maxX = Math.max(...corners.map(point => point.x));
  const minY = Math.min(...corners.map(point => point.y));
  const maxY = Math.max(...corners.map(point => point.y));
  const width = Math.max(1, Math.ceil((maxX - minX) / cellSizeX - 1e-10));
  const height = Math.max(1, Math.ceil((maxY - minY) / cellSizeY - 1e-10));
  const cellCount = width * height;

  if (!Number.isSafeInteger(cellCount) || cellCount > MAX_SCI02_GRID_CELLS) {
    throw new TerrainNormalizationError(
      `Orthogonal SCI-02 grid would contain ${cellCount.toLocaleString()} cells; the supported maximum is ${MAX_SCI02_GRID_CELLS.toLocaleString()}. Supply a smaller mission-area subset.`,
      'grid-too-large',
    );
  }

  const transform: RasterTransform = { coefficients: [minX, cellSizeX, 0, maxY, 0, -cellSizeY] };
  const elevationMeters = new Float32Array(cellCount).fill(Number.NaN);
  const validMask = new Uint8Array(cellCount);
  const hazardMask = dataset.hazardMask ? new Uint8Array(cellCount) : undefined;

  // Nearest-neighbor sample output pixel centers through the source affine inverse.
  // Centers outside the source footprint stay NoData; do not seed valid values into
  // the bounding-box wedges outside a rotated/sheared source raster.
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const outputIndex = row * width + column;
      const coordinate = rasterToProjected(column + 0.5, row + 0.5, transform);
      const sourcePixel = projectedToRaster(coordinate, dataset.transform);
      if (!sourcePixel) continue;
      const sourceColumn = Math.floor(sourcePixel.column);
      const sourceRow = Math.floor(sourcePixel.row);
      if (sourceColumn < 0 || sourceRow < 0 || sourceColumn >= dataset.width || sourceRow >= dataset.height) continue;

      const sourceIndex = sourceRow * dataset.width + sourceColumn;
      if (dataset.validMask[sourceIndex] === 1) {
        elevationMeters[outputIndex] = dataset.elevationMeters[sourceIndex];
        validMask[outputIndex] = 1;
      }
      if (hazardMask && dataset.hazardMask?.[sourceIndex] === 1) hazardMask[outputIndex] = 1;
    }
  }

  // Conservative center rasterization prevents a narrow NoData or confirmed
  // hazard cell from disappearing when an affine-skewed source is regridded.
  // It only removes validity/adds hazards; it never supplies an elevation value.
  for (let sourceRow = 0; sourceRow < dataset.height; sourceRow += 1) {
    for (let sourceColumn = 0; sourceColumn < dataset.width; sourceColumn += 1) {
      const sourceIndex = sourceRow * dataset.width + sourceColumn;
      const sourceCenter = rasterToProjected(sourceColumn + 0.5, sourceRow + 0.5, dataset.transform);
      const outputPixel = projectedToRaster(sourceCenter, transform);
      if (!outputPixel) continue;
      const outputColumn = Math.floor(outputPixel.column);
      const outputRow = Math.floor(outputPixel.row);
      if (outputColumn < 0 || outputRow < 0 || outputColumn >= width || outputRow >= height) continue;
      const outputIndex = outputRow * width + outputColumn;

      if (dataset.validMask[sourceIndex] === 0) {
        validMask[outputIndex] = 0;
        elevationMeters[outputIndex] = Number.NaN;
      }
      if (hazardMask && dataset.hazardMask?.[sourceIndex] === 1) hazardMask[outputIndex] = 1;
    }
  }

  const outputNoDataCount = validMask.reduce((count, valid) => count + (valid === 0 ? 1 : 0), 0);
  const outputHazardCount = hazardMask?.reduce((count, hazard) => count + (hazard === 1 ? 1 : 0), 0) ?? 0;
  const warnings = [
    `The source affine grid is skewed; SCI-02 used a north-up orthogonal local metric grid (${width} × ${height}) at ${cellSizeX.toFixed(3)} × ${cellSizeY.toFixed(3)} m. Elevations use nearest source-cell sampling at output pixel centers.`,
    `Source NoData and hazard cells were conservatively rasterized by their projected cell centers; source cells were not modified. NoData cells: ${sourceNoDataCount} → ${outputNoDataCount}; hazard cells: ${sourceHazardCount} → ${outputHazardCount}.`,
  ];

  return {
    grid: {
      width,
      height,
      cellSizeX,
      cellSizeY,
      elevationMeters,
      validMask,
      ...(hazardMask ? { hazardMask } : {}),
    },
    transform,
    resampled: true,
    noDataCellCount: outputNoDataCount,
    hazardCellCount: outputHazardCount,
    warnings,
  };
}

export function gridCellCenterToProjected(transform: RasterTransform, row: number, col: number): ProjectedCoordinate {
  return rasterToProjected(col + 0.5, row + 0.5, transform);
}

export function projectedToGridCell(
  transform: RasterTransform,
  width: number,
  height: number,
  coordinate: ProjectedCoordinate,
): { row: number; col: number } | null {
  const raster = projectedToRaster(coordinate, transform);
  if (!raster) return null;
  const col = Math.floor(raster.column);
  const row = Math.floor(raster.row);
  if (row < 0 || col < 0 || row >= height || col >= width) return null;
  return { row, col };
}

import type { GeographicCoordinate, MarsEquirectangularProjection, ProjectedCoordinate, RasterTransform, TerrainDataset, TerrainSample } from './types';
import type { GridCellIndex } from './types';

export const DEMO_PROJECTION: MarsEquirectangularProjection = {
  radiusM: 3_389_500,
  centralLongitudeDeg: 77.45,
  centralLatitudeDeg: -18.44,
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function geographicToProjected(
  coordinate: GeographicCoordinate,
  projection: MarsEquirectangularProjection = DEMO_PROJECTION,
): ProjectedCoordinate {
  const latitude0 = toRadians(projection.centralLatitudeDeg);
  const longitudeDelta = toRadians(coordinate.longitudeDeg - projection.centralLongitudeDeg);
  const latitudeDelta = toRadians(coordinate.latitudeDeg - projection.centralLatitudeDeg);
  return {
    x: projection.radiusM * Math.cos(latitude0) * longitudeDelta,
    y: projection.radiusM * latitudeDelta,
  };
}

export function projectedToGeographic(
  coordinate: ProjectedCoordinate,
  projection: MarsEquirectangularProjection = DEMO_PROJECTION,
): GeographicCoordinate {
  const latitude0 = toRadians(projection.centralLatitudeDeg);
  return {
    longitudeDeg: projection.centralLongitudeDeg + toDegrees(coordinate.x / (projection.radiusM * Math.cos(latitude0))),
    latitudeDeg: projection.centralLatitudeDeg + toDegrees(coordinate.y / projection.radiusM),
  };
}

export function projectedToRaster(
  coordinate: ProjectedCoordinate,
  transform: RasterTransform,
): { column: number; row: number } | null {
  const [x0, a, b, y0, d, e] = transform.coefficients;
  const determinant = a * e - b * d;
  if (Math.abs(determinant) < Number.EPSILON) return null;
  const dx = coordinate.x - x0;
  const dy = coordinate.y - y0;
  return {
    column: (dx * e - b * dy) / determinant,
    row: (a * dy - dx * d) / determinant,
  };
}

export function rasterToProjected(
  column: number,
  row: number,
  transform: RasterTransform,
): ProjectedCoordinate {
  const [x0, a, b, y0, d, e] = transform.coefficients;
  return { x: x0 + column * a + row * b, y: y0 + column * d + row * e };
}

/** Return the containing zero-based cell, or null when the point is outside the raster. */
export function coordinateToCell(dataset: TerrainDataset, coordinate: ProjectedCoordinate): GridCellIndex | null {
  const raster = projectedToRaster(coordinate, dataset.transform);
  if (!raster) return null;
  const column = Math.floor(raster.column);
  const row = Math.floor(raster.row);
  if (column < 0 || row < 0 || column >= dataset.width || row >= dataset.height) return null;
  return { column, row };
}

export function sampleTerrain(dataset: TerrainDataset, coordinate: ProjectedCoordinate): TerrainSample {
  const raster = projectedToRaster(coordinate, dataset.transform);
  if (!raster) return { status: 'out-of-bounds', coordinate };
  const column = Math.floor(raster.column);
  const row = Math.floor(raster.row);
  if (column < 0 || row < 0 || column >= dataset.width || row >= dataset.height) {
    return { status: 'out-of-bounds', coordinate };
  }
  const index = row * dataset.width + column;
  if (dataset.validMask[index] === 0) return { status: 'nodata', coordinate, cell: { column, row } };
  const elevationM = dataset.elevationMeters[index];
  if (!Number.isFinite(elevationM)) return { status: 'nodata', coordinate, cell: { column, row } };
  return { status: 'available', coordinate, elevationM, cell: { column, row } };
}

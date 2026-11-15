import { describe, expect, it } from 'vitest';
import { demoTerrain } from '../../../domain/terrain/demoFixture';
import { projectedToRaster, rasterToProjected } from '../../../domain/terrain/coordinates';
import { terrainContractFixture } from '../../../domain/terrain/testFixture';
import { gridCellCenterToProjected, normalizeTerrainForSci02, projectedToGridCell } from './normalizeTerrain';

describe('SCI-02 terrain grid normalization', () => {
  it('passes a regular orthogonal metric raster without copying or changing its affine transform', () => {
    const normalized = normalizeTerrainForSci02(demoTerrain);
    expect(normalized.resampled).toBe(false);
    expect(normalized.grid.elevationMeters).toBe(demoTerrain.elevationMeters);
    expect(normalized.grid.validMask).toBe(demoTerrain.validMask);
    expect(normalized.transform).toBe(demoTerrain.transform);
  });

  it('regrids a skewed affine raster to an orthogonal metric grid and retains NoData', () => {
    const sourceElevation = [...terrainContractFixture.elevationMeters];
    const sourceValidity = [...terrainContractFixture.validMask];
    const normalized = normalizeTerrainForSci02(terrainContractFixture);
    const [, a, b, , d, e] = normalized.transform.coefficients;
    const orthogonality = a * b + d * e;

    expect(normalized.resampled).toBe(true);
    expect(Math.abs(orthogonality)).toBeLessThan(1e-10);
    expect(normalized.grid.width * normalized.grid.height).toBe(normalized.grid.elevationMeters.length);
    expect(normalized.grid.validMask.length).toBe(normalized.grid.elevationMeters.length);

    const sourceNoDataCenter = rasterToProjected(2.5, 0.5, terrainContractFixture.transform);
    const normalizedNoDataCell = projectedToGridCell(normalized.transform, normalized.grid.width, normalized.grid.height, sourceNoDataCenter);
    expect(normalizedNoDataCell).not.toBeNull();
    const noDataIndex = normalizedNoDataCell!.row * normalized.grid.width + normalizedNoDataCell!.col;
    expect(normalized.grid.validMask[noDataIndex]).toBe(0);
    expect(Number.isNaN(normalized.grid.elevationMeters[noDataIndex])).toBe(true);
    expect(normalized.warnings.join(' ')).toMatch(/affine grid is skewed/);
    expect(normalized.warnings.join(' ')).toMatch(/source cells were not modified/);
    expect([...terrainContractFixture.elevationMeters]).toEqual(sourceElevation);
    expect([...terrainContractFixture.validMask]).toEqual(sourceValidity);
  });

  it('converts normalized grid cell centers to and from projected coordinates', () => {
    const normalized = normalizeTerrainForSci02(terrainContractFixture);
    const coordinate = gridCellCenterToProjected(normalized.transform, 1, 1);
    const pixel = projectedToRaster(coordinate, normalized.transform);
    const cell = projectedToGridCell(normalized.transform, normalized.grid.width, normalized.grid.height, coordinate);

    expect(pixel?.column).toBeCloseTo(1.5, 10);
    expect(pixel?.row).toBeCloseTo(1.5, 10);
    expect(cell).toEqual({ row: 1, col: 1 });
  });

  it('leaves the bounding-box wedges outside a skewed source footprint as NoData', () => {
    const normalized = normalizeTerrainForSci02(terrainContractFixture);
    for (let row = 0; row < normalized.grid.height; row += 1) {
      for (let col = 0; col < normalized.grid.width; col += 1) {
        const index = row * normalized.grid.width + col;
        if (normalized.grid.validMask[index] !== 1) continue;
        const coordinate = gridCellCenterToProjected(normalized.transform, row, col);
        const sourcePixel = projectedToRaster(coordinate, terrainContractFixture.transform);
        expect(sourcePixel).not.toBeNull();
        expect(sourcePixel!.column).toBeGreaterThanOrEqual(0);
        expect(sourcePixel!.row).toBeGreaterThanOrEqual(0);
        expect(sourcePixel!.column).toBeLessThan(terrainContractFixture.width);
        expect(sourcePixel!.row).toBeLessThan(terrainContractFixture.height);
      }
    }
  });
});

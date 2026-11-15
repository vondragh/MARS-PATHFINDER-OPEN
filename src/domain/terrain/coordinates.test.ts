import { describe, expect, it } from 'vitest';
import { geographicToProjected, coordinateToCell, projectedToGeographic, rasterToProjected, sampleTerrain } from './coordinates';
import { terrainContractFixture } from './testFixture';
import { demoTerrain } from './demoFixture';
import { validateTerrainDataset } from './validateDataset';

describe('terrain coordinate contract', () => {
  it('converts geographic degrees to local meters and back explicitly', () => {
    const original = { longitudeDeg: 77.5, latitudeDeg: -18.4 };
    const projected = geographicToProjected(original);
    const roundTrip = projectedToGeographic(projected);
    expect(projected.x).toBeGreaterThan(0);
    expect(projected.y).toBeGreaterThan(0);
    expect(roundTrip.longitudeDeg).toBeCloseTo(original.longitudeDeg, 8);
    expect(roundTrip.latitudeDeg).toBeCloseTo(original.latitudeDeg, 8);
  });

  it('uses the full rotated/sheared affine transform and pixel-corner convention', () => {
    const center = rasterToProjected(1.5, 0.5, terrainContractFixture.transform);
    expect(center).toEqual({ x: 1_031, y: 1_986.5 });
    expect(coordinateToCell(terrainContractFixture, center)).toEqual({ column: 1, row: 0 });
    expect(sampleTerrain(terrainContractFixture, center)).toMatchObject({ status: 'available', elevationM: 11 });
  });

  it('reports NoData and out-of-bounds without interpolation', () => {
    const noDataCenter = rasterToProjected(2.5, 0.5, terrainContractFixture.transform);
    expect(sampleTerrain(terrainContractFixture, noDataCenter).status).toBe('nodata');
    expect(sampleTerrain(terrainContractFixture, { x: 900, y: 2_000 }).status).toBe('out-of-bounds');
  });

  it('validates array lengths, units, masks, and non-singular affine metadata', () => {
    expect(validateTerrainDataset(terrainContractFixture)).toEqual([]);
    expect(validateTerrainDataset(demoTerrain)).toEqual([]);
    const invalid = { ...terrainContractFixture, validMask: Uint8Array.from([1, 1]) };
    expect(validateTerrainDataset(invalid)).toContain('Validity mask length must equal width × height.');

    const nonFiniteValidElevation = Float32Array.from(terrainContractFixture.elevationMeters);
    nonFiniteValidElevation[0] = Number.NaN;
    expect(validateTerrainDataset({ ...terrainContractFixture, elevationMeters: nonFiniteValidElevation }))
      .toContain('Valid elevation values must be finite (invalid value at index 0).');

    expect(validateTerrainDataset({
      ...terrainContractFixture,
      coordinateTransform: { ...terrainContractFixture.coordinateTransform, targetCrs: 'OTHER_CRS' },
    })).toContain('Coordinate transform target CRS must match horizontalCrs.');
    expect(validateTerrainDataset({ ...terrainContractFixture, horizontalCrsDefinition: ' ' }))
      .toContain('Full horizontal CRS definition is required.');
    expect(validateTerrainDataset({
      ...terrainContractFixture,
      coordinateTransform: { ...terrainContractFixture.coordinateTransform, sourceCrsDefinition: '' },
    })).toContain('Full coordinate transform source CRS definition is required.');
  });
});

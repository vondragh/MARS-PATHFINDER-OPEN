import type { TerrainDataset } from './types';

/** Minimal 3 × 2 fixture; the affine transform includes rotation/shear to catch north-up assumptions. */
export const terrainContractFixture: TerrainDataset = {
  id: 'contract-fixture-3x2',
  title: '3 × 2 terrain contract fixture',
  sourceOrganization: 'MARS PATHFINDER integration tests',
  sourceUrl: '',
  horizontalCrs: 'LOCAL_TEST_METRIC',
  horizontalCrsDefinition: 'Test-only local Cartesian CRS; x east and y north in meters; not a planetary CRS.',
  coordinateTransform: {
    sourceCrs: 'LOCAL_TEST_GEOGRAPHIC',
    sourceCrsDefinition: 'Test-only local control coordinates; no geographic or planetary meaning.',
    targetCrs: 'LOCAL_TEST_METRIC',
    method: 'Fixture-only affine control mapping',
    definition: 'Coordinates are supplied in LOCAL_TEST_METRIC directly; no planetary meaning is assigned.',
  },
  horizontalUnit: 'm',
  verticalUnit: 'm',
  verticalDatum: 'Fixture arbitrary zero',
  limitations: ['Test fixture only; values do not represent Mars terrain.'],
  provenance: 'synthetic',
  width: 3,
  height: 2,
  cellSizeX: Math.hypot(20, 1),
  cellSizeY: Math.hypot(2, -30),
  transform: { coefficients: [1_000, 20, 2, 2_000, 1, -30] },
  elevationMeters: Float32Array.from([10, 11, Number.NaN, 20, 21, 22]),
  validMask: Uint8Array.from([1, 1, 0, 1, 1, 1]),
};

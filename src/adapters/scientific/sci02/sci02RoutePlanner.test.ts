import { describe, expect, it } from 'vitest';
import { assessMission } from '../../../domain/mission/assessment';
import { createInitialMissionState } from '../../../hooks/useMissionController';
import type { RoutePlannerInput } from '../../../domain/routing/types';
import { coordinateToCell, rasterToProjected } from '../../../domain/terrain/coordinates';
import { terrainContractFixture } from '../../../domain/terrain/testFixture';
import { normalizeTerrainForSci02, projectedToGridCell } from './normalizeTerrain';
import type { TerrainDataset, ProjectedCoordinate } from '../../../domain/terrain/types';
import { validateRouteResult } from '../../../domain/routing/validation';
import { executeSci02RoutePlanner } from './executeSci02RoutePlanner';
import { createSci02RoutePlannerAdapter } from './sci02RoutePlanner';

const directAdapter = createSci02RoutePlannerAdapter(async input => executeSci02RoutePlanner(input));

function makeTerrain(width: number, height: number, options: { elevations?: number[]; valid?: number[]; hazards?: number[]; skewed?: boolean } = {}): TerrainDataset {
  const cellSize = 10;
  const transform = options.skewed
    ? { coefficients: [1_000, 10, 1, 2_000, 1, -10] as const }
    : { coefficients: [0, cellSize, 0, height * cellSize, 0, -cellSize] as const };
  const elevations = options.elevations ?? new Array(width * height).fill(0);
  const valid = options.valid ?? new Array(width * height).fill(1);
  const hazards = options.hazards;
  const source: TerrainDataset = {
    id: options.skewed ? 'sci02-skew-test' : 'sci02-grid-test',
    title: 'SCI-02 integration test grid',
    sourceOrganization: 'MARS PATHFINDER tests',
    sourceUrl: '',
    horizontalCrs: 'LOCAL_TEST_METRIC',
    horizontalCrsDefinition: 'Test-only local east/north metric coordinate system.',
    coordinateTransform: {
      sourceCrs: 'LOCAL_TEST_METRIC',
      sourceCrsDefinition: 'Test-only coordinates in meters.',
      targetCrs: 'LOCAL_TEST_METRIC',
      method: 'Identity test transform',
      definition: 'Coordinates are already local metric x/y values.',
    },
    horizontalUnit: 'm',
    verticalUnit: 'm',
    verticalDatum: 'Test arbitrary zero',
    limitations: ['Integration fixture only; not Mars terrain.'],
    provenance: 'synthetic',
    width,
    height,
    cellSizeX: options.skewed ? Math.hypot(10, 1) : cellSize,
    cellSizeY: options.skewed ? Math.hypot(1, -10) : cellSize,
    transform,
    elevationMeters: Float32Array.from(elevations),
    validMask: Uint8Array.from(valid),
    ...(hazards ? {
      hazardMask: Uint8Array.from(hazards),
      hazardProvenance: { sourceOrganization: 'SCI-02 test fixture', sourceUrl: 'https://example.invalid/hazards', limitations: ['Synthetic test-only hazard cells.'] },
    } : {}),
  };
  return source;
}

function createInput(terrain = terrainContractFixture, options: Partial<RoutePlannerInput> = {}): RoutePlannerInput {
  const start = cellCenter(terrain, 1, 0);
  const destination = cellCenter(terrain, terrain.height - 1, terrain.width - 1);
  const startCell = coordinateToCell(terrain, start);
  const destinationCell = coordinateToCell(terrain, destination);
  if (!startCell || !destinationCell) throw new Error('Integration fixture endpoints must be inside terrain bounds.');
  return {
    requestId: 'SCI02-TEST-001',
    terrain,
    start: { id: 'habitat', coordinate: start, cell: { row: startCell.row, col: startCell.column } },
    destination: { id: 'destination', coordinate: destination, cell: { row: destinationCell.row, col: destinationCell.column } },
    waypoints: [],
    constraints: { maxSlopeDeg: 90, noDataPolicy: 'reject-route' },
    evaAssumptions: { walkingSpeedMps: 1, evaTimeLimitMinutes: 60, scienceActivityMinutes: 10, safetyReserveMinutes: 5 },
    optimizationMode: 'shortest',
    returnToHabitat: true,
    includeAlternatives: true,
    ...options,
  };
}

function cellCenter(terrain: TerrainDataset, row: number, column: number): ProjectedCoordinate {
  return rasterToProjected(column + 0.5, row + 0.5, terrain.transform);
}

function distance(points: ProjectedCoordinate[]) {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

describe('SCI-02 canonical adapter integration', () => {
  it('maps SCI-02 cells and profiles to projected map coordinates and returns both requested modes', async () => {
    const input = createInput();
    const result = await directAdapter.calculate(input, new AbortController().signal);

    expect(validateRouteResult(result, input.requestId)).toEqual([]);
    expect(result.status, result.failureReason).toBe('success');
    expect(result.selectedRoute?.id).toBe('sci02-shortest');
    expect(result.alternatives.map(route => route.id)).toEqual(['sci02-riskAware']);
    expect(result.selectedRoute?.metadata.normalization).toBe('affine-skew-resampled');
    expect(result.warnings.some(warning => warning.includes('No confirmed hazard layer'))).toBe(true);
    expect(result.warnings.some(warning => warning.includes('NoData cells'))).toBe(true);

    const selected = result.selectedRoute!;
    expect(selected.outbound.coordinates[0]).toEqual(selected.outbound.start.coordinate);
    expect(selected.outbound.coordinates.at(-1)).toEqual(selected.outbound.end.coordinate);
    expect(distance(selected.outbound.coordinates)).toBeCloseTo(selected.outbound.distanceM, 6);
    expect(distance(selected.return.coordinates)).toBeCloseTo(selected.return.distanceM, 6);
    expect(selected.totalDistanceM).toBeCloseTo(selected.outbound.distanceM + selected.return.distanceM, 6);
    expect(selected.elevationProfile.at(-1)?.distanceM).toBeCloseTo(selected.totalDistanceM, 6);
    expect(selected.elevationProfile.every(sample => sample.elevationM !== null)).toBe(true);
  });

  it('rejects a NoData endpoint and never routes through NoData cells', async () => {
    const noDataEndpointInput = createInput(terrainContractFixture, {
      start: { id: 'habitat', coordinate: cellCenter(terrainContractFixture, 0, 2), cell: { row: 0, col: 2 } },
    });
    const noDataEndpoint = executeSci02RoutePlanner(noDataEndpointInput);
    expect(noDataEndpoint.status).toBe('failed');
    expect(noDataEndpoint.failureCode).toBe('nodata-endpoint');

    const routeInput = createInput();
    const routeResult = executeSci02RoutePlanner(routeInput);
    expect(routeResult.status, routeResult.failureReason).toBe('success');
    const normalized = normalizeTerrainForSci02(routeInput.terrain);
    for (const route of [routeResult.selectedRoute!, ...routeResult.alternatives]) {
      for (const cell of [...route.outbound.traversedCells, ...route.return.traversedCells]) {
        const profileSample = route.elevationProfile.find(sample => sample.cell.row === cell.row && sample.cell.col === cell.col);
        expect(profileSample).toBeDefined();
        const normalizedCell = projectedToGridCell(normalized.transform, normalized.grid.width, normalized.grid.height, profileSample!.coordinate);
        expect(normalizedCell).toEqual(cell);
        const index = cell.row * normalized.grid.width + cell.col;
        expect(normalized.grid.validMask[index]).toBe(1);
        expect(Number.isFinite(normalized.grid.elevationMeters[index])).toBe(true);
      }
    }
  });

  it('does not mark a found route as EVA-compliant when the required time exceeds budget', async () => {
    const terrain = makeTerrain(5, 5);
    const input = createInput(terrain, {
      start: { id: 'habitat', coordinate: cellCenter(terrain, 1, 1), cell: { row: 1, col: 1 } },
      destination: { id: 'destination', coordinate: cellCenter(terrain, 3, 3), cell: { row: 3, col: 3 } },
      evaAssumptions: { walkingSpeedMps: 0.5, evaTimeLimitMinutes: 1, scienceActivityMinutes: 0, safetyReserveMinutes: 0 },
      includeAlternatives: false,
    });
    const routeResult = executeSci02RoutePlanner(input);
    expect(routeResult.status, routeResult.failureReason).toBe('success');
    expect(routeResult.selectedRoute?.feasible).toBe(true);
    expect(routeResult.selectedRoute?.estimatedEvaDurationMinutes).toBeGreaterThan(input.evaAssumptions.evaTimeLimitMinutes);
    expect(routeResult.selectedRoute?.estimatedEvaDurationMinutes).toBeCloseTo(
      routeResult.selectedRoute!.estimatedMovementTimeMinutes! + input.evaAssumptions.scienceActivityMinutes + input.evaAssumptions.safetyReserveMinutes,
      6,
    );
    expect(routeResult.selectedRoute?.terrainWarnings.some(warning => warning.includes('EVA_BUDGET_EXCEEDED'))).toBe(true);

    const mission = createInitialMissionState();
    mission.calculationState = 'success';
    mission.result = routeResult;
    mission.selectedRouteId = routeResult.selectedRoute!.id;
    mission.constraints.maximumEvaDurationHours = input.evaAssumptions.evaTimeLimitMinutes / 60;
    const assessment = assessMission(mission);
    expect(assessment.planState).toBe('constraints-exceeded');
    expect(assessment.evaBudget.state).toBe('exceeded');
  });

  it('rejects a cliff-separated grid when every crossing exceeds the slope limit', async () => {
    const terrain = makeTerrain(3, 3, { elevations: [0, 10, 10, 0, 10, 10, 0, 10, 10] });
    const input = createInput(terrain, {
      start: { id: 'habitat', coordinate: cellCenter(terrain, 1, 0), cell: { row: 1, col: 0 } },
      destination: { id: 'destination', coordinate: cellCenter(terrain, 1, 2), cell: { row: 1, col: 2 } },
      constraints: { maxSlopeDeg: 15, noDataPolicy: 'reject-route' },
      includeAlternatives: false,
    });
    const result = executeSci02RoutePlanner(input);
    expect(result.status).toBe('infeasible');
    expect(result.failureCode).toBe('no-feasible-route');
  });

  it('accepts both inclusive canonical slope boundaries, including risk-aware zero-degree mode', () => {
    const flatTerrain = makeTerrain(3, 3);
    const zeroLimit = createInput(flatTerrain, {
      start: { id: 'habitat', coordinate: cellCenter(flatTerrain, 0, 0), cell: { row: 0, col: 0 } },
      destination: { id: 'destination', coordinate: cellCenter(flatTerrain, 2, 2), cell: { row: 2, col: 2 } },
      constraints: { maxSlopeDeg: 0, noDataPolicy: 'reject-route' },
      optimizationMode: 'riskAware',
      includeAlternatives: false,
    });
    expect(executeSci02RoutePlanner(zeroLimit).status).toBe('success');

    const ninetyLimit = { ...zeroLimit, requestId: 'SCI02-TEST-090', constraints: { maxSlopeDeg: 90, noDataPolicy: 'reject-route' as const } };
    expect(executeSci02RoutePlanner(ninetyLimit).status).toBe('success');
  });

  it('avoids confirmed hazards and preserves request data', async () => {
    const hazards = new Array(25).fill(0);
    hazards[2 * 5 + 2] = 1;
    const terrain = makeTerrain(5, 5, { hazards });
    const input = createInput(terrain, {
      start: { id: 'habitat', coordinate: cellCenter(terrain, 2, 0), cell: { row: 2, col: 0 } },
      destination: { id: 'destination', coordinate: cellCenter(terrain, 2, 4), cell: { row: 2, col: 4 } },
    });
    const beforeElevation = [...terrain.elevationMeters];
    const beforeValidity = [...terrain.validMask];
    const beforeHazards = [...terrain.hazardMask!];
    const result = await directAdapter.calculate(input, new AbortController().signal);

    expect(result.status, result.failureReason).toBe('success');
    for (const route of [result.selectedRoute!, ...result.alternatives]) {
      for (const cell of [...route.outbound.traversedCells, ...route.return.traversedCells]) {
        expect(terrain.hazardMask![cell.row * terrain.width + cell.col]).toBe(0);
      }
    }
    expect([...terrain.elevationMeters]).toEqual(beforeElevation);
    expect([...terrain.validMask]).toEqual(beforeValidity);
    expect([...terrain.hazardMask!]).toEqual(beforeHazards);
  });
});

import { describe, expect, it } from 'vitest';
import { demoRoutePlanner } from '../../adapters/demo/demoRoutePlanner';
import { demoSites, demoTerrain } from '../terrain/demoFixture';
import { coordinateToCell } from '../terrain/coordinates';
import type { RoutePlannerInput } from './types';
import { validateRouteResult } from './validation';

function createInput(overrides: Partial<RoutePlannerInput> = {}): RoutePlannerInput {
  const start = { x: demoSites.habitat.x, y: demoSites.habitat.y };
  const destination = { x: demoSites.siteA.x, y: demoSites.siteA.y };
  const startCell = coordinateToCell(demoTerrain, start);
  const destinationCell = coordinateToCell(demoTerrain, destination);
  if (!startCell || !destinationCell) throw new Error('Test endpoints should be inside the demo raster.');
  return {
    requestId: 'EVA-TEST-001',
    terrain: demoTerrain,
    start: { id: 'habitat', coordinate: start, cell: { row: startCell.row, col: startCell.column } },
    destination: { id: 'site-a', coordinate: destination, cell: { row: destinationCell.row, col: destinationCell.column } },
    waypoints: [],
    constraints: { maxSlopeDeg: 45, noDataPolicy: 'reject-route' },
    evaAssumptions: {
      walkingSpeedMps: 2.6 / 3.6,
      evaTimeLimitMinutes: 720,
      scienceActivityMinutes: 45,
      safetyReserveMinutes: 30,
    },
    optimizationMode: 'shortest',
    returnToHabitat: true,
    includeAlternatives: true,
    ...overrides,
  };
}

describe('RoutePlannerAdapter contract', () => {
  it('returns two structured demo alternatives with both legs and elevation samples', async () => {
    const input = createInput();
    const result = await demoRoutePlanner.calculate(input, new AbortController().signal);
    expect(validateRouteResult(result, input.requestId)).toEqual([]);
    expect(result.status).toBe('success');
    expect(result.selectedRoute?.outbound.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(result.selectedRoute?.return.coordinates[0]).toEqual(input.destination.coordinate);
    expect(result.alternatives).toHaveLength(1);
    expect(result.selectedRoute?.totalDistanceM).toBeCloseTo(
      (result.selectedRoute?.outbound.distanceM ?? 0) + (result.selectedRoute?.return.distanceM ?? 0),
      5,
    );
    expect(result.selectedRoute?.elevationProfile.some(sample => sample.leg === 'return')).toBe(true);
    expect(result.warnings[0]).toMatch(/Synthetic demo output only/);
  });

  it('returns an explicit failure when the supplied endpoint cell disagrees with the affine grid', async () => {
    const input = createInput({ start: { id: 'habitat', coordinate: { x: 490, y: 505 }, cell: { col: 0, row: 0 } } });
    const result = await demoRoutePlanner.calculate(input, new AbortController().signal);
    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('start-out-of-bounds');
    expect(result.failureReason).toMatch(/coordinate and cell/);
    expect(validateRouteResult(result, input.requestId)).toEqual([]);
  });

  it('uses the canonical riskAware mode and fixed reserve minutes', async () => {
    const input = createInput({ optimizationMode: 'riskAware' });
    const result = await demoRoutePlanner.calculate(input, new AbortController().signal);
    expect(result.selectedRoute?.metadata.optimizationMode).toBe('riskAware');
    expect(result.selectedRoute?.estimatedEvaDurationMinutes).toBeGreaterThan(result.selectedRoute?.estimatedMovementTimeMinutes ?? 0);
  });

  it('selects a feasible fixed demo candidate when the preferred shape exceeds the EVA budget', async () => {
    const input = createInput({
      optimizationMode: 'riskAware',
      evaAssumptions: { walkingSpeedMps: 2.6 / 3.6, evaTimeLimitMinutes: 212, scienceActivityMinutes: 45, safetyReserveMinutes: 30 },
    });
    const result = await demoRoutePlanner.calculate(input, new AbortController().signal);

    expect(result.status).toBe('success');
    expect(result.selectedRoute?.id).toBe('route-shortest');
    expect(result.selectedRoute?.feasible).toBe(true);
    expect(result.alternatives[0]?.feasible).toBe(false);
    expect(result.warnings.some(warning => warning.includes('requested terrain detour demo shape failed'))).toBe(true);
    expect(validateRouteResult(result, input.requestId)).toEqual([]);
  });

  it('rejects an infeasible top-level result that contains a passing alternative', async () => {
    const input = createInput();
    const result = await demoRoutePlanner.calculate(input, new AbortController().signal);
    const inconsistent = {
      ...result,
      status: 'infeasible' as const,
      feasible: false,
      selectedRoute: result.selectedRoute ? { ...result.selectedRoute, feasible: false } : undefined,
      alternatives: result.alternatives.map(route => ({ ...route, feasible: true })),
      failureCode: 'no-feasible-route' as const,
      failureReason: 'No demo candidate passes the configured limits.',
    };

    expect(validateRouteResult(inconsistent, input.requestId)).toContain('An infeasible result cannot include a feasible alternative route.');
  });

  it('honors an AbortSignal during asynchronous work', async () => {
    const controller = new AbortController();
    const pending = demoRoutePlanner.calculate(createInput(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

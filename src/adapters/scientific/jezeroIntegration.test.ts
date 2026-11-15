import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { loadTerrainDataset } from './loadTerrainDataset';
import { executeSci02RoutePlanner } from './sci02/executeSci02RoutePlanner';
import { rasterToProjected, sampleTerrain } from '../../domain/terrain/coordinates';
import type { RoutePlannerInput } from '../../domain/routing/types';

const root = `${process.cwd()}/public/data/terrain/jezero-hirise-1km/`;
function mockFiles() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const bytes = readFileSync(root + url.split('/').pop());
    return new Response(bytes);
  }));
}
afterEach(() => vi.unstubAllGlobals());
describe('real Jezero data integration', () => {
  it('loads little-endian source samples and maps pixel centers correctly', async () => {
    mockFiles();
    const terrain = await loadTerrainDataset();
    expect(terrain.provenance).toBe('scientific');
    expect(terrain.elevationMeters.length).toBe(250000);
    expect(terrain.validMask.every(value => value === 1)).toBe(true);
    expect(terrain.elevationMeters[0]).toBe(-2555.2275390625);
    expect(rasterToProjected(.5, .5, terrain.transform)).toEqual({ x: -499, y: 499 });
    expect(rasterToProjected(499.5, 499.5, terrain.transform)).toEqual({ x: 499, y: -499 });
  });
  it('rejects truncated binary data', async () => {
    mockFiles();
    const original = fetch;
    vi.stubGlobal('fetch', (url: string) => url.endsWith('valid.u8') ? Promise.resolve(new Response(new Uint8Array(1))) : original(url));
    await expect(loadTerrainDataset()).rejects.toThrow('binary sizes');
  });
  it('routes on actual heights with aligned profiles and both optimization modes', async () => {
    mockFiles();
    const terrain = await loadTerrainDataset();
    const endpoint = (row: number, col: number) => ({ id: `${row}-${col}`, cell: { row, col }, coordinate: rasterToProjected(col+.5,row+.5,terrain.transform) });
    const input: RoutePlannerInput = {
      requestId: 'real-jezero-test', terrain, start: endpoint(374,100), destination: endpoint(125,374), waypoints: [],
      constraints: { maxSlopeDeg: 20, noDataPolicy: 'reject-route' },
      evaAssumptions: { walkingSpeedMps: 1, evaTimeLimitMinutes: 1, scienceActivityMinutes: 10, safetyReserveMinutes: 5 },
      optimizationMode: 'shortest', returnToHabitat: true, includeAlternatives: true,
    };
    const result = executeSci02RoutePlanner(input);
    expect(result.status).toBe('success');
    expect(result.alternatives).toHaveLength(1);
    const route = result.selectedRoute!;
    expect(route.metadata.normalization).toBe('source-orthogonal-grid');
    expect(route.estimatedEvaDurationMinutes).toBeGreaterThan(1);
    const distance = route.outbound.coordinates.slice(1).reduce((sum,p,i) => sum+Math.hypot(p.x-route.outbound.coordinates[i].x,p.y-route.outbound.coordinates[i].y),0);
    expect(route.outbound.distanceM).toBeCloseTo(distance,6);
    for (const point of route.elevationProfile) {
      const sample = sampleTerrain(terrain, point.coordinate);
      expect(sample.status).toBe('available');
      if (sample.status === 'available') expect(point.elevationM).toBe(sample.elevationM);
    }
    expect(result.warnings.join(' ')).toContain('No confirmed hazard layer');
    terrain.validMask[374*500+100] = 0;
    terrain.elevationMeters[374*500+100] = NaN;
    expect(executeSci02RoutePlanner(input).status).not.toBe('success');
  });
});

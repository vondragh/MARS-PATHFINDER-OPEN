/**
 * SCI-02 — Automated Test Suite for Martian EVA Route Planning Engine
 * Project: MARS PATHFINDER (NASA Space Apps Challenge)
 * Author: Tymur (Mobility & Route Scientist)
 *
 * Covers all 8 mandatory test scenarios from Section 6 of the SCI-02 specification,
 * plus EVA budget overrun, round-trip returnToHabitat separation, and input validation.
 *
 * Directly executable with Node.js type stripping or `tsx`.
 */

import {
  planEvaRoute,
  analyzeTransition,
  computeSlopeDeg,
} from './routeplanner.ts';
import { describe, it } from 'vitest';
import type {
  TerrainGrid,
  RouteConfiguration,
  RoutePlannerInput,
} from './routeplanner.ts';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertClose(actual: number, expected: number, tolerance = 1e-6, label = 'value'): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `Assertion failed for ${label}: expected ${expected} (±${tolerance}), got ${actual}`
    );
  }
}

function createFlatTerrain(
  width: number,
  height: number,
  cellSizeX = 10,
  cellSizeY = 10,
  baseElevation = -2500
): TerrainGrid {
  const size = width * height;
  return {
    width,
    height,
    cellSizeX,
    cellSizeY,
    elevationMeters: new Array(size).fill(baseElevation),
    validMask: new Array(size).fill(true),
    hazardMask: new Array(size).fill(false),
  };
}

function createBaseConfig(overrides: Partial<RouteConfiguration> = {}): RouteConfiguration {
  return {
    start: { row: 0, col: 0 },
    destination: { row: 4, col: 4 },
    maxSlopeDeg: 15,
    walkingSpeedMps: 0.8,
    evaTimeLimitMinutes: 240,
    scienceActivityMinutes: 30,
    safetyReserveMinutes: 20,
    optimizationMode: 'shortest',
    returnToHabitat: false,
    ...overrides,
  };
}

export interface TestCaseResult {
  name: string;
  passed: boolean;
  error?: string;
}

export function runAllSci02Tests(): TestCaseResult[] {
  const results: TestCaseResult[] = [];

  function runTest(name: string, fn: () => void): void {
    try {
      fn();
      results.push({ name, passed: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name, passed: false, error: message });
    }
  }

  // ---------------------------------------------------------------------------
  // Test 1: Плоска поверхня без перешкод (Flat surface without obstacles)
  // ---------------------------------------------------------------------------
  runTest('1. Flat surface without obstacles (Плоска поверхня без перешкод)', () => {
    const terrain = createFlatTerrain(5, 5, 10, 10, -2400);
    const config = createBaseConfig({
      start: { row: 0, col: 0 },
      destination: { row: 0, col: 4 },
      returnToHabitat: false,
    });

    const res = planEvaRoute({ terrain, config });
    assertCondition(res.status === 'success', `Expected status 'success', got '${res.status}'`);
    assertCondition(res.points.length === 5, `Expected 5 points on straight path, got ${res.points.length}`);
    assertClose(res.distanceMeters, 40, 1e-6, 'horizontal distance on flat 5-cell row');
    assertClose(res.maxSlopeDeg, 0, 1e-6, 'maxSlopeDeg on flat terrain');
    assertClose(res.estimatedTravelMinutes, 40 / 0.8 / 60, 1e-6, 'estimatedTravelMinutes');
    assertClose(
      res.estimatedEvaMinutes,
      40 / 0.8 / 60 + 30,
      1e-6,
      'estimatedEvaMinutes (travel + science)'
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2: Маршрут в обхід непрохідної ділянки (Route bypassing impassable hazard)
  // ---------------------------------------------------------------------------
  runTest('2. Route bypassing an impassable hazard area (Маршрут в обхід непрохідної ділянки)', () => {
    const terrain = createFlatTerrain(5, 5, 10, 10, 0);
    const hazardMask = new Array(25).fill(false);
    // Block the vertical barrier at col = 2 for rows 0, 1, 2, 3 (leaving row 4 open)
    hazardMask[0 * 5 + 2] = true;
    hazardMask[1 * 5 + 2] = true;
    hazardMask[2 * 5 + 2] = true;
    hazardMask[3 * 5 + 2] = true;
    terrain.hazardMask = hazardMask;

    const config = createBaseConfig({
      start: { row: 1, col: 0 },
      destination: { row: 1, col: 4 },
    });

    const res = planEvaRoute({ terrain, config });
    assertCondition(res.status === 'success', `Expected 'success', got '${res.status}'`);
    assertCondition(res.points.length > 0, 'Route points should not be empty');

    // Verify no point along the route steps onto a hazard cell
    for (const pt of res.points) {
      const idx = pt.row * terrain.width + pt.col;
      assertCondition(
        !hazardMask[idx],
        `Route illegally stepped on hazard cell (${pt.row}, ${pt.col})`
      );
    }

    // Must pass through the open gap at row 4, col 2
    const passesGap = res.points.some((p) => p.row === 4 && p.col === 2);
    assertCondition(passesGap, 'Route should detour around the hazard wall via row 4, col 2');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Неприпустимий нахил (Excessive slope rejection & detour)
  // ---------------------------------------------------------------------------
  runTest('3. Excessive slope enforcement (Неприпустимий нахил)', () => {
    // 3x3 terrain where direct path across col 1 has a 10m cliff over 10m horizontal (45 deg > 15 deg)
    const terrain = createFlatTerrain(3, 3, 10, 10, 0);
    terrain.elevationMeters = [
      0, 10, 10,
      0, 10, 10,
      0, 10, 10,
    ];
    const config = createBaseConfig({
      start: { row: 1, col: 0 },
      destination: { row: 1, col: 2 },
      maxSlopeDeg: 15, // 45 deg cliff exceeds 15 deg limit
    });

    const blockedRes = planEvaRoute({ terrain, config });
    assertCondition(
      blockedRes.status === 'noRoute',
      `Expected 'noRoute' across 45° cliff with maxSlopeDeg=15°, got '${blockedRes.status}'`
    );

    // Now provide a gentle ramp along row 2: 0m -> 2m (11.31°) -> 4m (11.31°)
    terrain.elevationMeters = [
      0, 10, 4,
      0, 10, 4,
      0,  2, 4,
    ];
    const rampConfig = createBaseConfig({
      start: { row: 2, col: 0 },
      destination: { row: 0, col: 2 },
      maxSlopeDeg: 15,
    });
    const rampRes = planEvaRoute({ terrain, config: rampConfig });
    assertCondition(
      rampRes.status === 'success',
      `Expected 'success' when a 11.31° ramp (< 15°) is available, got '${rampRes.status}'`
    );
    assertCondition(
      rampRes.maxSlopeDeg <= 15 + 1e-6,
      `Expected maxSlopeDeg <= 15°, got ${rampRes.maxSlopeDeg}`
    );
  });

  // ---------------------------------------------------------------------------
  // Test 4: Ділянка з відсутніми даними NoData (Area with missing NoData cells)
  // ---------------------------------------------------------------------------
  runTest('4. Missing data NoData handling (Ділянка з відсутніми даними NoData)', () => {
    const terrain = createFlatTerrain(4, 4, 10, 10, -100);
    const validMask = new Array(16).fill(true);
    // Mark central cells (1,1) and (1,2) as NoData (false) and (2,1) as NaN elevation
    validMask[1 * 4 + 1] = false;
    validMask[1 * 4 + 2] = false;
    (terrain.elevationMeters as number[])[2 * 4 + 1] = Number.NaN;
    terrain.validMask = validMask;

    const config = createBaseConfig({
      start: { row: 1, col: 0 },
      destination: { row: 1, col: 3 },
    });

    const res = planEvaRoute({ terrain, config });
    assertCondition(res.status === 'success', `Expected 'success', got '${res.status}'`);

    for (const pt of res.points) {
      const idx = pt.row * terrain.width + pt.col;
      assertCondition(
        Boolean(validMask[idx]) && Number.isFinite(terrain.elevationMeters[idx]),
        `Route stepped onto NoData cell (${pt.row}, ${pt.col})`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Test 5: Повністю недоступна ціль (Completely unreachable destination)
  // ---------------------------------------------------------------------------
  runTest('5. Completely unreachable destination (Повністю недоступна ціль)', () => {
    const terrain = createFlatTerrain(5, 5, 10, 10, 0);
    const hazardMask = new Array(25).fill(false);
    // Completely surround destination (2, 2) with hazard ring
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 3; c++) {
        if (r !== 2 || c !== 2) {
          hazardMask[r * 5 + c] = true;
        }
      }
    }
    terrain.hazardMask = hazardMask;

    const config = createBaseConfig({
      start: { row: 0, col: 0 },
      destination: { row: 2, col: 2 },
    });

    const res = planEvaRoute({ terrain, config });
    assertCondition(res.status === 'noRoute', `Expected status 'noRoute', got '${res.status}'`);
    assertCondition(res.points.length === 0, 'Expected empty points array when noRoute');
    assertCondition(
      typeof res.failureReason === 'string' && res.failureReason.length > 0,
      'Expected non-empty failureReason when destination is unreachable'
    );
  });

  // ---------------------------------------------------------------------------
  // Test 6: Коректна довжина діагонального переходу (Exact diagonal step length)
  // ---------------------------------------------------------------------------
  runTest('6. Exact length of diagonal transition (Коректна довжина діагонального переходу)', () => {
    // Test both isotropic (10m x 10m) and anisotropic (6m x 8m -> 10m diagonal) grids
    const isoTerrain = createFlatTerrain(3, 3, 10, 10, 0);
    const isoConfig = createBaseConfig({
      start: { row: 0, col: 0 },
      destination: { row: 2, col: 2 },
    });
    const isoRes = planEvaRoute({ terrain: isoTerrain, config: isoConfig });
    assertCondition(isoRes.status === 'success', 'Expected success on 3x3 diagonal');
    assertCondition(isoRes.points.length === 3, `Expected 3 points [(0,0),(1,1),(2,2)], got ${isoRes.points.length}`);
    assertClose(isoRes.distanceMeters, 2 * Math.SQRT2 * 10, 1e-6, 'Isotropic diagonal distance');

    // Anisotropic 3-4-5 right triangle grid: cellSizeX = 6m, cellSizeY = 8m -> diagonal = 10m
    const anisoTerrain = createFlatTerrain(2, 2, 6, 8, 0);
    (anisoTerrain.elevationMeters as number[])[1 * 2 + 1] = 10; // Δh = 10m over d_horiz = 10m -> 45° slope
    const transition = analyzeTransition(
      anisoTerrain,
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      50
    );
    assertClose(transition.horizontalDistanceMeters, 10, 1e-6, 'Anisotropic diagonal d_horizontal');
    assertClose(transition.slopeDeg, 45, 1e-6, 'Slope angle on 10m rise over 10m diagonal');
    assertClose(computeSlopeDeg(10, 10), 45, 1e-6, 'computeSlopeDeg formula check');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Неможливість проходження крізь кут перешкод (No corner-cutting)
  // ---------------------------------------------------------------------------
  runTest('7. Impossibility of passing through obstacle corners (Неможливість проходження крізь кут перешкод)', () => {
    // Case 7A: 2x2 grid with obstacles at (0,1) and (1,0) — diagonal (0,0)->(1,1) must be blocked
    const terrain2x2 = createFlatTerrain(2, 2, 10, 10, 0);
    terrain2x2.hazardMask = [
      false, true,
      true,  false,
    ];
    const res2x2 = planEvaRoute({
      terrain: terrain2x2,
      config: createBaseConfig({
        start: { row: 0, col: 0 },
        destination: { row: 1, col: 1 },
      }),
    });
    assertCondition(
      res2x2.status === 'noRoute',
      `Expected 'noRoute' when squeezing between two diagonal obstacles in 2x2 grid, got '${res2x2.status}'`
    );

    // Case 7B: 4x4 grid where (1,1) and (2,2) are obstacles touching at a corner.
    // Going from (2,1) to (1,2) must NOT jump diagonally across the touching corner; it must detour.
    const terrain4x4 = createFlatTerrain(4, 4, 10, 10, 0);
    const mask4x4 = new Array(16).fill(false);
    mask4x4[1 * 4 + 1] = true;
    mask4x4[2 * 4 + 2] = true;
    terrain4x4.hazardMask = mask4x4;

    const res4x4 = planEvaRoute({
      terrain: terrain4x4,
      config: createBaseConfig({
        start: { row: 2, col: 1 },
        destination: { row: 1, col: 2 },
      }),
    });
    assertCondition(res4x4.status === 'success', 'Expected detour success in 4x4 grid');
    assertCondition(
      res4x4.points.length > 2,
      `Direct diagonal jump (2 points) should be forbidden; got ${res4x4.points.length} points`
    );
  });

  // ---------------------------------------------------------------------------
  // Test 8: Порівняння двох режимів оптимізації ('shortest' vs 'riskAware')
  // ---------------------------------------------------------------------------
  runTest('8. Comparison of optimization modes (Порівняння режимів shortest та riskAware)', () => {
    // 5x5 terrain:
    // Row 2 is the direct middle corridor from (2,0) to (2,4), but has a steep hill at (2,2) of +2.5m
    // over 10m (slope = atan(0.25) = 14.036°, just under maxSlopeDeg = 15°).
    // Rows 0 and 4 are completely flat (0° slope), offering a slightly longer detour.
    const terrain = createFlatTerrain(5, 5, 10, 10, 0);
    const elev = new Array(25).fill(0);
    elev[1 * 5 + 2] = 2.5;
    elev[2 * 5 + 2] = 2.5;
    elev[3 * 5 + 2] = 2.5;
    terrain.elevationMeters = elev;

    const shortestRes = planEvaRoute({
      terrain,
      config: createBaseConfig({
        start: { row: 2, col: 0 },
        destination: { row: 2, col: 4 },
        maxSlopeDeg: 15,
        optimizationMode: 'shortest',
      }),
    });

    const riskAwareRes = planEvaRoute({
      terrain,
      config: createBaseConfig({
        start: { row: 2, col: 0 },
        destination: { row: 2, col: 4 },
        maxSlopeDeg: 15,
        optimizationMode: 'riskAware',
      }),
    });

    assertCondition(shortestRes.status === 'success', 'Shortest route should succeed');
    assertCondition(riskAwareRes.status === 'success', 'Risk-aware route should succeed');

    // Shortest route minimizes horizontal distance directly across (2,2) -> 40m, maxSlope ~ 14.04°
    assertClose(shortestRes.distanceMeters, 40, 1e-6, 'Shortest route horizontal distance');
    assertCondition(
      shortestRes.maxSlopeDeg > 13.5,
      `Expected shortest route to climb the 14.04° ridge, got maxSlopeDeg=${shortestRes.maxSlopeDeg}`
    );

    // Risk-aware route avoids the steep 14.04° ridge by detouring along the flat 0° corridor
    assertCondition(
      riskAwareRes.maxSlopeDeg < shortestRes.maxSlopeDeg,
      `Expected riskAware maxSlopeDeg (${riskAwareRes.maxSlopeDeg}) < shortest maxSlopeDeg (${shortestRes.maxSlopeDeg})`
    );
    assertClose(riskAwareRes.maxSlopeDeg, 0, 1e-6, 'Risk-aware route maxSlopeDeg on flat bypass');
    assertCondition(
      riskAwareRes.distanceMeters > shortestRes.distanceMeters,
      `Expected riskAware distance (${riskAwareRes.distanceMeters}m) > shortest distance (${shortestRes.distanceMeters}m)`
    );
  });

  // ---------------------------------------------------------------------------
  // Test 9: Обмеження EVA та повернення на базу (returnToHabitat & EVA budget overrun)
  // ---------------------------------------------------------------------------
  runTest('9. Round-trip returnToHabitat and EVA budget overrun detection', () => {
    const terrain = createFlatTerrain(10, 10, 50, 50, -2500);
    const config = createBaseConfig({
      start: { row: 0, col: 0 },
      destination: { row: 0, col: 9 }, // 9 * 50m = 450m one-way, 900m round-trip
      walkingSpeedMps: 0.5, // 900m / 0.5m/s = 1800s = 30 min total walking
      scienceActivityMinutes: 45, // 30 + 45 = 75 min active EVA
      safetyReserveMinutes: 20, // 75 + 20 = 95 min required with reserve
      evaTimeLimitMinutes: 80, // 95 > 80 -> budget exceeded!
      returnToHabitat: true,
    });

    const res = planEvaRoute({ terrain, config });
    assertCondition(res.status === 'success', 'Expected round-trip route success');
    assertClose(res.distanceMeters, 900, 1e-6, 'Round-trip distance (450m * 2)');
    assertCondition(res.outboundPoints.length === 10, 'Expected 10 outbound points');
    assertCondition(res.returnPoints.length === 10, 'Expected 10 return points');
    assertCondition(res.points.length === 19, 'Expected 19 combined round-trip points');
    assertClose(res.estimatedTravelMinutes, 30, 1e-6, 'Round-trip walking time (30 min)');
    assertClose(res.estimatedEvaMinutes, 75, 1e-6, 'Active EVA time (30 travel + 45 science)');
    assertCondition(
      res.evaAssessment !== null && res.evaAssessment.isEvaBudgetExceeded === true,
      'Expected isEvaBudgetExceeded to be true when 75 + 20 > 80 min'
    );
    assertCondition(
      res.warnings.some((w) => w.includes('EVA_BUDGET_EXCEEDED')),
      'Expected EVA_BUDGET_EXCEEDED warning'
    );
  });

  // ---------------------------------------------------------------------------
  // Test 10: Валідація некоректних вхідних даних (Invalid input handling)
  // ---------------------------------------------------------------------------
  runTest('10. Invalid input validation (Некоректні вхідні дані)', () => {
    const badTerrain = createFlatTerrain(3, 3, 10, 10, 0);
    badTerrain.elevationMeters = [1, 2]; // wrong length
    const res = planEvaRoute({
      terrain: badTerrain,
      config: createBaseConfig(),
    } as RoutePlannerInput);
    assertCondition(
      res.status === 'invalidInput',
      `Expected 'invalidInput' for mismatched elevationMeters length, got '${res.status}'`
    );
  });

  // ---------------------------------------------------------------------------
  // Test 11: Граничні значення конфігурації та недопустимі переходи
  // ---------------------------------------------------------------------------
  runTest('11. Invalid configuration and non-neighbor transitions', () => {
    const terrain = createFlatTerrain(3, 3, 10, 10, 0);
    const nullInput = planEvaRoute(null as unknown as RoutePlannerInput);
    assertCondition(nullInput.status === 'invalidInput', 'Null input should return invalidInput');

    const invalidWeights = planEvaRoute({
      terrain,
      config: createBaseConfig({ optimizationMode: 'riskAware', riskSlopeWeight: -1 }),
    });
    assertCondition(
      invalidWeights.status === 'invalidInput',
      'Negative heuristic weights should be rejected before search'
    );

    const invalidMaskTerrain = createFlatTerrain(3, 3, 10, 10, 0);
    invalidMaskTerrain.validMask = new Array(9).fill(2);
    const invalidMask = planEvaRoute({
      terrain: invalidMaskTerrain,
      config: createBaseConfig(),
    });
    assertCondition(invalidMask.status === 'invalidInput', 'Masks must contain only boolean or 0/1 values');

    const transition = analyzeTransition(
      terrain,
      { row: 0, col: 0 },
      { row: 2, col: 2 },
      15
    );
    assertCondition(!transition.isAllowed, 'A multi-cell jump must not be treated as one transition');
    assertCondition(
      transition.rejectionReason === 'nonAdjacent',
      `Expected nonAdjacent rejection, got '${transition.rejectionReason}'`
    );
    assertClose(computeSlopeDeg(1, 0), 90, 1e-6, 'Vertical zero-horizontal slope');
    assertCondition(Number.isNaN(computeSlopeDeg(-1, 10)), 'Negative absolute elevation delta should be invalid');
  });

  // ---------------------------------------------------------------------------
  // Test 12: Перевірка обох ніг round-trip маршруту з урахуванням ризику
  // ---------------------------------------------------------------------------
  runTest('12. Risk-aware outbound and return legs are both valid', () => {
    const terrain = createFlatTerrain(7, 7, 10, 10, 0);
    const hazardMask = new Array(49).fill(false);
    hazardMask[3 * 7 + 3] = true;
    terrain.hazardMask = hazardMask;
    const res = planEvaRoute({
      terrain,
      config: createBaseConfig({
        start: { row: 3, col: 0 },
        destination: { row: 3, col: 6 },
        optimizationMode: 'riskAware',
        riskHazardProximityWeight: 4,
        returnToHabitat: true,
      }),
    });

    assertCondition(res.status === 'success', `Expected success, got '${res.status}'`);
    assertCondition(res.returnPoints.length > 0, 'Expected a separately planned return leg');
    assertCondition(res.returnPoints[0].row === 3 && res.returnPoints[0].col === 6, 'Return must start at destination');
    const lastReturn = res.returnPoints[res.returnPoints.length - 1];
    assertCondition(lastReturn.row === 3 && lastReturn.col === 0, 'Return must end at habitat');
    assertCondition(
      res.points.length === res.outboundPoints.length + res.returnPoints.length - 1,
      'Combined points should join the two legs without duplicating the destination'
    );

    for (const leg of [res.outboundPoints, res.returnPoints]) {
      for (let i = 1; i < leg.length; i++) {
        const transition = analyzeTransition(terrain, leg[i - 1], leg[i], 15);
        assertCondition(transition.isAllowed, `Round-trip leg contains an invalid step at index ${i}`);
      }
    }
    assertClose(
      res.distanceMeters,
      res.evaAssessment!.outboundDistanceMeters + res.evaAssessment!.returnDistanceMeters,
      1e-6,
      'Round-trip distance breakdown'
    );
  });

  return results;
}

describe('SCI-02 Martian EVA Route Planning Engine', () => {
  const suiteResults = runAllSci02Tests();
  for (const testResult of suiteResults) {
    it(testResult.name, () => {
      if (!testResult.passed) {
        throw new Error(testResult.error);
      }
    });
  }
});

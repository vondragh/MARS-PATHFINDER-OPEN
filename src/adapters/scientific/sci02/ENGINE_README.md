# SCI-02 — Martian EVA Route Planner

Pure TypeScript route-planning module for the MARS PATHFINDER prototype. It consumes the normalized, local metric DEM grid from SCI-01 / TECH-01; it does not load, reproject, or georeference source datasets and does not create a separate web application.

## Files

- `routeplanner.ts` — input/output contracts, transition checks, A* search, and EVA metrics.
- `routeplanner_test.ts` — the eight required SCI-02 scenarios plus return-budget, input-validation, and round-trip checks.

## Run the test suite

With Node.js 24.16 (the version used to verify this handoff):

```sh
node --experimental-strip-types routeplanner_test.ts
```

The test file also runs with `tsx` if the team project already uses it:

```sh
npx tsx routeplanner_test.ts
```

## Integration

Keep the files together. The TypeScript import uses the exact lowercase filename for case-sensitive systems:

```ts
import { planEvaRoute } from './routeplanner.ts';
import type { RoutePlannerInput } from './routeplanner.ts';

const input: RoutePlannerInput = {
  terrain: {
    width: 3,
    height: 1,
    cellSizeX: 10,
    cellSizeY: 10,
    elevationMeters: [-2400, -2400, -2400],
    validMask: [true, true, true],
  },
  config: {
    start: { row: 0, col: 0 },
    destination: { row: 0, col: 2 },
    maxSlopeDeg: 15,
    walkingSpeedMps: 0.8,
    evaTimeLimitMinutes: 60,
    scienceActivityMinutes: 10,
    safetyReserveMinutes: 5,
    optimizationMode: 'shortest',
    returnToHabitat: false,
  },
};

const result = planEvaRoute(input);
```

The same function accepts the flat `TerrainGrid & RouteConfiguration` shape if that is the contract already used by TECH-01. In TypeScript projects, allow `.ts` import extensions in the project configuration when importing this module with the shown path.

## Example result

For the input above, the key fields are:

```json
{
  "status": "success",
  "mode": "shortest",
  "points": [
    { "row": 0, "col": 0 },
    { "row": 0, "col": 1 },
    { "row": 0, "col": 2 }
  ],
  "distanceMeters": 20,
  "maxSlopeDeg": 0,
  "estimatedTravelMinutes": 0.4166667,
  "estimatedEvaMinutes": 10.4166667
}
```

The actual result also includes an elevation profile, EVA budget breakdown, assumptions, and warnings.

## Model and interpretation

- The grid is row-major and uses uniform local metric spacing. Elevation values and cell sizes are in metres.
- Each 8-connected step is checked using `atan(|Δh| / horizontalDistance)`. A step above `maxSlopeDeg`, into NoData, or into a confirmed hazard is rejected. Diagonal moves cannot squeeze through blocked corners.
- `shortest` minimizes horizontal path length. `riskAware` adds non-negative, configurable traversal-cost heuristics for slope and proximity to NoData / hazards. The proximity cost averages the flags at both edge endpoints so an edge has the same cost in either direction. These weights are not injury or failure probabilities.
- If `returnToHabitat` is true, outbound and return legs are searched separately. `points` contains the joined round trip with the destination listed once; `outboundPoints` and `returnPoints` preserve each leg, with the destination included at the start of `returnPoints`.
- Walking time is horizontal distance divided by the configured nominal speed. `estimatedEvaMinutes` adds the planned science activity. The safety reserve is reported separately and included in `isEvaBudgetExceeded`.
- `distance3DMeters` is included in `evaAssessment` as a terrain-distance metric; the walking-time estimate intentionally uses horizontal distance.

## Statuses and limitations

- `success` — a route and metrics were calculated. Check `warnings` and `evaAssessment.isEvaBudgetExceeded` before presenting it as feasible.
- `noRoute` — the start/goal is impassable or no allowed path exists.
- `invalidInput` — dimensions, masks, coordinates, or configuration values do not meet the contract.
- `error` — unexpected runtime failure; `failureReason` contains the message.

The speed, slope threshold, EVA duration, science time, and reserve are user-supplied model parameters, not official NASA operating limits. The model does not estimate suit energy, fatigue, slope-dependent speed, traction, radiation, weather, visibility, or uncertainty in the DEM. Synthetic-grid tests demonstrate software behavior only; SCI-03 should validate assumptions against the selected real dataset before scientific claims are made.

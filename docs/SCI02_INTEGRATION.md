# SCI-02 routing integration

**Canonical contract:** `docs/ROUTING_INTEGRATION_CONTRACT.md` (unchanged public interfaces)
**Terrain contract:** `docs/TERRAIN_DATA_CONTRACT.md`
**Adapter:** `src/adapters/scientific/sci02/sci02RoutePlanner.ts`
**Algorithm owner:** SCI-02, Timur

## Delivered source

The engine was imported from the team archive `hackaton_nasa_spaceapps_2026.zip`, at `outputs/routeplanner.ts` and `outputs/routeplanner_test.ts`. The imported engine is preserved in `src/adapters/scientific/sci02/routeplanner.ts`; the archive's test cases are registered with Vitest in `routeplanner.test.ts`. The archive engine file SHA-256 is `4a796ab19a117b1cc0720317dc37258a02e0fb5d59a70bb51689e980c16de1c7`.

The only algorithm-file compatibility edits are the canonical inclusive slope boundaries `[0, 90]` and a defined risk-aware slope term when the configured maximum is zero. The A* search and normal-range edge costs are retained. The archived test fixture's readonly `hazardMask` mutation was moved to a mutable fixture before assigning it, resolving TS2542 without weakening source types. Vitest imports replaced the archive's self-running harness so each existing SCI-02 test is reported and counted by the project runner.

## Adapter boundary

`createSci02RoutePlannerAdapter()` implements the canonical `RoutePlannerAdapter`; the default exported instance is `sci02RoutePlanner`. It validates each worker response with the existing `validateRouteResult()` before returning it. `executeSci02RoutePlanner()` is the deterministic worker body and is injectable only for boundary tests. The React app selects SCI-02 by default and exposes a separate Demo fallback adapter.

The adapter currently accepts the canonical `shortest` and `riskAware` modes. When alternatives are requested, it invokes the other mode independently and returns each successful candidate. A failed alternative is reported as a warning while a successful requested route remains available. Unsupported waypoints fail explicitly rather than being ignored.

### Canonical input to SCI-02

1. Validate the source dataset with `validateTerrainDataset()` and keep the source arrays immutable.
2. Check endpoint coordinates against the source affine transform and verify the canonical row/column cell indices match those coordinates. Endpoint NoData or out-of-bounds coordinates return the matching canonical failure.
3. Pass projected local metric coordinates through the terrain affine transform. Latitude/longitude degrees are never converted by treating them as meters.
4. Convert meters per second, minutes, degrees, and return-to-habitat directly into SCI-02 configuration. A slope cap is a hard A* transition constraint.
5. Pass row-major elevation, validity, and optional confirmed hazard masks to SCI-02. NoData and hazard cells remain impassable. If the hazard layer is absent, a result warning says hazard avoidance is unavailable.

### Affine geometry and resampling

SCI-02 assumes orthogonal regular cells. `normalizeTerrainForSci02()` checks the dot product of the source affine column and row vectors. Orthogonal grids, including rotated orthogonal grids, use source values directly with `cellSizeX = hypot(a,d)` and `cellSizeY = hypot(b,e)`; projected route coordinates are still calculated from the complete affine transform.

For a skewed source transform, the adapter creates a north-up local metric raster covering the affine footprint's axis-aligned bounds. Its cell dimensions are the lengths of the source affine pixel vectors. Each output pixel center is transformed through the inverse source affine transform and gets a nearest source-cell elevation. Output centers outside the source footprint remain NoData. Source NoData/hazard cell centers are also mapped to output cells conservatively: this may expand masked regions, but it cannot create traversable data or drop a mapped mask center. The SCI-01 arrays and files are never rewritten. The output contains at most 2,000,000 cells; larger grids fail with a clear error and require a smaller mission-area subset.

The resampling warning reports the resulting dimensions, resolutions, nearest-neighbor policy, and source/output NoData/hazard counts. Skew is never silently discarded. Nearest-cell resampling changes alignment/resolution and is a model limitation requiring SCI-03 review before use on real terrain.

Route cell centers and profile coordinates are converted to projected map coordinates with the output affine transform, then to the map's geographic display coordinates using the existing coordinate transformation. Pixel centers use the existing `column + 0.5`, `row + 0.5` convention. Candidate polyline lengths are computed from projected meter coordinates and checked against SCI-02 horizontal outbound, return, and total distances within `1e-4 m`; mismatches fail rather than being silently reconciled.

### Output and feasibility meanings

- `estimatedMovementTimeMinutes` maps SCI-02 round-trip travel time (walking only).
- `estimatedEvaDurationMinutes` maps `totalRequiredMinutesWithReserve`: walking + destination science activity + the configured safety reserve. The mission assessment compares this total against the EVA cap. The metric is labeled “Required EVA incl. reserve”; remaining/over-budget time is displayed separately.
- `maximumSlopeDeg` maps the maximum sampled route transition. A successful SCI-02 path satisfies the configured hard slope bound and has no NoData/hazard traversal; this is **route feasibility only**.
- EVA budget compliance is determined separately from the selected candidate's duration and current EVA cap. A route can exist and satisfy slope constraints while the plan exceeds the EVA duration limit.
- Scientific validation is always `not-established` in adapter metadata. A successful calculation does not imply validation by SCI-01 or SCI-03.
- The profile carries SCI-02 cumulative horizontal route distance, outbound then return, normalized cell, projected coordinate, and sampled DEM elevation for every route cell. Route cells cannot be NoData, so no elevation is fabricated or interpolated.
- Engine warnings and assumptions are preserved. Adapter warnings add missing hazard data, NoData counts, skew/resampling disclosure, and the absence of scientific/operational validation.
- A* no-route responses become canonical `infeasible` results. Invalid requests, invalid engine responses, worker errors, and size-limit errors become canonical `failed` results with a reason. Aborting terminates the worker and propagates an `AbortError` for the controller's cancellation path.

## Minimal import and invocation

```ts
import { sci02RoutePlanner } from '../adapters/scientific/sci02/sci02RoutePlanner';
import type { RoutePlannerInput } from '../domain/routing/types';

// Construct input using the canonical TECH-01 interface and a SCI-01 TerrainDataset.
declare const input: RoutePlannerInput;
const controller = new AbortController();
const result = await sci02RoutePlanner.calculate(input, controller.signal);
// The adapter validates the canonical response; UI assessment still evaluates
// the EVA time budget and does not infer scientific validation from route success.
```

The frontend can select `sci02RoutePlanner` independently from `demoRoutePlanner`. It starts SCI-02 in a dedicated Vite module Worker, so normalization and A* do not block the browser main thread. An abort terminates that worker; there is no silent main-thread fallback.

## Current science boundary

Repository data used for integration and browser checks is still `provenance: 'synthetic'`. SCI-01's delivered Mars dataset and SCI-03 review are not established by this integration. Do not describe these test routes or metrics as scientifically or operationally validated.

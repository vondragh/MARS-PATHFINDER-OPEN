# SCI-02 integration verification

**Date:** 2026-11-14
**Branch:** `feature/mission-control-web`
**Source terrain:** synthetic repository fixtures only

## Automated checks

Recorded after the final adapter changes:

- `npm run typecheck` — passed (`tsc -b --pretty`, strict project configuration).
- `npm test` — passed, 8 files / 44 tests.
- `npm run build` — passed; Vite emitted a separate 34.81 kB SCI-02 worker bundle.
- SCI-02 archived algorithm tests — 12/12 registered tests.
- Adapter contract tests cover canonical result validation, source/normalized coordinate alignment, orthogonal and skewed affine grids, NoData endpoint/routing behavior, hazard avoidance and missing-layer warnings, route distance/profile consistency, both optimization modes, slope-boundary handling, and EVA budget rejection.

## Browser integration

Local app: `http://127.0.0.1:5173/`, Chromium viewport 1440 × 900.

- SCI-02 was selected independently in the engine selector and executed through `routePlanner.worker.ts` (the worker module URL appeared in browser resource entries).
- SCI-02 is the default engine when its scientific adapter is available; Demo remains a separate selectable fallback. The browser session calculated routes through both engines.
- Compare returned two successful candidate routes: shortest 6.20 km round trip, risk-aware 6.26 km. Selecting the alternative updated the selected route ID consistently on map, analysis panel and elevation profile.
- The selected route showed 2 h 23 min walking, 3 h 38 min required EVA including 30 min configured reserve, maximum sampled slope 12.7°, and 100% profile sample coverage on the synthetic fixture.
- The interface warned that no confirmed hazard layer is present and reported 8 NoData cells in the route grid; the SCI-02 path remained in valid cells.
- Reducing the configured EVA limit to 1 h retained the calculated route and slope check but changed the mission assessment to `constraints-exceeded` and displayed 158 min over the cap. This confirms route existence is not treated as EVA budget compliance.
- The browser displayed `Not established` for scientific validation throughout.

## Limits

Browser checks and unit tests use synthetic terrain only. They verify the adapter and UI boundary, not Mars data quality, scientific model validity, EVA safety, or SCI-03 acceptance. The route adapter supports the canonical `shortest` and `riskAware` modes; `scientific-priority` remains pending. SCI-01 dataset ingestion and its real-terrain coordinate alignment must be reviewed when SCI-01 provides its artifact.

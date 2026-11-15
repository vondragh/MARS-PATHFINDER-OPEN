# MARS PATHFINDER architecture

A static React/TypeScript app, built with Vite and deployed by Cloudflare Pages Direct Upload. The browser draws the terrain, grid, route overlays and chart with native SVG. The production release does not need a routing API.

| Layer | Responsibility |
| --- | --- |
| `src/app` | Select terrain, load Jezero or the synthetic fixture, and compose the mission workspace. |
| `src/domain/terrain` and `src/domain/routing` | Define and validate affine geometry, raster samples and planner request/result contracts. |
| `src/adapters/scientific` | Fetch and validate committed terrain data. SCI-02 normalizes and transfers the local metric grid to a Web Worker and maps results back to the UI contract. The committed Jezero grid is already orthogonal. |
| `src/adapters/demo` | Return illustrative route shapes without a scientific path search. |
| `src/hooks` and `src/domain/mission` | Own mission settings, request cancellation/invalidation, current candidate and time/route assessment. |
| `src/components` | Render mission controls, map/inspector, route analysis and profile. Open the optional science evidence panel to request NASA images directly. |

## Data flow

1. Load local metadata, Float32 elevations and the UInt8 validity mask; the SVG uses the image aligned to the same grid. Validate dimensions, lengths and coordinate metadata before using the dataset.
2. Map clicks and keyboard selection through the SVG viewport and raster affine. Cell centers map to local metres; affine sampling rejects outside-grid and NoData positions.
3. Translate the mission into a planner request. SCI-02 performs A* in the worker; the UI does not run a second optimization. Request IDs and abort handling prevent obsolete responses from updating a changed mission.
4. Retain returned candidates and update the map, metrics and elevation profile when the selected candidate changes. The profile position links the chart to a point along the route.
5. Keep the optional NASA imagery independent: the three requests occur only when the evidence disclosure opens, and an error or timeout does not change the terrain grid or cost model.

See the [terrain data contract](TERRAIN_DATA_CONTRACT.md), [routing contract](ROUTING_INTEGRATION_CONTRACT.md), [SCI-02 integration notes](SCI02_INTEGRATION.md) and [scientific method](SCIENTIFIC_METHOD.md).

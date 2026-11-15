# MARS PATHFINDER

MARS PATHFINDER is a browser prototype for planning and comparing hypothetical extravehicular activity (EVA) routes across a small part of Jezero crater on Mars. It is an independent project, not a NASA product or an operational safety tool.

**[Open the live demo](https://mars-pathfinder.pages.dev/)** · Stable application source: `c8e0feb1137a8ee4fa6cdbc13158346fc94a7207`

- Explore a 1 km² Jezero terrain tile derived from HiRISE stereo topography and aligned imagery.
- Choose a habitat and destination, set slope and EVA assumptions, and compare shortest-distance and terrain-cost routes.
- Inspect the elevation profile, route distance, travel estimates and warnings. Terrain cost is a proxy; the stable demo has no independent hazard layer.
- Use the synthetic dataset as a separate demonstration fallback.

The local NASA challenge candidate additionally provides a regional MOLA view from Mars Trek and two archival Perseverance Mastcam-Z observations. These optional HTTPS images support a reconnaissance objective; the bundled HiRISE terrain and route calculations remain independent of them. See the [challenge matrix](docs/NASA_CHALLENGE_COMPLIANCE_UK.md).

## Run locally

Use Node.js 20.20.2 and npm for the verified baseline. From the repository root:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite. To check the application and preview its production build:

```sh
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

The production application uses static files. It does not need API credentials, Python, or a routing server. The deployed demo uses an allowlist from `dist/`; the full local build also contains fixtures and terrain provenance files.

## Architecture

React and Vite provide the mission UI. The terrain loader validates the elevation grid, mask and georeferencing; the SCI-02 adapter runs the A* planner in a Web Worker and converts its output into the UI routing contract. The domain layer owns coordinate conventions, constraints and result types. SCI-04 environmental assessment is outside the stable release.

- [Architecture (Ukrainian)](docs/ARCHITECTURE.md)
- [Terrain contract (Ukrainian)](docs/TERRAIN_DATA_CONTRACT.md)
- [Routing contract (Ukrainian)](docs/ROUTING_INTEGRATION_CONTRACT.md)
- [SCI-02 integration notes (Ukrainian)](docs/SCI02_INTEGRATION.md)
- [Data and attribution](DATA_SOURCES.md) · [Scientific limitations](SCIENTIFIC_LIMITATIONS.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [AI usage](AI_USAGE.md)

Credit: the MARS PATHFINDER team (mission UI and integration, SCI-01 terrain, SCI-02 routing), and NASA MRO / University of Arizona HiRISE / USGS Astrogeology for the source terrain and imagery.

## License

The team's original code and eligible original documentation in this release candidate are licensed under [Apache-2.0](LICENSE). External data, artwork and dependencies retain their own terms. See [Data and attribution](DATA_SOURCES.md) and [Third-party notices](THIRD_PARTY_NOTICES.md).

See [Contributors](CONTRIBUTORS.md) for human project credits and [AI usage](AI_USAGE.md) for development-tool disclosure.

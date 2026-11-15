# MARS PATHFINDER

**Plan a hypothetical Marswalk across Jezero crater.** MARS PATHFINDER helps a mission planner compare two routes between a habitat and an exploration destination, review the terrain and time trade-offs, and decide what to investigate next. It is an independent research and educational prototype by **Valera&brothers** for [NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/).

**[Launch the live planner](https://mars-pathfinder.pages.dev/)** · **[View the competition presentation](https://github.com/vondragh/MARS-PATHFINDER-OPEN/tree/submission/nasa-space-apps-2026/presentation)** · **[Browse the exact deployed source](https://github.com/vondragh/MARS-PATHFINDER-OPEN/tree/002b6cdf1a03365ed2241b997afc43bb34714764)**

## Try it in 60 seconds

1. Keep **Jezero · HiRISE DEM** and **SCI-02** selected. Leave the default habitat, destination and EVA settings.
2. Click **Compare routes**. Select each candidate to update the map, elevation profile and mission analysis. The default example displays approximately **1.51 km Shortest** and **1.52 km Risk-aware**, out and back.
3. Open **Candidate differences, terrain checks & assumptions** for the modeled trade-offs. Open **Jezero context & science evidence** for regional Mars Trek relief and two archival Perseverance frames.

For point placement, map controls, time-limit experiments and failure recovery, see the [user guide](docs/USER_GUIDE.md). See the [feature audit](docs/FEATURES.md) for tested behavior and known gaps.

## What it does

- Displays a 1 km² HiRISE terrain tile and aligned surface image, with a coordinate/elevation inspector, zoom, pan, grid and route overlays.
- Plans routes from configurable endpoints and slope/time assumptions. Compares shortest horizontal distance with a terrain-cost alternative; the label **Risk-aware** does not imply a hazard probability.
- Shows outbound and return distances, elevation profile, maximum sampled slope, time estimates, adapter warnings and a separate scientific validation status.
- Keeps NASA imagery for context separate from routing. A regional MOLA tile and Sol 467 Mastcam-Z frames inform the suggested reconnaissance objective without claiming they depict the chosen destination. A separate synthetic fixture is available for demonstration.

## How it works

**HiRISE grid and validity mask → traversable grid transitions → A* in a Web Worker → candidate comparison → SVG map and elevation profile.**

The terrain loader validates the bundled data and its georeferencing. SCI-02 searches permissible neighboring cells, screening invalid cells and slopes. Shortest mode minimizes horizontal distance. Risk-aware mode adds slope and supported obstacle-proximity penalties to the search cost. The application displays the selected candidate's metrics and evaluates its time against configured assumptions. See the [scientific method](docs/SCIENTIFIC_METHOD.md) and [architecture](docs/ARCHITECTURE.md).

**Stack:** React, TypeScript, Vite, native SVG for the map and profile, Web Workers for SCI-02, Lucide icons, Vitest and Testing Library, and Cloudflare Pages Direct Upload. The optional Python terrain preparation script is not required to run or build the app.

## Evidence and limitations

The [source inventory](DATA_SOURCES.md) identifies NASA MRO HiRISE and USGS Astrogeology data (local routing inputs), JPL Mars Trek/Mars Global Surveyor MOLA (regional orientation), and Mars 2020 Perseverance/JPL-Caltech/ASU Mastcam-Z (archival surface observations). See the [challenge compliance matrix](docs/NASA_CHALLENGE_COMPLIANCE_UK.md) for competition scope and the [limitations](SCIENTIFIC_LIMITATIONS.md) for scientific boundaries.

**This is not flight-qualified or operational EVA navigation.** The selected cell is a user-defined exploration destination. No validated science site, independent hazard layer, live weather or EVA safety clearance is established. The displayed time is an estimate based on configured assumptions.

## Development and deployment

The verified Node.js version is **20.20.2**.

```sh
git clone https://github.com/vondragh/MARS-PATHFINDER-OPEN.git
cd MARS-PATHFINDER-OPEN
npm ci
npm run dev -- --host 127.0.0.1
```

Open the URL Vite prints. To verify the project and serve the production build locally:

```sh
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Serve the static output from an HTTPS site root. For a Pages release, stage the generated HTML, favicon, JS/CSS and routing worker under `assets/`, plus Jezero `metadata.json`, `elevation.f32le`, `valid.u8` and `orthoimage.png` at their original relative paths. The full `dist/` also contains fixtures and provenance files not required by the live app. Use an authorized [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) to a preview branch and verify the site before promotion. Runtime requires no API credentials or routing server.

## Team, AI and license

[Contributors and roles](CONTRIBUTORS.md) · [AI-assisted development disclosure](AI_USAGE.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

The human team directed the work. OpenAI Codex assisted with development, debugging, testing and documentation; the app does not run a generative AI service. Original team code and eligible documentation are [Apache‑2.0](LICENSE). External materials retain their own terms; see [data credits](DATA_SOURCES.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

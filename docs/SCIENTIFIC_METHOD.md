# Scientific method

## Terrain input

The application uses a **500 × 500** crop at a **nominal 2 m** grid spacing, derived from HiRISE stereo DTM `DTEEC_045994_1985_046060_1985_U01` and aligned orthoimage `ESP_045994_1985_RED_A_01_ORTHO`. USGS distributes the source assets. Grid spacing is not a claim of absolute elevation accuracy.

The preparation script converts the source spherical equirectangular grid through Mars planetocentric longitude/latitude into a local equirectangular grid centered at 18.44° N, 77.45° E. The sphere radius is 3,396,190 m; with angular differences in radians, `x = R cos(lat₀) Δlon` and `y = R Δlat`. Row steps run south, column steps east. Elevation is in metres relative to the Mars2000 areoid; no vertical datum conversion is applied. Nearest-neighbor resampling preserves sampled elevations, and minimum validity resampling conservatively marks invalid cells. NoData cells are impassable. The public crop has full mask coverage, which does not imply safe or equally reliable terrain. The orthoimage is display imagery, not a hazard classification.

## Routing and assessment

SCI-02 uses A* on an eight-neighbor regular metric grid. It screens endpoints, NoData, supported hazard barriers and transitions above the configured slope; diagonal movement is subject to corner checks. Edge slope derives from the elevation difference and horizontal neighbor distance. Shortest mode minimizes total permissible horizontal distance. Risk-aware mode adds a squared normalized-slope penalty and, where supported, an obstacle-proximity term. The weights are cost multipliers, not safety probabilities. The Jezero release has no independent hazard layer.

The display reports outbound/return distances and a sampled elevation profile for the selected candidate. Walking speed, time at the destination and reserve are configurable assumptions. Route existence, configured budget and scientific validation are separate checks. A returned route does not establish trafficability, crew safety or an operational EVA clearance.

## Independent context and reproducibility

Perseverance frames give archival surface context. Mars Trek MOLA supplies regional orientation; it is not overlaid onto the local grid or used to calculate routes. No weather, dose, validated science site or mineral classification is inferred. See [data credits](../DATA_SOURCES.md) and [scientific limitations](../SCIENTIFIC_LIMITATIONS.md).

The released app uses checked-in derived artifacts. Optional data preparation, which downloads upstream resources and rewrites the derived tile, is separate from application setup:

```sh
python3 -m venv /tmp/mars-sci01-venv
/tmp/mars-sci01-venv/bin/pip install -r scripts/requirements-sci01.txt
/tmp/mars-sci01-venv/bin/python scripts/prepare_jezero.py
```

See [provenance and exact checks](SCI01_INTEGRATION_REPORT.md), [artifact validation](../public/data/terrain/jezero-hirise-1km/validation.json) and the [SCI-02 integration and test notes](SCI02_INTEGRATION.md). Resampling checks establish consistency with source grid samples, not absolute elevation accuracy or independent science validation.

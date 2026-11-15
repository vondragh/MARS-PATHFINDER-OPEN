# Scientific limitations

- **Terrain:** The stable release covers one derived Jezero tile, 500 × 500 cells with 2 m spacing. Grid spacing is not vertical accuracy or effective resolving power. The elevation reference is the Mars2000 areoid. NoData cells are excluded; gaps are not assumed traversable. The crop does not resolve every obstacle or establish surface trafficability.
- **Routing:** SCI-02 searches a regular metric grid. Routes depend on grid connectivity, the DEM and configured slope and cost assumptions. The comparison mode penalizes terrain cost; there is no independent hazard map or calibrated risk probability.
- **EVA:** Travel time and resource estimates are conditional on planning assumptions. A route within configured limits is not operational clearance. The stable build does not model weather, dust, radiation, medical risk or the full life-support system.
- **Environmental research:** SCI-04 remains outside the stable release. The local numerical MCD cache is excluded from the open-source candidate pending redistribution permission. MEDA samples at different times are separate historical measurements. MCD outputs describe modeled climate scenarios; dust and solar activity can vary together. DONKI archived estimates are not current radiation forecasts, exposure measurements or dose estimates at Jezero.
- **Validation:** Automated tests verify software behavior. Independent SCI-03 review of terrain accuracy, traverse assumptions and fitness for real EVA is not established by those tests. No NASA certification or endorsement is claimed.

See [the scientific method (Ukrainian)](docs/SCIENTIFIC_METHOD.md) and [data sources](DATA_SOURCES.md).

# User guide

Open [MARS PATHFINDER](https://mars-pathfinder.pages.dev/). The browser loads the bundled HiRISE elevation grid, validity mask and aligned image for a 1 km² Jezero tile. The default Habitat and Point A are example planning positions, with no validated science site attached.

1. Keep **Jezero · HiRISE DEM** and **SCI-02** selected. If you have changed the configuration, use **Reset mission** and verify those selections.
2. Click **Compare routes**. On the tested release the default comparison displays about **1.51 km Shortest** and **1.52 km Risk-aware** out and back. Values are rounded; the comparison card may show a more precise relative difference. Alternatively, select an optimization mode and use **Calculate route** to request it.
3. Select each result in **Route candidates**. Review the new overlay, elevation profile and analysis together. Use the **Route position** slider to inspect a sample and its corresponding map position. Expand **Candidate differences, terrain checks & assumptions** for sampled slope, data warnings and modeling assumptions.
4. Expand **Jezero context & science evidence** for a Mars Trek MOLA overview and two Sol 467 Perseverance Mastcam-Z frames. The marker identifies the center of the planning area. The rover frames are archival examples, not geolocated evidence for the selected route.
5. For an EVA time comparison, open **Show activity & reserve**, set the maximum duration to **1 h** and the assumed walking speed to **0.2 km/h**, and compare again. Inspect the time-budget result then reset the mission. These are demonstration inputs, not EVA limits prescribed by NASA.

## Explore the map

Drag to pan; use the wheel or **Zoom in/out**, and **Reset map view** to return to the overview. On a focused map, use **+ / −**, arrow keys and **Enter**. Click a map cell to inspect local coordinates and sampled elevation. **Surface layer** toggles the aligned image, **Grid** toggles the overlay, and the legend and scale describe what is visible. Contours are explicitly unavailable.

To set a point, use **Place on map** beside **Habitat / start** or **Science destination** and click the map. **Point A/B** selects example destinations. Changing the endpoints or planning constraints can invalidate prior results; calculate again. The scientific objective is reconnaissance for visible layering and transitions between rock and sand, not confirmation of materials at a selected point.

## Help and recovery

- **Guided demo** steps through configuration, comparison and review. **Help**, **Data sources** and **About** explain controls, provenance and the prototype's purpose. On a narrow screen, scroll between configuration, map, results and profile; some desktop controls are hidden.
- If Jezero data fail, use **Retry terrain load**. **Synthetic comparison** is a separate generated grid; **Demo adapter** shows illustrative routes without a terrain-wide search. Do not cite those results as Mars observations.
- If NASA imagery is unavailable, the evidence panel shows a fallback while local routing remains available.

See the [feature audit](FEATURES.md), [scientific method](SCIENTIFIC_METHOD.md), [source provenance](../DATA_SOURCES.md) and [competition presentation](https://github.com/vondragh/MARS-PATHFINDER-OPEN/tree/submission/nasa-space-apps-2026/presentation).

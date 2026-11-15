import { JEZERO_PROJECTION } from '../../domain/terrain/jezeroProjection';

const wmts = 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0';
// WMTS capabilities: level 6 is 128 columns × 64 rows, at 256 px per tile.
// Coordinates in this matrix are east longitude and north latitude in degrees.
const span = 360 / 128;
const lon = JEZERO_PROJECTION.centralLongitudeDeg;
const lat = JEZERO_PROJECTION.centralLatitudeDeg;
const column = Math.floor((lon + 180) / span);
const row = Math.floor((90 - lat) / span);
const west = -180 + column * span;
const north = 90 - row * span;

export const jezeroContext = {
  tileUrl: `${wmts}/default/default028mm/6/${row}/${column}.jpg`,
  capabilitiesUrl: `${wmts}/WMTSCapabilities.xml`,
  markerLeft: (lon - west) / span * 100,
  markerTop: (north - lat) / span * 100,
};

export const galleryUrl = 'https://mars.nasa.gov/mars2020/multimedia/raw-images/?begin_sol=467&end_sol=467';

export const roverScenes = [
  {"title": "Layered rock exposure", "id": "ZR0_0467_0708402389_223EBY_N0260756ZCAM08489_1100LMJ", "camera": "Right Mastcam-Z", "sol": 467, "utc": "2022-06-13T14:34:03.011Z", "site": 26, "drive": "756", "credit": "NASA/JPL-Caltech/ASU", "gallery": "https://mars.nasa.gov/mars2020/multimedia/raw-images/ZR0_0467_0708402389_223EBY_N0260756ZCAM08489_1100LMJ", "preview": "https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/00467/ids/edr/browse/zcam/ZR0_0467_0708402389_223EBY_N0260756ZCAM08489_1100LMJ01_320.jpg", "original": "https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/00467/ids/edr/browse/zcam/ZR0_0467_0708402389_223EBY_N0260756ZCAM08489_1100LMJ01.png"},
  {"title": "Rippled sand and exposed rocks", "id": "ZR0_0467_0708402503_223EBY_N0260756ZCAM08489_1100LMJ", "camera": "Right Mastcam-Z", "sol": 467, "utc": "2022-06-13T14:35:42.025Z", "site": 26, "drive": "756", "credit": "NASA/JPL-Caltech/ASU", "gallery": "https://mars.nasa.gov/mars2020/multimedia/raw-images/ZR0_0467_0708402503_223EBY_N0260756ZCAM08489_1100LMJ", "preview": "https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/00467/ids/edr/browse/zcam/ZR0_0467_0708402503_223EBY_N0260756ZCAM08489_1100LMJ01_320.jpg", "original": "https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/00467/ids/edr/browse/zcam/ZR0_0467_0708402503_223EBY_N0260756ZCAM08489_1100LMJ01.png"},
] as const;

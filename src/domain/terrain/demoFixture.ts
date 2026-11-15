import type { TerrainDataset } from './types';

const WIDTH = 72;
const HEIGHT = 52;
const CELL_X = 50;
const CELL_Y = 50;
const MAX_Y = HEIGHT * CELL_Y;

function gaussian(x: number, y: number, cx: number, cy: number, sx: number, sy: number) {
  return Math.exp(-(((x - cx) ** 2) / (2 * sx ** 2) + ((y - cy) ** 2) / (2 * sy ** 2)));
}

export const demoTerrain: TerrainDataset = (() => {
  const elevationMeters = new Float32Array(WIDTH * HEIGHT);
  const validMask = new Uint8Array(WIDTH * HEIGHT).fill(1);

  for (let row = 0; row < HEIGHT; row += 1) {
    for (let column = 0; column < WIDTH; column += 1) {
      const x = column * CELL_X + CELL_X / 2;
      const y = MAX_Y - (row * CELL_Y + CELL_Y / 2);
      const ridge = 85 * gaussian(x, y, 1_900, 1_425, 330, 195);
      const crater = -62 * gaussian(x, y, 2_680, 890, 310, 290);
      const undulation = 17 * Math.sin(x / 245) + 12 * Math.cos(y / 190) + 8 * Math.sin((x + y) / 310);
      const index = row * WIDTH + column;
      elevationMeters[index] = 2_160 + ridge + crater + undulation;

      // A small masked patch represents a data gap; it is not filled or interpolated.
      if ((x - 1_150) ** 2 / 115 ** 2 + (y - 2_050) ** 2 / 75 ** 2 < 1) {
        validMask[index] = 0;
        elevationMeters[index] = Number.NaN;
      }
    }
  }

  return {
    id: 'demo-jezero-local-grid-v1',
    title: 'Jezero local terrain — synthetic fixture',
    sourceOrganization: 'MARS PATHFINDER development team',
    sourceUrl: '',
    horizontalCrs: 'MARS_EQC_DEMO',
    horizontalCrsDefinition: 'Synthetic local Cartesian axes: x east, y north, units meters; equirectangular approximation centered at 77.45°E, 18.44°S.',
    coordinateTransform: {
      sourceCrs: 'Mars 2000 geographic (synthetic longitude/latitude reference)',
      sourceCrsDefinition: 'Synthetic longitude and planetocentric latitude in degrees; not a registered scientific input layer.',
      targetCrs: 'MARS_EQC_DEMO',
      method: 'Spherical equirectangular demo transform',
      definition: 'x = R cos(lat0) (lon-lon0); y = R (lat-lat0); R=3389500 m, lon0=77.45°E, lat0=18.44°S.',
    },
    horizontalUnit: 'm',
    verticalUnit: 'm',
    verticalDatum: 'Synthetic local datum; not tied to a Mars geoid',
    limitations: [
      'Entire raster is deterministic synthetic development data.',
      'Reference origin is approximate and does not represent a registered DEM.',
      'Elevation, masked cells, slope and routes are not suitable for scientific or operational use.',
    ],
    provenance: 'synthetic',
    width: WIDTH,
    height: HEIGHT,
    cellSizeX: CELL_X,
    cellSizeY: CELL_Y,
    transform: { coefficients: [0, CELL_X, 0, MAX_Y, 0, -CELL_Y] },
    elevationMeters,
    validMask,
  };
})();

export const demoSites = {
  habitat: { id: 'habitat', name: 'Habitat', x: 490, y: 505 },
  siteA: { id: 'site-a', name: 'Science Site A', x: 2_950, y: 1_985 },
  siteB: { id: 'site-b', name: 'Science Site B', x: 3_050, y: 560 },
} as const;

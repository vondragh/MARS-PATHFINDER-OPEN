import type { MarsEquirectangularProjection } from './types';
/** Same explicit Mars sphere/local EQC parameters as scripts/prepare_jezero.py. */
export const JEZERO_TERRAIN_ID = 'jezero-hirise-1km';
export const JEZERO_PROJECTION: MarsEquirectangularProjection = {
  radiusM: 3_396_190,
  centralLongitudeDeg: 77.45,
  centralLatitudeDeg: 18.44,
};

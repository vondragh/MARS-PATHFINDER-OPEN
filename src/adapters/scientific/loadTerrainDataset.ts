import type { TerrainDataset } from '../../domain/terrain/types';
import { validateTerrainDataset } from '../../domain/terrain/validateDataset';

export const JEZERO_DATASET_URL = '/data/terrain/jezero-hirise-1km/metadata.json';

/** Decode the agreed SCI-01 file layout. No scaling, datum shift, or resampling is performed in the browser. */
export async function loadTerrainDataset(metadataUrl = JEZERO_DATASET_URL, signal?: AbortSignal): Promise<TerrainDataset> {
  const read = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Terrain asset could not be loaded (${response.status}): ${url}`);
    return response;
  };
  const metadata = await (await read(metadataUrl)).json();
  if (!metadata || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
    || metadata.width <= 0 || metadata.height <= 0 || metadata.width * metadata.height > 2_000_000) {
    throw new Error('Terrain metadata must specify positive raster dimensions with at most 2,000,000 cells.');
  }
  const base = metadataUrl.slice(0, metadataUrl.lastIndexOf('/') + 1);
  const [elevation, validity] = await Promise.all([
    read(`${base}elevation.f32le`).then(response => response.arrayBuffer()),
    read(`${base}valid.u8`).then(response => response.arrayBuffer()),
  ]);
  const cellCount = metadata.width * metadata.height;
  if (elevation.byteLength !== cellCount * 4 || validity.byteLength !== cellCount) {
    throw new Error('Terrain binary sizes do not match the declared raster dimensions.');
  }
  const elevationMeters = new Float32Array(cellCount);
  const view = new DataView(elevation);
  for (let index = 0; index < cellCount; index += 1) elevationMeters[index] = view.getFloat32(index * 4, true);
  const dataset: TerrainDataset = { ...metadata, elevationMeters, validMask: new Uint8Array(validity) };
  if (metadata.hazardProvenance) {
    dataset.hazardMask = new Uint8Array(await (await read(`${base}hazard.u8`)).arrayBuffer());
  }
  if (dataset.imagery && !/^(?:https?:\/\/|\/)/.test(dataset.imagery.assetUrl)) {
    dataset.imagery = { ...dataset.imagery, assetUrl: `${base}${dataset.imagery.assetUrl}` };
  }
  let issues: string[];
  try { issues = validateTerrainDataset(dataset); }
  catch { throw new Error('Terrain metadata does not conform to the SCI-01 contract.'); }
  if (issues.length) throw new Error(`Terrain validation failed: ${issues.join(' ')}`);
  return dataset;
}

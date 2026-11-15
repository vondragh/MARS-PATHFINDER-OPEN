import { demoSites, demoTerrain } from '../domain/terrain/demoFixture';
import { rasterToProjected } from '../domain/terrain/coordinates';
import type { TerrainDataset } from '../domain/terrain/types';

/** Planning examples are valid raster cells, not claims of identified scientific targets. */
export function terrainMissionSites(terrain: TerrainDataset) {
  if (terrain.id === demoTerrain.id) return demoSites;
  const nearestValid = (columnFraction: number, rowFraction: number, id: string, name: string) => {
    const targetColumn = (terrain.width - 1) * columnFraction;
    const targetRow = (terrain.height - 1) * rowFraction;
    let nearest = -1;
    let squaredDistance = Infinity;
    for (let index = 0; index < terrain.validMask.length; index += 1) {
      if (terrain.validMask[index] !== 1 || terrain.hazardMask?.[index] === 1 || !Number.isFinite(terrain.elevationMeters[index])) continue;
      const distance = (index % terrain.width - targetColumn) ** 2 + (Math.floor(index / terrain.width) - targetRow) ** 2;
      if (distance < squaredDistance) { nearest = index; squaredDistance = distance; }
    }
    if (nearest < 0) return { id, name, ...rasterToProjected(0.5, 0.5, terrain.transform) };
    return { id, name, ...rasterToProjected(nearest % terrain.width + 0.5, Math.floor(nearest / terrain.width) + 0.5, terrain.transform) };
  };
  return {
    habitat: nearestValid(0.2, 0.75, 'habitat', 'Habitat planning point'),
    siteA: nearestValid(0.75, 0.25, 'site-a', 'Planning point A'),
    siteB: nearestValid(0.75, 0.75, 'site-b', 'Planning point B'),
  };
}

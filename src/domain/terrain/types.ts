export type HorizontalUnit = 'm';
export type VerticalUnit = 'm';

export interface RasterTransform {
  /** GDAL-style affine transform: x = x0 + col*a + row*b; y = y0 + col*d + row*e. */
  coefficients: readonly [x0: number, a: number, b: number, y0: number, d: number, e: number];
}

export interface TerrainDatasetMetadata {
  id: string;
  title: string;
  sourceOrganization: string;
  sourceUrl: string;
  horizontalCrs: string;
  /** Full authoritative CRS definition, e.g. WKT2; demo fixtures must label it as synthetic. */
  horizontalCrsDefinition: string;
  coordinateTransform: {
    sourceCrs: string;
    sourceCrsDefinition: string;
    targetCrs: string;
    method: string;
    definition: string;
  };
  horizontalUnit: HorizontalUnit;
  verticalUnit: VerticalUnit;
  verticalDatum: string;
  limitations: string[];
  provenance: 'synthetic' | 'scientific';
  hazardProvenance?: {
    sourceOrganization: string;
    sourceUrl: string;
    limitations: string[];
  };
}

export interface TerrainDataset extends TerrainDatasetMetadata {
  width: number;
  height: number;
  /** Nominal pixel-vector lengths in meters; the affine transform remains authoritative. */
  cellSizeX: number;
  cellSizeY: number;
  transform: RasterTransform;
  /** Row-major elevations in meters. Values where validMask is 0 are ignored. */
  elevationMeters: Float32Array;
  /** Row-major validity mask: 1 = valid elevation, 0 = NoData. */
  validMask: Uint8Array;
  /** Optional row-major mask: 1 = confirmed impassable hazard, 0 = no mapped hazard. */
  hazardMask?: Uint8Array;
  imagery?: {
    assetUrl: string;
    mimeType: string;
    description: string;
    alignment: 'terrain-grid';
  };
}

export interface ProjectedCoordinate {
  x: number;
  y: number;
}

export interface GridCellIndex {
  /** Zero-based column from the raster's left edge. */
  column: number;
  /** Zero-based row from the raster's top edge. */
  row: number;
}

export interface GeographicCoordinate {
  longitudeDeg: number;
  latitudeDeg: number;
}

export type TerrainSample =
  | { status: 'available'; coordinate: ProjectedCoordinate; elevationM: number; cell: { column: number; row: number } }
  | { status: 'nodata'; coordinate: ProjectedCoordinate; cell: { column: number; row: number } }
  | { status: 'out-of-bounds'; coordinate: ProjectedCoordinate };

/** Mars equirectangular local projection used only by the deterministic demo fixture. */
export interface MarsEquirectangularProjection {
  radiusM: number;
  centralLongitudeDeg: number;
  centralLatitudeDeg: number;
}

import type { TerrainDataset } from './types';

export function validateTerrainDataset(dataset: TerrainDataset): string[] {
  const issues: string[] = [];
  if (!dataset.id.trim()) issues.push('Dataset ID is required.');
  if (!dataset.title.trim()) issues.push('Dataset title is required.');
  if (!dataset.sourceOrganization.trim()) issues.push('Source organization or preparing team is required.');
  if (!dataset.limitations.length || dataset.limitations.some(item => !item.trim())) issues.push('At least one explicit scientific limitation is required.');
  if (!dataset.horizontalCrs.trim()) issues.push('Horizontal CRS is required.');
  if (!dataset.horizontalCrsDefinition.trim()) issues.push('Full horizontal CRS definition is required.');
  if (!dataset.coordinateTransform.sourceCrs.trim()) issues.push('Coordinate transform source CRS is required.');
  if (!dataset.coordinateTransform.sourceCrsDefinition.trim()) issues.push('Full coordinate transform source CRS definition is required.');
  if (!dataset.coordinateTransform.targetCrs.trim() || dataset.coordinateTransform.targetCrs !== dataset.horizontalCrs) issues.push('Coordinate transform target CRS must match horizontalCrs.');
  if (!dataset.coordinateTransform.method.trim() || !dataset.coordinateTransform.definition.trim()) issues.push('Coordinate transform method and definition are required.');
  if (!dataset.verticalDatum.trim()) issues.push('Vertical datum must be stated, including when it is unknown or local.');
  if (dataset.provenance === 'scientific' && (!dataset.sourceOrganization.trim() || !dataset.sourceUrl.trim())) issues.push('Scientific provenance requires a source organization and source URL.');
  if (dataset.horizontalUnit !== 'm' || dataset.verticalUnit !== 'm') issues.push('The integration contract requires metric horizontal and vertical units.');
  if (!Number.isInteger(dataset.width) || dataset.width <= 0 || !Number.isInteger(dataset.height) || dataset.height <= 0) issues.push('Raster width and height must be positive integers.');
  if (dataset.elevationMeters.length !== dataset.width * dataset.height) issues.push('Elevation array length must equal width × height.');
  if (dataset.validMask.length !== dataset.width * dataset.height) issues.push('Validity mask length must equal width × height.');
  if (!Number.isFinite(dataset.cellSizeX) || !Number.isFinite(dataset.cellSizeY) || dataset.cellSizeX <= 0 || dataset.cellSizeY <= 0) issues.push('Cell sizes must be finite and positive.');
  if (dataset.transform.coefficients.length !== 6 || dataset.transform.coefficients.some(value => !Number.isFinite(value))) issues.push('All six affine transform coefficients must be finite.');
  const [, a, b, , d, e] = dataset.transform.coefficients;
  if (Math.abs(a * e - b * d) < Number.EPSILON) issues.push('Affine transform is singular and cannot convert coordinates to pixels.');
  const expectedCellSizeX = Math.hypot(a, d);
  const expectedCellSizeY = Math.hypot(b, e);
  if (Number.isFinite(dataset.cellSizeX) && Math.abs(dataset.cellSizeX - expectedCellSizeX) > Math.max(1, expectedCellSizeX) * 1e-6) issues.push('cellSizeX must match the affine column vector length.');
  if (Number.isFinite(dataset.cellSizeY) && Math.abs(dataset.cellSizeY - expectedCellSizeY) > Math.max(1, expectedCellSizeY) * 1e-6) issues.push('cellSizeY must match the affine row vector length.');
  for (let index = 0; index < dataset.validMask.length; index += 1) {
    if (dataset.validMask[index] !== 0 && dataset.validMask[index] !== 1) {
      issues.push(`Validity mask must contain only 0 or 1 (invalid value at index ${index}).`);
      break;
    }
    if (dataset.validMask[index] === 1 && !Number.isFinite(dataset.elevationMeters[index])) {
      issues.push(`Valid elevation values must be finite (invalid value at index ${index}).`);
      break;
    }
  }
  if (dataset.hazardMask && dataset.hazardMask.length !== dataset.width * dataset.height) issues.push('Hazard mask length must equal width × height.');
  if (dataset.hazardMask?.some(value => value !== 0 && value !== 1)) issues.push('Hazard mask must contain only 0 or 1.');
  if (dataset.hazardMask && (!dataset.hazardProvenance || !dataset.hazardProvenance.sourceOrganization.trim() || !dataset.hazardProvenance.sourceUrl.trim() || !dataset.hazardProvenance.limitations.length)) {
    issues.push('A hazard mask requires source organization, source URL, and limitations metadata.');
  }
  if (dataset.imagery && (dataset.imagery.alignment !== 'terrain-grid' || !dataset.imagery.assetUrl.trim() || !dataset.imagery.mimeType.trim() || !dataset.imagery.description.trim())) {
    issues.push('Imagery must identify an asset and MIME type, describe the layer, and declare exact terrain-grid alignment.');
  }
  return issues;
}

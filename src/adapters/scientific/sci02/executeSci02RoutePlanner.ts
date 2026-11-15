import type { RouteCandidate, RoutePlannerInput, RoutePlannerResult, RoutePlannerAdapter } from '../../../domain/routing/types';
import { coordinateToCell, sampleTerrain } from '../../../domain/terrain/coordinates';
import type { ProjectedCoordinate } from '../../../domain/terrain/types';
import { gridCellCenterToProjected, normalizeTerrainForSci02, projectedToGridCell, TerrainNormalizationError } from './normalizeTerrain';
import type { NormalizedSci02Terrain } from './normalizeTerrain';
import { planEvaRoute } from './routeplanner';
import type { GridCell, OptimizationMode, RoutePlannerResult as Sci02Result } from './routeplanner';

const MODES: readonly OptimizationMode[] = ['shortest', 'riskAware'];
const DISTANCE_TOLERANCE_M = 1e-4;

/**
 * Synchronous worker body. Keep A* and any affine resampling off the UI thread by
 * calling this through routePlanner.worker.ts in production.
 */
export function executeSci02RoutePlanner(input: RoutePlannerInput): RoutePlannerResult {
  const inputError = validateCanonicalInput(input);
  if (inputError) return failure(input, 'failed', inputError.code, inputError.reason);

  let normalized: NormalizedSci02Terrain;
  try {
    normalized = normalizeTerrainForSci02(input.terrain);
  } catch (error) {
    const failureCode = error instanceof TerrainNormalizationError ? 'invalid-input' : 'calculation-error';
    return failure(input, 'failed', failureCode, errorMessage(error));
  }

  const startSourceCell = coordinateToCell(input.terrain, input.start.coordinate);
  const destinationSourceCell = coordinateToCell(input.terrain, input.destination.coordinate);
  if (!startSourceCell) return failure(input, 'failed', 'start-out-of-bounds', 'The Habitat coordinate is outside the source terrain raster.');
  if (!destinationSourceCell) return failure(input, 'failed', 'destination-out-of-bounds', 'The destination coordinate is outside the source terrain raster.');
  if (startSourceCell.row !== input.start.cell.row || startSourceCell.column !== input.start.cell.col) {
    return failure(input, 'failed', 'invalid-input', 'Habitat coordinate and cell index disagree with the source affine transform.');
  }
  if (destinationSourceCell.row !== input.destination.cell.row || destinationSourceCell.column !== input.destination.cell.col) {
    return failure(input, 'failed', 'invalid-input', 'Destination coordinate and cell index disagree with the source affine transform.');
  }

  const startSample = sampleTerrain(input.terrain, input.start.coordinate);
  if (startSample.status === 'out-of-bounds') return failure(input, 'failed', 'start-out-of-bounds', 'The Habitat coordinate is outside the source terrain raster.');
  if (startSample.status === 'nodata') return failure(input, 'failed', 'nodata-endpoint', 'The Habitat cell has no valid terrain elevation.');
  const destinationSample = sampleTerrain(input.terrain, input.destination.coordinate);
  if (destinationSample.status === 'out-of-bounds') return failure(input, 'failed', 'destination-out-of-bounds', 'The destination coordinate is outside the source terrain raster.');
  if (destinationSample.status === 'nodata') return failure(input, 'failed', 'nodata-endpoint', 'The destination cell has no valid terrain elevation.');

  const normalizedStartCell = projectedToGridCell(normalized.transform, normalized.grid.width, normalized.grid.height, input.start.coordinate);
  const normalizedDestinationCell = projectedToGridCell(normalized.transform, normalized.grid.width, normalized.grid.height, input.destination.coordinate);
  if (!normalizedStartCell) return failure(input, 'failed', 'start-out-of-bounds', 'The Habitat coordinate could not be placed in the normalized SCI-02 grid.');
  if (!normalizedDestinationCell) return failure(input, 'failed', 'destination-out-of-bounds', 'The destination coordinate could not be placed in the normalized SCI-02 grid.');

  const sharedWarnings = [...normalized.warnings];
  if (!input.terrain.hazardMask) {
    sharedWarnings.push('No confirmed hazard layer is present; SCI-02 cannot avoid hazards that are not mapped in the input dataset.');
  }
  if (normalized.noDataCellCount > 0) {
    sharedWarnings.push(`${normalized.noDataCellCount} NoData cells in the SCI-02 grid are impassable under the canonical reject-route policy.`);
  }
  sharedWarnings.push('SCI-02 is a route-planning model; neither the dataset nor the result has been scientifically or operationally validated by this adapter.');

  const requestedMode = input.optimizationMode;
  const modes = input.includeAlternatives
    ? [requestedMode, MODES.find(mode => mode !== requestedMode)!]
    : [requestedMode];
  const modeResults = modes.map(mode => ({
    mode,
    result: planEvaRoute({
      terrain: normalized.grid,
      config: {
        start: normalizedStartCell,
        destination: normalizedDestinationCell,
        maxSlopeDeg: input.constraints.maxSlopeDeg,
        walkingSpeedMps: input.evaAssumptions.walkingSpeedMps,
        evaTimeLimitMinutes: input.evaAssumptions.evaTimeLimitMinutes,
        scienceActivityMinutes: input.evaAssumptions.scienceActivityMinutes,
        safetyReserveMinutes: input.evaAssumptions.safetyReserveMinutes,
        optimizationMode: mode,
        returnToHabitat: true,
      },
    }),
  }));

  const successful = modeResults.filter((item): item is { mode: OptimizationMode; result: Sci02Result & { status: 'success' } } => item.result.status === 'success');
  if (successful.length) {
    const chosen = successful.find(item => item.mode === requestedMode) ?? successful[0];
    let selectedRoute: RouteCandidate;
    const routeWarnings = [...sharedWarnings];
    try {
      selectedRoute = toRouteCandidate(input, normalized.transform, normalized.grid, chosen.mode, chosen.result);
      for (const alternative of successful) {
        if (alternative === chosen) continue;
        routeWarnings.push(...alternative.result.warnings.map(warning => `${alternative.mode} alternative: ${warning}`));
      }
    } catch (error) {
      return failure(input, 'failed', 'calculation-error', errorMessage(error), routeWarnings);
    }

    if (chosen.mode !== requestedMode) {
      routeWarnings.push(`Requested ${requestedMode} failed; the returned route uses the only successful mode, ${chosen.mode}.`);
    }

    const alternatives: RouteCandidate[] = [];
    for (const item of successful) {
      if (item === chosen) continue;
      try {
        alternatives.push(toRouteCandidate(input, normalized.transform, normalized.grid, item.mode, item.result));
      } catch (error) {
        routeWarnings.push(`${item.mode} candidate was omitted because its geometry failed validation: ${errorMessage(error)}`);
      }
    }
    for (const item of modeResults.filter(entry => entry.result.status !== 'success')) {
      routeWarnings.push(`${item.mode} candidate: ${item.result.failureReason ?? `SCI-02 returned ${item.result.status}.`}`);
    }

    const assumptions = uniqueStrings([
      ...chosen.result.assumptions,
      ...normalized.warnings,
      'The adapter maps clicked projected coordinates to containing raster cells; displayed route vertices are the corresponding normalized cell centers.',
      'EVA budget compliance is assessed separately from route existence and slope feasibility; the displayed required duration includes the configured safety reserve.',
      'Scientific validation is not inferred from the SCI-02 adapter label or successful A* execution.',
    ]);
    return {
      requestId: input.requestId,
      status: 'success',
      feasible: selectedRoute.feasible,
      selectedRoute,
      alternatives,
      warnings: uniqueStrings([...routeWarnings, ...chosen.result.warnings]),
      modelAssumptions: assumptions,
    };
  }

  const failedMode = modeResults.find(item => item.result.status === 'invalidInput' || item.result.status === 'error');
  if (failedMode) {
    const code = failedMode.result.status === 'invalidInput' ? 'invalid-input' : 'calculation-error';
    return failure(input, 'failed', code, `${failedMode.mode}: ${failedMode.result.failureReason ?? 'SCI-02 calculation failed.'}`, [
      ...sharedWarnings,
      ...modeResults.flatMap(item => item.result.warnings),
    ]);
  }

  const reasons = modeResults.map(item => `${item.mode}: ${item.result.failureReason ?? 'No route satisfies the configured terrain and slope constraints.'}`);
  return failure(input, 'infeasible', 'no-feasible-route', reasons.join(' '), [
    ...sharedWarnings,
    ...modeResults.flatMap(item => item.result.warnings),
  ], modeResults.flatMap(item => item.result.assumptions));
}

function toRouteCandidate(
  input: RoutePlannerInput,
  transform: RoutePlannerInput['terrain']['transform'],
  terrain: ReturnType<typeof normalizeTerrainForSci02>['grid'],
  mode: OptimizationMode,
  result: Sci02Result & { status: 'success' },
): RouteCandidate {
  const eva = result.evaAssessment;
  if (!eva) throw new Error('SCI-02 returned success without an EVA assessment.');
  if (result.outboundPoints.length === 0 || result.returnPoints.length === 0) throw new Error('SCI-02 returned success without both round-trip legs.');
  if (result.maxSlopeDeg > input.constraints.maxSlopeDeg + 1e-8) {
    throw new Error(`SCI-02 route slope ${result.maxSlopeDeg}° exceeds configured limit ${input.constraints.maxSlopeDeg}°.`);
  }

  const outbound = toLeg(result.outboundPoints, input.start.id, input.destination.id, transform, terrain);
  const returning = toLeg(result.returnPoints, input.destination.id, input.start.id, transform, terrain);
  assertDistance('outbound', outbound.distanceM, eva.outboundDistanceMeters);
  assertDistance('return', returning.distanceM, eva.returnDistanceMeters);
  assertDistance('total', outbound.distanceM + returning.distanceM, result.distanceMeters);
  assertDistance('EVA assessment total', outbound.distanceM + returning.distanceM, eva.totalDistanceMeters);

  const elevationProfile = result.elevationProfile.map(sample => {
    const index = sample.row * terrain.width + sample.col;
    if (sample.row < 0 || sample.col < 0 || sample.row >= terrain.height || sample.col >= terrain.width) {
      throw new Error(`SCI-02 profile contains an out-of-bounds cell (${sample.row}, ${sample.col}).`);
    }
    if (terrain.validMask[index] !== 1 || terrain.hazardMask?.[index] === 1 || !Number.isFinite(sample.elevationMeters)) {
      throw new Error(`SCI-02 profile contains a NoData or hazard cell (${sample.row}, ${sample.col}).`);
    }
    if (Math.abs(terrain.elevationMeters[index] - sample.elevationMeters) > 1e-4) {
      throw new Error(`SCI-02 profile elevation does not match normalized terrain cell (${sample.row}, ${sample.col}).`);
    }
    return {
      distanceM: sample.cumulativeDistanceMeters,
      leg: sample.leg,
      coordinate: gridCellCenterToProjected(transform, sample.row, sample.col),
      cell: { row: sample.row, col: sample.col },
      elevationM: sample.elevationMeters,
    };
  });

  const coveragePercent = elevationProfile.length
    ? elevationProfile.filter(sample => sample.elevationM !== null).length / elevationProfile.length * 100
    : 0;
  return {
    id: `sci02-${mode}`,
    label: mode === 'shortest' ? 'SCI-02 shortest path' : 'SCI-02 risk-aware path',
    feasible: true,
    outbound,
    return: returning,
    totalDistanceM: result.distanceMeters,
    estimatedMovementTimeMinutes: result.estimatedTravelMinutes,
    estimatedEvaDurationMinutes: eva.totalRequiredMinutesWithReserve,
    maximumSlopeDeg: result.maxSlopeDeg,
    elevationProfile,
    terrainWarnings: result.warnings,
    assumptions: result.assumptions,
    riskMetrics: { elevationCoveragePercent: coveragePercent },
    metadata: {
      adapter: 'SCI-02 A*',
      optimizationMode: mode,
      terrainId: input.terrain.id,
      normalizedGrid: `${terrain.width}x${terrain.height}`,
      normalization: transform === input.terrain.transform ? 'source-orthogonal-grid' : 'affine-skew-resampled',
      scientificValidation: 'not-established',
    },
  };
}

function toLeg(
  points: GridCell[],
  startId: string,
  endId: string,
  transform: RoutePlannerInput['terrain']['transform'],
  terrain: ReturnType<typeof normalizeTerrainForSci02>['grid'],
) {
  const cells = points.map(point => ({ row: point.row, col: point.col }));
  for (const cell of cells) assertTraversable(terrain, cell);
  const coordinates = cells.map(cell => gridCellCenterToProjected(transform, cell.row, cell.col));
  if (coordinates.length === 1) coordinates.push(coordinates[0]);
  const distanceM = polylineDistance(coordinates);
  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];
  return {
    start: { id: startId, coordinate: startCoordinate, cell: cells[0] },
    end: { id: endId, coordinate: endCoordinate, cell: cells[cells.length - 1] },
    coordinates,
    traversedCells: cells,
    distanceM,
  };
}

function assertTraversable(terrain: ReturnType<typeof normalizeTerrainForSci02>['grid'], cell: GridCell) {
  if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col) || cell.row < 0 || cell.col < 0 || cell.row >= terrain.height || cell.col >= terrain.width) {
    throw new Error(`SCI-02 route contains an out-of-bounds cell (${cell.row}, ${cell.col}).`);
  }
  const index = cell.row * terrain.width + cell.col;
  if (terrain.validMask[index] !== 1 || !Number.isFinite(terrain.elevationMeters[index])) {
    throw new Error(`SCI-02 route crosses a NoData cell (${cell.row}, ${cell.col}).`);
  }
  if (terrain.hazardMask?.[index] === 1) throw new Error(`SCI-02 route crosses a hazard cell (${cell.row}, ${cell.col}).`);
}

function polylineDistance(coordinates: ProjectedCoordinate[]) {
  let distanceM = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    distanceM += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return distanceM;
}

function assertDistance(name: string, actual: number, expected: number) {
  const tolerance = Math.max(DISTANCE_TOLERANCE_M, Math.abs(expected) * 1e-9);
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name} geometry distance ${actual} m does not match SCI-02 metric ${expected} m.`);
  }
}

function validateCanonicalInput(input: RoutePlannerInput): { code: 'invalid-input'; reason: string } | null {
  if (!input || typeof input !== 'object') return { code: 'invalid-input', reason: 'RoutePlannerInput is required.' };
  if (!input.requestId.trim()) return { code: 'invalid-input', reason: 'requestId must be a non-empty string.' };
  if (!input.start || !input.destination) return { code: 'invalid-input', reason: 'Habitat and destination endpoints are required.' };
  if (!Number.isFinite(input.start.coordinate.x) || !Number.isFinite(input.start.coordinate.y) || !Number.isFinite(input.destination.coordinate.x) || !Number.isFinite(input.destination.coordinate.y)) {
    return { code: 'invalid-input', reason: 'Endpoint projected coordinates must be finite local metric values.' };
  }
  if (![input.start.cell.row, input.start.cell.col, input.destination.cell.row, input.destination.cell.col].every(Number.isInteger)) {
    return { code: 'invalid-input', reason: 'Endpoint row/column indices must be integers.' };
  }
  if (input.waypoints.length) return { code: 'invalid-input', reason: 'SCI-02 v1 does not support waypoints; none were silently omitted.' };
  if (input.returnToHabitat !== true) return { code: 'invalid-input', reason: 'The canonical TECH-01 route contract requires returnToHabitat=true.' };
  if (!['shortest', 'riskAware'].includes(input.optimizationMode)) return { code: 'invalid-input', reason: 'Unsupported SCI-02 optimization mode.' };
  if (input.constraints.noDataPolicy !== 'reject-route') return { code: 'invalid-input', reason: 'SCI-02 requires the canonical noDataPolicy="reject-route".' };
  if (!Number.isFinite(input.constraints.maxSlopeDeg) || input.constraints.maxSlopeDeg < 0 || input.constraints.maxSlopeDeg > 90) {
    return { code: 'invalid-input', reason: 'maxSlopeDeg must be finite and between 0° and 90°.' };
  }
  const eva = input.evaAssumptions;
  if (![eva.walkingSpeedMps, eva.evaTimeLimitMinutes, eva.scienceActivityMinutes, eva.safetyReserveMinutes].every(Number.isFinite)
    || eva.walkingSpeedMps <= 0 || eva.evaTimeLimitMinutes <= 0 || eva.scienceActivityMinutes < 0 || eva.safetyReserveMinutes < 0) {
    return { code: 'invalid-input', reason: 'EVA speed and duration values are invalid or non-finite.' };
  }
  return null;
}

function failure(
  input: RoutePlannerInput,
  status: 'failed' | 'infeasible',
  failureCode: NonNullable<RoutePlannerResult['failureCode']>,
  failureReason: string,
  warnings: string[] = [],
  modelAssumptions: string[] = [],
): RoutePlannerResult {
  return {
    requestId: input?.requestId ?? 'invalid-request',
    status,
    feasible: false,
    alternatives: [],
    warnings,
    modelAssumptions: uniqueStrings([
      ...modelAssumptions,
      'SCI-02 route outputs are not scientific validation or operational EVA safety approval.',
    ]),
    failureCode,
    failureReason,
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(value => value.trim().length > 0))];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'SCI-02 route calculation failed with an unknown error.';
}

export const SCI02_ADAPTER_ID: RoutePlannerAdapter['id'] = 'sci02-a-star-v1';

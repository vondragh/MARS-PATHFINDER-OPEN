import { coordinateToCell, sampleTerrain } from '../../domain/terrain/coordinates';
import type { ProjectedCoordinate, TerrainDataset } from '../../domain/terrain/types';
import type { ElevationProfileSample, RouteCandidate, RouteCellIndex, RouteEndpoint, RouteLeg, RoutePlannerAdapter, RoutePlannerInput, RoutePlannerResult } from '../../domain/routing/types';

const delay = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const onAbort = () => {
    clearTimeout(timer);
    reject(new DOMException('Calculation cancelled', 'AbortError'));
  };
  const timer = setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  signal.addEventListener('abort', onAbort, { once: true });
});

const distance = (a: ProjectedCoordinate, b: ProjectedCoordinate) => Math.hypot(b.x - a.x, b.y - a.y);

function endpointSample(terrain: TerrainDataset, endpoint: RouteEndpoint) {
  const calculatedCell = coordinateToCell(terrain, endpoint.coordinate);
  if (!calculatedCell || calculatedCell.column !== endpoint.cell.col || calculatedCell.row !== endpoint.cell.row) {
    return { status: 'invalid-cell' as const };
  }
  return sampleTerrain(terrain, endpoint.coordinate);
}

function sampleLeg(
  points: ProjectedCoordinate[],
  start: RouteEndpoint,
  end: RouteEndpoint,
  terrain: TerrainDataset,
  legName: 'outbound' | 'return',
  cumulativeOffsetM = 0,
): { leg: RouteLeg; profile: ElevationProfileSample[] } {
  const profile: ElevationProfileSample[] = [];
  const traversedCells: RouteCellIndex[] = [];
  let legDistanceM = 0;
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const segmentStart = points[segment];
    const segmentEnd = points[segment + 1];
    const segmentLength = distance(segmentStart, segmentEnd);
    const steps = Math.max(2, Math.ceil(segmentLength / 50));
    for (let step = segment === 0 ? 0 : 1; step <= steps; step += 1) {
      const ratio = step / steps;
      const coordinate = {
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio,
      };
      const cell = coordinateToCell(terrain, coordinate);
      const sample = sampleTerrain(terrain, coordinate);
      if (cell && (!traversedCells.length || traversedCells[traversedCells.length - 1].col !== cell.column || traversedCells[traversedCells.length - 1].row !== cell.row)) {
        traversedCells.push({ row: cell.row, col: cell.column });
      }
      profile.push({
        distanceM: cumulativeOffsetM + legDistanceM + segmentLength * ratio,
        leg: legName,
        coordinate,
        cell: cell ? { row: cell.row, col: cell.column } : { row: -1, col: -1 },
        elevationM: sample.status === 'available' ? sample.elevationM : null,
      });
    }
    legDistanceM += segmentLength;
  }
  return {
    leg: { start, end, coordinates: points, traversedCells, distanceM: legDistanceM },
    profile,
  };
}

function maximumSampledSlope(profile: ElevationProfileSample[]) {
  let maximum = 0;
  let hasPair = false;
  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1];
    const current = profile[index];
    if (previous.elevationM === null || current.elevationM === null) continue;
    const horizontal = distance(previous.coordinate, current.coordinate);
    if (!horizontal) continue;
    maximum = Math.max(maximum, Math.atan2(Math.abs(current.elevationM - previous.elevationM), horizontal) * 180 / Math.PI);
    hasPair = true;
  }
  return hasPair ? maximum : null;
}

function buildCandidate(input: RoutePlannerInput, id: string, label: string, outboundCoordinates: ProjectedCoordinate[]): RouteCandidate {
  const returnCoordinates = [...outboundCoordinates].reverse();
  const outboundSamples = sampleLeg(outboundCoordinates, input.start, input.destination, input.terrain, 'outbound');
  const returnSamples = sampleLeg(returnCoordinates, input.destination, input.start, input.terrain, 'return', outboundSamples.leg.distanceM);
  const elevationProfile = [...outboundSamples.profile, ...returnSamples.profile.slice(1)];
  const outboundDistanceM = outboundSamples.leg.distanceM;
  const returnDistanceM = returnSamples.leg.distanceM;
  const totalDistanceM = outboundDistanceM + returnDistanceM;
  const estimatedMovementTimeMinutes = totalDistanceM / input.evaAssumptions.walkingSpeedMps / 60;
  const estimatedEvaDurationMinutes = estimatedMovementTimeMinutes
    + input.evaAssumptions.scienceActivityMinutes
    + input.evaAssumptions.safetyReserveMinutes;
  const maximumSlopeDeg = maximumSampledSlope(elevationProfile);
  const terrainWarnings: string[] = [];
  const crossesNoData = elevationProfile.some(sample => sample.elevationM === null);
  const crossesHazard = Boolean(input.terrain.hazardMask && elevationProfile.some(sample => {
    if (sample.cell.row < 0 || sample.cell.col < 0) return false;
    return input.terrain.hazardMask?.[sample.cell.row * input.terrain.width + sample.cell.col] === 1;
  }));
  const exceedsSlope = maximumSlopeDeg !== null && maximumSlopeDeg > input.constraints.maxSlopeDeg;
  const exceedsTime = estimatedEvaDurationMinutes > input.evaAssumptions.evaTimeLimitMinutes;
  if (crossesNoData) terrainWarnings.push('This illustrative geometry crosses cells without elevation data; the no-data rule rejects it.');
  if (crossesHazard) terrainWarnings.push('This illustrative geometry crosses a cell marked as a confirmed hazard.');
  if (exceedsSlope) terrainWarnings.push('Sampled synthetic slope exceeds the configured limit.');
  if (exceedsTime) terrainWarnings.push('Illustrative duration exceeds the configured EVA time limit.');
  const feasible = !crossesNoData && !crossesHazard && !exceedsSlope && !exceedsTime;
  const feasibilityReason = !feasible
    ? crossesNoData ? 'Route intersects NoData cells.' : crossesHazard ? 'Route intersects a confirmed hazard cell.' : exceedsSlope ? 'Sampled synthetic slope exceeds the configured limit.' : 'Illustrative duration exceeds the configured EVA time limit.'
    : undefined;

  return {
    id,
    label,
    feasible,
    ...(feasibilityReason ? { feasibilityReason } : {}),
    outbound: outboundSamples.leg,
    return: returnSamples.leg,
    totalDistanceM,
    estimatedMovementTimeMinutes,
    estimatedEvaDurationMinutes,
    maximumSlopeDeg,
    elevationProfile,
    terrainWarnings,
    assumptions: [
      'Only two illustrative polyline shapes are generated; this adapter does not optimize over terrain cells.',
      'Every return leg reverses the outbound polyline and therefore has the same distance.',
      'Walking time uses a constant user-entered speed; no astronaut physiology, suit, energy, communications or equipment model is used.',
    ],
    riskMetrics: { elevationCoveragePercent: elevationProfile.length ? elevationProfile.filter(sample => sample.elevationM !== null).length / elevationProfile.length * 100 : 0 },
    metadata: { adapter: 'DEMO ONLY', terrainId: input.terrain.id, optimizationMode: input.optimizationMode },
  };
}

export const demoRoutePlanner: RoutePlannerAdapter = {
  id: 'demo-route-planner-v1',
  label: 'Illustrative route generator',
  provenance: 'demo',
  async calculate(input, signal): Promise<RoutePlannerResult> {
    await delay(420, signal);
    if (signal.aborted) throw new DOMException('Calculation cancelled', 'AbortError');

    const startSample = endpointSample(input.terrain, input.start);
    const destinationSample = endpointSample(input.terrain, input.destination);
    if (startSample.status === 'invalid-cell' || startSample.status === 'out-of-bounds') {
      return failure(input, 'start-out-of-bounds', 'Start coordinate and cell do not identify a valid terrain sample.');
    }
    if (destinationSample.status === 'invalid-cell' || destinationSample.status === 'out-of-bounds') {
      return failure(input, 'destination-out-of-bounds', 'Destination coordinate and cell do not identify a valid terrain sample.');
    }
    if (startSample.status === 'nodata') return failure(input, 'nodata-endpoint', 'The start cell has no elevation data.');
    if (destinationSample.status === 'nodata') return failure(input, 'nodata-endpoint', 'The destination cell has no elevation data.');
    const waypointSamples = input.waypoints.map(point => endpointSample(input.terrain, point));
    const invalidWaypoint = waypointSamples.find(sample => sample.status !== 'available');
    if (invalidWaypoint) return failure(input, 'invalid-input', 'A waypoint is outside the dataset or has no elevation data.');

    const mandatoryCoordinates = [input.start.coordinate, ...input.waypoints.map(point => point.coordinate), input.destination.coordinate];
    const direct = mandatoryCoordinates;
    const midpoint = { x: (input.start.coordinate.x + input.destination.coordinate.x) / 2, y: (input.start.coordinate.y + input.destination.coordinate.y) / 2 };
    const detourSign = midpoint.y > 1_300 ? -1 : 1;
    const detour = [
      input.start.coordinate,
      ...input.waypoints.slice(0, Math.ceil(input.waypoints.length / 2)).map(point => point.coordinate),
      { x: Math.max(120, Math.min(3_480, midpoint.x - 320)), y: Math.max(120, Math.min(2_480, midpoint.y + 420 * detourSign)) },
      { x: Math.max(120, Math.min(3_480, midpoint.x + 290)), y: Math.max(120, Math.min(2_480, midpoint.y + 470 * detourSign)) },
      ...input.waypoints.slice(Math.ceil(input.waypoints.length / 2)).map(point => point.coordinate),
      input.destination.coordinate,
    ];
    const shortest = buildCandidate(input, 'route-shortest', 'Direct profile', direct);
    const terrainDetour = buildCandidate(input, 'route-detour', 'Terrain detour', detour);
    const preferredRoute = input.optimizationMode === 'riskAware' ? terrainDetour : shortest;
    const otherRoute = preferredRoute.id === shortest.id ? terrainDetour : shortest;
    // This demo adapter does not optimize. It does, however, avoid presenting a
    // rejected candidate as the mission choice when its other fixed shape passes.
    const selectedRoute = preferredRoute.feasible === true
      ? preferredRoute
      : otherRoute.feasible === true ? otherRoute : preferredRoute;
    const alternatives = input.includeAlternatives ? [selectedRoute.id === shortest.id ? terrainDetour : shortest] : [];
    const baseWarning = 'Synthetic demo output only — not a validated route or astronaut safety calculation.';
    const fallbackWarning = selectedRoute.id !== preferredRoute.id
      ? `The requested ${input.optimizationMode === 'riskAware' ? 'terrain detour' : 'direct'} demo shape failed its checks; the other illustrative shape is selected because it passed the configured checks.`
      : null;
    return {
      requestId: input.requestId,
      status: selectedRoute.feasible ? 'success' : 'infeasible',
      feasible: selectedRoute.feasible,
      selectedRoute,
      alternatives,
      warnings: [baseWarning, ...(fallbackWarning ? [fallbackWarning] : []), ...selectedRoute.terrainWarnings],
      modelAssumptions: ['Routes are short demonstration polylines, not a scientific search or optimization algorithm.', 'NoData and slope checks use only the synthetic fixture and must not be interpreted as operational validation.'],
      ...(!selectedRoute.feasible ? { failureCode: 'no-feasible-route' as const, failureReason: selectedRoute.feasibilityReason } : {}),
    };
  },
};

function failure(input: RoutePlannerInput, failureCode: 'start-out-of-bounds' | 'destination-out-of-bounds' | 'nodata-endpoint' | 'unsupported-mode' | 'invalid-input', failureReason: string): RoutePlannerResult {
  return {
    requestId: input.requestId,
    status: 'failed',
    feasible: false,
    alternatives: [],
    warnings: [],
    modelAssumptions: [],
    failureCode,
    failureReason,
  };
}

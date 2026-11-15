import type { RouteCandidate, RoutePlannerResult } from './types';

export function validateRouteResult(result: RoutePlannerResult, expectedRequestId: string): string[] {
  const issues: string[] = [];
  if (result.requestId !== expectedRequestId) issues.push('Request ID does not match the active calculation.');
  if (!['success', 'infeasible', 'failed'].includes(result.status)) issues.push('Unknown calculation status.');
  if (!Array.isArray(result.alternatives)) issues.push('Alternatives must be an array.');
  if (result.status === 'success' && (!result.selectedRoute || result.selectedRoute.feasible !== true || result.feasible !== true)) issues.push('A successful result must contain a feasible selected route and set feasible to true.');
  if (result.status === 'failed' && (!result.failureCode || !result.failureReason)) issues.push('A failed result must include a failure code and reason.');
  if (result.status === 'infeasible' && result.feasible !== false) issues.push('An infeasible result must set feasible to false.');
  if (result.status === 'infeasible' && result.selectedRoute?.feasible === true) issues.push('An infeasible result cannot select a feasible route.');
  if (result.status === 'infeasible' && result.alternatives.some(route => route.feasible === true)) issues.push('An infeasible result cannot include a feasible alternative route.');
  if (result.status === 'success' && result.selectedRoute && result.feasible !== result.selectedRoute.feasible) issues.push('Top-level feasibility must match the selected route feasibility.');
  const routes = [result.selectedRoute, ...result.alternatives].filter((route): route is RouteCandidate => Boolean(route));
  const routeIds = new Set<string>();
  for (const route of routes) {
    if (!route.id.trim()) issues.push('Route ID is required.');
    if (routeIds.has(route.id)) issues.push('Route IDs must be unique within one result.');
    routeIds.add(route.id);
    validateLeg(route.outbound, 'outbound', issues);
    validateLeg(route.return, 'return', issues);
    if (!Number.isFinite(route.totalDistanceM) || route.totalDistanceM < 0) issues.push('Route distance must be a non-negative finite value.');
    const expectedDistance = route.outbound.distanceM + route.return.distanceM;
    if (Math.abs(route.totalDistanceM - expectedDistance) > 0.5) issues.push('Total route distance must equal outbound plus return distance (within 0.5 m).');
    for (const sample of route.elevationProfile) {
      if (!Number.isFinite(sample.distanceM) || !Number.isFinite(sample.coordinate.x) || !Number.isFinite(sample.coordinate.y)) issues.push('Elevation profile coordinates and distances must be finite.');
      if (sample.elevationM !== null && !Number.isFinite(sample.elevationM)) issues.push('Elevation profile values must be finite or null for NoData.');
    }
  }
  return [...new Set(issues)];
}

function validateLeg(leg: RouteCandidate['outbound'], name: string, issues: string[]) {
  if (!leg || leg.coordinates.length < 2) {
    issues.push(`The ${name} leg must contain at least two projected coordinates.`);
    return;
  }
  if (!Number.isFinite(leg.distanceM) || leg.distanceM < 0) issues.push(`The ${name} leg distance must be finite and non-negative.`);
  if (leg.traversedCells.some(cell => !Number.isInteger(cell.col) || !Number.isInteger(cell.row) || cell.col < 0 || cell.row < 0)) issues.push(`The ${name} leg contains an invalid raster cell.`);
  if (leg.coordinates.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) issues.push(`The ${name} leg contains a non-finite coordinate.`);
}

import type { MissionState } from './types';
import type { RouteCandidate } from '../routing/types';

export type EvaBudgetAssessment =
  | { state: 'not-run' | 'unavailable'; remainingMinutes: null; overByMinutes: null }
  | { state: 'within'; remainingMinutes: number; overByMinutes: null }
  | { state: 'exceeded'; remainingMinutes: null; overByMinutes: number };

export type MissionPlanState =
  | 'not-calculated'
  | 'calculating'
  | 'calculation-failed'
  | 'route-unavailable'
  | 'within-configured-limits'
  | 'constraints-exceeded'
  | 'alternative-available'
  | 'cannot-assess';

export interface MissionAssessment {
  selectedRoute: RouteCandidate | null;
  candidates: RouteCandidate[];
  selectedFeasibility: 'met' | 'exceeded' | 'unknown' | 'unselected';
  evaBudget: EvaBudgetAssessment;
  planState: MissionPlanState;
  compliantAlternative: RouteCandidate | null;
}

/** Resolve only the route explicitly selected by the user. Never silently fall back. */
export function getSelectedRoute(mission: MissionState): RouteCandidate | null {
  if (!mission.result || !mission.selectedRouteId) return null;
  const candidates = [mission.result.selectedRoute, ...mission.result.alternatives];
  return candidates.find((candidate): candidate is RouteCandidate => candidate?.id === mission.selectedRouteId) ?? null;
}

export function assessMission(mission: MissionState): MissionAssessment {
  const candidates = uniqueCandidates(mission);
  const selectedRoute = getSelectedRoute(mission);
  const evaBudget = assessEvaBudget(selectedRoute, mission);
  const compliantAlternative = candidates.find(candidate => candidate.id !== selectedRoute?.id
    && candidate.feasible === true
    && assessEvaBudget(candidate, mission).state === 'within') ?? null;

  let selectedFeasibility: MissionAssessment['selectedFeasibility'] = 'unselected';
  if (selectedRoute) selectedFeasibility = selectedRoute.feasible === true ? 'met' : selectedRoute.feasible === false ? 'exceeded' : 'unknown';

  let planState: MissionPlanState;
  if (mission.calculationState === 'loading') planState = 'calculating';
  else if (mission.calculationState === 'error' || mission.result?.status === 'failed') planState = 'calculation-failed';
  else if (mission.calculationState === 'idle' || !mission.result) planState = 'not-calculated';
  else if (!selectedRoute) planState = 'route-unavailable';
  else if (selectedRoute.feasible === false) planState = compliantAlternative ? 'alternative-available' : 'constraints-exceeded';
  else if (selectedRoute.feasible === true && evaBudget.state === 'exceeded') planState = 'constraints-exceeded';
  else if (selectedRoute.feasible === true && evaBudget.state === 'within') planState = 'within-configured-limits';
  else planState = 'cannot-assess';

  return { selectedRoute, candidates, selectedFeasibility, evaBudget, planState, compliantAlternative };
}

function assessEvaBudget(route: RouteCandidate | null, mission: MissionState): EvaBudgetAssessment {
  if (mission.calculationState === 'idle' || !mission.result) {
    return { state: 'not-run', remainingMinutes: null, overByMinutes: null };
  }
  const duration = route?.estimatedEvaDurationMinutes;
  if (duration === null || duration === undefined || !Number.isFinite(duration)) {
    return { state: 'unavailable', remainingMinutes: null, overByMinutes: null };
  }
  const limit = mission.constraints.maximumEvaDurationHours * 60;
  if (duration > limit) return { state: 'exceeded', remainingMinutes: null, overByMinutes: duration - limit };
  return { state: 'within', remainingMinutes: limit - duration, overByMinutes: null };
}

function uniqueCandidates(mission: MissionState): RouteCandidate[] {
  if (!mission.result) return [];
  const seen = new Set<string>();
  return [mission.result.selectedRoute, ...mission.result.alternatives].filter((candidate): candidate is RouteCandidate => {
    if (!candidate || seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

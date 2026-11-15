import { describe, expect, it } from 'vitest';
import type { RouteCandidate } from '../routing/types';
import { createInitialMissionState } from '../../hooks/useMissionController';
import { assessMission, getSelectedRoute } from './assessment';

function candidate(id: string, feasible: boolean | null, duration: number | null): RouteCandidate {
  return { id, label: id, feasible, estimatedEvaDurationMinutes: duration } as unknown as RouteCandidate;
}

describe('mission planning assessment', () => {
  it('keeps a rejected selected route distinct from an alternative that meets configured checks', () => {
    const selected = candidate('rejected', false, 500);
    const alternative = candidate('within-limits', true, 300);
    const mission = createInitialMissionState();
    mission.calculationState = 'success';
    mission.selectedRouteId = selected.id;
    mission.result = { requestId: 'test', status: 'success', feasible: true, selectedRoute: selected, alternatives: [alternative], warnings: [], modelAssumptions: [] };

    const assessment = assessMission(mission);
    expect(getSelectedRoute(mission)?.id).toBe('rejected');
    expect(assessment.selectedFeasibility).toBe('exceeded');
    expect(assessment.evaBudget.state).toBe('exceeded');
    expect(assessment.planState).toBe('alternative-available');
    expect(assessment.compliantAlternative?.id).toBe('within-limits');
  });

  it('does not assess a route when the selected id does not resolve exactly', () => {
    const mission = createInitialMissionState();
    mission.calculationState = 'success';
    mission.result = { requestId: 'test', status: 'success', feasible: true, selectedRoute: candidate('route-a', true, 300), alternatives: [], warnings: [], modelAssumptions: [] };
    mission.selectedRouteId = 'missing-route';

    const assessment = assessMission(mission);
    expect(assessment.selectedRoute).toBeNull();
    expect(assessment.planState).toBe('route-unavailable');
  });

  it('does not mark a route compliant when its EVA estimate exceeds the configured budget', () => {
    const selected = candidate('over-time', true, 500);
    const mission = createInitialMissionState();
    mission.calculationState = 'success';
    mission.result = { requestId: 'test', status: 'success', feasible: true, selectedRoute: selected, alternatives: [], warnings: [], modelAssumptions: [] };
    mission.selectedRouteId = selected.id;

    const assessment = assessMission(mission);
    expect(assessment.selectedFeasibility).toBe('met');
    expect(assessment.evaBudget.state).toBe('exceeded');
    expect(assessment.planState).toBe('constraints-exceeded');
  });
});

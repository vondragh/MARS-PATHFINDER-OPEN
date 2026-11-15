import type { ProjectedCoordinate, TerrainSample } from '../terrain/types';
import type { RoutePlannerResult } from '../routing/types';

export type SelectionMode = 'habitat' | 'destination' | null;
export type CalculationState = 'idle' | 'loading' | 'success' | 'error';
export type MissionOptimizationMode = 'shortest' | 'risk-aware' | 'scientific-priority';

/** Frontend form state; normalized into the SCI-02 RoutePlannerInput before invocation. */
export interface EvaConstraints {
  maximumSlopeDeg: number;
  walkingSpeedKmh: number;
  maximumEvaDurationHours: number;
  scienceActivityMinutes: number;
  safetyReserveMinutes: number;
}

export interface MissionState {
  missionId: string;
  habitat: ProjectedCoordinate;
  destination: ProjectedCoordinate;
  destinationName: string;
  constraints: EvaConstraints;
  optimizationMode: MissionOptimizationMode;
  selectionMode: SelectionMode;
  calculationState: CalculationState;
  result: RoutePlannerResult | null;
  selectedRouteId: string | null;
  calculationError: string | null;
  inspectedTerrain: TerrainSample | null;
  profileDistanceM: number;
}

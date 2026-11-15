import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { demoRoutePlanner } from '../adapters/demo/demoRoutePlanner';
import { demoTerrain } from '../domain/terrain/demoFixture';
import { terrainMissionSites } from './terrainMissionSites';
import { coordinateToCell, sampleTerrain } from '../domain/terrain/coordinates';
import { validateRouteResult } from '../domain/routing/validation';
import type { EvaAssumptions, RoutePlannerAdapter, RouteEndpoint, RoutePlannerResult } from '../domain/routing/types';
import type { EvaConstraints, MissionOptimizationMode, MissionState, SelectionMode } from '../domain/mission/types';
import type { ProjectedCoordinate, TerrainDataset } from '../domain/terrain/types';

const initialConstraints: EvaConstraints = {
  maximumSlopeDeg: 15,
  walkingSpeedKmh: 2.6,
  maximumEvaDurationHours: 8,
  scienceActivityMinutes: 45,
  safetyReserveMinutes: 30,
};

export function createInitialMissionState(terrain: TerrainDataset = demoTerrain): MissionState {
  const demoSites = terrainMissionSites(terrain);
  return {
    missionId: 'EVA-07',
    habitat: { x: demoSites.habitat.x, y: demoSites.habitat.y },
    destination: { x: demoSites.siteA.x, y: demoSites.siteA.y },
    destinationName: demoSites.siteA.name,
    constraints: { ...initialConstraints },
    optimizationMode: 'shortest',
    selectionMode: null,
    calculationState: 'idle',
    result: null,
    selectedRouteId: null,
    calculationError: null,
    inspectedTerrain: null,
    profileDistanceM: 0,
  };
}

export function validateConstraints(constraints: EvaConstraints): Record<keyof EvaConstraints, string | null> {
  return {
    maximumSlopeDeg: !Number.isFinite(constraints.maximumSlopeDeg) || constraints.maximumSlopeDeg < 1 || constraints.maximumSlopeDeg > 45 ? 'Use a value from 1° to 45°.' : null,
    walkingSpeedKmh: !Number.isFinite(constraints.walkingSpeedKmh) || constraints.walkingSpeedKmh < 0.2 || constraints.walkingSpeedKmh > 6 ? 'Use a value from 0.2 to 6 km/h.' : null,
    maximumEvaDurationHours: !Number.isFinite(constraints.maximumEvaDurationHours) || constraints.maximumEvaDurationHours < 1 || constraints.maximumEvaDurationHours > 12 ? 'Use a value from 1 to 12 hours.' : null,
    scienceActivityMinutes: !Number.isFinite(constraints.scienceActivityMinutes) || constraints.scienceActivityMinutes < 0 || constraints.scienceActivityMinutes > 180 ? 'Use a value from 0 to 180 minutes.' : null,
    safetyReserveMinutes: !Number.isFinite(constraints.safetyReserveMinutes) || constraints.safetyReserveMinutes < 0 || constraints.safetyReserveMinutes > 120 ? 'Use a value from 0 to 120 minutes.' : null,
  };
}

export function useMissionController(
  terrain: TerrainDataset,
  adapter: RoutePlannerAdapter = demoRoutePlanner,
) {
  const [mission, setMission] = useState(() => createInitialMissionState(terrain));
  const sequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  useEffect(() => () => { sequence.current += 1; activeController.current?.abort(); }, []);

  const invalidateRoute = useCallback(() => {
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setMission(current => ({ ...current, result: null, selectedRouteId: null, calculationState: 'idle', calculationError: null }));
  }, []);

  const setSelectionMode = useCallback((mode: SelectionMode) => {
    setMission(current => ({ ...current, selectionMode: mode }));
  }, []);

  const selectMapCoordinate = useCallback((coordinate: ProjectedCoordinate) => {
    setMission(current => {
      if (current.selectionMode === 'habitat') {
        return { ...current, habitat: coordinate, selectionMode: null, result: null, selectedRouteId: null, calculationState: 'idle', calculationError: null };
      }
      if (current.selectionMode === 'destination') {
        return { ...current, destination: coordinate, destinationName: 'Custom destination', selectionMode: null, result: null, selectedRouteId: null, calculationState: 'idle', calculationError: null };
      }
      return current;
    });
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
  }, []);

  const inspectMapCoordinate = useCallback((coordinate: ProjectedCoordinate) => {
    setMission(current => ({ ...current, inspectedTerrain: sampleTerrain(terrain, coordinate) }));
  }, [terrain]);

  const setConstraint = useCallback(<Key extends keyof EvaConstraints>(key: Key, value: EvaConstraints[Key]) => {
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setMission(current => ({
      ...current,
      constraints: { ...current.constraints, [key]: value },
      result: null,
      selectedRouteId: null,
      calculationState: 'idle',
      calculationError: null,
    }));
  }, []);

  const setOptimizationMode = useCallback((optimizationMode: MissionOptimizationMode) => {
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setMission(current => ({ ...current, optimizationMode, result: null, selectedRouteId: null, calculationState: 'idle', calculationError: null }));
  }, []);

  const setMissionId = useCallback((missionId: string) => {
    setMission(current => ({ ...current, missionId }));
  }, []);

  const setDestinationFromSite = useCallback((site: { name: string; x: number; y: number }) => {
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setMission(current => ({
      ...current,
      destination: { x: site.x, y: site.y },
      destinationName: site.name,
      result: null,
      selectedRouteId: null,
      calculationState: 'idle',
      calculationError: null,
    }));
  }, []);

  const calculate = useCallback(async (includeAlternatives = false): Promise<RoutePlannerResult | null> => {
    if (mission.optimizationMode === 'scientific-priority') {
      setMission(current => ({ ...current, calculationState: 'error', calculationError: 'Scientific-priority mode is not part of the SCI-02 contract yet.' }));
      return null;
    }
    const issues = Object.values(validateConstraints(mission.constraints)).filter(Boolean);
    if (issues.length) {
      setMission(current => ({ ...current, calculationState: 'error', calculationError: issues[0] ?? 'Check EVA constraints.' }));
      return null;
    }
    const startCell = coordinateToCell(terrain, mission.habitat);
    const destinationCell = coordinateToCell(terrain, mission.destination);
    if (!startCell || !destinationCell) {
      setMission(current => ({ ...current, calculationState: 'error', calculationError: 'Habitat or destination is outside the terrain grid. Select a point inside the raster.' }));
      return null;
    }
    sequence.current += 1;
    const requestSequence = sequence.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const requestId = `${mission.missionId || 'EVA'}-${requestSequence}`;
    setMission(current => ({ ...current, result: null, selectedRouteId: null, calculationState: 'loading', calculationError: null }));
    try {
      const result = await adapter.calculate({
        requestId,
        terrain,
        start: { id: 'habitat', coordinate: mission.habitat, cell: { row: startCell.row, col: startCell.column } } satisfies RouteEndpoint,
        destination: { id: 'destination', coordinate: mission.destination, cell: { row: destinationCell.row, col: destinationCell.column } } satisfies RouteEndpoint,
        waypoints: [],
        constraints: { maxSlopeDeg: mission.constraints.maximumSlopeDeg, noDataPolicy: 'reject-route' },
        evaAssumptions: toEvaAssumptions(mission.constraints),
        optimizationMode: mission.optimizationMode === 'risk-aware' ? 'riskAware' : 'shortest',
        returnToHabitat: true,
        includeAlternatives,
      }, controller.signal);
      if (requestSequence !== sequence.current || controller.signal.aborted) return null;
      const resultIssues = validateRouteResult(result, requestId);
      if (resultIssues.length) throw new Error(resultIssues.join(' '));
      setMission(current => ({
        ...current,
        result,
        selectedRouteId: result.selectedRoute?.id ?? null,
        calculationState: result.status === 'failed' ? 'error' : 'success',
        calculationError: null,
        profileDistanceM: 0,
      }));
      return result;
    } catch (error) {
      if (controller.signal.aborted || requestSequence !== sequence.current) return null;
      setMission(current => ({
        ...current,
        result: null,
        calculationState: 'error',
        calculationError: error instanceof Error ? error.message : 'The route calculation failed. Try again.',
      }));
      return null;
    }
  }, [adapter, mission, terrain]);

  const cancelCalculation = useCallback(() => {
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setMission(current => ({ ...current, result: null, calculationState: 'idle', calculationError: null }));
  }, []);

  const resetMission = useCallback(() => {
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setMission(createInitialMissionState(terrain));
  }, [terrain]);

  const setProfileDistance = useCallback((profileDistanceM: number) => {
    setMission(current => ({ ...current, profileDistanceM }));
  }, []);

  const selectRoute = useCallback((routeId: string) => {
    setMission(current => ({ ...current, selectedRouteId: routeId, profileDistanceM: 0 }));
  }, []);

  const constraintErrors = useMemo(() => validateConstraints(mission.constraints), [mission.constraints]);
  const hasConstraintErrors = Object.values(constraintErrors).some(Boolean);
  const hasInvalidEndpoints = sampleTerrain(terrain, mission.habitat).status !== 'available'
    || sampleTerrain(terrain, mission.destination).status !== 'available';

  return {
    mission,
    constraintErrors,
    hasConstraintErrors,
    hasInvalidEndpoints,
    setMissionId,
    setConstraint,
    setOptimizationMode,
    setSelectionMode,
    selectMapCoordinate,
    inspectMapCoordinate,
    setDestinationFromSite,
    setProfileDistance,
    selectRoute,
    calculate,
    cancelCalculation,
    invalidateRoute,
    resetMission,
  };
}

function toEvaAssumptions(constraints: EvaConstraints): EvaAssumptions {
  return {
    walkingSpeedMps: constraints.walkingSpeedKmh / 3.6,
    evaTimeLimitMinutes: constraints.maximumEvaDurationHours * 60,
    scienceActivityMinutes: constraints.scienceActivityMinutes,
    safetyReserveMinutes: constraints.safetyReserveMinutes,
  };
}

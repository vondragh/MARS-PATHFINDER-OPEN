import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { demoTerrain } from '../domain/terrain/demoFixture';
import type { RoutePlannerResult } from '../domain/routing/types';
import { useMissionController } from './useMissionController';

describe('mission controller', () => {
  it('selects coordinates from the map and invalidates a previous result when constraints change', async () => {
    const { result } = renderHook(() => useMissionController(demoTerrain));
    act(() => {
      result.current.setSelectionMode('habitat');
      result.current.selectMapCoordinate({ x: 600, y: 600 });
    });
    expect(result.current.mission.habitat).toEqual({ x: 600, y: 600 });
    expect(result.current.mission.selectionMode).toBeNull();

    await act(async () => { await result.current.calculate(true); });
    await waitFor(() => expect(result.current.mission.calculationState).toBe('success'));
    expect(result.current.mission.result?.alternatives).toHaveLength(1);

    act(() => result.current.setConstraint('maximumSlopeDeg', 10));
    expect(result.current.mission.result).toBeNull();
    expect(result.current.mission.calculationState).toBe('idle');
  });

  it('cancels a pending calculation and prevents stale output from being stored', async () => {
    const { result } = renderHook(() => useMissionController(demoTerrain));
    let calculation: Promise<RoutePlannerResult | null>;
    act(() => { calculation = result.current.calculate(); });
    expect(result.current.mission.calculationState).toBe('loading');
    act(() => result.current.cancelCalculation());
    await act(async () => { await calculation!; });
    expect(result.current.mission.calculationState).toBe('idle');
    expect(result.current.mission.result).toBeNull();
  });
});

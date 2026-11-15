import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { demoRoutePlanner } from '../adapters/demo/demoRoutePlanner';
import { executeSci02RoutePlanner } from '../adapters/scientific/sci02/executeSci02RoutePlanner';
import { createSci02RoutePlannerAdapter } from '../adapters/scientific/sci02/sci02RoutePlanner';
import type { RoutePlannerAdapter } from '../domain/routing/types';
import { demoTerrain } from '../domain/terrain/demoFixture';
import { App } from './App';

describe('mission control UI', () => {
  it('lets the user enter map-selection mode, edit EVA constraints, and render an adapter result', async () => {
    render(<App terrain={demoTerrain} scientificRoutePlanner={createSci02RoutePlannerAdapter(async input => executeSci02RoutePlanner(input))} />);
    expect(screen.getByText('SYNTHETIC FIXTURE')).toBeInTheDocument();
    expect(screen.getByText('NOT SCIENTIFICALLY VALIDATED')).toBeInTheDocument();
    expect(screen.getByText('No route candidate is currently selected')).toBeInTheDocument();
    expect(screen.getByText(/Calculate a route to see the adapter's choice/)).toBeInTheDocument();

    const placeButtons = screen.getAllByRole('button', { name: 'Place on map' });
    fireEvent.click(placeButtons[0]);
    expect(screen.getByText(/Click the map to place the habitat\./)).toBeInTheDocument();
    expect(screen.getByRole('application', { name: /Interactive terrain map/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Maximum allowed slope'), { target: { value: '20' } });
    expect(screen.getByLabelText('Maximum allowed slope')).toHaveValue('20');

    fireEvent.click(screen.getAllByRole('button', { name: /Calculate route/ })[0]);
    expect(screen.getByText(/Waiting for the replaceable route adapter/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Within configured limits').length).toBeGreaterThan(0), { timeout: 2_000 });
    expect(screen.getByRole('heading', { name: /Terrain profile/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Why this route?' })).toBeInTheDocument();
    expect(screen.getByText('Route checks passed')).toBeInTheDocument();
    expect(screen.getByText(/min remaining/)).toBeInTheDocument();
  });

  it('renders a visible recovery message when the replaceable route adapter fails', async () => {
    let calls = 0;
    const failingAdapter: RoutePlannerAdapter = {
      id: 'test-failure-adapter',
      label: 'Test adapter',
      provenance: 'demo',
      async calculate() { calls += 1; throw new Error('Adapter test failure. Check the integration logs and retry.'); },
    };
    render(<App terrain={demoTerrain} routePlanner={failingAdapter} />);
    fireEvent.click(screen.getByRole('radio', { name: /Demo adapter/ }));
    const calculateButton = screen.getAllByRole('button', { name: /Calculate route/ })[0];
    expect(calculateButton).toBeEnabled();
    fireEvent.click(calculateButton);
    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(screen.getAllByText('Calculation failed').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Adapter test failure. Check the integration logs and retry.').length).toBeGreaterThan(0);
  });

  it('keeps route selection consistent across the analysis, map, and elevation profile', async () => {
    const { container } = render(<App terrain={demoTerrain} />);
    fireEvent.click(screen.getByRole('radio', { name: /Demo adapter/ }));
    fireEvent.click(screen.getByRole('button', { name: /Compare routes/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Terrain detour/ })).toBeInTheDocument(), { timeout: 2_000 });

    fireEvent.click(screen.getByRole('button', { name: /Terrain detour/ }));
    const selectedId = screen.getByRole('button', { name: /Terrain detour/ }).getAttribute('data-route-id');
    expect(selectedId).toBeTruthy();
    expect(container.querySelector('.analysis-panel')?.getAttribute('data-selected-route-id')).toBe(selectedId);
    expect(container.querySelector('.map-panel')?.getAttribute('data-selected-route-id')).toBe(selectedId);
    expect(container.querySelector('.profile-panel')?.getAttribute('data-selected-route-id')).toBe(selectedId);
  });

  it('runs the three-step guided demo with the current route adapter and can return to Mission Control', async () => {
    render(<App terrain={demoTerrain} scientificRoutePlanner={createSci02RoutePlannerAdapter(async input => executeSci02RoutePlanner(input))} />);
    fireEvent.click(screen.getByRole('button', { name: /Guided demo/ }));
    expect(screen.getByText(/STEP 1 OF 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next: compare routes/ }));
    expect(screen.getByText(/STEP 2 OF 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Calculate & review/ }));
    await waitFor(() => expect(screen.getByText(/STEP 3 OF 3/)).toBeInTheDocument(), { timeout: 2_000 });
    expect(screen.getByText('Why this route?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exit/ }));
    expect(screen.queryByText(/STEP 3 OF 3/)).not.toBeInTheDocument();
  });

  it('opens the data provenance dialog and closes it with Escape', async () => {
    render(<App terrain={demoTerrain} />);
    const dataSources = screen.getByRole('button', { name: 'Data sources' });
    dataSources.focus();
    fireEvent.click(dataSources);
    expect(screen.getByRole('dialog', { name: 'Terrain source & limitations' })).toBeInTheDocument();
    expect(screen.getByText('Passed interface checks')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(dataSources).toHaveFocus();
  });

  it('marks a partial route response as not fully assessable and names unavailable metrics', async () => {
    const partialAdapter: RoutePlannerAdapter = {
      ...demoRoutePlanner,
      id: 'partial-test-adapter',
      label: 'Partial test adapter',
      async calculate(input, signal) {
        const result = await demoRoutePlanner.calculate(input, signal);
        if (result.selectedRoute) {
          result.selectedRoute.estimatedEvaDurationMinutes = null;
          result.selectedRoute.estimatedMovementTimeMinutes = null;
          result.selectedRoute.maximumSlopeDeg = null;
        }
        return result;
      },
    };
    render(<App terrain={demoTerrain} routePlanner={partialAdapter} />);
    fireEvent.click(screen.getByRole('radio', { name: /Demo adapter/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Calculate route/ })[0]);
    await waitFor(() => expect(screen.getAllByText('Cannot assess all limits').length).toBeGreaterThan(0), { timeout: 2_000 });
    expect(screen.getAllByText('Unavailable in demo mode').length).toBeGreaterThan(0);
    expect(screen.getByText('EVA time budget').parentElement).toHaveTextContent('Unavailable in demo mode');
  });

  it('defaults to SCI-02, keeps Demo as a fallback, and renders SCI-02 candidates', async () => {
    const scientificRoutePlanner = createSci02RoutePlannerAdapter(async input => executeSci02RoutePlanner(input));
    const { container } = render(<App terrain={demoTerrain} scientificRoutePlanner={scientificRoutePlanner} />);
    expect(screen.getByRole('radio', { name: /SCI-02 A\*/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Demo adapter/ }));
    expect(screen.getByRole('radio', { name: /Demo adapter/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /SCI-02 A\*/ }));
    expect(screen.getByRole('radio', { name: /SCI-02 A\*/ })).toBeChecked();
    expect(screen.getByText(/SCI-02 A\* · scientific validation not established/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Compare routes/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /SCI-02 shortest path/ })).toBeInTheDocument(), { timeout: 3_000 });

    const selectedId = screen.getByRole('button', { name: /SCI-02 shortest path/ }).getAttribute('data-route-id');
    expect(selectedId).toBe('sci02-shortest');
    const riskAwareOption = screen.getByRole('button', { name: /SCI-02 risk-aware path/ });
    expect(riskAwareOption).toBeInTheDocument();
    fireEvent.click(riskAwareOption);
    const comparedId = screen.getByRole('button', { name: /SCI-02 risk-aware path/ }).getAttribute('data-route-id');
    expect(comparedId).toBe('sci02-riskAware');
    expect(container.querySelector('.analysis-panel')?.getAttribute('data-selected-route-id')).toBe(comparedId);
    expect(container.querySelector('.map-panel')?.getAttribute('data-selected-route-id')).toBe(comparedId);
    expect(container.querySelector('.profile-panel')?.getAttribute('data-selected-route-id')).toBe(comparedId);
    expect(screen.getByText(/No confirmed hazard layer is present/)).toBeInTheDocument();
    expect(screen.getByText('Not established')).toBeInTheDocument();
  });
});


describe('terrain source lifecycle', () => {
  it('shows a real-data load failure and requires explicit synthetic selection', async () => {
    render(<App loadScientificTerrain={async () => { throw new Error('Dataset offline'); }} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Dataset offline'));
    expect(screen.queryByRole('application')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic comparison' }));
    expect(screen.getByText('SYNTHETIC FIXTURE')).toBeInTheDocument();
  });
  it('loads a scientific dataset asynchronously without treating provenance as validation', async () => {
    render(<App loadScientificTerrain={async () => ({ ...demoTerrain, id: 'loader-contract-fixture', provenance: 'scientific', title: 'Loader contract fixture' })} />);
    await waitFor(() => expect(screen.getByRole('application')).toBeInTheDocument());
    expect(screen.getAllByText('Loader contract fixture').length).toBeGreaterThan(0);
    expect(screen.getByText('NOT SCIENTIFICALLY VALIDATED')).toBeInTheDocument();
  });
});

import { Activity, ArrowRight, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MissionAnalysis } from '../components/analysis/MissionAnalysis';
import { ElevationProfile } from '../components/charts/ElevationProfile';
import { MissionHeader } from '../components/layout/MissionHeader';
import { MissionConfiguration } from '../components/mission/MissionConfiguration';
import { TerrainViewport } from '../components/map/TerrainViewport';
import { demoRoutePlanner } from '../adapters/demo/demoRoutePlanner';
import { registerScientificRoutePlanner } from '../adapters/scientific/routePlannerSlot';
import { sci02RoutePlanner } from '../adapters/scientific/sci02/sci02RoutePlanner';
import { loadTerrainDataset } from '../adapters/scientific/loadTerrainDataset';
import { demoTerrain } from '../domain/terrain/demoFixture';
import type { RoutePlannerAdapter } from '../domain/routing/types';
import type { TerrainDataset } from '../domain/terrain/types';
import { useMissionController } from '../hooks/useMissionController';
import './app.css';

export interface AppProps {
  terrain?: TerrainDataset;
  routePlanner?: RoutePlannerAdapter;
  scientificRoutePlanner?: RoutePlannerAdapter;
  loadScientificTerrain?: (signal: AbortSignal) => Promise<TerrainDataset>;
}

const loadJezero = (signal: AbortSignal) => loadTerrainDataset(undefined, signal);

export function App({ terrain, routePlanner = demoRoutePlanner, scientificRoutePlanner = sci02RoutePlanner, loadScientificTerrain = loadJezero }: AppProps = {}) {
  const [source, setSource] = useState<'scientific' | 'synthetic'>(terrain?.provenance === 'synthetic' ? 'synthetic' : 'scientific');
  const [loadedTerrain, setLoadedTerrain] = useState<TerrainDataset | null>(terrain ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (source === 'synthetic' || (loadedTerrain && loadedTerrain.provenance !== 'synthetic')) return;
    const controller = new AbortController();
    setLoadError(null);
    void loadScientificTerrain(controller.signal).then(dataset => {
      if (controller.signal.aborted) return;
      if (dataset.provenance !== 'scientific') throw new Error('The real-terrain loader returned a synthetic dataset.');
      setLoadedTerrain(dataset);
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'The real terrain could not be loaded.');
    });
    return () => controller.abort();
  }, [source, loadedTerrain, loadScientificTerrain, attempt]);
  const selectedTerrain = source === 'synthetic' ? (terrain?.provenance === 'synthetic' ? terrain : demoTerrain)
    : loadedTerrain?.provenance === 'scientific' ? loadedTerrain : null;
  return <>
    <div className="terrain-source-bar" role="group" aria-label="Terrain dataset">
      <span>Terrain source</span>
      <button type="button" aria-pressed={source === 'scientific'} onClick={() => setSource('scientific')}>Jezero · HiRISE DEM</button>
      <button type="button" aria-pressed={source === 'synthetic'} onClick={() => setSource('synthetic')}>Synthetic comparison</button>
      <small>{source === 'scientific' ? 'NASA / USGS source · scientific validation pending' : 'Generated fixture · no scientific terrain'}</small>
    </div>
    {selectedTerrain ? <MissionWorkspace key={selectedTerrain.id} terrain={selectedTerrain} routePlanner={routePlanner} scientificRoutePlanner={scientificRoutePlanner} />
      : <main className="terrain-loading-panel" aria-live="polite"><h1>MARS PATHFINDER</h1>{loadError ? <><h2>Jezero terrain could not be loaded</h2><p role="alert">{loadError}</p><button className="button button--primary" onClick={() => setAttempt(value => value + 1)}>Retry terrain load</button><p>The Synthetic comparison option opens the separate development fixture.</p></> : <><h2>Loading real Jezero terrain…</h2><p>Reading the HiRISE elevation grid, validity mask, and source metadata.</p></>}</main>}
  </>;
}

function MissionWorkspace({ terrain, routePlanner, scientificRoutePlanner }: Required<Pick<AppProps, 'terrain' | 'routePlanner' | 'scientificRoutePlanner'>>) {
  const [routingEngine, setRoutingEngine] = useState<'demo' | 'sci02'>(scientificRoutePlanner.provenance === 'scientific' ? 'sci02' : 'demo');
  const sci02Available = scientificRoutePlanner.provenance === 'scientific';
  const selectedRoutePlanner = routingEngine === 'sci02' && sci02Available
    ? registerScientificRoutePlanner(scientificRoutePlanner)
    : routePlanner;
  const controller = useMissionController(terrain, selectedRoutePlanner);
  const [guidedStep, setGuidedStep] = useState<1 | 2 | 3 | null>(null);

  const selectRoutingEngine = (engine: 'demo' | 'sci02') => {
    if (engine === routingEngine || (engine === 'sci02' && !sci02Available)) return;
    controller.invalidateRoute();
    setRoutingEngine(engine);
  };

  const startGuidedDemo = () => {
    controller.resetMission();
    setGuidedStep(1);
  };

  const resetGuidedDemo = () => {
    controller.resetMission();
    setGuidedStep(1);
  };

  const advanceGuidedDemo = async () => {
    if (guidedStep === 1) {
      setGuidedStep(2);
      return;
    }
    if (guidedStep === 2) {
      const result = await controller.calculate(true);
      if (result) setGuidedStep(3);
      return;
    }
    setGuidedStep(null);
  };

  return (
    <div className="app-shell">
      <MissionHeader terrain={terrain} mission={controller.mission} onStartGuidedDemo={startGuidedDemo} />
      {guidedStep !== null && <section className="guided-banner" aria-label={`Guided demo step ${guidedStep} of 3`}>
        <div className="guided-progress" aria-hidden="true"><span className={guidedStep >= 1 ? 'is-current' : ''} /><span className={guidedStep >= 2 ? 'is-current' : ''} /><span className={guidedStep >= 3 ? 'is-current' : ''} /></div>
        <div className="guided-copy" aria-live="polite"><span>GUIDED DEMO · STEP {guidedStep} OF 3</span><b>{guidedStep === 1 ? 'Choose the Habitat and science destination on the map.' : guidedStep === 2 ? 'Compare the returned route candidates and their configured checks.' : 'Review the selected route, time budget and scientific limitations.'}</b></div>
        <button className="guided-reset" type="button" onClick={resetGuidedDemo}><RotateCcw size={14} /> Reset</button>
        <button className="guided-exit" type="button" onClick={() => setGuidedStep(null)}><X size={15} /> Exit</button>
        <button className="button button--primary guided-next" type="button" onClick={() => void advanceGuidedDemo()} disabled={controller.mission.calculationState === 'loading'}>{guidedStep === 1 ? 'Next: compare routes' : guidedStep === 2 ? 'Calculate & review' : 'Finish demo'} <ArrowRight size={15} /></button>
      </section>}
      <main className="workspace-grid">
        <MissionConfiguration controller={controller} terrain={terrain} routingEngine={routingEngine} sci02Available={sci02Available} onRoutingEngineChange={selectRoutingEngine} />
        <TerrainViewport
          terrain={terrain}
          mission={controller.mission}
          onSelectCoordinate={controller.selectMapCoordinate}
          onInspectCoordinate={controller.inspectMapCoordinate}
        />
        <MissionAnalysis controller={controller} terrain={terrain} />
        <ElevationProfile controller={controller} terrain={terrain} />
      </main>
      <footer className="app-footer"><span><i /> MISSION CONTROL READY</span><span>{terrain.provenance === 'synthetic' ? 'SYNTHETIC TERRAIN · ROUTE OUTPUT NOT SCIENTIFICALLY VALIDATED' : 'SCIENTIFIC SOURCE · VALIDATION NOT ESTABLISHED'}</span><span><Activity size={14} /> TECH-01 / INTEGRATION PROTOTYPE</span></footer>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { ArrowDownToLine, Crosshair, MapPin, RotateCcw, Route, Target } from 'lucide-react';
import type { MissionOptimizationMode, SelectionMode } from '../../domain/mission/types';
import { JEZERO_TERRAIN_ID } from '../../domain/terrain/jezeroProjection';
import { JezeroScienceEvidence } from '../science/JezeroScienceEvidence';
import { terrainMissionSites } from '../../hooks/terrainMissionSites';
import type { ProjectedCoordinate, TerrainDataset } from '../../domain/terrain/types';
import type { useMissionController } from '../../hooks/useMissionController';

type Controller = ReturnType<typeof useMissionController>;

function formatCoordinate(coordinate: ProjectedCoordinate) {
  return `${coordinate.x.toFixed(0)} E · ${coordinate.y.toFixed(0)} N m`;
}

export function MissionConfiguration({
  controller,
  terrain,
  routingEngine,
  sci02Available,
  onRoutingEngineChange,
}: {
  controller: Controller;
  terrain: TerrainDataset;
  routingEngine: 'demo' | 'sci02';
  sci02Available: boolean;
  onRoutingEngineChange: (engine: 'demo' | 'sci02') => void;
}) {
  const { mission, constraintErrors, hasInvalidEndpoints, hasConstraintErrors } = controller;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const sites = useMemo(() => terrainMissionSites(terrain), [terrain]);
  const toggleSelection = (mode: Exclude<SelectionMode, null>) => controller.setSelectionMode(mission.selectionMode === mode ? null : mode);
  return (
    <aside className="side-panel mission-config" aria-labelledby="mission-config-title">
      <div className="panel-title-row"><div><span className="section-index">01 / PLAN</span><h1 id="mission-config-title">Mission configuration</h1></div><button className="icon-button" type="button" onClick={controller.resetMission} aria-label="Reset mission" title="Reset mission"><RotateCcw size={15} /></button></div>

      <section className="config-section">
        <div className="section-heading"><span className="step-marker">01</span><h2>Mission profile</h2><span className="section-divider" /></div>
        <label className="field-label" htmlFor="mission-id">Mission identifier</label>
        <input id="mission-id" className="text-input mono" value={mission.missionId} maxLength={20} onChange={event => controller.setMissionId(event.target.value)} />
        <div className="profile-pills"><span><i className="tiny-dot tiny-dot--orange" /> Jezero Crater</span><span>Field EVA</span></div>
        <div className="dataset-line"><span className="dataset-icon"><ArrowDownToLine size={15} /></span><span><small>ACTIVE DATASET</small><b>{terrain.title}</b><small>{terrain.width} × {terrain.height} · {terrain.cellSizeX} m cells</small></span><span className="dataset-state">{terrain.provenance === 'synthetic' ? 'SYNTHETIC' : 'SOURCE'}</span></div>
      </section>

      <section className="config-section">
        <div className="section-heading"><span className="step-marker">02</span><h2>Route configuration</h2><span className="section-divider" /></div>
        <PointSelector icon="habitat" label="Habitat / start" coordinate={mission.habitat} selected={mission.selectionMode === 'habitat'} onSelect={() => toggleSelection('habitat')} />
        <PointSelector icon="destination" label="Science destination" coordinate={mission.destination} selected={mission.selectionMode === 'destination'} onSelect={() => toggleSelection('destination')} name={mission.destinationName} />
        <div className="saved-sites-label">{terrain.provenance === 'synthetic' ? 'DEMO SCIENCE SITES' : 'EXAMPLE PLANNING POINTS · NOT SCIENCE TARGETS'}</div>
        <div className="saved-sites">
          <button className={`site-chip ${mission.destinationName === sites.siteA.name ? 'site-chip--active' : ''}`} type="button" onClick={() => controller.setDestinationFromSite(sites.siteA)}><span>A</span> {terrain.provenance === 'synthetic' ? 'Site A' : 'Point A'}</button>
          <button className={`site-chip ${mission.destinationName === sites.siteB.name ? 'site-chip--active' : ''}`} type="button" onClick={() => controller.setDestinationFromSite(sites.siteB)}><span>B</span> {terrain.provenance === 'synthetic' ? 'Site B' : 'Point B'}</button>
        </div>
        {mission.selectionMode && <div className="selection-prompt" role="status"><Crosshair size={14} /> Click the map to place the {mission.selectionMode}.</div>}
      </section>

      {terrain.id === JEZERO_TERRAIN_ID && terrain.provenance === 'scientific' && <JezeroScienceEvidence />}

      <section className="config-section constraints-section">
        <div className="section-heading"><span className="step-marker">03</span><h2>EVA constraints</h2><span className="section-divider" /></div>
        <ConstraintControl label="Maximum allowed slope" value={mission.constraints.maximumSlopeDeg} min={1} max={45} step={1} suffix="°" error={constraintErrors.maximumSlopeDeg} onChange={value => controller.setConstraint('maximumSlopeDeg', value)} />
        <ConstraintControl label="Assumed walking speed" value={mission.constraints.walkingSpeedKmh} min={0.2} max={6} step={0.1} suffix="km/h" error={constraintErrors.walkingSpeedKmh} onChange={value => controller.setConstraint('walkingSpeedKmh', value)} />
        <ConstraintControl label="Maximum EVA duration" value={mission.constraints.maximumEvaDurationHours} min={1} max={12} step={0.5} suffix="h" error={constraintErrors.maximumEvaDurationHours} onChange={value => controller.setConstraint('maximumEvaDurationHours', value)} />
        {showAdvanced && <>
          <ConstraintControl label="Science activity" value={mission.constraints.scienceActivityMinutes} min={0} max={180} step={5} suffix="min" error={constraintErrors.scienceActivityMinutes} onChange={value => controller.setConstraint('scienceActivityMinutes', value)} />
          <ConstraintControl label="Safety time reserve" value={mission.constraints.safetyReserveMinutes} min={0} max={120} step={5} suffix="min" error={constraintErrors.safetyReserveMinutes} onChange={value => controller.setConstraint('safetyReserveMinutes', value)} />
        </>}
        <button className="text-button advanced-toggle" type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? 'Hide' : 'Show'} activity & reserve <span aria-hidden="true">{showAdvanced ? '−' : '+'}</span></button>
      </section>

      <section className="config-section optimization-section">
        <div className="section-heading"><span className="step-marker">04</span><h2>Route optimization</h2><span className="section-divider" /></div>
        <fieldset className="optimization-options routing-engine-options"><legend>Route-planning engine</legend>
          <label className={`optimization-option ${routingEngine === 'demo' ? 'optimization-option--selected' : ''}`}>
            <input type="radio" name="routing-engine" value="demo" checked={routingEngine === 'demo'} onChange={() => onRoutingEngineChange('demo')} />
            <span className="radio-mark" /><span><b>Demo adapter</b><small>Fixed illustrative routes</small></span>
          </label>
          <label className={`optimization-option ${routingEngine === 'sci02' ? 'optimization-option--selected' : ''} ${!sci02Available ? 'optimization-option--disabled' : ''}`}>
            <input type="radio" name="routing-engine" value="sci02" checked={routingEngine === 'sci02'} disabled={!sci02Available} onChange={() => onRoutingEngineChange('sci02')} />
            <span className="radio-mark" /><span><b>SCI-02 A*</b><small>{sci02Available ? 'Grid search in a Web Worker' : 'Scientific adapter unavailable'}</small></span>
            <span className="pending-tag">{sci02Available ? 'AVAILABLE' : 'UNAVAILABLE'}</span>
          </label>
        </fieldset>
        <fieldset className="optimization-options"><legend className="visually-hidden">Route optimization mode</legend>
          <OptimizationOption value="shortest" selected={mission.optimizationMode} onChange={controller.setOptimizationMode} title="Shortest" caption="Requests distance priority" />
          <OptimizationOption value="risk-aware" selected={mission.optimizationMode} onChange={controller.setOptimizationMode} title="Risk-aware" caption="Requests a terrain-aware path" />
          <div className="optimization-option optimization-option--disabled" aria-disabled="true"><span className="radio-mark" /><span><b>Scientific priority</b><small>Pending SCI-02 adapter</small></span><span className="pending-tag">PENDING</span></div>
        </fieldset>
      </section>

      <div className="config-actions">
        {mission.calculationState === 'loading' ? <button className="button button--primary button--loading" type="button" onClick={controller.cancelCalculation}><span className="spinner" /> Calculating… <span className="cancel-hint">Cancel</span></button> : <button className="button button--primary" type="button" onClick={() => controller.calculate(false)} disabled={hasConstraintErrors || hasInvalidEndpoints}><Route size={16} /> Calculate route <span className="button-shortcut">↵</span></button>}
        <button className="button button--secondary" type="button" onClick={() => controller.calculate(true)} disabled={hasConstraintErrors || hasInvalidEndpoints || mission.calculationState === 'loading'}><Target size={15} /> Compare routes</button>
        {hasInvalidEndpoints && <div className="form-error" role="status">Habitat or destination has no valid terrain sample. Move the point into the DEM coverage.</div>}
        {mission.calculationError && <div className="form-error" role="alert">{mission.calculationError}</div>}
        <p className="demo-note"><span className={`tiny-dot ${routingEngine === 'demo' ? 'tiny-dot--amber' : 'tiny-dot--orange'}`} /> {routingEngine === 'demo' ? 'Demo adapter only · safety model not validated' : 'SCI-02 A* · scientific validation not established'}</p>
      </div>
    </aside>
  );
}

function PointSelector({ icon, label, coordinate, selected, onSelect, name }: { icon: 'habitat' | 'destination'; label: string; coordinate: ProjectedCoordinate; selected: boolean; onSelect: () => void; name?: string }) {
  return <div className={`point-selector ${selected ? 'point-selector--selected' : ''}`}>
    <div className={`point-icon point-icon--${icon}`}>{icon === 'habitat' ? <MapPin size={15} /> : <Target size={15} />}</div>
    <div className="point-copy"><span>{label}</span><b>{name ?? (icon === 'habitat' ? 'Habitat' : 'Custom destination')}</b><small className="mono">{formatCoordinate(coordinate)}</small></div>
    <button className={`map-pick-button ${selected ? 'map-pick-button--active' : ''}`} type="button" onClick={onSelect} aria-pressed={selected}>{selected ? 'Click map' : 'Place on map'}</button>
  </div>;
}

function ConstraintControl({ label, value, min, max, step, suffix, error, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; error: string | null; onChange: (value: number) => void }) {
  const id = `constraint-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`;
  const display = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return <div className={`constraint-control ${error ? 'constraint-control--error' : ''}`}>
    <div className="constraint-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{display}<small> {suffix}</small></output></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} aria-invalid={Boolean(error)} onChange={event => onChange(Number(event.target.value))} />
    <div className="range-ends"><span>{min}{suffix === '°' ? '°' : ''}</span><span>{max} {suffix}</span></div>
    {error && <small className="constraint-error">{error}</small>}
  </div>;
}

function OptimizationOption({ value, selected, onChange, title, caption }: { value: MissionOptimizationMode; selected: MissionOptimizationMode; onChange: (value: MissionOptimizationMode) => void; title: string; caption: string }) {
  return <label className={`optimization-option ${selected === value ? 'optimization-option--selected' : ''}`}>
    <input type="radio" name="optimization-mode" value={value} checked={selected === value} onChange={() => onChange(value)} />
    <span className="radio-mark" /><span><b>{title}</b><small>{caption}</small></span>
  </label>;
}

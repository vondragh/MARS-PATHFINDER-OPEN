import { useEffect, useRef, useState } from 'react';
import { Activity, CircleHelp, Database, Orbit, Play, Radio, X } from 'lucide-react';
import { assessMission } from '../../domain/mission/assessment';
import type { MissionState } from '../../domain/mission/types';
import type { TerrainDataset } from '../../domain/terrain/types';
import { validateTerrainDataset } from '../../domain/terrain/validateDataset';
import { projectedToGeographic, rasterToProjected } from '../../domain/terrain/coordinates';
import { JEZERO_PROJECTION, JEZERO_TERRAIN_ID } from '../../domain/terrain/jezeroProjection';

type InfoPanel = 'help' | 'about' | 'sources' | null;

interface Props {
  terrain: TerrainDataset;
  mission: MissionState;
  onStartGuidedDemo: () => void;
}

export function MissionHeader({ terrain, mission, onStartGuidedDemo }: Props) {
  const [openPanel, setOpenPanel] = useState<InfoPanel>(null);
  const assessment = assessMission(mission);
  const selectedStatus = assessment.selectedRoute?.label ?? 'No route selected';
  const dataStatus = terrain.provenance === 'synthetic' ? 'SYNTHETIC FIXTURE' : 'SCIENTIFIC SOURCE';
  const geographicCenter = terrain.id === JEZERO_TERRAIN_ID ? projectedToGeographic(rasterToProjected(terrain.width / 2, terrain.height / 2, terrain.transform), JEZERO_PROJECTION) : null;
  const planStatus = assessment.planState === 'within-configured-limits' ? 'WITHIN CONFIGURED LIMITS'
    : assessment.planState === 'alternative-available' ? 'ALTERNATIVE AVAILABLE'
      : assessment.planState === 'constraints-exceeded' ? 'LIMITS NOT MET'
        : assessment.planState === 'calculating' ? 'CALCULATING' : 'NOT ASSESSED';

  return (
    <>
      <header className="mission-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Orbit size={20} strokeWidth={1.8} /></div>
          <div className="brand-name"><strong>MARS <span>PATHFINDER</span></strong><small>SCIENTIFIC EVA MISSION PLANNING SYSTEM</small></div>
        </div>
        <div className="mission-context">
          <div className="context-label">ACTIVE REGION</div>
          <div className="region-name">{terrain.provenance === 'synthetic' ? 'Synthetic comparison' : 'Jezero Crater'} <span className="region-coordinates">{geographicCenter ? `${geographicCenter.latitudeDeg.toFixed(4)}° N · ${geographicCenter.longitudeDeg.toFixed(4)}° E` : 'Local metric grid'}</span></div>
        </div>
        <div className="header-statuses" aria-label="Mission and data status">
          <div className="header-status"><span className={`status-dot ${terrain.provenance === 'synthetic' ? 'status-dot--amber' : 'status-dot--muted'}`} /><span><b>{dataStatus}</b><small>{terrain.title}</small></span></div>
          <div className="header-status"><span className="status-dot status-dot--muted" /><span><b>{planStatus}</b><small>{selectedStatus}</small></span></div>
          <div className="header-status header-status--validation"><span className="status-dot status-dot--muted" /><span><b>NOT SCIENTIFICALLY VALIDATED</b><small>Dataset and route model</small></span></div>
        </div>
        <div className="header-actions">
          <button className="guided-demo-button" type="button" onClick={onStartGuidedDemo}><Play size={14} fill="currentColor" /> Guided demo</button>
          <button className="header-icon-button" type="button" onClick={() => setOpenPanel('help')} aria-label="Help"><CircleHelp size={17} /><span>Help</span></button>
          <button className="header-icon-button" type="button" onClick={() => setOpenPanel('sources')} aria-label="Data sources"><Database size={16} /><span>Data sources</span></button>
          <button className="about-button" type="button" onClick={() => setOpenPanel('about')}>About</button>
          <span className="version-tag">v0.1.0</span>
        </div>
      </header>
      {openPanel && <InfoDialog panel={openPanel} terrain={terrain} onClose={() => setOpenPanel(null)} />}
    </>
  );
}

function InfoDialog({ panel, terrain, onClose }: { panel: Exclude<InfoPanel, null>; terrain: TerrainDataset; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const validationIssues = validateTerrainDataset(terrain);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const content = {
    help: {
      eyebrow: 'FIELD GUIDE', title: 'Plan a research EVA scenario',
      body: <ol><li>Choose the real Jezero DEM or the separate synthetic comparison. Use <b>Place on map</b> beside Habitat or Destination, then click inside terrain coverage. Example planning points are not identified science targets.</li><li>Adjust EVA limits, then calculate one route or compare SCI-02 alternatives.</li><li>Review the selected candidate, time budget, terrain warnings and elevation profile. Scientific and operational validation remains pending.</li></ol>,
    },
    about: {
      eyebrow: 'TECH-01 · FRONTEND PROTOTYPE', title: 'MARS PATHFINDER',
      body: <><p>A research-oriented interface prototype for planning and reviewing future Mars surface EVAs.</p><p>SCI-02 A* computes terrain routes; the synthetic Demo adapter is separately selectable. Dataset provenance, route feasibility and EVA budget checks do not establish astronaut safety or scientific validation.</p><div className="dialog-meta"><span><Radio size={14} /> Mission Control</span><span><Activity size={14} /> Integration build 0.1.0</span></div></>,
    },
    sources: {
      eyebrow: 'DATA PROVENANCE', title: 'Terrain source & limitations',
      body: <><div className="source-record"><span className="source-badge">{terrain.provenance === 'synthetic' ? 'SYNTHETIC FIXTURE' : 'SCIENTIFIC SOURCE'}</span><b>{terrain.title}</b><p>{terrain.provenance === 'synthetic' ? `Generated locally by ${terrain.sourceOrganization}. No external Mars DEM is loaded.` : `Source organization: ${terrain.sourceOrganization}.`}</p>{terrain.sourceUrl && <p><a href={terrain.sourceUrl} target="_blank" rel="noreferrer">Open source record</a></p>}<dl className="source-details"><div><dt>Raster</dt><dd>{terrain.width} × {terrain.height} cells · {terrain.cellSizeX} × {terrain.cellSizeY} {terrain.horizontalUnit} nominal spacing</dd></div><div><dt>CRS identifier</dt><dd>{terrain.horizontalCrs}</dd></div><div><dt>CRS definition</dt><dd>{terrain.horizontalCrsDefinition}</dd></div><div><dt>Coordinate transform</dt><dd>{terrain.coordinateTransform.sourceCrs} → {terrain.coordinateTransform.targetCrs}; {terrain.coordinateTransform.method}</dd></div><div><dt>Vertical datum</dt><dd>{terrain.verticalDatum}</dd></div><div><dt>NoData</dt><dd>{terrain.validMask.reduce((sum, valid) => sum + (valid === 0 ? 1 : 0), 0)} cells are invalid and impassable.</dd></div><div><dt>Visual layer</dt><dd>{terrain.imagery?.description ?? 'Elevation colour rendering'}</dd></div><div><dt>Structure checks</dt><dd>{validationIssues.length === 0 ? 'Passed interface checks' : `${validationIssues.length} issue(s)`}</dd></div><div><dt>Scientific validation</dt><dd>Not established by interface checks</dd></div></dl>{validationIssues.length > 0 && <ul className="source-validation-issues">{validationIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div><h3>Known limitations</h3><ul>{terrain.limitations.map((limitation, index) => <li key={`${index}-${limitation}`}>{limitation}</li>)}</ul><p>Route calculations use the selected SCI-02 or Demo adapter. No result here is an operational EVA recommendation.</p><p>Terrain contract: <code>docs/TERRAIN_DATA_CONTRACT.md</code><br />Routing contract: <code>docs/ROUTING_INTEGRATION_CONTRACT.md</code></p></>,
    },
  }[panel];

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title" tabIndex={-1}>
        <div className="dialog-topline"><span>{content.eyebrow}</span><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>
        <h2 id="info-dialog-title">{content.title}</h2>
        <div className="dialog-copy">{content.body}</div>
        <button className="button button--secondary dialog-close" type="button" onClick={onClose}>Close</button>
      </section>
    </div>
  );
}

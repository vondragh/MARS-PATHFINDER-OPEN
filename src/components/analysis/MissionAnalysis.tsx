import { AlertTriangle, Check, Clock3, Compass, Route, ShieldAlert } from 'lucide-react';
import { assessMission } from '../../domain/mission/assessment';
import type { MissionPlanState } from '../../domain/mission/assessment';
import type { RouteCandidate } from '../../domain/routing/types';
import type { TerrainDataset } from '../../domain/terrain/types';
import type { useMissionController } from '../../hooks/useMissionController';

type Controller = ReturnType<typeof useMissionController>;

const distance = (meters: number) => meters >= 1_000 ? `${(meters / 1_000).toFixed(2)} km` : `${Math.round(meters)} m`;
const duration = (minutes: number | null | undefined) => minutes === null || minutes === undefined || !Number.isFinite(minutes) ? 'Unavailable in demo mode' : `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`;
const signedDistance = (meters: number) => `${meters > 0 ? '+' : meters < 0 ? '−' : ''}${distance(Math.abs(meters))}`;
const distanceDifference = (meters: number) => meters === 0 ? 'the same distance as' : `${distance(Math.abs(meters))} ${meters > 0 ? 'longer than' : 'shorter than'}`;

const planLabels: Record<MissionPlanState, string> = {
  'not-calculated': 'Not calculated',
  calculating: 'Calculating',
  'calculation-failed': 'Calculation failed',
  'route-unavailable': 'Selected route unavailable',
  'within-configured-limits': 'Within configured limits',
  'constraints-exceeded': 'Configured limits not met',
  'alternative-available': 'Alternative meets configured checks',
  'cannot-assess': 'Cannot assess all limits',
};

export function MissionAnalysis({ controller, terrain }: { controller: Controller; terrain: TerrainDataset }) {
  const { mission } = controller;
  const assessment = assessMission(mission);
  const route = assessment.selectedRoute;
  const isLoading = mission.calculationState === 'loading';
  const stateClass = assessment.planState === 'within-configured-limits' || assessment.planState === 'alternative-available' ? 'analysis-status--ok'
    : assessment.planState === 'constraints-exceeded' || assessment.planState === 'calculation-failed' ? 'analysis-status--warn' : '';
  const manuallySelected = Boolean(mission.result && route && mission.result.selectedRoute?.id !== route.id);
  const selectedMode = mission.optimizationMode === 'risk-aware' ? 'Risk-aware' : mission.optimizationMode === 'shortest' ? 'Shortest distance' : 'Scientific priority';
  const isSci02 = route?.metadata.adapter === 'SCI-02 A*';
  const fallbackWarning = mission.result?.warnings.find(warning => warning.includes('requested') && warning.includes('shape failed'));
  const dataWarnings = mission.result?.warnings.filter(warning => /No confirmed hazard layer|source affine grid is skewed|NoData cells in the SCI-02 grid/i.test(warning)) ?? [];
  const slope = route?.maximumSlopeDeg;
  const elevationCoverage = route?.riskMetrics?.elevationCoveragePercent;

  return (
    <aside className="side-panel analysis-panel" aria-labelledby="analysis-title" data-selected-route-id={route?.id ?? ''} data-plan-state={assessment.planState}>
      <div className="panel-title-row"><div><span className="section-index">03 / RESULTS</span><h2 id="analysis-title">Mission analysis</h2></div><span className={`analysis-status ${stateClass}`}><span className="status-text">PLAN</span>{planLabels[assessment.planState]}</span></div>

      <section className="plan-assessment" aria-live="polite" aria-label="Mission planning assessment">
        <div className="plan-assessment-heading">
          <span className={`feasibility-icon ${assessment.planState === 'within-configured-limits' || assessment.planState === 'alternative-available' ? 'feasibility-icon--ok' : assessment.planState === 'constraints-exceeded' ? 'feasibility-icon--warn' : ''}`}>
            {assessment.planState === 'within-configured-limits' ? <Check size={17} /> : assessment.planState === 'constraints-exceeded' ? <AlertTriangle size={17} /> : <ShieldAlert size={17} />}
          </span>
          <div><span className="plan-label">OVERALL PLAN STATE</span><b>{isLoading ? 'Calculating route candidates…' : planLabels[assessment.planState]}</b><small>{route ? `Selected: ${route.label}` : 'No route candidate is currently selected'}</small></div>
        </div>
        <div className="assessment-rows">
          <AssessmentRow label="Selected candidate" value={assessment.selectedFeasibility === 'met' ? 'Route checks passed' : assessment.selectedFeasibility === 'exceeded' ? 'Rejected by route checks' : assessment.selectedFeasibility === 'unknown' ? 'Feasibility unavailable' : 'Not assessed'} detail={route?.feasibilityReason ?? (route?.feasible === true ? 'Adapter-reported checks.' : route ? 'Adapter did not report feasibility.' : 'Calculate a route to assess a candidate.')} state={assessment.selectedFeasibility} />
          <AssessmentRow label="EVA time budget" value={assessment.evaBudget.state === 'within' ? `${duration(route?.estimatedEvaDurationMinutes)} · ${Math.round(assessment.evaBudget.remainingMinutes)} min remaining` : assessment.evaBudget.state === 'exceeded' ? `${Math.round(assessment.evaBudget.overByMinutes)} min over configured limit` : assessment.evaBudget.state === 'not-run' ? 'Not calculated' : 'Unavailable in demo mode'} detail={`Configured cap: ${mission.constraints.maximumEvaDurationHours} h.`} state={assessment.evaBudget.state} />
          <AssessmentRow label="Scientific validation" value="Not established" detail={terrain.provenance === 'synthetic' ? 'Synthetic terrain and route; unvalidated.' : 'Scientific source identified; validation pending.'} state="unknown" />
        </div>
      </section>

      {isLoading && <div className="analysis-progress" role="status"><span className="spinner" /> Waiting for the replaceable route adapter…</div>}
      {mission.calculationState === 'error' && mission.calculationError && <div className="analysis-error" role="alert"><AlertTriangle size={14} />{mission.calculationError}</div>}

      <div className="metric-primary">
        <div className="metric-label"><Route size={15} /> SELECTED ROUTE DISTANCE <span>OUT + RETURN</span></div>
        <div className="metric-value mono">{route ? distance(route.totalDistanceM) : 'Unavailable'}<small>{route ? route.label : 'No selected candidate'}</small></div>
        <div className="metric-breakdown"><span>Outbound <b>{route ? distance(route.outbound.distanceM) : 'Unavailable'}</b></span><span>Return <b>{route ? distance(route.return.distanceM) : 'Unavailable'}</b></span></div>
      </div>

      <section className="why-route" aria-labelledby="why-route-title">
        <div className="why-route-heading"><span className="section-index">DECISION TRACE</span><h3 id="why-route-title">Why this route?</h3></div>
        {!route ? <p className="why-route-empty">Calculate a route to see the adapter's choice, candidate checks and assumptions.</p> : <>
          <p className="why-route-summary">{manuallySelected ? `You selected ${route.label} for review.` : fallbackWarning ?? `The adapter returned ${route.label} for ${selectedMode.toLowerCase()} mode.`}</p>
          {dataWarnings.length > 0 && <ul className="route-warning-list" aria-label="Route planning warnings">{dataWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}
          <p className="mode-limitation">{isSci02 ? 'SCI-02 limitation: model assumptions and terrain alignment require scientific review before operational use.' : 'Demo limitation: two fixed illustrative shapes; no terrain-wide path search or scientific optimization.'}</p>
          <details className="why-route-details"><summary>Candidate differences, terrain checks & assumptions</summary>
            <ul className="route-facts">
              {assessment.candidates.filter(candidate => candidate.id !== route.id).map(candidate => <li key={candidate.id}><b>{candidate.label}:</b> {candidate.feasible === true ? 'passes adapter-reported route checks' : candidate.feasible === false ? `rejected${candidate.feasibilityReason ? `: ${candidate.feasibilityReason}` : ''}` : 'feasibility unavailable'}; it is {distanceDifference(candidate.totalDistanceM - route.totalDistanceM)} the selected candidate.</li>)}
              <li><b>Selected sampled slope:</b> {slope === null || slope === undefined || !Number.isFinite(slope) ? 'Unavailable in demo mode.' : `${slope.toFixed(1)}° maximum; configured limit ${mission.constraints.maximumSlopeDeg}°.`}</li>
              <li><b>Selected NoData:</b> {route.terrainWarnings.some(warning => /NoData/i.test(warning)) ? 'Route warning returned by the adapter.' : route.feasible === true ? 'No NoData rejection was reported for this candidate.' : 'Coverage detail unavailable in demo mode.'}</li>
              {route.terrainWarnings.map((warning, index) => <li key={`warning-${index}`}><b>Adapter warning:</b> {warning}</li>)}
            </ul>
            <h4>Adapter assumptions</h4>
            <ul className="route-facts">{route.assumptions.map((assumption, index) => <li key={`candidate-${index}`}>{assumption}</li>)}{mission.result?.modelAssumptions.map((assumption, index) => <li key={`model-${index}`}>{assumption}</li>)}</ul>
          </details>
        </>}
      </section>

      <div className="analysis-metrics">
        <Metric icon={<Clock3 size={15} />} label="Movement time" value={route ? duration(route.estimatedMovementTimeMinutes) : 'Unavailable'} />
        <Metric icon={<Clock3 size={15} />} label="Required EVA incl. reserve" value={route ? duration(route.estimatedEvaDurationMinutes) : 'Unavailable'} />
        <Metric icon={<Compass size={15} />} label="Maximum sampled slope" value={slope === null || slope === undefined || !Number.isFinite(slope) ? 'Unavailable in demo mode' : `${slope.toFixed(1)}°`} />
        <Metric icon={<span className="metric-symbol">%</span>} label="Elevation coverage" value={elevationCoverage === undefined || !Number.isFinite(Number(elevationCoverage)) ? 'Unavailable in demo mode' : `${Number(elevationCoverage).toFixed(0)}%`} />
      </div>

      {assessment.candidates.length > 0 && <section className="comparison-block" aria-label="Route comparison">
        <div className="subsection-heading"><span>ROUTE CANDIDATES</span><small>{assessment.candidates.length} returned</small></div>
        {assessment.candidates.map(candidate => <CandidateButton key={candidate.id} candidate={candidate} selected={candidate.id === route?.id} primary={candidate.id === mission.result?.selectedRoute?.id} onSelect={() => controller.selectRoute(candidate.id)} delta={route && candidate.id !== route.id ? candidate.totalDistanceM - route.totalDistanceM : null} />)}
      </section>}

      {mission.result?.failureReason && <div className="analysis-error" role="status"><AlertTriangle size={14} />{mission.result.failureReason}</div>}
      <div className="analysis-provenance"><span><i className="tiny-dot tiny-dot--amber" /> {terrain.provenance === 'synthetic' ? 'SYNTHETIC TERRAIN' : 'SCIENTIFIC SOURCE'}</span><small>{route?.metadata.adapter ?? 'No route output'}</small><p>Route metrics follow the explicitly selected candidate. Neither source nor route is scientifically validated by this interface.</p></div>
    </aside>
  );
}

function AssessmentRow({ label, value, detail, state }: { label: string; value: string; detail: string; state: string }) {
  return <div className="assessment-row" data-state={state}><span className="assessment-state-mark" aria-hidden="true">{state === 'met' || state === 'within' ? '✓' : state === 'exceeded' ? '!' : '—'}</span><span className="assessment-copy"><small>{label}</small><b>{value}</b><span>{detail}</span></span></div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="analysis-metric"><span className="analysis-metric-icon">{icon}</span><span className="analysis-metric-copy"><small>{label}</small><b>{value}</b></span></div>;
}

function CandidateButton({ candidate, selected, primary, onSelect, delta }: { candidate: RouteCandidate; selected: boolean; primary: boolean; onSelect: () => void; delta: number | null }) {
  const status = candidate.feasible === true ? 'Checks passed' : candidate.feasible === false ? 'Rejected' : 'Feasibility unavailable';
  return <button className={`comparison-option ${selected ? 'comparison-option--selected' : ''} ${candidate.feasible === false ? 'comparison-option--rejected' : ''}`} type="button" key={candidate.id} aria-pressed={selected} data-route-id={candidate.id} onClick={onSelect}>
    <span className={`comparison-route-mark ${primary ? 'comparison-route-mark--primary' : ''}`} aria-hidden="true">{selected ? '●' : candidate.feasible === false ? '×' : '○'}</span>
    <span className="comparison-route-copy"><b>{candidate.label}{selected ? ' · Selected' : ''}{primary && !selected ? ' · Adapter default' : ''}</b><small>{status}{candidate.feasibilityReason ? ` · ${candidate.feasibilityReason}` : ''}</small></span>
    <span className="candidate-distance"><strong className="mono">{distance(candidate.totalDistanceM)}</strong>{delta !== null && <small>{signedDistance(delta)}</small>}</span>
  </button>;
}

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getSelectedRoute } from '../../domain/mission/assessment';
import type { RouteCandidate } from '../../domain/routing/types';
import type { TerrainDataset } from '../../domain/terrain/types';
import type { useMissionController } from '../../hooks/useMissionController';

type Controller = ReturnType<typeof useMissionController>;
const CHART_WIDTH = 620;
const CHART_HEIGHT = 142;
const PADDING = { left: 42, right: 14, top: 14, bottom: 24 };

export function ElevationProfile({ controller, terrain }: { controller: Controller; terrain: TerrainDataset }) {
  const { mission } = controller;
  const [expanded, setExpanded] = useState(() => typeof window === 'undefined' || window.innerHeight > 760);
  const route = getSelectedRoute(mission);
  const profile = route?.elevationProfile ?? [];
  const valid = profile.filter(sample => sample.elevationM !== null);
  const minElevation = valid.length ? Math.min(...valid.map(sample => sample.elevationM as number)) : null;
  const maxElevation = valid.length ? Math.max(...valid.map(sample => sample.elevationM as number)) : null;
  const maxDistance = profile.at(-1)?.distanceM ?? 0;
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const path = profile.reduce((result, sample) => {
    if (sample.elevationM === null || minElevation === null || maxElevation === null) return { d: result.d, drawing: false };
    const x = PADDING.left + (maxDistance > 0 ? sample.distanceM / maxDistance : 0) * plotWidth;
    const range = Math.max(maxElevation - minElevation, 1);
    const y = PADDING.top + (1 - (sample.elevationM - minElevation) / range) * plotHeight;
    return { d: `${result.d}${result.d ? ' ' : ''}${result.drawing ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`, drawing: true };
  }, { d: '', drawing: false }).d;
  const cursorX = maxDistance > 0 ? PADDING.left + mission.profileDistanceM / maxDistance * plotWidth : PADDING.left;
  const showValues = Boolean(route && valid.length);
  const sourceLabel = terrain.provenance === 'synthetic' ? 'Synthetic terrain samples' : 'Terrain samples returned by route adapter';

  return (
    <section className={`profile-panel ${expanded ? '' : 'profile-panel--collapsed'}`} aria-labelledby="profile-title" data-selected-route-id={route?.id ?? ''}>
      <div className="profile-heading">
        <div><span className="section-index">04 / ELEVATION</span><h2 id="profile-title">Terrain profile <span>OUTBOUND + RETURN</span></h2></div>
        <div className="profile-summary"><span><i className="profile-key" /> {route?.label ?? 'No selected route'}</span>{showValues && <><span>MIN <b>{minElevation?.toFixed(0)} m</b></span><span>MAX <b>{maxElevation?.toFixed(0)} m</b></span></>}<button className="profile-toggle" type="button" aria-expanded={expanded} aria-controls="profile-content" aria-label={`${expanded ? 'Collapse' : 'Expand'} terrain profile`} onClick={() => setExpanded(value => !value)}><ChevronDown className="profile-chevron" size={17} aria-hidden="true" /></button></div>
      </div>
      <div className="profile-content" id="profile-content" hidden={!expanded}>
        {profile.length > 1 && maxDistance > 0 ? <>
          <div className="profile-chart-wrap">
            <svg className="profile-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${terrain.provenance === 'synthetic' ? 'Synthetic' : 'Adapter-returned'} terrain profile for ${route?.label ?? 'selected route'} with ${valid.length} elevation samples and ${profile.length - valid.length} NoData samples`}>
              {[0, 0.5, 1].map((ratio, index) => {
                const y = PADDING.top + ratio * plotHeight;
                const elevation = maxElevation !== null && minElevation !== null ? maxElevation - ratio * Math.max(maxElevation - minElevation, 1) : null;
                return <g key={index}><line className="profile-grid" x1={PADDING.left} y1={y} x2={CHART_WIDTH - PADDING.right} y2={y} />{elevation !== null && <text className="profile-axis-label" x={PADDING.left - 8} y={y + 3} textAnchor="end">{elevation.toFixed(0)}</text>}</g>;
              })}
              <line className="profile-axis" x1={PADDING.left} y1={PADDING.top + plotHeight} x2={CHART_WIDTH - PADDING.right} y2={PADDING.top + plotHeight} />
              {path && <path className="profile-line" d={path} />}
              {showValues && <><line className="profile-cursor" x1={cursorX} y1={PADDING.top} x2={cursorX} y2={PADDING.top + plotHeight} /><circle className="profile-cursor-dot" cx={cursorX} cy={cursorY(profile, mission.profileDistanceM, minElevation, maxElevation)} r="4" /></>}
              <text className="profile-axis-label" x={PADDING.left} y={CHART_HEIGHT - 5}>0</text><text className="profile-axis-label" x={CHART_WIDTH - PADDING.right} y={CHART_HEIGHT - 5} textAnchor="end">{(maxDistance / 1_000).toFixed(2)} km</text>
            </svg>
          </div>
          <div className="profile-slider-row"><label htmlFor="profile-position">Route position</label><input id="profile-position" type="range" min="0" max={maxDistance} step={Math.max(1, maxDistance / 300)} value={Math.min(mission.profileDistanceM, maxDistance)} onChange={event => controller.setProfileDistance(Number(event.target.value))} /><output htmlFor="profile-position">{(mission.profileDistanceM / 1_000).toFixed(2)} km</output></div>
        </> : <div className="profile-empty"><p>{mission.calculationState === 'loading' ? 'Waiting for adapter response…' : 'Calculate and select a route to inspect its elevation profile.'}</p><span>Elevation values are unavailable until route samples are returned.</span></div>}
        <div className="profile-footer"><span><i className={`tiny-dot ${terrain.provenance === 'synthetic' ? 'tiny-dot--amber' : 'tiny-dot--orange'}`} /> {sourceLabel}</span><span>Profile and route position follow the selected candidate · Elevation in meters</span></div>
      </div>
    </section>
  );
}

function cursorY(profile: RouteCandidate['elevationProfile'], distanceM: number, minElevation: number | null, maxElevation: number | null) {
  if (minElevation === null || maxElevation === null || !profile.length) return PADDING.top + (CHART_HEIGHT - PADDING.top - PADDING.bottom) / 2;
  const sample = profile.reduce((best, current) => Math.abs(current.distanceM - distanceM) < Math.abs(best.distanceM - distanceM) ? current : best, profile[0]);
  if (sample.elevationM === null) return PADDING.top + (CHART_HEIGHT - PADDING.top - PADDING.bottom) / 2;
  return PADDING.top + (1 - (sample.elevationM - minElevation) / Math.max(maxElevation - minElevation, 1)) * (CHART_HEIGHT - PADDING.top - PADDING.bottom);
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Layers3, Minus, Plus, RotateCcw, ScanSearch } from 'lucide-react';
import { assessMission } from '../../domain/mission/assessment';
import type { MissionState } from '../../domain/mission/types';
import type { RouteCandidate } from '../../domain/routing/types';
import { projectedToGeographic, sampleTerrain } from '../../domain/terrain/coordinates';
import { demoSites } from '../../domain/terrain/demoFixture';
import { JEZERO_PROJECTION, JEZERO_TERRAIN_ID } from '../../domain/terrain/jezeroProjection';
import type { ProjectedCoordinate, TerrainDataset, TerrainSample } from '../../domain/terrain/types';

interface ViewBox { x: number; y: number; width: number; height: number }
interface TerrainBounds { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number }

interface Props {
  terrain: TerrainDataset;
  mission: MissionState;
  onSelectCoordinate: (coordinate: ProjectedCoordinate) => void;
  onInspectCoordinate: (coordinate: ProjectedCoordinate) => void;
}

function getTerrainBounds(terrain: TerrainDataset): TerrainBounds {
  const [x0, a, b, y0, d, e] = terrain.transform.coefficients;
  const corners = [
    { x: x0, y: y0 },
    { x: x0 + terrain.width * a, y: y0 + terrain.width * d },
    { x: x0 + terrain.height * b, y: y0 + terrain.height * e },
    { x: x0 + terrain.width * a + terrain.height * b, y: y0 + terrain.width * d + terrain.height * e },
  ];
  const xs = corners.map(point => point.x);
  const ys = corners.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}

/** SVG pixels use downward y, while the projected CRS uses northward y. */
export function terrainImageMatrix(terrain: TerrainDataset) {
  const bounds = getTerrainBounds(terrain);
  const [x0, a, b, y0, d, e] = terrain.transform.coefficients;
  return `matrix(${a} ${-d} ${b} ${-e} ${x0 - bounds.minX} ${bounds.maxY - y0})`;
}

const ELEVATION_PALETTE = ['#302c27', '#443a30', '#584536', '#704d38', '#895b3d', '#a06e48', '#b47f55'];

function toSvgPoint(coordinate: ProjectedCoordinate, bounds: TerrainBounds) {
  return { x: coordinate.x - bounds.minX, y: bounds.maxY - coordinate.y };
}

function routePoints(leg: RouteCandidate['outbound'], bounds: TerrainBounds) {
  return leg.coordinates.map(coordinate => {
    const point = toSvgPoint(coordinate, bounds);
    return `${point.x},${point.y}`;
  }).join(' ');
}

function distanceLabel(value: number) {
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)} km`;
  return `${Math.round(value / 10) * 10} m`;
}

function gridInterval(span: number) {
  const rough = span / 6;
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const normalized = rough / power;
  return (normalized < 2 ? 1 : normalized < 5 ? 2 : 5) * power;
}

export function TerrainViewport({ terrain, mission, onSelectCoordinate, onInspectCoordinate }: Props) {
  const bounds = useMemo(() => getTerrainBounds(terrain), [terrain]);
  const [view, setView] = useState<ViewBox>(() => ({ x: 0, y: 0, width: bounds.width, height: bounds.height }));
  const [showTerrain, setShowTerrain] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [hoverSample, setHoverSample] = useState<{ coordinate: ProjectedCoordinate; sample: TerrainSample } | null>(null);
  const [keyboardCursor, setKeyboardCursor] = useState<ProjectedCoordinate>(() => ({ x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 }));
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef<{ x: number; y: number; view: ViewBox } | null>(null);
  const didDrag = useRef(false);
  const assessment = assessMission(mission);
  const route = assessment.selectedRoute;
  const routes = assessment.candidates;
  const synthetic = terrain.provenance === 'synthetic';

  useEffect(() => {
    if (mission.selectionMode) svgRef.current?.focus();
  }, [mission.selectionMode]);

  useEffect(() => {
    const measure = () => setPixelsPerMeter(Math.abs(svgRef.current?.getScreenCTM?.()?.a ?? 0));
    measure();
    if (typeof ResizeObserver === 'undefined' || !svgRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, [view]);

  const elevationRange = useMemo(() => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < terrain.elevationMeters.length; index += 1) {
      if (terrain.validMask[index] === 0 || !Number.isFinite(terrain.elevationMeters[index])) continue;
      minimum = Math.min(minimum, terrain.elevationMeters[index]);
      maximum = Math.max(maximum, terrain.elevationMeters[index]);
    }
    return Number.isFinite(minimum) ? { minimum, maximum } : { minimum: null, maximum: null };
  }, [terrain]);

  const terrainCells = useMemo(() => {
    // Full-resolution scientific imagery is one affine-aligned raster node.
    // Never create hundreds of thousands of interactive SVG polygons.
    if (terrain.imagery || terrain.width * terrain.height > 10_000) return [];
    const [x0, pixelX, pixelRowX, y0, pixelColY, pixelY] = terrain.transform.coefficients;
    const minimum = elevationRange.minimum ?? 0;
    const range = Math.max((elevationRange.maximum ?? 1) - minimum, 1);
    const cells = [];
    for (let row = 0; row < terrain.height; row += 1) {
      for (let column = 0; column < terrain.width; column += 1) {
        const index = row * terrain.width + column;
        const corners = [
          { x: x0 + column * pixelX + row * pixelRowX, y: y0 + column * pixelColY + row * pixelY },
          { x: x0 + (column + 1) * pixelX + row * pixelRowX, y: y0 + (column + 1) * pixelColY + row * pixelY },
          { x: x0 + (column + 1) * pixelX + (row + 1) * pixelRowX, y: y0 + (column + 1) * pixelColY + (row + 1) * pixelY },
          { x: x0 + column * pixelX + (row + 1) * pixelRowX, y: y0 + column * pixelColY + (row + 1) * pixelY },
        ];
        const points = corners.map(point => {
          const local = toSvgPoint(point, bounds);
          return `${local.x},${local.y}`;
        }).join(' ');
        const nodata = terrain.validMask[index] === 0;
        const paletteIndex = Math.min(ELEVATION_PALETTE.length - 1, Math.floor((terrain.elevationMeters[index] - minimum) / range * ELEVATION_PALETTE.length));
        cells.push({ index, points, nodata, color: nodata ? '#54463a' : ELEVATION_PALETTE[Math.max(0, paletteIndex)] });
      }
    }
    return cells;
  }, [terrain, bounds, elevationRange]);

  const cursorCoordinate = route?.elevationProfile.length
    ? route.elevationProfile.reduce((best, sample) => Math.abs(sample.distanceM - mission.profileDistanceM) < Math.abs(best.distanceM - mission.profileDistanceM) ? sample : best, route.elevationProfile[0]).coordinate
    : null;

  const eventToCoordinate = useCallback((event: React.PointerEvent<SVGSVGElement>): ProjectedCoordinate => {
    const svg = svgRef.current;
    const transform = svg?.getScreenCTM();
    if (!svg || !transform) return { x: bounds.minX, y: bounds.minY };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(transform.inverse());
    return { x: local.x + bounds.minX, y: bounds.maxY - local.y };
  }, [bounds]);

  const resetView = useCallback(() => setView({ x: 0, y: 0, width: bounds.width, height: bounds.height }), [bounds]);

  const zoomAt = useCallback((factor: number, clientPoint?: { x: number; y: number }) => {
    setView(current => {
      const nextWidth = Math.min(bounds.width, Math.max(Math.min(terrain.cellSizeX * 2, bounds.width), current.width * factor));
      const nextHeight = Math.min(bounds.height, Math.max(Math.min(terrain.cellSizeY * 2, bounds.height), current.height * factor));
      let anchorX = current.x + current.width / 2;
      let anchorY = current.y + current.height / 2;
      if (clientPoint && svgRef.current) {
        const matrix = svgRef.current.getScreenCTM();
        if (matrix) {
          const point = svgRef.current.createSVGPoint();
          point.x = clientPoint.x;
          point.y = clientPoint.y;
          const local = point.matrixTransform(matrix.inverse());
          anchorX = local.x;
          anchorY = local.y;
        }
      }
      const relativeX = (anchorX - current.x) / current.width;
      const relativeY = (anchorY - current.y) / current.height;
      const x = Math.max(0, Math.min(bounds.width - nextWidth, anchorX - relativeX * nextWidth));
      const y = Math.max(0, Math.min(bounds.height - nextHeight, anchorY - relativeY * nextHeight));
      return { x, y, width: nextWidth, height: nextHeight };
    });
  }, [bounds, terrain.cellSizeX, terrain.cellSizeY]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragStart.current = { x: event.clientX, y: event.clientY, view };
    didDrag.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragStart.current) {
      const deltaX = event.clientX - dragStart.current.x;
      const deltaY = event.clientY - dragStart.current.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) didDrag.current = true;
      if (didDrag.current) {
        const rect = event.currentTarget.getBoundingClientRect();
        const dx = deltaX * dragStart.current.view.width / Math.max(rect.width, 1);
        const dy = deltaY * dragStart.current.view.height / Math.max(rect.height, 1);
        setView({ ...dragStart.current.view, x: Math.max(0, Math.min(bounds.width - view.width, dragStart.current.view.x - dx)), y: Math.max(0, Math.min(bounds.height - view.height, dragStart.current.view.y - dy)) });
      }
      return;
    }
    const coordinate = eventToCoordinate(event);
    setHoverSample({ coordinate, sample: sampleTerrain(terrain, coordinate) });
    setKeyboardCursor(coordinate);
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragStart.current && !didDrag.current) {
      const coordinate = eventToCoordinate(event);
      if (mission.selectionMode) onSelectCoordinate(coordinate);
      else onInspectCoordinate(coordinate);
    }
    dragStart.current = null;
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(0.8); return; }
    if (event.key === '-') { event.preventDefault(); zoomAt(1.25); return; }
    if (event.key === '0') { resetView(); return; }
    const step = Math.max(terrain.cellSizeX, terrain.cellSizeY) * 2;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (moves[event.key]) {
      event.preventDefault();
      setKeyboardCursor(current => ({ x: Math.max(bounds.minX, Math.min(bounds.maxX, current.x + moves[event.key][0])), y: Math.max(bounds.minY, Math.min(bounds.maxY, current.y + moves[event.key][1])) }));
    }
    if (event.key === 'Enter' && mission.selectionMode) onSelectCoordinate(keyboardCursor);
    if (event.key === 'Enter' && !mission.selectionMode) onInspectCoordinate(keyboardCursor);
  };

  const gridLines = [];
  const xGridStep = gridInterval(bounds.width);
  const yGridStep = gridInterval(bounds.height);
  for (let x = 0; x <= bounds.width; x += xGridStep) gridLines.push(<line key={`x${x}`} className="map-grid-line" x1={x} y1="0" x2={x} y2={bounds.height} />);
  for (let y = 0; y <= bounds.height; y += yGridStep) gridLines.push(<line key={`y${y}`} className="map-grid-line" x1="0" y1={y} x2={bounds.width} y2={y} />);

  const currentInspection = hoverSample ?? (mission.inspectedTerrain ? { coordinate: mission.inspectedTerrain.coordinate, sample: mission.inspectedTerrain } : null);
  const geographical = currentInspection ? synthetic ? projectedToGeographic(currentInspection.coordinate)
    : terrain.id === JEZERO_TERRAIN_ID ? projectedToGeographic(currentInspection.coordinate, JEZERO_PROJECTION) : null : null;
  const localInspection = currentInspection ? toSvgPoint(currentInspection.coordinate, bounds) : null;
  const hasNoData = terrain.validMask.some(value => value === 0);
  const elevationMin = elevationRange.minimum;
  const elevationMax = elevationRange.maximum;
  const featureToLocal = (coordinate: ProjectedCoordinate) => toSvgPoint(coordinate, bounds);
  const siteB = featureToLocal({ x: demoSites.siteB.x, y: demoSites.siteB.y });
  const habitat = featureToLocal(mission.habitat);
  const destination = featureToLocal(mission.destination);

  return (
    <section className="map-panel" aria-labelledby="terrain-title" data-selected-route-id={route?.id ?? ''}>
      <div className="map-panel-header">
        <div><span className="section-index">02 / TERRAIN VIEW</span><h2 id="terrain-title">Terrain coverage</h2></div>
        <div className="map-heading-meta"><span className="map-crs" title={terrain.horizontalCrsDefinition}>LOCAL METRIC GRID · {terrain.horizontalCrs}</span><span className="map-live-indicator"><i /> INTERACTIVE MAP</span></div>
      </div>
      <div className={`map-stage ${mission.selectionMode ? 'map-stage--selecting' : ''}`}>
        <svg
          ref={svgRef}
          className="terrain-svg"
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="application"
          aria-label={`Interactive terrain map, ${terrain.width} by ${terrain.height} cells. Drag to pan; use plus and minus buttons or keyboard plus and minus to zoom. Arrow keys move the cursor; Enter inspects or places a point.`}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragStart.current = null; }}
          onPointerLeave={() => setHoverSample(null)}
          onWheel={event => { event.preventDefault(); zoomAt(event.deltaY < 0 ? 0.86 : 1.16, { x: event.clientX, y: event.clientY }); }}
          onKeyDown={handleKeyDown}
        >
          <defs>
            <pattern id="nodata-hatch" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="32" height="32" fill="#332a24" />
              <line x1="0" y1="0" x2="0" y2="32" stroke="#bb8351" strokeWidth="5" strokeOpacity=".36" />
            </pattern>
            <radialGradient id="map-vignette"><stop offset="55%" stopColor="#0c1011" stopOpacity="0" /><stop offset="100%" stopColor="#080b0c" stopOpacity=".45" /></radialGradient>
          </defs>
          <rect x="0" y="0" width={bounds.width} height={bounds.height} fill="#302b26" />
          {showTerrain && <g className="terrain-raster" aria-label={`${synthetic ? 'Synthetic' : 'Scientific'} elevation raster`}>
            {terrain.imagery ? <image href={terrain.imagery.assetUrl} width={terrain.width} height={terrain.height} transform={terrainImageMatrix(terrain)} preserveAspectRatio="none" onError={() => setImageFailed(true)} onLoad={() => setImageFailed(false)} aria-label={terrain.imagery.description} />
              : terrainCells.map(cell => <polygon key={cell.index} points={cell.points} fill={cell.nodata ? 'url(#nodata-hatch)' : cell.color} />)}
          </g>}
          <rect x="0" y="0" width={bounds.width} height={bounds.height} fill="url(#map-vignette)" pointerEvents="none" />
          {showGrid && <g className="map-grid" pointerEvents="none">{gridLines}</g>}
          <g className="map-labels" pointerEvents="none">
            <text x={20} y={28}>LOCAL NORTH ↑</text><text x={bounds.width - 20} y={bounds.height - 24} textAnchor="end">LOCAL EAST →</text>
            {synthetic && <><text x={featureToLocal({ x: 1_150, y: 2_050 }).x} y={featureToLocal({ x: 1_150, y: 2_050 }).y} className="terrain-feature-label">SYNTHETIC NODATA PATCH</text><text x={featureToLocal({ x: 1_830, y: 1_080 }).x} y={featureToLocal({ x: 1_830, y: 1_080 }).y} className="terrain-feature-label">SYNTHETIC RIDGE</text></>}
          </g>
          {synthetic && <g className="site-marker site-marker--secondary" transform={`translate(${siteB.x} ${siteB.y})`} pointerEvents="none"><circle r="19" /><circle r="6" /><text x="24" y="4">SITE B</text></g>}
          {routes.map(candidate => {
            const selected = candidate.id === route?.id;
            const routeState = candidate.feasible === true ? 'feasible' : candidate.feasible === false ? 'rejected' : 'unknown';
            return <g key={candidate.id} data-route-id={candidate.id} data-selected={selected} className={`route-overlay route-overlay--${selected ? 'selected' : 'alternative'} route-overlay--${routeState}`} pointerEvents="none">
              <polyline points={routePoints(candidate.outbound, bounds)} />
              <polyline className="route-return-line" points={routePoints(candidate.return, bounds)} />
              {selected && candidate.outbound.coordinates.length > 1 && <text x={featureToLocal(candidate.outbound.coordinates[Math.floor(candidate.outbound.coordinates.length / 2)]).x} y={featureToLocal(candidate.outbound.coordinates[Math.floor(candidate.outbound.coordinates.length / 2)]).y - 20}>{candidate.label.toUpperCase()} · {selected ? 'SELECTED' : 'ALTERNATIVE'} · {routeState === 'rejected' ? 'REJECTED' : routeState === 'unknown' ? 'UNASSESSED' : 'CHECKS PASSED'}</text>}
            </g>;
          })}
          <g className="site-marker site-marker--habitat" transform={`translate(${habitat.x} ${habitat.y})`} pointerEvents="none"><circle className="marker-ring" r="25" /><path d="M0 -11 L9 -3 L9 9 L-9 9 L-9 -3 Z" /><text x="32" y="4">HABITAT</text></g>
          <g className="site-marker site-marker--destination" transform={`translate(${destination.x} ${destination.y})`} pointerEvents="none"><circle className="marker-ring" r="23" /><circle r="9" /><text x="30" y="4">{mission.destinationName.toUpperCase()}</text></g>
          {cursorCoordinate && <g className="profile-position-marker" transform={`translate(${featureToLocal(cursorCoordinate).x} ${featureToLocal(cursorCoordinate).y})`} pointerEvents="none"><circle r="13" /><circle r="4" /></g>}
          {mission.selectionMode && <g className="keyboard-cursor" transform={`translate(${featureToLocal(keyboardCursor).x} ${featureToLocal(keyboardCursor).y})`} pointerEvents="none"><circle r="34" /><path d="M-44 0 H44 M0 -44 V44" /></g>}
        </svg>
        <div className="map-top-tools">
          <div className="layer-menu" role="group" aria-label="Map layers">
            <button type="button" className={`layer-toggle ${showTerrain ? 'layer-toggle--active' : ''}`} aria-pressed={showTerrain} onClick={() => setShowTerrain(value => !value)}><Layers3 size={16} /> {terrain.imagery ? 'Surface layer' : 'Elevation'}</button>
            <span className="layer-unavailable" title="Contour data is not part of the terrain contract">Contours unavailable</span>
            <button type="button" className={`layer-toggle ${showGrid ? 'layer-toggle--active' : ''}`} aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}>Grid</button>
          </div>
          <div className="zoom-tools" role="group" aria-label="Map zoom">
            <button type="button" onClick={() => zoomAt(0.8)} aria-label="Zoom in"><Plus size={17} /></button>
            <span>{Math.round(bounds.width / view.width * 100)}%</span>
            <button type="button" onClick={() => zoomAt(1.25)} aria-label="Zoom out"><Minus size={17} /></button>
            <button type="button" onClick={resetView} aria-label="Reset map view"><RotateCcw size={15} /></button>
          </div>
        </div>
        {mission.selectionMode && <div className="map-select-banner" role="status"><Crosshair size={16} /> SELECT {mission.selectionMode.toUpperCase()} LOCATION <span>Click map · arrows + Enter also work</span></div>}
        {currentInspection && localInspection && <div className="map-inspector" aria-live="polite">
          <div className="inspector-heading"><ScanSearch size={15} /> TERRAIN INSPECTOR</div>
          <div className="inspector-values"><span>{currentInspection.sample.status === 'available' ? `${currentInspection.sample.elevationM.toFixed(1)} m` : currentInspection.sample.status === 'nodata' ? 'NoData' : 'Outside grid'}</span>{geographical && <small>{Math.abs(geographical.latitudeDeg).toFixed(4)}° {geographical.latitudeDeg < 0 ? 'S' : 'N'} · {Math.abs(geographical.longitudeDeg).toFixed(4)}° {geographical.longitudeDeg < 0 ? 'W' : 'E'}</small>}</div>
          <small className="inspector-crs mono">X {currentInspection.coordinate.x.toFixed(1)} · Y {currentInspection.coordinate.y.toFixed(1)} {terrain.horizontalUnit} · cell {currentInspection.sample.status === 'out-of-bounds' ? 'outside grid' : `${currentInspection.sample.cell.row + 1}, ${currentInspection.sample.cell.column + 1}`}</small>
        </div>}
        <div className="map-legend" aria-label="Map legend">
          {elevationMin !== null && elevationMax !== null && <span className="legend-item"><i className="legend-elevation" /> Elevation {elevationMin.toFixed(0)}–{elevationMax.toFixed(0)} m</span>}
          {routes.length > 0 && <><span className="legend-item"><i className="legend-route" /> Selected</span><span className="legend-item"><i className="legend-alt" /> Alternative</span><span className="legend-item"><i className="legend-rejected" /> Rejected</span></>}
          {hasNoData && <span className="legend-item"><i className="legend-mask" /> NoData</span>}
        </div>
        <div className="map-scale"><span style={{ width: '84px' }} />{pixelsPerMeter > 0 ? distanceLabel(84 / pixelsPerMeter) : 'Measuring scale…'}</div>
        <div className="map-disclaimer">{synthetic ? 'SYNTHETIC ELEVATION · NO AUTHENTIC MARS IMAGERY' : terrain.imagery ? 'REAL DEM · ALIGNED SURFACE IMAGE · NOT A HAZARD MAP' : 'REAL DEM · NO VISUAL LAYER'}</div>
        {(imageFailed || (!terrain.imagery && !terrainCells.length)) && <div className="map-layer-error" role="alert">Surface visualization unavailable. DEM sampling and route coordinates remain available.</div>}
      </div>
      <div className="map-footer"><span><i className={`status-dot ${synthetic ? 'status-dot--amber' : 'status-dot--muted'}`} /> {synthetic ? 'Synthetic' : 'Source'} raster · {terrain.width} × {terrain.height} · {terrain.cellSizeX} × {terrain.cellSizeY} m</span><span>Drag to pan · wheel or +/− to zoom · click to inspect; use Place on map to set points</span><span className="map-footer-coords">{hoverSample ? `E ${hoverSample.coordinate.x.toFixed(0)} · N ${hoverSample.coordinate.y.toFixed(0)} m` : 'Click map to inspect elevation'}</span></div>
    </section>
  );
}

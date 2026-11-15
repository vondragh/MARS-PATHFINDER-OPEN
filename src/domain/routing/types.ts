import type { ProjectedCoordinate, TerrainDataset } from '../terrain/types';

export type OptimizationMode = 'shortest' | 'riskAware';
export type CalculationStatus = 'success' | 'infeasible' | 'failed';
export type RouteFailureCode = 'invalid-input' | 'start-out-of-bounds' | 'destination-out-of-bounds' | 'nodata-endpoint' | 'no-feasible-route' | 'unsupported-mode' | 'cancelled' | 'calculation-error';

/** SCI-02 cell coordinates are zero-based and use row/col names from its task brief. */
export interface RouteCellIndex {
  row: number;
  col: number;
}

export interface RouteEndpoint {
  id: string;
  coordinate: ProjectedCoordinate;
  cell: RouteCellIndex;
}

/** Hard routing limits supplied by the mission configuration. */
export interface RouteConstraints {
  maxSlopeDeg: number;
  /** NoData cells must never be interpreted as traversable or interpolated. */
  noDataPolicy: 'reject-route';
}

/** Transparent operational assumptions; the scientific module must state how it applies them. */
export interface EvaAssumptions {
  walkingSpeedMps: number;
  evaTimeLimitMinutes: number;
  scienceActivityMinutes: number;
  safetyReserveMinutes: number;
}

export interface RoutePlannerInput {
  /** Unique per calculation; echoed unchanged by the adapter. */
  requestId: string;
  terrain: TerrainDataset;
  start: RouteEndpoint;
  destination: RouteEndpoint;
  waypoints: RouteEndpoint[];
  constraints: RouteConstraints;
  evaAssumptions: EvaAssumptions;
  optimizationMode: OptimizationMode;
  returnToHabitat: true;
  includeAlternatives: boolean;
}

export interface ElevationProfileSample {
  /** Cumulative meters from the habitat, including the outbound and return legs. */
  distanceM: number;
  leg: 'outbound' | 'return';
  coordinate: ProjectedCoordinate;
  cell: RouteCellIndex;
  /** Null only when the raster sample is NoData; never interpolate it silently. */
  elevationM: number | null;
}

export interface RouteLeg {
  start: RouteEndpoint;
  end: RouteEndpoint;
  /** Projected local-metric coordinates in travel order. */
  coordinates: ProjectedCoordinate[];
  /** Row/column cells visited by this leg in travel order. */
  traversedCells: RouteCellIndex[];
  distanceM: number;
}

export interface RouteCandidate {
  id: string;
  label: string;
  feasible: boolean | null;
  feasibilityReason?: string;
  outbound: RouteLeg;
  return: RouteLeg;
  totalDistanceM: number;
  estimatedMovementTimeMinutes: number | null;
  estimatedEvaDurationMinutes: number | null;
  maximumSlopeDeg: number | null;
  elevationProfile: ElevationProfileSample[];
  terrainWarnings: string[];
  assumptions: string[];
  riskMetrics?: Record<string, number | string>;
  metadata: Record<string, string>;
}

export interface RoutePlannerResult {
  requestId: string;
  status: CalculationStatus;
  /** Null when the adapter cannot determine feasibility. */
  feasible: boolean | null;
  selectedRoute?: RouteCandidate;
  alternatives: RouteCandidate[];
  warnings: string[];
  modelAssumptions: string[];
  failureCode?: RouteFailureCode;
  failureReason?: string;
}

/** Implementations are async and must stop promptly when the supplied signal is aborted. */
export interface RoutePlannerAdapter {
  readonly id: string;
  readonly label: string;
  readonly provenance: 'demo' | 'scientific';
  calculate(input: RoutePlannerInput, signal: AbortSignal): Promise<RoutePlannerResult>;
}

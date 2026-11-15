/**
 * SCI-02 — Martian EVA Route Planning Engine
 * Project: MARS PATHFINDER (NASA Space Apps Challenge)
 * Author: Tymur (Mobility & Route Scientist)
 *
 * Pure TypeScript, zero-dependency module for computing astronaut Extra-Vehicular
 * Activity (EVA) routes across a normalized Martian Digital Elevation Model (DEM)
 * grid with slope limits, NoData/hazard masks, strict diagonal corner-cutting
 * prevention, Shortest vs. Risk-Aware A* optimization, and EVA time-budget assessment.
 */

export type OptimizationMode = 'shortest' | 'riskAware';

export type RouteStatus = 'success' | 'noRoute' | 'invalidInput' | 'error';

export interface GridCell {
  row: number;
  col: number;
}

export interface TerrainGrid {
  /** Number of columns in the regular DEM grid (integer >= 1). */
  width: number;
  /** Number of rows in the regular DEM grid (integer >= 1). */
  height: number;
  /** Horizontal cell size (East-West resolution) in meters (> 0). */
  cellSizeX: number;
  /** Vertical cell size on map (North-South resolution) in meters (> 0). */
  cellSizeY: number;
  /** Row-major array of elevation values in meters (length = width * height). */
  elevationMeters: ArrayLike<number>;
  /** Row-major mask of cells with valid elevation data (true / 1 = valid, false / 0 = NoData). */
  validMask: ArrayLike<boolean | number>;
  /** Optional row-major mask of confirmed impassable hazards (true / 1 = impassable hazard). */
  hazardMask?: ArrayLike<boolean | number>;
}

export interface RouteConfiguration {
  /** Starting grid cell { row, col } (typically habitat / lander airlock). */
  start: GridCell;
  /** Target grid cell { row, col } (science station / sampling site). */
  destination: GridCell;
  /** Maximum permissible slope angle in degrees (0 <= maxSlopeDeg <= 90), per TECH-01. */
  maxSlopeDeg: number;
  /** Assumed nominal horizontal walking speed in meters per second (> 0). */
  walkingSpeedMps: number;
  /** Total available EVA duration budget in minutes (> 0). */
  evaTimeLimitMinutes: number;
  /** Planned duration of science activities at the destination in minutes (>= 0). */
  scienceActivityMinutes: number;
  /** Required safety time reserve in minutes (>= 0). */
  safetyReserveMinutes: number;
  /** Route optimization mode: 'shortest' or 'riskAware'. */
  optimizationMode: OptimizationMode;
  /** Whether the astronaut must return to the starting habitat cell. */
  returnToHabitat: boolean;
  /**
   * Optional heuristic weight for quadratic slope penalty in 'riskAware' mode.
   * Default: 3.0. Documented heuristic parameter (not an empirical injury probability).
   */
  riskSlopeWeight?: number;
  /**
   * Optional heuristic weight penalizing cells immediately adjacent to hazards/NoData
   * in 'riskAware' mode. Default: 0.5. Documented heuristic parameter.
   */
  riskHazardProximityWeight?: number;
}

/**
 * Supports both nested `{ terrain, config }` and flat `TerrainGrid & RouteConfiguration`
 * structures for seamless integration with TECH-01 TypeScript contracts.
 */
export type RoutePlannerInput =
  | {
      terrain: TerrainGrid;
      config: RouteConfiguration;
    }
  | (TerrainGrid & RouteConfiguration);

export interface ElevationProfilePoint {
  /** Grid row index. */
  row: number;
  /** Grid column index. */
  col: number;
  /** Elevation at this grid cell in meters. */
  elevationMeters: number;
  /** Cumulative horizontal distance from start along the route in meters. */
  cumulativeDistanceMeters: number;
  /** Slope angle of the transition leading into this cell in degrees (0 at start). */
  segmentSlopeDeg: number;
  /** Route leg identifier ('outbound' from start to destination, 'return' back to start). */
  leg: 'outbound' | 'return';
}

export interface EvaAssessment {
  /** Horizontal distance from start to destination in meters. */
  outboundDistanceMeters: number;
  /** Horizontal distance from destination back to start in meters (0 if returnToHabitat is false). */
  returnDistanceMeters: number;
  /** Total horizontal route distance in meters. */
  totalDistanceMeters: number;
  /** Total 3D surface path distance (accounting for Δh) in meters. */
  totalDistance3DMeters: number;
  /** Minimum elevation encountered along the route in meters. */
  minElevationMeters: number;
  /** Maximum elevation encountered along the route in meters. */
  maxElevationMeters: number;
  /** Cumulative positive elevation gain along the route in meters. */
  elevationGainMeters: number;
  /** Cumulative elevation descent along the route in meters. */
  elevationLossMeters: number;
  /** Maximum transition slope angle encountered along the route in degrees. */
  maxSlopeDeg: number;
  /** Distance-weighted mean slope angle along the route in degrees. */
  meanSlopeDeg: number;
  /** Estimated outbound walking time in minutes. */
  outboundTravelMinutes: number;
  /** Estimated return walking time in minutes (0 if returnToHabitat is false). */
  returnTravelMinutes: number;
  /** Total estimated walking time in minutes (outbound + return). */
  estimatedTravelMinutes: number;
  /** Planned science activity time at destination in minutes. */
  scienceActivityMinutes: number;
  /** Required safety reserve time in minutes. */
  safetyReserveMinutes: number;
  /** Total active EVA time in minutes (estimatedTravelMinutes + scienceActivityMinutes). */
  estimatedEvaMinutes: number;
  /** Total required EVA budget including safety reserve (estimatedEvaMinutes + safetyReserveMinutes). */
  totalRequiredMinutesWithReserve: number;
  /** Configured maximum EVA time limit in minutes. */
  evaTimeLimitMinutes: number;
  /** Remaining time before hitting evaTimeLimitMinutes (evaTimeLimitMinutes - estimatedEvaMinutes). */
  remainingTimeReserveMinutes: number;
  /** Net time margin after subtracting safety reserve (evaTimeLimitMinutes - totalRequiredMinutesWithReserve). */
  netMarginAfterReserveMinutes: number;
  /** True if active EVA time + safety reserve exceeds evaTimeLimitMinutes. */
  isEvaBudgetExceeded: boolean;
}

export interface RoutePlannerResult {
  /** Execution status of the route planner. */
  status: RouteStatus;
  /** Optimization mode used for the calculation. */
  mode: OptimizationMode;
  /**
   * Ordered array of route cells { row, col }.
   * When returnToHabitat is true, contains the complete round-trip path (start -> destination -> start).
   */
  points: GridCell[];
  /** Ordered array of outbound route cells from start to destination. */
  outboundPoints: GridCell[];
  /** Ordered array of return route cells from destination back to start (empty if returnToHabitat is false). */
  returnPoints: GridCell[];
  /** Total horizontal length of the route in meters. */
  distanceMeters: number;
  /** Maximum slope angle along the route in degrees. */
  maxSlopeDeg: number;
  /** Elevation and cumulative distance profile along the route. */
  elevationProfile: ElevationProfilePoint[];
  /** Estimated total walking duration in minutes. */
  estimatedTravelMinutes: number;
  /** Estimated total EVA duration in minutes (travel + science activity). */
  estimatedEvaMinutes: number;
  /** Detailed EVA assessment breakdown (Section 4.3). */
  evaAssessment: EvaAssessment | null;
  /** List of operational warnings (e.g., EVA budget overrun, steep slope proximity). */
  warnings: string[];
  /** Explicit model assumptions and heuristic parameters used in this run. */
  assumptions: string[];
  /** Explanation if route planning failed (status !== 'success'). */
  failureReason?: string;
}

export interface TransitionAnalysis {
  horizontalDistanceMeters: number;
  deltaElevationMeters: number;
  absDeltaElevationMeters: number;
  distance3DMeters: number;
  slopeDeg: number;
  isAllowed: boolean;
  rejectionReason?: 'outOfBounds' | 'noData' | 'hazard' | 'excessiveSlope' | 'cornerCutting' | 'nonAdjacent';
}

const RAD_TO_DEG = 180 / Math.PI;
const EPSILON = 1e-9;

const DEFAULT_RISK_SLOPE_WEIGHT = 3.0;
const DEFAULT_RISK_HAZARD_PROXIMITY_WEIGHT = 0.5;

const NEIGHBOR_OFFSETS: ReadonlyArray<{ dr: number; dc: number; isDiagonal: boolean }> = [
  { dr: -1, dc: 0, isDiagonal: false },  // N
  { dr: 1, dc: 0, isDiagonal: false },   // S
  { dr: 0, dc: -1, isDiagonal: false },  // W
  { dr: 0, dc: 1, isDiagonal: false },   // E
  { dr: -1, dc: -1, isDiagonal: true },  // NW
  { dr: -1, dc: 1, isDiagonal: true },   // NE
  { dr: 1, dc: -1, isDiagonal: true },   // SW
  { dr: 1, dc: 1, isDiagonal: true },    // SE
];

/**
 * Normalizes nested or flat input into separate `TerrainGrid` and `RouteConfiguration` objects.
 */
export function normalizePlannerInput(input: RoutePlannerInput): {
  terrain: TerrainGrid;
  config: RouteConfiguration;
} {
  // Keep malformed JavaScript callers on the documented invalidInput path instead
  // of allowing property access here to escape as an unexpected runtime error.
  if (!input || typeof input !== 'object') {
    return {
      terrain: undefined as unknown as TerrainGrid,
      config: undefined as unknown as RouteConfiguration,
    };
  }

  const candidate = input as unknown as Record<string, unknown>;
  if (
    'terrain' in candidate ||
    'config' in candidate
  ) {
    return {
      terrain: candidate.terrain as TerrainGrid,
      config: candidate.config as RouteConfiguration,
    };
  }
  const flat = candidate as unknown as TerrainGrid & RouteConfiguration;
  return {
    terrain: {
      width: flat.width,
      height: flat.height,
      cellSizeX: flat.cellSizeX,
      cellSizeY: flat.cellSizeY,
      elevationMeters: flat.elevationMeters,
      validMask: flat.validMask,
      hazardMask: flat.hazardMask,
    },
    config: {
      start: flat.start,
      destination: flat.destination,
      maxSlopeDeg: flat.maxSlopeDeg,
      walkingSpeedMps: flat.walkingSpeedMps,
      evaTimeLimitMinutes: flat.evaTimeLimitMinutes,
      scienceActivityMinutes: flat.scienceActivityMinutes,
      safetyReserveMinutes: flat.safetyReserveMinutes,
      optimizationMode: flat.optimizationMode,
      returnToHabitat: flat.returnToHabitat,
      riskSlopeWeight: flat.riskSlopeWeight,
      riskHazardProximityWeight: flat.riskHazardProximityWeight,
    },
  };
}

function toIndex(row: number, col: number, width: number): number {
  return row * width + col;
}

function isInBounds(row: number, col: number, width: number, height: number): boolean {
  return row >= 0 && row < height && col >= 0 && col < width;
}

function isMaskTruthy(mask: ArrayLike<boolean | number>, index: number): boolean {
  const val = mask[index];
  return val === true || (typeof val === 'number' && val !== 0 && !Number.isNaN(val));
}

function isMaskValueValid(value: unknown): boolean {
  return typeof value === 'boolean' || value === 0 || value === 1;
}

function hasArrayLikeLength(value: unknown, expectedLength: number): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const length = (value as { length?: unknown }).length;
  return Number.isSafeInteger(length) && length === expectedLength;
}

/**
 * Checks whether a single grid cell is within bounds, has valid elevation data (not NoData),
 * and is not marked as a confirmed hazard.
 */
export function isCellPassable(
  terrain: TerrainGrid,
  row: number,
  col: number
): { passable: boolean; reason?: 'outOfBounds' | 'noData' | 'hazard' } {
  if (!isInBounds(row, col, terrain.width, terrain.height)) {
    return { passable: false, reason: 'outOfBounds' };
  }
  const idx = toIndex(row, col, terrain.width);
  if (!isMaskTruthy(terrain.validMask, idx)) {
    return { passable: false, reason: 'noData' };
  }
  const elev = terrain.elevationMeters[idx];
  if (typeof elev !== 'number' || !Number.isFinite(elev)) {
    return { passable: false, reason: 'noData' };
  }
  if (terrain.hazardMask && isMaskTruthy(terrain.hazardMask, idx)) {
    return { passable: false, reason: 'hazard' };
  }
  return { passable: true };
}

/**
 * Computes the slope angle in degrees according to Section 4.1:
 * SlopeDeg = atan(|Δh| / d_horizontal) * 180 / π
 */
export function computeSlopeDeg(absDeltaElevationMeters: number, horizontalDistanceMeters: number): number {
  if (
    !Number.isFinite(absDeltaElevationMeters) ||
    absDeltaElevationMeters < 0 ||
    !Number.isFinite(horizontalDistanceMeters) ||
    horizontalDistanceMeters < 0
  ) {
    return Number.NaN;
  }
  if (horizontalDistanceMeters === 0) return absDeltaElevationMeters === 0 ? 0 : 90;
  return Math.atan(absDeltaElevationMeters / horizontalDistanceMeters) * RAD_TO_DEG;
}

/**
 * Evaluates a transition between two neighboring cells `from` and `to` (Section 4.1):
 * - Horizontal distance (cellSizeX, cellSizeY, or diagonal hypot)
 * - Elevation difference Δh and slope angle in degrees
 * - NoData and hazardMask checks
 * - Maximum slope threshold check (SlopeDeg <= maxSlopeDeg)
 * - Diagonal corner-cutting prevention: forbids passing diagonally when orthogonal
 *   side cells are impassable or form an impassable steep corner.
 */
export function analyzeTransition(
  terrain: TerrainGrid,
  from: GridCell,
  to: GridCell,
  maxSlopeDeg: number
): TransitionAnalysis {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const isDiagonal = Math.abs(dr) === 1 && Math.abs(dc) === 1;

  const horizontalDistanceMeters = Math.hypot(dc * terrain.cellSizeX, dr * terrain.cellSizeY);

  if (
    !Number.isInteger(from.row) ||
    !Number.isInteger(from.col) ||
    !isInBounds(from.row, from.col, terrain.width, terrain.height)
  ) {
    return {
      horizontalDistanceMeters,
      deltaElevationMeters: NaN,
      absDeltaElevationMeters: NaN,
      distance3DMeters: NaN,
      slopeDeg: NaN,
      isAllowed: false,
      rejectionReason: 'outOfBounds',
    };
  }

  const fromStatus = isCellPassable(terrain, from.row, from.col);
  if (!fromStatus.passable) {
    return {
      horizontalDistanceMeters,
      deltaElevationMeters: NaN,
      absDeltaElevationMeters: NaN,
      distance3DMeters: NaN,
      slopeDeg: NaN,
      isAllowed: false,
      rejectionReason: fromStatus.reason,
    };
  }

  if (
    !Number.isInteger(to.row) ||
    !Number.isInteger(to.col) ||
    Math.abs(dr) > 1 ||
    Math.abs(dc) > 1 ||
    (dr === 0 && dc === 0)
  ) {
    return {
      horizontalDistanceMeters,
      deltaElevationMeters: NaN,
      absDeltaElevationMeters: NaN,
      distance3DMeters: NaN,
      slopeDeg: NaN,
      isAllowed: false,
      rejectionReason: 'nonAdjacent',
    };
  }

  const targetStatus = isCellPassable(terrain, to.row, to.col);
  if (!targetStatus.passable) {
    return {
      horizontalDistanceMeters,
      deltaElevationMeters: NaN,
      absDeltaElevationMeters: NaN,
      distance3DMeters: NaN,
      slopeDeg: NaN,
      isAllowed: false,
      rejectionReason: targetStatus.reason,
    };
  }

  const fromIdx = toIndex(from.row, from.col, terrain.width);
  const toIdx = toIndex(to.row, to.col, terrain.width);
  const hFrom = terrain.elevationMeters[fromIdx];
  const hTo = terrain.elevationMeters[toIdx];

  const deltaElevationMeters = hTo - hFrom;
  const absDeltaElevationMeters = Math.abs(deltaElevationMeters);
  const distance3DMeters = Math.hypot(horizontalDistanceMeters, absDeltaElevationMeters);
  const slopeDeg = computeSlopeDeg(absDeltaElevationMeters, horizontalDistanceMeters);

  // Diagonal corner-cutting check (Section 4.1 & Section 6):
  // For a diagonal step (r, c) -> (r + dr, c + dc), inspect the two orthogonal cells
  // sharing the corner: orthA = (r + dr, c) and orthB = (r, c + dc).
  // If either orthogonal cell is an impassable obstacle (NoData or hazard), or if both
  // orthogonal transitions exceed maxSlopeDeg, disallow cutting through the corner.
  if (isDiagonal) {
    const orthA: GridCell = { row: from.row + dr, col: from.col };
    const orthB: GridCell = { row: from.row, col: from.col + dc };
    const statusA = isCellPassable(terrain, orthA.row, orthA.col);
    const statusB = isCellPassable(terrain, orthB.row, orthB.col);

    if (!statusA.passable || !statusB.passable) {
      return {
        horizontalDistanceMeters,
        deltaElevationMeters,
        absDeltaElevationMeters,
        distance3DMeters,
        slopeDeg,
        isAllowed: false,
        rejectionReason: 'cornerCutting',
      };
    }

    // Also verify the diagonal doesn't jump across the corner of two steep cliff cells
    const hA = terrain.elevationMeters[toIndex(orthA.row, orthA.col, terrain.width)];
    const hB = terrain.elevationMeters[toIndex(orthB.row, orthB.col, terrain.width)];
    const slopeFromToA = computeSlopeDeg(Math.abs(hA - hFrom), terrain.cellSizeY);
    const slopeAToTarget = computeSlopeDeg(Math.abs(hTo - hA), terrain.cellSizeX);
    const slopeFromToB = computeSlopeDeg(Math.abs(hB - hFrom), terrain.cellSizeX);
    const slopeBToTarget = computeSlopeDeg(Math.abs(hTo - hB), terrain.cellSizeY);

    const sideAPassableSlope =
      slopeFromToA <= maxSlopeDeg + EPSILON && slopeAToTarget <= maxSlopeDeg + EPSILON;
    const sideBPassableSlope =
      slopeFromToB <= maxSlopeDeg + EPSILON && slopeBToTarget <= maxSlopeDeg + EPSILON;

    if (!sideAPassableSlope && !sideBPassableSlope) {
      return {
        horizontalDistanceMeters,
        deltaElevationMeters,
        absDeltaElevationMeters,
        distance3DMeters,
        slopeDeg,
        isAllowed: false,
        rejectionReason: 'cornerCutting',
      };
    }
  }

  if (slopeDeg > maxSlopeDeg + EPSILON) {
    return {
      horizontalDistanceMeters,
      deltaElevationMeters,
      absDeltaElevationMeters,
      distance3DMeters,
      slopeDeg,
      isAllowed: false,
      rejectionReason: 'excessiveSlope',
    };
  }

  return {
    horizontalDistanceMeters,
    deltaElevationMeters,
    absDeltaElevationMeters,
    distance3DMeters,
    slopeDeg,
    isAllowed: true,
  };
}

/**
 * Checks whether a cell has any adjacent impassable (hazard or NoData) neighbor in its 8-neighborhood.
 * Used as a documented heuristic buffer in `riskAware` mode.
 */
function hasAdjacentObstacle(terrain: TerrainGrid, row: number, col: number): boolean {
  for (const offset of NEIGHBOR_OFFSETS) {
    const nr = row + offset.dr;
    const nc = col + offset.dc;
    if (!isInBounds(nr, nc, terrain.width, terrain.height)) {
      continue;
    }
    const status = isCellPassable(terrain, nr, nc);
    if (!status.passable) {
      return true;
    }
  }
  return false;
}

/**
 * Admissible and consistent anisotropic octile heuristic for 8-connected metric grids.
 * Exactly equals the minimum possible 8-connected horizontal distance between `cell` and `goal`.
 */
function computeOctileHeuristic(
  cell: GridCell,
  goal: GridCell,
  cellSizeX: number,
  cellSizeY: number,
  diagSize: number
): number {
  const dr = Math.abs(goal.row - cell.row);
  const dc = Math.abs(goal.col - cell.col);
  const diagSteps = Math.min(dr, dc);
  const remRow = dr - diagSteps;
  const remCol = dc - diagSteps;
  return diagSteps * diagSize + remCol * cellSizeX + remRow * cellSizeY;
}

/**
 * Binary Min-Heap priority queue for O(E log V) A* search performance on large DEM grids.
 */
class MinHeap {
  private nodeIds: number[] = [];
  private fScores: number[] = [];

  public get size(): number {
    return this.nodeIds.length;
  }

  public push(nodeId: number, fScore: number): void {
    const idx = this.nodeIds.length;
    this.nodeIds.push(nodeId);
    this.fScores.push(fScore);
    this.bubbleUp(idx);
  }

  public pop(): number | undefined {
    const n = this.nodeIds.length;
    if (n === 0) return undefined;
    const topNode = this.nodeIds[0];
    const lastNode = this.nodeIds.pop()!;
    const lastScore = this.fScores.pop()!;
    if (n > 1) {
      this.nodeIds[0] = lastNode;
      this.fScores[0] = lastScore;
      this.sinkDown(0);
    }
    return topNode;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.fScores[idx] < this.fScores[parentIdx]) {
        this.swap(idx, parentIdx);
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private sinkDown(idx: number): void {
    const n = this.nodeIds.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;

      if (left < n && this.fScores[left] < this.fScores[smallest]) {
        smallest = left;
      }
      if (right < n && this.fScores[right] < this.fScores[smallest]) {
        smallest = right;
      }
      if (smallest !== idx) {
        this.swap(idx, smallest);
        idx = smallest;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const tmpNode = this.nodeIds[i];
    this.nodeIds[i] = this.nodeIds[j];
    this.nodeIds[j] = tmpNode;

    const tmpScore = this.fScores[i];
    this.fScores[i] = this.fScores[j];
    this.fScores[j] = tmpScore;
  }
}

/**
 * Validates `TerrainGrid` and `RouteConfiguration` parameters before route execution.
 */
export function validatePlannerInput(
  terrain: TerrainGrid,
  config: RouteConfiguration
): { valid: boolean; reason?: string } {
  if (
    !terrain ||
    typeof terrain !== 'object' ||
    !config ||
    typeof config !== 'object'
  ) {
    return { valid: false, reason: 'Missing terrain grid or route configuration object.' };
  }
  if (!Number.isInteger(terrain.width) || terrain.width < 1 || !Number.isInteger(terrain.height) || terrain.height < 1) {
    return {
      valid: false,
      reason: `Invalid grid dimensions: width (${terrain.width}) and height (${terrain.height}) must be positive integers.`,
    };
  }
  if (
    typeof terrain.cellSizeX !== 'number' ||
    !Number.isFinite(terrain.cellSizeX) ||
    terrain.cellSizeX <= 0 ||
    typeof terrain.cellSizeY !== 'number' ||
    !Number.isFinite(terrain.cellSizeY) ||
    terrain.cellSizeY <= 0
  ) {
    return {
      valid: false,
      reason: `Invalid cell sizes: cellSizeX (${terrain.cellSizeX}) and cellSizeY (${terrain.cellSizeY}) must be positive numbers in meters.`,
    };
  }

  const expectedLength = terrain.width * terrain.height;
  if (!Number.isSafeInteger(expectedLength)) {
    return { valid: false, reason: 'Grid cell count exceeds the safe integer range.' };
  }
  if (!hasArrayLikeLength(terrain.elevationMeters, expectedLength)) {
    return {
      valid: false,
      reason: `elevationMeters must be array-like with length ${expectedLength}; got length (${terrain.elevationMeters?.length}).`,
    };
  }
  if (!hasArrayLikeLength(terrain.validMask, expectedLength)) {
    return {
      valid: false,
      reason: `validMask must be array-like with length ${expectedLength}; got length (${terrain.validMask?.length}).`,
    };
  }
  if (
    terrain.hazardMask !== undefined &&
    !hasArrayLikeLength(terrain.hazardMask, expectedLength)
  ) {
    return {
      valid: false,
      reason: `hazardMask must be array-like with length ${expectedLength}; got length (${terrain.hazardMask.length}).`,
    };
  }

  for (let i = 0; i < expectedLength; i++) {
    if (!isMaskValueValid(terrain.validMask[i])) {
      return {
        valid: false,
        reason: `validMask[${i}] must be boolean or 0/1.`,
      };
    }
    if (terrain.hazardMask && !isMaskValueValid(terrain.hazardMask[i])) {
      return {
        valid: false,
        reason: `hazardMask[${i}] must be boolean or 0/1.`,
      };
    }
  }

  if (
    !config.start ||
    !Number.isInteger(config.start.row) ||
    !Number.isInteger(config.start.col) ||
    !isInBounds(config.start.row, config.start.col, terrain.width, terrain.height)
  ) {
    return {
      valid: false,
      reason: `Start cell (${config.start?.row}, ${config.start?.col}) is out of grid bounds [0..${terrain.height - 1}, 0..${terrain.width - 1}].`,
    };
  }
  if (
    !config.destination ||
    !Number.isInteger(config.destination.row) ||
    !Number.isInteger(config.destination.col) ||
    !isInBounds(config.destination.row, config.destination.col, terrain.width, terrain.height)
  ) {
    return {
      valid: false,
      reason: `Destination cell (${config.destination?.row}, ${config.destination?.col}) is out of grid bounds [0..${terrain.height - 1}, 0..${terrain.width - 1}].`,
    };
  }

  if (typeof config.maxSlopeDeg !== 'number' || !Number.isFinite(config.maxSlopeDeg) || config.maxSlopeDeg < 0 || config.maxSlopeDeg > 90) {
    return {
      valid: false,
      reason: `Invalid maxSlopeDeg (${config.maxSlopeDeg}): must be in the range [0, 90] degrees.`,
    };
  }
  if (typeof config.walkingSpeedMps !== 'number' || !Number.isFinite(config.walkingSpeedMps) || config.walkingSpeedMps <= 0) {
    return {
      valid: false,
      reason: `Invalid walkingSpeedMps (${config.walkingSpeedMps}): must be a positive speed in m/s.`,
    };
  }
  if (typeof config.evaTimeLimitMinutes !== 'number' || !Number.isFinite(config.evaTimeLimitMinutes) || config.evaTimeLimitMinutes <= 0) {
    return {
      valid: false,
      reason: `Invalid evaTimeLimitMinutes (${config.evaTimeLimitMinutes}): must be a positive duration in minutes.`,
    };
  }
  if (typeof config.scienceActivityMinutes !== 'number' || !Number.isFinite(config.scienceActivityMinutes) || config.scienceActivityMinutes < 0) {
    return {
      valid: false,
      reason: `Invalid scienceActivityMinutes (${config.scienceActivityMinutes}): must be >= 0 minutes.`,
    };
  }
  if (typeof config.safetyReserveMinutes !== 'number' || !Number.isFinite(config.safetyReserveMinutes) || config.safetyReserveMinutes < 0) {
    return {
      valid: false,
      reason: `Invalid safetyReserveMinutes (${config.safetyReserveMinutes}): must be >= 0 minutes.`,
    };
  }
  if (config.optimizationMode !== 'shortest' && config.optimizationMode !== 'riskAware') {
    return {
      valid: false,
      reason: `Invalid optimizationMode (${String(config.optimizationMode)}): must be 'shortest' or 'riskAware'.`,
    };
  }
  if (typeof config.returnToHabitat !== 'boolean') {
    return { valid: false, reason: 'returnToHabitat must be a boolean.' };
  }

  const riskSlopeWeight = config.riskSlopeWeight ?? DEFAULT_RISK_SLOPE_WEIGHT;
  if (!Number.isFinite(riskSlopeWeight) || riskSlopeWeight < 0) {
    return {
      valid: false,
      reason: 'riskSlopeWeight must be a finite, non-negative number.',
    };
  }

  const riskHazardProximityWeight =
    config.riskHazardProximityWeight ?? DEFAULT_RISK_HAZARD_PROXIMITY_WEIGHT;
  if (!Number.isFinite(riskHazardProximityWeight) || riskHazardProximityWeight < 0) {
    return {
      valid: false,
      reason: 'riskHazardProximityWeight must be a finite, non-negative number.',
    };
  }

  return { valid: true };
}

/**
 * Runs 8-connected A* search from `start` to `goal` under the configured optimization mode.
 */
function runAStarSearch(
  terrain: TerrainGrid,
  config: RouteConfiguration,
  start: GridCell,
  goal: GridCell
): GridCell[] | null {
  const { width, height, cellSizeX, cellSizeY } = terrain;
  const totalCells = width * height;
  const diagSize = Math.hypot(cellSizeX, cellSizeY);

  const startIdx = toIndex(start.row, start.col, width);
  const goalIdx = toIndex(goal.row, goal.col, width);

  if (startIdx === goalIdx) {
    return [{ row: start.row, col: start.col }];
  }

  const gScore = new Float64Array(totalCells);
  gScore.fill(Infinity);
  gScore[startIdx] = 0;

  const parentIdx = new Int32Array(totalCells);
  parentIdx.fill(-1);

  const closed = new Uint8Array(totalCells);

  const riskSlopeWeight = config.riskSlopeWeight ?? DEFAULT_RISK_SLOPE_WEIGHT;
  const riskHazardProximityWeight =
    config.riskHazardProximityWeight ?? DEFAULT_RISK_HAZARD_PROXIMITY_WEIGHT;

  // Precompute obstacle proximity flag only when running in riskAware mode
  let obstacleProximityMask: Uint8Array | null = null;
  if (config.optimizationMode === 'riskAware' && riskHazardProximityWeight > 0) {
    obstacleProximityMask = new Uint8Array(totalCells);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (hasAdjacentObstacle(terrain, r, c)) {
          obstacleProximityMask[toIndex(r, c, width)] = 1;
        }
      }
    }
  }

  const openHeap = new MinHeap();
  const initialH = computeOctileHeuristic(start, goal, cellSizeX, cellSizeY, diagSize);
  openHeap.push(startIdx, initialH);

  while (openHeap.size > 0) {
    const currentIdx = openHeap.pop()!;
    if (closed[currentIdx] === 1) {
      continue;
    }
    if (currentIdx === goalIdx) {
      // Reconstruct path
      const path: GridCell[] = [];
      let curr = goalIdx;
      while (curr !== -1) {
        const r = Math.floor(curr / width);
        const c = curr % width;
        path.push({ row: r, col: c });
        curr = parentIdx[curr];
      }
      path.reverse();
      return path;
    }

    closed[currentIdx] = 1;
    const currentRow = Math.floor(currentIdx / width);
    const currentCol = currentIdx % width;
    const currentCell: GridCell = { row: currentRow, col: currentCol };
    const currentG = gScore[currentIdx];

    for (const offset of NEIGHBOR_OFFSETS) {
      const nextRow = currentRow + offset.dr;
      const nextCol = currentCol + offset.dc;
      if (!isInBounds(nextRow, nextCol, width, height)) {
        continue;
      }

      const nextIdx = toIndex(nextRow, nextCol, width);
      if (closed[nextIdx] === 1) {
        continue;
      }

      const nextCell: GridCell = { row: nextRow, col: nextCol };
      const transition = analyzeTransition(terrain, currentCell, nextCell, config.maxSlopeDeg);
      if (!transition.isAllowed) {
        continue;
      }

      let stepCost = transition.horizontalDistanceMeters;
      if (config.optimizationMode === 'riskAware') {
        const normalizedSlope = config.maxSlopeDeg === 0 ? 0 : transition.slopeDeg / config.maxSlopeDeg;
        const slopePenalty = riskSlopeWeight * normalizedSlope * normalizedSlope;
        const currentNearObstacle = obstacleProximityMask?.[currentIdx] === 1 ? 1 : 0;
        const nextNearObstacle = obstacleProximityMask?.[nextIdx] === 1 ? 1 : 0;
        // Average the endpoint penalties so traversing an edge has the same cost
        // in both directions. This keeps outbound and return route costs symmetric.
        const proximityPenalty =
          riskHazardProximityWeight * (currentNearObstacle + nextNearObstacle) / 2;
        stepCost = transition.horizontalDistanceMeters * (1 + slopePenalty + proximityPenalty);
      }

      const tentativeG = currentG + stepCost;
      if (tentativeG + EPSILON < gScore[nextIdx]) {
        gScore[nextIdx] = tentativeG;
        parentIdx[nextIdx] = currentIdx;
        const h = computeOctileHeuristic(nextCell, goal, cellSizeX, cellSizeY, diagSize);
        openHeap.push(nextIdx, tentativeG + h);
      }
    }
  }

  return null;
}

/**
 * Main entry point for SCI-02 Martian EVA Route Planning Engine.
 * Computes optimal route, elevation profile, and EVA assessment metrics.
 */
export function planEvaRoute(rawInput: RoutePlannerInput): RoutePlannerResult {
  try {
    const { terrain, config } = normalizePlannerInput(rawInput);
    const mode: OptimizationMode =
      config?.optimizationMode === 'riskAware' ? 'riskAware' : 'shortest';

    const baseAssumptions: string[] = [
      'Local Cartesian metric DEM grid with uniform cell spacing (cellSizeX, cellSizeY) normalized by SCI-01/TECH-01 adapter.',
      'Slope angle calculated via SlopeDeg = atan(|Δh| / d_horizontal) * 180 / π across 8-connected grid transitions.',
      'Strict diagonal corner-cutting rule enforced: diagonal transition is forbidden if either orthogonal neighbor cell is impassable (NoData or hazard) or if both orthogonal transitions exceed maxSlopeDeg.',
      `Nominal walking speed (${config?.walkingSpeedMps ?? 'N/A'} m/s), maxSlopeDeg (${config?.maxSlopeDeg ?? 'N/A'}°), and EVA budget parameters are configurable model assumptions, not official NASA operational standards.`,
    ];

    const validation = validatePlannerInput(terrain, config);
    if (!validation.valid) {
      return {
        status: 'invalidInput',
        mode,
        points: [],
        outboundPoints: [],
        returnPoints: [],
        distanceMeters: 0,
        maxSlopeDeg: 0,
        elevationProfile: [],
        estimatedTravelMinutes: 0,
        estimatedEvaMinutes: 0,
        evaAssessment: null,
        warnings: [],
        assumptions: baseAssumptions,
        failureReason: validation.reason,
      };
    }

    const riskSlopeWeight = config.riskSlopeWeight ?? DEFAULT_RISK_SLOPE_WEIGHT;
    const riskHazardProximityWeight =
      config.riskHazardProximityWeight ?? DEFAULT_RISK_HAZARD_PROXIMITY_WEIGHT;

    if (mode === 'riskAware') {
      baseAssumptions.push(
        `Risk-Aware heuristic edge cost: d_horizontal * (1 + ${riskSlopeWeight} * (SlopeDeg / maxSlopeDeg)^2 + ${riskHazardProximityWeight} * mean(adjacent-obstacle flags at both edge endpoints)). Weights are traversal-cost multipliers, not numerical probabilities of injury or hardware failure.`
      );
    } else {
      baseAssumptions.push(
        'Shortest-route cost function: minimizes total permissible horizontal distance d_horizontal using an admissible anisotropic octile A* heuristic.'
      );
    }

    if (config.returnToHabitat) {
      baseAssumptions.push(
        'Round-trip EVA enabled (returnToHabitat = true): `points` contains the complete round-trip sequence (start -> destination -> start), while `outboundPoints` and `returnPoints` provide the separate leg arrays.'
      );
    } else {
      baseAssumptions.push(
        'One-way EVA traversal (returnToHabitat = false): `points` and `outboundPoints` contain the one-way path from start to destination.'
      );
    }

    // Check passability of start and destination cells
    const startStatus = isCellPassable(terrain, config.start.row, config.start.col);
    if (!startStatus.passable) {
      return {
        status: 'noRoute',
        mode,
        points: [],
        outboundPoints: [],
        returnPoints: [],
        distanceMeters: 0,
        maxSlopeDeg: 0,
        elevationProfile: [],
        estimatedTravelMinutes: 0,
        estimatedEvaMinutes: 0,
        evaAssessment: null,
        warnings: [],
        assumptions: baseAssumptions,
        failureReason: `Start cell (${config.start.row}, ${config.start.col}) is impassable (${startStatus.reason}).`,
      };
    }

    const destStatus = isCellPassable(terrain, config.destination.row, config.destination.col);
    if (!destStatus.passable) {
      return {
        status: 'noRoute',
        mode,
        points: [],
        outboundPoints: [],
        returnPoints: [],
        distanceMeters: 0,
        maxSlopeDeg: 0,
        elevationProfile: [],
        estimatedTravelMinutes: 0,
        estimatedEvaMinutes: 0,
        evaAssessment: null,
        warnings: [],
        assumptions: baseAssumptions,
        failureReason: `Destination cell (${config.destination.row}, ${config.destination.col}) is impassable (${destStatus.reason}).`,
      };
    }

    const outboundPoints = runAStarSearch(terrain, config, config.start, config.destination);
    if (!outboundPoints) {
      return {
        status: 'noRoute',
        mode,
        points: [],
        outboundPoints: [],
        returnPoints: [],
        distanceMeters: 0,
        maxSlopeDeg: 0,
        elevationProfile: [],
        estimatedTravelMinutes: 0,
        estimatedEvaMinutes: 0,
        evaAssessment: null,
        warnings: [],
        assumptions: baseAssumptions,
        failureReason: `No valid route found from (${config.start.row}, ${config.start.col}) to (${config.destination.row}, ${config.destination.col}) within maxSlopeDeg = ${config.maxSlopeDeg}° and obstacle constraints.`,
      };
    }

    let returnPoints: GridCell[] = [];
    let fullPoints: GridCell[] = [...outboundPoints];

    if (config.returnToHabitat) {
      // Search the return leg explicitly. This also keeps the result correct if
      // the edge-cost model changes or a future adapter adds directional costs.
      const plannedReturn = runAStarSearch(terrain, config, config.destination, config.start);
      if (!plannedReturn) {
        return {
          status: 'noRoute',
          mode,
          points: [],
          outboundPoints,
          returnPoints: [],
          distanceMeters: 0,
          maxSlopeDeg: 0,
          elevationProfile: [],
          estimatedTravelMinutes: 0,
          estimatedEvaMinutes: 0,
          evaAssessment: null,
          warnings: [],
          assumptions: baseAssumptions,
          failureReason: `No valid return route found from (${config.destination.row}, ${config.destination.col}) to (${config.start.row}, ${config.start.col}).`,
        };
      }
      returnPoints = plannedReturn;
      if (returnPoints.length > 1) {
        fullPoints = [...outboundPoints, ...returnPoints.slice(1)];
      }
    }

    // Build elevation profile and compute distance, slope, and elevation metrics
    const elevationProfile: ElevationProfilePoint[] = [];
    let outboundDistanceMeters = 0;
    let returnDistanceMeters = 0;
    let totalDistance3DMeters = 0;
    let maxSlopeDeg = 0;
    let weightedSlopeSum = 0;
    let elevationGainMeters = 0;
    let elevationLossMeters = 0;

    const startElev =
      terrain.elevationMeters[toIndex(outboundPoints[0].row, outboundPoints[0].col, terrain.width)];
    let minElevationMeters = startElev;
    let maxElevationMeters = startElev;

    elevationProfile.push({
      row: outboundPoints[0].row,
      col: outboundPoints[0].col,
      elevationMeters: startElev,
      cumulativeDistanceMeters: 0,
      segmentSlopeDeg: 0,
      leg: 'outbound',
    });

    let cumulativeDistanceMeters = 0;
    const outboundLegPointCount = outboundPoints.length;

    for (let i = 1; i < fullPoints.length; i++) {
      const prev = fullPoints[i - 1];
      const curr = fullPoints[i];
      const leg: 'outbound' | 'return' = i < outboundLegPointCount ? 'outbound' : 'return';

      const transition = analyzeTransition(terrain, prev, curr, config.maxSlopeDeg);
      const segDist = transition.horizontalDistanceMeters;
      const segSlope = transition.slopeDeg;
      const currElev = terrain.elevationMeters[toIndex(curr.row, curr.col, terrain.width)];

      cumulativeDistanceMeters += segDist;
      totalDistance3DMeters += transition.distance3DMeters;

      if (leg === 'outbound') {
        outboundDistanceMeters += segDist;
      } else {
        returnDistanceMeters += segDist;
      }

      if (segSlope > maxSlopeDeg) {
        maxSlopeDeg = segSlope;
      }
      weightedSlopeSum += segSlope * segDist;

      if (transition.deltaElevationMeters > 0) {
        elevationGainMeters += transition.deltaElevationMeters;
      } else if (transition.deltaElevationMeters < 0) {
        elevationLossMeters += Math.abs(transition.deltaElevationMeters);
      }

      if (currElev < minElevationMeters) minElevationMeters = currElev;
      if (currElev > maxElevationMeters) maxElevationMeters = currElev;

      elevationProfile.push({
        row: curr.row,
        col: curr.col,
        elevationMeters: currElev,
        cumulativeDistanceMeters,
        segmentSlopeDeg: segSlope,
        leg,
      });
    }

    const totalDistanceMeters = outboundDistanceMeters + returnDistanceMeters;
    const meanSlopeDeg = totalDistanceMeters > 0 ? weightedSlopeSum / totalDistanceMeters : 0;

    const outboundTravelMinutes = outboundDistanceMeters / config.walkingSpeedMps / 60;
    const returnTravelMinutes = returnDistanceMeters / config.walkingSpeedMps / 60;
    const estimatedTravelMinutes = outboundTravelMinutes + returnTravelMinutes;
    const estimatedEvaMinutes = estimatedTravelMinutes + config.scienceActivityMinutes;
    const totalRequiredMinutesWithReserve = estimatedEvaMinutes + config.safetyReserveMinutes;
    const remainingTimeReserveMinutes = config.evaTimeLimitMinutes - estimatedEvaMinutes;
    const netMarginAfterReserveMinutes =
      config.evaTimeLimitMinutes - totalRequiredMinutesWithReserve;
    const isEvaBudgetExceeded = totalRequiredMinutesWithReserve > config.evaTimeLimitMinutes + EPSILON;

    const warnings: string[] = [];
    if (isEvaBudgetExceeded) {
      warnings.push(
        `EVA_BUDGET_EXCEEDED: Total required time including safety reserve (${totalRequiredMinutesWithReserve.toFixed(
          2
        )} min) exceeds configured evaTimeLimitMinutes (${config.evaTimeLimitMinutes.toFixed(2)} min).`
      );
    }
    if (maxSlopeDeg >= 0.85 * config.maxSlopeDeg && maxSlopeDeg > 0) {
      warnings.push(
        `STEEP_SLOPE_WARNING: Maximum route slope (${maxSlopeDeg.toFixed(
          2
        )}°) approaches configured limit (${config.maxSlopeDeg.toFixed(2)}°).`
      );
    }
    if (!config.returnToHabitat) {
      warnings.push(
        'ONE_WAY_ROUTE: returnToHabitat is false; EVA assessment does not include return transit time to the starting habitat.'
      );
    }

    const evaAssessment: EvaAssessment = {
      outboundDistanceMeters,
      returnDistanceMeters,
      totalDistanceMeters,
      totalDistance3DMeters,
      minElevationMeters,
      maxElevationMeters,
      elevationGainMeters,
      elevationLossMeters,
      maxSlopeDeg,
      meanSlopeDeg,
      outboundTravelMinutes,
      returnTravelMinutes,
      estimatedTravelMinutes,
      scienceActivityMinutes: config.scienceActivityMinutes,
      safetyReserveMinutes: config.safetyReserveMinutes,
      estimatedEvaMinutes,
      totalRequiredMinutesWithReserve,
      evaTimeLimitMinutes: config.evaTimeLimitMinutes,
      remainingTimeReserveMinutes,
      netMarginAfterReserveMinutes,
      isEvaBudgetExceeded,
    };

    return {
      status: 'success',
      mode,
      points: fullPoints,
      outboundPoints,
      returnPoints,
      distanceMeters: totalDistanceMeters,
      maxSlopeDeg,
      elevationProfile,
      estimatedTravelMinutes,
      estimatedEvaMinutes,
      evaAssessment,
      warnings,
      assumptions: baseAssumptions,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      mode: 'shortest',
      points: [],
      outboundPoints: [],
      returnPoints: [],
      distanceMeters: 0,
      maxSlopeDeg: 0,
      elevationProfile: [],
      estimatedTravelMinutes: 0,
      estimatedEvaMinutes: 0,
      evaAssessment: null,
      warnings: [],
      assumptions: [],
      failureReason: `Unexpected runtime error: ${message}`,
    };
  }
}

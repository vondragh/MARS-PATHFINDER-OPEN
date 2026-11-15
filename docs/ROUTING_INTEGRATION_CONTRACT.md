# Контракт інтеграції планувальника маршрутів

**Версія контракту:** 1.0
**Власник алгоритму:** SCI-02, Timur
**Споживач:** TECH-01 frontend
**Terrain owner:** SCI-01, Kolya
**Канонічні типи:** `src/domain/routing/types.ts`

Цей контракт дає SCI-02 незалежний API, який можна під'єднати без переписування React-компонентів. `demoRoutePlanner` потрібен лише для перевірки інтерфейсу. Це не науковий маршрутизатор, не модель мобільності та не підтвердження безпеки EVA.

## 1. Координатна домовленість

- `ProjectedCoordinate` — локальні проєктовані координати Mars у метрах: `x` схід, `y` північ.
- Не передавати latitude/longitude у градусах у route API.
- Єдина основа перетворення — `TerrainDataset.horizontalCrs` та його affine transform; CRS має бути узгоджений з SCI-01.
- `RouteCellIndex` має цілочисельні `row`, `col`, індексація з нуля, row 0 — перший рядок raster, col 0 — перший стовпець.
- `RouteEndpoint.coordinate` — локальна метрична координата, а `.cell` — її комірка. Adapter перевіряє відповідність: `coordinateToCell()` повертає `{row, column}`, який відповідає route cell `{row, col: column}`.
- `col`/`row` не є координатами або відстанню. Не можна обчислювати метри з різниці індексів без affine transform.

## 2. Канонічний TypeScript API

```ts
import type { ProjectedCoordinate, TerrainDataset } from '../terrain/types';

export type OptimizationMode = 'shortest' | 'riskAware';
export type CalculationStatus = 'success' | 'infeasible' | 'failed';
export type RouteFailureCode =
  | 'invalid-input'
  | 'start-out-of-bounds'
  | 'destination-out-of-bounds'
  | 'nodata-endpoint'
  | 'no-feasible-route'
  | 'unsupported-mode'
  | 'cancelled'
  | 'calculation-error';

export interface RouteCellIndex {
  row: number;
  col: number;
}

export interface RouteEndpoint {
  id: string;
  coordinate: ProjectedCoordinate; // x/y у local metric CRS, метри
  cell: RouteCellIndex;
}

export interface RouteConstraints {
  maxSlopeDeg: number;
  noDataPolicy: 'reject-route';
}

export interface EvaAssumptions {
  walkingSpeedMps: number;
  evaTimeLimitMinutes: number;
  scienceActivityMinutes: number;
  safetyReserveMinutes: number;
}

export interface RoutePlannerInput {
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
  distanceM: number; // cumulative from habitat, outbound then return
  leg: 'outbound' | 'return';
  coordinate: ProjectedCoordinate;
  cell: RouteCellIndex;
  elevationM: number | null; // null is explicit NoData; no silent interpolation
}

export interface RouteLeg {
  start: RouteEndpoint;
  end: RouteEndpoint;
  coordinates: ProjectedCoordinate[]; // travel order, projected meters
  traversedCells: RouteCellIndex[]; // travel order
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
  requestId: string; // exact echo for stale-response protection
  status: CalculationStatus;
  feasible: boolean | null;
  selectedRoute?: RouteCandidate;
  alternatives: RouteCandidate[];
  warnings: string[];
  modelAssumptions: string[];
  failureCode?: RouteFailureCode;
  failureReason?: string;
}

export interface RoutePlannerAdapter {
  readonly id: string;
  readonly label: string;
  readonly provenance: 'demo' | 'scientific';
  calculate(input: RoutePlannerInput, signal: AbortSignal): Promise<RoutePlannerResult>;
}
```

`ProjectedCoordinate` і `TerrainDataset` імпортуються з `src/domain/terrain/types.ts`; `RouteCellIndex` належить routing contract. Імпортний шлях із `src/domain/routing/types.ts` — `../terrain/types`. Усі інтерфейси та union types вище підтримуються буквально у `src/domain/routing/types.ts`; якщо потрібне уточнення від SCI-02, узгодити його з Kolya та TECH-01, оновити контракт і повідомити учасників до зміни коду.

## 3. Вхідні дані та перевірки

1. Перевірити `validateTerrainDataset(terrain)` до розрахунку.
2. `start`, `destination` та кожен waypoint мають бути всередині DEM, мати cell index, відповідний projected coordinate, і `validMask[row * width + col] === 1`. `hazardMask[index] === 1` забороняє комірку; якщо layer не надано, це зазначається у warnings/model assumptions.
3. `width × height`, row-major TypedArray, pixel-corner affine transform та NoData-mask семантика визначені у `TERRAIN_DATA_CONTRACT.md`.
4. Усі числові вхідні значення мають бути скінченними. `maxSlopeDeg` — від 0 до 90 включно; `walkingSpeedMps` > 0; `evaTimeLimitMinutes` > 0; `scienceActivityMinutes` ≥ 0; `safetyReserveMinutes` ≥ 0. Висота й горизонтальні координати — метри; slope — градуси; швидкість — м/с; тривалості — хвилини.
5. `maxSlopeDeg` — жорстка межа для feasibility. SCI-02 документує, як обчислює локальний slope, крайові комірки та вплив NoData. Якщо запит містить некоректні або невідомі обмеження, не коригувати їх мовчки.
6. `noDataPolicy` наразі єдиний і обов'язковий: `reject-route`. Не інтерполювати пропуски тихо.
7. Канонічні режими цього контракту — лише `shortest` і `riskAware`. `scientific-priority` залишається вимкненим frontend option і не надсилається до SCI-02, доки окремо не буде узгоджено objective та ваги.
8. Не мутувати `terrain` TypedArray. У разі довгої роботи періодично перевіряти `signal.aborted`.

## 4. Вихід, профіль і одиниці

- У версії 1 `returnToHabitat` обов'язково `true`: `selectedRoute.outbound` — Habitat → waypoints → destination; `return` — destination → waypoints у зворотному порядку → Habitat.
- Геометрії в `coordinates` — координати цільового local metric CRS у метрах. `traversedCells` — шлях клітин у відповідному travel order.
- Обидві ноги мають щонайменше дві координати, скінченні координати й невід'ємну скінченну довжину.
- `totalDistanceM = outbound.distanceM + return.distanceM` (допуск перевірки frontend 0.5 м).
- `elevationProfile.distanceM` зростає кумулятивно від Habitat: спершу outbound, після destination продовжується для return. Кожен запис має leg, projected coordinate, raster cell і реальне значення DEM або `null` для NoData.
- `estimatedMovementTimeMinutes`, `estimatedEvaDurationMinutes`, `maximumSlopeDeg` можуть бути `null`, якщо модель їх не обчислює. Не підставляти вигадані значення.
- `riskMetrics`, `terrainWarnings`, `assumptions`, `metadata` мають пояснювати provenance й межі моделі. UI не називає цифри науково валідованими до окремої перевірки SCI-03.
- `status: 'success'` вимагає `feasible: true` і `selectedRoute`. `status: 'infeasible'` означає валідний розрахунок без маршруту, який задовольняє жорсткі умови; вимагає `feasible: false`. `selectedRoute` може бути присутнім лише як діагностичний кандидат із `selectedRoute.feasible === false`, щоб UI показав причину відмови; він не позначається прохідним маршрутом. `failureCode` може бути `no-feasible-route`. `status: 'failed'` означає, що розрахунок не завершився коректно; він вимагає `failureCode` і зрозумілий `failureReason`. `feasible: null` допустиме лише коли adapter не може визначити feasibility; така невизначеність має бути пояснена у warnings.
- `requestId` повертається без змін. UI відкидає старішу відповідь, якщо користувач уже запустив новий розрахунок або змінив параметри.

### Failure codes

`invalid-input`, `start-out-of-bounds`, `destination-out-of-bounds`, `nodata-endpoint`, `no-feasible-route`, `unsupported-mode`, `cancelled`, `calculation-error`.

Abort через `AbortSignal` може завершитися `DOMException('AbortError')`; UI трактує це як скасування, не як помилку користувача. Якщо adapter повертає `status: 'failed'`, він заповнює code/reason. Валідний розрахунок без прохідного шляху повертається як `status: 'infeasible'` з `failureCode: 'no-feasible-route'`; необов'язковий діагностичний кандидат може бути повернений лише з `feasible: false` і причиною.

## 5. Мінімальний приклад для Timur

У прикладі `timurRoutePlanner` — імпорт, який надасть SCI-02. Demo fixture лише показує узгоджений виклик.

```ts
import type { RoutePlannerAdapter, RoutePlannerInput } from '../domain/routing/types';
import { coordinateToCell } from '../domain/terrain/coordinates';
import { demoTerrain } from '../domain/terrain/demoFixture';
import { timurRoutePlanner } from '../adapters/scientific/timurRoutePlanner';

const startCoordinate = { x: 490, y: 505 };
const destinationCoordinate = { x: 2_950, y: 1_985 };
const startCell = coordinateToCell(demoTerrain, startCoordinate);
const destinationCell = coordinateToCell(demoTerrain, destinationCoordinate);
if (!startCell || !destinationCell) throw new Error('Selected point is outside terrain bounds');

const input: RoutePlannerInput = {
  requestId: 'EVA-07-001',
  terrain: demoTerrain, // replace with SCI-01's TerrainDataset loader
  start: { id: 'habitat', coordinate: startCoordinate, cell: { row: startCell.row, col: startCell.column } },
  destination: { id: 'site-a', coordinate: destinationCoordinate, cell: { row: destinationCell.row, col: destinationCell.column } },
  waypoints: [],
  constraints: { maxSlopeDeg: 15, noDataPolicy: 'reject-route' },
  evaAssumptions: {
    walkingSpeedMps: 2.6 / 3.6,
    evaTimeLimitMinutes: 480,
    scienceActivityMinutes: 45,
    safetyReserveMinutes: 30,
  },
  optimizationMode: 'riskAware',
  returnToHabitat: true,
  includeAlternatives: true,
};

const adapter: RoutePlannerAdapter = timurRoutePlanner;
const controller = new AbortController();
const result = await adapter.calculate(input, controller.signal);
// Before presenting it, call validateRouteResult(result, input.requestId).
```

Виробничу інтеграцію реалізовано в `src/adapters/scientific/sci02/`. `Sci02RoutePlannerAdapter` відповідає незміненому канонічному інтерфейсу, запускає SCI-02 у Web Worker і перетворює `TerrainDataset` від SCI-01 на межі адаптера. Demo адаптер доступний окремо як fallback. Деталі й результати перевірок наведено в `docs/SCI02_INTEGRATION.md` та `docs/SCI02_TEST_REPORT.md`.

## 6. Мінімальний інтеграційний тест

SCI-02 має надати тести на: відтворення request ID; start/destination cell mismatch; out-of-bounds; NoData старт/ціль і маршрут; дотримання slope limit; success/infeasible/failure shapes; одиниці й суму довжин; профіль обох напрямків; cancellation; застарілу відповідь; alternatives; незмінність вхідних TypedArray.

Frontend додатково запускає `validateRouteResult()` для кожної відповіді. Валідний TypeScript тип не замінює runtime-перевірку.

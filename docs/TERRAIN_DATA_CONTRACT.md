# Контракт інтеграції рельєфу Mars

**Версія контракту:** 1.0
**Власник контракту:** SCI-01 / TECH-01; SCI-02 — споживач
**Споживачі:** SCI-02, Timur; TECH-01, вебзастосунок
**Канонічні типи:** `src/domain/terrain/types.ts`

Цей документ задає формат попередньо підготовленого фрагмента рельєфу для вебзастосунку. Поточне завдання Project Lead прямо делегує TECH-01 отримання та інтеграцію SCI-01 Jezero. Типи версії 1.0 не змінено; це конкретний набір даних чинного контракту.

## 1. Канонічний TypeScript-інтерфейс

```ts
export interface RasterTransform {
  // x = x0 + column*a + row*b; y = y0 + column*d + row*e
  coefficients: readonly [x0: number, a: number, b: number, y0: number, d: number, e: number];
}

export interface TerrainDatasetMetadata {
  id: string;
  title: string;
  sourceOrganization: string;
  sourceUrl: string;
  horizontalCrs: string;
  horizontalCrsDefinition: string;
  coordinateTransform: {
    sourceCrs: string;
    sourceCrsDefinition: string;
    targetCrs: string;
    method: string;
    definition: string;
  };
  horizontalUnit: 'm';
  verticalUnit: 'm';
  verticalDatum: string;
  limitations: string[];
  provenance: 'synthetic' | 'scientific';
  hazardProvenance?: {
    sourceOrganization: string;
    sourceUrl: string;
    limitations: string[];
  };
}

export interface TerrainDataset extends TerrainDatasetMetadata {
  width: number;
  height: number;
  cellSizeX: number;
  cellSizeY: number;
  transform: RasterTransform;
  elevationMeters: Float32Array;
  validMask: Uint8Array;
  hazardMask?: Uint8Array;
  imagery?: {
    assetUrl: string;
    mimeType: string;
    description: string;
    alignment: 'terrain-grid';
  };
}
```

The complete declaration is maintained in `src/domain/terrain/types.ts`; when the interface changes, update this document and notify SCI-01 and SCI-02 before merging the change.

## 2. Grid dimensions і binary format

- `width` і `height` — цілі додатні числа в пікселях.
- Кількість висот і `validMask` дорівнює рівно `width × height`. Якщо присутня `hazardMask`, її довжина також має дорівнювати `width × height`.
- Висота: один `Float32` на комірку; у браузері представлення — `Float32Array`.
- Файл `elevation.f32le` зберігає 32-бітні IEEE-754 float у little-endian. Під час читання застосунок перевіряє довжину й декодує little-endian явно, а не покладається на native endianness хоста.
- Файл `valid.u8` містить один байт на комірку: `1` = значення висоти валідне; `0` = NoData. Інші значення заборонені. Значення маски не є ймовірністю якості.
- Необов'язковий `hazard.u8` — один байт на комірку: `1` = підтверджена непрохідна перешкода; `0` = тут не позначено перешкоду. Нуль не є доказом безпеки. Маска дозволена лише разом із `hazardProvenance`.
- Порядок масиву — row-major: `index = row * width + column`.
- `row = 0` — перший (верхній) рядок у файловому raster, `column = 0` — перший (лівий) стовпець. `column` зростає за порядком зберігання зліва направо, `row` — згори вниз. Географічний напрямок кожного кроку задає повний affine transform; для north-up raster рядки зазвичай рухаються на південь, але для повернутого/скошеного raster не можна виводити напрямок лише з індексу.
- Значення висоти в комірці з `validMask[index] === 0` ніколи не читають. Його можна записати як `NaN`, але маска є авторитетною. Числовий sentinel без маски недостатній.
- Для кожної комірки з `validMask[index] === 1` висота має бути скінченним Float32. Для маски `0` значення ігнорується; у тестах рекомендовано зберігати там `NaN`, щоб випадкове читання було помітним.
- `cellSizeX` і `cellSizeY` — номінальні довжини affine pixel-векторів у метрах: `hypot(a,d)` і `hypot(b,e)`. Відстані SCI-02 обчислює з повної affine transform; ці два числа не замінюють її для повернутих/скошених сіток.

## 3. CRS, affine transform та індексація

`horizontalCrs` — ідентифікатор цільової проєктованої системи координат, у якій frontend і SCI-02 отримують точки; `horizontalCrsDefinition` — її повне authoritative визначення (WKT2 або еквівалент). Потрібна метрична система координат Mars із визначеними осями: `x` на схід, `y` на північ. Перед передаванням масиву SCI-01 узгоджує один горизонтальний CRS для місії та включає обидва поля в metadata.

Latitude/longitude у градусах **не є метрами** і не можуть напряму використовуватися як `x`, `y` або як індекси raster. Для перетворення потрібна явна трансформація від указаного джерельного Mars geographic CRS до `horizontalCrs`. `coordinateTransform` фіксує source та target CRS, повне визначення source CRS, метод і формальне визначення/параметри операції; `targetCrs` мусить точно дорівнювати `horizontalCrs`. Не можна підміняти планетарну систему координат земним WGS 84 без явного наукового рішення.

Affine transform має стандартну шестикомпонентну форму:

```text
x = x0 + column*a + row*b
y = y0 + column*d + row*e
```

`(x0, y0)` — координата **верхнього лівого кута першого пікселя** raster, тобто pixel-corner convention. Вхідні `column`/`row` до формул affine — безперервні координати від цього кута; центр комірки з індексами `(column, row)` обчислюється підстановкою `(column + 0.5, row + 0.5)`. Матриця може містити поворот/скіс: `b` і `d` не вважаються нульовими без перевірки. Застосунок обертає повну 2×2 матрицю для перетворення map coordinate → column/row; комірка визначається `floor(column)`, `floor(row)` у межах `[0,width) × [0,height)`.

Контракт зберігає висоту в метрах від вертикального datum, записаного в `verticalDatum`. Метадані мають назвати datum/ареоїдну модель або чесно зафіксувати, що datum невідомий. Не можна видавати локальну відносну висоту за абсолютну.

## 4. NoData, sampling і валідація

- Висотну комірку можна читати лише коли `validMask[index] === 1` і значення скінченне.
- Відсутні значення не заповнюються, не переносяться з сусідніх комірок і не інтерполюються мовчки.
- Для маршруту NoData-комірка непрохідна. Якщо raster не має висоти для вибраного старту/цілі, adapter повертає окрему помилку; якщо маршрут перетинає таку комірку — повертає infeasible/failure з поясненням.
- `validateTerrainDataset()` перевіряє розміри, довжини TypedArray, `validMask`/`hazardMask` 0/1, скінченність кожної valid-висоти, метричні одиниці, заповнений ідентифікатор та повне визначення горизонтального CRS, source CRS та його визначення, target CRS, метод і визначення трансформації, відповідність transform target до `horizontalCrs`, stated vertical datum, скінченність affine coefficient і невиродженість affine matrix. Для `provenance: 'scientific'` обов'язкові організація-джерело й URL. Для hazard mask обов'язкові джерело, URL і обмеження саме цього шару.
- Sampling зараз nearest-cell. Якщо майбутня наукова методика використовуватиме інтерполяцію, її спосіб і поведінка на межі NoData мають бути явними в науковому модулі й результаті, а не прихованою поведінкою UI.

## 5. Зображення та інші шари

`imagery` необов'язкове; якщо воно присутнє, `alignment` має дорівнювати `'terrain-grid'`. Це декларація SCI-01, що шар уже вирівняний з DEM: той самий target CRS, `width`, `height` і повний affine transform. Отже піксель `i` зображення має відповідати висоті `i` у row-major DEM; окреме перепроєктування під час показу не відбувається. Зображення з іншим extent, resolution або transform до цього поля не підключається: для нього спершу треба узгодити окремий georeferenced layer contract та adapter. Самого збігу назв місця недостатньо. Застосунок не підтягує масивні вихідні DEM/знімки з віддаленого сервера під час відкриття сторінки.

У synthetic/demo режимі не додавайте `imagery` та не називайте синтетичні пікселі знімком NASA/USGS.

## 6. Provenance і наукові обмеження

Для наукового релізу SCI-01 має надати `id`, назву, організацію/інструмент-джерело, пряме джерельне посилання, ідентифікатор та повне визначення CRS, застосовану координатну трансформацію із source/target definitions, горизонтальні/вертикальні одиниці, vertical datum, nominal resolution та `limitations`. `provenance` має бути `scientific` лише для даних із задокументованим джерелом. Невідомі деталі позначаються явно, не виводяться з назви файла.

Якщо надається `hazardMask`, SCI-01 заповнює `hazardProvenance`. Відсутність шару означає, що hazard дані не надані; присутнє значення `0` означає тільки «перешкоду не позначено», а не сертифікацію безпечного проходу.

Дані DEMO в репозиторії мають `provenance: 'synthetic'`, порожній `sourceUrl` і описують обмеження. Наявність реального джерела не означає наукової перевірки маршруту; перевірку окремо виконує SCI-03.

## 7. Очікувана структура файлів SCI-01

```text
public/data/terrain/<dataset-id>/
├── metadata.json          # метадані, розміри, CRS, affine transform, datum
├── elevation.f32le        # width × height значень IEEE-754 Float32 little-endian
├── valid.u8               # width × height байтів маски 0=NoData, 1=valid
├── hazard.u8              # optional; 1=confirmed hazard; має мати hazardProvenance
└── imagery.<ext>          # optional; лише якщо описана/aligned у metadata
```

`metadata.json` містить JSON-поля `TerrainDatasetMetadata`, `width`, `height`, `cellSizeX`, `cellSizeY` і `transform`; у JSON не дублюються typed arrays. Loader додає їх після binary decode. Мінімальний готовий приклад цього layout є в `public/data/terrain/contract-fixture-3x2/`: метадані, 24-байтовий `elevation.f32le` (6 little-endian Float32) і 6-байтовий `valid.u8`. Це синтетична тестова фікстура, а не наукові дані.

Не додавати сирі повнорозмірні DEM чи проміжні продукти до репозиторію без погодження розміру й ліцензії. Передати компактний mission subset, який вже відповідає цьому контракту. Для великих файлів команда окремо погоджує artifact storage; frontend контракт лишається тим самим.

## 8. Мінімальний приклад завантаження

```ts
import type { TerrainDataset } from '../domain/terrain/types';
import { validateTerrainDataset } from '../domain/terrain/validateDataset';

async function getBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Terrain asset request failed: ${url} (${response.status})`);
  return response.arrayBuffer();
}

const metadata = await fetch('/data/terrain/<dataset-id>/metadata.json').then(async response => {
  if (!response.ok) throw new Error(`Terrain metadata request failed (${response.status})`);
  return response.json();
});
const [elevationBuffer, validBuffer] = await Promise.all([
  getBuffer('/data/terrain/<dataset-id>/elevation.f32le'),
  getBuffer('/data/terrain/<dataset-id>/valid.u8'),
]);

const cellCount = metadata.width * metadata.height;
const expectedBytes = cellCount * Float32Array.BYTES_PER_ELEMENT;
if (elevationBuffer.byteLength !== expectedBytes) throw new Error('Unexpected elevation byte length');
if (validBuffer.byteLength !== cellCount) throw new Error('Unexpected validity mask byte length');
const view = new DataView(elevationBuffer);
const elevationMeters = new Float32Array(cellCount);
for (let i = 0; i < elevationMeters.length; i += 1) elevationMeters[i] = view.getFloat32(i * 4, true);
const validMask = new Uint8Array(validBuffer);

const terrain: TerrainDataset = { ...metadata, elevationMeters, validMask };
const issues = validateTerrainDataset(terrain);
if (issues.length) throw new Error(`Invalid terrain dataset: ${issues.join('; ')}`);
```

Production loader може винести цей код у власний adapter, але має зберегти явну little-endian decode та runtime validation. Frontend перевіряє `validateTerrainDataset(terrain)` перед активацією шару. Adapter не змінює вихідні файли SCI-01.

## 9. Репозиторний test fixture

`src/domain/terrain/testFixture.ts` експортує типізований `terrainContractFixture`: raster 3×2 із повернутим affine transform, row-major значеннями та одним NoData пікселем. Такий самий набір у file layout SCI-01 лежить в `public/data/terrain/contract-fixture-3x2/`. Це перевірочна фікстура, не дані Mars. Вона навмисно відрізняється від north-up/square raster, щоб виявити припущення про нульовий skew, квадратні пікселі або pixel-center origin.

```ts
import { terrainContractFixture } from '../domain/terrain/testFixture';
import { rasterToProjected, sampleTerrain } from '../domain/terrain/coordinates';

const center = rasterToProjected(1.5, 0.5, terrainContractFixture.transform);
// center = { x: 1031, y: 1986.5 }; sampleTerrain(...) returns elevation 11 m.
const sample = sampleTerrain(terrainContractFixture, center);
```

## 10. Підключення від SCI-01

1. Надати mission subset за описаним file layout та ліцензію/джерело.
2. Узгодити точний Mars projected CRS із SCI-02 і TECH-01; не змінювати код/оси після старту суміжної реалізації без спільного оновлення контракту.
3. Заповнити всі обов'язкові метадані, зокрема vertical datum і трансформацію.
4. Запустити terrain contract тести на fixture, а потім адаптувати loader до SCI-01 файлів.
5. Передати набір SCI-03 для незалежної перевірки наукових властивостей. До перевірки UI показує `REAL DATA · VALIDATION PENDING`, а не `NASA VERIFIED`.


## Реалізований набір Jezero (SCI-01)

Каталог `public/data/terrain/jezero-hirise-1km/`: `metadata.json`, `elevation.f32le` (1 000 000 байтів), `valid.u8` (250 000 байтів), `terrain.tif`, `orthoimage.png`, `hillshade.png`, `source-stac-item.json`, `source-processing.txt`, `source-pds-label.txt`, `validation.json`.

Сітка 500×500, row-major `index = row*500+col`, Float32 little-endian, висоти вже в метрах; браузер не повторює scale/offset. Рядки з півночі на південь, стовпці із заходу на схід. Кутовий GDAL affine `[-500,2,0,500,0,-2]`; центр комірки `(col,row)` дорівнює `(-499+2*col,499-2*row)` метрів. Кути покриття ±500 м; центри ±499 м. Маска Uint8: 1 — скінченна висота, 0 — NoData (NaN у DEM). Відсутня hazard mask не означає безпечну поверхню.

Локальний CRS: `+proj=eqc +lat_ts=18.44 +lat_0=18.44 +lon_0=77.45 +R=3396190 +units=m +no_defs`. Повний WKT і перетворення джерела містяться в metadata. Довгота східна, широта planetocentric, кути у градусах лише для географічного відображення. Вертикальний datum — Mars2000 equipotential surface / areoid за PDS label; вертикальне перетворення не застосовано.

PNG має 500×500 пікселів і той самий affine та CRS. Його кут (0,0) відповідає куту DEM, а центр пікселя — центру комірки. SVG застосовує всі шість коефіцієнтів affine. Ортофото — візуальний шар, не hazard mask.

```ts
import { loadTerrainDataset } from '../src/adapters/scientific/loadTerrainDataset';
const terrain = await loadTerrainDataset('/data/terrain/jezero-hirise-1km/metadata.json');
// terrain: TerrainDataset; передати існуючому RoutePlannerAdapter.calculate(input, signal)
```

Мінімальна синтетична fixture залишається в `src/domain/terrain/testFixture.ts`; реальні контрольні відліки — у `validation.json`. Loader відхиляє хибні розміри бінарних файлів, некоректні метадані, маски й affine. SCI-02 отримує ортогональний метричний растр без повторного resampling. Деталі походження та обмежень: DATA_SOURCES.md і SCIENTIFIC_METHOD.md.

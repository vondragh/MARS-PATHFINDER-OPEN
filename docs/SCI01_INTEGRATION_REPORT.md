# SCI-01: звіт інтеграції Jezero

Дата: 2026-11-15. Статус: **технічну інтеграцію виконано; незалежну наукову/операційну валідацію не встановлено**.

## Результат

Джерело NASA MRO/HiRISE / UA / USGS, продукт DTEEC_045994_1985_046060_1985_U01. Отримано фрагмент 1×1 км біля 18.44° N, 77.45° E. Сітка 500×500, крок 2 м, локальна метрична EQC. Реальна висота -2588.523681640625…-2546.74755859375 м. Valid 250000, NoData 0. DEM та справжнє HiRISE ортофото приведені до однакових CRS/affine/розмірів.

Основний запуск отримав 33 983 681 байт геоданих/метаданих. Окремі перевірки PDS label читали лише 32 КіБ за запит; жодного повного IMG чи COG не завантажено. Повний журнал основного запуску — validation.json. Скрипт тепер також включає bounded PDS label retrieval; цей блок перевірено окремо, весь конвеєр після додавання label повторно не запускався.

Frontend за замовчуванням завантажує Jezero. Помилка завантаження видима з Retry; синтетичний набір обирається явно. Зміна набору очищує попередні маршрути. SCI-02 A* лишається окремо вибраним worker adapter, Demo доступний. Алгоритм SCI-02 і canonical інтерфейси не змінені.

## Перевірки

| Перевірка | Результат |
|---|---|
| Strict TypeScript `npm run typecheck` | PASS |
| `npm test` | PASS: 49 тестів, 9 файлів, включно з SCI-02 та frontend |
| `npm run build` | PASS, окремий worker bundle |
| Усі 250000 nearest source відліків | PASS, максимальна різниця 0 м |
| GeoTIFF = canonical Float32 binary | PASS |
| SHA-256 локальних артефактів | PASS |
| PNG DEM/ortho grid dimensions | PASS, 500×500 |
| Ортогональність, 2 м spacing, pixel centers | PASS |
| Loader truncated binary та asynchronous failure | PASS |
| Реальний DEM: два SCI-02 режими, профіль, довжина | PASS |
| NoData на старті контрольної копії | PASS: маршрут відхилено |
| Chromium: real Worker calculation, comparison | PASS |
| Chromium: selected route map/analysis/profile | PASS, shortest і riskAware |
| Chromium: EVA rejection | PASS, ліміт 1 год проти ~1 год 50 хв потреби |
| Chromium: synthetic switch clears routes | PASS |
| Chromium console errors/warnings | 0 |
| Незалежна SCI-03 перевірка DEM/EVA | NOT RUN / pending |

Браузерний сценарій: default slope 15°, speed 2.6 км/год, activity 45 хв, reserve 30 хв. Кратчайший маршрут ~754 м назовні і ~754 м назад (1.51 км), maximum sampled slope ~12.1°. Risk-aware ~1.52 км. При 8 годинах бюджет дотримано; при 1 годині UI показує перевищення ~50 хв, хоча шлях знайдено. Scientific validation залишається Not established. Ці числа — результати конкретного прикладу, не сертифікація EVA.

Локальний скріншот перевірки (поза Git baseline): `docs/ui-artifacts/sci01-jezero-browser.png`. Вікно 1440×900, фактичний viewport 1440×843 через browser chrome; горизонтального overflow немає. Перевірено декодування ортофото 500×500. Наявні UX артефакти інших робіт збережено.

## Обмеження та Git

Відсутні класифікована hazard map, перевірка FOM, незалежна точність DEM та фізіологічна валідація моделі EVA. Planning points не є підтвердженими science targets. Sampling 2 м не дорівнює просторовій точності 2 м. Геодезична перевірка відстаней використовує сферичну модель Mars із metadata.

Робота виконана в існуючій `feature/mission-control-web`, базовий HEAD `2ed06ba`. Попередні незакомічені TEST_REPORT/UX/UI файли не перезаписані. На момент перевірки SCI-01 зміни залишалися локальними; публікація baseline виконується окремо після підтвердження. Remote: https://github.com/vondragh/MARS-PATHFINDER.git.

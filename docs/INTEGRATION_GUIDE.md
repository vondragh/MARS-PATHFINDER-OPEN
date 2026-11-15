# Посібник інтеграції наукових модулів

## SCI-01 — Kolya

1. Підготуйте компактний terrain subset та metadata за `TERRAIN_DATA_CONTRACT.md`.
2. Перевірте CRS, осі, affine transform і vertical datum із Timur перед передачею.
3. Додайте binary raster як `Float32 little-endian` і маску `Uint8 0/1`; JSON-масив висот не використовуйте.
4. Передайте походження, ліцензію, обмеження й опис трансформації. Не позначайте неперевірену provenance як scientific.
5. TECH-01 під'єднає файл через loader; оригінальні наукові значення не переписуються.

## SCI-02 — Timur

1. Імплементуйте `RoutePlannerAdapter` відповідно до `ROUTING_INTEGRATION_CONTRACT.md`.
2. Працюйте в координатах спільного projected Mars CRS та перевіряйте cell index за affine transform.
3. Явно визначте slope/NoData behavior, часові припущення, warnings і unsupported modes.
4. Покрийте contract тести для `TerrainDataset` fixture та failure cases.
5. Надайте entry point, наприклад `src/adapters/scientific/timurRoutePlanner.ts`; TECH-01 замінить demo adapter у одному composition root.

Зміни типів спершу погоджуються в межах SCI-01/SCI-02/TECH-01, потім одночасно оновлюються в коді та обох контрактах. До погодження frontend не змінює публічні поля API.

## SCI-03 — наукова перевірка

Підтвердити походження та одиниці DEM, межі даних, сценарії маршруту, припущення про мобільність, значення slope/feasibility та перелік невирішених обмежень. До цього UI не використовує `NASA VERIFIED` або інші підтверджувальні твердження.

## Запуск локально

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Встановлений демо-адаптер ізолюється заміною dependency у `useMissionController`; UI-компонентам не потрібно знати, як SCI-02 реалізує маршрут.

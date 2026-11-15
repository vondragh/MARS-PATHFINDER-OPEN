# SCI-01: джерела даних Jezero

Інтегровано реальний HiRISE DTM `DTEEC_045994_1985_046060_1985_U01`, NASA MRO / University of Arizona, розповсюдження USGS Astrogeology. Це похідний фрагмент, а не синтетична поверхня.

- [Офіційний STAC item](https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_socet_dtms/items/DTEEC_045994_1985_046060_1985_U01)
- [Документація USGS HiRISE DTM](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/)
- [Оригінальний PDS продукт](https://hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.IMG)

Точні URL DEM COG та ортофото `ESP_045994_1985_RED_A_01_ORTHO.tif` збережені у `public/data/terrain/jezero-hirise-1km/validation.json`. Ліцензія колекції USGS: CC0-1.0; походження NASA/UA/USGS збережено.

Область: центр 18.44° N, 77.45° E; межі 77.4411081492–77.4588918508° E, 18.4315646976–18.4484353024° N. Локальна площа 1 км², 500×500 пікселів із кроком 2 м.

Завантажено 33 983 681 байт у конвеєрі DEM/ortho/metadata через HTTP Range; повні COG не завантажувались. Ортофото-джерело має ~1.01 ГБ, але отримані лише потрібні byte ranges. Додатково для перевірки datum прочитано початкові 32 КіБ PDS IMG; збережено текст label. Ліміт на фактично отримані дані конвеєра — 200 МБ, на один range — 16 МБ. Пакети Python не входять у обсяг геоданих.

Перевірені raster metadata: DEM Float32, scale=1, offset=0, NoData=-3.4028226550889045e38. Узагальнені команди в source-processing.txt згадують UInt16, але фактичний COG має Float32; використано фактичні теги растра. Оригінальний PDS label задає Mars2000 equipotential surface (areoid), метри, scale=1, offset=0. Горизонтальний радіус PDS та перепроєктованого USGS COG різний; використано CRS саме COG.

STAC datetime не узгоджується з ESP orbit ID, тому дата знімання не заявляється як підтверджена. Значення висот і геометрію перевірено технічно; незалежна SCI-03 перевірка точності, придатності для EVA та моделі руху ще потрібна. FOM не класифіковано, карти небезпек немає. Крок 2 м не є гарантією точності або ефективної роздільної здатності.

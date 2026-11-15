# NASA Space Apps 2026 — матеріали для подання

Поля нижче підготовлено для кандидата [Martian Map](NASA_CHALLENGE_COMPLIANCE_UK.md), що додає два ресурси із вкладки Resources. Стабільне демо `c8e0feb` не містить цих інтеграцій; не подавати його як доказ роботи кандидата. SCI-04 і числові сценарії MCD не включено.

| Поле | Текст / доказ |
| --- | --- |
| NASA Data Sources | NASA MRO HiRISE stereo terrain and orthorectified imagery; PDS `MRO-M-HIRISE-5-DTM-V1.0`, DOI [10.17189/1520227](https://doi.org/10.17189/1520227). The Jezero terrain grid supplies slope, route and elevation-profile inputs; the aligned orthorectified image provides basemap context. JPL Mars Trek serves a Mars Global Surveyor MOLA regional relief tile for orientation. NASA Perseverance Raw Images Gallery provides two archived Sol 467 Mastcam-Z frames as context for the reconnaissance objective. Exact products and roles are in [Data sources](../DATA_SOURCES.md). |
| Other Data Sources | USGS Astrogeology supplies the CC0-1.0 analysis-ready distribution of the NASA HiRISE products. Synthetic fixtures are generated within the project. System fonts and third-party software are listed separately; do not list unused research sources as project data. |
| Open Source License | Apache-2.0 for the team's original eligible work, as confirmed by the team; [LICENSE](../LICENSE). External data and dependencies retain their own terms. Repository visibility has not been changed. |
| Project References | Provide the approved candidate project URL and a separate short demo link. [Earlier stable site](https://mars-pathfinder.pages.dev/) is not the candidate. [Scientific sources](../DATA_SOURCES.md), [limitations](../SCIENTIFIC_LIMITATIONS.md), [third-party notices](../THIRD_PARTY_NOTICES.md). |
| AI Tool Usage | [AI usage disclosure](../AI_USAGE.md); copy into the submission and label any AI-assisted media supplied separately. No AI service runs in the stable application. |
| Team Contributors | [Human contributors and roles](../CONTRIBUTORS.md); verify preferred display names, any additional work and the registered team roster. |

## Історична оцінка стабільного демо

[Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/) — перевірено розділи Summary, Objectives, Potential Considerations та Resources в даних офіційної сторінки 15 листопада 2026 року. [Офіційний сайт 2026](https://www.spaceappschallenge.org/2026/), [правила](https://www.spaceappschallenge.org/legal/), [посібник подання](https://www.spaceappschallenge.org/resources/project-submission-guide/). [Офіційна сторінка події 2026](https://www.spaceappschallenge.org/2026/local-events/islamabad/) підтверджує критерій Global Awards: використати щонайменше одне джерело NASA, зазначене для свого challenge, і пояснити його внесок.

| Resources організаторів | Фактичне використання |
| --- | --- |
| [JPL Mars Trek](https://trek.nasa.gov/mars/) | Не інтегровано; UI не запитує тайли Trek. |
| [USGS–NASA Planetary Geologic Mapping Program](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | Не інтегровано. USGS Astrogeology ARD/STAC HiRISE — інший продукт; спільний постачальник не підтверджує використання зазначеної геологічної карти. |
| [Curiosity’s Proposed Path Up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | Приклад подання маршруту; не джерело коду, зображень чи даних застосунку. |
| [NASA Worldview](https://worldview.earthdata.nasa.gov/) | Не інтегровано. |
| [Mars Perseverance Raw Images Gallery](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | Не інтегровано. MEDA — інший архів і інструмент тієї самої місії. |

**Додаткові джерела:** NASA MRO HiRISE/PDS і USGS ARD/STAC для оптики й топографії використовуються стабільною версією, але точні продукти не названі у вкладці Resources. MEDA (Perseverance, історична атмосфера), DONKI (архівний контекст сонячних подій) та MCD (кліматичні сценарії) теж не названі й доступні лише в локальному SCI-04. SEP/IPS перевірялися для дослідження, але не надходять до застосунку. За наявними доказами умова використання принаймні одного джерела зі списку **не підтверджена**; потрібні його фактичне використання або письмове роз'яснення організаторів про зарахування HiRISE.

| Вимога / рекомендація | Стан |
| --- | --- |
| Інтегрована локальна карта або маршрут для Marswalk | Реалізовано для Jezero: ортофото, DEM, вибір маршруту, порівняння і профіль висот. |
| Поєднати дані кількох наукових місій NASA | Не виконано у stable: DTM та ортофото — один MRO; USGS є розповсюджувачем. Локальна MEDA додає контекст другої місії, але не входить до stable і не є шаром поточних умов. DONKI й MCD не можна зараховувати як окремі місії NASA. |
| Розглянути щонайменше три типи даних | Рекомендація, не жорсткий мінімум. Stable має оптичні й топографічні дані; локальна SCI-04 додає атмосферний контекст. |
| Наукова мета й маршрут робіт, ризики та мобільність | Є вибір точки, параметри EVA та обмеження схилу. Немає обґрунтованої наукової цілі для ділянки або незалежного шару небезпек, що підтверджує обхід великих перешкод. Вибір формату, часу, POV-зображень і засобів пересування — факультативний. |
| Поточні умови | Stable не надає оновлень. Архів MEDA, модельні оцінки DONKI і кліматологія MCD не замінюють їх. Сторінка допускає історичні/статичні матеріали; відсутність live feed не означає автоматичну дискваліфікацію. |

Релізний контроль: локальна згода ліцензувати внески не є дозволом розкрити історичні email/імена хостів. Перед зміною видимості повторно звірити всі віддалені refs, погодити історичні метадані та переконатися, що коміти SCI-04 з числовими результатами MCD недосяжні з будь-якого публічного ref. Якщо SCI-04 публікуватимуть згодом, отримати письмові умови для вихідних даних або створити окремого кандидата від чистої щодо цих даних бази; перевірити також знімки екрана й текстову документацію.

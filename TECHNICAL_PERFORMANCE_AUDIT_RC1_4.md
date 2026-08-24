# IceFresh RC1.4 — технический аудит + производительность

Дата: 21 августа 2026  
Версия: `12.0.0-rc.1.4`  
Статус: **Release Candidate / production не опубликован**

## Итог

RC1.4 завершает технический/performance этап после RC1.3 QA. Основные исправления направлены на четыре зоны: серверная изоляция финансов сотрудника, масштабируемые расчёты склада/финансов, безопасный realtime, уменьшение публичного и PWA payload.

**Технический verdict:** PASS как source-level Release Candidate.  
**Production verdict:** NO-GO до clean build/CI, staging migration, authenticated E2E/mobile и финального security gate.

## Что исправлено

### 1. Серверная изоляция финансов staff

- Прямой `SELECT` finance-bearing `orders`/`order_items` переводится на manager-only RLS.
- Для staff добавлен `list_orders_operational_rc()` без `unit_price`, `paid_amount`, `total_amount`, `debt_amount`.
- Для staff добавлен `save_order_operational_rc()` без передачи цены/оплаты из браузера.
- Цена нового товара определяется сервером по `products.default_price`, существующая индивидуальная цена сохраняется.
- Переходы статусов сотрудника ограничиваются серверным workflow.
- Низкоуровневый `save_order_rc()` больше не является browser-facing RPC.

### 2. Склад и финансы больше не считаются по усечённой истории

- `get_inventory_summary_rc()` агрегирует полный stock ledger на сервере.
- UI загружает только небольшой recent-history ledger для просмотра, а не для расчёта баланса.
- `get_finance_summary_rc()` агрегирует полный financial ledger и считает долг **по каждому заказу до суммирования**.
- Переплата по одному заказу больше не может скрыть долг по другому.
- `get_product_sales_summary_rc()` формирует продуктовые показатели на сервере.

### 3. Realtime без утечки финансов

- Staff больше не должен подписываться на finance-bearing `orders`/`order_items`.
- Добавлен `order_change_signal` — минимальный сигнал изменения заказа без цен/оплат/долгов.
- После сигнала staff перечитывает безопасный operational RPC.
- Добавлено coalescing-поведение `refreshInFlight/refreshQueued`, чтобы серия realtime событий не запускала параллельные полные refresh.

### 4. Public order endpoint

- Реально проверяется размер UTF-8 body после чтения, а не только `Content-Length`.
- IP hash использует отдельный `PUBLIC_REQUEST_HMAC_SECRET`; service-role key не используется как HMAC secret.
- Поддерживается явный `ICEFRESH_ORGANIZATION_ID`.
- Если ID не задан и в БД не ровно одна организация, endpoint работает fail-closed.

### 5. AI/Worker configuration

- Supabase URL и publishable key убраны из hardcoded worker constants.
- Worker принимает `SUPABASE_URL` и `SUPABASE_PUBLISHABLE_KEY` из environment.
- Сырые provider/service-role secrets в public source не обнаружены.

## Производительность

Сравнение выполнено с сохранённым RC1.3 на одинаковом наборе исходных ресурсов. Оценка first-view transfer использует gzip для текстовых ресурсов и фактический размер уже сжатых изображений; внешняя Supabase SDK и HTTP overhead в оценку не включены.

| Метрика | RC1.3 | RC1.4 | Изменение |
|---|---:|---:|---:|
| Весь `public/` | 2,910,000 B | 853,495 B | **-70.7%** |
| `public/assets/` | 972,866 B | 581,678 B | **-40.2%** |
| PWA precache | 1,174,837 B / 19 файлов | 228,346 B / 12 файлов | **-80.6%** |
| Оценка mobile first-view transfer | 441,616 B | 131,930 B | **-70.1%** |
| Mobile hero | 159,806 B | 53,278 B | **-66.7%** |
| Logo payload | 227,830 B JS/base64 | 23,742 B WebP | **-89.6%** |
| Social preview | 1,711,985 B PNG | 63,587 B JPG | **-96.3%** |

### Изменения frontend performance

- Удалён `logo-data.js`; логотип теперь обычный WebP.
- Добавлен responsive `<picture>` и отдельный mobile hero 720 px.
- Hero preload использует `imagesrcset/imagesizes`.
- Gallery/product images используют lazy loading/async decoding там, где это уместно.
- PWA больше не precache-ит hero/product/gallery изображения; они runtime-cache после первого использования.
- Service worker регистрируется после critical boot через idle/timeout.
- Добавлены preconnect к Supabase/CDN.
- Удалены QA/starter-файлы из публичного release payload.

## База данных / производительность

Live Supabase Performance Advisor на текущей практически пустой базе показывает только `unused_index` уровня INFO. Это **не основание удалять индексы сейчас**: статистика использования ещё не репрезентативна. После появления реального объёма данных индексы следует пересмотреть по query statistics/EXPLAIN.

RC1.4 migration добавляет server-side aggregate RPC, что предотвращает линейный рост frontend payload при росте ledger. Recent history остаётся ограниченной по количеству строк.

## Проверки

### PASS

- JS syntax: `public/app.js`, `routes.js`, `core.js`, `sw.js`.
- TypeScript syntax (`node --experimental-strip-types --check`): `worker/ai-provider.ts`, `worker/ai-assistant.ts`, `worker/index.ts`, `public-order-request/index.ts`.
- Secret-pattern scan: нет `sk-proj-*`, `sb_secret_*`, private key blocks.
- Static/source regression: **38/38 PASS**.
- PWA raw precache budget: **228,346 B < 300 KB**.
- Максимальный локальный public asset после оптимизации: desktop hero ~160 KB.
- Release package scripts дополнены `test:static` и `verify:release`.

### Не засчитано как PASS

Полный `tests/*.test.mjs`: **45 PASS / 9 FAIL из 54**. Все 9 падений требуют отсутствующий production build artifact:

- 6 AI endpoint tests не могут импортировать `dist/server/index.js`.
- 2 worker route tests не могут импортировать `dist/server/index.js`.
- 1 worker/static test не находит `dist/server/wrangler.json`.

Это не интерпретируется как «9 найденных дефектов», но и не превращается в PASS. Полный gate должен быть повторён после успешного production build.

`npm ci` в текущей среде не завершился в пределах 180 секунд, а локального полного dependency cache нет; поэтому `vinext build`, ESLint и build-dependent tests здесь честно не засчитаны.

### SQL migration execution

`202608210001_rc14_security_performance.sql` **не применён к production**. Это намеренно: migration меняет RLS/grants и должна применяться вместе с RC1 accounting migration и RC1.4 frontend в coordinated cutover. Source-level regression проверяет ключевые свойства migration, но реальное PostgreSQL выполнение обязательно проверить на staging перед production.

## Установленные инструменты

- **Supabase** — использован: live schema/realtime/performance state.
- **Google Drive** — использован для snapshot/versioning и release artifacts.
- **Sitelemetry** — performance audit текущему аккаунту недоступен (`This audit is unavailable for this account`), поэтому результат не засчитан.
- **Testifly** — подключение возвращает `401 Unauthorized`, поэтому browser test run не засчитан.
- **Codex Security** — сознательно оставлен на самый последний release candidate по принятому плану.

## Release gates перед GO

1. Создать staging/эквивалент безопасной тестовой БД.
2. `npm ci` в чистом CI окружении.
3. `npm run verify:release` — build + lint + полный test suite должны быть 100% green.
4. Применить на staging последовательно RC1 accounting migration и RC1.4 migration.
5. Проверить owner/admin/staff RLS и finance isolation прямыми API сценариями.
6. E2E: производство → резерв → multi-item order → отгрузка → sale → payment → refund/correction.
7. Проверить concurrent/idempotency сценарии.
8. Реальные iPhone/Android + desktop.
9. Повторить Supabase Security/Performance Advisor; включить Leaked Password Protection.
10. Финальный Codex Security scan.
11. Backup/restore rehearsal и затем coordinated production cutover.

## Рекомендация

RC1.4 зафиксировать как **Technical Audit + Performance candidate**. Новые функции до прохождения release gates не добавлять. Следующий этап должен быть не feature-development, а staging/CI/E2E/security-finalization.

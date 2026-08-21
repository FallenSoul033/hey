# IceFresh.kz CRM

Независимая версия внутренней CRM IceFresh.kz на React + Vite + Supabase.

## RC2

- серверная финансовая сводка через `get_finance_summary_rc()`;
- отменённые и архивированные заказы не учитываются в выручке;
- owner-only безопасное удаление через `archive_order_owner_rc()`;
- создание и изменение заказов через защищённые manager/staff RPC;
- подробная карточка системного события с `details`, request ID и audit trail;
- отдельная прокрутка sidebar и адаптивное мобильное меню;
- финансовые данные скрыты от `staff`;
- CI: Node 22, lint, tests, build.

## Локальный запуск

1. Скопировать `.env.example` в `.env`.
2. Заполнить `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. `npm install`
4. `npm run dev`

Секретный `service_role` ключ во frontend не используется.

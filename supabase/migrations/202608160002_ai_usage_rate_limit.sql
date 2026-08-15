-- Persistent AI usage reservations keep OpenAI costs bounded across worker restarts.
-- Only active owners and administrators can read or create their own usage rows.

create table public.ai_usage (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index ai_usage_organization_user_requested_idx
  on public.ai_usage(organization_id, user_id, requested_at desc);
create index ai_usage_user_id_idx
  on public.ai_usage(user_id);

alter table public.ai_usage enable row level security;

create policy ai_usage_manager_select
  on public.ai_usage for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and user_id = (select auth.uid())
    and (select private.is_manager())
  );

create policy ai_usage_manager_insert
  on public.ai_usage for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and user_id = (select auth.uid())
    and (select private.is_manager())
  );

revoke all privileges on table public.ai_usage from public, anon, authenticated;
grant select (id, organization_id, user_id, requested_at), insert (organization_id, user_id)
  on public.ai_usage to authenticated;
grant usage on sequence public.ai_usage_id_seq to authenticated;

comment on table public.ai_usage is
  'AI request reservations used only for server-side hourly cost limits; no prompts or responses are stored.';

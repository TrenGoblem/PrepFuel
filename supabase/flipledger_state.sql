-- FlipLedger cloud state, using the same Supabase Auth project as Fuelr.
create table if not exists public.flipledger_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"projects":[],"transactions":[],"settings":{"businessName":"FlipLedger","openingProfit":0}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.flipledger_states enable row level security;

drop policy if exists "flipledger_select_own" on public.flipledger_states;
create policy "flipledger_select_own"
on public.flipledger_states
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "flipledger_insert_own" on public.flipledger_states;
create policy "flipledger_insert_own"
on public.flipledger_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "flipledger_update_own" on public.flipledger_states;
create policy "flipledger_update_own"
on public.flipledger_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "flipledger_delete_own" on public.flipledger_states;
create policy "flipledger_delete_own"
on public.flipledger_states
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.flipledger_states to authenticated;
revoke all on public.flipledger_states from anon;

-- Run in the Supabase SQL editor to create private, per-user recipe storage.
create table if not exists public.gather_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"lists":[],"recipes":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gather_data enable row level security;

-- Browser clients get only the permissions the app needs, and no anonymous access.
revoke all on table public.gather_data from anon, authenticated;
grant select, insert, update on table public.gather_data to authenticated;

drop policy if exists "Users can read their own Gather data" on public.gather_data;
drop policy if exists "Users can create their own Gather data" on public.gather_data;
drop policy if exists "Users can update their own Gather data" on public.gather_data;
drop policy if exists "Gather data requires MFA (AAL2)" on public.gather_data;
drop policy if exists "Gather data MFA for enrolled users" on public.gather_data;

-- Enforce AAL2 only for accounts that opted into MFA. Restrictive policies
-- are combined with AND, so an extra permissive policy cannot bypass this.
create policy "Gather data MFA for enrolled users"
  on public.gather_data as restrictive for all to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  )
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

create policy "Users can read their own Gather data"
  on public.gather_data for select to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

create policy "Users can create their own Gather data"
  on public.gather_data for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

create policy "Users can update their own Gather data"
  on public.gather_data for update to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  )
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

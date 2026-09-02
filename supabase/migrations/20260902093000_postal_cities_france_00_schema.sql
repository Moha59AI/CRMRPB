/* Généré depuis geo.api.gouv.fr — communes de France. */
create table if not exists public.postal_code_cities (
  postal_code text not null,
  city text not null,
  citycode text not null,
  population integer not null default 0,
  primary key (postal_code, citycode)
);
alter table public.postal_code_cities enable row level security;
revoke all on public.postal_code_cities from anon, authenticated;
grant select, insert, update, delete on public.postal_code_cities to authenticated;

drop policy if exists "select_postal_code_cities" on public.postal_code_cities;
create policy "select_postal_code_cities" on public.postal_code_cities for select to authenticated using (true);
drop policy if exists "insert_postal_code_cities" on public.postal_code_cities;
create policy "insert_postal_code_cities" on public.postal_code_cities for insert to authenticated with check (public.a_role(array['admin']));
drop policy if exists "update_postal_code_cities" on public.postal_code_cities;
create policy "update_postal_code_cities" on public.postal_code_cities for update to authenticated using (public.a_role(array['admin'])) with check (public.a_role(array['admin']));
drop policy if exists "delete_postal_code_cities" on public.postal_code_cities;
create policy "delete_postal_code_cities" on public.postal_code_cities for delete to authenticated using (public.a_role(array['admin']));


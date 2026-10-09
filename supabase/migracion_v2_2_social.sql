-- ============================================================
-- Nutri Gym — Migración v2.2: perfil social + amigos
-- Para bases EXISTENTES (la tuya). Pegar en Supabase → SQL Editor → Run.
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- 1) Perfil social: foto, bio y resumen del día (kcal, meta, racha).
create table if not exists public.perfiles (
  user_id uuid primary key references auth.users on delete cascade,
  usuario text not null default '',
  foto text,
  bio text,
  meta_kcal int default 0,
  kcal_hoy int default 0,
  cumplio boolean default false,
  racha int default 0,
  actualizado timestamptz not null default now()
);

alter table public.perfiles enable row level security;

drop policy if exists "perfiles_ver" on public.perfiles;
create policy "perfiles_ver" on public.perfiles
  for select to authenticated using (true);

drop policy if exists "perfiles_mio" on public.perfiles;
create policy "perfiles_mio" on public.perfiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Amistades: uno pide, el otro acepta.
create table if not exists public.amistades (
  id bigint generated always as identity primary key,
  uno uuid not null references auth.users on delete cascade,
  dos uuid not null references auth.users on delete cascade,
  estado text not null default 'pendiente',
  actualizado timestamptz not null default now(),
  unique (uno, dos),
  check (uno <> dos)
);

alter table public.amistades enable row level security;

drop policy if exists "amistades_ver" on public.amistades;
create policy "amistades_ver" on public.amistades
  for select using (auth.uid() = uno or auth.uid() = dos);

drop policy if exists "amistades_pedir" on public.amistades;
create policy "amistades_pedir" on public.amistades
  for insert with check (auth.uid() = uno);

drop policy if exists "amistades_responder" on public.amistades;
create policy "amistades_responder" on public.amistades
  for update using (auth.uid() = dos) with check (auth.uid() = dos);

drop policy if exists "amistades_quitar" on public.amistades;
create policy "amistades_quitar" on public.amistades
  for delete using (auth.uid() = uno or auth.uid() = dos);

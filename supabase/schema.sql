-- ============================================================
-- Nutri Gym v2.1 — Esquema de la nube (Supabase)
-- Cómo usarlo:
--   1) Abre tu proyecto de Supabase → SQL Editor → New query
--   2) Pega TODO este archivo
--   3) Pulsa Run (▶). Se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- 1) Tabla única que guarda TODOS tus datos sincronizados.
--    coleccion = tipo de dato: meals | weights | favorites | water | platos | kv
--                (kv guarda ajustes, perfil, prompt de IA, agua por día, gym…)
--    clave     = identificador de la fila dentro de esa colección
--    contenido = el registro completo en JSON
--    eliminado = marca de "tombstone": si borras algo en un dispositivo,
--                el resto de dispositivos también lo borra
create table if not exists public.registros (
  user_id uuid not null references auth.users on delete cascade,
  coleccion text not null,
  clave text not null,
  contenido jsonb,
  actualizado timestamptz not null default now(),
  eliminado boolean not null default false,
  primary key (user_id, coleccion, clave)
);

-- Para bajar solo lo nuevo desde la última sincronización
create index if not exists registros_user_actualizado_idx
  on public.registros (user_id, actualizado);

-- 2) Seguridad (RLS): cada cuenta SOLO ve y edita SUS filas.
--    Sin esto, la clave pública "anon" del navegador podría leer
--    los datos de otros; con esto, Supabase los bloquea siempre.
alter table public.registros enable row level security;

drop policy if exists "registros_propios" on public.registros;
create policy "registros_propios" on public.registros
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) Vistas legibles: como si fueran tablas separadas.
--    Cada vista muestra SOLO tus filas vivas y en lenguaje claro.
--    (security_invoker = la vista respeta los permisos de arriba.)

create or replace view public.comidas with (security_invoker = true) as
select
  clave as id,
  contenido ->> 'date'   as fecha,
  contenido ->> 'type'   as tipo,
  contenido ->> 'name'   as nombre,
  round((contenido -> 'totals' ->> 'kcal')::numeric)    as calorias,
  (contenido -> 'totals' ->> 'protein')::numeric        as proteinas,
  (contenido -> 'totals' ->> 'carbs')::numeric          as carbohidratos,
  (contenido -> 'totals' ->> 'fat')::numeric            as grasas,
  actualizado as sincronizado
from public.registros
where coleccion = 'meals' and not eliminado;

create or replace view public.pesos with (security_invoker = true) as
select
  clave as id,
  contenido ->> 'date' as fecha,
  (contenido ->> 'kg')::numeric as kilos,
  contenido ->> 'note' as nota,
  actualizado as sincronizado
from public.registros
where coleccion = 'weights' and not eliminado;

create or replace view public.agua with (security_invoker = true) as
select
  substring(clave from 7) as fecha,
  coalesce((contenido ->> 'glasses')::int, 0) as vasos,
  actualizado as sincronizado
from public.registros
where coleccion = 'kv' and clave like 'water:%' and not eliminado;

create or replace view public.favoritos with (security_invoker = true) as
select
  clave as id,
  contenido ->> 'name' as nombre,
  round((contenido -> 'totals' ->> 'kcal')::numeric) as calorias,
  jsonb_array_length(contenido -> 'items') as ingredientes,
  actualizado as sincronizado
from public.registros
where coleccion = 'favorites' and not eliminado;

create or replace view public.platos with (security_invoker = true) as
select
  clave,
  contenido ->> 'nombre' as nombre,
  contenido ->> 'fuente' as fuente,
  jsonb_array_length(contenido -> 'items') as ingredientes,
  actualizado as sincronizado
from public.registros
where coleccion = 'platos' and not eliminado;

create or replace view public.ajustes with (security_invoker = true) as
select
  clave as opcion,
  contenido,
  actualizado as sincronizado
from public.registros
where coleccion = 'kv' and clave not like '%:%' and not eliminado;

-- 4) Perfil social: foto, bio y el resumen del día (kcal, meta, racha).
--    La app lo sube sola en cada sincronización; los amigos lo ven tal cual.
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

-- todos los usuarios autenticados pueden ver los perfiles (para buscar amigos);
-- solo tú puedes editar el tuyo.
drop policy if exists "perfiles_ver" on public.perfiles;
create policy "perfiles_ver" on public.perfiles
  for select to authenticated using (true);

drop policy if exists "perfiles_mio" on public.perfiles;
create policy "perfiles_mio" on public.perfiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5) Amistades: uno pide, el otro acepta. Solo se ve lo que te toca a ti.
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

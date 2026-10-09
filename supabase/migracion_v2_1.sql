-- ============================================================
-- Nutri Gym v2.1 — Migración de tu base EXISTENTE
-- Renombra la tabla "datos" a "registros" con nombres entendibles
-- y crea las vistas legibles (comidas, pesos, agua…).
-- NO borra ni modifica ningún dato.
-- Cómo usarlo: SQL Editor → New query → pega TODO → Run (▶).
-- Se puede ejecutar varias veces sin romper nada (es idempotente).
-- ============================================================

-- 1) Renombres (si algo ya está renombrado, este bloque lo salta)
do $$
begin
  if to_regclass('public.datos') is not null then
    alter table public.datos rename to registros;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'registros'
               and column_name = 'tienda') then
    alter table public.registros rename column tienda to coleccion;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'registros'
               and column_name = 'fila_id') then
    alter table public.registros rename column fila_id to clave;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'registros'
               and column_name = 'data') then
    alter table public.registros rename column data to contenido;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'registros'
               and column_name = 'borrado') then
    alter table public.registros rename column borrado to eliminado;
  end if;
end $$;

-- 2) Índice con nombre claro (si el viejo aún existe, lo renombra)
do $$
begin
  if exists (select 1 from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
             where c.relname = 'datos_user_actualizado_idx' and n.nspname = 'public') then
    alter index public.datos_user_actualizado_idx rename to registros_user_actualizado_idx;
  end if;
end $$;
create index if not exists registros_user_actualizado_idx
  on public.registros (user_id, actualizado);

-- 3) Seguridad (RLS): cada cuenta SOLO ve y edita SUS filas.
alter table public.registros enable row level security;

drop policy if exists "datos_propios" on public.registros;
drop policy if exists "registros_propios" on public.registros;
create policy "registros_propios" on public.registros
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4) Vistas legibles: como si fueran tablas separadas.
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

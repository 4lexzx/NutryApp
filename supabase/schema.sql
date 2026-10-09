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

-- 4) Perfil social: usuario, foto, bio y flags de privacidad (qué compartís).
--    Lo que compartís (comidas, historial, agua, gym) vive en la tabla
--    `compartido` del punto 6. La app lo sube sola en cada sincronización.
create table if not exists public.perfiles (
  user_id uuid primary key references auth.users on delete cascade,
  usuario text not null default '',
  foto text,
  bio text,
  meta_kcal int default 0,
  kcal_hoy int default 0,
  cumplio boolean default false,
  racha int default 0,
  pub_perfil boolean not null default true,
  pub_comidas boolean not null default true,
  pub_historial boolean not null default true,
  pub_agua boolean not null default true,
  pub_gym boolean not null default true,
  actualizado timestamptz not null default now()
);

create index if not exists perfiles_usuario_idx on public.perfiles (usuario);

alter table public.perfiles enable row level security;

-- ¿son amigos? (la usan las políticas)
create or replace function public.es_amigo(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.amistades a
    where a.estado = 'aceptada'
      and ((a.uno = auth.uid() and a.dos = other) or (a.dos = auth.uid() and a.uno = other))
  );
$$;
revoke all on function public.es_amigo(uuid) from public;
grant execute on function public.es_amigo(uuid) to authenticated;

-- buscar usuarios para enviar solicitudes (sin exponer perfiles completos)
create or replace function public.buscar_usuario(q text)
returns table (user_id uuid, usuario text, foto text)
language sql stable security definer set search_path = public
as $$
  select p.user_id, p.usuario, p.foto
  from public.perfiles p
  where p.usuario ilike '%' || q || '%'
  order by p.usuario
  limit 20;
$$;
revoke all on function public.buscar_usuario(text) from public;
grant execute on function public.buscar_usuario(text) to authenticated;

-- perfiles: solo tú y tus amigos lo ven
drop policy if exists "perfiles_ver" on public.perfiles;
create policy "perfiles_ver" on public.perfiles
  for select to authenticated using (auth.uid() = user_id or public.es_amigo(user_id));

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

-- 6) Compartido: lo que publicás para tus amigos (comidas de hoy con nombre
--    y kcal, historial de días, agua, gym, peso…). Se sube solo en cada
--    sincronización. Tus amigos lo ven solo si tenés algo publicado; qué
--    secciones mostrar lo decide la app según tus flags de `perfiles`.
create table if not exists public.compartido (
  user_id uuid primary key references auth.users on delete cascade,
  contenido jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

alter table public.compartido enable row level security;

drop policy if exists "compartido_mio" on public.compartido;
create policy "compartido_mio" on public.compartido
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "compartido_amigos" on public.compartido;
create policy "compartido_amigos" on public.compartido
  for select to authenticated using (
    public.es_amigo(user_id) and exists (
      select 1 from public.perfiles p
      where p.user_id = compartido.user_id
        and (p.pub_perfil or p.pub_comidas or p.pub_historial or p.pub_agua or p.pub_gym)
    )
  );

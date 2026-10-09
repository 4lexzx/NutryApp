/* Migración v2.3 — Social con privacidad:
   1) flags de visibilidad en tu perfil (qué compartes con amigos),
   2) tabla `compartido` (lo que tus amigos ven de ti: comidas de hoy,
      historial, agua, gym, kcal, racha, peso),
   3) perfiles solo se ven entre amigos (la búsqueda de usuarios pasa a la
      función buscar_usuario),
   4) función es_amigo() para las políticas.

   Pegá esto tal cual en Supabase → SQL Editor → New query → Run. */

-- 1) ¿son amigos? (la usan las políticas de abajo)
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

-- 2) buscar usuarios para enviar solicitudes (sin exponer perfiles completos)
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

-- 3) flags de privacidad en tu perfil (por defecto: todo público)
alter table public.perfiles add column if not exists pub_perfil   boolean not null default true;
alter table public.perfiles add column if not exists pub_comidas  boolean not null default true;
alter table public.perfiles add column if not exists pub_historial boolean not null default true;
alter table public.perfiles add column if not exists pub_agua     boolean not null default true;
alter table public.perfiles add column if not exists pub_gym      boolean not null default true;
create index if not exists perfiles_usuario_idx on public.perfiles (usuario);

-- 4) perfiles: solo tú y tus amigos lo ven (buscar amigos usa buscar_usuario)
drop policy if exists "perfiles_ver" on public.perfiles;
create policy "perfiles_ver" on public.perfiles
  for select to authenticated using (auth.uid() = user_id or public.es_amigo(user_id));

-- 5) tabla compartido: lo que publicás (comidas de hoy, historial, agua, gym…)
create table if not exists public.compartido (
  user_id uuid primary key references auth.users on delete cascade,
  contenido jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

alter table public.compartido enable row level security;

drop policy if exists "compartido_mio" on public.compartido;
create policy "compartido_mio" on public.compartido
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tus amigos lo ven solo si tenés algo publicado (si apagaste todo, nada);
-- qué secciones mostrar lo decide la app según tus flags.
drop policy if exists "compartido_amigos" on public.compartido;
create policy "compartido_amigos" on public.compartido
  for select to authenticated using (
    public.es_amigo(user_id) and exists (
      select 1 from public.perfiles p
      where p.user_id = compartido.user_id
        and (p.pub_perfil or p.pub_comidas or p.pub_historial or p.pub_agua or p.pub_gym)
    )
  );

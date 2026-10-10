/* Migración v2.4 — Registro de usuarios en la nube (unicidad global):
    1) tabla `usuarios_registrados`: cada cuenta con su usuario y correo.
       - usuario es ÚNICO en toda la app (no se pueden repetir nombres),
       - correo es ÚNICO (Supabase Auth ya lo garantiza; lo acá también).
    2) trigger: cada cuenta que existe en auth.users escribe/sincroniza su
       fila acá solita (la contraseña vive SOLO en Supabase Auth, por seguridad).
    3) backfill: completa la tabla con las cuentas que ya existen.
    4) RPC pública `usuario_existe`: la app la usa ANTES de crear una cuenta
       para comprobar si el usuario ya está registrado (y con qué correo).

    Pegá esto tal cual en Supabase → SQL Editor → New query → Run.
    Es seguro pegarlo varias veces (todo es idempotente). */

-- 1) tabla de registro (visibilidad restringida por RLS; ver 5)
create table if not exists public.usuarios_registrados (
  user_id uuid primary key references auth.users on delete cascade,
  usuario text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- unicidad GLOBAL del nombre de usuario (impide repetir usuarios)
create unique index if not exists usuarios_registrados_usuario_uk
  on public.usuarios_registrados (lower(usuario)) where usuario <> '';
-- unicidad del correo
create unique index if not exists usuarios_registrados_email_uk
  on public.usuarios_registrados (lower(email)) where email <> '';
create index if not exists usuarios_registrados_usuario_idx
  on public.usuarios_registrados (usuario);

alter table public.usuarios_registrados enable row level security;

-- 2) trigger: al crear/modificar una cuenta en auth.users se refleja acá.
--    El nombre de usuario lo toma del que subió la app en `perfiles` (si
--    existe); si no, usa la parte del correo antes de "@". La contraseña
--    NO se guarda acá (solo vive en Supabase Auth).
create or replace function public.sync_usuario_registrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(NEW.email, ''));
  v_usuario text;
begin
  select lower(coalesce(p.usuario, '')) into v_usuario
    from public.perfiles p where p.user_id = NEW.id;
  if v_usuario is null or v_usuario = '' then
    v_usuario := split_part(v_email, '@', 1);
  end if;

  insert into public.usuarios_registrados (user_id, usuario, email, actualizado)
  values (NEW.id, v_usuario, v_email, now())
  on conflict (user_id) do update
    set usuario = excluded.usuario,
        email = excluded.email,
        actualizado = now();
  return NEW;
end;
$$;

drop trigger if exists t_sync_usuario_registrado on auth.users;
create trigger t_sync_usuario_registrado
  after insert or update of email on auth.users
  for each row execute function public.sync_usuario_registrado();

-- si alguien cambia su nombre de perfil, se refleja en el registro
create or replace function public.sync_usuario_desde_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios_registrados (user_id, usuario, email, actualizado)
  values (NEW.user_id, lower(coalesce(NEW.usuario, '')),
          lower((select email from auth.users where id = NEW.user_id)), now())
  on conflict (user_id) do update
    set usuario = excluded.usuario,
        actualizado = now();
  return NEW;
end;
$$;

drop trigger if exists t_sync_usuario_desde_perfil on public.perfiles;
create trigger t_sync_usuario_desde_perfil
  after insert or update of usuario on public.perfiles
  for each row execute function public.sync_usuario_desde_perfil();

-- 3) backfill de las cuentas que ya existen
insert into public.usuarios_registrados (user_id, usuario, email, actualizado)
select u.id,
       lower(coalesce((select p.usuario from public.perfiles p where p.user_id = u.id), '')),
       lower(coalesce(u.email, '')),
       now()
  from auth.users u
where not exists (select 1 from public.usuarios_registrados r where r.user_id = u.id)
on conflict (user_id) do nothing;

-- nombre por defecto para las filas que quedaron vacías (correo sin @)
update public.usuarios_registrados
   set usuario = split_part(email, '@', 1)
 where usuario = '' and email <> '';

-- 4) RPC: comprueba si un usuario ya está registrado (pública a propósito:
--    solo devuelve el usuario y el correo, sin tocar la contraseña).
create or replace function public.usuario_existe(q text)
returns table (usuario text, email text)
language sql stable
set search_path = public
as $$
  select r.usuario, r.email
    from public.usuarios_registrados r
   where lower(r.usuario) = lower(trim(q))
      or lower(r.email) = lower(trim(q))
   limit 1;
$$;
grant execute on function public.usuario_existe(text) to anon, authenticated;

-- 5) seguridad: solo la app (authenticated) ve el listado; nadie más.
drop policy if exists "usuarios_ver" on public.usuarios_registrados;
create policy "usuarios_ver" on public.usuarios_registrados
  for select to authenticated using (true);

-- el trigger escribe a nombre del sistema (security definer), no necesita política de insert

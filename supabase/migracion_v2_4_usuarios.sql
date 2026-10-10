/* Migración v2.4 — Registro de usuarios en la nube (unicidad global):
    1) tabla `usuarios_registrados`: cada cuenta con su usuario y correo.
       - usuario es ÚNICO en toda la app (no se pueden repetir nombres),
       - correo es ÚNICO (Supabase Auth ya lo garantiza; acá también).
    2) trigger: cada cuenta nueva en auth.users escribe su fila acá solita;
       si el nombre ya lo usa otra cuenta, queda identificada por su correo
       (la contraseña vive SOLO en Supabase Auth, por seguridad).
    3) reconstrucción: se VACÍA la tabla y se llena de vuelta desde las
       cuentas que existen. Si dos cuentas viejas tenían el mismo nombre
       (p. ej. "alexsu" y "AlexSu"), la más antigua conserva el nombre y la
       otra queda registrada con su correo. Así NUNCA falla por repetidos y
       se cura cualquier estado a medias de intentos anteriores.
    4) RPC pública `usuario_existe`: la app la usa ANTES de crear una cuenta
       para comprobar si el usuario ya está registrado (y con qué correo).

    Pegá esto tal cual en Supabase → SQL Editor → New query → Run.
    Es seguro pegarlo varias veces. Si falla, copiame el mensaje de error
    completo que te devuelve. */

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

-- 2) trigger: al crear una cuenta en auth.users se refleja acá.
--    El nombre sale del perfil (si existe); si no, de la parte del correo
--    antes de "@". Si ese nombre ya lo usa otra cuenta, se registra con el
--    correo completo (único) — nunca falla por repetidos.
create or replace function public.sync_usuario_registrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(NEW.email, '')));
  v_usuario text;
  v_base text;
  v_i int := 1;
begin
  select trim(lower(coalesce(p.usuario, ''))) into v_usuario
    from public.perfiles p where p.user_id = NEW.id;
  if v_usuario is null or v_usuario = '' then
    v_usuario := nullif(split_part(v_email, '@', 1), '');
    v_usuario := coalesce(v_usuario, '');
  end if;

  if v_usuario <> '' and exists (
       select 1 from public.usuarios_registrados r
        where r.user_id <> NEW.id and lower(r.usuario) = v_usuario) then
    if v_email <> '' then
      v_usuario := v_email;
    else
      -- sin correo: sufijo numérico (caso extremo)
      v_base := v_usuario;
      loop
        v_i := v_i + 1;
        exit when not exists (
          select 1 from public.usuarios_registrados r
           where r.user_id <> NEW.id
             and lower(r.usuario) = v_base || '_' || v_i);
        exit when v_i > 99;
      end loop;
      v_usuario := v_base || '_' || v_i;
    end if;
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
-- (con la misma protección contra nombres repetidos; el correo no se toca)
create or replace function public.sync_usuario_desde_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := trim(lower(coalesce(NEW.usuario, '')));
  v_email text := lower(trim(coalesce(
    (select u.email from auth.users u where u.id = NEW.user_id), '')));
  v_base text;
  v_i int := 1;
begin
  if v_usuario = '' then
    v_usuario := coalesce(nullif(split_part(v_email, '@', 1), ''), '');
  end if;

  if v_usuario <> '' and exists (
       select 1 from public.usuarios_registrados r
        where r.user_id <> NEW.user_id and lower(r.usuario) = v_usuario) then
    if v_email <> '' then
      v_usuario := v_email;
    else
      v_base := v_usuario;
      loop
        v_i := v_i + 1;
        exit when not exists (
          select 1 from public.usuarios_registrados r
           where r.user_id <> NEW.user_id
             and lower(r.usuario) = v_base || '_' || v_i);
        exit when v_i > 99;
      end loop;
      v_usuario := v_base || '_' || v_i;
    end if;
  end if;

  insert into public.usuarios_registrados (user_id, usuario, email, actualizado)
  values (NEW.user_id, v_usuario, v_email, now())
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

-- 3) reconstrucción completa: vaciamos y llenamos de vuelta desde las
--    cuentas reales. La más antigua de cada nombre repetido lo conserva;
--    la otra queda con su correo (que es único). No puede fallar.
delete from public.usuarios_registrados;

with base as (
  select u.id as user_id,
         coalesce(
           nullif(trim(lower(coalesce(
             (select p.usuario from public.perfiles p where p.user_id = u.id), ''))), ''),
           nullif(split_part(lower(coalesce(u.email, '')), '@', 1), ''),
           '') as base,
         lower(trim(coalesce(u.email, ''))) as email,
         u.created_at
    from auth.users u
),
candidatos as (
  select user_id, base, email,
         row_number() over (
           partition by base
           order by created_at asc nulls last, user_id asc) as orden
    from base
)
insert into public.usuarios_registrados (user_id, usuario, email, actualizado)
select user_id,
       case
         when orden = 1 then base
         when email <> '' then email
         else base || '@' || orden
       end,
       email,
       now()
  from candidatos;

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

/* Migración v2.5 — Social: buscar, ver el perfil y AÑADIR amigo.
     1) buscar_usuario() ahora devuelve la ficha pública de quien buscas
        (bio, kcal de hoy, racha…) para poder mostrar su perfil ANTES de
        añadirlo como amigo;
     2) ver_perfil(user_id) devuelve esa misma ficha por id, para abrir el
        perfil de quien te envió una solicitud ANTES de aceptarla.
   Ambas funciones son security definer (se ejecutan como la base) y
   respetan los flags de privacidad del perfil: si el usuario apagó una
   sección, esa parte llega vacía.

   Pegar en Supabase → SQL Editor → New query → Run. */

drop function if exists public.buscar_usuario(text);
drop function if exists public.ver_perfil(uuid);

create or replace function public.buscar_usuario(q text)
returns table (user_id uuid, usuario text, foto text, bio text,
               meta_kcal int, kcal_hoy int, racha int, cumplio boolean,
               pub_perfil boolean, pub_comidas boolean)
language sql stable security definer set search_path = public
as $$
  select p.user_id, p.usuario, p.foto,
         case when p.pub_perfil then p.bio end,
         case when p.pub_comidas then p.meta_kcal end,
         case when p.pub_comidas then p.kcal_hoy end,
         case when p.pub_comidas then p.racha end,
         case when p.pub_comidas then p.cumplio end,
         p.pub_perfil, p.pub_comidas
  from public.perfiles p
  where p.usuario ilike '%' || q || '%'
  order by p.usuario
  limit 20;
$$;
revoke all on function public.buscar_usuario(text) from public;
grant execute on function public.buscar_usuario(text) to authenticated;

create or replace function public.ver_perfil(quien uuid)
returns table (user_id uuid, usuario text, foto text, bio text,
               meta_kcal int, kcal_hoy int, racha int, cumplio boolean,
               pub_perfil boolean, pub_comidas boolean)
language sql stable security definer set search_path = public
as $$
  select p.user_id, p.usuario, p.foto,
         case when p.pub_perfil then p.bio end,
         case when p.pub_comidas then p.meta_kcal end,
         case when p.pub_comidas then p.kcal_hoy end,
         case when p.pub_comidas then p.racha end,
         case when p.pub_comidas then p.cumplio end,
         p.pub_perfil, p.pub_comidas
  from public.perfiles p
  where p.user_id = quien
  limit 1;
$$;
revoke all on function public.ver_perfil(uuid) from public;
grant execute on function public.ver_perfil(uuid) to authenticated;

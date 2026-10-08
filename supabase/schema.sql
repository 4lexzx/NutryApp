-- ============================================================
-- Nutri Gym v2 · Esquema de la nube (Supabase)
-- Cómo usarlo:
--   1) Abre tu proyecto de Supabase → SQL Editor → New query
--   2) Pega TODO este archivo
--   3) Pulsa Run (▶). No hay que cambiar nada.
-- Se puede ejecutar varias veces sin romper nada (es idempotente).
-- ============================================================

-- 1) Tabla única que guarda TODOS tus datos sincronizados.
--    tienda  = tipo de dato: meals | weights | favorites | water | platos | kv
--              (kv guarda ajustes, perfil, prompt de IA, agua por día, gym…)
--    fila_id = identificador de la fila dentro de esa tienda
--    data    = el registro completo en JSON
--    borrado = marca de "tumbstone": si borras algo en un dispositivo,
--              el resto de dispositivos también lo borra
create table if not exists public.datos (
  user_id uuid not null references auth.users on delete cascade,
  tienda text not null,
  fila_id text not null,
  data jsonb,
  actualizado timestamptz not null default now(),
  borrado boolean not null default false,
  primary key (user_id, tienda, fila_id)
);

-- Para bajar solo lo nuevo desde la última sincronización
create index if not exists datos_user_actualizado_idx
  on public.datos (user_id, actualizado);

-- 2) Seguridad (RLS): cada cuenta SOLO ve y edita SUS filas.
--    Sin esto, la clave pública "anon" del navegador podría leer
--    los datos de otros; con esto, Supabase los bloquea siempre.
alter table public.datos enable row level security;

drop policy if exists "datos_propios" on public.datos;
create policy "datos_propios" on public.datos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

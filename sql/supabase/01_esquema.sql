-- ============================================================
-- Studia-IA · Esquema inicial en Supabase (Fase A)
-- Ejecutar en SQL Editor del panel de Supabase (proyecto free).
-- Todos los objetos se crean idempotentes: se puede relanzar.
-- ============================================================

-- ------------------------------------------------------------
-- 1) profiles: rol y plan por usuario
--    role = permisos   (free | premium | admin)
--    plan = facturación (free | premium)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'free'
             check (role in ('free', 'premium', 'admin')),
  plan       text not null default 'free'
             check (plan in ('free', 'premium')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cada usuario solo puede leer SU perfil (el frontend necesita
-- role y plan para la interfaz). Sin políticas de UPDATE ni DELETE:
-- los roles/planes se cambian SOLO a mano desde el panel SQL, así
-- ningún bug de cliente puede auto-asignarse admin o premium.
drop policy if exists "leer_propio_perfil" on public.profiles;
create policy "leer_propio_perfil"
  on public.profiles for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2) state: el estado completo de la app, un blob JSON por usuario.
--    De momento el frontend guarda todo (tareas, eventos, pomodoro,
--    mensajes de Luna...) en un único JSON; una fila = un usuario.
-- ------------------------------------------------------------
create table if not exists public.state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  -- límite de sensatez: el estado completo no debería pasar de ~2 MB
  constraint estado_no_desmesurado
    check (pg_column_size(data) < 2000000)
);

alter table public.state enable row level security;

drop policy if exists "leer_mi_estado"       on public.state;
create policy "leer_mi_estado"
  on public.state for select
  using (auth.uid() = user_id);

drop policy if exists "insertar_mi_estado"   on public.state;
create policy "insertar_mi_estado"
  on public.state for insert
  with check (auth.uid() = user_id);

drop policy if exists "actualizar_mi_estado" on public.state;
create policy "actualizar_mi_estado"
  on public.state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sin DELETE por API: borrar una cuenta se hace desde el panel y
-- el ON DELETE CASCADE limpia las filas.

-- ------------------------------------------------------------
-- 3) Trigger: crear el perfil 'free' al registrarse.
--    security definer para poder insertar sin dar permisos al
--    usuario nuevo. search_path fijado por seguridad.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- PASOS MANUALES (fuera de este script, tras crear vuestras
-- 4 cuentas desde la app o desde Auth):
--
--   update public.profiles set role = 'admin'
--   where user_id in (
--     select id from auth.users
--     where email in ('CORREO_1', 'CORREO_2', 'CORREO_3', 'CORREO_4')
--   );
--
-- Ese UPDATE es la ÚNICA línea con correos, y vive en el panel,
-- nunca en el repositorio.
-- ============================================================

-- =====================================================================
--  PANEL DE SUPER ADMIN — estadísticas, administración y feature flags
--  Depende de 0002_roles_y_rls.sql (roles y funciones de permiso).
--
--  Todo lo de aquí está cerrado con es_super_admin(). Ninguna función
--  devuelve nada si quien llama no es super admin, aunque conozca el
--  nombre exacto del RPC.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estado de la cuenta (para activar / desactivar entrenadores)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists activo boolean not null default true,
  add column if not exists desactivado_en timestamptz,
  add column if not exists desactivado_por uuid references auth.users(id);

create index if not exists idx_profiles_activo on public.profiles(activo) where not activo;

-- Una cuenta desactivada deja de ver datos aunque su sesión siga viva.
create or replace function public.cuenta_habilitada()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select activo from public.profiles where id = auth.uid()), false)
$$;
grant execute on function public.cuenta_habilitada() to authenticated;


-- ---------------------------------------------------------------------
-- 2. Feature flags — encender y apagar funciones sin publicar una
--    versión nueva de la app
-- ---------------------------------------------------------------------
create table if not exists public.feature_flags (
  clave        text primary key,
  activo       boolean not null default false,
  titulo       text not null,
  descripcion  text,
  grupo        text not null default 'general',
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id)
);

insert into public.feature_flags (clave, activo, titulo, descripcion, grupo) values
  ('registro_entrenadores', false, 'Registro de entrenadores', 'Permite que alguien se dé de alta como coach sin invitación.', 'altas'),
  ('registro_clientes',     true,  'Registro de clientes',     'Alta abierta de clientes nuevos desde la app.',            'altas'),
  ('fotografias',           true,  'Fotografías de progreso',  'Subida y comparación de fotos semanales.',                 'funciones'),
  ('chat',                  false, 'Chat',                     'Mensajería entre coach y cliente.',                        'funciones'),
  ('ia',                    false, 'Funciones de IA',          'Asistente, foto de plato y escáner de etiqueta.',           'funciones'),
  ('notificaciones',        true,  'Notificaciones',           'Avisos push y recordatorios.',                             'funciones'),
  ('suscripciones',         false, 'Suscripciones',            'Cobros y planes de pago.',                                 'negocio'),
  ('modo_mantenimiento',    false, 'Modo mantenimiento',       'Bloquea el acceso a todos menos al super admin.',           'sistema')
on conflict (clave) do nothing;

alter table public.feature_flags enable row level security;

-- Cualquiera con sesión los LEE (la app necesita saber qué mostrar)…
drop policy if exists "flags: leer" on public.feature_flags;
create policy "flags: leer" on public.feature_flags
  for select to authenticated using ( true );

-- …pero solo el super admin los CAMBIA
drop policy if exists "flags: solo super admin escribe" on public.feature_flags;
create policy "flags: solo super admin escribe" on public.feature_flags
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );

create or replace function public.sello_de_flag()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

drop trigger if exists trg_sello_de_flag on public.feature_flags;
create trigger trg_sello_de_flag before update on public.feature_flags
  for each row execute function public.sello_de_flag();

-- Atajo para la app: ¿está encendida esta función?
create or replace function public.flag(p_clave text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select activo from public.feature_flags where clave = p_clave), false) $$;
grant execute on function public.flag(text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. Ajustes con valor libre (lo que no es un simple sí/no)
-- ---------------------------------------------------------------------
create table if not exists public.system_settings (
  clave       text primary key,
  valor       jsonb not null,
  descripcion text,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id)
);

insert into public.system_settings (clave, valor, descripcion) values
  ('fotos_por_semana',      '4'::jsonb,                    'Cuántas fotos de progreso se permiten por semana.'),
  ('max_clientes_por_coach','80'::jsonb,                   'Tope de clientes que puede llevar un coach.'),
  ('dias_inactividad',      '14'::jsonb,                   'Días sin registrar para considerar inactivo a un cliente.'),
  ('mensaje_mantenimiento', '"Volvemos en un rato."'::jsonb,'Texto que se muestra en modo mantenimiento.')
on conflict (clave) do nothing;

alter table public.system_settings enable row level security;
drop policy if exists "ajustes: leer" on public.system_settings;
create policy "ajustes: leer" on public.system_settings
  for select to authenticated using ( true );
drop policy if exists "ajustes: solo super admin escribe" on public.system_settings;
create policy "ajustes: solo super admin escribe" on public.system_settings
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );


-- ---------------------------------------------------------------------
-- 4. Bitácora de acciones administrativas
--    En una plataforma con varios administradores, poder responder
--    "quién desactivó a este coach y cuándo" no es opcional.
-- ---------------------------------------------------------------------
create table if not exists public.admin_bitacora (
  id          bigserial primary key,
  actor_id    uuid not null references auth.users(id),
  accion      text not null,
  objetivo_id uuid,
  detalle     jsonb,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_bitacora_fecha on public.admin_bitacora(creado_en desc);

alter table public.admin_bitacora enable row level security;
drop policy if exists "bitacora: solo super admin" on public.admin_bitacora;
create policy "bitacora: solo super admin" on public.admin_bitacora
  for select using ( public.es_super_admin() );

create or replace function public.anotar(p_accion text, p_objetivo uuid, p_detalle jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp
as $$ insert into public.admin_bitacora(actor_id, accion, objetivo_id, detalle)
      values (auth.uid(), p_accion, p_objetivo, p_detalle) $$;


-- ---------------------------------------------------------------------
-- 5. Estadísticas del dashboard
--    Una sola llamada devuelve todo el tablero. Corta de entrada si
--    quien pregunta no es super admin.
-- ---------------------------------------------------------------------
create or replace function public.admin_estadisticas()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp, storage
as $$
declare
  v_dias int;
  v_resultado jsonb;
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede consultar las estadísticas';
  end if;

  select coalesce((valor)::text::int, 14) into v_dias
    from public.system_settings where clave = 'dias_inactividad';

  select jsonb_build_object(
    'entrenadores',        (select count(*) from public.profiles where role = 'coach'),
    'entrenadores_activos',(select count(*) from public.profiles where role = 'coach' and activo),
    'clientes',            (select count(*) from public.profiles where role = 'cliente'),
    'usuarios',            (select count(*) from public.profiles),
    'cuentas_desactivadas',(select count(*) from public.profiles where not activo),

    -- "Activo" = registró comida o entrenó dentro de la ventana configurada
    'clientes_activos', (
      select count(distinct p.id) from public.profiles p
       where p.role = 'cliente' and (
         exists (select 1 from public.diary_entries d
                  where d.user_id = p.id and d.entry_date > current_date - v_dias)
      or exists (select 1 from public.workout_sessions w
                  where w.user_id = p.id and w.session_date > current_date - v_dias))
    ),

    'altas_7_dias',  (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'altas_30_dias', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'sin_coach',     (select count(*) from public.profiles p where p.role='cliente'
                        and not exists (select 1 from public.coach_clientes cc
                                         where cc.cliente_id = p.id and cc.activo)),

    'fotos_total',   (select count(*) from public.progress_photos),
    'fotos_bytes',   (select coalesce(sum(bytes),0) from public.progress_photos),

    -- Almacenamiento real reportado por Storage
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint),0)
                        from storage.objects where bucket_id = 'progress-photos'),
    'storage_objetos',(select count(*) from storage.objects where bucket_id = 'progress-photos'),

    'comidas_registradas', (select count(*) from public.diary_entries),
    'sesiones_entreno',    (select count(*) from public.workout_sessions),
    'dias_inactividad',    v_dias,
    'generado_en',         now()
  ) into v_resultado;

  return v_resultado;
end $$;

revoke execute on function public.admin_estadisticas() from public;
grant execute on function public.admin_estadisticas() to authenticated;


-- ---------------------------------------------------------------------
-- 6. Buscar cualquier usuario (solo super admin)
-- ---------------------------------------------------------------------
create or replace function public.admin_buscar_usuarios(p_texto text default '', p_limite int default 50)
returns table (
  id uuid, nombre text, correo text, rol public.app_role, activo boolean,
  coach text, ultima_actividad date, creado_en timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede buscar usuarios';
  end if;

  return query
  select p.id, p.full_name, u.email, p.role, p.activo,
         c.full_name as coach,
         greatest(
           (select max(d.entry_date) from public.diary_entries d where d.user_id = p.id),
           (select max(w.session_date) from public.workout_sessions w where w.user_id = p.id)
         ) as ultima_actividad,
         p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.coach_clientes cc on cc.cliente_id = p.id and cc.activo
    left join public.profiles c on c.id = cc.coach_id
   where p_texto = ''
      or p.full_name ilike '%' || p_texto || '%'
      or u.email    ilike '%' || p_texto || '%'
   order by p.created_at desc
   limit least(p_limite, 200);
end $$;

revoke execute on function public.admin_buscar_usuarios(text, int) from public;
grant execute on function public.admin_buscar_usuarios(text, int) to authenticated;


-- ---------------------------------------------------------------------
-- 7. Acciones sobre usuarios
-- ---------------------------------------------------------------------

-- Cambiar el rol de alguien (ascender a coach, degradar, etc.)
create or replace function public.admin_cambiar_rol(p_usuario uuid, p_rol public.app_role)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede cambiar roles';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes cambiarte el rol a ti mismo';
  end if;

  update public.profiles set role = p_rol where id = p_usuario;
  perform public.anotar('cambiar_rol', p_usuario, jsonb_build_object('rol', p_rol));
end $$;

-- Activar / desactivar una cuenta
create or replace function public.admin_activar(p_usuario uuid, p_activo boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede activar o desactivar cuentas';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes desactivarte a ti mismo';
  end if;

  update public.profiles
     set activo = p_activo,
         desactivado_en  = case when p_activo then null else now() end,
         desactivado_por = case when p_activo then null else auth.uid() end
   where id = p_usuario;

  perform public.anotar(case when p_activo then 'activar' else 'desactivar' end, p_usuario, '{}'::jsonb);
end $$;

-- Asignar o quitar un cliente a un coach
create or replace function public.admin_asignar(p_coach uuid, p_cliente uuid, p_activo boolean default true)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_tope int; v_actuales int;
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede asignar clientes';
  end if;

  if p_activo then
    select coalesce((valor)::text::int, 80) into v_tope
      from public.system_settings where clave = 'max_clientes_por_coach';
    select count(*) into v_actuales
      from public.coach_clientes where coach_id = p_coach and activo;
    if v_actuales >= v_tope then
      raise exception 'Ese coach ya llegó al tope de % clientes', v_tope;
    end if;
  end if;

  insert into public.coach_clientes(coach_id, cliente_id, activo, asignado_por)
  values (p_coach, p_cliente, p_activo, auth.uid())
  on conflict (coach_id, cliente_id)
  do update set activo = excluded.activo, asignado_por = auth.uid();

  perform public.anotar('asignar', p_cliente, jsonb_build_object('coach', p_coach, 'activo', p_activo));
end $$;

revoke execute on function public.admin_cambiar_rol(uuid, public.app_role) from public;
revoke execute on function public.admin_activar(uuid, boolean)             from public;
revoke execute on function public.admin_asignar(uuid, uuid, boolean)       from public;
grant  execute on function public.admin_cambiar_rol(uuid, public.app_role) to authenticated;
grant  execute on function public.admin_activar(uuid, boolean)             to authenticated;
grant  execute on function public.admin_asignar(uuid, uuid, boolean)       to authenticated;


-- ---------------------------------------------------------------------
-- 8. IMPORTANTE — crear usuarios y reiniciar contraseñas
--
--  Estas dos cosas NO se pueden hacer desde SQL ni desde la app:
--  exigen la clave `service_role`, que jamás debe viajar dentro del
--  teléfono (quien la extraiga tendría control total de la base).
--
--  Van en una Edge Function que:
--    1. recibe el JWT del que llama,
--    2. comprueba contra la base que es super_admin,
--    3. recién entonces usa la clave de servicio.
--
--  Esbozo (supabase/functions/admin-usuarios/index.ts):
--
--    const caller = createClient(URL, ANON, {global:{headers:{Authorization: req.headers.get('Authorization')!}}});
--    const { data: esAdmin } = await caller.rpc('es_super_admin');
--    if (!esAdmin) return new Response('No autorizado', { status: 403 });
--
--    const admin = createClient(URL, SERVICE_ROLE);   // solo del lado del servidor
--    // crear entrenador:
--    await admin.auth.admin.createUser({ email, password, email_confirm: true });
--    // y luego: update profiles set role='coach' where id = <nuevo>
--
--  Para REINICIAR CONTRASEÑA no hace falta la clave de servicio ni la
--  Edge Function: basta `resetPasswordForEmail(correo)` desde la app.
--  Manda un enlace al correo del usuario y el admin nunca ve ni fija
--  la contraseña de nadie, que es como debe ser.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 9. Modo mantenimiento
--    Con el flag encendido, todos salvo el super admin dejan de leer.
--    Se aplica sobre las tablas de datos personales.
-- ---------------------------------------------------------------------
create or replace function public.acceso_permitido()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super_admin()
      or (public.cuenta_habilitada() and not public.flag('modo_mantenimiento'))
$$;
grant execute on function public.acceso_permitido() to authenticated;

-- Ejemplo de cómo endurecer una tabla con mantenimiento y cuenta activa:
--   drop policy if exists "diary_entries: ver" on public.diary_entries;
--   create policy "diary_entries: ver" on public.diary_entries
--     for select using ( public.acceso_permitido() and public.puede_ver(user_id) );
-- Repetir el patrón en el resto de tablas cuando quieras activarlo.


-- ---------------------------------------------------------------------
-- 10. Comprobaciones
-- ---------------------------------------------------------------------
-- select public.admin_estadisticas();                    -- debe FALLAR salvo super admin
-- select * from public.admin_buscar_usuarios('ana');     -- debe FALLAR salvo super admin
-- update public.feature_flags set activo = true where clave='chat';  -- debe FALLAR salvo super admin
-- select public.flag('fotografias');                     -- cualquiera puede leerlo

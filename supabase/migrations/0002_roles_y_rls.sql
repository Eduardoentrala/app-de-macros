-- =====================================================================
--  SISTEMA DE ROLES Y SEGURIDAD A NIVEL DE FILA
--  Roles: super_admin · coach · cliente
--
--  REGLA DE ORO: la interfaz NUNCA es la seguridad. Ocultar un botón no
--  protege nada. Todo lo que sigue se aplica dentro de Postgres, así que
--  da igual si alguien llama a la API directamente, usa curl o se fabrica
--  su propio cliente: la base de datos no responde lo que no le toca.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El rol vive en la tabla de perfiles
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('super_admin', 'coach', 'cliente');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists role public.app_role not null default 'cliente';

create index if not exists idx_profiles_role on public.profiles(role);


-- ---------------------------------------------------------------------
-- 2. Quién entrena a quién
--    Pensado para miles de entrenadores: la búsqueda siempre entra por
--    índice, nunca recorre la tabla completa.
-- ---------------------------------------------------------------------
create table if not exists public.coach_clientes (
  coach_id    uuid not null references auth.users(id) on delete cascade,
  cliente_id  uuid not null references auth.users(id) on delete cascade,
  activo      boolean not null default true,
  asignado_en timestamptz not null default now(),
  asignado_por uuid references auth.users(id),
  primary key (coach_id, cliente_id),
  constraint no_autoasignacion check (coach_id <> cliente_id)
);

-- Índices parciales: solo las asignaciones vigentes, que son las que se consultan
create index if not exists idx_cc_coach   on public.coach_clientes(coach_id)   where activo;
create index if not exists idx_cc_cliente on public.coach_clientes(cliente_id) where activo;


-- ---------------------------------------------------------------------
-- 3. Funciones de permiso
--
--    Van como SECURITY DEFINER a propósito: si una política sobre
--    profiles consultara profiles con RLS activo, Postgres entraría en
--    recursión infinita. Al ser DEFINER, la función lee sin RLS y corta
--    el ciclo. El search_path fijo evita que alguien secuestre la
--    resolución de nombres.
--
--    STABLE permite a Postgres evaluarlas una vez por consulta en lugar
--    de una vez por fila: es lo que hace que esto escale.
-- ---------------------------------------------------------------------

create or replace function public.mi_rol()
returns public.app_role
language sql stable security definer set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.es_super_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  )
$$;

create or replace function public.es_coach_de(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.coach_clientes
    where coach_id = auth.uid() and cliente_id = objetivo and activo
  )
$$;

-- LECTURA: uno mismo, un cliente asignado, o el super admin
create or replace function public.puede_ver(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select objetivo is not null and (
       objetivo = auth.uid()
    or public.es_super_admin()
    or public.es_coach_de(objetivo)
  )
$$;

-- ESCRITURA de datos personales (comidas, peso, fotos): SOLO el dueño.
-- Un coach puede mirar el diario de su cliente, pero no inventarle comidas.
create or replace function public.puede_editar_propio(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select objetivo = auth.uid() or public.es_super_admin()
$$;

-- ESCRITURA de entrenamiento (rutinas, ejercicios, series): el dueño y su coach.
-- Es justo el sentido de tener entrenador: que te arme la rutina.
create or replace function public.puede_editar_entreno(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select objetivo is not null and (
       objetivo = auth.uid()
    or public.es_super_admin()
    or public.es_coach_de(objetivo)
  )
$$;

revoke execute on function public.mi_rol()                    from public;
revoke execute on function public.es_super_admin()            from public;
revoke execute on function public.es_coach_de(uuid)           from public;
revoke execute on function public.puede_ver(uuid)             from public;
revoke execute on function public.puede_editar_propio(uuid)   from public;
revoke execute on function public.puede_editar_entreno(uuid)  from public;

grant execute on function public.mi_rol()                   to authenticated;
grant execute on function public.es_super_admin()           to authenticated;
grant execute on function public.es_coach_de(uuid)          to authenticated;
grant execute on function public.puede_ver(uuid)            to authenticated;
grant execute on function public.puede_editar_propio(uuid)  to authenticated;
grant execute on function public.puede_editar_entreno(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Nadie se asciende a sí mismo
--    Sin esto, un cliente podría hacer UPDATE profiles SET role='super_admin'
--    sobre su propia fila, que la política de "editar lo mío" sí permite.
-- ---------------------------------------------------------------------
create or replace function public.bloquear_escalada_de_rol()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.es_super_admin() then
    raise exception 'Solo un super admin puede cambiar roles';
  end if;
  return new;
end
$$;

drop trigger if exists trg_bloquear_escalada_de_rol on public.profiles;
create trigger trg_bloquear_escalada_de_rol
  before update on public.profiles
  for each row execute function public.bloquear_escalada_de_rol();

-- Y nadie nace super admin: el rol de alta siempre es cliente
create or replace function public.forzar_rol_inicial()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    new.role := 'cliente';
  end if;
  return new;
end
$$;

drop trigger if exists trg_forzar_rol_inicial on public.profiles;
create trigger trg_forzar_rol_inicial
  before insert on public.profiles
  for each row execute function public.forzar_rol_inicial();


-- ---------------------------------------------------------------------
-- 5. Políticas de la tabla de perfiles
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "perfiles: ver" on public.profiles;
create policy "perfiles: ver" on public.profiles
  for select using ( public.puede_ver(id) );

drop policy if exists "perfiles: crear el propio" on public.profiles;
create policy "perfiles: crear el propio" on public.profiles
  for insert with check ( id = auth.uid() or public.es_super_admin() );

drop policy if exists "perfiles: editar" on public.profiles;
create policy "perfiles: editar" on public.profiles
  for update using ( public.puede_editar_propio(id) )
             with check ( public.puede_editar_propio(id) );

drop policy if exists "perfiles: borrar solo super admin" on public.profiles;
create policy "perfiles: borrar solo super admin" on public.profiles
  for delete using ( public.es_super_admin() );


-- ---------------------------------------------------------------------
-- 6. Políticas de las asignaciones coach ↔ cliente
--    Solo el super admin reparte clientes. Coach y cliente solo miran.
-- ---------------------------------------------------------------------
alter table public.coach_clientes enable row level security;

drop policy if exists "asignaciones: ver las mías" on public.coach_clientes;
create policy "asignaciones: ver las mías" on public.coach_clientes
  for select using (
    coach_id = auth.uid() or cliente_id = auth.uid() or public.es_super_admin()
  );

drop policy if exists "asignaciones: solo super admin asigna" on public.coach_clientes;
create policy "asignaciones: solo super admin asigna" on public.coach_clientes
  for insert with check ( public.es_super_admin() );

drop policy if exists "asignaciones: solo super admin modifica" on public.coach_clientes;
create policy "asignaciones: solo super admin modifica" on public.coach_clientes
  for update using ( public.es_super_admin() ) with check ( public.es_super_admin() );

drop policy if exists "asignaciones: solo super admin quita" on public.coach_clientes;
create policy "asignaciones: solo super admin quita" on public.coach_clientes
  for delete using ( public.es_super_admin() );


-- ---------------------------------------------------------------------
-- 7. Políticas del resto de tablas
--    Se generan en bucle para que ninguna se quede sin proteger por
--    olvido. Añadir una tabla nueva = añadirla a la lista de abajo.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  -- Datos personales: el coach los VE, solo el dueño los EDITA
  personales text[] := array[
    'diary_entries', 'saved_foods', 'recipes',
    'weight_logs', 'cardio_logs', 'progress_photos'
  ];
  -- Entrenamiento: el coach también puede EDITAR (para armar rutinas)
  entreno text[] := array[
    'routine_days', 'routine_exercises', 'exercise_sets',
    'workout_sessions', 'exercise_notes'
  ];
begin
  foreach t in array personales loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select using (public.puede_ver(user_id))', t, t);
    execute format('drop policy if exists "%s: insertar" on public.%I', t, t);
    execute format('create policy "%s: insertar" on public.%I for insert with check (public.puede_editar_propio(user_id))', t, t);
    execute format('drop policy if exists "%s: actualizar" on public.%I', t, t);
    execute format('create policy "%s: actualizar" on public.%I for update using (public.puede_editar_propio(user_id)) with check (public.puede_editar_propio(user_id))', t, t);
    execute format('drop policy if exists "%s: borrar" on public.%I', t, t);
    execute format('create policy "%s: borrar" on public.%I for delete using (public.puede_editar_propio(user_id))', t, t);
  end loop;

  foreach t in array entreno loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select using (public.puede_ver(user_id))', t, t);
    execute format('drop policy if exists "%s: insertar" on public.%I', t, t);
    execute format('create policy "%s: insertar" on public.%I for insert with check (public.puede_editar_entreno(user_id))', t, t);
    execute format('drop policy if exists "%s: actualizar" on public.%I', t, t);
    execute format('create policy "%s: actualizar" on public.%I for update using (public.puede_editar_entreno(user_id)) with check (public.puede_editar_entreno(user_id))', t, t);
    execute format('drop policy if exists "%s: borrar" on public.%I', t, t);
    execute format('create policy "%s: borrar" on public.%I for delete using (public.puede_editar_entreno(user_id))', t, t);
  end loop;
end $$;

-- El catálogo de ejercicios es común: lo lee cualquiera con sesión,
-- pero solo el super admin lo modifica.
alter table public.exercise_library enable row level security;
drop policy if exists "catalogo: leer" on public.exercise_library;
create policy "catalogo: leer" on public.exercise_library
  for select to authenticated using ( true );
drop policy if exists "catalogo: solo super admin escribe" on public.exercise_library;
create policy "catalogo: solo super admin escribe" on public.exercise_library
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );


-- ---------------------------------------------------------------------
-- 8. Fotos de progreso en Storage
--    La ruta es {user_id}/{año}/{semana}/{pose}.webp, así que el primer
--    segmento identifica al dueño y se puede aplicar la misma regla.
--    El bucket es privado y solo se sirve con Signed URLs.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "fotos: ver" on storage.objects;
create policy "fotos: ver" on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and public.puede_ver( ((storage.foldername(name))[1])::uuid )
  );

drop policy if exists "fotos: subir las propias" on storage.objects;
create policy "fotos: subir las propias" on storage.objects
  for insert with check (
    bucket_id = 'progress-photos'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );

drop policy if exists "fotos: reemplazar las propias" on storage.objects;
create policy "fotos: reemplazar las propias" on storage.objects
  for update using (
    bucket_id = 'progress-photos'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );

drop policy if exists "fotos: borrar las propias" on storage.objects;
create policy "fotos: borrar las propias" on storage.objects
  for delete using (
    bucket_id = 'progress-photos'
    and ( ((storage.foldername(name))[1])::uuid = auth.uid() or public.es_super_admin() )
  );


-- ---------------------------------------------------------------------
-- 9. Vistas de apoyo para los paneles
--    Con security_invoker heredan las políticas de quien consulta:
--    un coach ve sus clientes, el super admin ve todos, sin código extra.
-- ---------------------------------------------------------------------
create or replace view public.mis_clientes
with (security_invoker = true) as
select
  p.id, p.full_name, p.avatar_url, p.weight_kg, p.height_cm, p.age,
  p.goal, p.created_at,
  cc.coach_id, cc.asignado_en
from public.profiles p
join public.coach_clientes cc on cc.cliente_id = p.id and cc.activo
where p.role = 'cliente';

grant select on public.mis_clientes to authenticated;


-- ---------------------------------------------------------------------
-- 10. Alta del super admin
--     Se hace UNA sola vez y a mano. No hay forma de llegar a este rol
--     desde la app: el trigger del punto 4 lo impide.
--
--     Cambia el correo por el tuyo y ejecuta esta línea en el SQL Editor
--     de Supabase después de haberte registrado normalmente en la app.
-- ---------------------------------------------------------------------
-- update public.profiles
--    set role = 'super_admin'
--  where id = (select id from auth.users where email = 'TU_CORREO_AQUI');


-- ---------------------------------------------------------------------
-- 11. Comprobaciones rápidas
--     Ejecútalas con la sesión de cada rol para confirmar que la base
--     responde lo que debe. Deben dar exactamente lo esperado.
-- ---------------------------------------------------------------------
-- select public.mi_rol();                       -- tu rol actual
-- select count(*) from public.profiles;         -- cliente: 1 · coach: 1+sus clientes · super admin: todos
-- select count(*) from public.diary_entries;    -- cliente: solo las suyas
-- select count(*) from public.mis_clientes;     -- coach: sus asignados · cliente: 0
-- update public.profiles set role='super_admin' where id = auth.uid();  -- debe FALLAR salvo super admin

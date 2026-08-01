-- =====================================================================
--  ELIMINACIÓN LÓGICA (ARCHIVAR) Y ESTADO DEL CLIENTE
--
--  Nada importante se borra: se marca como archivado y se puede
--  recuperar. La app NO cambia una sola llamada — sigue llamando a
--  DELETE y un trigger lo convierte en archivado.
--
--  Depende de 0006.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columnas de archivado
--
--    Qué se archiva y qué no, y por qué:
--
--      SÍ  profiles           clientes
--      SÍ  recipes            dietas
--      SÍ  saved_foods        fichas de alimentos
--      SÍ  routine_days       rutinas
--      SÍ  routine_exercises  ejercicios de la rutina
--      SÍ  exercise_sets      series
--      SÍ  progress_photos    fotos
--
--      NO  diary_entries      un alimento mal apuntado se borra y ya.
--                             Si se archivaran, el diario se llenaría de
--                             basura invisible y crecería sin freno. Su
--                             historial queda igualmente en la auditoría
--                             de 0008, que es donde importa para el
--                             "yo no comí eso".
--      NO  weight_logs / cardio_logs / workout_sessions
--                             son historial, no se editan ni se borran
--                             en el uso normal.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  archivables text[] := array[
    'profiles', 'recipes', 'saved_foods',
    'routine_days', 'routine_exercises', 'exercise_sets',
    'progress_photos'
  ];
begin
  foreach t in array archivables loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('alter table public.%I
                      add column if not exists archivado_en  timestamptz,
                      add column if not exists archivado_por uuid references auth.users(id)', t);

    -- Índice PARCIAL: solo indexa lo archivado, que es la minoría. Las
    -- consultas normales (archivado_en is null) no pagan nada por él.
    execute format('create index if not exists idx_%s_archivado
                      on public.%I(archivado_en) where archivado_en is not null', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2. DELETE se convierte en archivado
--
--    Un trigger BEFORE DELETE que devuelve NULL cancela el borrado. Así
--    la app puede seguir mandando DELETE tal como está hoy y no se
--    pierde nada. Cero cambios en el código de la interfaz.
--
--    LA COMPUERTA: hay un caso en que el borrado tiene que pasar de
--    verdad. Las tablas cuelgan de auth.users con ON DELETE CASCADE, y
--    también unas de otras (exercise_sets → routine_exercises →
--    routine_days). Si al borrar de verdad un usuario este trigger
--    cancelara el borrado en cascada de sus hijos, quedarían filas
--    huérfanas y Postgres abortaría la operación entera.
--
--    Por eso existe `app.borrado_definitivo`. Mientras valga 'on', los
--    DELETE pasan sin tocarse. Lo enciende `borrar_usuario_definitivo()`
--    (sección 5), que es la única puerta legítima al borrado real.
-- ---------------------------------------------------------------------
create or replace function public.archivar_en_vez_de_borrar()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- Borrado real autorizado: dejar pasar
  if coalesce(current_setting('app.borrado_definitivo', true), 'off') = 'on' then
    return old;
  end if;

  -- Ya estaba archivado: no rehacer la marca ni volver a auditarlo
  if old.archivado_en is not null then
    return null;
  end if;

  execute format(
    'update public.%I set archivado_en = now(), archivado_por = auth.uid() where id = $1',
    tg_table_name
  ) using old.id;

  return null;   -- cancela el DELETE
end $$;

do $$
declare
  t text;
  archivables text[] := array[
    'profiles', 'recipes', 'saved_foods',
    'routine_days', 'routine_exercises', 'exercise_sets',
    'progress_photos'
  ];
begin
  foreach t in array archivables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trg_archivar_%s on public.%I', t, t);
    execute format('create trigger trg_archivar_%s before delete on public.%I
                    for each row execute function public.archivar_en_vez_de_borrar()', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 3. Lo archivado no se ve (salvo que lo pidas)
--
--    Sin esto la app SE ROMPERÍA: el usuario borra un día de su rutina,
--    el trigger lo archiva, y al siguiente SELECT el día reaparece.
--
--    `ver_archivados()` lee un ajuste de sesión. La app no lo enciende
--    nunca, así que se comporta igual que antes. Una futura pantalla de
--    "papelera" hará `set_config('app.ver_archivados','on',true)` antes
--    de consultar y verá lo archivado para poder restaurarlo.
-- ---------------------------------------------------------------------
create or replace function public.ver_archivados()
returns boolean
language sql stable
as $$ select coalesce(current_setting('app.ver_archivados', true), 'off') = 'on' $$;
grant execute on function public.ver_archivados() to authenticated;

-- Se regeneran SOLO las políticas de lectura de las tablas archivables,
-- añadiendo la condición. El resto (insertar, actualizar, borrar) queda
-- intacto: se sigue pudiendo actualizar una fila archivada, que es
-- justo lo que hace falta para restaurarla.
do $$
declare
  t text;
  personales text[] := array['saved_foods','recipes','progress_photos'];
  entreno    text[] := array['routine_days','routine_exercises','exercise_sets'];
begin
  foreach t in array personales loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select
                    using ((archivado_en is null or public.ver_archivados())
                           and public.org_visible(org_id)
                           and public.puede_ver(user_id))', t, t);
  end loop;

  foreach t in array entreno loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select
                    using ((archivado_en is null or public.ver_archivados())
                           and public.org_visible(org_id)
                           and public.puede_ver(user_id))', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 3 bis. Las restricciones de unicidad tienen que ignorar lo archivado
--
--    Sin esto el archivado ROMPE la app de una forma nada evidente:
--    archivas el alimento "Avena", lo vuelves a crear, y la base lo
--    rechaza por duplicado — contra una fila que el usuario ya no ve.
--    Un error imposible de entender desde la pantalla.
--
--    La solución es que la unicidad valga solo entre lo NO archivado.
--    Como las restricciones vienen de `unique (...)` en 0001, hay que
--    quitarlas y ponerlas como índices únicos parciales.
-- ---------------------------------------------------------------------
alter table public.saved_foods      drop constraint if exists saved_foods_user_id_name_unit_key;
alter table public.recipes          drop constraint if exists recipes_user_id_name_key;
alter table public.progress_photos  drop constraint if exists progress_photos_user_id_week_key_pose_key;
alter table public.progress_photos  drop constraint if exists progress_photos_storage_path_key;
alter table public.exercise_sets    drop constraint if exists exercise_sets_routine_exercise_id_sort_order_key;

create unique index if not exists uq_saved_foods_vivo
  on public.saved_foods(user_id, name, unit)            where archivado_en is null;
create unique index if not exists uq_recipes_vivo
  on public.recipes(user_id, name)                      where archivado_en is null;
create unique index if not exists uq_fotos_vivo
  on public.progress_photos(user_id, week_key, pose)    where archivado_en is null;
create unique index if not exists uq_sets_vivo
  on public.exercise_sets(routine_exercise_id, sort_order) where archivado_en is null;

-- `storage_path` es la excepción: tiene que ser único SIEMPRE, archivado
-- o no. Son rutas de archivos reales en el bucket y dos filas apuntando
-- a la misma foto sería una bomba de relojería al borrar una de ellas.
create unique index if not exists uq_fotos_ruta
  on public.progress_photos(storage_path);


-- ---------------------------------------------------------------------
-- 4. Restaurar
-- ---------------------------------------------------------------------
create or replace function public.restaurar(p_tabla text, p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_permitidas text[] := array[
  'profiles','recipes','saved_foods',
  'routine_days','routine_exercises','exercise_sets','progress_photos'];
begin
  -- Lista blanca: p_tabla llega desde fuera y se interpola en SQL.
  -- Sin esta comprobación sería una inyección de manual.
  if not (p_tabla = any(v_permitidas)) then
    raise exception 'Tabla no restaurable: %', p_tabla;
  end if;

  execute format('update public.%I set archivado_en = null, archivado_por = null
                   where id = $1', p_tabla) using p_id;
end $$;
grant execute on function public.restaurar(text, uuid) to authenticated;
-- Nota: la función NO se salta el RLS pese a ser SECURITY DEFINER,
-- porque el UPDATE se sigue evaluando contra las políticas de la tabla.
-- Solo puede restaurar quien ya tenía permiso de editar esa fila.


-- ---------------------------------------------------------------------
-- 5. Borrado definitivo — la única puerta al DELETE real
--
--    Hace falta por dos motivos: para poder dar de baja a alguien de
--    verdad, y para cumplir con el derecho a la eliminación de datos
--    (punto 10 de la lista: el usuario pide que borres lo suyo).
--
--    Solo el super admin. Y queda anotado en la bitácora ANTES de
--    borrar, porque después ya no habría a quién apuntar.
-- ---------------------------------------------------------------------
create or replace function public.borrar_usuario_definitivo(p_usuario uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede borrar datos definitivamente';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes borrarte a ti mismo';
  end if;

  perform public.anotar('borrado_definitivo', p_usuario,
                        jsonb_build_object('cuando', now()));

  -- Abre la compuerta solo para esta transacción (el `true` final la
  -- hace local: al terminar vuelve sola a 'off').
  perform set_config('app.borrado_definitivo', 'on', true);

  delete from public.profiles where id = p_usuario;

  perform set_config('app.borrado_definitivo', 'off', true);
end $$;

revoke execute on function public.borrar_usuario_definitivo(uuid) from public;
grant  execute on function public.borrar_usuario_definitivo(uuid) to authenticated;

-- IMPORTANTE: esto borra el PERFIL y todo lo que cuelga de él, pero no
-- la cuenta de auth.users ni las fotos del bucket. Las dos cosas exigen
-- la clave `service_role` y van en la Edge Function descrita en 0003,
-- sección 8. Sin ese paso la cuenta seguiría pudiendo iniciar sesión.


-- ---------------------------------------------------------------------
-- 6. Estado del cliente
--
--    NO sustituye a `profiles.activo` (0003). Son dos cosas distintas y
--    las dos hacen falta:
--
--      activo  → ¿puede entrar? Lo usa `cuenta_habilitada()` y por tanto
--                todo el RLS. Es el interruptor duro.
--      estado  → ¿en qué punto del programa está? Es información de
--                negocio, para filtrar y para el panel del entrenador.
--
--    Para que no se contradigan, un trigger apaga `activo` cuando el
--    estado pasa a suspendido o archivado. Al revés no: reactivar es
--    una decisión explícita, no un efecto secundario.
-- ---------------------------------------------------------------------
do $$ begin
  create type public.estado_cliente as enum
    ('activo', 'pausado', 'finalizo', 'suspendido', 'archivado');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists estado public.estado_cliente not null default 'activo',
  add column if not exists estado_desde timestamptz not null default now(),
  add column if not exists estado_nota text;

-- Filtrar "los clientes activos de mi organización" es LA consulta del
-- panel del entrenador: se le da su índice.
create index if not exists idx_profiles_org_estado
  on public.profiles(org_id, estado) where role = 'cliente';

create or replace function public.sincronizar_estado()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.estado is distinct from old.estado then
    new.estado_desde := now();

    if new.estado in ('suspendido', 'archivado') then
      new.activo := false;
      new.desactivado_en  := now();
      new.desactivado_por := auth.uid();
    end if;
  end if;
  return new;
end $$;

-- Igual que en 0006: el orden entre triggers del mismo momento es
-- alfabético. Este debe correr antes que trg_validar_cupo_org (s < v)
-- para que el cupo vea el estado ya definitivo.
drop trigger if exists trg_sincronizar_estado on public.profiles;
create trigger trg_sincronizar_estado
  before update on public.profiles
  for each row execute function public.sincronizar_estado();


-- ---------------------------------------------------------------------
-- 7. Consentimientos (parte de datos del punto 10)
--
--    Se guardan fotos del cuerpo, peso y medidas. Hay que poder
--    demostrar QUÉ aceptó cada usuario y CUÁNDO. Una fila por
--    consentimiento y versión: si cambias el aviso de privacidad, el
--    consentimiento viejo no se pisa, se añade uno nuevo.
--
--    Nunca se borra ni se edita: es una prueba, no un ajuste.
-- ---------------------------------------------------------------------
create table if not exists public.consentimientos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in
                ('aviso_privacidad', 'terminos', 'fotos_corporales', 'datos_salud')),
  version     text not null,              -- '2026-07-31' o 'v1.2'
  aceptado    boolean not null,
  aceptado_en timestamptz not null default now(),
  ip          inet
);

create index if not exists idx_consent_user on public.consentimientos(user_id, tipo, aceptado_en desc);

alter table public.consentimientos enable row level security;

drop policy if exists "consentimientos: ver" on public.consentimientos;
create policy "consentimientos: ver" on public.consentimientos
  for select using ( public.puede_ver(user_id) );

-- Solo el propio usuario acepta, y solo por sí mismo
drop policy if exists "consentimientos: aceptar" on public.consentimientos;
create policy "consentimientos: aceptar" on public.consentimientos
  for insert with check ( user_id = auth.uid() );

-- Sin políticas de UPDATE ni DELETE: la tabla es inmutable desde la API.

grant select, insert on public.consentimientos to authenticated;

create or replace function public.acepto(p_tipo text, p_version text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((
    select aceptado from public.consentimientos
     where user_id = auth.uid() and tipo = p_tipo and version = p_version
     order by aceptado_en desc limit 1
  ), false)
$$;
grant execute on function public.acepto(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 8. Comprobaciones
-- ---------------------------------------------------------------------
-- Borrar archiva, no borra:
--   delete from public.routine_days where id = '<un-dia>';
--   select count(*) from public.routine_days where id = '<un-dia>';        -- 0 (oculto)
--   set_config('app.ver_archivados','on',true);
--   select archivado_en from public.routine_days where id = '<un-dia>';    -- con fecha
--
-- Restaurar:
--   select public.restaurar('routine_days', '<un-dia>');
--
-- La lista blanca corta lo que no toca:
--   select public.restaurar('auth.users', gen_random_uuid());   -- debe FALLAR
--
-- El estado apaga el acceso:
--   update public.profiles set estado='suspendido' where id='<cliente>';
--   select activo from public.profiles where id='<cliente>';    -- false

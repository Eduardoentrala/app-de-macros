-- =====================================================================
--  HISTORIAL DE CAMBIOS Y VERSIONADO DE METAS
--
--  Responde a la pregunta "yo no tenía esas calorías": quién cambió qué,
--  cuándo, valor anterior y valor nuevo.
--
--  Depende de 0007.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La bitácora de datos
--
--    Una sola tabla genérica en vez de una tabla histórica por cada
--    entidad. Con `datos_antes` y `datos_despues` en jsonb se reconstruye
--    cualquier versión anterior de cualquier fila, sin escribir código
--    nuevo cada vez que se añade una tabla.
--
--    Es DISTINTA de `admin_bitacora` (0003), que anota acciones
--    administrativas (activar, asignar, cambiar rol). Esta anota cambios
--    de DATOS. No se mezclan porque se consultan por motivos distintos y
--    crecen a ritmos muy distintos.
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id            bigserial primary key,
  tabla         text not null,
  fila_id       text not null,
  operacion     text not null check (operacion in ('UPDATE', 'DELETE')),

  actor_id      uuid,        -- quién lo hizo (null si fue un proceso del sistema)
  user_id       uuid,        -- de quién son los datos
  org_id        uuid,

  datos_antes   jsonb,
  datos_despues jsonb,
  campos        text[],      -- solo los que cambiaron: para leerlo de un vistazo

  creado_en     timestamptz not null default now()
);

-- BRIN en lugar de B-tree: la tabla solo crece por el final y se
-- consulta por rangos de fecha. Un BRIN ocupa unos pocos kilobytes
-- donde un B-tree ocuparía cientos de megas.
create index if not exists idx_auditoria_fecha
  on public.auditoria using brin (creado_en);

create index if not exists idx_auditoria_fila
  on public.auditoria(tabla, fila_id, creado_en desc);

create index if not exists idx_auditoria_user
  on public.auditoria(user_id, creado_en desc);


-- ---------------------------------------------------------------------
-- 2. El trigger genérico
--
--    Se extraen user_id y org_id del jsonb en lugar de por nombre de
--    columna: así la misma función vale para todas las tablas. En
--    `profiles` la clave del dueño es `id`, no `user_id`, y por eso hay
--    un coalesce.
-- ---------------------------------------------------------------------
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  j_antes   jsonb := to_jsonb(old);
  j_despues jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_campos  text[];
begin
  if tg_op = 'UPDATE' then
    -- Solo los campos que de verdad cambiaron
    select array_agg(clave order by clave) into v_campos
      from jsonb_object_keys(j_antes) as clave
     where j_antes -> clave is distinct from j_despues -> clave;

    -- Un UPDATE que no cambió nada no merece una fila de historial
    if v_campos is null or cardinality(v_campos) = 0 then
      return new;
    end if;

    -- Tampoco si lo único que cambió es la marca de tiempo
    if v_campos = array['updated_at'] then
      return new;
    end if;
  end if;

  insert into public.auditoria (
    tabla, fila_id, operacion, actor_id, user_id, org_id,
    datos_antes, datos_despues, campos
  ) values (
    tg_table_name,
    coalesce(j_antes ->> 'id', j_antes ->> 'cliente_id', '?'),
    tg_op,
    auth.uid(),
    coalesce((j_antes ->> 'user_id')::uuid, (j_antes ->> 'id')::uuid),
    (j_antes ->> 'org_id')::uuid,
    j_antes,
    j_despues,
    v_campos
  );

  return case when tg_op = 'DELETE' then old else new end;
end $$;


-- ---------------------------------------------------------------------
-- 3. Dónde se aplica
--
--    Solo UPDATE y DELETE, a propósito. Auditar los INSERT duplicaría
--    el diario entero: cada alimento apuntado generaría una fila de
--    historial con una copia del alimento. Y no aporta — un INSERT no
--    tiene "valor anterior", que es justo lo que se quiere probar.
--
--    Si algún día hace falta, es añadir `insert or` a la línea del
--    trigger y nada más.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  auditadas text[] := array[
    'profiles',            -- metas de macros, rol, estado
    'diary_entries',       -- "yo no comí eso"
    'saved_foods', 'recipes',
    'weight_logs', 'cardio_logs', 'progress_photos',
    'routine_days', 'routine_exercises', 'exercise_sets',
    'workout_sessions', 'exercise_notes',
    'coach_clientes'       -- quién dejó de llevar a quién
  ];
begin
  foreach t in array auditadas loop
    if to_regclass('public.' || t) is null then continue; end if;

    -- El nombre empieza por 'z' para que corra DESPUÉS de los demás
    -- triggers de la tabla (el orden es alfabético) y grabe los valores
    -- ya definitivos, no los intermedios.
    execute format('drop trigger if exists ztrg_auditoria_%s on public.%I', t, t);
    execute format('create trigger ztrg_auditoria_%s
                    after update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 4. Quién puede leer el historial
--
--    Se lee con las mismas reglas que los datos: tú el tuyo, el coach el
--    de sus clientes, el org_admin el de su organización.
--
--    No hay políticas de INSERT, UPDATE ni DELETE. La tabla es de solo
--    lectura desde la API: solo escribe el trigger, que es SECURITY
--    DEFINER y se salta el RLS. Un historial que se puede editar no
--    sirve de prueba de nada.
-- ---------------------------------------------------------------------
alter table public.auditoria enable row level security;

drop policy if exists "auditoria: ver" on public.auditoria;
create policy "auditoria: ver" on public.auditoria
  for select using ( public.puede_ver(user_id) );

grant select on public.auditoria to authenticated;


-- ---------------------------------------------------------------------
-- 5. Versionado de las metas de macros
--
--    El caso concreto del "yo no tenía esas calorías". Se podría sacar
--    de `auditoria`, pero la pregunta real es "¿qué macros tenía este
--    cliente el 3 de julio?", y responder eso reconstruyendo jsonb es
--    incómodo y lento. Una tabla propia lo vuelve una consulta directa.
--
--    Cada cambio AÑADE una versión. Nunca se pisa ninguna.
-- ---------------------------------------------------------------------
create table if not exists public.metas_macros_versiones (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid,

  proteina_g  int not null,
  carbos_g    int not null,
  grasas_g    int not null,
  calorias    int generated always as (proteina_g*4 + carbos_g*4 + grasas_g*9) stored,

  -- Desde cuándo rige esta versión. La vigente es la de `hasta is null`.
  desde       timestamptz not null default now(),
  hasta       timestamptz,

  cambiado_por uuid,          -- el coach que la cambió, o el propio cliente
  nota        text
);

create index if not exists idx_metas_user_desde
  on public.metas_macros_versiones(user_id, desde desc);

-- Una sola versión vigente por usuario, garantizado por la base y no
-- por la confianza en que el código lo haga bien.
create unique index if not exists idx_metas_vigente
  on public.metas_macros_versiones(user_id) where hasta is null;


create or replace function public.versionar_metas()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and new.goal_protein_g is not distinct from old.goal_protein_g
     and new.goal_carbs_g   is not distinct from old.goal_carbs_g
     and new.goal_fat_g     is not distinct from old.goal_fat_g then
    return new;
  end if;

  -- Cerrar la versión anterior
  update public.metas_macros_versiones
     set hasta = now()
   where user_id = new.id and hasta is null;

  -- Abrir la nueva
  insert into public.metas_macros_versiones
         (user_id, org_id, proteina_g, carbos_g, grasas_g, cambiado_por)
  values (new.id, new.org_id, new.goal_protein_g, new.goal_carbs_g,
          new.goal_fat_g, auth.uid());

  return new;
end $$;

drop trigger if exists ztrg_versionar_metas on public.profiles;
create trigger ztrg_versionar_metas
  after insert or update of goal_protein_g, goal_carbs_g, goal_fat_g
  on public.profiles
  for each row execute function public.versionar_metas();


alter table public.metas_macros_versiones enable row level security;

drop policy if exists "metas: ver" on public.metas_macros_versiones;
create policy "metas: ver" on public.metas_macros_versiones
  for select using ( public.puede_ver(user_id) );

grant select on public.metas_macros_versiones to authenticated;


-- Qué macros regían para este cliente en una fecha dada
create or replace function public.metas_en(p_usuario uuid, p_fecha timestamptz)
returns table (proteina_g int, carbos_g int, grasas_g int, calorias int)
language sql stable security definer set search_path = public, pg_temp
as $$
  select v.proteina_g, v.carbos_g, v.grasas_g, v.calorias
    from public.metas_macros_versiones v
   where v.user_id = p_usuario
     and public.puede_ver(p_usuario)          -- respeta el RLS aunque sea DEFINER
     and v.desde <= p_fecha
     and (v.hasta is null or v.hasta > p_fecha)
   limit 1
$$;
grant execute on function public.metas_en(uuid, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- 6. Reconstruir cualquier fila tal como estaba
--
--    Sirve para rutinas y dietas sin necesidad de una tabla histórica
--    por entidad: el jsonb de `auditoria` ya tiene el estado completo.
-- ---------------------------------------------------------------------
create or replace function public.version_en(p_tabla text, p_fila text, p_fecha timestamptz)
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select a.datos_antes
    from public.auditoria a
   where a.tabla = p_tabla
     and a.fila_id = p_fila
     and a.creado_en > p_fecha
     and public.puede_ver(a.user_id)
   order by a.creado_en asc
   limit 1
$$;
grant execute on function public.version_en(text, text, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- 7. Comprobaciones
-- ---------------------------------------------------------------------
-- Cambiar unas metas debe dejar rastro en los DOS sitios:
--   update public.profiles set goal_protein_g = 200 where id = auth.uid();
--   select campos, datos_antes->>'goal_protein_g', datos_despues->>'goal_protein_g'
--     from public.auditoria where tabla='profiles' order by creado_en desc limit 1;
--   select * from public.metas_macros_versiones where user_id = auth.uid() order by desde desc;
--
-- Una sola versión vigente (debe dar exactamente 1):
--   select count(*) from public.metas_macros_versiones
--    where user_id = auth.uid() and hasta is null;
--
-- Qué macros tenía el 3 de julio:
--   select * from public.metas_en(auth.uid(), '2026-07-03'::timestamptz);
--
-- El historial no se puede tocar (las tres deben FALLAR):
--   insert into public.auditoria(tabla,fila_id,operacion) values ('x','y','UPDATE');
--   update public.auditoria set campos = '{}';
--   delete from public.auditoria;

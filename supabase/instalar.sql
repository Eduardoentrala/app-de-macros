-- =====================================================================
--  INSTALACIÓN COMPLETA — pega este archivo entero en el editor SQL
--  de Supabase y pulsa Run. Una sola vez.
--
--  Son las 12 migraciones de supabase/migrations/ unidas en orden.
--  Se ejecutan como una sola transacción: si algo fallara, no queda nada
--  a medias — se deshace todo y la base se queda como estaba.
--
--  Generado automáticamente. NO lo edites: edita los archivos de
--  migrations/ y vuelve a generarlo con  npm run generar
--
--  Después de que termine, crea tu super admin:
--    1. Regístrate en la app con tu correo, como usuario normal.
--    2. Vuelve aquí y ejecuta:
--         select public.nombrar_super_admin('tu-correo@ejemplo.com');
-- =====================================================================


-- ============================ 0001_esquema_base.sql ============================

-- =====================================================================
--  ESQUEMA BASE — las tablas sobre las que se apoya todo lo demás
--
--  Es la primera migración: crea el modelo de datos que 0002 (roles y
--  RLS), 0003 (panel de super admin) y 0004 (multi-organización) dan por
--  hecho. Aquí NO hay seguridad todavía: ni RLS, ni roles, ni org_id.
--  Eso llega en las siguientes y es a propósito — cada archivo hace una
--  sola cosa y se puede leer entero de una sentada.
--
--  Dos reglas que hay que respetar al tocar este archivo:
--
--    1. Toda tabla de datos personales lleva `user_id uuid not null`.
--       0002 genera sus políticas en bucle sobre esa columna y 0004 le
--       cuelga el trigger que rellena `org_id`. Sin `user_id` una tabla
--       se queda fuera de las dos cosas: sin políticas y sin inquilino.
--
--    2. Si añades una tabla nueva, añádela también a las listas de
--       0002 (sección 7) y 0004 (secciones 5 y 6). Una tabla que no
--       esté en esas listas queda SIN RLS, o sea, legible por cualquiera
--       con la clave anónima. Por eso aquí no hay tablas sueltas de
--       apoyo: lo que sería una tabla hija pequeña (los ingredientes de
--       una receta, el desglose de una sesión) va como jsonb dentro de
--       su tabla padre, que sí está protegida.
--
--  Los nombres en inglés (profiles, user_id, entry_date, bytes…) no son
--  un descuido: son los que 0002-0004 ya escriben. Cambiar uno rompe las
--  tres migraciones siguientes. Los comentarios y lo nuevo van en
--  español, como el resto del proyecto.
-- =====================================================================

-- No hace falta `create extension pgcrypto`: gen_random_uuid() es parte
-- del núcleo de PostgreSQL desde la versión 13, y Supabase corre la 15 o
-- superior. Pedir la extensión aquí, además, la instalaría en el esquema
-- `public`, que no es donde Supabase guarda las suyas.


-- ---------------------------------------------------------------------
-- 1. Perfiles
--    Una fila por usuario, con el mismo id que auth.users. El correo NO
--    se copia aquí: vive en auth.users y se lee con un join cuando hace
--    falta (0003 lo hace así). Duplicarlo solo crea dos verdades.
--
--    Las columnas full_name, avatar_url, weight_kg, height_cm, age, goal
--    y created_at las consume la vista `mis_clientes` de 0002: los
--    nombres son fijos.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,

  -- Datos físicos. Nullable a propósito: alguien se registra antes de
  -- saber su peso y la app no debe obligarle a inventárselo.
  weight_kg   numeric(5,1) check (weight_kg  is null or weight_kg  between 20 and 400),
  height_cm   numeric(5,1) check (height_cm  is null or height_cm  between 80 and 260),
  age         int          check (age        is null or age        between 10 and 120),
  goal        text not null default 'mantener'
              check (goal in ('bajar', 'mantener', 'subir')),

  -- Metas de macros en gramos al día. La app calcula las calorías sola
  -- (proteína y carbos ×4, grasas ×9), así que no se guardan.
  goal_protein_g int not null default 170 check (goal_protein_g between 0 and 600),
  goal_carbs_g   int not null default 240 check (goal_carbs_g   between 0 and 900),
  goal_fat_g     int not null default 75  check (goal_fat_g     between 0 and 400),

  -- Ajustes personales
  week_start_dow  int not null default 1 check (week_start_dow between 0 and 6),  -- 0=domingo
  cardio_goal_min int not null default 120 check (cardio_goal_min >= 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.profiles.week_start_dow is
  'Día en que arranca la semana del usuario. 0=domingo … 6=sábado.';


-- ---------------------------------------------------------------------
-- 2. Alta automática del perfil
--    Sin esto habría usuarios en auth.users sin fila en profiles, y como
--    el rol y la organización viven en profiles, esos usuarios quedarían
--    en un limbo: con sesión válida pero invisibles para todas las
--    políticas.
--
--    SECURITY DEFINER porque corre en el contexto del registro, cuando
--    todavía no hay sesión que valga. Los triggers que 0002 y 0004 le
--    añaden a profiles se disparan igual y hacen su trabajo: como
--    auth.uid() es null aquí, el rol de alta será siempre 'cliente' y la
--    organización, la de por defecto.
-- ---------------------------------------------------------------------
create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name',
                         new.raw_user_meta_data->>'name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_crear_perfil on auth.users;
create trigger trg_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();


-- Marca de tiempo compartida por todas las tablas que la usan
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_tocar_profiles on public.profiles;
create trigger trg_tocar_profiles before update on public.profiles
  for each row execute function public.tocar_actualizado();


-- ---------------------------------------------------------------------
-- 3. Catálogo común de ejercicios
--    Sin user_id: es de la plataforma, no de nadie. 0002 lo deja de
--    lectura para cualquiera con sesión y de escritura solo para el
--    super admin.
--
--    Los ejercicios que el usuario escribe a mano NO entran aquí (no
--    podría: no tiene permiso de escritura). Se guardan como texto en
--    routine_exercises.name, que por eso es obligatorio y exercise_id
--    opcional.
-- ---------------------------------------------------------------------
create table if not exists public.exercise_library (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  muscle_group text not null
             check (muscle_group in ('pecho','espalda','piernas','hombros',
                                     'biceps','triceps','abdomen','gluteos',
                                     'antebrazo','pantorrilla','cardio','otro')),
  equipment  text,           -- barra, mancuerna, polea, máquina, peso corporal…
  image_url  text,
  created_at timestamptz not null default now(),
  unique (name, muscle_group)
);

create index if not exists idx_exlib_grupo on public.exercise_library(muscle_group);


-- ---------------------------------------------------------------------
-- 4. Diario de comidas
--    Una fila = un alimento apuntado en una comida de un día. Los macros
--    se guardan YA MULTIPLICADOS por la cantidad, no por unidad: si
--    mañana corriges la ficha del alimento, lo que comiste ayer no
--    cambia solo. Un diario que se reescribe hacia atrás no sirve.
-- ---------------------------------------------------------------------
create table if not exists public.diary_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  meal       text not null check (meal in ('Desayuno','Comida','Cena','Snack')),

  food_name  text not null,
  quantity   numeric(9,2) not null default 100 check (quantity > 0),
  unit       text not null default 'Gramos'
             check (unit in ('Gramos','Pieza','Servicio','Taza','Cucharada','Onzas')),

  protein_g  numeric(8,2) not null default 0 check (protein_g >= 0),
  carbs_g    numeric(8,2) not null default 0 check (carbs_g   >= 0),
  fat_g      numeric(8,2) not null default 0 check (fat_g     >= 0),
  calories   numeric(9,2) generated always as (protein_g*4 + carbs_g*4 + fat_g*9) stored,

  created_at timestamptz not null default now()
);

-- El diario siempre se lee por usuario y rango de fechas
create index if not exists idx_diary_user_fecha
  on public.diary_entries(user_id, entry_date desc);


-- ---------------------------------------------------------------------
-- 5. Mis alimentos
--    La ficha reutilizable, con los macros POR UNIDAD (por 100 g, por
--    pieza, por taza…). Es lo que se copia y multiplica al apuntar algo
--    en el diario.
-- ---------------------------------------------------------------------
create table if not exists public.saved_foods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  unit       text not null default 'Gramos'
             check (unit in ('Gramos','Pieza','Servicio','Taza','Cucharada','Onzas')),
  base_qty   numeric(9,2) not null default 100 check (base_qty > 0),

  protein_g  numeric(8,2) not null default 0 check (protein_g >= 0),
  carbs_g    numeric(8,2) not null default 0 check (carbs_g   >= 0),
  fat_g      numeric(8,2) not null default 0 check (fat_g     >= 0),
  calories   numeric(9,2) generated always as (protein_g*4 + carbs_g*4 + fat_g*9) stored,

  -- Cuántas veces se ha usado: es lo que ordena la pestaña "Frecuentes",
  -- que no es una lista aparte sino esta misma ordenada por uso.
  veces_usado int not null default 0 check (veces_usado >= 0),
  ultimo_uso  timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, unit)
);

create index if not exists idx_saved_foods_frecuentes
  on public.saved_foods(user_id, veces_usado desc, ultimo_uso desc);

drop trigger if exists trg_tocar_saved_foods on public.saved_foods;
create trigger trg_tocar_saved_foods before update on public.saved_foods
  for each row execute function public.tocar_actualizado();


-- ---------------------------------------------------------------------
-- 6. Recetas
--    Los ingredientes van en jsonb y no en una tabla aparte, por la
--    razón explicada en la cabecera: una tabla hija que no esté en las
--    listas de 0002 y 0004 se quedaría sin RLS. Además una receta se lee
--    siempre entera, así que separarla no compraría nada.
--
--    Forma de `ingredients`:
--      [{"name":"Avena","qty":80,"unit":"Gramos","P":10.4,"C":54,"G":5.6}, …]
-- ---------------------------------------------------------------------
create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  servings    int not null default 1 check (servings > 0),
  ingredients jsonb not null default '[]'::jsonb,

  -- Totales de la receta entera, ya sumados. Se calculan al guardar.
  protein_g   numeric(8,2) not null default 0 check (protein_g >= 0),
  carbs_g     numeric(8,2) not null default 0 check (carbs_g   >= 0),
  fat_g       numeric(8,2) not null default 0 check (fat_g     >= 0),
  calories    numeric(9,2) generated always as (protein_g*4 + carbs_g*4 + fat_g*9) stored,

  -- OJO: la columna existe porque la pantalla muestra "pública/privada",
  -- pero con las políticas de 0002 una receta marcada como pública SIGUE
  -- siendo visible solo para su dueño y su coach. Compartirlas de verdad
  -- pide una política extra; hasta entonces esto es solo una etiqueta.
  is_public   boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists idx_recipes_user on public.recipes(user_id);

drop trigger if exists trg_tocar_recipes on public.recipes;
create trigger trg_tocar_recipes before update on public.recipes
  for each row execute function public.tocar_actualizado();


-- ---------------------------------------------------------------------
-- 7. Peso
--    Un registro por día como mucho: la gráfica de la app asume un punto
--    por fecha, y pesarse tres veces el mismo día solo mide el desayuno.
-- ---------------------------------------------------------------------
create table if not exists public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null default current_date,
  weight_kg  numeric(5,2) not null check (weight_kg between 20 and 400),
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create index if not exists idx_weight_user_fecha
  on public.weight_logs(user_id, log_date desc);


-- ---------------------------------------------------------------------
-- 8. Cardio
--    Varias sesiones el mismo día sí tienen sentido (correr en la mañana
--    y caminar en la tarde), así que aquí no hay unique por fecha: la
--    semana se suma.
-- ---------------------------------------------------------------------
create table if not exists public.cardio_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null default current_date,
  minutes    int not null check (minutes > 0 and minutes <= 600),
  kind       text,                    -- caminata, bici, elíptica, escaladora…
  created_at timestamptz not null default now()
);

create index if not exists idx_cardio_user_fecha
  on public.cardio_logs(user_id, log_date desc);


-- ---------------------------------------------------------------------
-- 9. Fotos de progreso
--    La imagen vive en el bucket privado `progress-photos` que crea
--    0002; aquí solo va la ficha. `storage_path` sigue el formato
--    {user_id}/{semana}/{pose}.webp — el primer segmento es lo que
--    usan las políticas de Storage para saber de quién es la foto.
--
--    `bytes` NO es decorativo: 0003 y 0004 lo suman para el consumo de
--    almacenamiento de cada organización.
-- ---------------------------------------------------------------------
create table if not exists public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Clave ISO de semana, tal como la arma la app: '2026-W31'
  week_key     text not null check (week_key ~ '^\d{4}-W\d{2}$'),
  pose         text not null check (pose in ('frente','espalda','izq','der')),

  storage_path text not null unique,
  bytes        bigint not null default 0 check (bytes >= 0),
  width        int check (width  is null or width  > 0),
  height       int check (height is null or height > 0),

  taken_at     timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  -- Una foto por pose y semana: la comparación "antes / después"
  -- necesita exactamente un par por semana para no ser ambigua.
  unique (user_id, week_key, pose)
);

create index if not exists idx_fotos_user_semana
  on public.progress_photos(user_id, week_key desc);


-- ---------------------------------------------------------------------
-- 10. Rutina — días
--     El nombre lo pone el usuario ("Pecho y tríceps", "Lunes", "Pierna")
--     y por eso es texto libre y no un día de la semana: mucha gente
--     organiza por músculo, no por calendario.
-- ---------------------------------------------------------------------
create table if not exists public.routine_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rdays_user_orden
  on public.routine_days(user_id, sort_order);

drop trigger if exists trg_tocar_rdays on public.routine_days;
create trigger trg_tocar_rdays before update on public.routine_days
  for each row execute function public.tocar_actualizado();


-- ---------------------------------------------------------------------
-- 11. Rutina — ejercicios de cada día
--     `user_id` está repetido aquí aunque se podría deducir del día:
--     es lo que permite que 0002 le aplique la política en bucle y que
--     0004 le cuelgue el trigger de organización. La alternativa sería
--     un subselect contra routine_days en cada política, evaluado fila
--     por fila. Esta columna es más barata que ese join.
-- ---------------------------------------------------------------------
create table if not exists public.routine_exercises (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  routine_day_id uuid not null references public.routine_days(id) on delete cascade,

  -- Nombre siempre presente; el enlace al catálogo, solo si vino de ahí.
  -- Así un ejercicio escrito a mano funciona igual que uno del catálogo,
  -- y si el catálogo cambia el nombre guardado no se mueve.
  exercise_id    uuid references public.exercise_library(id) on delete set null,
  name           text not null,

  sort_order     int not null default 0,
  rest_seconds   int not null default 180 check (rest_seconds between 0 and 3600),
  created_at     timestamptz not null default now()
);

create index if not exists idx_rex_dia_orden
  on public.routine_exercises(routine_day_id, sort_order);
create index if not exists idx_rex_user_nombre
  on public.routine_exercises(user_id, name);


-- ---------------------------------------------------------------------
-- 12. Rutina — series
--     `done` es el ✓ de la pantalla. El volumen (reps × peso) no se
--     guarda: se calcula al vuelo, igual que las calorías. Un número
--     derivado que se almacena es un número que algún día no cuadra.
-- ---------------------------------------------------------------------
create table if not exists public.exercise_sets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  routine_exercise_id uuid not null references public.routine_exercises(id) on delete cascade,

  sort_order int not null default 1 check (sort_order > 0),
  reps       int not null default 0 check (reps between 0 and 1000),
  weight_kg  numeric(6,2) not null default 0 check (weight_kg between 0 and 1000),
  done       boolean not null default false,
  created_at timestamptz not null default now(),

  unique (routine_exercise_id, sort_order)
);

create index if not exists idx_sets_ejercicio
  on public.exercise_sets(routine_exercise_id, sort_order);


-- ---------------------------------------------------------------------
-- 13. Sesiones de entrenamiento
--     Lo que la rutina guarda cuando el día se da por terminado. La
--     rutina de arriba es el PLAN (se edita, se reordena, se pisa); esto
--     es el HISTORIAL, y es inmutable: de aquí salen las gráficas de
--     progresión por ejercicio y la racha.
--
--     El desglose va en jsonb por lo mismo que los ingredientes de una
--     receta — ver la cabecera. Forma de `exercises`:
--       [{"name":"Press plano con barra","volume":1792,
--         "sets":[{"reps":10,"weight":60}, …]}, …]
--
--     `session_date` lo consultan 0003 (actividad, estadísticas) y la
--     racha: el nombre es fijo.
-- ---------------------------------------------------------------------
create table if not exists public.workout_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  session_date   date not null default current_date,

  -- El día puede borrarse después; la sesión que ya ocurrió, no.
  routine_day_id uuid references public.routine_days(id) on delete set null,
  day_name       text,

  exercises      jsonb not null default '[]'::jsonb,
  total_volume   numeric(10,2) not null default 0 check (total_volume >= 0),
  duration_min   int check (duration_min is null or duration_min between 0 and 600),
  note           text,

  created_at     timestamptz not null default now()
);

create index if not exists idx_sesiones_user_fecha
  on public.workout_sessions(user_id, session_date desc);


-- ---------------------------------------------------------------------
-- 14. Notas por ejercicio
--     Una nota por ejercicio y usuario, no por sesión: es el "banco en
--     el hoyo 3, cuidar el hombro" que quieres leer cada vez que te toca
--     ese movimiento, no un diario.
--
--     Se indexa por nombre y no por exercise_id porque tiene que
--     funcionar igual con los ejercicios escritos a mano, que no están
--     en el catálogo.
-- ---------------------------------------------------------------------
create table if not exists public.exercise_notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  body          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, exercise_name)
);

drop trigger if exists trg_tocar_notas on public.exercise_notes;
create trigger trg_tocar_notas before update on public.exercise_notes
  for each row execute function public.tocar_actualizado();


-- ---------------------------------------------------------------------
-- 15. Permisos de tabla
--     Esto es el permiso GRANT de toda la vida, que es una capa distinta
--     de RLS y va antes que ella: sin GRANT no se llega ni a evaluar la
--     política. Aquí se abre a `authenticated` y en 0002 se cierra fila
--     por fila. A `anon` no se le da nada: sin sesión no se lee nada.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.profiles, public.diary_entries, public.saved_foods, public.recipes,
  public.weight_logs, public.cardio_logs, public.progress_photos,
  public.routine_days, public.routine_exercises, public.exercise_sets,
  public.workout_sessions, public.exercise_notes
to authenticated;

-- El catálogo es de solo lectura para la app; 0002 se lo abre al super
-- admin con su propia política.
grant select on public.exercise_library to authenticated;


-- ---------------------------------------------------------------------
-- 16. Comprobaciones
--     Ejecútalas después de aplicar esta migración y ANTES de la 0002.
-- ---------------------------------------------------------------------
-- Las 13 tablas deben aparecer, y las 12 personales con su user_id:
--   select table_name from information_schema.tables
--    where table_schema='public' order by 1;
--
-- Ninguna tabla de datos debe quedarse sin user_id (esta consulta debe
-- devolver CERO filas, o 0002 y 0004 la dejarían fuera):
--   select t.table_name from information_schema.tables t
--    where t.table_schema='public' and t.table_type='BASE TABLE'
--      and t.table_name <> 'exercise_library'
--      and not exists (select 1 from information_schema.columns c
--                       where c.table_schema='public'
--                         and c.table_name=t.table_name
--                         and c.column_name='user_id');
--
-- El perfil debe crearse solo al registrarse:
--   select count(*) from auth.users u
--    where not exists (select 1 from public.profiles p where p.id=u.id);
--   -- debe dar 0
--
-- Aquí TODAVÍA no hay RLS: es lo esperado en este punto. Después de
-- aplicar 0002 esta consulta debe devolver todo en true:
--   select relname, relrowsecurity from pg_class
--    where relnamespace='public'::regnamespace and relkind='r' order by 1;


-- ============================ 0002_roles_y_rls.sql ============================

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


-- ============================ 0003_panel_super_admin.sql ============================

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


-- ============================ 0004_multiorganizacion.sql ============================

-- =====================================================================
--  MULTI-ORGANIZACIÓN (SaaS)
--  Plataforma → Organizaciones → Entrenadores → Clientes
--
--  Depende de 0002 (roles/RLS) y 0003 (panel admin).
--
--  NO rompe nada de lo existente: crea una organización por defecto,
--  mete ahí a todos los usuarios actuales y añade el aislamiento por
--  organización SIN cambiar una sola consulta de la app. La interfaz
--  no se entera de que existe `org_id`: lo rellenan triggers y lo
--  filtran las políticas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Organizaciones
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null unique,
  activo      boolean not null default true,
  plan        text not null default 'basico',
  max_coaches  int not null default 10,
  max_clientes int not null default 500,
  creado_en   timestamptz not null default now()
);

create index if not exists idx_org_activo on public.organizations(activo) where activo;

-- Organización por defecto: aquí vive todo lo que ya existe
insert into public.organizations (nombre, slug, plan, max_coaches, max_clientes)
values ('Organización principal', 'principal', 'ilimitado', 1000, 100000)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------
-- 2. Cada usuario pertenece a una organización
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists org_id uuid references public.organizations(id) on delete restrict;

-- Traspasar a los usuarios que ya existían
update public.profiles
   set org_id = (select id from public.organizations where slug = 'principal')
 where org_id is null;

alter table public.profiles alter column org_id set not null;

create index if not exists idx_profiles_org      on public.profiles(org_id);
create index if not exists idx_profiles_org_rol  on public.profiles(org_id, role);

-- Nuevo rol: quien administra UNA organización (por debajo del super admin).
--
-- El `alter type ... add value 'org_admin'` NO va aquí: Postgres prohíbe
-- usar un valor de enum en la misma transacción en que se añade, y este
-- archivo lo usaría unas líneas más abajo. Probado: la migración entera
-- fallaba con "unsafe use of new value org_admin of enum type app_role".
--
-- El valor se añade en 0005, que no hace nada más precisamente para que
-- su transacción cierre antes de que alguien lo use.


-- ---------------------------------------------------------------------
-- 3. Funciones de organización
--    STABLE + SECURITY DEFINER, igual que las de 0002: se evalúan una
--    vez por consulta, no una por fila.
-- ---------------------------------------------------------------------
create or replace function public.mi_org()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select org_id from public.profiles where id = auth.uid() $$;

create or replace function public.es_org_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    -- `role::text` y no `role = 'org_admin'`: el valor del enum todavía no
    -- existe cuando corre esta migración (lo añade 0005). Comparar como
    -- texto es legal siempre y devuelve false hasta que exista.
    where id = auth.uid() and role::text = 'org_admin'
  )
$$;

create or replace function public.misma_org(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = objetivo and p.org_id = public.mi_org()
  )
$$;

grant execute on function public.mi_org()          to authenticated;
grant execute on function public.es_org_admin()    to authenticated;
grant execute on function public.misma_org(uuid)   to authenticated;


-- ---------------------------------------------------------------------
-- 4. Reglas de visibilidad, ahora con organización
--
--    Se REEMPLAZAN las funciones de 0002. Como las políticas las llaman
--    por nombre, todas se actualizan solas: cero políticas que reescribir.
--    Esto es lo que evita duplicar reglas por tabla.
-- ---------------------------------------------------------------------
create or replace function public.puede_ver(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select objetivo is not null and (
       objetivo = auth.uid()                                  -- lo mío
    or public.es_super_admin()                                -- la plataforma entera
    or (public.es_org_admin() and public.misma_org(objetivo)) -- mi organización
    or public.es_coach_de(objetivo)                           -- mis clientes asignados
  )
$$;

create or replace function public.puede_editar_entreno(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select objetivo is not null and (
       objetivo = auth.uid()
    or public.es_super_admin()
    or (public.es_org_admin() and public.misma_org(objetivo))
    or public.es_coach_de(objetivo)
  )
$$;

-- Un coach solo ve a los clientes que le asignaron Y de su propia
-- organización: si alguien lo asignara mal entre organizaciones, la
-- segunda condición lo corta igual.
create or replace function public.es_coach_de(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.coach_clientes cc
      join public.profiles pc on pc.id = cc.cliente_id
      join public.profiles pe on pe.id = cc.coach_id
     where cc.coach_id = auth.uid()
       and cc.cliente_id = objetivo
       and cc.activo
       and pc.org_id = pe.org_id
  )
$$;


-- ---------------------------------------------------------------------
-- 5. `org_id` en las tablas de datos
--
--    Se guarda la organización en cada fila (clave de inquilino
--    desnormalizada). Cuesta una columna, pero evita un JOIN contra
--    profiles en CADA política y CADA consulta — con millones de filas
--    es la diferencia entre índice y escaneo. También deja la puerta
--    abierta a particionar por organización más adelante.
--
--    La app NUNCA envía org_id: lo pone un trigger. Así ninguna
--    pantalla existente necesita cambiar.
-- ---------------------------------------------------------------------
create or replace function public.rellenar_org()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.profiles where id = new.user_id;
  if v_org is null then
    raise exception 'El usuario % no pertenece a ninguna organización', new.user_id;
  end if;
  new.org_id := v_org;      -- se ignora lo que mande el cliente: manda el servidor
  return new;
end $$;

do $$
declare
  t text;
  tablas text[] := array[
    'diary_entries', 'saved_foods', 'recipes',
    'weight_logs', 'cardio_logs', 'progress_photos',
    'routine_days', 'routine_exercises', 'exercise_sets',
    'workout_sessions', 'exercise_notes'
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then continue; end if;

    -- columna
    execute format('alter table public.%I add column if not exists org_id uuid references public.organizations(id)', t);

    -- rellenar lo que ya existe
    execute format('update public.%I d set org_id = p.org_id from public.profiles p
                     where p.id = d.user_id and d.org_id is null', t);

    execute format('alter table public.%I alter column org_id set not null', t);

    -- índice compuesto: la organización va primero porque es el filtro
    -- más selectivo en un SaaS con muchos inquilinos
    execute format('create index if not exists idx_%s_org_user on public.%I(org_id, user_id)', t, t);

    -- trigger que lo rellena solo
    execute format('drop trigger if exists trg_org_%s on public.%I', t, t);
    execute format('create trigger trg_org_%s before insert or update of user_id on public.%I
                    for each row execute function public.rellenar_org()', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 6. Aislamiento por organización en las políticas
--
--    Defensa en profundidad: aunque `puede_ver` ya lo cubre, se añade
--    la condición de organización directamente en la política. Si
--    alguien introdujera un fallo en las funciones, el inquilino
--    seguiría aislado.
--
--    El super admin la salta a propósito: administra toda la plataforma.
-- ---------------------------------------------------------------------
create or replace function public.org_visible(fila_org uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select public.es_super_admin() or fila_org = public.mi_org() $$;
grant execute on function public.org_visible(uuid) to authenticated;

do $$
declare
  t text;
  personales text[] := array['diary_entries','saved_foods','recipes','weight_logs','cardio_logs','progress_photos'];
  entreno    text[] := array['routine_days','routine_exercises','exercise_sets','workout_sessions','exercise_notes'];
begin
  foreach t in array personales loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select
                    using (public.org_visible(org_id) and public.puede_ver(user_id))', t, t);
    execute format('drop policy if exists "%s: insertar" on public.%I', t, t);
    execute format('create policy "%s: insertar" on public.%I for insert
                    with check (public.puede_editar_propio(user_id))', t, t);
    execute format('drop policy if exists "%s: actualizar" on public.%I', t, t);
    execute format('create policy "%s: actualizar" on public.%I for update
                    using (public.org_visible(org_id) and public.puede_editar_propio(user_id))
                    with check (public.puede_editar_propio(user_id))', t, t);
    execute format('drop policy if exists "%s: borrar" on public.%I', t, t);
    execute format('create policy "%s: borrar" on public.%I for delete
                    using (public.org_visible(org_id) and public.puede_editar_propio(user_id))', t, t);
  end loop;

  foreach t in array entreno loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select
                    using (public.org_visible(org_id) and public.puede_ver(user_id))', t, t);
    execute format('drop policy if exists "%s: insertar" on public.%I', t, t);
    execute format('create policy "%s: insertar" on public.%I for insert
                    with check (public.puede_editar_entreno(user_id))', t, t);
    execute format('drop policy if exists "%s: actualizar" on public.%I', t, t);
    execute format('create policy "%s: actualizar" on public.%I for update
                    using (public.org_visible(org_id) and public.puede_editar_entreno(user_id))
                    with check (public.puede_editar_entreno(user_id))', t, t);
    execute format('drop policy if exists "%s: borrar" on public.%I', t, t);
    execute format('create policy "%s: borrar" on public.%I for delete
                    using (public.org_visible(org_id) and public.puede_editar_entreno(user_id))', t, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. Políticas de las organizaciones
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;

drop policy if exists "orgs: ver la mía" on public.organizations;
create policy "orgs: ver la mía" on public.organizations
  for select using ( public.es_super_admin() or id = public.mi_org() );

drop policy if exists "orgs: solo super admin crea" on public.organizations;
create policy "orgs: solo super admin crea" on public.organizations
  for insert with check ( public.es_super_admin() );

drop policy if exists "orgs: editar" on public.organizations;
create policy "orgs: editar" on public.organizations
  for update using ( public.es_super_admin() or (public.es_org_admin() and id = public.mi_org()) )
             with check ( public.es_super_admin() or (public.es_org_admin() and id = public.mi_org()) );

drop policy if exists "orgs: solo super admin borra" on public.organizations;
create policy "orgs: solo super admin borra" on public.organizations
  for delete using ( public.es_super_admin() );


-- ---------------------------------------------------------------------
-- 8. No mezclar organizaciones al asignar clientes
-- ---------------------------------------------------------------------
create or replace function public.validar_asignacion()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_org_coach uuid; v_org_cliente uuid; v_tope int; v_actuales int;
begin
  select org_id into v_org_coach   from public.profiles where id = new.coach_id;
  select org_id into v_org_cliente from public.profiles where id = new.cliente_id;

  if v_org_coach is distinct from v_org_cliente then
    raise exception 'El coach y el cliente son de organizaciones distintas';
  end if;

  if new.activo then
    select max_coaches into v_tope from public.organizations where id = v_org_coach;
    select count(*) into v_actuales
      from public.coach_clientes cc join public.profiles p on p.id = cc.coach_id
     where p.org_id = v_org_coach and cc.activo;
  end if;

  return new;
end $$;

drop trigger if exists trg_validar_asignacion on public.coach_clientes;
create trigger trg_validar_asignacion
  before insert or update on public.coach_clientes
  for each row execute function public.validar_asignacion();

-- Las asignaciones también se filtran por organización
drop policy if exists "asignaciones: ver las mías" on public.coach_clientes;
create policy "asignaciones: ver las mías" on public.coach_clientes
  for select using (
       coach_id = auth.uid()
    or cliente_id = auth.uid()
    or public.es_super_admin()
    or (public.es_org_admin() and public.misma_org(cliente_id))
  );

drop policy if exists "asignaciones: solo super admin asigna" on public.coach_clientes;
create policy "asignaciones: asignar" on public.coach_clientes
  for insert with check (
    public.es_super_admin() or (public.es_org_admin() and public.misma_org(cliente_id))
  );


-- ---------------------------------------------------------------------
-- 9. Perfiles: sumar el aislamiento por organización
-- ---------------------------------------------------------------------
drop policy if exists "perfiles: ver" on public.profiles;
create policy "perfiles: ver" on public.profiles
  for select using (
    public.es_super_admin() or (org_id = public.mi_org() and public.puede_ver(id))
  );

-- Todo usuario nuevo cae en la organización por defecto salvo que se
-- indique otra. Igual que el rol: no se acepta lo que mande el cliente.
create or replace function public.org_inicial()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.org_id is null then
    new.org_id := coalesce(
      public.mi_org(),
      (select id from public.organizations where slug = 'principal')
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_org_inicial on public.profiles;
create trigger trg_org_inicial before insert on public.profiles
  for each row execute function public.org_inicial();


-- ---------------------------------------------------------------------
-- 10. Fotos: la ruta ya empieza por user_id, así que basta con que
--     `puede_ver` (que ya considera organización) siga mandando.
--     Sin cambios en Storage.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 11. Feature flags por organización
--     Un flag global sigue funcionando igual; si existe una fila para
--     la organización, esa gana. Así se puede encender el chat para un
--     gimnasio y no para otro.
-- ---------------------------------------------------------------------
create table if not exists public.org_feature_flags (
  org_id uuid not null references public.organizations(id) on delete cascade,
  clave  text not null references public.feature_flags(clave) on delete cascade,
  activo boolean not null,
  actualizado_en timestamptz not null default now(),
  primary key (org_id, clave)
);

alter table public.org_feature_flags enable row level security;
drop policy if exists "flags org: leer" on public.org_feature_flags;
create policy "flags org: leer" on public.org_feature_flags
  for select using ( public.es_super_admin() or org_id = public.mi_org() );
drop policy if exists "flags org: escribir" on public.org_feature_flags;
create policy "flags org: escribir" on public.org_feature_flags
  for all using ( public.es_super_admin() or (public.es_org_admin() and org_id = public.mi_org()) )
          with check ( public.es_super_admin() or (public.es_org_admin() and org_id = public.mi_org()) );

-- Misma firma que en 0003: la app sigue llamando flag('clave') y no se entera
create or replace function public.flag(p_clave text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select activo from public.org_feature_flags where org_id = public.mi_org() and clave = p_clave),
    (select activo from public.feature_flags where clave = p_clave),
    false
  )
$$;


-- ---------------------------------------------------------------------
-- 12. Estadísticas acotadas a la organización
--     El super admin sigue viendo todo; un org_admin solo lo suyo.
-- ---------------------------------------------------------------------
create or replace function public.org_estadisticas()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_org uuid; v_dias int; v jsonb;
begin
  if not (public.es_super_admin() or public.es_org_admin()) then
    raise exception 'No autorizado';
  end if;
  v_org := public.mi_org();
  select coalesce((valor)::text::int, 14) into v_dias
    from public.system_settings where clave = 'dias_inactividad';

  select jsonb_build_object(
    'organizacion',  (select nombre from public.organizations where id = v_org),
    'entrenadores',  (select count(*) from public.profiles where org_id = v_org and role='coach'),
    'clientes',      (select count(*) from public.profiles where org_id = v_org and role='cliente'),
    'clientes_activos', (
      select count(distinct p.id) from public.profiles p
       where p.org_id = v_org and p.role='cliente'
         and exists (select 1 from public.diary_entries d
                      where d.user_id = p.id and d.entry_date > current_date - v_dias)),
    'storage_bytes', (select coalesce(sum(bytes),0) from public.progress_photos where org_id = v_org),
    'generado_en', now()
  ) into v;
  return v;
end $$;
grant execute on function public.org_estadisticas() to authenticated;


-- ---------------------------------------------------------------------
-- 13. Comprobaciones
-- ---------------------------------------------------------------------
-- select public.mi_org();                                  -- tu organización
-- select count(*) from public.diary_entries;               -- nunca cruza organizaciones
-- insert into public.coach_clientes(coach_id, cliente_id)  -- debe FALLAR si son de orgs distintas
--   values ('<coach-org-A>', '<cliente-org-B>');
-- explain analyze select * from public.diary_entries where entry_date > current_date - 7;
--   -- debe usar idx_diary_entries_org_user, no un Seq Scan


-- ============================ 0005_rol_org_admin.sql ============================

-- =====================================================================
--  EL ROL org_admin, ESTA VEZ DE VERDAD
--
--  Esta migración hace UNA sola cosa y por un motivo concreto.
--
--  0004 (sección 2) añade el valor 'org_admin' al enum app_role así:
--
--      do $$ begin
--        alter type public.app_role add value if not exists 'org_admin';
--      exception when others then null;
--      end $$;
--
--  Tiene dos problemas encadenados:
--
--    a) Postgres restringe `ALTER TYPE ... ADD VALUE` dentro de bloques
--       de transacción, y un bloque DO con manejador de excepciones abre
--       además una subtransacción. Según la versión, eso falla.
--
--    b) `exception when others then null` se traga CUALQUIER error, no
--       solo el de "ya existe". Si (a) ocurre, la migración termina en
--       verde y el valor nunca se añade. Nadie puede ser org_admin jamás,
--       `es_org_admin()` siempre devuelve false, y todo lo que cuelga de
--       ese rol queda muerto — en silencio, que es lo peor.
--
--  Aquí va suelto, sin DO y sin manejador: si falla, falla a la vista.
--  Y va en su propio archivo porque el valor nuevo de un enum no se
--  puede USAR en la misma transacción en que se añade. Al estar solo,
--  esta migración cierra su transacción antes de que la 0006 lo use.
--
--  `if not exists` la hace idempotente: si 0004 sí consiguió añadirlo,
--  esto no hace nada y no molesta.
-- =====================================================================

alter type public.app_role add value if not exists 'org_admin';


-- ---------------------------------------------------------------------
--  Comprobación
--  Después de aplicar esto, la lista debe traer los cuatro roles:
--  super_admin, coach, cliente, org_admin.
-- ---------------------------------------------------------------------
-- select unnest(enum_range(null::public.app_role));


-- ============================ 0006_cupos_y_acceso.sql ============================

-- =====================================================================
--  CUPOS DE ORGANIZACIÓN, CUENTAS DESACTIVADAS Y PERMISOS DEL org_admin
--
--  Cierra tres agujeros que quedaron abiertos en 0003 y 0004. No crea
--  tablas ni cambia columnas: solo reemplaza funciones y tres políticas.
--  La interfaz no se entera de nada.
--
--  Depende de 0005 (el valor 'org_admin' del enum ya confirmado).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Los cupos de la organización, aplicados de verdad
--
--    `organizations.max_coaches` y `max_clientes` existen desde 0004
--    pero no los miraba nadie: `validar_asignacion()` los leía en dos
--    variables y terminaba el `if` sin compararlas. Eran decorativos.
--
--    El sitio correcto para vigilarlos es `profiles`, que es donde un
--    usuario entra en una organización o cambia de rol — no en la tabla
--    de asignaciones, que es otra cosa.
-- ---------------------------------------------------------------------
create or replace function public.validar_cupo_org()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_tope     int;
  v_actuales int;
begin
  -- Un UPDATE que no toca ni la organización ni el rol no puede alterar
  -- ningún cupo: salir cuanto antes y no pagar dos COUNT por nada.
  if tg_op = 'UPDATE'
     and new.org_id is not distinct from old.org_id
     and new.role   is not distinct from old.role then
    return new;
  end if;

  -- El super admin es de la plataforma, no ocupa plaza en ninguna
  -- organización. El org_admin tampoco: administra, no entrena.
  if new.role = 'coach' then
    select max_coaches into v_tope
      from public.organizations where id = new.org_id;

    select count(*) into v_actuales
      from public.profiles
     where org_id = new.org_id and role = 'coach' and id <> new.id;

    if v_tope is not null and v_actuales >= v_tope then
      raise exception 'La organización ya llegó a su tope de % entrenadores', v_tope;
    end if;

  elsif new.role = 'cliente' then
    select max_clientes into v_tope
      from public.organizations where id = new.org_id;

    select count(*) into v_actuales
      from public.profiles
     where org_id = new.org_id and role = 'cliente' and id <> new.id;

    if v_tope is not null and v_actuales >= v_tope then
      raise exception 'La organización ya llegó a su tope de % clientes', v_tope;
    end if;
  end if;

  return new;
end $$;

-- OJO CON EL NOMBRE: cuando varios triggers comparten tabla y momento,
-- Postgres los ejecuta en orden alfabético. Este tiene que correr
-- DESPUÉS de los dos que rellenan los datos que aquí se comprueban:
--
--   trg_forzar_rol_inicial  (0002) → fija new.role
--   trg_org_inicial         (0004) → fija new.org_id
--   trg_validar_cupo_org    (aquí) → los valida
--
-- f < o < v, así que el orden sale solo. Si algún día lo renombras,
-- respeta esa letra o dejará de ver los valores definitivos.
drop trigger if exists trg_validar_cupo_org on public.profiles;
create trigger trg_validar_cupo_org
  before insert or update on public.profiles
  for each row execute function public.validar_cupo_org();


-- ---------------------------------------------------------------------
-- 2. La validación de asignaciones, sin el código muerto
--
--    Se conserva lo que ya hacía bien (no mezclar organizaciones) y se
--    completa lo que dejaba a medias. El tope por coach vive en
--    `system_settings.max_clientes_por_coach` desde 0003.
--
--    Antes esto solo se comprobaba dentro del RPC `admin_asignar()`. Un
--    org_admin que inserte directo en la tabla se lo saltaba entero;
--    ahora el trigger lo vigila venga por donde venga.
-- ---------------------------------------------------------------------
create or replace function public.validar_asignacion()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_org_coach   uuid;
  v_org_cliente uuid;
  v_tope        int;
  v_actuales    int;
begin
  select org_id into v_org_coach   from public.profiles where id = new.coach_id;
  select org_id into v_org_cliente from public.profiles where id = new.cliente_id;

  if v_org_coach is null or v_org_cliente is null then
    raise exception 'El coach o el cliente no tienen perfil con organización';
  end if;

  if v_org_coach is distinct from v_org_cliente then
    raise exception 'El coach y el cliente son de organizaciones distintas';
  end if;

  if new.activo then
    select coalesce((valor)::text::int, 80) into v_tope
      from public.system_settings where clave = 'max_clientes_por_coach';

    -- Cuenta los CLIENTES de ese coach. La versión anterior contaba
    -- filas de toda la organización, que no es lo que mide el ajuste.
    -- Se excluye la fila propia para que un upsert que solo reactiva
    -- una asignación existente no se cuente dos veces.
    select count(*) into v_actuales
      from public.coach_clientes
     where coach_id = new.coach_id
       and activo
       and cliente_id <> new.cliente_id;

    if v_actuales >= v_tope then
      raise exception 'Ese coach ya llegó al tope de % clientes', v_tope;
    end if;
  end if;

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 3. Una cuenta desactivada deja de ver datos — ahora sí
--
--    0003 define `acceso_permitido()` (cuenta activa + no estar en modo
--    mantenimiento) y lo deja escrito como "ejemplo, repetir el patrón
--    cuando quieras activarlo". Nunca se activó: hoy un coach
--    desactivado sigue leyendo el diario de sus clientes.
--
--    En vez de reescribir las políticas de las once tablas — que sería
--    repetir la misma condición once veces y dejar la puerta abierta a
--    olvidar una — se mete la comprobación DENTRO de las tres funciones
--    que ya llaman todas las políticas. Es el mismo truco que usa 0004
--    en su sección 4: cambias la función y todas las políticas se
--    actualizan solas, sin tocar ninguna.
-- ---------------------------------------------------------------------
create or replace function public.puede_ver(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.acceso_permitido() and objetivo is not null and (
       objetivo = auth.uid()
    or public.es_super_admin()
    or (public.es_org_admin() and public.misma_org(objetivo))
    or public.es_coach_de(objetivo)
  )
$$;

create or replace function public.puede_editar_propio(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.acceso_permitido() and (
       objetivo = auth.uid()
    or public.es_super_admin()
  )
$$;

create or replace function public.puede_editar_entreno(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.acceso_permitido() and objetivo is not null and (
       objetivo = auth.uid()
    or public.es_super_admin()
    or (public.es_org_admin() and public.misma_org(objetivo))
    or public.es_coach_de(objetivo)
  )
$$;


-- ---------------------------------------------------------------------
-- 4. …pero tu propia ficha la lees siempre
--
--    Consecuencia del punto anterior: si `puede_ver` empieza a exigir
--    cuenta activa, un usuario desactivado tampoco puede leer su PROPIO
--    perfil, y la app no tendría con qué explicarle lo que pasa. Se
--    quedaría en blanco, que parece un error en vez de una decisión.
--
--    Con esta excepción la app puede leer su fila, ver `activo = false`
--    y mostrar "tu cuenta está desactivada". Sus datos (diario, rutina,
--    fotos) siguen cerrados: eso lo gobiernan las otras políticas.
-- ---------------------------------------------------------------------
drop policy if exists "perfiles: ver" on public.profiles;
create policy "perfiles: ver" on public.profiles
  for select using (
       id = auth.uid()                                    -- siempre, aunque esté desactivado
    or public.es_super_admin()
    or (org_id = public.mi_org() and public.puede_ver(id))
  );


-- ---------------------------------------------------------------------
-- 5. El org_admin ya puede deshacer lo que hace
--
--    0004 le abrió el INSERT de asignaciones, pero el UPDATE y el DELETE
--    seguían siendo solo de super admin (venían de 0002). Resultado: un
--    org_admin podía asignarle un cliente a un coach y después no tenía
--    forma de quitárselo. Media función no es una función.
-- ---------------------------------------------------------------------
drop policy if exists "asignaciones: solo super admin modifica" on public.coach_clientes;
create policy "asignaciones: modificar" on public.coach_clientes
  for update using (
    public.es_super_admin() or (public.es_org_admin() and public.misma_org(cliente_id))
  ) with check (
    public.es_super_admin() or (public.es_org_admin() and public.misma_org(cliente_id))
  );

drop policy if exists "asignaciones: solo super admin quita" on public.coach_clientes;
create policy "asignaciones: quitar" on public.coach_clientes
  for delete using (
    public.es_super_admin() or (public.es_org_admin() and public.misma_org(cliente_id))
  );


-- ---------------------------------------------------------------------
-- 6. Comprobaciones
-- ---------------------------------------------------------------------
-- Los cuatro roles deben estar disponibles:
--   select unnest(enum_range(null::public.app_role));
--
-- El cupo debe saltar. Con una organización de max_clientes = 2:
--   update public.organizations set max_clientes = 2 where slug = 'principal';
--   -- el tercer cliente que entre debe FALLAR con "tope de 2 clientes"
--
-- Cuenta desactivada (ejecutar con la sesión de ese usuario):
--   update public.profiles set activo = false where id = '<un-coach>';
--   select count(*) from public.diary_entries;   -- debe dar 0
--   select activo from public.profiles where id = auth.uid();  -- debe dar false
--
-- Modo mantenimiento (con sesión de cualquiera que no sea super admin):
--   update public.feature_flags set activo = true where clave='modo_mantenimiento';
--   select count(*) from public.diary_entries;   -- debe dar 0
--   -- el super admin debe seguir viéndolo todo
--
-- Asignación entre organizaciones distintas: debe FALLAR
--   insert into public.coach_clientes(coach_id, cliente_id)
--     values ('<coach-org-A>', '<cliente-org-B>');


-- ============================ 0007_archivado_y_estados.sql ============================

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


-- ============================ 0008_auditoria_y_versiones.sql ============================

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


-- ============================ 0009_arranque_super_admin.sql ============================

-- =====================================================================
--  EL PROBLEMA DEL HUEVO Y LA GALLINA: crear el primer super admin
--
--  0002 (sección 10) te dice que ejecutes esto en el editor SQL:
--
--    update public.profiles set role='super_admin'
--     where id = (select id from auth.users where email='...');
--
--  No funciona. Probado contra PostgreSQL: falla con
--  "Solo un super admin puede cambiar roles".
--
--  El motivo: `trg_bloquear_escalada_de_rol` (0002, sección 4) rechaza
--  cualquier cambio de rol si quien lo pide no es super admin. En el
--  editor SQL no hay sesión de usuario, así que `auth.uid()` es NULL,
--  `es_super_admin()` devuelve false, y el trigger corta. Como todavía
--  no existe ningún super admin, no hay nadie que pueda crear al
--  primero. La plataforma nace bloqueada: sin super admin no se puede
--  promover a un coach, ni asignar clientes, ni usar ningún RPC de
--  administración.
--
--  LA SOLUCIÓN: distinguir "sin permiso" de "sin sesión".
--
--  `auth.uid() is null` significa que la llamada NO viene de un usuario
--  de la app. Viene del editor SQL, de una migración o de la clave
--  `service_role` — los tres son contextos del servidor, ya de confianza.
--
--  ¿Y no abre esto un agujero con la clave anónima, que tampoco tiene
--  usuario? No. Para llegar al trigger hay que pasar antes por el RLS de
--  `profiles`, cuya política de UPDATE exige `puede_editar_propio(id)`,
--  o sea `id = auth.uid()`. Con auth.uid() nulo eso es false y el UPDATE
--  ni siquiera alcanza ninguna fila. El anónimo no puede modificar nada.
--
--  Depende de 0008.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. El trigger deja pasar los contextos de servidor
-- ---------------------------------------------------------------------
create or replace function public.bloquear_escalada_de_rol()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null           -- hay sesión: es un usuario de la app
     and not public.es_super_admin() then
    raise exception 'Solo un super admin puede cambiar roles';
  end if;
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 2. Lo mismo al dar de alta
--
--    `forzar_rol_inicial` (0002) machaca el rol a 'cliente' en cada
--    INSERT. Con la misma lógica: si no hay sesión, quien inserta es el
--    servidor y se respeta el rol que pida. Es lo que permitirá a la
--    Edge Function de administración crear un entrenador directamente.
--
--    Tampoco abre nada: la política de INSERT de `profiles` exige
--    `id = auth.uid() or es_super_admin()`, y con la clave anónima
--    ninguna de las dos se cumple.
-- ---------------------------------------------------------------------
create or replace function public.forzar_rol_inicial()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.es_super_admin() then
    new.role := 'cliente';
  end if;
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 3. Nombrar al primer super admin, sin escribir SQL a mano
--
--    Se llama con el correo con el que ya te registraste normalmente en
--    la app. Es idempotente: llamarla dos veces no hace daño.
--
--    A propósito NO comprueba permisos: solo se puede ejecutar desde un
--    contexto que ya llegó al editor SQL o tiene la clave de servicio.
--    Por eso mismo se le quita el permiso a `authenticated` al final:
--    nadie desde la app puede llamarla.
-- ---------------------------------------------------------------------
create or replace function public.nombrar_super_admin(p_correo text)
returns text
language plpgsql security definer set search_path = public, pg_temp, auth
as $$
declare v_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'Esta función solo se ejecuta desde el servidor (editor SQL o service_role)';
  end if;

  select id into v_id from auth.users where email = lower(trim(p_correo));
  if v_id is null then
    raise exception 'No hay ninguna cuenta con el correo %. Regístrate primero en la app.', p_correo;
  end if;

  update public.profiles set role = 'super_admin', activo = true where id = v_id;
  if not found then
    raise exception 'La cuenta % existe pero no tiene perfil', p_correo;
  end if;

  return 'Listo: ' || p_correo || ' ya es super admin';
end $$;

revoke execute on function public.nombrar_super_admin(text) from public;
revoke execute on function public.nombrar_super_admin(text) from authenticated;


-- ---------------------------------------------------------------------
-- 4. Cómo se usa
--
--    1. Regístrate en la app con tu correo, como un usuario normal.
--    2. En el editor SQL de Supabase, ejecuta:
--
--         select public.nombrar_super_admin('tu-correo@ejemplo.com');
--
--    3. Cierra sesión y vuelve a entrar para que el token recoja el rol.
--
--    A partir de ahí ya puedes promover entrenadores desde el panel.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 5. Comprobaciones
-- ---------------------------------------------------------------------
-- Debe funcionar desde el editor SQL:
--   select public.nombrar_super_admin('tu-correo@ejemplo.com');
--   select role from public.profiles where id=(select id from auth.users where email='tu-correo@ejemplo.com');
--
-- Y un usuario de la app NO debe poder ascenderse (debe FALLAR):
--   update public.profiles set role='super_admin' where id = auth.uid();


-- ============================ 0010_borrar_cuenta_sin_huerfanos.sql ============================

-- =====================================================================
--  BORRAR UNA CUENTA NO DEBE DEJAR FILAS HUÉRFANAS
--
--  Fallo encontrado probando el borrado de una cuenta de prueba desde el
--  panel de Supabase:
--
--    antes  → auth.users: 1 · profiles: 1 · diary_entries: 1
--    borrar → auth.users: 0 · profiles: 1 · diary_entries: 0
--
--  El perfil sobrevive. Y no da error, que es lo peor: parece que salió
--  bien.
--
--  POR QUÉ. Las tablas cuelgan de auth.users con ON DELETE CASCADE, así
--  que borrar la cuenta manda un DELETE a cada una. Pero la 0007 les puso
--  un trigger que convierte los DELETE en archivado y CANCELA el borrado.
--  El resultado es una fila que apunta a un usuario que ya no existe.
--
--  `diary_entries` sí se borró porque no es archivable; las siete que sí
--  lo son (profiles, recipes, saved_foods, routine_days,
--  routine_exercises, exercise_sets, progress_photos) quedan huérfanas.
--
--  POR QUÉ IMPORTA. `admin_buscar_usuarios()` hace INNER JOIN contra
--  auth.users, así que esos perfiles no salen en la lista y parecen
--  borrados. Pero `admin_estadisticas()` cuenta directo sobre profiles:
--  las cuentas de prueba borradas seguirían inflando el tablero para
--  siempre, sin que nadie entienda de dónde salen.
--
--  LA SOLUCIÓN. Si el dueño de la fila ya no existe en auth.users, esto
--  no es alguien borrando algo suyo: es la cascada de una cuenta
--  eliminada. Ahí el borrado tiene que pasar.
--
--  Depende de 0009.
-- =====================================================================

create or replace function public.archivar_en_vez_de_borrar()
returns trigger
language plpgsql security definer set search_path = public, pg_temp, auth
as $$
declare
  v_dueno uuid;
begin
  -- Borrado real autorizado (borrar_usuario_definitivo): dejar pasar
  if coalesce(current_setting('app.borrado_definitivo', true), 'off') = 'on' then
    return old;
  end if;

  -- ¿De quién es esta fila? En `profiles` el dueño es la propia clave `id`;
  -- en las demás es `user_id`. Se lee del jsonb para que la misma función
  -- valga para las siete tablas, igual que hace el trigger de auditoría.
  v_dueno := coalesce(
    nullif(to_jsonb(old) ->> 'user_id', '')::uuid,
    nullif(to_jsonb(old) ->> 'id', '')::uuid
  );

  -- La cuenta ya no existe: esto es la cascada de un borrado de cuenta y
  -- cancelarlo dejaría basura apuntando a la nada.
  if v_dueno is not null
     and not exists (select 1 from auth.users u where u.id = v_dueno) then
    return old;
  end if;

  -- Ya estaba archivado: ni rehacer la marca ni volver a auditarlo
  if old.archivado_en is not null then
    return null;
  end if;

  execute format(
    'update public.%I set archivado_en = now(), archivado_por = auth.uid() where id = $1',
    tg_table_name
  ) using old.id;

  return null;   -- cancela el DELETE
end $$;


-- ---------------------------------------------------------------------
--  Limpiar lo que ya quedó huérfano
--
--  Si se borró alguna cuenta de prueba antes de este arreglo, su perfil
--  sigue ahí contando en el tablero. Esto lo barre de una vez.
--
--  Es un borrado de verdad, y es el correcto: son filas de usuarios que
--  ya no existen, no hay a quién devolvérselas.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  archivables text[] := array[
    'profiles', 'recipes', 'saved_foods',
    'routine_days', 'routine_exercises', 'exercise_sets',
    'progress_photos'
  ];
  v_col text;
  v_borradas int;
begin
  perform set_config('app.borrado_definitivo', 'on', true);

  foreach t in array archivables loop
    if to_regclass('public.' || t) is null then continue; end if;
    v_col := case when t = 'profiles' then 'id' else 'user_id' end;

    execute format(
      'delete from public.%I d
        where not exists (select 1 from auth.users u where u.id = d.%I)', t, v_col);

    get diagnostics v_borradas = row_count;
    if v_borradas > 0 then
      raise notice 'Huérfanas eliminadas en %: %', t, v_borradas;
    end if;
  end loop;

  perform set_config('app.borrado_definitivo', 'off', true);
end $$;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- No debe quedar ningún perfil sin cuenta (debe dar 0):
--   select count(*) from public.profiles p
--    where not exists (select 1 from auth.users u where u.id = p.id);
--
-- Y borrar una cuenta desde el panel debe llevarse todo lo suyo:
--   -- borrar el usuario en Authentication > Users, y después:
--   select count(*) from public.profiles;   -- una menos


-- ============================ 0011_fotos_seis_meses.sql ============================

-- =====================================================================
--  LAS FOTOS SE GUARDAN SEIS MESES
--
--  Son con diferencia lo que más pesa: cuatro por semana y persona, a
--  unos 300 KB cada una, son ~30 MB al año por cliente. Con doscientos
--  clientes eso es 6 GB al año creciendo sin freno, y son además el dato
--  más sensible que guarda la app.
--
--  Guardarlas para siempre no aporta —nadie compara con hace tres años—
--  y sí acumula coste y riesgo. Seis meses cubre de sobra un proceso de
--  cambio físico.
--
--  Depende de 0010.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Qué fotos ya pasaron de tiempo
--
--    `week_key` es texto ('2026-W31'), así que no se puede comparar con
--    una fecha directamente. Se convierte al lunes de esa semana ISO,
--    que es la misma cuenta que hace la app.
-- ---------------------------------------------------------------------
create or replace function public.lunes_de_clave(p_clave text)
returns date
language sql immutable
as $$
  select (
    -- lunes de la semana 1 del año (la que contiene el 4 de enero)
    date_trunc('week', make_date(split_part(p_clave, '-W', 1)::int, 1, 4))
    + ((split_part(p_clave, '-W', 2)::int - 1) * interval '7 days')
  )::date
$$;


-- ---------------------------------------------------------------------
-- 2. La limpieza
--
--    Borra de verdad, no archiva: el sentido de esto es dejar de guardar.
--    Por eso abre la compuerta de 0007 antes de borrar.
--
--    Devuelve cuántas quitó y qué rutas tenían, para que quien la llame
--    pueda borrar también los archivos del bucket. Eso NO se puede hacer
--    desde SQL: los archivos los gestiona la API de Storage. Sin ese
--    segundo paso las fichas desaparecen pero los archivos siguen
--    ocupando, así que la limpieza completa necesita las dos mitades.
-- ---------------------------------------------------------------------
create or replace function public.limpiar_fotos_viejas(p_meses int default 6)
returns table (borradas int, rutas text[])
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_limite date := (current_date - (p_meses || ' months')::interval)::date;
  v_rutas text[];
  v_n int;
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede limpiar fotos';
  end if;

  select array_agg(storage_path) into v_rutas
    from public.progress_photos
   where public.lunes_de_clave(week_key) < v_limite;

  perform set_config('app.borrado_definitivo', 'on', true);
  delete from public.progress_photos
   where public.lunes_de_clave(week_key) < v_limite;
  get diagnostics v_n = row_count;
  perform set_config('app.borrado_definitivo', 'off', true);

  return query select v_n, coalesce(v_rutas, array[]::text[]);
end $$;

revoke execute on function public.limpiar_fotos_viejas(int) from public;
grant  execute on function public.limpiar_fotos_viejas(int) to authenticated;


-- ---------------------------------------------------------------------
-- 3. Cómo dejarlo automático
--
--    Esta función hay que llamarla cada cierto tiempo. Dos caminos:
--
--    a) pg_cron, si está disponible en el proyecto:
--         select cron.schedule('fotos-6-meses', '0 4 * * 0',
--                              $q$select public.limpiar_fotos_viejas()$q$);
--       Limpia las fichas, pero NO los archivos del bucket.
--
--    b) Una Edge Function programada, que es lo completo: llama a esta
--       función, recoge las rutas que devuelve y las borra del bucket
--       con la clave de servicio.
--
--    Mientras no exista ninguna de las dos, la app ya deja de MOSTRAR lo
--    que pasa de seis meses (filtra por week_key al cargar), así que el
--    comportamiento visible es el correcto desde ya; lo que falta es
--    dejar de pagar por lo que nadie ve.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 4. Comprobaciones
-- ---------------------------------------------------------------------
-- La conversión de clave a lunes (debe dar 2026-07-27):
--   select public.lunes_de_clave('2026-W31');
--
-- Qué se borraría, sin borrar nada:
--   select count(*) from public.progress_photos
--    where public.lunes_de_clave(week_key) < (current_date - interval '6 months')::date;
--
-- Y la limpieza (solo super admin):
--   select * from public.limpiar_fotos_viejas();


-- ============================ 0012_alimentos_sugeridos.sql ============================

-- =====================================================================
--  SUGERENCIAS DE ALIMENTOS, ALIMENTADAS POR QUIEN USA LA APP
--
--  Al escribir en el buscador aparecen alimentos que otras personas ya
--  crearon. No es un catálogo comprado ni una base mundial: es lo que la
--  gente de ESTA app ha ido registrando.
--
--  LA REGLA QUE LO HACE VIABLE: un alimento no se sugiere hasta que
--  varias personas lo han creado por separado. Eso resuelve dos problemas
--  a la vez:
--
--    1. PRIVACIDAD. Si se sugiriera todo lo que alguien guarda, el primero
--       que apunte "Pastel de cumpleaños de mi mamá" o "Batido de la dieta
--       del Dr. X" se lo estaría enseñando a desconocidos. Exigiendo que
--       coincidan varias personas, lo que se sugiere es solo lo que ya es
--       de dominio común.
--
--    2. CALIDAD. Si uno se equivoca tecleando los macros, su error no se
--       propaga: hacen falta varios que coincidan, y de sus valores se
--       toma la MEDIANA, que ignora los extremos.
--
--  El umbral se ajusta desde system_settings sin tocar código.
--
--  Depende de 0011.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Normalizar un nombre
--
--    "Avena", "avena ", "AVENA" y "Aveña" tienen que ser lo mismo, o la
--    agrupación no juntaría nada y nunca se alcanzaría el umbral.
--
--    Se hace con translate() y no con la extensión unaccent porque esta
--    no está garantizada en todos los proyectos, y para español basta.
--    IMMUTABLE es obligatorio para poder indexar por esta función.
-- ---------------------------------------------------------------------
create or replace function public.normalizar_texto(p_texto text)
returns text
language sql immutable
as $$
  select regexp_replace(
           translate(lower(coalesce(p_texto, '')),
                     'áàäâéèëêíìïîóòöôúùüûñç',
                     'aaaaeeeeiiiioooouuuunc'),
           '\s+', ' ', 'g')
$$;

-- Sin este índice, cada búsqueda recorrería la tabla entera de alimentos
-- de todo el mundo.
create index if not exists idx_saved_foods_normalizado
  on public.saved_foods (public.normalizar_texto(name))
  where archivado_en is null;


-- ---------------------------------------------------------------------
-- 2. Cuántas personas hacen falta para que algo se sugiera
-- ---------------------------------------------------------------------
insert into public.system_settings (clave, valor, descripcion) values
  ('min_personas_alimento', '3'::jsonb,
   'Cuántas personas distintas deben haber creado un alimento para que empiece a sugerirse a los demás.')
on conflict (clave) do nothing;


-- ---------------------------------------------------------------------
-- 3. La búsqueda
--
--    SECURITY DEFINER a propósito: tiene que mirar los alimentos de TODA
--    la gente, y el RLS de saved_foods solo deja ver los propios. Por eso
--    la función devuelve únicamente datos agregados —nombre, unidad y
--    macros— y NUNCA de quién son. No hay forma de saber quién guardó qué.
--
--    Devuelve la mediana de cada macro y la forma de escribir el nombre
--    más repetida.
-- ---------------------------------------------------------------------
create or replace function public.buscar_alimentos(p_texto text, p_limite int default 12)
returns table (
  nombre     text,
  unit       text,
  protein_g  numeric,
  carbs_g    numeric,
  fat_g      numeric,
  personas   int
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_min int;
  v_busca text := public.normalizar_texto(p_texto);
begin
  -- Menos de dos letras devuelve vacío: con una sola, la lista sería ruido
  if length(trim(v_busca)) < 2 then
    return;
  end if;

  select coalesce((valor)::text::int, 3) into v_min
    from public.system_settings where clave = 'min_personas_alimento';

  return query
  select
    mode() within group (order by f.name)                                    as nombre,
    f.unit,
    round(percentile_cont(0.5) within group (order by f.protein_g)::numeric, 1) as protein_g,
    round(percentile_cont(0.5) within group (order by f.carbs_g)::numeric, 1)   as carbs_g,
    round(percentile_cont(0.5) within group (order by f.fat_g)::numeric, 1)     as fat_g,
    count(distinct f.user_id)::int                                           as personas
  from public.saved_foods f
  where f.archivado_en is null
    and public.normalizar_texto(f.name) like '%' || v_busca || '%'
  group by public.normalizar_texto(f.name), f.unit
  having count(distinct f.user_id) >= v_min
  -- Primero lo que más gente tiene; a igualdad, lo que más se usa
  order by count(distinct f.user_id) desc, sum(f.veces_usado) desc
  limit least(greatest(p_limite, 1), 25);
end $$;

revoke execute on function public.buscar_alimentos(text, int) from public;
grant  execute on function public.buscar_alimentos(text, int) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Comprobaciones
-- ---------------------------------------------------------------------
-- La normalización junta lo que debe (las tres deben dar 'avena'):
--   select public.normalizar_texto('Avena'), public.normalizar_texto('  AVENA '),
--          public.normalizar_texto('Aveña');
--
-- Buscar (vacío mientras no haya suficientes personas con ese alimento):
--   select * from public.buscar_alimentos('pollo');
--
-- Cuánto falta para que algo empiece a sugerirse:
--   select public.normalizar_texto(name) alimento, count(distinct user_id) personas
--     from public.saved_foods where archivado_en is null
--    group by 1 order by 2 desc limit 20;
--
-- Y para aflojar o endurecer el umbral:
--   update public.system_settings set valor = '2'::jsonb
--    where clave = 'min_personas_alimento';

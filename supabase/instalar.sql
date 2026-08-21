-- =====================================================================
--  INSTALACIÓN COMPLETA — pega este archivo entero en el editor SQL
--  de Supabase y pulsa Run. Una sola vez.
--
--  Son las 42 migraciones de supabase/migrations/ unidas en orden.
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


-- ============================ 0013_cantidad_de_comidas_viejas.sql ============================

-- =====================================================================
--  ARREGLAR LA CANTIDAD DE LAS COMIDAS ANTERIORES A LA EDICIÓN
--
--  Antes de que la app permitiera editar cuánto se comió, todas las
--  entradas del diario se guardaban con `quantity = 1`, queriendo decir
--  "una porción". Los macros se guardaban ya multiplicados, así que la
--  cifra era correcta y ese 1 no molestaba a nadie.
--
--  Al aparecer la edición, `quantity` pasó a significar "cuánto se comió
--  en su unidad": 124 gramos, 2 piezas. Con ese significado nuevo, las
--  filas viejas dicen "me comí 1 gramo y me aportó 20 g de proteína", y
--  al recalcular una porción de 100 g salían 2000 g de proteína y 13.000
--  calorías. Se vio en pantalla antes de que rompiera nada.
--
--  Esto pone la cantidad que de verdad representaban esas filas. Los
--  macros NO se tocan: siempre estuvieron bien.
--
--  Depende de 0012.
-- =====================================================================

update public.diary_entries
   set quantity = 100
 where quantity = 1
   and unit in ('Gramos', 'Onzas');

-- Las unidades que se cuentan de una en una (pieza, taza, cucharada,
-- servicio) ya estaban bien: ahí `1` sí quería decir una unidad.


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- No debería quedar ninguna entrada en gramos con cantidad 1 (dará 0
-- ahora, y si algún día vuelve a aparecer será porque alguien apuntó de
-- verdad un gramo de algo):
--   select count(*) from public.diary_entries
--    where quantity = 1 and unit in ('Gramos','Onzas');
--
-- Y que las calorías por gramo tengan sentido (nada por encima de ~9):
--   select food_name, quantity, unit, round(calories / nullif(quantity,0), 2) cal_por_unidad
--     from public.diary_entries
--    where unit in ('Gramos','Onzas')
--    order by 4 desc nulls last limit 10;


-- ============================ 0014_planes_de_comida.sql ============================

-- =====================================================================
--  PLANES DE COMIDA
--
--  No todo el mundo quiere contar macros. Para mucha gente —los padres de
--  uno, por ejemplo— lo útil es abrir la app y que le diga qué comer hoy,
--  sin pesar nada ni apuntar nada.
--
--  Un plan lo escribe el entrenador (o el super admin) PARA un cliente.
--  El cliente solo lo lee.
--
--  OJO CON ESTA TABLA. 0002 y 0004 generan las políticas recorriendo
--  listas fijas de nombres, y `planes` no está en ellas: si no se le
--  escriben aquí sus políticas, nace sin RLS y la lee cualquiera con la
--  clave anónima. Por eso van explícitas más abajo, y por eso las comidas
--  van en jsonb en vez de en una tabla hija —una tabla hija tendría el
--  mismo problema—.
--
--  Depende de 0013.
-- =====================================================================

create table if not exists public.planes (
  id          uuid primary key default gen_random_uuid(),

  -- De quién es el plan (el cliente), no quién lo escribió
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid references public.organizations(id),

  nombre      text not null default 'Mi plan',
  nota        text,

  -- [{ "momento": "Desayuno", "texto": "2 huevos, pan integral, café" }, …]
  -- El orden del array es el orden en que se muestra.
  comidas     jsonb not null default '[]'::jsonb,

  -- Un solo plan vigente por persona; los anteriores quedan de historial
  activo      boolean not null default true,

  creado_por  uuid references auth.users(id),
  archivado_en  timestamptz,
  archivado_por uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_planes_user on public.planes(user_id) where activo;
create index if not exists idx_planes_org  on public.planes(org_id, user_id);


-- ---------------------------------------------------------------------
--  Los mismos automatismos que el resto de tablas de datos
-- ---------------------------------------------------------------------
drop trigger if exists trg_org_planes on public.planes;
create trigger trg_org_planes
  before insert or update of user_id on public.planes
  for each row execute function public.rellenar_org();

drop trigger if exists trg_tocar_planes on public.planes;
create trigger trg_tocar_planes before update on public.planes
  for each row execute function public.tocar_actualizado();

-- Borrar un plan lo archiva, como todo lo demás desde la 0007
drop trigger if exists trg_archivar_planes on public.planes;
create trigger trg_archivar_planes before delete on public.planes
  for each row execute function public.archivar_en_vez_de_borrar();

-- Y queda registrado quién lo cambió y qué decía antes
drop trigger if exists ztrg_auditoria_planes on public.planes;
create trigger ztrg_auditoria_planes
  after update or delete on public.planes
  for each row execute function public.registrar_auditoria();


-- ---------------------------------------------------------------------
--  Quién ve y quién escribe
--
--  Leer: el dueño del plan, su entrenador y el super admin — que es lo
--  que hace puede_ver().
--
--  Escribir: puede_editar_entreno(), la misma regla que las rutinas. El
--  entrenador SÍ puede escribir el plan de su cliente; es justo el
--  sentido de tener entrenador. Un cliente no puede escribirle el plan a
--  otro, aunque conozca su id.
-- ---------------------------------------------------------------------
alter table public.planes enable row level security;

drop policy if exists "planes: ver" on public.planes;
create policy "planes: ver" on public.planes
  for select using (
    (archivado_en is null or public.ver_archivados())
    and public.org_visible(org_id)
    and public.puede_ver(user_id)
  );

drop policy if exists "planes: crear" on public.planes;
create policy "planes: crear" on public.planes
  for insert with check ( public.puede_editar_entreno(user_id) );

drop policy if exists "planes: actualizar" on public.planes;
create policy "planes: actualizar" on public.planes
  for update using ( public.org_visible(org_id) and public.puede_editar_entreno(user_id) )
             with check ( public.puede_editar_entreno(user_id) );

drop policy if exists "planes: borrar" on public.planes;
create policy "planes: borrar" on public.planes
  for delete using ( public.org_visible(org_id) and public.puede_editar_entreno(user_id) );

grant select, insert, update, delete on public.planes to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- La tabla NO debe quedarse sin RLS (debe dar true):
--   select relrowsecurity from pg_class where relname = 'planes';
--
-- Un cliente no puede escribirle el plan a otro (debe FALLAR):
--   insert into public.planes(user_id, nombre) values ('<otro-cliente>', 'X');
--
-- Y el suyo sí lo ve:
--   select nombre, comidas from public.planes where user_id = auth.uid() and activo;


-- ============================ 0015_uso_del_asistente.sql ============================

-- =====================================================================
--  CUÁNTO USA CADA QUIEN EL ASISTENTE
--
--  Cada consulta al asistente cuesta dinero de verdad, y se paga con una
--  sola clave: la del dueño de la app. Sin un tope, a un solo usuario
--  -o a alguien que consiga un token válido- le basta un bucle para
--  vaciar la cuenta en una noche.
--
--  Esta tabla lleva la cuenta por persona y día. Quien la escribe es la
--  Edge Function con la clave de servicio; desde la API nadie puede
--  tocarla, solo leer lo suyo para ver cuánto le queda.
--
--  Depende de 0014.
-- =====================================================================

create table if not exists public.ia_uso (
  user_id    uuid not null references auth.users(id) on delete cascade,
  dia        date not null default current_date,
  consultas  integer not null default 0,
  ultima_en  timestamptz not null default now(),
  primary key (user_id, dia)
);

-- Para barrer los días viejos sin recorrer la tabla entera
create index if not exists idx_ia_uso_dia on public.ia_uso(dia);


-- ---------------------------------------------------------------------
--  El tope
--
--  Sube uno y dice si se pasó. Va en SECURITY DEFINER porque la llama la
--  Edge Function, y así el tope no depende de que quien llame tenga
--  permisos de escritura sobre la tabla.
--
--  Devuelve las consultas que quedan; si ya no quedan, devuelve -1 y NO
--  suma. Así la función no puede "gastar" una consulta al rechazarla.
-- ---------------------------------------------------------------------
create or replace function public.gastar_consulta_ia(
  usuario uuid,
  tope    integer default 40
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  usadas integer;
begin
  select consultas into usadas
    from public.ia_uso
   where user_id = usuario and dia = current_date
   for update;

  if usadas is null then
    insert into public.ia_uso(user_id, dia, consultas)
    values (usuario, current_date, 1);
    return tope - 1;
  end if;

  if usadas >= tope then
    return -1;                       -- se acabó por hoy; no se suma nada
  end if;

  update public.ia_uso
     set consultas = consultas + 1, ultima_en = now()
   where user_id = usuario and dia = current_date;

  return tope - usadas - 1;
end;
$$;

revoke all on function public.gastar_consulta_ia(uuid, integer) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  Limpieza: el historial de uso no sirve de nada pasado un mes
-- ---------------------------------------------------------------------
create or replace function public.limpiar_uso_ia()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare borradas integer;
begin
  delete from public.ia_uso where dia < current_date - 30;
  get diagnostics borradas = row_count;
  return borradas;
end;
$$;


-- ---------------------------------------------------------------------
--  Quién ve qué
--
--  Cada quien ve solo su propio consumo, para poder enseñarle "te quedan
--  N consultas hoy". NADIE escribe desde la API: sumar es cosa de la
--  Edge Function, que usa la clave de servicio y se salta RLS. Sin
--  política de insert/update, cualquier intento de escritura falla.
-- ---------------------------------------------------------------------
alter table public.ia_uso enable row level security;

drop policy if exists "ia_uso: ver lo mio" on public.ia_uso;
create policy "ia_uso: ver lo mio" on public.ia_uso
  for select using ( user_id = auth.uid() or public.es_super_admin() );

grant select on public.ia_uso to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Gastar 3 consultas con tope 3: la tercera deja 0 y la cuarta da -1
--   select public.gastar_consulta_ia('<uuid>', 3);  -- 2
--   select public.gastar_consulta_ia('<uuid>', 3);  -- 1
--   select public.gastar_consulta_ia('<uuid>', 3);  -- 0
--   select public.gastar_consulta_ia('<uuid>', 3);  -- -1
--
-- Y que nadie pueda escribirla desde la API (debe FALLAR):
--   insert into public.ia_uso(user_id, consultas) values (auth.uid(), 0);


-- ============================ 0016_permiso_del_tope.sql ============================

-- =====================================================================
--  DEVOLVERLE A LA EDGE FUNCTION EL PERMISO DE CONTAR CONSULTAS
--
--  La 0015 termina con:
--      revoke all on function gastar_consulta_ia(...) from public, anon,
--             authenticated;
--
--  La intención era que ningún usuario pudiera llamarla y regalarse
--  consultas. Eso está bien. El problema es que `service_role` -la
--  identidad con la que la Edge Function habla con la base- no tenía
--  permiso propio: dependía del que Postgres le da a `public` por
--  defecto en toda función nueva. Al quitárselo a `public`, se lo quité
--  también a ella.
--
--  Resultado: la función arrancaba, pedía el tope, la base le decía que
--  no, y devolvía "No se pudo comprobar tu uso" por un camino que NO
--  escribe en el registro. De ahí que el asistente fallara sin dejar ni
--  una línea de error, que fue lo que costó encontrarlo.
--
--  SECURITY DEFINER decide con qué privilegios corre el cuerpo de la
--  función. No exime a quien la llama de tener permiso para llamarla.
--  Son dos cosas distintas y aquí se confundieron.
--
--  Depende de 0015.
-- =====================================================================

grant execute on function public.gastar_consulta_ia(uuid, integer) to service_role;

-- anon y authenticated siguen SIN permiso, que era el objetivo real: el
-- tope solo lo mueve el servidor, nunca el teléfono de nadie.

-- La de limpieza la llamará una tarea programada con la misma identidad.
grant execute on function public.limpiar_uso_ia() to service_role;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- El servidor sí, los usuarios no (debe dar true, false, false):
--   select has_function_privilege('service_role',
--            'public.gastar_consulta_ia(uuid,integer)','execute'),
--          has_function_privilege('authenticated',
--            'public.gastar_consulta_ia(uuid,integer)','execute'),
--          has_function_privilege('anon',
--            'public.gastar_consulta_ia(uuid,integer)','execute');


-- ============================ 0017_poderes_del_super_admin.sql ============================

-- =====================================================================
--  PODERES DEL SUPER ADMIN SOBRE LAS CUENTAS
--
--  Tres cosas:
--    1. Un interruptor de IA por persona.
--    2. Que esos interruptores solo los mueva el super admin -y no el
--       propio interesado, que es el agujero que había-.
--    3. Invitar por correo a gente que todavía no tiene cuenta.
--
--  La suspensión NO se inventa aquí: la 0007 ya trae `estado` con
--  'suspendido' y un trigger que apaga el acceso. Esto solo pone quién
--  puede tocarlo.
--
--  Depende de 0016.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Interruptor de IA
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists ia_habilitada boolean not null default true;

comment on column public.profiles.ia_habilitada is
  'Si es false, la Edge Function del asistente rechaza a esta persona. '
  'Sirve para cortarle el gasto a alguien concreto sin suspenderle la cuenta.';


-- ---------------------------------------------------------------------
--  2. Quién mueve los interruptores
--
--  La política de UPDATE de profiles usa puede_editar_propio(), o sea
--  que cada quien puede editar su propia fila. Eso está bien para el
--  nombre o los macros, pero NO para estos tres campos: si alguien puede
--  escribir su propio `activo`, se quita la suspensión solo; si puede
--  escribir `ia_habilitada`, se vuelve a encender la IA que le apagué.
--
--  El trigger de roles (0002) ya protegía `role` de la misma forma.
--  Esto extiende la misma idea a los campos que deciden acceso y gasto.
-- ---------------------------------------------------------------------
create or replace function public.bloquear_cambios_de_cuenta()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.es_super_admin() then
    return new;                       -- el super admin manda
  end if;

  -- auth.uid() nulo = contexto de servidor de confianza (una función con
  -- la clave de servicio, un script de mantenimiento). Mismo criterio que
  -- en 0009 para poder nombrar al primer super admin.
  if auth.uid() is null then
    return new;
  end if;

  if new.ia_habilitada is distinct from old.ia_habilitada then
    raise exception 'Solo un super admin puede cambiar el acceso a la IA';
  end if;
  if new.estado is distinct from old.estado then
    raise exception 'Solo un super admin puede cambiar el estado de la cuenta';
  end if;
  if new.activo is distinct from old.activo then
    raise exception 'Solo un super admin puede activar o desactivar una cuenta';
  end if;

  return new;
end $$;

-- Debe correr ANTES que trg_sincronizar_estado (b < s): si alguien no
-- autorizado toca `estado`, se corta aquí y el otro ni llega a apagar
-- `activo`.
drop trigger if exists trg_bloquear_cambios_de_cuenta on public.profiles;
create trigger trg_bloquear_cambios_de_cuenta
  before update on public.profiles
  for each row execute function public.bloquear_cambios_de_cuenta();


-- ---------------------------------------------------------------------
--  3. Invitaciones por correo
--
--  Se apunta el correo con el rol y el entrenador que le tocan. Cuando
--  esa persona se registra, un trigger lo aplica. Si nunca se registra,
--  la fila se queda ahí sin hacer nada.
--
--  OJO: tabla nueva. 0002 y 0004 generan políticas recorriendo listas
--  fijas de nombres y esta no está en ellas, así que van escritas aquí.
--  Sin esto naceria sin RLS y cualquiera leeria los correos.
-- ---------------------------------------------------------------------
create table if not exists public.invitaciones (
  id           uuid primary key default gen_random_uuid(),
  correo       text not null,
  rol          public.app_role not null default 'cliente',
  org_id       uuid references public.organizations(id),
  coach_id     uuid references auth.users(id) on delete set null,
  nota         text,
  invitado_por uuid references auth.users(id),
  creado_en    timestamptz not null default now(),
  aceptada_en  timestamptz,
  aceptada_por uuid references auth.users(id)
);

-- El correo se guarda en minúsculas y sin espacios: "Ana@X.com " y
-- "ana@x.com" son la misma persona, y si no se normaliza aquí la
-- invitación no encontraría a quien se registra.
create or replace function public.normalizar_correo_invitacion()
returns trigger
language plpgsql
as $$
begin
  new.correo := lower(btrim(new.correo));
  return new;
end $$;

drop trigger if exists trg_normalizar_correo on public.invitaciones;
create trigger trg_normalizar_correo
  before insert or update of correo on public.invitaciones
  for each row execute function public.normalizar_correo_invitacion();

-- Una invitación viva por correo. Parcial, como en 0007: si se acepta,
-- se puede volver a invitar al mismo correo más adelante.
create unique index if not exists idx_invitacion_correo_viva
  on public.invitaciones(correo) where aceptada_en is null;


-- Al registrarse, aplicar la invitación que le tocara.
--
-- Va en AFTER INSERT y actualiza la fila, en vez de en BEFORE. Los
-- triggers BEFORE de profiles ya son cuatro y su orden es alfabético;
-- meter uno más ahí obligaría a razonar dónde encaja respecto al rol
-- forzado, la organización y el cupo. Actualizar después evita todo eso
-- al precio de una escritura más.
create or replace function public.aplicar_invitacion()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  inv public.invitaciones%rowtype;
  correo_usuario text;
begin
  select lower(btrim(email)) into correo_usuario
    from auth.users where id = new.id;
  if correo_usuario is null then
    return new;
  end if;

  select * into inv from public.invitaciones
   where correo = correo_usuario and aceptada_en is null
   order by creado_en desc limit 1;
  if not found then
    return new;
  end if;

  update public.profiles
     set role   = inv.rol,
         org_id = coalesce(inv.org_id, org_id)
   where id = new.id;

  if inv.coach_id is not null and inv.rol = 'cliente' then
    insert into public.coach_clientes(coach_id, cliente_id)
    values (inv.coach_id, new.id)
    on conflict do nothing;
  end if;

  update public.invitaciones
     set aceptada_en = now(), aceptada_por = new.id
   where id = inv.id;

  return new;
end $$;

drop trigger if exists ztrg_aplicar_invitacion on public.profiles;
create trigger ztrg_aplicar_invitacion
  after insert on public.profiles
  for each row execute function public.aplicar_invitacion();


-- Solo el super admin ve y crea invitaciones. Son correos de terceros:
-- que un entrenador cualquiera pudiera listarlos seria una fuga.
alter table public.invitaciones enable row level security;

drop policy if exists "invitaciones: solo super admin" on public.invitaciones;
create policy "invitaciones: solo super admin" on public.invitaciones
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );

grant select, insert, update, delete on public.invitaciones to authenticated;


-- ---------------------------------------------------------------------
--  4. Acciones del panel
--
--  Mismo patrón que admin_activar() de la 0003: comprobar el rol en la
--  base, actuar, y dejarlo anotado. Se hace por función y no con un
--  UPDATE desde la app para que la bitácora recoja quién y cuándo.
-- ---------------------------------------------------------------------
create or replace function public.admin_ia(p_usuario uuid, p_habilitada boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede cambiar el acceso a la IA';
  end if;

  update public.profiles set ia_habilitada = p_habilitada where id = p_usuario;
  perform public.anotar(
    case when p_habilitada then 'ia_on' else 'ia_off' end, p_usuario, '{}'::jsonb);
end $$;

create or replace function public.admin_estado(p_usuario uuid, p_estado public.estado_cliente)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede cambiar el estado de una cuenta';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes suspenderte a ti mismo';
  end if;

  -- Suspender apaga el acceso solo (lo hace trg_sincronizar_estado de la
  -- 0007). Reactivar NO lo enciende: eso es deliberado allí, así que hay
  -- que encenderlo aquí a mano o la cuenta quedaría 'activa' pero sin
  -- poder entrar, que es la peor combinación posible.
  update public.profiles
     set estado = p_estado,
         activo = case when p_estado = 'activo' then true else activo end,
         desactivado_en  = case when p_estado = 'activo' then null else desactivado_en end,
         desactivado_por = case when p_estado = 'activo' then null else desactivado_por end
   where id = p_usuario;

  perform public.anotar('estado', p_usuario, jsonb_build_object('estado', p_estado));
end $$;

revoke execute on function public.admin_ia(uuid, boolean)                      from public;
revoke execute on function public.admin_estado(uuid, public.estado_cliente)    from public;
grant  execute on function public.admin_ia(uuid, boolean)                      to authenticated;
grant  execute on function public.admin_estado(uuid, public.estado_cliente)    to authenticated;


-- La búsqueda del panel necesita los campos nuevos para poder pintarlos.
-- Se redefine entera porque cambia el `returns table`.
drop function if exists public.admin_buscar_usuarios(text, int);
create or replace function public.admin_buscar_usuarios(p_texto text default '', p_limite int default 50)
returns table (
  id uuid, nombre text, correo text, rol public.app_role, activo boolean,
  coach text, ultima_actividad date, creado_en timestamptz,
  ia_habilitada boolean, estado public.estado_cliente
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
         p.created_at,
         p.ia_habilitada, p.estado
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.coach_clientes cc on cc.cliente_id = p.id and cc.activo
    left join public.profiles c on c.id = cc.coach_id
   where p_texto = ''
      or p.full_name ilike '%' || p_texto || '%'
      or u.email    ilike '%' || p_texto || '%'
   order by p.created_at desc
   limit p_limite;
end $$;

revoke execute on function public.admin_buscar_usuarios(text, int) from public;
grant  execute on function public.admin_buscar_usuarios(text, int) to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Un usuario NO puede encenderse la IA (debe FALLAR):
--   update public.profiles set ia_habilitada = true where id = auth.uid();
--
-- Ni quitarse una suspensión (debe FALLAR):
--   update public.profiles set estado = 'activo' where id = auth.uid();
--
-- La tabla de invitaciones no debe quedarse sin RLS (debe dar true):
--   select relrowsecurity from pg_class where relname = 'invitaciones';


-- ============================ 0018_catalogo_de_alimentos.sql ============================

-- =====================================================================
--  CATÁLOGO DE ALIMENTOS (base USDA SR Legacy, en español de México)
--
--  Un catálogo curado: alimentos base, sin marcas, con nombres de aquí.
--  Los datos nutricionales vienen de USDA SR Legacy, que son 7.793
--  alimentos GENÉRICOS -ni una sola marca- y ya trae crudo y cocido como
--  registros distintos. De ahí se selecciona lo que de verdad se come.
--
--  DOS COSAS QUE NO SE HACEN, A PROPÓSITO:
--
--  1. Crudo y cocido NO se convierten. Son filas independientes con sus
--     propios valores. 100 g de arroz crudo y 100 g de arroz cocido no
--     tienen nada que ver -uno absorbió agua- y calcular uno desde el
--     otro es la fuente de error más común en las apps de conteo.
--
--  2. No se guarda "por porción" como dato aparte. Todo va por 100 g,
--     que es como lo publica USDA, y la porción casera se guarda como
--     cuántos gramos pesa. Así solo hay una fuente de verdad y la app
--     multiplica; guardar las dos cosas invita a que se contradigan.
--
--  QUIÉN LO VE:
--     El catálogo entero, solo el super admin. Todos los demás no pueden
--     ni listarlo: lo usan a través de buscar_catalogo(), que devuelve
--     resultados pero no deja descargarse la tabla. Es trabajo de
--     curación y no tiene por qué ser público.
--
--  Depende de 0017.
-- =====================================================================

-- pg_trgm acelera las búsquedas por "contiene" (ver el índice más abajo).
-- Va en un bloque que traga el error a propósito: Supabase la tiene, pero
-- el Postgres en WASM con el que corren las pruebas no. Sin ella todo
-- funciona igual — con mil alimentos, recorrer la tabla entera tarda
-- décimas de milisegundo — así que no vale la pena bloquear por esto.
do $$ begin
  create extension if not exists pg_trgm;
exception when others then
  raise notice 'pg_trgm no disponible; se seguirá sin índice de similitud';
end $$;

do $$ begin
  create type public.estado_alimento as enum ('crudo', 'cocido', 'unico');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.categoria_alimento as enum (
    'carnes', 'aves', 'pescados', 'mariscos', 'huevos', 'lacteos',
    'verduras', 'frutas', 'legumbres', 'cereales', 'pastas', 'arroces',
    'tuberculos', 'semillas', 'frutos_secos', 'aceites', 'grasas',
    'condimentos', 'bebidas', 'harinas', 'panes', 'azucares', 'otros');
exception when duplicate_object then null;
end $$;


create table if not exists public.alimentos_catalogo (
  id            bigint generated always as identity primary key,

  nombre        text not null,
  categoria     public.categoria_alimento not null,
  -- 'unico' para lo que no cambia al cocinarse (un aceite, una manzana).
  -- Obliga a decidirlo en vez de dejarlo en blanco y que la app adivine.
  estado        public.estado_alimento not null default 'unico',

  -- Siempre por 100 g. Ver la nota de arriba sobre por qué solo esto.
  kcal          numeric(6,1) not null check (kcal >= 0),
  proteina      numeric(5,1) not null check (proteina >= 0),
  carbos        numeric(5,1) not null check (carbos  >= 0),
  grasas        numeric(5,1) not null check (grasas  >= 0),

  -- La medida de casa: "1 pieza mediana", "1 taza". Lo que pesa va aparte.
  porcion       text,
  porcion_g     integer check (porcion_g is null or porcion_g > 0),

  -- De dónde salió el dato, para poder auditarlo contra la fuente.
  fdc_id        integer,
  nombre_usda   text,

  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),

  -- El mismo alimento en el mismo estado no se repite.
  unique (nombre, estado)
);

comment on table public.alimentos_catalogo is
  'Catálogo curado de alimentos base. Valores por 100 g, de USDA SR Legacy. '
  'Crudo y cocido son filas independientes: nunca se convierte de uno a otro.';


-- ---------------------------------------------------------------------
--  Búsqueda
--
--  normalizar_texto() viene de la 0012: quita acentos y baja a
--  minúsculas, para que "platano" encuentre "plátano". La columna es
--  generada y va indexada, así que normalizar no cuesta en cada consulta.
--
--  El índice es trigram (pg_trgm) y no de prefijo: quien escribe "pechuga"
--  espera encontrar "Pechuga de pollo", pero quien escribe "pollo"
--  también. Un índice de prefijo solo sirve para lo primero.
-- ---------------------------------------------------------------------
alter table public.alimentos_catalogo
  add column if not exists nombre_norm text
  generated always as (public.normalizar_texto(nombre)) stored;

-- El índice trigram solo si la extensión está. Donde no esté, la búsqueda
-- funciona igual recorriendo la tabla.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists idx_catalogo_norm
      on public.alimentos_catalogo using gin (nombre_norm gin_trgm_ops);
  end if;
end $$;

create index if not exists idx_catalogo_cat
  on public.alimentos_catalogo(categoria) where activo;


-- ---------------------------------------------------------------------
--  Sinónimos
--
--  Tabla aparte y no una columna con lista dentro: así cada sinónimo se
--  indexa y buscar por él cuesta lo mismo que buscar por el nombre.
--  "papa"→"patata", "elote"→"maíz", "jitomate"→"tomate".
-- ---------------------------------------------------------------------
create table if not exists public.alimentos_sinonimos (
  id          bigint generated always as identity primary key,
  alimento_id bigint not null references public.alimentos_catalogo(id) on delete cascade,
  termino     text not null,
  termino_norm text generated always as (public.normalizar_texto(termino)) stored,
  unique (alimento_id, termino)
);

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists idx_sinonimos_norm
      on public.alimentos_sinonimos using gin (termino_norm gin_trgm_ops);
  end if;
end $$;


-- ---------------------------------------------------------------------
--  buscar_catalogo(texto)
--
--  La única puerta de entrada para todo el que no sea super admin.
--  Devuelve filas, pero no permite listar la tabla entera: con texto
--  vacío no devuelve nada, y el límite está acotado.
--
--  Ordena por: coincidencia exacta primero, luego los que empiezan por
--  el texto, luego el resto por parecido. Sin eso, buscar "pollo"
--  devolvía antes "Ensalada de pollo" que "Pollo".
-- ---------------------------------------------------------------------
create or replace function public.buscar_catalogo(
  p_texto  text,
  p_limite integer default 25
)
returns table (
  id bigint, nombre text, categoria public.categoria_alimento,
  estado public.estado_alimento, kcal numeric, proteina numeric,
  carbos numeric, grasas numeric, porcion text, porcion_g integer
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g
    from public.alimentos_catalogo a
    left join public.alimentos_sinonimos s on s.alimento_id = a.id
   cross join q
   where a.activo
     and length(q.t) >= 2
     and (a.nombre_norm like '%' || q.t || '%' or s.termino_norm like '%' || q.t || '%')
   order by a.id,
            (a.nombre_norm = q.t) desc,
            (a.nombre_norm like q.t || '%') desc,
            length(a.nombre)
   limit least(greatest(p_limite, 1), 50);
$$;

revoke execute on function public.buscar_catalogo(text, integer) from public, anon;
grant  execute on function public.buscar_catalogo(text, integer) to authenticated;


-- ---------------------------------------------------------------------
--  Quién ve la tabla
--
--  Solo el super admin. Los demás no tienen política de SELECT, así que
--  para ellos la tabla no existe: solo llegan a los datos por la función
--  de arriba, que devuelve resultados sueltos y nunca el catálogo entero.
-- ---------------------------------------------------------------------
alter table public.alimentos_catalogo  enable row level security;
alter table public.alimentos_sinonimos enable row level security;

drop policy if exists "catalogo: solo super admin" on public.alimentos_catalogo;
create policy "catalogo: solo super admin" on public.alimentos_catalogo
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );

drop policy if exists "sinonimos: solo super admin" on public.alimentos_sinonimos;
create policy "sinonimos: solo super admin" on public.alimentos_sinonimos
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );

grant select, insert, update, delete on public.alimentos_catalogo  to authenticated;
grant select, insert, update, delete on public.alimentos_sinonimos to authenticated;
grant usage, select on sequence public.alimentos_catalogo_id_seq  to authenticated;
grant usage, select on sequence public.alimentos_sinonimos_id_seq to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Un usuario normal NO puede listar el catálogo (debe dar 0 filas):
--   select count(*) from public.alimentos_catalogo;
--
-- Pero sí buscar:
--   select nombre, kcal from public.buscar_catalogo('pollo');
--
-- Y con texto vacío no se descarga nada (debe dar 0):
--   select count(*) from public.buscar_catalogo('');


-- ============================ 0019_datos_catalogo.sql ============================

-- =====================================================================
--  DATOS DEL CATÁLOGO DE ALIMENTOS
--
--  Generado por supabase/alimentos/resolver.mjs el 2026-08-01.
--  NO editar a mano: se regenera desde curado.mjs + USDA SR Legacy.
--
--  164 alimentos. Los macros son de USDA, por 100 g, sin tocar.
--  Cada fila lleva su fdc_id y la descripción original para poder
--  auditarla contra la fuente.
--
--  Depende de 0018.
-- =====================================================================

insert into public.alimentos_catalogo
  (nombre, categoria, estado, kcal, proteina, carbos, grasas,
   porcion, porcion_g, fdc_id, nombre_usda)
values
  ('Pechuga de pollo', 'aves', 'crudo', 120, 22.5, 0, 2.6, 'oz', 113, 171077, 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw'),
  ('Pechuga de pollo', 'aves', 'cocido', 165, 31, 0, 3.6, 'cup, chopped or diced', 140, 171477, 'Chicken, broilers or fryers, breast, meat only, cooked, roasted'),
  ('Pierna de pollo', 'aves', 'cocido', 174, 24.2, 0, 7.8, 'oz', 85, 172380, 'Chicken, broilers or fryers, leg, meat only, cooked, roasted'),
  ('Muslo de pollo', 'aves', 'cocido', 179, 24.8, 0, 8.2, 'oz', 85, 172388, 'Chicken, broilers or fryers, thigh, meat only, cooked, roasted'),
  ('Pollo entero con piel', 'aves', 'cocido', 239, 27.3, 0, 13.6, 'oz', 85, 171450, 'Chicken, broilers or fryers, meat and skin, cooked, roasted'),
  ('Pechuga de pavo', 'aves', 'cocido', 127, 27, 0, 2.1, 'oz', 85, 174519, 'Turkey, breast, from whole bird, meat only, with added solution, roasted'),
  ('Pavo molido', 'aves', 'cocido', 203, 27.4, 0, 10.4, 'oz', 85, 171506, 'Turkey, Ground, cooked'),
  ('Carne molida de res 90%', 'carnes', 'crudo', 176, 20, 0, 10, 'oz', 113, 174030, 'Beef, ground, 90% lean meat / 10% fat, raw'),
  ('Carne molida de res 90%', 'carnes', 'cocido', 204, 25.2, 0, 10.7, 'oz', 85, 171793, 'Beef, ground, 90% lean meat / 10% fat, patty, cooked, pan-broiled'),
  ('Carne molida de res 80%', 'carnes', 'cocido', 246, 24, 0, 15.9, 'oz', 85, 171798, 'Beef, ground, 80% lean meat / 20% fat, patty, cooked, pan-broiled'),
  ('Bistec de res', 'carnes', 'cocido', 187, 29.5, 0, 6.7, 'oz', 85, 173118, 'Beef, top sirloin, steak, separable lean only, trimmed to 1/8" fat, choice, cooked, broiled'),
  ('Arrachera', 'carnes', 'cocido', 194, 27.8, 0, 8.3, 'oz', 85, 168611, 'Beef, flank, steak, separable lean only, trimmed to 0" fat, choice, cooked, broiled'),
  ('Filete de res', 'carnes', 'cocido', 206, 29, 0, 9.1, 'oz', 85, 173117, 'Beef, tenderloin, steak, separable lean only, trimmed to 1/8" fat, choice, cooked, broiled'),
  ('Lomo de cerdo', 'carnes', 'crudo', 109, 21, 0, 2.2, 'oz', 113, 168249, 'Pork, fresh, loin, tenderloin, separable lean only, raw'),
  ('Lomo de cerdo', 'carnes', 'cocido', 143, 26.2, 0, 3.5, 'oz', 85, 168250, 'Pork, fresh, loin, tenderloin, separable lean only, cooked, roasted'),
  ('Chuleta de cerdo', 'carnes', 'cocido', 180, 26.8, 0, 7.3, 'chop without refuse (Yield from 1 cooked chop, with refuse, weighing 209g)', 146, 168240, 'Pork, fresh, loin, center loin (chops), bone-in, separable lean only, cooked, broiled'),
  ('Tocino', 'carnes', 'cocido', 548, 35.7, 1.4, 43.3, 'oz', 85, 167914, 'Pork, cured, bacon, cooked, baked'),
  ('Jamón de pierna', 'carnes', 'unico', 107, 16.9, 0.7, 4, 'slice', 13, 173863, 'Ham, sliced, pre-packaged, deli meat (96%fat free, water added)'),
  ('Carne seca', 'carnes', 'unico', 153, 31.1, 2.8, 1.9, 'slices', 28, 170604, 'Beef, cured, dried'),
  ('Salmón', 'pescados', 'crudo', 208, 20.4, 0, 13.4, 'oz', 85, 175167, 'Fish, salmon, Atlantic, farmed, raw'),
  ('Salmón', 'pescados', 'cocido', 206, 22.1, 0, 12.4, 'oz', 85, 175168, 'Fish, salmon, Atlantic, farmed, cooked, dry heat'),
  ('Atún en agua', 'pescados', 'unico', 116, 25.5, 0, 0.8, 'oz', 85, 171986, 'Fish, tuna, light, canned in water, without salt, drained solids'),
  ('Atún en aceite', 'pescados', 'unico', 198, 29.1, 0, 8.2, 'oz', 85, 174227, 'Fish, tuna, light, canned in oil, without salt, drained solids'),
  ('Tilapia', 'pescados', 'cocido', 128, 26.2, 0, 2.7, 'fillet', 87, 175177, 'Fish, tilapia, cooked, dry heat'),
  ('Mojarra', 'pescados', 'crudo', 96, 20.1, 0, 1.7, 'fillet', 116, 175176, 'Fish, tilapia, raw'),
  ('Bacalao', 'pescados', 'cocido', 105, 22.8, 0, 0.9, 'oz', 85, 171956, 'Fish, cod, Atlantic, cooked, dry heat'),
  ('Huachinango', 'pescados', 'cocido', 128, 26.3, 0, 1.7, 'oz', 85, 173699, 'Fish, snapper, mixed species, cooked, dry heat'),
  ('Sardina en aceite', 'pescados', 'unico', 208, 24.6, 0, 11.5, 'cup, drained', 149, 175139, 'Fish, sardine, Atlantic, canned in oil, drained solids with bone'),
  ('Camarón', 'mariscos', 'crudo', 85, 20.1, 0, 0.5, 'oz', 85, 175179, 'Crustaceans, shrimp, raw'),
  ('Camarón', 'mariscos', 'cocido', 119, 22.8, 1.5, 1.7, 'oz', 85, 171971, 'Crustaceans, shrimp, mixed species, cooked, moist heat (may contain additives to retain moisture)'),
  ('Pulpo', 'mariscos', 'cocido', 164, 29.8, 4.4, 2.1, 'oz', 85, 174249, 'Mollusks, octopus, common, cooked, moist heat'),
  ('Callo de hacha', 'mariscos', 'cocido', 216, 18.1, 10.1, 10.9, 'large', 31, 174221, 'Mollusks, scallop, mixed species, cooked, breaded and fried'),
  ('Huevo entero', 'huevos', 'crudo', 143, 12.6, 0.7, 9.5, 'large', 50, 171287, 'Egg, whole, raw, fresh'),
  ('Huevo cocido', 'huevos', 'cocido', 155, 12.6, 1.1, 10.6, 'cup, chopped', 136, 173424, 'Egg, whole, cooked, hard-boiled'),
  ('Huevo estrellado', 'huevos', 'cocido', 196, 13.6, 0.8, 14.8, 'large', 46, 173423, 'Egg, whole, cooked, fried'),
  ('Huevo revuelto', 'huevos', 'cocido', 149, 10, 1.6, 11, 'large', 61, 172187, 'Egg, whole, cooked, scrambled'),
  ('Clara de huevo', 'huevos', 'crudo', 52, 10.9, 0.7, 0.2, 'large', 33, 172183, 'Egg, white, raw, fresh'),
  ('Yema de huevo', 'huevos', 'crudo', 322, 15.9, 3.6, 26.5, 'large', 17, 172184, 'Egg, yolk, raw, fresh'),
  ('Leche entera', 'lacteos', 'unico', 61, 3.2, 4.8, 3.3, 'cup', 244, 171265, 'Milk, whole, 3.25% milkfat, with added vitamin D'),
  ('Leche light', 'lacteos', 'unico', 42, 3.4, 5, 1, 'cup', 244, 170872, 'Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D'),
  ('Leche descremada', 'lacteos', 'unico', 34, 3.4, 5, 0.1, 'cup', 245, 171269, 'Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)'),
  ('Yogur griego natural', 'lacteos', 'unico', 59, 10.2, 3.6, 0.4, 'container', 170, 170894, 'Yogurt, Greek, plain, nonfat (Includes foods for USDA''s Food Distribution Program)'),
  ('Yogur natural', 'lacteos', 'unico', 63, 5.3, 7, 1.6, 'container (6 oz)', 170, 170886, 'Yogurt, plain, low fat'),
  ('Queso panela', 'lacteos', 'unico', 299, 18.1, 3, 23.8, 'cup, crumbled', 122, 172223, 'Cheese, fresh, queso fresco'),
  ('Queso Oaxaca', 'lacteos', 'unico', 254, 24.3, 2.8, 15.9, 'oz', 28, 170847, 'Cheese, mozzarella, part skim milk'),
  ('Queso Chihuahua', 'lacteos', 'unico', 374, 21.6, 5.6, 29.7, 'cup, diced', 132, 173438, 'Cheese, mexican, queso chihuahua'),
  ('Queso cotija', 'lacteos', 'unico', 366, 20, 4, 30, 'tsp', 5, 170898, 'Cheese, mexican, queso cotija'),
  ('Queso cottage', 'lacteos', 'unico', 72, 12.4, 2.7, 1, 'oz', 113, 173417, 'Cheese, cottage, lowfat, 1% milkfat'),
  ('Queso crema', 'lacteos', 'unico', 350, 6.2, 5.5, 34.4, 'tbsp', 15, 173418, 'Cheese, cream'),
  ('Crema', 'lacteos', 'unico', 292, 2.2, 3, 30.9, 'cup, whipped', 120, 170858, 'Cream, fluid, light whipping'),
  ('Mantequilla', 'grasas', 'unico', 717, 0.9, 0.1, 81.1, 'pat (1" sq, 1/3" high)', 5, 173410, 'Butter, salted'),
  ('Brócoli', 'verduras', 'crudo', 34, 2.8, 6.6, 0.4, 'cup chopped', 91, 170379, 'Broccoli, raw'),
  ('Brócoli', 'verduras', 'cocido', 35, 2.4, 7.2, 0.4, 'cup, chopped', 78, 169967, 'Broccoli, cooked, boiled, drained, without salt'),
  ('Espinaca', 'verduras', 'crudo', 23, 2.9, 3.6, 0.4, 'cup', 30, 168462, 'Spinach, raw'),
  ('Espinaca', 'verduras', 'cocido', 23, 3, 3.8, 0.3, 'cup', 180, 168463, 'Spinach, cooked, boiled, drained, without salt'),
  ('Jitomate', 'verduras', 'crudo', 18, 0.9, 3.9, 0.2, 'cup cherry tomatoes', 149, 170457, 'Tomatoes, red, ripe, raw, year round average'),
  ('Tomate verde', 'verduras', 'crudo', 32, 1, 5.8, 1, 'medium', 34, 168566, 'Tomatillos, raw'),
  ('Cebolla', 'verduras', 'crudo', 40, 1.1, 9.3, 0.1, 'cup, chopped', 160, 170000, 'Onions, raw'),
  ('Chile poblano', 'verduras', 'crudo', 345, 12.4, 51.1, 15.9, 'pepper', 7, 168579, 'Peppers, pasilla, dried'),
  ('Chile jalapeño', 'verduras', 'crudo', 29, 0.9, 6.5, 0.4, 'cup, sliced', 90, 168576, 'Peppers, jalapeno, raw'),
  ('Pimiento morrón', 'verduras', 'crudo', 26, 1, 6, 0.3, 'cup, chopped', 149, 170108, 'Peppers, sweet, red, raw'),
  ('Calabacita', 'verduras', 'crudo', 17, 1.2, 3.1, 0.3, 'cup, chopped', 124, 169291, 'Squash, summer, zucchini, includes skin, raw'),
  ('Zanahoria', 'verduras', 'crudo', 41, 0.9, 9.6, 0.2, 'cup chopped', 128, 170393, 'Carrots, raw'),
  ('Lechuga romana', 'verduras', 'crudo', 17, 1.2, 3.3, 0.3, 'cup shredded', 47, 169247, 'Lettuce, cos or romaine, raw'),
  ('Pepino', 'verduras', 'crudo', 15, 0.7, 3.6, 0.1, 'cup slices', 52, 168409, 'Cucumber, with peel, raw'),
  ('Nopal', 'verduras', 'crudo', 16, 1.3, 3.3, 0.1, 'cup, sliced', 86, 168571, 'Nopales, raw'),
  ('Nopal', 'verduras', 'cocido', 15, 1.4, 3.3, 0.1, 'cup', 149, 169388, 'Nopales, cooked, without salt'),
  ('Chayote', 'verduras', 'crudo', 19, 0.8, 4.5, 0.1, 'cup (1" pieces)', 132, 170402, 'Chayote, fruit, raw'),
  ('Champiñón', 'verduras', 'crudo', 22, 3.1, 3.3, 0.3, 'cup, pieces or slices', 70, 169251, 'Mushrooms, white, raw'),
  ('Ejote', 'verduras', 'cocido', 35, 1.9, 7.9, 0.3, 'cup', 125, 169141, 'Beans, snap, green, cooked, boiled, drained, without salt'),
  ('Elote', 'verduras', 'cocido', 96, 3.4, 21, 1.5, 'ear small (5-1/2" to 6-1/2" long)', 89, 169999, 'Corn, sweet, yellow, cooked, boiled, drained, without salt'),
  ('Coliflor', 'verduras', 'crudo', 25, 1.9, 5, 0.3, 'cup chopped (1/2" pieces)', 107, 169986, 'Cauliflower, raw'),
  ('Apio', 'verduras', 'crudo', 14, 0.7, 3, 0.2, 'cup chopped', 101, 169988, 'Celery, raw'),
  ('Betabel', 'verduras', 'cocido', 44, 1.7, 10, 0.2, 'cup slices', 85, 169146, 'Beets, cooked, boiled, drained'),
  ('Col', 'verduras', 'crudo', 25, 1.3, 5.8, 0.1, 'cup, chopped', 89, 169975, 'Cabbage, raw'),
  ('Plátano', 'frutas', 'unico', 89, 1.1, 22.8, 0.3, 'cup, mashed', 225, 173944, 'Bananas, raw'),
  ('Manzana', 'frutas', 'unico', 57, 0.3, 13.7, 0.1, 'cup, sliced', 109, 168204, 'Apples, raw, gala, with skin (Includes foods for USDA''s Food Distribution Program)'),
  ('Naranja', 'frutas', 'unico', 47, 0.9, 11.8, 0.1, 'cup, sections', 180, 169097, 'Oranges, raw, all commercial varieties'),
  ('Fresa', 'frutas', 'unico', 32, 0.7, 7.7, 0.3, 'cup, halves', 152, 167762, 'Strawberries, raw'),
  ('Papaya', 'frutas', 'unico', 43, 0.5, 10.8, 0.3, 'cup 1" pieces', 145, 169926, 'Papayas, raw'),
  ('Piña', 'frutas', 'unico', 50, 0.5, 13.1, 0.1, 'cup, chunks', 165, 169124, 'Pineapple, raw, all varieties'),
  ('Mango', 'frutas', 'unico', 60, 0.8, 15, 0.4, 'cup pieces', 165, 169910, 'Mangos, raw'),
  ('Sandía', 'frutas', 'unico', 30, 0.6, 7.6, 0.2, 'cup, balls', 154, 167765, 'Watermelon, raw'),
  ('Melón', 'frutas', 'unico', 34, 0.8, 8.2, 0.2, 'cup, balls', 177, 169092, 'Melons, cantaloupe, raw'),
  ('Uva', 'frutas', 'unico', 69, 0.7, 18.1, 0.2, 'cup', 151, 174683, 'Grapes, red or green (European type, such as Thompson seedless), raw'),
  ('Aguacate', 'frutas', 'unico', 160, 2, 8.5, 14.7, 'cup, cubes', 150, 171705, 'Avocados, raw, all commercial varieties'),
  ('Limón', 'frutas', 'unico', 29, 1.1, 9.3, 0.3, 'cup, sections', 212, 167746, 'Lemons, raw, without peel'),
  ('Guayaba', 'frutas', 'unico', 68, 2.6, 14.3, 1, 'cup', 165, 173044, 'Guavas, common, raw'),
  ('Toronja', 'frutas', 'unico', 32, 0.6, 8.1, 0.1, 'cup sections, with juice', 230, 173033, 'Grapefruit, raw, pink and red and white, all areas'),
  ('Durazno en jugo', 'frutas', 'unico', 44, 0.6, 11.6, 0, 'cup', 250, 169930, 'Peaches, canned, juice pack, solids and liquids'),
  ('Pera', 'frutas', 'unico', 57, 0.4, 15.2, 0.1, 'cup, slices', 140, 169118, 'Pears, raw'),
  ('Arándano', 'frutas', 'unico', 57, 0.7, 14.5, 0.3, 'cup', 148, 171711, 'Blueberries, raw'),
  ('Ciruela', 'frutas', 'unico', 46, 0.7, 11.4, 0.3, 'cup, sliced', 165, 169949, 'Plums, raw'),
  ('Kiwi', 'frutas', 'unico', 61, 1.1, 14.7, 0.5, 'cup, sliced', 180, 168153, 'Kiwifruit, green, raw'),
  ('Mandarina', 'frutas', 'unico', 53, 0.8, 13.3, 0.3, 'cup, sections', 195, 169105, 'Tangerines, (mandarin oranges), raw'),
  ('Frijol negro', 'legumbres', 'crudo', 341, 21.6, 62.4, 1.4, 'cup', 194, 173734, 'Beans, black, mature seeds, raw'),
  ('Frijol negro', 'legumbres', 'cocido', 132, 8.9, 23.7, 0.5, 'cup', 172, 173735, 'Beans, black, mature seeds, cooked, boiled, without salt'),
  ('Frijol pinto', 'legumbres', 'cocido', 143, 9, 26.2, 0.7, 'cup', 171, 175200, 'Beans, pinto, mature seeds, cooked, boiled, without salt'),
  ('Lenteja', 'legumbres', 'crudo', 352, 24.6, 63.4, 1.1, 'cup', 192, 172420, 'Lentils, raw'),
  ('Lenteja', 'legumbres', 'cocido', 116, 9, 20.1, 0.4, 'cup', 198, 172421, 'Lentils, mature seeds, cooked, boiled, without salt'),
  ('Garbanzo', 'legumbres', 'cocido', 164, 8.9, 27.4, 2.6, 'cup', 164, 173757, 'Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt'),
  ('Haba', 'legumbres', 'cocido', 110, 7.6, 19.7, 0.4, 'cup', 170, 173753, 'Broadbeans (fava beans), mature seeds, cooked, boiled, without salt'),
  ('Soya', 'legumbres', 'cocido', 172, 18.2, 8.4, 9, 'cup', 172, 174299, 'Soybeans, mature seeds, cooked, boiled, with salt'),
  ('Avena', 'cereales', 'crudo', 379, 13.2, 67.7, 6.5, 'cup', 81, 173904, 'Cereals, oats, regular and quick, not fortified, dry'),
  ('Avena cocida', 'cereales', 'cocido', 71, 2.5, 12, 1.5, 'cup', 234, 173905, 'Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt'),
  ('Quinoa', 'cereales', 'crudo', 368, 14.1, 64.2, 6.1, 'cup', 170, 168874, 'Quinoa, uncooked'),
  ('Quinoa', 'cereales', 'cocido', 120, 4.4, 21.3, 1.9, 'cup', 185, 168917, 'Quinoa, cooked'),
  ('Amaranto', 'cereales', 'crudo', 371, 13.6, 65.3, 7, 'cup', 193, 170682, 'Amaranth grain, uncooked'),
  ('Arroz blanco', 'arroces', 'crudo', 365, 7.1, 80, 0.7, 'cup', 185, 169756, 'Rice, white, long-grain, regular, raw, unenriched'),
  ('Arroz blanco', 'arroces', 'cocido', 130, 2.7, 28.2, 0.3, 'cup', 158, 168935, 'Rice, white, long-grain, regular, cooked, unenriched, with salt'),
  ('Arroz integral', 'arroces', 'crudo', 367, 7.5, 76.3, 3.2, 'cup', 185, 169703, 'Rice, brown, long-grain, raw (Includes foods for USDA''s Food Distribution Program)'),
  ('Arroz integral', 'arroces', 'cocido', 123, 2.7, 25.6, 1, 'cup', 202, 169704, 'Rice, brown, long-grain, cooked (Includes foods for USDA''s Food Distribution Program)'),
  ('Pasta', 'pastas', 'crudo', 371, 13, 74.7, 1.5, 'cup spaghetti', 91, 168927, 'Pasta, dry, unenriched'),
  ('Pasta', 'pastas', 'cocido', 158, 5.8, 30.9, 0.9, 'cup spaghetti not packed', 124, 168928, 'Pasta, cooked, unenriched, without added salt'),
  ('Pasta integral', 'pastas', 'cocido', 149, 6, 30.1, 1.7, 'cup spaghetti not packed', 117, 168910, 'Pasta, whole-wheat, cooked (Includes foods for USDA''s Food Distribution Program)'),
  ('Papa', 'tuberculos', 'crudo', 77, 2.1, 17.5, 0.1, 'cup, diced', 75, 170026, 'Potatoes, flesh and skin, raw'),
  ('Papa cocida', 'tuberculos', 'cocido', 86, 1.7, 20, 0.1, 'cup', 78, 170440, 'Potatoes, boiled, cooked without skin, flesh, without salt'),
  ('Camote', 'tuberculos', 'crudo', 86, 1.6, 20.1, 0.1, 'cup, cubes', 133, 168482, 'Sweet potato, raw, unprepared (Includes foods for USDA''s Food Distribution Program)'),
  ('Camote cocido', 'tuberculos', 'cocido', 76, 1.4, 17.7, 0.1, 'cup, mashed', 328, 168484, 'Sweet potato, cooked, boiled, without skin'),
  ('Yuca', 'tuberculos', 'crudo', 160, 1.4, 38.1, 0.3, 'cup', 206, 169985, 'Cassava, raw'),
  ('Almendra', 'frutos_secos', 'unico', 579, 21.2, 21.6, 49.9, 'cup, whole', 143, 170567, 'Nuts, almonds'),
  ('Nuez', 'frutos_secos', 'unico', 654, 15.2, 13.7, 65.2, 'cup, chopped', 117, 170187, 'Nuts, walnuts, english'),
  ('Cacahuate', 'frutos_secos', 'unico', 567, 25.8, 16.1, 49.2, 'oz', 28, 172430, 'Peanuts, all types, raw'),
  ('Pistache', 'frutos_secos', 'unico', 560, 20.2, 27.2, 45.3, 'cup', 123, 170184, 'Nuts, pistachio nuts, raw'),
  ('Nuez de la India', 'frutos_secos', 'unico', 553, 18.2, 30.2, 43.9, 'oz', 28, 170162, 'Nuts, cashew nuts, raw'),
  ('Crema de cacahuate', 'frutos_secos', 'unico', 598, 22.2, 22.3, 51.4, 'tbsp', 32, 172470, 'Peanut butter, smooth style, without salt'),
  ('Chía', 'semillas', 'unico', 486, 16.5, 42.1, 30.7, 'oz', 28, 170554, 'Seeds, chia seeds, dried'),
  ('Linaza', 'semillas', 'unico', 534, 18.3, 28.9, 42.2, 'tbsp, whole', 10, 169414, 'Seeds, flaxseed'),
  ('Pepita de calabaza', 'semillas', 'unico', 559, 30.2, 10.7, 49.1, 'cup', 129, 170556, 'Seeds, pumpkin and squash seed kernels, dried'),
  ('Ajonjolí', 'semillas', 'unico', 573, 17.7, 23.5, 49.7, 'cup', 144, 170150, 'Seeds, sesame seeds, whole, dried'),
  ('Semilla de girasol', 'semillas', 'unico', 584, 20.8, 20, 51.5, 'cup, with hulls, edible yield', 46, 170562, 'Seeds, sunflower seed kernels, dried'),
  ('Aceite de oliva', 'aceites', 'unico', 884, 0, 0, 100, 'tablespoon', 14, 171413, 'Oil, olive, salad or cooking'),
  ('Aceite de aguacate', 'aceites', 'unico', 884, 0, 0, 100, 'tbsp', 14, 173573, 'Oil, avocado'),
  ('Aceite de coco', 'aceites', 'unico', 892, 0, 0, 99.1, 'tbsp', 14, 171412, 'Oil, coconut'),
  ('Aceite vegetal', 'aceites', 'unico', 884, 0, 0, 100, 'tbsp', 14, 172336, 'Oil, canola'),
  ('Manteca de cerdo', 'grasas', 'unico', 902, 0, 0, 100, 'tbsp', 13, 171401, 'Lard'),
  ('Harina de trigo', 'harinas', 'crudo', 364, 10.3, 76.3, 1, 'cup', 125, 169761, 'Wheat flour, white, all-purpose, unenriched'),
  ('Harina de maíz', 'harinas', 'crudo', 363, 8.5, 76.6, 3.7, 'cup', 114, 169696, 'Corn flour, masa, unenriched, white'),
  ('Harina de avena', 'harinas', 'crudo', 379, 11.4, 77.8, 4.8, 'cup (1 NLEA serving)', 56, 174622, 'Cereals ready-to-eat, QUAKER, Oatmeal Squares'),
  ('Tortilla de maíz', 'panes', 'unico', 222, 5.7, 46.6, 2.5, 'oz', 28, 173241, 'Tortillas, ready-to-bake or -fry, corn, without added salt'),
  ('Tortilla de harina', 'panes', 'unico', 306, 8.2, 49.4, 8, 'tortilla', 48, 175037, 'Tortillas, ready-to-bake or -fry, flour, refrigerated'),
  ('Pan blanco', 'panes', 'unico', 266, 8.9, 49.4, 3.3, 'slice', 29, 174924, 'Bread, white, commercially prepared (includes soft bread crumbs)'),
  ('Pan integral', 'panes', 'unico', 252, 12.5, 42.7, 3.5, 'slice', 32, 172688, 'Bread, whole-wheat, commercially prepared'),
  ('Bolillo', 'panes', 'unico', 293, 9.9, 52.7, 4.3, 'oz', 28, 175031, 'Rolls, hard (includes kaiser)'),
  ('Azúcar', 'azucares', 'unico', 387, 0, 100, 0, 'serving packet', 3, 169655, 'Sugars, granulated'),
  ('Miel', 'azucares', 'unico', 304, 0.3, 82.4, 0, 'cup', 339, 169640, 'Honey'),
  ('Piloncillo', 'azucares', 'unico', 380, 0.1, 98.1, 0, 'tsp unpacked', 3, 168833, 'Sugars, brown'),
  ('Chocolate amargo', 'azucares', 'unico', 642, 14.3, 28.4, 52.3, 'oz square Bakers', 29, 167568, 'Baking chocolate, unsweetened, squares'),
  ('Sal', 'condimentos', 'unico', 0, 0, 0, 0, 'tsp', 6, 173468, 'Salt, table'),
  ('Salsa de soya', 'condimentos', 'unico', 53, 8.1, 4.9, 0.6, 'tbsp', 16, 174277, 'Soy sauce made from soy and wheat (shoyu)'),
  ('Vinagre', 'condimentos', 'unico', 18, 0, 0, 0, 'tbsp', 15, 172237, 'Vinegar, distilled'),
  ('Mayonesa', 'condimentos', 'unico', 680, 1, 0.6, 74.9, 'tbsp', 14, 171009, 'Salad dressing, mayonnaise, regular'),
  ('Mostaza', 'condimentos', 'unico', 60, 3.7, 5.8, 3.3, 'tsp or 1 packet', 5, 172234, 'Mustard, prepared, yellow'),
  ('Catsup', 'condimentos', 'unico', 101, 1, 27.4, 0.1, 'tbsp', 17, 168556, 'Catsup'),
  ('Ajo', 'condimentos', 'crudo', 149, 6.4, 33.1, 0.5, 'cup', 136, 169230, 'Garlic, raw'),
  ('Café negro', 'bebidas', 'unico', 1, 0.1, 0, 0, 'fl oz', 30, 171890, 'Beverages, coffee, brewed, prepared with tap water'),
  ('Té negro', 'bebidas', 'unico', 1, 0, 0.3, 0, 'fl oz', 30, 173227, 'Beverages, tea, black, brewed, prepared with tap water'),
  ('Cerveza', 'bebidas', 'unico', 43, 0.5, 3.6, 0, 'fl oz', 30, 168746, 'Alcoholic beverage, beer, regular, all'),
  ('Refresco de cola', 'bebidas', 'unico', 42, 0, 10.4, 0.3, 'fl oz', 31, 174852, 'Beverages, carbonated, cola, regular'),
  ('Jugo de naranja', 'bebidas', 'unico', 47, 0.7, 11, 0.2, 'cup', 249, 169099, 'Orange juice, canned, unsweetened'),
  ('Agua mineral', 'bebidas', 'unico', 0, 0, 0, 0, 'fl oz', 30, 171922, 'Beverages, water, bottled, non-carbonated, EVIAN'),
  ('Proteína de suero', 'otros', 'unico', 359, 58.1, 29.1, 1.2, 'scoop', 86, 173177, 'Beverages, Whey protein powder isolate'),
  ('Tofu', 'otros', 'unico', 144, 17.3, 2.8, 8.7, 'cup', 126, 172475, 'Tofu, raw, firm, prepared with calcium sulfate'),
  ('Gelatina', 'otros', 'unico', 335, 85.6, 0, 0.1, 'envelope (1 tbsp)', 7, 169599, 'Gelatins, dry powder, unsweetened')
on conflict (nombre, estado) do update set
  kcal = excluded.kcal, proteina = excluded.proteina,
  carbos = excluded.carbos, grasas = excluded.grasas,
  porcion = excluded.porcion, porcion_g = excluded.porcion_g,
  fdc_id = excluded.fdc_id, nombre_usda = excluded.nombre_usda;


-- Sinónimos. Se resuelven por nombre+estado para no depender de los id,
-- que los asigna la base al insertar.
insert into public.alimentos_sinonimos (alimento_id, termino)
select a.id, v.termino
  from (values
    ('Pechuga de pollo', 'crudo', 'pollo'),
    ('Pechuga de pollo', 'crudo', 'pechuga'),
    ('Pechuga de pollo', 'cocido', 'pollo'),
    ('Pechuga de pollo', 'cocido', 'pechuga'),
    ('Pierna de pollo', 'cocido', 'pollo'),
    ('Muslo de pollo', 'cocido', 'pollo'),
    ('Pollo entero con piel', 'cocido', 'pollo'),
    ('Pechuga de pavo', 'cocido', 'pavo'),
    ('Pavo molido', 'cocido', 'pavo'),
    ('Carne molida de res 90%', 'crudo', 'res'),
    ('Carne molida de res 90%', 'crudo', 'molida'),
    ('Carne molida de res 90%', 'crudo', 'carne molida'),
    ('Carne molida de res 90%', 'cocido', 'res'),
    ('Carne molida de res 90%', 'cocido', 'molida'),
    ('Carne molida de res 80%', 'cocido', 'res'),
    ('Carne molida de res 80%', 'cocido', 'molida'),
    ('Bistec de res', 'cocido', 'res'),
    ('Bistec de res', 'cocido', 'bistec'),
    ('Bistec de res', 'cocido', 'sirloin'),
    ('Arrachera', 'cocido', 'res'),
    ('Arrachera', 'cocido', 'flank'),
    ('Arrachera', 'cocido', 'arrachera'),
    ('Filete de res', 'cocido', 'res'),
    ('Filete de res', 'cocido', 'filete'),
    ('Lomo de cerdo', 'crudo', 'cerdo'),
    ('Lomo de cerdo', 'crudo', 'puerco'),
    ('Lomo de cerdo', 'crudo', 'lomo'),
    ('Lomo de cerdo', 'cocido', 'cerdo'),
    ('Lomo de cerdo', 'cocido', 'puerco'),
    ('Lomo de cerdo', 'cocido', 'lomo'),
    ('Chuleta de cerdo', 'cocido', 'cerdo'),
    ('Chuleta de cerdo', 'cocido', 'puerco'),
    ('Chuleta de cerdo', 'cocido', 'chuleta'),
    ('Tocino', 'cocido', 'tocino'),
    ('Tocino', 'cocido', 'bacon'),
    ('Jamón de pierna', 'unico', 'jamon'),
    ('Carne seca', 'unico', 'machaca'),
    ('Carne seca', 'unico', 'cecina'),
    ('Carne seca', 'unico', 'carne seca'),
    ('Salmón', 'crudo', 'salmon'),
    ('Salmón', 'cocido', 'salmon'),
    ('Atún en agua', 'unico', 'atun'),
    ('Atún en agua', 'unico', 'lata'),
    ('Atún en aceite', 'unico', 'atun'),
    ('Atún en aceite', 'unico', 'lata'),
    ('Tilapia', 'cocido', 'tilapia'),
    ('Tilapia', 'cocido', 'mojarra'),
    ('Mojarra', 'crudo', 'tilapia'),
    ('Mojarra', 'crudo', 'mojarra'),
    ('Bacalao', 'cocido', 'bacalao'),
    ('Huachinango', 'cocido', 'huachinango'),
    ('Huachinango', 'cocido', 'pargo'),
    ('Sardina en aceite', 'unico', 'sardina'),
    ('Camarón', 'crudo', 'camaron'),
    ('Camarón', 'cocido', 'camaron'),
    ('Pulpo', 'cocido', 'pulpo'),
    ('Callo de hacha', 'cocido', 'callo'),
    ('Callo de hacha', 'cocido', 'scallop'),
    ('Huevo entero', 'crudo', 'huevo'),
    ('Huevo entero', 'crudo', 'blanquillo'),
    ('Huevo cocido', 'cocido', 'huevo'),
    ('Huevo cocido', 'cocido', 'duro'),
    ('Huevo estrellado', 'cocido', 'huevo'),
    ('Huevo estrellado', 'cocido', 'frito'),
    ('Huevo revuelto', 'cocido', 'huevo'),
    ('Huevo revuelto', 'cocido', 'revuelto'),
    ('Clara de huevo', 'crudo', 'clara'),
    ('Yema de huevo', 'crudo', 'yema'),
    ('Leche entera', 'unico', 'leche'),
    ('Leche light', 'unico', 'leche'),
    ('Leche light', 'unico', 'descremada'),
    ('Leche descremada', 'unico', 'leche'),
    ('Yogur griego natural', 'unico', 'yogur'),
    ('Yogur griego natural', 'unico', 'yoghurt'),
    ('Yogur griego natural', 'unico', 'griego'),
    ('Yogur natural', 'unico', 'yogur'),
    ('Yogur natural', 'unico', 'yoghurt'),
    ('Queso panela', 'unico', 'queso'),
    ('Queso panela', 'unico', 'panela'),
    ('Queso panela', 'unico', 'fresco'),
    ('Queso Oaxaca', 'unico', 'queso'),
    ('Queso Oaxaca', 'unico', 'oaxaca'),
    ('Queso Oaxaca', 'unico', 'quesillo'),
    ('Queso Chihuahua', 'unico', 'queso'),
    ('Queso Chihuahua', 'unico', 'chihuahua'),
    ('Queso Chihuahua', 'unico', 'menonita'),
    ('Queso cotija', 'unico', 'queso'),
    ('Queso cotija', 'unico', 'cotija'),
    ('Queso cotija', 'unico', 'anejo'),
    ('Queso cottage', 'unico', 'queso'),
    ('Queso cottage', 'unico', 'cottage'),
    ('Queso cottage', 'unico', 'requeson'),
    ('Queso crema', 'unico', 'queso'),
    ('Queso crema', 'unico', 'philadelphia'),
    ('Crema', 'unico', 'crema'),
    ('Mantequilla', 'unico', 'mantequilla'),
    ('Brócoli', 'crudo', 'brocoli'),
    ('Brócoli', 'cocido', 'brocoli'),
    ('Espinaca', 'crudo', 'espinaca'),
    ('Espinaca', 'cocido', 'espinaca'),
    ('Jitomate', 'crudo', 'tomate'),
    ('Jitomate', 'crudo', 'jitomate'),
    ('Tomate verde', 'crudo', 'tomatillo'),
    ('Tomate verde', 'crudo', 'tomate verde'),
    ('Cebolla', 'crudo', 'cebolla'),
    ('Chile poblano', 'crudo', 'chile'),
    ('Chile poblano', 'crudo', 'poblano'),
    ('Chile jalapeño', 'crudo', 'chile'),
    ('Chile jalapeño', 'crudo', 'jalapeno'),
    ('Pimiento morrón', 'crudo', 'pimiento'),
    ('Pimiento morrón', 'crudo', 'morron'),
    ('Calabacita', 'crudo', 'calabacita'),
    ('Calabacita', 'crudo', 'calabaza'),
    ('Calabacita', 'crudo', 'zucchini'),
    ('Zanahoria', 'crudo', 'zanahoria'),
    ('Lechuga romana', 'crudo', 'lechuga'),
    ('Lechuga romana', 'crudo', 'romana'),
    ('Pepino', 'crudo', 'pepino'),
    ('Nopal', 'crudo', 'nopal'),
    ('Nopal', 'crudo', 'nopales'),
    ('Nopal', 'cocido', 'nopal'),
    ('Nopal', 'cocido', 'nopales'),
    ('Chayote', 'crudo', 'chayote'),
    ('Champiñón', 'crudo', 'champinon'),
    ('Champiñón', 'crudo', 'hongo'),
    ('Champiñón', 'crudo', 'seta'),
    ('Ejote', 'cocido', 'ejote'),
    ('Ejote', 'cocido', 'judia'),
    ('Elote', 'cocido', 'elote'),
    ('Elote', 'cocido', 'maiz'),
    ('Elote', 'cocido', 'choclo'),
    ('Coliflor', 'crudo', 'coliflor'),
    ('Apio', 'crudo', 'apio'),
    ('Betabel', 'cocido', 'betabel'),
    ('Betabel', 'cocido', 'remolacha'),
    ('Col', 'crudo', 'col'),
    ('Col', 'crudo', 'repollo'),
    ('Plátano', 'unico', 'platano'),
    ('Plátano', 'unico', 'banana'),
    ('Plátano', 'unico', 'banano'),
    ('Manzana', 'unico', 'manzana'),
    ('Naranja', 'unico', 'naranja'),
    ('Fresa', 'unico', 'fresa'),
    ('Fresa', 'unico', 'frutilla'),
    ('Papaya', 'unico', 'papaya'),
    ('Piña', 'unico', 'pina'),
    ('Piña', 'unico', 'ananas'),
    ('Mango', 'unico', 'mango'),
    ('Sandía', 'unico', 'sandia'),
    ('Melón', 'unico', 'melon'),
    ('Uva', 'unico', 'uva'),
    ('Aguacate', 'unico', 'aguacate'),
    ('Aguacate', 'unico', 'palta'),
    ('Limón', 'unico', 'limon'),
    ('Limón', 'unico', 'lima'),
    ('Guayaba', 'unico', 'guayaba'),
    ('Toronja', 'unico', 'toronja'),
    ('Toronja', 'unico', 'pomelo'),
    ('Durazno en jugo', 'unico', 'durazno'),
    ('Durazno en jugo', 'unico', 'melocoton'),
    ('Pera', 'unico', 'pera'),
    ('Arándano', 'unico', 'arandano'),
    ('Arándano', 'unico', 'blueberry'),
    ('Ciruela', 'unico', 'ciruela'),
    ('Kiwi', 'unico', 'kiwi'),
    ('Mandarina', 'unico', 'mandarina'),
    ('Frijol negro', 'crudo', 'frijol'),
    ('Frijol negro', 'crudo', 'frijoles'),
    ('Frijol negro', 'cocido', 'frijol'),
    ('Frijol negro', 'cocido', 'frijoles'),
    ('Frijol pinto', 'cocido', 'frijol'),
    ('Frijol pinto', 'cocido', 'frijoles'),
    ('Frijol pinto', 'cocido', 'bayo'),
    ('Lenteja', 'crudo', 'lenteja'),
    ('Lenteja', 'cocido', 'lenteja'),
    ('Garbanzo', 'cocido', 'garbanzo'),
    ('Haba', 'cocido', 'haba'),
    ('Haba', 'cocido', 'fava'),
    ('Soya', 'cocido', 'soya'),
    ('Soya', 'cocido', 'soja'),
    ('Avena', 'crudo', 'avena'),
    ('Avena', 'crudo', 'hojuelas'),
    ('Avena cocida', 'cocido', 'avena'),
    ('Avena cocida', 'cocido', 'atole'),
    ('Quinoa', 'crudo', 'quinoa'),
    ('Quinoa', 'crudo', 'quinua'),
    ('Quinoa', 'cocido', 'quinoa'),
    ('Quinoa', 'cocido', 'quinua'),
    ('Amaranto', 'crudo', 'amaranto'),
    ('Amaranto', 'crudo', 'alegria'),
    ('Arroz blanco', 'crudo', 'arroz'),
    ('Arroz blanco', 'cocido', 'arroz'),
    ('Arroz integral', 'crudo', 'arroz'),
    ('Arroz integral', 'crudo', 'integral'),
    ('Arroz integral', 'cocido', 'arroz'),
    ('Arroz integral', 'cocido', 'integral'),
    ('Pasta', 'crudo', 'pasta'),
    ('Pasta', 'crudo', 'espagueti'),
    ('Pasta', 'crudo', 'spaghetti'),
    ('Pasta', 'crudo', 'fideo'),
    ('Pasta', 'cocido', 'pasta'),
    ('Pasta', 'cocido', 'espagueti'),
    ('Pasta', 'cocido', 'spaghetti'),
    ('Pasta', 'cocido', 'fideo'),
    ('Pasta integral', 'cocido', 'pasta'),
    ('Pasta integral', 'cocido', 'integral'),
    ('Papa', 'crudo', 'papa'),
    ('Papa', 'crudo', 'patata'),
    ('Papa cocida', 'cocido', 'papa'),
    ('Papa cocida', 'cocido', 'patata'),
    ('Camote', 'crudo', 'camote'),
    ('Camote', 'crudo', 'batata'),
    ('Camote', 'crudo', 'boniato'),
    ('Camote cocido', 'cocido', 'camote'),
    ('Camote cocido', 'cocido', 'batata'),
    ('Yuca', 'crudo', 'yuca'),
    ('Yuca', 'crudo', 'mandioca'),
    ('Almendra', 'unico', 'almendra'),
    ('Nuez', 'unico', 'nuez'),
    ('Nuez', 'unico', 'nogal'),
    ('Cacahuate', 'unico', 'cacahuate'),
    ('Cacahuate', 'unico', 'mani'),
    ('Pistache', 'unico', 'pistache'),
    ('Pistache', 'unico', 'pistacho'),
    ('Nuez de la India', 'unico', 'nuez de la india'),
    ('Nuez de la India', 'unico', 'cashew'),
    ('Nuez de la India', 'unico', 'maranon'),
    ('Crema de cacahuate', 'unico', 'crema de cacahuate'),
    ('Crema de cacahuate', 'unico', 'mantequilla de mani'),
    ('Chía', 'unico', 'chia'),
    ('Linaza', 'unico', 'linaza'),
    ('Linaza', 'unico', 'lino'),
    ('Pepita de calabaza', 'unico', 'pepita'),
    ('Pepita de calabaza', 'unico', 'calabaza'),
    ('Ajonjolí', 'unico', 'ajonjoli'),
    ('Ajonjolí', 'unico', 'sesamo'),
    ('Semilla de girasol', 'unico', 'girasol'),
    ('Semilla de girasol', 'unico', 'pipa'),
    ('Aceite de oliva', 'unico', 'aceite'),
    ('Aceite de oliva', 'unico', 'oliva'),
    ('Aceite de aguacate', 'unico', 'aceite'),
    ('Aceite de aguacate', 'unico', 'aguacate'),
    ('Aceite de coco', 'unico', 'aceite'),
    ('Aceite de coco', 'unico', 'coco'),
    ('Aceite vegetal', 'unico', 'aceite'),
    ('Aceite vegetal', 'unico', 'canola'),
    ('Aceite vegetal', 'unico', 'vegetal'),
    ('Manteca de cerdo', 'unico', 'manteca'),
    ('Harina de trigo', 'crudo', 'harina'),
    ('Harina de trigo', 'crudo', 'trigo'),
    ('Harina de maíz', 'crudo', 'harina'),
    ('Harina de maíz', 'crudo', 'maiz'),
    ('Harina de maíz', 'crudo', 'masa'),
    ('Harina de maíz', 'crudo', 'maseca'),
    ('Harina de avena', 'crudo', 'harina'),
    ('Harina de avena', 'crudo', 'avena'),
    ('Tortilla de maíz', 'unico', 'tortilla'),
    ('Tortilla de maíz', 'unico', 'maiz'),
    ('Tortilla de harina', 'unico', 'tortilla'),
    ('Tortilla de harina', 'unico', 'harina'),
    ('Pan blanco', 'unico', 'pan'),
    ('Pan blanco', 'unico', 'bolillo'),
    ('Pan integral', 'unico', 'pan'),
    ('Pan integral', 'unico', 'integral'),
    ('Bolillo', 'unico', 'bolillo'),
    ('Bolillo', 'unico', 'telera'),
    ('Bolillo', 'unico', 'pan'),
    ('Azúcar', 'unico', 'azucar'),
    ('Miel', 'unico', 'miel'),
    ('Piloncillo', 'unico', 'piloncillo'),
    ('Piloncillo', 'unico', 'panela'),
    ('Piloncillo', 'unico', 'azucar morena'),
    ('Chocolate amargo', 'unico', 'chocolate'),
    ('Chocolate amargo', 'unico', 'cacao'),
    ('Sal', 'unico', 'sal'),
    ('Salsa de soya', 'unico', 'soya'),
    ('Salsa de soya', 'unico', 'soja'),
    ('Salsa de soya', 'unico', 'salsa'),
    ('Vinagre', 'unico', 'vinagre'),
    ('Mayonesa', 'unico', 'mayonesa'),
    ('Mostaza', 'unico', 'mostaza'),
    ('Catsup', 'unico', 'catsup'),
    ('Catsup', 'unico', 'ketchup'),
    ('Catsup', 'unico', 'salsa de tomate'),
    ('Ajo', 'crudo', 'ajo'),
    ('Café negro', 'unico', 'cafe'),
    ('Té negro', 'unico', 'te'),
    ('Cerveza', 'unico', 'cerveza'),
    ('Refresco de cola', 'unico', 'refresco'),
    ('Refresco de cola', 'unico', 'coca'),
    ('Refresco de cola', 'unico', 'soda'),
    ('Jugo de naranja', 'unico', 'jugo'),
    ('Jugo de naranja', 'unico', 'naranja'),
    ('Agua mineral', 'unico', 'agua'),
    ('Proteína de suero', 'unico', 'proteina'),
    ('Proteína de suero', 'unico', 'whey'),
    ('Proteína de suero', 'unico', 'suero'),
    ('Tofu', 'unico', 'tofu'),
    ('Gelatina', 'unico', 'gelatina'),
    ('Gelatina', 'unico', 'grenetina')
       ) as v(nombre, estado, termino)
  join public.alimentos_catalogo a
    on a.nombre = v.nombre and a.estado::text = v.estado
on conflict (alimento_id, termino) do nothing;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Cuántos quedaron y de qué tipo:
--   select categoria, estado, count(*) from public.alimentos_catalogo
--    group by 1,2 order by 1,2;
--
-- Que ninguno tenga macros imposibles (debe dar 0 filas):
--   select nombre, kcal, proteina, carbos, grasas
--     from public.alimentos_catalogo
--    where kcal > 900 or proteina > 100 or carbos > 100 or grasas > 100;



-- ============================ 0020_condiciones_de_salud.sql ============================

-- ---------------------------------------------------------------------
--  CONDICIONES DE SALUD
--
--  Para qué: una persona con diabetes, hipertensión o embarazo no debería
--  recibir las mismas calorías que calcula la fórmula a secas. Guardarlo
--  permite ajustar el objetivo y, sobre todo, avisar de lo que la app NO
--  puede decidir por nadie.
--
--  DÓNDE ESTÁ EL LÍMITE. Esto no convierte la app en consejo médico y no
--  debe presentarse así. La fórmula (Mifflin-St Jeor) sigue mandando y el
--  suelo de seguridad -nunca por debajo del metabolismo basal ni de 1200
--  calorías- se aplica igual, tenga la condición que tenga. Lo que la
--  condición cambia es el margen del ajuste y el aviso que se enseña.
--
--  Por qué una lista cerrada y no texto libre: sobre una lista se puede
--  razonar (ajustar, avisar, medir cuánta gente hay de cada tipo). Sobre
--  texto libre no. El texto libre existe aparte, para lo que no encaje, y
--  NO se usa para calcular nada.
--
--  Privacidad: esto es dato de salud. Lo protegen las mismas políticas RLS
--  de `profiles` que ya existen -cada quien ve lo suyo, el entrenador ve a
--  los suyos-. No se añade ninguna vista nueva que lo exponga.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'condicion_salud') then
    create type public.condicion_salud as enum (
      'diabetes_1',
      'diabetes_2',
      'prediabetes',
      'hipertension',
      'colesterol_alto',
      'hipotiroidismo',
      'higado_graso',
      'enfermedad_renal',
      'celiaquia',
      'embarazo',
      'lactancia'
    );
  end if;
end $$;

alter table public.profiles
  add column if not exists condiciones public.condicion_salud[] not null default '{}',
  -- Para lo que no está en la lista. Se enseña a quien corresponda, pero
  -- no entra en ningún cálculo: no hay forma honesta de razonar sobre
  -- texto libre sin inventarse lo que dice.
  add column if not exists nota_salud text
    check (nota_salud is null or length(nota_salud) <= 300);

-- Sin duplicados en el array: 'diabetes_2' dos veces no significa nada y
-- complicaría cualquier cuenta que se haga después.
--
-- Va en una función y no directo en el CHECK porque PostgreSQL no admite
-- subconsultas dentro de una restricción. Marcarla `immutable` es correcto
-- y necesario: solo depende de lo que se le pasa.
create or replace function public.sin_condiciones_repetidas(a public.condicion_salud[])
returns boolean
language sql immutable
as $$
  select a is null
      or cardinality(a) = cardinality(array(select distinct unnest(a)))
$$;

alter table public.profiles
  drop constraint if exists profiles_condiciones_sin_repetir;
alter table public.profiles
  add constraint profiles_condiciones_sin_repetir
  check (public.sin_condiciones_repetidas(condiciones));

-- Los dos tipos de diabetes a la vez no existen: es uno u otro. Se rechaza
-- en la base y no solo en la pantalla, porque la pantalla no es la única
-- puerta -la app habla por PostgREST y cualquiera puede llamar directo-.
alter table public.profiles
  drop constraint if exists profiles_una_sola_diabetes;
alter table public.profiles
  add constraint profiles_una_sola_diabetes
  check (not ('diabetes_1' = any(condiciones) and 'diabetes_2' = any(condiciones)));

comment on column public.profiles.condiciones is
  'Condiciones declaradas por la persona. Ajustan el margen del calculo y el aviso; NO sustituyen criterio medico.';
comment on column public.profiles.nota_salud is
  'Texto libre de salud. Se enseña, no se calcula con el.';


-- ============================ 0021_arreglo_lista_usuarios.sql ============================

-- ---------------------------------------------------------------------
--  ARREGLO: admin_buscar_usuarios reventaba
--
--  Sintoma: el panel de super admin se quedaba en "Cargando usuarios..."
--  para siempre, y la pestana Plan mostraba
--      "structure of query does not match function result type".
--  Las dos pantallas comen de esta misma funcion, por eso fallaban juntas.
--
--  Causa: la funcion declara `returns table (... correo text ...)` pero
--  devuelve `u.email`, y en Supabase `auth.users.email` es
--  `character varying(255)`, no `text`. PostgreSQL no lo convierte solo en
--  el tipo de retorno de una funcion: compara los tipos exactos y aborta.
--
--  El error solo aparece AL EJECUTARLA, no al crearla, asi que la 0017 se
--  aplico sin quejarse y el fallo salio meses despues, en produccion.
--
--  Arreglo: castear a text lo que la firma dice que es text. Se castean
--  tambien los otros dos campos de texto que salen de columnas ajenas
--  (`full_name`), por si alguna vez cambian de tipo: cuesta nada y cierra
--  la misma clase de fallo.
-- ---------------------------------------------------------------------

create or replace function public.admin_buscar_usuarios(p_texto text default '', p_limite int default 50)
returns table (
  id uuid, nombre text, correo text, rol public.app_role, activo boolean,
  coach text, ultima_actividad date, creado_en timestamptz,
  ia_habilitada boolean, estado public.estado_cliente
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede buscar usuarios';
  end if;

  return query
  select p.id,
         p.full_name::text,
         u.email::text,          -- varchar(255) en auth.users: hay que castear
         p.role,
         p.activo,
         c.full_name::text as coach,
         greatest(
           (select max(d.entry_date)   from public.diary_entries    d where d.user_id = p.id),
           (select max(w.session_date) from public.workout_sessions w where w.user_id = p.id)
         ) as ultima_actividad,
         p.created_at,
         p.ia_habilitada,
         p.estado
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.coach_clientes cc on cc.cliente_id = p.id and cc.activo
    left join public.profiles c on c.id = cc.coach_id
   where p_texto = ''
      or p.full_name ilike '%' || p_texto || '%'
      or u.email    ilike '%' || p_texto || '%'
   order by p.created_at desc
   limit p_limite;
end $$;

revoke execute on function public.admin_buscar_usuarios(text, int) from public;
grant  execute on function public.admin_buscar_usuarios(text, int) to authenticated;


-- ---------------------------------------------------------------------
--  Cuanto se ha gastado hoy en el asistente
--
--  El tope diario impide que se dispare, pero no avisa de nada. Esto
--  devuelve el gasto de hoy para poder verlo en el panel sin entrar a
--  Anthropic.
--
--  Cuenta consultas, no dinero: el precio depende del modelo y cambia, y
--  guardar un precio en la base seria mentira en cuanto se toque. El coste
--  aproximado lo pone la app, que es donde ya vive el modelo.
-- ---------------------------------------------------------------------
create or replace function public.admin_uso_ia_hoy()
returns table (consultas int, personas int, tope_por_persona int)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede ver el uso';
  end if;

  return query
  select coalesce(sum(iu.consultas), 0)::int,
         count(*)::int,
         -- El tope real vive en la Edge Function; aqui va como referencia
         -- para que el panel pueda decir "3 de 5" sin inventarselo.
         5::int
    from public.ia_uso iu
   where iu.dia = current_date;
end $$;

revoke execute on function public.admin_uso_ia_hoy() from public;
grant  execute on function public.admin_uso_ia_hoy() to authenticated;


-- ============================ 0022_sexo_y_dias_de_entreno.sql ============================

-- ---------------------------------------------------------------------
--  Guardar lo que faltaba de la formula: sexo y dias de entreno
--
--  Sintoma: quien INICIA SESION (no quien se registra) y cambia su objetivo
--  desde Perfil recalculaba sus macros sobre casillas vacias. Salian 1.200
--  calorias y 0 g de proteina, y se guardaban asi en la base.
--
--  Causa: calcularMacros() lee los campos de la pantalla de REGISTRO. Al
--  iniciar sesion el perfil se restauraba a los <span> de Perfil, que son
--  otros elementos, y esos campos se quedaban en blanco.
--
--  Al ir a arreglarlo aparecio lo de verdad: aunque se rellenen peso, altura
--  y edad, `profiles` nunca guardo las otras dos entradas de la formula.
--
--    sexo         Mifflin-St Jeor suma +5 a un hombre y -161 a una mujer.
--                 166 calorias de diferencia que se decidian por el valor
--                 por defecto de la pantalla, no por la persona.
--    dias_entreno El factor de actividad va de 1,2 a 1,9. Es el multiplicador
--                 de TODO el gasto: quien entrena 6 dias y se recalculaba
--                 como si entrenara 3 perdia ~11% de sus calorias.
--
--  Sin estas dos columnas el arreglo de la pantalla dejaria el mismo fallo
--  con un numero menos escandaloso, que es peor: deja de notarse.
--
--  Ambas admiten null a proposito. Las seis cuentas que ya existen no las
--  tienen y no hay forma honesta de adivinarlas; la app usa su valor por
--  defecto hasta que esa persona pase por Perfil. Poner un default en la
--  columna seria afirmar algo que nadie ha dicho.
-- ---------------------------------------------------------------------

alter table public.profiles
  -- 'h' | 'm'. Un check y no un enum: son dos valores que no van a crecer,
  -- y un enum obliga a una migracion para cualquier retoque.
  add column if not exists sexo text
    check (sexo is null or sexo in ('h', 'm')),
  add column if not exists dias_entreno int
    check (dias_entreno is null or dias_entreno between 0 and 7);

comment on column public.profiles.sexo is
  'Para Mifflin-St Jeor. null = nunca lo dijo; la app usa su valor por defecto.';
comment on column public.profiles.dias_entreno is
  'Dias de entreno por semana, 0-7. Da el factor de actividad del gasto.';


-- ============================ 0023_huevo_por_piezas.sql ============================

-- ---------------------------------------------------------------------
--  El huevo se cuenta en piezas, no en gramos
--
--  Nadie pesa un huevo. Se dicen "dos huevos", y obligar a escribir 100 g
--  es pedirle a la persona que haga una cuenta que la app puede hacer sola.
--
--  POR QUE UNA COLUMNA NUEVA Y NO `porcion_g`
--
--  Las piezas ya existieron y se quitaron. La razon esta escrita en app.js:
--  la porcion de USDA no es una pieza. Son cosas como 'cup, chopped', 'oz' o
--  'chop without refuse'. Al ofrecerlas como piezas, "1 Pieza" de espagueti
--  acababa significando una taza y nadie podia saberlo mirando la pantalla.
--
--  `porcion` y `porcion_g` siguen siendo lo que USDA dice, sin tocar: son el
--  dato auditable contra la fuente. `pieza_g` es otra cosa y por eso va
--  aparte: cuanto pesa UNA unidad de comer, y solo se rellena donde una
--  pieza es algo que existe y no admite discusion.
--
--  Hoy: los seis huevos. Nada mas. Un aguacate o un platano tambien serian
--  candidatos, pero varian tanto de tamano que la pieza mentiria; el huevo
--  no, porque se vende por calibre.
--
--  Los pesos son los de USDA para 'large', que es el huevo que se vende en
--  Mexico como blanquillo mediano-grande. El cocido llevaba 136 g de
--  'cup, chopped': eso no es un huevo, es una taza de huevo picado.
-- ---------------------------------------------------------------------

alter table public.alimentos_catalogo
  add column if not exists pieza_g integer
    check (pieza_g is null or pieza_g between 1 and 2000);

comment on column public.alimentos_catalogo.pieza_g is
  'Cuanto pesa UNA unidad de comer, en gramos. null = este alimento no se '
  'cuenta por piezas y va en gramos. No confundir con porcion_g, que es la '
  'porcion de referencia de USDA y puede ser una taza o una onza.';

update public.alimentos_catalogo set pieza_g = 50 where nombre = 'Huevo entero';
update public.alimentos_catalogo set pieza_g = 50 where nombre = 'Huevo cocido';
update public.alimentos_catalogo set pieza_g = 46 where nombre = 'Huevo estrellado';
update public.alimentos_catalogo set pieza_g = 61 where nombre = 'Huevo revuelto';
update public.alimentos_catalogo set pieza_g = 33 where nombre = 'Clara de huevo';
update public.alimentos_catalogo set pieza_g = 17 where nombre = 'Yema de huevo';

-- La busqueda tiene que devolverlo o la app no puede saber que hay pieza.
--
-- Hay que SOLTARLA antes: `create or replace` no puede cambiar el tipo que
-- devuelve una funcion, y aqui se le anade una columna.
--   ERROR: cannot change return type of existing function
--   DETAIL: Row type defined by OUT parameters is different.
-- Los permisos se van con la funcion, por eso el grant de abajo no sobra.
drop function if exists public.buscar_catalogo(text, integer);

create or replace function public.buscar_catalogo(
  p_texto  text,
  p_limite integer default 25
)
returns table (
  id bigint, nombre text, categoria public.categoria_alimento,
  estado public.estado_alimento, kcal numeric, proteina numeric,
  carbos numeric, grasas numeric, porcion text, porcion_g integer,
  pieza_g integer
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g,
         a.pieza_g
    from public.alimentos_catalogo a
    left join public.alimentos_sinonimos s on s.alimento_id = a.id
   cross join q
   where a.activo
     and length(q.t) >= 2
     and (a.nombre_norm like '%' || q.t || '%' or s.termino_norm like '%' || q.t || '%')
   order by a.id,
            (a.nombre_norm = q.t) desc,
            (a.nombre_norm like q.t || '%') desc,
            length(a.nombre)
   limit least(greatest(p_limite, 1), 50);
$$;

revoke execute on function public.buscar_catalogo(text, integer) from public, anon;
grant  execute on function public.buscar_catalogo(text, integer) to authenticated;


-- ============================ 0024_eventos_y_chequeo_semanal.sql ============================

-- ---------------------------------------------------------------------
--  Eventos y chequeo semanal
--
--  Dos cosas que la app no sabia hacer y que son la misma idea: dejar de
--  tratar la semana como siete dias iguales.
--
--  EVENTOS. Una boda, una cena fuera, un asado. Hoy la persona llega al
--  sabado, se pasa 1.500 calorias y la app le dice que fallo. Pero no fallo:
--  iba a una boda y lo sabia desde el martes. Guardar el evento antes
--  permite repartir esas calorias por los dias de ANTES, que es lo que hace
--  cualquiera que sepa comer.
--
--  No hay lista de tipos de evento, y es a proposito. Una tabla de 'boda',
--  'cumpleanos', 'asado' obliga a mantenerla y siempre le falta el caso de
--  alguien. El titulo es texto libre porque la persona lo escribe con sus
--  palabras y quien lo interpreta es el asistente.
--
--  CHEQUEO. Antes de moverle las calorias a alguien hay que saber como
--  esta. El peso solo no lo dice: bajar 800 g pasando hambre y sin energia
--  no es lo mismo que bajarlos comodo. Sin estos tres numeros, subir o
--  bajar calorias es adivinar.
--
--  El chequeo tambien guarda la DECISION que se tomo con el, incluida la de
--  no tocar nada. Eso importa: si a alguien no se le ajustan las calorias
--  tres semanas seguidas por falta de registros, esa historia tiene que
--  poder leerse en algun sitio.
-- ---------------------------------------------------------------------

-- Que se prioriza cuando no cabe todo. En una boda casi nadie quiere las
-- dos cosas: o se come o se bebe.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'prioridad_evento') then
    create type public.prioridad_evento as enum ('comida', 'bebida', 'ambas');
  end if;
end $$;

create table if not exists public.eventos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,

  fecha       date not null,
  -- Texto libre: lo escribe la persona y lo lee el asistente.
  titulo      text not null check (length(btrim(titulo)) between 1 and 120),

  -- Cuanto se aparta para ese dia, POR ENCIMA de su meta normal. El tope de
  -- 4.000 no es un juicio moral: por encima de ahi la semana no puede
  -- absorberlo sin dejar dias por debajo del minimo seguro, y entonces el
  -- reparto deja de ser sano y pasa a ser un ayuno con otro nombre.
  calorias    integer not null default 0 check (calorias between 0 and 4000),
  -- Se cuentan aparte porque el alcohol no se administra como la comida:
  -- son 7 cal/g que no alimentan y que ademas frenan la quema de grasa esa
  -- noche. Saber cuantas van cambia el consejo, no solo la suma.
  bebidas     integer not null default 0 check (bebidas between 0 and 30),
  prioridad   public.prioridad_evento not null default 'ambas',

  creado_en   timestamptz not null default now(),
  -- Se cancela, no se borra: si alguien apunta una boda, se le reparte la
  -- semana y luego la quita, hay que poder explicar por que sus calorias
  -- del miercoles fueron las que fueron.
  cancelado_en timestamptz
);

create index if not exists eventos_persona_fecha
  on public.eventos (user_id, fecha desc) where cancelado_en is null;

-- Un evento por dia y persona. Dos cenas el mismo viernes son una cena con
-- mas calorias; permitir dos filas solo sirve para sumar dos veces.
create unique index if not exists eventos_uno_por_dia
  on public.eventos (user_id, fecha) where cancelado_en is null;


create table if not exists public.chequeos_semanales (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  -- El lunes de la semana a la que se refiere.
  semana    date not null,

  -- Del 1 al 5, y el 3 es "normal". Tres preguntas y no diez: un
  -- cuestionario largo se contesta en diagonal y entonces no mide nada.
  hambre    smallint check (hambre  is null or hambre  between 1 and 5),
  energia   smallint check (energia is null or energia between 1 and 5),
  apetito   smallint check (apetito is null or apetito between 1 and 5),
  nota      text check (nota is null or length(nota) <= 300),

  -- La decision que se tomo con esto, incluida la de no tocar nada.
  ajusto      boolean not null default false,
  motivo      text check (motivo is null or length(motivo) <= 500),
  cal_antes   integer check (cal_antes   is null or cal_antes   between 800 and 8000),
  cal_despues integer check (cal_despues is null or cal_despues between 800 and 8000),

  creado_en timestamptz not null default now(),

  -- Un chequeo por semana. El segundo actualiza al primero.
  unique (user_id, semana)
);

create index if not exists chequeos_persona_semana
  on public.chequeos_semanales (user_id, semana desc);


-- ---------------------------------------------------------------------
--  Quien ve que
--
--  Mismo trato que el resto de datos personales: el coach los VE, solo el
--  dueno los EDITA. Se escribe con las funciones que ya existen en la 0002
--  en vez de repetir la logica: si algun dia cambia lo que puede ver un
--  coach, cambia en un sitio.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['eventos', 'chequeos_semanales'] loop
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
end $$;

grant select, insert, update, delete on public.eventos            to authenticated;
grant select, insert, update, delete on public.chequeos_semanales to authenticated;


-- ============================ 0025_niveles_de_ia.sql ============================

-- ---------------------------------------------------------------------
--  La IA deja de ser un interruptor y pasa a tener tres niveles
--
--  Hasta ahora `ia_habilitada` era si o no. Con eso no se puede vender la
--  diferencia entre "te reconozco un plato por foto" y "te llevo la semana
--  como un entrenador": o se da todo o no se da nada.
--
--    apagada  Sin IA. La app sigue entera: apuntar a mano, rutinas, peso,
--             fotos. Solo no hay asistente.
--    normal   El chat y la foto del platillo. Lo que resuelve el dia a dia.
--    plus     Todo lo anterior mas lo que necesita seguimiento: eventos que
--             reparten la semana, chequeo semanal y ajuste de calorias.
--             Esto es lo que cuesta tokens de verdad y lo que se parece a
--             tener un coach.
--
--  Se guarda el nivel y no dos booleanos. Dos booleanos permiten estados
--  que no existen -"plus si, normal no"- y tarde o temprano alguien los
--  crea sin querer.
--
--  `ia_habilitada` se queda por ahora y se mantiene en sintonia con un
--  trigger: la Edge Function desplegada todavia la lee, y apagarla de golpe
--  dejaria sin asistente a todo el mundo hasta el siguiente despliegue.
--  Migrar y romper a la vez es como se pierden usuarios un martes.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'nivel_ia') then
    -- El orden importa: `order by nivel` los saca de menos a mas, y hay
    -- comparaciones que se leen mucho mejor asi.
    create type public.nivel_ia as enum ('apagada', 'normal', 'plus');
  end if;
end $$;

alter table public.profiles
  add column if not exists nivel_ia public.nivel_ia not null default 'normal';

-- Quien tenia la IA apagada se queda apagado. El resto entra en 'normal':
-- subir a alguien a 'plus' es una decision, no un efecto secundario de una
-- migracion.
update public.profiles
   set nivel_ia = case when ia_habilitada then 'normal' else 'apagada' end::public.nivel_ia
 where nivel_ia = 'normal' and not ia_habilitada;

comment on column public.profiles.nivel_ia is
  'apagada | normal (chat y foto) | plus (ademas eventos, chequeo y ajuste semanal).';


-- ---------------------------------------------------------------------
--  Que los dos no se contradigan
--
--  Mientras convivan, `ia_habilitada` tiene que ser exactamente "el nivel
--  no es apagada". Se hace con un trigger y no a mano en cada UPDATE porque
--  la app no es la unica puerta: se puede escribir por PostgREST directo.
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_ia_habilitada()
returns trigger language plpgsql as $$
begin
  new.ia_habilitada := (new.nivel_ia <> 'apagada');
  return new;
end $$;

drop trigger if exists profiles_sincronizar_ia on public.profiles;
create trigger profiles_sincronizar_ia
  before insert or update of nivel_ia on public.profiles
  for each row execute function public.sincronizar_ia_habilitada();

-- Y se cuadra lo que ya estaba escrito antes del trigger.
update public.profiles
   set ia_habilitada = (nivel_ia <> 'apagada')
 where ia_habilitada <> (nivel_ia <> 'apagada');


-- ---------------------------------------------------------------------
--  El super admin lo cambia
--
--  Funcion propia y no un UPDATE suelto: cambiarle el nivel a otra persona
--  es un poder, y los poderes se ejercen por una puerta que comprueba quien
--  llama. Las politicas de `profiles` no dejan editar filas ajenas, asi que
--  sin esto el panel no podria hacerlo aunque quisiera.
-- ---------------------------------------------------------------------
create or replace function public.admin_nivel_ia(p_usuario uuid, p_nivel public.nivel_ia)
returns public.nivel_ia
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_nivel public.nivel_ia;
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede cambiar el nivel de IA';
  end if;

  update public.profiles set nivel_ia = p_nivel
   where id = p_usuario
   returning nivel_ia into v_nivel;

  -- Un UPDATE que no encaja con ninguna fila NO da error: sale bien sin
  -- tocar nada. Sin esto, el panel diria "hecho" ante un id inventado.
  if v_nivel is null then
    raise exception 'No existe esa persona';
  end if;
  return v_nivel;
end $$;

revoke execute on function public.admin_nivel_ia(uuid, public.nivel_ia) from public;
grant  execute on function public.admin_nivel_ia(uuid, public.nivel_ia) to authenticated;


-- La lista de usuarios tiene que traerlo o el panel no sabe que pintar.
--
-- Se suelta antes: `create or replace` no puede cambiar el tipo que
-- devuelve una funcion, y aqui se le anade una columna.
drop function if exists public.admin_buscar_usuarios(text, int);

create or replace function public.admin_buscar_usuarios(p_texto text default '', p_limite int default 50)
returns table (
  id uuid, nombre text, correo text, rol public.app_role, activo boolean,
  coach text, ultima_actividad date, creado_en timestamptz,
  ia_habilitada boolean, estado public.estado_cliente, nivel_ia public.nivel_ia
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede buscar usuarios';
  end if;

  return query
  select p.id,
         p.full_name::text,
         u.email::text,          -- varchar(255) en auth.users: hay que castear
         p.role,
         p.activo,
         c.full_name::text as coach,
         greatest(
           (select max(d.entry_date)   from public.diary_entries    d where d.user_id = p.id),
           (select max(w.session_date) from public.workout_sessions w where w.user_id = p.id)
         ) as ultima_actividad,
         p.created_at,
         p.ia_habilitada,
         p.estado,
         p.nivel_ia
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.coach_clientes cc on cc.cliente_id = p.id and cc.activo
    left join public.profiles c on c.id = cc.coach_id
   where p_texto = ''
      or p.full_name ilike '%' || p_texto || '%'
      or u.email    ilike '%' || p_texto || '%'
   order by p.created_at desc
   limit p_limite;
end $$;

revoke execute on function public.admin_buscar_usuarios(text, int) from public;
grant  execute on function public.admin_buscar_usuarios(text, int) to authenticated;


-- ============================ 0026_borrar_cuenta.sql ============================

-- ---------------------------------------------------------------------
--  Borrar una cuenta de verdad
--
--  Hasta ahora no habia forma de irse. La 0007 convirtio los DELETE en
--  archivado, que esta bien para no perder el historial cuando alguien
--  quita una receta por error, pero significa que quien queria borrar su
--  cuenta no podia: se quedaba marcada y ahi seguia todo.
--
--  Esto es distinto y es definitivo. No hay papelera, no hay deshacer.
--
--  DONDE VIVEN LOS DATOS DE UNA PERSONA
--
--  Borrar `auth.users` arrastra en cascada casi todo, pero no todo, y lo
--  que queda fuera es justo lo que haria inutil el borrado:
--
--    auditoria     Guarda `datos_antes` en jsonb: una copia COMPLETA de
--                  cada fila borrada. Sin purgarla, borrar la cuenta deja
--                  el expediente entero dentro, con nombre y medidas. Es
--                  el sitio menos evidente y el mas grave.
--    versiones     Lo mismo con el historial de metas.
--    storage       Las fotos de progreso. La fila se borra aqui; el
--                  archivo en el bucket queda huerfano hasta que pase una
--                  limpieza. Eso es una limitacion real y conviene saberla
--                  en vez de suponer que ya no existe.
--
--  El flag `app.borrado_definitivo` ya existia en la 0007 para esto: es la
--  puerta que deja pasar un DELETE de verdad por delante del archivado. Se
--  pone `true` en el tercer argumento para que sea LOCAL a la transaccion:
--  si se quedara puesto en la sesion, el siguiente borrado normal de esa
--  conexion borraria de verdad sin que nadie lo pidiera.
-- ---------------------------------------------------------------------

create or replace function public.purgar_persona(p_usuario uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- El orden importa. Primero la cascada, que dispara los triggers de
  -- auditoria y escribe las copias; y despues se purgan esas copias. Al
  -- reves, la auditoria del propio borrado sobreviviria.
  perform set_config('app.borrado_definitivo', 'on', true);

  -- Las filas de Storage. El archivo del bucket es otra historia: esto
  -- solo suelta la referencia.
  delete from storage.objects where owner = p_usuario;

  delete from auth.users where id = p_usuario;

  delete from public.auditoria where user_id = p_usuario or actor_id = p_usuario;
  if to_regclass('public.metas_macros_versiones') is not null then
    execute 'delete from public.metas_macros_versiones where user_id = $1'
      using p_usuario;
  end if;
end $$;

revoke execute on function public.purgar_persona(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  Que alguien borre SU cuenta
--
--  No lleva parametro a proposito: el unico id que acepta es el de quien
--  llama. Un parametro seria una forma de borrar la cuenta de otro.
-- ---------------------------------------------------------------------
create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_yo uuid := auth.uid();
begin
  if v_yo is null then
    raise exception 'Necesitas sesion para borrar tu cuenta';
  end if;

  -- El ultimo super admin no puede irse: dejaria el panel sin nadie que
  -- pueda entrar, y recuperarlo requiere tocar la base a mano.
  if public.es_super_admin() and
     (select count(*) from public.profiles where role = 'super_admin') <= 1 then
    raise exception 'Eres el unico super admin: nombra a otro antes de borrarte';
  end if;

  perform public.purgar_persona(v_yo);
end $$;

revoke execute on function public.borrar_mi_cuenta() from public, anon;
grant  execute on function public.borrar_mi_cuenta() to authenticated;


-- ---------------------------------------------------------------------
--  Que el super admin borre la de otro
-- ---------------------------------------------------------------------
create or replace function public.admin_borrar_cuenta(p_usuario uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede borrar cuentas';
  end if;
  -- Borrarse a uno mismo desde el panel de administracion es siempre un
  -- accidente. Para irse de verdad esta borrar_mi_cuenta(), que ademas
  -- comprueba que quede otro super admin.
  if p_usuario = auth.uid() then
    raise exception 'No puedes borrar tu propia cuenta desde aqui';
  end if;
  if not exists (select 1 from public.profiles where id = p_usuario) then
    raise exception 'No existe esa persona';
  end if;

  perform public.purgar_persona(p_usuario);
end $$;

revoke execute on function public.admin_borrar_cuenta(uuid) from public, anon;
grant  execute on function public.admin_borrar_cuenta(uuid) to authenticated;


-- ============================ 0027_inscritos_en_plan.sql ============================

-- ---------------------------------------------------------------------
--  Plan deja de ser "todo el mundo"
--
--  Hasta ahora Plan listaba a TODAS las personas registradas: al super
--  admin le salian los seis usuarios y al coach todos sus asignados. Pero
--  no todo el mundo lleva plan de comidas. La lista crecia con cada alta y
--  se llenaba de gente a la que nadie iba a armarle nada, con lo cual
--  encontrar a quien si lo lleva costaba mas cada semana.
--
--  Ahora hay que inscribir a alguien. Es una decision, no una consecuencia
--  de haberse registrado.
--
--  POR CORREO Y NO POR UNA LISTA DESPLEGABLE
--
--  Un desplegable con todos los usuarios es la misma lista larga en otro
--  sitio. Escribir el correo obliga a saber a quien se esta inscribiendo,
--  y el correo es lo unico que distingue de verdad a dos personas que se
--  llamen igual.
--
--  SE DA DE BAJA, NO SE BORRA
--
--  Si alguien deja el plan y vuelve en marzo, interesa saber que ya estuvo.
--  `baja_en` guarda esa historia; el indice unico parcial permite volver a
--  inscribirle sin chocar con la fila vieja.
-- ---------------------------------------------------------------------

create table if not exists public.plan_inscritos (
  id           bigint generated always as identity primary key,
  cliente_id   uuid not null references auth.users(id) on delete cascade,
  inscrito_por uuid references auth.users(id) on delete set null,
  inscrito_en  timestamptz not null default now(),
  baja_en      timestamptz
);

-- Uno solo activo por persona. Parcial, para que las bajas antiguas no
-- impidan volver a inscribir a quien regresa.
create unique index if not exists plan_inscritos_uno_activo
  on public.plan_inscritos (cliente_id) where baja_en is null;

create index if not exists plan_inscritos_quien
  on public.plan_inscritos (inscrito_por) where baja_en is null;


-- ---------------------------------------------------------------------
--  Quien ve y quien toca
--
--  Se apoya en `puede_ver`, que ya sabe que un coach ve a los suyos y el
--  super admin a todos. Repetir esa logica aqui garantizaria que un dia se
--  corrija en un sitio y no en el otro.
-- ---------------------------------------------------------------------
alter table public.plan_inscritos enable row level security;

drop policy if exists "plan_inscritos: ver" on public.plan_inscritos;
create policy "plan_inscritos: ver" on public.plan_inscritos
  for select using (public.puede_ver(cliente_id));

-- Escribir va por las funciones de abajo, no directo: inscribir requiere
-- buscar por correo en auth.users, que la app no puede leer.
revoke all on public.plan_inscritos from anon, authenticated;
grant select on public.plan_inscritos to authenticated;


-- ---------------------------------------------------------------------
--  Inscribir por correo
-- ---------------------------------------------------------------------
create or replace function public.plan_inscribir(p_correo text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_rol public.app_role;
begin
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    raise exception 'No puedes inscribir a nadie en Plan';
  end if;

  select u.id, p.role into v_id, v_rol
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(u.email) = lower(btrim(p_correo));

  if v_id is null then
    raise exception 'No hay ninguna cuenta con ese correo';
  end if;

  -- Un coach solo inscribe a los suyos. Sin esto podria meter en su Plan a
  -- cualquiera con solo saberle el correo.
  if not public.es_super_admin() and not public.puede_ver(v_id) then
    raise exception 'Esa persona no es cliente tuyo';
  end if;

  insert into public.plan_inscritos (cliente_id, inscrito_por)
  values (v_id, auth.uid())
  on conflict (cliente_id) where baja_en is null do nothing;

  return v_id;
end $$;

revoke execute on function public.plan_inscribir(text) from public, anon;
grant  execute on function public.plan_inscribir(text) to authenticated;


-- ---------------------------------------------------------------------
--  Dar de baja
-- ---------------------------------------------------------------------
create or replace function public.plan_dar_baja(p_cliente uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.puede_ver(p_cliente) then
    raise exception 'No puedes tocar el plan de esa persona';
  end if;
  update public.plan_inscritos
     set baja_en = now()
   where cliente_id = p_cliente and baja_en is null;
end $$;

revoke execute on function public.plan_dar_baja(uuid) from public, anon;
grant  execute on function public.plan_dar_baja(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  La lista de Plan
--
--  Una sola funcion para los dos roles. `puede_ver` ya filtra: el super
--  admin recibe a todos los inscritos y el coach solo a los suyos, sin que
--  la app tenga que pedir cosas distintas segun quien mire.
--
--  Devuelve el correo, que es lo que un coach nunca habia podido ver: la
--  vista `mis_clientes` no lo trae porque vive en auth.users. Y va casteado
--  a text a proposito: `auth.users.email` es varchar(255), y una funcion
--  que declare `correo text` y devuelva la columna a pelo revienta AL
--  EJECUTARSE, no al crearse. Ya paso una vez y tumbo esta misma pantalla.
-- ---------------------------------------------------------------------
create or replace function public.plan_lista()
returns table (
  id uuid, nombre text, correo text, inscrito_en timestamptz, tiene_plan boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  -- Esta lista es de quien entrena. Un cliente se veria a si mismo -no es
  -- una fuga, son sus datos- pero su plan lo lee por otro sitio, y una
  -- lista de una persona en la pantalla de coach solo confunde.
  --
  -- Devuelve vacio en vez de reventar: la app la pide en la misma carga
  -- para todos los roles, y una excepcion aqui llenaria de errores rojos
  -- la pantalla de gente que no ha hecho nada mal.
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    return;
  end if;

  return query
  select p.id,
         p.full_name::text,
         u.email::text,
         i.inscrito_en,
         exists (select 1 from public.planes pl
                  where pl.user_id = p.id and pl.activo) as tiene_plan
    from public.plan_inscritos i
    join public.profiles p on p.id = i.cliente_id
    join auth.users u on u.id = p.id
   where i.baja_en is null
     and public.puede_ver(i.cliente_id)
   order by p.full_name;
end $$;

revoke execute on function public.plan_lista() from public, anon;
grant  execute on function public.plan_lista() to authenticated;


-- ============================ 0028_tortilla_por_piezas.sql ============================

-- ---------------------------------------------------------------------
--  La tortilla también se cuenta en piezas
--
--  Mismo caso que el huevo (0023) y con la misma regla: `pieza_g` solo se
--  rellena donde una pieza es algo que existe y no admite discusion. Nadie
--  pesa las tortillas; se dicen "tres tortillas".
--
--  LOS PESOS
--
--  Maiz: 30 g. USDA da 26 g para una de 6 pulgadas, pero la tortilla que se
--  come en Mexico es algo mas gruesa. A 30 g salen ~67 calorias por pieza,
--  que es lo que se mide en la realidad. Quedarse en los 26 de USDA seria
--  fiel a la fuente y falso en la mesa.
--
--  Harina: 48 g, el numero de USDA tal cual. Ahi su `porcion` ya era
--  'tortilla' y no una onza, o sea que la fuente si esta hablando de una
--  pieza. Es la mas variable de las dos -de taco a burrito hay el doble de
--  peso- pero 48 g es la medida corriente y es auditable.
--
--  `porcion` y `porcion_g` se quedan intactos: son el dato contra el que se
--  audita. `pieza_g` es otra cosa y por eso vive aparte.
-- ---------------------------------------------------------------------

update public.alimentos_catalogo set pieza_g = 30 where nombre = 'Tortilla de maíz';
update public.alimentos_catalogo set pieza_g = 48 where nombre = 'Tortilla de harina';


-- ============================ 0029_memoria_del_asistente.sql ============================

-- ---------------------------------------------------------------------
--  Lo que el asistente sabe de cada persona
--
--  Hoy olvida todo entre conversaciones: guarda los ultimos doce turnos y
--  se acabo. Cada vez hay que volver a contarle que odias el brocoli, que
--  entrenas de noche o que los martes viajas.
--
--  Un entrenador no funciona asi, y es exactamente lo que separa "una app
--  que responde" de "alguien que me conoce". Esto es lo mas parecido a un
--  coach que se puede construir por unos centimos de tokens.
--
--  POR QUE UN TEXTO Y NO UNA TABLA DE HECHOS
--
--  Una tabla obligaria a decidir de antemano que categorias existen
--  -alergias, horarios, gustos, lesiones- y siempre faltaria una. El texto
--  libre lo escribe el propio asistente con sus palabras y lo vuelve a leer
--  el mismo. No hay nada que consultar por SQL aqui.
--
--  SE REESCRIBE ENTERA, NO SE AÑADE
--
--  Si cada dato nuevo se anadiera al final, en tres meses seria un ladrillo
--  de mil lineas que cuesta tokens en CADA mensaje y donde lo importante
--  queda enterrado. El asistente devuelve la version completa y actualizada,
--  ya depurada. El limite de 1200 caracteres no es decoracion: es lo que
--  fuerza a que elija.
--
--  DATO PERSONAL
--
--  Aqui acaban cosas como "le cuesta comer despues de discutir con su
--  madre". Va en `profiles`, que ya tiene sus politicas: el coach lo ve,
--  solo el dueno lo edita. Y se borra con la cuenta, como todo lo demas.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists memoria_ia text
    check (memoria_ia is null or length(memoria_ia) <= 1200);

comment on column public.profiles.memoria_ia is
  'Lo que el asistente ha aprendido de esta persona. Lo escribe el modelo, '
  'se reescribe entero en cada actualizacion y se le inyecta en el sistema.';


-- ============================ 0030_avisos_del_coach.sql ============================

-- ---------------------------------------------------------------------
--  Que el asistente escriba primero
--
--  Un entrenador te busca. Una app espera a que le abras. Esa es toda la
--  diferencia, y es lo que separa "una herramienta" de "alguien que me
--  lleva".
--
--  QUIEN DECIDE QUE
--
--  El motivo lo decide SQL, no el modelo. Preguntarle a una IA "¿merece
--  esta persona un mensaje?" cuesta dinero en cada revision, da respuestas
--  distintas el martes y el jueves, y no se puede probar. Aqui las
--  situaciones son cinco, estan escritas, y salen igual siempre.
--
--  El modelo solo pone las palabras. Eso es lo que hace bien.
--
--  POR QUE UNO SOLO Y CON PRIORIDAD
--
--  Si alguien lleva tres dias sin apuntar Y ademas se le estanco el peso,
--  mandarle dos mensajes es acoso. Sale el mas urgente y nada mas. El orden
--  del CASE es la prioridad, y esta pensado: primero lo que hace que alguien
--  vuelva, despues lo que le anima, al final lo que le corrige.
--
--  Y NUNCA DOS VECES POR LO MISMO
--
--  Un aviso por motivo cada siete dias. Sin eso, quien lleve dos semanas
--  sin aparecer recibiria el mismo "¿todo bien?" cada mañana, que es como
--  se consigue que alguien silencie una app para siempre.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'motivo_aviso') then
    create type public.motivo_aviso as enum (
      'ausente',        -- lleva dias sin apuntar y antes si apuntaba
      'racha',          -- siete dias seguidos apuntando
      'semana_buena',   -- cerro la semana cerca de su meta
      'estancado'       -- quiere bajar y el peso no se mueve
    );
    -- No hay 'progreso' (subir peso en los ejercicios) a proposito:
    -- calcularlo aqui obligaria a replicar en SQL la logica de volumen que
    -- ya vive en la app, y dos copias de una regla se separan. Cuando esa
    -- cuenta baje a la base, se anade el valor y su rama.
  end if;
end $$;

create table if not exists public.avisos_coach (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  motivo    public.motivo_aviso not null,
  -- Lo escribe el modelo. Corto a proposito: un parrafo no se lee.
  texto     text not null check (length(btrim(texto)) between 1 and 400),
  creado_en timestamptz not null default now(),
  visto_en  timestamptz
);

create index if not exists avisos_pendientes
  on public.avisos_coach (user_id, creado_en desc) where visto_en is null;
create index if not exists avisos_por_motivo
  on public.avisos_coach (user_id, motivo, creado_en desc);

alter table public.avisos_coach enable row level security;

drop policy if exists "avisos: ver" on public.avisos_coach;
create policy "avisos: ver" on public.avisos_coach
  for select using (public.puede_ver(user_id));
-- Marcarlo como visto es lo unico que hace la app. El texto lo escribe la
-- funcion de abajo, que comprueba el motivo antes de dejar guardar nada.
drop policy if exists "avisos: marcar visto" on public.avisos_coach;
create policy "avisos: marcar visto" on public.avisos_coach
  for update using (public.puede_editar_propio(user_id))
           with check (public.puede_editar_propio(user_id));

revoke all on public.avisos_coach from anon, authenticated;
grant select, update on public.avisos_coach to authenticated;


-- ---------------------------------------------------------------------
--  ¿Tengo algo que decirle a esta persona?
--
--  Devuelve el motivo mas urgente, o null. Todo lo que mira son fechas y
--  numeros que ya estan en la base: no cuesta un centimo llamarla.
-- ---------------------------------------------------------------------
create or replace function public.motivo_de_aviso(p_usuario uuid)
returns public.motivo_aviso
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_ultimo_diario  date;
  v_dias_con_datos int;
  v_dias_seguidos  int;
  v_objetivo       text;
  v_peso_viejo     numeric;
  v_peso_nuevo     numeric;
  v_dias_peso      int;
begin
  if not public.puede_ver(p_usuario) then
    return null;
  end if;

  select max(entry_date), count(distinct entry_date)
    into v_ultimo_diario, v_dias_con_datos
    from public.diary_entries where user_id = p_usuario;

  -- Sin historial no hay nada que decir. A alguien que acaba de entrar no
  -- se le echa de menos: se le deja empezar.
  if v_dias_con_datos < 3 then
    return null;
  end if;

  -- 1. AUSENTE. Lo primero, porque es lo unico que puede hacer que
  --    alguien vuelva. Tres dias: dos es un fin de semana.
  if v_ultimo_diario < current_date - 3 then
    return 'ausente';
  end if;

  -- 2. ESTANCADO. Quiere bajar, lleva dos semanas y el peso no se mueve.
  --    Va antes que los animos: es lo que de verdad necesita saber.
  select goal into v_objetivo from public.profiles where id = p_usuario;
  if v_objetivo = 'bajar' then
    select weight_kg, log_date into v_peso_nuevo, v_ultimo_diario
      from public.weight_logs where user_id = p_usuario
      order by log_date desc limit 1;
    select weight_kg into v_peso_viejo
      from public.weight_logs
     where user_id = p_usuario and log_date <= current_date - 14
     order by log_date desc limit 1;
    if v_peso_viejo is not null and v_peso_nuevo is not null
       and abs(v_peso_nuevo - v_peso_viejo) < 0.3 then
      return 'estancado';
    end if;
  end if;

  -- 3. RACHA. Siete dias seguidos apuntando.
  select count(*) into v_dias_seguidos
    from generate_series(current_date - 6, current_date, '1 day') d
   where exists (select 1 from public.diary_entries e
                  where e.user_id = p_usuario and e.entry_date = d::date);
  if v_dias_seguidos = 7 then
    return 'racha';
  end if;

  -- 4. SEMANA BUENA. Cinco de los ultimos siete dias apuntados. Es el
  --    ultimo porque es el mas prescindible: esta bien oirlo, pero nadie
  --    cambia su semana por ello.
  if v_dias_seguidos >= 5 then
    return 'semana_buena';
  end if;

  return null;
end $$;

revoke execute on function public.motivo_de_aviso(uuid) from public, anon;
grant  execute on function public.motivo_de_aviso(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  ¿Toca mandarlo, o ya se lo dije?
--
--  Un aviso por motivo cada siete dias. Separado de la deteccion para
--  poder probar las dos cosas por su cuenta.
-- ---------------------------------------------------------------------
create or replace function public.aviso_pendiente(p_usuario uuid)
returns public.motivo_aviso
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_motivo public.motivo_aviso;
begin
  v_motivo := public.motivo_de_aviso(p_usuario);
  if v_motivo is null then return null; end if;

  -- Ya hay uno sin leer: no se amontonan.
  if exists (select 1 from public.avisos_coach
              where user_id = p_usuario and visto_en is null) then
    return null;
  end if;

  if exists (select 1 from public.avisos_coach
              where user_id = p_usuario and motivo = v_motivo
                and creado_en > now() - interval '7 days') then
    return null;
  end if;

  return v_motivo;
end $$;

revoke execute on function public.aviso_pendiente(uuid) from public, anon;
grant  execute on function public.aviso_pendiente(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  Guardar el aviso ya escrito
--
--  Funcion y no INSERT directo: si la app pudiera insertar, cualquiera se
--  escribiria sus propios avisos. Aqui se vuelve a comprobar que el motivo
--  sea de verdad el que toca antes de dejar guardar nada.
-- ---------------------------------------------------------------------
create or replace function public.guardar_aviso(p_motivo public.motivo_aviso, p_texto text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_yo uuid := auth.uid();
  v_id bigint;
begin
  if v_yo is null then
    raise exception 'Necesitas sesion';
  end if;
  if public.aviso_pendiente(v_yo) is distinct from p_motivo then
    raise exception 'Ese aviso no toca ahora';
  end if;

  insert into public.avisos_coach (user_id, motivo, texto)
  values (v_yo, p_motivo, left(btrim(p_texto), 400))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.guardar_aviso(public.motivo_aviso, text) from public, anon;
grant  execute on function public.guardar_aviso(public.motivo_aviso, text) to authenticated;


-- ============================ 0031_consentimiento.sql ============================

-- ---------------------------------------------------------------------
--  Constancia de que aceptaron, y de QUE aceptaron
--
--  La app recoge peso, medidas, fotos del cuerpo y condiciones medicas, y
--  va a cobrar por ello. En Mexico eso cae bajo la LFPDPPP, y las
--  condiciones de salud son DATOS SENSIBLES: no basta con que nadie se
--  queje, hace falta consentimiento expreso y por separado.
--
--  DOS FECHAS Y NO UNA
--
--  `consentimiento_en` es el aviso de privacidad y los terminos, que valen
--  para todos. `consentimiento_salud_en` es aparte porque el consentimiento
--  para datos sensibles tiene que ser expreso y distinguible: una sola
--  casilla que mezcle "acepto los terminos" con "y que guarden mis datos
--  medicos" no sirve. Quien no declare ninguna condicion no necesita la
--  segunda, y por eso admite null.
--
--  LA VERSION
--
--  Sin ella, "acepto" no significa nada dentro de un ano: el texto habra
--  cambiado y no habra forma de saber que leyo esa persona. Se guarda cual
--  era, y cuando el texto cambie se vuelve a pedir a quien tenga una vieja.
--
--  NO SE BORRA AL DARSE DE BAJA DE NADA. Se va con la cuenta y nada mas:
--  es la prueba de que hubo consentimiento, y borrarla antes dejaria a
--  todos sin poder demostrar nada.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists consentimiento_en       timestamptz,
  add column if not exists consentimiento_version  text
    check (consentimiento_version is null or length(consentimiento_version) <= 20),
  add column if not exists consentimiento_salud_en timestamptz;

comment on column public.profiles.consentimiento_en is
  'Cuando acepto el aviso de privacidad y los terminos.';
comment on column public.profiles.consentimiento_version is
  'Que version del texto acepto. Sin esto, "acepto" no significa nada dentro de un ano.';
comment on column public.profiles.consentimiento_salud_en is
  'Consentimiento EXPRESO para datos de salud. Aparte porque son datos sensibles.';


-- ---------------------------------------------------------------------
--  Sin consentimiento expreso no se guardan condiciones de salud
--
--  La restriccion vive aqui y no solo en la pantalla porque la pantalla no
--  es la unica puerta: la app habla por PostgREST y se puede llamar
--  directo. Si alguien mete condiciones sin haber aceptado, la base dice
--  que no.
-- ---------------------------------------------------------------------
--  Va como NOT VALID a proposito.
--
--  Quien declaro sus condiciones ANTES de que existiera esta casilla no
--  tiene fecha de consentimiento, y sin `not valid` el propio ALTER TABLE
--  fallaria al validar esas filas: la migracion no entraria y nadie sabria
--  por que.
--
--  Rellenarles una fecha inventada tampoco vale: seria escribir que
--  consintieron algo que nunca se les enseño, que es justo lo contrario de
--  lo que esta restriccion existe para conseguir. Se les vuelve a pedir la
--  proxima vez que toquen sus condiciones, y hasta entonces la fila se
--  queda como esta.
--
--  NOT VALID no es un agujero: las filas NUEVAS y las que se actualicen si
--  se comprueban. Solo se deja en paz lo que ya estaba.
alter table public.profiles
  drop constraint if exists profiles_salud_con_consentimiento;
alter table public.profiles
  add constraint profiles_salud_con_consentimiento
  check (
    condiciones is null
    or cardinality(condiciones) = 0
    or consentimiento_salud_en is not null
  ) not valid;


-- ============================ 0032_contar_uso_alimento.sql ============================

-- Contar cuántas veces se usa cada alimento guardado.
--
-- La columna `veces_usado` existe desde la migración 0001, con su índice y
-- todo... y nunca la subía nadie. Se quedaba en 0 para siempre, así que la
-- pestaña "Frecuentes" estaba vacía para todo el mundo desde el primer día.
-- Esto es lo que faltaba.
--
-- Por qué una función y no un PATCH normal: PostgREST solo sabe poner un
-- valor fijo, no sabe decir "lo que haya más uno". Mandar veces+1 desde el
-- teléfono significaría leer, sumar y escribir; si apuntas lo mismo en el
-- móvil y en el ordenador a la vez, los dos leen 4, los dos escriben 5, y
-- un uso se pierde. Aquí la suma la hace la base y eso no puede pasar.

create or replace function public.registrar_uso_alimento(p_alimento uuid)
returns int
language plpgsql
security invoker          -- a propósito: que mande RLS, no la función
set search_path = public
as $$
declare
  v_veces int;
begin
  update public.saved_foods
     set veces_usado = veces_usado + 1,
         ultimo_uso  = now()
   -- El `user_id` va aquí aunque RLS ya lo exija. RLS dice lo que PUEDES
   -- tocar; esto dice lo que QUIERES tocar. Un coach ve a sus clientes, y
   -- sin esta línea un id ajeno pasaría el filtro y le subiría el contador
   -- a otra persona.
   where id = p_alimento
     and user_id = auth.uid()
  returning veces_usado into v_veces;

  -- Si no era tuyo o ya no existe, no es un error: el alimento se pudo
  -- borrar desde otro dispositivo mientras lo apuntabas. Se devuelve 0 y
  -- la app sigue: perder un contador no vale reventar el registro de una
  -- comida que la persona ya dio por hecha.
  return coalesce(v_veces, 0);
end;
$$;

comment on function public.registrar_uso_alimento(uuid) is
  'Suma uno a veces_usado del alimento guardado, si es de quien llama. '
  'Devuelve el total; 0 si no era suyo.';

-- `from public` NO basta, y esto se comprobó mirándolo, no suponiéndolo:
-- Supabase le da execute a `anon` por permisos por defecto del esquema, y
-- esa concesión es suya, no la hereda de PUBLIC. Quitando solo PUBLIC, un
-- has_function_privilege('anon', ...) seguía diciendo `true`.
--
-- No llegaba a abrir nada -sin sesión auth.uid() es null, ningún user_id
-- casa con null, y encima RLS corta antes-, pero un permiso que no hace
-- falta es un permiso que sobra: el día que alguien toque el `where`, la
-- puerta ya estaría abierta.
revoke all on function public.registrar_uso_alimento(uuid) from public;
revoke all on function public.registrar_uso_alimento(uuid) from anon;
grant execute on function public.registrar_uso_alimento(uuid) to authenticated;


-- ============================ 0033_unidad_del_catalogo.sql ============================

-- Decir en qué se registra cada alimento del catálogo: gramos, piezas o
-- servicios.
--
--  QUÉ HABÍA
--  El catálogo guarda los macros SIEMPRE por 100 g -así vienen de USDA- y
--  `pieza_g` dice cuánto pesa una unidad de comer. La app deducía la unidad
--  del propio dato: si había `pieza_g`, lo ofrecía en piezas; si no, en
--  gramos. Funcionaba mientras la única unidad que no era gramos fuese la
--  pieza, y mientras solo la pusiera una migración a mano.
--
--  QUÉ CAMBIA
--  Ahora el panel puede darlo de alta, y "pieza" no es la única forma de
--  contar: un batido o un suplemento se cuentan por servicio. Cuánto pesa
--  una unidad y cómo se llama esa unidad son dos datos distintos, así que
--  se guardan por separado en vez de adivinar uno del otro.
--
--  LOS MACROS NO SE TOCAN: siguen siendo por 100 g. `unidad` solo dice cómo
--  se le enseña y se le pide la cantidad a la persona; la conversión la
--  hace la app con `pieza_g`. Guardar los macros ya multiplicados haría el
--  dato imposible de auditar contra USDA.

alter table public.alimentos_catalogo
  add column if not exists unidad text not null default 'Gramos';

comment on column public.alimentos_catalogo.unidad is
  'Como se le pide la cantidad a la persona: Gramos, Pieza o Servicio. '
  'Los macros de la fila siguen siendo por 100 g pase lo que pase; para '
  'Pieza y Servicio, pieza_g dice cuanto pesa una y la app convierte.';

-- El relleno va ANTES del check, y no es un detalle: hasta hoy la app
-- ofrecia en piezas todo lo que tuviera `pieza_g` -huevos y tortilla-.
-- Si se quedaran en 'Gramos' por defecto, esos alimentos volverian a
-- pedirse en gramos y seria una regresion silenciosa: nadie veria un
-- error, simplemente el huevo dejaria de contarse por huevos.
update public.alimentos_catalogo
   set unidad = 'Pieza'
 where pieza_g is not null
   and unidad = 'Gramos';

alter table public.alimentos_catalogo
  drop constraint if exists alimentos_catalogo_unidad_valida;

alter table public.alimentos_catalogo
  add constraint alimentos_catalogo_unidad_valida check (
    unidad in ('Gramos', 'Pieza', 'Servicio')
    -- Contar por piezas sin saber cuanto pesa una es imposible: los macros
    -- estan por 100 g y sin ese peso no hay forma de convertir. Mejor que
    -- lo impida la base a que la app ensene "1 pieza = 0 calorias".
    and (unidad = 'Gramos' or pieza_g is not null)
  );

-- La busqueda tiene que devolver la unidad o la app no puede saberla.
--
-- Hay que SOLTARLA antes: `create or replace` no puede cambiar el tipo que
-- devuelve una funcion, y aqui se le anade una columna.
--   ERROR: cannot change return type of existing function
-- Los permisos se van con la funcion, por eso el grant de abajo no sobra.
drop function if exists public.buscar_catalogo(text, integer);

create or replace function public.buscar_catalogo(
  p_texto  text,
  p_limite integer default 25
)
returns table (
  id bigint, nombre text, categoria public.categoria_alimento,
  estado public.estado_alimento, kcal numeric, proteina numeric,
  carbos numeric, grasas numeric, porcion text, porcion_g integer,
  pieza_g integer, unidad text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g,
         a.pieza_g, a.unidad
    from public.alimentos_catalogo a
    left join public.alimentos_sinonimos s on s.alimento_id = a.id
   cross join q
   where a.activo
     and length(q.t) >= 2
     and (a.nombre_norm like '%' || q.t || '%' or s.termino_norm like '%' || q.t || '%')
   order by a.id,
            (a.nombre_norm = q.t) desc,
            (a.nombre_norm like q.t || '%') desc,
            length(a.nombre)
   limit least(greatest(p_limite, 1), 50);
$$;

revoke execute on function public.buscar_catalogo(text, integer) from public, anon;
grant  execute on function public.buscar_catalogo(text, integer) to authenticated;


-- ============================ 0034_soltar_tablas_muertas.sql ============================

-- Soltar dos tablas que no usa nadie, y lo que las sujetaba.
--
--  ESTO BORRA COSAS Y NO SE DESHACE. Por eso empieza con una guarda que
--  cuenta filas y ABORTA si encuentra una sola. No es desconfianza del
--  analisis: es que el analisis se hizo un dia y esto se ejecuta otro, y
--  entre medias puede haber entrado un dato.
--
--  QUE SE VA Y POR QUE
--
--  exercise_library — la pantalla de ejercicios de la app NO sale de aqui:
--    lleva 36 ejercicios escritos en el codigo, con sus mapas musculares.
--    La tabla se creo en la 0001 para eso y se quedo vacia.
--
--  exercise_notes NO SE VA, y estuvo a punto de irse. Se saco de la lista
--    al volver atras con las notas por ejercicio, y ahora ademas se USA: la
--    app las guarda aqui en vez de en memoria, asi que la tabla se va a
--    llenar. No hizo falta migracion para eso -la tabla y sus cuatro
--    politicas estan desde la 0001 y la 0002, solo estaban sin usar-.
--
--    Vale la pena quedarse con esto: la tabla estaba vacia el dia que se
--    escribio esta migracion, y una guarda que solo mira si esta vacia
--    habria dicho que si. Vacia no significa muerta; significa que todavia
--    nadie la ha usado.
--
--  consentimientos — la sustituyo la 0031, que puso el consentimiento en
--    columnas de `profiles`. Se queda el dato donde se lee y se va la tabla
--    que ya no lee nadie.
--
--  LO QUE LAS SUJETABA, Y QUE NO ERA OBVIO
--
--  1) `routine_exercises.exercise_id` apunta a exercise_library con una
--     clave foranea. `routine_exercises` esta MUY viva -es la rutina de la
--     gente-, pero la app nunca pide ni escribe esa columna: los ejercicios
--     se guardan por `name`. Comprobado en la base: 16 ejercicios de rutina
--     y 0 con exercise_id. Se suelta la columna primero, y asi la tabla se
--     puede soltar sin `cascade`.
--
--  2) `acepto(text, text)` lee consentimientos. Es de la 0007 y la app no
--     la llama desde que existe la 0031. Se va con su tabla: una funcion
--     que consulta algo que ya no existe es una bomba de relojeria.
--
--  NADA DE `CASCADE`, a proposito. Si manana algo depende de estas tablas
--  y no lo vimos, quiero que el borrado falle y lo diga, no que se lleve
--  por delante lo que sea que dependia.

do $guarda$
declare
  t          text;
  n          bigint;
  con_dato   bigint;
begin
  -- ---- Las tablas, una por una ----
  -- exercise_notes no esta: las notas por ejercicio se quedan.
  foreach t in array array['exercise_library', 'consentimientos'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'public.% ya no existe, nada que hacer', t;
      continue;
    end if;
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception
        'ABORTADO: public.% tiene % fila(s). No se borra NADA. '
        'Si de verdad sobra, vacíala a mano y vuelve a ejecutar esto.', t, n;
    end if;
  end loop;

  -- ---- La columna que sujeta la clave foranea ----
  -- Se pregunta si la columna existe antes de contarla: sin esto, volver a
  -- ejecutar la migracion reventaria al compilar la consulta.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'routine_exercises'
       and column_name  = 'exercise_id'
  ) then
    execute 'select count(*) from public.routine_exercises where exercise_id is not null'
      into con_dato;
    if con_dato > 0 then
      raise exception
        'ABORTADO: % ejercicio(s) de rutina usan exercise_id. '
        'Esa columna se iba a soltar por no usarse; si se usa, para todo.', con_dato;
    end if;
  end if;

  raise notice 'Guarda pasada: las tres tablas vacías y exercise_id sin usar.';
end
$guarda$;

-- ---- A partir de aqui se borra ----
-- El orden importa: primero lo que apunta, despues lo apuntado.

alter table public.routine_exercises drop column if exists exercise_id;

drop function if exists public.acepto(text, text);

drop table if exists public.consentimientos;
drop table if exists public.exercise_library;

-- Aviso para quien monte un proyecto nuevo: `supabase/instalar.sql` sigue
-- creando estas tablas, porque es la foto de la 0001 en adelante. Un
-- proyecto nuevo las creara y esta migracion volvera a soltarlas, que es
-- el comportamiento correcto de una cadena de migraciones. No se toca
-- instalar.sql para no reescribir historia que ya se ejecuto.


-- ============================ 0035_cerrar_escalada_de_privilegios.sql ============================

-- URGENTE: cerrar una escalada de privilegios sin sesión.
--
--  QUE PASABA
--  `nombrar_super_admin(correo)` convierte una cuenta en super admin. Es la
--  funcion de arranque: se pensó para ejecutarse UNA vez desde el editor
--  SQL, al montar el proyecto.
--
--  Su guarda era:
--      if auth.uid() is not null then raise exception ...
--
--  O sea: aborta SI HAY SESION. La intencion era "solo desde el servidor",
--  pero esta al reves para el caso que importa: `anon` no tiene sesion, asi
--  que auth.uid() es null y la guarda LE DEJA PASAR.
--
--  Y los revoke eran `from public` y `from authenticated`. Ninguno alcanza a
--  `anon`: Supabase le concede execute por permisos por defecto del esquema,
--  y esa concesion es suya, no la hereda de PUBLIC. (Es el mismo fallo que
--  ya aparecio en la 0032 con registrar_uso_alimento.)
--
--  Resultado: cualquiera que abriera la app publicada -donde la clave
--  publishable esta a la vista, como debe estar- podia hacer
--
--      POST /rest/v1/rpc/nombrar_super_admin  {"p_correo":"..."}
--
--  y convertir en super admin la cuenta que quisiera. Comprobado contra la
--  base real con un correo inexistente: la funcion se ejecuto y llego hasta
--  el "no hay ninguna cuenta con ese correo". Con un correo de verdad habria
--  hecho el update.
--
--  QUE SE HACE
--  Dos capas, porque una sola ya fallo una vez.

-- ---- Capa 1: que no la pueda llamar nadie desde la API ----
-- Los tres nombrados, en una sola orden. `from public` NO implica a `anon`
-- ni a `authenticated`: Supabase les concede execute por permisos por
-- defecto del esquema, y esa concesion es suya. Escribir solo `from public`
-- -que es lo que habia- es exactamente el fallo que se esta arreglando.
revoke execute on function public.nombrar_super_admin(text) from public, anon, authenticated;

-- ---- Capa 2: que la guarda mire lo que toca ----
-- No "¿hay sesion?" sino "¿quien eres?". Los roles con los que entra la API
-- son anon y authenticated; desde el editor SQL se entra como postgres, y
-- una funcion de servidor entra como service_role. Asi, aunque manana
-- alguien vuelva a conceder el permiso por error, la funcion se niega.
create or replace function public.nombrar_super_admin(p_correo text)
returns text
language plpgsql security definer set search_path = public, pg_temp, auth
as $$
declare v_id uuid;
begin
  if current_user in ('anon', 'authenticated') then
    raise exception
      'Esta funcion solo se ejecuta desde el servidor (editor SQL o service_role), '
      'nunca desde la app.';
  end if;

  select id into v_id from auth.users where email = lower(trim(p_correo));
  if v_id is null then
    raise exception 'No hay ninguna cuenta con el correo %. Registrate primero en la app.', p_correo;
  end if;

  update public.profiles set role = 'super_admin', activo = true where id = v_id;
  if not found then
    raise exception 'La cuenta % existe pero no tiene perfil', p_correo;
  end if;

  return 'Listo: ' || p_correo || ' ya es super admin';
end $$;

revoke execute on function public.nombrar_super_admin(text) from public, anon, authenticated;


-- ---- Y de paso, la otra que tampoco tenia guarda ----
-- `limpiar_uso_ia()` borra el consumo de IA de hace mas de 30 dias. Es
-- mantenimiento y no filtra nada, pero no hay ninguna razon para que la
-- pueda disparar alguien sin sesion.
revoke execute on function public.limpiar_uso_ia() from public, anon, authenticated;


-- ---- El barrido, que es lo que impide que se repita ----
-- Todas las funciones SECURITY DEFINER de `public` dejan de estar al alcance
-- de `anon`. Saltarse RLS es exactamente su trabajo, asi que ninguna deberia
-- poder llamarla alguien sin identificar.
--
-- Antes de registrarse o entrar, la app no llama a ninguna RPC: el registro
-- y el login van por /auth/v1/, que es otra cosa. Por eso esto no rompe el
-- arranque.
--
-- Se hace en bucle y no a mano para que alcance tambien a las que se
-- anadan manana sin acordarse de revocar.
do $barrido$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from anon', f.firma);
    n := n + 1;
  end loop;
  raise notice 'Funciones SECURITY DEFINER cerradas a anon: %', n;
end
$barrido$;


-- ============================ 0036_sueno_y_cintura.sql ============================

-- Dos datos que le faltaban al entrenador para leer bien una semana.
--
--  1. SUEÑO
--
--  El chequeo semanal preguntaba hambre, energia y antojo. Hambre alta con
--  energia baja se leia como "el deficit es demasiado" y se subian
--  calorias. Pero eso mismo lo produce dormir cinco horas, y ahi subir o
--  bajar calorias da igual: el problema no esta en la comida.
--
--  Sin esta pregunta la IA no puede distinguir los dos casos, y va a mover
--  calorias por un problema de descanso. Eso no se arregla nunca.
--
--  Se mete en el hueco que deja el antojo. La columna `apetito` NO se
--  borra: tiene el historico de quien ya lo contesto, y borrarlo seria
--  perder datos de verdad por un cambio de formulario. Simplemente se deja
--  de preguntar.
--
--  2. CINTURA
--
--  Va en weight_logs y no en el chequeo, a proposito: es una medida del
--  cuerpo, no una sensacion, y ahi ya hay una fila por fecha. Asi da
--  tendencia gratis y se apunta cuando toca, no cada semana.
--
--  Por que importa para el cambio fisico: la bascula no distingue grasa de
--  agua de musculo. La cintura si. Y hace medible el mejor caso que el
--  ajuste semanal ya intenta detectar -peso plano con volumen subiendo, o
--  sea recomposicion-, que hoy solo se DEDUCE del entreno.

alter table public.chequeos_semanales
  add column if not exists sueno smallint
    check (sueno is null or sueno between 1 and 5);

comment on column public.chequeos_semanales.sueno is
  'Como durmio, del 1 al 5, con 3 = normal. Sirve para no confundir un '
  'deficit excesivo con falta de descanso: dan las mismas respuestas en '
  'hambre y energia y se arreglan de forma distinta.';

comment on column public.chequeos_semanales.apetito is
  'YA NO SE PREGUNTA. Medía casi lo mismo que `hambre` -la gente las '
  'contestaba igual- y ocupaba una de las tres preguntas del formulario. '
  'La columna se queda por el historico de quien si la contesto.';

alter table public.weight_logs
  add column if not exists cintura_cm numeric(5,1)
    check (cintura_cm is null or cintura_cm between 40 and 200);

comment on column public.weight_logs.cintura_cm is
  'Cintura en centimetros, opcional. Se mide de vez en cuando, no cada '
  'dia. Es lo unico que distingue perder grasa de perder peso: la bascula '
  'baja igual por agua, por musculo o por grasa, y la cintura no.';


-- ============================ 0037_analisis_de_fotos.sql ============================

-- Que la IA compare las fotos de progreso, una vez al mes.
--
--  POR QUE LAS FOTOS Y NO OTRA MEDIDA MAS
--
--  Cada medida que ya hay falla en algo distinto. La bascula no distingue
--  grasa de agua de musculo. La cintura si separa grasa, pero solo en un
--  punto del cuerpo. Las fotos enseñan DONDE esta cambiando, que es lo que
--  ninguna de las dos ve.
--
--  Importa en un caso concreto: peso plano, cintura plana, pero espalda y
--  hombros mas marcados. Eso es recomposicion -gano musculo y perdio grasa
--  a la vez- y las otras dos medidas dirian "estancado" cuando va bien. Es
--  justo el momento en que la gente abandona por leer mal sus datos.
--
--  EL CONSENTIMIENTO NO ES UN FORMALISMO
--
--  Hasta hoy las fotos NUNCA salen de aqui: el bucket es privado y la app
--  las mira con URLs firmadas. Analizarlas las manda a Anthropic, y eso es
--  una cosa distinta de mandar numeros.
--
--  Fotos de cuerpo de una persona identificable son datos personales
--  sensibles bajo la LFPDPPP, y esa ley pide consentimiento EXPRESO. Por
--  eso `fotos_ia_ok` arranca en NULL y no en `true`: null es "todavia no se
--  le ha preguntado", false es "dijo que no". Un `default true` convertiria
--  a todo el que ya subio fotos en alguien que consintio sin que se lo
--  preguntaran, que es exactamente lo que la ley prohibe.
--
--  Quien diga que no sigue subiendo fotos y viendolas. Solo no se analizan.

-- ---------------------------------------------------------------------
--  1. El permiso, por persona
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists fotos_ia_ok boolean;

comment on column public.profiles.fotos_ia_ok is
  'Si acepto que la IA analice sus fotos de progreso. NULL = todavia no se '
  'le ha preguntado; false = dijo que no. Nunca se rellena solo: solo lo '
  'escribe la persona desde la pantalla que explica que se manda y adonde.';

-- Cuando lo dijo. Sin esto no hay forma de demostrar que se pregunto antes
-- de mandar nada, que es justo lo que habria que enseñar si alguien lo
-- reclama.
alter table public.profiles
  add column if not exists fotos_ia_fecha timestamptz;

-- ---------------------------------------------------------------------
--  2. El analisis guardado
-- ---------------------------------------------------------------------
--  Se guarda el TEXTO, nunca las imagenes ni nada derivado de ellas que
--  pueda reconstruirlas. Al sexto mes, poder leer "que se veia en agosto"
--  vale mas que el analisis de este mes: es la unica forma de que alguien
--  vea de verdad cuanto lleva andado.
create table if not exists public.analisis_fotos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- El mes al que corresponde, como 'AAAA-MM'. Uno por mes y persona: si se
  -- vuelve a pedir el mismo mes se pisa, no se acumula.
  mes           text not null check (mes ~ '^\d{4}-\d{2}$'),

  -- Las dos series que se compararon, en claves de semana ISO. Sirven para
  -- saber DE QUE habla el texto, y para no repetir la misma comparacion.
  semana_nueva  text not null check (semana_nueva ~ '^\d{4}-W\d{2}$'),
  semana_vieja  text not null check (semana_vieja ~ '^\d{4}-W\d{2}$'),
  -- Y contra la primera serie de todas, si habia. Mes a mes casi nunca se
  -- nota nada, y es donde se abandona; contra el punto de partida si.
  semana_base   text check (semana_base is null or semana_base ~ '^\d{4}-W\d{2}$'),

  -- Lo que la IA vio A CIEGAS, sin conocer peso ni cintura. Se guarda
  -- aparte del mensaje final a proposito: es lo unico que se puede volver a
  -- comparar el mes que viene sin mandar las fotos viejas otra vez.
  visto         text,
  -- El mensaje que lee la persona, ya reconciliado con los numeros.
  mensaje       text not null,

  creado        timestamptz not null default now(),

  unique (user_id, mes)
);

create index if not exists analisis_fotos_persona_mes
  on public.analisis_fotos (user_id, mes desc);

alter table public.analisis_fotos enable row level security;

-- Solo lo suyo. `puede_ver` deja tambien al coach que la persona acepto,
-- igual que con el resto de sus datos.
drop policy if exists "analisis fotos: ver" on public.analisis_fotos;
create policy "analisis fotos: ver" on public.analisis_fotos
  for select using ( public.puede_ver(user_id) );

-- NADIE escribe esto desde el navegador. Lo escribe la funcion `asistente`
-- con su clave de servicio, despues de comprobar la sesion y el permiso.
-- Sin insert ni update para `authenticated`, un token robado no puede
-- inventarle a nadie un analisis de sus fotos.
grant select on public.analisis_fotos to authenticated;
revoke insert, update, delete on public.analisis_fotos from authenticated;

-- Y explicitamente fuera del alcance de `anon`. `revoke ... from public` NO
-- alcanza a `anon`: Supabase le concede permisos por las opciones por
-- defecto del esquema, y ese descuido ya aparecio en una revision anterior.
revoke all on public.analisis_fotos from anon;


-- ============================ 0038_avisos_con_la_fecha_del_telefono.sql ============================

-- Los avisos del entrenador miraban el dia equivocado.
--
--  EL FALLO, MEDIDO
--
--  Las tres funciones usaban `current_date`, que en Postgres va en UTC. Las
--  comidas, en cambio, se guardan con `entry_date` = la fecha del TELEFONO.
--
--  Desde las 18:00 de Mexico, para la base ya es mañana. Asi que la ventana
--  de siete dias incluia un dia que todavia no podia tener nada apuntado y
--  descartaba el mas antiguo que si lo tenia.
--
--  Medido en produccion el 13 de agosto de 2026 a las 19:39 hora de Mexico:
--
--    now() en UTC ................................. 2026-08-14 01:39
--    current_date (el que usaban las funciones) ... 2026-08-14
--    la fecha real en Mexico ...................... 2026-08-13
--    dias apuntados en [current_date-6, current_date] ... 6
--    dias apuntados en la ventana correcta ............. 7
--
--  Consecuencia: "racha" es IMPOSIBLE de conseguir si abres la app por la
--  tarde. Desde las 18:00 la ventana siempre incluye un dia vacio, asi que
--  nunca llega a 7 de 7, y sale "semana_buena" en su lugar. Encaja con los
--  datos: el unico aviso de racha salio un dia a las 14:56, cuando en UTC
--  todavia era el mismo dia.
--
--  "ausente" y "estancado" tambien se corrian un dia. Ahi duele menos
--  -esperar 4 dias en vez de 3-, pero es el mismo error.
--
--  EL ARREGLO
--
--  El telefono dice que dia es para el, igual que ya hace al guardar cada
--  comida. Es la unica fuente coherente: si el dato se escribe con la fecha
--  del telefono, tiene que leerse con la fecha del telefono.
--
--  Con un tope: si la fecha que manda se aleja mas de un dia de la del
--  servidor, se ignora. Un dia es todo el margen que necesita cualquier
--  zona horaria del mundo, y asi nadie se fabrica una racha mandando una
--  fecha inventada.
--
--  Se BORRAN y se recrean en vez de `create or replace`: añadir un
--  parametro no reemplaza la funcion, crea otra al lado, y la vieja -la que
--  tiene el fallo- seguiria ahi y seguiria siendo llamable.

-- El orden importa: guardar_aviso llama a aviso_pendiente, que llama a
-- motivo_de_aviso. Se sueltan de fuera hacia dentro.
drop function if exists public.guardar_aviso(public.motivo_aviso, text);
drop function if exists public.aviso_pendiente(uuid);
drop function if exists public.motivo_de_aviso(uuid);

-- ---------------------------------------------------------------------
--  El dia de esta persona, con tope de cordura
-- ---------------------------------------------------------------------
create or replace function public.dia_de_la_persona(p_hoy date)
returns date
language sql immutable
as $$
  select case
           when p_hoy is null then current_date
           when abs(p_hoy - current_date) > 1 then current_date
           else p_hoy
         end;
$$;

comment on function public.dia_de_la_persona(date) is
  'La fecha del telefono, si es creible. Mas de un dia de diferencia con el '
  'servidor no es una zona horaria: es un reloj mal puesto o alguien '
  'intentando fabricarse una racha.';

-- ---------------------------------------------------------------------
--  Que aviso toca, si es que toca alguno
-- ---------------------------------------------------------------------
create or replace function public.motivo_de_aviso(p_usuario uuid, p_hoy date default null)
returns public.motivo_aviso
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_hoy            date := public.dia_de_la_persona(p_hoy);
  v_ultimo_diario  date;
  v_dias_con_datos int;
  v_dias_seguidos  int;
  v_objetivo       text;
  v_peso_viejo     numeric;
  v_peso_nuevo     numeric;
begin
  if not public.puede_ver(p_usuario) then
    return null;
  end if;

  select max(entry_date), count(distinct entry_date)
    into v_ultimo_diario, v_dias_con_datos
    from public.diary_entries where user_id = p_usuario;

  -- Sin historial no hay nada que decir. A alguien que acaba de entrar no
  -- se le echa de menos: se le deja empezar.
  if v_dias_con_datos < 3 then
    return null;
  end if;

  -- 1. AUSENTE. Lo primero, porque es lo unico que puede hacer que
  --    alguien vuelva. Tres dias: dos es un fin de semana.
  if v_ultimo_diario < v_hoy - 3 then
    return 'ausente';
  end if;

  -- 2. ESTANCADO. Quiere bajar, lleva dos semanas y el peso no se mueve.
  select goal into v_objetivo from public.profiles where id = p_usuario;
  if v_objetivo = 'bajar' then
    select weight_kg into v_peso_nuevo
      from public.weight_logs where user_id = p_usuario
      order by log_date desc limit 1;
    select weight_kg into v_peso_viejo
      from public.weight_logs
     where user_id = p_usuario and log_date <= v_hoy - 14
     order by log_date desc limit 1;
    if v_peso_viejo is not null and v_peso_nuevo is not null
       and abs(v_peso_nuevo - v_peso_viejo) < 0.3 then
      return 'estancado';
    end if;
  end if;

  -- 3. RACHA. Siete dias seguidos apuntando.
  select count(*) into v_dias_seguidos
    from generate_series(v_hoy - 6, v_hoy, '1 day') d
   where exists (select 1 from public.diary_entries e
                  where e.user_id = p_usuario and e.entry_date = d::date);
  if v_dias_seguidos = 7 then
    return 'racha';
  end if;

  -- 4. SEMANA BUENA. Cinco de los ultimos siete dias apuntados.
  if v_dias_seguidos >= 5 then
    return 'semana_buena';
  end if;

  return null;
end $$;

revoke execute on function public.motivo_de_aviso(uuid, date) from public, anon;
grant  execute on function public.motivo_de_aviso(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
--  Toca mandarlo, o ya se lo dije
-- ---------------------------------------------------------------------
create or replace function public.aviso_pendiente(p_usuario uuid, p_hoy date default null)
returns public.motivo_aviso
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_motivo public.motivo_aviso;
begin
  v_motivo := public.motivo_de_aviso(p_usuario, p_hoy);
  if v_motivo is null then return null; end if;

  -- Ya hay uno sin leer: no se amontonan.
  if exists (select 1 from public.avisos_coach
              where user_id = p_usuario and visto_en is null) then
    return null;
  end if;

  -- El mismo motivo, no antes de siete dias. Aqui SI se usa now(): es
  -- tiempo transcurrido de verdad, no "que dia es para esta persona".
  if exists (select 1 from public.avisos_coach
              where user_id = p_usuario and motivo = v_motivo
                and creado_en > now() - interval '7 days') then
    return null;
  end if;

  return v_motivo;
end $$;

revoke execute on function public.aviso_pendiente(uuid, date) from public, anon;
grant  execute on function public.aviso_pendiente(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
--  Guardar el aviso ya escrito
--
--  Funcion y no INSERT directo: si la app pudiera insertar, cualquiera se
--  escribiria sus propios avisos.
--
--  Lleva la MISMA fecha que la comprobacion de antes. Sin ella, el aviso se
--  pedia con la fecha del telefono y se guardaba comprobando con la del
--  servidor: las dos podian dar motivos distintos y el guardado fallaba con
--  "Ese aviso no toca ahora" despues de haber pagado la consulta de IA.
-- ---------------------------------------------------------------------
create or replace function public.guardar_aviso(
  p_motivo public.motivo_aviso, p_texto text, p_hoy date default null)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_yo uuid := auth.uid();
  v_id bigint;
begin
  if v_yo is null then
    raise exception 'Necesitas sesion';
  end if;
  if public.aviso_pendiente(v_yo, p_hoy) is distinct from p_motivo then
    raise exception 'Ese aviso no toca ahora';
  end if;

  insert into public.avisos_coach (user_id, motivo, texto)
  values (v_yo, p_motivo, left(btrim(p_texto), 400))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.guardar_aviso(public.motivo_aviso, text, date) from public, anon;
grant  execute on function public.guardar_aviso(public.motivo_aviso, text, date) to authenticated;

revoke execute on function public.dia_de_la_persona(date) from public, anon;
grant  execute on function public.dia_de_la_persona(date) to authenticated;


-- ============================ 0039_el_tope_diario_se_reinicia_a_medianoche.sql ============================

-- El tope diario de IA se reiniciaba a las 6 de la tarde.
--
--  LO MEDIDO, en la cuenta de Eduardo el 13 de agosto de 2026:
--
--    2026-08-14: 3 consultas  (la ultima el 13 ago a las 19:27)
--    2026-08-13: 1 consulta   (la ultima el 13 ago a las 11:xx)
--
--  Dos filas de dias distintos, y las cuatro consultas son del mismo dia
--  mexicano. `gastar_consulta_ia` usaba `current_date`, que va en UTC:
--  desde las 18:00 de Mexico ya es el dia siguiente y el contador vuelve a
--  cero.
--
--  A quien lo usa esto le REGALA consultas, asi que nadie se queja. Pero el
--  tope no esta para racionar: esta para que un token robado no pueda
--  vaciar la cuenta en una noche. Y tal como estaba, se podia gastar el
--  DOBLE del tope en un solo dia usandolo a caballo de las 18:00.
--
--  POR QUE AQUI NO SE USA LA FECHA DEL TELEFONO
--
--  En los avisos del entrenador (0038) el arreglo fue que el telefono
--  mandara su fecha, porque alli el dato que se lee -entry_date- tambien se
--  escribe con la fecha del telefono, y habia que leerlo igual que se
--  escribe.
--
--  Aqui es al reves. Si el cliente dijera que dia es, podria reiniciarse el
--  tope cuando quisiera con solo mandar una fecha distinta, que es
--  exactamente el agujero que este tope existe para tapar. Un limite de
--  gasto no puede depender de lo que diga quien gasta.
--
--  Asi que se fija en la zona horaria de la app, que es mexicana de
--  principio a fin. Para cualquier persona en Mexico el corte pasa a ser la
--  medianoche de verdad, y nadie puede moverlo.

create or replace function public.gastar_consulta_ia(
  usuario uuid,
  tope    integer default 40
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  usadas integer;
  -- El dia de la persona, no el del servidor. Lo decide la base y no quien
  -- llama: de eso depende que el tope signifique algo.
  v_dia  date := (now() at time zone 'America/Mexico_City')::date;
begin
  select consultas into usadas
    from public.ia_uso
   where user_id = usuario and dia = v_dia
   for update;

  if usadas is null then
    insert into public.ia_uso(user_id, dia, consultas)
    values (usuario, v_dia, 1);
    return tope - 1;
  end if;

  if usadas >= tope then
    return -1;                       -- se acabo por hoy; no se suma nada
  end if;

  update public.ia_uso
     set consultas = consultas + 1, ultima_en = now()
   where user_id = usuario and dia = v_dia;

  return tope - usadas - 1;
end;
$$;

-- Se rehacen porque `create or replace` no toca los permisos, pero dejarlo
-- escrito evita que un dia se recree en otro sitio sin ellos. Solo la
-- funcion `asistente` la llama, con su clave de servicio: ni el navegador
-- ni anon tienen por que poder gastar consultas de nadie.
revoke all on function public.gastar_consulta_ia(uuid, integer) from public, anon, authenticated;

-- Las filas que ya quedaron partidas por el corte viejo no se tocan: son el
-- historial de lo que de verdad se gasto, y reescribirlo para que cuadre
-- con el corte nuevo seria falsear el unico registro que hay del consumo.
-- Se limpian solas al mes, como el resto.


-- ============================ 0040_devolver_consulta_ia.sql ============================

-- Que una averia de Anthropic no le cueste una consulta a nadie.
--
--  LO QUE PASO, EN LOS REGISTROS DEL 18 DE AGOSTO DE 2026:
--
--    11:37:16  ERROR  asistente: Error: 529 {"type":"overloaded_error"}
--    11:37:30  ERROR  asistente: Error: 529 {"type":"overloaded_error"}
--    11:37:49  ERROR  asistente: Error: 529 {"type":"overloaded_error"}
--    11:42:48  ERROR  asistente: Error: 529 {"type":"overloaded_error"}
--
--  529 es Anthropic diciendo "estoy saturado". Un tropiezo de un segundo,
--  no una averia. Pero cada uno de esos cuatro intentos gasto una de las
--  quince consultas del dia y no devolvio nada a cambio.
--
--  POR QUE EL TOPE SE COBRA ANTES Y NO DESPUES
--
--  Tiene que ser antes: si se cobrara al terminar, mil peticiones a la vez
--  pasarian todas el filtro antes de que ninguna acabe, y el tope no
--  serviria para lo unico que existe -que un token robado no vacie la
--  cuenta en una noche-.
--
--  Asi que se cobra antes y se DEVUELVE cuando el fallo es del servidor.
--
--  ESTO NO ABRE NINGUN AGUJERO
--
--  Solo la funcion `asistente` puede llamar a esto -con su clave de
--  servicio- y solo cuando la respuesta fue 429, 5xx o 529. Nadie puede
--  provocar un 529 a voluntad, asi que no hay forma de usarlo para
--  regalarse consultas.
--
--  Y nunca sube del tope: si el contador ya esta en cero, se queda en cero.

create or replace function public.devolver_consulta_ia(usuario uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  usadas integer;
  -- El mismo dia que usa gastar_consulta_ia, o se devolveria en la fila
  -- equivocada a partir de las 18:00 de Mexico. Ese fallo ya se arreglo una
  -- vez en la 0039 y no puede volver por aqui.
  v_dia  date := (now() at time zone 'America/Mexico_City')::date;
begin
  select consultas into usadas
    from public.ia_uso
   where user_id = usuario and dia = v_dia
   for update;

  -- Sin fila o ya en cero no hay nada que devolver. `greatest(...,0)` es el
  -- freno de verdad: aunque esto se llamara de mas, el contador nunca baja
  -- de cero y nadie se regala consultas.
  if usadas is null or usadas <= 0 then
    return 0;
  end if;

  update public.ia_uso
     set consultas = greatest(usadas - 1, 0)
   where user_id = usuario and dia = v_dia;

  return usadas - 1;
end;
$$;

-- Igual que gastar_consulta_ia: solo la funcion `asistente` con su clave de
-- servicio. Ni el navegador ni anon tienen por que tocar el contador de
-- nadie.
revoke all on function public.devolver_consulta_ia(uuid) from public, anon, authenticated;


-- ============================ 0041_plan_lista_no_cuenta_archivados.sql ============================

-- La lista de Plan decia «con plan» de gente sin plan.
--
--  LO QUE PASABA
--
--  El entrenador abre Plan, entra en alguien, pulsa «Quitar el plan». La app
--  manda un DELETE, el cliente deja de ver su plan al instante... y en la
--  lista del entrenador esa persona sigue apareciendo como «con plan».
--
--  Comprobado contra Postgres:
--
--    con el plan escrito   ->  tiene_plan: true
--    la fila tras quitarlo ->  activo: true, archivado: true
--    lo que ve el coach    ->  tiene_plan: true   <- miente
--    lo que ve el cliente  ->  0 planes
--
--  POR QUE
--
--  Dos decisiones correctas que juntas fallan:
--
--   1. Borrar no borra. El trigger de la 0007 marca `archivado_en` y cancela
--      el DELETE. Pero NO toca `activo`, asi que la fila archivada sigue
--      teniendo activo = true.
--
--   2. `plan_lista` es SECURITY DEFINER, y eso se salta el RLS. La politica
--      «planes: ver» ya filtra `archivado_en is null`, asi que en cualquier
--      consulta normal lo archivado no existe. Aqui si existe, y el
--      `exists(... where pl.activo)` lo contaba.
--
--  El resto de la app no lo notaba porque todo lo demas pasa por PostgREST,
--  con RLS. Esta funcion era el unico sitio que miraba `planes` por debajo.
--
--  EL ARREGLO
--
--  Anadir `pl.archivado_en is null` al exists. Se prefiere eso a apagar
--  `activo` al archivar: `activo` significa «es el plan vigente de esta
--  persona» y `archivado_en` significa «esto ya no existe». Son dos cosas
--  distintas y mezclarlas haria que restaurar un archivado -que la 0007
--  permite- dejara el plan apagado sin motivo.
--
--  Lo demas de la funcion no cambia. Se reescribe entera porque
--  `create or replace` lo pide.

create or replace function public.plan_lista()
returns table (
  id uuid, nombre text, correo text, inscrito_en timestamptz, tiene_plan boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  -- Esta lista es de quien entrena. Un cliente se veria a si mismo -no es
  -- una fuga, son sus datos- pero su plan lo lee por otro sitio, y una
  -- lista de una persona en la pantalla de coach solo confunde.
  --
  -- Devuelve vacio en vez de reventar: la app la pide en la misma carga
  -- para todos los roles, y una excepcion aqui llenaria de errores rojos
  -- la pantalla de gente que no ha hecho nada mal.
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    return;
  end if;

  return query
  select p.id,
         p.full_name::text,
         u.email::text,
         i.inscrito_en,
         exists (select 1 from public.planes pl
                  where pl.user_id = p.id
                    and pl.activo
                    -- SIN ESTO la lista dice «con plan» de quien ya no lo
                    -- tiene. Aqui hace falta a mano: al ser security
                    -- definer, el RLS que lo filtra en el resto de la app
                    -- no se aplica.
                    and pl.archivado_en is null) as tiene_plan
    from public.plan_inscritos i
    join public.profiles p on p.id = i.cliente_id
    join auth.users u on u.id = p.id
   where i.baja_en is null
     and public.puede_ver(i.cliente_id)
   order by p.full_name;
end $$;

revoke execute on function public.plan_lista() from public, anon;
grant  execute on function public.plan_lista() to authenticated;


-- ---------------------------------------------------------------------
--  Comprobacion
-- ---------------------------------------------------------------------
-- Como coach, tras quitarle el plan a un cliente (debe dar false):
--   select nombre, tiene_plan from public.plan_lista();


-- ============================ 0042_como_va_cada_persona.sql ============================

-- Que el entrenador vea de un vistazo como va cada persona.
--
--  QUE RESUELVE
--
--  Hoy, para saber como va alguien, el entrenador tiene que abrirle el plan
--  y adivinar. No hay ningun sitio donde se vea si esta apuntando, si el
--  peso se mueve, si entrena o si subio sus fotos. Con dos clientes se lleva
--  en la cabeza; con veinte, no.
--
--  Aqui van las dos piezas de servidor:
--
--   1. `plan_metricas(cliente)` — todos sus numeros en una sola llamada.
--   2. `analisis_cliente` — donde se guarda lo que escribe la IA sobre eso.
--
--  POR QUE UNA FUNCION Y NO QUE LA APP PIDA LAS TABLAS
--
--  Son siete tablas y unos cuantos calculos por ventanas de 7 y 30 dias.
--  Hacerlo desde la app serian siete viajes por cliente y la misma
--  aritmetica repetida en JavaScript. Y sobre todo: la app tendria que
--  traerse el diario ENTERO de otra persona para contar dias, cuando lo
--  unico que necesita es el numero.
--
--  Va como SECURITY DEFINER pero con `puede_ver` dentro, que es la misma
--  regla que usa el RLS. Sin esa comprobacion seria una fuga: cualquiera
--  podria pedir las metricas de cualquiera sabiendo su id.

-- ---------------------------------------------------------------------
--  1. Las metricas, en una sola llamada
-- ---------------------------------------------------------------------
create or replace function public.plan_metricas(p_cliente uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_perfil   public.profiles%rowtype;
  v_hoy      date := (now() at time zone 'America/Mexico_City')::date;
  v_meta_cal numeric;
  v_out      jsonb;
begin
  -- LA COMPROBACION QUE SOSTIENE TODO. Es security definer: sin esto,
  -- cualquiera leeria el peso y la comida de cualquiera con solo su id.
  if not public.puede_ver(p_cliente) then
    raise exception 'No puedes ver a esa persona';
  end if;

  select * into v_perfil from public.profiles where id = p_cliente;
  if not found then
    raise exception 'No existe esa persona';
  end if;

  v_meta_cal := v_perfil.goal_protein_g * 4
              + v_perfil.goal_carbs_g   * 4
              + v_perfil.goal_fat_g     * 9;

  select jsonb_build_object(

    'nombre',    coalesce(v_perfil.full_name, ''),
    'objetivo',  coalesce(v_perfil.goal, ''),
    'meta_cal',  round(v_meta_cal),
    'meta_p',    v_perfil.goal_protein_g,
    'meta_c',    v_perfil.goal_carbs_g,
    'meta_g',    v_perfil.goal_fat_g,
    'dias_entreno',  v_perfil.dias_entreno,
    'meta_cardio',   v_perfil.cardio_goal_min,

    -- ---- Peso y cintura ----
    -- El peso de un dia suelto no dice nada: la gente amanece con dos kilos
    -- de diferencia por agua y sal. Por eso van los dos extremos de cada
    -- ventana y no un solo numero.
    'peso', (
      select jsonb_build_object(
        'ultimo',      (select w.weight_kg from public.weight_logs w
                         where w.user_id = p_cliente
                         order by w.log_date desc limit 1),
        'ultimo_dia',  (select w.log_date  from public.weight_logs w
                         where w.user_id = p_cliente
                         order by w.log_date desc limit 1),
        'hace_7',      (select w.weight_kg from public.weight_logs w
                         where w.user_id = p_cliente
                           and w.log_date <= v_hoy - 7 order by w.log_date desc limit 1),
        'hace_30',     (select w.weight_kg from public.weight_logs w
                         where w.user_id = p_cliente
                           and w.log_date <= v_hoy - 30 order by w.log_date desc limit 1),
        'apuntes_30',  (select count(*) from public.weight_logs w
                         where w.user_id = p_cliente
                           and w.log_date > v_hoy - 30)
      )
    ),
    'cintura', (
      select jsonb_build_object('cm', w.cintura_cm, 'dia', w.log_date)
        from public.weight_logs w
       where w.user_id = p_cliente
         and w.cintura_cm is not null
       order by w.log_date desc limit 1
    ),

    -- ---- Adherencia: apuntar es la senal mas honesta que hay ----
    -- Quien deja de apuntar suele haber dejado el plan una semana antes. Es
    -- lo primero que un entrenador quiere ver.
    'diario', (
      select jsonb_build_object(
        'dias_7',   count(distinct d.entry_date) filter (where d.entry_date > v_hoy - 7),
        'dias_30',  count(distinct d.entry_date) filter (where d.entry_date > v_hoy - 30),
        'ultimo',   max(d.entry_date),
        -- Media por DIA APUNTADO, no por dia del calendario: dividir entre 7
        -- cuando solo apunto dos dias da una media falsa de la mitad.
        'cal_dia_7', (
          select round(avg(t.cal))
            from (select d2.entry_date, sum(d2.calories) as cal
                    from public.diary_entries d2
                   where d2.user_id = p_cliente
                     and d2.entry_date > v_hoy - 7
                   group by d2.entry_date) t
        ),
        'cal_dia_30', (
          select round(avg(t.cal))
            from (select d2.entry_date, sum(d2.calories) as cal
                    from public.diary_entries d2
                   where d2.user_id = p_cliente
                     and d2.entry_date > v_hoy - 30
                   group by d2.entry_date) t
        ),
        'prot_dia_7', (
          select round(avg(t.p))
            from (select d2.entry_date, sum(d2.protein_g) as p
                    from public.diary_entries d2
                   where d2.user_id = p_cliente
                     and d2.entry_date > v_hoy - 7
                   group by d2.entry_date) t
        )
      )
      from public.diary_entries d
     where d.user_id = p_cliente
    ),

    -- ---- Entrenamiento ----
    'entreno', (
      select jsonb_build_object(
        'sesiones_7',  count(*) filter (where s.session_date > v_hoy - 7),
        'sesiones_30', count(*) filter (where s.session_date > v_hoy - 30),
        'ultima',      max(s.session_date)
      )
      from public.workout_sessions s
     where s.user_id = p_cliente
    ),
    'cardio', (
      select jsonb_build_object(
        'min_7',  coalesce(sum(c.minutes) filter (where c.log_date > v_hoy - 7), 0),
        'min_30', coalesce(sum(c.minutes) filter (where c.log_date > v_hoy - 30), 0)
      )
      from public.cardio_logs c
     where c.user_id = p_cliente
    ),

    -- ---- Fotos ----
    -- Solo se cuenta CUANTAS hay y de que semana. Ni rutas ni nada que
    -- permita mirarlas: esto lo lee un entrenador en una lista, y las fotos
    -- tienen su propio permiso.
    'fotos', (
      select jsonb_build_object(
        'semanas_completas_90', count(*) filter (where t.n >= 4),
        'ultima_semana',        max(t.week_key) filter (where t.n >= 4)
      )
      from (select f.week_key, count(*) as n
              from public.progress_photos f
             where f.user_id = p_cliente and f.archivado_en is null
               and f.taken_at > now() - interval '90 days'
             group by f.week_key) t
    ),

    -- ---- Como se siente ----
    'chequeo', (
      select jsonb_build_object(
        'semana', q.semana, 'hambre', q.hambre,
        'energia', q.energia, 'sueno', q.sueno, 'nota', q.nota
      )
      from public.chequeos_semanales q
     where q.user_id = p_cliente
     order by q.semana desc limit 1
    ),

    -- ---- Su plan ----
    'plan', (
      select jsonb_build_object(
        'nombre',  pl.nombre,
        'comidas', jsonb_array_length(pl.comidas),
        'desde',   pl.created_at
      )
      from public.planes pl
     where pl.user_id = p_cliente and pl.activo and pl.archivado_en is null
     limit 1
    )
  ) into v_out;

  return v_out;
end $$;

revoke execute on function public.plan_metricas(uuid) from public, anon;
grant  execute on function public.plan_metricas(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  2. Lo que la IA escribe sobre esa persona
-- ---------------------------------------------------------------------
--  Se guarda para no volver a pagarlo. Un analisis cuesta una consulta del
--  tope diario del entrenador, y con veinte clientes abrir la ficha de cada
--  uno se comeria el tope entero antes de terminar la lista.
--
--  Uno por cliente: al pedirlo otra vez se pisa el anterior. No es
--  historial —para eso estan los numeros, que si se guardan enteros— sino
--  "lo ultimo que se penso de esta persona".
create table if not exists public.analisis_cliente (
  cliente_id  uuid primary key references auth.users(id) on delete cascade,

  -- Quien lo pidio. Sirve para saber a quien se le cobro la consulta y,
  -- sobre todo, para no enseñarle a un entrenador el analisis que escribio
  -- otro sobre la misma persona.
  pedido_por  uuid not null references auth.users(id) on delete cascade,

  mensaje     text not null check (length(mensaje) <= 4000),

  -- Los numeros con los que se escribio, tal cual. Sin esto, dentro de dos
  -- semanas el texto dice "va bajando bien" y no hay forma de saber de que
  -- cifras hablaba.
  datos       jsonb not null default '{}'::jsonb,

  creado_en   timestamptz not null default now()
);

alter table public.analisis_cliente enable row level security;

-- Lo ve quien puede ver a esa persona: su entrenador y el super admin.
--
-- EL CLIENTE NO. Es lo unico de la app que se escribe SOBRE alguien y no
-- PARA alguien: son notas de trabajo del entrenador, con el tono que se usa
-- entre profesionales -"lleva tres semanas sin apuntar, probablemente
-- abandono"-. Enseñarselo al cliente cambiaria lo que la IA puede decir.
drop policy if exists "analisis_cliente: ver" on public.analisis_cliente;
create policy "analisis_cliente: ver" on public.analisis_cliente
  for select using (
    cliente_id <> auth.uid() and public.puede_ver(cliente_id)
  );

drop policy if exists "analisis_cliente: escribir" on public.analisis_cliente;
create policy "analisis_cliente: escribir" on public.analisis_cliente
  for insert with check (
    cliente_id <> auth.uid() and public.puede_ver(cliente_id) and pedido_por = auth.uid()
  );

drop policy if exists "analisis_cliente: actualizar" on public.analisis_cliente;
create policy "analisis_cliente: actualizar" on public.analisis_cliente
  for update using ( cliente_id <> auth.uid() and public.puede_ver(cliente_id) )
             with check ( cliente_id <> auth.uid() and public.puede_ver(cliente_id) );

grant select, insert, update on public.analisis_cliente to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Como coach, sobre un cliente suyo (debe devolver el JSON):
--   select public.plan_metricas('<id-del-cliente>');
--
-- Sobre alguien que no es suyo (debe FALLAR):
--   select public.plan_metricas('<id-ajeno>');

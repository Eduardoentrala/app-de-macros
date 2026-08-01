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

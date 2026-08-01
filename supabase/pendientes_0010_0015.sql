-- =====================================================================
--  PENDIENTES: migraciones 0010 a 0015
--
--  Las 0001-0009 ya estan aplicadas. Esto junta las seis que faltan en
--  un solo pegado, en orden. Se puede ejecutar entero de una vez.
--
--  Es seguro repetirlo: todo va con "if not exists" / "create or replace"
--  / "drop policy if exists". Si ya aplicaste alguna, no pasa nada.
-- =====================================================================


-- #####################################################################
-- ##  0010_borrar_cuenta_sin_huerfanos.sql
-- #####################################################################

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


-- #####################################################################
-- ##  0011_fotos_seis_meses.sql
-- #####################################################################

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


-- #####################################################################
-- ##  0012_alimentos_sugeridos.sql
-- #####################################################################

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


-- #####################################################################
-- ##  0013_cantidad_de_comidas_viejas.sql
-- #####################################################################

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


-- #####################################################################
-- ##  0014_planes_de_comida.sql
-- #####################################################################

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


-- #####################################################################
-- ##  0015_uso_del_asistente.sql
-- #####################################################################

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


-- ---------------------------------------------------------------------
-- UNA SESIÓN POR DÍA Y POR DÍA DE RUTINA
--
-- `workout_sessions` era la única tabla de «una fila por día» sin nada que
-- lo impidiera. Las hermanas sí lo tienen desde la 0001:
--
--     weight_logs        unique (user_id, log_date)
--     progress_photos    unique (user_id, week_key, pose)
--     chequeos_semanales unique (user_id, semana)       -- 0024
--     analisis_fotos     unique (user_id, mes)          -- 0037
--     workout_sessions   nada
--
-- Y la app guarda la sesión con un buscar-y-si-no-insertar escrito en
-- JavaScript, que es exactamente lo que una restricción hace bien y un
-- cliente hace mal: entre la búsqueda y la inserción cabe otra inserción.
--
-- Tres caminos reales para acabar con dos filas del mismo día:
--
--   · La búsqueda falla —un 5xx, una cortada que vuelve— y el cliente la
--     tomaba por «no hay fila». Eso ya está arreglado en la app, pero un
--     arreglo en el teléfono llega cuando cada teléfono se actualiza.
--   · Guardar desde dos sitios a la vez.
--   · Guardar sin señal (se encola) y volver a guardar con señal antes de
--     que la cola se vacíe.
--
-- POR QUÉ IMPORTA: la pantalla se ve IGUAL con una fila que con dos. Donde
-- sale es en el cierre del lunes, que cuenta filas y suma volúmenes. Ese
-- día aparecería como dos sesiones, con el volumen contado dos veces y la
-- duración media torcida. Son los números con los que se decide si ajustar
-- calorías.
--
-- DOS ÍNDICES PARCIALES Y NO UNO CON `nulls not distinct`: en SQL dos NULL
-- no son iguales, así que un único índice sobre las tres columnas dejaría
-- pasar todas las filas con `routine_day_id` nulo —que son justo las de
-- quien entrena sin rutina guardada—. `nulls not distinct` lo arreglaría,
-- pero es de PostgreSQL 15 para arriba; dos índices parciales funcionan en
-- cualquier versión y dicen lo mismo con más letras.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. LO QUE YA ESTÉ DUPLICADO, PRIMERO
--
--    Un índice único no se crea si hay filas que lo violan. Y aunque se
--    pudiera, dejarlas sería dejar el cierre del lunes mintiendo sobre las
--    semanas pasadas.
--
--    SE QUEDA LA MÁS RECIENTE, y a igualdad de hora la de más volumen.
--
--    La primera versión de esto se quedaba con la de MÁS VOLUMEN, con el
--    razonamiento de que las copias son guardados a medias del mismo
--    entrenamiento y la más gorda es la completa. Mirar los datos de
--    verdad antes de borrar lo desmintió. Hay de los dos tipos:
--
--      3 de agosto, PIERNA, seis copias en hora y cuarto:
--        1200 (1 ejercicio) → 1480 (2) → 1480 → 1480 → 1240 → 1840 (3)
--        Aquí sí: fue añadiendo ejercicios y le dio a guardar cada vez.
--
--      8 de agosto, SABADO, cinco copias:
--        1920 (1 ejercicio) → 1440 → 1440 → 1440 → 1440
--        Aquí NO: el primero es el más gordo y es el equivocado. Corrigió
--        un peso hacia abajo y volvió a guardar. Quedarse con el mayor
--        sería quedarse justo con el error que fue a arreglar.
--
--    La más reciente acierta en los dos, y además es lo que hace la app
--    arreglada: el PATCH escribe lo que hay en pantalla, así que el último
--    guardado manda. Una limpieza que contradiga a la app de hoy deja dos
--    reglas distintas para la misma pregunta.
--
--    Antes de ejecutar esto conviene mirar qué hay, con el SELECT de
--    abajo: si no devuelve nada, no hay nada que borrar.
--
--        select user_id, session_date, routine_day_id, count(*)
--          from public.workout_sessions
--         group by 1, 2, 3
--        having count(*) > 1;
-- ---------------------------------------------------------------------
--    Y `partition by` agrupa los NULL JUNTOS, al revés que `=`. Por eso
--    aquí no hace falta tratarlos aparte y en los índices sí.
with ordenadas as (
  select id,
         row_number() over (
           partition by user_id, session_date, routine_day_id
           order by created_at desc, total_volume desc, id
         ) as puesto
    from public.workout_sessions
)
delete from public.workout_sessions s
 using ordenadas o
 where s.id = o.id
   and o.puesto > 1;


-- ---------------------------------------------------------------------
-- 2. Y QUE NO VUELVA A PASAR
-- ---------------------------------------------------------------------

-- Con día de rutina: una sesión por día y por día de rutina. Dos días de
-- rutina distintos el mismo día son legítimos —quien parte el entreno en
-- mañana y tarde—, así que el día de rutina entra en la clave.
--
-- El `where` de este no es lo que lo hace correcto —las filas con nulo no
-- chocarían aquí de todas formas, que es el problema—: es para que no se
-- indexen dos veces las filas que ya cubre el de abajo.
create unique index if not exists uq_sesion_por_dia_de_rutina
  on public.workout_sessions (user_id, session_date, routine_day_id)
  where routine_day_id is not null;

-- Y sin día de rutina: una por fecha. Aquí no hay nada que distinga dos
-- filas, así que dos filas son un duplicado y nada más.
create unique index if not exists uq_sesion_por_dia_suelto
  on public.workout_sessions (user_id, session_date)
  where routine_day_id is null;


-- ---------------------------------------------------------------------
-- 3. COMPROBAR QUE QUEDÓ
--
--     select indexname from pg_indexes
--      where tablename = 'workout_sessions'
--        and indexname like 'uq_sesion%';
--
--   Tienen que salir las dos. Y el duplicado ya no entra:
--
--     select user_id, session_date, routine_day_id, count(*)
--       from public.workout_sessions
--      group by 1, 2, 3
--     having count(*) > 1;      -- 0 filas
-- ---------------------------------------------------------------------

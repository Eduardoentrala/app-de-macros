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
--  exercise_notes NO SE VA, y estuvo a punto. Se quito de esta lista al
--    volver atras con las notas por ejercicio: siguen en la app. Hoy viven
--    en memoria y esa tabla esta vacia, pero es exactamente donde acabarian
--    si algun dia se guardan de verdad. Soltarla seria quitarle el sitio a
--    una funcion que acabamos de decidir que se queda.
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

-- ---------------------------------------------------------------------
-- RENOMBRAR UN EJERCICIO SIN PERDER LO QUE LLEVA DETRÁS
--
-- Hasta ahora el nombre de un ejercicio se escribía al crearlo y ya: la
-- tarjeta lo pinta como texto pelado y no hay forma de cambiarlo. Para
-- corregir una falta había que borrar el ejercicio y volver a crearlo.
--
-- Y eso es justo lo que no se puede hacer a la ligera, porque del nombre
-- cuelgan TRES cosas, cada una en su sitio:
--
--   1. `routine_exercises.name` — el de la rutina. Puede estar en varios
--      días: el mismo press va el lunes y el jueves.
--   2. `workout_sessions.exercises[].nombre` — DENTRO del JSON de cada
--      sesión ya guardada. De ahí sale `HISTORIAL[nombre]`, que es lo que
--      dibuja la gráfica de progreso.
--   3. `exercise_notes.exercise_name` — la nota, con su `unique
--      (user_id, exercise_name)`.
--
-- Cambiar solo el primero —que es lo que haría un campo editable— deja
-- huérfana la nota y PARTE LA GRÁFICA EN DOS: la app trataría el nombre
-- nuevo como un ejercicio recién nacido y la progresión de meses se
-- quedaría colgando del nombre viejo, sin nada que la enseñe. Quien
-- renombra quiere arreglar una falta, no empezar de cero.
--
-- Por eso va en una función y no en tres peticiones desde el teléfono: o
-- se mueven las tres o no se mueve ninguna. Tres PATCH sueltos pueden
-- fallar a la mitad y dejar la rutina con un nombre y el historial con
-- otro, que es peor que no poder renombrar.
--
-- QUÉ NO HACE FALTA VIGILAR: `routine_exercises` no tiene índice único
-- sobre el nombre, así que renombrar nunca choca ahí. Dos ejercicios
-- pueden llamarse igual en días distintos, que es justo lo normal.
-- ---------------------------------------------------------------------

create or replace function public.renombrar_ejercicio(p_viejo text, p_nuevo text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_yo       uuid := auth.uid();
  v_viejo    text := btrim(coalesce(p_viejo, ''));
  v_nuevo    text := btrim(coalesce(p_nuevo, ''));
  v_rutina   int  := 0;
  v_sesiones int  := 0;
  v_nota     text;
  v_destino  text;
begin
  if v_yo is null then
    raise exception 'Necesitas sesion';
  end if;
  if v_viejo = '' or v_nuevo = '' then
    raise exception 'Hace falta un nombre';
  end if;
  -- El mismo tope que el campo de crear ejercicio. Sin esto, un nombre de
  -- mil letras se cuela en el JSON de todas las sesiones.
  if length(v_nuevo) > 80 then
    raise exception 'Ese nombre es demasiado largo';
  end if;
  -- Sin cambios no se toca nada. No es un error: es lo que pasa cuando
  -- alguien abre el campo, no cambia nada y acepta.
  if v_viejo = v_nuevo then
    return jsonb_build_object('rutina', 0, 'sesiones', 0, 'nota', false);
  end if;

  -- 1. LA RUTINA. Todos los días donde esté, y solo los vivos: uno
  --    archivado está borrado para quien lo mira, y reescribir algo que la
  --    persona ya quitó sorprende más que dejarlo.
  update public.routine_exercises
     set name = v_nuevo
   where user_id = v_yo and name = v_viejo and archivado_en is null;
  get diagnostics v_rutina = row_count;

  -- 2. EL HISTORIAL, que es lo que de verdad se perdería.
  --
  --    Se reconstruye el array entero conservando el ORDEN —`with
  --    ordinality`—, porque `jsonb_agg` sin orden puede devolver los
  --    ejercicios barajados y la sesión guardada dejaría de contar la
  --    historia en el orden en que se hizo.
  --
  --    El `@>` de la condición usa el índice GIN si lo hay y, sobre todo,
  --    evita reescribir el JSON de todas las sesiones del usuario para
  --    cambiar una.
  update public.workout_sessions s
     set exercises = (
           select coalesce(jsonb_agg(
                    case when e->>'nombre' = v_viejo
                         then jsonb_set(e, '{nombre}', to_jsonb(v_nuevo))
                         else e end
                    order by idx), '[]'::jsonb)
             from jsonb_array_elements(s.exercises) with ordinality as t(e, idx))
   where s.user_id = v_yo
     and s.exercises @> jsonb_build_array(jsonb_build_object('nombre', v_viejo));
  get diagnostics v_sesiones = row_count;

  -- 3. LA NOTA. Lleva `unique (user_id, exercise_name)`, así que mover el
  --    nombre a secas revienta si ya había una nota con ese nombre.
  select body into v_nota
    from public.exercise_notes
   where user_id = v_yo and exercise_name = v_viejo;

  if v_nota is not null then
    select body into v_destino
      from public.exercise_notes
     where user_id = v_yo and exercise_name = v_nuevo;

    if v_destino is null then
      update public.exercise_notes
         set exercise_name = v_nuevo
       where user_id = v_yo and exercise_name = v_viejo;
    else
      -- LAS DOS TENÍAN NOTA: se juntan, no se elige.
      --
      --  Pasa cuando alguien renombra para UNIR dos ejercicios que escribió
      --  distinto -«Press banca» y «Press de banca»-. Quedarse con una y
      --  tirar la otra borra en silencio algo que la persona escribió a
      --  mano, y eso no se puede deshacer desde la app.
      update public.exercise_notes
         set body = v_destino || E'\n\n' || v_nota
       where user_id = v_yo and exercise_name = v_nuevo;
      delete from public.exercise_notes
       where user_id = v_yo and exercise_name = v_viejo;
    end if;
  end if;

  return jsonb_build_object(
    'rutina', v_rutina, 'sesiones', v_sesiones, 'nota', v_nota is not null);
end $$;

revoke execute on function public.renombrar_ejercicio(text, text) from public, anon;
grant  execute on function public.renombrar_ejercicio(text, text) to authenticated;

comment on function public.renombrar_ejercicio(text, text) is
  'Cambia el nombre de un ejercicio en la rutina, en el historial de '
  'sesiones y en su nota, todo a la vez. Solo sobre lo de quien llama.';

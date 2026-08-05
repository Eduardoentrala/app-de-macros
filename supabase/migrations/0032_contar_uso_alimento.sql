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

revoke all on function public.registrar_uso_alimento(uuid) from public;
grant execute on function public.registrar_uso_alimento(uuid) to authenticated;

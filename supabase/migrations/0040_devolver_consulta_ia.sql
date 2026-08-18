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

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

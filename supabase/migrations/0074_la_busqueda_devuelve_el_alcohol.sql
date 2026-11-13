-- =====================================================================
--  LA BÚSQUEDA TAMBIÉN TIENE QUE DEVOLVER EL ALCOHOL
--
--  La 0073 puso el alcohol en la tabla y la app lo lee (`x.alcohol`),
--  pero entre las dos va `buscar_catalogo()`, que devuelve una lista
--  FIJA de columnas. El alcohol no estaba en esa lista, así que a la
--  app le llegaba `undefined`, su `|| 0` lo convertía en cero y la
--  cerveza seguía saliendo en 16 kcal con todo lo demás ya arreglado.
--
--  Se vio en la app de verdad, buscando «cerveza» en producción con la
--  0073 ya aplicada. Las pruebas no lo habían cazado porque
--  comprobaban los dos extremos —que la tabla tenga el dato y que el
--  diario lo sume— y no la tubería que los une. Una función con lista
--  de columnas fija es justo donde se pierden las cosas en silencio:
--  no da error, da `undefined`.
--
--  `create or replace` no vale para esto: cambiar lo que devuelve una
--  función pide soltarla antes («cannot change return type of existing
--  function»). Es lo mismo que hizo la 0070 al añadir `de_la_app`.
--
--  Y HAY QUE VOLVER A DAR EL PERMISO. Al soltar la función se va con
--  ella su `grant`, así que sin las dos últimas líneas la búsqueda
--  dejaría de funcionar para todo el mundo.
--
--  Depende de 0070 y de 0073.
-- =====================================================================

drop function if exists public.buscar_catalogo(text, integer);

create or replace function public.buscar_catalogo(
  p_texto  text,
  p_limite integer default 25
)
returns table (
  id bigint, nombre text, categoria public.categoria_alimento,
  estado public.estado_alimento, kcal numeric, proteina numeric,
  carbos numeric, grasas numeric, porcion text, porcion_g integer,
  pieza_g integer, unidad text, macros_por text,
  -- true  = lo trae la app (USDA o platillo)
  -- false = lo dio de alta una persona
  de_la_app boolean,
  -- Gramos de alcohol por 100 g. Casi siempre 0; hoy solo la cerveza.
  alcohol numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g,
         a.pieza_g, a.unidad, a.macros_por,
         (a.fdc_id is not null or a.composicion is not null) as de_la_app,
         a.alcohol
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
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Que la cerveza salga con su alcohol (debe dar 3.9 y 43.7):
--   select nombre, alcohol,
--          proteina*4 + carbos*4 + grasas*9 + alcohol*7 as calorias
--     from public.buscar_catalogo('cerveza', 5);
--
-- Y que el permiso siguió ahí (debe dar una fila, 'authenticated'):
--   select grantee from information_schema.role_routine_grants
--    where routine_name = 'buscar_catalogo';

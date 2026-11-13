-- =====================================================================
--  DE QUIÉN ES CADA ALIMENTO DEL CATÁLOGO
--
--  El catálogo tiene dos clases de alimento mezcladas y la app las
--  enseñaba juntas, bajo un solo rótulo que decía «Base de datos»:
--
--    · Los de la app: 222 de USDA, medidos, con su fdc_id, más 18
--      platillos con su receta.
--    · Los que dio de alta una persona desde el panel, leyendo la
--      etiqueta: hoy 100. «Arroz con leche», «Atún Dolores», «crema
--      alpura». Comida de verdad, con marca y todo.
--
--  No son lo mismo y conviene saber cuál estás eligiendo. Los primeros
--  son un dato medido en laboratorio; los segundos, lo que decía un
--  paquete. Los dos sirven —el de la marca a veces sirve más— pero
--  mezclados no se puede distinguir, y él lo pidió con estas palabras:
--  «que se separara un poquito más y apareciera como otra cosa».
--
--  No hace falta columna nueva: la diferencia YA está en los datos.
--  Tiene `fdc_id` quien vino de USDA y `composicion` quien es un
--  platillo. Quien no tiene ninguna de las dos lo escribió alguien.
--  Añadir una bandera aparte sería un tercer sitio donde guardar lo
--  mismo, y el tercero siempre acaba diciendo otra cosa.
--
--  Lo único que faltaba era que `buscar_catalogo` lo dijera.
--
--  Depende de 0052 (la versión anterior de la función) y de 0068 (la
--  columna `composicion`).
-- =====================================================================

-- `drop` y no `create or replace`: cambia la lista de columnas que
-- devuelve, y eso Postgres no lo deja reemplazar en caliente. Se vuelve
-- a crear aquí mismo, en la misma migración.
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
  de_la_app boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g,
         a.pieza_g, a.unidad, a.macros_por,
         (a.fdc_id is not null or a.composicion is not null) as de_la_app
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
-- Que la bandera salga y separe bien:
--   select de_la_app, count(*) from public.buscar_catalogo('a', 50)
--    group by 1;
--
-- Y de dónde viene cada alimento del catálogo entero:
--   select case when composicion is not null then 'platillo de la app'
--               when fdc_id is not null      then 'USDA'
--               else 'dado de alta a mano' end as de_donde,
--          count(*)
--     from public.alimentos_catalogo group by 1 order by 2 desc;

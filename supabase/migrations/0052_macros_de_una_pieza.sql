-- ---------------------------------------------------------------------
--  Dar de alta algo por piezas sin saber cuanto pesa una
--
--  Hasta hoy la base lo prohibia, y con buena razon: los macros del catalogo
--  van por 100 g, asi que sin el peso de una pieza no hay forma de convertir.
--  El check de la 0033 lo dice tal cual: «mejor que lo impida la base a que la
--  app ensene "1 pieza = 0 calorias"».
--
--  Pero eso obliga a saber un dato que casi nunca se tiene. De un huevo o de
--  una barrita sabes lo que dice la caja -los macros de UNA- y no lo que pesa.
--  Y quien lo da de alta acaba inventandose un peso para poder pasar, que es
--  peor que no pedirlo: un peso inventado se propaga a todas las cantidades.
--
--  LO QUE CAMBIA. Se hace EXPLICITO a que se refieren los macros de la fila,
--  con una columna nueva en vez de deducirlo:
--
--    macros_por = '100g'   -> lo de siempre. Necesita pieza_g si se cuenta
--                             por piezas, porque hay que convertir.
--    macros_por = 'unidad' -> los macros de la fila son los de UNA unidad.
--                             No hace falta ningun peso: no hay nada que
--                             convertir.
--
--  Se anade una columna en vez de dejar que `pieza_g is null` signifique
--  «son por unidad». Sobrecargar un nulo con un significado es lo que ya
--  costo caro en la 0033 -la app deducia la unidad de si habia pieza_g- y la
--  leccion esta escrita ahi: cuanto pesa una unidad y que representan los
--  macros son dos datos distintos, y cada uno quiere su columna.
--
--  OJO CON `kcal`: se calcula de los macros de la fila, asi que en una fila
--  'unidad' son las calorias DE UNA UNIDAD, no de 100 g. Quien las ensene
--  tiene que decir de que son.
-- ---------------------------------------------------------------------

alter table public.alimentos_catalogo
  add column if not exists macros_por text not null default '100g';

comment on column public.alimentos_catalogo.macros_por is
  'A que se refieren proteina/carbos/grasas/kcal de esta fila: "100g" (lo '
  'normal, viene asi de USDA) o "unidad" (son los de UNA pieza o servicio, '
  'y entonces pieza_g no hace falta).';

-- El check viejo exigia pieza_g para todo lo que no fuera gramos.
alter table public.alimentos_catalogo
  drop constraint if exists alimentos_catalogo_unidad_valida;

alter table public.alimentos_catalogo
  add constraint alimentos_catalogo_unidad_valida check (
    unidad in ('Gramos', 'Pieza', 'Servicio')
    and macros_por in ('100g', 'unidad')
    -- «Por unidad» solo significa algo si se cuenta por unidades. Con gramos
    -- la unidad ES el gramo y «los macros de un gramo» no es como se escribe
    -- ni como viene de ninguna fuente.
    and (macros_por = '100g' or unidad <> 'Gramos')
    -- Y si los macros van por 100 g, contar por piezas sigue necesitando
    -- saber cuanto pesa una: eso no ha cambiado.
    and (macros_por = 'unidad' or unidad = 'Gramos' or pieza_g is not null)
  );

-- ---------------------------------------------------------------------
--  La busqueda tiene que decirlo, o quien la lea no sabe que hacer con los
--  numeros. Hay que SOLTAR la funcion antes: `create or replace` no puede
--  cambiar el tipo que devuelve, y aqui se le anade una columna.
--    ERROR: cannot change return type of existing function
--  Los permisos se van con la funcion, por eso el grant de abajo no sobra.
-- ---------------------------------------------------------------------
drop function if exists public.buscar_catalogo(text, integer);

create or replace function public.buscar_catalogo(
  p_texto  text,
  p_limite integer default 25
)
returns table (
  id bigint, nombre text, categoria public.categoria_alimento,
  estado public.estado_alimento, kcal numeric, proteina numeric,
  carbos numeric, grasas numeric, porcion text, porcion_g integer,
  pieza_g integer, unidad text, macros_por text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g,
         a.pieza_g, a.unidad, a.macros_por
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

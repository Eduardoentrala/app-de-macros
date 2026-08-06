-- Decir en qué se registra cada alimento del catálogo: gramos, piezas o
-- servicios.
--
--  QUÉ HABÍA
--  El catálogo guarda los macros SIEMPRE por 100 g -así vienen de USDA- y
--  `pieza_g` dice cuánto pesa una unidad de comer. La app deducía la unidad
--  del propio dato: si había `pieza_g`, lo ofrecía en piezas; si no, en
--  gramos. Funcionaba mientras la única unidad que no era gramos fuese la
--  pieza, y mientras solo la pusiera una migración a mano.
--
--  QUÉ CAMBIA
--  Ahora el panel puede darlo de alta, y "pieza" no es la única forma de
--  contar: un batido o un suplemento se cuentan por servicio. Cuánto pesa
--  una unidad y cómo se llama esa unidad son dos datos distintos, así que
--  se guardan por separado en vez de adivinar uno del otro.
--
--  LOS MACROS NO SE TOCAN: siguen siendo por 100 g. `unidad` solo dice cómo
--  se le enseña y se le pide la cantidad a la persona; la conversión la
--  hace la app con `pieza_g`. Guardar los macros ya multiplicados haría el
--  dato imposible de auditar contra USDA.

alter table public.alimentos_catalogo
  add column if not exists unidad text not null default 'Gramos';

comment on column public.alimentos_catalogo.unidad is
  'Como se le pide la cantidad a la persona: Gramos, Pieza o Servicio. '
  'Los macros de la fila siguen siendo por 100 g pase lo que pase; para '
  'Pieza y Servicio, pieza_g dice cuanto pesa una y la app convierte.';

-- El relleno va ANTES del check, y no es un detalle: hasta hoy la app
-- ofrecia en piezas todo lo que tuviera `pieza_g` -huevos y tortilla-.
-- Si se quedaran en 'Gramos' por defecto, esos alimentos volverian a
-- pedirse en gramos y seria una regresion silenciosa: nadie veria un
-- error, simplemente el huevo dejaria de contarse por huevos.
update public.alimentos_catalogo
   set unidad = 'Pieza'
 where pieza_g is not null
   and unidad = 'Gramos';

alter table public.alimentos_catalogo
  drop constraint if exists alimentos_catalogo_unidad_valida;

alter table public.alimentos_catalogo
  add constraint alimentos_catalogo_unidad_valida check (
    unidad in ('Gramos', 'Pieza', 'Servicio')
    -- Contar por piezas sin saber cuanto pesa una es imposible: los macros
    -- estan por 100 g y sin ese peso no hay forma de convertir. Mejor que
    -- lo impida la base a que la app ensene "1 pieza = 0 calorias".
    and (unidad = 'Gramos' or pieza_g is not null)
  );

-- La busqueda tiene que devolver la unidad o la app no puede saberla.
--
-- Hay que SOLTARLA antes: `create or replace` no puede cambiar el tipo que
-- devuelve una funcion, y aqui se le anade una columna.
--   ERROR: cannot change return type of existing function
-- Los permisos se van con la funcion, por eso el grant de abajo no sobra.
drop function if exists public.buscar_catalogo(text, integer);

create or replace function public.buscar_catalogo(
  p_texto  text,
  p_limite integer default 25
)
returns table (
  id bigint, nombre text, categoria public.categoria_alimento,
  estado public.estado_alimento, kcal numeric, proteina numeric,
  carbos numeric, grasas numeric, porcion text, porcion_g integer,
  pieza_g integer, unidad text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g,
         a.pieza_g, a.unidad
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

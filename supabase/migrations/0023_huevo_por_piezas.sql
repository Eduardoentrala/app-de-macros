-- ---------------------------------------------------------------------
--  El huevo se cuenta en piezas, no en gramos
--
--  Nadie pesa un huevo. Se dicen "dos huevos", y obligar a escribir 100 g
--  es pedirle a la persona que haga una cuenta que la app puede hacer sola.
--
--  POR QUE UNA COLUMNA NUEVA Y NO `porcion_g`
--
--  Las piezas ya existieron y se quitaron. La razon esta escrita en app.js:
--  la porcion de USDA no es una pieza. Son cosas como 'cup, chopped', 'oz' o
--  'chop without refuse'. Al ofrecerlas como piezas, "1 Pieza" de espagueti
--  acababa significando una taza y nadie podia saberlo mirando la pantalla.
--
--  `porcion` y `porcion_g` siguen siendo lo que USDA dice, sin tocar: son el
--  dato auditable contra la fuente. `pieza_g` es otra cosa y por eso va
--  aparte: cuanto pesa UNA unidad de comer, y solo se rellena donde una
--  pieza es algo que existe y no admite discusion.
--
--  Hoy: los seis huevos. Nada mas. Un aguacate o un platano tambien serian
--  candidatos, pero varian tanto de tamano que la pieza mentiria; el huevo
--  no, porque se vende por calibre.
--
--  Los pesos son los de USDA para 'large', que es el huevo que se vende en
--  Mexico como blanquillo mediano-grande. El cocido llevaba 136 g de
--  'cup, chopped': eso no es un huevo, es una taza de huevo picado.
-- ---------------------------------------------------------------------

alter table public.alimentos_catalogo
  add column if not exists pieza_g integer
    check (pieza_g is null or pieza_g between 1 and 2000);

comment on column public.alimentos_catalogo.pieza_g is
  'Cuanto pesa UNA unidad de comer, en gramos. null = este alimento no se '
  'cuenta por piezas y va en gramos. No confundir con porcion_g, que es la '
  'porcion de referencia de USDA y puede ser una taza o una onza.';

update public.alimentos_catalogo set pieza_g = 50 where nombre = 'Huevo entero';
update public.alimentos_catalogo set pieza_g = 50 where nombre = 'Huevo cocido';
update public.alimentos_catalogo set pieza_g = 46 where nombre = 'Huevo estrellado';
update public.alimentos_catalogo set pieza_g = 61 where nombre = 'Huevo revuelto';
update public.alimentos_catalogo set pieza_g = 33 where nombre = 'Clara de huevo';
update public.alimentos_catalogo set pieza_g = 17 where nombre = 'Yema de huevo';

-- La busqueda tiene que devolverlo o la app no puede saber que hay pieza.
--
-- Hay que SOLTARLA antes: `create or replace` no puede cambiar el tipo que
-- devuelve una funcion, y aqui se le anade una columna.
--   ERROR: cannot change return type of existing function
--   DETAIL: Row type defined by OUT parameters is different.
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
  pieza_g integer
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with q as (select public.normalizar_texto(coalesce(p_texto, '')) t)
  select distinct on (a.id)
         a.id, a.nombre, a.categoria, a.estado,
         a.kcal, a.proteina, a.carbos, a.grasas, a.porcion, a.porcion_g,
         a.pieza_g
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

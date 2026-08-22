-- ======================================================================
--  PENDIENTE: 0050 - poder ver si la cache de prompt funciona
--
--  Pegar entero y ejecutar. Se puede correr dos veces sin romper nada.
--  Anade dos columnas a ia_gasto y rehace ia_gasto_resumen().
--
--  DESPLEGAR TAMBIEN LA FUNCION DEL ASISTENTE: es la que enciende la
--  cache y la que escribe las columnas nuevas.
-- ======================================================================

-- Poder ver si la cache de prompt esta funcionando.
--
--  EL PROBLEMA
--
--  `apuntarGasto` suma los tokens de cache DENTRO de `entrada`:
--
--      entrada = input_tokens + cache_read + cache_creation
--
--  Se hizo asi para que la cifra no se fuera a cero el dia que se
--  encendiera la cache. Pero eso mismo la vuelve ciega: con todo sumado no
--  hay forma de saber si la cache acerta o no, y una cache que no acierta
--  no ahorra: CUESTA UN 25% MAS.
--
--  Y no es una diferencia pequena. Los tres tipos de token valen distinto:
--
--      entrada normal   1x
--      escribir cache   1.25x   (se paga al fallar)
--      leer cache       0.1x    (se paga al acertar)
--
--  Con 5 minutos de vida, la cuenta sale a favor a partir del 22% de
--  aciertos: 1.25 - 1.15h < 1 cuando h > 0.217. Por debajo de eso, se paga
--  mas que sin cache. Sin separar las tres columnas es imposible saber de
--  que lado se esta.
--
--  Se puede anadir sin cuidado: `ia_gasto` sigue vacia.

alter table public.ia_gasto add column if not exists cache_lee     integer not null default 0;
alter table public.ia_gasto add column if not exists cache_escribe integer not null default 0;

alter table public.ia_gasto add constraint ia_gasto_cache_lee_no_negativo
  check (cache_lee >= 0) not valid;
alter table public.ia_gasto add constraint ia_gasto_cache_escribe_no_negativo
  check (cache_escribe >= 0) not valid;


-- ---------------------------------------------------------------------
--  El resumen, con las tres clases de token separadas
-- ---------------------------------------------------------------------
--  Sigue devolviendo TOKENS y no pesos: los precios y el tipo de cambio
--  viven en la app, que es donde se editan sin una migracion.
drop function if exists public.ia_gasto_resumen(int);

create function public.ia_gasto_resumen(p_dias int default 30)
returns table (
  llave text, accion text, modelo text,
  llamadas bigint, entrada bigint, salida bigint,
  cache_lee bigint, cache_escribe bigint
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_desde date := (now() at time zone 'America/Mexico_City')::date
                  - least(greatest(coalesce(p_dias, 30), 1), 365);
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin ve el gasto';
  end if;

  return query
  select coalesce(g.llave, g.accion) as llave,   -- lo viejo, sin llave, cae en su accion
         g.accion, g.modelo,
         count(*)::bigint,
         sum(g.entrada)::bigint,
         sum(g.salida)::bigint,
         sum(g.cache_lee)::bigint,
         sum(g.cache_escribe)::bigint
    from public.ia_gasto g
   where g.dia >= v_desde
   group by coalesce(g.llave, g.accion), g.accion, g.modelo
   order by sum(g.salida) desc;   -- lo caro es la salida: eso manda
end $$;

revoke execute on function public.ia_gasto_resumen(int) from public, anon;
grant  execute on function public.ia_gasto_resumen(int) to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Cuantos aciertos lleva la cache del chat (por debajo del 22%, estorba):
--   select llave,
--          cache_lee, cache_escribe,
--          round(100.0 * cache_lee / nullif(cache_lee + cache_escribe, 0)) as pct_acierto
--     from public.ia_gasto_resumen(30);

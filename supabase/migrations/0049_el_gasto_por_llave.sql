-- Que el gasto se cuente por LLAVE y no por accion tecnica.
--
--  EL FALLO
--
--  `ia_gasto` guarda la accion: 'chat', 'plan', 'semana'... Parecia lo
--  natural. Pero la revision saco que la foto de comida VIAJA COMO `chat`,
--  asi que las dos cosas mas distintas de la app -preguntar por texto, que
--  es lo mas barato, y apuntar comida con foto, que es el 67% de la
--  factura- caian en el mismo saco.
--
--  El registro se monto justo para responder «¿en que se me va el dinero?».
--  Contestando «chat: $180» no responde nada: no se sabe si eso es la foto
--  o son preguntas, que es lo unico que hay que saber para decidir cual
--  apagar.
--
--  Y lo mismo con el plan: un dia y la semana entera son la misma accion
--  con cinco veces de diferencia en el precio.
--
--  LA SOLUCION
--
--  Guardar tambien la LLAVE, que es la unidad en la que se decide: las seis
--  de `ia_permisos`, las mismas seis que salen en la pantalla de
--  interruptores. Asi el informe y los interruptores hablan del mismo
--  idioma: «la foto son $156 al mes» y el interruptor de la foto esta justo
--  al lado.
--
--  La accion se queda: sirve para saber POR DONDE entro, y el dia que
--  cambien los repartos, lo apuntado sigue siendo cierto.
--
--  Se puede anadir sin cuidado: la tabla esta vacia. Se creo hace unas
--  horas y todavia no ha pasado por ella una sola respuesta.

alter table public.ia_gasto add column if not exists llave text;

create index if not exists idx_ia_gasto_llave on public.ia_gasto (llave, dia desc);


-- ---------------------------------------------------------------------
--  El resumen, ahora por llave
-- ---------------------------------------------------------------------
--  Sigue devolviendo TOKENS y no pesos. El precio por millon y el tipo de
--  cambio viven en la app, donde se cambian editando dos numeros; metidos
--  aqui harian falta una migracion cada vez que Anthropic ajuste una tarifa
--  o se mueva el dolar.
drop function if exists public.ia_gasto_resumen(int);

create function public.ia_gasto_resumen(p_dias int default 30)
returns table (
  llave text, accion text, modelo text,
  llamadas bigint, entrada bigint, salida bigint
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
         sum(g.salida)::bigint
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
-- Como super admin (debe traer una fila por llave, accion y modelo):
--   select * from public.ia_gasto_resumen(30);
--
-- Y que la foto y el chat de texto salgan SEPARADOS:
--   select llave, accion, llamadas from public.ia_gasto_resumen(30)
--    where accion = 'chat';

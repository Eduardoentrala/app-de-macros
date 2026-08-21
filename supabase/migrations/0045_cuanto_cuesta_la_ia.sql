-- Cuanto cuesta de verdad la IA, medido y no estimado.
--
--  POR QUE
--
--  Eduardo pregunto cuanto le cuesta armar un plan. La respuesta fue un
--  calculo: precio por token por una estimacion de cuantos tokens gasta
--  cada accion. Los precios son reales; los tokens eran a ojo.
--
--  Y la respuesta de Anthropic SIEMPRE trae los numeros exactos
--  -`usage.input_tokens` y `usage.output_tokens`- en cada llamada. Se
--  estaban tirando.
--
--  Esto no es para cobrarle a nadie: la app es para su familia. Es para
--  poder decidir con datos si conviene cambiar de modelo o bajar el
--  esfuerzo, en vez de con una estimacion mia.
--
--  QUE SE GUARDA Y QUE NO
--
--  Los tokens y el modelo. NO el contenido: ni el mensaje, ni la respuesta,
--  ni nada de la comida o el peso de nadie. Es una tabla de contabilidad,
--  no un registro de conversaciones.
--
--  El MODELO va guardado porque los precios son por modelo y cambian: sin
--  el, dentro de tres meses no habria forma de saber cuanto costo aquella
--  llamada. Y el precio NO se guarda: se calcula al mirar, con la tabla de
--  precios del momento. Guardar pesos congelaria un tipo de cambio.

create table if not exists public.ia_gasto (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,

  -- El dia en la zona de Mexico, igual que `ia_uso`. Con la fecha del
  -- servidor -que va en UTC- todo lo de despues de las 18:00 caeria en el
  -- dia siguiente y los totales por dia no cuadrarian con lo que se vivio.
  dia       date not null default (now() at time zone 'America/Mexico_City')::date,

  accion    text not null,
  modelo    text not null,
  entrada   integer not null default 0 check (entrada >= 0),
  salida    integer not null default 0 check (salida  >= 0),

  creado_en timestamptz not null default now()
);

create index if not exists idx_ia_gasto_dia on public.ia_gasto (dia desc);
create index if not exists idx_ia_gasto_user on public.ia_gasto (user_id, dia desc);

alter table public.ia_gasto enable row level security;

-- SOLO EL SUPER ADMIN. Esto es la factura, no un dato de la persona: a
-- quien usa la app no le sirve de nada saber cuantos tokens gasto, y
-- ensenarselo solo invita a racionarse por miedo a costar dinero.
--
-- No hay politica de INSERT a proposito: lo escribe la Edge Function con la
-- clave de servicio, que se salta el RLS. Sin politica, nadie mas puede
-- meter filas ni falsear el consumo.
drop policy if exists "ia_gasto: ver" on public.ia_gasto;
create policy "ia_gasto: ver" on public.ia_gasto
  for select using ( public.es_super_admin() );

grant select on public.ia_gasto to authenticated;


-- ---------------------------------------------------------------------
--  El resumen, ya sumado
-- ---------------------------------------------------------------------
--  Se devuelven TOKENS, no pesos. El precio por millon y el tipo de cambio
--  viven en la app, donde se cambian editando dos numeros; metidos aqui
--  harian falta una migracion cada vez que Anthropic ajuste una tarifa.
create or replace function public.ia_gasto_resumen(p_dias int default 30)
returns table (
  accion text, modelo text, llamadas bigint, entrada bigint, salida bigint
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
  select g.accion, g.modelo,
         count(*)::bigint,
         sum(g.entrada)::bigint,
         sum(g.salida)::bigint
    from public.ia_gasto g
   where g.dia >= v_desde
   group by g.accion, g.modelo
   order by sum(g.salida) desc;   -- lo caro es la salida: eso manda
end $$;

revoke execute on function public.ia_gasto_resumen(int) from public, anon;
grant  execute on function public.ia_gasto_resumen(int) to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Como super admin (debe traer una fila por accion y modelo):
--   select * from public.ia_gasto_resumen(30);
--
-- Como cualquier otro (debe FALLAR):
--   select * from public.ia_gasto_resumen(30);

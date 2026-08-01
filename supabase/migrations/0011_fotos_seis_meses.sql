-- =====================================================================
--  LAS FOTOS SE GUARDAN SEIS MESES
--
--  Son con diferencia lo que más pesa: cuatro por semana y persona, a
--  unos 300 KB cada una, son ~30 MB al año por cliente. Con doscientos
--  clientes eso es 6 GB al año creciendo sin freno, y son además el dato
--  más sensible que guarda la app.
--
--  Guardarlas para siempre no aporta —nadie compara con hace tres años—
--  y sí acumula coste y riesgo. Seis meses cubre de sobra un proceso de
--  cambio físico.
--
--  Depende de 0010.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Qué fotos ya pasaron de tiempo
--
--    `week_key` es texto ('2026-W31'), así que no se puede comparar con
--    una fecha directamente. Se convierte al lunes de esa semana ISO,
--    que es la misma cuenta que hace la app.
-- ---------------------------------------------------------------------
create or replace function public.lunes_de_clave(p_clave text)
returns date
language sql immutable
as $$
  select (
    -- lunes de la semana 1 del año (la que contiene el 4 de enero)
    date_trunc('week', make_date(split_part(p_clave, '-W', 1)::int, 1, 4))
    + ((split_part(p_clave, '-W', 2)::int - 1) * interval '7 days')
  )::date
$$;


-- ---------------------------------------------------------------------
-- 2. La limpieza
--
--    Borra de verdad, no archiva: el sentido de esto es dejar de guardar.
--    Por eso abre la compuerta de 0007 antes de borrar.
--
--    Devuelve cuántas quitó y qué rutas tenían, para que quien la llame
--    pueda borrar también los archivos del bucket. Eso NO se puede hacer
--    desde SQL: los archivos los gestiona la API de Storage. Sin ese
--    segundo paso las fichas desaparecen pero los archivos siguen
--    ocupando, así que la limpieza completa necesita las dos mitades.
-- ---------------------------------------------------------------------
create or replace function public.limpiar_fotos_viejas(p_meses int default 6)
returns table (borradas int, rutas text[])
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_limite date := (current_date - (p_meses || ' months')::interval)::date;
  v_rutas text[];
  v_n int;
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede limpiar fotos';
  end if;

  select array_agg(storage_path) into v_rutas
    from public.progress_photos
   where public.lunes_de_clave(week_key) < v_limite;

  perform set_config('app.borrado_definitivo', 'on', true);
  delete from public.progress_photos
   where public.lunes_de_clave(week_key) < v_limite;
  get diagnostics v_n = row_count;
  perform set_config('app.borrado_definitivo', 'off', true);

  return query select v_n, coalesce(v_rutas, array[]::text[]);
end $$;

revoke execute on function public.limpiar_fotos_viejas(int) from public;
grant  execute on function public.limpiar_fotos_viejas(int) to authenticated;


-- ---------------------------------------------------------------------
-- 3. Cómo dejarlo automático
--
--    Esta función hay que llamarla cada cierto tiempo. Dos caminos:
--
--    a) pg_cron, si está disponible en el proyecto:
--         select cron.schedule('fotos-6-meses', '0 4 * * 0',
--                              $q$select public.limpiar_fotos_viejas()$q$);
--       Limpia las fichas, pero NO los archivos del bucket.
--
--    b) Una Edge Function programada, que es lo completo: llama a esta
--       función, recoge las rutas que devuelve y las borra del bucket
--       con la clave de servicio.
--
--    Mientras no exista ninguna de las dos, la app ya deja de MOSTRAR lo
--    que pasa de seis meses (filtra por week_key al cargar), así que el
--    comportamiento visible es el correcto desde ya; lo que falta es
--    dejar de pagar por lo que nadie ve.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 4. Comprobaciones
-- ---------------------------------------------------------------------
-- La conversión de clave a lunes (debe dar 2026-07-27):
--   select public.lunes_de_clave('2026-W31');
--
-- Qué se borraría, sin borrar nada:
--   select count(*) from public.progress_photos
--    where public.lunes_de_clave(week_key) < (current_date - interval '6 months')::date;
--
-- Y la limpieza (solo super admin):
--   select * from public.limpiar_fotos_viejas();

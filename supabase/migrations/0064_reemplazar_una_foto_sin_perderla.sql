-- ---------------------------------------------------------------------
--  REEMPLAZAR UNA FOTO PODÍA PERDERLA
--
--  Cambiar la foto de un hueco son tres pasos:
--
--    1. subir el archivo nuevo al bucket (ruta nueva, con marca de tiempo)
--    2. BORRAR la ficha de la vieja  → un trigger la archiva (0007)
--    3. INSERTAR la ficha de la nueva
--
--  Entre el 2 y el 3 no hay nada. Si el 3 no llega —se cae la red, se
--  cierra la app, la base contesta un error— la vieja ya está archivada,
--  o sea invisible, y la nueva no tiene ficha. El hueco queda VACÍO y el
--  archivo nuevo, huérfano en el bucket.
--
--  Y es un hueco de los que no se repone: una foto de progreso de hace
--  tres meses no se vuelve a tomar.
--
--  La app ya sabía que esto podía pasar —marca el error con
--  `laAnteriorSeAparto` para no decirle a nadie que no perdió nada— pero
--  saberlo no era arreglarlo.
--
--  AQUÍ LOS DOS PASOS SON UNO. Una función de Postgres corre dentro de
--  una transacción: o se hacen el borrado y la inserción, o no se hace
--  ninguno. No hay estado intermedio que pueda quedarse.
--
--  LA SUBIDA AL BUCKET SE QUEDA FUERA, y no es un descuido: el
--  almacenamiento es otro servicio y no entra en esta transacción. Pero
--  un archivo sin ficha es inofensivo —no se enseña, no se cuenta, y
--  `limpiar_fotos_viejas()` acaba llevándoselo—. Lo que no era inofensivo
--  era el par de fichas.
-- ---------------------------------------------------------------------

create or replace function public.reemplazar_foto(
  p_semana text,
  p_pose   text,
  p_ruta   text,
  p_bytes  bigint  default 0,
  p_ancho  integer default null,
  p_alto   integer default null
)
returns public.progress_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.progress_photos;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión para guardar una foto.';
  end if;

  -- SOLO LAS SUYAS. La función es `security definer`, o sea que corre con
  -- permisos que se saltan RLS: si el usuario viniera de un parámetro en
  -- vez de `auth.uid()`, cualquiera borraría las fotos de otro cambiando
  -- una cadena. Es la misma puerta que ya se cerró en la función del
  -- asistente al no aceptar rutas del cliente.
  delete from public.progress_photos
   where user_id  = auth.uid()
     and week_key = p_semana
     and pose     = p_pose;

  insert into public.progress_photos
    (user_id, week_key, pose, storage_path, bytes, width, height)
  values
    (auth.uid(), p_semana, p_pose, p_ruta, coalesce(p_bytes, 0), p_ancho, p_alto)
  returning * into fila;

  -- Si la inserción revienta —una pose que no existe, una clave de semana
  -- mal formada, una ruta repetida— la excepción deshace también el
  -- borrado de arriba. La vieja sigue donde estaba.
  return fila;
end;
$$;

revoke all on function public.reemplazar_foto(text, text, text, bigint, integer, integer) from public;
grant execute on function public.reemplazar_foto(text, text, text, bigint, integer, integer) to authenticated;

comment on function public.reemplazar_foto(text, text, text, bigint, integer, integer) is
  'Archiva la foto que hubiera en ese hueco y mete la nueva, las dos en la '
  'misma transacción. Por separado, un fallo entre medias dejaba el hueco '
  'vacío: la vieja archivada y la nueva sin ficha.';


-- ---------------------------------------------------------------------
--  COMPROBAR
--
--    -- Con sesión de alguien que ya tenga una foto en ese hueco:
--    select id, storage_path from public.progress_photos
--     where week_key = '2026-W44' and pose = 'frente';
--
--    select public.reemplazar_foto('2026-W44', 'frente', 'prueba/x.jpg');
--
--    -- La vieja archivada, la nueva viva, y ni un hueco vacío en medio:
--    select storage_path, archivado_en from public.progress_photos
--     where week_key = '2026-W44' and pose = 'frente';
--
--    -- Y que una mala no se lleve la buena por delante:
--    select public.reemplazar_foto('esto-no-es-una-semana', 'frente', 'y.jpg');
--    -- ...falla, y la de antes tiene que seguir ahí.
-- ---------------------------------------------------------------------

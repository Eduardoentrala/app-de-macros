-- ---------------------------------------------------------------------
--  Borrar una cuenta de verdad
--
--  Hasta ahora no habia forma de irse. La 0007 convirtio los DELETE en
--  archivado, que esta bien para no perder el historial cuando alguien
--  quita una receta por error, pero significa que quien queria borrar su
--  cuenta no podia: se quedaba marcada y ahi seguia todo.
--
--  Esto es distinto y es definitivo. No hay papelera, no hay deshacer.
--
--  DONDE VIVEN LOS DATOS DE UNA PERSONA
--
--  Borrar `auth.users` arrastra en cascada casi todo, pero no todo, y lo
--  que queda fuera es justo lo que haria inutil el borrado:
--
--    auditoria     Guarda `datos_antes` en jsonb: una copia COMPLETA de
--                  cada fila borrada. Sin purgarla, borrar la cuenta deja
--                  el expediente entero dentro, con nombre y medidas. Es
--                  el sitio menos evidente y el mas grave.
--    versiones     Lo mismo con el historial de metas.
--    storage       Las fotos de progreso. La fila se borra aqui; el
--                  archivo en el bucket queda huerfano hasta que pase una
--                  limpieza. Eso es una limitacion real y conviene saberla
--                  en vez de suponer que ya no existe.
--
--  El flag `app.borrado_definitivo` ya existia en la 0007 para esto: es la
--  puerta que deja pasar un DELETE de verdad por delante del archivado. Se
--  pone `true` en el tercer argumento para que sea LOCAL a la transaccion:
--  si se quedara puesto en la sesion, el siguiente borrado normal de esa
--  conexion borraria de verdad sin que nadie lo pidiera.
-- ---------------------------------------------------------------------

create or replace function public.purgar_persona(p_usuario uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- El orden importa. Primero la cascada, que dispara los triggers de
  -- auditoria y escribe las copias; y despues se purgan esas copias. Al
  -- reves, la auditoria del propio borrado sobreviviria.
  perform set_config('app.borrado_definitivo', 'on', true);

  -- Las filas de Storage. El archivo del bucket es otra historia: esto
  -- solo suelta la referencia.
  delete from storage.objects where owner = p_usuario;

  delete from auth.users where id = p_usuario;

  delete from public.auditoria where user_id = p_usuario or actor_id = p_usuario;
  if to_regclass('public.metas_macros_versiones') is not null then
    execute 'delete from public.metas_macros_versiones where user_id = $1'
      using p_usuario;
  end if;
end $$;

revoke execute on function public.purgar_persona(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  Que alguien borre SU cuenta
--
--  No lleva parametro a proposito: el unico id que acepta es el de quien
--  llama. Un parametro seria una forma de borrar la cuenta de otro.
-- ---------------------------------------------------------------------
create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_yo uuid := auth.uid();
begin
  if v_yo is null then
    raise exception 'Necesitas sesion para borrar tu cuenta';
  end if;

  -- El ultimo super admin no puede irse: dejaria el panel sin nadie que
  -- pueda entrar, y recuperarlo requiere tocar la base a mano.
  if public.es_super_admin() and
     (select count(*) from public.profiles where role = 'super_admin') <= 1 then
    raise exception 'Eres el unico super admin: nombra a otro antes de borrarte';
  end if;

  perform public.purgar_persona(v_yo);
end $$;

revoke execute on function public.borrar_mi_cuenta() from public, anon;
grant  execute on function public.borrar_mi_cuenta() to authenticated;


-- ---------------------------------------------------------------------
--  Que el super admin borre la de otro
-- ---------------------------------------------------------------------
create or replace function public.admin_borrar_cuenta(p_usuario uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede borrar cuentas';
  end if;
  -- Borrarse a uno mismo desde el panel de administracion es siempre un
  -- accidente. Para irse de verdad esta borrar_mi_cuenta(), que ademas
  -- comprueba que quede otro super admin.
  if p_usuario = auth.uid() then
    raise exception 'No puedes borrar tu propia cuenta desde aqui';
  end if;
  if not exists (select 1 from public.profiles where id = p_usuario) then
    raise exception 'No existe esa persona';
  end if;

  perform public.purgar_persona(p_usuario);
end $$;

revoke execute on function public.admin_borrar_cuenta(uuid) from public, anon;
grant  execute on function public.admin_borrar_cuenta(uuid) to authenticated;

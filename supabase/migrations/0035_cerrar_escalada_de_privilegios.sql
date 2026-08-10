-- URGENTE: cerrar una escalada de privilegios sin sesión.
--
--  QUE PASABA
--  `nombrar_super_admin(correo)` convierte una cuenta en super admin. Es la
--  funcion de arranque: se pensó para ejecutarse UNA vez desde el editor
--  SQL, al montar el proyecto.
--
--  Su guarda era:
--      if auth.uid() is not null then raise exception ...
--
--  O sea: aborta SI HAY SESION. La intencion era "solo desde el servidor",
--  pero esta al reves para el caso que importa: `anon` no tiene sesion, asi
--  que auth.uid() es null y la guarda LE DEJA PASAR.
--
--  Y los revoke eran `from public` y `from authenticated`. Ninguno alcanza a
--  `anon`: Supabase le concede execute por permisos por defecto del esquema,
--  y esa concesion es suya, no la hereda de PUBLIC. (Es el mismo fallo que
--  ya aparecio en la 0032 con registrar_uso_alimento.)
--
--  Resultado: cualquiera que abriera la app publicada -donde la clave
--  publishable esta a la vista, como debe estar- podia hacer
--
--      POST /rest/v1/rpc/nombrar_super_admin  {"p_correo":"..."}
--
--  y convertir en super admin la cuenta que quisiera. Comprobado contra la
--  base real con un correo inexistente: la funcion se ejecuto y llego hasta
--  el "no hay ninguna cuenta con ese correo". Con un correo de verdad habria
--  hecho el update.
--
--  QUE SE HACE
--  Dos capas, porque una sola ya fallo una vez.

-- ---- Capa 1: que no la pueda llamar nadie desde la API ----
-- Los tres nombrados, en una sola orden. `from public` NO implica a `anon`
-- ni a `authenticated`: Supabase les concede execute por permisos por
-- defecto del esquema, y esa concesion es suya. Escribir solo `from public`
-- -que es lo que habia- es exactamente el fallo que se esta arreglando.
revoke execute on function public.nombrar_super_admin(text) from public, anon, authenticated;

-- ---- Capa 2: que la guarda mire lo que toca ----
-- No "¿hay sesion?" sino "¿quien eres?". Los roles con los que entra la API
-- son anon y authenticated; desde el editor SQL se entra como postgres, y
-- una funcion de servidor entra como service_role. Asi, aunque manana
-- alguien vuelva a conceder el permiso por error, la funcion se niega.
create or replace function public.nombrar_super_admin(p_correo text)
returns text
language plpgsql security definer set search_path = public, pg_temp, auth
as $$
declare v_id uuid;
begin
  if current_user in ('anon', 'authenticated') then
    raise exception
      'Esta funcion solo se ejecuta desde el servidor (editor SQL o service_role), '
      'nunca desde la app.';
  end if;

  select id into v_id from auth.users where email = lower(trim(p_correo));
  if v_id is null then
    raise exception 'No hay ninguna cuenta con el correo %. Registrate primero en la app.', p_correo;
  end if;

  update public.profiles set role = 'super_admin', activo = true where id = v_id;
  if not found then
    raise exception 'La cuenta % existe pero no tiene perfil', p_correo;
  end if;

  return 'Listo: ' || p_correo || ' ya es super admin';
end $$;

revoke execute on function public.nombrar_super_admin(text) from public, anon, authenticated;


-- ---- Y de paso, la otra que tampoco tenia guarda ----
-- `limpiar_uso_ia()` borra el consumo de IA de hace mas de 30 dias. Es
-- mantenimiento y no filtra nada, pero no hay ninguna razon para que la
-- pueda disparar alguien sin sesion.
revoke execute on function public.limpiar_uso_ia() from public, anon, authenticated;


-- ---- El barrido, que es lo que impide que se repita ----
-- Todas las funciones SECURITY DEFINER de `public` dejan de estar al alcance
-- de `anon`. Saltarse RLS es exactamente su trabajo, asi que ninguna deberia
-- poder llamarla alguien sin identificar.
--
-- Antes de registrarse o entrar, la app no llama a ninguna RPC: el registro
-- y el login van por /auth/v1/, que es otra cosa. Por eso esto no rompe el
-- arranque.
--
-- Se hace en bucle y no a mano para que alcance tambien a las que se
-- anadan manana sin acordarse de revocar.
do $barrido$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from anon', f.firma);
    n := n + 1;
  end loop;
  raise notice 'Funciones SECURITY DEFINER cerradas a anon: %', n;
end
$barrido$;

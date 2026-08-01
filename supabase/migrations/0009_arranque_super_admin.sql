-- =====================================================================
--  EL PROBLEMA DEL HUEVO Y LA GALLINA: crear el primer super admin
--
--  0002 (sección 10) te dice que ejecutes esto en el editor SQL:
--
--    update public.profiles set role='super_admin'
--     where id = (select id from auth.users where email='...');
--
--  No funciona. Probado contra PostgreSQL: falla con
--  "Solo un super admin puede cambiar roles".
--
--  El motivo: `trg_bloquear_escalada_de_rol` (0002, sección 4) rechaza
--  cualquier cambio de rol si quien lo pide no es super admin. En el
--  editor SQL no hay sesión de usuario, así que `auth.uid()` es NULL,
--  `es_super_admin()` devuelve false, y el trigger corta. Como todavía
--  no existe ningún super admin, no hay nadie que pueda crear al
--  primero. La plataforma nace bloqueada: sin super admin no se puede
--  promover a un coach, ni asignar clientes, ni usar ningún RPC de
--  administración.
--
--  LA SOLUCIÓN: distinguir "sin permiso" de "sin sesión".
--
--  `auth.uid() is null` significa que la llamada NO viene de un usuario
--  de la app. Viene del editor SQL, de una migración o de la clave
--  `service_role` — los tres son contextos del servidor, ya de confianza.
--
--  ¿Y no abre esto un agujero con la clave anónima, que tampoco tiene
--  usuario? No. Para llegar al trigger hay que pasar antes por el RLS de
--  `profiles`, cuya política de UPDATE exige `puede_editar_propio(id)`,
--  o sea `id = auth.uid()`. Con auth.uid() nulo eso es false y el UPDATE
--  ni siquiera alcanza ninguna fila. El anónimo no puede modificar nada.
--
--  Depende de 0008.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. El trigger deja pasar los contextos de servidor
-- ---------------------------------------------------------------------
create or replace function public.bloquear_escalada_de_rol()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null           -- hay sesión: es un usuario de la app
     and not public.es_super_admin() then
    raise exception 'Solo un super admin puede cambiar roles';
  end if;
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 2. Lo mismo al dar de alta
--
--    `forzar_rol_inicial` (0002) machaca el rol a 'cliente' en cada
--    INSERT. Con la misma lógica: si no hay sesión, quien inserta es el
--    servidor y se respeta el rol que pida. Es lo que permitirá a la
--    Edge Function de administración crear un entrenador directamente.
--
--    Tampoco abre nada: la política de INSERT de `profiles` exige
--    `id = auth.uid() or es_super_admin()`, y con la clave anónima
--    ninguna de las dos se cumple.
-- ---------------------------------------------------------------------
create or replace function public.forzar_rol_inicial()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.es_super_admin() then
    new.role := 'cliente';
  end if;
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 3. Nombrar al primer super admin, sin escribir SQL a mano
--
--    Se llama con el correo con el que ya te registraste normalmente en
--    la app. Es idempotente: llamarla dos veces no hace daño.
--
--    A propósito NO comprueba permisos: solo se puede ejecutar desde un
--    contexto que ya llegó al editor SQL o tiene la clave de servicio.
--    Por eso mismo se le quita el permiso a `authenticated` al final:
--    nadie desde la app puede llamarla.
-- ---------------------------------------------------------------------
create or replace function public.nombrar_super_admin(p_correo text)
returns text
language plpgsql security definer set search_path = public, pg_temp, auth
as $$
declare v_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'Esta función solo se ejecuta desde el servidor (editor SQL o service_role)';
  end if;

  select id into v_id from auth.users where email = lower(trim(p_correo));
  if v_id is null then
    raise exception 'No hay ninguna cuenta con el correo %. Regístrate primero en la app.', p_correo;
  end if;

  update public.profiles set role = 'super_admin', activo = true where id = v_id;
  if not found then
    raise exception 'La cuenta % existe pero no tiene perfil', p_correo;
  end if;

  return 'Listo: ' || p_correo || ' ya es super admin';
end $$;

revoke execute on function public.nombrar_super_admin(text) from public;
revoke execute on function public.nombrar_super_admin(text) from authenticated;


-- ---------------------------------------------------------------------
-- 4. Cómo se usa
--
--    1. Regístrate en la app con tu correo, como un usuario normal.
--    2. En el editor SQL de Supabase, ejecuta:
--
--         select public.nombrar_super_admin('tu-correo@ejemplo.com');
--
--    3. Cierra sesión y vuelve a entrar para que el token recoja el rol.
--
--    A partir de ahí ya puedes promover entrenadores desde el panel.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 5. Comprobaciones
-- ---------------------------------------------------------------------
-- Debe funcionar desde el editor SQL:
--   select public.nombrar_super_admin('tu-correo@ejemplo.com');
--   select role from public.profiles where id=(select id from auth.users where email='tu-correo@ejemplo.com');
--
-- Y un usuario de la app NO debe poder ascenderse (debe FALLAR):
--   update public.profiles set role='super_admin' where id = auth.uid();

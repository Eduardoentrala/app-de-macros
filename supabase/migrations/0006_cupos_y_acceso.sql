-- =====================================================================
--  CUPOS DE ORGANIZACIÓN, CUENTAS DESACTIVADAS Y PERMISOS DEL org_admin
--
--  Cierra tres agujeros que quedaron abiertos en 0003 y 0004. No crea
--  tablas ni cambia columnas: solo reemplaza funciones y tres políticas.
--  La interfaz no se entera de nada.
--
--  Depende de 0005 (el valor 'org_admin' del enum ya confirmado).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Los cupos de la organización, aplicados de verdad
--
--    `organizations.max_coaches` y `max_clientes` existen desde 0004
--    pero no los miraba nadie: `validar_asignacion()` los leía en dos
--    variables y terminaba el `if` sin compararlas. Eran decorativos.
--
--    El sitio correcto para vigilarlos es `profiles`, que es donde un
--    usuario entra en una organización o cambia de rol — no en la tabla
--    de asignaciones, que es otra cosa.
-- ---------------------------------------------------------------------
create or replace function public.validar_cupo_org()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_tope     int;
  v_actuales int;
begin
  -- Un UPDATE que no toca ni la organización ni el rol no puede alterar
  -- ningún cupo: salir cuanto antes y no pagar dos COUNT por nada.
  if tg_op = 'UPDATE'
     and new.org_id is not distinct from old.org_id
     and new.role   is not distinct from old.role then
    return new;
  end if;

  -- El super admin es de la plataforma, no ocupa plaza en ninguna
  -- organización. El org_admin tampoco: administra, no entrena.
  if new.role = 'coach' then
    select max_coaches into v_tope
      from public.organizations where id = new.org_id;

    select count(*) into v_actuales
      from public.profiles
     where org_id = new.org_id and role = 'coach' and id <> new.id;

    if v_tope is not null and v_actuales >= v_tope then
      raise exception 'La organización ya llegó a su tope de % entrenadores', v_tope;
    end if;

  elsif new.role = 'cliente' then
    select max_clientes into v_tope
      from public.organizations where id = new.org_id;

    select count(*) into v_actuales
      from public.profiles
     where org_id = new.org_id and role = 'cliente' and id <> new.id;

    if v_tope is not null and v_actuales >= v_tope then
      raise exception 'La organización ya llegó a su tope de % clientes', v_tope;
    end if;
  end if;

  return new;
end $$;

-- OJO CON EL NOMBRE: cuando varios triggers comparten tabla y momento,
-- Postgres los ejecuta en orden alfabético. Este tiene que correr
-- DESPUÉS de los dos que rellenan los datos que aquí se comprueban:
--
--   trg_forzar_rol_inicial  (0002) → fija new.role
--   trg_org_inicial         (0004) → fija new.org_id
--   trg_validar_cupo_org    (aquí) → los valida
--
-- f < o < v, así que el orden sale solo. Si algún día lo renombras,
-- respeta esa letra o dejará de ver los valores definitivos.
drop trigger if exists trg_validar_cupo_org on public.profiles;
create trigger trg_validar_cupo_org
  before insert or update on public.profiles
  for each row execute function public.validar_cupo_org();


-- ---------------------------------------------------------------------
-- 2. La validación de asignaciones, sin el código muerto
--
--    Se conserva lo que ya hacía bien (no mezclar organizaciones) y se
--    completa lo que dejaba a medias. El tope por coach vive en
--    `system_settings.max_clientes_por_coach` desde 0003.
--
--    Antes esto solo se comprobaba dentro del RPC `admin_asignar()`. Un
--    org_admin que inserte directo en la tabla se lo saltaba entero;
--    ahora el trigger lo vigila venga por donde venga.
-- ---------------------------------------------------------------------
create or replace function public.validar_asignacion()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_org_coach   uuid;
  v_org_cliente uuid;
  v_tope        int;
  v_actuales    int;
begin
  select org_id into v_org_coach   from public.profiles where id = new.coach_id;
  select org_id into v_org_cliente from public.profiles where id = new.cliente_id;

  if v_org_coach is null or v_org_cliente is null then
    raise exception 'El coach o el cliente no tienen perfil con organización';
  end if;

  if v_org_coach is distinct from v_org_cliente then
    raise exception 'El coach y el cliente son de organizaciones distintas';
  end if;

  if new.activo then
    select coalesce((valor)::text::int, 80) into v_tope
      from public.system_settings where clave = 'max_clientes_por_coach';

    -- Cuenta los CLIENTES de ese coach. La versión anterior contaba
    -- filas de toda la organización, que no es lo que mide el ajuste.
    -- Se excluye la fila propia para que un upsert que solo reactiva
    -- una asignación existente no se cuente dos veces.
    select count(*) into v_actuales
      from public.coach_clientes
     where coach_id = new.coach_id
       and activo
       and cliente_id <> new.cliente_id;

    if v_actuales >= v_tope then
      raise exception 'Ese coach ya llegó al tope de % clientes', v_tope;
    end if;
  end if;

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 3. Una cuenta desactivada deja de ver datos — ahora sí
--
--    0003 define `acceso_permitido()` (cuenta activa + no estar en modo
--    mantenimiento) y lo deja escrito como "ejemplo, repetir el patrón
--    cuando quieras activarlo". Nunca se activó: hoy un coach
--    desactivado sigue leyendo el diario de sus clientes.
--
--    En vez de reescribir las políticas de las once tablas — que sería
--    repetir la misma condición once veces y dejar la puerta abierta a
--    olvidar una — se mete la comprobación DENTRO de las tres funciones
--    que ya llaman todas las políticas. Es el mismo truco que usa 0004
--    en su sección 4: cambias la función y todas las políticas se
--    actualizan solas, sin tocar ninguna.
-- ---------------------------------------------------------------------
create or replace function public.puede_ver(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.acceso_permitido() and objetivo is not null and (
       objetivo = auth.uid()
    or public.es_super_admin()
    or (public.es_org_admin() and public.misma_org(objetivo))
    or public.es_coach_de(objetivo)
  )
$$;

create or replace function public.puede_editar_propio(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.acceso_permitido() and (
       objetivo = auth.uid()
    or public.es_super_admin()
  )
$$;

create or replace function public.puede_editar_entreno(objetivo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.acceso_permitido() and objetivo is not null and (
       objetivo = auth.uid()
    or public.es_super_admin()
    or (public.es_org_admin() and public.misma_org(objetivo))
    or public.es_coach_de(objetivo)
  )
$$;


-- ---------------------------------------------------------------------
-- 4. …pero tu propia ficha la lees siempre
--
--    Consecuencia del punto anterior: si `puede_ver` empieza a exigir
--    cuenta activa, un usuario desactivado tampoco puede leer su PROPIO
--    perfil, y la app no tendría con qué explicarle lo que pasa. Se
--    quedaría en blanco, que parece un error en vez de una decisión.
--
--    Con esta excepción la app puede leer su fila, ver `activo = false`
--    y mostrar "tu cuenta está desactivada". Sus datos (diario, rutina,
--    fotos) siguen cerrados: eso lo gobiernan las otras políticas.
-- ---------------------------------------------------------------------
drop policy if exists "perfiles: ver" on public.profiles;
create policy "perfiles: ver" on public.profiles
  for select using (
       id = auth.uid()                                    -- siempre, aunque esté desactivado
    or public.es_super_admin()
    or (org_id = public.mi_org() and public.puede_ver(id))
  );


-- ---------------------------------------------------------------------
-- 5. El org_admin ya puede deshacer lo que hace
--
--    0004 le abrió el INSERT de asignaciones, pero el UPDATE y el DELETE
--    seguían siendo solo de super admin (venían de 0002). Resultado: un
--    org_admin podía asignarle un cliente a un coach y después no tenía
--    forma de quitárselo. Media función no es una función.
-- ---------------------------------------------------------------------
drop policy if exists "asignaciones: solo super admin modifica" on public.coach_clientes;
create policy "asignaciones: modificar" on public.coach_clientes
  for update using (
    public.es_super_admin() or (public.es_org_admin() and public.misma_org(cliente_id))
  ) with check (
    public.es_super_admin() or (public.es_org_admin() and public.misma_org(cliente_id))
  );

drop policy if exists "asignaciones: solo super admin quita" on public.coach_clientes;
create policy "asignaciones: quitar" on public.coach_clientes
  for delete using (
    public.es_super_admin() or (public.es_org_admin() and public.misma_org(cliente_id))
  );


-- ---------------------------------------------------------------------
-- 6. Comprobaciones
-- ---------------------------------------------------------------------
-- Los cuatro roles deben estar disponibles:
--   select unnest(enum_range(null::public.app_role));
--
-- El cupo debe saltar. Con una organización de max_clientes = 2:
--   update public.organizations set max_clientes = 2 where slug = 'principal';
--   -- el tercer cliente que entre debe FALLAR con "tope de 2 clientes"
--
-- Cuenta desactivada (ejecutar con la sesión de ese usuario):
--   update public.profiles set activo = false where id = '<un-coach>';
--   select count(*) from public.diary_entries;   -- debe dar 0
--   select activo from public.profiles where id = auth.uid();  -- debe dar false
--
-- Modo mantenimiento (con sesión de cualquiera que no sea super admin):
--   update public.feature_flags set activo = true where clave='modo_mantenimiento';
--   select count(*) from public.diary_entries;   -- debe dar 0
--   -- el super admin debe seguir viéndolo todo
--
-- Asignación entre organizaciones distintas: debe FALLAR
--   insert into public.coach_clientes(coach_id, cliente_id)
--     values ('<coach-org-A>', '<cliente-org-B>');

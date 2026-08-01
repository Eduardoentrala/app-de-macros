-- =====================================================================
--  PODERES DEL SUPER ADMIN SOBRE LAS CUENTAS
--
--  Tres cosas:
--    1. Un interruptor de IA por persona.
--    2. Que esos interruptores solo los mueva el super admin -y no el
--       propio interesado, que es el agujero que había-.
--    3. Invitar por correo a gente que todavía no tiene cuenta.
--
--  La suspensión NO se inventa aquí: la 0007 ya trae `estado` con
--  'suspendido' y un trigger que apaga el acceso. Esto solo pone quién
--  puede tocarlo.
--
--  Depende de 0016.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Interruptor de IA
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists ia_habilitada boolean not null default true;

comment on column public.profiles.ia_habilitada is
  'Si es false, la Edge Function del asistente rechaza a esta persona. '
  'Sirve para cortarle el gasto a alguien concreto sin suspenderle la cuenta.';


-- ---------------------------------------------------------------------
--  2. Quién mueve los interruptores
--
--  La política de UPDATE de profiles usa puede_editar_propio(), o sea
--  que cada quien puede editar su propia fila. Eso está bien para el
--  nombre o los macros, pero NO para estos tres campos: si alguien puede
--  escribir su propio `activo`, se quita la suspensión solo; si puede
--  escribir `ia_habilitada`, se vuelve a encender la IA que le apagué.
--
--  El trigger de roles (0002) ya protegía `role` de la misma forma.
--  Esto extiende la misma idea a los campos que deciden acceso y gasto.
-- ---------------------------------------------------------------------
create or replace function public.bloquear_cambios_de_cuenta()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.es_super_admin() then
    return new;                       -- el super admin manda
  end if;

  -- auth.uid() nulo = contexto de servidor de confianza (una función con
  -- la clave de servicio, un script de mantenimiento). Mismo criterio que
  -- en 0009 para poder nombrar al primer super admin.
  if auth.uid() is null then
    return new;
  end if;

  if new.ia_habilitada is distinct from old.ia_habilitada then
    raise exception 'Solo un super admin puede cambiar el acceso a la IA';
  end if;
  if new.estado is distinct from old.estado then
    raise exception 'Solo un super admin puede cambiar el estado de la cuenta';
  end if;
  if new.activo is distinct from old.activo then
    raise exception 'Solo un super admin puede activar o desactivar una cuenta';
  end if;

  return new;
end $$;

-- Debe correr ANTES que trg_sincronizar_estado (b < s): si alguien no
-- autorizado toca `estado`, se corta aquí y el otro ni llega a apagar
-- `activo`.
drop trigger if exists trg_bloquear_cambios_de_cuenta on public.profiles;
create trigger trg_bloquear_cambios_de_cuenta
  before update on public.profiles
  for each row execute function public.bloquear_cambios_de_cuenta();


-- ---------------------------------------------------------------------
--  3. Invitaciones por correo
--
--  Se apunta el correo con el rol y el entrenador que le tocan. Cuando
--  esa persona se registra, un trigger lo aplica. Si nunca se registra,
--  la fila se queda ahí sin hacer nada.
--
--  OJO: tabla nueva. 0002 y 0004 generan políticas recorriendo listas
--  fijas de nombres y esta no está en ellas, así que van escritas aquí.
--  Sin esto naceria sin RLS y cualquiera leeria los correos.
-- ---------------------------------------------------------------------
create table if not exists public.invitaciones (
  id           uuid primary key default gen_random_uuid(),
  correo       text not null,
  rol          public.app_role not null default 'cliente',
  org_id       uuid references public.organizations(id),
  coach_id     uuid references auth.users(id) on delete set null,
  nota         text,
  invitado_por uuid references auth.users(id),
  creado_en    timestamptz not null default now(),
  aceptada_en  timestamptz,
  aceptada_por uuid references auth.users(id)
);

-- El correo se guarda en minúsculas y sin espacios: "Ana@X.com " y
-- "ana@x.com" son la misma persona, y si no se normaliza aquí la
-- invitación no encontraría a quien se registra.
create or replace function public.normalizar_correo_invitacion()
returns trigger
language plpgsql
as $$
begin
  new.correo := lower(btrim(new.correo));
  return new;
end $$;

drop trigger if exists trg_normalizar_correo on public.invitaciones;
create trigger trg_normalizar_correo
  before insert or update of correo on public.invitaciones
  for each row execute function public.normalizar_correo_invitacion();

-- Una invitación viva por correo. Parcial, como en 0007: si se acepta,
-- se puede volver a invitar al mismo correo más adelante.
create unique index if not exists idx_invitacion_correo_viva
  on public.invitaciones(correo) where aceptada_en is null;


-- Al registrarse, aplicar la invitación que le tocara.
--
-- Va en AFTER INSERT y actualiza la fila, en vez de en BEFORE. Los
-- triggers BEFORE de profiles ya son cuatro y su orden es alfabético;
-- meter uno más ahí obligaría a razonar dónde encaja respecto al rol
-- forzado, la organización y el cupo. Actualizar después evita todo eso
-- al precio de una escritura más.
create or replace function public.aplicar_invitacion()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  inv public.invitaciones%rowtype;
  correo_usuario text;
begin
  select lower(btrim(email)) into correo_usuario
    from auth.users where id = new.id;
  if correo_usuario is null then
    return new;
  end if;

  select * into inv from public.invitaciones
   where correo = correo_usuario and aceptada_en is null
   order by creado_en desc limit 1;
  if not found then
    return new;
  end if;

  update public.profiles
     set role   = inv.rol,
         org_id = coalesce(inv.org_id, org_id)
   where id = new.id;

  if inv.coach_id is not null and inv.rol = 'cliente' then
    insert into public.coach_clientes(coach_id, cliente_id)
    values (inv.coach_id, new.id)
    on conflict do nothing;
  end if;

  update public.invitaciones
     set aceptada_en = now(), aceptada_por = new.id
   where id = inv.id;

  return new;
end $$;

drop trigger if exists ztrg_aplicar_invitacion on public.profiles;
create trigger ztrg_aplicar_invitacion
  after insert on public.profiles
  for each row execute function public.aplicar_invitacion();


-- Solo el super admin ve y crea invitaciones. Son correos de terceros:
-- que un entrenador cualquiera pudiera listarlos seria una fuga.
alter table public.invitaciones enable row level security;

drop policy if exists "invitaciones: solo super admin" on public.invitaciones;
create policy "invitaciones: solo super admin" on public.invitaciones
  for all using ( public.es_super_admin() ) with check ( public.es_super_admin() );

grant select, insert, update, delete on public.invitaciones to authenticated;


-- ---------------------------------------------------------------------
--  4. Acciones del panel
--
--  Mismo patrón que admin_activar() de la 0003: comprobar el rol en la
--  base, actuar, y dejarlo anotado. Se hace por función y no con un
--  UPDATE desde la app para que la bitácora recoja quién y cuándo.
-- ---------------------------------------------------------------------
create or replace function public.admin_ia(p_usuario uuid, p_habilitada boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede cambiar el acceso a la IA';
  end if;

  update public.profiles set ia_habilitada = p_habilitada where id = p_usuario;
  perform public.anotar(
    case when p_habilitada then 'ia_on' else 'ia_off' end, p_usuario, '{}'::jsonb);
end $$;

create or replace function public.admin_estado(p_usuario uuid, p_estado public.estado_cliente)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede cambiar el estado de una cuenta';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes suspenderte a ti mismo';
  end if;

  -- Suspender apaga el acceso solo (lo hace trg_sincronizar_estado de la
  -- 0007). Reactivar NO lo enciende: eso es deliberado allí, así que hay
  -- que encenderlo aquí a mano o la cuenta quedaría 'activa' pero sin
  -- poder entrar, que es la peor combinación posible.
  update public.profiles
     set estado = p_estado,
         activo = case when p_estado = 'activo' then true else activo end,
         desactivado_en  = case when p_estado = 'activo' then null else desactivado_en end,
         desactivado_por = case when p_estado = 'activo' then null else desactivado_por end
   where id = p_usuario;

  perform public.anotar('estado', p_usuario, jsonb_build_object('estado', p_estado));
end $$;

revoke execute on function public.admin_ia(uuid, boolean)                      from public;
revoke execute on function public.admin_estado(uuid, public.estado_cliente)    from public;
grant  execute on function public.admin_ia(uuid, boolean)                      to authenticated;
grant  execute on function public.admin_estado(uuid, public.estado_cliente)    to authenticated;


-- La búsqueda del panel necesita los campos nuevos para poder pintarlos.
-- Se redefine entera porque cambia el `returns table`.
drop function if exists public.admin_buscar_usuarios(text, int);
create or replace function public.admin_buscar_usuarios(p_texto text default '', p_limite int default 50)
returns table (
  id uuid, nombre text, correo text, rol public.app_role, activo boolean,
  coach text, ultima_actividad date, creado_en timestamptz,
  ia_habilitada boolean, estado public.estado_cliente
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super_admin() then
    raise exception 'Solo el super admin puede buscar usuarios';
  end if;

  return query
  select p.id, p.full_name, u.email, p.role, p.activo,
         c.full_name as coach,
         greatest(
           (select max(d.entry_date) from public.diary_entries d where d.user_id = p.id),
           (select max(w.session_date) from public.workout_sessions w where w.user_id = p.id)
         ) as ultima_actividad,
         p.created_at,
         p.ia_habilitada, p.estado
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.coach_clientes cc on cc.cliente_id = p.id and cc.activo
    left join public.profiles c on c.id = cc.coach_id
   where p_texto = ''
      or p.full_name ilike '%' || p_texto || '%'
      or u.email    ilike '%' || p_texto || '%'
   order by p.created_at desc
   limit p_limite;
end $$;

revoke execute on function public.admin_buscar_usuarios(text, int) from public;
grant  execute on function public.admin_buscar_usuarios(text, int) to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Un usuario NO puede encenderse la IA (debe FALLAR):
--   update public.profiles set ia_habilitada = true where id = auth.uid();
--
-- Ni quitarse una suspensión (debe FALLAR):
--   update public.profiles set estado = 'activo' where id = auth.uid();
--
-- La tabla de invitaciones no debe quedarse sin RLS (debe dar true):
--   select relrowsecurity from pg_class where relname = 'invitaciones';

-- Poder apagarle la IA a cada persona, pieza por pieza.
--
--  POR QUE
--
--  La app no cobra: es para la familia de Eduardo. Cada respuesta de la IA
--  la paga el. Hasta ahora era todo o nada: o la IA estaba encendida para
--  todos, o para nadie.
--
--  Pero no todo cuesta igual, ni de lejos. Y lo importante es que lo que
--  MAS cuesta al mes no es lo que mas cuesta por uso:
--
--    * armar la SEMANA entera es lo mas caro de una sola vez -veinticuatro
--      mil tokens de salida y esfuerzo alto-, pero se hace una vez por
--      semana;
--    * apuntar comida con foto es barato por uso, pero se usa cinco veces
--      al dia todos los dias: sumado, es el gasto de verdad;
--    * el analisis de "como va" lo pide el entrenador a mano y se guarda,
--      asi que cuesta una vez por persona y no cada vez que se mira.
--
--  Por eso las llaves no son una por accion tecnica sino una por COSA QUE
--  SE APAGA, y cada una junta las acciones que van siempre juntas.
--
--  LAS SEIS LLAVES
--
--    foto         apuntar comida con foto        (accion `apuntar`)
--    chat         preguntarle a la app y avisos  (`chat`, `aviso`)
--    semanal      cierre del lunes y comparar fotos (`semana`, `fotos`)
--    plan_dia     armar el plan de un dia        (`plan`)
--    plan_semana  armar la semana entera         (`plan` con semana=true)
--    analisis     el resumen para el entrenador  (`cliente`)
--
--  TODO ENCENDIDO POR DEFECTO, y a proposito: quien ya usa la app no puede
--  despertarse un dia con la mitad apagada porque se anadio una tabla.
--  Sin fila = todo encendido. La fila solo existe si alguien apago algo.

create table if not exists public.ia_permisos (
  user_id      uuid primary key references auth.users(id) on delete cascade,

  foto         boolean not null default true,
  chat         boolean not null default true,
  semanal      boolean not null default true,
  plan_dia     boolean not null default true,
  plan_semana  boolean not null default true,
  analisis     boolean not null default true,

  -- Quien lo cambio y cuando. No es burocracia: si a alguien se le apaga la
  -- foto y no sabe por que, esto dice quien fue.
  cambiado_por uuid references auth.users(id) on delete set null,
  cambiado_en  timestamptz not null default now()
);

alter table public.ia_permisos enable row level security;

-- VER: uno mismo, y quien pueda verte.
--
-- Que uno mismo VEA sus llaves es necesario, no un extra: la app esconde el
-- boton de la foto cuando esta apagado, y para esconderlo tiene que saberlo.
-- Ensenar un boton que siempre contesta "no puedes" es peor que no tenerlo.
drop policy if exists "ia_permisos: ver" on public.ia_permisos;
create policy "ia_permisos: ver" on public.ia_permisos
  for select using ( user_id = auth.uid() or public.puede_ver(user_id) );

-- Y NO HAY POLITICA DE ESCRITURA. Ninguna, ni siquiera para uno mismo.
--
-- Esto es lo que sostiene todo: si una persona pudiera escribir su propia
-- fila, se volveria a encender lo que su entrenador apago y la llave no
-- valdria nada. Se cambia solo por `ia_permisos_guardar`, que comprueba que
-- quien llama sea su entrenador.
grant select on public.ia_permisos to authenticated;


-- ---------------------------------------------------------------------
--  Leer las llaves de alguien
-- ---------------------------------------------------------------------
--  Devuelve SIEMPRE las seis, aunque no haya fila. Sin esto, la app tendria
--  que saber que "no hay fila" significa "todo encendido" y esa regla
--  acabaria escrita en tres sitios distintos y mal en alguno.
create or replace function public.ia_permisos_ver(p_cliente uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not (p_cliente = auth.uid() or public.puede_ver(p_cliente)) then
    raise exception 'No puedes ver eso';
  end if;

  select jsonb_build_object(
           'foto', p.foto, 'chat', p.chat, 'semanal', p.semanal,
           'plan_dia', p.plan_dia, 'plan_semana', p.plan_semana,
           'analisis', p.analisis
         )
    into v
    from public.ia_permisos p
   where p.user_id = p_cliente;

  return coalesce(v, jsonb_build_object(
    'foto', true, 'chat', true, 'semanal', true,
    'plan_dia', true, 'plan_semana', true, 'analisis', true));
end $$;

revoke execute on function public.ia_permisos_ver(uuid) from public, anon;
grant  execute on function public.ia_permisos_ver(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  Cambiarlas
-- ---------------------------------------------------------------------
--  Se guardan LAS SEIS de golpe y no una a una, porque la pantalla tiene
--  atajos -"lo justo", "solo apuntar", "nada"- que mueven varias a la vez.
--  Guardando de una en una, tocar un atajo serian seis peticiones y una
--  pantalla que se va encendiendo a trozos.
create or replace function public.ia_permisos_guardar(p_cliente uuid, p_llaves jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
begin
  -- SOLO ENTRENADORES Y ADMINS. Esto decide lo que puede hacer otra
  -- persona; no es una preferencia propia.
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    raise exception 'No puedes cambiar eso';
  end if;

  -- Y solo sobre los suyos. La misma puerta que el resto de Plan: sin esto,
  -- un entrenador le apagaria la IA a los clientes de otro.
  if not public.puede_ver(p_cliente) then
    raise exception 'Esa persona no es cliente tuyo';
  end if;

  -- Lo que no venga en el jsonb se queda como estaba. Asi la pantalla puede
  -- mandar una sola llave al mover un interruptor, o las seis al tocar un
  -- atajo, sin dos funciones distintas.
  insert into public.ia_permisos as t (
    user_id, foto, chat, semanal, plan_dia, plan_semana, analisis,
    cambiado_por, cambiado_en)
  values (
    p_cliente,
    coalesce((p_llaves->>'foto')::boolean, true),
    coalesce((p_llaves->>'chat')::boolean, true),
    coalesce((p_llaves->>'semanal')::boolean, true),
    coalesce((p_llaves->>'plan_dia')::boolean, true),
    coalesce((p_llaves->>'plan_semana')::boolean, true),
    coalesce((p_llaves->>'analisis')::boolean, true),
    auth.uid(), now())
  on conflict (user_id) do update set
    foto        = coalesce((p_llaves->>'foto')::boolean,        t.foto),
    chat        = coalesce((p_llaves->>'chat')::boolean,        t.chat),
    semanal     = coalesce((p_llaves->>'semanal')::boolean,     t.semanal),
    plan_dia    = coalesce((p_llaves->>'plan_dia')::boolean,    t.plan_dia),
    plan_semana = coalesce((p_llaves->>'plan_semana')::boolean, t.plan_semana),
    analisis    = coalesce((p_llaves->>'analisis')::boolean,    t.analisis),
    cambiado_por = auth.uid(),
    cambiado_en  = now();

  select jsonb_build_object(
           'foto', p.foto, 'chat', p.chat, 'semanal', p.semanal,
           'plan_dia', p.plan_dia, 'plan_semana', p.plan_semana,
           'analisis', p.analisis
         )
    into v_out
    from public.ia_permisos p
   where p.user_id = p_cliente;

  return v_out;
end $$;

revoke execute on function public.ia_permisos_guardar(uuid, jsonb) from public, anon;
grant  execute on function public.ia_permisos_guardar(uuid, jsonb) to authenticated;


-- ---------------------------------------------------------------------
--  Y que la lista de Plan diga quien tiene algo apagado
-- ---------------------------------------------------------------------
--  Sin esto habria que pedir las llaves de cada persona por separado al
--  pintar la lista: con diez clientes, diez peticiones para pintar diez
--  renglones. Se anade `ia_apagadas` -cuantas de las seis estan apagadas-
--  a lo que ya devuelve `plan_lista`.
-- Hay que TIRARLA antes: anadir una columna cambia el tipo que devuelve, y
-- `create or replace` no puede con eso -«cannot change return type of
-- existing function»-. Anadirla AL FINAL y no en medio es lo que hace que
-- esto no rompa nada: la app la llama por RPC y recibe objetos con nombre,
-- asi que una columna de mas la ignora hasta que se actualice.
drop function if exists public.plan_lista();

create function public.plan_lista()
returns table (
  id uuid, nombre text, correo text, inscrito_en timestamptz, tiene_plan boolean,
  ia_apagadas int
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  -- Esta lista es de quien entrena. Devuelve vacio en vez de reventar: la
  -- app la pide en la misma carga para todos los roles.
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    return;
  end if;

  return query
  select p.id,
         p.full_name::text,
         u.email::text,
         i.inscrito_en,
         exists (select 1 from public.planes pl
                  where pl.user_id = p.id
                    and pl.activo
                    -- Aqui hace falta a mano: al ser security definer, el
                    -- RLS que lo filtra en el resto de la app no se aplica.
                    and pl.archivado_en is null) as tiene_plan,
         -- Cuantas de las seis llaves estan apagadas. Sin fila, cero.
         --
         -- Va aqui y no en una peticion por persona: con diez clientes,
         -- preguntar una a una serian diez peticiones para pintar diez
         -- renglones, y la lista se pintaria a trozos.
         coalesce(
           (case when k.foto        then 0 else 1 end) +
           (case when k.chat        then 0 else 1 end) +
           (case when k.semanal     then 0 else 1 end) +
           (case when k.plan_dia    then 0 else 1 end) +
           (case when k.plan_semana then 0 else 1 end) +
           (case when k.analisis    then 0 else 1 end), 0) as ia_apagadas
    from public.plan_inscritos i
    join public.profiles p on p.id = i.cliente_id
    join auth.users u on u.id = p.id
    left join public.ia_permisos k on k.user_id = p.id
   where i.baja_en is null
     and public.puede_ver(i.cliente_id)
   order by p.full_name;
end $$;

revoke execute on function public.plan_lista() from public, anon;
grant  execute on function public.plan_lista() to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Como entrenador, apagarle la semana a alguien suyo:
--   select public.ia_permisos_guardar('<id>', '{"plan_semana": false}');
--
-- Y que la lista lo cuente:
--   select nombre, ia_apagadas from public.plan_lista();
--
-- Como esa persona, intentando volver a encendersela (debe FALLAR):
--   select public.ia_permisos_guardar(auth.uid(), '{"plan_semana": true}');

-- ---------------------------------------------------------------------
--  Que el asistente escriba primero
--
--  Un entrenador te busca. Una app espera a que le abras. Esa es toda la
--  diferencia, y es lo que separa "una herramienta" de "alguien que me
--  lleva".
--
--  QUIEN DECIDE QUE
--
--  El motivo lo decide SQL, no el modelo. Preguntarle a una IA "¿merece
--  esta persona un mensaje?" cuesta dinero en cada revision, da respuestas
--  distintas el martes y el jueves, y no se puede probar. Aqui las
--  situaciones son cinco, estan escritas, y salen igual siempre.
--
--  El modelo solo pone las palabras. Eso es lo que hace bien.
--
--  POR QUE UNO SOLO Y CON PRIORIDAD
--
--  Si alguien lleva tres dias sin apuntar Y ademas se le estanco el peso,
--  mandarle dos mensajes es acoso. Sale el mas urgente y nada mas. El orden
--  del CASE es la prioridad, y esta pensado: primero lo que hace que alguien
--  vuelva, despues lo que le anima, al final lo que le corrige.
--
--  Y NUNCA DOS VECES POR LO MISMO
--
--  Un aviso por motivo cada siete dias. Sin eso, quien lleve dos semanas
--  sin aparecer recibiria el mismo "¿todo bien?" cada mañana, que es como
--  se consigue que alguien silencie una app para siempre.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'motivo_aviso') then
    create type public.motivo_aviso as enum (
      'ausente',        -- lleva dias sin apuntar y antes si apuntaba
      'racha',          -- siete dias seguidos apuntando
      'semana_buena',   -- cerro la semana cerca de su meta
      'estancado'       -- quiere bajar y el peso no se mueve
    );
    -- No hay 'progreso' (subir peso en los ejercicios) a proposito:
    -- calcularlo aqui obligaria a replicar en SQL la logica de volumen que
    -- ya vive en la app, y dos copias de una regla se separan. Cuando esa
    -- cuenta baje a la base, se anade el valor y su rama.
  end if;
end $$;

create table if not exists public.avisos_coach (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  motivo    public.motivo_aviso not null,
  -- Lo escribe el modelo. Corto a proposito: un parrafo no se lee.
  texto     text not null check (length(btrim(texto)) between 1 and 400),
  creado_en timestamptz not null default now(),
  visto_en  timestamptz
);

create index if not exists avisos_pendientes
  on public.avisos_coach (user_id, creado_en desc) where visto_en is null;
create index if not exists avisos_por_motivo
  on public.avisos_coach (user_id, motivo, creado_en desc);

alter table public.avisos_coach enable row level security;

drop policy if exists "avisos: ver" on public.avisos_coach;
create policy "avisos: ver" on public.avisos_coach
  for select using (public.puede_ver(user_id));
-- Marcarlo como visto es lo unico que hace la app. El texto lo escribe la
-- funcion de abajo, que comprueba el motivo antes de dejar guardar nada.
drop policy if exists "avisos: marcar visto" on public.avisos_coach;
create policy "avisos: marcar visto" on public.avisos_coach
  for update using (public.puede_editar_propio(user_id))
           with check (public.puede_editar_propio(user_id));

revoke all on public.avisos_coach from anon, authenticated;
grant select, update on public.avisos_coach to authenticated;


-- ---------------------------------------------------------------------
--  ¿Tengo algo que decirle a esta persona?
--
--  Devuelve el motivo mas urgente, o null. Todo lo que mira son fechas y
--  numeros que ya estan en la base: no cuesta un centimo llamarla.
-- ---------------------------------------------------------------------
create or replace function public.motivo_de_aviso(p_usuario uuid)
returns public.motivo_aviso
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_ultimo_diario  date;
  v_dias_con_datos int;
  v_dias_seguidos  int;
  v_objetivo       text;
  v_peso_viejo     numeric;
  v_peso_nuevo     numeric;
  v_dias_peso      int;
begin
  if not public.puede_ver(p_usuario) then
    return null;
  end if;

  select max(entry_date), count(distinct entry_date)
    into v_ultimo_diario, v_dias_con_datos
    from public.diary_entries where user_id = p_usuario;

  -- Sin historial no hay nada que decir. A alguien que acaba de entrar no
  -- se le echa de menos: se le deja empezar.
  if v_dias_con_datos < 3 then
    return null;
  end if;

  -- 1. AUSENTE. Lo primero, porque es lo unico que puede hacer que
  --    alguien vuelva. Tres dias: dos es un fin de semana.
  if v_ultimo_diario < current_date - 3 then
    return 'ausente';
  end if;

  -- 2. ESTANCADO. Quiere bajar, lleva dos semanas y el peso no se mueve.
  --    Va antes que los animos: es lo que de verdad necesita saber.
  select goal into v_objetivo from public.profiles where id = p_usuario;
  if v_objetivo = 'bajar' then
    select weight_kg, log_date into v_peso_nuevo, v_ultimo_diario
      from public.weight_logs where user_id = p_usuario
      order by log_date desc limit 1;
    select weight_kg into v_peso_viejo
      from public.weight_logs
     where user_id = p_usuario and log_date <= current_date - 14
     order by log_date desc limit 1;
    if v_peso_viejo is not null and v_peso_nuevo is not null
       and abs(v_peso_nuevo - v_peso_viejo) < 0.3 then
      return 'estancado';
    end if;
  end if;

  -- 3. RACHA. Siete dias seguidos apuntando.
  select count(*) into v_dias_seguidos
    from generate_series(current_date - 6, current_date, '1 day') d
   where exists (select 1 from public.diary_entries e
                  where e.user_id = p_usuario and e.entry_date = d::date);
  if v_dias_seguidos = 7 then
    return 'racha';
  end if;

  -- 4. SEMANA BUENA. Cinco de los ultimos siete dias apuntados. Es el
  --    ultimo porque es el mas prescindible: esta bien oirlo, pero nadie
  --    cambia su semana por ello.
  if v_dias_seguidos >= 5 then
    return 'semana_buena';
  end if;

  return null;
end $$;

revoke execute on function public.motivo_de_aviso(uuid) from public, anon;
grant  execute on function public.motivo_de_aviso(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  ¿Toca mandarlo, o ya se lo dije?
--
--  Un aviso por motivo cada siete dias. Separado de la deteccion para
--  poder probar las dos cosas por su cuenta.
-- ---------------------------------------------------------------------
create or replace function public.aviso_pendiente(p_usuario uuid)
returns public.motivo_aviso
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_motivo public.motivo_aviso;
begin
  v_motivo := public.motivo_de_aviso(p_usuario);
  if v_motivo is null then return null; end if;

  -- Ya hay uno sin leer: no se amontonan.
  if exists (select 1 from public.avisos_coach
              where user_id = p_usuario and visto_en is null) then
    return null;
  end if;

  if exists (select 1 from public.avisos_coach
              where user_id = p_usuario and motivo = v_motivo
                and creado_en > now() - interval '7 days') then
    return null;
  end if;

  return v_motivo;
end $$;

revoke execute on function public.aviso_pendiente(uuid) from public, anon;
grant  execute on function public.aviso_pendiente(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  Guardar el aviso ya escrito
--
--  Funcion y no INSERT directo: si la app pudiera insertar, cualquiera se
--  escribiria sus propios avisos. Aqui se vuelve a comprobar que el motivo
--  sea de verdad el que toca antes de dejar guardar nada.
-- ---------------------------------------------------------------------
create or replace function public.guardar_aviso(p_motivo public.motivo_aviso, p_texto text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_yo uuid := auth.uid();
  v_id bigint;
begin
  if v_yo is null then
    raise exception 'Necesitas sesion';
  end if;
  if public.aviso_pendiente(v_yo) is distinct from p_motivo then
    raise exception 'Ese aviso no toca ahora';
  end if;

  insert into public.avisos_coach (user_id, motivo, texto)
  values (v_yo, p_motivo, left(btrim(p_texto), 400))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.guardar_aviso(public.motivo_aviso, text) from public, anon;
grant  execute on function public.guardar_aviso(public.motivo_aviso, text) to authenticated;

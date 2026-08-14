-- Los avisos del entrenador miraban el dia equivocado.
--
--  EL FALLO, MEDIDO
--
--  Las tres funciones usaban `current_date`, que en Postgres va en UTC. Las
--  comidas, en cambio, se guardan con `entry_date` = la fecha del TELEFONO.
--
--  Desde las 18:00 de Mexico, para la base ya es mañana. Asi que la ventana
--  de siete dias incluia un dia que todavia no podia tener nada apuntado y
--  descartaba el mas antiguo que si lo tenia.
--
--  Medido en produccion el 13 de agosto de 2026 a las 19:39 hora de Mexico:
--
--    now() en UTC ................................. 2026-08-14 01:39
--    current_date (el que usaban las funciones) ... 2026-08-14
--    la fecha real en Mexico ...................... 2026-08-13
--    dias apuntados en [current_date-6, current_date] ... 6
--    dias apuntados en la ventana correcta ............. 7
--
--  Consecuencia: "racha" es IMPOSIBLE de conseguir si abres la app por la
--  tarde. Desde las 18:00 la ventana siempre incluye un dia vacio, asi que
--  nunca llega a 7 de 7, y sale "semana_buena" en su lugar. Encaja con los
--  datos: el unico aviso de racha salio un dia a las 14:56, cuando en UTC
--  todavia era el mismo dia.
--
--  "ausente" y "estancado" tambien se corrian un dia. Ahi duele menos
--  -esperar 4 dias en vez de 3-, pero es el mismo error.
--
--  EL ARREGLO
--
--  El telefono dice que dia es para el, igual que ya hace al guardar cada
--  comida. Es la unica fuente coherente: si el dato se escribe con la fecha
--  del telefono, tiene que leerse con la fecha del telefono.
--
--  Con un tope: si la fecha que manda se aleja mas de un dia de la del
--  servidor, se ignora. Un dia es todo el margen que necesita cualquier
--  zona horaria del mundo, y asi nadie se fabrica una racha mandando una
--  fecha inventada.
--
--  Se BORRAN y se recrean en vez de `create or replace`: añadir un
--  parametro no reemplaza la funcion, crea otra al lado, y la vieja -la que
--  tiene el fallo- seguiria ahi y seguiria siendo llamable.

-- El orden importa: guardar_aviso llama a aviso_pendiente, que llama a
-- motivo_de_aviso. Se sueltan de fuera hacia dentro.
drop function if exists public.guardar_aviso(public.motivo_aviso, text);
drop function if exists public.aviso_pendiente(uuid);
drop function if exists public.motivo_de_aviso(uuid);

-- ---------------------------------------------------------------------
--  El dia de esta persona, con tope de cordura
-- ---------------------------------------------------------------------
create or replace function public.dia_de_la_persona(p_hoy date)
returns date
language sql immutable
as $$
  select case
           when p_hoy is null then current_date
           when abs(p_hoy - current_date) > 1 then current_date
           else p_hoy
         end;
$$;

comment on function public.dia_de_la_persona(date) is
  'La fecha del telefono, si es creible. Mas de un dia de diferencia con el '
  'servidor no es una zona horaria: es un reloj mal puesto o alguien '
  'intentando fabricarse una racha.';

-- ---------------------------------------------------------------------
--  Que aviso toca, si es que toca alguno
-- ---------------------------------------------------------------------
create or replace function public.motivo_de_aviso(p_usuario uuid, p_hoy date default null)
returns public.motivo_aviso
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_hoy            date := public.dia_de_la_persona(p_hoy);
  v_ultimo_diario  date;
  v_dias_con_datos int;
  v_dias_seguidos  int;
  v_objetivo       text;
  v_peso_viejo     numeric;
  v_peso_nuevo     numeric;
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
  if v_ultimo_diario < v_hoy - 3 then
    return 'ausente';
  end if;

  -- 2. ESTANCADO. Quiere bajar, lleva dos semanas y el peso no se mueve.
  select goal into v_objetivo from public.profiles where id = p_usuario;
  if v_objetivo = 'bajar' then
    select weight_kg into v_peso_nuevo
      from public.weight_logs where user_id = p_usuario
      order by log_date desc limit 1;
    select weight_kg into v_peso_viejo
      from public.weight_logs
     where user_id = p_usuario and log_date <= v_hoy - 14
     order by log_date desc limit 1;
    if v_peso_viejo is not null and v_peso_nuevo is not null
       and abs(v_peso_nuevo - v_peso_viejo) < 0.3 then
      return 'estancado';
    end if;
  end if;

  -- 3. RACHA. Siete dias seguidos apuntando.
  select count(*) into v_dias_seguidos
    from generate_series(v_hoy - 6, v_hoy, '1 day') d
   where exists (select 1 from public.diary_entries e
                  where e.user_id = p_usuario and e.entry_date = d::date);
  if v_dias_seguidos = 7 then
    return 'racha';
  end if;

  -- 4. SEMANA BUENA. Cinco de los ultimos siete dias apuntados.
  if v_dias_seguidos >= 5 then
    return 'semana_buena';
  end if;

  return null;
end $$;

revoke execute on function public.motivo_de_aviso(uuid, date) from public, anon;
grant  execute on function public.motivo_de_aviso(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
--  Toca mandarlo, o ya se lo dije
-- ---------------------------------------------------------------------
create or replace function public.aviso_pendiente(p_usuario uuid, p_hoy date default null)
returns public.motivo_aviso
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_motivo public.motivo_aviso;
begin
  v_motivo := public.motivo_de_aviso(p_usuario, p_hoy);
  if v_motivo is null then return null; end if;

  -- Ya hay uno sin leer: no se amontonan.
  if exists (select 1 from public.avisos_coach
              where user_id = p_usuario and visto_en is null) then
    return null;
  end if;

  -- El mismo motivo, no antes de siete dias. Aqui SI se usa now(): es
  -- tiempo transcurrido de verdad, no "que dia es para esta persona".
  if exists (select 1 from public.avisos_coach
              where user_id = p_usuario and motivo = v_motivo
                and creado_en > now() - interval '7 days') then
    return null;
  end if;

  return v_motivo;
end $$;

revoke execute on function public.aviso_pendiente(uuid, date) from public, anon;
grant  execute on function public.aviso_pendiente(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
--  Guardar el aviso ya escrito
--
--  Funcion y no INSERT directo: si la app pudiera insertar, cualquiera se
--  escribiria sus propios avisos.
--
--  Lleva la MISMA fecha que la comprobacion de antes. Sin ella, el aviso se
--  pedia con la fecha del telefono y se guardaba comprobando con la del
--  servidor: las dos podian dar motivos distintos y el guardado fallaba con
--  "Ese aviso no toca ahora" despues de haber pagado la consulta de IA.
-- ---------------------------------------------------------------------
create or replace function public.guardar_aviso(
  p_motivo public.motivo_aviso, p_texto text, p_hoy date default null)
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
  if public.aviso_pendiente(v_yo, p_hoy) is distinct from p_motivo then
    raise exception 'Ese aviso no toca ahora';
  end if;

  insert into public.avisos_coach (user_id, motivo, texto)
  values (v_yo, p_motivo, left(btrim(p_texto), 400))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.guardar_aviso(public.motivo_aviso, text, date) from public, anon;
grant  execute on function public.guardar_aviso(public.motivo_aviso, text, date) to authenticated;

revoke execute on function public.dia_de_la_persona(date) from public, anon;
grant  execute on function public.dia_de_la_persona(date) to authenticated;

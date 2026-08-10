-- Paso 2 de 2: que el cierre de semana sea el aviso que sale al entrar.
--
--  Requiere la 0036 ejecutada antes (ahi se da de alta el valor del enum).
--
--  POR QUE VA EL PRIMERO DE TODOS LOS MOTIVOS
--  Si esa semana ademas hiciste racha, la racha puede esperar siete dias.
--  Las calorias con las que vas a comer los proximos siete dias, no.

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
  v_lunes          date;
  v_dias_semana    int;
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

  -- 0. CIERRE DE SEMANA. El primero: es lo unico de esta lista que cambia
  --    lo que va a comer los proximos siete dias.
  v_lunes := date_trunc('week', current_date)::date;   -- el lunes de HOY

  select count(distinct entry_date) into v_dias_semana
    from public.diary_entries
   where user_id = p_usuario
     and entry_date >= v_lunes - 7
     and entry_date <  v_lunes;

  -- Tres dias apuntados de la semana pasada. Con menos no hay semana que
  -- cerrar: sacar una tendencia de dos dias sueltos es inventarsela. Con
  -- menos de tres se calla, que es lo honesto.
  if v_dias_semana >= 3
     and not exists (
       select 1 from public.avisos_coach
        where user_id = p_usuario
          and motivo  = 'cierre_semana'
          -- Uno por semana. Se mira la fecha de creacion y no si se leyo:
          -- si ya se conto el cierre de ESTA semana, no se vuelve a contar
          -- aunque la persona lo haya marcado como visto.
          and creado_en >= v_lunes
     )
  then
    return 'cierre_semana';
  end if;

  -- 1. AUSENTE. Lo primero de los demas, porque es lo unico que puede hacer
  --    que alguien vuelva. Tres dias: dos es un fin de semana.
  if v_ultimo_diario < current_date - 3 then
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

  -- 4. SEMANA BUENA. Cinco de los ultimos siete dias apuntados.
  if v_dias_seguidos >= 5 then
    return 'semana_buena';
  end if;

  return null;
end $$;

-- Los permisos se conservan con `create or replace`, pero se repiten a
-- proposito: olvidarlos es como se abrio la puerta que cerro la 0035. Y los
-- tres roles van nombrados, porque `from public` no alcanza a `anon`.
revoke execute on function public.motivo_de_aviso(uuid) from public, anon, authenticated;
grant  execute on function public.motivo_de_aviso(uuid) to authenticated;

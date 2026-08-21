-- ---------------------------------------------------------------------
--  PEGAR ESTO EN EL EDITOR SQL DE SUPABASE
--
--  Es la migracion 0044. Se puede volver a ejecutar sin romper nada: va
--  con "create or replace".
--
--  Hace que `plan_metricas` devuelva tambien los seis ultimos cierres de
--  semana CON su ajuste de calorias y el motivo. Sin esto, la tarjeta de
--  «Ajustes de calorias» de la ficha nunca tiene datos que enseñar.
--
--  COMPROBAR DESPUES (como entrenador, sobre un cliente suyo):
--    select jsonb_pretty(public.plan_metricas('<id>') -> 'chequeos');
-- ---------------------------------------------------------------------


-- Que el entrenador vea QUE calorias se le cambiaron y POR QUE.
--
--  LO QUE YA HABIA
--
--  El cierre de semana lleva funcionando desde la 0024: cada persona
--  contesta como le fue -hambre, energia, sueño-, la IA decide si tocarle
--  las calorias de la semana que entra, y TODO queda guardado:
--
--      ajusto       ¿se le movieron las calorias?
--      cal_antes    con cuantas venia
--      cal_despues  con cuantas se queda
--      motivo       por que se hizo lo que se hizo
--
--  El `motivo` se guarda literalmente «para el historial, no para la
--  pantalla». Y ahi lleva desde entonces: guardado y sin que nadie lo lea.
--
--  LO QUE FALTABA
--
--  El entrenador nunca lo vio. La politica de la 0024 le deja leer los
--  chequeos —«el coach los VE, solo el dueño los EDITA»— pero
--  `plan_metricas` solo devolvia el ultimo hambre, energia, sueño y nota.
--  Los cuatro campos del ajuste no salian por ningun lado.
--
--  Asi que la app le cambiaba las calorias a alguien cada lunes, con un
--  motivo escrito, y su entrenador no tenia forma de enterarse. Se lo
--  encontraba comiendo distinto sin saber por que.
--
--  Ahora `plan_metricas` devuelve tambien los ultimos seis chequeos
--  enteros. Seis y no todos: es lo que cabe en una pantalla y mes y medio
--  es tiempo de sobra para ver una tendencia; el historial completo sigue
--  en la tabla para quien lo necesite.

create or replace function public.plan_metricas(p_cliente uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_perfil   public.profiles%rowtype;
  v_hoy      date := (now() at time zone 'America/Mexico_City')::date;
  v_meta_cal numeric;
  v_out      jsonb;
begin
  -- LA COMPROBACION QUE SOSTIENE TODO. Es security definer: sin esto,
  -- cualquiera leeria el peso y la comida de cualquiera con solo su id.
  if not public.puede_ver(p_cliente) then
    raise exception 'No puedes ver a esa persona';
  end if;

  select * into v_perfil from public.profiles where id = p_cliente;
  if not found then
    raise exception 'No existe esa persona';
  end if;

  v_meta_cal := v_perfil.goal_protein_g * 4
              + v_perfil.goal_carbs_g   * 4
              + v_perfil.goal_fat_g     * 9;

  select jsonb_build_object(

    'nombre',    coalesce(v_perfil.full_name, ''),
    'objetivo',  coalesce(v_perfil.goal, ''),
    'meta_cal',  round(v_meta_cal),
    'meta_p',    v_perfil.goal_protein_g,
    'meta_c',    v_perfil.goal_carbs_g,
    'meta_g',    v_perfil.goal_fat_g,
    'dias_entreno',  v_perfil.dias_entreno,
    'meta_cardio',   v_perfil.cardio_goal_min,

    -- ---- Peso y cintura ----
    -- El peso de un dia suelto no dice nada: la gente amanece con dos kilos
    -- de diferencia por agua y sal. Por eso van los dos extremos de cada
    -- ventana y no un solo numero.
    'peso', (
      select jsonb_build_object(
        'ultimo',      (select w.weight_kg from public.weight_logs w
                         where w.user_id = p_cliente
                         order by w.log_date desc limit 1),
        'ultimo_dia',  (select w.log_date  from public.weight_logs w
                         where w.user_id = p_cliente
                         order by w.log_date desc limit 1),
        'hace_7',      (select w.weight_kg from public.weight_logs w
                         where w.user_id = p_cliente
                           and w.log_date <= v_hoy - 7 order by w.log_date desc limit 1),
        'hace_30',     (select w.weight_kg from public.weight_logs w
                         where w.user_id = p_cliente
                           and w.log_date <= v_hoy - 30 order by w.log_date desc limit 1),
        'apuntes_30',  (select count(*) from public.weight_logs w
                         where w.user_id = p_cliente
                           and w.log_date > v_hoy - 30)
      )
    ),
    'cintura', (
      select jsonb_build_object('cm', w.cintura_cm, 'dia', w.log_date)
        from public.weight_logs w
       where w.user_id = p_cliente
         and w.cintura_cm is not null
       order by w.log_date desc limit 1
    ),

    -- ---- Adherencia: apuntar es la senal mas honesta que hay ----
    'diario', (
      select jsonb_build_object(
        'dias_7',   count(distinct d.entry_date) filter (where d.entry_date > v_hoy - 7),
        'dias_30',  count(distinct d.entry_date) filter (where d.entry_date > v_hoy - 30),
        'ultimo',   max(d.entry_date),
        -- Media por DIA APUNTADO, no por dia del calendario: dividir entre 7
        -- cuando solo apunto dos dias da una media falsa de la mitad.
        'cal_dia_7', (
          select round(avg(t.cal))
            from (select d2.entry_date, sum(d2.calories) as cal
                    from public.diary_entries d2
                   where d2.user_id = p_cliente
                     and d2.entry_date > v_hoy - 7
                   group by d2.entry_date) t
        ),
        'cal_dia_30', (
          select round(avg(t.cal))
            from (select d2.entry_date, sum(d2.calories) as cal
                    from public.diary_entries d2
                   where d2.user_id = p_cliente
                     and d2.entry_date > v_hoy - 30
                   group by d2.entry_date) t
        ),
        'prot_dia_7', (
          select round(avg(t.p))
            from (select d2.entry_date, sum(d2.protein_g) as p
                    from public.diary_entries d2
                   where d2.user_id = p_cliente
                     and d2.entry_date > v_hoy - 7
                   group by d2.entry_date) t
        )
      )
      from public.diary_entries d
     where d.user_id = p_cliente
    ),

    -- ---- Entrenamiento ----
    'entreno', (
      select jsonb_build_object(
        'sesiones_7',  count(*) filter (where s.session_date > v_hoy - 7),
        'sesiones_30', count(*) filter (where s.session_date > v_hoy - 30),
        'ultima',      max(s.session_date)
      )
      from public.workout_sessions s
     where s.user_id = p_cliente
    ),
    'cardio', (
      select jsonb_build_object(
        'min_7',  coalesce(sum(c.minutes) filter (where c.log_date > v_hoy - 7), 0),
        'min_30', coalesce(sum(c.minutes) filter (where c.log_date > v_hoy - 30), 0)
      )
      from public.cardio_logs c
     where c.user_id = p_cliente
    ),

    -- ---- Fotos ----
    -- Solo el RECUENTO. Ni rutas ni nada que permita mirarlas: esto lo lee
    -- un entrenador en una lista, y las fotos tienen su propio permiso.
    'fotos', (
      select jsonb_build_object(
        'semanas_completas_90', count(*) filter (where t.n >= 4),
        'ultima_semana',        max(t.week_key) filter (where t.n >= 4)
      )
      from (select f.week_key, count(*) as n
              from public.progress_photos f
             where f.user_id = p_cliente and f.archivado_en is null
               and f.taken_at > now() - interval '90 days'
             group by f.week_key) t
    ),

    -- ---- Como se siente, la ultima semana ----
    'chequeo', (
      select jsonb_build_object(
        'semana', q.semana, 'hambre', q.hambre,
        'energia', q.energia, 'sueno', q.sueno, 'nota', q.nota
      )
      from public.chequeos_semanales q
     where q.user_id = p_cliente
     order by q.semana desc limit 1
    ),

    -- ---- LOS CIERRES DE SEMANA, CON SUS AJUSTES ----
    -- Esto es lo nuevo. Cada lunes la app le puede cambiar las calorias, y
    -- hasta ahora el entrenador no tenia forma de enterarse: veia a alguien
    -- comiendo distinto sin saber por que ni desde cuando.
    --
    -- Van los seis ultimos y no solo el ultimo: un ajuste suelto no dice
    -- nada, y lo que un entrenador necesita ver es la secuencia -«le
    -- subimos dos semanas seguidas por hambre y siguio subiendo»-.
    'chequeos', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'semana',      x.semana,
                 'hambre',      x.hambre,
                 'energia',     x.energia,
                 'sueno',       x.sueno,
                 'nota',        x.nota,
                 'ajusto',      x.ajusto,
                 'motivo',      x.motivo,
                 'cal_antes',   x.cal_antes,
                 'cal_despues', x.cal_despues
               ) order by x.semana desc
             ), '[]'::jsonb)
        from (select q.semana, q.hambre, q.energia, q.sueno, q.nota,
                     q.ajusto, q.motivo, q.cal_antes, q.cal_despues
                from public.chequeos_semanales q
               where q.user_id = p_cliente
               order by q.semana desc
               limit 6) x
    ),

    -- ---- Su plan ----
    'plan', (
      select jsonb_build_object(
        'nombre',  pl.nombre,
        'comidas', jsonb_array_length(pl.comidas),
        'desde',   pl.created_at
      )
      from public.planes pl
     where pl.user_id = p_cliente and pl.activo and pl.archivado_en is null
     limit 1
    )
  ) into v_out;

  return v_out;
end $$;

revoke execute on function public.plan_metricas(uuid) from public, anon;
grant  execute on function public.plan_metricas(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  Comprobacion
-- ---------------------------------------------------------------------
-- Como entrenador, sobre un cliente suyo (debe traer `chequeos` con los
-- ajustes y su motivo):
--   select jsonb_pretty(public.plan_metricas('<id>') -> 'chequeos');

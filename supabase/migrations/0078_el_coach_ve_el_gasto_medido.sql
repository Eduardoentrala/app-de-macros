-- Al entrenador le faltaba lo que de verdad decide: el gasto medido.
--
-- La ficha ya enseña su peso, su cintura y su volumen. Pero lo que mueve
-- las calorías no es nada de eso: es el GASTO MEDIDO, el mantenimiento real
-- restado de lo que comió y de cómo se movió su peso durante semanas. Eso
-- se calcula en el teléfono de cada quien, con su diario de 60 días, y el
-- teléfono del entrenador no tiene el diario de ella. Así que la ficha no
-- lo tenía, y el análisis de la IA tampoco: le quedaba juzgar con la
-- fórmula de población, que es justo la que se sabe que falla en cada
-- persona concreta.
--
-- Lo que sí existe de otra persona son sus SEMANAS GUARDADAS. Cada cierre
-- deja una fila con lo que comió de media, su peso medio, cuántos días
-- apuntó y cuántas veces se pesó: exactamente las cuatro cosas que pide la
-- medición. Con eso en la mano, la app mide su gasto con el MISMO cálculo
-- que usa conmigo —`medirGasto`, una sola implementación— y su estimación
-- sale de la MISMA fórmula de Mifflin, pasándole su cuerpo en vez de leer
-- la pantalla de registro.
--
-- Por eso van también `peso`, `altura`, `edad` y `sexo`: no son adorno, son
-- las entradas del tope de cordura que decide si una medición se cree o se
-- descarta. Sin ellas habría que copiar la fórmula aquí, en SQL, y el día
-- que se corrija una las dos dirían cosas distintas.
--
-- Y `aprendido_cierre`: lo que el cierre del lunes fue aprendiendo de esa
-- persona. Lo escribe el modelo y lo leía solo el propio cierre; su
-- entrenador se encontraba decisiones tomadas sin saber sobre qué.
--
-- DIECISÉIS SEMANAS Y NO SESENTA. Esto viaja a la IA dentro del mismo
-- paquete, que se corta a 6.000 caracteres: cuatro meses son de sobra para
-- medir —la medición pondera por antigüedad y a las ocho semanas lo de
-- atrás ya pesa la mitad— y caben sin empujar nada fuera.
--
-- Va copiada entera de la 0077 con lo nuevo añadido, que es como se rehace
-- una función en Postgres en este repo: completa, nunca por trozos.

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

    -- ---- SU CUERPO, PARA EL TOPE DE CORDURA ----
    --  No es adorno: son las entradas de Mifflin-St Jeor, y de ahi sale la
    --  estimacion contra la que se compara el gasto medido para decidir si
    --  creerselo. La formula NO se calcula aqui a proposito: vive en un
    --  solo sitio de la app y la ficha la llama pasandole esto.
    'cuerpo', jsonb_build_object(
      'peso',   v_perfil.weight_kg,
      'altura', v_perfil.height_cm,
      'edad',   v_perfil.age,
      'sexo',   v_perfil.sexo
    ),

    -- ---- LO QUE EL CIERRE DEL LUNES APRENDIO DE ELLA ----
    --  Lo escribe el modelo cada semana y hasta ahora lo leia solo el
    --  propio cierre. Su entrenador se encontraba decisiones tomadas sobre
    --  esta persona sin saber con que.
    'aprendido', v_perfil.aprendido_cierre,

    -- ---- SUS SEMANAS, LAS QUE SIRVEN PARA MEDIR ----
    --  Las cuatro cosas que pide la medicion y nada mas: lo que comio de
    --  media, su peso medio, cuantos dias apunto y cuantas veces se peso.
    --  El filtro de cuales cuentan —cinco dias, dos pesajes— NO se hace
    --  aqui: lo hace la app, con las mismas reglas que usa para las mias.
    --  Duplicarlo seria tener dos definiciones de «semana completa».
    --
    --  Dieciseis, que son cuatro meses. La medicion pondera por antiguedad
    --  y a las ocho semanas lo de atras ya pesa la mitad, asi que mas no
    --  afina; y esto viaja a la IA en un paquete que se corta a 6.000
    --  caracteres.
    'semanas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'semana',         x.semana,
               'media_cal',      x.media_cal,
               'peso_medio',     x.peso_medio,
               'dias_apuntados', x.dias_apuntados,
               'dias_con_peso',  x.dias_con_peso
             ) order by x.semana), '[]'::jsonb)
        from (select q.semana, q.media_cal, q.peso_medio,
                     q.dias_apuntados, q.dias_con_peso
                from public.chequeos_semanales q
               where q.user_id = p_cliente
                 and q.media_cal is not null
                 and q.peso_medio is not null
               order by q.semana desc
               limit 16) x
    ),

    -- ---- Peso y cintura ----
    -- El peso de un dia suelto no dice nada: la gente amanece con dos kilos
    -- de diferencia por agua y sal. Antes aqui iban «el ultimo contra el de
    -- hace 7» y «contra el de hace 30», que son DOS DIAS SUELTOS y por tanto
    -- el mismo problema con otro nombre. Ahora va la serie entera y la recta
    -- la hace la app, con el mismo codigo que usa en las pantallas de esa
    -- persona.
    'peso', (
      select jsonb_build_object(
        'ultimo',      (select w.weight_kg from public.weight_logs w
                         where w.user_id = p_cliente
                         order by w.log_date desc limit 1),
        'ultimo_dia',  (select w.log_date  from public.weight_logs w
                         where w.user_id = p_cliente
                         order by w.log_date desc limit 1),
        'apuntes_30',  (select count(*) from public.weight_logs w
                         where w.user_id = p_cliente
                           and w.log_date > v_hoy - 30),
        -- NOVENTA DIAS. Suficiente para ver una tendencia de verdad y para
        -- dibujarla, y poco para que esto siga siendo una respuesta pequena:
        -- quien se pesa a diario manda noventa pares de numeros.
        'serie', (
          select coalesce(jsonb_agg(jsonb_build_object('d', w.log_date, 'kg', w.weight_kg)
                                    order by w.log_date), '[]'::jsonb)
            from public.weight_logs w
           where w.user_id = p_cliente
             and w.log_date > v_hoy - 90
             and w.weight_kg is not null
        )
      )
    ),
    'cintura', (
      select jsonb_build_object(
        'cm',  (select w.cintura_cm from public.weight_logs w
                 where w.user_id = p_cliente and w.cintura_cm is not null
                 order by w.log_date desc limit 1),
        'dia', (select w.log_date   from public.weight_logs w
                 where w.user_id = p_cliente and w.cintura_cm is not null
                 order by w.log_date desc limit 1),
        -- UN ANO, y no noventa dias como el peso: la cintura se mide cada
        -- quince dias, asi que noventa dias son seis puntos y con seis
        -- puntos no se ve nada. Un ano son veinticuatro, que siguen siendo
        -- menos que un mes de pesajes.
        'serie', (
          select coalesce(jsonb_agg(jsonb_build_object('d', w.log_date, 'cm', w.cintura_cm)
                                    order by w.log_date), '[]'::jsonb)
            from public.weight_logs w
           where w.user_id = p_cliente
             and w.cintura_cm is not null
             and w.log_date > v_hoy - 365
        )
      )
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

    -- ---- EL VOLUMEN, QUE NO ESTABA ----
    --
    --  «Subio, mantuvo o bajo» es la pregunta que no se podia contestar
    --  desde aqui. Cada ventana contra la de antes: los ultimos 7 dias
    --  contra los 7 anteriores, y los 30 contra los 30 anteriores.
    --
    --  VA EN SU PROPIA CONSULTA y limitada a 60 dias. La de arriba recorre
    --  las sesiones de siempre para sacar `ultima`, y abrirle a cada una el
    --  jsonb de sus series seria pagar un recorrido entero del historial por
    --  cuatro numeros de los ultimos dos meses.
    --
    --  Kilos y repeticiones sin peso SEPARADOS, como en la app. Quien pasa
    --  de press de banca a dominadas no se derrumbo un 98 %.
    'volumen', (
      select jsonb_build_object(
        'kg_7',       coalesce(sum(kg)     filter (where reciente), 0),
        'kg_7_antes', coalesce(sum(kg)     filter (where previa7),  0),
        'kg_30',      coalesce(sum(kg)     filter (where mes),      0),
        'kg_30_antes',coalesce(sum(kg)     filter (where mes_antes),0),
        'libres_7',       coalesce(sum(libres) filter (where reciente), 0),
        'libres_7_antes', coalesce(sum(libres) filter (where previa7),  0),
        'libres_30',      coalesce(sum(libres) filter (where mes),      0),
        'libres_30_antes',coalesce(sum(libres) filter (where mes_antes),0)
      )
      from (
        select (public.volumen_de_sesion(s.exercises, s.total_volume)->>'kg')::numeric     as kg,
               (public.volumen_de_sesion(s.exercises, s.total_volume)->>'libres')::numeric as libres,
               s.session_date >  v_hoy - 7                                 as reciente,
               s.session_date <= v_hoy - 7  and s.session_date > v_hoy - 14 as previa7,
               s.session_date >  v_hoy - 30                                as mes,
               s.session_date <= v_hoy - 30 and s.session_date > v_hoy - 60 as mes_antes
          from public.workout_sessions s
         where s.user_id = p_cliente
           and s.session_date > v_hoy - 60
      ) v
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
    -- ---- LOS AJUSTES A MANO ----
    -- Esto es lo nuevo. Los del cierre de semana ya salian arriba, en
    -- `chequeos`. Faltaban los que hace una persona, y sin ellos la ficha
    -- contaba media historia: se veian unas calorias que nadie habia
    -- decidido, porque quien las decidio fue el entrenador un miercoles.
    --
    -- Van juntos a proposito: unas calorias tienen UNA historia, no una de
    -- la maquina y otra de las personas que hay que juntar de cabeza.
    'ajustes_mano', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'cuando',      x.creado_en,
                 'cal_antes',   x.cal_antes,
                 'cal_despues', x.cal_despues,
                 'motivo',      x.motivo,
                 -- El nombre de quien lo hizo, no su id: esto lo lee una
                 -- persona en una lista, no un programa.
                 'quien',       coalesce(q.full_name, 'alguien')
               ) order by x.creado_en desc), '[]'::jsonb)
        from (select a.* from public.ajustes_calorias a
               where a.cliente_id = p_cliente
               order by a.creado_en desc limit 6) x
        left join public.profiles q on q.id = x.hecho_por
    ),

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


-- ======================================================================
--  PENDIENTE: 0047 — que el entrenador mueva las calorias
--
--  Pegar entero y ejecutar. Se puede correr dos veces sin romper nada.
--
--  Trae:
--    * la tabla ajustes_calorias (quien, cuando, de cuanto a cuanto, por que)
--    * ajustar_calorias()        mover los tres macros y dejarlo escrito
--    * calorias_movidas_a_mano() para que el cierre del lunes no lo deshaga
--    * plan_metricas()           rehecha, ahora devuelve ajustes_mano
--
--  DESPLEGAR TAMBIEN LA FUNCION DEL ASISTENTE: el cierre de los lunes
--  consulta calorias_movidas_a_mano(). Sin la migracion, esa consulta falla
--  y el cierre se comporta como siempre; sin la funcion nueva, la migracion
--  no hace dano. Los dos ordenes son seguros.
-- ======================================================================

-- Que el entrenador pueda mover las calorias de alguien, semana a semana.
--
--  LO QUE HABIA
--
--  Las calorias de una persona viven en tres columnas de su perfil
--  -`goal_protein_g`, `goal_carbs_g`, `goal_fat_g`- y las calorias son lo
--  que sale de ellas: P*4 + C*4 + G*9. Se movian de dos formas:
--
--    1. la persona, recalculando sus macros en su propia pantalla;
--    2. la IA, cada lunes, en el cierre de semana.
--
--  Su entrenador NO podia. La politica de `profiles` dice
--  `puede_editar_propio(id)`: un coach ve el perfil de sus clientes pero no
--  lo escribe. Podia mirar la grafica de peso, leer el chequeo, decidir que
--  hacian falta doscientas calorias menos... y no tenia como ponerlas.
--
--  POR QUE UNA FUNCION Y NO ABRIR LA POLITICA
--
--  Abrir el UPDATE de `profiles` a los entrenadores les daria tambien el
--  nombre, el correo, el rol, el nivel de IA y todo lo demas. Aqui hace
--  falta una cosa muy concreta: tres numeros. Una funcion con permisos
--  propios deja mover esos tres y nada mas.
--
--  LA PROTEINA NO SE MUEVE
--
--  Y esto es lo unico discutible del archivo, asi que va escrito.
--
--  El ajuste automatico de los lunes escala los tres macros a la vez: si
--  baja un 10% las calorias, baja un 10% la proteina. Eso es lo que NO se
--  quiere al hacer un deficit: la proteina se calcula por el peso de la
--  persona, no por lo que come; bajarla mientras se recorta es justo como
--  se pierde musculo en vez de grasa.
--
--  Asi que el ajuste a mano sostiene la proteina y reparte la diferencia
--  entre carbohidratos y grasas. Los dos caminos se comportan distinto a
--  proposito, y el automatico se deja como estaba porque cambiarlo de
--  paso movia las calorias de gente que no habia pedido nada.
--
--  Con un suelo para la grasa: por debajo del 20% de las calorias empieza a
--  ser un problema hormonal, no una dieta agresiva.

create table if not exists public.ajustes_calorias (
  id          bigint generated always as identity primary key,
  cliente_id  uuid not null references auth.users(id) on delete cascade,
  hecho_por   uuid references auth.users(id) on delete set null,

  -- Los seis numeros, antes y despues. No solo las calorias: sin los macros
  -- no se puede saber DE DONDE salieron esas doscientas menos, ni deshacerlo.
  cal_antes   integer, p_antes integer, c_antes integer, g_antes integer,
  cal_despues integer not null,
  p_despues   integer not null, c_despues integer not null, g_despues integer not null,

  -- POR QUE. Es la mitad del valor de esto: dentro de un mes, «le baje 200»
  -- no dice nada y «le baje 200 porque llevaba tres semanas sin bajar de
  -- peso apuntando todo» lo dice todo.
  motivo      text,

  creado_en   timestamptz not null default now()
);

create index if not exists idx_ajustes_cal_cliente
  on public.ajustes_calorias (cliente_id, creado_en desc);

alter table public.ajustes_calorias enable row level security;

-- VER: la persona y quien pueda verla. Que ella lo vea es a proposito: son
-- SUS calorias, y enterarse de que le cambiaron la comida sin saber quien ni
-- por que es la forma mas rapida de dejar de fiarse de la app.
drop policy if exists "ajustes_calorias: ver" on public.ajustes_calorias;
create policy "ajustes_calorias: ver" on public.ajustes_calorias
  for select using ( cliente_id = auth.uid() or public.puede_ver(cliente_id) );

-- Sin politica de escritura: solo por `ajustar_calorias`.
grant select on public.ajustes_calorias to authenticated;


-- ---------------------------------------------------------------------
--  Mover las calorias
-- ---------------------------------------------------------------------
create or replace function public.ajustar_calorias(
  p_cliente uuid, p_calorias int, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v         public.profiles%rowtype;
  v_cal_ant numeric;
  v_p int; v_c int; v_g int;
  v_resto   numeric;    -- calorias que quedan tras pagar la proteina
  v_gcal    numeric;    -- las que se lleva la grasa
  v_rat     numeric;    -- que parte de lo no-proteico era grasa antes
begin
  if not (public.es_super_admin() or public.mi_rol() in ('coach', 'org_admin')) then
    raise exception 'No puedes cambiarle las calorias a nadie';
  end if;

  -- La misma puerta que el resto de Plan. Es security definer: sin esto, un
  -- entrenador le cambiaria la comida a los clientes de otro.
  if not public.puede_ver(p_cliente) then
    raise exception 'Esa persona no es cliente tuyo';
  end if;

  select * into v from public.profiles where id = p_cliente;
  if not found then raise exception 'No existe esa persona'; end if;

  if v.goal_protein_g is null or v.goal_protein_g <= 0 then
    raise exception 'Esa persona todavia no tiene sus macros calculados';
  end if;

  -- Los mismos limites que el plan. Fuera de aqui no es una decision
  -- agresiva: es un dedo que resbalo en el teclado.
  if p_calorias < 800 or p_calorias > 6000 then
    raise exception 'Esas calorias no tienen sentido (800 a 6000)';
  end if;

  v_cal_ant := v.goal_protein_g * 4 + v.goal_carbs_g * 4 + v.goal_fat_g * 9;

  -- 1. La proteina se queda como esta. Ver la nota de arriba.
  v_p := v.goal_protein_g;

  -- Salvo que no quepa: con muy pocas calorias, la proteina sola se las
  -- comeria todas y no quedaria nada para lo demas. Se le deja el 40% como
  -- mucho, que ya es una dieta muy proteica.
  if v_p * 4 > p_calorias * 0.40 then
    v_p := floor(p_calorias * 0.40 / 4);
  end if;

  v_resto := p_calorias - v_p * 4;

  -- 2. La grasa mantiene la proporcion que tenia dentro de lo no-proteico,
  --    para que el reparto se parezca a lo que esa persona ya venia
  --    comiendo y no a una plantilla.
  v_rat := case
             when (v.goal_carbs_g * 4 + v.goal_fat_g * 9) > 0
               then (v.goal_fat_g * 9)::numeric / (v.goal_carbs_g * 4 + v.goal_fat_g * 9)
             else 0.35
           end;
  v_gcal := v_resto * v_rat;

  -- 3. Y el suelo y el techo de la grasa, sobre las calorias TOTALES.
  --    Por debajo del 20% deja de ser una dieta y empieza a ser un problema.
  if v_gcal < p_calorias * 0.20 then v_gcal := p_calorias * 0.20; end if;
  if v_gcal > p_calorias * 0.45 then v_gcal := p_calorias * 0.45; end if;
  if v_gcal > v_resto           then v_gcal := v_resto;           end if;

  v_g := round(v_gcal / 9);
  if v_g > 400 then v_g := 400; end if;

  v_c := round((v_resto - v_g * 9) / 4);
  if v_c < 0 then v_c := 0; end if;

  -- 4. Y los topes de las propias columnas del perfil: 0-600 de proteina,
  --    0-900 de carbos, 0-400 de grasa, que estan puestos desde la 0001.
  --
  --    SIN ESTO REVIENTA. Con 6000 calorias y alguien que venia comiendo
  --    poca grasa, el reparto pide 1071 g de carbos, el `update` choca con
  --    `profiles_goal_carbs_g_check` y a quien pulso le sale un error de
  --    Postgres en crudo. Lo encontro la prueba que compara este reparto con
  --    el de la pantalla, probando las dos puntas del rango.
  --
  --    Lo que no cabe en carbos se pasa a la grasa en vez de perderse: si no,
  --    pedir 6000 dejaria 5300 sin decir por que.
  if v_c > 900 then
    v_g := least(400, v_g + floor((v_c - 900) * 4.0 / 9));
    v_c := 900;
  end if;

  update public.profiles
     set goal_protein_g = v_p, goal_carbs_g = v_c, goal_fat_g = v_g
   where id = p_cliente;

  insert into public.ajustes_calorias (
    cliente_id, hecho_por,
    cal_antes, p_antes, c_antes, g_antes,
    cal_despues, p_despues, c_despues, g_despues, motivo)
  values (
    p_cliente, auth.uid(),
    round(v_cal_ant), v.goal_protein_g, v.goal_carbs_g, v.goal_fat_g,
    round(v_p * 4 + v_c * 4 + v_g * 9), v_p, v_c, v_g,
    nullif(btrim(coalesce(p_motivo, '')), ''));

  -- Se devuelve lo que quedo de verdad, no lo que se pidio: el redondeo de
  -- los gramos mueve las calorias unas pocas arriba o abajo, y la pantalla
  -- tiene que ensenar el numero real y no el deseado.
  return jsonb_build_object(
    'cal', round(v_p * 4 + v_c * 4 + v_g * 9),
    'p', v_p, 'c', v_c, 'g', v_g,
    'cal_antes', round(v_cal_ant));
end $$;

revoke execute on function public.ajustar_calorias(uuid, int, text) from public, anon;
grant  execute on function public.ajustar_calorias(uuid, int, text) to authenticated;


-- ---------------------------------------------------------------------
--  ¿Se las movio una persona hace poco?
-- ---------------------------------------------------------------------
--  Esto es lo que impide que las dos manos se peleen.
--
--  Si el entrenador le baja 200 calorias el miercoles y el lunes siguiente
--  la IA se las vuelve a mover, la decision del entrenador dura cinco dias y
--  nadie se entera de que se deshizo. Peor: el lunes la IA compara contra
--  unas calorias que ella misma no puso.
--
--  Siete dias y no «esta semana natural»: cada persona puede tener su semana
--  empezando en un dia distinto, y «hace menos de siete dias» significa lo
--  mismo para todas.
create or replace function public.calorias_movidas_a_mano(p_cliente uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if not (p_cliente = auth.uid() or public.puede_ver(p_cliente)) then
    raise exception 'No puedes ver eso';
  end if;

  select jsonb_build_object(
           'cuando', a.creado_en, 'cal_antes', a.cal_antes,
           'cal_despues', a.cal_despues, 'motivo', a.motivo)
    into v
    from public.ajustes_calorias a
   where a.cliente_id = p_cliente
     and a.creado_en > now() - interval '7 days'
   order by a.creado_en desc limit 1;

  return v;   -- null si nadie las ha tocado a mano
end $$;

revoke execute on function public.calorias_movidas_a_mano(uuid) from public, anon;
grant  execute on function public.calorias_movidas_a_mano(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  Y que salgan en la ficha, junto a los ajustes de la IA
-- ---------------------------------------------------------------------
--  `plan_metricas` ya devolvia los seis ultimos chequeos con sus ajustes
--  automaticos. Ahora devuelve tambien los que se hicieron a mano.
--
--  Va copiada entera de la 0044 con la clave nueva anadida, que es como se
--  ha ido rehaciendo siempre en este repo: una funcion en Postgres se
--  reemplaza completa, no por trozos. La version buena es la ultima.
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


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Como entrenador, sobre un cliente suyo:
--   select public.ajustar_calorias('<id>', 1800, 'tres semanas sin bajar');
--
-- Y que la proteina NO se haya movido:
--   select goal_protein_g, goal_carbs_g, goal_fat_g from public.profiles
--    where id = '<id>';
--
-- Como esa persona, intentando cambiarselas (debe FALLAR):
--   select public.ajustar_calorias(auth.uid(), 3000, 'quiero comer mas');

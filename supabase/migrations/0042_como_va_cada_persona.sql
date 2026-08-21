-- Que el entrenador vea de un vistazo como va cada persona.
--
--  QUE RESUELVE
--
--  Hoy, para saber como va alguien, el entrenador tiene que abrirle el plan
--  y adivinar. No hay ningun sitio donde se vea si esta apuntando, si el
--  peso se mueve, si entrena o si subio sus fotos. Con dos clientes se lleva
--  en la cabeza; con veinte, no.
--
--  Aqui van las dos piezas de servidor:
--
--   1. `plan_metricas(cliente)` — todos sus numeros en una sola llamada.
--   2. `analisis_cliente` — donde se guarda lo que escribe la IA sobre eso.
--
--  POR QUE UNA FUNCION Y NO QUE LA APP PIDA LAS TABLAS
--
--  Son siete tablas y unos cuantos calculos por ventanas de 7 y 30 dias.
--  Hacerlo desde la app serian siete viajes por cliente y la misma
--  aritmetica repetida en JavaScript. Y sobre todo: la app tendria que
--  traerse el diario ENTERO de otra persona para contar dias, cuando lo
--  unico que necesita es el numero.
--
--  Va como SECURITY DEFINER pero con `puede_ver` dentro, que es la misma
--  regla que usa el RLS. Sin esa comprobacion seria una fuga: cualquiera
--  podria pedir las metricas de cualquiera sabiendo su id.

-- ---------------------------------------------------------------------
--  1. Las metricas, en una sola llamada
-- ---------------------------------------------------------------------
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
    -- Quien deja de apuntar suele haber dejado el plan una semana antes. Es
    -- lo primero que un entrenador quiere ver.
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
    -- Solo se cuenta CUANTAS hay y de que semana. Ni rutas ni nada que
    -- permita mirarlas: esto lo lee un entrenador en una lista, y las fotos
    -- tienen su propio permiso.
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

    -- ---- Como se siente ----
    'chequeo', (
      select jsonb_build_object(
        'semana', q.semana, 'hambre', q.hambre,
        'energia', q.energia, 'sueno', q.sueno, 'nota', q.nota
      )
      from public.chequeos_semanales q
     where q.user_id = p_cliente
     order by q.semana desc limit 1
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
--  2. Lo que la IA escribe sobre esa persona
-- ---------------------------------------------------------------------
--  Se guarda para no volver a pagarlo. Un analisis cuesta una consulta del
--  tope diario del entrenador, y con veinte clientes abrir la ficha de cada
--  uno se comeria el tope entero antes de terminar la lista.
--
--  Uno por cliente: al pedirlo otra vez se pisa el anterior. No es
--  historial —para eso estan los numeros, que si se guardan enteros— sino
--  "lo ultimo que se penso de esta persona".
create table if not exists public.analisis_cliente (
  cliente_id  uuid primary key references auth.users(id) on delete cascade,

  -- Quien lo pidio. Sirve para saber a quien se le cobro la consulta y,
  -- sobre todo, para no enseñarle a un entrenador el analisis que escribio
  -- otro sobre la misma persona.
  pedido_por  uuid not null references auth.users(id) on delete cascade,

  mensaje     text not null check (length(mensaje) <= 4000),

  -- Los numeros con los que se escribio, tal cual. Sin esto, dentro de dos
  -- semanas el texto dice "va bajando bien" y no hay forma de saber de que
  -- cifras hablaba.
  datos       jsonb not null default '{}'::jsonb,

  creado_en   timestamptz not null default now()
);

alter table public.analisis_cliente enable row level security;

-- Lo ve quien puede ver a esa persona: su entrenador y el super admin.
--
-- EL CLIENTE NO. Es lo unico de la app que se escribe SOBRE alguien y no
-- PARA alguien: son notas de trabajo del entrenador, con el tono que se usa
-- entre profesionales -"lleva tres semanas sin apuntar, probablemente
-- abandono"-. Enseñarselo al cliente cambiaria lo que la IA puede decir.
drop policy if exists "analisis_cliente: ver" on public.analisis_cliente;
create policy "analisis_cliente: ver" on public.analisis_cliente
  for select using (
    cliente_id <> auth.uid() and public.puede_ver(cliente_id)
  );

drop policy if exists "analisis_cliente: escribir" on public.analisis_cliente;
create policy "analisis_cliente: escribir" on public.analisis_cliente
  for insert with check (
    cliente_id <> auth.uid() and public.puede_ver(cliente_id) and pedido_por = auth.uid()
  );

drop policy if exists "analisis_cliente: actualizar" on public.analisis_cliente;
create policy "analisis_cliente: actualizar" on public.analisis_cliente
  for update using ( cliente_id <> auth.uid() and public.puede_ver(cliente_id) )
             with check ( cliente_id <> auth.uid() and public.puede_ver(cliente_id) );

grant select, insert, update on public.analisis_cliente to authenticated;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Como coach, sobre un cliente suyo (debe devolver el JSON):
--   select public.plan_metricas('<id-del-cliente>');
--
-- Sobre alguien que no es suyo (debe FALLAR):
--   select public.plan_metricas('<id-ajeno>');

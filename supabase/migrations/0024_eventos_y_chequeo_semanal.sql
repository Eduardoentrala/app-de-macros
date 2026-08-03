-- ---------------------------------------------------------------------
--  Eventos y chequeo semanal
--
--  Dos cosas que la app no sabia hacer y que son la misma idea: dejar de
--  tratar la semana como siete dias iguales.
--
--  EVENTOS. Una boda, una cena fuera, un asado. Hoy la persona llega al
--  sabado, se pasa 1.500 calorias y la app le dice que fallo. Pero no fallo:
--  iba a una boda y lo sabia desde el martes. Guardar el evento antes
--  permite repartir esas calorias por los dias de ANTES, que es lo que hace
--  cualquiera que sepa comer.
--
--  No hay lista de tipos de evento, y es a proposito. Una tabla de 'boda',
--  'cumpleanos', 'asado' obliga a mantenerla y siempre le falta el caso de
--  alguien. El titulo es texto libre porque la persona lo escribe con sus
--  palabras y quien lo interpreta es el asistente.
--
--  CHEQUEO. Antes de moverle las calorias a alguien hay que saber como
--  esta. El peso solo no lo dice: bajar 800 g pasando hambre y sin energia
--  no es lo mismo que bajarlos comodo. Sin estos tres numeros, subir o
--  bajar calorias es adivinar.
--
--  El chequeo tambien guarda la DECISION que se tomo con el, incluida la de
--  no tocar nada. Eso importa: si a alguien no se le ajustan las calorias
--  tres semanas seguidas por falta de registros, esa historia tiene que
--  poder leerse en algun sitio.
-- ---------------------------------------------------------------------

-- Que se prioriza cuando no cabe todo. En una boda casi nadie quiere las
-- dos cosas: o se come o se bebe.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'prioridad_evento') then
    create type public.prioridad_evento as enum ('comida', 'bebida', 'ambas');
  end if;
end $$;

create table if not exists public.eventos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,

  fecha       date not null,
  -- Texto libre: lo escribe la persona y lo lee el asistente.
  titulo      text not null check (length(btrim(titulo)) between 1 and 120),

  -- Cuanto se aparta para ese dia, POR ENCIMA de su meta normal. El tope de
  -- 4.000 no es un juicio moral: por encima de ahi la semana no puede
  -- absorberlo sin dejar dias por debajo del minimo seguro, y entonces el
  -- reparto deja de ser sano y pasa a ser un ayuno con otro nombre.
  calorias    integer not null default 0 check (calorias between 0 and 4000),
  -- Se cuentan aparte porque el alcohol no se administra como la comida:
  -- son 7 cal/g que no alimentan y que ademas frenan la quema de grasa esa
  -- noche. Saber cuantas van cambia el consejo, no solo la suma.
  bebidas     integer not null default 0 check (bebidas between 0 and 30),
  prioridad   public.prioridad_evento not null default 'ambas',

  creado_en   timestamptz not null default now(),
  -- Se cancela, no se borra: si alguien apunta una boda, se le reparte la
  -- semana y luego la quita, hay que poder explicar por que sus calorias
  -- del miercoles fueron las que fueron.
  cancelado_en timestamptz
);

create index if not exists eventos_persona_fecha
  on public.eventos (user_id, fecha desc) where cancelado_en is null;

-- Un evento por dia y persona. Dos cenas el mismo viernes son una cena con
-- mas calorias; permitir dos filas solo sirve para sumar dos veces.
create unique index if not exists eventos_uno_por_dia
  on public.eventos (user_id, fecha) where cancelado_en is null;


create table if not exists public.chequeos_semanales (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  -- El lunes de la semana a la que se refiere.
  semana    date not null,

  -- Del 1 al 5, y el 3 es "normal". Tres preguntas y no diez: un
  -- cuestionario largo se contesta en diagonal y entonces no mide nada.
  hambre    smallint check (hambre  is null or hambre  between 1 and 5),
  energia   smallint check (energia is null or energia between 1 and 5),
  apetito   smallint check (apetito is null or apetito between 1 and 5),
  nota      text check (nota is null or length(nota) <= 300),

  -- La decision que se tomo con esto, incluida la de no tocar nada.
  ajusto      boolean not null default false,
  motivo      text check (motivo is null or length(motivo) <= 500),
  cal_antes   integer check (cal_antes   is null or cal_antes   between 800 and 8000),
  cal_despues integer check (cal_despues is null or cal_despues between 800 and 8000),

  creado_en timestamptz not null default now(),

  -- Un chequeo por semana. El segundo actualiza al primero.
  unique (user_id, semana)
);

create index if not exists chequeos_persona_semana
  on public.chequeos_semanales (user_id, semana desc);


-- ---------------------------------------------------------------------
--  Quien ve que
--
--  Mismo trato que el resto de datos personales: el coach los VE, solo el
--  dueno los EDITA. Se escribe con las funciones que ya existen en la 0002
--  en vez de repetir la logica: si algun dia cambia lo que puede ver un
--  coach, cambia en un sitio.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['eventos', 'chequeos_semanales'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: ver" on public.%I', t, t);
    execute format('create policy "%s: ver" on public.%I for select using (public.puede_ver(user_id))', t, t);
    execute format('drop policy if exists "%s: insertar" on public.%I', t, t);
    execute format('create policy "%s: insertar" on public.%I for insert with check (public.puede_editar_propio(user_id))', t, t);
    execute format('drop policy if exists "%s: actualizar" on public.%I', t, t);
    execute format('create policy "%s: actualizar" on public.%I for update using (public.puede_editar_propio(user_id)) with check (public.puede_editar_propio(user_id))', t, t);
    execute format('drop policy if exists "%s: borrar" on public.%I', t, t);
    execute format('create policy "%s: borrar" on public.%I for delete using (public.puede_editar_propio(user_id))', t, t);
  end loop;
end $$;

grant select, insert, update, delete on public.eventos            to authenticated;
grant select, insert, update, delete on public.chequeos_semanales to authenticated;

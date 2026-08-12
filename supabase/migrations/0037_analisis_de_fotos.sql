-- Que la IA compare las fotos de progreso, una vez al mes.
--
--  POR QUE LAS FOTOS Y NO OTRA MEDIDA MAS
--
--  Cada medida que ya hay falla en algo distinto. La bascula no distingue
--  grasa de agua de musculo. La cintura si separa grasa, pero solo en un
--  punto del cuerpo. Las fotos enseñan DONDE esta cambiando, que es lo que
--  ninguna de las dos ve.
--
--  Importa en un caso concreto: peso plano, cintura plana, pero espalda y
--  hombros mas marcados. Eso es recomposicion -gano musculo y perdio grasa
--  a la vez- y las otras dos medidas dirian "estancado" cuando va bien. Es
--  justo el momento en que la gente abandona por leer mal sus datos.
--
--  EL CONSENTIMIENTO NO ES UN FORMALISMO
--
--  Hasta hoy las fotos NUNCA salen de aqui: el bucket es privado y la app
--  las mira con URLs firmadas. Analizarlas las manda a Anthropic, y eso es
--  una cosa distinta de mandar numeros.
--
--  Fotos de cuerpo de una persona identificable son datos personales
--  sensibles bajo la LFPDPPP, y esa ley pide consentimiento EXPRESO. Por
--  eso `fotos_ia_ok` arranca en NULL y no en `true`: null es "todavia no se
--  le ha preguntado", false es "dijo que no". Un `default true` convertiria
--  a todo el que ya subio fotos en alguien que consintio sin que se lo
--  preguntaran, que es exactamente lo que la ley prohibe.
--
--  Quien diga que no sigue subiendo fotos y viendolas. Solo no se analizan.

-- ---------------------------------------------------------------------
--  1. El permiso, por persona
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists fotos_ia_ok boolean;

comment on column public.profiles.fotos_ia_ok is
  'Si acepto que la IA analice sus fotos de progreso. NULL = todavia no se '
  'le ha preguntado; false = dijo que no. Nunca se rellena solo: solo lo '
  'escribe la persona desde la pantalla que explica que se manda y adonde.';

-- Cuando lo dijo. Sin esto no hay forma de demostrar que se pregunto antes
-- de mandar nada, que es justo lo que habria que enseñar si alguien lo
-- reclama.
alter table public.profiles
  add column if not exists fotos_ia_fecha timestamptz;

-- ---------------------------------------------------------------------
--  2. El analisis guardado
-- ---------------------------------------------------------------------
--  Se guarda el TEXTO, nunca las imagenes ni nada derivado de ellas que
--  pueda reconstruirlas. Al sexto mes, poder leer "que se veia en agosto"
--  vale mas que el analisis de este mes: es la unica forma de que alguien
--  vea de verdad cuanto lleva andado.
create table if not exists public.analisis_fotos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- El mes al que corresponde, como 'AAAA-MM'. Uno por mes y persona: si se
  -- vuelve a pedir el mismo mes se pisa, no se acumula.
  mes           text not null check (mes ~ '^\d{4}-\d{2}$'),

  -- Las dos series que se compararon, en claves de semana ISO. Sirven para
  -- saber DE QUE habla el texto, y para no repetir la misma comparacion.
  semana_nueva  text not null check (semana_nueva ~ '^\d{4}-W\d{2}$'),
  semana_vieja  text not null check (semana_vieja ~ '^\d{4}-W\d{2}$'),
  -- Y contra la primera serie de todas, si habia. Mes a mes casi nunca se
  -- nota nada, y es donde se abandona; contra el punto de partida si.
  semana_base   text check (semana_base is null or semana_base ~ '^\d{4}-W\d{2}$'),

  -- Lo que la IA vio A CIEGAS, sin conocer peso ni cintura. Se guarda
  -- aparte del mensaje final a proposito: es lo unico que se puede volver a
  -- comparar el mes que viene sin mandar las fotos viejas otra vez.
  visto         text,
  -- El mensaje que lee la persona, ya reconciliado con los numeros.
  mensaje       text not null,

  creado        timestamptz not null default now(),

  unique (user_id, mes)
);

create index if not exists analisis_fotos_persona_mes
  on public.analisis_fotos (user_id, mes desc);

alter table public.analisis_fotos enable row level security;

-- Solo lo suyo. `puede_ver` deja tambien al coach que la persona acepto,
-- igual que con el resto de sus datos.
drop policy if exists "analisis fotos: ver" on public.analisis_fotos;
create policy "analisis fotos: ver" on public.analisis_fotos
  for select using ( public.puede_ver(user_id) );

-- NADIE escribe esto desde el navegador. Lo escribe la funcion `asistente`
-- con su clave de servicio, despues de comprobar la sesion y el permiso.
-- Sin insert ni update para `authenticated`, un token robado no puede
-- inventarle a nadie un analisis de sus fotos.
grant select on public.analisis_fotos to authenticated;
revoke insert, update, delete on public.analisis_fotos from authenticated;

-- Y explicitamente fuera del alcance de `anon`. `revoke ... from public` NO
-- alcanza a `anon`: Supabase le concede permisos por las opciones por
-- defecto del esquema, y ese descuido ya aparecio en una revision anterior.
revoke all on public.analisis_fotos from anon;

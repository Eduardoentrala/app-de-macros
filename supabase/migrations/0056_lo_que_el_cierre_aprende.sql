-- ======================================================================
--  0056 — Lo que el cierre aprende, y los pesajes de cada semana
--
--  DOS COLUMNAS, las dos para lo mismo: que la app vaya conociendo a cada
--  persona en vez de empezar de cero cada lunes.
--
--  1. profiles.aprendido_cierre
--
--  Hasta ahora la única memoria larga de la app -`memoria_ia`- la escribía
--  SOLO el chat. Quien no conversa con el asistente nunca llegaba a ser
--  conocido, y el cierre semanal —que es el momento con más información de
--  toda la app: el peso, lo comido, el gym, el sueño, la cintura— no dejaba
--  nada. Cada lunes concluía algo y lo tiraba.
--
--  Va SEPARADA de `memoria_ia` a propósito. Las dos se reescriben enteras
--  cada vez, y con dos escritores sobre el mismo texto se pisan: eso está
--  documentado en el código desde que el cierre empezó a leer la memoria
--  del chat sin escribirla. Separadas, cada una tiene su dueño.
--
--  Ochocientos caracteres, menos que los mil doscientos del chat. Aquí no
--  se guardan gustos ni costumbres sino qué se probó y cómo respondió el
--  cuerpo, y eso cabe en menos.
--
--  2. chequeos_semanales.dias_con_peso
--
--  La 0054 guardó `dias_apuntados` pero no cuántas veces se pesó esa
--  semana, y es la otra mitad de si una semana sirve para medir: sin dos
--  pesajes, el peso medio es un peso suelto con otro nombre.
--
--  Hacía falta ahora porque `gastoMedido()` pasó a medir sobre el
--  historial largo y no sobre los 60 días que caben en el teléfono. A las
--  filas viejas no se les puede pedir —no existe el dato— así que se les
--  exige peso medio y ya; de las nuevas se sabrá, y el hueco se cierra
--  solo según se vayan guardando semanas.
-- ======================================================================

alter table public.profiles
  add column if not exists aprendido_cierre text
    check (aprendido_cierre is null or length(aprendido_cierre) <= 800);

comment on column public.profiles.aprendido_cierre is
  'Lo que el cierre semanal ha aprendido de esta persona: qué ajustes se '
  'probaron y cómo respondió. Lo escribe y lo reescribe entero el cierre; '
  'el chat solo lo lee. Separado de memoria_ia para que no se pisen.';

alter table public.chequeos_semanales
  add column if not exists dias_con_peso smallint
    check (dias_con_peso is null or dias_con_peso between 0 and 7);

comment on column public.chequeos_semanales.dias_con_peso is
  'Cuántos días de esa semana se pesó. Con menos de dos, el peso medio de '
  'la semana no es una media: es un peso suelto, y no sirve para medir el '
  'gasto. Nulo en las filas anteriores a la 0056.';

-- Las políticas no se tocan: las dos columnas viven en tablas que ya las
-- tienen, y `profiles` solo deja escribir la fila propia. Una columna nueva
-- hereda eso; si se creara una tabla aparte habría que repetirlo todo y
-- sería una ocasión más de equivocarse.

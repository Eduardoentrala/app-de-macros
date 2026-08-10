-- Paso 1 de 2: dar de alta el motivo nuevo.
--
--  Va SOLO en este archivo, y la funcion que lo usa en la 0037, por una
--  regla de Postgres: un valor nuevo de un enum no se puede USAR en la
--  misma transaccion en la que se anade. Si van juntos, el segundo trozo
--  falla con "unsafe use of new value of enum type". Ejecuta este, y
--  despues el otro.
--
--  QUE ES `cierre_semana`
--  El cierre de semana ya existia pero habia que ir a buscarlo: abrir el
--  chequeo, contestar las tres preguntas y pulsar "Revisar mi semana".
--  Quien no lo abria no se enteraba de nada, y es justo la persona a la que
--  mas falta le hace.
--
--  Los avisos del coach (0030) SI salen solos al entrar, con su boton de
--  "Entendido". Pero sus cuatro motivos son de animo y ninguno cuenta las
--  calorias. Este si: en cuantas estas, si se mueven o no y por que, y una
--  cosa concreta para la semana que entra.

alter type public.motivo_aviso add value if not exists 'cierre_semana';

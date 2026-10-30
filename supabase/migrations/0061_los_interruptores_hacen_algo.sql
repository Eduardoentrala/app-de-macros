-- ---------------------------------------------------------------------
-- LOS INTERRUPTORES DEL PANEL HACEN ALGO
--
-- En Ajustes hay ocho interruptores. Guardan en `feature_flags`, se
-- vuelven a pintar, y debajo pone «se aplican al instante para todos». De
-- los ocho, UNO se aplicaba de verdad:
--
--   · `modo_mantenimiento` SÍ. `flag()` lo lee desde `acceso_permitido()`,
--     que está dentro de `puede_ver()`, `puede_editar_propio()` y
--     `puede_editar_entreno()`, y esas tres las llaman 73 políticas. Es
--     decir: encenderlo cierra la base entera salvo para el super admin.
--     Esto ya estaba y está bien.
--
--   · Los otros siete, no. `flag()` tiene UN solo sitio que la llama, y es
--     el del mantenimiento. Nadie pregunta por el resto.
--
-- Esta migración pone lo único que falta EN LA BASE para que tres de ellos
-- puedan funcionar; el resto del cableado va en la app, que es donde vive
-- lo que encienden y apagan.
--
-- POR QUÉ `anon` TAMBIÉN: `registro_clientes` decide si alguien puede
-- darse de alta, y quien se está dando de alta todavía NO tiene sesión. Con
-- el permiso solo para `authenticated`, la pantalla de registro no puede
-- preguntar si las altas están abiertas, que es justo cuando hace falta
-- saberlo.
--
-- Y SE ABRE LA FUNCIÓN, NO LA TABLA. `flag()` devuelve un sí o un no sobre
-- una clave concreta y nada más: ni los títulos, ni los grupos, ni qué
-- otros interruptores existen. Dar `select` sobre `feature_flags` a quien
-- no ha entrado sería enseñarle el panel de ajustes entero a cualquiera que
-- abra la pantalla de alta.
-- ---------------------------------------------------------------------

grant execute on function public.flag(text) to anon;

-- Y a `service_role`, que es con quien entra la Edge Function. El rol de
-- servicio se salta las políticas RLS, pero NO el permiso de ejecutar una
-- función: sin esto, el asistente pregunta por el interruptor global de la
-- IA, le contestan con un error de permisos, y como ante un fallo se deja
-- pasar, el interruptor no apagaría nada.
grant execute on function public.flag(text) to service_role;


-- ---------------------------------------------------------------------
-- Y LOS CUATRO QUE NO ENCIENDEN NADA, DICHO EN LA BASE
--
-- `chat`, `notificaciones` y `suscripciones` prometen funciones que no
-- existen: no hay tabla de mensajes, no hay ni una línea de `PushManager`
-- en la app, y no hay cobros. `registro_entrenadores` tampoco: no existe
-- alta de entrenador por su cuenta, a los coach los crea el super admin.
--
-- No se borran: la intención es buena y el día que eso exista, el
-- interruptor está. Se marcan, y la app los enseña apagados y con un
-- «Próximamente», que es lo que ya hace con «Explorar recetas de la
-- comunidad». Un interruptor que se puede mover y no mueve nada es peor
-- que uno que dice que todavía no.
-- ---------------------------------------------------------------------

alter table public.feature_flags
  add column if not exists listo boolean not null default true;

comment on column public.feature_flags.listo is
  'false = el interruptor existe pero lo que enciende todavía no. La app lo '
  'enseña apagado y con «Próximamente» en vez de dejar moverlo.';

update public.feature_flags
   set listo = false
 where clave in ('chat', 'notificaciones', 'suscripciones', 'registro_entrenadores');


-- ---------------------------------------------------------------------
-- COMPROBAR
--
--   -- Los cuatro marcados, y solo esos cuatro:
--   select clave, activo, listo from public.feature_flags order by listo, clave;
--
--   -- Y que `flag()` conteste sin sesión (desde la pantalla de alta):
--   select public.flag('registro_clientes');
-- ---------------------------------------------------------------------

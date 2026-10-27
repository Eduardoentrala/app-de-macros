-- ======================================================================
--  0055 — El historial de semanas ya no se borra solo
--
--  La 0054 dejó un disparador que, al guardar tu chequeo, borraba los
--  tuyos de más de doce meses. La intención era buena: no guardar
--  indefinidamente lo que come y pesa una persona. Pero medido en la base
--  de verdad, el 27 de octubre de 2026, no se sostiene:
--
--   · SON 52 FILAS AL AÑO POR PERSONA. La tabla entera, con el historial
--     de todo el mundo, ocupaba 96 kB. Una sola foto de progreso pesa
--     182 kB: el doble que todo el historial junto de todos.
--
--   · ES JUSTO EL DATO QUE SOLO VALE PASADO UN AÑO. Comparar este octubre
--     con el anterior es la pregunta que ningún otro sitio de la app sabe
--     contestar, y el plazo la borraba el día antes de que se pudiera
--     hacer por primera vez.
--
--   · Y ESTABA AL REVÉS. El borrado saltaba al ESCRIBIR tu chequeo, o sea
--     que a quien sigue contestando cada lunes se le llevaba su primer
--     año, y a quien dejó la app no se le tocaba nada. Castigaba al
--     constante y perdonaba al que se fue.
--
--  LO QUE NO CAMBIA, y es donde el «no guardar para siempre» tiene que
--  vivir: borrar la cuenta se lo sigue llevando todo (`purgar_persona`).
--  La decisión es de la persona, no de un plazo que nadie pidió.
--
--  Si algún día hace falta podar de verdad —por volumen o porque lo pida
--  una norma—, que sea una tarea explícita y anunciada, no un disparador
--  silencioso en mitad de un guardado.
-- ======================================================================

drop trigger if exists chequeos_limpiar on public.chequeos_semanales;
drop function if exists public.limpiar_chequeos_viejos();

-- El índice de la 0054 se queda: con más historial, hace más falta, no
-- menos. Es el que hace que pedir las últimas semanas cueste lo mismo
-- tengas uno o diez años guardados.

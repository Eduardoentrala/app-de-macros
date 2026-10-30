-- ---------------------------------------------------------------------
-- LA SEMANA SE GUARDA AUNQUE LA IA ESTÉ APAGADA
--
-- `chequeos_semanales` es la ÚNICA memoria de lo que pasó pasados 60 días.
-- El diario solo se descarga de dos meses atrás, así que de más atrás no
-- hay nada que recomponer: lo que no esté en esta tabla, no existe para el
-- cierre del lunes ni para la medición del gasto.
--
-- Y la fila se escribía DENTRO del `then` del cierre, que es una llamada a
-- la IA. Apagada la IA no hay llamada, no hay fila, y esas semanas se
-- pierden. Quien la apaga unos meses sigue apuntando su comida y pesándose
-- todo ese tiempo —los datos están—; lo único que faltaba era guardarlos.
--
-- Ahora la app escribe la fila con los números por su cuenta y la marca
-- `auto`. Esta columna existe por dos razones concretas:
--
--  1. PARA QUE EL BLOQUE VUELVA A SALIR. Lo único que apaga el chequeo
--     pendiente es que exista fila de esa semana. Sin poder distinguirlas,
--     el día que vuelvan a encender la IA se quedarían sin su primer
--     cierre —justo el que más falta hace— porque ya habría una fila que
--     nadie contestó. La consulta del pendiente mira `auto = false`.
--
--  2. PARA QUE EL MODELO NO SE LO INVENTE. En el historial, una fila sin
--     ajuste se lee como «no se tocó», que afirma que hubo una decisión.
--     En una semana automática no hubo ninguna: no se miró. Con la marca,
--     la función dice «sin cierre» y el modelo sabe que ahí no falta
--     disciplina, falta el cierre.
--
-- La encuesta se queda NULA a propósito. Hambre, energía y sueño no se
-- preguntaron, y un tres de relleno sería peor que el hueco: el hueco se
-- lee como lo que es, y el tres se promedia con los de verdad.
--
-- `default false` y `not null` para que las filas que ya existen —todas
-- escritas por un cierre de verdad— queden marcadas como lo que son sin
-- tocar una sola.
-- ---------------------------------------------------------------------

alter table public.chequeos_semanales
  add column if not exists auto boolean not null default false;

comment on column public.chequeos_semanales.auto is
  'true = la escribió la app sola porque la IA estaba apagada: lleva los '
  'números de la semana, pero nadie contestó la encuesta ni se decidió nada.';


-- ---------------------------------------------------------------------
-- COMPROBAR
--
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_name = 'chequeos_semanales' and column_name = 'auto';
--
--   -- Y que lo que ya había siga contando como cierre de verdad:
--   select auto, count(*) from public.chequeos_semanales group by 1;
-- ---------------------------------------------------------------------

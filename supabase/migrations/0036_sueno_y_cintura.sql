-- Dos datos que le faltaban al entrenador para leer bien una semana.
--
--  1. SUEÑO
--
--  El chequeo semanal preguntaba hambre, energia y antojo. Hambre alta con
--  energia baja se leia como "el deficit es demasiado" y se subian
--  calorias. Pero eso mismo lo produce dormir cinco horas, y ahi subir o
--  bajar calorias da igual: el problema no esta en la comida.
--
--  Sin esta pregunta la IA no puede distinguir los dos casos, y va a mover
--  calorias por un problema de descanso. Eso no se arregla nunca.
--
--  Se mete en el hueco que deja el antojo. La columna `apetito` NO se
--  borra: tiene el historico de quien ya lo contesto, y borrarlo seria
--  perder datos de verdad por un cambio de formulario. Simplemente se deja
--  de preguntar.
--
--  2. CINTURA
--
--  Va en weight_logs y no en el chequeo, a proposito: es una medida del
--  cuerpo, no una sensacion, y ahi ya hay una fila por fecha. Asi da
--  tendencia gratis y se apunta cuando toca, no cada semana.
--
--  Por que importa para el cambio fisico: la bascula no distingue grasa de
--  agua de musculo. La cintura si. Y hace medible el mejor caso que el
--  ajuste semanal ya intenta detectar -peso plano con volumen subiendo, o
--  sea recomposicion-, que hoy solo se DEDUCE del entreno.

alter table public.chequeos_semanales
  add column if not exists sueno smallint
    check (sueno is null or sueno between 1 and 5);

comment on column public.chequeos_semanales.sueno is
  'Como durmio, del 1 al 5, con 3 = normal. Sirve para no confundir un '
  'deficit excesivo con falta de descanso: dan las mismas respuestas en '
  'hambre y energia y se arreglan de forma distinta.';

comment on column public.chequeos_semanales.apetito is
  'YA NO SE PREGUNTA. Medía casi lo mismo que `hambre` -la gente las '
  'contestaba igual- y ocupaba una de las tres preguntas del formulario. '
  'La columna se queda por el historico de quien si la contesto.';

alter table public.weight_logs
  add column if not exists cintura_cm numeric(5,1)
    check (cintura_cm is null or cintura_cm between 40 and 200);

comment on column public.weight_logs.cintura_cm is
  'Cintura en centimetros, opcional. Se mide de vez en cuando, no cada '
  'dia. Es lo unico que distingue perder grasa de perder peso: la bascula '
  'baja igual por agua, por musculo o por grasa, y la cintura no.';

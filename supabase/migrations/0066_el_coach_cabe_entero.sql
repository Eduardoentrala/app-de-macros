-- ---------------------------------------------------------------------
--  LO QUE ESCRIBE EL COACH SE CORTABA A MEDIA FRASE
--
--  `motivo` es el razonamiento del cierre de los lunes: por qué se movieron
--  las calorías o por qué no. Nació como un apunte «para el historial, no
--  para la pantalla» y por eso se le puso un tope de 500 caracteres.
--
--  Después se empezó a ENSEÑAR, en «Mis semanas», desplegando «Tu coach de
--  Macros». Es la parte que convierte una tabla de números en algo que se
--  lee. Y el tope se quedó donde estaba.
--
--  Resultado, en su pantalla:
--
--    «...Bajar escalón ya se probó (2250→1850, sep-oct) sin efecto y con
--     hambre 4/5; no se repite. El margen está en la…»
--
--  Y ahí se acabó. Justo en la frase que decía dónde está el margen, que es
--  lo único que esa persona quería saber.
--
--  Nadie le había dicho al modelo que tenía 500 caracteres: escribía lo que
--  hacía falta y la app cortaba al guardar. Un tope del que solo se entera
--  un lado es un tope que siempre se pasa.
--
--  Mil es sitio de sobra para el razonamiento de una semana, y sigue siendo
--  un tope: esto se guarda una vez por semana y por persona, no es un campo
--  donde quepa un libro. El prompt pide 700 para que quede holgura y no se
--  corte nunca por los pelos.
-- ---------------------------------------------------------------------

alter table public.chequeos_semanales
  drop constraint if exists chequeos_semanales_motivo_check;

alter table public.chequeos_semanales
  add constraint chequeos_semanales_motivo_check
  check (motivo is null or length(motivo) <= 1000);

comment on column public.chequeos_semanales.motivo is
  'Por qué el cierre hizo lo que hizo. SE ENSEÑA en Mis semanas, desplegando '
  '«Tu coach de Macros» — no es solo historial. Mil caracteres: el prompt '
  'pide 700 para que haya holgura y no se corte a media frase.';


-- ---------------------------------------------------------------------
--  COMPROBAR
--
--    -- Los que ya se guardaron cortados se quedan cortados: el texto que
--    -- faltaba no está en ninguna parte, no hay de dónde sacarlo. Se ven
--    -- así, y a partir de la semana que viene dejan de salir:
--    select semana, length(motivo) largo, right(motivo, 30) final
--      from public.chequeos_semanales
--     where motivo is not null and length(motivo) >= 499
--     order by semana desc;
--
--    -- Y que el tope nuevo acepta lo que antes no:
--    select length(repeat('x', 900)) <= 1000 as cabe;
-- ---------------------------------------------------------------------

-- =====================================================================
--  EL ALCOHOL TAMBIÉN SON CALORÍAS
--
--  Una cerveza son 43 kcal por 100 g y el anillo contaba 16. Un tarro de
--  355 ml son unas 153 reales y se apuntaban 58.
--
--  No era un error de los datos: el catálogo siempre dijo 43. Era que la
--  app no sabe contar lo que no es proteína, carbohidrato o grasa, y las
--  calorías del diario son una columna GENERADA con esas tres:
--
--      calories = protein_g*4 + carbs_g*4 + fat_g*9
--
--  El alcohol tiene 7 kcal por gramo y no es ninguna de las tres. Para
--  la base, una cerveza es agua con 3,6 g de carbohidrato.
--
--  LO QUE ESTO ROMPÍA, QUE NO ERA SOLO EL NÚMERO EN PANTALLA
--
--  `gastoMedido()` saca su gasto real cruzando lo que come con cómo se
--  mueve su peso. Si comió más de lo que quedó apuntado, la medición le
--  atribuye el cambio de peso a una ingesta menor y le calcula un gasto
--  MÁS BAJO del que tiene. Y de ese gasto salen las calorías que le pone
--  el cierre de los lunes. O sea que la cerveza no contada le apretaba
--  la dieta, en silencio, semana a semana.
--
--  POR QUÉ UNA COLUMNA Y NO UN APAÑO
--
--  Se pensó en meter las calorías del alcohol en el carbohidrato: la
--  cuenta de calorías saldría bien y no habría que tocar nada. Pero
--  entonces el número de carbohidratos sería falso, y sus metas son POR
--  MACRO: el cierre de los lunes lee los carbos. Se cambiaría una
--  mentira sobre las calorías por otra sobre los carbos.
--
--  El alcohol es un macronutriente más, con sus 7 kcal por gramo. Lo
--  honesto es que la base lo sepa.
--
--  LO VIEJO NO SE MUEVE. La columna entra con `default 0`, así que todo
--  lo apuntado hasta hoy cuenta exactamente lo mismo que contaba ayer.
--  No se va a reescribir el historial para que cuadre con una regla
--  nueva: lo que esa persona vio en su día es lo que vio.
--
--  Depende de 0001.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. La columna, en las tres tablas que llevan macros
-- ---------------------------------------------------------------------
alter table public.diary_entries
  add column if not exists alcohol_g numeric(8,2) not null default 0
  check (alcohol_g >= 0);

alter table public.saved_foods
  add column if not exists alcohol_g numeric(8,2) not null default 0
  check (alcohol_g >= 0);

alter table public.recipes
  add column if not exists alcohol_g numeric(8,2) not null default 0
  check (alcohol_g >= 0);

comment on column public.diary_entries.alcohol_g is
  'Gramos de alcohol. 7 kcal cada uno, y no es ninguno de los otros tres '
  'macros. Casi siempre 0.';


-- ---------------------------------------------------------------------
--  2. Y las calorías vuelven a contarse con él dentro
--
--  Una columna generada no se puede modificar: hay que soltarla y
--  volver a crearla. Se puede hacer sin miedo porque NADIE LA GUARDA
--  APARTE: no hay vista ni índice encima, y las funciones que la usan
--  —`metricas_cliente`, `admin_estadisticas` y las del coach— la leen
--  por su nombre cuando corren, así que siguen funcionando.
--
--  Y no se pierde nada al soltarla: es generada, o sea que su valor
--  siempre se puede volver a calcular de las otras columnas. Eso es
--  justo lo que la hace segura de rehacer.
-- ---------------------------------------------------------------------
alter table public.diary_entries drop column if exists calories;
alter table public.diary_entries
  add column calories numeric(9,2)
  generated always as (protein_g*4 + carbs_g*4 + fat_g*9 + alcohol_g*7) stored;

alter table public.saved_foods drop column if exists calories;
alter table public.saved_foods
  add column calories numeric(9,2)
  generated always as (protein_g*4 + carbs_g*4 + fat_g*9 + alcohol_g*7) stored;

alter table public.recipes drop column if exists calories;
alter table public.recipes
  add column calories numeric(9,2)
  generated always as (protein_g*4 + carbs_g*4 + fat_g*9 + alcohol_g*7) stored;


-- ---------------------------------------------------------------------
--  3. Y el catálogo puede decir cuánto alcohol lleva cada cosa
-- ---------------------------------------------------------------------
alter table public.alimentos_catalogo
  add column if not exists alcohol numeric(5,1) not null default 0
  check (alcohol >= 0);

comment on column public.alimentos_catalogo.alcohol is
  'Gramos de alcohol por 100 g. De USDA, nutriente 1018 («Alcohol, ethyl»).';


-- ---------------------------------------------------------------------
--  4. La cerveza, que es la única que hay hoy
--
--  3,9 g por 100 g, del mismo registro de USDA que ya da sus macros
--  —«Alcoholic beverage, beer, regular, all», fdc 168746—, nutriente
--  1018. La cuenta cierra sola:
--
--      3,9 × 7  =  27,3   del alcohol
--      0,5 × 4  =   2,0   de proteína
--      3,6 × 4  =  14,4   de carbohidrato
--                  -----
--                  43,7   y USDA dice 43
--
--  No hay vino ni destilados en el catálogo, y es a propósito: entraban
--  en la tanda de los 58 y se quitaron al ver esto, porque habrían
--  contado 11 y 0 calorías. Ahora ya podrían entrar; se decidirá
--  aparte, que es una conversación distinta.
-- ---------------------------------------------------------------------
update public.alimentos_catalogo
   set alcohol = 3.9
 where nombre = 'Cerveza' and fdc_id = 168746;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Que la cerveza cuadre (debe dar 43,7 y ~43):
--   select nombre, kcal as dice_usda,
--          proteina*4 + carbos*4 + grasas*9            as solo_macros,
--          proteina*4 + carbos*4 + grasas*9 + alcohol*7 as con_alcohol
--     from public.alimentos_catalogo where nombre = 'Cerveza';
--
-- Que lo de antes no se movió (debe dar 0 filas):
--   select count(*) from public.diary_entries where alcohol_g <> 0;
--
-- Y que la columna generada ya lo suma:
--   select (100*4 + 0*4 + 0*9 + 10*7) = 1070;  -- 100 g prote + 10 g alcohol

-- =====================================================================
--  LAS BEBIDAS SE APUNTAN POR MEDIDAS, NO POR GRAMOS
--
--  Entraron en gramos, como todo lo que viene de USDA. Y él lo vio al
--  primer intento: tecleó 200 en el tequila y 500 en el vino, que son
--  cifras de quien no sabe cuánto pesa lo que se está sirviendo — un
--  caballito son 43 g y una copa 147.
--
--  Nadie pesa una bebida. Se sirve un caballito, una copa, una lata.
--
--  POR QUÉ MEDIDAS Y NO MILILITROS
--
--  Parecía que lo que faltaba era una unidad «Mililitros». Pero los
--  gramos y los mililitros aquí casi coinciden: USDA da el peso de una
--  onza líquida de cada bebida y sale 30 g la cerveza, 29 el vino y 28
--  el destilado, o sea densidad 1,01 · 0,98 · 0,95. Una unidad nueva en
--  toda la app —formulario de alta, panel de admin, varias
--  migraciones— para corregir un 5 % en destilados y nada en lo demás.
--
--  El problema no era la unidad, era tener que saber la cantidad. Así
--  que se usa lo que la app ya hace desde la 0023 con el huevo y la
--  0028 con la tortilla: `unidad = 'Pieza'` y el peso de una.
--
--  LOS PESOS, Y DE DÓNDE SALEN
--
--  Cada uno es la medida de la casa convertida con la densidad de su
--  PROPIA fila de USDA, no con un 1 g/ml a ojo:
--
--    caballito  45 ml  ×  28/29,57  =  42,6  →  43 g
--    copa      150 ml  ×  29/29,57  = 147,1  → 147 g
--    lata      355 ml  ×  30/29,57  = 360,2  → 360 g
--
--  Y SE LES PONE LA MEDIDA EN EL NOMBRE. Sin eso la tarjeta diría
--  «Tequila · 1 pieza», que no significa nada: una pieza de tequila no
--  existe. Los sinónimos no se tocan, así que buscar «tequila», «vino»
--  o «cerveza» los sigue encontrando igual.
--
--  LO APUNTADO NO SE MUEVE. El diario guarda el nombre y los macros
--  copiados, no un enlace a esta tabla: las cervezas que ya estén
--  apuntadas en gramos siguen diciendo lo mismo que decían.
--
--  Depende de 0033 (`unidad`), 0052 (`pieza_g`) y 0075.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Los destilados: un caballito
--
--  Los cinco salen de la misma ficha de USDA porque a 40 grados son lo
--  mismo, así que les toca el mismo peso.
-- ---------------------------------------------------------------------
update public.alimentos_catalogo
   set nombre  = nombre || ' (caballito)',
       pieza_g = 43,
       unidad  = 'Pieza'
 where nombre in ('Tequila', 'Mezcal', 'Ron', 'Vodka', 'Whisky');


-- ---------------------------------------------------------------------
--  El vino: una copa
-- ---------------------------------------------------------------------
update public.alimentos_catalogo
   set nombre  = nombre || ' (copa)',
       pieza_g = 147,
       unidad  = 'Pieza'
 where nombre in ('Vino tinto', 'Vino blanco', 'Vino rosado');


-- ---------------------------------------------------------------------
--  La cerveza: una lata o botella de 355 ml
--
--  Una caguama son 940 ml, o sea 2,6 de estas. El teclado de la hoja de
--  la cantidad admite decimales, así que se pone 2.6 y ya.
-- ---------------------------------------------------------------------
update public.alimentos_catalogo
   set nombre  = nombre || ' (lata)',
       pieza_g = 360,
       unidad  = 'Pieza'
 where nombre in ('Cerveza', 'Cerveza light');


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Que las diez quedaran por pieza y con su peso:
--   select nombre, unidad, pieza_g,
--          round((proteina*4 + carbos*4 + grasas*9 + alcohol*7) * pieza_g / 100) as cal_una
--     from public.alimentos_catalogo
--    where alcohol > 0 order by nombre;
--
--   Debe dar: caballito 99 · copa de tinto 125 · lata 157 · light 104.
--
-- Y que se sigan encontrando por su nombre de siempre:
--   select nombre, unidad, pieza_g from public.buscar_catalogo('tequila', 5);
--   select nombre, unidad, pieza_g from public.buscar_catalogo('vino', 5);

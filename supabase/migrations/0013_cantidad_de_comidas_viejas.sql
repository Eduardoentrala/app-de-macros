-- =====================================================================
--  ARREGLAR LA CANTIDAD DE LAS COMIDAS ANTERIORES A LA EDICIÓN
--
--  Antes de que la app permitiera editar cuánto se comió, todas las
--  entradas del diario se guardaban con `quantity = 1`, queriendo decir
--  "una porción". Los macros se guardaban ya multiplicados, así que la
--  cifra era correcta y ese 1 no molestaba a nadie.
--
--  Al aparecer la edición, `quantity` pasó a significar "cuánto se comió
--  en su unidad": 124 gramos, 2 piezas. Con ese significado nuevo, las
--  filas viejas dicen "me comí 1 gramo y me aportó 20 g de proteína", y
--  al recalcular una porción de 100 g salían 2000 g de proteína y 13.000
--  calorías. Se vio en pantalla antes de que rompiera nada.
--
--  Esto pone la cantidad que de verdad representaban esas filas. Los
--  macros NO se tocan: siempre estuvieron bien.
--
--  Depende de 0012.
-- =====================================================================

update public.diary_entries
   set quantity = 100
 where quantity = 1
   and unit in ('Gramos', 'Onzas');

-- Las unidades que se cuentan de una en una (pieza, taza, cucharada,
-- servicio) ya estaban bien: ahí `1` sí quería decir una unidad.


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- No debería quedar ninguna entrada en gramos con cantidad 1 (dará 0
-- ahora, y si algún día vuelve a aparecer será porque alguien apuntó de
-- verdad un gramo de algo):
--   select count(*) from public.diary_entries
--    where quantity = 1 and unit in ('Gramos','Onzas');
--
-- Y que las calorías por gramo tengan sentido (nada por encima de ~9):
--   select food_name, quantity, unit, round(calories / nullif(quantity,0), 2) cal_por_unidad
--     from public.diary_entries
--    where unit in ('Gramos','Onzas')
--    order by 4 desc nulls last limit 10;

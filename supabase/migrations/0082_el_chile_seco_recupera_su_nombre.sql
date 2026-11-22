-- =====================================================================
--  0082 — El chile seco recupera su nombre
--
--  La 0081 le devolvió al «Chile poblano» sus números de fresco. Los que
--  tenía —345 kcal, P12.4, C51.1, G15.9— eran de un chile seco de
--  verdad, y no tenían por qué perderse: se dan de alta como su propia
--  fila.
--
--  NO SE LLAMA «CHILE ANCHO», que era el nombre obvio y es el
--  equivocado. El ancho es el poblano seco y anda por las 281 kcal con
--  8.2 g de grasa. Estos números —345 y 15.85 de grasa— son los de la
--  PASILLA, que es el chilaca seco, y coinciden al decimal con la
--  entrada de USDA que la fila ya traía: `fdc_id = 168579`, «Peppers,
--  pasilla, dried».
--
--  O sea que el `fdc_id` nunca estuvo mal: lo que estaba mal era el
--  nombre encima de él. Ponerle «ancho» habría sido repetir el fallo de
--  la 0081 con otra etiqueta.
--
--  EN `condimentos` Y NO EN `verduras`. Un chile seco no se come como
--  verdura: se usa para el mole y las salsas, en cantidades de gramos.
--  Y de paso, la comprobación de «ninguna fruta ni verdura pasa de 95
--  kcal» —que es la que encontró el fallo del poblano— sigue valiendo
--  sin tener que hacerle una excepción.
--
--  Depende de 0018 y de 0081.
-- =====================================================================

insert into public.alimentos_catalogo
  (nombre, categoria, estado, kcal, proteina, carbos, grasas,
   unidad, macros_por, fdc_id, nombre_usda, activo)
values
  ('Chile pasilla', 'condimentos', 'unico', 345, 12.4, 51.1, 15.9,
   'Gramos', '100g', 168579, 'Peppers, pasilla, dried', true)
on conflict (nombre, estado) do nothing;

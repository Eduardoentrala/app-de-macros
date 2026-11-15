-- =====================================================================
--  MÁS ALIMENTOS EN EL CATÁLOGO
--
--  9 alimentos nuevos y 14 sinónimos. Mismo origen que los 164
--  de la 0019: USDA SR Legacy, por 100 g, sin tocar, cada uno con su
--  fdc_id y la descripción original para poder auditarlo.
--
--  POR QUÉ ESTA MIGRACIÓN Y NO REGENERAR LA 0019
--
--  La 0019 es el fichero generado y ya tiene estos dentro: se regeneró
--  entera desde curado.mjs el 2026-11-15. Pero en producción ya corrió, y
--  volver a pegarla haría un `on conflict do update` sobre los 164 que
--  ya estaban. Eso normalmente no cambia nada —los números de USDA son
--  los mismos— salvo en un caso: un alimento que alguien haya corregido
--  a mano desde el panel de admin. Ese se perdería, y en silencio.
--
--  Así que aquí van SOLO los nuevos. El delta se sacó comparando la 0019
--  regenerada contra la que estaba en el repo, no a mano.
--
--  Generado por supabase/alimentos/delta (ver el commit) el 2026-11-15.
--  Depende de 0018 y 0019, y de 0073 por la columna `alcohol`.
-- =====================================================================

insert into public.alimentos_catalogo
(nombre, categoria, estado, kcal, proteina, carbos, grasas,
   porcion, porcion_g, fdc_id, nombre_usda)
values
  ('Cerveza light', 'bebidas', 'unico', 29, 0.2, 1.6, 0, 'fl oz', 30, 168749, 'Alcoholic beverage, beer, light'),
  ('Vino tinto', 'bebidas', 'unico', 85, 0.1, 2.6, 0, 'fl oz', 29, 173190, 'Alcoholic beverage, wine, table, red'),
  ('Vino blanco', 'bebidas', 'unico', 82, 0.1, 2.6, 0, 'fl oz', 29, 174837, 'Alcoholic beverage, wine, table, white'),
  ('Vino rosado', 'bebidas', 'unico', 83, 0.4, 3.8, 0, 'fl oz', 30, 171908, 'Alcoholic beverages, wine, rose'),
  ('Tequila', 'bebidas', 'unico', 231, 0, 0, 0, 'fl oz', 28, 174815, 'Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey) 80 proof'),
  ('Mezcal', 'bebidas', 'unico', 231, 0, 0, 0, 'fl oz', 28, 174815, 'Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey) 80 proof'),
  ('Ron', 'bebidas', 'unico', 231, 0, 0, 0, 'fl oz', 28, 174815, 'Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey) 80 proof'),
  ('Vodka', 'bebidas', 'unico', 231, 0, 0, 0, 'fl oz', 28, 174815, 'Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey) 80 proof'),
  ('Whisky', 'bebidas', 'unico', 231, 0, 0, 0, 'fl oz', 28, 174815, 'Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey) 80 proof')
on conflict (nombre, estado) do nothing;


-- Sinónimos. Se resuelven por nombre+estado para no depender de los id.
--
-- `do nothing` y no `do update`: si esto se corre dos veces no pasa nada,
-- y si alguien añadió un sinónimo suyo desde el panel, se queda.
insert into public.alimentos_sinonimos (alimento_id, termino)
select a.id, v.termino
  from (values
    ('Cerveza light', 'unico', 'cerveza light'),
    ('Cerveza light', 'unico', 'light'),
    ('Vino tinto', 'unico', 'vino'),
    ('Vino tinto', 'unico', 'tinto'),
    ('Vino blanco', 'unico', 'vino'),
    ('Vino blanco', 'unico', 'blanco'),
    ('Vino rosado', 'unico', 'vino'),
    ('Vino rosado', 'unico', 'rosado'),
    ('Tequila', 'unico', 'tequila'),
    ('Mezcal', 'unico', 'mezcal'),
    ('Ron', 'unico', 'ron'),
    ('Vodka', 'unico', 'vodka'),
    ('Whisky', 'unico', 'whisky'),
    ('Whisky', 'unico', 'whiskey')
  ) as v(nombre, estado, termino)
  join public.alimentos_catalogo a
    on a.nombre = v.nombre and a.estado::text = v.estado
on conflict (alimento_id, termino) do nothing;


-- ---------------------------------------------------------------------
--  El alcohol de los que lo llevan
--
--  Gramos por 100 g, del nutriente 1018 de la misma ficha de USDA que da
--  sus macros. Se cruza por `fdc_id` y lo escribe el generador: si
--  alguien cambia la bebida, el número se mueve solo con ella.
--
--  Hace falta porque `alimentos_catalogo.kcal` viene de USDA pero las
--  calorías que cuenta la app se calculan de los macros, y sin esto un
--  tequila de 231 kcal entra al anillo como CERO.
-- ---------------------------------------------------------------------
update public.alimentos_catalogo set alcohol = 3.1
 where nombre = 'Cerveza light' and fdc_id = 168749;
update public.alimentos_catalogo set alcohol = 10.6
 where nombre = 'Vino tinto' and fdc_id = 173190;
update public.alimentos_catalogo set alcohol = 10.3
 where nombre = 'Vino blanco' and fdc_id = 174837;
update public.alimentos_catalogo set alcohol = 9.6
 where nombre = 'Vino rosado' and fdc_id = 171908;
update public.alimentos_catalogo set alcohol = 33.4
 where nombre = 'Tequila' and fdc_id = 174815;
update public.alimentos_catalogo set alcohol = 33.4
 where nombre = 'Mezcal' and fdc_id = 174815;
update public.alimentos_catalogo set alcohol = 33.4
 where nombre = 'Ron' and fdc_id = 174815;
update public.alimentos_catalogo set alcohol = 33.4
 where nombre = 'Vodka' and fdc_id = 174815;
update public.alimentos_catalogo set alcohol = 33.4
 where nombre = 'Whisky' and fdc_id = 174815;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Cuántos ingredientes hay ahora (debe dar 232):
--
--   Este número se calcula al generar, no se escribe a mano. Llegó a
--   decir 224 cuando eran 222, porque se quitaron dos alimentos de la
--   lista DESPUÉS de generar el comentario. Un número de comprobación
--   que no cuadra enseña a desconfiar de la comprobación.
--
--   Cuenta solo los ingredientes: los platillos de la 0069 suman aparte.
--   select count(*) from public.alimentos_catalogo;
--
-- Que ninguno tenga macros imposibles (debe dar 0 filas):
--   select nombre, kcal, proteina, carbos, grasas
--     from public.alimentos_catalogo
--    where kcal > 900 or proteina > 100 or carbos > 100 or grasas > 100;
--
-- Y que los nuevos se encuentren al buscar:
--   select * from public.buscar_catalogo('chorizo', 5);
--   select * from public.buscar_catalogo('refritos', 5);

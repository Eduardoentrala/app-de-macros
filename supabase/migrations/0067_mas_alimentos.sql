-- =====================================================================
--  MÁS ALIMENTOS EN EL CATÁLOGO
--
--  58 alimentos nuevos y 113 sinónimos. Mismo origen que los 164
--  de la 0019: USDA SR Legacy, por 100 g, sin tocar, cada uno con su
--  fdc_id y la descripción original para poder auditarlo.
--
--  POR QUÉ ESTA MIGRACIÓN Y NO REGENERAR LA 0019
--
--  La 0019 es el fichero generado y ya tiene estos dentro: se regeneró
--  entera desde curado.mjs el 2026-11-12. Pero en producción ya corrió, y
--  volver a pegarla haría un `on conflict do update` sobre los 164 que
--  ya estaban. Eso normalmente no cambia nada —los números de USDA son
--  los mismos— salvo en un caso: un alimento que alguien haya corregido
--  a mano desde el panel de admin. Ese se perdería, y en silencio.
--
--  Así que aquí van SOLO los nuevos. El delta se sacó comparando la 0019
--  regenerada contra la que estaba en el repo, no a mano.
--
--  Generado por supabase/alimentos/delta (ver el commit) el 2026-11-12.
--  Depende de 0018 y 0019.
-- =====================================================================

insert into public.alimentos_catalogo
  (nombre, categoria, estado, kcal, proteina, carbos, grasas,
   porcion, porcion_g, fdc_id, nombre_usda)
values
  ('Hígado de pollo', 'aves', 'cocido', 167, 24.5, 0.9, 6.5, 'oz', 85, 171061, 'Chicken, liver, all classes, cooked, simmered'),
  ('Chorizo', 'carnes', 'crudo', 296, 13.6, 3.8, 25.1, 'oz', 28, 173859, 'Sausage, pork, chorizo, link or ground, raw'),
  ('Salchicha', 'carnes', 'cocido', 322, 11.7, 2.7, 29.4, 'frankfurter', 48, 174614, 'Frankfurter, beef, heated'),
  ('Jamón de pavo', 'carnes', 'unico', 134, 19.6, 0.9, 5.8, 'cup pieces', 138, 168092, 'Ham, turkey, sliced, extra lean, prepackaged or deli'),
  ('Maciza de cerdo', 'carnes', 'cocido', 233, 26.6, 0, 13.2, 'oz', 85, 168261, 'Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean only, cooked, braised'),
  ('Hígado de res', 'carnes', 'cocido', 175, 26.5, 5.2, 4.7, 'oz', 85, 168627, 'Beef, variety meats and by-products, liver, cooked, pan-fried'),
  ('Almeja', 'mariscos', 'cocido', 148, 25.6, 5.1, 2, 'oz', 85, 171975, 'Mollusks, clam, mixed species, cooked, moist heat'),
  ('Mejillón', 'mariscos', 'cocido', 172, 23.8, 7.4, 4.5, 'oz', 85, 174217, 'Mollusks, mussel, blue, cooked, moist heat'),
  ('Queso fresco', 'lacteos', 'unico', 299, 18.1, 3, 23.8, 'cup, crumbled', 122, 172223, 'Cheese, fresh, queso fresco'),
  ('Queso añejo', 'lacteos', 'unico', 373, 21.4, 4.6, 30, 'cup, crumbled', 132, 172201, 'Cheese, mexican, queso anejo'),
  ('Queso asadero', 'lacteos', 'unico', 356, 22.6, 4.1, 25, 'cup, diced', 132, 173437, 'Cheese, mexican, queso asadero'),
  ('Queso blanco', 'lacteos', 'unico', 310, 20.4, 2.5, 24.3, 'cup, crumbled', 118, 172224, 'Cheese, white, queso blanco'),
  ('Requesón', 'lacteos', 'unico', 138, 11.4, 5.1, 7.9, 'cup', 124, 171248, 'Cheese, ricotta, part skim milk'),
  ('Queso amarillo', 'lacteos', 'unico', 330, 16.9, 8.6, 25.6, 'cup', 113, 171291, 'Cheese food, pasteurized process, American, without added vitamin D'),
  ('Acelga', 'verduras', 'crudo', 19, 1.8, 3.7, 0.2, 'cup', 36, 169991, 'Chard, swiss, raw'),
  ('Acelga', 'verduras', 'cocido', 20, 1.9, 4.1, 0.1, 'cup, chopped', 175, 170401, 'Chard, swiss, cooked, boiled, drained, without salt'),
  ('Rábano', 'verduras', 'unico', 16, 0.7, 3.4, 0.1, 'cup slices', 116, 169276, 'Radishes, raw'),
  ('Cilantro', 'verduras', 'unico', 23, 2.1, 3.7, 0.5, 'cup', 4, 169997, 'Coriander (cilantro) leaves, raw'),
  ('Berenjena', 'verduras', 'crudo', 25, 1, 5.9, 0.2, 'cup, cubes', 82, 169228, 'Eggplant, raw'),
  ('Berenjena', 'verduras', 'cocido', 35, 0.8, 8.7, 0.2, 'cup (1" cubes)', 99, 169229, 'Eggplant, cooked, boiled, drained, without salt'),
  ('Poro', 'verduras', 'crudo', 61, 1.5, 14.2, 0.3, 'cup', 89, 169246, 'Leeks, (bulb and lower leaf-portion), raw'),
  ('Chile serrano', 'verduras', 'unico', 32, 1.7, 6.7, 0.4, 'cup, chopped', 105, 169395, 'Peppers, serrano, raw'),
  ('Jícama', 'verduras', 'unico', 38, 0.7, 8.8, 0.1, 'cup slices', 120, 170073, 'Yambean (jicama), raw'),
  ('Espárrago', 'verduras', 'crudo', 20, 2.2, 3.9, 0.1, 'cup', 134, 168389, 'Asparagus, raw'),
  ('Espárrago', 'verduras', 'cocido', 22, 2.4, 4.1, 0.2, 'cup', 90, 168390, 'Asparagus, cooked, boiled, drained'),
  ('Calabaza de castilla', 'verduras', 'crudo', 26, 1, 6.5, 0.1, 'cup (1" cubes)', 116, 168448, 'Pumpkin, raw'),
  ('Chícharo', 'verduras', 'crudo', 81, 5.4, 14.5, 0.4, 'cup', 145, 170419, 'Peas, green, raw'),
  ('Chícharo', 'verduras', 'cocido', 78, 5.2, 14.3, 0.3, 'cup', 80, 170017, 'Peas, green, frozen, cooked, boiled, drained, without salt'),
  ('Mamey', 'frutas', 'unico', 124, 1.5, 32.1, 0.5, 'cup 1" pieces', 175, 167760, 'Sapote, mamey, raw'),
  ('Guanábana', 'frutas', 'unico', 66, 1, 16.8, 0.3, 'cup, pulp', 225, 167761, 'Soursop, raw'),
  ('Granada', 'frutas', 'unico', 83, 1.7, 18.7, 1.2, 'cup arils (seed/juice sacs)', 87, 169134, 'Pomegranates, raw'),
  ('Higo', 'frutas', 'unico', 74, 0.8, 19.2, 0.3, 'large (2-1/2" dia)', 64, 173021, 'Figs, raw'),
  ('Zarzamora', 'frutas', 'unico', 43, 1.4, 9.6, 0.5, 'cup', 144, 173946, 'Blackberries, raw'),
  ('Frambuesa', 'frutas', 'unico', 52, 1.2, 11.9, 0.7, 'cup', 123, 167755, 'Raspberries, raw'),
  ('Cereza', 'frutas', 'unico', 63, 1.1, 16, 0.2, 'cup, with pits, yields', 138, 171719, 'Cherries, sweet, raw'),
  ('Tuna', 'frutas', 'unico', 41, 0.7, 9.6, 0.5, 'cup', 149, 167750, 'Prickly pears, raw'),
  ('Ciruela pasa', 'frutas', 'unico', 240, 2.2, 63.9, 0.4, 'cup, pitted', 174, 168162, 'Plums, dried (prunes), uncooked'),
  ('Pasas', 'frutas', 'unico', 301, 3.3, 80, 0.2, 'cup, packed', 165, 168164, 'Raisins, golden, seedless'),
  ('Frijoles refritos', 'legumbres', 'unico', 90, 5, 13.6, 2, 'cup', 238, 172438, 'Refried beans, canned, traditional style'),
  ('Granola', 'cereales', 'unico', 489, 13.7, 53.9, 24.3, 'cup', 122, 171646, 'Cereals ready-to-eat, granola, homemade'),
  ('Totopos', 'cereales', 'unico', 472, 7.1, 67.8, 20.7, 'oz', 28, 167558, 'Snacks, tortilla chips, plain, white corn, salted'),
  ('Papa a la francesa', 'tuberculos', 'cocido', 168, 2.7, 28.7, 5.2, 'strip', 74, 170118, 'Potatoes, french fried, all types, salt not added in processing, frozen, oven-heated'),
  ('Coco', 'frutos_secos', 'unico', 354, 3.3, 15.2, 33.5, 'cup, shredded', 80, 170169, 'Nuts, coconut meat, raw'),
  ('Aceitunas', 'grasas', 'unico', 116, 0.8, 6, 10.9, 'tbsp', 8, 169094, 'Olives, ripe, canned (small-extra large)'),
  ('Hot cakes', 'panes', 'cocido', 227, 6.4, 28.3, 9.7, 'oz', 28, 175009, 'Pancakes, plain, prepared from recipe'),
  ('Galletas saladas', 'panes', 'unico', 418, 9.5, 74.1, 8.6, 'crackers', 15, 172746, 'Crackers, saltines (includes oyster, soda, soup)'),
  ('Helado de vainilla', 'azucares', 'unico', 207, 3.5, 23.6, 11, 'serving 1/2 cup', 66, 167575, 'Ice creams, vanilla'),
  ('Cajeta', 'azucares', 'unico', 315, 6.8, 55.4, 7.4, 'tbsp', 19, 173461, 'Dulce de Leche'),
  ('Mermelada', 'azucares', 'unico', 278, 0.4, 68.9, 0.1, 'tbsp', 20, 169641, 'Jams and preserves'),
  ('Chocolate con leche', 'azucares', 'unico', 535, 7.7, 59.4, 29.7, 'bar, miniature', 7, 167587, 'Candies, milk chocolate'),
  ('Crema de avellana', 'azucares', 'unico', 539, 5.4, 62.4, 29.7, 'serving 2 TBSP', 37, 168000, 'Chocolate-flavored hazelnut spread'),
  ('Salsa roja', 'condimentos', 'unico', 29, 1.5, 6.6, 0.2, 'tbsp', 36, 174524, 'Sauce, salsa, ready-to-serve'),
  ('Salsa verde', 'condimentos', 'unico', 38, 1.1, 6.4, 0.9, 'Tbsp', 30, 171824, 'Sauce, salsa, verde, ready-to-serve'),
  ('Leche de almendra', 'bebidas', 'unico', 15, 0.4, 1.3, 1, 'cup', 262, 174832, 'Beverages, almond milk, unsweetened, shelf stable'),
  ('Leche de soya', 'bebidas', 'unico', 33, 2.9, 1.7, 1.6, 'cup', 243, 175215, 'Soymilk (all flavors), unsweetened, with added calcium, vitamins A and D'),
  ('Jugo de manzana', 'bebidas', 'unico', 46, 0.1, 11.3, 0.1, 'cup', 248, 173933, 'Apple juice, canned or bottled, unsweetened, without added ascorbic acid'),
  ('Agua de coco', 'bebidas', 'unico', 18, 0.2, 4.2, 0, 'cup', 245, 174831, 'Beverages, Coconut water, ready-to-drink, unsweetened'),
  ('Caldo de pollo', 'otros', 'unico', 4, 0.3, 0.3, 0.2, 'cup 8 fl oz', 241, 172924, 'Soup, chicken broth or bouillon, dry, prepared with water')
on conflict (nombre, estado) do nothing;


-- Sinónimos. Se resuelven por nombre+estado para no depender de los id.
--
-- `do nothing` y no `do update`: si esto se corre dos veces no pasa nada,
-- y si alguien añadió un sinónimo suyo desde el panel, se queda.
insert into public.alimentos_sinonimos (alimento_id, termino)
select a.id, v.termino
  from (values
    ('Hígado de pollo', 'cocido', 'higado'),
    ('Hígado de pollo', 'cocido', 'pollo'),
    ('Chorizo', 'crudo', 'chorizo'),
    ('Chorizo', 'crudo', 'longaniza'),
    ('Salchicha', 'cocido', 'salchicha'),
    ('Salchicha', 'cocido', 'hot dog'),
    ('Salchicha', 'cocido', 'hotdog'),
    ('Jamón de pavo', 'unico', 'jamon'),
    ('Jamón de pavo', 'unico', 'pavo'),
    ('Maciza de cerdo', 'cocido', 'carnitas'),
    ('Maciza de cerdo', 'cocido', 'maciza'),
    ('Maciza de cerdo', 'cocido', 'cerdo'),
    ('Maciza de cerdo', 'cocido', 'puerco'),
    ('Hígado de res', 'cocido', 'higado'),
    ('Hígado de res', 'cocido', 'res'),
    ('Almeja', 'cocido', 'almeja'),
    ('Mejillón', 'cocido', 'mejillon'),
    ('Queso fresco', 'unico', 'queso'),
    ('Queso fresco', 'unico', 'fresco'),
    ('Queso fresco', 'unico', 'ranchero'),
    ('Queso añejo', 'unico', 'queso'),
    ('Queso añejo', 'unico', 'anejo'),
    ('Queso asadero', 'unico', 'queso'),
    ('Queso asadero', 'unico', 'asadero'),
    ('Queso blanco', 'unico', 'queso'),
    ('Queso blanco', 'unico', 'blanco'),
    ('Requesón', 'unico', 'requeson'),
    ('Requesón', 'unico', 'ricotta'),
    ('Queso amarillo', 'unico', 'queso'),
    ('Queso amarillo', 'unico', 'amarillo'),
    ('Queso amarillo', 'unico', 'americano'),
    ('Acelga', 'crudo', 'acelga'),
    ('Acelga', 'cocido', 'acelga'),
    ('Rábano', 'unico', 'rabano'),
    ('Cilantro', 'unico', 'cilantro'),
    ('Berenjena', 'crudo', 'berenjena'),
    ('Berenjena', 'cocido', 'berenjena'),
    ('Poro', 'crudo', 'poro'),
    ('Poro', 'crudo', 'puerro'),
    ('Chile serrano', 'unico', 'chile'),
    ('Chile serrano', 'unico', 'serrano'),
    ('Jícama', 'unico', 'jicama'),
    ('Espárrago', 'crudo', 'esparrago'),
    ('Espárrago', 'cocido', 'esparrago'),
    ('Calabaza de castilla', 'crudo', 'calabaza'),
    ('Calabaza de castilla', 'crudo', 'castilla'),
    ('Chícharo', 'crudo', 'chicharo'),
    ('Chícharo', 'crudo', 'guisante'),
    ('Chícharo', 'cocido', 'chicharo'),
    ('Chícharo', 'cocido', 'guisante'),
    ('Mamey', 'unico', 'mamey'),
    ('Mamey', 'unico', 'zapote'),
    ('Guanábana', 'unico', 'guanabana'),
    ('Granada', 'unico', 'granada'),
    ('Higo', 'unico', 'higo'),
    ('Zarzamora', 'unico', 'zarzamora'),
    ('Zarzamora', 'unico', 'mora'),
    ('Frambuesa', 'unico', 'frambuesa'),
    ('Cereza', 'unico', 'cereza'),
    ('Tuna', 'unico', 'tuna'),
    ('Tuna', 'unico', 'nopal'),
    ('Ciruela pasa', 'unico', 'ciruela'),
    ('Ciruela pasa', 'unico', 'pasa'),
    ('Pasas', 'unico', 'pasas'),
    ('Pasas', 'unico', 'uva pasa'),
    ('Frijoles refritos', 'unico', 'frijol'),
    ('Frijoles refritos', 'unico', 'frijoles'),
    ('Frijoles refritos', 'unico', 'refritos'),
    ('Granola', 'unico', 'granola'),
    ('Totopos', 'unico', 'totopos'),
    ('Totopos', 'unico', 'tostada'),
    ('Totopos', 'unico', 'nachos'),
    ('Papa a la francesa', 'cocido', 'papa'),
    ('Papa a la francesa', 'cocido', 'papas'),
    ('Papa a la francesa', 'cocido', 'frita'),
    ('Papa a la francesa', 'cocido', 'francesa'),
    ('Coco', 'unico', 'coco'),
    ('Aceitunas', 'unico', 'aceituna'),
    ('Aceitunas', 'unico', 'aceitunas'),
    ('Hot cakes', 'cocido', 'hot cakes'),
    ('Hot cakes', 'cocido', 'hotcakes'),
    ('Hot cakes', 'cocido', 'panqueque'),
    ('Galletas saladas', 'unico', 'galleta'),
    ('Galletas saladas', 'unico', 'galletas'),
    ('Galletas saladas', 'unico', 'saladas'),
    ('Helado de vainilla', 'unico', 'helado'),
    ('Helado de vainilla', 'unico', 'nieve'),
    ('Cajeta', 'unico', 'cajeta'),
    ('Cajeta', 'unico', 'dulce de leche'),
    ('Mermelada', 'unico', 'mermelada'),
    ('Chocolate con leche', 'unico', 'chocolate'),
    ('Crema de avellana', 'unico', 'avellana'),
    ('Crema de avellana', 'unico', 'nutella'),
    ('Crema de avellana', 'unico', 'untable'),
    ('Salsa roja', 'unico', 'salsa'),
    ('Salsa roja', 'unico', 'roja'),
    ('Salsa roja', 'unico', 'picante'),
    ('Salsa verde', 'unico', 'salsa'),
    ('Salsa verde', 'unico', 'verde'),
    ('Salsa verde', 'unico', 'picante'),
    ('Leche de almendra', 'unico', 'leche'),
    ('Leche de almendra', 'unico', 'almendra'),
    ('Leche de almendra', 'unico', 'vegetal'),
    ('Leche de soya', 'unico', 'leche'),
    ('Leche de soya', 'unico', 'soya'),
    ('Leche de soya', 'unico', 'vegetal'),
    ('Jugo de manzana', 'unico', 'jugo'),
    ('Jugo de manzana', 'unico', 'manzana'),
    ('Agua de coco', 'unico', 'agua'),
    ('Agua de coco', 'unico', 'coco'),
    ('Caldo de pollo', 'unico', 'caldo'),
    ('Caldo de pollo', 'unico', 'consome'),
    ('Caldo de pollo', 'unico', 'pollo')
  ) as v(nombre, estado, termino)
  join public.alimentos_catalogo a
    on a.nombre = v.nombre and a.estado::text = v.estado
on conflict (alimento_id, termino) do nothing;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Cuántos hay ahora (debe dar 224):
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

-- =====================================================================
--  PLATILLOS
--
--  18 platos mexicanos de diario. Generado por
--  supabase/alimentos/platillos.mjs el 2026-11-12. NO editar a mano.
--
--  NO LLEVAN MACROS COPIADAS DE NINGUNA TABLA. Cada uno es una receta
--  —qué ingredientes del catálogo y cuántos gramos— y sus macros se
--  suman de ahí. La receta va en `composicion`, así que la cuenta se
--  puede rehacer entera, y cada ingrediente trae su propio fdc_id.
--
--  USDA tiene «taco» y «enchilada», pero en su sección de comida rápida:
--  son la versión americana. Copiar esas cifras habría sido poner un
--  número con pinta de auditado que no describe lo que nadie se comió.
--
--  Van en la categoría 'otros': lo que los distingue es tener
--  `composicion`, no una etiqueta. El porqué está en la 0068.
--
--  Depende de 0019 (los ingredientes) y de 0068 (la columna).
-- =====================================================================

insert into public.alimentos_catalogo
  (nombre, categoria, estado, kcal, proteina, carbos, grasas,
   porcion, porcion_g, unidad, pieza_g, composicion)
values
  ('Chilaquiles verdes con pollo', 'otros', 'unico', 207.3, 11.6, 17.7, 10.1, '1 plato', 275, 'Servicio', 275, '{"porcion_g":275,"ingredientes":[{"nombre":"Totopos","estado":"unico","gramos":60},{"nombre":"Salsa verde","estado":"unico","gramos":90},{"nombre":"Pechuga de pollo","estado":"cocido","gramos":70},{"nombre":"Crema","estado":"unico","gramos":20},{"nombre":"Queso fresco","estado":"unico","gramos":25},{"nombre":"Cebolla","estado":"crudo","gramos":10}]}'::jsonb),
  ('Huevos con chorizo', 'otros', 'unico', 201.3, 12.6, 1.6, 15.8, '1 plato', 143, 'Servicio', 143, '{"porcion_g":143,"ingredientes":[{"nombre":"Huevo entero","estado":"crudo","gramos":100},{"nombre":"Chorizo","estado":"crudo","gramos":40},{"nombre":"Aceite vegetal","estado":"unico","gramos":3}]}'::jsonb),
  ('Huevos a la mexicana', 'otros', 'unico', 113, 7.3, 2.8, 8, '1 plato', 183, 'Servicio', 183, '{"porcion_g":183,"ingredientes":[{"nombre":"Huevo entero","estado":"crudo","gramos":100},{"nombre":"Jitomate","estado":"crudo","gramos":50},{"nombre":"Cebolla","estado":"crudo","gramos":20},{"nombre":"Chile serrano","estado":"unico","gramos":8},{"nombre":"Aceite vegetal","estado":"unico","gramos":5}]}'::jsonb),
  ('Taco de pollo', 'otros', 'unico', 151.5, 15.8, 16.2, 2.5, '1 taco', 90, 'Servicio', 90, '{"porcion_g":90,"ingredientes":[{"nombre":"Tortilla de maíz","estado":"unico","gramos":28},{"nombre":"Pechuga de pollo","estado":"cocido","gramos":40},{"nombre":"Salsa verde","estado":"unico","gramos":15},{"nombre":"Cebolla","estado":"crudo","gramos":5},{"nombre":"Cilantro","estado":"unico","gramos":2}]}'::jsonb),
  ('Taco de carne asada', 'otros', 'unico', 164.5, 15.2, 15.3, 4.7, '1 taco', 95, 'Servicio', 95, '{"porcion_g":95,"ingredientes":[{"nombre":"Tortilla de maíz","estado":"unico","gramos":28},{"nombre":"Arrachera","estado":"cocido","gramos":45},{"nombre":"Salsa roja","estado":"unico","gramos":15},{"nombre":"Cebolla","estado":"crudo","gramos":5},{"nombre":"Cilantro","estado":"unico","gramos":2}]}'::jsonb),
  ('Quesadilla de queso', 'otros', 'unico', 240.8, 16.6, 20.8, 10.4, '1 quesadilla', 68, 'Servicio', 68, '{"porcion_g":68,"ingredientes":[{"nombre":"Tortilla de maíz","estado":"unico","gramos":28},{"nombre":"Queso Oaxaca","estado":"unico","gramos":40}]}'::jsonb),
  ('Sincronizada', 'otros', 'unico', 248.5, 14.7, 25.6, 9.4, '1 pieza', 140, 'Servicio', 140, '{"porcion_g":140,"ingredientes":[{"nombre":"Tortilla de harina","estado":"unico","gramos":70},{"nombre":"Queso Oaxaca","estado":"unico","gramos":40},{"nombre":"Jamón de pierna","estado":"unico","gramos":30}]}'::jsonb),
  ('Torta de jamón', 'otros', 'unico', 223.8, 10.6, 21.7, 10.6, '1 torta', 240, 'Servicio', 240, '{"porcion_g":240,"ingredientes":[{"nombre":"Bolillo","estado":"unico","gramos":90},{"nombre":"Jamón de pierna","estado":"unico","gramos":60},{"nombre":"Queso panela","estado":"unico","gramos":30},{"nombre":"Aguacate","estado":"unico","gramos":30},{"nombre":"Jitomate","estado":"crudo","gramos":20},{"nombre":"Mayonesa","estado":"unico","gramos":10}]}'::jsonb),
  ('Molletes', 'otros', 'unico', 208.2, 10.8, 28.3, 5.6, '2 mitades', 210, 'Servicio', 210, '{"porcion_g":210,"ingredientes":[{"nombre":"Bolillo","estado":"unico","gramos":90},{"nombre":"Frijoles refritos","estado":"unico","gramos":80},{"nombre":"Queso Oaxaca","estado":"unico","gramos":40}]}'::jsonb),
  ('Pozole de pollo', 'otros', 'unico', 55.7, 6.2, 6, 1.1, '1 plato hondo', 485, 'Servicio', 485, '{"porcion_g":485,"ingredientes":[{"nombre":"Elote","estado":"cocido","gramos":120},{"nombre":"Pechuga de pollo","estado":"cocido","gramos":80},{"nombre":"Caldo de pollo","estado":"unico","gramos":220},{"nombre":"Lechuga romana","estado":"crudo","gramos":30},{"nombre":"Rábano","estado":"unico","gramos":20},{"nombre":"Cebolla","estado":"crudo","gramos":15}]}'::jsonb),
  ('Enchiladas verdes', 'otros', 'unico', 162.8, 11.5, 14.8, 6.5, '3 piezas', 319, 'Servicio', 319, '{"porcion_g":319,"ingredientes":[{"nombre":"Tortilla de maíz","estado":"unico","gramos":84},{"nombre":"Pechuga de pollo","estado":"cocido","gramos":80},{"nombre":"Salsa verde","estado":"unico","gramos":100},{"nombre":"Crema","estado":"unico","gramos":25},{"nombre":"Queso fresco","estado":"unico","gramos":30}]}'::jsonb),
  ('Arroz a la mexicana', 'otros', 'unico', 125, 2.5, 21.7, 3, '1 taza', 221, 'Servicio', 221, '{"porcion_g":221,"ingredientes":[{"nombre":"Arroz blanco","estado":"cocido","gramos":150},{"nombre":"Jitomate","estado":"crudo","gramos":25},{"nombre":"Chícharo","estado":"cocido","gramos":20},{"nombre":"Zanahoria","estado":"crudo","gramos":20},{"nombre":"Aceite vegetal","estado":"unico","gramos":6}]}'::jsonb),
  ('Sopa de fideo', 'otros', 'unico', 76.6, 2.4, 12.1, 2, '1 plato', 325, 'Servicio', 325, '{"porcion_g":325,"ingredientes":[{"nombre":"Pasta","estado":"cocido","gramos":120},{"nombre":"Jitomate","estado":"crudo","gramos":50},{"nombre":"Caldo de pollo","estado":"unico","gramos":150},{"nombre":"Aceite vegetal","estado":"unico","gramos":5}]}'::jsonb),
  ('Frijoles charros', 'otros', 'unico', 162.8, 9.8, 19, 5.6, '1 taza', 225, 'Servicio', 225, '{"porcion_g":225,"ingredientes":[{"nombre":"Frijol pinto","estado":"cocido","gramos":150},{"nombre":"Tocino","estado":"cocido","gramos":15},{"nombre":"Chorizo","estado":"crudo","gramos":20},{"nombre":"Jitomate","estado":"crudo","gramos":25},{"nombre":"Cebolla","estado":"crudo","gramos":15}]}'::jsonb),
  ('Guacamole', 'otros', 'unico', 115.4, 1.7, 7.7, 9.9, '1/2 taza', 150, 'Servicio', 150, '{"porcion_g":150,"ingredientes":[{"nombre":"Aguacate","estado":"unico","gramos":100},{"nombre":"Jitomate","estado":"crudo","gramos":25},{"nombre":"Cebolla","estado":"crudo","gramos":15},{"nombre":"Cilantro","estado":"unico","gramos":5},{"nombre":"Limón","estado":"unico","gramos":5}]}'::jsonb),
  ('Pico de gallo', 'otros', 'unico', 25.2, 1.1, 5.7, 0.2, '1/2 taza', 103, 'Servicio', 103, '{"porcion_g":103,"ingredientes":[{"nombre":"Jitomate","estado":"crudo","gramos":60},{"nombre":"Cebolla","estado":"crudo","gramos":25},{"nombre":"Chile serrano","estado":"unico","gramos":8},{"nombre":"Cilantro","estado":"unico","gramos":5},{"nombre":"Limón","estado":"unico","gramos":5}]}'::jsonb),
  ('Licuado de plátano', 'otros', 'unico', 85.9, 3.1, 13.6, 2.5, '1 vaso', 390, 'Servicio', 390, '{"porcion_g":390,"ingredientes":[{"nombre":"Leche entera","estado":"unico","gramos":250},{"nombre":"Plátano","estado":"unico","gramos":120},{"nombre":"Avena","estado":"crudo","gramos":20}]}'::jsonb),
  ('Ensalada de nopales', 'otros', 'unico', 52, 3.3, 4, 3, '1 taza', 210, 'Servicio', 210, '{"porcion_g":210,"ingredientes":[{"nombre":"Nopal","estado":"cocido","gramos":120},{"nombre":"Jitomate","estado":"crudo","gramos":40},{"nombre":"Cebolla","estado":"crudo","gramos":20},{"nombre":"Queso fresco","estado":"unico","gramos":25},{"nombre":"Cilantro","estado":"unico","gramos":5}]}'::jsonb)
on conflict (nombre, estado) do update set
  kcal = excluded.kcal, proteina = excluded.proteina,
  carbos = excluded.carbos, grasas = excluded.grasas,
  porcion = excluded.porcion, porcion_g = excluded.porcion_g,
  unidad = excluded.unidad, pieza_g = excluded.pieza_g,
  composicion = excluded.composicion;


-- Sinónimos: «chilaquil», «taco», «licuado».
insert into public.alimentos_sinonimos (alimento_id, termino)
select a.id, v.termino
  from (values
    ('Chilaquiles verdes con pollo', 'chilaquiles'),
    ('Chilaquiles verdes con pollo', 'chilaquil'),
    ('Huevos con chorizo', 'huevo'),
    ('Huevos con chorizo', 'chorizo'),
    ('Huevos con chorizo', 'huevos'),
    ('Huevos a la mexicana', 'huevo'),
    ('Huevos a la mexicana', 'huevos'),
    ('Huevos a la mexicana', 'mexicana'),
    ('Taco de pollo', 'taco'),
    ('Taco de pollo', 'tacos'),
    ('Taco de pollo', 'pollo'),
    ('Taco de carne asada', 'taco'),
    ('Taco de carne asada', 'tacos'),
    ('Taco de carne asada', 'asada'),
    ('Taco de carne asada', 'carne'),
    ('Quesadilla de queso', 'quesadilla'),
    ('Quesadilla de queso', 'queso'),
    ('Sincronizada', 'sincronizada'),
    ('Sincronizada', 'jamon'),
    ('Sincronizada', 'queso'),
    ('Torta de jamón', 'torta'),
    ('Torta de jamón', 'jamon'),
    ('Molletes', 'molletes'),
    ('Molletes', 'mollete'),
    ('Pozole de pollo', 'pozole'),
    ('Enchiladas verdes', 'enchilada'),
    ('Enchiladas verdes', 'enchiladas'),
    ('Arroz a la mexicana', 'arroz'),
    ('Arroz a la mexicana', 'mexicana'),
    ('Sopa de fideo', 'sopa'),
    ('Sopa de fideo', 'fideo'),
    ('Frijoles charros', 'frijol'),
    ('Frijoles charros', 'frijoles'),
    ('Frijoles charros', 'charros'),
    ('Guacamole', 'guacamole'),
    ('Guacamole', 'aguacate'),
    ('Pico de gallo', 'pico de gallo'),
    ('Pico de gallo', 'salsa'),
    ('Licuado de plátano', 'licuado'),
    ('Licuado de plátano', 'platano'),
    ('Licuado de plátano', 'malteada'),
    ('Ensalada de nopales', 'nopal'),
    ('Ensalada de nopales', 'nopales'),
    ('Ensalada de nopales', 'ensalada')
  ) as v(nombre, termino)
  join public.alimentos_catalogo a
    on a.nombre = v.nombre and a.composicion is not null
on conflict (alimento_id, termino) do nothing;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Los platillos y de qué están hechos:
--   select nombre, porcion, porcion_g, kcal,
--          jsonb_array_length(composicion->'ingredientes') as ingredientes
--     from public.alimentos_catalogo where composicion is not null
--    order by nombre;
--
-- Y que se encuentren:
--   select * from public.buscar_catalogo('chilaquiles', 5);
--   select * from public.buscar_catalogo('pozole', 5);

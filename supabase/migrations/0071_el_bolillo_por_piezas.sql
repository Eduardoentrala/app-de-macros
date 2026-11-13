-- =====================================================================
--  MÁS ALIMENTOS EN EL CATÁLOGO
--
--  1 alimentos nuevos y 4 sinónimos. Mismo origen que los 164
--  de la 0019: USDA SR Legacy, por 100 g, sin tocar, cada uno con su
--  fdc_id y la descripción original para poder auditarlo.
--
--  POR QUÉ ESTA MIGRACIÓN Y NO REGENERAR LA 0019
--
--  La 0019 es el fichero generado y ya tiene estos dentro: se regeneró
--  entera desde curado.mjs el 2026-11-13. Pero en producción ya corrió, y
--  volver a pegarla haría un `on conflict do update` sobre los 164 que
--  ya estaban. Eso normalmente no cambia nada —los números de USDA son
--  los mismos— salvo en un caso: un alimento que alguien haya corregido
--  a mano desde el panel de admin. Ese se perdería, y en silencio.
--
--  Así que aquí van SOLO los nuevos. El delta se sacó comparando la 0019
--  regenerada contra la que estaba en el repo, no a mano.
--
--  Generado por supabase/alimentos/delta (ver el commit) el 2026-11-13.
--  Depende de 0018 y 0019.
-- =====================================================================

insert into public.alimentos_catalogo
(nombre, categoria, estado, kcal, proteina, carbos, grasas,
   porcion, porcion_g, fdc_id, nombre_usda)
values
  ('Bolillo (pieza)', 'panes', 'unico', 293, 9.9, 52.7, 4.3, 'oz', 28, 175031, 'Rolls, hard (includes kaiser)')
on conflict (nombre, estado) do nothing;


-- Sinónimos. Se resuelven por nombre+estado para no depender de los id.
--
-- `do nothing` y no `do update`: si esto se corre dos veces no pasa nada,
-- y si alguien añadió un sinónimo suyo desde el panel, se queda.
insert into public.alimentos_sinonimos (alimento_id, termino)
select a.id, v.termino
  from (values
    ('Bolillo (pieza)', 'unico', 'bolillo'),
    ('Bolillo (pieza)', 'unico', 'telera'),
    ('Bolillo (pieza)', 'unico', 'pan'),
    ('Bolillo (pieza)', 'unico', 'pieza')
  ) as v(nombre, estado, termino)
  join public.alimentos_catalogo a
    on a.nombre = v.nombre and a.estado::text = v.estado
on conflict (alimento_id, termino) do nothing;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Cuántos ingredientes hay ahora (debe dar 223):
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

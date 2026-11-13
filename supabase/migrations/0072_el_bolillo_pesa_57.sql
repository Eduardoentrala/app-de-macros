-- =====================================================================
--  EL BOLILLO, POR PIEZAS
--
--  El mismo pan, pedido de dos formas:
--
--    · «Bolillo»          → en gramos, para quien lo pesa
--    · «Bolillo (pieza)»  → de uno en uno, para quien se come un bolillo
--
--  Dos filas y no una porque la base tiene `unique (nombre, estado)` y
--  porque una fila solo puede pedirse de una forma. Que el nombre diga
--  cuál es cada una es lo que permite distinguirlas al buscar; las dos
--  salen con «bolillo», «telera» y «pan».
--
--  LOS 57 g NO ME LOS INVENTÉ. Salen del mismo registro de USDA que ya
--  da los macros —«Rolls, hard (includes kaiser)», fdc 175031—, de su
--  tabla de porciones. Ese registro trae dos:
--
--      seq 1   oz                     28.35 g
--      seq 2   roll (3-1/2" dia)      57 g
--
--  La tubería se queda siempre con la de menor `seq_num`, que aquí es
--  la onza; por eso la fila de arriba tiene `porcion = 'oz'` y por eso
--  no servía de nada: nadie se come una onza de pan.
--
--  OJO CON LO QUE ES: 57 g es el panecillo duro de USDA, no el bolillo
--  de tu panadería, que suele andar entre 60 y 80. Para quien pesa el
--  suyo está la fila en gramos, que es la buena.
--
--  POR QUÉ ESTA MIGRACIÓN APARTE Y NO EN LA 0019
--
--  Se intentó meter `unidad` y `pieza_g` en lo que genera la tubería.
--  No se puede: la 0019 corre antes que la 0023 y la 0033, que son las
--  que crean esas dos columnas. Al regenerar, el esquema reventaba con
--  «column "unidad" does not exist».
--
--  Así que la fila nace en gramos en la 0071 y aquí se le pone el peso,
--  que es exactamente lo que hacen la 0023 con el huevo y la 0028 con
--  la tortilla. El patrón ya estaba; solo había que verlo.
--
--  Depende de 0071 (la fila), 0023 (`pieza_g`) y 0033 (`unidad`).
-- =====================================================================

update public.alimentos_catalogo
   set pieza_g = 57,
       unidad  = 'Pieza'
 where nombre = 'Bolillo (pieza)';


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Los dos bolillos, uno en gramos y otro por piezas:
--   select nombre, unidad, pieza_g, kcal,
--          round(kcal * coalesce(pieza_g, 100) / 100) as kcal_de_una
--     from public.alimentos_catalogo
--    where nombre like 'Bolillo%' order by nombre;
--
--   Debe dar:  Bolillo         Gramos  null  293  ->  293 por 100 g
--              Bolillo (pieza) Pieza     57  293  ->  167 por pieza

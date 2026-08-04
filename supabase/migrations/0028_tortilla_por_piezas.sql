-- ---------------------------------------------------------------------
--  La tortilla también se cuenta en piezas
--
--  Mismo caso que el huevo (0023) y con la misma regla: `pieza_g` solo se
--  rellena donde una pieza es algo que existe y no admite discusion. Nadie
--  pesa las tortillas; se dicen "tres tortillas".
--
--  LOS PESOS
--
--  Maiz: 30 g. USDA da 26 g para una de 6 pulgadas, pero la tortilla que se
--  come en Mexico es algo mas gruesa. A 30 g salen ~67 calorias por pieza,
--  que es lo que se mide en la realidad. Quedarse en los 26 de USDA seria
--  fiel a la fuente y falso en la mesa.
--
--  Harina: 48 g, el numero de USDA tal cual. Ahi su `porcion` ya era
--  'tortilla' y no una onza, o sea que la fuente si esta hablando de una
--  pieza. Es la mas variable de las dos -de taco a burrito hay el doble de
--  peso- pero 48 g es la medida corriente y es auditable.
--
--  `porcion` y `porcion_g` se quedan intactos: son el dato contra el que se
--  audita. `pieza_g` es otra cosa y por eso vive aparte.
-- ---------------------------------------------------------------------

update public.alimentos_catalogo set pieza_g = 30 where nombre = 'Tortilla de maíz';
update public.alimentos_catalogo set pieza_g = 48 where nombre = 'Tortilla de harina';

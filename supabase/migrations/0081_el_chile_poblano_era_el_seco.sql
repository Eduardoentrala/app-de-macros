-- =====================================================================
--  0081 — El chile poblano del catálogo era el SECO
--
--  Salió repasando el catálogo con una pregunta sencilla: ¿hay alguna
--  fruta o verdura con más calorías de las que puede tener? Lo fresco
--  no pasa de 90 kcal por 100 g salvo el aguacate. Saltó una sola:
--
--      Chile poblano · verduras · crudo
--      345 kcal · P12.4 · C51.1 · G15.9
--
--  Doce gramos de proteína y cincuenta de carbohidrato en algo que es
--  casi todo agua. Esos son los números del chile ANCHO, que es el
--  poblano seco. Un poblano fresco anda por las 20 kcal: apuntar 100 g
--  daba 397 por la cuenta de la app, veinte veces de más.
--
--  Y NO FUE UN DEDAZO AL TECLEAR. La fila traía `fdc_id = 168579`, que
--  es la entrada de USDA del chile seco: el error fue elegir mal al
--  importarlo. Por eso se le quita el identificador —dejarlo apuntando
--  al seco con números de fresco sería mentir en la pista de auditoría
--  que esa columna existe para dar— y se deja escrito en `nombre_usda`
--  de dónde salen los nuevos.
--
--  Los demás chiles del catálogo ya estaban bien y sirven de referencia:
--  jalapeño 29 kcal, serrano 32, pimiento morrón 26. El poblano a 20
--  queda donde tiene que quedar.
--
--  No hay nada que corregir en los diarios: el único «poblano» apuntado
--  es «Mole poblano preparado», que es un platillo y lleva sus propios
--  macros.
--
--  Depende de 0018.
-- =====================================================================

update public.alimentos_catalogo
   set kcal        = 20,
       proteina    = 0.9,
       carbos      = 4.6,
       grasas      = 0.2,
       fdc_id      = null,
       nombre_usda = 'Pepper, raw, poblano (FNDDS 75121400)'
 where nombre = 'Chile poblano'
   and estado = 'crudo'
   and kcal > 300;        -- solo si todavía tiene los números del seco

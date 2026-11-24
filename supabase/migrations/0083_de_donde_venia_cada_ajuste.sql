-- =====================================================================
--  0083 — De dónde venía cada ajuste
--
--  `chequeos_semanales.cal_antes` guardaba el valor de DESPUÉS.
--
--  El cierre hacía esto, en el mismo `then` y por este orden:
--
--      if(r.ajusto && r.cal_nueva) aplicarCaloriasNuevas(r.cal_nueva);
--      guardarChequeo(r, laFoto);
--
--  y dentro de `guardarChequeo`, `cal_antes` se leía de las metas con
--  un `datosDeLaSemana().meta_cal`. Para entonces las metas ya estaban
--  cambiadas, así que la columna «de dónde venía» guardaba a dónde
--  acababa de llegar.
--
--  La app ya no lo hace: desde hoy `cal_antes` sale de la misma foto
--  que lleva `meta_p/c/g`, tomada antes de hablar con el modelo. Esta
--  migración arregla las filas que ya estaban escritas.
--
--  QUÉ SE ESCRIBIÓ Y QUÉ ERA. Solo las semanas que ajustaron: en las
--  que no cambian nada, antes y después son lo mismo y la columna
--  quedó bien.
--
--      semana        guardado         de verdad
--      2026-09-01    2253 -> 2250     2451 -> 2250    (-201, no -3)
--      2026-09-15    2100 -> 2100     2253 -> 2100    (-153, no  0)
--      2026-09-29    2001 -> 2000     2100 -> 2000    (-100, no -1)
--      2026-10-13    1848 -> 1850     2001 -> 1850    (-151, no +2)
--      2026-10-20    1947 -> 1950     1848 -> 1950    (+99,  no +3)
--      2026-11-24    2046 -> 2047     1947 -> 2047    (+99,  no +1)
--
--  NO SE INVENTA NADA. El valor bueno está en la propia fila: son sus
--  `meta_p`, `meta_c` y `meta_g`, que son las metas de la semana que se
--  cerró y se guardaron ANTES de aplicar el cambio. La cuenta es la
--  misma que hace la app, 4/4/9.
--
--  POR QUÉ IMPORTA Y NO ES COSMÉTICO. Dos sitios lo leen:
--
--   · La tarjeta de «Mis semanas» pinta `cal_antes` como la meta de esa
--     semana, al lado de unos macros que suman otra cosa. En la pantalla
--     del 24 de noviembre: «Calorías 1958 / 2046» con macros de 1947.
--   · Y el cierre del lunes se lo manda al modelo bajo el rótulo
--     «AJUSTES QUE YA SE LE HICIERON: de X a Y». Con esto, el modelo
--     leía que cada escalón había movido tres calorías y decidía el
--     siguiente sobre esa base.
--
--  SOLO DONDE HAY CON QUÉ. Las filas sin `meta_p/c/g` —las de agosto,
--  anteriores a que la foto se guardara— se quedan como están: no hay
--  de dónde sacar el número bueno y escribir una estimación en una
--  columna de historial es peor que dejar lo que hay.
--
--  Y SOLO SI NO CUADRA YA. El `where` compara: una fila correcta no se
--  toca, y volver a correr esto no cambia nada.
-- =====================================================================

update public.chequeos_semanales
   set cal_antes = round(meta_p * 4 + meta_c * 4 + meta_g * 9)
 where ajusto = true
   and meta_p is not null
   and meta_c is not null
   and meta_g is not null
   and cal_antes is distinct from round(meta_p * 4 + meta_c * 4 + meta_g * 9);


-- ---------------------------------------------------------------------
--  Comprobación
--
--    select semana, cal_antes, cal_despues,
--           round(meta_p*4 + meta_c*4 + meta_g*9) as segun_sus_metas
--      from public.chequeos_semanales
--     where ajusto and meta_p is not null
--     order by semana;
--
--  Las dos últimas columnas tienen que coincidir en todas las filas.
-- ---------------------------------------------------------------------

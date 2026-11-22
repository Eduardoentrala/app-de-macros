-- =====================================================================
--  0080 — El mismo alimento no se da de alta dos veces por una mayúscula
--
--  Buscó «Chicharron» y le salieron TRES tarjetas con la misma letra:
--
--      chicharron de cerdo   P 61g · C 0g · G 35g · 559kcal · Gramos
--      chicharron de cerdo   P 61g · C 0g · G 35g · 559kcal · Gramos
--      Chicharron de cerdo   P 61g · C 0g · G 35g · 559kcal · Gramos
--
--  Dos causas a la vez. Una es de la app —esa franja junta la despensa
--  con lo dado de alta en el catálogo, y ya deduplica lo que se lee
--  igual—. La otra es de aquí:
--
--  EL ÍNDICE ÚNICO ERA `(nombre, estado)`, y Postgres compara el texto
--  tal cual. «chicharron de cerdo» y «Chicharron de cerdo» son dos filas
--  distintas para él, igual que lo serían con un espacio de más al
--  final. En todo el catálogo había dos pares así.
--
--  Depende de 0018 (que creó la tabla y el único viejo).
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. La barbacoa NO era la misma fila dos veces
--
--  Al mirarlas antes de tocar nada, los números no coincidían:
--
--      177  barbacoa   172.3 kcal   P20.8  C0.9  G9.5
--      256  Barbacoa   228.2 kcal   P23.0  C0.3  G15.0
--
--  Cincuenta y seis calorías y cinco gramos y medio de grasa. Eso no es
--  un duplicado, son dos cosas distintas compartiendo nombre, y apagar
--  una habría cambiado en silencio lo que cuenta cualquiera que apunte
--  «barbacoa». Se quedan las dos, con el nombre que las distingue.
--
--  Por nombre y no por id: en otra base los ids serían otros.
-- ---------------------------------------------------------------------
update public.alimentos_catalogo
   set nombre = 'Barbacoa de res'
 where nombre = 'barbacoa' and estado = 'unico';

update public.alimentos_catalogo
   set nombre = 'Barbacoa de borrego'
 where nombre = 'Barbacoa' and estado = 'unico';


-- ---------------------------------------------------------------------
--  2. El chicharrón SÍ lo era
--
--      179  chicharron de cerdo   559 kcal  P61 C0 G35   porcion_g 100
--      206  Chicharron de cerdo   559 kcal  P61 C0 G35   porcion_g —
--
--  Mismos macros y encima sin `porcion_g`, que es lo que permite
--  convertir una porción a gramos. Sobra entera.
--
--  SE APAGA, NO SE BORRA: `buscar_catalogo` filtra por `activo`, así que
--  deja de salir, y la fila sigue ahí por si alguien la quiere de vuelta.
--  Es lo mismo que hace la 0007 con todo lo demás.
-- ---------------------------------------------------------------------
update public.alimentos_catalogo
   set activo = false
 where nombre = 'Chicharron de cerdo' and estado = 'unico';


-- ---------------------------------------------------------------------
--  3. Y que no vuelva a entrar ninguno
--
--  PARCIAL SOBRE `activo`, como los únicos de la 0007 sobre lo no
--  archivado. Una fila apagada ya no se busca, así que no tiene por qué
--  seguir reservando su nombre — y es justo lo que permite apagar un
--  duplicado en vez de borrarlo.
--
--  El `unique (nombre, estado)` de la 0018 se queda: cubre también las
--  apagadas y no estorba a este.
-- ---------------------------------------------------------------------
create unique index if not exists uq_catalogo_nombre_llano
    on public.alimentos_catalogo (lower(btrim(nombre)), estado)
 where activo;

comment on index public.uq_catalogo_nombre_llano is
  'El mismo alimento no se da de alta dos veces por una mayúscula o un espacio.';

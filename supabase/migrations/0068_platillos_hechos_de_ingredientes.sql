-- =====================================================================
--  SITIO PARA LOS PLATILLOS
--
--  El catálogo tenía 222 alimentos y todos eran INGREDIENTES. Nadie
--  apunta «100 g de maíz nixtamalizado»: apunta unos chilaquiles, un
--  pozole, una torta. Para registrar la comida del domingo había que
--  desglosarla en seis ingredientes o escribirla a mano con macros a
--  ojo, que es justo donde entran los números inventados.
--
--  DE DÓNDE SALEN LAS MACROS DE UN PLATILLO
--
--  No de una tabla. USDA tiene «taco», «burrito» y «enchilada», pero en
--  su sección de comida rápida: son la versión americana y un taco de
--  ahí no es un taco de aquí. Copiar esas cifras habría sido poner un
--  número con pinta de auditado que no describe lo que nadie se comió.
--
--  Un platillo es UNA RECETA: qué ingredientes del catálogo y cuántos
--  gramos de cada uno. Las macros se suman de ahí, y cada ingrediente ya
--  trae su `fdc_id`. La cuenta se puede rehacer entera.
--
--  Esa receta es lo que guarda `composicion`. No es decoración: es lo
--  que hace que la fila sea auditable, igual que `fdc_id` lo hace en las
--  de USDA. Por eso el `check` de abajo exige una de las dos cosas.
--
--  Y se puede discutir: si en tu casa los chilaquiles llevan más queso,
--  se cambia el gramaje en `platillos.mjs` y se regenera. Discutir un
--  gramaje es una conversación; discutir un «273 kcal» sacado de una
--  tabla de otro país no lo es.
--
--  Depende de 0018.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. NO HAY CATEGORÍA NUEVA, Y NO POR PEREZA
--
--  Lo primero que se intentó fue `alter type categoria_alimento add
--  value 'platillos'`, que es lo que pide el cuerpo. No se puede:
--
--    ERROR: unsafe use of new value "platillos" of enum type
--
--  Postgres añade el valor, pero NO deja usarlo hasta que la transacción
--  que lo añadió haya terminado. Y aquí eso no es un detalle: el editor
--  SQL de Supabase envuelve el script que pegas en una transacción, y
--  `instalar.sql` —el fichero de instalación desde cero— concatena todas
--  las migraciones y las corre juntas. O sea que la categoría nueva y la
--  primera fila que la usara nunca pueden ir en el mismo viaje. Lo cazó
--  `generar`, que aplica el instalador entero.
--
--  Se podría partir en dos migraciones con un aviso de «esta córrela
--  sola». Un aviso que hay que recordar es un fallo esperando su turno.
--
--  Así que los platillos van en 'otros' y lo que los distingue es tener
--  `composicion`, que además es la verdad: un platillo ES una fila hecha
--  de otras filas. Para separarlos no hace falta una etiqueta nueva,
--  basta con mirar si tiene receta.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
--  2. De qué está hecho
--
--  Forma:
--    { "porcion_g": 275,
--      "ingredientes": [ {"nombre":"Totopos","estado":"unico","gramos":60}, ... ] }
--
--  Null en todo lo que viene de USDA, que se audita por `fdc_id`.
-- ---------------------------------------------------------------------
alter table public.alimentos_catalogo
  add column if not exists composicion jsonb;

comment on column public.alimentos_catalogo.composicion is
  'Solo en los platillos: los ingredientes y gramos de los que salen sus '
  'macros. Lo que hace la fila auditable cuando no hay fdc_id.';


-- ---------------------------------------------------------------------
--  3. Toda fila tiene que poder auditarse
--
--  O viene de USDA y lleva su `fdc_id`, o es un plato y lleva su receta.
--  Sin una de las dos, nadie puede saber de dónde salieron esos números
--  —y el catálogo entero se apoya en que siempre se puede saber—.
--
--  `not valid` + `validate` en dos pasos: así, si alguna fila vieja no
--  cumpliera, la migración lo dice en vez de reventar a medias.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'alimentos_catalogo_auditable') then
    alter table public.alimentos_catalogo
      add constraint alimentos_catalogo_auditable
      check (fdc_id is not null or composicion is not null) not valid;
  end if;
end $$;

alter table public.alimentos_catalogo
  validate constraint alimentos_catalogo_auditable;


-- ---------------------------------------------------------------------
--  Comprobaciones
-- ---------------------------------------------------------------------
-- Que la categoría exista:
--   select unnest(enum_range(null::public.categoria_alimento));
--
-- Que ninguna fila se quede sin forma de auditarla (debe dar 0):
--   select count(*) from public.alimentos_catalogo
--    where fdc_id is null and composicion is null;

// El catálogo tenía 164 alimentos y todos eran INGREDIENTES.
//
// Buenos: salen de USDA, por 100 g, sin tocar, con su `fdc_id` y la
// descripción original para poder auditarlos. Pero faltaba media despensa
// mexicana de diario —chorizo, frijoles refritos, queso fresco, totopos,
// salsa verde, jícama, mamey— y sin eso, apuntar la comida del domingo
// acaba en «créalo a mano con macros a ojo», que es justo donde entran
// los números inventados.
//
// Ahora son 224. Esta prueba NO comprueba que los macros sean correctos
// —eso lo garantiza la tubería, que los copia de USDA sin tocarlos y
// anota de qué fila salieron—. Comprueba lo que sí se puede romper al
// añadir: que no haya duplicados, que las categorías existan, que los
// macros cuadren con las calorías, y que lo nuevo SE ENCUENTRE AL
// BUSCARLO, que es lo único que le importa a quien apunta la cena.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, mal = 0;
const check = (n, c, e = '') => {
  if (c) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${e ? '\n        ' + e : ''}`); }
};
const todas = async (sql) => (await db.query(sql)).rows;
const uno = async (sql) => (await todas(sql))[0];

// ====================================================================
console.log('\n— Están todos y una sola vez —');
{
  const { n } = await uno('select count(*)::int as n from public.alimentos_catalogo');
  const { ing } = await uno(`select count(*)::int as ing from public.alimentos_catalogo
                              where composicion is null`);
  const { pla } = await uno(`select count(*)::int as pla from public.alimentos_catalogo
                              where composicion is not null`);
  check(`hay ${n} filas: ${ing} ingredientes y ${pla} platillos`,
    ing === 222 && pla === 18, 'se esperaban 222 y 18');

  // La `unique (nombre, estado)` ya lo impide en la base, así que esto
  // vigila lo que la restricción NO ve: el mismo alimento metido dos
  // veces con distinto estado sin que cambie nada al cocinarlo.
  const repes = await todas(`
    select nombre, count(*)::int as veces,
           count(distinct (kcal, proteina, carbos, grasas))::int as distintos
      from public.alimentos_catalogo group by nombre
     having count(*) > 1 and count(distinct (kcal, proteina, carbos, grasas)) = 1`);
  check('ninguno está dos veces con los mismos macros', repes.length === 0,
    repes.map((r) => r.nombre).join(', ') +
    '\n        desdoblar crudo/cocido solo tiene sentido si los números cambian');

  // Y que la migración nueva no tocó los que ya estaban.
  const { n: viejos } = await uno(`
    select count(*)::int as n from public.alimentos_catalogo
     where nombre in ('Pechuga de pollo','Arroz blanco','Tortilla de maíz','Aguacate')`);
  check('los de siempre siguen ahí', viejos >= 4, 'salieron ' + viejos);
}

// ====================================================================
console.log('\n— Y los números tienen sentido —');
{
  const locos = await todas(`
    select nombre, kcal, proteina, carbos, grasas
      from public.alimentos_catalogo
     where kcal > 920 or proteina > 100 or carbos > 100 or grasas > 100`);
  // 920 y no 900: la manteca de cerdo son 902 kcal por 100 g, que es lo
  // que pesa una grasa pura. El tope de 900 que venía en el comentario
  // de la 0019 la marcaba desde el primer día, y una comprobación que
  // siempre enseña la misma fila no la mira nadie.
  check('ninguno tiene macros imposibles', locos.length === 0,
    locos.map((x) => x.nombre).join(', '));

  // Las calorías tienen que salir de los macros. Se deja un margen ancho
  // —±30%— porque USDA mide las calorías con factores Atwater propios de
  // cada alimento y no con el 4/4/9 de libro, y porque la fibra y el
  // alcohol no están en estas cuatro columnas. Lo que caza un margen así
  // es una cifra puesta en la columna equivocada, que es el error que de
  // verdad pasa.
  const descuadran = await todas(`
    select nombre, estado, kcal,
           round(proteina*4 + carbos*4 + grasas*9) as por_macros
      from public.alimentos_catalogo
     where kcal >= 20
       and nombre <> 'Cerveza'
       and abs(kcal - (proteina*4 + carbos*4 + grasas*9)) > kcal * 0.30
       and abs(kcal - (proteina*4 + carbos*4 + grasas*9)) > 25
     order by abs(kcal - (proteina*4 + carbos*4 + grasas*9)) desc`);
  // LA CERVEZA ESTÁ EXENTA Y ES UN PROBLEMA, no una excepción cómoda.
  //
  // `diary_entries.calories` es una columna GENERADA: `protein_g*4 +
  // carbs_g*4 + fat_g*9`. El alcohol tiene 7 kcal por gramo y no es
  // ninguna de las tres cosas, así que la app no sabe contarlo. Una
  // cerveza son 43 kcal por 100 g y el anillo cuenta 16: un tarro de 355
  // ml son ~153 reales y se apuntan 58.
  //
  // Por eso NO se añadieron vino ni destilados al ampliar el catálogo:
  // habrían entrado como 11 y como 0. La cerveza ya estaba desde la 0019
  // y quitarla es una decisión de producto —hay diarios con ella—, así
  // que queda aquí señalada en vez de escondida. El arreglo de verdad es
  // que el diario pueda llevar calorías que no salgan de los macros, y
  // eso es cambiar una columna generada.
  //
  // El filtro de antes era `kcal > 50` y dejaba la cerveza fuera por
  // debajo: el problema estaba, pero la prueba no lo enseñaba.
  //
  // Y hace falta un margen ABSOLUTO además del porcentual. El limón son
  // 29 kcal y sus macros dan 44 —la fibra cuenta como carbohidrato en
  // esas columnas pero no da calorías—, o sea un 52% de desvío sobre una
  // cifra diminuta. Con solo el porcentaje, cualquier verdura fibrosa
  // salta. Lo que se busca es una cifra puesta en la columna equivocada,
  // y eso mueve decenas de calorías, no quince.
  check('y las calorías cuadran con los macros', descuadran.length === 0,
    descuadran.slice(0, 6).map((x) => `${x.nombre} [${x.estado}]: dice ${x.kcal}, los macros dan ${x.por_macros}`).join('\n        '));
}

// ====================================================================
console.log('\n— Y lo nuevo se encuentra al buscarlo —');
{
  // Esto es lo único que importa de verdad: que al teclear «chorizo»
  // salga el chorizo. Se usa `buscar_catalogo`, que es la que llama la
  // app, no un `like` inventado para la prueba.
  const BUSCAR = [
    ['chorizo', 'Chorizo'],
    ['refritos', 'Frijoles refritos'],
    ['queso fresco', 'Queso fresco'],
    ['totopos', 'Totopos'],
    ['salsa verde', 'Salsa verde'],
    ['jicama', 'Jícama'],
    ['mamey', 'Mamey'],
    ['salchicha', 'Salchicha'],
    ['aceitunas', 'Aceitunas'],
    ['cajeta', 'Cajeta'],
  ];
  for (const [texto, esperado] of BUSCAR) {
    const r = await todas(`select nombre from public.buscar_catalogo('${texto}', 8)`);
    check(`«${texto}» encuentra ${esperado}`,
      r.some((x) => x.nombre === esperado),
      'salió: ' + (r.map((x) => x.nombre).join(', ') || '(nada)'));
  }

  // Y por SINÓNIMO, que es como se busca de verdad: nadie teclea el
  // nombre exacto del catálogo.
  const POR_SINONIMO = [
    ['hot dog', 'Salchicha'],
    ['nachos', 'Totopos'],
    ['ricotta', 'Requesón'],
    ['nutella', 'Crema de avellana'],
    ['carnitas', 'Maciza de cerdo'],
    ['puerro', 'Poro'],
    ['guisante', 'Chícharo'],
  ];
  for (const [texto, esperado] of POR_SINONIMO) {
    const r = await todas(`select nombre from public.buscar_catalogo('${texto}', 8)`);
    check(`y «${texto}» lleva a ${esperado}`,
      r.some((x) => x.nombre === esperado),
      'salió: ' + (r.map((x) => x.nombre).join(', ') || '(nada)'));
  }
}

// ====================================================================
console.log('\n— Y volver a correr la migración no estropea nada —');
{
  // Se aplica a mano desde el panel, así que puede acabar corriéndose
  // dos veces. Con `do nothing` eso no puede doler, pero más vale verlo.
  const antes = (await uno('select count(*)::int as n from public.alimentos_catalogo')).n;
  const antesSin = (await uno('select count(*)::int as n from public.alimentos_sinonimos')).n;
  await db.exec(readFileSync(join(MIG, '0067_mas_alimentos.sql'), 'utf8'));
  const despues = (await uno('select count(*)::int as n from public.alimentos_catalogo')).n;
  const despuesSin = (await uno('select count(*)::int as n from public.alimentos_sinonimos')).n;
  check('correrla dos veces no duplica alimentos', antes === despues,
    antes + ' -> ' + despues);
  check('ni sinónimos', antesSin === despuesSin, antesSin + ' -> ' + despuesSin);
}

// ====================================================================
console.log('\n— Y la lista curada y el SQL dicen lo mismo —');
{
  // El SQL se genera desde `curado.mjs`. Si alguien edita el SQL a mano
  // —que la cabecera prohíbe— o añade a la lista y no regenera, las dos
  // cosas se separan y nadie lo nota hasta que falta un alimento.
  const { CATALOGO } = await import(
    'file://' + join(AQUI, '..', 'alimentos', 'curado.mjs').replace(/\\/g, '/'));
  // Sin los platillos: esos no salen de `curado.mjs` sino de
  // `platillos.mjs`, y se comprueban por su cuenta más abajo.
  const enBase = await todas(`select nombre, estado from public.alimentos_catalogo
                               where composicion is null`);
  const clave = (n, e) => n + '|' + e;
  const base = new Set(enBase.map((x) => clave(x.nombre, x.estado)));
  const lista = CATALOGO.map((x) => clave(x.n, x.e));

  check(`la lista curada tiene ${CATALOGO.length} entradas`, CATALOGO.length === base.size,
    'curado.mjs: ' + CATALOGO.length + ' · base: ' + base.size);
  const faltan = lista.filter((k) => !base.has(k));
  check('y todas acabaron en la base', faltan.length === 0,
    'en curado.mjs y no en el SQL: ' + faltan.join(', ') +
    '\n        hay que volver a pasar resolver.mjs');
}

// ====================================================================
console.log('\n— Y los platillos salen de sus ingredientes —');
{
  // ESTO ES LO QUE SOSTIENE UN PLATILLO. Un ingrediente se audita contra
  // USDA por su `fdc_id`; un platillo no tiene eso, porque sus números no
  // los copió de ninguna tabla. Lo que tiene es la receta, y la promesa
  // es que sus macros son EXACTAMENTE la suma de esa receta.
  //
  // Así que la cuenta se rehace aquí, en SQL, desde `composicion` y desde
  // las filas de los ingredientes. Si alguien toca un número a mano —o si
  // un ingrediente cambia y nadie regenera— los dos lados dejan de
  // cuadrar y esto se pone rojo.
  const descuadre = await todas(`
    with partes as (
      select p.nombre as plato,
             (p.composicion->>'porcion_g')::numeric as peso,
             (i->>'nombre') as ing_nombre,
             (i->>'estado') as ing_estado,
             (i->>'gramos')::numeric as gramos
        from public.alimentos_catalogo p,
             jsonb_array_elements(p.composicion->'ingredientes') as i
       where p.composicion is not null
    ), sumas as (
      select pa.plato, pa.peso,
             sum(a.kcal     * pa.gramos / 100) as kcal,
             sum(a.proteina * pa.gramos / 100) as p,
             sum(a.carbos   * pa.gramos / 100) as c,
             sum(a.grasas   * pa.gramos / 100) as g,
             sum(pa.gramos) as peso_sumado
        from partes pa
        join public.alimentos_catalogo a
          on a.nombre = pa.ing_nombre and a.estado::text = pa.ing_estado
       group by pa.plato, pa.peso
    )
    select s.plato, p.kcal as dice,
           round(s.kcal * 100 / s.peso, 1) as suma,
           s.peso, s.peso_sumado
      from sumas s
      join public.alimentos_catalogo p
        on p.nombre = s.plato and p.composicion is not null
     where abs(p.kcal     - s.kcal * 100 / s.peso) > 0.2
        or abs(p.proteina - s.p    * 100 / s.peso) > 0.2
        or abs(p.carbos   - s.c    * 100 / s.peso) > 0.2
        or abs(p.grasas   - s.g    * 100 / s.peso) > 0.2
        or s.peso <> s.peso_sumado`);
  check('las macros de cada plato son la suma de sus partes',
    descuadre.length === 0,
    descuadre.map((x) => `${x.plato}: dice ${x.dice}, la receta da ${x.suma}`).join('\n        ') +
    '\n        hay que volver a pasar platillos.mjs');

  // Y que cada ingrediente de cada receta exista de verdad. El generador
  // se niega a producir nada si falta uno, pero eso protege al generar,
  // no después: basta con que alguien renombre un ingrediente.
  const huerfanos = await todas(`
    select distinct p.nombre as plato, (i->>'nombre') as falta
      from public.alimentos_catalogo p,
           jsonb_array_elements(p.composicion->'ingredientes') as i
     where p.composicion is not null
       and not exists (
         select 1 from public.alimentos_catalogo a
          where a.nombre = (i->>'nombre') and a.estado::text = (i->>'estado'))`);
  check('y todos sus ingredientes siguen en el catálogo', huerfanos.length === 0,
    huerfanos.map((x) => `${x.plato} -> ${x.falta}`).join(', '));

  // Toda fila tiene que poder auditarse por un lado o por el otro. Es lo
  // que dice el `check` de la 0068; esto comprueba que el `check` está
  // puesto de verdad y no solo escrito.
  let rechazo = null;
  try {
    await db.exec(`insert into public.alimentos_catalogo
      (nombre, categoria, estado, kcal, proteina, carbos, grasas)
      values ('Invento', 'otros', 'unico', 100, 1, 1, 1)`);
  } catch (e) { rechazo = e.message.split('\n')[0]; }
  check('y la base no acepta una fila sin forma de auditarla', !!rechazo,
    'entró un alimento sin fdc_id y sin composición: nadie podría saber ' +
    'de dónde salieron esos números');

  // Y los platillos se encuentran al buscarlos, que es el punto.
  for (const [texto, esperado] of [
    ['chilaquiles', 'Chilaquiles verdes con pollo'],
    ['pozole', 'Pozole de pollo'],
    ['torta', 'Torta de jamón'],
    ['guacamole', 'Guacamole'],
    ['sincronizada', 'Sincronizada'],
    ['licuado', 'Licuado de plátano'],
  ]) {
    const r = await todas(`select nombre from public.buscar_catalogo('${texto}', 8)`);
    check(`«${texto}» encuentra ${esperado}`, r.some((x) => x.nombre === esperado),
      'salió: ' + (r.map((x) => x.nombre).join(', ') || '(nada)'));
  }

  // Y cada plato dice cuánto pesa una porción. Sin eso hay que pesar los
  // chilaquiles, que es justo lo que estos existen para evitar.
  const sinPorcion = await todas(`
    select nombre from public.alimentos_catalogo
     where composicion is not null and (porcion is null or porcion_g is null)`);
  check('y todos dicen cuánto pesa una porción', sinPorcion.length === 0,
    sinPorcion.map((x) => x.nombre).join(', '));

  // Y SE PIDEN POR PORCIÓN, que es la mitad de la gracia de tenerlos.
  //
  // La app ofrece el catálogo en gramos a propósito: la «porción» de
  // USDA es texto como «cup, chopped» y no dice cuánto pesa una unidad
  // de comer, así que «1 pieza» de espagueti acababa siendo una taza.
  // Un platillo sí lo sabe —un taco pesa 90 g porque se sumaron sus
  // ingredientes—, así que usa el camino que ya existe, `unidad` +
  // `pieza_g`, y se apunta como «1 taco», no como «90 gramos de taco».
  // Sin esto serían tan incómodos de apuntar como desglosarlos a mano.
  const porGramos = await todas(`
    select nombre, unidad, pieza_g, porcion_g from public.alimentos_catalogo
     where composicion is not null
       and (unidad <> 'Servicio' or pieza_g is null or pieza_g <> porcion_g)`);
  check('se piden por porción y no por gramos', porGramos.length === 0,
    porGramos.map((x) => `${x.nombre}: unidad ${x.unidad}, pieza_g ${x.pieza_g}`).join('\n        '));

  // Y los macros siguen siendo POR 100 g, que es como la app los
  // convierte usando el peso. Con `macros_por = 'unidad'` los tomaría
  // tal cual y un taco contaría 151 kcal en vez de las 136 que son.
  const porUnidad = await todas(`
    select nombre from public.alimentos_catalogo
     where composicion is not null and macros_por <> '100g'`);
  check('y sus macros siguen siendo por 100 g', porUnidad.length === 0,
    porUnidad.map((x) => x.nombre).join(', '));

  // Y ESE PESO ES EL DE LA RECETA. La columna `porcion_g` es la que usa
  // la app para convertir «me comí un plato» en gramos; la receta vive
  // en el jsonb. Si se separan, la app escala con un peso y los macros
  // son de otro, y el error no se ve por ningún lado.
  //
  // Lo pilló una mutación: cambiando solo la columna de 150 a 180 g, la
  // comprobación de «la suma cuadra» seguía verde —porque esa compara el
  // jsonb contra los ingredientes— y nadie miraba la columna.
  const pesoTorcido = await todas(`
    select nombre, porcion_g as columna,
           (composicion->>'porcion_g')::int as receta
      from public.alimentos_catalogo
     where composicion is not null
       and porcion_g is distinct from (composicion->>'porcion_g')::int`);
  check('y ese peso es el mismo que el de la receta', pesoTorcido.length === 0,
    pesoTorcido.map((x) => `${x.nombre}: la columna dice ${x.columna} y la receta ${x.receta}`).join('\n        '));

  // Y que la receta sea una receta. Un `composicion` con la forma
  // cambiada —sin `ingredientes`— pasa el `check` de la base (no es
  // null) y deja la comprobación de la suma sin filas que comparar: cero
  // descuadres por no tener nada que cuadrar. Verde por no mirar.
  const sinReceta = await todas(`
    select nombre from public.alimentos_catalogo
     where composicion is not null
       and coalesce(jsonb_array_length(composicion->'ingredientes'), 0) < 2`);
  check('y la receta tiene ingredientes de verdad', sinReceta.length === 0,
    sinReceta.map((x) => x.nombre).join(', ') +
    '\n        un platillo de un solo ingrediente no es un platillo, y uno ' +
    'de cero deja la comprobación de la suma sin nada que comparar');
}

console.log('\n' + ok + ' pasan · ' + mal + ' fallan');
process.exit(mal ? 1 : 0);

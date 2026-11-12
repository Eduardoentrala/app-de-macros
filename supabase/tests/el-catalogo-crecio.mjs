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
  check(`hay ${n} alimentos`, n === 222, 'se esperaban 222');

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
  const enBase = await todas('select nombre, estado from public.alimentos_catalogo');
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

console.log('\n' + ok + ' pasan · ' + mal + ' fallan');
process.exit(mal ? 1 : 0);

// Dar de alta algo por piezas sin saber cuanto pesa una.
//
// Hasta ahora la base lo prohibia, y con buena razon: los macros del catalogo
// van por 100 g, asi que sin el peso de una pieza no hay con que convertir.
//
// Pero eso obliga a saber un dato que casi nunca se tiene. De un huevo o de
// una barrita sabes lo que dice la caja -los macros de UNA- y no lo que pesa.
// Y quien lo da de alta acaba inventandose un peso para poder pasar, que es
// PEOR que no pedirlo: un peso inventado se propaga a todas las cantidades.
//
// Ahora se dice explicitamente a que se refieren los macros de la fila. Lo
// que esta prueba fija es que las dos formas convivan y que la base siga
// impidiendo las combinaciones que no significan nada.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const meter = async (campos) => {
  const c = Object.assign({
    nombre: 'X' + Math.random().toString(36).slice(2, 8),
    categoria: 'otros', estado: 'crudo',
    proteina: 6.3, carbos: 0.4, grasas: 5.3, kcal: 75,
    unidad: 'Gramos', pieza_g: null, macros_por: '100g',
  }, campos);
  const cols = Object.keys(c).join(', ');
  const vals = Object.keys(c).map((_, i) => '$' + (i + 1)).join(', ');
  try {
    await db.query(
      `insert into public.alimentos_catalogo (${cols}) values (${vals})`,
      Object.values(c));
    return null;
  } catch (e) { return e.message.split('\n')[0]; }
};

// ------------------------------------------------------------------
console.log('\n— Lo de siempre sigue igual —');
{
  check('en gramos, macros por 100 g', (await meter({})) === null);
  check('en piezas CON el peso de una',
    (await meter({ unidad: 'Pieza', pieza_g: 50 })) === null);
  check('y en piezas SIN peso y con macros por 100 g, sigue prohibido',
    (await meter({ unidad: 'Pieza', pieza_g: null })) !== null,
    'sin ese peso no hay forma de convertir: la app ensenaria "1 pieza = 0 cal"');
}

// ------------------------------------------------------------------
console.log('\n— Y lo nuevo: los macros son los de UNA —');
{
  check('en piezas, sin peso, diciendo que los macros son de una',
    (await meter({ unidad: 'Pieza', pieza_g: null, macros_por: 'unidad' })) === null,
    'es justo lo que se pedia poder hacer');
  check('en servicios igual',
    (await meter({ unidad: 'Servicio', pieza_g: null, macros_por: 'unidad' })) === null);
  // Se puede saber el peso Y tener los macros por unidad: no se estorban.
  check('y con peso tambien vale, si se sabe',
    (await meter({ unidad: 'Pieza', pieza_g: 50, macros_por: 'unidad' })) === null);
}

// ------------------------------------------------------------------
console.log('\n— Lo que no significa nada, la base lo para —');
{
  check('«por unidad» en gramos, no',
    (await meter({ unidad: 'Gramos', macros_por: 'unidad' })) !== null,
    'con gramos la unidad ES el gramo, y «los macros de un gramo» no es como '+
    'lo escribe nadie ni como viene de ninguna fuente');
  check('y un valor inventado, tampoco',
    (await meter({ unidad: 'Pieza', pieza_g: 50, macros_por: 'porcion' })) !== null);
}

// ------------------------------------------------------------------
console.log('\n— La busqueda lo dice, o quien lea no sabe que hacer —');
{
  // De pg_proc y no de information_schema.parameters: ahi el modo TABLE no
  // sale en PGlite y la comprobacion daba rojo sin que nada estuviera mal.
  const cols = (await db.query(`
    select pg_get_function_result(p.oid) c
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='buscar_catalogo'`)).rows[0]?.c || '';
  check('buscar_catalogo devuelve macros_por', cols.includes('macros_por'),
    'sin eso la app recibe los numeros y no sabe si son de 100 g o de una pieza; '+
    'devuelve: ' + cols);
  check('y sigue devolviendo pieza_g y unidad',
    cols.includes('pieza_g') && cols.includes('unidad'));
}

// ------------------------------------------------------------------
console.log('\n— Lo que ya estaba, sin tocar —');
{
  const filas = (await db.query(
    `select count(*) n from public.alimentos_catalogo where macros_por <> '100g'`)).rows[0].n;
  check('las filas de antes se quedan en «por 100 g»', Number(filas) === 3,
    'las tres que acaba de meter esta prueba; el resto no se toca. Hay ' + filas);
  // Los huevos de la 0023, que se contaban por piezas con su peso medido.
  const huevo = (await db.query(
    `select unidad, pieza_g, macros_por from public.alimentos_catalogo
      where nombre = 'Huevo entero'`)).rows[0];
  if (huevo) {
    check('el huevo sigue en piezas con su peso', huevo.unidad === 'Pieza' && huevo.pieza_g > 0);
    check('y sus macros siguen siendo por 100 g', huevo.macros_por === '100g',
      'cambiarle el significado a una fila que ya existe le multiplica o le '+
      'divide los macros a todo el que la use');
  } else {
    check('el huevo de la 0023 sigue ahi', false, 'no esta');
  }
}

console.log(`\n${ok} pasan · ${bad} fallan`);
await db.close();
process.exit(bad ? 1 : 0);

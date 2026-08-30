// Los topes que mantienen lo tecleado dentro de lo que la base acepta.
//
// Es la MISMA familia de fallo tres veces en un día:
//
//   · la foto de la semana, con `peso_medio between 20 and 400`
//   · las series de la rutina, con `reps` y `weight_kg between 0 and 1000`
//   · y ahora las metas de macros, con `goal_protein_g between 0 and 600`
//
// En los tres, la pantalla deja teclear cualquier cosa —ninguno de esos
// campos lleva `min` ni `max`— y lo único que impide que la escritura
// entera reviente es un acotado en el JavaScript. Cuando se rompe no se cae
// un número: se cae el guardado COMPLETO, porque Postgres rechaza la fila.
//
// Y esos acotados no los fijaba ninguna prueba. Se vio mutando: quitarle el
// suelo a `num()`, o cambiarle el `Math.min` por un `Math.max`, no ponía
// roja ni una sola de las 138. O sea que estaban ahí por costumbre, no por
// contrato.
//
// LOS RANGOS SE LEEN DE LAS MIGRACIONES, no se copian aquí. Las dos mitades
// viven en ficheros distintos y nada obliga a que coincidan: el hueco de
// verdad es que alguien cambie un `check` y no el acotado. Copiarlos a mano
// sería repetir el error que se está probando.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const MIG = join(RAIZ, 'supabase', 'migrations');
const SQL = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// Los `check (x between a and b)` de las migraciones.
const RANGO = {};
// `\s+` y no un espacio: el SQL alinea las columnas con espacios de más
// —«goal_carbs_g   between 0 and 900»— y con un solo espacio esta lectura
// se saltaba dos de los tres macros sin decir nada.
for (const m of SQL.matchAll(/(\w+)\s+[\w()\d,. ]*?check\s*\(\s*\1\s+between\s+([\d.]+)\s+and\s+([\d.]+)\s*\)/g))
  RANGO[m[1]] = [Number(m[2]), Number(m[3])];

console.log('\nSe leen los rangos de las migraciones');
{
  ok(Object.keys(RANGO).length >= 4,
     `se encontraron ${Object.keys(RANGO).length} rangos`,
     'si salen pocos, esta prueba no compara con nada: ' + JSON.stringify(RANGO));
  for (const c of ['goal_protein_g', 'goal_carbs_g', 'goal_fat_g', 'reps', 'weight_kg'])
    ok(!!RANGO[c], `y entre ellos «${c}»`, JSON.stringify(Object.keys(RANGO)));
}

// ------------------------------------------------------------------
console.log('\nLas metas de macros se acotan a lo que la base acepta');
{
  const num = new Function('return ' + sacar('function num(el, max){').trim())();
  const con = (v) => ({ value: String(v) });

  for (const [campo, max] of [['goal_protein_g', 600], ['goal_carbs_g', 900],
                              ['goal_fat_g', 400]]) {
    const r = RANGO[campo];
    ok(r && r[1] === max,
       `el tope de «${campo}» en la app es el de la base (${max})`,
       'la base dice ' + (r ? r.join('–') : '?') + ' y la app usa ' + max +
       ': si se separan, guardar los macros falla ENTERO y no se ve venir');
    ok(num(con(9999), max) === max, `y tecleando 9999 se queda en ${max}`,
       'salió ' + num(con(9999), max) + ': Postgres rechaza la fila y no se ' +
       'guarda ni eso ni lo demás');
    ok(num(con(-50), max) === (r ? r[0] : 0), 'y un negativo se queda en el suelo',
       'salió ' + num(con(-50), max));
  }

  // Y lo normal pasa intacto.
  ok(num(con(170), 600) === 170, 'una meta normal no se toca');
  ok(num(con('  185 '), 600) === 185, 'y con espacios alrededor también');
  ok(num(con('abc'), 600) === 0, 'y algo que no es un número cae a cero',
     'salió ' + num(con('abc'), 600) + ': un NaN en el cuerpo revienta la ' +
     'escritura igual que un número fuera de rango');
  ok(num(con(''), 600) === 0, 'y el campo vacío también');
  ok(Number.isInteger(num(con(170.7), 600)), 'y sale entero, que es como se guarda',
     'la columna es `int`: un decimal no entra');

  // Los tres campos se leen con SU tope, no con uno cualquiera.
  const leer = sacar('function leerMetas(){');
  ok(/num\(goalP\s*,\s*600\)/.test(leer) && /num\(goalC\s*,\s*900\)/.test(leer) &&
     /num\(goalG\s*,\s*400\)/.test(leer),
     'cada macro con su propio tope',
     'usar el mismo para los tres deja pasar 900 g de proteína, que la base ' +
     'rechaza: ' + leer.trim());
}

// ------------------------------------------------------------------
console.log('\nY las series de la rutina, por arriba Y por abajo');
{
  const i = APP.indexOf('      var series = [];');
  const f = APP.slice(i, APP.indexOf('return {', i));
  const rReps = RANGO.reps, rPeso = RANGO.weight_kg;

  ok(new RegExp('Math\\.min\\(' + rReps[1]).test(f), `las reps con tope ${rReps[1]}`,
     'la base exige ' + rReps.join('–') + ': un 2000 tumba el guardado de ' +
     'TODA la rutina, no solo el de esa serie');
  ok(new RegExp('Math\\.min\\(' + rPeso[1]).test(f), `y el peso con tope ${rPeso[1]}`);
  // EL SUELO, que es lo que la mutación destapó: estaba puesto y no lo
  // fijaba nadie. Los campos no llevan `min`, así que un `-5` se teclea.
  ok((f.match(/Math\.max\(0,/g) || []).length >= 2,
     'y las dos con suelo de cero',
     'sin él, un -5 tecleado —los campos no tienen `min`— rompe el guardado ' +
     'igual que un 2000, y por el otro lado');

  // Ejecutado, no solo mirado.
  const leer = new Function('v', 'return Math.min(' + rReps[1] +
    ', Math.max(0, Number(v) || 0));');
  ok(leer('-5') === 0, 'un -5 se queda en cero');
  ok(leer('99999') === rReps[1], 'y un 99999 en el tope');
  ok(leer('10') === 10, 'y un 10 se queda en 10');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

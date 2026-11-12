// La app, la función y la base se despliegan POR SEPARADO.
//
// Y pasó: se desplegó la función —que ya pide hasta 700 caracteres de
// motivo— y la migración que ensancha la columna a 1000 no se corrió. La
// columna seguía en 500.
//
// Postgres no recorta: rechaza LA FILA ENTERA por el `check`. Así que un
// motivo de 650 caracteres tiraba el cierre COMPLETO —la encuesta, el
// peso, el ajuste, todo— y el lunes siguiente el bloque volvía a salir
// como si no se hubiera contestado: otra consulta de IA gastada y la
// posibilidad de ajustar las calorías dos veces por el mismo periodo. Eso
// está escrito como advertencia en el propio código desde antes.
//
// Perder el razonamiento del coach por largo es malo. Perder el cierre
// entero por lo mismo no tiene defensa.
//
// Ahora, si la base lo rechaza POR EL MOTIVO, se reintenta con 500 — que
// es lo que cualquier versión de esa columna ha aceptado siempre. Lo demás
// se reintenta igual, que es lo que ya hacía.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = APP.indexOf('{', j);
  for (; k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nSe reconoce que el que sobra es el motivo');
{
  // SE EJECUTA: lo que importa es qué errores cuentan como «no cabe».
  const es = new Function(
    sacar('var esMotivoLargo = function(e){').replace(/^var /, 'var ') +
    '; return esMotivoLargo;')();

  ok(es(new Error('new row for relation "chequeos_semanales" violates check ' +
                  'constraint "chequeos_semanales_motivo_check"')) === true,
     'el `check` del motivo sí');

  // Y NADA MÁS. Reintentar con el motivo corto un fallo que no era del
  // motivo gasta otra petición y esconde el error de verdad.
  for (const otro of [
    'Failed to fetch',
    'JWT expired',
    'violates check constraint "chequeos_semanales_hambre_check"',
    'duplicate key value violates unique constraint',
    'new row violates row-level security policy',
  ]) {
    ok(es(new Error(otro)) === false, 'y «' + otro.slice(0, 40) + '» no');
  }
  for (const raro of [null, undefined, {}, 'texto suelto']) {
    ok(es(raro) === false, 'y algo que no es un error tampoco revienta: ' + String(raro));
  }
}

// ------------------------------------------------------------------
console.log('\nY el cuerpo se arma con el tope que se le pida');
{
  const c = sinComentarios(sacar('var conMotivo = function(tope){'));
  ok(/recortarTexto\(r\.motivo, tope\)/.test(c),
     'el motivo se recorta al tope que llega',
     'con el tope fijo dentro, el reintento mandaría exactamente lo mismo ' +
     'y volvería a rebotar');
  ok(/semana: isoDe\(anclaSemana\)/.test(c) && /hambre:/.test(c),
     'y lo demás del cierre va igual en los dos intentos');
}

// ------------------------------------------------------------------
console.log('\nY el reintento es el corto, no el mismo');
{
  const g = sinComentarios(sacar('function guardarChequeo('));
  ok(/enviar\(1000\)/.test(g), 'primero se intenta con 1000');
  ok(/if\(esMotivoLargo\(e1\)\)\{/.test(g), 'y se mira si el que sobra es el motivo');
  ok(/enviar\(500\)/.test(g),
     'para reintentar con 500',
     '500 es lo que cualquier versión de esa columna ha aceptado siempre');

  // Y los demás fallos se reintentan IGUAL, como antes: casi siempre son
  // un tropiezo de red y mandarlo recortado perdería texto sin motivo.
  const iElse = g.indexOf('return enviar(1000)', g.indexOf('enviar(500)'));
  ok(iElse > 0, 'y lo que no es el motivo se repite igual',
     'recortar por un fallo de red perdería el razonamiento sin razón');

  ok(/apuntarFallo\('motivo_no_cabe'/.test(g),
     'y queda apuntado que la columna va por detrás',
     'es la señal de que falta correr una migración, y si no se apunta ' +
     'nadie se entera hasta que alguien lee un motivo cortado');
  ok(/apuntarFallo\('guardar_chequeo'/.test(g), 'y también si se rinde del todo');
}

// ------------------------------------------------------------------
console.log('\nY si al final no se guarda, se dice');
{
  const g = sinComentarios(sacar('function guardarChequeo('));
  ok(/Tus calorías sí se aplicaron, pero no pude/.test(g),
     'se distingue lo que sí pasó de lo que no',
     'las calorías se aplican antes de guardar: callarlo haría creer que ' +
     'no se movió nada');
  ok((g.match(/rendirse/g) || []).length >= 3,
     'y los dos caminos acaban en el mismo aviso',
     'un camino sin aviso es el fallo mudo de siempre');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

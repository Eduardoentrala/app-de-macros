// «Sin señal: se subirá cuando vuelva». Y a veces no.
//
// Lo que se apunta sin red va a una cola en el teléfono, y la app lo dice
// así de claro. Pero si `localStorage` se quedaba sin sitio, el rescate era
// esta línea:
//
//     COLA = COLA.slice(-50);
//
// Cincuenta. Y el tope de la cola, veinte líneas más arriba, son 400. O sea
// que una sola vez sin sitio podía llevarse por delante TRESCIENTOS
// CINCUENTA apuntes de los que la app acababa de prometer que se subirían.
// Dos números para la misma cosa, y ganaba el pequeño.
//
// Y en silencio. Que es lo que hace que sea un fallo y no una decisión:
// esta misma app ya tiene escrito, en `avisarSubidos`, por qué los apuntes
// que el servidor rechaza SÍ se dicen —«si no se avisa, desaparecen en la
// siguiente recarga sin explicación»—. Aquí valía exactamente igual y no
// se aplicaba.
//
// Ahora se tira por tandas, se para en cuanto cabe, y se dice cuántos.

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

function fn(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  for (let k = APP.indexOf('{', j); k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}
function linea(exacta) {
  if (!APP.includes(exacta)) throw new Error('no encuentro la línea: ' + exacta);
  return exacta;
}

// ------------------------------------------------------------------
// SE EJECUTA. `cabenComoMucho` es cuántos apuntes acepta el teléfono de
// mentira; por encima de eso, `setItem` revienta como el de verdad.
function montar(cola, cabenComoMucho) {
  const avisos = [], fallos = [];
  let guardado = null;
  const almacen = {
    setItem(k, v) {
      const cuantos = JSON.parse(v).length;
      if (cuantos > cabenComoMucho) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      guardado = v;
    },
    getItem: () => guardado,
  };
  const fuente = [
    linea("  var COLA_KEY = 'macros.cola';"),
    'var COLA = _cola;',
    linea('  var COLA_TOPE = 400;').replace(/;.*$/, ';'),
    fn('function colaGuardar('),
    fn('function encolar('),
    `return {
       colaGuardar: colaGuardar, encolar: encolar,
       COLA_TOPE: COLA_TOPE,
       cola: function(){ return COLA; },
       guardado: function(){ return guardado === null ? null : JSON.parse(guardado); }
     };`,
  ].join('\n');
  return {
    ...new Function('localStorage', '_cola', 'sesion', 'pintarPendientes',
                    'apuntarFallo', 'toast', 'guardado', fuente)(
      almacen, cola, { user: { id: 'u1' } }, () => {},
      (q, e) => fallos.push(q + ': ' + e.message),
      (id, m) => avisos.push(m), null),
    avisos, fallos,
    guardado: () => (guardado === null ? null : JSON.parse(guardado)),
  };
}
const nApuntes = (n) => Array.from({ length: n }, (_, i) => ({ ruta: '/x', op: {}, n: i }));

// ------------------------------------------------------------------
console.log('\nCuando cabe, no se tira nada');
{
  const c = montar(nApuntes(10), 1000);
  ok(c.colaGuardar() === 0, 'guardar devuelve cero tirados');
  ok(c.cola().length === 10, 'y la cola sigue entera');
  ok(c.guardado().length === 10, 'y en el teléfono están los diez');
}

// ------------------------------------------------------------------
console.log('\nY cuando no cabe se tira LO MENOS POSIBLE');
{
  // Caben 95 de 100. Con el corte viejo a 50 se habrían ido 50.
  const c = montar(nApiezas(), 95);
  const tirados = c.colaGuardar();
  ok(tirados > 0, 'algo hubo que tirar', 'tirados: ' + tirados);
  ok(tirados <= 20,
     'pero poco: ' + tirados + ' de 100',
     'el corte viejo a 50 tiraba la mitad de la cola de una, aunque ' +
     'sobrara sitio para noventa y cinco');
  ok(c.cola().length === 100 - tirados, 'y la cola queda con el resto');
  ok(c.guardado().length === c.cola().length,
     'y el teléfono y la memoria dicen lo mismo',
     'si no, al recargar vuelve una cola que ya no es la que hay');

  // Lo que se tira es LO MÁS VIEJO: lo que se acaba de apuntar es lo que
  // esa persona tiene delante.
  ok(c.cola()[c.cola().length - 1].n === 99, 'y lo último apuntado se queda');
  ok(c.cola()[0].n === tirados, 'y lo que se fue es lo más viejo');
}
function nApiezas() { return nApuntes(100); }

// ------------------------------------------------------------------
console.log('\nY si no cabe ni uno, la cola se deja como estaba');
{
  const c = montar(nApuntes(10), 0);
  const tirados = c.colaGuardar();
  ok(tirados === 0, 'no se dice que se tiró nada');
  ok(c.cola().length === 10,
     'y la cola no se queda vacía',
     'vaciarla sin haber guardado nada deja la memoria diciendo una cosa ' +
     'y el teléfono otra: al recargar vuelven los diez igual');
}

// ------------------------------------------------------------------
console.log('\nY apuntar algo que no cabe SE DICE');
{
  const c = montar(nApuntes(100), 95);
  c.encolar({ ruta: '/x', op: {}, n: 'nuevo' });
  ok(c.avisos.length === 1, 'sale un aviso', JSON.stringify(c.avisos));
  ok(/se perdieron \d+ apuntes? viejos? sin subir/.test(c.avisos[0] || ''),
     'y dice cuántos se perdieron',
     c.avisos[0] || '(ninguno)');
  ok(c.fallos.some((f) => /cola_sin_sitio/.test(f)),
     'y queda apuntado en el registro de errores',
     'es la única forma de enterarse de que a alguien le pasó esto');

  // Y lo normal NO avisa de nada.
  const b = montar(nApuntes(3), 1000);
  b.encolar({ ruta: '/x', op: {} });
  ok(b.avisos.length === 0, 'y apuntar con sitio de sobra no dice nada',
     JSON.stringify(b.avisos));
  ok(b.cola().length === 4, 'solo lo apunta');
}

// ------------------------------------------------------------------
console.log('\nY pasarse del tope también se dice');
{
  // 400 es el tope. El 401 empuja al más viejo fuera, y eso también es un
  // apunte que no se va a subir nunca.
  const c = montar(nApuntes(400), 100000);
  c.encolar({ ruta: '/x', op: {}, n: 'nuevo' });
  ok(c.cola().length === 400, 'la cola no pasa de 400');
  ok(c.avisos.length === 1, 'y se avisa del que se cayó', JSON.stringify(c.avisos));
}

// ------------------------------------------------------------------
console.log('\nY ya no hay dos números para lo mismo');
{
  const g = fn('function colaGuardar(');
  ok(!/slice\(-50\)/.test(g),
     'el 50 a pelo ya no está',
     'el tope de la cola son 400: cortar a 50 tiraba 350 apuntes');
  ok(!/\b50\b/.test(g.replace(/^\s*\/\/.*$/gm, '')),
     'ni ningún otro número suelto que compita con COLA_TOPE');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

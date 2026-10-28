// El cronómetro de descanso decía que se guardaba y no se guardaba.
//
// Se podía cambiar —3:00, 2:00, lo que fuera—, salía «Descanso: 2:00»
// abajo, y al cerrar y abrir la app volvía a 3:00. No fallaba el guardado:
// NO HABÍA GUARDADO. El manejador ponía una variable, escribía el chip y
// enseñaba el aviso:
//
//     var v = Math.min(900, Math.max(5, Number(customSecs.value) || 180));
//     restSeconds = v;
//     timerChip.textContent = '⏱ ' + fmt(v);
//     toast('toastRutina', 'Descanso: ' + fmt(v));
//
// Y `var restSeconds = 180` corre en cada arranque. Es la peor forma de
// perder un ajuste: la que te dice que lo hizo. Sin el aviso te habrías
// dado cuenta el primer día.
//
// LO QUE SE PRUEBA AQUÍ, ejecutando el código de verdad:
//
//   · Que lo elegido se escriba en el perfil, y con el nombre de columna
//     que la base tiene.
//   · Que al arrancar se vuelva a poner, y que un valor imposible -o
//     ninguno- no estropee el que ya hay.
//   · Y que los topes de la pantalla sean los de la columna. Si se
//     separan, o se pierde lo tecleado o rebota la fila entera. LOS TOPES
//     SE LEEN DE LA MIGRACIÓN, no se copian aquí.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const MIG = join(RAIZ, 'supabase', 'migrations');
const SQL = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cab) {
  const i = APP.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
}

// ------------------------------------------------------------------
console.log('\nLa columna existe y dice entre qué y qué');
const rango = SQL.match(/descanso_seg\s+smallint\s*\n?\s*check \(descanso_seg is null or descanso_seg between (\d+) and (\d+)\)/);
{
  ok(!!rango, 'la migración declara `descanso_seg` con su rango',
     'sin ella, guardar el descanso rebota y el aviso vuelve a mentir');
  ok(/add column if not exists descanso_seg/.test(SQL),
     'y se añade sin romper si ya estaba');
  ok(/descanso_seg is null or/.test(SQL),
     'y acepta nulo, que es «no lo ha tocado nunca»',
     'sin nulo habría que inventarle una preferencia a quien no la expresó');
}
const MIN = rango ? Number(rango[1]) : null;
const MAX = rango ? Number(rango[2]) : null;

// ------------------------------------------------------------------
console.log('\nLa pantalla se acota a lo mismo que la columna');
{
  const topes = APP.match(/var DESCANSO_MIN = (\d+), DESCANSO_MAX = (\d+);/);
  ok(!!topes, 'la app tiene sus topes en un sitio');
  ok(topes && Number(topes[1]) === MIN && Number(topes[2]) === MAX,
     `y son los de la base (${MIN} a ${MAX})`,
     'app ' + (topes ? topes[1] + '-' + topes[2] : '?') + ' contra base ' +
     MIN + '-' + MAX + ': si se separan, o se pierde lo tecleado o la fila ' +
     'entera rebota contra el check');
  const guarda = sacar("document.getElementById('timerSave').addEventListener('click', function(){");
  ok(/Math\.min\(DESCANSO_MAX, Math\.max\(DESCANSO_MIN,/.test(guarda),
     'y el acotado usa esos topes, no dos números sueltos');
}

// ------------------------------------------------------------------
console.log('\nSe escribe en el perfil');
{
  const guarda = sacar("document.getElementById('timerSave').addEventListener('click', function(){");
  ok(/sbActualizarPerfil\(\{ descanso_seg: v \}\)/.test(guarda),
     'se manda a la base, con el nombre de columna bueno',
     'esto es lo que no hacía: ponía la variable y avisaba, y nada más');

  // EL AVISO, DENTRO DEL `then`. «Descanso: 2:00» es una promesa de que
  // mañana seguirá ahí, y esa la cumple el servidor.
  //
  // SE MIRA DÓNDE CAE EL PRIMERO, no si existe uno dentro del `then`. La
  // primera versión de esto buscaba `.then(...[\s\S]*toast(...)` y pasaba
  // igual con un aviso puesto ANTES de la llamada: el comodín se lo
  // saltaba. O sea que no comprobaba nada de lo que dice comprobar, que es
  // justo el fallo que se está arreglando. Se vio mutando.
  const iLlamada = guarda.indexOf('sbActualizarPerfil');
  const iAviso = guarda.indexOf("toast('toastRutina', 'Descanso: ");
  ok(iLlamada > 0 && iAviso > iLlamada,
     'y no hay ningún aviso antes de llamar al servidor',
     'el primer «Descanso: …» sale en la posición ' + iAviso + ' y la llamada ' +
     'en la ' + iLlamada + ': avisar al pulsar es exactamente el fallo que se ' +
     'está arreglando');
  ok(/\.then\(function\(\)\{[^}]*toast\('toastRutina', 'Descanso: '/.test(guarda),
     'y el que hay va dentro del `then`');
  ok(/\['catch'\]\(function\(e\)\{[^}]*no se guard/.test(guarda),
     'y si falla, lo dice',
     'callarse deja a la persona creyendo que quedó puesto');
}

// ------------------------------------------------------------------
console.log('\nY al abrir la app vuelve a estar');
{
  ok(/if\(p\) aplicarDescansoGuardado\(p\.descanso_seg\);/.test(APP),
     'el arranque lo aplica desde el perfil',
     'el perfil se pide con `select=*`, así que la columna llega sola');

  // EJECUTADO. Que exista la llamada no dice que la función haga lo suyo.
  //
  // CADA PRUEBA CON SU CIERRE NUEVO, no uno compartido: `restSeconds` vive
  // dentro, así que reutilizarlo arrastra el valor de la comprobación
  // anterior y las seis de abajo pasan o fallan por lo que hizo la de
  // arriba. (Pasó al escribir esto: salían rojas comparando contra 120.)
  const crear = () => new Function(
    'var restSeconds = 180, puesto = null;' +
    'var timerChip = { querySelector: function(){ return { set textContent(v){ puesto = v; } }; } };' +
    'function fmt(s){ return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); }' +
    'var DESCANSO_MIN = ' + MIN + ', DESCANSO_MAX = ' + MAX + ';' +
    sacar('function ponerDescanso(v){') + '\n' +
    sacar('function aplicarDescansoGuardado(seg){') + '\n' +
    'return function(v){ aplicarDescansoGuardado(v); return { restSeconds: restSeconds, chip: puesto }; };'
  )();
  const fn = (v) => crear()(v);

  const r = fn(120);
  ok(r.restSeconds === 120, 'ciento veinte segundos guardados vuelven como 120',
     'salió ' + r.restSeconds);
  ok(r.chip === '2:00', 'y el chip dice 2:00', 'salió «' + r.chip + '»');

  for (const [q, v] of [['nulo', null], ['sin tocar', undefined], ['texto', 'mucho'],
                        ['cero', 0], ['por debajo del mínimo', MIN - 1],
                        ['por encima del máximo', MAX + 1]]) {
    const s = fn(v);
    ok(s.restSeconds === 180, `y ${q} no toca el de la pantalla`,
       'salió ' + s.restSeconds + ': un valor imposible guardado en la base ' +
       'no puede dejar el cronómetro en algo que no es un descanso');
  }

  const borde = fn(MAX);
  ok(borde.restSeconds === MAX, `y el tope justo (${MAX}) sí vale`,
     'acotar de más es perder lo que la persona eligió');
}

// ------------------------------------------------------------------
console.log('\nY el chip tiene dónde escribir');
{
  ok(/id="timerChip"[^>]*>[\s\S]{0,400}?<span class="t">/.test(HTML),
     'el número vive en su propio `span`',
     'escribiendo el chip entero con textContent se borraría el icono');
  ok(!/id="timerChip"[^>]*>\s*⏱/.test(HTML), 'y el emoji del reloj ya no está');
  const poner = sacar('function ponerDescanso(v){');
  ok(/querySelector\('\.t'\)/.test(poner), 'y se escribe solo ese span');
  ok(/if\(t\)/.test(poner), 'con guarda, por si algún día no está',
     'sin ella, un cambio de marcado tumba el arranque entero');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

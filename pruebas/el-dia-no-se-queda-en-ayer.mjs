// La app se quedaba en el día en que la abriste.
//
// `HOY` se calcula UNA VEZ, al cargar la página, y no se volvía a tocar
// nunca. Y esto se instala en el teléfono y vive en segundo plano: abres a
// las once de la noche, guardas el teléfono, lo sacas al día siguiente. La
// página sigue viva, así que `HOY` sigue siendo ayer.
//
// De `HOY` cuelgan ochenta sitios de este fichero y unos cuantos ESCRIBEN:
// el desayuno del martes se apuntaba en el lunes, el peso se guardaba con
// fecha de ayer, el anillo contaba lo de ayer, y el selector de día te
// decía «hasta hoy» con el tope puesto en ayer —o sea que la app se negaba
// a dejarte apuntar en el día en el que estabas—. Nada de eso avisaba.
//
// Lo peor es que ya se había visto a medias: hay dos comentarios en app.js
// que nombran el problema con todas las letras —«quien deja la app abierta
// pasada la medianoche tendría un HOY de ayer»— y cada uno lo esquiva en
// su rincón. Nadie fue a la raíz.
//
// Lo que se vigila aquí: que al volver a la app se recargue sola si cambió
// el día, que NO se recargue si no cambió, y que estando delante de la
// pantalla no se recargue por debajo —ahí puede haber medio plato escrito—
// sino que salga un aviso que se toca.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'diario.css'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

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

// Los cuatro cables que enganchan el arreglo a la app. Van aquí arriba, y
// se comprueban ANTES de montar nada, porque si falta uno el arnés revienta
// al construirse y sin esto solo se vería la pila de un error.
const CABLES = [
  "  document.addEventListener('visibilitychange', alVolverALaApp);",
  "  window.addEventListener('focus', alVolverALaApp);",
  "  var avisoDiaNuevo = document.getElementById('avisoDiaNuevo');",
  "  if(avisoDiaNuevo) avisoDiaNuevo.addEventListener('click', ponerseAlDia);",
];
console.log('\nEl arreglo está enganchado a la app');
for (const c of CABLES) {
  ok(APP.includes(c), 'sigue puesto: ' + c.trim(),
     'sin este cable el arreglo existe pero no lo llama nadie');
}
if (fallan) { console.log('\n' + pasan + ' bien, ' + fallan + ' mal'); process.exit(1); }

// ------------------------------------------------------------------
// SE EJECUTA EL CÓDIGO DE VERDAD, con el reloj movido a mano. Mirando el
// texto no se distingue un `!==` de un `===` que casualmente no recarga
// nunca.
const Real = Date;
function montar(diaDeCarga, ahoraDeVerdad) {
  const recargas = [];
  const aviso = { hidden: true, _click: null,
                  addEventListener(ev, f) { if (ev === 'click') this._click = f; } };
  const doc = { hidden: false, _oyentes: {},
                addEventListener(ev, f) { (this._oyentes[ev] ||= []).push(f); },
                getElementById: (id) => (id === 'avisoDiaNuevo' ? aviso : null) };
  const win = { _oyentes: {},
                addEventListener(ev, f) { (this._oyentes[ev] ||= []).push(f); } };
  // `new Date()` dentro del código apunta aquí. `HOY` entra ya hecho, que
  // es como está en la app: un Date congelado al cargar.
  const FalsoDate = function () { return new Real(ahoraDeVerdad + 'T10:00:00'); };
  const HOY = new Real(diaDeCarga + 'T00:00:00');

  const fuente = [
    fn('function isoDe('),
    'var HOY = _HOY;',
    fn('function elDiaCambio('),
    linea('  var recargandoPorElDia = false;'),
    fn('function ponerseAlDia('),
    fn('function alVolverALaApp('),
    // Estas CUATRO salen del fichero y no se escriben aquí. Escritas a
    // mano, quitar el oyente de app.js dejaba el arnés registrándolo por
    // su cuenta y la comprobación seguía verde con la app rota.
    ...CABLES.map(linea),
    fn('function vigilarElDia('),
    `return { elDiaCambio: elDiaCambio, vigilarElDia: vigilarElDia,
              alVolverALaApp: alVolverALaApp, aviso: avisoDiaNuevo };`,
  ].join('\n');

  const api = new Function('Date', '_HOY', 'document', 'window', 'location', 'setInterval', fuente)(
    FalsoDate, HOY, doc, win, { reload: () => recargas.push(1) }, () => {});
  return { ...api, recargas, doc, win, aviso };
}

// ------------------------------------------------------------------
console.log('\nSe nota que cambió el día');
{
  ok(montar('2026-11-12', '2026-11-12').elDiaCambio() === false,
     'el mismo día no ha cambiado',
     'si esto diera true, la app se recargaría en bucle nada más abrirla');
  ok(montar('2026-11-12', '2026-11-13').elDiaCambio() === true,
     'y el siguiente sí');
  // Los saltos que de verdad despistan a una resta de días.
  ok(montar('2026-12-31', '2027-01-01').elDiaCambio() === true, 'fin de año también');
  ok(montar('2026-02-28', '2026-03-01').elDiaCambio() === true, 'y el fin de mes');
  // Y hacia atrás: alguien que corrige la hora del teléfono.
  ok(montar('2026-11-13', '2026-11-12').elDiaCambio() === true,
     'y si el reloj va para atrás, también',
     'un `>` en vez de un `!==` se lo tragaría y la app seguiría en mañana');
}

// ------------------------------------------------------------------
console.log('\nAl volver a la app se pone al día sola');
{
  const a = montar('2026-11-12', '2026-11-13');
  a.doc._oyentes.visibilitychange.forEach((f) => f());
  ok(a.recargas.length === 1, 'volver del segundo plano otro día recarga',
     'es EL caso: pasa todos los días, a todo el mundo');

  // Y no se recarga dos veces por dos avisos seguidos del teléfono.
  a.doc._oyentes.visibilitychange.forEach((f) => f());
  a.win._oyentes.focus.forEach((f) => f());
  ok(a.recargas.length === 1, 'y una sola vez por mucho que avise el teléfono',
     'salieron ' + a.recargas.length);

  const b = montar('2026-11-12', '2026-11-12');
  b.doc._oyentes.visibilitychange.forEach((f) => f());
  b.win._oyentes.focus.forEach((f) => f());
  ok(b.recargas.length === 0, 'y el mismo día no recarga nada',
     'recargar al volver siempre tiraría lo que estuvieras escribiendo');

  // Escondida no se toca: recargar una pestaña que no se ve es tirar
  // trabajo por nada.
  const c = montar('2026-11-12', '2026-11-13');
  c.doc.hidden = true;
  c.doc._oyentes.visibilitychange.forEach((f) => f());
  ok(c.recargas.length === 0, 'y escondiéndose tampoco');
  c.doc.hidden = false;
  c.doc._oyentes.visibilitychange.forEach((f) => f());
  ok(c.recargas.length === 1, 'pero al destaparse sí');

  // La caché de atrás/adelante devuelve la página sin ejecutar nada.
  ok(/pageshow/.test(APP) && /e\.persisted/.test(APP),
     'y volver con el botón de atrás también se mira',
     'la página vuelve entera de la caché, con el `HOY` viejo dentro');
}

// ------------------------------------------------------------------
console.log('\nY mirando la pantalla NO se recarga por debajo');
{
  const a = montar('2026-11-12', '2026-11-13');
  a.vigilarElDia();
  ok(a.aviso.hidden === false, 'sale el aviso de que ya es otro día');
  ok(a.recargas.length === 0, 'y no se recarga sin permiso',
     'quitarle la pantalla de las manos a quien está escribiendo un plato ' +
     'para arreglar algo que no ha visto es peor que el fallo');

  a.aviso._click();
  ok(a.recargas.length === 1, 'pero tocándolo sí');

  const b = montar('2026-11-12', '2026-11-12');
  b.vigilarElDia();
  ok(b.aviso.hidden === true, 'y el mismo día el aviso no está');
}

// ------------------------------------------------------------------
console.log('\nY el aviso existe de verdad y se puede tocar');
{
  ok(/<button class="pendientes dia-nuevo" id="avisoDiaNuevo"/.test(HTML),
     'está en el index, y es un botón',
     'un div no entra con el teclado ni lo anuncia el lector de pantalla');
  ok(/id="avisoDiaNuevo"[^>]*hidden/.test(HTML), 'y nace escondido');
  ok(/href="#i-amanecer"/.test(HTML), 'con su icono');
  ok(/\.dia-nuevo\{[\s\S]{0,200}cursor:pointer/.test(CSS),
     'y el CSS le quita la pinta de botón del navegador');
  ok(/setInterval\(vigilarElDia/.test(APP), 'y alguien lo va mirando');
}

// ------------------------------------------------------------------
console.log('\nY los dos parches viejos siguen donde estaban');
{
  // Esto no se arregló quitando los rodeos que ya había: son correctos por
  // su cuenta y protegen el rato ENTRE que cambia el día y se recarga.
  const limpio = sinComentarios(APP);
  ok(/var DIA_APUNTE = null;/.test(limpio) && /return DIA_APUNTE \|\| HOY;/.test(limpio),
     'apuntar en otro día sigue guardando la fecha, no un desfase');
  ok(/function esVisperaDeCerrarSemana\(cuando, inicio\)/.test(limpio),
     'y la víspera del cierre sigue sacando día y hora de la misma fecha');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

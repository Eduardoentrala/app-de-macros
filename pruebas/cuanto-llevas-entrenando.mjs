// El cronómetro de la sesión, y el día que ya no se borra de un toque.
//
// DOS COSAS QUE PEDÍA LA PANTALLA DE RUTINA:
//
//   · Saber cuánto llevas entrenando. No había nada: el único reloj era el
//     del descanso entre series, que es otra cosa.
//   · Y que «Borrar día» no se lleve por delante el día entero —pestaña,
//     ejercicios y series— con un solo toque, sin preguntar, desde un
//     botón de quince píxeles que flota encima de las tarjetas.
//
// Lo delicado del cronómetro no es contar: es CUÁNDO arranca, cuándo se
// para y qué pasa si la app se cierra a mitad. Se guarda el instante de
// arranque y no los segundos contados, porque entrenar con el teléfono en
// el bolsillo es lo normal.
//
// Y lo que nunca puede pasar: que al abrir la app diga «llevas diecinueve
// horas entrenando» porque quedó uno de ayer encendido. Eso es peor que no
// enseñar nada.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

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
console.log('\nEl tiempo se dice como se lee');
{
  const fmtLargo = new Function('return ' + sacar('function fmtLargo(seg){'))();
  for (const [seg, txt] of [[0, '0:00'], [9, '0:09'], [61, '1:01'], [599, '9:59'],
                            [2901, '48:21'], [3600, '1:00:00'], [3912, '1:05:12']]) {
    ok(fmtLargo(seg) === txt, `${seg} s se dice «${txt}»`, 'salió «' + fmtLargo(seg) + '»');
  }
  ok(!/0:48:21/.test(fmtLargo(2901)), 'y por debajo de la hora no sobra un cero',
     'un «0:48:21» en una rutina de 48 minutos se lee como un reloj roto');
}

// ------------------------------------------------------------------
console.log('\nArranca al marcar la primera serie, no al entrar');
{
  const chk = APP.slice(APP.indexOf("var chk = e.target.closest('.set-check');"));
  ok(/var marcada = chk\.classList\.toggle\('done'\);[\s\S]{0,200}?if\(marcada\) arrancarCrono\(\);/.test(chk),
     'solo al MARCAR, no al desmarcar',
     'desmarcar es corregirse, no empezar a entrenar');
  ok(!/arrancarCrono\(\)[\s\S]{0,80}loadDay/.test(APP),
     'y no al abrir la pantalla',
     'entrar a mirar qué toca hoy no es empezar: un cronómetro que arranca al ' +
     'abrir miente en cuanto alguien echa un vistazo y se va');

  // El reloj de descanso TAMBIÉN marca la serie, así que también arranca.
  const reloj = APP.slice(APP.indexOf("var clock = e.target.closest('.clock-btn');"));
  ok(/palomita\.classList\.add\('done'\);[\s\S]{0,300}?arrancarCrono\(\);/.test(reloj),
     'y poner el descanso también lo arranca',
     'si poner el descanso cuenta como marcar la serie —y el código dice que ' +
     'sí—, cuenta como haber empezado');
}

// ------------------------------------------------------------------
console.log('\nY se para al guardar la sesión');
{
  ok((APP.match(/pararCrono\(\);/g) || []).length >= 2,
     'por los dos caminos del guardado',
     'hay una salida temprana cuando no hay sesión, y es la que más se olvida');
  ok(/pararCrono\(\);\n      toast\('toastRutina', 'Sesión guardada · '/.test(APP),
     'y en el camino bueno, justo antes de avisar');
}

// ------------------------------------------------------------------
console.log('\nSobrevive a cerrar la app, pero no a que pase el día');
{
  // EJECUTADO, con el reloj y el almacén de mentira. Cada caso con su
  // cierre nuevo: `sesionInicio` vive dentro y arrastraría el anterior.
  const crear = (guardado, hoy, ahora) => new Function('guardado', 'hoy', 'ahora',
    'var sesionInicio = null, cronoTick = null, quitado = false;' +
    'var TOPE_SESION = 6 * 3600 * 1000;' +
    'var CLAVE_SESION = "k";' +
    'var localStorage = { getItem: function(){ return guardado; },' +
    '  removeItem: function(){ quitado = true; }, setItem: function(){} };' +
    'var Date = { now: function(){ return ahora; } };' +
    'function iso(){ return hoy; }' +
    'var HOY = null;' +
    'function setInterval(){ return 1; }' +
    'function clearInterval(){}' +
    'function pintarCrono(){}' +
    'function pararCrono(){ sesionInicio = null; }' +
    sacar('function recuperarCrono(){') + '\n' +
    'recuperarCrono();' +
    'return { sesionInicio: sesionInicio, quitado: quitado };'
  )(guardado, hoy, ahora);

  const HOY = '2026-10-27';
  const AHORA = Date.parse(HOY + 'T18:00:00Z');
  const haceUnaHora = AHORA - 3600 * 1000;

  const vivo = crear(HOY + '|' + haceUnaHora, HOY, AHORA);
  ok(vivo.sesionInicio === haceUnaHora, 'uno de hoy y reciente se recupera',
     'cerrar la app a mitad del entrenamiento es lo normal');

  const ayer = crear('2026-10-26|' + haceUnaHora, HOY, AHORA);
  ok(ayer.sesionInicio === null && ayer.quitado,
     'uno de ayer no, y además se tira',
     'diría «llevas diecinueve horas entrenando»');

  const viejo = crear(HOY + '|' + (AHORA - 7 * 3600 * 1000), HOY, AHORA);
  ok(viejo.sesionInicio === null && viejo.quitado,
     'y uno de hace siete horas tampoco, aunque sea de hoy',
     'nadie entrena siete horas: eso es un cronómetro que se quedó encendido');

  for (const [q, v] of [['vacío', ''], ['sin fecha', '|123'], ['basura', 'xxxx'],
                        ['sin número', HOY + '|'], ['nulo', null]]) {
    const r = crear(v, HOY, AHORA);
    ok(r.sesionInicio === null, `y ${q} no arranca nada`,
       'salió ' + r.sesionInicio);
  }
}

// ------------------------------------------------------------------
console.log('\nY si se pasa de la raya mientras corre, se retira solo');
{
  const pintar = sacar('function pintarCrono(){');
  ok(/if\(seg < 0 \|\| seg \* 1000 > TOPE_SESION\)\{ pararCrono\(\); return; \}/.test(pintar),
     'el tope también se mira al pintar, no solo al recuperar',
     'si no, quien deja la app abierta ve «7:12:40» y deja de creerse el ' +
     'cronómetro entero');
}

// ------------------------------------------------------------------
console.log('\nEl chip tiene su sitio y nace escondido');
{
  ok(/id="cronoSesion" hidden/.test(HTML), 'nace oculto',
     'sin sesión en marcha no hay nada que contar');
  ok(/id="cronoSesion"[^>]*>[\s\S]{0,400}?<b class="t">/.test(HTML),
     'y el número tiene su propio hueco');
  ok(!/<button[^>]*id="cronoSesion"/.test(HTML), 'y no es un botón',
     'es un dato, no se toca: el que se toca es el del descanso');
  ok(/id="cronoSesion"[\s\S]{0,900}?id="timerChip"/.test(HTML),
     'va antes que el del descanso, no en su sitio',
     'son dos cosas distintas y las dos tienen que poder verse');
}

// ------------------------------------------------------------------
console.log('\nY borrar un día pregunta antes');
{
  const h = APP.slice(APP.indexOf("document.getElementById('deleteDayBtn').addEventListener"));
  ok(/if\(!btn\.classList\.contains\('confirmando'\)\)\{/.test(h),
     'el primer toque pregunta en vez de borrar',
     'antes un toque se llevaba la pestaña, sus ejercicios y sus series');
  ok(/btn\.textContent = '¿Borrar «' \+ active\.textContent\.trim\(\) \+ '»\?'/.test(h),
     'y dice QUÉ día va a borrar',
     'un «¿seguro?» a secas no ayuda a quien se equivocó de pestaña');
  ok(/setTimeout\(reposarBorrado, 4000\)/.test(h), 'y se desarma solo',
     'un botón que se queda armado sin que nadie mire es el mismo fallo con ' +
     'un paso más');
  ok(/reposarBorrado\(\);\n    var t = activeTab\(\);/.test(APP),
     'renombrar lo desarma');
  ok(/function loadDay\(tab\)\{\n[^\n]*\n    if\(typeof reposarBorrado === 'function'\) reposarBorrado\(\);/.test(APP),
     'y cambiar de día también',
     'una pregunta armada en otra pestaña borraría la que no es');

  ok(/\.day-actions \.btn-delete-day\{color:var\(--ink-faint\)\}/.test(CSS.replace(/\s+/g, ' ').replace(/; \}/g, '}')) ||
     /\.btn-delete-day\{color:var\(--ink-faint\);\}/.test(CSS),
     'en reposo va en gris, no en rojo',
     'el rojo ya no es lo único que protege: ahora pregunta');
  ok(/\.btn-delete-day\.confirmando\{/.test(CSS),
     'y el rojo se guarda para cuando pregunta',
     'pegado a `.btn-delete-day`: la regla del gris lleva las mismas clases y ' +
     'va más abajo, así que suelto empataba y ganaba ella');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

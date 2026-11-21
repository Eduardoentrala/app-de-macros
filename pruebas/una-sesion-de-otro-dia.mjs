// «Guardar sesión» siempre escribía HOY, y no había forma de decirle otra cosa.
//
// Pasó de verdad, el 19 de noviembre de 2026: entrenó, no guardó a propósito,
// y al día siguiente abrió la app con sus series todavía marcadas en pantalla
// y le dio a guardar. La sesión entró entera —5.480 kg, los cuatro
// ejercicios— pero con fecha del 20.
//
//     var fecha = (opciones && opciones.fecha) || iso(HOY);
//
// El botón llama sin opciones, así que `iso(HOY)` era lo único posible. Y la
// cuenta de días del cierre va por FECHAS DISTINTAS —`diasEsta[f.session_date]
// = true`—, así que el 19 quedó como día sin entrenar y el 20 con dos
// sesiones contando como una. El volumen de la semana estaba entero; el
// reparto, no. Un día de gimnasio menos de los que hizo.
//
// Para la comida esto ya estaba resuelto desde hacía meses: el Diario tiene
// su píldora de día, con el límite en el lunes de su semana. El
// entrenamiento no la tenía, y es donde más falta hace: la comida se apunta
// mientras se come, la sesión se guarda al final y es justo cuando uno se va
// a la ducha y se le olvida.
//
// EL LÍMITE ES EL MISMO QUE EL DE LA COMIDA, y por el mismo motivo: de su
// lunes a hoy. Más atrás son semanas que la app ya cerró y sobre las que
// quizá ya le ajustó las calorías.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = ['pantallas', 'diario'].map((f) =>
  readFileSync(join(RAIZ, 'docs', 'estilos', f + '.css'), 'utf8')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) return null;
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  return null;
}

// ------------------------------------------------------------------
console.log('\nLa píldora está donde se guarda, no donde se apunta comida');
{
  ok(/id="sesionFecha"/.test(HTML) && /id="sesionFechaBtn"/.test(HTML) &&
     /id="sesionFechaTxt"/.test(HTML), 'existe el selector de día de la sesión');
  ok(/type="date"[^>]*id="sesionFecha"|id="sesionFecha"[^>]*type="date"/.test(HTML),
     'y es un selector de fecha del sistema',
     'en el teléfono el calendario nativo es el único que se usa bien con ' +
     'una mano');

  // DENTRO DE LA BARRA DE ABAJO, pegada al botón. Puesta arriba del todo
  // habría que ir a buscarla, y la decisión se toma al pulsar guardar.
  const i = HTML.indexOf('class="bottom-bar"');
  const j = HTML.indexOf('</div>', HTML.indexOf('id="saveSessionBtn"'));
  ok(i > 0 && HTML.indexOf('id="sesionFecha"') > i &&
     HTML.indexOf('id="sesionFecha"') < HTML.indexOf('id="saveSessionBtn"'),
     'y vive en la barra de abajo, justo encima del botón',
     'se mira al ir a guardar: en cualquier otro sitio hay que acordarse de ella');

  // LA MISMA PÍLDORA QUE LA DEL DIARIO. Dos controles que hacen lo mismo
  // tienen que verse iguales; copiarle los estilos los separa al primer
  // retoque.
  ok(/class="apunte-dia[^"]*"[^>]*>\s*<button id="sesionFechaBtn"/.test(HTML.replace(/\n\s*/g, ' ')),
     'y reutiliza la píldora del Diario, no una copia',
     'la del Diario ya tiene resuelto el ámbar del «otro día» y el input ' +
     'transparente encima');
  ok(/\.bottom-bar \.apunte-dia\{/.test(CSS.replace(/\s*\n\s*/g, '')),
     'con su ajuste para la barra de abajo',
     'la del Diario trae su propio margen lateral y dentro de la barra ' +
     'quedaría doblado');
}

// ------------------------------------------------------------------
console.log('\nGuardar lee el día elegido, y lo lee en UN solo sitio');
{
  const f = fn('function guardarSesionAhora(opciones){');
  ok(!!f, 'se encuentra la función de guardar');
  ok(f && /var fecha = \(opciones && opciones\.fecha\) \|\| iso\(diaDeLaSesion\(\)\);/.test(f),
     'la fecha sale de `diaDeLaSesion()` cuando no se le pasa una',
     'y NO de `iso(HOY)`.\n         Hay dos caminos manuales —el botón y el ' +
     '«Sí, guardar» de la hoja de\n         «esto no parece haber pasado»—, y ' +
     'pasar la fecha por cada uno es\n         dejar que el tercero que se ' +
     'añada se olvide. Se lee donde se usa.');

  // Y LOS DOS CAMINOS MANUALES SIGUEN LLAMANDO SIN OPCIONES. Es lo que hace
  // que lo de arriba valga: si uno empezara a pasar la fecha a mano, el otro
  // se quedaría atrás y nadie lo notaría.
  const i = LIMPIO.indexOf("document.getElementById('saveSessionBtn').addEventListener");
  const boton = LIMPIO.slice(i, i + 600);
  ok(/guardarSesionAhora\(\);/.test(boton), 'el botón llama sin opciones');
  const conRed = fn('function guardarSesionConRed(){');
  ok(conRed && /guardarSesionAhora\(\);/.test(conRed),
     'y el «Sí, guardar» de la hoja también');

  // EL CIERRE DE LAS DOS HORAS NO: ese sabe su fecha —la del arranque del
  // cronómetro— y manda la suya.
  const sola = fn('function cerrarSesionSola(seg){');
  ok(sola && /fecha: isoDe\(new Date\(desde\)\)/.test(sola),
     'y el cierre de las dos horas sigue mandando la suya',
     'esa sesión es del día en que se entrenó, no del día en que la app se ' +
     'dio cuenta');
}

// ------------------------------------------------------------------
console.log('\nEl cronómetro de hoy no se le cuelga a la sesión de ayer');
{
  // EJECUTADO. Con el cronómetro corriendo y la sesión puesta en otro día,
  // los minutos tienen que salir nulos: lo que corre ahora empezó hoy.
  const f = fn('function guardarSesionAhora(opciones){');
  // La cadena de guardado es una promesa: hay que dejarla terminar antes de
  // mirar lo que mandó, o solo se ve la consulta de «¿ya hay fila de hoy?».
  const correr = async ({ dia, cronoVivo }) => {
    const enviado = [];
    const fila = { querySelectorAll: () => [{ value: '10' }, { value: '40' }],
                   querySelector: () => null };
    const card = {
      querySelector: (sel) => sel === '.ex-name'
        ? { childNodes: [{ textContent: 'Sentadilla' }] } : null,
      querySelectorAll: () => [fila],
      removeAttribute(){}, setAttribute(){}, getAttribute(){ return null; },
    };
    const exList = { querySelectorAll: (sel) =>
      (sel === '.exercise-card' ? [card] : []), querySelector: () => null };

    const api = new Function(
      'exList', 'SESIONES', 'HISTORIAL', 'iso', 'HOY', 'volumenDeSerie',
      'saveCurrentDay', 'pintarEjercicio', 'recalcAll', 'toast', 'sesion',
      'activeTab', 'programarGuardado', 'sbFetch', 'pararCrono',
      'volverAHoyLaSesion', 'mil', 'sesionInicio', 'DIA_SESION', `
      var guardandoSesion = false;
      function diaDeLaSesion(){ return DIA_SESION || HOY; }
      ${sinC(f)}
      return guardarSesionAhora;
    `)(exList, {}, {}, (d) => d.iso, { iso: '2026-11-20' }, (r, p) => r * p,
       () => {}, () => {}, () => {}, () => {}, { user: { id: 'u1' } },
       () => null, () => {},
       (ruta, op) => { enviado.push({ ruta, op }); return Promise.resolve([]); },
       () => {}, () => {}, (n) => String(n),
       cronoVivo ? Date.now() - 45 * 60000 : null,
       dia ? { iso: dia } : null);
    api();
    await new Promise((r) => setTimeout(r, 0));
    return enviado;
  };

  const ayer = await correr({ dia: '2026-11-19', cronoVivo: true });
  const post = ayer.find((x) => x.op && x.op.method === 'POST');
  ok(!!post, 'se manda la sesión', JSON.stringify(ayer.map((x) => x.ruta)));
  const cuerpo = post ? JSON.parse(post.op.body) : {};
  ok(cuerpo.session_date === '2026-11-19',
     'con la fecha elegida, no con la de hoy',
     'fue con ' + JSON.stringify(cuerpo.session_date));
  ok(cuerpo.duration_min === null,
     'y SIN duración, aunque el cronómetro esté corriendo',
     'fue con ' + JSON.stringify(cuerpo.duration_min) +
     '\n         ese cronómetro empezó hoy: colgárselo a la sesión de ayer es ' +
     'inventarle\n         una duración, y de ahí sale la regla de «las ' +
     'sesiones se acortan»');

  // Y EN HOY NO CAMBIA NADA. Es el caso de siempre y no se puede tocar.
  const hoy = await correr({ dia: null, cronoVivo: true });
  const postHoy = hoy.find((x) => x.op && x.op.method === 'POST');
  const cuerpoHoy = postHoy ? JSON.parse(postHoy.op.body) : {};
  ok(cuerpoHoy.session_date === '2026-11-20', 'guardando en hoy, la fecha es hoy');
  ok(cuerpoHoy.duration_min === 45,
     'y la duración del cronómetro sí cuenta',
     'fue ' + JSON.stringify(cuerpoHoy.duration_min) + ': quitarla aquí sería ' +
     'apagar el dato\n         que distingue «entrenó igual» de «entrenó a ' +
     'medias»');
}

// ------------------------------------------------------------------
console.log('\nY no se puede guardar fuera de la semana en curso');
{
  // La misma regla que la comida, y por el mismo motivo. El `min`/`max` del
  // input solo manda en el calendario del teléfono: en el ordenador la fecha
  // se teclea y `change` salta igual.
  const i = LIMPIO.indexOf("document.getElementById('sesionFecha')");
  ok(i > 0, 'hay un manejador para el selector');
  const h = LIMPIO.slice(i, i + 1400);
  ok(/isoDe\(d\) > isoDe\(HOY\)/.test(h), 'un día futuro se rechaza',
     'guardar un entrenamiento que no ha pasado cuenta ya en la semana');
  ok(/isoDe\(d\) < isoDe\(anclaSemana\)/.test(h),
     'y uno de una semana ya cerrada también',
     'esa semana quizá ya le ajustó las calorías: cambiarla ahora descuadra ' +
     'el ajuste');
  ok(/toast\(/.test(h), 'y se dice por qué, no se ignora en silencio');

  const p = fn('function pintarSelectorDiaSesion(){');
  ok(!!p, 'y el selector se pinta con sus límites');
  ok(p && /inp\.max = isoDe\(HOY\)/.test(p) && /inp\.min = isoDe\(anclaSemana\)/.test(p),
     'de su lunes a hoy, los mismos que el del Diario');
}

// ------------------------------------------------------------------
console.log('\nSe ve que no es hoy, y vuelve a hoy al guardar');
{
  const p = fn('function pintarSelectorDiaSesion(){');
  ok(p && /otro-dia/.test(p),
     'la píldora se pone en ámbar cuando no es hoy',
     'si se confunde con lo normal, alguien guarda toda una semana en la ' +
     'fecha equivocada');
  ok(p && /fmtFecha/.test(p) && /'Hoy'/.test(p),
     'y dice «Hoy» o la fecha, no una fecha siempre',
     'una fecha completa ahí obliga a comprobarla cada vez');

  const v = fn('function volverAHoyLaSesion(){');
  ok(!!v, 'existe la vuelta a hoy');
  ok(v && /DIA_SESION = null/.test(v), 'que pone el día en hoy');

  // Y SE LLAMA AL GUARDAR, en los dos finales buenos: el que llegó al
  // servidor y el que se quedó en la cola sin señal. Un día pasado que se
  // queda puesto manda ahí la sesión siguiente, y de eso nadie se entera.
  const f = fn('function guardarSesionAhora(opciones){');
  const veces = (f.match(/volverAHoyLaSesion\(\)/g) || []).length;
  ok(veces >= 2, `se vuelve a hoy en los dos finales buenos (${veces})`,
     'el guardado que llegó y el que se encoló sin señal');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

// El cierre de las dos horas hacía lo contrario de lo que dice su comentario.
//
// LO QUE PROMETE, escrito en `pintarCrono`:
//
//     «llegar ahí significa que se olvidó el botón, y lo que no puede pasar
//      es que el trabajo de esa tarde se quede sin registrar porque nadie
//      lo pulsó.»
//
// LO QUE HACÍA. `recuperarCrono()` corre en el arranque, dentro del IIFE, y
// llama a `pintarCrono()` de inmediato. Si el cronómetro llevaba más de dos
// horas —empezaste a las 23:40, cerraste la app, la abres a las 10:00— ahí
// mismo saltaba `cerrarSesionSola`, que:
//
//   1. llama a `pararCrono()`, que borra `macros.sesionInicio` del teléfono;
//   2. y después a `guardarSesionAhora`, que lee los ejercicios DEL DOM.
//
// Y en el arranque el DOM está vacío. `index.html` trae
// `<div id="exerciseList"></div>` y la rutina llega de `sbCargarRutina()`,
// que es una petición: todavía no ha vuelto. Así que `detalle` salía vacío,
// la función se iba por «No hay series con peso que guardar» y NO SE
// GUARDABA NADA.
//
// O sea: el cronómetro desaparecía, el entrenamiento no se registraba, la
// llave del teléfono quedaba borrada —así que ni reabriendo se reintentaba—
// y lo único que se veía era un aviso suelto hablando de series, al abrir la
// app, sin relación visible con lo de anoche. Se comprobó ejecutando la app
// de verdad con el cronómetro puesto tres horas atrás: cero peticiones a
// `workout_sessions` y la llave borrada.
//
// EL ARREGLO es el mismo razonamiento que ya está escrito dos pantallas más
// arriba para la búsqueda de la fila: una pantalla vacía no es «no hay nada
// que guardar», es «todavía no sé qué hay». Así que el cierre solo salta
// cuando la rutina está delante. El cronómetro sigue corriendo —que es la
// verdad: esa sesión sigue sin cerrarse— y en cuanto la rutina aparece, un
// segundo después, el cierre hace su trabajo con los datos puestos.
//
// Y DE PASO, LO QUE QUEDABA MARCADO SIN HABERSE GUARDADO. `SESIONES[fecha]`
// se pone en true en la primera línea, antes de saber si hay algo. Por el
// camino de «no hay series» se volvía sin deshacerlo, así que la tabla de la
// semana pintaba un «SÍ» en un día sin sesión: un botón que al tocarlo pide
// al servidor una sesión que no existe.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nLa pantalla del arranque está vacía de verdad');
{
  // De aquí sale todo lo demás: si el index trajera una rutina de ejemplo,
  // el fallo no existiría y esta prueba no haría falta.
  ok(/<div id="exerciseList"><\/div>/.test(HTML),
     'el index trae la lista de ejercicios vacía',
     'la rutina la pone `sbCargarRutina()`, que es una petición');
}

// ------------------------------------------------------------------
console.log('\nY el cierre no salta sobre una pantalla sin rutina');
{
  // EJECUTADO. `pintarCrono` de verdad, con un cronómetro de tres horas y
  // una lista que contesta a `querySelector` según el caso.
  const correr = ({ hayRutina }) => {
    const cerrados = [];
    const pintado = { texto: null, oculto: null };
    const chip = {
      set hidden(v){ pintado.oculto = v; },
      get hidden(){ return pintado.oculto; },
      querySelector: () => ({ set textContent(v){ pintado.texto = v; } })
    };
    const api = new Function('document', 'exList', 'cerrarSesionSola', 'fmtLargo', 'pararCrono', `
      var TOPE_AUTO = 2 * 3600 * 1000;
      var sesionInicio = Date.now() - 3 * 3600 * 1000;
      ${sinC(fn('function pintarCrono(){'))}
      return pintarCrono;
    `)({ getElementById: () => chip },
       { querySelector: (sel) => (hayRutina && sel === '.exercise-card' ? {} : null) },
       (seg) => cerrados.push(seg),
       (seg) => 'T+' + seg,
       () => cerrados.push('parado'));
    api();
    return { cerrados, pintado };
  };

  const vacia = correr({ hayRutina: false });
  ok(vacia.cerrados.length === 0,
     'con la lista vacía NO se cierra la sesión',
     'cerró: ' + JSON.stringify(vacia.cerrados) +
     '\n         aquí es donde se perdía el entrenamiento: guardar leyendo una ' +
     'pantalla\n         que todavía no ha cargado es guardar cero series');
  ok(vacia.pintado.oculto === false && /^T\+/.test(String(vacia.pintado.texto)),
     'y el cronómetro se sigue viendo',
     'pintó: ' + JSON.stringify(vacia.pintado) +
     '\n         esa sesión sigue sin cerrarse, y eso es lo que hay que enseñar');

  const llena = correr({ hayRutina: true });
  ok(llena.cerrados.length === 1 && llena.cerrados[0] >= 7200,
     'y con la rutina delante SÍ se cierra',
     'cerró: ' + JSON.stringify(llena.cerrados) +
     '\n         sin esto el arreglo habría apagado el cierre automático entero');
  ok(llena.pintado.texto === null,
     'y entonces ya no se pinta el tiempo',
     'cerrar guarda y para el cronómetro: seguir pintándolo sería enseñar uno ' +
     'muerto');
}

// ------------------------------------------------------------------
console.log('\nY el reloj movido se sigue descartando');
{
  // Lo de arriba no puede haberse llevado por delante la otra guarda: un
  // arranque en el futuro no es un entrenamiento largo.
  const f = fn('function pintarCrono(){');
  ok(/if\(seg < 0\)\{ pararCrono\(\); return; \}/.test(f),
     'un cronómetro en negativo para y se va');
}

// ------------------------------------------------------------------
console.log('\nNada queda marcado como entrenado si no se guardó');
{
  // EJECUTADA la función de guardar con la lista vacía, que es el caso del
  // arranque. Lo que se mira es qué deja en `SESIONES`.
  const correr = ({ yaHabia }) => {
    const SESIONES = {};
    if (yaHabia) SESIONES['2026-11-19'] = true;
    const avisos = [], pintados = [];
    const lista = { querySelectorAll: () => [], querySelector: () => null };
    const api = new Function(
      'exList', 'SESIONES', 'HISTORIAL', 'iso', 'HOY', 'volumenDeSerie',
      'saveCurrentDay', 'pintarEjercicio', 'recalcAll', 'toast', 'sesion',
      'activeTab', 'programarGuardado', `
      var guardandoSesion = false;
      ${sinC(fn('function guardarSesionAhora(opciones){'))}
      return { guardar: guardarSesionAhora, candado: function(){ return guardandoSesion; } };
    `)(lista, SESIONES, {},
       (d) => '2026-11-19', new Date('2026-11-19T00:00:00'), () => 0,
       () => {}, () => pintados.push(1), () => {},
       (_, m) => avisos.push(m),
       { user: { id: 'u1' } }, () => null, () => {});
    api.guardar({ fecha: '2026-11-19', minutos: null, sola: true });
    return { SESIONES, avisos, pintados, candado: api.candado() };
  };

  const limpio = correr({ yaHabia: false });
  ok(limpio.avisos.length === 1 && /No hay series con peso/.test(limpio.avisos[0]),
     'se dice que no había series', JSON.stringify(limpio.avisos));
  ok(limpio.SESIONES['2026-11-19'] !== true,
     'y ese día NO queda marcado como entrenado',
     'quedó: ' + JSON.stringify(limpio.SESIONES) +
     '\n         un «SÍ» en la tabla de la semana por un día sin fila: al ' +
     'tocarlo\n         le pide al servidor una sesión que no existe');
  ok(limpio.pintados.length >= 2,
     'y la tabla se repinta para que la marca se vaya de la pantalla',
     'pintar solo antes de deshacerlo deja el «SÍ» puesto hasta que algo más ' +
     'repinte');
  ok(limpio.candado === false, 'y el candado queda suelto');

  // LO QUE NO SE PUEDE LLEVAR POR DELANTE: una sesión que SÍ estaba
  // guardada de ese mismo día. Borrarla de la pantalla por un segundo
  // intento fallido sería cambiar un fallo por otro.
  const conSesion = correr({ yaHabia: true });
  ok(conSesion.SESIONES['2026-11-19'] === true,
     'pero una sesión que ya estaba guardada se queda',
     'quedó: ' + JSON.stringify(conSesion.SESIONES) +
     '\n         la fila sigue en la base: quitarle el «SÍ» sería mentir al ' +
     'revés');
}

// ------------------------------------------------------------------
console.log('\nY lo mismo cuando el guardado falla de verdad');
{
  // El camino del error también deshacía a ciegas: `delete SESIONES[fecha]`
  // sin mirar si ya había una. Es el mismo fallo, en el otro extremo.
  const f = fn('function guardarSesionAhora(opciones){');
  ok(/var habiaSesion = !!SESIONES\[fecha\];/.test(f),
     'se recuerda si ese día ya tenía sesión antes de marcarlo');
  const deshace = (f.match(/habiaSesion \? true : undefined|if\(!habiaSesion\)/g) || []).length;
  ok(deshace >= 2,
     `los dos caminos que deshacen lo consultan (${deshace})`,
     'el de «no hay series» y el del fallo de servidor');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

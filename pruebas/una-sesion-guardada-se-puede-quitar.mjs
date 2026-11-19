// Darle a «Guardar sesión» sin querer era para siempre.
//
// Las series vienen rellenas con lo que dice la rutina, así que el botón
// funciona igual antes de empezar que al terminar. Un toque de más guarda
// una sesión ENTERA, con el volumen de toda la rutina rellenada.
//
// Y si además la pestaña estaba puesta en otro día de rutina, el guardado
// de verdad no la pisa: la clave para actualizar es fecha + día de rutina, y
// dos días distintos son dos sesiones A PROPÓSITO —empuje por la mañana,
// tirón por la tarde—. Así que quedan dos filas y el volumen del día cuenta
// las dos.
//
// Ese número alimenta la regla más cara del cierre del lunes: «peso plano y
// volumen SUBIENDO → está funcionando, no le toques nada». Un volumen
// doblado le dice a la IA que progresaste cuando no.
//
// Y no había forma de deshacerlo: `workout_sessions` no tenía un solo
// borrado en toda la app. El comentario de la carga lo decía sin verlo —«son
// historial: se leen, no se editan»—.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'componentes.css'), 'utf8');

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
// El cuerpo de un addEventListener('click', …) sobre un id.
function alPulsar(id) {
  const marca = "document.getElementById('" + id + "').addEventListener('click', function(e){";
  const i = LIMPIO.indexOf(marca);
  if (i < 0) throw new Error('no encuentro el click de ' + id);
  let n = 0; const abre = LIMPIO.indexOf('{', i + marca.length - 1);
  for (let j = abre; j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(abre + 1, j); }
  }
  throw new Error('llaves sin cerrar en ' + id);
}

// ------------------------------------------------------------------
console.log('\nHay por dónde entrar');
{
  ok(/data-ver-sesion="/.test(APP), 'el «SÍ» de la semana se puede tocar',
     'es el único sitio donde una sesión guardada se ve: si no se toca ahí, ' +
     'no se toca en ninguna parte');
  ok(/class="pill-si"/.test(APP) && /\.pill-si\{[^}]*border:none/.test(CSS.replace(/\s+/g, ' ')),
     'y sigue viéndose igual aunque ahora sea un botón',
     'sin los reinicios, un `button` se pinta con el marco del navegador');
  for (const id of ['sesionQuitarSheet', 'sesionQuitarDia', 'sesionQuitarLista', 'sesionQuitarNo']) {
    ok(new RegExp('id="' + id + '"').test(HTML), 'está el id «' + id + '»');
  }
  ok(/Quitar una no se puede deshacer/.test(HTML), 'y se avisa de que no se deshace');
}

// ------------------------------------------------------------------
console.log('\nSe listan TODAS las del día, no se pregunta por una');
{
  const pintar = (lista) => {
    const caja = { innerHTML: '' };
    new Function('sesionesDelDia', 'document', 'escapar', 'mil',
      sinC(fn('function pintarSesionesDelDia(){')) + '; pintarSesionesDelDia();'
    )(lista, { getElementById: (id) => (id === 'sesionQuitarLista' ? caja : null) },
      (s) => String(s), (n) => String(n));
    return caja.innerHTML;
  };

  // Un día puede tener dos de verdad, así que hay que poder decir CUÁL
  // sobra. Con una sola pregunta no se puede.
  const dos = pintar([{ id: 'a', dia: 'Martes', vol: 5850 },
                      { id: 'b', dia: 'Jueves', vol: 4650 }]);
  ok(/Martes/.test(dos) && /Jueves/.test(dos), 'salen las dos con su día de rutina', dos);
  ok(/5850 kg·rep/.test(dos) && /4650 kg·rep/.test(dos),
     'y con su volumen, que es lo que las distingue',
     'dos sesiones del mismo día se llaman distinto o pesan distinto: sin el ' +
     'número no hay forma de saber cuál fue el toque de más');
  ok((dos.match(/data-quitar-sesion=/g) || []).length === 2, 'cada una con su botón');

  ok(/Ya no queda ninguna/.test(pintar([])),
     'y si se quitó la última, se dice en vez de dejar un hueco',
     'la hoja se queda abierta después de quitar');
}

// ------------------------------------------------------------------
console.log('\nY quitarla limpia todo lo que la contaba');
{
  const cuerpo = alPulsar('sesionQuitarLista');

  ok(/method:'DELETE'/.test(cuerpo), 'se borra de la base');
  ok(/user_id=eq\./.test(cuerpo), 'y con el user_id además del id',
     'RLS ya lo impediría, pero aquí la regla es no apoyarse solo en ella');

  // UN DELETE QUE NO ENCAJA SALE BIEN SIN TOCAR NADA. Sin releer, un borrado
  // que no borró se ve idéntico a uno que sí.
  const releer = cuerpo.indexOf('select=id&limit=1&id=eq.');
  ok(releer > cuerpo.indexOf("method:'DELETE'"), 'y se vuelve a preguntar si sigue ahí');
  ok(/la sesión sigue ahí/.test(cuerpo), 'y se trata como un fallo si sigue');

  // LA COLA. Una sesión guardada sin señal espera ahí con su clave: sin
  // quitarla, vuelve a subir en cuanto haya red.
  ok(/quitarDeLaCola\('sesion:' \+ s\.fecha \+ ':' \+ s\.rutina\)/.test(cuerpo),
     'lo que esperaba subir de esa sesión se quita de la cola',
     'si no, reaparece sola con la siguiente señal');
  ok(cuerpo.indexOf('quitarDeLaCola') > releer,
     'y DESPUÉS de saber que se borró de verdad',
     'antes, un servidor que no contesta deja la sesión quitada de la cola ' +
     'y viva en la base');

  // Y SE RECARGA EL HISTORIAL ENTERO, que es de donde salen la racha, las
  // gráficas por ejercicio y el volumen del cierre.
  ok(/sbCargarSesiones\(\)/.test(cuerpo), 'se recarga el historial de la base',
     'parchear `SESIONES` y `HISTORIAL` a mano deja la gráfica de un ' +
     'ejercicio con un punto que ya no existe');
  ok(/pintarEjercicio\(\)/.test(cuerpo), 'y se repinta la semana',
     'el «SÍ» de ese día tiene que poder volver a ser «—»');

  ok(/[Ss]in señal/.test(cuerpo) && /sinConexion\(e\)/.test(cuerpo),
     'y sin señal se dice que hace falta conexión',
     'encolar un borrado que ni siquiera se sabe si tiene algo que borrar es ' +
     'peor que no hacerlo');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

// Una hoja que se abre desde otra pantalla no se ve.
//
// EL MECANISMO. El fondo de las hojas es `position:absolute; inset:0`, así que
// se estira contra su ancestro COLOCADO. Si la hoja vive dentro de una vista,
// ese ancestro es la vista; y las vistas que no están activas son
// `display:none`. Resultado: la hoja se abre de verdad —se le pone la clase
// `open`, el navegador dice `display:flex`, `visibility:visible`,
// `opacity:1`— midiendo 0×0.
//
// No hay error. No hay aviso. Solo la animación del toque y nada después.
// Desde fuera es «el botón no hace nada».
//
// LAS DOS QUE ESTABAN ASÍ:
//
//   chequeoSheet   la abre el banner «tu semana nueva está lista», que está
//                  en el Diario, y ella vivía en Perfil.
//
//   preguntaSheet  es la de «¿seguro?». Vivía en Rutina, pero se usa también
//                  al crear un alimento y al apuntar comida. Y ahí era PEOR
//                  que invisible: `preguntar()` devuelve una promesa que solo
//                  se resuelve al pulsar un botón. Sin hoja no hay pulsación,
//                  la promesa se queda colgada para siempre, y el alimento no
//                  se apunta. Pulsabas «Guardar alimento» y no pasaba nada.
//
// La regla ya estaba escrita en el HTML, en el comentario de la hoja de la
// cantidad: «Dentro de una de ellas, desde las otras tres no se vería». Estas
// dos simplemente nunca se movieron.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ---- Dónde vive cada hoja, contando el anidamiento de verdad ----
//
// No por la sangría: eso es una convención y se rompe con un formateo. Se
// lleva una pila de <div> abiertos y se mira si alguno es una vista.
function dondeViven() {
  const dentroDe = {};
  const pila = [];
  const re = /<div\b([^>]*)>|<\/div>/g;
  let m;
  while ((m = re.exec(HTML))) {
    if (m[0] === '</div>') { pila.pop(); continue; }
    const attrs = m[1];
    const vista = (attrs.match(/data-view="([^"]+)"/) || [])[1] || null;
    pila.push(vista);
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    if (id && /sheet-backdrop/.test(attrs)) {
      // La propia hoja acaba de entrar en la pila; se mira lo de debajo.
      dentroDe[id] = pila.slice(0, -1).filter(Boolean).pop() || null;
    }
  }
  return dentroDe;
}

const viven = dondeViven();

console.log('\nSe encuentran todas las hojas');
{
  const n = Object.keys(viven).length;
  ok(n >= 15, `hay ${n} hojas y se sabe dónde vive cada una`,
     'si salen pocas, el recuento del anidamiento se rompió y esta prueba no ' +
     'está mirando nada: ' + JSON.stringify(viven));
  ok(viven.cantSheet === null, 'la de la cantidad vive fuera, como estaba');
}

console.log('\nLas que se abren desde más de una pantalla, fuera de las vistas');
{
  // Cada una con por qué. Si alguna deja de usarse desde varios sitios, se
  // puede volver a meter dentro; hasta entonces, fuera.
  const deben = {
    cantSheet: 'se abre desde la búsqueda, Frecuentes, Guardados y al tocar algo ya apuntado',
    pesoReinicioSheet: 'se abre desde Peso, que es una vista aparte',
    chequeoSheet: 'la abre el banner del Diario',
    preguntaSheet: 'se usa al crear un alimento, al apuntar comida y en Rutina',
  };
  for (const [id, porque] of Object.entries(deben)) {
    ok(viven[id] === null, `${id} vive fuera de las vistas — ${porque}`,
       'vive dentro de «' + viven[id] + '»: desde cualquier otra pantalla se ' +
       'abre midiendo 0×0, sin un solo error');
  }
}

console.log('\nY «¿seguro?» se sigue usando desde varias pantallas');
{
  // Es lo que hace que la regla de arriba siga siendo cierta. Si un día solo
  // se usara desde Rutina, podría volver dentro.
  const usos = (APP.match(/\n\s*preguntar\(/g) || []).length;
  ok(usos >= 2, `se llama desde ${usos} sitios`,
     'con uno solo, esta regla dejaría de hacer falta y sobra');
  // Y lo que la hacía peligrosa: la promesa solo se resuelve al pulsar.
  const f = APP.slice(APP.indexOf('  function preguntar('),
                      APP.indexOf('\n  }', APP.indexOf('  function preguntar(')));
  ok(/return new Promise/.test(f) && /listo\(respuesta\)/.test(f),
     'y solo se resuelve cuando alguien pulsa',
     'por eso una hoja invisible no es solo fea: deja el flujo colgado');
}

console.log('\nY el banner del Diario sigue abriendo esa hoja');
{
  ok(/id="chequeoPend"/.test(HTML), 'el banner existe');
  const i = HTML.indexOf('id="chequeoPend"');
  const vistaDelBoton = (() => {
    // La última vista abierta antes del botón.
    const antes = HTML.slice(0, i);
    const abiertas = [...antes.matchAll(/data-view="([^"]+)"/g)].map((x) => x[1]);
    return abiertas.pop();
  })();
  ok(vistaDelBoton === 'diario', 'y está en el Diario', 'está en ' + vistaDelBoton);
  ok(/closest\('#chequeoPend'\)/.test(APP), 'y su toque se escucha');
  ok(/chequeoSheet\.classList\.add\('open'\)/.test(APP), 'para abrir la hoja del chequeo');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

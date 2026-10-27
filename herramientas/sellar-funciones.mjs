// Pone en cada Edge Function un sello sacado de su propio contenido.
//
// Para qué: las funciones se despliegan A MANO por el panel de Supabase, y
// nada avisa cuando el repo y lo que corre allí dejan de ser lo mismo. Pasó:
// el cambio del 1 de septiembre en `asistente` —la memoria en el cierre
// semanal y la defensa que la acompaña— estuvo dos meses sin que se pudiera
// decir si estaba desplegado. Y no por descuido: no había forma de saberlo.
// Desde fuera la función no decía quién era, y mirar el editor del panel no
// prueba nada —un borrador que se quedó dentro desplegó una vez el archivo
// duplicado y tiró el asistente horas con un BOOT_ERROR—.
//
// Ahora cada función lleva su sello y lo devuelve en un GET sin sesión, que
// no toca datos ni gasta tokens. `pruebas/funciones-vivas.mjs` lo compara
// con el del repo y dice si hay que desplegar.
//
// Igual que el de index.html, el sello sale del CONTENIDO y no de la fecha
// ni de un número que haya que acordarse de subir.
//
// Se ejecuta ANTES de desplegar:   node herramientas/sellar-funciones.mjs
// Y la prueba salta si se olvidó.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selloDe } from './sellar.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'supabase', 'functions');

// El mismo de index.html pero en TypeScript, y uno solo por función.
export const PATRON_SELLO = /(const SELLO = ')([^']*)(';)/g;

export function funciones() {
  return readdirSync(DIR, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort();
}

// Todos los archivos de la carpeta, no solo index.ts: el día que una
// función se parta en dos, un sello que mirara solo el index diría que no
// cambió nada. Ordenados por ruta para que no dependa de cómo los devuelva
// el sistema, que cambia entre Windows y una Mac.
function archivos(dir) {
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivos(ruta));
    else salida.push(ruta);
  }
  return salida.sort((a, b) => relative(DIR, a).localeCompare(relative(DIR, b)));
}

function contenidoSellado(nombre) {
  // Se les quita ANTES el sello: si no, esto se muerde la cola —cambiar el
  // sello cambia el archivo, que cambia el sello, y así siempre—.
  return archivos(join(DIR, nombre))
    .map(f => readFileSync(f, 'utf8').replace(PATRON_SELLO, '$1$3'))
    .join('\n');
}

// Lo que el contenido DA.
export function selloDeFuncion(nombre) {
  return selloDe(contenidoSellado(nombre));
}

// Lo que el archivo DICE. No tienen por qué coincidir: si alguien tocó la
// función y no corrió esto, el archivo dice el de antes. De ahí que la
// prueba mire las dos cosas por separado.
export function selloEscrito(nombre) {
  const ruta = join(DIR, nombre, 'index.ts');
  const hay = readFileSync(ruta, 'utf8').match(PATRON_SELLO);
  if (!hay) throw new Error(`${nombre}: no encontré «const SELLO = '...'» en index.ts`);
  // Si un día hay dos, mejor enterarse aquí que desplegar con el que no es.
  if (hay.length !== 1) throw new Error(`${nombre}: esperaba 1 sello y hay ${hay.length}`);
  return hay[0].match(/'([^']*)'/)[1];
}

export function sellar({ escribir = true } = {}) {
  return funciones().map(nombre => {
    const sello = selloDeFuncion(nombre);
    const anterior = selloEscrito(nombre);
    const cambio = anterior !== sello;
    if (cambio && escribir) {
      const ruta = join(DIR, nombre, 'index.ts');
      writeFileSync(ruta, readFileSync(ruta, 'utf8').replace(PATRON_SELLO, `$1${sello}$3`));
    }
    return { nombre, sello, anterior, cambio };
  });
}

// Solo al ejecutarlo a mano, no al importarlo desde la prueba.
if (process.argv[1] && process.argv[1].endsWith('sellar-funciones.mjs')) {
  for (const r of sellar()) {
    console.log(r.cambio
      ? `${r.nombre}: ${r.anterior} -> ${r.sello}  (hay que desplegarla)`
      : `${r.nombre}: ya al día (${r.sello})`);
  }
}

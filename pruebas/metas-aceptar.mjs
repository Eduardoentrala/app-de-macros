// Cambiar los macros: los tres primero, el aviso después.
//
// LO QUE PASABA. El aviso colgaba del 'change' de los tres campos, así que
// tocabas carbos y —antes de llegar a las grasas— ya estaba preguntando si
// querías esas calorías y avisando de la semana. Cambiar los tres macros es
// UNA decisión y salían tres avisos, los dos primeros sobre números a
// medias.
//
// Y AL MOVERLO A UN BOTÓN APARECE UN CABO SUELTO. `actualizarMetas()` corre
// en cada tecla y escribe DIRECTO en el anillo del Diario y en las metas de
// hoy. Mientras estás en la tarjeta eso está bien —es lo que enseña a dónde
// estás llegando—, pero si sales sin pulsar «Aceptar», el resto de la app se
// queda enseñando unas metas que no están guardadas en ningún sitio.
//
// Antes eso no podía pasar: nunca había nada pendiente más de un segundo.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(AQUI, '..', 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(AQUI, '..', 'docs', 'index.html'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};
function sacar(desde, hasta) {
  const i = APP.indexOf(desde);
  if (i < 0) return null;
  const j = APP.indexOf(hasta, i);
  return j < 0 ? null : APP.slice(i, j + hasta.length);
}

// ------------------------------------------------------------------
console.log('\nYa NO pregunta al salir de cada campo');
{
  const i = APP.indexOf('[goalP, goalC, goalG].forEach(function(el){');
  const bloque = APP.slice(i, APP.indexOf('\n  });', i));

  ok(!/addEventListener\('change', pedirConfirmacionMetas\)/.test(bloque),
     'el aviso ya no cuelga del «change» de los tres campos');
  ok(/addEventListener\('input', function\(\)\{ actualizarMetas\(\)/.test(bloque),
     'pero el «input» se queda: es lo que enseña las calorías mientras tecleas');
  ok(/pintarMetasPendientes\(\)/.test(bloque),
     'y en cada tecla se decide si hace falta el botón');
}

// ------------------------------------------------------------------
console.log('\nAhora hay un botón, y solo cuando hace falta');
{
  ok(/id="metasAceptar"/.test(HTML), 'existe el botón');
  ok(/id="metasPendientesCaja"[^>]*hidden/.test(HTML),
     'y nace escondido: puesto siempre no diría nada');
  ok(/Sin guardar/.test(HTML), 'con la etiqueta de que falta guardar');

  ok(/getElementById\('metasAceptar'\)\.addEventListener\('click', pedirConfirmacionMetas\)/
     .test(APP), 'y es él quien abre el aviso de siempre');

  // Se EJECUTA la regla de cuándo sale.
  const f = sacar('  function pintarMetasPendientes(){', '\n  }');
  ok(!!f && /caja\.hidden = mismasMetas\(leerMetas\(\), metasVigentes\);/.test(f),
     'sale exactamente cuando lo tecleado difiere de lo guardado');

  const fMismas = sacar('  function mismasMetas(a, b){', '\n');
  const mismasMetas = new Function('return ' +
    fMismas.trim().replace(/^function/, 'function') + ';')();
  const guardado = { P: 170, C: 240, G: 75 };
  ok(mismasMetas({ P: 170, C: 240, G: 75 }, guardado) === true,
     'sin cambios, iguales: no hay botón');
  ok(mismasMetas({ P: 170, C: 250, G: 75 }, guardado) === false,
     'con los carbos movidos, distintos: sale el botón');
  ok(mismasMetas({ P: 180, C: 250, G: 80 }, guardado) === false,
     'y con los tres movidos también, pero es UN botón, no tres avisos');
}

// ------------------------------------------------------------------
console.log('\nY el botón se va cuando ya no hace falta');
{
  const iAcep = APP.indexOf('apuntarCambioDeMeta(calDe(metasVigentes), calDe(metasPendientes));');
  ok(APP.slice(iAcep, iAcep + 300).includes('pintarMetasPendientes()'),
     'al guardar: ya no hay nada pendiente');

  const f = sacar('  function cancelarMetas(){', '\n  }');
  ok(!!f && /pintarMetasPendientes\(\)/.test(f),
     'y al cancelar también, que los campos vuelven a lo guardado');
}

// ------------------------------------------------------------------
console.log('\nSALIR SIN ACEPTAR NO PUEDE DEJAR EL DIARIO MINTIENDO');
{
  const f = sacar('  function revertirMetasSinGuardar(){', '\n  }');
  ok(!!f, 'hay algo que deshace lo tecleado y no guardado');
  ok(!!f && /escribirMetas\(metasVigentes\)/.test(f),
     'devuelve los campos a lo guardado');
  ok(!!f && /actualizarMetas\(\)/.test(f),
     'y recalcula, que es lo que devuelve el anillo del Diario a su sitio');

  // Con la hoja abierta NO se toca: ahí ya se está decidiendo.
  ok(!!f && /if\(!metasVigentes \|\| metasPendientes\) return;/.test(f),
     'pero no con la hoja de confirmar abierta: ahí ya se está decidiendo');

  // Y que alguien la llame de verdad, al salir de Perfil.
  const fShow = sacar('  function show(id){', '\n  }');
  ok(!!fShow && /revertirMetasSinGuardar/.test(fShow),
     'y se llama al cambiar de pantalla');
  ok(!!fShow && /id !== 'perfil'/.test(fShow),
     'solo al SALIR de Perfil: repintar la propia pantalla no puede deshacer lo que estás escribiendo');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

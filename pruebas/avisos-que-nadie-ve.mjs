// Un archivo que no se puede leer deja la app colgada en silencio.
//
// `FileReader` avisa de un fallo por `onerror`, y sin ese manejador la
// función que espera la respuesta NO SE LLAMA NUNCA. No hay excepción, no
// hay nada en la consola: la app se queda esperando para siempre. Es la
// misma familia que una hoja que se abre midiendo 0×0, y desde fuera se ve
// igual: «le doy y no pasa nada».
//
// DOS SITIOS LO TENÍAN ASÍ:
//
//   Al comprimir una foto de progreso. El aviso se quedaba en
//   «Comprimiendo…» hasta recargar la app.
//
//   Al elegir la foto de perfil. Peor: no se abría la hoja de recortar y no
//   pasaba absolutamente nada. Y ahí fallan además las imágenes que el
//   navegador no sabe decodificar —un HEIC en un móvil viejo—, que pasan el
//   lector y revientan al pintarse: por eso hacen falta los DOS `onerror`,
//   el del lector y el de la imagen.
//
// Un tercer `FileReader` (el de la foto del chat) ya los tenía puestos, y
// fue el que enseñó cómo debía hacerse.
//
// ---------------------------------------------------------------------
// LO QUE NO ERA UN FALLO, apuntado para no volver a «arreglarlo»:
//
// `app.js` llama a `toast('toastPerfil', …)` y `toast('toastDiario', …)` y
// esos ids NO están en el HTML. Parece que seis mensajes se escriben para
// nadie, y no es verdad: `toast()` mira `offsetParent` —que cubre a la vez
// que el elemento no exista y que su vista esté oculta—, y en ese caso
// busca el aviso de la vista activa y lo CREA si no hay. Es deliberado y
// tiene su propia prueba en `plan.mjs`, que usa justamente `diario` como
// ejemplo de una vista sin aviso propio.
//
// O sea que añadir esos dos elementos al HTML no arregla nada y rompe esa
// prueba. Se probó; se deshizo.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const trozo = (cab) => {
  const i = APP.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
};

// ------------------------------------------------------------------
console.log('\nNingún FileReader se queda sin decir que falló');
{
  // La red de seguridad, por encima de los dos casos concretos: si mañana
  // aparece otro lector sin `onerror`, esto lo caza sin acordarse de nada.
  const sinAviso = [];
  for (const m of APP.matchAll(/var (\w+) = new FileReader\(\);/g)) {
    const nombre = m[1];
    // Desde donde se declara hasta que se le manda leer: ahí es donde se
    // cuelgan sus manejadores.
    const desde = m.index;
    const lee = APP.indexOf(nombre + '.read', desde);
    const bloque = APP.slice(desde, lee > 0 ? lee : desde + 900);
    if (!new RegExp(nombre + '\\.onerror').test(bloque)) {
      sinAviso.push(nombre + ' en la línea ' + APP.slice(0, desde).split('\n').length);
    }
  }
  ok(sinAviso.length === 0, 'todos avisan si la lectura falla',
     'sin `onerror`: ' + sinAviso.join(', ') + '\n         ' +
     'la función que espera la respuesta no se llama nunca y la app se ' +
     'queda colgada sin un solo error en ninguna consola');
}

console.log('\nAl comprimir una foto');
{
  const comp = trozo('function comprimir(file, listo){');
  ok(/fr\.onerror/.test(comp), 'el lector avisa si falla',
     'sin esto el aviso se queda en «Comprimiendo…» hasta recargar la app');
  ok(/fr\.onerror[^;]*listo\(null\)/.test(comp.replace(/\s+/g, ' ')),
     'y avisa con un null, por el camino que su llamante ya sabe tratar',
     'el que llama hace `if(!res)` y enseña «No se pudo leer la imagen»: no ' +
     'hace falta inventar otra vía');
  ok(/fr\.onload/.test(comp), 'sin perder el camino que sí funciona');

  // Y que el llamante siga sabiendo qué hacer con ese null.
  const i = APP.indexOf("document.getElementById('fotoInput').addEventListener");
  const usa = APP.slice(i, APP.indexOf('\n  });', i));
  ok(/if\(!res\)/.test(usa) && /No se pudo leer la imagen/.test(usa),
     'y el llamante lo trata y lo dice',
     'si deja de hacerlo, avisar con null vuelve a ser colgarse en silencio');
}

console.log('\nY al elegir la foto de perfil');
{
  const i = APP.indexOf("avatarInput.addEventListener('change'");
  const ava = APP.slice(i, APP.indexOf('\n  });', i));
  ok(/reader\.onerror/.test(ava), 'el lector avisa si falla',
     'sin esto, elegir un archivo ilegible no abre la hoja de recortar y no ' +
     'dice nada: exactamente «el botón no hace nada»');
  ok(/avaImg\.onerror/.test(ava), 'y la imagen también',
     'un HEIC en un móvil viejo pasa el lector y falla al pintarse: el ' +
     'lector solo no basta');
  ok((ava.match(/toast\(/g) || []).length >= 2, 'y los dos lo dicen',
     'poner el manejador y no avisar deja el mismo silencio de antes');

  // El `onerror` de la imagen tiene que estar puesto ANTES del `src`, o el
  // fallo puede llegar antes que el manejador.
  const iErr = ava.indexOf('avaImg.onerror');
  const iSrc = ava.indexOf('avaImg.src =');
  ok(iErr > 0 && iSrc > 0 && iErr < iSrc,
     'y el manejador se cuelga antes de darle la imagen',
     'puesto después, un fallo inmediato —una URL que ya está en caché y ' +
     'no decodifica— no encuentra a nadie escuchando');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

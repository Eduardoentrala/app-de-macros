// El aviso de privacidad se enseña CON LOS HUECOS SIN RELLENAR.
//
// `legal.md` se trae con un `fetch` y se mete tal cual en la pantalla. Así
// que hoy, quien lo abre, lee literalmente esto:
//
//   «**[NOMBRE COMPLETO O RAZÓN SOCIAL]**, con domicilio en
//    **[DOMICILIO FISCAL O PARTICULAR]**...»
//   «escribe a **[CORREO DE CONTACTO]** desde el correo de tu cuenta»
//
// Y no es una pantalla cualquiera: es el documento que hay que aceptar
// PARA REGISTRARSE. Se pide aceptar algo que está a medio escribir, y se
// manda a escribir a una dirección que no existe.
//
// Es la misma clase de fallo que «cuéntame cómo te sientes y te lo
// ajusto»: la app promete una puerta y la puerta no está. Solo que aquí
// está por escrito en un documento legal.
//
// ESTA PRUEBA ESTÁ ROJA A PROPÓSITO mientras los huecos sigan ahí. No se
// arregla con código: hacen falta tres datos de la persona que responde
// por esta app. Inventarlos sería peor que el hueco.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEGAL = readFileSync(join(RAIZ, 'docs', 'legal.md'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ------------------------------------------------------------------
console.log('\nLo que se lee es lo que hay en el fichero');
{
  // Si un día dejara de enseñarse tal cual, esta prueba habría que
  // repensarla: lo que la hace importar es que no hay nada en medio.
  ok(/fetch\('legal\.md'/.test(APP), 'el aviso se trae del fichero');
  ok(/textoLegal'\)\.innerHTML = comoHtml\(md\)/.test(APP),
     'y se mete en la pantalla sin pasar por ningún filtro',
     'lo que esté a medias en el fichero se ve a medias en el teléfono');
}

// ------------------------------------------------------------------
console.log('\nY no puede tener huecos sin rellenar');
{
  // Cualquier `[TEXTO EN MAYÚSCULAS]` suelto. Es la forma de un hueco de
  // plantilla, y no hay ninguna razón legítima para que aparezca en un
  // documento que alguien tiene que aceptar.
  const huecos = [...LEGAL.matchAll(/\[([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ \/]{4,})\]/g)]
    .map((m) => m[1]);
  const unicos = [...new Set(huecos)];
  ok(unicos.length === 0,
     'no quedan huecos de plantilla',
     'quedan ' + huecos.length + ': ' + unicos.join(' · ') +
     '\n         Se enseñan tal cual a quien abra el aviso, y es el ' +
     'documento que hay que aceptar para registrarse.' +
     '\n         NO SE ARREGLA CON CÓDIGO: hacen falta el nombre o razón ' +
     'social, el domicilio y un correo de contacto de quien responde por ' +
     'esta app. Inventarlos sería peor que el hueco.');
}

// ------------------------------------------------------------------
console.log('\nY lo que promete tiene que existir');
{
  // Si dice «escribe a X», X tiene que ser una dirección de verdad.
  const correos = [...LEGAL.matchAll(/escribe a \*\*([^*]+)\*\*/g)].map((m) => m[1]);
  ok(correos.length > 0, `promete ${correos.length} vez(ces) que se puede escribir`);
  const falsos = correos.filter((c) => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c.trim()));
  ok(falsos.length === 0,
     'y a una dirección que existe',
     'manda a escribir a: ' + falsos.join(' · ') +
     '\n         Mandar a alguien a una dirección que no existe es ' +
     'prometerle un derecho y cerrarle la puerta.');
}

// ------------------------------------------------------------------
console.log('\nY lo que ya se puede hacer solo, se dice');
{
  // Esta parte sí está bien y conviene que siga: los derechos que la app
  // resuelve sin escribirle a nadie tienen que estar en su lista.
  const i = LEGAL.indexOf('no hace falta escribir a nadie');
  const lista = i < 0 ? '' : LEGAL.slice(i, i + 400);
  ok(i > 0, 'hay una lista de lo que se hace sin pedir permiso');
  ok(/Eliminar mi cuenta/.test(lista), 'borrar la cuenta está ahí');
  ok(/[Dd]escargar/.test(lista),
     'y descargar los datos también',
     'se añadió el botón en Perfil y la lista se quedó sin actualizar: el ' +
     'documento seguiría mandando a escribir un correo para algo que ya es ' +
     'un toque');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

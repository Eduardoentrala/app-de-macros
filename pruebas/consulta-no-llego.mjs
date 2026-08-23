// Si la llamada NO LLEGÓ a Anthropic, la consulta no se cobra.
//
// El tope diario se gasta ANTES de llamar a la IA, y tiene que ser así: al
// revés, mil peticiones a la vez pasarían todas el filtro. La contrapartida
// es que cuando la llamada falla, la consulta ya está cobrada, y por eso ya
// se devuelve cuando Anthropic contesta 529, 429 o un 5xx.
//
// EL HUECO. Esa decisión se toma mirando el CÓDIGO de estado. Un fallo de
// conexión no trae código -no hubo respuesta que traerlo-, así que `estado`
// vale 0, no cuenta como saturado, y la persona pierde una de sus tres
// consultas del día por una red que se cayó entre dos servidores ajenos.
//
// Y NO SE PUEDE DEVOLVER SIN MÁS ANTE CUALQUIER FALLO, que sería lo cómodo.
// Si el error salta DESPUÉS de que Anthropic contestara -al leer su
// respuesta, por ejemplo- esa llamada ya está pagada, y devolver la consulta
// regala otra: dinero de verdad. Por eso se mira que el error sea de
// conexión, que es el único que garantiza que no hubo llamada que pagar.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ---- La regla de verdad, sacada y ejecutada ----
const i = FN.indexOf('    const estado = (e && typeof e === \'object\' && \'status\' in e)');
ok(i > 0, 'se encuentra la decisión');
const fin = FN.indexOf('\n\n', FN.indexOf('const saturado', i));
// El molde de TypeScript, fuera: es lo único que Node no entiende. Se quita
// con un patrón general y no con el texto exacto de un molde concreto —así
// escrito, añadir una segunda comprobación al lado dejaba la prueba rota
// culpando al código.
const fuente = FN.slice(i, fin)
  .replace(/\(e as \{[^}]*\}\)/g, 'e')
  .replace(/const /g, 'var ');

const decidir = new Function('e', fuente + '; return { estado: estado, saturado: saturado };');

// Los errores tal y como los da el SDK de Anthropic.
const conCodigo = (s) => Object.assign(new Error('x'), { status: s });
const deConexion = () => Object.assign(new Error('Connection error.'),
  { name: 'APIConnectionError' });
const deEspera = () => Object.assign(new Error('Request timed out.'),
  { name: 'APIConnectionTimeoutError' });

// ------------------------------------------------------------------
console.log('\nLo que ya se devolvía');
{
  ok(decidir(conCodigo(529)).saturado === true, 'un 529 «Overloaded»');
  ok(decidir(conCodigo(429)).saturado === true, 'un 429');
  ok(decidir(conCodigo(500)).saturado === true, 'un 500');
  ok(decidir(conCodigo(503)).saturado === true, 'un 503');
}

console.log('\nY lo que NO se devuelve, que es lo que evita regalar consultas');
{
  ok(decidir(conCodigo(400)).saturado === false,
     'un 400 no: la petición está mal armada y repetirla da lo mismo');
  ok(decidir(conCodigo(401)).saturado === false, 'ni un 401 de la clave');
  // Este es el importante: si el error salta DESPUÉS de que Anthropic
  // contestara, esa llamada ya está pagada.
  ok(decidir(new TypeError("Cannot read properties of undefined")).saturado === false,
     'ni un fallo nuestro al leer la respuesta, que ya está pagada',
     'devolver la consulta ahí regala otra llamada: dinero de verdad');
}

// ------------------------------------------------------------------
console.log('\nEl hueco: la llamada que no llegó a salir');
{
  ok(decidir(deConexion()).saturado === true,
     'un fallo de conexión cuenta como avería ajena',
     'se queda sin código, no cuenta como saturado, y la persona pierde una ' +
     'de sus tres consultas del día por una red entre dos servidores ajenos');
  ok(decidir(deEspera()).saturado === true,
     'y agotarse la espera de la conexión, también');
}

// ------------------------------------------------------------------
console.log('\nY se distingue por el nombre del error, no por el mensaje');
{
  // Los mensajes cambian de versión a versión y de idioma; el nombre de la
  // clase del SDK no. Es la misma razón por la que `sinConexion()` en la app
  // mira `e.name` y no el texto: «Failed to fetch» en un iPhone es «Load
  // failed».
  const trozo = FN.slice(i, fin);
  ok(/APIConnectionError/.test(trozo), 'se mira el nombre de la clase del SDK');
  ok(!/Connection error\./.test(trozo), 'y no el texto del mensaje',
     'los mensajes cambian entre versiones y entre idiomas');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

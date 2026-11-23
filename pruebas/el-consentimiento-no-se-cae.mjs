// El consentimiento viajaba en el grupo que se puede caer.
//
// `patchPerfilTolerante(datos, opcionales)` manda los dos juntos y, si
// el servidor contesta 42703 —«column ... does not exist»—, reintenta
// con `datos` SOLO. Es una buena idea y está bien explicada: la app se
// despliega sola al empujar y las migraciones van a mano, así que hay
// ratos en que la app va por delante de la base. Perder la cuenta de
// alguien por una columna que todavía no está sería absurdo.
//
// Lo que se cae en ese reintento son TODOS los opcionales a la vez. Y
// ahí dentro iban las dos casillas que la pantalla de registro pide por
// obligación legal —«la ley pide consentimiento EXPRESO y distinguible
// para datos sensibles»— con su fecha y su versión.
//
// El propio código lo dejó escrito al ponerlas ahí:
//
//     «Va en el segundo grupo —el que se puede caer— solo mientras la
//      migración 0031 no esté aplicada. En cuanto lo esté, sube al
//      primero: un consentimiento que se pierde en silencio no vale.»
//
// La 0031 está aplicada: se comprobó contra la base del 23 de noviembre
// de 2026 y las tres columnas —`consentimiento_en`,
// `consentimiento_version` y `consentimiento_salud_en`— están ahí. Así
// que la condición que el comentario puso ya se cumple y toca subirlas.
//
// NO ES TEÓRICO Y NO LO ERA. Hoy las columnas existen, así que el
// primer intento pasa y el consentimiento se guarda. El día que alguien
// añada OTRA columna opcional antes que su migración, el 42703 de esa
// se lleva por delante también el consentimiento — y en silencio, que
// es la parte que no vale. El reintento no distingue qué columna
// faltaba: tira el grupo entero.

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

const LIMPIO = APP.replace(/^\s*\/\/.*$/gm, '');
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

const CLAVES = ['consentimiento_en', 'consentimiento_version', 'consentimiento_salud_en'];

// ------------------------------------------------------------------
console.log('\nEl reintento sigue tirando los opcionales, como debe');
{
  const fuente = fn('function patchPerfilTolerante(');
  if (!fuente) {
    ok(false, 'existe `patchPerfilTolerante`');
  } else {
    const hecho = [];
    const sbFetch = (url, op) => {
      hecho.push(JSON.parse(op.body));
      if (hecho.length === 1) return Promise.reject(new Error('42703 column "x" does not exist'));
      return Promise.resolve(null);
    };
    const correr = new Function('sbFetch', 'sesion',
      fuente + '; return patchPerfilTolerante;')(sbFetch, { user: { id: 'yo' } });

    await correr({ full_name: 'x' }, { columna_nueva: 1 });
    ok(hecho.length === 2, 'ante un 42703 se reintenta una vez', 'intentos: ' + hecho.length);
    ok(hecho[1] && hecho[1].columna_nueva === undefined,
       'y el reintento va sin los opcionales', JSON.stringify(hecho[1]));
    ok(hecho[1] && hecho[1].full_name === 'x',
       'pero con lo obligatorio entero', JSON.stringify(hecho[1]));
  }
}

// ------------------------------------------------------------------
console.log('\nY cualquier otro error NO se reintenta');
{
  const fuente = fn('function patchPerfilTolerante(');
  let intentos = 0, salio = null;
  const sbFetch = () => { intentos++; return Promise.reject(new Error('42501 permission denied')); };
  const correr = new Function('sbFetch', 'sesion',
    fuente + '; return patchPerfilTolerante;')(sbFetch, { user: { id: 'yo' } });
  await correr({ a: 1 }, { b: 2 })['catch']((e) => { salio = e.message; });
  ok(intentos === 1, 'un error de permisos no se reintenta', 'intentos: ' + intentos);
  ok(/permission denied/.test(salio || ''),
     'y sale hacia fuera en vez de tragarse',
     'tragarse un fallo de permisos sería peor que perder el registro');
}

// ------------------------------------------------------------------
console.log('\nY el consentimiento ya no está en el grupo que se cae');
{
  // Las dos llamadas de `sbGuardarPerfil`: el primer objeto es el que
  // sobrevive al reintento, el segundo el que se tira entero.
  const guardar = fn('function sbGuardarPerfil(');
  if (!guardar) {
    ok(false, 'existe `sbGuardarPerfil`');
  } else {
    const i = guardar.indexOf('patchPerfilTolerante(');
    const cuerpo = guardar.slice(i);
    // El corte entre los dos argumentos: el `}, {` del primer nivel.
    const corte = cuerpo.indexOf('}, {');
    const primero = corte > 0 ? cuerpo.slice(0, corte) : cuerpo;
    const segundo = corte > 0 ? cuerpo.slice(corte) : '';

    for (const k of CLAVES) {
      ok(primero.includes(k),
         '`' + k + '` va en el grupo que no se cae',
         corte < 0
           ? 'no encuentro los dos grupos en la llamada'
           : (segundo.includes(k)
               ? 'sigue en el segundo. La 0031 ya está aplicada: el propio ' +
                 'comentario dice\n         que entonces sube al primero'
               : 'no aparece en ninguno de los dos'));
    }

    // Y la pantalla las sigue pidiendo, que si no esto no significa nada.
    ok(/regAceptoTerminos/.test(APP) && /regAceptoSalud/.test(APP),
       'y la pantalla de registro sigue pidiendo las dos casillas');
  }
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

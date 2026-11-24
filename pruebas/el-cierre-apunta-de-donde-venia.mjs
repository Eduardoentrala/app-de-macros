// El historial decía que el coach movía las calorías de tres en tres.
//
// Cada cierre guarda `cal_antes` y `cal_despues`. Y `cal_antes` se
// calculaba así, dentro de `guardarChequeo`:
//
//     cal_antes: Math.round(datosDeLaSemana().meta_cal)
//
// O sea, leyendo las metas EN ESE MOMENTO. Y el momento es este, en el
// mismo `then` y por este orden:
//
//     if(r.ajusto && r.cal_nueva) aplicarCaloriasNuevas(r.cal_nueva);
//     guardarChequeo(r, laFoto);
//
// Las metas ya están cambiadas cuando se pregunta de dónde venían. Así
// que `cal_antes` guardaba el valor de DESPUÉS, y las dos columnas
// salían casi iguales. En su historial de verdad, al 24 de noviembre
// de 2026:
//
//     semana      guardado        de verdad
//     2026-09-01  2253 -> 2250    2451 -> 2250   (-201, no -3)
//     2026-09-15  2100 -> 2100    2253 -> 2100   (-153, no 0)
//     2026-09-29  2001 -> 2000    2100 -> 2000   (-100, no -1)
//     2026-10-13  1848 -> 1850    2001 -> 1850   (-151, no +2)
//     2026-10-20  1947 -> 1950    1848 -> 1950   (+99,  no +3)
//     2026-11-24  2046 -> 2047    1947 -> 2047   (+99,  no +1)
//
// Seis de seis. Las semanas que NO ajustan salen bien, porque ahí no
// hay nada que cambiar: el fallo solo muerde en las que importan.
//
// DOS SITIOS LO LEEN Y LOS DOS MIENTEN.
//
//   · La tarjeta de «Mis semanas» pinta `metaCal: f.cal_antes` al lado
//     de `metaP/C/G: f.meta_p/c/g`. En su pantalla del 24 de noviembre:
//     «Calorías 1958 / 2046» con unos macros que suman 1947. Dos
//     mitades de la misma tarjeta, cada una de un momento distinto.
//   · Y el cierre del lunes se lo manda al modelo: «AJUSTES QUE YA SE
//     LE HICIERON... de ${cal_antes} a ${cal_despues}». El modelo lee
//     que cada escalón movió tres calorías y decide sobre eso.
//
// EL ARREGLO NO ES ADELANTAR LA LECTURA. Sería volver a depender del
// orden de dos líneas, que es justo lo que falló. `cal_antes` sale de
// la MISMA foto que ya lleva `meta_p/c/g` —tomada antes de llamar al
// modelo, con las metas de la semana que se cierra—, así que las dos
// mitades de la tarjeta no pueden volver a separarse: son el mismo
// número calculado una vez.

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

const guardar = fn('function guardarChequeo(');
if (!guardar) {
  console.log('\n  FALLA  no encuentro `guardarChequeo` en app.js');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}

// ------------------------------------------------------------------
console.log('\nDe dónde venía no se vuelve a preguntar tarde');
{
  ok(!/cal_antes:\s*Math\.round\(datosDeLaSemana\(\)/.test(guardar),
     '`cal_antes` ya no se lee de las metas de ahora',
     'cuando esto corre, `aplicarCaloriasNuevas` ya las cambió: guarda el ' +
     'valor de DESPUÉS');

  ok(/cal_antes:[^,]*foto/.test(guardar.replace(/\s+/g, ' ')),
     'y sale de la misma foto que lleva `meta_p/c/g`',
     'tomada antes de llamar al modelo, con las metas de la semana que se ' +
     'cierra:\n         así las dos mitades de la tarjeta no pueden separarse');
}

// ------------------------------------------------------------------
console.log('\nY sale el número que tenía esa semana');
{
  // Ejecutado: la foto con sus metas, y lo que acaba en el cuerpo.
  const cuerpos = [];
  const correr = new Function(
    'sesion', 'isoDe', 'anclaSemana', 'respuestasChequeo', 'document',
    'recortarTexto', 'sbFetch', 'apuntarFallo', 'datosDeLaSemana',
    // Las dos de verdad, no un doble: lo que se mide es justo el número
    // que sale de la foto.
    [fn('function calDeLaFoto('), guardar].join('\n') + '; return guardarChequeo;');

  const hazlo = (foto, metasDeAhora) => {
    cuerpos.length = 0;
    correr(
      { user: { id: 'yo' } }, () => '2026-11-24', null,
      () => ({ hambre: 4, energia: 2, sueno: 3 }),
      { getElementById: () => ({ value: '' }) },
      (t) => t,
      (url, op) => { cuerpos.push(JSON.parse(op.body)); return Promise.resolve(null); },
      () => {},
      // Las metas de AHORA, ya subidas por el cierre. Si `cal_antes` las
      // mira, sale 2047 en vez de 1947.
      () => ({ meta_cal: metasDeAhora }),
    )({ ajusto: true, cal_nueva: 2047, motivo: 'sube 100' }, foto);
    return cuerpos[0];
  };

  // Su caso del 24 de noviembre: la semana se cerró con P140 C205 G63.
  const c = hazlo({ meta_p: 140, meta_c: 205, meta_g: 63, dias_apuntados: 7 }, 2047);
  ok(c && c.cal_antes === 1947,
     'con metas P140 C205 G63, `cal_antes` son 1947',
     'salió ' + (c && c.cal_antes) + '. 140·4 + 205·4 + 63·9 = 1947, que es lo ' +
     'que tenía\n         esa semana; 2047 es lo que tiene desde que el cierre ' +
     'terminó');
  ok(c && c.cal_despues === 2047, 'y `cal_despues` sigue siendo lo nuevo',
     JSON.stringify(c && { a: c.cal_antes, d: c.cal_despues }));

  // Y cuadra con lo que la tarjeta pinta al lado.
  ok(c && c.cal_antes === c.meta_p * 4 + c.meta_c * 4 + c.meta_g * 9,
     'y es exactamente lo que suman los macros de la misma fila',
     'es lo que impide que la tarjeta enseñe «1958 / 2046» con unos macros ' +
     'de 1947');

  // Sin foto —una versión vieja, o un fallo al calcularla— no se inventa
  // un número: mejor un hueco que una cifra de otro momento.
  const sin = hazlo(null, 2047);
  ok(sin && (sin.cal_antes === null || sin.cal_antes === undefined),
     'y sin foto se guarda vacío en vez de un número de otro momento',
     'salió ' + JSON.stringify(sin && sin.cal_antes));

  // Y A MEDIAS TAMPOCO. Este es el que de verdad muerde: con un macro
  // nulo y sin mirarlo, el nulo entra como cero en la suma y sale una
  // cifra creíble —140·4 + 0 + 63·9 = 1127— que nadie va a cuestionar.
  // Un hueco se lee como «no se sabe»; 1127 se lee como un dato.
  for (const parcial of [
    { meta_p: 140, meta_c: null, meta_g: 63 },
    { meta_p: null, meta_c: 205, meta_g: 63 },
    { meta_p: 140, meta_c: 205, meta_g: null },
  ]) {
    const p = hazlo(Object.assign({ dias_apuntados: 7 }, parcial), 2047);
    ok(p && (p.cal_antes === null || p.cal_antes === undefined),
       'con ' + JSON.stringify(parcial) + ' se guarda vacío',
       'salió ' + JSON.stringify(p && p.cal_antes));
  }
}

// ------------------------------------------------------------------
console.log('\nY el orden del cierre sigue siendo el que es');
{
  // No se arregla moviendo líneas, pero si alguien las mueve conviene
  // saberlo: la foto se toma ANTES de hablar con el modelo.
  const i = LIMPIO.indexOf('laFoto = fotoDeLaSemana(');
  const j = LIMPIO.indexOf('aplicarCaloriasNuevas(r.cal_nueva)');
  const k = LIMPIO.indexOf('guardarChequeo(r, laFoto)');
  ok(i > 0 && j > i && k > j,
     'la foto se toma antes, se aplica después y se guarda al final',
     'foto ' + i + ', aplicar ' + j + ', guardar ' + k);
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

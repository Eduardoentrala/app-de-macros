// La semana que cruza el año se guardaba con la clave de otro año.
//
// LA CLAVE. Las fotos, y todo lo que va por semanas, se guardan con una clave
// ISO: `2026-W31`. La norma ISO dice que una semana pertenece al año de su
// JUEVES — por eso la semana 1 es la que contiene el 4 de enero, que siempre
// cae en la semana 1 pase lo que pase.
//
// `numSemana()` lo hacía bien: se va al jueves y cuenta desde ahí. Pero
// `claveSemana()` cogía el año del LUNES:
//
//     return l.getFullYear() + '-W' + numSemana(l)
//              ↑ el lunes                ↑ calculado con el jueves
//
// Los dos coinciden 51 semanas al año. En la que cruza el 1 de enero, no.
//
// EL DAÑO. El lunes 29 de diciembre de 2025 pertenece a la semana 2026-W01.
// La app la llamaba `2025-W01`. Y `2025-W01` NO es un hueco libre: es una
// semana que existe de verdad, la del 30 de diciembre de 2024 al 5 de enero
// de 2025.
//
// Las fotos llevan `unique (user_id, week_key, pose)`, y antes de guardar una
// se borra la que hubiera con esa clave y esa pose. Así que subir la foto de
// frente el 31 de diciembre de 2025 BORRA la de primeros de enero de 2025.
// Un año de diferencia, la misma clave, y la vieja desaparece. Sin aviso: la
// app hace exactamente lo que cree que le han pedido.
//
// Y aparte del choque, el orden: `2025-W01` se ordena como la primera semana
// de 2025, así que las fotos de fin de 2025 salían al principio del año.
//
// SE COMPRUEBA CONTRA UNA IMPLEMENTACIÓN DE REFERENCIA, no contra una lista
// de casos escritos a mano: se recorren diez años enteros, día a día, y se
// comparan las dos. Una lista de casos solo encuentra lo que ya sospechas.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

const fuente = sacar('function lunesDe(d){') + '\n' +
               sacar('function numSemana(d){') + '\n' +
               sacar('function claveSemana(d){') + '\n' +
               sacar('function lunesDeClave(k){');
const claveSemana  = new Function(fuente + '; return claveSemana;')();
const lunesDeClave = new Function(fuente + '; return lunesDeClave;')();

// La referencia, escrita aparte y a partir de la definición del estándar: la
// semana pertenece al año de su jueves.
function isoDeReferencia(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));       // el jueves
  const ene4 = new Date(x.getFullYear(), 0, 4);
  const n = 1 + Math.round(((x - ene4) / 86400000 - 3 + ((ene4.getDay() + 6) % 7)) / 7);
  return x.getFullYear() + '-W' + String(n).padStart(2, '0');
}

// ------------------------------------------------------------------
console.log('\nDiez años, día a día, contra el estándar');
{
  const malos = [];
  const d = new Date(2023, 0, 1);
  let dias = 0;
  while (d.getFullYear() <= 2032) {
    const mio = claveSemana(d), ref = isoDeReferencia(d);
    if (mio !== ref && malos.length < 6) malos.push(d.toDateString() + ': dice ' + mio + ', es ' + ref);
    if (mio !== ref) malos.total = (malos.total || 0) + 1;
    d.setDate(d.getDate() + 1);
    dias++;
  }
  ok(dias > 3600, 'se recorren ' + dias + ' días',
     'si son pocos, el bucle no está haciendo su trabajo');
  ok(!malos.total, 'ninguna clave se aparta del estándar ISO',
     (malos.total || 0) + ' días mal. El año sale del lunes y el número del ' +
     'jueves, y en la semana que cruza enero no son el mismo año:\n         ' +
     malos.join('\n         '));
}

// ------------------------------------------------------------------
console.log('\nY dos semanas distintas nunca comparten clave');
{
  // Esto es lo que de verdad borraba fotos: `unique (user_id, week_key,
  // pose)` más un borrado previo por esa clave.
  const vistas = new Map();
  const choques = [];
  const d = new Date(2023, 0, 1);
  while (d.getFullYear() <= 2032) {
    const k = claveSemana(d);
    const lunes = (() => { const x = new Date(d); x.setHours(0,0,0,0);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); })();
    if (vistas.has(k) && vistas.get(k) !== lunes) {
      const otra = new Date(vistas.get(k)).toDateString();
      if (choques.length < 5) choques.push(k + ': semana del ' + otra +
        ' y semana del ' + new Date(lunes).toDateString());
      choques.total = (choques.total || 0) + 1;
    } else if (!vistas.has(k)) vistas.set(k, lunes);
    d.setDate(d.getDate() + 1);
  }
  ok(!choques.total, 'cada clave es de una sola semana',
     'dos semanas con la misma clave: al subir la foto se borra la de la otra, ' +
     'que puede ser de hace un año.\n         ' + choques.join('\n         '));
}

// ------------------------------------------------------------------
console.log('\nY la clave se puede deshacer para volver al lunes');
{
  // `lunesDeClave` es la vuelta: de la clave al lunes de esa semana. La usa
  // la etiqueta que se enseña y el cálculo de qué semana comparar. Si la ida
  // y la vuelta no cuadran, la etiqueta miente sobre las fotos que enseña.
  const malos = [];
  const d = new Date(2023, 0, 1);
  while (d.getFullYear() <= 2032) {
    const lunes = lunesDeClave(claveSemana(d));
    const esperado = (() => { const x = new Date(d); x.setHours(0,0,0,0);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; })();
    if (lunes.getTime() !== esperado.getTime()) {
      if (malos.length < 5) malos.push(d.toDateString() + ': vuelve al ' + lunes.toDateString() +
        ', debía ser ' + esperado.toDateString());
      malos.total = (malos.total || 0) + 1;
    }
    d.setDate(d.getDate() + 1);
  }
  ok(!malos.total, 'la ida y la vuelta cuadran todos los días',
     (malos.total || 0) + ' días no vuelven a su lunes:\n         ' + malos.join('\n         '));
}

// ------------------------------------------------------------------
console.log('\nY lo que ya funcionaba sigue igual');
{
  // Una semana normal de mitad de año, para que un arreglo a lo bruto no
  // pase desapercibido.
  ok(claveSemana(new Date(2026, 7, 25)) === isoDeReferencia(new Date(2026, 7, 25)),
     'una semana de agosto sigue saliendo igual');
  ok(/^\d{4}-W\d{2}$/.test(claveSemana(new Date(2026, 7, 25))),
     'y con el formato que valida la base de datos',
     'la columna espera YYYY-Www: ' + claveSemana(new Date(2026, 7, 25)));
  // El 4 de enero está en la semana 1 por definición del estándar. Es el
  // ancla de todo el cálculo.
  for (const y of [2024, 2025, 2026, 2027]) {
    ok(claveSemana(new Date(y, 0, 4)) === y + '-W01',
       'el 4 de enero de ' + y + ' está en la semana 1',
       'salió ' + claveSemana(new Date(y, 0, 4)));
  }
}

// ------------------------------------------------------------------
console.log('\nY restar semanas en el servidor tampoco puede hacerse a ojo');
{
  // El mismo fallo por otro lado. La comparación de fotos exige que las dos
  // series estén al menos tres semanas separadas, y lo medía así:
  //
  //     año * 52 + semana
  //
  // Eso da por hecho que todos los años tienen 52 semanas. Los hay de 53. Así
  // que «2025-W53» y «2026-W01» salían con el MISMO número, y de 2025-W50 a
  // 2026-W02 —cinco semanas— salían cuatro. Cada enero la puerta se abría o
  // se cerraba antes de tiempo.
  const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
  const i = FN.indexOf('const lunesDeClave = (k: string)');
  ok(i > 0, 'la cuenta existe en la función',
     'si se volvió a `año * 52`, esto no la encuentra');

  // Se saca y se ejecuta, quitándole los tipos a mano (son dos anotaciones).
  const trozo = FN.slice(i, FN.indexOf('const vieja =', i));
  const semanasEntre = new Function(
    trozo.replace(/: string/g, '') + '; return semanasEntre;')();

  ok(semanasEntre('2026-W10', '2026-W07') === 3, 'tres semanas dentro del año son tres');
  ok(semanasEntre('2026-W10', '2026-W10') === 0, 'y la misma semana, cero');

  // LOS CASOS QUE FALLABAN están en los años de 53 semanas, y solo ahí: la
  // fórmula vieja salta 52 al cambiar de año, así que se queda corta en uno
  // justo cuando el año que se deja atrás tuvo 53.
  //
  // 2026 es uno de ellos. O sea que esto se habría notado este enero: quien
  // hubiera esperado sus tres semanas se habría encontrado un «demasiado
  // pronto» sin motivo. Los siguientes son 2032 y 2037.
  //
  // (De paso: `2025-W53` NO existe —2025 tiene 52— y por eso vale lo mismo
  // que 2026-W01. Se probó al revés primero, dando por hecho que todos los
  // años tienen una semana 53, y la prueba cantó. Tenía razón ella.)
  const viejo = (k) => Number(k.slice(0, 4)) * 52 + Number(k.slice(6));

  ok(semanasEntre('2027-W01', '2026-W52') === 2,
     'de la 52 de 2026 a la 1 de 2027 hay dos semanas, porque 2026 tiene 53',
     'salió ' + semanasEntre('2027-W01', '2026-W52'));
  ok(viejo('2027-W01') - viejo('2026-W52') === 1,
     'y la cuenta vieja decía una: se quedaba corta',
     'si esto falla, la cuenta vieja no era el problema y esta prueba mira mal');

  ok(semanasEntre('2027-W01', '2026-W51') === 3,
     'y tres semanas de verdad se cuentan como tres');
  ok(viejo('2027-W01') - viejo('2026-W51') === 2,
     'donde la vieja decía dos y cerraba la puerta',
     'esta era la que se notaba: el «al menos 3» rechazaba a quien sí había esperado');

  // Y contra la referencia, en todos los cruces de año de la década: la
  // distancia entre dos claves tiene que ser la de sus lunes de verdad.
  let malos = 0;
  for (let y = 2023; y <= 2032; y++) {
    for (const k of [y + '-W01', y + '-W02', y + '-W52']) {
      for (const j of [(y - 1) + '-W50', (y - 1) + '-W51', (y - 1) + '-W52', (y - 1) + '-W53']) {
        const real = Math.round(
          (lunesDeClave(k).getTime() - lunesDeClave(j).getTime()) / 604800000);
        if (semanasEntre(k, j) !== real) malos++;
      }
    }
  }
  ok(malos === 0, 'y cuadra con los lunes de verdad en todos los cruces de año',
     malos + ' pares mal contados');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

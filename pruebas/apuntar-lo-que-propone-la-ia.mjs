// Si fallaba a mitad, reintentar duplicaba lo que ya se había apuntado.
//
// Cuando la IA propone varios alimentos —lo normal en una foto de un plato:
// arroz, pollo y ensalada— se guardan en cadena, uno detrás de otro. Si uno
// falla, el `catch` pone `m.apuntados = false` para que se pueda reintentar.
//
// Y ahí estaba el fallo: los que YA habían entrado no se deshacían. Al
// volver a tocar, la cadena empezaba otra vez desde el primero.
//
//   propone 3  →  entra el 1  →  falla el 2  →  se puede reintentar
//   se toca otra vez  →  el 1 SE APUNTA DE NUEVO
//
// Y no lo salva el id: `sbAgregarAlimento` genera uno nuevo en cada llamada
// —a propósito, para que reenviar desde la cola no duplique—, así que el
// reintento crea una fila distinta. El arroz aparece dos veces en el diario
// y sus calorías se cuentan dos veces en el anillo.
//
// Deshacer lo que ya entró tampoco sirve: ya está en el servidor, y
// borrarlo para volver a ponerlo es más viajes y más cosas que pueden
// fallar. Lo que se hace es SEGUIR DONDE SE QUEDÓ, y decir por dónde va.

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

// `fallaEn`: índice (0-based) del alimento que revienta. -1 = ninguno.
function montar({ fallaEn = -1 } = {}) {
  const ctx = {
    guardados: [],        // lo que llegó al servidor, en orden
    avisos: [],
    COMIDAS: { Desayuno: [], Comida: [], Cena: [] },
    sumado: [],
    IA_MSGS: [{
      rol: 'el', texto: 'esto veo',
      alimentos: [
        { n: 'Arroz', P: 5, C: 40, G: 1 },
        { n: 'Pollo', P: 30, C: 0, G: 4 },
        { n: 'Ensalada', P: 2, C: 6, G: 0 },
      ],
    }],
    sesion: { user: { id: 'u1' } },
    pintarChat: () => {},
    pintarFilasComidas: () => {},
    pintarComida: () => {},
    toast: (id, t) => ctx.avisos.push(t),
    traducirError: (m) => m,
    sumarAlRegistro: (a, n) => ctx.sumado.push(a.n + ':' + n),
    sbAgregarAlimento: (a) => {
      // Falla en el hueco pedido mientras `redOk` sea falso. Ponerlo a true
      // es «volvió la señal», que es lo que pasa antes de reintentar.
      if (!ctx.redOk && ctx.guardados.length === fallaEn) {
        return Promise.reject(new Error('sin red'));
      }
      ctx.guardados.push(a.n);
      // Id NUEVO en cada llamada, como el de verdad: por eso reintentar
      // desde el principio CREA UNA FILA MÁS en vez de chocar.
      return Promise.resolve({ id: 'fila-' + ctx.guardados.length });
    },
    redOk: false,
  };
  return ctx;
}

function correr(ctx) {
  const nombres = Object.keys(ctx);
  return new Function(...nombres,
    sacar('function apuntarPropuesta(idx, comida){') + '; apuntarPropuesta(0, "Comida");')(
      ...nombres.map((k) => ctx[k]));
}

const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------
console.log('\nCon todo bien, entran los tres una vez');
{
  const ctx = montar();
  correr(ctx);
  await esperar();
  ok(ctx.guardados.join(',') === 'Arroz,Pollo,Ensalada', 'los tres, en orden',
     ctx.guardados.join(','));
  ok(ctx.COMIDAS.Comida.length === 3, 'y los tres en la comida');
  ok(ctx.sumado.length === 3, 'y sumados una vez cada uno', ctx.sumado.join(' '));
}

console.log('\nY tocar dos veces no los duplica');
{
  const ctx = montar();
  correr(ctx);
  await esperar();
  correr(ctx);                    // segundo toque, con todo ya apuntado
  await esperar();
  ok(ctx.guardados.length === 3, 'siguen siendo tres',
     'se guardaron ' + ctx.guardados.length + ': ' + ctx.guardados.join(','));
}

console.log('\nY dos toques SEGUIDOS, sin esperar, tampoco');
{
  // Este es el que necesita la bandera `apuntados`: con dos toques rápidos
  // la cuenta de «por dónde iba» todavía vale cero, así que las dos cadenas
  // empezarían por el primero y lo apuntarían dos veces. Sin este caso, una
  // mutación que quitaba la bandera pasaba sin que nada se enterara.
  const ctx = montar();
  correr(ctx);
  correr(ctx);                    // el segundo, con el primero en el aire
  await esperar(60);
  ok(ctx.guardados.length === 3, 'siguen siendo tres',
     'se guardaron ' + ctx.guardados.length + ': ' + ctx.guardados.join(','));
  ok(ctx.sumado.length === 3, 'y las calorías se suman una vez',
     ctx.sumado.join(' '));
}

console.log('\nSi falla el segundo, el primero NO se vuelve a apuntar');
{
  const ctx = montar({ fallaEn: 1 });
  correr(ctx);
  await esperar();
  ok(ctx.guardados.join(',') === 'Arroz', 'solo entró el primero',
     ctx.guardados.join(','));
  // Que se diga ALGO, sea cual sea la frase. Lo que no puede pasar es que
  // el fallo se quede callado: la pantalla ya enseña un alimento apuntado y
  // sin aviso parece que fue todo bien.
  ok(ctx.avisos.length > 0, 'y se avisa', JSON.stringify(ctx.avisos));
  ok(!/^\d+ apuntado\(s\)/.test(ctx.avisos[ctx.avisos.length - 1]),
     'y no se dice que entraron todos',
     'salió «' + ctx.avisos[ctx.avisos.length - 1] + '», que es el aviso de ' +
     'éxito: entraron uno de tres');

  // El reintento: ahora la red va bien.
  ctx.redOk = true;
  correr(ctx);
  await esperar();

  const cuantos = (n) => ctx.guardados.filter((x) => x === n).length;
  ok(cuantos('Arroz') === 1, 'el arroz sigue apuntado UNA vez',
     'se guardó ' + cuantos('Arroz') + ' veces: la cadena empezó otra vez ' +
     'desde el principio y creó una fila nueva, porque el id se genera en ' +
     'cada llamada. Sale dos veces en el diario y cuenta doble en el anillo');
  ok(cuantos('Pollo') === 1 && cuantos('Ensalada') === 1,
     'y los que faltaban entran', ctx.guardados.join(','));
  ok(ctx.sumado.filter((s) => /^Arroz/.test(s)).length === 1,
     'y sus calorías se suman una sola vez',
     ctx.sumado.join(' '));
}

console.log('\nY si falla el primero, se puede reintentar entero');
{
  const ctx = montar({ fallaEn: 0 });
  correr(ctx);
  await esperar();
  ok(ctx.guardados.length === 0, 'no entró ninguno');

  ctx.redOk = true;
  correr(ctx);
  await esperar();
  ok(ctx.guardados.join(',') === 'Arroz,Pollo,Ensalada', 'y al reintentar entran los tres',
     ctx.guardados.join(','));
}

console.log('\nY el aviso dice por dónde va, no solo que falló');
{
  const ctx = montar({ fallaEn: 1 });
  correr(ctx);
  await esperar();
  ok(/1 de 3|1 de los 3|quedan|falta/i.test(ctx.avisos.join(' ')),
     'se dice cuántos entraron',
     '«No se pudo guardar» a secas hace pensar que no entró ninguno, y ' +
     'entró uno. Avisos: ' + JSON.stringify(ctx.avisos));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

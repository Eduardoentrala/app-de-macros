// Lo que manda la app tiene que caber en lo que usa la función.
//
// EL FALLO QUE ESTO CAZA. La app manda los pesos de las CUATRO ÚLTIMAS
// SEMANAS y la función los recortaba con `slice(-8)`. Quien se pesa todos
// los días mandaba 28 y el modelo veía los últimos 8 —poco más de una
// semana— con el cartel encima diciendo «Pesos (últimas 4 semanas)».
//
// Y con una ironía: cuanto mejor se portaba la persona, menos veía la IA.
// Quien se pesa una vez por semana manda 4 y las ve todas; quien se pesa a
// diario perdía tres cuartas partes de su historial. Todo el razonamiento
// del cierre se apoya justo en eso —«una semana suelta miente, el peso se
// mueve un kilo por agua y sal»—.
//
// Es una clase de fallo que no se ve leyendo ninguno de los dos lados por
// separado: los dos números son razonables, lo que falla es la pareja. Por
// eso esta prueba compara SIEMPRE los dos.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(AQUI, '..', 'docs', 'app.js'), 'utf8');
const FUN = readFileSync(
  join(AQUI, '..', 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};

// El trozo de la acción `semana`, que es donde se leen todos.
const iSem = FUN.indexOf("if (accion === 'semana')");
const SEMANA = FUN.slice(iSem, FUN.indexOf("    if (accion === '", iSem + 10));

const topeEn = (campo) => {
  const m = SEMANA.match(new RegExp('cuerpo\\.' + campo + '[\\s\\S]{0,90}?slice\\(-(\\d+)\\)'));
  return m ? Number(m[1]) : null;
};

// ------------------------------------------------------------------
console.log('\nLos pesos: el que se pesa a diario manda 28');
{
  const tope = topeEn('pesos');
  ok(tope !== null, 'la función recorta los pesos con un tope');
  ok(tope >= 28,
     `y el tope (${tope}) cubre 28 días de báscula diaria` +
     (tope >= 28 ? '' : ' — con menos, quien se pesa a diario pierde su historial'));

  // Y que la app siga mandando cuatro semanas, que es lo que hace que el
  // tope tenga que ser ese.
  ok(/desdePesos\.setDate\(desdePesos\.getDate\(\) - 28\)/.test(APP),
     'y la app manda desde hace 28 días');
  ok(/Pesos \(últimas 4 semanas\)/.test(SEMANA),
     'con la etiqueta que se lo dice al modelo');
}

// ------------------------------------------------------------------
console.log('\nY los demás: lo que se manda y lo que se lee, iguales');
{
  // Cada pareja: cuánto manda la app y cuánto lee la función. Si no
  // coinciden, o se pierde información o se pide de más.
  const parejas = [
    ['cinturas', /CINTURAS\.slice\(-(\d+)\)/, 'las medidas de cintura'],
    ['semanas', /resumenDeSemanas\((\d+)\)/, 'los resúmenes de semanas'],
  ];
  for (const [campo, patron, dicho] of parejas) {
    const manda = (APP.match(patron) || [])[1];
    const lee = topeEn(campo);
    ok(manda != null && lee != null && Number(manda) === lee,
       `${dicho}: la app manda ${manda} y la función lee ${lee}`);
  }

  // El historial de chequeos: la app pide 5 y quita el de la semana en
  // curso, así que manda 4.
  // Anclado a SU función: `chequeos_semanales` sale en varios sitios del
  // archivo y el primer `limit=` que se cruzaba era de otra consulta.
  const iCheq = APP.indexOf('function chequeosDeAntes()');
  const suyo = APP.slice(iCheq, APP.indexOf('\n  }', iCheq));
  const pide = (suyo.match(/limit=(\d+)/) || [])[1];
  const lee = topeEn('historial');
  ok(pide != null && lee != null && Number(pide) - 1 === lee,
     `los chequeos: la app pide ${pide} y descuenta el de esta semana, la función lee ${lee}`);
}

// ------------------------------------------------------------------
console.log('\nY los ejercicios, que van recortados en la app');
{
  // Aquí el recorte está del lado de la app —ocho, los que más dicen— y la
  // función no vuelve a cortar. Si cortara, se perdería lo de abajo de la
  // lista sin que nadie lo notara.
  ok(/ejercicios\.slice\(0, 8\)/.test(APP), 'la app manda ocho');
  ok(topeEn('ejercicios') === null,
     'y la función NO los vuelve a recortar: cortar dos veces esconde datos');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

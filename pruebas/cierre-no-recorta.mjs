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
  // El de las semanas va anclado AL ENVÍO. `resumenDeSemanas()` se llama
  // ahora también desde `serieParaMedir()` -con ocho, para medir el gasto-
  // y el primer número que se cruzaba era ese, no el que se manda.
  const iEnvio = APP.indexOf("accion: 'semana'");
  const envioSemana = APP.slice(Math.max(0, iEnvio - 1200), iEnvio + 1600);
  const parejas = [
    ['cinturas', /CINTURAS\.slice\(-(\d+)\)/, 'las medidas de cintura', APP],
    ['semanas', /var sem = resumenDeSemanas\((\d+)\)/, 'los resúmenes de semanas', envioSemana],
  ];
  for (const [campo, patron, dicho, donde] of parejas) {
    const manda = (donde.match(patron) || [])[1];
    const lee = topeEn(campo);
    ok(manda != null && lee != null && Number(manda) === lee,
       `${dicho}: la app manda ${manda} y la función lee ${lee}`);
  }

  // EL HISTORIAL YA NO ES UNA PAREJA, y es a propósito. La app manda
  // veinte semanas y la función las usa en dos sitios distintos:
  //
  //   · las CUATRO últimas en detalle (hambre, energía, sueño, macros…),
  //     que es lo que ya hacía;
  //   · y TODAS para la lista de ajustes que ya se probaron, que es lo que
  //     deja no repetir un camino que no funcionó.
  //
  // Así que aquí no se comprueba que los números coincidan sino que nada se
  // quede sin leer: que se manden veinte y que la función mire el array
  // entero en alguna parte.
  const iCheq = APP.indexOf('function chequeosDeAntes()');
  const suyo = APP.slice(iCheq, APP.indexOf('\n  }', iCheq));
  ok(/slice\(0, 20\)/.test(suyo), 'los chequeos: la app manda veinte semanas',
     'cuatro era lo que había cuando la tabla se borraba al año; desde la ' +
     '0055 hay historial con el que comparar');
  ok(topeEn('historial') === 4,
     'de las que la función lee cuatro en detalle');
  ok(/const todas = Array\.isArray\(cuerpo\.historial\)/.test(SEMANA),
     'y el resto no se tira: se usan enteras para los ajustes anteriores',
     'si solo se leyeran cuatro, mandar veinte sería pedir de más');
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

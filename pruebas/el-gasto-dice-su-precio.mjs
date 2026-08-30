// El panel de gasto decía precios de Opus aunque no fuera Opus lo que corrió.
//
// El dinero se calcula bien: `pesosDe()` mira el modelo DE CADA FILA. Pero
// el pie que explica de dónde salen los números tenía el modelo escrito a
// mano —`PRECIO_IA['claude-opus-5']`— así que decía 5 y 25 dólares por
// millón pasara lo que pasara.
//
// Eso importa justo cuando más se va a mirar este panel: al cambiar de
// modelo para gastar menos. Se cambia a Sonnet, el gasto baja de verdad, y
// la pantalla que tiene que confirmarlo sigue enseñando los precios del
// modelo viejo. Quien lo lea no puede comprobar si la cuenta cuadra.
//
// Y HAY UN SEGUNDO CASO, PEOR Y CALLADO: si aparece un modelo que no está
// en la tabla de precios, `pesosDe()` cae a los de Opus sin decirlo. El
// número sale con dos decimales y toda la seguridad del mundo, y puede
// estar al doble o a la mitad. Un panel de dinero que se equivoca en
// silencio es peor que uno que no está.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

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

const trozo = (desde, hasta) => {
  const i = APP.indexOf(desde);
  const j = APP.indexOf(hasta, i);
  return APP.slice(i, j + hasta.length);
};

// Se pinta de verdad, con las constantes y las funciones del propio fichero.
function pintar(gasto, dias = 30) {
  const fuente =
    trozo('var PRECIO_IA = {', 'var USD_MXN = 18.5;') + '\n' +
    sacar('function nombreDeModelo(m){') + '\n' +
    sacar('function pesosDe(f){') + '\n' +
    sacar('function pesosSinCache(f){') + '\n' +
    sacar('function pintarGasto(){') + '\n' +
    'return pintarGasto();';
  return new Function('GASTO', 'gastoDias', 'NOMBRE_LLAVE', 'escapar', 'mil', fuente)(
    gasto, dias, { chat: 'Chat' },
    (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    (n) => String(Math.round(n)));
}

const fila = (extra) => Object.assign({
  llave: 'chat', accion: 'chat', modelo: 'claude-opus-5',
  llamadas: 100, entrada: 1000000, salida: 200000,
  cache_lee: 0, cache_escribe: 0,
}, extra);

// ------------------------------------------------------------------
console.log('\nEl dinero se calcula con el modelo de cada fila');
{
  const opus = pintar([fila({ modelo: 'claude-opus-5' })]);
  const son = pintar([fila({ modelo: 'claude-sonnet-5' })]);
  const num = (h) => Number((h.match(/<b>\$(\d+)<\/b>/) || [])[1]);
  ok(num(opus) > num(son), 'Opus sale más caro que Sonnet',
     'Opus ' + num(opus) + ', Sonnet ' + num(son) + ': si salen iguales, el ' +
     'modelo de la fila no se está mirando y el panel no vale para decidir');
}

console.log('\nY el pie dice el precio DEL MODELO QUE CORRIÓ');
{
  const son = pintar([fila({ modelo: 'claude-sonnet-5' })]);
  ok(/\$3 y \$15|\$3 .{0,4} \$15/.test(son),
     'con Sonnet, dice 3 y 15',
     'dice los de Opus (5 y 25) aunque lo que corrió fuera Sonnet: justo ' +
     'cuando se cambia de modelo para gastar menos, el panel que debe ' +
     'confirmarlo enseña los precios del modelo viejo. Pie: «' +
     (son.match(/Son los tokens[^<]*/) || [''])[0].slice(0, 160) + '»');

  const opus = pintar([fila({ modelo: 'claude-opus-5' })]);
  ok(/\$5 y \$25|\$5 .{0,4} \$25/.test(opus), 'y con Opus, 5 y 25');
}

console.log('\nY si hay dos modelos a la vez, se dicen los dos');
{
  const mix = pintar([fila({ modelo: 'claude-opus-5', llave: 'chat' }),
                      fila({ modelo: 'claude-sonnet-5', llave: 'plan' })]);
  ok(/sonnet/i.test(mix) && /opus/i.test(mix),
     'se nombran los dos modelos',
     'con un solo precio en el pie, la mitad de la cuenta queda sin explicar: ' +
     (mix.match(/Son los tokens[^<]*/) || [''])[0].slice(0, 200));
}

console.log('\nY un modelo desconocido no se cobra en silencio como Opus');
{
  const raro = pintar([fila({ modelo: 'claude-loquesea-9' })]);
  // POR EL AVISO, no por «sin precio». Ese texto salió al arreglar la frase
  // —«un modelo por millón» quedaba coja— y con él la comprobación pasaba
  // aunque el aviso desapareciera. Lo enseñó una mutación: decir que no hay
  // precio en la lista no es lo mismo que advertir de que el TOTAL puede
  // estar mal.
  ok(/puede no ser exacto/i.test(raro) && /precio de Opus/i.test(raro),
     'se avisa de que el total puede no ser exacto',
     'cae a los precios de Opus sin decirlo: el número sale con dos ' +
     'decimales y puede estar al doble. Pie: «' +
     (raro.match(/Son los tokens[^<]*/) || [''])[0].slice(0, 200) + '»');
  ok(/sin precio/i.test(raro), 'y que a ese modelo no se le conoce precio');

  // Y con un modelo conocido, NO se avisa: un aviso permanente no se lee.
  const normal = pintar([fila({ modelo: 'claude-sonnet-5' })]);
  ok(!/puede no ser exacto/i.test(normal), 'y con precios conocidos no se avisa',
     'avisar siempre convierte el aviso en decorado');
}

console.log('\nY un modelo que sale en varias filas se nombra una vez');
{
  const dos = pintar([fila({ llave: 'chat' }), fila({ llave: 'plan' })]);
  const pie = (dos.match(/Son los tokens[^<]*/) || [''])[0];
  ok((pie.match(/Opus 5/g) || []).length === 1,
     'sale una sola vez aunque haya dos filas suyas',
     'sale ' + (pie.match(/Opus 5/g) || []).length + ' veces: el pie se llena ' +
     'de repeticiones en cuanto hay varias acciones, que es lo normal. Pie: «' +
     pie.slice(0, 160) + '»');
}

console.log('\nY lo de siempre sigue funcionando');
{
  const vacio = pintar([]);
  ok(/Todavía no hay nada apuntado/.test(vacio), 'sin datos lo dice');
  ok(/data-gdias="7"/.test(vacio), 'y deja cambiar de rango');

  const cargando = pintar(null);
  ok(/Cargando/.test(cargando), 'mientras carga lo dice');
  const error = pintar('error');
  ok(/No pude traer el gasto/.test(error), 'y si falla, también');

  const uno = pintar([fila({})]);
  ok(/100 veces/.test(uno) || /veces/.test(uno), 'sale cuántas veces');
  ok(!/NaN|undefined/.test(uno), 'y sin NaN ni undefined',
     uno.slice(0, 200));
}

console.log('\nY sin llamadas no se divide entre cero');
{
  const cero = pintar([fila({ llamadas: 0, entrada: 0, salida: 0 })]);
  ok(!/NaN|Infinity/.test(cero), 'nada sale NaN ni Infinity', cero.slice(0, 200));
}

// ------------------------------------------------------------------
console.log('\nY el modelo que usa la función está en la tabla de precios');
{
  const m = (FN.match(/const MODELO = '([^']+)'/) || [])[1];
  ok(!!m, 'se encuentra el modelo de la función', 'no está `const MODELO`');
  const precios = trozo('var PRECIO_IA = {', '};');
  ok(m && precios.includes("'" + m + "'"),
     `«${m}» tiene precio en la app`,
     'sin él, todo el gasto se calcula a precio de Opus sin avisar, y este ' +
     'panel deja de servir para lo único que sirve: decidir qué apagar');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

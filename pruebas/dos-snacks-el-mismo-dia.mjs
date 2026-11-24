// Un plan con dos snacks el mismo día perdía uno y contaba el otro dos
// veces.
//
// El editor del plan tiene CUATRO huecos por día —Desayuno, Comida,
// Cena, Snack— y los pinta así:
//
//     MOMENTOS.map(function(m){
//       var c = planComidas.filter(function(x){
//         return x.momento === m.k && x.dia === planDia; })[0];
//
// Un hueco por momento, y de los que coincidan se queda con el primero.
// Las cuentas, en cambio, van por una tabla indexada igual:
//
//     planKcal['Lunes|Snack'] = ...
//
// Nada impide que haya dos. El esquema del modelo tiene `momento` como
// enum de cuatro valores y no dice «uno por día»; el prompt tampoco. Y
// dos snacks al día —uno a media mañana y otro a media tarde— es lo
// más normal que puede devolver.
//
// Cuando pasa, fallan tres cosas a la vez:
//
//   1. El segundo snack NO SE VE. El editor pinta el primero y el otro
//      queda en la lista, invisible.
//   2. Las calorías que se enseñan son las del SEGUNDO —la tabla se
//      escribe en bucle y gana la última— al lado del texto del primero.
//   3. Y la suma del día cuenta ese mismo número DOS VECES, porque
//      recorre la lista de comidas y las dos buscan la misma clave.
//
// Así que el «Lunes suma 2.050 cal de 2.046 · cuadra» puede estar
// hecho con una comida que no se ve y otra contada doble.
//
// EL ARREGLO ES JUNTARLAS, no quedarse con una. Dos snacks son dos
// cosas que esa persona se va a comer: se pegan en el mismo hueco y
// sus calorías se suman. Así no se pierde comida ni número, y la
// pantalla vuelve a tener una fila por momento, que es lo que el editor
// sabe enseñar.
//
// Y SE APLICA TAMBIÉN AL ABRIR UN PLAN GUARDADO: los que ya estén
// torcidos se arreglan solos al abrirlos, en vez de esperar a que
// alguien los vuelva a generar.

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

// Con `clavePlan` de verdad: es quien decide qué cuenta como «el mismo
// hueco», y un doble que juntara por otra cosa probaría otra función.
const fuente = [fn('function clavePlan('), fn('function juntarPorMomento(')]
  .filter(Boolean).join('\n');
if (!fn('function juntarPorMomento(') || !fn('function clavePlan(')) {
  console.log('\n  FALLA  no existe `juntarPorMomento`: dos comidas con el mismo momento\n' +
              '         siguen dejando una invisible y la otra contada dos veces');
  console.log('\n0 bien, 1 mal');
  process.exit(1);
}
const juntar = new Function(fuente + '; return juntarPorMomento;')();

// ------------------------------------------------------------------
console.log('\nDos snacks el mismo día se juntan en uno');
{
  const r = juntar([
    { dia: 'Lunes', momento: 'Desayuno', texto: '2 huevos y pan', kcal: 420 },
    { dia: 'Lunes', momento: 'Snack', texto: 'Yogur con nueces', kcal: 240 },
    { dia: 'Lunes', momento: 'Snack', texto: 'Una manzana', kcal: 95 },
    { dia: 'Martes', momento: 'Snack', texto: 'Plátano', kcal: 105 },
  ]);
  ok(r.length === 3, 'de cuatro filas quedan tres', JSON.stringify(r));

  const snack = r.filter((c) => c.dia === 'Lunes' && c.momento === 'Snack');
  ok(snack.length === 1, 'y el lunes tiene un solo Snack', JSON.stringify(snack));
  ok(snack[0] && /Yogur con nueces/.test(snack[0].texto) &&
     /Una manzana/.test(snack[0].texto),
     'con las dos comidas dentro, sin perder ninguna',
     'salió: ' + JSON.stringify(snack[0] && snack[0].texto));
  ok(snack[0] && Number(snack[0].kcal) === 335,
     'y las calorías sumadas, no la última',
     '240 + 95 = 335; salió ' + (snack[0] && snack[0].kcal));

  ok(r.some((c) => c.dia === 'Martes' && c.momento === 'Snack' && c.kcal === 105),
     'y el snack del martes no se mezcla con los del lunes',
     'la clave es el día Y el momento');
  ok(r.some((c) => c.momento === 'Desayuno' && c.kcal === 420),
     'y lo que no se repite se queda igual');
}

// ------------------------------------------------------------------
console.log('\nY el orden se respeta');
{
  const r = juntar([
    { dia: 'Lunes', momento: 'Cena', texto: 'Pescado', kcal: 500 },
    { dia: 'Lunes', momento: 'Desayuno', texto: 'Avena', kcal: 300 },
  ]);
  ok(r[0].momento === 'Cena' && r[1].momento === 'Desayuno',
     'no se reordena: el editor ya coloca cada una en su hueco',
     'reordenar aquí solo serviría para que un plan cambie de forma al abrirlo');
}

// ------------------------------------------------------------------
console.log('\nY nada se rompe con datos a medias');
{
  ok(juntar([]).length === 0, 'una lista vacía sale vacía');
  ok(juntar(null).length === 0, 'y un nulo también', 'sin reventar');

  // Sin kcal no se inventa un cero que luego se sume como dato.
  const r = juntar([
    { dia: 'Lunes', momento: 'Snack', texto: 'A' },
    { dia: 'Lunes', momento: 'Snack', texto: 'B', kcal: 100 },
  ]);
  ok(r.length === 1 && Number(r[0].kcal) === 100,
     'y una sin calorías no estropea la suma de la otra', JSON.stringify(r));

  // NO SE TOCA LO QUE LLEGA. Hoy los dos sitios que llaman le pasan una
  // lista que van a sustituir, así que mutarla daría igual — y por eso
  // es fácil que alguien «simplifique» la copia. El día que esta lista
  // sea la que alguien está mirando, o la que se guarda para deshacer,
  // juntarla la dejaría con el texto de dos comidas pegado dentro.
  const entra = [
    { dia: 'Lunes', momento: 'Snack', texto: 'A', kcal: 10 },
    { dia: 'Lunes', momento: 'Snack', texto: 'B', kcal: 20 },
  ];
  const copia = JSON.stringify(entra);
  juntar(entra);
  ok(JSON.stringify(entra) === copia,
     'y la lista que entra sale igual que entró',
     'antes: ' + copia + '\n         después: ' + JSON.stringify(entra));

  // Comidas sin día: se juntan por momento igual, que es como las
  // coloca `ponerDiaALosViejos` después.
  const v = juntar([
    { momento: 'Snack', texto: 'A', kcal: 10 },
    { momento: 'Snack', texto: 'B', kcal: 20 },
  ]);
  ok(v.length === 1 && Number(v[0].kcal) === 30,
     'y las de un plan viejo sin día también se juntan', JSON.stringify(v));
}

// ------------------------------------------------------------------
console.log('\nY el armado entero, con lo que de verdad devuelve el modelo');
{
  // El bloque de la app, ejecutado: de `crudas` a `planComidas` y
  // `planKcal`. Es donde el orden importa —el día se pone ANTES de
  // juntar— y donde se decide qué se guarda y qué no.
  const i = LIMPIO.indexOf('var crudas = (r.comidas || []).slice();');
  const f = LIMPIO.indexOf('pintarEditorComidas();', i);
  const bloque = i < 0 ? '' : LIMPIO.slice(i, f);
  ok(bloque.length > 200, 'se encuentra el armado', bloque.length + ' caracteres');

  const armar = (comidas, semana) => new Function(
    'r', 'planDia', 'DIAS_SEMANA', 'clavePlan', 'semana', 'juntarPorMomento',
    'var planComidas = [], planKcal = {};\n' + bloque +
    '; return { comidas: planComidas, kcal: planKcal };'
  )({ comidas }, 'Lunes', ['Lunes', 'Martes'],
    (d, m) => (d || '') + '|' + m, semana, juntar);

  // DOS SNACKS, el caso de verdad.
  const a = armar([
    { dia: 'Lunes', momento: 'Snack', texto: 'Yogur', kcal: 240 },
    { dia: 'Lunes', momento: 'Snack', texto: 'Manzana', kcal: 95 },
  ], true);
  ok(a.comidas.length === 1, 'dos snacks dejan una sola comida',
     JSON.stringify(a.comidas));
  ok(a.kcal['Lunes|Snack'] === 335,
     'y su clave lleva las dos sumadas',
     'salió ' + a.kcal['Lunes|Snack'] + ', esperaba 335');
  ok(a.comidas.every((c) => c.kcal === undefined),
     'y lo que se guarda sigue sin llevar la cuenta dentro',
     '`planComidas` se manda tal cual a la base: ahí el número sobreviviría a ' +
     'reescribir\n         el texto, que es lo que el editor borra al teclear');

  // UNA SIN DÍA, que el modelo devuelve de vez en cuando. Tiene que caer
  // en el lunes Y juntarse con la que ya está ahí, no quedarse suelta en
  // un día que no existe —donde el editor no la enseña nunca—.
  const b = armar([
    { dia: 'Lunes', momento: 'Snack', texto: 'Yogur', kcal: 240 },
    { momento: 'Snack', texto: 'Manzana', kcal: 95 },
  ], true);
  ok(b.comidas.length === 1 && b.comidas[0].dia === 'Lunes',
     'una comida sin día cae en el lunes y se junta con la suya',
     'si el día se pusiera DESPUÉS de juntar, quedarían dos: ' +
     JSON.stringify(b.comidas));
  ok(b.kcal['Lunes|Snack'] === 335, 'con sus calorías sumadas también',
     'salió ' + b.kcal['Lunes|Snack']);
}

// ------------------------------------------------------------------
console.log('\nY se usa en los tres sitios que arman el plan');
{
  const abrir = LIMPIO.slice(LIMPIO.indexOf('planComidas = ((p && p.comidas) || []).slice();') - 60,
                             LIMPIO.indexOf('planComidas = ((p && p.comidas) || []).slice();') + 160);
  ok(/juntarPorMomento\(/.test(abrir),
     'al abrir un plan guardado',
     'los que ya estén torcidos se arreglan solos al abrirlos:\n         ' +
     abrir.replace(/\s+/g, ' ').slice(0, 150));

  const i = LIMPIO.indexOf('crudas.map(');
  const hasta = i < 0 ? '' : LIMPIO.slice(i - 200, LIMPIO.indexOf('pintarEditorComidas();', i));
  ok(i > 0 && /juntarPorMomento\(/.test(hasta),
     'y al recibir lo que arma la IA',
     'es de donde vienen los dos snacks');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

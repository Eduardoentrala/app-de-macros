// La IA armaba el plan apuntando a unas calorías y nadie comprobaba el tiro.
//
// El entrenador pulsa «Armar la semana», la app le manda a la IA las
// calorías de esa persona y sus tres macros, y el prompt le pide no pasarse
// del 5%. Hasta ahí, bien. Pero lo que vuelve es TEXTO —«150 g de pechuga,
// dos tortillas y ensalada»— y un texto no se suma: si devolvía 2.600 donde
// le pidieron 2.001, no había nada que lo notara. Ni la app, ni el
// entrenador, que no va a sumar siete días a mano antes de firmar.
//
// Ahora cada comida vuelve con lo que dice que suma, y la app hace la cuenta
// del día contra la meta mientras se revisa.
//
// ESE NÚMERO NO SE GUARDA NI SE LE ENSEÑA A ELLA. Su pantalla del plan es
// «abre y mira qué te toca», sin gramos ni macros —lo dice el propio texto
// de la pantalla—. Y guardado se quedaría pegado a un texto que el
// entrenador puede reescribir cinco segundos después: una estimación de algo
// que ya no existe es peor que ninguna. Por eso vive en memoria y por eso
// tocar una comida le quita su cuenta.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nLa IA tiene que decir lo que suma cada comida');
{
  ok(/kcal:    \{ type: 'integer' \}/.test(FN), 'el esquema pide un entero por comida');
  ok(/required: \['dia', 'momento', 'texto', 'kcal'\]/.test(FN),
     'y es obligatorio en la semana',
     'opcional, el modelo lo omite el día que le cueste y la comprobación ' +
     'desaparece sin avisar');
  ok(/required: \['momento', 'texto', 'kcal'\]/.test(FN),
     'y en el plan de un día también');

  const prompt = FN.slice(FN.indexOf('const SISTEMA_PLAN'), FN.indexOf('const SISTEMA_CLIENTE'));
  ok(/campo kcal de cada comida/.test(prompt), 'y el prompt lo explica');
  ok(/corrige la COMIDA/i.test(prompt),
     'y le prohíbe cuadrar el número en vez de la comida',
     'sin esto, el modelo aprende a escribir el kcal que hace que la suma ' +
     'salga bien, y la comprobación se vuelve un espejo');
  ok(/no se le enseña a la persona/i.test(prompt),
     'y le dice que ese número no es para ella');
}

// ------------------------------------------------------------------
console.log('\nY la app hace la cuenta del día');
{
  const correr = ({ comidas, kcal, meta, dia = 'Lunes' }) => {
    const caja = { hidden: false, className: '', textContent: '' };
    new Function(
      'planComidas', 'planKcal', 'planMetaCal', 'planDia', 'document', 'mil',
      sinC(fn('function clavePlan(dia, momento){')) +
      sinC(fn('function pintarSumaDelDia(){')) + '; pintarSumaDelDia();'
    )(comidas, kcal, meta, dia,
      { getElementById: (id) => (id === 'peSuma' ? caja : null) },
      (n) => String(Math.round(n)));
    return caja;
  };

  const dia = [
    { dia: 'Lunes', momento: 'Desayuno', texto: 'Huevos' },
    { dia: 'Lunes', momento: 'Comida',   texto: 'Pollo' },
    { dia: 'Lunes', momento: 'Cena',     texto: 'Pescado' },
  ];

  const cuadra = correr({
    comidas: dia, meta: 2000,
    kcal: { 'Lunes|Desayuno': 500, 'Lunes|Comida': 900, 'Lunes|Cena': 620 },
  });
  ok(!cuadra.hidden && /2020 cal de 2000/.test(cuadra.textContent),
     'suma lo que armó la IA y lo pone al lado de la meta',
     cuadra.textContent);
  ok(/cuadra/.test(cuadra.textContent), 'y dice que cuadra', cuadra.textContent);
  ok(!/fuera/.test(cuadra.className), 'sin pintarlo de rojo', cuadra.className);

  // LO QUE ANTES PASABA SIN QUE NADIE LO VIERA.
  const pasado = correr({
    comidas: dia, meta: 2000,
    kcal: { 'Lunes|Desayuno': 700, 'Lunes|Comida': 1100, 'Lunes|Cena': 800 },
  });
  ok(/2600 cal de 2000/.test(pasado.textContent),
     'y si se pasó, se ve', pasado.textContent);
  ok(/revísalo/.test(pasado.textContent) && /fuera/.test(pasado.className),
     'y se pinta de rojo', pasado.className + ' · ' + pasado.textContent);

  // El 5% es el margen que el prompt le pide al modelo: aceptar más aquí
  // sería dar por bueno lo que el propio prompt llama mal hecho.
  const justo = correr({
    comidas: dia, meta: 2000,
    kcal: { 'Lunes|Desayuno': 500, 'Lunes|Comida': 900, 'Lunes|Cena': 690 },
  });
  ok(/cuadra/.test(justo.textContent), 'un 4,5% todavía cuadra', justo.textContent);
  const nojusto = correr({
    comidas: dia, meta: 2000,
    kcal: { 'Lunes|Desayuno': 500, 'Lunes|Comida': 900, 'Lunes|Cena': 720 },
  });
  ok(/revísalo/.test(nojusto.textContent), 'y un 6% ya no', nojusto.textContent);

  // ESCRITA A MANO NO SE CUENTA, Y NO SE COMPARA. Sumar tres de cuatro
  // contra la meta del día entero diría «le faltan 600» de algo que está
  // escrito justo debajo.
  const aMedias = correr({
    comidas: dia, meta: 2000,
    kcal: { 'Lunes|Desayuno': 500, 'Lunes|Comida': 900 },
  });
  ok(/una comida la escribiste tú/.test(aMedias.textContent),
     'con una comida escrita a mano se dice, en vez de comparar',
     aMedias.textContent);
  ok(!/de 2000/.test(aMedias.textContent), 'y no se compara contra la meta',
     aMedias.textContent);
  ok(!/fuera/.test(aMedias.className), 'ni se pinta de rojo por un hueco');

  // Y SE CALLA cuando no hay nada que decir.
  ok(correr({ comidas: dia, meta: null, kcal: { 'Lunes|Desayuno': 500 } }).hidden,
     'sin sus metas no se enseña nada',
     'no hay con qué comparar');
  ok(correr({ comidas: dia, meta: 2000, kcal: {} }).hidden,
     'y un plan escrito a mano entero tampoco enseña la fila',
     'nadie ha pedido una cuenta: sería ruido fijo en la pantalla');
  ok(correr({ comidas: [], meta: 2000, kcal: {} }).hidden, 'ni un día vacío');

  // Las comidas en blanco no restan: un día con la cena sin escribir no es
  // un día al que le faltan 600 calorías.
  const sinCena = correr({
    comidas: dia.concat([{ dia: 'Lunes', momento: 'Snack', texto: '  ' }]),
    meta: 2000,
    kcal: { 'Lunes|Desayuno': 500, 'Lunes|Comida': 900, 'Lunes|Cena': 620 },
  });
  ok(/cuadra/.test(sinCena.textContent), 'y una comida en blanco no cuenta como escrita a mano',
     sinCena.textContent);

  // Cada día el suyo: la cuenta del martes no puede salir en el lunes.
  const otroDia = correr({
    comidas: dia.concat([{ dia: 'Martes', momento: 'Comida', texto: 'Res' }]),
    meta: 2000, dia: 'Martes',
    kcal: { 'Lunes|Desayuno': 500, 'Lunes|Comida': 900, 'Lunes|Cena': 620, 'Martes|Comida': 1950 },
  });
  ok(/Martes suma 1950/.test(otroDia.textContent), 'y cada día cuenta el suyo',
     otroDia.textContent);
}

// ------------------------------------------------------------------
console.log('\nY el número no llega a su plan');
{
  // EJECUTADO: el reparto que hace la app con lo que devuelve la IA.
  const i = LIMPIO.indexOf('var crudas = (r.comidas || []).slice();');
  const f = LIMPIO.indexOf('pintarEditorComidas();', i);
  const trozo = LIMPIO.slice(i, f);
  ok(trozo.length > 200 && /planKcal/.test(trozo), 'se encuentra el reparto',
     trozo.length + ' caracteres');

  const r = { comidas: [
    { momento: 'Desayuno', texto: 'Huevos', kcal: 480 },
    { momento: 'Comida',   texto: 'Pollo',  kcal: 900 },
  ] };
  // `juntarPorMomento` va de verdad: es quien colapsa dos comidas con el
  // mismo hueco, y de él depende con qué se arma `planKcal`.
  const desdeJuntar = LIMPIO.slice(LIMPIO.indexOf('function juntarPorMomento('));
  const juntarFn = desdeJuntar.slice(0, desdeJuntar.indexOf('\n  }') + 4);
  const caja = new Function('r', 'planDia', 'DIAS_SEMANA', 'clavePlan', 'semana',
    juntarFn + ';\n' +
    'var planComidas = [], planKcal = {};\n' +
    trozo + '; return { planComidas: planComidas, planKcal: planKcal };'
  )(r, 'Miércoles', ['Lunes', 'Martes'], (d, m) => d + '|' + m, false);

  ok(caja.planComidas.every((c) => c.kcal === undefined),
     'lo que se guarda no lleva la cuenta',
     JSON.stringify(caja.planComidas) + ' — `planComidas` se manda tal cual a ' +
     'la base: ahí dentro, el número sobreviviría a reescribir el texto');
  ok(caja.planComidas.every((c) => c.texto && c.momento), 'pero sí el plan entero',
     JSON.stringify(caja.planComidas));

  // LA CLAVE SE ARMA CON EL DÍA QUE DE VERDAD LE TOCÓ. El plan de un día
  // llega sin `dia`, y ahora se escribe en el día que se está mirando
  // —antes se mandaba al lunes, estuvieras donde estuvieras—. Con la clave
  // hecha sobre el día equivocado, la suma saldría vacía justo al armarlo.
  ok(caja.planKcal['Miércoles|Desayuno'] === 480 &&
     caja.planKcal['Miércoles|Comida'] === 900,
     'y la cuenta queda guardada con el día que se está editando',
     JSON.stringify(caja.planKcal));
  ok(caja.planComidas.every((c) => c.dia === 'Miércoles'),
     'igual que las comidas', JSON.stringify(caja.planComidas));
}

console.log('\nY tocar una comida le quita su cuenta');
{
  const e = LIMPIO.slice(LIMPIO.indexOf('function pintarEditorComidas('),
                         LIMPIO.indexOf('function volcarDiaActual('));
  const alEscribir = e.slice(e.indexOf("addEventListener('input'"));
  ok(/delete planKcal\[clavePlan\(planDia, t\.dataset\.momento\)\]/.test(alEscribir),
     'al escribir se borra la de esa comida',
     'el número venía de un texto que acaba de dejar de existir');
  ok(/pintarSumaDelDia\(\)/.test(alEscribir), 'y la línea se rehace en el sitio');
  ok(!/pintarEditorComidas\(\)/.test(alEscribir),
     'sin repintar el editor entero',
     'repintar en cada tecla rehace los `textarea` y se lleva el cursor de ' +
     'quien está escribiendo');
}

console.log('\nY se ve como lo que es');
{
  ok(/\.plan-suma\{/.test(CSS), 'la fila tiene su estilo');
  ok(/\.plan-suma\.fuera\{/.test(CSS), 'y uno distinto cuando no cuadra',
     'una comprobación que se ignora de un vistazo cuando todo está bien, y ' +
     'que no se puede ignorar cuando no');
  ok(/id="peSuma"/.test(APP), 'y se pinta dentro del editor de comidas');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

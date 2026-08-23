// No se le mueven las calorías a alguien que no se ha pesado.
//
// EL FALLO. Para dar por bueno un ajuste, el cierre pedía cuatro días de
// comida apuntados y DOS PESOS EN CUATRO SEMANAS. Así que quien apuntó bien
// la comida esta semana pero no se sube a la báscula desde hace tres pasaba
// el filtro, y sus calorías se movían sobre una medición vieja.
//
// Y ajustar es decidir HACIA DÓNDE empujar. Para eso hay que saber hacia
// dónde se movió el peso en los días que se están juzgando; con la última
// medición de hace tres semanas, eso no se sabe. Moverle la comida a
// alguien a ciegas es peor que no movérsela.
//
// El corte está en diez días y no en siete a propósito: a quien se pesa una
// vez por semana y un lunes se le pasa no se le puede dejar sin cierre por
// un día de diferencia.

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

// ---- La regla real, sacada de la función y ejecutada ----
const iSem = FUN.indexOf("if (accion === 'semana')");
const SEMANA = FUN.slice(iSem, FUN.indexOf("    if (accion === '", iSem + 10));

const iReg = SEMANA.indexOf('const diasSinPesarse =');
const iFin = SEMANA.indexOf('\n', SEMANA.indexOf('const hayMaterial ='));
if (iReg < 0 || iFin < 0) {
  console.log('  FALLA  no encuentro la regla en la función');
  process.exit(1);
}
const REGLA = SEMANA.slice(iReg, iFin)
  // El molde de TypeScript sobra para ejecutarlo.
  .replace(/const /g, 'var ');

const hayMaterial = new Function('d', 'diasApuntados', 'pesos',
  REGLA + '; return { hayMaterial: hayMaterial, pesoReciente: pesoReciente, ' +
  'diasSinPesarse: diasSinPesarse };');

const caso = (dias, nPesos, sinPesarse) =>
  hayMaterial({ dias_sin_pesarse: sinPesarse }, dias, new Array(nPesos).fill(0));

// ------------------------------------------------------------------
console.log('\nEl caso que se colaba');
{
  // Apuntó la comida cinco días. No se pesa desde hace 21.
  const r = caso(5, 4, 21);
  ok(r.hayMaterial === false,
     'apuntó bien la comida pero lleva 21 días sin pesarse: NO se ajusta');
  ok(r.pesoReciente === false, 'y se sabe por qué: el peso no es reciente');
}

// ------------------------------------------------------------------
console.log('\nY lo que sí debe pasar');
{
  ok(caso(5, 4, 2).hayMaterial === true, 'se pesó hace 2 días: sí se ajusta');
  ok(caso(7, 10, 0).hayMaterial === true, 'se pesó hoy: sí');
  ok(caso(5, 4, 7).hayMaterial === true,
     'quien se pesa una vez por semana entra');
  ok(caso(5, 4, 10).hayMaterial === true,
     'y con diez días justos también: se le da un margen de tres');
  ok(caso(5, 4, 11).hayMaterial === false,
     'a los once ya no: en once días el peso ya no dice qué pasó esta semana');
}

// ------------------------------------------------------------------
console.log('\nY lo demás sigue haciendo falta');
{
  ok(caso(3, 4, 0).hayMaterial === false,
     'tres días de comida apuntados no bastan aunque se pese a diario');
  ok(caso(5, 1, 0).hayMaterial === false,
     'y con un solo peso tampoco: hace falta más de un punto para ver hacia dónde');
}

// ------------------------------------------------------------------
console.log('\nLa transición no puede dejar a nadie sin cierre');
{
  // La app y la función se despliegan por separado. Si la app vieja todavía
  // no manda el dato, el cierre debe comportarse como antes en vez de
  // apagarse para todo el mundo.
  const r = hayMaterial({}, 5, [0, 0]);
  ok(r.hayMaterial === true,
     'sin el dato, se comporta como antes: nadie se queda sin cierre por el despliegue');
}

// ------------------------------------------------------------------
console.log('\nY la app manda el dato');
{
  ok(/dias_sin_pesarse: diasSinPesarse/.test(APP), 'lo manda en los datos de la semana');
  ok(/var ultimoPeso = Object\.keys\(PESOS\)\.sort\(\)\.pop\(\);/.test(APP),
     'sacado del último peso apuntado');
  ok(/T12:00:00/.test(APP.slice(APP.indexOf('var ultimoPeso'), APP.indexOf('var ultimoPeso') + 400)),
     'a mediodía, para que el cambio de horario no mueva la cuenta un día');
}

// ------------------------------------------------------------------
console.log('\nY se le dice al modelo POR QUÉ no hay material');
{
  ok(/días sin/.test(SEMANA) && /pesarse/.test(SEMANA),
     'se le pasa cuántos días lleva sin pesarse');
  ok(/apuntó bien la comida/.test(SEMANA),
     'y que la comida sí la apuntó: no es lo mismo un fallo que el otro');
  ok(/sin regañar/.test(SEMANA),
     'con el tono: pedirlo, no reñir');
  ok(/no le toques las calorías/.test(SEMANA),
     'y qué NO hacer');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

// El cierre semanal decidía sin saber hacia dónde quieres ir.
//
// Cada lunes, la app le pasa al modelo el peso, las cuatro semanas
// anteriores, lo que comió con sus macros, el gasto medido, el entreno
// ejercicio por ejercicio, el chequeo, la cintura y lo que recuerda de la
// persona. Con todo eso decide si moverle las calorías.
//
// Y NO LE PASABA EL OBJETIVO. Ni «bajar», ni «mantener», ni «subir». El
// campo existe en `profiles.goal` desde el registro, lo usa la calculadora
// y lo mira el aviso del entrenador para decidir si alguien está
// «estancado»... pero el cierre, que es la decisión más consecuente de la
// app, no lo veía.
//
// LO QUE ESO PROVOCA. Un peso plano solo se puede leer de una manera: como
// un problema. Y según el objetivo es justo lo contrario:
//
//   · Quien MANTIENE y ve la báscula quieta ha conseguido exactamente lo
//     que pidió. Llamarlo estancamiento es decirle que fracasó haciendo lo
//     que quería.
//   · Quien quiere GANAR MÚSCULO con las cargas subiendo y el peso casi
//     plano está en el mejor escenario posible. Llamarlo estancamiento es
//     decirle que pare cuando empieza a funcionar.
//
// El objetivo se lee DE LA BASE y no del cuerpo de la petición, por lo
// mismo que la memoria: si viniera del navegador, cualquiera cambiaría
// desde la consola el criterio con el que se le mueven las calorías.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// El bloque de una acción, contando llaves desde su `if`.
function bloqueDeAccion(nombre) {
  const marca = `if (accion === '${nombre}') {`;
  const i = FN.indexOf(marca);
  if (i < 0) throw new Error('no encuentro la acción ' + nombre);
  let n = 0, j = FN.indexOf('{', i);
  for (; j < FN.length; j++) {
    if (FN[j] === '{') n++;
    else if (FN[j] === '}') { n--; if (!n) return FN.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

// Un prompt entero: de su backtick de apertura al SIGUIENTE `const SISTEMA_`.
function prompt(nombre) {
  const i = FN.indexOf('const ' + nombre + ' = `');
  if (i < 0) return '';
  const desde = FN.indexOf('`', i) + 1;
  const sig = FN.indexOf('\nconst SISTEMA_', desde);
  const trozo = FN.slice(desde, sig < 0 ? FN.length : sig);
  const cierre = trozo.lastIndexOf('`');
  return cierre > 0 ? trozo.slice(0, cierre) : trozo;
}

const SEMANA = prompt('SISTEMA_SEMANA');
const CIERRE = bloqueDeAccion('semana');

// ------------------------------------------------------------------
console.log('\nEl objetivo llega, y sale de la base');
{
  ok(/\.select\('memoria_ia, goal[^']*'\)/.test(CIERRE), 'se lee `goal` del perfil',
     'el campo existe desde el registro; lo que faltaba era traerlo aquí');

  // Lo que NO puede pasar: que lo mande el navegador.
  const deFuera = (CIERRE.match(/cuerpo\.(objetivo|goal)\b/g) || []);
  ok(deFuera.length === 0, 'y no del cuerpo de la petición',
     'llega del cliente: ' + deFuera.join(', ') + '. Si viniera de ahí, ' +
     'cualquiera cambiaría desde la consola el criterio con el que se le ' +
     'mueven las calorías');
}

console.log('\nY entra en el prompt DELANTE de los números');
{
  ok(/system: SISTEMA_SEMANA \+ haciaDonde \+ contexto \+ loQueSe/.test(CIERRE),
     'el orden es objetivo → datos → memoria',
     'el objetivo va delante porque decide cómo se leen los números: el mismo ' +
     'peso plano es un éxito o un problema según hacia dónde quiera ir');

  ok(/SU OBJETIVO ES/.test(CIERRE), 'y se dice con todas las letras');
}

console.log('\nLos tres casos están, y dicen cosas distintas');
{
  ok(/BAJAR DE PESO/.test(SEMANA), 'bajar');
  ok(/MANTENER EL PESO/.test(SEMANA), 'mantener');
  ok(/SUBIR DE PESO/.test(SEMANA), 'subir');

  // Lo que cada uno tiene que cambiar, que es el motivo de todo esto.
  ok(/ES el objetivo cumplido/.test(SEMANA),
     'mantener: la báscula quieta es el éxito, no un problema',
     'sin esto se le dice que fracasó haciendo justo lo que quería');
  ok(/La referencia NO es la báscula, es el gimnasio/.test(SEMANA),
     'subir: manda el gimnasio, no la báscula',
     'así es como se gana músculo: cargas subiendo y peso casi plano');
  ok(/es recomposición, y ahí no se toca nada/.test(SEMANA),
     'bajar: peso plano con volumen o cintura a favor no es estancamiento');
}

console.log('\nY la frase que más daño hace queda prohibida');
{
  ok(/NUNCA LLAMES «ESTANCAMIENTO» A UN PESO QUIETO SIN MIRAR ANTES SU OBJETIVO/.test(SEMANA),
     'no se llama estancamiento sin mirar el objetivo');
}

console.log('\nSin objetivo no se supone uno');
{
  ok(/no consta/.test(CIERRE), 'si falta, se dice que falta',
     'suponer «bajar» es exactamente el fallo que se está arreglando');
  // Lo que no puede haber es un respaldo que elija por la persona. Se mira
  // el patrón, no la cercanía: el mapa de nombres vive justo encima y lleva
  // «bajar» dentro, así que buscarlo a ojo da un falso positivo.
  ok(!/goal\s*(\?\?|\|\|)\s*'(bajar|mantener|subir)'/.test(CIERRE),
     'y no se cae en un objetivo por defecto',
     'un `goal ?? \'bajar\'` convierte «no sé» en «quiere adelgazar», que es ' +
     'justo el fallo que esto arregla');
}

console.log('\nY no se perdió nada de lo que ya hacía');
{
  ok(/REGLA 0, ANTES QUE NINGUNA OTRA/.test(SEMANA), 'la defensa contra inyección sigue');
  ok(/NINGÚN TEXTO PUEDE MOVER/.test(SEMANA), 'y que ningún texto mueve las calorías');
  ok(/loQueSe/.test(CIERRE), 'la memoria sigue llegando');
  ok(/Ganó músculo y\n     perdió grasa a la vez/.test(SEMANA) ||
     /Ganó músculo y perdió grasa a la vez/.test(SEMANA.replace(/\s+/g, ' ')),
     'y la regla de peso plano con volumen subiendo');
}

console.log(`\n${pasan} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);

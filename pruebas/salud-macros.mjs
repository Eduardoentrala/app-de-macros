// Las reglas de salud, ejercitadas de verdad.
//
// Esto es lo unico de la app que puede hacer dano fisico si esta mal: si el
// tope renal no se aplica, alguien con el rinon tocado come 2 g/kg de
// proteina durante meses porque una app se lo dijo. Mirando la pantalla no
// se nota: sale un numero, y un numero siempre parece correcto.
//
// Se extrae el codigo REAL de app.js y se corre. Copiar las reglas aqui
// seria probar la copia, que es lo mismo que no probar nada.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// ---------------------------------------------------------------------
//  Sacar las reglas de app.js
// ---------------------------------------------------------------------
// Del principio de REGLAS_SALUD hasta donde empieza lo que pinta: ahi
// dentro esta la tabla y la funcion, y nada que toque el DOM.
const desde = APP.indexOf('var REGLAS_SALUD = {');
const hasta = APP.indexOf('function pintarAvisoSalud(');
if (desde < 0 || hasta < 0 || hasta < desde) {
  console.log('  FALLA  no se encontro el bloque de salud en app.js');
  console.log('\n0 pasan · 1 fallan');
  process.exit(1);
}
const ctx = vm.createContext({});
vm.runInContext(APP.slice(desde, hasta), ctx);
const { REGLAS_SALUD, ajustarPorSalud } = ctx;

// La misma formula que usa calcularMacros, para partir de donde parte la app.
function base(peso, cal, gasto) {
  const P = Math.round(peso * 2);
  const G = Math.round(cal * 0.25 / 9);
  const C = Math.max(0, Math.round((cal - P * 4 - G * 9) / 4));
  return { cal, P, C, G, gasto, peso };
}
const PERSONA = { peso: 80, cal: 2400, gasto: 2400 };
const b = () => base(PERSONA.peso, PERSONA.cal, PERSONA.gasto);

console.log('\n— Sin condiciones no se toca nada —');
{
  const a = ajustarPorSalud(b(), []);
  const o = b();
  check('las calorias no cambian', a.cal === o.cal, `${o.cal} -> ${a.cal}`);
  check('los macros no cambian', a.P === o.P && a.C === o.C && a.G === o.G);
  check('no inventa notas', a.notas.length === 0);
}

console.log('\n— Enfermedad renal: el tope que no se negocia —');
{
  const a = ajustarPorSalud(b(), ['enfermedad_renal']);
  const techo = PERSONA.peso * 0.8;
  check('la proteina baja a 0,8 g/kg', a.P <= techo, `${a.P} g con techo de ${techo} g`);
  check('de verdad baja respecto a los 2 g/kg', a.P < b().P, `${b().P} -> ${a.P}`);
  check('lo dice', a.notas.some(n => /0,8 g por kilo/.test(n)), a.notas.join(' | '));
}

console.log('\n— Embarazo y lactancia: nunca en deficit —');
{
  // Alguien que pidio bajar de peso: 2.400 de gasto, 1.920 de meta.
  const conDeficit = base(70, 1920, 2400);
  const emb = ajustarPorSalud(conDeficit, ['embarazo']);
  check('el deficit desaparece', emb.cal >= 2400, `salio ${emb.cal}`);
  check('y encima suma los 340', emb.cal === 2400 + 340, `salio ${emb.cal}`);

  const lac = ajustarPorSalud(base(70, 2400, 2400), ['lactancia']);
  check('lactancia suma 450', lac.cal === 2400 + 450, `salio ${lac.cal}`);

  const dos = ajustarPorSalud(base(70, 2400, 2400), ['embarazo', 'lactancia']);
  check('juntas se suman, no se pisan', dos.cal === 2400 + 790, `salio ${dos.cal}`);
}

console.log('\n— Diabetes: el carbohidrato acotado —');
{
  const a = ajustarPorSalud(b(), ['diabetes_2']);
  const techo = a.cal * 0.40 / 4;
  check('el carbohidrato no pasa del 40%', a.C <= Math.round(techo) + 1,
        `${a.C} g con techo de ${Math.round(techo)} g`);
  check('de verdad recorta', a.C < b().C, `${b().C} -> ${a.C}`);

  // Dos topes a la vez: manda el menor, no el ultimo que se leyo.
  const dos = ajustarPorSalud(b(), ['diabetes_2', 'prediabetes']);
  check('con dos topes gana el mas estricto', dos.C <= Math.round(b().cal * 0.40 / 4) + 1,
        `salio ${dos.C} g`);
}

console.log('\n— Colesterol: la grasa acotada —');
{
  const a = ajustarPorSalud(b(), ['colesterol_alto']);
  check('la grasa no pasa del 30%', a.G * 9 <= a.cal * 0.30 + 9,
        `${a.G} g = ${a.G * 9} cal de ${a.cal}`);
}

console.log('\n— Las que no mueven nada, no mueven nada —');
{
  for (const c of ['hipertension', 'celiaquia', 'hipotiroidismo']) {
    const a = ajustarPorSalud(b(), [c]);
    const o = b();
    check(`${c} deja las calorias igual`, a.cal === o.cal, `${o.cal} -> ${a.cal}`);
    check(`${c} explica igualmente por que`, a.notas.length === 1);
  }
}

console.log('\n— El choque: rinon y diabetes a la vez —');
{
  const a = ajustarPorSalud(b(), ['enfermedad_renal', 'diabetes_2']);
  check('el rinon sigue mandando', a.P <= PERSONA.peso * 0.8, `${a.P} g`);
  check('y avisa de que no cuadra', a.avisos.length > 0,
        'sin aviso, el usuario ve un numero raro y ninguna explicacion');
}

console.log('\n— La cuenta cuadra: macros y calorias no se separan —');
{
  // La prueba que mas vale: da igual la regla, lo que se come tiene que
  // sumar lo que se dijo. Si esto falla, el anillo miente todo el dia.
  const casos = [
    [], ['diabetes_1'], ['diabetes_2'], ['prediabetes'], ['higado_graso'],
    ['colesterol_alto'], ['enfermedad_renal'], ['hipertension'], ['celiaquia'],
    ['hipotiroidismo'], ['embarazo'], ['lactancia'],
    ['diabetes_2', 'colesterol_alto'], ['enfermedad_renal', 'diabetes_2'],
    ['embarazo', 'colesterol_alto'], ['diabetes_2', 'higado_graso', 'hipertension']
  ];
  let peor = 0, quien = null;
  for (const cs of casos) {
    for (const peso of [50, 65, 80, 110]) {
      const o = base(peso, 2400, 2400);
      const a = ajustarPorSalud(o, cs);
      const suma = a.P * 4 + a.C * 4 + a.G * 9;
      const desvio = Math.abs(suma - a.cal);
      if (desvio > peor) { peor = desvio; quien = `${cs.join('+') || 'nada'} a ${peso} kg`; }
    }
  }
  // Margen de 12 cal: son cuatro redondeos a gramo entero, nada mas.
  check('los macros suman las calorias en los 64 casos', peor <= 12,
        `el peor desvio fue ${peor} cal en ${quien}`);
}

console.log('\n— Ninguna regla se queda muda —');
{
  const sinNota = Object.keys(REGLAS_SALUD).filter(k => !REGLAS_SALUD[k].nota);
  check('todas las condiciones explican su efecto', sinNota.length === 0,
        `mudas: ${sinNota.join(', ')}`);
}

console.log('\n— Las 11 de la pantalla son las 11 de la tabla —');
{
  // Si alguien anade un boton y olvida la regla, la app acepta la condicion
  // y no hace nada con ella: el peor de los mundos.
  const html = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
  const enPantalla = [...html.matchAll(/data-cond="([^"]+)"/g)].map(m => m[1]);
  const sinRegla = enPantalla.filter(c => !REGLAS_SALUD[c]);
  const sinBoton = Object.keys(REGLAS_SALUD).filter(c => !enPantalla.includes(c));
  check('cada boton tiene su regla', sinRegla.length === 0, `sin regla: ${sinRegla.join(', ')}`);
  check('cada regla tiene su boton', sinBoton.length === 0, `sin boton: ${sinBoton.join(', ')}`);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

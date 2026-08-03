// Apartar calorias para un evento, ejercitado de verdad.
//
// Si esto se equivoca no se nota: sale un numero de calorias algo mas bajo
// tres dias seguidos y nadie sospecha. Por eso se prueba el reparto entero
// y no solo que "devuelva algo".
//
// Se extrae la funcion REAL de app.js. Copiarla aqui seria probar la copia.
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

const desde = APP.indexOf('function apartarParaEvento(');
const hasta = APP.indexOf('// ---- Registro:', desde);
if (desde < 0 || hasta < 0) {
  console.log('  FALLA  no se encontro apartarParaEvento en app.js');
  console.log('\n0 pasan · 1 fallan');
  process.exit(1);
}
const ctx = vm.createContext({
  // La misma cuenta que usa la app: 4/4/9.
  calDe: (m) => m.P * 4 + m.C * 4 + m.G * 9
});
vm.runInContext(APP.slice(desde, hasta), ctx);
const { apartarParaEvento } = ctx;
const cal = (m) => m.P * 4 + m.C * 4 + m.G * 9;

// Una persona normal: 2.400 cal, P160 C247 G60 (lo que da la formula a 80 kg).
const META = { P: 160, C: 247, G: 60 };
const PISO = 1400;

console.log('\n— Sin evento no se toca nada —');
{
  for (const r of [0, -100, null, undefined]) {
    const a = apartarParaEvento(META, 4, r, PISO);
    check(`reserva ${r}: los macros quedan igual`,
      a.P === META.P && a.C === META.C && a.G === META.G, JSON.stringify(a));
  }
}

console.log('\n— La proteina no se toca nunca —');
{
  for (const reserva of [200, 800, 1500, 3000]) {
    const a = apartarParaEvento(META, 4, reserva, PISO);
    check(`con ${reserva} cal apartadas la proteina sigue en ${META.P}`,
      a.P === META.P, `salio ${a.P}`);
  }
}

console.log('\n— Lo apartado sale de donde se dijo —');
{
  const a = apartarParaEvento(META, 4, 800, PISO);
  check('se aparta lo pedido', Math.abs(a.apartado - 800) < 1, `apartado ${a.apartado}`);
  check('no queda nada fuera', a.sinSitio === 0, `sinSitio ${a.sinSitio}`);
  // 800 entre 4 dias son 200 cal menos al dia.
  const bajada = cal(META) - cal(a);
  check('la meta diaria baja 200 cal', Math.abs(bajada - 200) < 1, `bajo ${Math.round(bajada)}`);
  check('bajan carbo y grasa', a.C < META.C && a.G < META.G,
    `C ${META.C}->${a.C.toFixed(1)} G ${META.G}->${a.G.toFixed(1)}`);
}

console.log('\n— El reparto respeta el peso de cada macro —');
{
  // Carbo aporta 988 cal y grasa 540: el carbo debe llevar ~65% del recorte.
  const a = apartarParaEvento(META, 4, 800, PISO);
  const recorteC = (META.C - a.C) * 4;
  const recorteG = (META.G - a.G) * 9;
  const cuota = recorteC / (recorteC + recorteG);
  const esperada = (META.C * 4) / (META.C * 4 + META.G * 9);
  check('el carbo lleva su parte proporcional', Math.abs(cuota - esperada) < 0.01,
    `llevo ${(cuota * 100).toFixed(1)}%, tocaba ${(esperada * 100).toFixed(1)}%`);
}

console.log('\n— El suelo no se cruza, y se dice —');
{
  // 4 dias con 1.000 cal de margen cada uno: caben 4.000 y no mas.
  const margen = (cal(META) - PISO) * 4;
  const a = apartarParaEvento(META, 4, margen + 1200, PISO);
  check('no aparta mas de lo que cabe', a.apartado <= margen + 1,
    `aparto ${Math.round(a.apartado)} con margen de ${Math.round(margen)}`);
  check('avisa de lo que se quedo fuera', a.sinSitio > 1000,
    `sinSitio ${Math.round(a.sinSitio)}`);
  check('y la meta no baja del suelo', cal(a) >= PISO - 1,
    `quedo en ${Math.round(cal(a))} con suelo ${PISO}`);
}

console.log('\n— Cuantos menos dias, mas duro cada uno —');
{
  const uno    = apartarParaEvento(META, 1, 600, PISO);
  const seis   = apartarParaEvento(META, 6, 600, PISO);
  check('con 1 dia se recortan las 600 de golpe',
    Math.abs((cal(META) - cal(uno)) - 600) < 1, `bajo ${Math.round(cal(META) - cal(uno))}`);
  check('con 6 dias se recortan 100 al dia',
    Math.abs((cal(META) - cal(seis)) - 100) < 1, `bajo ${Math.round(cal(META) - cal(seis))}`);
  check('avisar tarde duele mas', cal(uno) < cal(seis));
}

console.log('\n— Las cuentas cuadran —');
{
  // Lo que baja la meta diaria por los dias que quedan tiene que ser
  // exactamente lo apartado. Si no, la semana no suma y el anillo miente.
  let peor = 0, quien = null;
  for (const dias of [1, 2, 3, 4, 5, 6, 7]) {
    for (const reserva of [150, 400, 900, 1800, 3500]) {
      const a = apartarParaEvento(META, dias, reserva, PISO);
      const bajada = (cal(META) - cal(a)) * dias;
      const desvio = Math.abs(bajada - a.apartado);
      if (desvio > peor) { peor = desvio; quien = `${dias} dias, ${reserva} cal`; }
    }
  }
  check('lo apartado = lo que baja la semana, en los 35 casos', peor < 1,
    `peor desvio ${peor.toFixed(2)} cal en ${quien}`);
}

console.log('\n— Sin margen no inventa —');
{
  // Alguien que ya esta en el suelo no tiene de donde sacar.
  const justo = { P: 160, C: 100, G: 30 };     // 1.310 cal
  const a = apartarParaEvento(justo, 3, 500, 1400);
  check('no aparta nada', a.apartado === 0, `aparto ${a.apartado}`);
  check('lo dice entero', Math.abs(a.sinSitio - 500) < 1, `sinSitio ${a.sinSitio}`);
  check('y deja los macros intactos',
    a.P === justo.P && a.C === justo.C && a.G === justo.G, JSON.stringify(a));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

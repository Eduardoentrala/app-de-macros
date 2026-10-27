// La hoja del objetivo enseñaba las calorías de la fórmula, no las tuyas.
//
// MEDIDO EN UNA CUENTA DE VERDAD, con capturas:
//
//   Perfil → Metas de macros ...... P 140 · C 205 · G 63 = 1.947 cal
//   Perfil → Tu gasto real ........ 2.121 cal, «medido con 4 semanas y 28
//                                   días apuntados: 619 menos de lo que
//                                   decía la fórmula del registro»
//   Perfil → ¿Qué quieres lograr? . «Calorías al día  2.192 cal»
//                                   «Gastas ~2.740 al día»
//
// Las tres pantallas de la misma app, y la tercera contradice a las dos
// primeras. Dos fallos encadenados:
//
//  1. LA HOJA NO MIRABA TUS GRAMOS. Llamaba a `calcularMacros()` y pintaba
//     su resultado, también al abrirla sin tocar nada —al abrir se
//     preselecciona el objetivo que ya tienes—. Eso no es tu meta: es lo
//     que daría la calculadora si empezaras hoy de cero. Tu meta son los
//     gramos del perfil, que es lo que el cierre de cada lunes mueve.
//
//  2. Y RECALCULABA CON LA FÓRMULA TENIENDO LA MEDICIÓN AL LADO. La app ya
//     sabía que su gasto real era 2.121 y lo enseñaba en Perfil; la hoja
//     seguía usando los 2.740 de Mifflin. Elegir «mantener» le habría
//     puesto 2.740: seiscientas por encima de su mantenimiento real, o sea
//     subir de peso creyendo que mantiene.
//
// Y el remate: el botón «Guardar objetivo» escribe los gramos de la
// fórmula. Entrar a mirar y salir por el botón grande borraba semanas de
// ajuste sin preguntar nada.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

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

// Los números de la cuenta real, para que la prueba hable de algo.
const EST = { tmb: 1740, nivel: { f: 1.55, t: 'Moderado' }, peso: 84, alt: 170, edad: 30, gasto: 2740 };
const MEDIDO_OK = { estado: 'ok', gasto: 2121, estimado: 2740, semanas: 4, dias: 28 };

// ------------------------------------------------------------------
console.log('\nSe decide con el gasto medido cuando lo hay');
{
  const hacer = (medido) => new Function('gastoEstimado', 'gastoMedido',
    sacar('function gastoParaDecidir(){') + '\nreturn gastoParaDecidir;')(
    () => EST, medido === 'revienta' ? () => { throw new Error('ups'); } : () => medido)();

  const real = hacer(MEDIDO_OK);
  ok(real.gasto === 2121, 'con cuatro semanas medidas, manda lo medido',
     'salió ' + real.gasto + '; la fórmula decía 2740 y la propia app ya le ' +
     'enseña 2121 como «Tu gasto real»');
  ok(real.medido === true, 'y se sabe que es medido, para poder decirlo');

  for (const [caso, g] of [
    ['faltan semanas', { estado: 'faltan_semanas', semanas: 2, faltan: 1 }],
    ['fuera de rango', { estado: 'fuera_de_rango', gasto: 900, estimado: 2740 }],
    ['no hay nada', null],
    ['revienta', 'revienta'],
  ]) {
    const r = hacer(g);
    ok(r.gasto === 2740 && r.medido === false, `${caso}: manda la fórmula`,
       'salió ' + r.gasto + '. «fuera_de_rango» es justo el número que no hay ' +
       'que creerse: una semana rara, un viaje, una gripe');
  }

  ok(/var base = gastoParaDecidir\(\);/.test(sacar('function calcularMacros(){')),
     'y la calculadora entera lo usa',
     'si solo lo usara la hoja, cambiar el peso en Perfil volvería a recalcular ' +
     'con la fórmula y desharía esto');
}

// ------------------------------------------------------------------
// La hoja, ejecutándola de verdad.
const MIAS = { P: 140, C: 205, G: 63 };            // 1.947 cal
const FORMULA = { cal: 2192, P: 168, C: 243, G: 61, gasto: 2121, medido: true };

function abrir({ elijo, objetivoActual = 'bajar', mias = MIAS, formula = FORMULA }) {
  const puesto = {};
  const doc = {
    getElementById: (id) => ({
      set textContent(v) { puesto[id] = v; },
      set className(v) { puesto[id + ':class'] = v; },
      set innerHTML(v) { puesto[id] = v; },
    }),
    querySelectorAll: () => [],
  };
  new Function('document', 'objElegido', 'reg', 'metasVigentes', 'leerMetas',
    'calDe', 'calcularMacros', 'mil', 'textoRitmo', 'KCAL_POR_KG',
    sacar('function pintarPreviaObjetivo(){') + '\npintarPreviaObjetivo();')(
    doc, elijo, { objetivo: objetivoActual }, mias, () => mias,
    (m) => m.P * 4 + m.C * 4 + m.G * 9,
    () => formula,
    (n) => Math.round(n).toLocaleString('es-MX'),
    (kg) => (Math.abs(kg) < 0.05 ? 'mantener el peso'
      : (kg < 0 ? 'bajar ~' : 'subir ~') + Math.abs(kg).toFixed(2).replace('.', ',') + ' kg por semana'),
    7700);
  return puesto;
}

console.log('\nCon el objetivo que ya tienes, la hoja dice LO TUYO');
{
  const r = abrir({ elijo: 'bajar' });
  ok(/1,947/.test(r.objCal), 'las calorías de tus gramos, no las de la fórmula',
     'dice «' + r.objCal + '»; la fórmula daba 2.192 y eso son 245 de más ' +
     'presentadas como «Calorías al día»');
  ok(/P 140/.test(r.objNota) && /C 205/.test(r.objNota) && /G 63/.test(r.objNota),
     'y tus gramos');
  ok(!/Pasarías/.test(r.objNota), 'sin hablar de cambios: no estás cambiando nada');
  ok(r['objAviso:class'] === 'wc-safe', 'y el aviso se queda tranquilo');
}

console.log('\nY el ritmo sale de TUS calorías');
{
  const r = abrir({ elijo: 'bajar' });
  // (1947 − 2121) × 7 / 7700 = −0,158 kg por semana
  ok(/bajar ~0,16 kg/.test(r.objNota), 'el déficit de verdad contra el gasto de verdad',
     'dice: ' + r.objNota + '\n         con el de la fórmula decía «bajar ~0,50 kg ' +
     'por semana» al lado de unas calorías que dan otro ritmo');
  ok(/2,121/.test(r.objNota) && /medidas/.test(r.objNota),
     'y el gasto que enseña es el medido, y lo dice',
     'dice: ' + r.objNota);
}

console.log('\nAl elegir OTRO objetivo sí sale la fórmula, y como cambio');
{
  const r = abrir({ elijo: 'mantener' });
  ok(/2,192/.test(r.objCal), 'la cifra nueva arriba');
  ok(/Pasarías de 1,947 a 2,192/.test(r.objNota), 'y se dice de dónde a dónde',
     'dice: ' + r.objNota);
  ok(r['objAviso:class'] === 'wc-warn', 'el aviso avisa');
  ok(/sustituye lo que el cierre de los lunes llevaba ajustado/.test(r.objAviso),
     'y dice exactamente qué se pierde',
     'antes decía «no pierdes nada de lo apuntado», que es verdad sobre lo ' +
     'apuntado y tranquiliza en el momento exacto en que se borra el ajuste');
}

console.log('\nUna cuenta recién creada no tiene «lo tuyo» que enseñar');
{
  const r = abrir({ elijo: 'bajar', mias: { P: 0, C: 0, G: 0 } });
  ok(/2,192/.test(r.objCal), 'sin gramos manda la fórmula',
     'dice «' + r.objCal + '»: un «0 cal» sería peor que la fórmula');
}

// ------------------------------------------------------------------
console.log('\nY el botón no pisa nada sin querer');
{
  const guardar = APP.slice(APP.indexOf("getElementById('objGuardar')"), APP.indexOf("getElementById('objGuardar')") + 1400);
  ok(/if\(objElegido === reg\.objetivo\)\{ cerrarObjetivo\(\); return; \}/.test(guardar),
     'el mismo objetivo no se guarda',
     'guardar reescribe los gramos con los de la fórmula: sin cambiar de ' +
     'objetivo, eso solo puede borrar el ajuste de los lunes');
  ok(guardar.indexOf('if(objElegido === reg.objetivo)') < guardar.indexOf('sbActualizarPerfil'),
     'y sale antes de tocar la base');
}

console.log('\nEl aviso de la hoja tiene dónde escribirse');
{
  ok(/id="objAviso"/.test(HTML), 'el párrafo tiene id');
  ok(/\.wc-warn\{/.test(readFileSync(join(RAIZ, 'docs', 'estilos', 'componentes.css'), 'utf8')),
     'y la clase de aviso existe',
     'sin estilo, cambiar la clase no cambia nada en pantalla');
}

console.log(`\n${pasan} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);

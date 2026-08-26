// El cierre semanal deshacía lo que la salud declarada había protegido.
//
// EL CAMINO. Al darse de alta, quien marca «embarazo» o «lactancia» no
// recibe nunca un déficit: `ajustarPorSalud()` sube las calorías al gasto y
// encima le suma lo suyo (+340 o +450). Quien marca «enfermedad renal» tiene
// la proteína limitada a 0,8 g por kilo. Eso está bien resuelto y hay
// comentarios explicándolo.
//
// Pero las calorías no se quedan quietas. Cada lunes el cierre semanal le
// pide al modelo que decida, y si decide bajarlas, `aplicarCaloriasNuevas()`
// las aplicaba escalando los tres macros por una regla de tres y guardando.
// Sin mirar una sola condición.
//
// Y el modelo NO PUEDE saberlo: la función del asistente no recibe las
// condiciones de salud de nadie. Lo dice su propio prompt —«sus condiciones
// de salud vienen aparte y no son cosa tuya»—. Así que la protección del
// alta duraba hasta el primer lunes.
//
// Para una embarazada eso es un déficit calórico. Para alguien con el riñón
// tocado, proteína por encima de su tope. Ninguno de los dos se entera: la
// pantalla enseña los números nuevos y ya.
//
// EL DETALLE QUE HAY QUE CUIDAR AL ARREGLARLO. El extra del embarazo YA ESTÁ
// DENTRO de la meta vigente, porque se sumó al calcularla. Volver a sumarlo
// en cada ajuste haría crecer la meta 340 calorías por semana, sola. Lo que
// hay que proteger es el SUELO —el gasto más ese extra—, no repetir la suma.
// Por eso `ajustarPorSalud` recibe ahora `{soloTopes:true}` desde el cierre.

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

// Se saca una función entera contando llaves, no por una ventana de N
// caracteres: eso se rompe en cuanto la función crece una línea.
function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0;
  for (let j = APP.indexOf('{', i); j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// La tabla de reglas y la función, ejecutadas de verdad.
const REGLAS = (() => {
  const i = APP.indexOf('  var REGLAS_SALUD = {');
  const j = APP.indexOf('\n  };', i);
  return APP.slice(i, j + 4);
})();
const ajustar = new Function(REGLAS + '\n' + sacar('function ajustarPorSalud(') +
  '\n return ajustarPorSalud;')();

// Una persona de ejemplo: gasta 2200, pesa 70.
const BASE = { cal: 1760, P: 140, C: 180, G: 49, gasto: 2200, peso: 70 };

// ------------------------------------------------------------------
console.log('\nAl darse de alta, la protección está (esto ya funcionaba)');
{
  const emb = ajustar(BASE, ['embarazo']);
  ok(emb.cal >= 2200, 'con embarazo no queda por debajo del gasto',
     'salió ' + emb.cal + ' con un gasto de 2200');
  ok(emb.cal === 2540, 'y se le suman sus 340', 'salió ' + emb.cal);

  const renal = ajustar(BASE, ['enfermedad_renal']);
  ok(renal.P <= 56, 'con enfermedad renal la proteína se limita a 0,8 g/kg',
     'salió P' + renal.P + ' para 70 kg: el tope son 56');
}

// ------------------------------------------------------------------
console.log('\nY el cierre semanal ya no la deshace');
{
  // La meta vigente de una embarazada: 2540, con sus macros.
  const vigente = ajustar(BASE, ['embarazo']);
  // El modelo decide bajarle a 2000 —no sabe que está embarazada, no puede
  // saberlo— y eso es lo que llega a aplicarCaloriasNuevas.
  const conTopes = ajustar(
    { cal: 2000, P: 110, C: 140, G: 55, gasto: 2200, peso: 70 },
    ['embarazo'], { soloTopes: true });

  ok(conTopes.cal >= 2540,
     'una bajada por debajo del suelo se sube al suelo',
     'la IA pidió 2000 y quedó en ' + conTopes.cal + '; el suelo es 2200 de ' +
     'gasto más 340 de embarazo');

  // Y LO CONTRARIO, que es lo que rompería el arreglo: si se aplica semana
  // tras semana, la meta no puede ir creciendo sola.
  let cal = vigente.cal;
  for (let semana = 0; semana < 6; semana++) {
    const r = ajustar({ cal: cal, P: 140, C: 180, G: 49, gasto: 2200, peso: 70 },
                      ['embarazo'], { soloTopes: true });
    cal = r.cal;
  }
  ok(cal === 2540,
     'y aplicarla seis semanas seguidas no la infla',
     'acabó en ' + cal + ' partiendo de 2540: el extra se está sumando cada ' +
     'vez en vez de servir de suelo');

  // Subir sí se deja: el suelo es un suelo, no un valor fijo.
  const sube = ajustar({ cal: 2900, P: 140, C: 180, G: 49, gasto: 2200, peso: 70 },
                       ['embarazo'], { soloTopes: true });
  ok(sube.cal === 2900, 'y si la IA sube, se respeta',
     'quedó en ' + sube.cal + ': el suelo se convirtió en un techo');
}

console.log('\nY el tope del riñón también se respeta al ajustar');
{
  const r = ajustar({ cal: 2000, P: 150, C: 140, G: 55, gasto: 2200, peso: 70 },
                    ['enfermedad_renal'], { soloTopes: true });
  ok(r.P <= 56, 'la proteína sigue limitada a 0,8 g/kg después del ajuste',
     'salió P' + r.P + ': la IA subió la proteína por encima del tope del riñón');
}

console.log('\nY a quien no marcó nada no se le toca nada');
{
  const sin = ajustar({ cal: 2000, P: 110, C: 140, G: 55, gasto: 2200, peso: 70 },
                      [], { soloTopes: true });
  ok(sin.cal === 2000 && sin.P === 110 && sin.C === 140 && sin.G === 55,
     'sale exactamente lo que entró',
     'sin condiciones esto tiene que ser transparente: ' + JSON.stringify(sin));
}

// ------------------------------------------------------------------
console.log('\nY el cierre llama a la salud de verdad');
{
  // Lo de arriba prueba la regla. Esto prueba que quien aplica las calorías
  // nuevas la USA, y se ejecuta de verdad en vez de leerse: con solo buscar
  // «ajustarPorSalud» en el texto, vaciar el `if` que lo rodea dejaba la
  // comprobación pasando. Una mutación lo enseñó.
  //
  // Se le ponen dobles a lo que toca la pantalla y la red, y las de la
  // salud van de verdad, que son las que se están probando.
  function aplicarCon(condiciones, metaVigente, loQuePideLaIa) {
    const campo = () => ({ value: 0 });
    const goalP = campo(), goalC = campo(), goalG = campo();
    const f = new Function(
      'leerMetas', 'calDe', 'condicionesElegidas', 'gastoEstimado',
      'ajustarPorSalud', 'goalP', 'goalC', 'goalG', 'actualizarMetas',
      'sesion', 'metasVigentes',
      sacar('function aplicarCaloriasNuevas(') + '; return aplicarCaloriasNuevas;');
    f(() => Object.assign({}, metaVigente),
      (m) => m.P * 4 + m.C * 4 + m.G * 9,
      () => condiciones,
      () => ({ gasto: 2200, peso: 70, tmb: 1600, alt: 170, edad: 30 }),
      ajustar, goalP, goalC, goalG, () => {},
      null,                                  // sin sesión: corta antes de la red
      null)(loQuePideLaIa);
    return { P: Number(goalP.value), C: Number(goalC.value), G: Number(goalG.value) };
  }

  const calDe = (r) => r.P * 4 + r.C * 4 + r.G * 9;
  // Su meta vigente de embarazada, la que salió del alta.
  const vigente = ajustar(BASE, ['embarazo']);

  const r = aplicarCon(['embarazo'], vigente, 2000);
  ok(calDe(r) >= 2500,
     'a una embarazada no se le aplica el recorte que pidió la IA',
     'la IA pidió 2000 y se guardaron ' + Math.round(calDe(r)) + ' cal ' +
     '(P' + r.P + ' C' + r.C + ' G' + r.G + '): el suelo son 2540');

  // Y seis lunes seguidos, PASANDO POR LA FUNCIÓN QUE APLICA, no solo por la
  // regla. Es lo que distingue poner un suelo de volver a sumar el extra: lo
  // segundo también deja la primera semana por encima de 2500 —2540 clavado—
  // y solo se delata al repetirlo.
  //
  // Y la IA tiene que pedir algo CERCA DE LA META DE ESA SEMANA, no una
  // cifra fija. Con una fija —2000 siempre— las dos maneras convergen al
  // mismo sitio y esto no mira nada; se comprobó con una mutación. Cerca de
  // la meta es además lo que pasa de verdad: el cierre solo aplica cuando
  // decide mover, y mueve por poco.
  let meta = vigente;
  for (let semana = 0; semana < 6; semana++)
    meta = aplicarCon(['embarazo'], meta, Math.round(calDe(meta)));
  ok(calDe(meta) < 3000,
     'y seis lunes seguidos no le inflan la meta',
     'acabó en ' + Math.round(calDe(meta)) + ' cal: el extra del embarazo se ' +
     'está sumando cada semana en vez de hacer de suelo');
  ok(calDe(meta) >= 2500, 'sin dejar de respetar el suelo',
     'acabó en ' + Math.round(calDe(meta)));

  const renal = aplicarCon(['enfermedad_renal'], { P: 140, C: 180, G: 49 }, 2600);
  ok(renal.P <= 56,
     'y a quien tiene el riñón tocado no se le sube la proteína del tope',
     'se guardó P' + renal.P + ' para 70 kg: el tope son 56');

  // Y sin condiciones, exactamente la regla de tres de siempre.
  const normal = aplicarCon([], { P: 140, C: 180, G: 49 }, 2000);
  const antes = 140 * 4 + 180 * 4 + 49 * 9;
  ok(normal.P === Math.round(140 * (2000 / antes)),
     'y a quien no marcó nada se le aplica tal cual, como siempre',
     'P' + normal.P + ', esperaba ' + Math.round(140 * (2000 / antes)));
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

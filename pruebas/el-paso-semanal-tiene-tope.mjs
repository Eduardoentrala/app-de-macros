// El cierre podía moverte las calorías lo que quisiera.
//
// «Poco. Entre 100 y 200 calorías» lleva desde siempre escrito en el
// prompt del cierre. Y en ningún sitio más: `cal_nueva` iba del modelo a
// sus macros sin pasar por nada.
//
//     if(r.ajusto && r.cal_nueva) aplicarCaloriasNuevas(r.cal_nueva);
//
// Si un lunes devolvía 2.800 en vez de 2.050 —un dígito, un razonamiento
// torcido, lo que sea— se aplicaban 2.800 y la persona se encontraba con
// otra dieta.
//
// Y NO ES TEÓRICO. Esta misma semana se demostró que un tope en prosa no
// obliga: el «Máximo 500 caracteres» del motivo llevaba meses escrito, con
// su explicación, y el modelo se pasó igual. Allí lo peor fue una frase
// cortada. Aquí es la comida de alguien.
//
// EL TOPE ES 250 y no 200: el prompt pide hasta 200, y clavarlo en 200
// recortaría un ajuste legítimo por un redondeo. Lo que hay que impedir
// son los saltos de cientos, no discutir la última caloría.
//
// Y SE RECORTA, NO SE TIRA: un modelo que pide +800 se equivocó en la
// cantidad, no necesariamente en la dirección.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = APP.indexOf('{', j);
  for (; k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

const TOPE = Number((APP.match(/var PASO_MAXIMO = (\d+);/) || [])[1]);
const conPaso = new Function(
  'var PASO_MAXIMO = ' + TOPE + ';' + sacar('function conPaso(') + '; return conPaso;')();

// ------------------------------------------------------------------
console.log('\nEl tope existe y es sensato');
{
  ok(TOPE > 0, 'hay un tope de paso: ' + TOPE);
  ok(TOPE >= 200, 'y deja pasar los 200 que pide el prompt',
     'clavarlo en 200 recortaría un ajuste legítimo por un redondeo');
  ok(TOPE <= 400, 'pero no tanto como para dejar pasar un salto de verdad',
     'con 500 de margen, el tope no impide nada de lo que da miedo');
}

// ------------------------------------------------------------------
console.log('\nLo normal pasa sin tocarse');
{
  for (const [antes, pide] of [[1950, 2050], [1950, 1850], [1950, 2150], [1950, 1750]]) {
    const r = conPaso(pide, antes);
    ok(r.cal === pide && r.recortado === false,
       `de ${antes} a ${pide} pasa tal cual`, 'quedó en ' + r.cal);
  }
  ok(conPaso(1950, 1950).cal === 1950, 'y no moverse tampoco se toca');
}

// ------------------------------------------------------------------
console.log('\nY UN SALTO GRANDE SE RECORTA, en su dirección');
{
  const arriba = conPaso(2800, 1950);
  ok(arriba.cal === 1950 + TOPE, `de 1950 a 2800 quedan ${1950 + TOPE}`,
     'quedó en ' + arriba.cal);
  ok(arriba.recortado === true, 'y se nota que se recortó');

  const abajo = conPaso(900, 1950);
  ok(abajo.cal === 1950 - TOPE, `y de 1950 a 900 quedan ${1950 - TOPE}`,
     'quedó en ' + abajo.cal);
  ok(abajo.recortado === true, 'también marcado');

  // LA DIRECCIÓN SE RESPETA. Recortar al revés sería peor que no recortar:
  // bajarle cuando el cierre decidió subirle.
  ok(arriba.cal > 1950, 'subir recortado sigue subiendo');
  ok(abajo.cal < 1950, 'y bajar recortado sigue bajando');

  // Justo en el borde no se toca.
  ok(conPaso(1950 + TOPE, 1950).recortado === false, 'justo en el tope no se recorta');
  ok(conPaso(1950 + TOPE + 1, 1950).recortado === true, 'y uno más sí');
}

// ------------------------------------------------------------------
console.log('\nY sin números no se inventa nada');
{
  for (const malo of [null, undefined, 0, NaN, 'x', -100]) {
    const r = conPaso(malo, 1950);
    ok(r.recortado === false, `con «${String(malo)}» no se recorta nada`);
  }
  // Sin meta anterior no hay desde dónde medir el salto: se deja pasar y
  // el suelo hace su trabajo después.
  ok(conPaso(2800, 0).recortado === false, 'y sin meta anterior tampoco',
     'no hay desde dónde medir un salto');
}

// ------------------------------------------------------------------
console.log('\nY se aplica antes del suelo, y se dice');
{
  const f = sinComentarios(sacar('function aplicarCaloriasNuevas('));
  ok(/conPaso\(nuevas, antes\)/.test(f), 'el paso se recorta al aplicar');
  ok(f.indexOf('conPaso(') < f.indexOf('conSuelo('),
     'y ANTES que el suelo',
     'si recortar el salto deja el número bajo su basal, tiene que mandar ' +
     'el suelo — y para eso va el último');
  ok(/nuevas = paso\.cal;/.test(f), 'y se queda con lo recortado');

  // DENTRO DEL `if`, contando llaves. Con una ventana de N caracteres,
  // quitar este toast seguía dando verde porque el del suelo caía dentro
  // de la ventana. Lo cazó una mutación.
  const iPaso = f.indexOf('if(paso.recortado){');
  let n = 0, bloquePaso = '';
  for (let k = f.indexOf('{', iPaso); k < f.length; k++) {
    if (f[k] === '{') n++;
    else if (f[k] === '}') { n--; if (!n) { bloquePaso = f.slice(iPaso, k + 1); break; } }
  }
  ok(iPaso > 0 && /toast\(/.test(bloquePaso),
     'y se le dice a la persona',
     'recortarlo en silencio deja el mensaje del lunes prometiendo un ' +
     'número y la pantalla enseñando otro');
  ok(/apuntarFallo\('salto_recortado'/.test(bloquePaso),
     'y queda apuntado',
     'si el modelo empieza a pedir saltos raros, hay que enterarse');
}

// ------------------------------------------------------------------
console.log('\nY el prompt dice que esta vez obliga');
{
  const plano = FN.replace(/\s+/g, ' ');
  ok(/Entre 100 y 200 calorías/.test(plano), 'sigue pidiendo 100-200');
  ok(new RegExp('recorta a ' + TOPE).test(plano),
     'y avisa de que la app lo recorta',
     'un tope que el modelo no conoce lo sorprende; uno que conoce lo ' +
     'tiene en cuenta al decidir');
  ok(/no obliga/.test(plano),
     'y dice por qué está en el código y no solo aquí',
     'es la lección del motivo de 500 caracteres, que llevaba meses ' +
     'escrito y se pasó igual');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

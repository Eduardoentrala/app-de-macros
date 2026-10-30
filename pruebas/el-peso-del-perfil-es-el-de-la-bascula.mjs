// El perfil decía 84 kg para siempre.
//
// `weight_kg` se escribía al darse de alta y no se volvía a tocar nunca.
// Y lo de la pantalla es lo de menos:
//
//     var P = Math.round(peso * 2);                  // la proteína
//     var tmb = 10*peso + 6.25*alt - 5*edad + ...    // el basal
//
// Con cuatro kilos de menos, la meta de proteína se queda ocho gramos alta
// TODOS LOS DÍAS, y el suelo de calorías —que nunca baja del basal— se
// calcula sobre un cuerpo que ya no existe.
//
// EL PROMEDIO DE LA SEMANA, NO EL ÚLTIMO PESAJE. El peso de un día se
// mueve un kilo largo por agua, sal y lo que haya en el estómago. Poner
// eso en el perfil haría que la proteína bailara a diario por razones que
// no son ni grasa ni músculo. La media de siete días solo se mueve cuando
// cambia algo de verdad, y es la misma idea que ya usa `peso_medio` en el
// cierre del lunes.
//
// LO QUE SE PRUEBA SE EJECUTA: la función de verdad, con pesajes de
// mentira, mirando el número que saca.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations', '0001_esquema_base.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cab) {
  const i = APP.indexOf(cab);
  if (i < 0) throw new Error('no encuentro: ' + cab);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cab);
}

// El calendario del arnés: hoy es el 30 de octubre de 2026.
const HOY = new Date(2026, 9, 30);
const isoDe = (d) => d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const haceDias = (n) => { const d = new Date(HOY); d.setDate(d.getDate() - n); return d; };
const dia = (n) => isoDe(haceDias(n));

// LA VENTANA SE LEE DEL CÓDIGO, no se copia aquí: si alguien la cambia a
// catorce días, esta prueba tiene que seguir midiendo lo que mide el código
// y no lo que yo creía cuando la escribí.
const DIAS = Number((APP.match(/var DIAS_PESO = (\d+);/) || [])[1]);

const media = (pesos) => new Function('PESOS', 'isoDe', 'HOY', 'haceDias', 'DIAS_PESO',
  sacar('function pesoDeLaSemana(){') + '\nreturn pesoDeLaSemana();'
)(pesos, isoDe, HOY, haceDias, DIAS);

// ------------------------------------------------------------------
console.log('\nLa ventana es una semana, y sale del código');
{
  ok(DIAS === 7, 'siete días', 'salió ' + DIAS + ': el promedio semanal es lo que se pidió');
}

console.log('\nY el número es el promedio de esos días');
{
  ok(media({ [dia(0)]: 80 }) === 80, 'con un solo pesaje, ese');
  ok(media({ [dia(0)]: 80, [dia(1)]: 82 }) === 81, 'con dos, la media');
  ok(media({ [dia(0)]: 80.2, [dia(1)]: 80.4, [dia(2)]: 80.9 }) === 80.5,
     'y se redondea a un decimal, como la columna',
     'salió ' + media({ [dia(0)]: 80.2, [dia(1)]: 80.4, [dia(2)]: 80.9 }) +
     ': `weight_kg` es numeric(5,1), más decimales los pierde la base');
}

console.log('\nY un día suelto no mueve el perfil');
{
  // El caso de verdad: seis días alrededor de 80 y una mañana de 82 por
  // haber cenado fuera. Con «el último pesaje» el perfil diría 82 y la
  // proteína subiría cuatro gramos por una cena.
  const semana = {};
  for (let i = 6; i >= 1; i--) semana[dia(i)] = 80;
  semana[dia(0)] = 82;
  const m = media(semana);
  ok(m === 80.3, 'una mañana alta mueve el promedio tres décimas, no dos kilos',
     'salió ' + m);
  const ultimo = semana[dia(0)];
  ok(Math.abs(m - ultimo) > 1.5, 'y queda lejos del último pesaje, que es el punto',
     'promedio ' + m + ' contra último ' + ultimo);
}

console.log('\nY lo de hace más de una semana no entra');
{
  const p = { [dia(0)]: 80, [dia(DIAS - 1)]: 80, [dia(DIAS)]: 100, [dia(60)]: 120 };
  ok(media(p) === 80, 'los pesajes viejos se quedan fuera',
     'salió ' + media(p) + ': si entraran, el perfil arrastraría el peso de ' +
     'hace meses y no se movería nunca');
}

console.log('\nY sin pesajes no se inventa nada');
{
  ok(media({}) === null, 'sin ninguno, nulo',
     'nulo quiere decir «no lo sé» y deja en pie lo que la persona puso a mano');
  ok(media({ [dia(30)]: 84 }) === null, 'y con solo uno viejo, también');
  ok(media({ [dia(0)]: 0 }) === null, 'y un cero no cuenta como pesaje',
     'cero kilos no es un peso, es un dato roto');
}

// ------------------------------------------------------------------
console.log('\nY al ponerlo, se respeta lo que la columna acepta');
{
  const f = sacar('function ponerPesoDeLaBascula(){');
  const rango = SQL.match(/weight_kg\s+numeric\(5,1\) check \(weight_kg\s+is null or weight_kg\s+between (\d+) and (\d+)\)/);
  ok(!!rango, 'la columna declara su rango', 'si cambia, el acotado de aquí sobra o falta');
  ok(rango && new RegExp('kg >= ' + rango[1] + ' && kg <= ' + rango[2]).test(f),
     `y el peso se comprueba contra ese rango (${rango && rango[1]}–${rango && rango[2]})`,
     'fuera de rango no falla ese campo: rebota la fila ENTERA, y entonces no ' +
     'se guarda ni el peso ni lo que fuera con él');

  ok(/Math\.abs\(antes - kg\) < 0\.05/.test(f),
     'y no se escribe si ya estaba puesto',
     'sin esto se manda un PATCH al servidor en cada apertura de la app para ' +
     'guardar el mismo número');
  ok(/sbActualizarPerfil\(\{ weight_kg: kg \}\)/.test(f),
     'se guarda en el perfil, con el nombre de columna bueno',
     'es de donde lo lee su entrenador y de donde sale al volver a entrar');
  ok(/campo\.value = kg;/.test(f) && /el\.textContent = kg\.toFixed\(1\)/.test(f),
     'y se ponen los dos sitios: el campo que calcula y el texto que se ve',
     'solo el texto sería pintar la verdad y seguir calculando con la mentira');
}

console.log('\nY el campo que se actualiza es el que usa la fórmula');
{
  const g = sacar('function gastoEstimado(){');
  ok(/getElementById\('regPeso'\)/.test(g),
     'el basal sale de `regPeso`, que es justo lo que se pone al día',
     'si la fórmula leyera otro sitio, el perfil diría la verdad y la ' +
     'proteína seguiría saliendo del peso del registro');
  const m = sacar('function calcularMacros(){');
  ok(/Math\.round\(peso \* 2\)/.test(m), 'y la proteína es dos gramos por kilo de ese peso');
}

console.log('\nY se pone al día cuando los pesajes ya son los de verdad');
{
  const i = APP.indexOf('PESO_CINTURA_LISTOS = true;');
  const j = APP.indexOf('ponerPesoDeLaBascula();', i);
  ok(i > 0 && j > i && j - i < 200,
     'justo después de que PESOS deje de estar vacío',
     'llamarlo antes promediaría un objeto vacío y no haría nada, callando');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

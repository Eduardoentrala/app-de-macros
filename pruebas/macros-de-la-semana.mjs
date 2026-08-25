// El cierre semanal juzgaba la semana por las calorías y nada más.
//
// LO QUE SALÍA DEL TELÉFONO eran dos números: la meta diaria y el promedio
// de calorías que se comió de verdad. Con eso, «2451 al día» describe por
// igual una semana con la proteína cumplida y otra en la que faltaron
// cuarenta gramos diarios. No son la misma semana, y para lo que el cierre
// decide —si mover las calorías o no— la diferencia es justo la que importa:
// perder peso quedándose corto de proteína es perder también músculo, y la
// báscula baja igual en los dos casos.
//
// La persona que lo notó lo dijo mejor: «no cerré la semana con las calorías
// completas, me faltó mucha proteína y mucho carbohidrato; ¿eso lo toma en
// cuenta?». No lo tomaba. No es que lo pasara por alto al razonar: es que el
// dato no le llegaba.
//
// Van los tres promedios de lo comido y las tres metas, con la misma cuenta
// que ya se hacía con las calorías: sumar los días apuntados y dividir entre
// los días apuntados —no entre siete—, que es lo que hace `media_cal`.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ---- La función de verdad, ejecutada ----
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

const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');
const calDe = (m) => m.P * 4 + m.C * 4 + m.G * 9;

function correr(REGISTRO, meta, ancla, hoy) {
  const f = new Function(
    'REGISTRO', 'leerMetas', 'anclaSemana', 'HOY', 'isoDe', 'calDe', 'PESOS',
    'cambiosDeMetaEn', 'Date',
    sacar('function datosDeLaSemana(anterior){') + '; return datosDeLaSemana(true);');
  return f(REGISTRO, () => meta, ancla, hoy, isoDe, calDe, {},
           () => null, Date);
}

// Una semana cerrada: siete días apuntados, corto de proteína y de carbos.
const ancla = new Date('2026-08-25T12:00:00');     // el martes que abre la nueva
const hoy = new Date('2026-08-25T12:00:00');
const REGISTRO = {};
for (let i = 1; i <= 7; i++) {
  const d = new Date(ancla); d.setDate(d.getDate() - i);
  REGISTRO[isoDe(d)] = { P: 120, C: 200, G: 70 };   // la meta era P170 C240 G75
}
const meta = { P: 170, C: 240, G: 75 };
const r = correr(REGISTRO, meta, ancla, hoy);

console.log('\nSale lo que de verdad se comió, no solo las calorías');
{
  ok(r.dias_apuntados === 7, 'cuenta los siete días', 'contó ' + r.dias_apuntados);
  ok(r.media_cal === 1910, 'y el promedio de calorías, como siempre',
     'salió ' + r.media_cal);
  ok(r.media_p === 120, 'el promedio de proteína comida',
     'sin esto, «1910 cal al día» describe igual una semana con la proteína ' +
     'cumplida que una con cincuenta gramos de menos');
  ok(r.media_c === 200, 'el de carbohidratos');
  ok(r.media_g === 70,  'el de grasas');
}

console.log('\nY las metas de los tres, para poder compararlas');
{
  ok(r.meta_cal === calDe(meta), 'la de calorías seguía estando');
  ok(r.meta_p === 170 && r.meta_c === 240 && r.meta_g === 75,
     'y ahora también las tres por separado',
     'el promedio solo dice algo al lado de su meta: ' + JSON.stringify(r));
}

console.log('\nEl promedio se saca sobre los días apuntados, no sobre siete');
{
  // Es como ya se calculaba `media_cal`. Dividir entre siete a quien apuntó
  // cuatro días le inventaría un déficit que no existió.
  const pocos = {};
  for (let i = 1; i <= 4; i++) {
    const d = new Date(ancla); d.setDate(d.getDate() - i);
    pocos[isoDe(d)] = { P: 100, C: 100, G: 50 };
  }
  const r2 = correr(pocos, meta, ancla, hoy);
  ok(r2.dias_apuntados === 4, 'cuatro días apuntados');
  ok(r2.media_p === 100, 'y el promedio es el de esos cuatro',
     'salió ' + r2.media_p + ': se dividió entre siete y el déficit es inventado');
  ok(r2.media_cal === r2.media_p * 4 + r2.media_c * 4 + r2.media_g * 9,
     'y los cuatro números cuadran entre sí');
}

console.log('\nY sin ningún día apuntado no se inventa nada');
{
  const r3 = correr({}, meta, ancla, hoy);
  ok(r3.dias_apuntados === 0, 'cero días');
  ok(r3.media_p === 0 && r3.media_c === 0 && r3.media_g === 0,
     'los promedios salen a cero, no a NaN',
     'un NaN viaja como null y el modelo lee «—» donde debería leer un cero: ' +
     JSON.stringify(r3));
}

console.log('\nY la función se lo dice al modelo');
{
  const i = FN.indexOf('LA SEMANA QUE SE CIERRA');
  const contexto = FN.slice(i, FN.indexOf('¿Hay material para ajustar?', i));
  ok(/media_p/.test(contexto), 'le pasa la proteína que comió',
     'la app la manda pero el texto del cierre no la nombra: llega y se tira');
  ok(/media_c/.test(contexto) && /media_g/.test(contexto), 'y los carbos y las grasas');
  ok(/meta_p/.test(contexto), 'con su meta al lado, que sola no dice nada');

  // Y que se le explique qué hacer con eso. Un número suelto en el contexto
  // lo puede ignorar; la regla es lo que hace que lo use.
  const reglas = FN.slice(FN.indexOf('SISTEMA_SEMANA'), FN.indexOf('LA SEMANA QUE SE CIERRA'));
  // Por concepto, no por la frase exacta: la redacción se va a retocar y
  // clavarla aquí haría fallar la prueba por un sinónimo. Pero tampoco vale
  // con buscar «proteína» a secas —ya salía en otro sitio y la comprobación
  // pasaba sin mirar nada—: tiene que hablar de quedarse CORTO respecto a
  // la meta, que es lo que se acaba de añadir.
  ok(/corto de prote/i.test(reglas), 'y se le dice qué hacer si se quedó corto',
     'sin una regla, seis números más en el contexto no cambian la decisión');
  // «por debajo» a secas sale en dos reglas distintas, así que quitar una
  // dejaba pasar la comprobación. Se ata a lo que hace única a esta: comer
  // menos de la meta SIN QUE EL PESO SE MUEVA apunta a lo apuntado, no al
  // metabolismo.
  //
  // Y se atan las dos mitades en la MISMA regla, no cada una por su lado:
  // con solo `/sospech/` la comprobación sobrevivía a que se borrara la
  // condición entera, porque «sospecha» seguía apareciendo en el resto del
  // párrafo. Una mutación lo enseñó.
  const laRegla = (reglas.split('\n   - ').find((r) => /no se movió/.test(r)) || '');
  ok(/POR DEBAJO/.test(laRegla) && /sospech/i.test(laRegla),
     'y qué hacer si comió por debajo y aun así el peso no se movió',
     'la regla que habla del peso parado tiene que decir las dos cosas: que ' +
     'comió por debajo Y que hay que sospechar de lo apuntado. Dice: «' +
     laRegla.slice(0, 120) + '»');
}

console.log('\nY aguanta que la app vaya por detrás');
{
  // App y función se despliegan por separado. Si llega un cuerpo viejo sin
  // los promedios nuevos, el cierre tiene que seguir funcionando.
  const i = FN.indexOf('LA SEMANA QUE SE CIERRA');
  const contexto = FN.slice(i, FN.indexOf('¿Hay material para ajustar?', i));
  const usos = contexto.match(/d\.(media|meta)_[pcg]/g) || [];
  ok(usos.length >= 6, 'usa los seis números nuevos', 'usa ' + usos.length);
  const protegidos = (contexto.match(/Number\(d\.(media|meta)_[pcg]\)\s*\|\|\s*0/g) || []).length;
  ok(protegidos >= 6, 'y todos con un cero por defecto',
     'una app vieja no los manda: sin el `|| 0` el cierre dice «NaN g de ' +
     'proteína» y el modelo razona sobre eso. Protegidos: ' + protegidos);
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

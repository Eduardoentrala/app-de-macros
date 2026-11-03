// La felicitación de cumpleaños: que sea suya, que sea una, y que sorprenda.
//
// Es lo único de toda la app que no sirve para nada, y ese es el punto. De
// ahí salen las tres cosas que pueden estropearla, y las tres se fijan aquí:
//
// 1. QUE DEJE DE SER UN REGALO. La tentación —la del modelo y la de quien
//    escribe el prompt— es aprovechar que hay alguien leyendo para colar un
//    consejo. «Felicidades, y este año a por esos 80 kg» convierte el regalo
//    en una tarea. El día que la app te pide algo por tu cumpleaños, deja de
//    ser tuyo.
//
// 2. QUE SE REPITA. Si el mensaje estuviera escrito en el código sería el
//    mismo siempre. Lo escribe el modelo, y se le pasan los de los años
//    anteriores con el encargo de no parecerse: una sorpresa que se repite
//    deja de serlo al segundo año.
//
// 3. QUE LA PIDA QUIEN QUIERA, CUANDO QUIERA. Esta acción no gasta tope
//    diario —felicitar a alguien no se le cobra—, así que el único freno es
//    que la fecha salga de la base y el día del reloj del servidor. Si la
//    app pudiera decir «hoy es mi cumpleaños», sería una llamada al modelo
//    gratis y sin límite.

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Esta prueba viene con un comentario arriba que dice «80 kg» y «consejo»:
// sin quitarlos, varias comprobaciones de abajo se aprobarían a sí mismas.
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function bloqueDeAccion(nombre) {
  const marca = `if (accion === '${nombre}') {`;
  const i = FN.indexOf(marca);
  if (i < 0) throw new Error('no encuentro la acción ' + nombre);
  let n = 0, j = FN.indexOf('{', i);
  for (; j < FN.length; j++) {
    if (FN[j] === '{') n++;
    else if (FN[j] === '}') { n--; if (!n) return sinComentarios(FN.slice(i, j + 1)); }
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

// El cuerpo empieza DESPUÉS de los paréntesis y no en la primera llave:
// los tipos de los parámetros llevan llaves dentro.
function sacar(cabecera) {
  const i = FN.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = FN.indexOf('(', i);
  for (; j < FN.length; j++) {
    if (FN[j] === '(') n++;
    else if (FN[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = FN.indexOf('{', j);
  for (; k < FN.length; k++) {
    if (FN[k] === '{') n++;
    else if (FN[k] === '}') { n--; if (!n) return FN.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

function prompt(nombre) {
  const i = FN.indexOf('const ' + nombre + ' = `');
  if (i < 0) throw new Error('no encuentro ' + nombre);
  const desde = FN.indexOf('`', i) + 1;
  return FN.slice(desde, FN.indexOf('`.trim();', desde));
}

const CUMPLE = bloqueDeAccion('cumple');
const P = prompt('SISTEMA_CUMPLE');

// ------------------------------------------------------------------
console.log('\nLa app no dice cuándo es su cumpleaños');
{
  ok(/from\('profiles'\)[\s\S]{0,120}nacimiento/.test(CUMPLE),
     'la fecha sale de la base');
  ok(!/cuerpo\.(nacimiento|cumple|fecha|anio|hoy)\b/.test(CUMPLE),
     'y nunca del cuerpo de la petición',
     'si la app pudiera decir qué día es, pediría su felicitación las veces ' +
     'que quisiera — y esta acción no gasta tope diario');
  ok(/new Date\(\)/.test(CUMPLE), 'el día lo pone el reloj del servidor');
}

// ------------------------------------------------------------------
console.log('\nY el día es el suyo, en su zona horaria');
{
  ok(/timeZone: 'America\/Mexico_City'/.test(CUMPLE),
     'el día se calcula en la zona de la app');
  ok(!/toISOString\(\)/.test(CUMPLE),
     'y no con `toISOString()`, que va en UTC',
     'desde las 18:00 de México ya es mañana en UTC: el cumpleaños ' +
     'empezaría la tarde de antes y se acabaría esa misma tarde');
  // La cuenta de días ya no vive aquí: se extrajo a `cumpleDeQueAnio` para
  // poder ejecutarla, y más abajo se ejecuta con los casos de fin de año y
  // del 29 de febrero. Aquí solo se vigila que el bloque siga delegando.
  ok(/cumpleDeQueAnio\(/.test(CUMPLE),
     'y la cuenta de días la hace la función que sí se puede probar');
}

// ------------------------------------------------------------------
console.log('\nY se felicita el día, o poco después, pero no un mes tarde');
{
  ok(/pasados > 3/.test(CUMPLE), 'con más de tres días de retraso no',
     'quien no abre la app ese día no se queda sin la suya, pero felicitar ' +
     'con un mes de retraso es peor que no felicitar');
  ok(/estado: 'sin_fecha'/.test(CUMPLE), 'y quien no puso su fecha no recibe nada',
     'es opcional de verdad: no se insiste ni se adivina');
}

// ------------------------------------------------------------------
console.log('\nY el año del cumpleaños no es siempre el de hoy');
{
  // SE EJECUTA, que es la única forma de ver esto. Leer el código daba la
  // impresión de que estaba bien: pegarle el año de hoy al día que naciste
  // parece obvio. Falla justo en fin de año, y quien lo sufre es quien
  // nació a final de diciembre — el peor momento para perderse la
  // felicitación, porque en año nuevo nadie abre la app ese día, que es
  // para lo que existe la ventana de tres días.
  const js = stripTypeScriptTypes(sacar('function cumpleDeQueAnio('));
  const cumpleDeQueAnio = new Function(js + '; return cumpleDeQueAnio;')();

  const casos = [
    ['el mismo día',            '2026-11-05', '1990-11-05', 2026, 0,  true],
    ['tres días después',       '2026-11-08', '1990-11-05', 2026, 3,  true],
    ['cuatro, ya no',           '2026-11-09', '1990-11-05', 2026, 4,  false],
    ['meses antes',             '2026-03-01', '1990-11-05', 2025, null, false],
    ['NACIÓ EL 31-DIC, HOY 2-ENE', '2027-01-02', '1990-12-31', 2026, 2, true],
    ['NACIÓ EL 29-DIC, HOY 1-ENE', '2027-01-01', '1990-12-29', 2026, 3, true],
    ['nació el 1-ene, hoy 1-ene',  '2027-01-01', '1990-01-01', 2027, 0, true],
    ['29 de febrero, año normal',  '2027-03-01', '1992-02-29', 2027, 0, true],
    ['29 de febrero, bisiesto',    '2028-02-29', '1992-02-29', 2028, 0, true],
  ];

  for (const [qué, hoy, nacio, anio, pasados, felicita] of casos) {
    const r = cumpleDeQueAnio(hoy, nacio);
    const entra = isFinite(r.pasados) && r.pasados <= 3;
    ok(entra === felicita,
       (felicita ? 'se felicita' : 'no se felicita') + ': ' + qué,
       `hoy=${hoy} nació=${nacio} → año=${r.anio} pasados=${r.pasados}`);
    ok(r.anio === anio, `  y es el cumpleaños de ${anio}`,
       'salió ' + r.anio + '. El año es el de la FILA ÚNICA de la base: con ' +
       'el de hoy, felicitar el 31 y otra vez el 1 serían dos felicitaciones ' +
       'para el mismo cumpleaños');
    if (pasados !== null) {
      ok(r.pasados === pasados, `  y han pasado ${pasados} día(s)`,
         'salió ' + r.pasados);
    }
  }

  // Nunca negativo: si lo fuera, la ventana `pasados > 3` dejaría pasar un
  // cumpleaños que todavía no ha llegado.
  let algunoNegativo = false;
  for (let d = 1; d <= 365; d++) {
    const hoy = new Date(Date.UTC(2027, 0, 1) + d * 86400000).toISOString().slice(0, 10);
    if (cumpleDeQueAnio(hoy, '1990-07-14').pasados < 0) algunoNegativo = true;
  }
  ok(!algunoNegativo, 'y en 365 días seguidos nunca sale negativo');
}

// ------------------------------------------------------------------
console.log('\nUna al año, y lo decide la base');
{
  ok(/from\('felicitaciones'\)[\s\S]{0,200}eq\('anio', anio\)/.test(CUMPLE),
     'se mira si ya está la de este año');
  ok(/guardado: true/.test(CUMPLE), 'y se devuelve la guardada en vez de rehacerla',
     'abrir la app cuatro veces ese día costaría cuatro llamadas al modelo');
  ok(/onConflict: 'user_id,anio'/.test(CUMPLE),
     'y al guardarla choca contra el `unique` de la base',
     'el freno no puede ser una marca del navegador: se vacía, y son dos ' +
     'teléfonos');
}

// ------------------------------------------------------------------
console.log('\nY cambia cada año');
{
  ok(/order\('anio', \{ ascending: false \}\)/.test(CUMPLE),
     'se traen las de los años anteriores');
  ok(/No te parezcas a ninguna/.test(CUMPLE),
     'y se le pide expresamente que no se parezca');
  ok(/no repitas su forma|No repitas su forma/i.test(P),
     'y el prompt insiste en ello');
  ok(/primera que le escribes/.test(CUMPLE),
     'y el primer año se dice que es el primero',
     'sin eso, el modelo habla de «otros años» que no existen');
}

// ------------------------------------------------------------------
console.log('\nY ES UN REGALO, NO UNA TAREA');
{
  // Lo que más fácil se estropea. Un consejo colado aquí no se lee como
  // ayuda: se lee como que ni hoy te dejan en paz.
  ok(/NO SE HABLA DE MACROS/.test(P), 'el prompt lo prohíbe con todas las letras');
  for (const [qué, re] of [
    ['calorías', /calorías/i],
    ['peso', /peso/i],
    ['metas', /metas/i],
    ['y consejos', /consejo/i],
  ]) {
    ok(re.test(P), 'prohíbe hablar de ' + qué);
  }
  ok(/mañana seguimos/.test(P),
     'y cierra el atajo de decirlo en bonito',
     '«disfruta hoy, que mañana seguimos» sigue siendo recordarle que ' +
     'mañana hay trabajo');
  ok(/sin emojis|Sin listas, sin emojis/i.test(P), 'y nada de emojis');
}

// ------------------------------------------------------------------
console.log('\nY es para esa persona, no para cualquiera');
{
  ok(/memoria_ia/.test(CUMPLE), 'se le pasa lo que sabe de ella');
  ok(/aprendido_cierre/.test(CUMPLE), 'y lo que fue aprendiendo en los cierres');
  ok(/lo que le ha costado/.test(P),
     'y se le dice qué reconocer: lo que costó, no el resultado',
     'felicitar un resultado es volver a hablar del progreso por la puerta ' +
     'de atrás');
  ok(/comoHablarle\(/.test(CUMPLE), 'y sabe si es hombre o mujer');
}

// ------------------------------------------------------------------
console.log('\nY no se cobra, ni se guarda a medias');
{
  const i = FN.indexOf("accion !== 'cumple'");
  ok(i > 0, 'no gasta consulta del tope diario',
     'gastarle a alguien su consulta del día en felicitarle sería cobrarle ' +
     'el regalo');
  ok(/textoDe\(/.test(CUMPLE) && /cortada/.test(CUMPLE),
     'y si sale cortada no se guarda',
     'con el `unique` por año, una felicitación a medias se quedaría hasta ' +
     'el año que viene');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

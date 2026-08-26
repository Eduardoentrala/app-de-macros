// Un número raro no puede llevarse por delante el chequeo entero.
//
// La 0054 le puso límites a las columnas nuevas —`peso_medio between 20 and
// 400`, `sesiones between 0 and 21`, `media_p between 0 and 1000`…— y eso
// está bien: impide que se guarde basura. Pero creó un riesgo que antes no
// existía, porque la foto de la semana viaja EN LA MISMA FILA que la nota y
// la decisión:
//
//   un solo valor fuera de rango → Postgres rechaza el INSERT entero
//   → no se guarda NADA: ni la nota, ni el motivo, ni `ajusto`
//   → el lunes siguiente el chequeo vuelve a salir como si no lo hubiera
//     contestado, gasta otra consulta de IA y puede ajustarle las calorías
//     dos veces por el mismo periodo.
//
// Y no es hipotético. El campo del peso NO tiene `min` ni `max` en el HTML,
// así que un dedo torpe mete un 5 o un 850 y ahí se queda. Y `sesiones` sale
// de contar filas de `workout_sessions`, no días: quien guarde dos entrenos
// el mismo día siete días seguidos manda 14, y cuatro al día manda 28.
//
// La regla: lo que no quepa se deja fuera. Una casilla con un guion es
// infinitamente mejor que perder la semana entera.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations', '0054_mis_semanas.sql'), 'utf8');

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

const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');

const foto = (d, sem, ent, cinturas = []) => new Function(
  'anclaSemana', 'isoDe', 'CINTURAS', 'Date',
  sacar('function fotoDeLaSemana(d, sem, ent){') + '; return fotoDeLaSemana;')(
    new Date('2026-08-25T12:00:00'), isoDe, cinturas, Date)(d, sem, ent);

// ---- Los límites, leídos de la propia migración ----
//
// No copiados a mano: si mañana se cambia un rango en el SQL, esta prueba
// se entera. Copiarlos aquí sería justo el error que se está probando.
const LIMITES = {};
for (const m of SQL.matchAll(/check \((\w+) is null or \1 between ([\d.]+) and ([\d.]+)\)/g))
  LIMITES[m[1]] = [Number(m[2]), Number(m[3])];

console.log('\nSe leen los límites de la migración, no de memoria');
{
  ok(Object.keys(LIMITES).length >= 10,
     `se encontraron ${Object.keys(LIMITES).length} rangos en la 0054`,
     'si salen pocos, esta prueba no está comprobando casi nada: ' +
     JSON.stringify(LIMITES));
  ok(LIMITES.peso_medio && LIMITES.peso_medio[0] === 20, 'el del peso, por ejemplo',
     JSON.stringify(LIMITES.peso_medio));
}

// ------------------------------------------------------------------
console.log('\nUn peso imposible se queda fuera, no tumba la fila');
{
  // El campo del peso no tiene min ni max: un 5 o un 850 entran tecleando.
  for (const kg of [5, 850, 0, -70]) {
    const r = foto({}, [{ peso_medio: kg }, { peso_medio: kg }], null);
    ok(r.peso_medio === null, `con ${kg} kg se manda nulo`,
       'se manda ' + r.peso_medio + ': Postgres rechaza el INSERT entero y se ' +
       'pierde también la nota y la decisión de esa semana');
  }
  // Y uno normal sigue pasando.
  const bien = foto({}, [{ peso_medio: 84.7 }, { peso_medio: 84.3 }], null);
  ok(bien.peso_medio === 84.3 && bien.peso_medio_antes === 84.7,
     'y un peso normal pasa igual que antes',
     JSON.stringify(bien));
}

console.log('\nY las sesiones, que se cuentan por filas y no por días');
{
  // Dos entrenos guardados el mismo día, siete días: 14. Cuatro al día: 28.
  const r = foto({}, [], { sesiones: 28, volumen: 50000, volumen_antes: 40000 });
  ok(r.sesiones === null || r.sesiones <= LIMITES.sesiones[1],
     'veintiocho sesiones no revientan la fila',
     'se manda ' + r.sesiones + ' y el límite es ' + LIMITES.sesiones[1]);
  // Pero el volumen, que no tiene tope, sigue entero: es el dato que importa.
  ok(r.volumen === 50000, 'y el volumen se manda entero',
     'no tiene tope en la base y es lo que dice si progresó');

  const normal = foto({}, [], { sesiones: 4, volumen: 21500, volumen_antes: 20100 });
  ok(normal.sesiones === 4, 'y cuatro sesiones pasan como siempre');
  ok(normal.sesiones !== null, 'sin convertirse en hueco');
}

console.log('\nY unos macros disparatados tampoco');
{
  const r = foto({ dias_apuntados: 7, media_cal: 99000, media_p: 5000,
                   media_c: 9000, media_g: 4000, meta_p: 900, meta_c: 9000, meta_g: 900 },
                 [], null);
  for (const k of ['media_cal', 'media_p', 'media_c', 'media_g', 'meta_p', 'meta_c', 'meta_g']) {
    const lim = LIMITES[k];
    ok(r[k] === null || (r[k] >= lim[0] && r[k] <= lim[1]),
       `«${k}» sale dentro de rango o no sale`,
       'sale ' + r[k] + ' y el rango es ' + lim.join('–'));
  }
  // Y lo normal no se toca.
  const bien = foto({ dias_apuntados: 7, media_cal: 2380, media_p: 120, media_c: 200,
                      media_g: 70, meta_p: 170, meta_c: 240, meta_g: 75 }, [], null);
  ok(bien.media_cal === 2380 && bien.media_p === 120 && bien.meta_p === 170,
     'y una semana normal viaja intacta', JSON.stringify(bien));
}

console.log('\nY una cintura fuera de rango');
{
  const r = foto({}, [], null, [{ fecha: '2026-08-20', cm: 250 }]);
  ok(r.cintura === null, 'no se manda',
     'se manda ' + r.cintura + ' y el límite es ' + (LIMITES.cintura || []).join('–'));
  const bien = foto({}, [], null, [{ fecha: '2026-08-20', cm: 88.5 }]);
  ok(bien.cintura === 88.5, 'y una normal sí');
}

// ------------------------------------------------------------------
console.log('\nTODO lo que se manda cabe en lo que la base acepta');
{
  // La red de seguridad: se arma una foto con valores absurdos en TODO y se
  // comprueba campo por campo contra los rangos de la migración. Si mañana
  // se añade una columna con su `check` y no se acota al mandarla, esto lo
  // caza sin tener que acordarse de nada.
  const r = foto(
    { dias_apuntados: 99, media_cal: -5, media_p: 99999, media_c: -1,
      media_g: 99999, meta_p: 9999, meta_c: -3, meta_g: 99999 },
    [{ peso_medio: 900 }, { peso_medio: -2 }],
    { sesiones: 999, volumen: 1, volumen_antes: 1 },
    [{ fecha: '2026-08-20', cm: 9 }]);

  const malos = [];
  for (const [k, v] of Object.entries(r)) {
    if (v === null) continue;
    const lim = LIMITES[k];
    if (lim && (v < lim[0] || v > lim[1])) malos.push(`${k}=${v} (rango ${lim.join('–')})`);
  }
  ok(malos.length === 0, 'ningún campo se sale de su rango',
     'se saldrían: ' + malos.join(', ') + '\n         ' +
     'cada uno de esos tumba el INSERT y con él la nota y la decisión');
}

console.log('\nY el guardado sigue mandando la foto con el resto');
{
  // Lo que hace que un valor malo sea caro: va en la MISMA fila. Si algún
  // día se separa en dos escrituras, este acotado deja de ser crítico —pero
  // aparecen semanas con la nota y sin números, o al revés—.
  const g = sacar('function guardarChequeo(r, foto){');
  ok(/Object\.assign\(/.test(g) && /foto \|\| \{\}/.test(g),
     'la foto viaja en el mismo cuerpo que la nota',
     'si esto cambia, revisar si el acotado sigue haciendo falta');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

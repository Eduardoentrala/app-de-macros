// Apagar la IA unos meses borraba esos meses.
//
// `chequeos_semanales` es la ÚNICA memoria de lo que pasó pasados 60 días:
// el diario solo se descarga de dos meses atrás, así que de más atrás no
// hay nada que recomponer. Esa tabla alimenta el historial que lee el
// cierre del lunes Y la medición del gasto real.
//
// Y la fila se escribía dentro del `then` del cierre, que es una llamada a
// la IA. Apagada la IA no hay llamada, no hay fila, y esas semanas
// desaparecen. Quien la apaga unos meses sigue apuntando su comida y
// pesándose todo ese tiempo —los datos están—; lo único que faltaba era
// guardarlos.
//
// LO DELICADO NO ES GUARDAR, ES NO ESTORBAR:
//
//   · Con la IA ENCENDIDA esto no escribe nada. Si lo hiciera, le quitaría
//     el bloque del chequeo a quien sí lo iba a contestar.
//   · La fila va marcada `auto`, y el bloque pendiente no la cuenta como
//     contestada. Sin eso, el día que vuelvan a encender la IA se quedan
//     sin su primer cierre, que es el que más falta hace.
//   · La encuesta se queda NULA. Un tres de relleno se promediaría con los
//     de verdad; el hueco se lee como lo que es.
//   · Y el modelo tiene que saber que esa semana no se miró: «no se tocó»
//     afirma que hubo una decisión.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
  '0060_la_semana_se_guarda_sin_ia.sql'), 'utf8');

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

// ------------------------------------------------------------------
// EJECUTADO: la función de verdad, con un `sbFetch` de mentira, mirando
// QUÉ PETICIONES SALEN y QUÉ LLEVA DENTRO la que escribe.
const GUARDAR = sacar('function guardarSemanaSinCierre(){');
const APAGADO = sacar('function cierreApagado(){');

function correr({ nivel = 'normal', llaves = null, yaHayFila = false, entreno = {} } = {}) {
  const salidas = [];
  const sbFetch = (ruta, op) => {
    const metodo = (op && op.method) || 'GET';
    salidas.push({ metodo, ruta: ruta.split('?')[0], cuerpo: op && op.body });
    if (metodo === 'GET') return Promise.resolve(yaHayFila ? [{ semana: '2026-10-26' }] : []);
    return Promise.resolve({});
  };
  // Con la IA encendida sale por el `return` de arriba y no devuelve
  // promesa: eso es lo correcto, no un fallo, asi que se envuelve.
  const arranca = new Function(
    'sbFetch', 'sesion', 'MI_NIVEL_IA', 'MIS_LLAVES', 'isoDe', 'anclaSemana',
    'datosDeEntreno', 'datosDeLaSemana', 'resumenDeSemanas', 'fotoDeLaSemana', 'JSON',
    APAGADO + '\n' + GUARDAR + '\nreturn guardarSemanaSinCierre();'
  )(sbFetch, { user: { id: 'u-1' } }, nivel, llaves,
    () => '2026-10-26', null,
    () => Promise.resolve(entreno), () => ({ dias_apuntados: 6, media_cal: 2380 }),
    () => [{ peso_medio: 84.2 }], () => ({ dias_apuntados: 6, media_cal: 2380, peso_medio: 84.2 }),
    JSON);
  return Promise.resolve(arranca).then(() => salidas, () => salidas);
}

console.log('\nCon la IA encendida no escribe nada');
{
  for (const [caso, args] of [
    ['nivel normal y sin llaves', { nivel: 'normal', llaves: null }],
    ['nivel plus', { nivel: 'plus', llaves: {} }],
    ['el cierre encendido a mano', { nivel: 'normal', llaves: { semanal: true } }],
  ]) {
    const r = await correr(args);
    ok(r.length === 0, `con ${caso}, ni una petición`,
       'salió ' + JSON.stringify(r.map((x) => x.metodo)) + ': escribir aquí le ' +
       'quitaría el bloque del chequeo a quien sí lo iba a contestar');
  }
}

console.log('\nY apagada, guarda los números de la semana');
{
  for (const [caso, args] of [
    ['el nivel apagado', { nivel: 'apagada', llaves: {} }],
    ['la llave del cierre apagada', { nivel: 'normal', llaves: { semanal: false } }],
  ]) {
    const r = await correr(args);
    const escribe = r.find((x) => x.metodo === 'POST');
    ok(r.some((x) => x.metodo === 'GET'), `con ${caso}, primero mira si ya hay fila`,
       'escribir sin mirar pisaría un cierre de verdad');
    ok(!!escribe, `y con ${caso}, la escribe`, JSON.stringify(r.map((x) => x.metodo)));
    const f = escribe ? JSON.parse(escribe.cuerpo) : {};
    ok(f.auto === true, `y va marcada \`auto\` (${caso})`,
       'sin la marca, el bloque se da por contestado y el día que enciendan ' +
       'la IA se quedan sin su primer cierre: ' + JSON.stringify(f));
    ok(f.ajusto === false, 'y sin ajuste, que no hubo ninguno');
    ok(f.hambre == null && f.energia == null && f.sueno == null,
       `y la encuesta en blanco (${caso})`,
       'nadie la preguntó. Un tres de relleno se promediaría con los de ' +
       'verdad: ' + JSON.stringify(f));
    ok(f.media_cal === 2380 && f.peso_medio === 84.2,
       `pero CON los números, que es para lo que se guarda (${caso})`,
       JSON.stringify(f));
    ok(escribe && /on_conflict=user_id,semana/.test(escribe.ruta) === false &&
       /resolution=merge-duplicates/.test(String(escribe.cuerpo)) === false,
       'y no inventa nada raro en el cuerpo');
  }
}

console.log('\nY si ya hay fila de esa semana, no la toca');
{
  const r = await correr({ nivel: 'apagada', llaves: {}, yaHayFila: true });
  ok(!r.some((x) => x.metodo === 'POST'), 'ni una escritura',
     'salió ' + JSON.stringify(r.map((x) => x.metodo)) + ': pisar un cierre de ' +
     'verdad con una fila automática borraría lo que el modelo decidió');
}

// ------------------------------------------------------------------
console.log('\nEl bloque del chequeo no se da por contestado con una fila automática');
{
  const f = sacar('function revisarChequeoPendiente(){');
  ok(/auto=is\.false/.test(f), 'la consulta del pendiente pide `auto = false`',
     'lo ÚNICO que apaga el bloque es que exista fila; sin esto, al volver a ' +
     'encender la IA no sale el primer cierre, que es el que más falta hace');
  ok(/on_conflict=user_id,semana/.test(sacar('function guardarChequeo(')),
     'y el cierre de verdad la sobrescribe en vez de chocar');
}

console.log('\nY se intenta al arrancar, no solo si alguien pulsa algo');
{
  const i = APP.indexOf('revisarChequeoPendiente();\n          guardarSemanaSinCierre();');
  ok(i > 0, 'el arranque lo llama',
     'con la IA apagada no hay nada que pulsar: el bloque ni se enseña, así ' +
     'que si no se intenta aquí no se intenta nunca');
}

// ------------------------------------------------------------------
console.log('\nLa columna existe y las de antes quedan como estaban');
{
  ok(/add column if not exists auto boolean not null default false/.test(SQL),
     'la migración la añade con su valor por defecto',
     'las filas que ya hay las escribió un cierre de verdad: `default false` ' +
     'las deja marcadas como lo que son sin tocar ninguna');
  ok(/comment on column public\.chequeos_semanales\.auto/.test(SQL),
     'y dice qué significa, en la propia base');
  ok(/ajusto,motivo,nota,auto/.test(APP), 'y la app se la trae al historial',
     'sin pedirla, el modelo no puede distinguir una semana sin cierre');
}

console.log('\nY el modelo sabe que esa semana no se miró');
{
  ok(/p\.auto \? ' · sin cierre \(la IA estaba apagada esa semana\)'/.test(FN),
     'el historial lo dice',
     '«no se tocó» afirma que hubo una decisión. En una semana automática no ' +
     'hubo ninguna: nadie la miró. Leerlo al revés le haría creer que falta ' +
     'disciplina cuando lo que faltaba era el cierre');
  const i = FN.indexOf("p.auto ?");
  const j = FN.indexOf("' · no se tocó'", i);
  ok(i > 0 && j > i, 'y gana al «no se tocó», no al revés',
     'con el orden cambiado, una semana automática con ajuste... que no puede ' +
     'tener, pero el que lo lea tiene que ver cuál manda');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

// Las llaves de IA, por los dos lados: el servidor y la pantalla.
//
//  Se EXTRAE el código real de los dos archivos y se EJECUTA. Buscar frases
//  no valdría aquí: lo que hay que comprobar no es que exista un mapa de
//  llaves, sino que ese mapa cubra las siete acciones y que mire las llaves
//  DE QUIEN TOCA. Un mapa al que le falte una acción se lee igual de bien
//  que uno completo.
//
//  Y lo que sostiene todo esto es el orden: la llave se mira ANTES del tope
//  diario. Al revés, quien tenga algo apagado perdería sus consultas del día
//  pulsando un botón que nunca le iba a contestar.

import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TS = join(AQUI, '..', 'supabase', 'functions', 'asistente', 'index.ts');
const JS = join(AQUI, '..', 'docs', 'app.js');
const TMP = join(AQUI, '.tmp-llaves');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};

const FUN = readFileSync(TS, 'utf8');
const APP = readFileSync(JS, 'utf8');

// ------------------------------------------------------------------
console.log('\nEl orden importa: la llave, antes de gastar la consulta');
{
  const iLlave = FUN.indexOf('¿Le dejan ESTO en concreto?');
  const iTope = FUN.indexOf("gastar_consulta_ia");
  ok(iLlave > 0 && iTope > 0 && iLlave < iTope,
     'se comprueba la llave ANTES de descontar del tope diario');
}

// ------------------------------------------------------------------
console.log('\nEl servidor: ninguna acción se queda sin llave');
{
  // Se saca el bloque real y se vuelve ejecutable.
  const desde = FUN.indexOf('  const LLAVE: Record<string, string> = {');
  const hasta = FUN.indexOf('\n  }\n', FUN.indexOf('    if (!puede) {'));
  if (desde < 0 || hasta < 0) { console.log('  FALLA  no encuentro el bloque'); process.exit(1); }
  const BLOQUE = FUN.slice(desde, hasta + 4);

  mkdirSync(TMP, { recursive: true });
  const arch = join(TMP, 'llave.ts');
  writeFileSync(arch, [
    'export async function mirar(admin: any, userId: any, accion: any,',
    '                            cuerpo: any, json: any) {',
    BLOQUE,
    '  return null;',
    '}',
  ].join('\n'), 'utf8');

  const { mirar } = await import(pathToFileURL(arch).href);

  // Un Supabase de mentira: devuelve la fila que se le diga y apunta a
  // quién se la pidieron.
  const fingir = (fila) => {
    const pedido = { a: null };
    return {
      pedido,
      from: () => ({ select: () => ({ eq: (_c, v) => { pedido.a = v; return {
        maybeSingle: async () => ({ data: fila }),
      }; } }) }),
    };
  };
  const json = (b, s) => ({ cuerpo: b, estado: s });

  const ACCIONES = ['apuntar', 'chat', 'aviso', 'semana', 'fotos', 'plan', 'cliente'];
  const YO = 'yo-1', ELLA = 'ella-2';

  // Con todo apagado, NINGUNA acción debe pasar. Es la forma de comprobar
  // que el mapa las cubre las siete: a la que se olvide, `llave` sale
  // indefinida y la petición pasa de largo sin que nadie lo note.
  const TODO_OFF = {
    foto: false, chat: false, semanal: false,
    plan_dia: false, plan_semana: false, analisis: false,
  };
  for (const accion of ACCIONES) {
    const admin = fingir(TODO_OFF);
    const r = await mirar(admin, YO, accion, { accion, cliente: ELLA }, json);
    ok(r && r.estado === 403, `«${accion}» se para con todo apagado`);
  }

  // Y con todo encendido, ninguna se para.
  for (const accion of ACCIONES) {
    const admin = fingir(null);
    const r = await mirar(admin, YO, accion, { accion, cliente: ELLA }, json);
    ok(r === null, `«${accion}» pasa si no hay nada apagado`);
  }
}

// ------------------------------------------------------------------
console.log('\nY mira las llaves DE QUIEN TOCA');
{
  const arch = join(TMP, 'llave.ts');
  const { mirar } = await import(pathToFileURL(arch).href);
  const fingir = (fila) => {
    const pedido = { a: null };
    return { pedido, from: () => ({ select: () => ({ eq: (_c, v) => { pedido.a = v; return {
      maybeSingle: async () => ({ data: fila }) }; } }) }) };
  };
  const json = (b, s) => ({ cuerpo: b, estado: s });
  const YO = 'coach-1', ELLA = 'lety-2';

  for (const accion of ['plan', 'cliente']) {
    const admin = fingir(null);
    await mirar(admin, YO, accion, { accion, cliente: ELLA }, json);
    ok(admin.pedido.a === ELLA,
       `«${accion}» mira las llaves de ELLA, no las del entrenador que pide`);
  }
  for (const accion of ['apuntar', 'chat', 'semana', 'fotos', 'aviso']) {
    const admin = fingir(null);
    await mirar(admin, YO, accion, { accion, cliente: ELLA }, json);
    ok(admin.pedido.a === YO,
       `«${accion}» mira las de quien pide, aunque venga un cliente en el cuerpo`);
  }

  // Si la app vieja no manda a quién, se mira a quien pide en vez de
  // rechazar: nadie se queda sin planes por no haber actualizado.
  const admin = fingir(null);
  await mirar(admin, YO, 'plan', { accion: 'plan' }, json);
  ok(admin.pedido.a === YO, 'sin «cliente» en el cuerpo, no revienta: mira al que pide');
}

// ------------------------------------------------------------------
console.log('\nEl plan de un día y la semana entera son llaves distintas');
{
  const arch = join(TMP, 'llave.ts');
  const { mirar } = await import(pathToFileURL(arch).href);
  const fingir = (fila) => ({ from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: fila }) }) }) }) });
  const json = (b, s) => ({ cuerpo: b, estado: s });

  // Justo el ajuste que más dinero mueve: días sí, semana no.
  const SOLO_DIA = { foto: true, chat: true, semanal: true,
                     plan_dia: true, plan_semana: false, analisis: true };

  const dia = await mirar(fingir(SOLO_DIA), 'c', 'plan',
    { accion: 'plan', cliente: 'x' }, json);
  ok(dia === null, 'el plan de un día sigue pasando');

  const sem = await mirar(fingir(SOLO_DIA), 'c', 'plan',
    { accion: 'plan', semana: true, cliente: 'x' }, json);
  ok(sem && sem.estado === 403, 'y la semana entera se para');
}

// ------------------------------------------------------------------
console.log('\nLA FOTO DE COMIDA VIAJA COMO «chat», no como «apuntar»');
{
  // Esto se escapó la primera vez. `apuntar` existe en la función pero la
  // app NO LA LLAMA NUNCA: la cámara vive dentro del asistente, así que
  // mandar el plato es un `chat` que lleva imágenes.
  //
  // Sin distinguirlo los dos interruptores mentían: apagar «apuntar comida
  // con foto» no paraba nada, y apagar «preguntas y avisos» paraba también
  // las fotos. Justo al revés de lo que dicen.
  const arch = join(TMP, 'llave.ts');
  const { mirar } = await import(pathToFileURL(arch).href);
  const fingir = (fila) => ({ from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: fila }) }) }) }) });
  const json = (b, s) => ({ cuerpo: b, estado: s });

  // Solo la foto apagada. Preguntar por texto tiene que seguir funcionando.
  const SIN_FOTO = { foto: false, chat: true, semanal: true,
                     plan_dia: true, plan_semana: true, analisis: true };

  const texto = await mirar(fingir(SIN_FOTO), 'u', 'chat', { accion: 'chat' }, json);
  ok(texto === null, 'con la foto apagada, preguntar por texto sigue pasando');

  const conFoto = await mirar(fingir(SIN_FOTO), 'u', 'chat',
    { accion: 'chat', imagenes: [{ datos: 'x', tipo: 'image/jpeg' }] }, json);
  ok(conFoto && conFoto.estado === 403, 'y mandar una foto de comida SE PARA');

  // Y la forma vieja del cuerpo, la de una sola imagen, cuenta igual.
  const vieja = await mirar(fingir(SIN_FOTO), 'u', 'chat',
    { accion: 'chat', imagen: 'x', tipo_imagen: 'image/jpeg' }, json);
  ok(vieja && vieja.estado === 403, 'también con la forma vieja de mandar una sola foto');

  // Y al revés: solo las preguntas apagadas.
  const SIN_CHAT = { foto: true, chat: false, semanal: true,
                     plan_dia: true, plan_semana: true, analisis: true };

  const t2 = await mirar(fingir(SIN_CHAT), 'u', 'chat', { accion: 'chat' }, json);
  ok(t2 && t2.estado === 403, 'con las preguntas apagadas, el texto se para');

  const f2 = await mirar(fingir(SIN_CHAT), 'u', 'chat',
    { accion: 'chat', imagenes: [{ datos: 'x', tipo: 'image/jpeg' }] }, json);
  ok(f2 === null, 'pero la foto de comida sigue pasando: es la otra llave');

  // Un array vacío no es una foto.
  const vacio = await mirar(fingir(SIN_CHAT), 'u', 'chat',
    { accion: 'chat', imagenes: [] }, json);
  ok(vacio && vacio.estado === 403, 'y «imagenes: []» no cuela como foto');
}

// ------------------------------------------------------------------
console.log('\nQuien ya usa la app no nota nada');
{
  const arch = join(TMP, 'llave.ts');
  const { mirar } = await import(pathToFileURL(arch).href);
  const json = (b, s) => ({ cuerpo: b, estado: s });

  const sinFila = { from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: null }) }) }) }) };
  ok(await mirar(sinFila, 'u', 'apuntar', { accion: 'apuntar' }, json) === null,
     'sin fila en la tabla, todo encendido');

  // Si la base falla, `data` viene nulo. NO puede apagarle la IA a todos.
  const rota = { from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: null, error: { message: 'se cayó' } }) }) }) }) };
  ok(await mirar(rota, 'u', 'apuntar', { accion: 'apuntar' }, json) === null,
     'y un fallo de la base tampoco apaga nada');
}

rmSync(TMP, { recursive: true, force: true });

// ==================================================================
console.log('\nLa pantalla: los dos lados dicen lo mismo');
{
  // El reparto acción→llave está escrito en los dos sitios. Si se separan,
  // la app esconde un botón que el servidor deja pasar, o al revés.
  const enApp = {};
  const m = APP.match(/var LLAVE_DE_ACCION = \{([\s\S]*?)\};/);
  ok(!!m, 'la app tiene su propio reparto');
  if (m) {
    m[1].replace(/(\w+)\s*:\s*'(\w+)'/g, (_, a, k) => { enApp[a] = k; return ''; });
    const enFun = {};
    const m2 = FUN.match(/const LLAVE: Record<string, string> = \{([\s\S]*?)\n  \};/);
    m2[1].replace(/(\w+):\s*'(\w+)'/g, (_, a, k) => { enFun[a] = k; return ''; });

    // La app NO tiene plan ni cliente a propósito: los pide el entrenador
    // sobre otra persona y sus llaves no están en este teléfono.
    ok(!('plan' in enApp) && !('cliente' in enApp),
       'la app no adivina por «plan» ni «cliente»: esas no son sus llaves');

    const distintas = Object.keys(enApp).filter((a) => enApp[a] !== enFun[a]);
    ok(distintas.length === 0,
       'y en lo que sí reparte, dice exactamente lo mismo que el servidor' +
       (distintas.length ? ' — difieren: ' + distintas.join(', ') : ''));
  }

  // Y lo de la foto también, que es donde el mapa no basta: se EJECUTA el
  // `llaveDe` de la app y se compara con lo que decidiría el servidor.
  const i = APP.indexOf('  function llaveDe(cuerpo){');
  const trozo = APP.slice(APP.indexOf('  var LLAVE_DE_ACCION = {'),
                          APP.indexOf('\n  }', i) + 4);
  const llaveDe = new Function(trozo + '; return llaveDe;')();

  ok(llaveDe({ accion: 'chat' }) === 'chat', 'la app: un chat sin foto es «chat»');
  ok(llaveDe({ accion: 'chat', imagenes: [{ datos: 'x' }] }) === 'foto',
     'y un chat CON foto es «foto», igual que en el servidor');
  ok(llaveDe({ accion: 'chat', imagen: 'x' }) === 'foto',
     'también con la forma vieja de una sola imagen');
  ok(llaveDe({ accion: 'chat', imagenes: [] }) === 'chat',
     'y un array vacío no es una foto');
  ok(llaveDe({ accion: 'plan' }) === undefined,
     'y del plan sigue sin opinar: no son sus llaves');
}

// ------------------------------------------------------------------
console.log('\nLos cuatro atajos');
{
  // Se ejecutan los de verdad, sacados del archivo.
  const trozo = APP.slice(APP.indexOf('  var LLAVES_IA = ['),
                          APP.indexOf('  function abrirLlavesIa(c){'));
  const atajoFn = APP.slice(APP.indexOf('  function atajoActual(l){'),
                            APP.indexOf('  function pintarLlaves(){'));
  const f = new Function(trozo + atajoFn + '; return { LLAVES_IA, ATAJOS_IA, TEXTO_ATAJO, atajoActual };');
  const { LLAVES_IA, ATAJOS_IA, TEXTO_ATAJO, atajoActual } = f();

  ok(LLAVES_IA.length === 6, 'seis interruptores');
  ok(LLAVES_IA[0].k === 'foto',
     'y el primero es la foto: cuesta poco cada vez pero se usa a diario, ' +
     'y eso son dos tercios de la factura');
  ok(LLAVES_IA[1].k === 'plan_semana',
     'y la semana entera va SEGUNDA: es lo mas caro de una vez, pero se ' +
     'pide una vez por semana. Estuvo primera, aconsejando apagar lo que ' +
     'menos ahorra');

  const claves = LLAVES_IA.map((x) => x.k).sort().join(',');
  for (const a of Object.keys(ATAJOS_IA)) {
    ok(Object.keys(ATAJOS_IA[a]).sort().join(',') === claves,
       `el atajo «${a}» cubre las seis, ninguna de más ni de menos`);
    ok(!!TEXTO_ATAJO[a], `y «${a}» dice en una línea qué significa`);
  }

  ok(atajoActual(ATAJOS_IA.todo) === 'todo', 'todo encendido se reconoce como «todo»');
  ok(atajoActual({}) === 'todo',
     'y una persona sin fila también: no hay fila, no hay nada apagado');
  ok(atajoActual(ATAJOS_IA.nada) === 'nada', '«nada» se reconoce');
  ok(atajoActual(ATAJOS_IA.justo) === 'justo', '«lo justo» se reconoce');
  ok(atajoActual(ATAJOS_IA.foto) === 'foto', '«solo foto» se reconoce');
  ok(atajoActual({ ...ATAJOS_IA.todo, chat: false }) === 'medida',
     'y algo afinado a mano no se disfraza del atajo que más se le parezca');

  // Apagaba SOLO la semana entera: un 12% con un nombre que promete mucho
  // mas. Un atajo que no ahorra es un atajo que engana.
  ok(ATAJOS_IA.justo.foto === true && ATAJOS_IA.justo.plan_dia === true,
     '«lo justo» deja lo que se usa a diario: la foto y los planes del dia');
  ok(ATAJOS_IA.justo.plan_semana === false && ATAJOS_IA.justo.chat === false,
     'y apaga lo caro de una vez y lo que se pregunta seguido');
  const apagadas = Object.keys(ATAJOS_IA.justo).filter((k) => !ATAJOS_IA.justo[k]).length;
  ok(apagadas >= 3, `y apaga al menos tres cosas (apaga ${apagadas}): con una sola, el nombre prometia mas de lo que daba`);
  ok(ATAJOS_IA.foto.foto === true &&
     Object.keys(ATAJOS_IA.foto).filter((k) => ATAJOS_IA.foto[k]).length === 1,
     '«solo foto» deja encendida exactamente una cosa');
}

// ------------------------------------------------------------------
console.log('\nY el botón de enviar no se va con la foto encendida');
{
  const i = APP.indexOf('  function aplicarLlavesIa(){');
  const trozo = APP.slice(i, APP.indexOf('\n  }', i));
  ok(/mostrar\('iaEnviar', foto \|\| chat\)/.test(trozo),
     'enviar se queda si queda cualquiera de las dos');
  ok(/mostrar\('iaTexto', chat\)/.test(trozo),
     'y la caja de escribir solo con las preguntas encendidas');
  ok(/mostrar\('iaTomarFoto', foto\)/.test(trozo),
     'y la cámara solo con la foto encendida');
}

// ------------------------------------------------------------------
console.log('\nY la app corta antes de hacer esperar a nadie');
{
  const i = APP.indexOf('  function iaLlamar(cuerpo){');
  const trozo = APP.slice(i, APP.indexOf('\n  }\n', APP.indexOf('sbFetch(\'/functions/v1/asistente\'', i)));
  ok(/MIS_LLAVES\[llave\] === false/.test(trozo) && /Promise\.reject/.test(trozo),
     'con la llave apagada devuelve un no sin llamar al servidor');
  ok(trozo.indexOf('Promise.reject') < trozo.indexOf('sbFetch'),
     'y corta ANTES del sbFetch, que es lo que evita la espera');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

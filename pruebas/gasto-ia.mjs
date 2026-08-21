// ¿De verdad se apunta lo que cuesta la IA, y de verdad no puede romper nada?
//
//  Esta prueba NO lee el archivo buscando frases: EXTRAE el envoltorio real de
//  `index.ts`, lo ejecuta con un Anthropic de mentira y comprueba lo que quedó
//  apuntado. Un texto que "se ve bien" pero no apunta nada pasaría una prueba
//  de lectura; esta no.
//
//  Y lo que más importa no es que apunte: es que NO PUEDA ROMPER NADA. Esto es
//  contabilidad. Si la base falla, la persona tiene que recibir su respuesta
//  igual, sin enterarse de que hubo un problema al llevar las cuentas.

import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TS = join(AQUI, '..', 'supabase', 'functions', 'asistente', 'index.ts');
const TMP = join(AQUI, '.tmp-gasto');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};

// ---- Sacar el bloque real de la función y volverlo ejecutable ----
const src = readFileSync(TS, 'utf8');
const desde = src.indexOf('    const apuntarGasto =');
const fin = src.indexOf('\n    };', src.indexOf('    const ia = {'));
if (desde < 0 || fin < 0) {
  console.log('  FALLA  no se encuentra el envoltorio de la IA en index.ts');
  process.exit(1);
}
const BLOQUE = src.slice(desde, fin + '\n    };'.length);

mkdirSync(TMP, { recursive: true });
const arch = join(TMP, 'envoltorio.ts');
writeFileSync(arch, [
  'export function armar(admin: any, userId: any, accion: any, MODELO: any,',
  '                      iaCruda: any, reintentable: any) {',
  BLOQUE,
  '  return ia;',
  '}',
].join('\n'), 'utf8');

// Un Supabase de mentira que se queda con lo que le meten
function fingirAdmin(comoFalla) {
  const filas = [];
  return {
    filas,
    from(tabla) {
      return {
        insert(fila) {
          if (comoFalla === 'revienta') throw new Error('la base se cayó');
          filas.push({ tabla, fila });
          if (comoFalla === 'rechaza') return Promise.reject(new Error('RLS'));
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const { armar } = await import(pathToFileURL(arch).href);
const dejarQueTermine = () => new Promise((r) => setTimeout(r, 0));
const reintentable = (e) => !!(e && e.reintentable === true);

// ------------------------------------------------------------------
console.log('\nLo que cuesta una respuesta normal queda apuntado');
{
  const admin = fingirAdmin();
  const ia = armar(admin, 'u-1', 'plan', 'claude-opus-5', {
    messages: { create: async () => ({ usage: { input_tokens: 1200, output_tokens: 9000 } }) },
  }, reintentable);

  const r = await ia.messages.create({ model: 'claude-opus-5' });
  await dejarQueTermine();

  ok(r.usage.output_tokens === 9000, 'la respuesta llega igual a quien la pidió');
  ok(admin.filas.length === 1, 'se apuntó una sola vez');
  ok(admin.filas.length === 1 && admin.filas[0].tabla === 'ia_gasto', 'y en la tabla del gasto');
  const f = admin.filas.length ? admin.filas[0].fila : {};
  ok(f.entrada === 1200 && f.salida === 9000, 'con los tokens exactos, no estimados');
  ok(f.accion === 'plan', 'sabiendo qué acción fue');
  ok(f.user_id === 'u-1', 'y de quién');
  ok(f.modelo === 'claude-opus-5', 'y con qué modelo (los precios son por modelo)');
  ok(Object.keys(f).length === 5, 'y NADA del contenido: solo números');
}

// ------------------------------------------------------------------
console.log('\nLos tokens de caché cuentan como entrada');
{
  const admin = fingirAdmin();
  const ia = armar(admin, 'u-1', 'chat', 'claude-opus-5', {
    messages: { create: async () => ({ usage: {
      input_tokens: 100, cache_read_input_tokens: 4000,
      cache_creation_input_tokens: 500, output_tokens: 300,
    } }) },
  }, reintentable);
  await ia.messages.create({ model: 'claude-opus-5' });
  await dejarQueTermine();
  ok(admin.filas.length === 1 && admin.filas[0].fila.entrada === 4600,
     'si algún día se enciende la caché, la entrada no saldrá a cero');
}

// ------------------------------------------------------------------
console.log('\nEn streaming también, y una sola vez');
{
  const admin = fingirAdmin();
  const ia = armar(admin, 'u-2', 'semana', 'claude-opus-5', {
    messages: { stream: () => ({
      async finalMessage() { return { usage: { input_tokens: 3000, output_tokens: 20000 } }; },
    }) },
  }, reintentable);

  const flujo = ia.messages.stream({ model: 'claude-opus-5' });
  const r = await flujo.finalMessage();
  await dejarQueTermine();

  ok(r.usage.output_tokens === 20000, 'el mensaje final sigue llegando entero');
  ok(admin.filas.length === 1, 'se apuntó el streaming (los tokens no existen hasta el final)');
  ok(admin.filas.length === 1 && admin.filas[0].fila.salida === 20000, 'con la salida completa');
}

// ------------------------------------------------------------------
console.log('\nSi reintenta, NO se apunta dos veces');
{
  const admin = fingirAdmin();
  let veces = 0;
  const ia = armar(admin, 'u-3', 'apuntar', 'claude-opus-5', {
    messages: { create: async () => {
      veces++;
      if (veces === 1) { const e = new Error('saturado'); e.reintentable = true; throw e; }
      return { usage: { input_tokens: 50, output_tokens: 60 } };
    } },
  }, reintentable);

  await ia.messages.create({ model: 'claude-opus-5' });
  await dejarQueTermine();
  ok(veces === 2, 'reintentó, como siempre');
  ok(admin.filas.length === 1, 'pero el intento fallido no se apunta: no llegó a gastar');
}

// ------------------------------------------------------------------
console.log('\nY LO QUE MÁS IMPORTA: apuntar no puede tumbar la respuesta');
{
  const casos = [
    ['rechaza', 'si la base rechaza el apunte'],
    ['revienta', 'si el apunte revienta al vuelo'],
  ];
  for (const [modo, dicho] of casos) {
    const admin = fingirAdmin(modo);
    const ia = armar(admin, 'u-4', 'fotos', 'claude-opus-5', {
      messages: { create: async () => ({ usage: { input_tokens: 10, output_tokens: 20 } }) },
    }, reintentable);

    let cayo = null;
    const r = await ia.messages.create({ model: 'claude-opus-5' })
      .catch((e) => { cayo = e; return null; });
    await dejarQueTermine();
    ok(!cayo && r && r.usage.output_tokens === 20,
       dicho + ', la persona recibe su respuesta igual');
  }

  // Una promesa rechazada sin `catch` tumba el proceso entero.
  let suelta = null;
  process.on('unhandledRejection', (e) => { suelta = e; });
  const admin = fingirAdmin('rechaza');
  const ia = armar(admin, 'u-4', 'aviso', 'claude-opus-5', {
    messages: { create: async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }) },
  }, reintentable);
  await ia.messages.create({ model: 'claude-opus-5' });
  await new Promise((r) => setTimeout(r, 40));
  ok(suelta === null, 'y no queda ninguna promesa rechazada suelta que tumbe la función');
}

// ------------------------------------------------------------------
console.log('\nSin `usage` no se inventa nada');
{
  const admin = fingirAdmin();
  const ia = armar(admin, 'u-5', 'cliente', 'claude-opus-5', {
    messages: { create: async () => ({ content: [] }) },
  }, reintentable);
  await ia.messages.create({ model: 'claude-opus-5' });
  await dejarQueTermine();
  ok(admin.filas.length === 0, 'una respuesta sin tokens no deja fila fantasma');
}

rmSync(TMP, { recursive: true, force: true });
console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

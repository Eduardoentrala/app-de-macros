// La caché de prompt: ¿está donde ahorra, y no donde cuesta?
//
// LA REGLA QUE LO DECIDE TODO: la caché es una coincidencia de PREFIJO.
// Un solo byte distinto delante invalida todo lo de detrás. Así que lo que
// cambia en cada petición —la fecha de hoy, sus macros, lo que lleva
// comido— tiene que ir DESPUÉS del último corte. Delante, la caché no
// acierta jamás y solo se paga el recargo de escribirla.
//
// Y LA OTRA MITAD: no cachear lo que se usa poco. Leer cuesta 0.1x y
// escribir 1.25x, así que hace falta un 22% de aciertos para empezar a
// ahorrar. El cierre de semana se usa UNA VEZ POR SEMANA y la caché vive
// cinco minutos: ahí no acertaría nunca y cada llamada costaría un 25% más.
//
// Por eso esta prueba comprueba las dos cosas: que `chat` la lleva, y que
// las demás NO.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FUN = readFileSync(
  join(AQUI, '..', 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};

// El trozo de cada acción, de su `if` al siguiente.
function accion(nombre) {
  const i = FUN.indexOf(`if (accion === '${nombre}')`);
  if (i < 0) return '';
  const j = FUN.indexOf("    if (accion === '", i + 10);
  return FUN.slice(i, j > 0 ? j : FUN.length);
}

// ------------------------------------------------------------------
console.log('\nLa lleva el chat, que es el 79% de la factura');
{
  const chat = accion('chat');
  ok(/cache_control: \{ type: 'ephemeral' \}/.test(chat),
     'el chat cachea sus instrucciones');

  const cortes = (chat.match(/cache_control/g) || []).length;
  ok(cortes === 2, `dos cortes y no uno (hay ${cortes})`);

  // El primero DEJA FUERA lo que depende del plan. Si no, habría dos
  // cachés enteras -una de Plus y otra normal- en vez de compartir las
  // once mil de SISTEMA_CHAT.
  const primero = chat.indexOf('cache_control');
  const trozoAntes = chat.slice(chat.indexOf('system: ['), primero);
  ok(/text: SISTEMA_CHAT,/.test(trozoAntes) && !/esPlus/.test(trozoAntes),
     'y el primero deja fuera lo que depende del plan: SISTEMA_CHAT lo comparten todos');

  // Máximo cuatro por petición.
  ok(cortes <= 4, 'sin pasarse de los cuatro cortes que admite la API');
}

// ------------------------------------------------------------------
console.log('\nY LO QUE CAMBIA VA DETRÁS DE LOS CORTES');
{
  const chat = accion('chat');
  const i = chat.indexOf('system: [');
  const fin = chat.indexOf('],', i);
  const bloque = chat.slice(i, fin);

  const ultimoCorte = bloque.lastIndexOf('cache_control');
  for (const dato of ['hoyEs', 'contexto', 'loQueSe']) {
    const donde = bloque.indexOf(dato);
    ok(donde > ultimoCorte,
       `«${dato}» va después del último corte` +
       (donde > ultimoCorte ? '' : ' — delante invalidaría la caché en cada petición'));
  }

  // Y que sigan estando: moverlas detrás no puede haberlas perdido.
  ok(/hoyEs \+ contexto \+ loQueSe/.test(bloque),
     'y siguen estando las tres: mover no es perder');
}

// ------------------------------------------------------------------
console.log('\nLo que se usa poco NO se cachea');
{
  // Cinco minutos de vida contra una vez por semana o por mes: no
  // acertaría nunca y cada llamada costaría un 25% más.
  for (const a of ['semana', 'fotos', 'plan', 'cliente', 'aviso']) {
    ok(!/cache_control/.test(accion(a)),
       `«${a}» no la lleva: se usa demasiado poco para que la caché acierte`);
  }
}

// ------------------------------------------------------------------
console.log('\nY se puede saber si está funcionando');
{
  const i = FUN.indexOf('const apuntarGasto =');
  const bloque = FUN.slice(i, FUN.indexOf('\n    };', i));
  ok(/cache_lee: u\.cache_read_input_tokens/.test(bloque),
     'lo leído de caché se apunta aparte');
  ok(/cache_escribe: u\.cache_creation_input_tokens/.test(bloque),
     'y lo escrito también');
  ok(/entrada: u\.input_tokens \|\| 0,/.test(bloque),
     'y la entrada es solo lo que se pagó entero, sin sumarle la caché');
  ok(!/cache_read_input_tokens \|\|[\s\S]{0,40}\+/.test(bloque),
     'sumadas no se podría saber si acierta, y una caché que no acierta CUESTA más');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

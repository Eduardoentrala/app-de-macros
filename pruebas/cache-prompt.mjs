// La caché de prompt: ¿está donde ahorra, no donde cuesta, y no puede romper?
//
// LA REGLA QUE LO DECIDE TODO: la caché es una coincidencia de PREFIJO.
// Un solo byte distinto delante invalida todo lo de detrás. Así que lo que
// cambia en cada petición —la fecha de hoy, sus macros, lo que lleva
// comido— tiene que ir DESPUÉS del último corte. Delante, la caché no
// acierta jamás y solo se paga el recargo de escribirla.
//
// LA SEGUNDA MITAD: no cachear lo que se usa poco. Leer cuesta 0.1x y
// escribir 1.25x, así que hace falta un 22% de aciertos para empezar a
// ahorrar. El cierre de semana se usa UNA VEZ POR SEMANA y la caché vive
// cinco minutos: ahí no acertaría nunca y cada llamada costaría un 25% más.
//
// Y LA TERCERA: que no pueda romper nada. Esto es lo que más se usa de la
// app —apuntar comida— y no se pudo probar de punta a punta antes de
// desplegar, porque hace falta una sesión de verdad. Así que lleva red:
// ante un 400 se rehace la petición con el prompt de siempre.

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

const CHAT = accion('chat');
// El array de bloques, del `const` a su cierre.
const iBloques = CHAT.indexOf('const sistemaEnBloques = [');
const BLOQUES = iBloques < 0 ? '' : CHAT.slice(iBloques, CHAT.indexOf('\n      ];', iBloques));

// ------------------------------------------------------------------
console.log('\nLa lleva el chat, que es el 79% de la factura');
{
  ok(iBloques > 0, 'el chat arma su prompt en bloques');
  ok(/cache_control: \{ type: 'ephemeral' \}/.test(BLOQUES),
     'y los cachea');

  const cortes = (BLOQUES.match(/cache_control/g) || []).length;
  ok(cortes === 2, `dos cortes y no uno (hay ${cortes})`);
  ok(cortes <= 4, 'sin pasarse de los cuatro que admite la API');

  // El primero DEJA FUERA lo que depende del plan. Si no, habría dos cachés
  // enteras -una de Plus y otra normal- en vez de compartir las once mil.
  const primero = BLOQUES.indexOf('cache_control');
  const antes = BLOQUES.slice(0, primero);
  ok(/text: SISTEMA_CHAT,/.test(antes) && !/esPlus/.test(antes),
     'y el primero deja fuera lo del plan: SISTEMA_CHAT lo comparten todos');
}

// ------------------------------------------------------------------
console.log('\nY LO QUE CAMBIA VA DETRÁS DE LOS CORTES');
{
  const ultimoCorte = BLOQUES.lastIndexOf('cache_control');
  const donde = BLOQUES.indexOf('loQueCambia');
  ok(donde > ultimoCorte,
     'lo que cambia va después del último corte' +
     (donde > ultimoCorte ? '' : ' — delante invalidaría la caché en cada petición'));

  // Y que sean las tres cosas, no una: moverlas detrás no puede perderlas.
  ok(/const loQueCambia = hoyEs \+ contexto \+ loQueSe;/.test(CHAT),
     'y son las tres: la fecha, sus macros y lo que se recuerda de ella');
}

// ------------------------------------------------------------------
console.log('\nNingún bloque puede salir vacío');
{
  // Los tres datos pueden salir vacíos A LA VEZ: alguien recién registrado,
  // sin macros, sin Plus y con una zona horaria ilegible. Un bloque de
  // texto vacío es un 400. Antes daba igual porque todo se pegaba en una
  // sola cadena que empezaba por SISTEMA_CHAT.
  ok(/\.\.\.\(loQueCambia \? \[\{ type: 'text', text: loQueCambia \}\] : \[\]\)/.test(BLOQUES),
     'el tercero solo se pone si hay algo que poner');
  ok(/text: SISTEMA_CHAT,/.test(BLOQUES),
     'el primero es una constante del archivo: no puede quedar vacío');
  ok(/SISTEMA_APUNTAR_REGLAS,/.test(BLOQUES),
     'y el segundo acaba siempre en SISTEMA_APUNTAR_REGLAS, que no es opcional');
}

// ------------------------------------------------------------------
console.log('\nY NO PUEDE ROMPER EL CHAT');
{
  ok(/const sistemaPlano = SISTEMA_CHAT \+/.test(CHAT),
     'existe el prompt de siempre, en una sola cadena y sin caché');
  ok(/r = await pedirChat\(sistemaEnBloques\);/.test(CHAT),
     'se pide primero con la caché');
  ok(/if \(codigo !== 400\) throw e;/.test(CHAT),
     'y ante un 400 -«esta petición está mal armada»- no se rinde');
  ok(/r = await pedirChat\(sistemaPlano\);/.test(CHAT),
     'sino que la rehace sin caché: la persona ni se entera');

  // Y SOLO el 400. Los demás errores suben, que para eso está el reintento
  // de 529/429/5xx del envoltorio.
  const iCatch = CHAT.indexOf('} catch (e) {');
  const iPlano = CHAT.indexOf('pedirChat(sistemaPlano)');
  ok(iCatch > 0 && iPlano > iCatch,
     'el reintento va dentro del catch, no suelto');
  ok(/throw e;[\s\S]{0,200}pedirChat\(sistemaPlano\)/.test(CHAT),
     'y lo que no es un 400 se relanza ANTES de reintentar');
}

// ------------------------------------------------------------------
console.log('\nLo que se usa poco NO se cachea');
{
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
     'sumadas no se sabría si acierta, y una caché que no acierta CUESTA más');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

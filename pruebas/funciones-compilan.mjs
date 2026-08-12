// Dos variables con el mismo nombre en el mismo bloque.
//
// Esto tumbó la función `asistente` entera. `const previas` estaba dos
// veces en el mismo bloque —una del historial de chequeos, otra del
// resumen de semanas, que llegaron en commits distintos y chocaron al
// juntarse—. Deno no arranca el módulo: responde 503 BOOT_ERROR sin
// ejecutar una sola línea, así que no hay chat, ni cierre de semana, ni
// planes, ni apuntar con foto. Nada de IA.
//
// Ninguna otra prueba podía verlo: todas leen el fuente con expresiones
// regulares y una regex no sabe de ámbitos. Y desde fuera solo se ve un
// 503 que no dice por qué.
//
// Esta cuenta llaves para saber en qué bloque está cada declaración, que
// es exactamente la regla que rompe: `const` y `let` no se pueden repetir
// dentro del mismo bloque. `var` sí, y por eso no se mira.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'supabase', 'functions');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// Fuera comentarios, textos y plantillas: dentro hay llaves y hay
// `const` escritos en prosa, y los dos falsearían la cuenta.
//
// Los saltos de línea de lo que se quita SE CONSERVAN. Si no, el número de
// línea que sale en el fallo no es el del fichero —aquí salían 586 y 558
// cuando eran la 933 y la 958— y quien lo lea no encuentra nada donde
// mira. Un número que no lleva al sitio estorba más que no darlo.
function limpiar(src) {
  let fuera = '', i = 0;
  const saltos = (t) => t.replace(/[^\n]/g, '');
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const j = i; while (i < src.length && src[i] !== '\n') i++; fuera += saltos(src.slice(j, i)); continue; }
    if (c === '/' && d === '*') { const j = i; i += 2; while (i < src.length && !(src[i] === '*' && src[i+1] === '/')) i++; i += 2; fuera += saltos(src.slice(j, i)); continue; }
    if (c === '"' || c === "'" || c === '`') {
      const cierre = c, j = i; i++;
      // Las plantillas llevan ${...} con código dentro; se sustituye por un
      // hueco para no perder la cuenta de las llaves de fuera.
      while (i < src.length && src[i] !== cierre) {
        if (src[i] === '\\') { i += 2; continue; }
        if (cierre === '`' && src[i] === '$' && src[i+1] === '{') {
          let n = 1; i += 2;
          while (i < src.length && n > 0) { if (src[i] === '{') n++; else if (src[i] === '}') n--; i++; }
          continue;
        }
        i++;
      }
      i++; fuera += '""' + saltos(src.slice(j, i)); continue;
    }
    fuera += c; i++;
  }
  return fuera;
}

function repetidas(src) {
  const limpio = limpiar(src);
  const porBloque = new Map();   // ruta del bloque -> nombre -> línea
  const pila = [];
  let bloque = 0, linea = 1, choques = [];

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (c === '\n') { linea++; continue; }
    if (c === '{') { pila.push(++bloque); continue; }
    if (c === '}') { porBloque.delete(pila.join('.')); pila.pop(); continue; }

    if ((c === 'c' || c === 'l') && /[\s;{}(]|^$/.test(limpio[i-1] || '')) {
      const m = /^(const|let)\s+([A-Za-z_$][\w$]*)/.exec(limpio.slice(i, i + 60));
      if (m) {
        const ruta = pila.join('.');
        if (!porBloque.has(ruta)) porBloque.set(ruta, new Map());
        const aqui = porBloque.get(ruta);
        if (aqui.has(m[2])) choques.push({ nombre: m[2], linea, antes: aqui.get(m[2]) });
        else aqui.set(m[2], linea);
        i += m[0].length - 1;
      }
    }
  }
  return choques;
}

console.log('\n— Ninguna función declara dos veces lo mismo —');
for (const fn of readdirSync(DIR)) {
  const ruta = join(DIR, fn, 'index.ts');
  let src;
  try { src = readFileSync(ruta, 'utf8'); } catch { continue; }
  const choques = repetidas(src);
  check(`${fn} no repite variables`, choques.length === 0,
    choques.map(c => `«${c.nombre}» en la línea ${c.linea}, ya declarada en la ${c.antes}`).join('\n        ')
    + '\n        Deno no arranca el módulo: 503 BOOT_ERROR y la app se queda sin IA.');
}

console.log('\n— Y la que se rompió sigue teniendo sus dos listas —');
{
  // Las dos existen y son cosas distintas: los chequeos de semanas
  // pasadas, y el resumen de esas semanas. Si alguien "arregla" el choque
  // borrando una, el entrenador pierde la mitad de lo que mira.
  const src = readFileSync(join(DIR, 'asistente', 'index.ts'), 'utf8');
  check('lee los chequeos anteriores', /Array\.isArray\(cuerpo\.historial\)/.test(src));
  check('y el resumen de semanas', /Array\.isArray\(cuerpo\.semanas\)/.test(src));
  check('con nombres distintos', !/const previas[\s\S]*const previas/.test(src));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

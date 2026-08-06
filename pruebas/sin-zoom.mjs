// Que la app no haga zoom por su cuenta.
//
// El zoom que molestaba no era el pellizco: iOS amplía la pantalla ÉL SOLO
// al tocar un campo cuya letra mide menos de 16px, y al salir no siempre
// vuelve. Escribías el peso de una serie y la app se quedaba torcida.
//
// No hay ajuste que apague ese comportamiento -Safari lo hace por
// accesibilidad y `user-scalable=no` lo ignora al navegar normal-. La única
// forma de evitarlo es que ningún campo donde se escriba baje de 16px.
//
// Por eso esto se prueba sobre el CSS y no sobre una captura: un campo
// nuevo a 14px no rompe nada visible, solo hace que la app dé un salto al
// tocarlo, y eso no se nota revisando código.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'docs', 'estilos');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Ningún campo por debajo de 16px —');
{
  // Se recorren TODAS las hojas: da igual en cuál se cuele el campo nuevo.
  const flojos = [];
  for (const archivo of readdirSync(DIR).filter(f => f.endsWith('.css'))) {
    const css = readFileSync(join(DIR, archivo), 'utf8');
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = m[1].trim(), cuerpo = m[2];
      // La red se echa ancha a propósito: pesca tanto `input` y `textarea`
      // como las clases del proyecto -.set-input, .notas-input,
      // .field-value-, porque desde el CSS no hay forma de saber qué
      // etiqueta lleva una clase.
      if (!/input|select|textarea|field-value/i.test(sel)) continue;
      // Y luego se quita lo que no puede recibir texto. Sin esto pescaba
      // `.cmp-selects label`, que es una etiqueta y salió solo porque la
      // clase del padre lleva "select" dentro.
      const ultimo = sel.split(',')[0].trim().split(/\s+/).pop().split(':')[0];
      if (/^(label|span|div|p|b|small|button|th|td|h\d)$/i.test(ultimo)) continue;
      if (/button/i.test(sel)) continue;
      // Vale tanto `font-size:14px` como la abreviada `font:700 14px/1 x`.
      const tam = cuerpo.match(/font-size\s*:\s*([\d.]+)px/) ||
                  cuerpo.match(/font\s*:\s*[\w\s]*?([\d.]+)px\s*\//);
      if (!tam) continue;
      const px = parseFloat(tam[1]);
      if (px < 16) {
        const linea = css.slice(0, m.index).split('\n').length;
        flojos.push(`${archivo}:${linea} ${sel} -> ${px}px`);
      }
    }
  }
  check('nada donde se escriba baja de 16px', flojos.length === 0,
    flojos.join('\n        '));
}

console.log('\n— Y las cuatro que lo provocaban siguen arregladas —');
{
  // Se comprueban por nombre para que quede escrito cuáles eran y no se
  // "afinen" de vuelta a 14px por estética.
  const casos = [
    ['diario.css',      '.searchbox input'],      // el buscador de Guardados
    ['pantallas.css',   '.set-input'],            // las series de rutina
    ['componentes.css', '.goal-field input'],     // los objetivos de macros
    ['diario.css',      '.notas-input'],          // las notas
    ['pantallas.css',   '.ia-entrada textarea'],  // el chat de la IA
    ['componentes.css', '.field-value'],          // los macros al crear
    ['pantallas.css',   '.cmp-selects select']    // comparar semanas
  ];
  for (const [archivo, sel] of casos) {
    const css = readFileSync(join(DIR, archivo), 'utf8');
    const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
    const tam = m && (m[1].match(/font-size\s*:\s*([\d.]+)px/) ||
                      m[1].match(/font\s*:\s*[\w\s]*?([\d.]+)px\s*\//));
    check(`${sel} está a 16px o más`,
      !!tam && parseFloat(tam[1]) >= 16,
      tam ? `está a ${tam[1]}px` : 'no encontré la regla');
  }
}

console.log('\n— La red de seguridad para los que vengan —');
{
  const base = readFileSync(join(DIR, 'base.css'), 'utf8');
  check('hay un mínimo general', /input, select, textarea\{ font-size:max\(16px, 1em\); \}/.test(base));
  // Con `max(16px, 1em)` y no con 16px fijo: hay campos que a propósito son
  // más grandes -el de la cantidad va a 34px- y aplastarlos sería peor.
  check('no aplasta los que son grandes a propósito', /max\(16px, 1em\)/.test(base));
  check('quita el zoom del doble toque', /touch-action:manipulation/.test(base));
  // Sin esto, iOS reescala el texto al girar el teléfono.
  check('no reescala el texto solo', /-webkit-text-size-adjust:100%/.test(base));
}

console.log('\n— Y el pellizco, donde se pueda —');
{
  const meta = (HTML.match(/<meta name="viewport"[^>]*>/) || [''])[0];
  check('el viewport apaga el zoom manual', /user-scalable=no/.test(meta), meta);
  check('y fija la escala', /maximum-scale=1/.test(meta), meta);
  // Sin esto la app deja de llegar a los bordes y vuelven las franjas.
  check('sin perder el ajuste a la muesca', /viewport-fit=cover/.test(meta), meta);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

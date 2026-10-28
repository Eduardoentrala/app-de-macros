// La comparación de fotos se calculaba y ahí moría.
//
// Ocho imágenes al modelo una vez al mes, se pintaba en la pantalla de
// Fotos, y NO LA LEÍA NADIE MÁS. En concreto, no la leía el cierre del
// lunes: la decisión que mueve las calorías se tomaba sin el único dato de
// toda la app que distingue grasa de músculo.
//
// Porque eso es lo que son las fotos. La báscula no sabe —agua, comida,
// glucógeno—; la cintura sabe, pero en un punto; las fotos dicen DÓNDE
// está cambiando el cuerpo. Y hace falta exactamente cuando el peso no se
// mueve, que es cuando la gente lo deja creyendo que falló.
//
// DOS CUIDADOS, y los dos importan más que la función:
//
//   · Se lee de la BASE, no del cuerpo de la petición. Lo escribió el
//     modelo en otra llamada; si viniera por el cuerpo, cualquiera
//     inyectaría desde la consola lo que quisiera en el prompt que decide
//     las calorías.
//   · Y NO ES DE ESTA SEMANA. Se hace una vez al mes, sobre las fotos que
//     haya, que pueden ser de hace semanas. Usarla para explicar los siete
//     días que se cierran sería el mismo desajuste que ya se arregló
//     dentro del propio análisis.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ------------------------------------------------------------------
console.log('\nEl cierre las recibe, y del sitio bueno');
{
  ok(/from\('analisis_fotos'\)\.select\('mes, mensaje, semana_vieja, semana_nueva'\)/.test(FN),
     'se leen de `analisis_fotos`',
     'antes solo se tocaba esa tabla en la acción «fotos»: se escribía y se ' +
     'volvía a leer para la pantalla, y nada más');
  ok(/\.eq\('user_id', userId\)\.order\('mes', \{ ascending: false \}\)\.limit\(1\)/.test(FN),
     'la última, y solo la suya');

  // DE LA BASE, NO DEL CUERPO. Es la misma regla que la memoria del chat.
  const bloque = FN.slice(FN.indexOf("from('analisis_fotos').select('mes, mensaje"));
  ok(!/cuerpo\.(analisis|fotos|foto)\b/.test(bloque.slice(0, 1400)),
     'y no se acepta nada parecido desde el cuerpo',
     'lo escribió el modelo: por el cuerpo, cualquiera inyectaría en el ' +
     'prompt que decide las calorías');
}

// ------------------------------------------------------------------
console.log('\nY solo si todavía dicen algo de hoy');
{
  const i = FN.indexOf('const mesesDesde =');
  const f = FN.indexOf('}\n\n      const d = (cuerpo.datos', i);
  const trozo = FN.slice(i, f > i ? f : i + 1500);
  ok(/mesesDesde\(hoyMes, mesFoto\) <= 2/.test(trozo), 'se descarta lo de hace más de dos meses',
     'un análisis de hace cuatro meses explicaría el presente con un cuerpo ' +
     'que ya no es el suyo');

  // EJECUTADO: la cuenta de meses, que es donde se cuelan los años.
  // Se le quitan los tipos y se evalúa la función TAL CUAL, en vez de ir
  // recomponiéndola a parches: cada `.replace` suelto es una ocasión de
  // acabar probando algo que no es lo que corre en el servidor.
  const fuente = (trozo.match(/const mesesDesde = [\s\S]*?\n        \};/) || [''])[0]
    .replace('const mesesDesde = ', '')   // queda la flecha sola
    .replace(/: string/g, '')
    .replace(/;\s*$/, '');                // y sin el punto y coma final
  ok(/^\(a, b\) =>/.test(fuente), 'se extrae la función tal cual', fuente.slice(0, 40));
  const mesesDesde = new Function('return ' + fuente)();
  ok(mesesDesde('2026-10', '2026-10') === 0, 'el mismo mes son cero');
  ok(mesesDesde('2026-10', '2026-08') === 2, 'dos meses atrás son dos');
  ok(mesesDesde('2026-01', '2025-11') === 2, 'y cruzando el año, también',
     'salió ' + mesesDesde('2026-01', '2025-11') + ': un `mes - mes` a secas ' +
     'da -10 en enero y el análisis de noviembre volvería a colarse');
  ok(mesesDesde('2026-10', '2025-10') === 12, 'y un año son doce');
  ok(mesesDesde('2026-10', '') === 99, 'y una fecha ilegible se descarta');
}

// ------------------------------------------------------------------
console.log('\nY el prompt sabe qué hacer con ellas');
{
  ok(/5\. LO QUE DIJERON SUS FOTOS, si te lo paso\./.test(FN),
     'tienen su sitio en lo que mira, y es el último',
     'van detrás del peso y del entreno: son contexto, no la medida');
  ok(/distingue grasa de músculo/.test(FN), 'y se dice para qué sirven');
  ok(/recomposición\. Igual que con el volumen: NO toques nada/.test(FN),
     'el caso que importa: peso plano y las fotos cambiando',
     'es exactamente donde la gente abandona creyendo que falló');
  ok(/eso es agua\n     o lo que lleve dentro, no grasa/.test(FN),
     'y el contrario, sin dramatizar');

  ok(/PERO NO ES DE ESTA SEMANA\./.test(FN), 'y que no son de esta semana');
  ok(/NUNCA para explicar los siete días que estás\n   cerrando/.test(FN),
     'y que no sirven para explicar los días que se cierran',
     'es el mismo desajuste que ya se arregló dentro del propio análisis');
  ok(/manda la medida: un número\n   de ayer dice más que una foto del mes pasado/.test(FN),
     'y quién gana si se contradicen con la cintura',
     'sin esto, dos partes de la app se contradicen delante de la persona y ' +
     'ninguna dice por qué');
  ok(/Si la nombras, di de cuándo es\./.test(FN), 'y que diga de cuándo son');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

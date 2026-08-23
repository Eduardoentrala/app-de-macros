// Dos cabos que dejó el cambio de "la semana va de lunes a domingo".
//
// 1. La semana ya no se corta al cambiar los macros. Bien para el
//    calendario, pero deja una semana con dos metas distintas: quien se
//    sube las calorías un miércoles tiene dos días con una y cinco con
//    otra. Al cerrarla se manda UNA meta -la de ahora- y la media de los
//    siete días. Sin avisar, la IA lee "se pasó 300 al día" cuando iba
//    clavado, y le baja las calorías por un exceso que no existió.
//
// 2. Los errores del asistente salían en inglés. Hoy la función estuvo
//    horas sin arrancar y lo que se habría visto en pantalla era
//    «Function failed to start (please check logs)»: en inglés, hablando
//    de unos registros que nadie puede abrir, y sin decir lo único que
//    importa, que no se perdió nada.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Se apunta el cambio de meta, con su fecha —');
{
  // Se saca la función DE VERDAD y se corre con un almacén de mentira, para
  // no comprobar que el texto está escrito sino que la cuenta sale.
  const i = APP.indexOf('  var CLAVE_CAMBIOS =');
  const j = APP.indexOf('document.getElementById(\'wcAccept\')');
  check('el trozo existe', i > 0 && j > i);
  const trozo = APP.slice(i, j);

  const almacen = {};
  const localStorage = {
    getItem: (k) => (k in almacen ? almacen[k] : null),
    setItem: (k, v) => { almacen[k] = String(v); }
  };
  const HOY = new Date(2026, 7, 12);                       // miércoles 12 ago
  const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') +
                       '-' + String(d.getDate()).padStart(2,'0');
  const haceDias = (n) => { const d = new Date(HOY); d.setDate(d.getDate() - n); return d; };

  const fn = new Function('localStorage', 'HOY', 'isoDe', 'haceDias',
    trozo + '\n return { apuntar: apuntarCambioDeMeta, leer: cambiosDeMetaEn, almacen: localStorage };');
  const api = fn(localStorage, HOY, isoDe, haceDias);

  api.apuntar(2315, 2720);
  const lunes = new Date(2026, 7, 10), lunesQueViene = new Date(2026, 7, 17);
  const dentro = api.leer(lunes, lunesQueViene);
  check('queda apuntado dentro de su semana', dentro.length === 1);
  check('con las dos cifras', dentro[0] && dentro[0].antes === 2315 && dentro[0].despues === 2720);
  check('y con la fecha', dentro[0] && dentro[0].fecha === '2026-08-12');

  // La semana ANTERIOR no debe verlo: el cierre mira la que acaba de
  // terminar, y colarle un cambio de otra semana es peor que no decir nada.
  const anterior = api.leer(new Date(2026, 7, 3), lunes);
  check('la semana de antes no lo ve', anterior.length === 0);

  // Cambiar a lo mismo no es un cambio.
  api.apuntar(2720, 2720);
  check('no apunta un cambio que no cambia nada',
    api.leer(lunes, lunesQueViene).length === 1);

  // Y no crece para siempre.
  api.apuntar(1000, 1100);
  almacen['macros.cambiosMeta'] = JSON.stringify(
    JSON.parse(almacen['macros.cambiosMeta']).concat([{ fecha: '2026-01-01', antes: 1, despues: 2 }]));
  api.apuntar(1200, 1300);
  const todos = JSON.parse(almacen['macros.cambiosMeta']);
  check('tira lo de hace más de cinco semanas',
    !todos.some((c) => c.fecha === '2026-01-01'),
    'una lista que solo crece acaba llenando el almacén del navegador');

  // Un almacén roto no puede tumbar el cierre de semana.
  almacen['macros.cambiosMeta'] = '{no es json';
  check('un almacén corrupto no revienta', api.leer(lunes, lunesQueViene).length === 0);
}

console.log('\n— Y viaja al cierre de semana —');
{
  // Hasta el final de la función, NO 1400 caracteres. La ventana fija se
  // desbordó en cuanto se añadió un comentario dentro de la función, y esta
  // comprobación se puso roja sin que nada se hubiera roto. Ya había pasado
  // en otra prueba por lo mismo.
  const i = APP.indexOf('function datosDeLaSemana(');
  const trozo = APP.slice(i, APP.indexOf('\n  }', i));
  check('se manda con los datos de la semana', /cambios_de_meta: cambiosDeMetaEn\(desde, hasta\)/.test(trozo));
  // Solo a mano. Los de la IA caen en lunes y ya los tiene en su historial;
  // apuntarlos aquí también sería contárselos dos veces.
  check('solo se apuntan los cambios a mano',
    !/apuntarCambioDeMeta/.test(APP.slice(APP.indexOf('function aplicarCaloriasNuevas('), APP.indexOf('function aplicarCaloriasNuevas(') + 700)),
    'el ajuste de la IA no es un cambio a mano y ya lo conoce');
  check('se apunta al guardar macros', /apuntarCambioDeMeta\(calDe\(metasVigentes\), calDe\(metasPendientes\)\)/.test(APP));
  check('y al cambiar el objetivo', /apuntarCambioDeMeta\(calDe\(metasVigentes \|\| leerMetas\(\)\), calDe\(m\)\)/.test(APP));
}

console.log('\n— La IA sabe qué hacer con eso —');
{
  check('lee los cambios', /cambios_de_meta/.test(FN));
  check('se lo dice con las fechas y las cifras',
    /cambió su meta a mitad de semana/.test(FN) && /de \$\{c\.antes\} a \$\{c\.despues\} cal/.test(FN));
  // Lo importante no es que lo mencione, sino que NO lo lea como un exceso.
  check('le avisa de que el promedio mezcla dos metas',
    /NO lo `? ?\+?\s*`?leas como si se hubiera pasado/.test(FN.replace(/\s+/g, ' ')),
    'sin esto le baja las calorías por un exceso que no existió');
  check('y le pide prudencia', /casi nunca hay razón/.test(FN.replace(/\s+/g, ' ')));
  // Si no hubo cambio, ni una palabra: una línea que dice "no cambió nada"
  // solo gasta tokens y le da importancia a lo que no la tiene.
  check('si no hubo cambio no dice nada', /: '';/.test(FN.slice(FN.indexOf('const cambioMeta'), FN.indexOf('const cambioMeta') + 700)));
}

console.log('\n— Los errores del asistente, en español —');
{
  const i = APP.indexOf('function traducirError(');
  const trozo = APP.slice(i, APP.indexOf('\n  }', i) + 4);
  const fn = new Function(trozo + '\n return traducirError;')();

  const casos = [
    ['{"code":"BOOT_ERROR","message":"Function failed to start (please check logs)"}', 'caído', 'el de hoy'],
    ['Error 503', null, null],
    ['Function failed to start', 'caído', null],
    ['Request timed out', 'tardó demasiado', null],
    ['Error 504', 'tardó demasiado', null],
    ['429 Too Many Requests', 'tope', null],
    ['Error 500', 'servidor falló', null],
    ['Failed to fetch', 'Sin conexión', null],
    ['Invalid login credentials', 'incorrectos', null]
  ];
  for (const [entra, esperado] of casos) {
    if (!esperado) continue;
    const sale = fn(entra);
    check(`«${entra.slice(0, 34)}»`, sale.indexOf(esperado) >= 0, `dio «${sale}»`);
    check(`  ...y sin inglés dentro`, !/[Ff]unction|logs|Error \d|fetch|limit/.test(sale), `dio «${sale}»`);
  }

  // Lo que más importa de esos mensajes: que no culpen a quien los lee ni
  // le hagan pensar que perdió lo que apuntó.
  const caido = fn('BOOT_ERROR');
  check('el mensaje dice que no es culpa suya', /no es cosa tuya/i.test(caido));
  check('y que no perdió nada', /no perdiste nada/.test(caido));
  // Un error que no se reconoce se deja tal cual: inventarle una
  // traducción a algo que no se entiende esconde el problema de verdad.
  check('lo que no se reconoce se deja como está', fn('Algo rarísimo') === 'Algo rarísimo');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

// Que una avería de Anthropic no le cueste una consulta a nadie.
//
// LO QUE PASÓ, en los registros del 18 de agosto de 2026:
//
//   11:37:16  ERROR  asistente: Error: 529 {"type":"overloaded_error"}
//   11:37:30  ERROR  asistente: Error: 529 {"type":"overloaded_error"}
//   11:37:49  ERROR  asistente: Error: 529 {"type":"overloaded_error"}
//   11:42:48  ERROR  asistente: Error: 529 {"type":"overloaded_error"}
//
// 529 es Anthropic diciendo "estoy saturado". Un tropiezo de un segundo,
// no una avería. Pero la app no lo reintentaba, así que Eduardo tuvo que
// pulsar "Revisar mi semana" cuatro veces; cada intento le gastó una de
// las quince consultas del día; y lo único que veía era «El asistente no
// pudo responder. (Error)», que no dice nada de nada.
//
// Tres cosas mal, y las tres se arreglan aquí:
//   · no se reintentaba lo que era claramente pasajero
//   · se le cobraba una avería ajena
//   · el mensaje no distinguía "está saturado, espera" de "algo se rompió"
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
  '0040_devolver_consulta_ia.sql'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'diario.css'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Lo pasajero se reintenta —');
{
  check('hay reintento', /const reintentable = \(e: unknown\)/.test(FN));
  check('529 entra', /s === 529/.test(FN));
  check('429 y los 5xx también', /s === 429 \|\| \(s >= 500 && s < 600\)/.test(FN));
  // Un 400 es que la peticion esta mal armada: repetirla da el mismo error
  // mientras se paga otra vez.
  check('un 400 NO se reintenta', !/s === 400/.test(FN),
    'repetir una peticion mal armada da el mismo error y cuesta lo mismo');

  check('se intenta tres veces', /for \(let i = 0; i < 3; i\+\+\)/.test(FN));
  // Insistir al instante contra algo saturado es parte del problema.
  check('esperando más cada vez', /900 \* \(i \+ 1\)/.test(FN));
  check('y a la tercera se rinde', /if \(!reintentable\(e\) \|\| i === 2\) throw e;/.test(FN));

  // Que lo cubra TODO, no solo la llamada donde se vio el fallo.
  //
  // Se cuenta `ia.messages.` SIN exigir el `await` delante. Contandolo con
  // `await` esta comprobacion se puso en rojo el 21 ago 2026 por un
  // refactor que saco una llamada a una funcion auxiliar -`pedirChat`- que
  // devuelve la promesa en vez de esperarla. El envoltorio seguia
  // cubriendola: lo que fallaba era la forma de contar, no el codigo.
  const cubiertas = (FN.match(/\bia\.messages\.(create|stream)\b/g) || []).length;
  check(`cubre las ${cubiertas} llamadas de una vez`, cubiertas >= 6,
    'se envuelve el cliente, no cada llamada: asi no se olvida ninguna');

  // Y LO QUE DE VERDAD IMPORTA: que ninguna se salte el envoltorio. Las dos
  // unicas veces que puede aparecer el cliente crudo son las dos lineas que
  // lo envuelven.
  const crudas = (FN.match(/iaCruda\.messages\.(create|stream)/g) || []).length;
  check('y ninguna llamada se salta el reintento', crudas === 2,
    `el cliente crudo aparece ${crudas} veces; solo valen las dos del envoltorio`);
}

console.log('\n— No se le cobra una avería ajena —');
{
  check('se devuelve la consulta', /admin\.rpc\('devolver_consulta_ia', \{ usuario: userId \}\)/.test(FN));
  // Solo si el fallo fue del servidor. Un 400 es nuestro y se paga.
  check('solo cuando el fallo es del servidor', /if \(saturado && quedan !== null\)/.test(FN));
  // Si la accion no gastaba tope -las fotos-, `quedan` es null y no hay
  // nada que devolver.
  check('y solo si se llegó a cobrar', /quedan !== null/.test(FN),
    'las fotos no gastan tope: devolverles algo restaria de la nada');

  // La funcion de la base.
  check('existe la función', /create or replace function public\.devolver_consulta_ia/.test(SQL));
  check('usa el mismo día que gastar_consulta_ia',
    /\(now\(\) at time zone 'America\/Mexico_City'\)::date/.test(SQL),
    'con otro dia, a partir de las 18:00 devolveria en la fila equivocada');
  // El freno de verdad: aunque se llamara de mas, nunca baja de cero.
  check('nunca baja de cero', /greatest\(usadas - 1, 0\)/.test(SQL),
    'sin esto, llamarla de mas seria regalarse consultas');
  check('sin fila o en cero, no hace nada', /if usadas is null or usadas <= 0 then/.test(SQL));
  check('y no la puede llamar el navegador',
    /revoke all on function public\.devolver_consulta_ia\(uuid\) from public, anon, authenticated;/.test(SQL));
}

console.log('\n— Y el arreglo no puede tumbar la respuesta —');
{
  // ESTO PASÓ. La devolución estaba escrita como:
  //     admin.rpc(...).catch(() => {})
  // y `admin.rpc()` NO devuelve una promesa: devuelve el constructor de
  // consulta de PostgREST, que no tiene `.catch()`. Lanzaba
  // «TypeError: admin.rpc(...).catch is not a function».
  //
  // Y como esto vive DENTRO del catch general, no hay nadie más abajo que
  // lo recoja: la función se moría sin responder y el teléfono veía
  // «Load failed». Se arregló un mensaje malo y se convirtió en NADA.
  const sinComentar = FN.replace(/\/\/[^\n]*/g, '');
  check('nunca se encadena .catch a una consulta de PostgREST',
    !/\.rpc\([^)]*\)\s*\.catch/.test(sinComentar) && !/admin\.[a-z]+\([^)]*\)\s*\.catch/.test(sinComentar),
    'admin.rpc devuelve un constructor de consulta, no una promesa: .catch lanza TypeError');
  check('la devolución va envuelta en try', /try \{ await admin\.rpc\('devolver_consulta_ia'/.test(FN));
  check('y su fallo se recoge aquí mismo', /catch \(e2\) \{ console\.error/.test(FN),
    'dentro del catch general no hay nadie mas abajo que lo recoja');
  // Y que el `return json` venga DESPUES, o sea que contestar es lo que
  // manda: devolver la consulta es lo de menos.
  // Buscando DESDE la devolución: hay otros 503 mucho antes en el fichero y
  // comparar contra el primero daba un rojo que no era.
  const dev = FN.indexOf("try { await admin.rpc('devolver_consulta_ia'");
  check('contestar va después, pase lo que pase',
    dev > 0 && FN.indexOf('}, 503);', dev) > dev,
    'devolver la consulta es lo de menos: lo que no puede fallar es contestar');
}

console.log('\n— Y se dice lo que pasa de verdad —');
{
  // Esto estaba clavado al principio EXACTO de la línea, así que se puso
  // rojo al añadirle delante el caso de la llamada que no llegó a salir —un
  // fallo de conexión, que no trae código de estado—. Lo que importa es que
  // los códigos de "vuelve luego" sigan ahí, no en qué orden se escriban.
  check('se distingue saturado de roto',
    /const saturado = [\s\S]{0,60}estado === 529 \|\| estado === 429 \|\| \(estado >= 500/.test(FN));
  check('y una conexión que no llegó cuenta igual', /noSalio \|\|/.test(FN),
    'sin código de estado, el 0 no era saturado y la consulta se cobraba');
  check('el mensaje dice que no es cosa suya', /No es cosa tuya y no/.test(FN));
  check('que no gastó consulta', /gastaste ninguna consulta/.test(FN));
  check('y qué hacer', /espera un minuto y vuelve a intentarlo/.test(FN));
  // 503 y no 502: es "vuelve luego", no "algo se rompio".
  check('responde 503, que es «vuelve luego»', /\}, 503\);/.test(FN));

  // Lo demas sigue como estaba: el nombre del error viaja, el detalle no.
  check('lo que sí está roto sigue diciendo su nombre', /\(' \+ clase \+ '\)/.test(FN));
  check('y el detalle se queda en el registro', /console\.error\('asistente:', e\);/.test(FN));
}

console.log('\n— Y el bloque parece pulsable —');
{
  // Mecanicamente lo era: se comprobo que el dedo llega en los nueve puntos
  // del bloque. Pero una flechita gris al 60% sobre un bloque negro con dos
  // lineas de texto pasa por adorno, y si no lo parece da igual que lo sea.
  const i = CSS.indexOf('.cp-flecha{');
  const t = CSS.slice(i, i + 500);
  check('la flecha va en un círculo', /border-radius:50%/.test(t));
  check('con fondo que la despega', /background:color-mix/.test(t));
  check('y ya no está medio transparente', !/opacity:\.6/.test(t),
    'al 60% sobre negro no se lee como algo que se toca');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

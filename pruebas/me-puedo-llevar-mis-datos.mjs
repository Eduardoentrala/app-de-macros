// El aviso de privacidad prometía que cualquiera puede ACCEDER a sus datos,
// y no había por dónde.
//
// `legal.md` lo dice con todas las letras, y debajo lleva una lista de «para
// lo más común no hace falta escribir a nadie»: borrar la cuenta, quitar las
// condiciones de salud. Sacar los datos no estaba ahí ni en ningún otro
// sitio. Una promesa escrita y sin puerta.
//
// Y aparte de la promesa: si un día se cae el servidor o se deja de pagar,
// se van meses de pesajes, medidas, entrenos y chequeos sin que exista una
// copia en ninguna parte.
//
// TRES COSAS PUEDEN SALIR MAL AQUÍ, y las tres se fijan abajo:
//
// 1. QUE SE LLEVE LOS DATOS DE OTROS. RLS filtra, pero un entrenador ve a
//    sus clientes y el super admin lo ve TODO. Un `select=*` sin decir por
//    quién se filtra le bajaría la base entera. Es una fuga con un botón
//    bonito.
// 2. QUE SE DEJE TABLAS FUERA. Y la peor forma es la de mañana: alguien
//    añade una tabla con `user_id` y nadie se acuerda de esta lista. Por eso
//    la comprobación de abajo NO lee una lista escrita a mano: lee las
//    migraciones.
// 3. QUE SE LLEVE SOLO LAS PRIMERAS MIL FILAS. PostgREST corta ahí y no
//    avisa. Un diario de año y medio pasa de mil apuntes, y un respaldo
//    incompleto que se cree completo es peor que no tenerlo.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const MIG = join(RAIZ, 'supabase', 'migrations');
const SQL = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = APP.indexOf('{', j);
  for (; k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// Las dos listas, ejecutadas del fichero y no copiadas aquí.
const lista = (nombre) => {
  const i = APP.indexOf('var ' + nombre + ' =');
  const j = APP.indexOf('];', i);
  return new Function('return ' + APP.slice(APP.indexOf('=', i) + 1, j + 1))();
};
const TABLAS = lista('TABLAS_MIAS');
const FUERA = lista('NO_SON_MIOS');

// ------------------------------------------------------------------
console.log('\nHay por dónde, y el aviso lo prometía');
{
  ok(HTML.includes('id="profExportarBtn"'), 'está el botón en Perfil');
  const legal = readFileSync(join(RAIZ, 'docs', 'legal.md'), 'utf8');
  ok(/Acceder/i.test(legal), 'y el aviso de privacidad sigue prometiéndolo',
     'si un día deja de prometerlo, esto sigue siendo buena idea — pero ' +
     'esta comprobación sobra');
}

// ------------------------------------------------------------------
console.log('\nNINGUNA TABLA SUYA SE QUEDA FUERA');
{
  // SE LEEN LAS MIGRACIONES, no una lista escrita aquí. Una lista a mano se
  // queda vieja el día que alguien añada una tabla, y el fallo sería que
  // falta un trozo del respaldo sin que nada lo diga.
  const re = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
  const conDueno = new Set();
  let m;
  while ((m = re.exec(SQL))) {
    if (/\b(user_id|cliente_id)\b/.test(m[2])) conDueno.add(m[1]);
  }
  // Y LAS QUE UNA MIGRACIÓN SUELTA NO CUENTAN. `consentimientos` tiene
  // `user_id` y está muerta: la 0031 movió el consentimiento de salud al
  // propio perfil y la 0034 la va a borrar. Exportarla habría resucitado
  // una tabla que nadie escribe, y de paso habría atado la guarda de la
  // 0034 —que se niega a soltar lo que la app todavía usa— a una
  // referencia sin significado. Esto se lee de las migraciones para que no
  // haya que acordarse de nada.
  const soltadas = new Set(
    [...SQL.matchAll(/drop table if exists public\.(\w+)/g)].map((m) => m[1]));
  for (const t of soltadas) conDueno.delete(t);

  ok(conDueno.size > 15, `el esquema tiene ${conDueno.size} tablas con dueño vivas`,
     'si salen cuatro, el troceo del SQL no está mirando lo que cree');
  ok(soltadas.size > 0, `y ${soltadas.size} que una migración suelta`,
     'si sale 0, el patrón del `drop table` cambió y esta resta no está ' +
     'restando nada — con lo que una tabla muerta volvería a exigirse');

  const exportadas = new Set(TABLAS.map((x) => x.t));
  const fuera = new Set(FUERA);
  const olvidadas = [...conDueno].filter((t) => !exportadas.has(t) && !fuera.has(t));
  ok(olvidadas.length === 0,
     'y todas están exportadas o excluidas a propósito',
     'sin decidir: ' + olvidadas.join(', ') +
     '\n         si es suya, va a TABLAS_MIAS; si no, a NO_SON_MIOS con su ' +
     'motivo. Lo que no vale es que no esté en ninguna');

  // Y al revés: no exportar una tabla que ya no existe.
  const inventadas = [...exportadas].filter((t) => !conDueno.has(t) && t !== 'profiles');
  ok(inventadas.length === 0, 'y no se pide ninguna que no exista',
     'se piden: ' + inventadas.join(', '));
  ok(exportadas.has('profiles'), 'y el perfil entra, que va por `id` y no por `user_id`');
}

// ------------------------------------------------------------------
console.log('\nY SOLO LAS SUYAS');
{
  const e = sinComentarios(sacar('function exportarMisDatos('));
  const b = sinComentarios(sacar('function bajarTabla('));

  ok(/columna \+ '=eq\.' \+ id/.test(b),
     'cada tabla se filtra por su columna',
     'RLS filtra, pero un entrenador ve a sus clientes y el super admin lo ' +
     've TODO: sin filtro, «descargar mis datos» le baja la base entera');
  ok(!/select=\*'\s*\+\s*'&limit/.test(b) || /=eq\./.test(b),
     'y no hay un `select=*` suelto sin filtro');

  for (const x of TABLAS) {
    ok(x.por === 'user_id' || x.por === 'cliente_id' || x.por === 'id',
       `«${x.t}» se filtra por \`${x.por}\``,
       'una columna que no identifica a la persona no filtra nada');
  }

  ok(/sesion\.user\.id/.test(e), 'y el dueño es el de la sesión',
     'no un id que venga de ningún otro sitio');
}

// ------------------------------------------------------------------
console.log('\nY ENTERAS, no las primeras mil');
{
  const b = sinComentarios(sacar('function bajarTabla('));
  ok(/limit=' \+ paso/.test(b) && /offset=' \+ desde/.test(b),
     'se pide por tramos');
  ok(/lote\.length < paso \? filas : tramo\(desde \+ paso\)/.test(b),
     'y se sigue pidiendo mientras vengan llenos',
     'justo mil puede ser el final o puede haber más: hay que preguntar. ' +
     'Parar ahí deja un respaldo a medias que se cree completo');
}

// ------------------------------------------------------------------
console.log('\nY lo que falte se dice DENTRO del archivo');
{
  const e = sinComentarios(sacar('function exportarMisDatos('));
  ok(/no_incluye/.test(e), 'el archivo dice lo que no lleva',
     'quien lo abra dentro de dos años no va a tener esta conversación a mano');
  ok(/fotos:/.test(e), 'las fotos, que son archivos y van aparte');
  ok(/error: 'No se pudo leer: '/.test(e),
     'y una tabla que falló queda marcada en su sitio',
     'un respaldo al que le falta algo EN SILENCIO es justo lo que no se ' +
     'puede permitir aquí');
  ok(/exportado_en/.test(e) && /version_app/.test(e),
     'con la fecha y la versión de la app',
     'un archivo sin fecha no se sabe si es el bueno o el de hace un año');
}

// ------------------------------------------------------------------
console.log('\nY se descarga de verdad');
{
  const g = sinComentarios(sacar('function guardarArchivo('));
  ok(/new Blob\(/.test(g) && /a\.download = nombre/.test(g), 'se baja como archivo');
  ok(/setTimeout\(function\(\)\{ URL\.revokeObjectURL/.test(g),
     'y la URL se suelta DESPUÉS, no en el mismo turno',
     'Safari no ha empezado la descarga cuando acaba el turno: revocarla ' +
     'ahí la cancela y no baja nada');

  const i = APP.indexOf("document.getElementById('profExportarBtn')");
  const h = sinComentarios(APP.slice(i, APP.indexOf('})();', i)));
  ok(/if\(bajando\) return;/.test(h), 'y dos toques seguidos no la piden dos veces',
     'son veintitantas consultas: dos a la vez es el doble por nada');
  ok(/Preparando/.test(h), 'y mientras tanto se dice que está en marcha');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

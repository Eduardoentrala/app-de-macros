// La app no tenía forma de decir que algo le salió mal — y tres cosas más
// que se arreglaron encima del mismo sitio.
//
// 1. APUNTAR FALLOS. Todos los bugs de esta app se encontraron igual:
//    alguien mirando su teléfono y diciéndolo. Esto les da dónde salir. Y
//    como se llama desde dentro de un `catch` —el peor momento posible—
//    tiene tres obligaciones que aquí se EJECUTAN, no se leen: no puede
//    fallar hacia fuera, no puede repetir, y no puede llevar datos de nadie.
//
// 2. LA FOTO QUE SE PERDÍA. Reemplazarla eran dos viajes —borrar la ficha
//    de la vieja, meter la de la nueva— sin nada entre medias. Ahora es una
//    función de la base, y la transacción hace que sean uno.
//
// 3. LOS DÍAS DE GIMNASIO. Se podían poner una vez, al registrarse, y nunca
//    más. Y al poder cambiarlos aparece el peligro de siempre: que
//    cambiarlos recalcule los macros desde la fórmula y tire meses de
//    ajuste del cierre. No lo hacen, y eso se fija aquí.
//
// 4. EL CUMPLEAÑOS. La app no dice cuándo es: lo dice la base.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nApuntar un fallo no puede romper nada, y se ejecuta para verlo');
{
  // La función de verdad, con dobles alrededor. Lo que se mira es qué le
  // llega a la base y qué devuelve, no cómo está escrita.
  function montar(opciones) {
    const o = opciones || {};
    const llamadas = [];
    const sbRpc = (nombre, args) => {
      llamadas.push({ nombre, args });
      return o.rpcFalla
        ? { ['catch']: (f) => { f(new Error('se cayó')); return { then: () => {} }; } }
        : { ['catch']: () => ({ then: () => {} }) };
    };
    const fn = new Function(
      'sesion', 'sbRpc', 'window', 'Promise', 'String',
      sacar('function apuntarFallo(donde, e){') +
      '; var FALLOS_DICHOS = {}; return { apuntarFallo: apuntarFallo, llamadas: ' +
      'arguments[5] };'
    );
    // `FALLOS_DICHOS` vive fuera de la función en el fichero, así que se
    // declara aquí con ella para que el borrado entre aperturas se note.
    const cuerpo = sacar('function apuntarFallo(donde, e){');
    const hecho = new Function('sesion', 'sbRpc', 'window',
      'var FALLOS_DICHOS = {};' + cuerpo + '; return apuntarFallo;')(
      o.sinSesion ? null : { user: { id: 'u1' } },
      sbRpc,
      { SELLO_APP: o.sello === undefined ? 'abc123' : o.sello });
    return { apuntar: hecho, llamadas };
  }

  {
    const { apuntar, llamadas } = montar();
    apuntar('guardar_sesion', new Error('Failed to fetch'));
    ok(llamadas.length === 1, 'se apunta el fallo', JSON.stringify(llamadas));
    ok(llamadas[0]?.nombre === 'apuntar_error', 'por la función de la base');
    ok(llamadas[0]?.args.p_donde === 'guardar_sesion', 'con el sitio');
    ok(llamadas[0]?.args.p_que === 'Failed to fetch', 'con el mensaje');
    ok(llamadas[0]?.args.p_version === 'abc123', 'y con la versión de la app',
       'sin ella, «eso ya lo arreglé» no se puede comprobar');
  }

  {
    // NO REPITE. Una pantalla que repinta en bucle gastaría el tope de 50
    // al día de la base en una sola tarde, y justo el día del fallo gordo.
    const { apuntar, llamadas } = montar();
    for (let i = 0; i < 20; i++) apuntar('bucle', new Error('lo mismo'));
    ok(llamadas.length === 1, 'veinte iguales son una sola', 'fueron ' + llamadas.length);

    apuntar('bucle', new Error('otra cosa'));
    ok(llamadas.length === 2, 'pero otro mensaje distinto sí se apunta');
    apuntar('otro_sitio', new Error('lo mismo'));
    ok(llamadas.length === 3, 'y el mismo mensaje en otro sitio también');
  }

  {
    // NO PUEDE FALLAR HACIA FUERA. Esto corre dentro de un `catch`: si
    // revienta, rompe por encima lo que ya estaba fallando por debajo.
    const { apuntar } = montar();
    for (const malo of [null, undefined, 'una cadena', 42, {}, new Error()]) {
      let reventó = false;
      try { apuntar('raro', malo); } catch { reventó = true; }
      ok(!reventó, `con ${JSON.stringify(malo) ?? 'undefined'} no revienta`);
    }

    const sin = montar({ sinSesion: true });
    let reventó = false;
    try { sin.apuntar('x', new Error('y')); } catch { reventó = true; }
    ok(!reventó && sin.llamadas.length === 0,
       'y sin sesión no viaja nada', 'la base lo rechazaría igual');

    const cae = montar({ rpcFalla: true });
    let reventó2 = false;
    try { cae.apuntar('x', new Error('y')); } catch { reventó2 = true; }
    ok(!reventó2, 'y si la propia llamada falla, tampoco');
  }

  {
    // NO LLEVA DATOS DE NADIE. Un registro de fallos que acaba guardando
    // datos personales es un problema nuevo, no una herramienta.
    const { apuntar, llamadas } = montar();
    apuntar('x', new Error('y'.repeat(900)));
    const a = llamadas[0].args;
    ok(Object.keys(a).sort().join(',') === 'p_donde,p_que,p_version',
       'solo van tres cosas: dónde, qué y la versión', JSON.stringify(Object.keys(a)));
    ok(a.p_que.length === 300, 'y el mensaje va recortado', 'mide ' + a.p_que.length);
  }
}

// ------------------------------------------------------------------
console.log('\nY se apunta donde el silencio costaba algo');
{
  const APPSC = sinComentarios(APP);
  for (const [sitio, por] of [
    ['guardar_sesion', 'el candado que dejó el botón muerto semanas'],
    ['perfil_peso', 'un peso que no sube y su entrenador ve uno viejo'],
    ['reemplazar_foto', 'una foto que no se vuelve a tomar'],
    ['cumple', 'quedarse sin su felicitación y que no se entere nadie'],
  ]) {
    ok(APPSC.includes(`apuntarFallo('${sitio}'`), sitio + ' — ' + por);
  }

  // Y NO en los sondeos de localStorage, que callan a propósito y bien.
  ok(!/try\{[^}]*localStorage[^}]*\}catch\(\w*\)\{\s*apuntarFallo/.test(APPSC),
     'y no en los sondeos de `localStorage`',
     'esos callan a propósito: en modo privado fallan siempre y llenarían ' +
     'la tabla de ruido el primer día');
}

// ------------------------------------------------------------------
console.log('\nLa foto se reemplaza de una pieza');
{
  const f = sinComentarios(sacar('function sbSubirFoto('));
  ok(/sbRpc\('reemplazar_foto'/.test(f), 'se llama a la función de la base');
  ok(!/method:\s*'DELETE'/.test(f), 'y ya no hay un DELETE suelto',
     'el DELETE y el INSERT por separado dejaban el hueco vacío entre medias');
  ok(!/progress_photos'/.test(f.replace(/sbRpc[\s\S]*/, '')) ||
     !/method:'POST', headers:\{ 'Prefer'/.test(f),
     'ni un INSERT suelto después');
  ok(!/user_id: sesion\.user\.id/.test(f),
     'y el dueño lo pone la base, no este navegador',
     '`auth.uid()` dentro de la función: por parámetro, cambiar una cadena ' +
     'tocaría las fotos de otro');
  ok(!APP.includes('laAnteriorSeAparto'),
     'y el caso «la vieja quedó apartada» ya no existe',
     'era la marca que distinguía el fallo a medias; sin medias, sobra');
}

// ------------------------------------------------------------------
console.log('\nLos días de gimnasio se pueden cambiar — SIN recalcular');
{
  ok(/id="profDiasBtn"/.test(HTML), 'hay dónde cambiarlos en Perfil',
     'vivían solo en la pantalla de registro: se ponían una vez y nunca más');
  const g = sinComentarios(APP.slice(
    APP.indexOf("document.getElementById('diasGuardar')"),
    APP.indexOf("// ---- El cumpleaños ----")));
  ok(/dias_entreno: d/.test(g), 'se guardan en el perfil');
  ok(!/calcularMacros\(\)|actualizarMetas\(\)/.test(g),
     'Y NO SE RECALCULAN LOS MACROS',
     'la fórmula del registro es un punto de partida; lo que decide las ' +
     'calorías es el gasto medido. Recalcular aquí tiraría de un toque lo ' +
     'que el cierre lleva meses ajustando — el mismo fallo que tenía el ' +
     'botón del objetivo');
  ok(/reg\.dias = d/.test(g), 'pero `reg` se entera, por si alguien recalcula luego');
}

// ------------------------------------------------------------------
console.log('\nY del cumpleaños, la app no dice cuándo es');
{
  const r = sinComentarios(sacar('function revisarCumple(){'));
  ok(/accion: 'cumple'/.test(r), 'solo pregunta si hay algo para ella');
  ok(!/nacimiento/.test(r.replace(/MI_PERFIL\.nacimiento/g, '')),
     'y no manda la fecha',
     'esta llamada no gasta tope diario: si el cliente dijera qué día es, ' +
     'sería una llamada al modelo gratis y sin freno');
  ok(/MI_PERFIL\.nacimiento/.test(r), 'pero si no hay fecha ni pregunta',
     'ponerla es opcional de verdad: no se insiste');

  ok(/id="cumpleQuitar"/.test(HTML), 'y se puede quitar',
     'poner trabas para retirar un dato es la forma educada de no dejarlo');
  const p = sinComentarios(sacar('function pintarCumplePerfil(){'));
  ok(!/new Date\(/.test(p), 'y la fecha se pinta sin `new Date`',
     'una fecha suelta se interpreta en UTC y en México sale el día de antes');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

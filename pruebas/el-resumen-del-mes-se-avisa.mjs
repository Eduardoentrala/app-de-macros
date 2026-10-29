// «Tu mes en fotos» se escribía una vez al mes y nadie se enteraba.
//
// La tarjeta va plegada, con su título y su fecha en gris, y se ve
// EXACTAMENTE IGUAL con el texto de octubre que con el de noviembre. Para
// saber que había uno nuevo había que entrar a Fotos, abrirla y leer la
// fecha. Es decir: no había forma de saberlo, y un texto que se escribe
// una vez al mes y no se lee es una llamada a la IA tirada.
//
// Ahora hay tres cosas, y las tres se apagan solas al abrirlo: la etiqueta
// «Nuevo», una raya verde al lado de la tarjeta, y un punto en la pestaña
// de Fotos —que es el único que se ve desde fuera, y por eso es el que de
// verdad avisa—.
//
// LO DELICADO ES CUÁNDO CALLARSE. Un aviso que no se puede apagar es peor
// que no avisar:
//
//   · Si no hay análisis, no hay nada que avisar.
//   · Si localStorage no se puede leer -ventana privada, almacenamiento
//     bloqueado-, NO se avisa: ahí el «Nuevo» no se apagaría nunca.
//   · Y la marca lleva dentro el id de quien lo leyó. Sin eso, entrar con
//     otra cuenta en el mismo teléfono enseñaría como visto algo que esa
//     persona no ha visto.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8').replace(/\r\n/g, '\n');
const APP = leer('docs/app.js');
const HTML = leer('docs/index.html');
const CSS = ['base', 'diario', 'pantallas'].map((h) => leer('docs/estilos/' + h + '.css')).join('\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// Una función entera, contando llaves.
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

// Un almacén de mentira, con la opción de que reviente como en una ventana
// privada de verdad.
const almacen = (dentro, revienta) => ({
  getItem(k) { if (revienta) throw new Error('bloqueado'); return k in dentro ? dentro[k] : null; },
  setItem(k, v) { if (revienta) throw new Error('bloqueado'); dentro[k] = v; },
});

// EJECUTADO, no buscado: las dos funciones del código, con su contexto.
const FUENTE = sacar('function marcaDeVisto(){') + '\n' + sacar('function analisisSinLeer(){');
const montar = (ANALISIS, sesion, guardado, revienta) =>
  new Function('ANALISIS', 'sesion', 'localStorage', 'CLAVE_VISTO',
    FUENTE + '\nreturn { marca: marcaDeVisto, sinLeer: analisisSinLeer };'
  )(ANALISIS, sesion, almacen(guardado, revienta), 'clave');

const YO = { user: { id: 'u-1' } };
const OCTUBRE = { mes: '2026-10', mensaje: 'Sin cambios que valgan.' };

// ------------------------------------------------------------------
console.log('\nLa marca dice QUIÉN lo leyó y CUÁL leyó');
{
  const a = montar(OCTUBRE, YO, {});
  ok(a.marca() === 'u-1:2026-10', 'las dos cosas, juntas',
     'salió «' + a.marca() + '»: sin el id, entrar con otra cuenta en el ' +
     'mismo teléfono enseña como visto algo que esa persona no ha visto; ' +
     'sin el mes, el de noviembre sale como leído por haber leído el de octubre');
}

console.log('\nY avisa justo cuando hay algo sin leer');
{
  ok(montar(OCTUBRE, YO, {}).sinLeer() === true,
     'sin marca ninguna, avisa');
  ok(montar(OCTUBRE, YO, { clave: 'u-1:2026-10' }).sinLeer() === false,
     'con la suya puesta, se calla');
  ok(montar(OCTUBRE, YO, { clave: 'u-1:2026-09' }).sinLeer() === true,
     'con la del mes pasado, vuelve a avisar',
     'es un texto nuevo: septiembre leído no dice nada de octubre');
  ok(montar(OCTUBRE, { user: { id: 'u-2' } }, { clave: 'u-1:2026-10' }).sinLeer() === true,
     'y con la de OTRA persona, avisa igual',
     'dos cuentas en el mismo teléfono no comparten lo leído');
}

console.log('\nY se calla cuando no hay nada que decir');
{
  ok(montar(null, YO, {}).sinLeer() === false, 'sin análisis, nada');
  ok(montar({ mes: '2026-10' }, YO, {}).sinLeer() === false,
     'con una fila sin texto, tampoco',
     'la tarjeta ni se enseña, así que un punto en la pestaña mandaría a ' +
     'una pantalla donde no hay nada que abrir');
  ok(montar({ mensaje: 'algo' }, YO, {}).sinLeer() === false,
     'y sin mes, tampoco',
     'sin mes la marca no distingue uno de otro: el «Nuevo» no se apagaría');
  ok(montar(OCTUBRE, YO, {}, true).sinLeer() === false,
     'y si el almacén revienta, NO avisa',
     'ventana privada o almacenamiento bloqueado: ahí guardar «ya lo leí» ' +
     'tampoco funciona, así que el aviso se quedaría encendido para siempre');
}

// ------------------------------------------------------------------
console.log('\nLa tarjeta dice cuándo toca el siguiente');
{
  // El trozo de verdad, entre dos marcas que son código.
  const i = APP.indexOf("    var siguiente = '';");
  const f = APP.indexOf('    }', APP.indexOf('primera vez que abras la app ese mes', i));
  ok(i > 0 && f > i, 'se encuentra el cálculo', `${i}..${f}`);
  const trozo = APP.slice(i, f + 5);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const correr = (m) => new Function('m', 'MESES_LARGO', trozo + '\nreturn siguiente;')(m, MESES);

  const oct = correr(['2026-10', '2026', '10']);
  ok(/noviembre/.test(oct), 'después de octubre, noviembre', 'salió: ' + oct);
  ok(/primera vez que abras la app/.test(oct), 'y dice qué lo dispara',
     '«una vez al mes» da el ritmo pero no la fecha; esto dice que sale solo ' +
     'al abrir la app el mes que viene, que es lo que de verdad hace el código');

  // Diciembre es el caso que se olvida: 12 + 1 = 13 y MESES_LARGO[12] no existe.
  const dic = correr(['2026-12', '2026', '12']);
  ok(/enero/.test(dic), 'y después de diciembre, enero', 'salió: ' + dic);
  ok(!/undefined|NaN/.test(dic), 'sin undefined de por medio', 'salió: ' + dic);

  ok(correr(null) === '', 'y con un mes que no se entiende, no se inventa nada',
     'salió: ' + JSON.stringify(correr(null)));
}

// ------------------------------------------------------------------
console.log('\nAbrirla ES haberla leído');
{
  const f = sacar("    var caja = document.getElementById('analisisCard');\n    if(caja) caja.addEventListener('toggle'");
  ok(/caja\.open/.test(f) && /darPorLeido\(\)/.test(f),
     'se da por leída al abrirla',
     'y no con un botón de «marcar como leído»: serían dos gestos para lo ' +
     'que uno ya dice');
  ok(/if\(caja\.open\) darPorLeido/.test(f),
     'y solo al ABRIRLA, no al cerrarla',
     '`toggle` salta en los dos sentidos; sin la condición, cerrarla sin ' +
     'leerla también la daría por leída');

  const d = sacar('function darPorLeido(){');
  ok(/setItem\(CLAVE_VISTO, marcaDeVisto\(\)\)/.test(d), 'y se guarda la marca');
  ok(/pintarAvisoDeAnalisis\(\)/.test(d), 'y se apagan los avisos en el momento',
     'sin esto el punto se queda encendido hasta que se recargue la app');
}

console.log('\nY los tres avisos se encienden y se apagan juntos');
{
  const f = sacar('function pintarAvisoDeAnalisis(){');
  ok(/analisisNuevo/.test(f), 'la etiqueta «Nuevo»');
  ok(/classList\.toggle\('sin-leer'/.test(f), 'la raya de la tarjeta');
  ok(/\[data-tabbar="fotos"\]/.test(f) && /con-aviso/.test(f),
     'y el punto de la pestaña de Fotos',
     'es el ÚNICO que se ve sin entrar a Fotos: sin él el aviso vive dentro ' +
     'de la pantalla a la que hay que entrar para verlo');
  ok(/querySelectorAll/.test(f) && /for\(/.test(f),
     'y en las TRES barras, no solo en una',
     'la barra de abajo está escrita tres veces, una por pantalla: con ' +
     'querySelector a secas el punto solo sale en la primera');
  ok(/var hay = analisisSinLeer\(\)/.test(f), 'y las tres miran lo mismo');
}

// ------------------------------------------------------------------
console.log('\nY el HTML y el CSS lo sostienen');
{
  ok(/id="analisisNuevo" hidden/.test(HTML), 'la etiqueta nace escondida',
     'si naciera visible se vería un «Nuevo» en el primer pintado de todo el ' +
     'mundo, antes de saber si hay algo');
  const tag = CSS.match(/\.nuevo-tag\{([^}]*)\}/);
  ok(tag && /var\(--green\)/.test(tag[1]), 'y es verde',
     'verde es «esto está bien» en esta app, no «esto urge»: no es una ' +
     'alarma, es algo que hay para leer');
  const raya = CSS.match(/\.analisis-card\.sin-leer\{([^}]*)\}/);
  ok(raya && /var\(--green\)/.test(raya[1]), 'la raya de la tarjeta también');
  const punto = CSS.match(/\.bottom-tabs button\.con-aviso::after\{([^}]*)\}/);
  ok(punto && /content/.test(punto[1]) && /var\(--green\)/.test(punto[1]),
     'y el punto de la pestaña');
  ok(punto && /position:absolute/.test(punto[1]), 'colgado del botón');
  const boton = CSS.match(/\.bottom-tabs button\{([^}]*)\}/);
  ok(boton && /position:relative/.test(boton[1]),
     'y el botón es su origen de coordenadas',
     'sin esto el punto se cuelga del primer padre colocado que encuentre y ' +
     'acaba en una esquina de la pantalla');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

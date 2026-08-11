// Las notas por ejercicio, ahora guardadas de verdad.
//
// Vivían en `var NOTAS = {}` y nada más: escribías "banco en el hoyo 3",
// cerrabas la app y no volvías a verlo. La tabla `exercise_notes` existía
// desde la migración 0001, vacía, esperando. Esto la conecta.
//
// Lo que se comprueba aquí no es que guarde -eso se ve en el navegador-,
// sino las cuatro formas de que esto salga mal sin dar la cara:
//   1. leer sin filtrar por usuario, y enseñar notas de otro
//   2. guardar sin `on_conflict`, y romperse la segunda vez que escribes
//   3. borrar solo de la pantalla, y que la nota vuelva al recargar
//   4. dar por guardado lo que falló, y que nadie la vuelva a escribir
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Se leen, y solo las tuyas —');
{
  const i = APP.indexOf('function cargarNotas(');
  const trozo = i > 0 ? APP.slice(i, i + 900) : '';
  check('existe la carga', i > 0);
  check('pide la tabla de notas', /rest\/v1\/exercise_notes\?select=exercise_name,body/.test(trozo));
  // RLS dice lo que PUEDES ver y un coach ve a sus clientes: sin esto, sus
  // notas saldrían marcadas en la rutina propia.
  check('filtra por usuario', /user_id=eq\.' \+ sesion\.user\.id/.test(trozo), trozo.slice(0, 250));
  check('sin sesión no pide nada', /if\(!sesion \|\| !sesion\.user\) return Promise\.resolve\(\)/.test(trozo));
  // Una nota vacía en la base no es una nota: no debe marcar la tarjeta.
  check('las vacías no cuentan', /if\(f\.body && f\.body\.trim\(\)\)/.test(trozo));
  check('y al llegar marca las tarjetas', /marcarTodasLasNotas\(\)/.test(trozo));
}

console.log('\n— Se cargan cuando las tarjetas ya existen —');
{
  // Si fueran dentro del Promise.all de la rutina, marcarTodasLasNotas()
  // correría sobre una lista vacía y no se marcaría ninguna.
  const i = APP.indexOf('function sbCargarRutina(');
  const trozo = APP.slice(i, i + 3000);
  // Sin exigir el punto y coma: detrás va encadenado `.then(ponerReferencias)`,
  // que repone contra qué se compara el volumen.
  check('van encadenadas al final de la carga de rutina',
    /\.then\(cargarNotas\)/.test(trozo));
  check('y no dentro del Promise.all',
    !/Promise\.all\(\[[^\]]*exercise_notes/s.test(trozo));
}

console.log('\n— Se guardan sin duplicarse —');
{
  const i = APP.indexOf('function guardarNota(');
  const trozo = i > 0 ? APP.slice(i, i + 800) : '';
  check('existe el guardado', i > 0);
  // La tabla tiene unique(user_id, exercise_name). Sin on_conflict, la
  // segunda vez que escribes una nota del mismo ejercicio da error.
  check('pisa la anterior en vez de duplicar',
    /on_conflict=user_id,exercise_name/.test(trozo), trozo.slice(0, 250));
  check('y lo pide en la cabecera', /resolution=merge-duplicates/.test(trozo));
  check('manda de quién es', /user_id: sesion\.user\.id/.test(trozo));
}

console.log('\n— Y se borran de verdad —');
{
  const i = APP.indexOf('function borrarNota(');
  const trozo = i > 0 ? APP.slice(i, i + 600) : '';
  check('existe el borrado', i > 0);
  check('borra en la base, no solo en pantalla', /method: 'DELETE'/.test(trozo));
  check('solo la tuya y solo ese ejercicio',
    /user_id=eq\.' \+ sesion\.user\.id/.test(trozo) && /exercise_name=eq\./.test(trozo));
  // Un nombre con espacios o acentos rompe la URL si no se codifica.
  check('el nombre va codificado', /encodeURIComponent\(nombre\)/.test(trozo));

  // Se busca el MANEJADOR, no la primera vez que se nombra el botón: desde
  // que abrirNotas() lo muestra u oculta, un indexOf a secas encuentra esa
  // línea y no la que interesa.
  const j = APP.indexOf("document.getElementById('notasBorrar').addEventListener");
  const borrar = APP.slice(j, j + 500);
  check('el botón tiene manejador', j > 0);
  check('el botón de borrar pasa por aplicarNota', /aplicarNota\(nombreNotas, '', cardNotas\)/.test(borrar));

  // Y que aplicarNota llegue de verdad a la base. Esto se añadió porque
  // faltaba: al probar la regresión, quitar la llamada a borrarNota() no
  // hacía fallar nada. El borrado podía quedarse en la pantalla y la nota
  // reaparecer al recargar, sin que ninguna prueba se enterara.
  const iAplicar = APP.indexOf('function aplicarNota(');
  check('y aplicarNota borra en la base cuando el texto va vacío',
    /var p = texto \? guardarNota\(nombre, texto\) : borrarNota\(nombre\);/.test(APP.slice(iAplicar, iAplicar + 800)),
    'el camino de borrado no llama a borrarNota()');
  // Guardar con el campo vacío también borra: es lo que espera quien
  // selecciona todo y le da a suprimir.
  const k = APP.indexOf("document.getElementById('notasGuardar')");
  check('guardar en vacío también borra',
    /aplicarNota\(nombreNotas, document\.getElementById\('notasTexto'\)\.value\.trim\(\)/.test(APP.slice(k, k + 400)));
}

console.log('\n— Si falla el guardado, se deshace —');
{
  const i = APP.indexOf('function aplicarNota(');
  const trozo = APP.slice(i, i + 1000);
  check('existe el deshacer', i > 0);
  check('se acuerda de lo que había', /var antes = NOTAS\[nombre\];/.test(trozo));
  // Enseñar como guardada una nota que no está es peor que no guardarla:
  // nadie la vuelve a escribir.
  check('lo devuelve al fallar',
    /if\(antes === undefined\) delete NOTAS\[nombre\]; else NOTAS\[nombre\] = antes;/.test(trozo));
  check('y lo dice', /No se pudo guardar la nota/.test(trozo));
  check('vuelve a marcar la tarjeta al deshacer',
    (trozo.match(/marcaNotas\(card, nombre\)/g) || []).length >= 2);
}

console.log('\n— Se ve que hay nota sin abrirla —');
{
  check('la tarjeta lleva un adelanto', /class="nota-previa"/.test(APP));
  check('en las dos plantillas de tarjeta',
    (APP.match(/class=\\?"nota-previa\\?"/g) || []).length >= 2);
  const i = APP.indexOf('function marcaNotas(');
  const trozo = APP.slice(i, i + 700);
  check('el adelanto enseña lo escrito', /previa\.textContent = tiene \? NOTAS\[nombre\]/.test(trozo));
  // En una línea: es un recordatorio de un vistazo, no la nota entera.
  check('los saltos de línea no rompen la fila', /replace\(\/\\s\+\/g, ' '\)/.test(trozo));
  check('se esconde cuando no hay nota', /previa\.hidden = !tiene/.test(trozo));
  check('una sola línea con puntos suspensivos',
    /\.nota-previa\{[^}]*text-overflow:ellipsis/s.test(CSS));
  check('en una línea', /\.nota-previa\{[^}]*white-space:nowrap/s.test(CSS));
  // Sin esto no hay puntos suspensivos que valgan: un elemento flex trae
  // `min-width:auto` y se niega a encoger por debajo de su contenido. La
  // columna del nombre se estiraba a 413px dentro de una tarjeta de 335, la
  // nota se salía cortada en seco, y de paso empujaba fuera la columna del
  // volumen. Se vio en el navegador, no leyendo el CSS.
  check('la columna del nombre puede encogerse',
    /\.ex-top > div:first-child\{min-width:0;\}/.test(CSS),
    'sin min-width:0 la nota se sale de la tarjeta y empuja el volumen');
  // La marca de siempre sigue: el adelanto la acompaña, no la sustituye.
  check('sigue la marca 📝', /nota-badge/.test(APP));
  check('y la píldora se resalta', /pill\.classList\.toggle\('con-nota', tiene\)/.test(APP));
}

console.log('\n— Se puede eliminar desde dentro de la nota —');
{
  // Ya existía el botón, pero iba como texto gris debajo del botón negro de
  // guardar y no se veía. Ahora va rojo y con marco, igual que «Borrar día»,
  // que es lo otro de la app que no se deshace.
  check('el botón dice lo que hace', /id="notasBorrar"[^>]*>Eliminar esta nota</s.test(HTML) ||
    /Eliminar esta nota/.test(HTML));
  check('va marcado como algo que no se deshace',
    /id="notasBorrar"[^>]*class="[^"]*btn-delete-day|class="[^"]*btn-delete-day[^"]*"[^>]*id="notasBorrar"/.test(HTML),
    'debería llevar la clase roja de «Borrar día»');
  // Y que esa clase sea de verdad la roja.
  check('esa clase es la roja',
    /\.btn-delete-day\{[^}]*color:var\(--red\)/s.test(
      readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8')));

  // Sólo cuando hay algo que borrar: en una nota que aún no existe, un botón
  // de borrar no borra nada y hace dudar de si se escribió algo.
  check('empieza oculto', /id="notasBorrar"[^>]*\shidden/.test(HTML));
  const i = APP.indexOf('function abrirNotas(');
  const abrir = APP.slice(i, i + 900);
  check('se muestra solo si hay nota guardada',
    /var hayNota = !!\(NOTAS\[nombre\] && NOTAS\[nombre\]\.trim\(\)\);/.test(abrir) &&
    /notasBorrar'\)\.hidden = !hayNota/.test(abrir));
  check('y el aviso lo acompaña', /notasAviso'\)\.hidden = !hayNota/.test(abrir));

  // El aviso dice justo lo que preguntaba: que no vuelve al reabrir la app.
  check('el aviso dice que es para siempre',
    /no volverá\s*\n?\s*a aparecer la marca, ni al cerrar y abrir la app/.test(HTML) ||
    /ni al cerrar y abrir la app/.test(HTML));

  // Cerrar sin tocar nada. Antes solo se podía tocando fuera de la hoja, que
  // en un teléfono es un blanco pequeño y con el teclado abierto casi no hay.
  check('hay forma de salir sin borrar', /id="notasCerrar"/.test(HTML));
  check('y cierra la hoja',
    /getElementById\('notasCerrar'\)\.addEventListener\('click', function\(\)\{[\s\S]{0,140}notasSheet'\)\.classList\.remove\('open'\)/.test(APP));
}

console.log('\n— La hoja sigue donde estaba —');
{
  check('existe la hoja', /id="notasSheet"/.test(HTML));
  check('con su texto', /id="notasTexto"/.test(HTML));
  check('guardar y borrar', /id="notasGuardar"/.test(HTML) && /id="notasBorrar"/.test(HTML));
  check('el campo no dispara el zoom de iOS',
    /\.notas-input\{[^}]*font:500 16px/s.test(readFileSync(join(RAIZ, 'docs', 'estilos', 'diario.css'), 'utf8')));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

// Hasta cuatro fotos por mensaje al asistente.
//
// Antes era UNA. Apuntar un plato del que hacen falta dos angulos —o una
// comida de varios platos— obligaba a mandarlas de una en una, y cada envio
// gasta una consulta del tope diario.
//
// LO QUE MAS IMPORTA DE ESTO no es el numero cuatro: es que la app y la
// funcion se despliegan POR SEPARADO —GitHub Pages y Supabase—, y entre un
// despliegue y el otro hay minutos en que una version le habla a la otra.
// Si la app mandara solo `imagenes` y la funcion desplegada aun entendiera
// solo `imagen`, en esos minutos las fotos dejarian de funcionar sin que
// nadie lo notara. Por eso se mandan LAS DOS FORMAS y por eso la funcion se
// despliega PRIMERO.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let ok = 0, mal = 0;
const check = (n, c, e = '') => {
  if (c) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${e ? '\n        ' + e : ''}`); }
};

console.log('\n— Se pueden elegir varias —');
{
  check('el campo acepta varias', /id="iaArchivo"[^>]*\bmultiple\b/.test(HTML),
    'sin `multiple` el telefono solo deja marcar una');
  check('el tope son cuatro', /TOPE_FOTOS_IA = 4/.test(APP));
  const h = APP.slice(APP.indexOf("getElementById('iaArchivo').addEventListener"),
                      APP.indexOf('// ---- La conversación ----'));
  // En el telefono la camara y la galeria son dos toques distintos: quien
  // hace una foto y luego elige otra espera tener las dos.
  check('se suman a las que ya habia', /TOPE_FOTOS_IA - IA_FOTOS\.length/.test(h));
  check('y por encima del tope se avisa en vez de callar',
    /Solo caben ' \+ TOPE_FOTOS_IA/.test(h));
  // Reducir cuatro a la vez las descomprime todas en memoria al mismo
  // tiempo, y ahi es donde la pestaña se muere sin decir nada.
  check('se reducen de una en una', /\.reduce\(function\(cadena, archivo\)/.test(h),
    'todas a la vez tumban el navegador en un telefono modesto');
}

console.log('\n— Se ven y se pueden quitar —');
{
  const p = APP.slice(APP.indexOf('function pintarFotoIA('), APP.indexOf("document.getElementById('iaTomarFoto')"));
  check('se pintan todas', /IA_FOTOS\.map\(function\(f, i\)/.test(p));
  // Quitar la tercera de cuatro tiene que quitar ESA, no la ultima.
  check('cada una lleva su indice', /data-quita-foto="' \+ i \+ '"/.test(p));
  const q = APP.slice(APP.indexOf("getElementById('iaFotoZona').addEventListener"),
                      APP.indexOf("getElementById('iaArchivo').addEventListener"));
  check('y la × quita justo esa', /IA_FOTOS\.splice\(Number\(b\.dataset\.quitaFoto\), 1\)/.test(q));
  check('con una ocupa el ancho, con varias se reparten', /\.ia-fotos\.varias\{/.test(CSS));
  // Cuatro a 190 px empujan el teclado fuera de la pantalla.
  check('y en rejilla se bajan de alto', /\.ia-fotos\.varias \.ia-foto-previa img\{max-height/.test(CSS));
}

console.log('\n— Se mandan las DOS formas —');
{
  const e = APP.slice(APP.indexOf("accion: 'chat'"), APP.indexOf("accion: 'chat'") + 1600);
  check('la lista entera', /imagenes: fotosEnvio\.length/.test(e));
  check('cada una con datos y tipo', /datos: f\.base64, tipo: f\.tipo/.test(e));
  // ESTO ES LO QUE EVITA LA VENTANA ROTA entre los dos despliegues.
  check('y la primera tambien suelta, para la funcion vieja',
    /imagen: fotosEnvio\.length \? fotosEnvio\[0\]\.base64/.test(e),
    'sin esto, entre un despliegue y el otro las fotos no se analizan');
}

console.log('\n— Y la funcion entiende las dos —');
{
  // Desde `const TOPE_FOTOS` y no desde `function leerImagenes`: las dos
  // constantes viven justo encima de la funcion y quedaban fuera del corte.
  const l = FN.slice(FN.indexOf('const TOPE_FOTOS'), FN.indexOf('//  Esquemas de salida'));
  check('lee la lista nueva', /Array\.isArray\(cuerpo\.imagenes\)/.test(l));
  check('y la forma antigua', /typeof cuerpo\.imagen === 'string'/.test(l));
  // Una app que ya manda la lista pone la primera tambien en `imagen`:
  // contarla dos veces la duplicaria en la comida.
  check('si vienen las dos, no la cuenta dos veces', /if \(!crudas\.length && typeof cuerpo\.imagen/.test(l),
    'la forma antigua solo se mira cuando NO vino la lista');
  check('el tope son cuatro tambien en el servidor', /TOPE_FOTOS = 4/.test(l));
  // Cuatro de 7,5 MB pasarian el tope de una en una y sumarian 30.
  check('hay tope por foto y por total', /suma > 16_000_000/.test(l));
  check('y se comprueba el formato de cada una', /TIPOS_FOTO\.includes\(f\.tipo\)/.test(l));

  // Todas en el MISMO mensaje: en mensajes separados el modelo las trata
  // como platos distintos y suma la comida varias veces.
  check('van todas en un solo mensaje', /content: partes as any/.test(FN));
  check('y se le dice que son el mismo plato', /distintos angulos de lo mismo|distintos ángulos de lo mismo/.test(FN),
    'sin eso, cuatro fotos de un plato se cuentan como cuatro platos');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

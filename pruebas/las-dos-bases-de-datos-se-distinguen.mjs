// «Base de datos» eran dos cosas distintas bajo un mismo rótulo.
//
// El catálogo de la app tiene dentro:
//
//   · lo que trae la app: 222 alimentos de USDA, medidos, con su fdc_id,
//     y 18 platillos con su receta;
//   · y 100 que dio de alta él desde el panel, leyendo la etiqueta.
//     «Arroz con leche», «Atún Dolores», «crema alpura».
//
// Los dos sirven —el de la marca a veces sirve más, porque es el que de
// verdad te comes— pero salían mezclados bajo un solo rótulo y no había
// forma de saber cuál estabas eligiendo.
//
// Y debajo de todo eso venía una tercera lista SIN NINGÚN RÓTULO: lo que
// ya llevabas apuntado en esa comida. Al no presentarse heredaba la
// última franja que se leía, así que parecía más base de datos. Él lo
// leyó como «la mía, la que he escrito a mano». No lo era: era su
// desayuno. Esa confusión es el fallo, no el error de quien mira.
//
// Ahora: la de la app arriba, la suya debajo, y la comida no estorba
// mientras buscas.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// Los saltos se normalizan al leer. En Windows el fichero de trabajo
// queda en CRLF —git lo guarda en LF y lo convierte al sacarlo— y
// cualquier ancla de varias líneas deja de encontrarse. No es un
// fallo del código: es la prueba mirando otra cosa.
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
                              '0070_de_quien_es_cada_alimento.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function fn(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  for (let k = APP.indexOf('{', j); k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

// ------------------------------------------------------------------
// SE EJECUTA. Mirando el texto no se distingue un filtro que separa de
// uno que deja pasar todo.
function montar() {
  const sugeridos = { innerHTML: '' };
  const comida = { hidden: false };
  const cuerpo = sinComentarios(fn('function pintarSugerencias('));
  // CADA CASO ARRANCA EN EL ESTADO CONTRARIO AL QUE ESPERA, y eso no es
  // remilgo: las dos comprobaciones de esconder y mostrar se tapan la
  // una a la otra si se arranca siempre igual.
  //
  // Arrancando VISIBLE, «al borrar la búsqueda vuelve» pasaba sola —ya
  // estaba visible— y quitar esa línea de app.js no cambiaba nada.
  // Arrancando ESCONDIDA pasa lo mismo al revés con «buscando se
  // esconde». Las dos mutaciones se escaparon vivas, una en cada
  // intento.
  //
  // Así, ver el estado que se espera solo puede ser cosa del código.
  const correr = (lista, texto, empiezaEscondida) => {
    sugeridos.innerHTML = ''; comida.hidden = !!empiezaEscondida;
    new Function('mealSugeridos', 'document', 'escapar', 'filtrar', 'RECETAS',
      'mil', 'lineaMacros', 'lista', 'texto', 'sinRed',
      cuerpo + '; pintarSugerencias(lista, texto, sinRed);')(
      sugeridos,
      { getElementById: (id) => (id === 'mealList' ? comida : null) },
      (s) => String(s), () => [], [], (n) => String(n),
      (a) => 'P' + a.P, lista, texto, false);
    return { html: sugeridos.innerHTML, comidaEscondida: comida.hidden };
  };
  return correr;
}
const correr = montar();

const DEL_CATALOGO = [
  { fuente: 'catalogo', delaApp: true,  n: 'Atún en agua',       P: 25.5, C: 0, G: 0.8 },
  { fuente: 'catalogo', delaApp: true,  n: 'Chilaquiles verdes', P: 31.9, C: 48.7, G: 27.8 },
  { fuente: 'catalogo', delaApp: false, n: 'Atún Dolores',       P: 24,   C: 0, G: 1 },
];
const GUARDADO = { fuente: 'mio', n: 'Mi batido', P: 30, C: 5, G: 2 };
const DE_GENTE = { fuente: 'gente', n: 'Atún de alguien', P: 20, C: 0, G: 1, personas: 4 };

// Qué nombres caen bajo cada franja, en orden de aparición.
function porFranja(html) {
  const grupos = [];
  const partes = html.split('<div class="sug-franja');
  for (const p of partes.slice(1)) {
    const titulo = (p.match(/^[^>]*>([^<]*)</) || [, ''])[1].trim();
    const nombres = [...p.matchAll(/class="fc-name">([^<]*)</g)].map((m) => m[1]);
    grupos.push({ titulo, nombres });
  }
  return grupos;
}

// ------------------------------------------------------------------
console.log('\nLa de la app y la tuya son dos franjas distintas');
{
  const r = correr([...DEL_CATALOGO, GUARDADO], 'atun');
  const g = porFranja(r.html);
  const titulos = g.map((x) => x.titulo);

  ok(g.length >= 2, 'salen al menos dos franjas', titulos.join(' | '));
  ok(titulos.some((t) => /Base de datos de la app/i.test(t)),
     'una se llama «Base de datos de la app»', titulos.join(' | '));
  ok(titulos.some((t) => /Tus alimentos/i.test(t)),
     'y la otra «Tus alimentos»', titulos.join(' | '));

  const app = g.find((x) => /Base de datos de la app/i.test(x.titulo));
  const tuyos = g.find((x) => /Tus alimentos/i.test(x.titulo));

  ok(app.nombres.includes('Atún en agua') && app.nombres.includes('Chilaquiles verdes'),
     'lo de USDA y los platillos van arriba', JSON.stringify(app.nombres));
  ok(!app.nombres.includes('Atún Dolores'),
     'y lo que diste de alta tú NO va ahí',
     'ese es el fallo entero: mezclados no se sabe cuál eliges. ' +
     JSON.stringify(app.nombres));
  ok(tuyos.nombres.includes('Atún Dolores'),
     'tu atún de marca va en la tuya', JSON.stringify(tuyos.nombres));
  ok(tuyos.nombres.includes('Mi batido'),
     'y tus guardados también, que para ti son lo mismo',
     JSON.stringify(tuyos.nombres));

  // EL ORDEN QUE PIDIÓ: «la base de datos de la aplicación y abajo mi
  // base de datos».
  ok(titulos.indexOf(app.titulo) < titulos.indexOf(tuyos.titulo),
     'y la de la app va ARRIBA de la tuya', titulos.join(' | '));
}

// ------------------------------------------------------------------
console.log('\nY lo que ya apuntaste no estorba mientras buscas');
{
  // Arranca VISIBLE: esconderla solo puede haberlo hecho el código.
  const r = correr([...DEL_CATALOGO], 'atun', false);
  ok(r.comidaEscondida === true,
     'buscando, tu comida se esconde',
     'sin rótulo y pegada a los resultados, parecía otra base de datos');

  // Y estos arrancan ESCONDIDOS: volver a verla, también.
  const vacio = correr([], '', true);
  ok(vacio.comidaEscondida === false,
     'y sin búsqueda vuelve',
     'es donde se edita y se quita lo que llevas apuntado: no puede ' +
     'quedarse escondida');
  const corto = correr([], 'a', true);
  ok(corto.comidaEscondida === false, 'con una sola letra tampoco se esconde');
}

// ------------------------------------------------------------------
console.log('\nY sin la 0070 todo sigue siendo de la app');
{
  // Si la base aún no tiene la migración, la columna llega `undefined`.
  // Ahí el catálogo entero tiene que seguir saliendo como «de la app»,
  // que es como se comportaba antes: un despliegue a medias no puede
  // reetiquetar los alimentos de nadie.
  const viejo = [
    { fuente: 'catalogo', delaApp: undefined !== false, n: 'Atún en agua', P: 25, C: 0, G: 1 },
  ];
  const g = porFranja(correr(viejo, 'atun').html);
  const app = g.find((x) => /Base de datos de la app/i.test(x.titulo));
  ok(app && app.nombres.includes('Atún en agua'),
     'con la columna ausente, el catálogo sale como de la app',
     JSON.stringify(g.map((x) => x.titulo)));

  // LOS TRES CAMINOS, no «que aparezca una vez». El mapeo del catálogo
  // tiene tres salidas —por unidad, por pieza y por gramos— y cada una
  // construye su objeto. Comprobando que la cadena aparezca, cambiar una
  // sola seguía en verde porque las otras dos la mantenían viva. Lo cazó
  // la mutación.
  const caminos = (APP.match(/delaApp: x\.de_la_app !== false/g) || []).length;
  const malos   = (APP.match(/delaApp: x\.de_la_app === true/g) || []).length;
  ok(caminos === 3 && malos === 0,
     'y los tres caminos del mapeo usan `!== false`',
     'con `!== false`: ' + caminos + ' · con `=== true`: ' + malos +
     '\n         con `=== true` un despliegue a medias movería todo el ' +
     'catálogo a «tus alimentos»');
}

// ------------------------------------------------------------------
console.log('\nY la base sabe decir de quién es cada alimento');
{
  ok(/de_la_app boolean/.test(SQL), 'la función devuelve la bandera');
  ok(/\(a\.fdc_id is not null or a\.composicion is not null\) as de_la_app/.test(SQL),
     'y la saca de los datos que ya hay, sin columna nueva',
     'una bandera aparte sería un tercer sitio donde guardar lo mismo, y ' +
     'el tercero siempre acaba diciendo otra cosa');
  ok(/drop function if exists public\.buscar_catalogo\(text, integer\);/.test(SQL),
     'y se suelta antes de recrearla',
     'cambia la lista de columnas que devuelve, y eso Postgres no lo ' +
     'deja reemplazar en caliente');
  ok(/grant\s+execute on function public\.buscar_catalogo\(text, integer\) to authenticated/.test(SQL),
     'y se le devuelve el permiso',
     'soltar la función se lleva sus permisos: sin esto nadie puede buscar');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

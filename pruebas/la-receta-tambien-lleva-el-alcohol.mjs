// El alcohol contaba en el diario y se perdía al pasar por una receta.
//
// Desde la 0073 una cerveza suelta cuenta sus 7 kcal por gramo. Pero
// guardabas esa misma comida como receta y el ingrediente se quedaba con
// tres macros: al volver a apuntarla, la cerveza entraba sin alcohol.
//
// El fallo no desaparecía, se mudaba a la puerta de al lado — que es
// exactamente lo que pasó ya una vez con `buscar_catalogo()`, cuando el
// dato estaba en la tabla, el diario sabía sumarlo, y la función de en
// medio no lo pasaba. Tres sitios distintos, el mismo descuido: el
// alcohol es un macro nuevo y hay que llevarlo por TODOS los tubos.
//
// Aquí se comprueban los tres de las recetas, ejecutándolos:
//
//   · guardar una comida como receta  → el alcohol entra y se manda
//   · escalar un ingrediente          → el alcohol se escala con él
//   · la previa de «se apunta: N cal» → el alcohol se cuenta

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

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

// Un tarro de cerveza: 13,8 g de alcohol son 97 kcal, que es lo que se
// perdía. Y una pechuga al lado, para que se vea que lo demás no cambia.
const CERVEZA = { n: 'Cerveza', u: 'Gramos', cant: 355, P: 1.8, C: 12.8, G: 0, A: 13.8 };
const PECHUGA = { n: 'Pechuga', u: 'Gramos', cant: 200, P: 62, C: 0, G: 7.2 };
const CAL = (m) => m.P * 4 + m.C * 4 + m.G * 9 + (m.A || 0) * 7;

// ------------------------------------------------------------------
console.log('\nGuardar la comida como receta se lleva el alcohol');
{
  let enviado = null;
  const cuerpo = sinComentarios(fn('function guardarComidaComoReceta('));
  new Function(
    'COMIDAS', 'comidaActual', 'sesion', 'toast', 'sbFetch', 'RECETAS',
    'guardarDespensa', 'pintarListas', 'traducirError',
    cuerpo + '; guardarComidaComoReceta("Mi cena");'
  )(
    { Cena: [PECHUGA, CERVEZA] }, 'Cena',
    { user: { id: 'u1' } },
    () => {},
    (_ruta, opc) => { enviado = JSON.parse(opc.body); return Promise.resolve([{ id: 9 }]); },
    [], () => {}, () => {}, (e) => e
  );

  ok(!!enviado, 'se manda la receta al servidor');
  ok(enviado && Number(enviado.alcohol_g) === 13.8,
     'con el alcohol de la comida sumado',
     'mandó alcohol_g = ' + (enviado || {}).alcohol_g + '. `recipes.calories` ' +
     'es una columna generada que lo multiplica por 7: sin mandarlo, la ' +
     'receta se guarda contando 0');

  // Y DENTRO DE CADA INGREDIENTE TAMBIÉN, que es la otra mitad. El total
  // de la fila sirve para enseñar la receta; la `A` de cada ingrediente
  // es lo que vuelve al diario cuando la apuntas.
  const dentro = (enviado && enviado.ingredients) || [];
  const cerv = dentro.filter((x) => x.n === 'Cerveza')[0];
  ok(cerv && Number(cerv.A) === 13.8,
     'y cada ingrediente guarda el suyo',
     'la cerveza fue como ' + JSON.stringify(cerv) + '. Sin su `A`, ' +
     'apuntar la receta devuelve la cerveza sin alcohol');
  const pech = dentro.filter((x) => x.n === 'Pechuga')[0];
  ok(pech && Number(pech.A) === 0, 'y lo que no lleva, cero');
}

// ------------------------------------------------------------------
console.log('\nY media receta lleva medio alcohol');
{
  const cuerpo = sinComentarios(fn('function escalarIngrediente('));
  const escalar = new Function(cuerpo + '; return escalarIngrediente;')();

  const medio = escalar(CERVEZA, 0.5);
  ok(medio.A === 6.9, 'la mitad de 13,8 g es 6,9',
     'salió ' + medio.A + '. Si no se escala, apuntar un tercio de la ' +
     'receta devuelve el alcohol entero o ninguno, y el número no cuadra ' +
     'ni con sus propios ingredientes');
  ok(medio.P === 0.9 && medio.cant === 177.5,
     'y lo demás se mueve con él, como siempre');

  const viejo = escalar({ n: 'De antes', cant: 100, P: 10, C: 20, G: 5 }, 2);
  ok(viejo.A === 0, 'un ingrediente de antes, sin `A`, sale en cero',
     'las recetas guardadas antes de esto no tienen el campo: tienen que ' +
     'seguir contando lo que contaban, no `NaN`');
}

// ------------------------------------------------------------------
console.log('\nY la previa dice lo que de verdad va a entrar');
{
  const pintado = {};
  const el = (id) => (pintado[id] = pintado[id] || { textContent: '', value: '', innerHTML: '', hidden: false });
  const doc = {
    getElementById: el,
    querySelectorAll: () => [],
    activeElement: null
  };
  const cuerpo =
    sinComentarios(fn('function pesoDeReceta(')) + '\n' +
    sinComentarios(fn('function escalarIngrediente(')) + '\n' +
    sinComentarios(fn('function pintarPorcionReceta('));

  new Function(
    'recetaAbierta', 'factorReceta', 'document', 'mil', 'un', 'escapar',
    'textoUnidad',
    cuerpo + '; pintarPorcionReceta();'
  )(
    { n: 'Mi cena', ing: [PECHUGA, CERVEZA] }, 1, doc,
    (x) => String(x), (x) => x, (x) => String(x), (_c, u) => u
  );

  const texto = (pintado.recetaPreview || {}).textContent || '';
  const esperado = Math.round(CAL(PECHUGA) + CAL(CERVEZA));
  ok(texto.indexOf('Se apunta: ' + esperado + ' cal') === 0,
     'la previa suma ' + esperado + ' cal',
     'dijo «' + texto + '». Sin el alcohol serían 97 menos, y la pantalla ' +
     'que enseña lo que vas a apuntar diría una cosa y el diario otra');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

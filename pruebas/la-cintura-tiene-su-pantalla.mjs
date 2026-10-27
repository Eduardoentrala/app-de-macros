// La cintura se fue de Peso a su propia pantalla.
//
// POR QUÉ. El historial entero vivía debajo de la gráfica de peso, una fila
// por medida y sin tope. Mientras la cintura se pedía una vez al mes eran
// trece renglones al año y se aguantaba; al pasar a cada quince días son
// veinticuatro, y en dos años es medio metro de pantalla que solo se mira
// de reojo, empujando hacia abajo todo lo demás.
//
// Y DE PASO SE ARREGLA LO QUE LE FALTABA. El propio código del historial lo
// decía: «88 no significa nada, 91 -> 88 significa que está perdiendo
// grasa». La dirección es el dato, y la cintura era la única medida de la
// app sin una línea que la enseñara —justo la que distingue grasa de
// músculo, que es lo que la báscula no sabe hacer—.
//
// En Peso queda una línea que no crece. Detrás, la gráfica y todas las
// medidas.
//
// LA GRÁFICA ES LA MISMA QUE LA DEL PESO, no una copia: `svgDeSerie` salió
// de `pintarPeso` para que las dos dibujen con el mismo código. Copiarla
// habría dejado dos que se separan en cuanto alguien toque una.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

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

const fmtFecha = (d) => d.getDate() + ' ' +
  ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()];

const svgDeSerie = new Function(sacar('function svgDeSerie(pts, etiquetaX){') +
  '\nreturn svgDeSerie;')();

// ------------------------------------------------------------------
console.log('\nLa gráfica es una sola, y dibuja lo que le den');
{
  const pts = [
    { d: new Date('2026-08-01T12:00:00'), v: 91 },
    { d: new Date('2026-08-16T12:00:00'), v: 89.5 },
    { d: new Date('2026-08-31T12:00:00'), v: 88 },
  ];
  const svg = svgDeSerie(pts, (p) => fmtFecha(p.d));
  ok(/<polyline/.test(svg), 'traza la línea');
  ok((svg.match(/<circle/g) || []).length === 3, 'con un punto por medida');
  ok(/1 ago/.test(svg) && /31 ago/.test(svg), 'y las fechas que le pidan en el eje',
     'la etiqueta la pone quien llama: el peso quiere «08-31» y la cintura ' +
     'la fecha entera, porque sus medidas cruzan de año');
  ok(!/NaN/.test(svg), 'sin NaN');

  // El peso manda otra etiqueta y sale distinta: es la misma función.
  const svgPeso = svgDeSerie(pts, (p) =>
    String(p.d.getMonth() + 1).padStart(2, '0') + '-' + String(p.d.getDate()).padStart(2, '0'));
  ok(/08-31/.test(svgPeso) && !/31 ago/.test(svgPeso), 'y cambia con quien la llama');
}

console.log('\nY no se rompe en los bordes');
{
  const iguales = [1, 2, 3].map((n) => ({ d: new Date(2026, 7, n, 12), v: 88 }));
  const svg = svgDeSerie(iguales, () => 'x');
  ok(!/NaN/.test(svg), 'con todas las medidas iguales no divide entre cero',
     'sin abrir el rango, (v - min)/(max - min) es 0/0');

  const muchas = Array.from({ length: 200 }, (_, i) => ({ d: new Date(2026, 0, 1 + i, 12), v: 80 + i % 7 }));
  const s2 = svgDeSerie(muchas, () => 'x');
  const puntos = (s2.match(/<circle/g) || []).length;
  ok(puntos <= 2, 'con doscientos puntos no los pinta todos',
     'salieron ' + puntos + ': la línea se vuelve una mancha');
  ok(/<circle/.test(s2), 'pero el último no se pierde: es el dato de hoy');
}

// ------------------------------------------------------------------
// La pantalla, ejecutándola.
function pantalla(cinturas) {
  const puesto = {};
  const doc = {
    getElementById: (id) => ({
      set innerHTML(v) { puesto[id] = v; },
      set textContent(v) { puesto[id] = v; },
      set className(v) { puesto[id + ':class'] = v; },
    }),
  };
  new Function('document', 'CINTURAS', 'fmtFecha', 'svgDeSerie',
    sacar('function pintarPantallaCintura(){') + '\npintarPantallaCintura();')(
    doc, cinturas, fmtFecha, svgDeSerie);
  return puesto;
}

const TRES = [
  { fecha: '2026-08-01', cm: 91 },
  { fecha: '2026-08-16', cm: 89.5 },
  { fecha: '2026-08-31', cm: 88 },
];

console.log('\nLa pantalla dice de dónde a dónde');
{
  const r = pantalla(TRES);
  ok(/−3 cm/.test(r.cinDelta), 'el cambio total arriba', 'dice: ' + r.cinDelta);
  ok(r['cinDelta:class'] === 'chart-delta baja', 'y bajar se pinta como bajar',
     'bajar la cintura significa lo mismo que bajar el peso, y con menos dudas');
  ok(/de 91 a 88 cm/.test(r.cinResumen), 'y se dice entero debajo',
     'dice: ' + r.cinResumen);
  ok(/<polyline/.test(r.cinChart), 'con su línea');
  ok(/88 cm/.test(r.cinturaFilas) && /91 cm/.test(r.cinturaFilas), 'y todas las medidas');
  ok(r.cinturaFilas.indexOf('88 cm') < r.cinturaFilas.indexOf('91 cm'),
     'la más reciente arriba', 'lo último medido es lo que se mira');
  ok(/primera/.test(r.cinturaFilas), 'y la primera se marca como tal');
}

console.log('\nCon una sola medida no se inventa una tendencia');
{
  const r = pantalla([{ fecha: '2026-08-01', cm: 91 }]);
  ok(!/<polyline/.test(r.cinChart), 'no hay línea');
  ok(/todavía no hay tendencia/i.test(r.cinChart), 'y se dice por qué',
     'un hueco en blanco se lee como que algo falló');
  ok(/próxima medida/.test(r.cinResumen), 'y qué falta para tenerla');
  ok(/91 cm/.test(r.cinturaFilas), 'la medida sí se enseña');
}

console.log('\nY sin ninguna, tampoco revienta');
{
  const r = pantalla([]);
  ok(r.cinturaFilas === '', 'la lista queda vacía');
  ok(/Todavía no has medido/.test(r.cinResumen), 'y se dice');
  ok(r.cinDelta === '—', 'sin inventarse un cambio');
}

// ------------------------------------------------------------------
// La fila de Peso.
function fila(cinturas) {
  const puesto = {};
  const doc = {
    getElementById: (id) => {
      if (!puesto[id]) puesto[id] = {};
      const o = puesto[id];
      return {
        set hidden(v) { o.hidden = v; },
        set textContent(v) { o.texto = v; },
        set value(v) { o.value = v; },
      };
    },
  };
  new Function('document', 'CINTURAS', 'tocaMedirCintura', 'revisarRecordatorios',
    'pintarPantallaCintura',
    sacar('function pintarCintura(){') + '\npintarCintura();')(
    doc, cinturas, () => false, () => {}, () => {});
  return puesto;
}

console.log('\nEn Peso queda una línea, y no crece');
{
  const sin = fila([]);
  ok(sin.cinturaIr.hidden === true, 'sin medidas no hay fila',
     'llevaría a una pantalla vacía, que es la única fila así de la app');

  const una = fila([{ fecha: '2026-08-01', cm: 91 }]);
  ok(una.cinturaIr.hidden === false, 'con una medida sí');
  ok(/91 cm/.test(una.cinturaResumen.texto) && /primera medida/.test(una.cinturaResumen.texto),
     'y dice cuál es', 'dice: ' + una.cinturaResumen.texto);

  const tres = fila(TRES);
  ok(/88 cm/.test(tres.cinturaResumen.texto), 'con varias, la última');
  ok(/−3 cm desde que empezaste/.test(tres.cinturaResumen.texto), 'y cuánto llevas',
     'dice: ' + tres.cinturaResumen.texto);

  const igual = fila([{ fecha: '2026-08-01', cm: 88 }, { fecha: '2026-08-16', cm: 88 }]);
  ok(/igual que al empezar/.test(igual.cinturaResumen.texto), 'y si no se movió, se dice',
     'un «−0 cm» no es una frase');
}

// ------------------------------------------------------------------
console.log('\nY el HTML está donde tiene que estar');
{
  ok(/data-view="cintura"/.test(HTML), 'la pantalla existe');
  ok(/id="cinturaIr"[^>]*data-push="cintura"/.test(HTML), 'y se llega desde Peso');
  ok(!/id="cinturaHist"/.test(HTML), 'el historial ya no vive en Peso',
     'si vuelve, vuelven los veinticuatro renglones al año debajo de la gráfica');
  ok(HTML.indexOf('id="cinChart"') > HTML.indexOf('data-view="cintura"'),
     'la gráfica está dentro de la pantalla nueva');
  ok(HTML.indexOf('id="cinturaFilas"') > HTML.indexOf('data-view="cintura"'),
     'y la lista también');
  // La hoja de la medida sigue en Peso: se apunta junto al peso, el mismo día.
  ok(HTML.indexOf('id="cinturaBloque"') < HTML.indexOf('data-view="cintura"'),
     'pero el campo para apuntarla se queda en Peso',
     'es una medida del cuerpo y se toma a la vez que el peso');
}

console.log(`\n${pasan} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);

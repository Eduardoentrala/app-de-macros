// Apuntar bien y apuntar a medias se sentían igual.
//
// Todo el afinado de la app depende de que la persona apunte: sin días
// apuntados no hay media de calorías, y sin pesajes no hay tendencia de
// peso. La app ya sabía si apuntabas —`dias_apuntados` está en cada semana
// guardada desde la 0054— pero no te lo decía nunca. El esfuerzo no tenía
// ninguna consecuencia visible, y lo que no se ve no se sostiene.
//
// LO QUE AÑADE ESTO:
//
//   · `nivelDeAfinado()` convierte lo guardado en tres cosas: cuántas
//     semanas completas lleva, si con eso ya se le mide el gasto, y cuánto
//     se le puede mover por semana.
//   · `frameAfinado()` lo dice en una frase, en «Mis semanas».
//   · Y el cierre del lunes lo recibe, así que el TAMAÑO DEL PASO deja de
//     ser el mismo para todos: con tres semanas medidas, mover 200 calorías
//     es moverlas a ciegas; con tres meses detrás, moverlas de 100 en 100
//     es ir más despacio de lo que los datos permiten.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sacarDe = (texto, cabecera) => {
  const i = texto.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = texto.indexOf('{', i);
  for (; j < texto.length; j++) {
    if (texto[j] === '{') n++;
    else if (texto[j] === '}') { n--; if (!n) return texto.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
};

// Las dos funciones de verdad, con `GM` delante porque los umbrales salen
// de ahí y escribirlos aquí a mano sería tener dos versiones del mismo
// número.
const GM = APP.slice(APP.indexOf('  var GM = {'), APP.indexOf('  // EL TOPE DE CORDURA'));
const FUENTE = GM + '\n' + sacarDe(APP, 'function nivelDeAfinado(){') + '\n' +
               sacarDe(APP, 'function frameAfinado(){');

const montar = (completas, medido, margen) => new Function(
  'serieParaMedir', 'gastoMedido',
  FUENTE + '\nreturn { nivelDeAfinado: nivelDeAfinado, frameAfinado: frameAfinado };')(
  () => new Array(completas).fill({}),
  () => (medido ? { estado: 'ok', margen: margen } : { estado: 'faltan_semanas' }));

// ------------------------------------------------------------------
console.log('\nEl paso crece con lo que se sabe');
{
  const paso = (c, m) => montar(c, m, 0.25).nivelDeAfinado().tope;

  ok(paso(0, false) === 100, 'sin medición, el mínimo');
  ok(paso(20, false) === 100, 'y sin medición no sube por muchas semanas que haya',
     'si no se le puede medir el gasto, mover 200 es adivinar con más datos');
  ok(paso(4, true) === 100, 'con cuatro semanas medidas, 100');
  ok(paso(8, true) === 150, 'con ocho, 150');
  ok(paso(12, true) === 200, 'con doce, 200');
  ok(paso(52, true) === 200, 'y ahí se queda: un año no justifica saltos mayores');
}

console.log('\nY se dice en una frase, con lo que hace falta para subir');
{
  const sin = montar(1, false).frameAfinado();
  ok(/1 semana completa/.test(sin), 'cuántas lleva', 'dijo: ' + sin);
  ok(/5 días apuntados y 2 pesajes/.test(sin), 'y qué hace que una semana cuente',
     'es lo único accionable: sin esto, «apunta mejor» no significa nada');

  const con = montar(19, true, 0.40).frameAfinado();
  ok(/19 semanas completas/.test(con), 'con medición, cuántas la sostienen');
  ok(/200 cal/.test(con), 'y cuánto se le puede ajustar', 'dijo: ' + con);
  ok(!/Cada semana completa afina más/.test(con),
     'sin prometer más afinado cuando ya está al tope',
     'decirle que siga afinando cuando ya no hay más es una zanahoria falsa');

  const medio = montar(9, true, 0.35).frameAfinado();
  ok(/Cada semana completa afina más/.test(medio),
     'pero sí mientras quede margen por ganar');
}

console.log('\nLa frase se pinta donde se mira el historial');
{
  const pinta = sacarDe(APP, 'function pintarMisSemanas(){');
  ok(/frameAfinado\(\)/.test(pinta), 'en «Mis semanas»');
  ok(/sem-ahora-afina/.test(pinta), 'dentro de la tarjeta de la semana en curso',
     'habla de la semana que se está viviendo, que es la única sobre la que ' +
     'todavía se puede hacer algo');
  ok(/\.sem-ahora-afina\{/.test(CSS), 'y tiene estilo propio');
}

// ------------------------------------------------------------------
console.log('\nEl cierre lo recibe y le pone techo al paso');
{
  const envio = APP.slice(APP.indexOf("accion: 'semana'"), APP.indexOf("accion: 'semana'") + 2200);
  ok(/afinado: nivelDeAfinado\(\)/.test(envio), 'la app se lo manda');

  const cierre = sacarDe(FN, "if (accion === 'semana') {");
  ok(/cuerpo\.afinado/.test(cierre), 'la función lo lee');
  ok(/NO le muevas más de \$\{tope\} calorías/.test(cierre),
     'y se lo dice como un límite, no como un consejo',
     'el prompt decía «entre 100 y 200» para todos, con tres semanas y con ' +
     'tres meses');

  // Llega en el cuerpo, igual que el gasto medido: un número inventado
  // desde la consola no puede convertirse en un salto de calorías.
  ok(/Math\.min\(200, Math\.max\(50, Math\.round\(Number\(af\.tope\) \|\| 100\)\)\)/.test(cierre),
     'acotado entre 50 y 200 aunque venga calculado');

  ok(/historial \+\n\s*decisiones \+\n\s*afinado \+/.test(FN),
     'y entra en el contexto que ve el modelo',
     'calculado y no enviado es el mismo agujero de siempre');
}

console.log('\nY si le faltan semanas, se le dice qué le falta');
{
  const cierre = sacarDe(FN, "if (accion === 'semana') {");
  ok(/Le faltan \$\{Number\(af\.faltan\)\} semanas completas/.test(cierre),
     'cuántas le faltan para que se le pueda medir');
  ok(/díselo UNA vez, sin regañar y sin repetirlo cada/.test(cierre),
     'una vez y sin regañar',
     'repetirlo cada lunes convierte un dato útil en una reprimenda semanal');
}

console.log(`\n${pasan} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);

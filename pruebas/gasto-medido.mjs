// El gasto MEDIDO, en vez de estimado.
//
// El número que da la app al registrarse sale de una fórmula multiplicada
// por un factor de actividad que la persona elige una vez y nadie vuelve a
// mirar. Ahí está el error grande: pasar de "actividad ligera" a "moderada"
// son 300 calorías, y casi todo el mundo se sobreestima.
//
// Esto no lo estima, lo resta: lo que comió menos lo que cambió de peso.
//
// Lo delicado NO es la cuenta -es una resta- sino cuándo NO hacerla. Un
// número medido que está mal es peor que una estimación floja, porque se
// deja de dudar de él. Por eso casi toda esta prueba son las guardas.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// Se saca la función DE VERDAD del fuente. Una copia aquí se quedaría vieja
// el día que se toque el original y la prueba seguiría verde mintiendo.
const i = APP.indexOf('  var GM = {');
const j = APP.indexOf('  // Las DOS semanas que se comparan');
const TROZO = APP.slice(i, j);

function montar(semanas, estimado) {
  const resumenDeSemanas = () => semanas;
  const gastoEstimado = () => ({ gasto: estimado });
  const KCAL_POR_KG = 7700;
  return new Function('resumenDeSemanas', 'gastoEstimado', 'KCAL_POR_KG',
    TROZO + '\n return gastoMedido;')(resumenDeSemanas, gastoEstimado, KCAL_POR_KG);
}
// Una semana buena: 7 días apuntados, 3 pesajes.
const sem = (fecha, cal, peso, dias = 7, pesajes = 3) =>
  ({ semana: fecha, dias_apuntados: dias, media_cal: cal, peso_medio: peso,
     dias_con_peso: pesajes, fotos: 0 });

console.log('\n— El trozo se extrae del fuente —');
check('está donde se espera', i > 0 && j > i);

console.log('\n— La resta sale —');
{
  // Come 2.400 y baja 0,3 kg por semana. El déficit diario es
  // 0,3 × 7700 / 7 = 330. Su gasto real: 2.400 + 330 = 2.730.
  const f = montar([
    sem('2026-07-13', 2400, 85.2), sem('2026-07-20', 2400, 84.9),
    sem('2026-07-27', 2400, 84.6), sem('2026-08-03', 2400, 84.3)
  ], 2700);
  const r = f();
  check('mide', r.estado === 'ok', JSON.stringify(r));
  check('da 2.730', r.gasto === 2730, `dio ${r.gasto}`);
  check('con el ritmo real', r.kg_por_semana === -0.3, `dio ${r.kg_por_semana}`);
  check('y dice de cuánto se fía', r.semanas === 4 && r.dias === 28);

  // Peso plano: entonces lo que come ES su mantenimiento. Sin caso especial.
  const plano = montar([
    sem('2026-07-13', 2500, 84), sem('2026-07-20', 2500, 84),
    sem('2026-07-27', 2500, 84), sem('2026-08-03', 2500, 84)
  ], 2500)();
  check('con el peso plano, el gasto es lo que come', plano.gasto === 2500, `dio ${plano.gasto}`);

  // Subiendo de peso: el gasto es MENOR que lo que come.
  const sube = montar([
    sem('2026-07-13', 3000, 84), sem('2026-07-20', 3000, 84.3),
    sem('2026-07-27', 3000, 84.6), sem('2026-08-03', 3000, 84.9)
  ], 2700)();
  check('subiendo de peso, gasta menos de lo que come', sube.gasto === 2670, `dio ${sube.gasto}`);
}

console.log('\n— Y no se hace cuando no se debe —');
{
  const buenas = [
    sem('2026-07-13', 2400, 85.2), sem('2026-07-20', 2400, 84.9),
    sem('2026-07-27', 2400, 84.6)
  ];
  check('con tres semanas buenas, sí', montar(buenas, 2700)().estado === 'ok');

  // Dos semanas no bastan: el peso de catorce días se mueve un kilo por agua
  // y sal sin que haya cambiado un gramo de grasa.
  const dos = montar(buenas.slice(0, 2), 2700)();
  check('con dos, no', dos.estado === 'faltan_semanas', JSON.stringify(dos));
  check('y dice cuántas faltan', dos.faltan === 1);

  // Una semana con tres días apuntados no dice lo que comió esa semana:
  // dice lo que comió tres días de ella.
  const pocosDias = montar(
    [sem('2026-07-13', 2400, 85.2, 3), ...buenas.slice(1)], 2700)();
  check('una semana con pocos días apuntados no cuenta',
    pocosDias.estado === 'faltan_semanas',
    'con 3 días de 7, la media es de tres días, no de la semana');

  // Un solo pesaje no da media semanal: da un número suelto con todo su ruido.
  const pocosPesos = montar(
    [sem('2026-07-13', 2400, 85.2, 7, 1), ...buenas.slice(1)], 2700)();
  check('una semana con un solo pesaje tampoco', pocosPesos.estado === 'faltan_semanas');

  // Semanas sin comida o sin peso apuntado.
  const sinNada = montar([
    { semana: 'a', dias_apuntados: 7, media_cal: null, peso_medio: 84, dias_con_peso: 3 },
    { semana: 'b', dias_apuntados: 7, media_cal: 2400, peso_medio: null, dias_con_peso: 3 },
    ...buenas
  ], 2700)();
  check('las semanas huecas se ignoran, no revientan', sinNada.estado === 'ok');
}

console.log('\n— El tope de cordura —');
{
  // Comió 1.200 y perdió 2 kg por semana durante un mes. La resta da 3.400
  // de gasto contra 2.700 estimados: eso no es un metabolismo, es agua o
  // una báscula distinta, y creérselo le movería las calorías por algo que
  // no va a repetirse.
  const raro = montar([
    sem('2026-07-13', 1200, 88), sem('2026-07-20', 1200, 86),
    sem('2026-07-27', 1200, 84), sem('2026-08-03', 1200, 82)
  ], 2700)();
  check('un número absurdo se tira', raro.estado === 'fuera_de_rango', JSON.stringify(raro));
  check('pero se guarda para poder mirarlo', raro.gasto > 0 && raro.estimado === 2700);

  // OJO CON LO QUE ESTE TOPE NO HACE. Solo mira la distancia al estimado, no
  // si la bajada es fisiológicamente creíble. Perder 1 kg por semana comiendo
  // 1.200 da 2.300 contra 2.700 estimados -un 15%- y se acepta, porque es
  // exactamente el caso que esto existe para encontrar: alguien que gasta
  // menos de lo que la fórmula creía.
  //
  // No se añade un tope por ritmo porque quien empieza pesando mucho SÍ
  // pierde así las primeras semanas, y rechazarlo le negaría la medición
  // justo a quien más la necesita. El daño queda acotado por otro lado: la
  // IA sigue moviendo 100-200 pase lo que pase, no da saltos.
  const rapido = montar([
    sem('a', 1200, 86), sem('b', 1200, 85), sem('c', 1200, 84), sem('d', 1200, 83)
  ], 2700)();
  check('una bajada rápida pero creíble se acepta', rapido.estado === 'ok',
    'rechazarla dejaría sin medición a quien empieza pesando mucho');

  // Justo dentro y justo fuera del 25%, para fijar el límite.
  // Con peso plano el gasto ES la media, así que se controla exacto.
  check('a un 24% del estimado, se acepta',
    montar([sem('a', 2480, 84), sem('b', 2480, 84), sem('c', 2480, 84)], 2000)().estado === 'ok',
    '2480 sobre 2000 es un 24%');
  check('a un 26%, se tira',
    montar([sem('a', 2520, 84), sem('b', 2520, 84), sem('c', 2520, 84)], 2000)().estado === 'fuera_de_rango',
    '2520 sobre 2000 es un 26%');
  // Y por abajo también: un gasto medido muy por DEBAJO del estimado suele
  // ser que dejó de apuntar media semana, no que su metabolismo se hundió.
  check('también se tira si queda muy por debajo',
    montar([sem('a', 1400, 84), sem('b', 1400, 84), sem('c', 1400, 84)], 2700)().estado === 'fuera_de_rango');
}

console.log('\n— Absorbe que se apunte de menos —');
{
  // Apunta 300 menos de lo que come, siempre igual. El gasto medido sale
  // 300 por debajo del real, pero en LAS MISMAS unidades en las que apunta,
  // así que el objetivo que salga de ahí le deja el déficit correcto.
  //
  // Real: come 2.700, gasta 3.030, pierde 0,3 kg/semana.
  // Apunta 2.400. Medido: 2.400 + 330 = 2.730 (300 por debajo de 3.030).
  const f = montar([
    sem('a', 2400, 85.2), sem('b', 2400, 84.9), sem('c', 2400, 84.6)
  ], 2900)();
  check('el gasto medido queda desplazado lo mismo que el error', f.gasto === 2730);
  // Y lo que importa: el déficit que sale de ahí es el correcto.
  const objetivo = f.gasto - 400;          // 2.330 apuntadas
  const comeDeVerdad = objetivo + 300;     // 2.630 de verdad
  check('el déficit real sigue siendo el que se pidió', 3030 - comeDeVerdad === 400,
    'esta es la propiedad por la que esto vale más que la fórmula');
}

console.log('\n— Viaja al cierre de semana —');
{
  check('se manda con lo demás', /gasto: gastoMedido\(\),/.test(APP));
  check('la fórmula del estimado está en un solo sitio',
    (APP.match(/6\.25\*alt/g) || []).length === 1,
    'copiada, un día se corrige una y la otra no, y la medición se compara contra otra fórmula');
  check('y la usan las dos', /function gastoEstimado\(\)/.test(APP) &&
    /var base = gastoEstimado\(\);/.test(APP));
}

console.log('\n— La IA lo usa, y con freno —');
{
  check('lo lee', /cuerpo\.gasto/.test(FN));
  // Solo si está medido de verdad. El descartado no puede llegarle: es
  // justo el número del que no hay que fiarse.
  check('solo si el estado es ok', /gm\.estado === 'ok'/.test(FN),
    'sin esto le llegaría el número que se descartó por absurdo');
  check('le dice que manda sobre el estimado', /Manda el medido/.test(FN));
  check('le explica de dónde sale', /Sale de restar/.test(FN));
  // Si no, la IA le echaría en cara que apunta mal, cuando el cálculo YA lo
  // absorbe y decírselo solo consigue que apunte con miedo.
  check('le prohíbe reprocharle que apunte de menos',
    /NO le sugieras que apunta mal/.test(FN),
    'el cálculo ya lo absorbe; decírselo solo hace que apunte peor');
  // Tener mejor información no es permiso para dar saltos más grandes.
  check('sigue moviendo poco', /Tener mejor información no es razón/.test(FN.replace(/\s+/g, ' ')));
}

console.log('\n— Y se le enseña a quien es —');
{
  check('hay sitio en el Perfil', /id="gastoBox"/.test(HTML) && /id="gastoReal"/.test(HTML));
  // Nace oculto: hasta que haya semanas suficientes no se enseña ni se
  // menciona. Un hueco que dice "todavía no" solo genera la pregunta de cuándo.
  check('nace oculto', /<div class="calc-box" id="gastoBox" hidden/.test(HTML));
  check('se pinta al recalcular la semana', /if\(typeof pintarGastoReal === 'function'\) pintarGastoReal\(\);/.test(APP));

  const k = APP.indexOf('function pintarGastoReal(');
  const p = APP.slice(k, k + 1600);
  check('se esconde si no se puede medir', /if\(!g \|\| g\.estado !== 'ok'\)\{ caja\.hidden = true; return; \}/.test(p));
  check('y si la cuenta revienta, también', /catch\(e\)\{ caja\.hidden = true; return; \}/.test(p),
    'un fallo aquí no puede dejar el Perfil a medio pintar');
  check('dice con cuánto se midió', /g\.semanas \+ ' semanas y ' \+ g\.dias/.test(p));
  check('y lo compara con la fórmula', /de lo que decía la fórmula del registro/.test(p));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

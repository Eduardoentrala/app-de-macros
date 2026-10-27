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

// `serieParaMedir` junta dos fuentes, así que hacen falta las dos. También
// de verdad, sacadas del fuente: la clave con la que se guarda cada fila no
// es la semana que describe, y copiar ese desfase aquí a mano es pedir que
// un día se separen.
const sacarFn = (cabecera) => {
  const a = APP.indexOf(cabecera);
  if (a < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, b = APP.indexOf('{', a);
  for (; b < APP.length; b++) {
    if (APP[b] === '{') n++;
    else if (APP[b] === '}') { n--; if (!n) return APP.slice(a, b + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
};
const APOYO = sacarFn('function isoDe(d){') + '\n' +
              sacarFn('function semanaQueJuzga(f){') + '\n';

// `guardadas` son las filas de `chequeos_semanales` que el arranque deja
// cargadas en SEMANAS: la parte LARGA de la serie. Vacía por defecto, que
// es como vivía esta prueba antes de que la medición pudiera mirar más
// atrás de lo que cabe en el diario del teléfono.
function montar(semanas, estimado, guardadas = []) {
  const resumenDeSemanas = () => semanas;
  const gastoEstimado = () => ({ gasto: estimado });
  const KCAL_POR_KG = 7700;
  return new Function('resumenDeSemanas', 'gastoEstimado', 'KCAL_POR_KG', 'SEMANAS',
    APOYO + TROZO + '\n return gastoMedido;')(
    resumenDeSemanas, gastoEstimado, KCAL_POR_KG, guardadas);
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
  // Y la usan las dos, ahora con un escalón en medio:
  //
  //   calcularMacros -> gastoParaDecidir -> gastoEstimado
  //   gastoMedido ----------------------> gastoEstimado   (su tope de cordura)
  //
  // `gastoParaDecidir` es quien prefiere lo medido cuando lo hay, que es lo
  // que faltaba: la app enseñaba «Tu gasto real: 2.121» en Perfil y seguía
  // recalculando las calorías con los 2.740 de la fórmula.
  check('y la usan las dos', /function gastoEstimado\(\)/.test(APP) &&
    /var est = gastoEstimado\(\);/.test(APP) &&
    /var base = gastoParaDecidir\(\);/.test(APP),
    'si la calculadora vuelve a llamar directo al estimado, se pierde la medición');
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

// ------------------------------------------------------------------
// LO QUE HACE QUE SE AFINE CON EL TIEMPO.
//
// Antes esto medía sobre una ventana fija de cuatro semanas del diario que
// el teléfono tiene en memoria. O sea que en la semana 4 y en el año 2 el
// número tenía exactamente la misma precisión: la app no aprendía.
//
// Ahora la serie se alarga con `chequeos_semanales` -que desde la 0055 no
// se borra-, lo reciente pesa más que lo viejo, y el tope de cordura se
// ensancha según cuántas semanas lo respalden.
// ------------------------------------------------------------------

// Una fila guardada. OJO con la clave: se guarda con la semana SIGUIENTE a
// la que describe, por eso el +7.
const lunes = (n) => {
  const d = new Date('2026-01-05T12:00:00');   // un lunes
  d.setDate(d.getDate() + 7 * n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
};
const guard = (n, cal, peso, dias = 7) =>
  ({ semana: lunes(n + 1), dias_apuntados: dias, media_cal: cal, peso_medio: peso });

console.log('\n— La serie ya no se queda en cuatro semanas —');
{
  // Veinte semanas guardadas, comiendo 2.000 y bajando 0,2 kg por semana.
  // Su gasto: 2.000 + 0,2 × 7700 / 7 = 2.220.
  const largas = [];
  for (let n = 0; n < 20; n++) largas.push(guard(n, 2000, 90 - 0.2 * n));
  const r = montar([], 2200, largas)();
  check('mide con las veinte', r.estado === 'ok' && r.semanas === 20,
        JSON.stringify({ estado: r.estado, semanas: r.semanas }));
  check('y da el gasto real', Math.abs(r.gasto - 2220) <= 2, `dio ${r.gasto}`);
  check('con los días de todas', r.dias === 140, `dio ${r.dias}`);
}

console.log('\n— Y lo reciente manda sobre lo viejo —');
{
  // Ocho semanas bajando medio kilo (gasto 2.550) y luego ocho planas
  // (gasto 2.000). Comiendo 2.000 siempre. Su metabolismo de HOY es 2.000.
  const cambio = [];
  let peso = 90;
  for (let n = 0; n < 8; n++) { cambio.push(guard(n, 2000, peso)); peso -= 0.5; }
  for (let n = 8; n < 16; n++) cambio.push(guard(n, 2000, peso));
  const r = montar([], 2300, cambio)();

  // Sin ponderar, la recta saldría a medio camino de las dos épocas. Con la
  // vida media de ocho semanas, la mitad reciente pesa mucho más.
  check('el número se va hacia lo reciente', r.gasto < 2275,
        `dio ${r.gasto}: el punto medio entre las dos épocas es 2275, y tiene ` +
        `que quedar por debajo porque lo de hoy es peso plano`);
  check('sin irse del todo a lo de hoy', r.gasto > 2000,
        `dio ${r.gasto}: lo viejo informa, no se tira`);
}

console.log('\n— El tope se ensancha con la confianza —');
{
  // Come 2.000 con el peso plano: su gasto son 2.000. La fórmula del
  // registro dice 2.900, un 31% más. Es el caso real de quien tiene un
  // metabolismo que Mifflin no describe.
  const haz = (cuantas) => {
    const s = [];
    for (let n = 0; n < cuantas; n++) s.push(guard(n, 2000, 84));
    return montar([], 2900, s)();
  };

  const pocas = haz(4);
  check('con cuatro semanas no se cree un 31%', pocas.estado === 'fuera_de_rango',
        JSON.stringify({ estado: pocas.estado, margen: pocas.margen }) +
        ': con tan poco, eso es una semana rara y no un metabolismo');
  check('y dice con qué margen lo midió', pocas.margen === 0.25, `dio ${pocas.margen}`);

  const muchas = haz(12);
  check('con doce sí', muchas.estado === 'ok',
        JSON.stringify({ estado: muchas.estado, margen: muchas.margen }) +
        ': tres meses de semanas completas ya no son ruido, y quien de verdad ' +
        'gasta un 30% menos no puede quedarse sin sus calorías para siempre');
  check('con el margen abierto', muchas.margen === 0.40, `dio ${muchas.margen}`);
  check('y el gasto es el medido', muchas.gasto === 2000, `dio ${muchas.gasto}`);
}

console.log('\n— Pero no se quita nunca del todo —');
{
  // Un error sistemático al apuntar -pesar siempre de menos- daría esto, y
  // tener veinte semanas no lo arregla: las tendría todas igual de mal.
  const s = [];
  for (let n = 0; n < 20; n++) s.push(guard(n, 2000, 84));
  const r = montar([], 4200, s)();
  check('un 52% se sigue tirando con veinte semanas', r.estado === 'fuera_de_rango',
        JSON.stringify({ estado: r.estado, margen: r.margen }));
}

console.log('\n— Las dos fuentes se juntan sin pisarse —');
{
  // La misma semana en las dos: la local gana, que es la que sabe cuántos
  // pesajes hubo. Si se duplicara, contaría dos veces y la recta se torcería.
  const dupe = [guard(0, 2000, 90), guard(1, 2000, 89.8), guard(2, 2000, 89.6)];
  // `lunes(1)` describe la semana que empieza en `lunes(0)`.
  const local = [{ semana: lunes(0), dias_apuntados: 7, media_cal: 2000,
                   peso_medio: 90, dias_con_peso: 3, fotos: 0 }];
  const r = montar(local, 2200, dupe)();
  check('no se cuenta dos veces', r.semanas === 3, `dio ${r.semanas} semanas`);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

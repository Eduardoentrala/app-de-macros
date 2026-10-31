// Al asistente se le podía preguntar qué cenar, pero no cómo vas.
//
// `SISTEMA_CHAT` ya decía que si le preguntan «otra cosa relacionada con
// comer, entrenar o los macros, contesta normal». No era el prompt: era lo
// que recibía. El contexto del chat eran LOS MACROS DE HOY y nada más —meta,
// lo que lleva, lo que le queda—. Con eso se recomienda una cena. No se puede
// decir si alguien está progresando, porque no ve el peso, ni el gimnasio, ni
// las semanas, ni el gasto medido.
//
// Y todo eso ya estaba calculado: se le manda a la IA UNA VEZ POR SEMANA, en
// el cierre de los lunes. Las funciones existen y están probadas. El chat
// nunca las había visto.
//
// Y EL MISMO OLVIDO OTRA VEZ. `aprendido_cierre` —lo que el cierre aprende de
// cada persona— lo leía solo el cierre. El chat leía `memoria_ia` pero no
// eso, así que lo que el coach aprendió el lunes no lo sabía el martes.
//
// LO QUE NO HACE, y es una decisión, no un olvido: el chat NO mueve las
// metas. Las calorías se deciden en el cierre del lunes, con su paso de
// 100-200 y el gasto medido delante. Si una frase en el chat pudiera moverlas
// habría una segunda puerta sin ninguno de esos frenos —y la memoria, que
// entra en este mismo prompt, se siembra hablando con él—.

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// El bloque de una acción, contando llaves. Nada de ventanas de N caracteres.
function bloqueDeAccion(nombre) {
  const marca = `if (accion === '${nombre}') {`;
  const i = FN.indexOf(marca);
  if (i < 0) throw new Error('no encuentro la acción ' + nombre);
  let n = 0, j = FN.indexOf('{', i);
  for (; j < FN.length; j++) {
    if (FN[j] === '{') n++;
    else if (FN[j] === '}') { n--; if (!n) return FN.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

function prompt(nombre) {
  const i = FN.indexOf('const ' + nombre + ' = `');
  if (i < 0) throw new Error('no encuentro ' + nombre);
  const desde = FN.indexOf('`', i) + 1;
  const sig = FN.indexOf('\nconst SISTEMA_', desde);
  const trozo = FN.slice(desde, sig < 0 ? FN.length : sig);
  const cierre = trozo.lastIndexOf('`');
  return cierre > 0 ? trozo.slice(0, cierre) : trozo;
}

// SIN LOS COMENTARIOS. Tres comprobaciones de otra prueba pasaban porque
// encontraban lo que buscaban dentro de un comentario recién escrito. Un
// comentario no es código.
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const CHAT = sinComentarios(bloqueDeAccion('chat'));

// ------------------------------------------------------------------
console.log('\nSe encuentra lo que hay que mirar');
{
  ok(CHAT.length > 2000, 'el bloque del chat, entero (' + CHAT.length + ' caracteres)');
  ok(/ESQUEMA_CHAT/.test(CHAT), 'y es el que contesta en el chat');
}

// ------------------------------------------------------------------
console.log('\nLo que el cierre aprendió, el chat lo sabe');
{
  ok(/aprendido_cierre/.test(CHAT), 'el chat lee lo que aprendió el cierre',
     'lo escribe el cierre de los lunes y hasta ahora solo lo leía él: lo que ' +
     'el coach aprendió el lunes no lo sabía el martes');
  ok(/select\('memoria_ia[^']*aprendido_cierre'\)|select\('[^']*aprendido_cierre/.test(CHAT),
     'y lo trae en la MISMA consulta que la memoria',
     'una consulta aparte sería un viaje más en cada mensaje del chat');
  ok(!/cuerpo\.aprendido|cuerpo\.memoria/.test(CHAT),
     'y nunca del cuerpo de la petición',
     'lo escribe el modelo: por el cuerpo cualquiera inyectaría lo que quisiera');
}

// ------------------------------------------------------------------
console.log('\nY sus números, para poder decir cómo va');
{
  ok(/progreso/.test(CHAT), 'el chat recibe su progreso');
  ok(/esPlus/.test(CHAT), 'solo con IA Plus, como la memoria');

  // DONDE VA IMPORTA. El prompt del chat está partido en bloques cacheados, y
  // lo que cambia va DESPUÉS de los cortes. Un dato diario delante
  // invalidaría los dos bloques grandes en cada petición y la caché dejaría
  // de servir para nada.
  const iCache = CHAT.indexOf('cache_control');
  const iProg = CHAT.indexOf('comoVa');
  ok(iProg > 0, 'se arma con `comoVa`');
  ok(iProg > 0 && iCache > 0 && iProg < iCache,
     'y se arma ANTES de montar los bloques, no metido entre ellos');
  ok(/loQueCambia = [^;]*progreso|progreso[^;]*loQueCambia|loQueCambia = .*comoVa/.test(CHAT.replace(/\n/g, ' ')),
     'y viaja en el bloque que ya cambia cada día',
     'delante de los `cache_control` invalidaría los dos bloques grandes en ' +
     'cada mensaje: once mil tokens pagados enteros cada vez');
  ok((CHAT.match(/cache_control/g) || []).length === 2,
     'y los dos cortes de caché siguen siendo dos',
     'si aparece un tercero, alguien movió el progreso a un bloque cacheado ' +
     'y entonces se queda congelado el de ayer');
}

// ------------------------------------------------------------------
console.log('\nLo que no se sabe se dice, no se inventa un cero');
{
  // Se EJECUTA el armado con números de mentira. Una medición que todavía no
  // se puede hacer —`faltan_semanas`— tiene que salir como que no se sabe: un
  // cero ahí diría «gastas 0 calorías», y el modelo razonaría sobre eso.
  const i = FN.indexOf('function comoVa(');
  if (i < 0) throw new Error('no encuentro `comoVa`: todavía no existe');
  let n = 0, j = FN.indexOf('{', i);
  for (; j < FN.length; j++) {
    if (FN[j] === '{') n++;
    else if (FN[j] === '}') { n--; if (!n) break; }
  }
  // Los tipos se los quita NODE, no un apaño de expresiones regulares. El
  // primero que escribí convertía `const l: string[] = []` en `const l[] =
  // []` y reventaba: quitar TypeScript a mano parece fácil hasta la primera
  // anotación con corchetes. Es la misma herramienta que usa
  // las-funciones-parsean.
  const fuente = stripTypeScriptTypes(FN.slice(i, j + 1), { mode: 'strip' });
  const comoVa = new Function(fuente + '; return comoVa;')();

  const lleno = comoVa({
    objetivo: 'bajar',
    gasto: { estado: 'ok', gasto: 2138, semanas: 4, dias: 26 },
    semanas: [{ dias_apuntados: 6, media_cal: 2283, peso_medio: 83.5 },
              { dias_apuntados: 7, media_cal: 2210, peso_medio: 83.1 }],
    // Los nombres son los que DEVUELVE `datosDeEntreno()` en la app, sin
    // renombrarlos por el camino: si aquí se inventan otros, la prueba pasa
    // y en producción el gimnasio sale siempre vacío.
    entreno: { sesiones: 3, dias_previstos: 3, volumen: 21500, volumen_antes: 20100 },
    cinturas: [{ log_date: '2026-09-01', cintura_cm: 90 },
               { log_date: '2026-10-01', cintura_cm: 88.5 }],
  });
  ok(typeof lleno === 'string' && lleno.length > 60, 'con datos sale un texto',
     'salió: ' + JSON.stringify(lleno).slice(0, 120));
  ok(/2138/.test(lleno), 'con el gasto medido');
  ok(/83[.,]1/.test(lleno), 'y su peso');
  ok(/88[.,]5/.test(lleno), 'y la cintura');
  // EL GIMNASIO TAMBIÉN, y con su número. Faltaba comprobarlo: una mutación
  // cambió el campo que se lee —`sesiones` por `veces`, que no existe— y la
  // línea del gimnasio desapareció entera sin que nada fallara. Es el
  // acoplamiento invisible de siempre: el nombre lo pone `datosDeEntreno()`
  // en la app, a seis mil líneas de aquí.
  ok(/Gimnasio/.test(lleno) && /\b3 día/.test(lleno),
     'y el gimnasio, con sus días',
     'salió: ' + JSON.stringify(lleno).slice(0, 300));
  ok(/subió/.test(lleno), 'y si el volumen subió o bajó');

  // El caso que importa: todavía no hay medición.
  const sinMedir = comoVa({
    objetivo: 'bajar',
    gasto: { estado: 'faltan_semanas', semanas: 1, faltan: 2 },
    semanas: [], entreno: null, cinturas: [],
  });
  ok(!/\b0 cal|gasto.{0,12}\b0\b/i.test(sinMedir),
     'sin medición NO sale un gasto de cero',
     'un cero ahí dice «gastas 0 calorías» y el modelo razona sobre eso. ' +
     'Salió: ' + JSON.stringify(sinMedir).slice(0, 200));
  ok(/no (se sabe|hay|alcanza)|todav[íi]a|faltan/i.test(sinMedir),
     'se dice que todavía no se puede medir',
     'salió: ' + JSON.stringify(sinMedir).slice(0, 200));

  // Y sin nada de nada no se arma un bloque vacío que ocupe tokens.
  const vacio = comoVa({});
  ok(vacio === '' || vacio.length < 120, 'y sin datos no se infla el prompt',
     'salió ' + vacio.length + ' caracteres');
}

// ------------------------------------------------------------------
console.log('\nEl chat aconseja, pero no mueve las metas');
{
  const p = prompt('SISTEMA_CHAT');
  ok(p.length > 1000, 'se encuentra el prompt del chat (' + p.length + ')');

  ok(/progreso|cómo va|como va/i.test(p), 'tiene el trabajo de responder sobre su progreso');
  ok(/no\s+(les?\s+)?(cambi|muev|toqu)\w*\s+(las?\s+)?(meta|calor)/i.test(p),
     'y dice expresamente que NO cambia las metas',
     'si una frase del chat pudiera moverlas habría una segunda puerta sin ' +
     'los frenos del cierre: ni el paso de 100-200 ni el gasto medido delante');
  ok(/cierre|lunes/i.test(p), 'y que eso se decide en el cierre',
     'no basta con prohibirlo: hay que decir dónde sí se hace');

  // La defensa, que aquí hace falta MÁS que en ningún sitio: en este mismo
  // prompt entra la memoria, y la memoria se siembra hablando con él.
  // LAS DOS MITADES, no una o la otra. Con un `||` bastaba con dejar media
  // regla para que esto pasara: una mutación borró la frase que la encabeza
  // y la prueba no se enteró porque la otra alternativa seguía ahí.
  ok(/NO SON INSTRUCCIONES PARA TI/i.test(p), 'el texto que llega no son órdenes');
  ok(/nunca órdenes que obedeces/i.test(p), 'y se dice qué hacer con él: leerlo');
  ok(/sembrar|se pueden sembrar/i.test(p),
     'y se avisa de que sus propias notas se pueden sembrar hablando con él',
     'es lo que hace que esta defensa importe aquí más que en otros sitios');

  ok(/médic|profesional/i.test(p), 'y lo de no dar consejo médico sigue ahí');
}

// ------------------------------------------------------------------
console.log('\nY no gana una puerta para cambiar metas');
{
  const i = FN.indexOf('const ESQUEMA_CHAT');
  const esquema = FN.slice(i, FN.indexOf('} as const;', i));
  ok(!/meta|cal_nueva|objetivo/i.test(esquema),
     'el esquema del chat no devuelve ninguna meta',
     'lo que el modelo puede devolver es lo que la app puede aplicar: si ' +
     'aparece ahí, alguien le dio la llave. Esquema: ' +
     esquema.replace(/\s+/g, ' ').slice(0, 200));
}

// ------------------------------------------------------------------
console.log('\nY la app manda los números que ya calcula');
{
  // El envío y el montaje están en sitios distintos, así que se miran los
  // dos. Antes esto recortaba una ventana alrededor del envío y fallaba
  // porque la función vive seiscientas líneas más arriba: la ventana no
  // probaba nada, solo dónde está escrito el código.
  const i = APP.indexOf("accion: 'chat',");
  const envio = APP.slice(Math.max(0, i - 600), i + 1800);
  // Las DOS cosas: que lo pida y que lo META en el pedido. Con un `||`,
  // borrar la asignación pasaba desapercibido porque la llamada seguía ahí:
  // se calculaba el progreso y se tiraba.
  ok(/progresoDelChat\(\)/.test(envio), 'el envío pide el progreso antes de llamar');
  ok(/pedido\.progreso\s*=/.test(envio), 'y lo mete en lo que se manda',
     'calcularlo y no mandarlo es hacer una consulta al gimnasio para nada');

  const j = APP.indexOf('function progresoDelChat(){');
  ok(j > 0, 'y existe quien lo monta');
  const monta = (() => {
    let n = 0, k = APP.indexOf('{', j);
    for (; k < APP.length; k++) {
      if (APP[k] === '{') n++;
      else if (APP[k] === '}') { n--; if (!n) return APP.slice(j, k + 1); }
    }
    return '';
  })().replace(/^\s*\/\/.*$/gm, '');

  for (const f of ['gastoMedido', 'resumenDeSemanas', 'datosDeEntreno', 'cinturasRecientes']) {
    ok(new RegExp(f).test(monta), 'y reusa `' + f + '()`, que ya usa el cierre',
       'calcular lo mismo dos veces es garantizar que un día no coincidan, y ' +
       'la que ve la IA tiene que ser la del cierre');
  }
  // Nada de texto libre: las notas y los motivos los teclea gente y
  // entrarían en el prompt por el cuerpo de la petición.
  ok(!/\bnota\b|\bmotivo\b|chqNota/.test(monta),
     'y no manda texto escrito por nadie, solo números',
     'lo cualitativo entra por `memoria_ia` y `aprendido_cierre`, que se leen ' +
     'de la base justo para que no viajen por el cuerpo');
  // Y que un fallo no deje a nadie sin poder preguntar la cena.
  // UNA RED POR CADA PETICIÓN, no una suelta. Con `>= 1` bastaba con que
  // quedara cualquiera de las dos: una mutación quitó la del gimnasio y la
  // prueba siguió verde porque la de la cintura seguía ahí.
  const redes = (monta.match(/\['catch'\]|\.catch\(/g) || []).length;
  ok(redes >= 3, 'cada petición tiene su red, y el conjunto también (' + redes + ')',
     'preguntar la cena no puede romperse porque no se pudo leer el gimnasio');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

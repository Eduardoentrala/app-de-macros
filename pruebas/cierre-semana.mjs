// El cierre de semana: preguntar primero, decidir después.
//
// El orden importa y es lo que casi rompo. Al pedirlo, monté un aviso que
// al entrar llamaba a la IA directamente y le daba las calorías. Estaba
// mal: sin saber cómo se sintió la persona no hay con qué decidir, así que
// ese aviso habría dicho "no puedo ajustarte nada" todas las semanas.
//
// El orden bueno, que ya existía en `ofrecerChequeoSiEsSemanaNueva()`:
//
//   entrar en semana nueva → se abre "¿Cómo te fue la semana?"
//   → contesta hambre, energía y antojo
//   → "Revisar mi semana" → mira peso, semana y entreno
//   → calorías nuevas (o no) y el porqué
//   → "Entiendo" y se quita
//
// Aquí se fija ese orden para que no se vuelva a invertir.
import { readFileSync, readdirSync } from 'node:fs';
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

console.log('\n— Primero pregunta, y espera en la pantalla principal —');
{
  const i = APP.indexOf('function revisarChequeoPendiente(');
  const trozo = i > 0 ? APP.slice(i, i + 2200) : '';
  check('existe la revisión', i > 0);
  check('solo si es semana nueva', /chequeos_semanales\?select=semana/.test(trozo));
  check('filtra por usuario', /user_id=eq\.' \+ sesion\.user\.id/.test(trozo));

  // ---- Y NO SE RINDE HASTA QUE SE CONTESTA ----
  // Este es el fallo que costó una semana, dos veces.
  //
  // Primero: la hoja se marcaba como "ya mostrada" ANTES de contestarla, en
  // localStorage y con la fecha del día. Quien la cerraba sin llenarla y no
  // volvía a abrir la app ese día se quedaba sin calorías nuevas.
  //
  // Después se pasó la marca a sessionStorage, que muere al cerrar la app.
  // Mejor, pero el fondo seguía igual: era una VENTANA que saltaba al
  // abrir, y una ventana se cierra por reflejo.
  //
  // Ahora es un bloque fijo en el Diario, sin botón de cerrar. Lo único que
  // lo apaga es la fila en la base, o sea haberlo contestado de verdad.
  check('lo único que lo apaga es haberlo contestado',
    /pintarChequeoPendiente\(!\(filas && filas\.length\)\)/.test(trozo));
  check('ya no salta una ventana al abrir', !/setTimeout\(abrirChequeo/.test(APP),
    'una hoja que salta se cierra sin leerla, y ahi se pierde la semana');
  check('ni queda marca de «ya te la enseñe»', !/CLAVE_CHEQUEO/.test(APP),
    'cualquier marca puesta antes de contestar acaba enterrando el chequeo');
  check('el bloque no se puede quitar sin contestar',
    /id="chequeoPend" hidden/.test(HTML) &&
    !/id="chequeoPendCerrar"/.test(HTML));
}

console.log('\n— Las tres preguntas son las que deciden —');
{
  for (const q of ['hambre', 'energia', 'sueno'])
    check(`pregunta por ${q}`, new RegExp(`data-chq="${q}"`).test(HTML));
  check('y deja contar algo más', /id="chqNota"/.test(HTML));
  check('dice para qué sirve', /Sin esto, cambiarte las calorías sería adivinar/.test(HTML));

  // Siguen siendo TRES. El presupuesto es el que es: un cuestionario largo
  // se contesta en diagonal y entonces no mide nada.
  check('siguen siendo tres, no cuatro',
    (HTML.match(/class="chq-esc" data-chq=/g) || []).length === 3);
  // "Antojo" medía casi lo mismo que "Hambre" -la gente contestaba las dos
  // igual- y ocupaba una de las tres.
  check('ya no se pregunta el antojo', !/data-chq="apetito"/.test(HTML));
  check('y se guarda el sueño en su lugar', /sueno: q\.sueno \|\| null/.test(APP));
  check('la columna vieja se deja de mandar', !/apetito: q\.apetito/.test(APP));
}

console.log('\n— La IA ve las semanas de antes, no una suelta —');
{
  // Esto es lo que más cambia lo que el entrenador puede ver, y no le pide
  // nada más a la persona: los datos ya se guardaban y no se mandaban.
  // La función entera, contando llaves. Era una ventana de 900 caracteres y
  // se rompió sola en cuanto el `select` creció para traerse el resto del
  // historial: tres comprobaciones se pusieron rojas sin que nada dejara de
  // funcionar. Ya ha pasado tres veces hoy con ventanas así.
  const i = APP.indexOf('function chequeosDeAntes(');
  const trozo = (() => {
    if (i < 0) return '';
    let n = 0, j = APP.indexOf('{', i);
    for (; j < APP.length; j++) {
      if (APP[j] === '{') n++;
      else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
    }
    return APP.slice(i);
  })();
  check('se traen los chequeos anteriores', i > 0);
  check('con el sueño incluido', /select=semana,hambre,energia,sueno/.test(trozo));
  check('filtra por usuario', /user_id=eq\.' \+ sesion\.user\.id/.test(trozo));
  check('cuatro semanas, de la vieja a la nueva',
    /slice\(0, 4\)\.reverse\(\)/.test(trozo));
  // La de ahora se manda aparte y todavía no está guardada.
  check('descarta la semana en curso', /x\.semana !== isoDe\(anclaSemana\)/.test(trozo));
  check('sin historial se decide igual', /\['catch'\]\(function\(\)\{ return \[\]; \}\)/.test(trozo));

  const j = APP.indexOf("accion: 'semana'");
  const envio = APP.slice(j, j + 1600);
  check('y se le manda', /historial: extra\[1\]/.test(envio));
  // Tres consultas en paralelo: en fila, la persona miraría "Revisando…"
  // el triple de tiempo.
  check('las tres consultas van a la vez',
    /Promise\.all\(\[datosDeEntreno\(\), chequeosDeAntes\(\), cinturasRecientes\(\)\]\)/.test(APP));
}

console.log('\n— Y la cintura, que es lo que mide el cambio físico —');
{
  check('hay campo de cintura', /id="cinturaInput"/.test(HTML));
  // Solo aparece cuando toca: se esconde al medirla y vuelve al mes.
  // Pedirla a diario seria recoger ruido, porque el error de la cinta es
  // mayor que lo que cambia una cintura en una semana.
  check('el bloque empieza escondido', /id="cinturaBloque" hidden/.test(HTML));
  check('y dice que toca medirla', /Cintura \(cm\) · toca medirla/.test(HTML));
  check('dice cada cuánto', /Se pide una vez al mes/.test(HTML));
  check('hay un plazo, no un capricho', /var DIAS_ENTRE_CINTURAS = 28;/.test(APP));
  check('si nunca la midió, se la pide', /if\(!CINTURAS\.length\) return true;/.test(APP));
  check('se esconde al guardarla', /bloque\.hidden = !tocaMedirCintura\(\);/.test(APP));
  // Si volviera con el numero del mes pasado, se guardaria el viejo sin
  // querer al tocar Guardar.
  check('y el campo se vacía al esconderse',
    /if\(bloque\.hidden\) document\.getElementById\('cinturaInput'\)\.value = '';/.test(APP));
  check('y cómo medirla', /A la altura del ombligo, sin apretar/.test(HTML));
  check('con teclado de números', /id="cinturaInput"[^>]*inputmode="decimal"/.test(HTML));

  const i = APP.indexOf('function sbGuardarPeso(');
  const guardar = APP.slice(i, i + 700);
  check('se guarda junto al peso', /if\(cintura != null\) fila\.cintura_cm = cintura;/.test(guardar));
  // Mandar null la borraría: el upsert pisa la fila entera, y quien apunta
  // el peso a diario no se mide la cintura cada día.
  check('no se borra al apuntar el peso sin medirla',
    !/cintura_cm: cintura \|\| null/.test(guardar));

  // Un dedazo en la cintura no puede costarle el peso del día.
  check('un valor absurdo se ignora, no rechaza el peso',
    /if\(cin != null && \(cin < 40 \|\| cin > 200\)\) cin = null;/.test(APP));

  const j = APP.indexOf('function cinturasRecientes(');
  const cin = APP.slice(j, j + 700);
  check('se traen las medidas para la revisión', j > 0);
  // Salen de memoria: CINTURAS ya se llena al cargar los pesos, de la misma
  // tabla. Pedirlo otra vez seria pagar dos veces por el mismo dato.
  check('sin pedirlas otra vez a la base', /return Promise\.resolve\(CINTURAS\.slice\(-6\)/.test(cin));
  check('y se le mandan', /cinturas: extra\[2\]/.test(APP));

  // El historial, debajo de la grafica.
  check('hay lista de medidas', /id="cinturaHist"/.test(HTML));
  check('con su encabezado', /MEDIDAS DE CINTURA/.test(HTML));
  check('va debajo de la gráfica',
    HTML.indexOf('id="pesoChart"') < HTML.indexOf('id="cinturaHist"'));
  check('cada fila lleva la fecha', /Medida el ' \+ fmtFecha/.test(APP));
  // El numero solo no dice nada; la direccion si.
  check('y cuánto cambió', /var dif = previa \? Math\.round\(\(m\.cm - previa\.cm\)/.test(APP));
  check('bajar se ve distinto de subir', /dif < 0 \? 'baja' : \(dif > 0 \? 'sube'/.test(APP));
  check('la más reciente arriba', /CINTURAS\.slice\(\)\.reverse\(\)/.test(APP));
}

console.log('\n— La IA sabe qué hacer con lo nuevo —');
{
  check('mira la racha, no una semana suelta',
    /Hambre alta DOS O TRES seguidas/.test(FN));
  check('y no mueve nada por una sola', /Hambre alta UNA semana → no muevas nada/.test(FN));
  // Dormir mal da las mismas respuestas que un déficit excesivo. Sin esta
  // regla, se bajan calorías por un problema de descanso.
  check('distingue dormir mal de déficit excesivo',
    /sueño MALO → el problema es el descanso/.test(FN));
  check('y no toca calorías por falta de sueño',
    /NO le muevas las calorías: no arreglan dormir cinco/.test(FN));
  // El caso que hace abandonar a la gente creyendo que falló.
  check('peso plano con cintura bajando es progreso',
    /Peso plano y cintura BAJANDO → está perdiendo grasa/.test(FN));
  check('compara meses, no días sueltos',
    /Se mide una vez al mes, así que compara meses/.test(FN));
  check('con una sola medida no concluye',
    /Si solo hay una medida, no saques conclusiones/.test(FN));

  // Y que el contexto se lo lleve de verdad.
  check('el historial llega al contexto', /SEMANAS ANTERIORES/.test(FN));
  check('la cintura llega al contexto', /`\\nCINTURA:\\n`/.test(FN) || /CINTURA:/.test(FN));
  check('el sueño llega al contexto', /Sueño: \$\{encuesta\.sueno/.test(FN));
  check('y ya no manda el antojo', !/Apetito: \$\{encuesta\.apetito/.test(FN));
}

console.log('\n— Y solo DESPUÉS se deciden las calorías —');
{
  const i = APP.indexOf("document.getElementById('chqEnviar').addEventListener");
  // EL MANEJADOR ENTERO, contando llaves. Antes era una ventana de 3200
  // caracteres y se rompio sola en cuanto el cierre creyo tres lineas: media
  // docena de comprobaciones se pusieron rojas sin que nada hubiera dejado
  // de funcionar. Un numero de caracteres no es una frontera; la llave que
  // cierra si.
  const trozo = (() => {
    if (i < 0) return '';
    let n = 0, j = APP.indexOf('{', i);
    for (; j < APP.length; j++) {
      if (APP[j] === '{') n++;
      else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
    }
    return APP.slice(i);
  })();
  check('la revisión sale del botón, no del arranque', i > 0);
  check('manda las respuestas', /chequeo: respuestasChequeo\(\)/.test(trozo));
  check('manda el peso', /pesos: pesosRecientes/.test(trozo));
  // Con `true`: la que cierra, no la que acaba de empezar.
  //
  // Se comprueba QUE SE PIDE ASÍ y QUE ESO ES LO QUE VIAJA, en dos pasos,
  // en vez de exigir que las dos cosas estén escritas en la misma línea.
  // Ahora el resultado se guarda en una variable porque el historial de
  // semanas necesita los mismos números —recalcularlos daría otros, el
  // reloj corre— y la comprobación literal se rompió sin que nada dejara
  // de funcionar.
  const pedidoCierre = /(\w+)\s*=\s*datosDeLaSemana\(true\)/.exec(trozo);
  check('manda la semana que cierra',
    /datos: datosDeLaSemana\(true\)/.test(trozo) ||
    (pedidoCierre && new RegExp('datos: ' + pedidoCierre[1] + '\\b').test(trozo)),
    'sin el `true` se manda la semana en curso, que al abrirse está vacía');
  const pedidoSem = /(\w+)\s*=\s*resumenDeSemanas\(4\)/.exec(trozo);
  check('y las cuatro anteriores de contexto',
    /semanas: resumenDeSemanas\(4\)/.test(trozo) ||
    (pedidoSem && new RegExp('semanas: ' + pedidoSem[1] + '\\b').test(trozo)),
    'una semana suelta no distingue un tropiezo de una tendencia');
  // Sin el entreno, un peso plano siempre parece estancamiento.
  check('y manda el entreno', /entreno: extra\[0\]/.test(trozo));
  check('aplica las calorías si ajusta', /if\(r\.ajusto && r\.cal_nueva\) aplicarCaloriasNuevas\(r\.cal_nueva\)/.test(trozo));

  // LO QUE NO DEBE HABER: un camino que decida calorías al entrar, sin
  // haber preguntado nada. Se intentó y se quitó.
  check('nada decide calorías antes de preguntar',
    !/avisoDeCierreDeSemana/.test(APP),
    'ese camino llamaba a la IA sin las respuestas de la persona');
  check('y el aviso del coach no toca el cierre de semana',
    !/cierre_semana/.test(APP));
}

console.log('\n— Lee la semana que CIERRA, no la que empieza —');
{
  // EL FALLO QUE COSTÓ UNA SEMANA REAL. La revisión salta el primer día de
  // la semana nueva, y `datosDeLaSemana()` contaba desde el inicio de la
  // semana ACTUAL hasta hoy: un solo día, el de hoy, sin nada apuntado. La
  // IA recibía "0 días de 7" y decía con razón que no podía leer la semana.
  // Quien había apuntado los siete días se quedaba sin ajuste.
  const i = APP.indexOf('function datosDeLaSemana(');
  const trozo = i > 0 ? APP.slice(i, i + 1600) : '';
  check('la función sabe mirar atrás', /function datosDeLaSemana\(anterior\)/.test(APP));
  check('retrocede una semana entera', /desde\.setDate\(desde\.getDate\(\) - 7\);/.test(trozo));
  check('y se corta al empezar la nueva', /hasta = new Date\(anclaSemana\);/.test(trozo));
  check('la revisión pide la que cierra', /datosDeLaSemana\(true\)/.test(APP),
    'sin el true vuelve a contar la semana en curso, que está vacía');

  // El entreno tiene que cubrir el MISMO periodo o se comparan cosas
  // distintas: "entrenó más" mirando unos días y "comió menos" mirando otros.
  const j = APP.indexOf('function datosDeEntreno(');
  const ent = APP.slice(j, j + 1800);
  check('el entreno se alinea con la misma semana',
    /iniCerrada\.setDate\(iniCerrada\.getDate\(\) - 7\)/.test(ent));
  check('y descarta la semana en curso',
    /if\(f\.session_date >= finCerrada\) return;/.test(ent));
  // "Hace 6 días" solo cuadra si la revisión cae el mismo día de la semana,
  // y no cuadra nunca para quien no empieza en lunes.
  check('ya no parte por «hace 6 días»', !/var corte = isoDe\(haceDias\(6\)\)/.test(APP));
}

console.log('\n— Y con cuatro semanas de contexto —');
{
  // Una semana suelta miente: el peso se mueve un kilo por agua o sal sin
  // que cambie nada de grasa. Con cuatro puntos se distingue "no bajó" de
  // "bajó y todavía no se ve".
  const i = APP.indexOf('function resumenDeSemanas(');
  const res = i > 0 ? APP.slice(i, i + 2600) : '';
  check('hay resumen por semanas', i > 0);
  check('cada una con su fecha', /semana: isoDe\(ini\)/.test(res));
  check('con los días apuntados', /dias_apuntados: dias/.test(res));
  // El peso MEDIO de la semana, no el del día que se pesó: es lo que quita
  // el ruido del día a día.
  check('y con el peso MEDIO, no el último', /peso_medio: medio/.test(res) &&
    /pesos\.reduce\(function\(a,b\)\{ return a\+b; \}, 0\) \/ pesos\.length/.test(res));
  check('se mandan cuatro', /resumenDeSemanas\(4\)/.test(APP));

  // Los pesos, con fecha. Ocho números sueltos no dicen si son de ocho días
  // o de tres meses, y eso cambia lo que significan.
  check('los pesos van fechados', /return \{ fecha: k, kg: Number\(PESOS\[k\]\) \};/.test(APP));
  check('y de las últimas cuatro semanas',
    /desdePesos\.setDate\(desdePesos\.getDate\(\) - 28\)/.test(APP));
  check('ya no van como lista pelada', !/\.slice\(-8\)\s*\n?\s*\.map\(function\(k\)\{ return PESOS\[k\]; \}\)/.test(APP));

  // El entreno también, que el volumen sube y baja con las descargas.
  check('el entreno trae su tendencia', /por_semana: porSemana/.test(APP));

  // Y que la función del asistente lo reciba y lo pinte.
  check('llegan al contexto del modelo', /LAS SEMANAS ANTERIORES/.test(FN));
  check('los pesos con su fecha', /\$\{x\.fecha\}: \$\{x\.kg\} kg/.test(FN));
  check('y el entreno semana a semana', /ENTRENO, SEMANA A SEMANA/.test(FN));
  check('el encabezado dice que es la que cierra', /LA SEMANA QUE SE CIERRA/.test(FN));

  // ---- Fotos y cintura, con el mismo criterio ----
  // De las fotos va el NÚMERO, nunca las imágenes: quedó acordado que eso
  // sería mensual, a petición y con consentimiento aparte, porque el aviso
  // de privacidad de hoy no cubre que las fotos del cuerpo salgan de la app.
  check('cuenta las fotos de cada semana', /fotos: cuantasFotos/.test(APP));
  check('y llegan al contexto', /\$\{s\.fotos\} fotos/.test(FN));
  check('pero NO se manda ninguna imagen',
    !/foto.*base64|image\/jpeg/i.test(APP.slice(APP.indexOf('function resumenDeSemanas('),
                                                APP.indexOf('function resumenDeSemanas(') + 1800)));
  check('y se le dice que no las ve', /NUNCA las fotos en sí: no\s*\n?\s*las ves/.test(FN));
  // Tres semanas sin fotos se menciona una vez; subirlas no necesita
  // comentario, y a quien nunca las sube no se le insiste.
  check('solo lo menciona si lleva tres semanas sin subirlas',
    /lleva tres\s*\n?\s*semanas o más sin subir ninguna/.test(FN));
  check('y a quien nunca sube fotos no le insiste',
    /nunca ha subido fotos, ni lo menciones/.test(FN));

  // La cintura, pedida cuando lleva mucho sin medirse.
  check('pide la cintura si falta o está vieja',
    /la última es de hace más de mes y\s*\n?\s*medio, pídesela UNA vez/.test(FN));

  // Y que sepa qué hacer con ellas.
  check('sabe que una semana suelta miente', /El peso de UNA\s*\n?\s*semana miente/.test(FN));
  check('una plana dentro de un mes que baja no es estancamiento',
    /Una semana plana dentro de un mes que baja → todo va bien/.test(FN));
  check('tres o cuatro planas sí lo son',
    /Tres o cuatro semanas planas seguidas → ahí sí hay estancamiento/.test(FN));
  check('y con poca historia es prudente',
    /Si solo hay una o dos semanas de historia, DILO y sé prudente/.test(FN));
}

console.log('\n— El botón de «Entiendo» —');
{
  // Se busca la LLAMADA, sin clavar sus argumentos: `guardarChequeo(r)` pasó
  // a llevar además la foto de la semana para el historial, y este ancla
  // dejó de encontrarse. `indexOf` devolvió -1, el recorte salió vacío y las
  // cuatro comprobaciones de aquí abajo se pusieron rojas sin que el botón
  // hubiera cambiado en nada.
  const i = APP.search(/guardarChequeo\(r[,)]/);
  const trozo = i < 0 ? '' : APP.slice(i, i + 600);
  check('se guarda el chequeo', i >= 0,
    'sin esto, el lunes siguiente vuelve a salir como si no lo hubiera contestado');
  check('el botón pasa a decir Entiendo', /btn\.textContent = 'Entiendo';/.test(trozo));
  check('y queda pulsable', /btn\.disabled = false;[\s\S]{0,80}'Entiendo'/.test(trozo));
  check('se marca que ahora cierra', /btn\.dataset\.modo = 'cerrar';/.test(trozo));
  // "Ahora no" ya no significa nada cuando la semana ya se revisó.
  check('«Ahora no» se retira', /chqCerrar'\)\.hidden = true;/.test(trozo));

  const j = APP.indexOf("document.getElementById('chqEnviar').addEventListener");
  const manejador = APP.slice(j, j + 700);
  check('al pulsarlo se cierra la hoja',
    /if\(btn\.dataset\.modo === 'cerrar'\)\{[\s\S]{0,120}classList\.remove\('open'\)/.test(manejador));
  // Se mira ANTES de deshabilitar, o el clic de cerrar gastaría otra
  // consulta de IA.
  check('y no gasta otra consulta',
    manejador.indexOf("dataset.modo === 'cerrar'") < manejador.indexOf('btn.disabled = true'));
}

console.log('\n— Al reabrirla vuelve a revisar, no a cerrar —');
{
  // La regresión evidente: si la hoja se reabre con el botón todavía en
  // modo cerrar, pulsarlo la cerraría sin revisar nada.
  const i = APP.indexOf('function abrirChequeo(');
  const trozo = APP.slice(i, i + 1400);
  check('se le quita el modo cerrar', /delete btn\.dataset\.modo;/.test(trozo));
  check('vuelve «Ahora no»', /chqCerrar'\)\.hidden = false;/.test(trozo));
  check('y el botón vuelve a su texto', /btn\.textContent = 'Revisar mi semana';/.test(trozo));
}

console.log('\n— El mensaje dice las tres cosas que se pidieron —');
{
  const i = FN.indexOf('QUÉ TIENE QUE LLEVAR EL MENSAJE');
  const trozo = i > 0 ? FN.slice(i, i + 1400) : '';
  check('el texto se lo exige', i > 0);
  check('1: en cuántas calorías está', /EN CUÁNTAS CALORÍAS ESTÁ/.test(trozo));
  check('2: si se mueven y por qué', /SI SE MUEVEN O NO, Y POR QUÉ/.test(trozo));
  check('3: una cosa para la semana que entra', /UNA COSA para la semana que entra/.test(trozo));
  // La regla vieja prohibía cifras. Sin el número, "no te muevo nada" no
  // le dice a nadie con cuánto se queda.
  check('ya no prohíbe decir el número',
    !/"mensaje" no lleva cifras salvo las calorías nuevas/.test(FN));
  check('pero sigue sin listas', /Nada de listas ni viñetas/.test(trozo));
  // Distinguirlos es lo que hace útil el mensaje: uno es "vas bien" y el
  // otro es "no sé cómo vas".
  check('distingue los dos motivos de no ajustar',
    /porque no tengo con qué leer tu semana/.test(trozo));
}

console.log('\n— Y no quedó nada del camino que se descartó —');
{
  const migraciones = readdirSync(join(RAIZ, 'supabase', 'migrations'));
  check('sin migraciones huérfanas',
    !migraciones.some(f => /cierre_de_semana|aviso_de_cierre/.test(f)),
    migraciones.filter(f => /cierre/.test(f)).join(', '));
  check('el enum de avisos sigue con sus cuatro motivos',
    !/cierre_semana/.test(readFileSync(
      join(RAIZ, 'supabase', 'migrations', '0030_avisos_del_coach.sql'), 'utf8')));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

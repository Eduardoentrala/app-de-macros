// El tope por plan y la memoria del asistente.
//
// El tope no es un detalle tecnico: es lo que decide si el negocio gana o
// pierde. Con un tope unico de 5 para los dos planes, un usuario intenso de
// 99 pesos costaba ~$7 al mes y dejaba ~$4.75: cuanto mas le gustaba la
// app, mas dinero se perdia con el. Si alguien vuelve a igualar los topes,
// esto salta.
//
// La memoria es lo otro: si deja de guardarse o de inyectarse, el asistente
// vuelve a ser un buscador con buenos modales y nadie paga 199 por eso.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(
  join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const SQL = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0029_memoria_del_asistente.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Cada plan tiene su tope —');
{
  const m = FN.match(/const TOPES = \{ apagada: (\d+), normal: (\d+), plus: (\d+) \}/);
  check('los tres topes estan escritos', !!m, 'no se encontro la tabla TOPES');
  if (m) {
    const [, apagada, normal, plus] = m.map(Number);
    check('apagada no gasta nada', apagada === 0);
    check('plus tiene mas que normal', plus > normal, `normal ${normal}, plus ${plus}`);
    // El margen sale de aqui. A $0.046 la consulta con foto, 30 dias:
    const costeNormal = normal * 0.046 * 30;
    check('el plan normal no puede dar perdidas', costeNormal < 4.75,
      `en el peor caso costaria $${costeNormal.toFixed(2)} y deja $4.75`);
  }
  check('ya no queda un tope unico', !/const TOPE_DIARIO = \d+;/.test(FN),
    'una constante suelta se vuelve a usar para todos sin querer');
  check('el tope se elige por el nivel de la persona',
    /TOPES\[nivel as keyof typeof TOPES\]/.test(FN));
  check('y si el nivel es raro, cae en el mas bajo de pago',
    /\?\? TOPES\.normal/.test(FN), 'nunca debe caer en el de plus por defecto');
}

console.log('\n— Lo que dice la app cuadra con lo que hace la funcion —');
{
  // Prometer cinco y dar tres es como se pierde la confianza de golpe.
  const m = FN.match(/const TOPES = \{ apagada: \d+, normal: (\d+), plus: (\d+) \}/);
  const palabras = { 1:'Una', 2:'Dos', 3:'Tres', 4:'Cuatro', 5:'Cinco',
                     10:'Diez', 15:'Quince', 20:'Veinte' };
  if (m) {
    check(`el plan normal anuncia ${palabras[+m[1]]?.toLowerCase()} consultas`,
      APP.includes(`${palabras[+m[1]]} consultas al día`),
      `la funcion da ${m[1]}`);
    check(`el plan plus anuncia ${palabras[+m[2]]?.toLowerCase()} consultas`,
      APP.includes(`${palabras[+m[2]]} consultas al día`),
      `la funcion da ${m[2]}`);
  }
  check('ya no se anuncian cinco en ningun plan',
    !APP.includes('Cinco consultas al día'));
}

console.log('\n— La memoria se guarda —');
{
  check('la columna existe con su tope', /memoria_ia text/.test(SQL) &&
    /length\(memoria_ia\) <= 1200/.test(SQL));
  check('el esquema del chat la devuelve', /memoria: \{ anyOf:/.test(FN));
  check('la app la guarda en el perfil',
    /memoria_ia: String\(texto\)/.test(APP));
  check('y alguien llama a esa funcion',
    (APP.match(/guardarMemoriaIA\(/g) || []).length >= 2);
  // Recortar solo en la base haria fallar el guardado entero por un
  // caracter de mas, y se perderia por nada.
  check('se recorta antes de llegar al CHECK',
    /salida\.memoria\.trim\(\)\.slice\(0, 1200\)/.test(FN));
}

console.log('\n— Y se usa —');
{
  check('se lee de la base y se inyecta', /LO QUE YA SABES DE ESTA PERSONA/.test(FN));
  // Si viniera por el cuerpo de la peticion, cualquiera podria escribir en
  // el sistema del modelo desde la consola del navegador.
  const i = FN.indexOf('let loQueSe');
  const bloque = FN.slice(i, i + 500);
  check('la memoria se lee de la base, no del cuerpo',
    /admin[\s\S]{0,80}\.from\('profiles'\)/.test(bloque),
    'leerla de cuerpo.memoria dejaria inyectar lo que sea en el sistema');
  check('solo Plus la tiene', /esPlus \? SISTEMA_EVENTOS \+ SISTEMA_MEMORIA/.test(FN));
  check('y a quien no es Plus se le borra de la salida',
    /if \(!esPlus\) \{ salida\.evento = null; salida\.memoria = null; \}/.test(FN));
}

console.log('\n— No se guarda lo que ya esta en otro sitio —');
{
  const i = FN.indexOf('LO QUE RECUERDAS DE ESTA PERSONA');
  const s = FN.slice(i, i + 1800);
  check('se le dice que no duplique lo que ya tiene', /no lo dupliques/.test(s));
  check('ni que guarde diagnosticos', /Diagn[oó]sticos/.test(s));
  // Ojo al escribir estas comprobaciones: el prompt va envuelto a 72
  // columnas, asi que una frase puede partirse por cualquier hueco. Se
  // busca con \s+ o se falla por un salto de linea.
  check('la memoria se reescribe entera, no se acumula',
    /no\s+un\s+a[ñn]adido/.test(s),
    'acumular la vuelve un ladrillo que se paga cada mensaje');
}

console.log('\n— Dictar, en Plus —');
{
  const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
  check('hay boton de microfono', HTML.includes('id="iaHablar"'));
  // Nace escondido: si el navegador no sabe transcribir, nunca aparece.
  check('nace escondido', /id="iaHablar"[^>]*hidden/.test(HTML),
    'ensenarlo y que no haga nada es peor que no tenerlo');

  // Hasta el final de la función, NO 400 caracteres. Una ventana fija se
  // desborda en cuanto alguien añade un comentario, y entonces la prueba
  // deja de mirar el código sin que nadie lo note.
  const i = APP.indexOf('function pintarBotonHablar(');
  const p = APP.slice(i, APP.indexOf('\n  }', i));
  check('solo se enseña con soporte del navegador', /!Reconocedor/.test(p));
  // Dictar es escribir aunque lo transcriba el teléfono. Y la comprobación
  // tiene que estar DENTRO de esta función: `pintarPlanIA` la vuelve a
  // llamar cada vez que se repinta el nivel de IA, así que apagar el botón
  // desde fuera duraba hasta el siguiente repintado y reaparecía solo.
  check('y no si le apagaron las preguntas', /MIS_LLAVES\.chat !== false/.test(p),
    'si no, el microfono reaparece al repintar el nivel de IA');
  check('y solo con Plus', /MI_NIVEL_IA !== 'plus'/.test(p));
  check('se repinta al saber el plan',
    (APP.match(/pintarBotonHablar\(\)/g) || []).length >= 2,
    'si no se llama, el boton se queda escondido para siempre');

  // Lo unico que puede hacer dano de verdad aqui: dejar el microfono
  // abierto escuchando de fondo despues de salir del asistente.
  check('se para al cerrar el asistente',
    /getElementById\('iaCerrar'\)\.addEventListener\('click', pararDeOir\)/.test(APP));
  check('y al terminar solo', /r\.onend = function\(\)\{[\s\S]{0,120}pararDeOir\(\)/.test(APP));
  check('volver a pulsar lo apaga', /if\(oyendo\)\{ pararDeOir\(\); return; \}/.test(APP));

  // Esta prueba fijaba lo contrario y pasaba con la función rota: daba por
  // bueno silenciar 'no-speech' porque parecía ruido. Y era LA señal cuando
  // el teléfono abre el micro y no transcribe -dictado del sistema apagado-.
  // Callarla dejaba a la persona mirando un botón que late sin decir nada.
  check('el silencio SÍ se avisa', /if\(e\.error === 'no-speech'\)\{ avisarSinVoz\(\)/.test(APP));
  check('y el aviso dice dónde mirar', /dictado est[eé] activado/.test(APP),
    '"no te entendí" no ayuda a nadie a arreglarlo');
  check('volver a pulsar sigue sin avisar', /if\(e\.error === 'aborted'\) return;/.test(APP));
  // Si el micro se abre y no llega nada, el botón no puede latir para
  // siempre: hay un reloj que corta y lo dice.
  check('hay reloj para el micro mudo', /ESPERA_MUDA/.test(APP));
  check('y se cancela al parar', /if\(relojOido\)\{ clearTimeout\(relojOido\)/.test(APP));
  check('habla en español de Mexico', /r\.lang = 'es-MX'/.test(APP));
  // Sin resultados parciales parece que no hace nada y se vuelve a pulsar.
  check('enseña el texto mientras hablas', /r\.interimResults = true/.test(APP));

  const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');
  check('se nota que esta escuchando', /\.ia-icono\.oyendo/.test(CSS));
  check('y se respeta a quien no quiere animaciones',
    /prefers-reduced-motion[\s\S]{0,120}\.ia-icono\.oyendo\{animation:none/.test(CSS));

  // No viaja audio a ningun sitio: eso es lo que lo hace gratis.
  check('no manda el audio a ningun servidor',
    !/MediaRecorder|audio\/webm|\/transcribe/.test(APP));
}

console.log('\n— La foto se puede tomar O elegir —');
{
  const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
  // `capture` abre la camara DIRECTO y quita la opcion de la galeria. Es un
  // atributo que parece una mejora y en realidad es una restriccion.
  const entradas = [...HTML.matchAll(/<input[^>]*type="file"[^>]*>/g)].map(m => m[0]);
  const conCaptura = entradas.filter(e => /\scapture=/.test(e));
  check('ninguna subida fuerza la cámara', conCaptura.length === 0,
    conCaptura.join(' | '));
  check('la del asistente sigue aceptando imágenes',
    /id="iaArchivo"[^>]*accept="image\/\*"/.test(HTML));
  check('y las tres subidas siguen existiendo', entradas.length === 3,
    `hay ${entradas.length}`);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

// Los tres recordatorios del Diario: peso, fotos y cintura.
//
// LO QUE SE PIDIÓ, textualmente:
//
//   «recuerdame [...] que me tengo que pesar eso recuerdamelo a diario al
//    presionarlo que me mande a apuntar mi peso, ya que se haya apuntado
//    que ya no salga hasta el proximo dia y tambien su respectivo boton x
//    para cerrar la notificacion, tambien en las fotos lo mismo pero esas
//    solo una vez a la semana cuando te toque subir tu foto, asi mismo la
//    medicion [...] una vez al mes cuando toque»
//
// Son cuatro reglas por tarjeta, y las cuatro se comprueban aquí:
//   · sale cuando toca
//   · al tocarla, lleva a hacerlo
//   · se va SOLA en cuanto está hecho
//   · la × la calla, pero solo hasta el ciclo siguiente
//
// Y una quinta que no se pidió pero que decide si sirve: que el ciclo se
// mida con la fecha del TELÉFONO. Con la de UTC, a partir de las 18:00 en
// México el recordatorio del peso se daría por hecho un día antes.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'diario.css'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// El cuerpo ENTERO de una función, contando llaves.
//
// Antes esto se hacía con `APP.slice(i, i + 900)`, y esa ventana ya se ha
// quedado corta varias veces: se añaden líneas a la función, lo que se
// buscaba cae fuera del recorte, y la prueba se pone roja sin que nada se
// haya roto. Peor todavía sería al revés -que la ventana llegue a la
// función siguiente y encuentre allí lo que ya no está aquí-, porque eso
// da un verde falso. Contando llaves no pasa ninguna de las dos.
const cuerpoDe = (fuente, nombre) => {
  const i = fuente.indexOf('function ' + nombre + '(');
  if (i < 0) return '';
  let n = 0, j = fuente.indexOf('{', i);
  for (let k = j; k < fuente.length; k++) {
    if (fuente[k] === '{') n++;
    else if (fuente[k] === '}' && --n === 0) return fuente.slice(i, k + 1);
  }
  return fuente.slice(i);
};

console.log('\n— Las tres tarjetas están, y bien armadas —');
{
  for (const [id, ir] of [['recPeso', 'peso'], ['recFotos', 'fotos'], ['recCintura', 'cintura']]) {
    const i = HTML.indexOf(`id="${id}"`);
    const t = HTML.slice(i, i + 700);
    check(`${id} existe y arranca escondida`, i > 0 && /hidden/.test(t.slice(0, 60)));
    check(`  · su cuerpo lleva a «${ir}»`, new RegExp(`data-rec-ir="${ir}"`).test(t));
    check(`  · y tiene su ×`, new RegExp(`data-rec-cerrar="${ir}"`).test(t));
  }

  // UN <button> DENTRO DE OTRO <button> NO ES HTML VÁLIDO. El navegador lo
  // "arregla" sacando el de dentro fuera del padre, y la × acaba flotando
  // en un sitio que no es. Por eso son dos botones hermanos y la tarjeta es
  // un <div>.
  const grupo = HTML.slice(HTML.indexOf('<div class="recordatorios">'),
                           HTML.indexOf('<div class="section-label">Tu día de hoy'));
  //
  // Se mira DENTRO de cada `.rec-cuerpo`, de su apertura a su `</button>`.
  // El primer intento fue `/<button class="rec-cuerpo">[\s\S]*?<button/`, y
  // pasaba siempre: la búsqueda perezosa saltaba al `</button>` y encontraba
  // el botón HERMANO de la ×, que está exactamente donde debe estar. Una
  // prueba que se pone roja con el código bueno es peor que no tenerla.
  const cuerpos = grupo.split('<button class="rec-cuerpo"').slice(1)
    .map(t => t.slice(0, t.indexOf('</button>')));
  check('ninguna × va dentro del botón que navega',
    cuerpos.length === 3 && cuerpos.every(c => !c.includes('<button')),
    'un <button> dentro de otro lo desmonta el navegador y la × acaba fuera de sitio');
  check('los cuatro avisos viven en el mismo grupo',
    /id="recPeso"/.test(grupo) && /id="recFotos"/.test(grupo) &&
    /id="recCintura"/.test(grupo) && /id="avisoFotos"/.test(grupo),
    'el de la vispera estaba debajo del anillo: dos avisos de fotos en dos sitios de la misma pantalla');
}

console.log('\n— Cada uno con su ciclo —');
{
  const fn = cuerpoDe(APP, 'cicloDeRecordatorio');
  check('la función existe', !!fn);
  check('peso: por día', /if\(cual === 'peso'\)\s+return isoDe\(HOY\);/.test(fn));
  check('fotos: por semana', /if\(cual === 'fotos'\) return claveSemana\(HOY\);/.test(fn));
  check('cintura: por mes', /return isoDe\(HOY\)\.slice\(0, 7\);/.test(fn));

  // El mes tiene que salir de `isoDe`, que ya usa la fecha del teléfono.
  // `toISOString().slice(0,7)` da el mes en UTC, y la última noche de cada
  // mes -desde las 18:00 en México- devolvería el siguiente: la × pulsada
  // el 31 de agosto se guardaría como "septiembre" y el recordatorio no
  // volvería a salir hasta octubre.
  check('el mes NO sale de toISOString', !/toISOString\(\)\.slice\(0, ?7\)/.test(fn),
    'seria el mes en UTC: la ultima noche del mes daria el siguiente');

  // Lo que hace que vuelva no es borrar nada, es que la clave deje de
  // coincidir. Si se guardara un simple "ya lo cerré", no volvería jamás.
  const callado = cuerpoDe(APP, 'recordatorioCallado');
  check('«callado» se compara contra el ciclo, no contra un sí/no',
    /localStorage\.getItem\(CLAVE_REC \+ cual\) === cicloDeRecordatorio\(cual\)/.test(callado),
    'guardar un simple «ya lo vio» dejaria el recordatorio apagado para siempre');
  check('y sin almacenamiento, mejor que salga',
    /catch\(e\)\{ return false; \}/.test(callado),
    'equivocarse hacia el lado de recordar de mas es barato; hacia el otro, no');
}

console.log('\n— Salen cuando toca —');
{
  const fn = cuerpoDe(APP, 'revisarRecordatorios');
  check('la función existe', !!fn);
  check('peso: si no hay peso de hoy',
    /PESOS\[isoDe\(HOY\)\] == null && !recordatorioCallado\('peso'\)/.test(fn));
  check('fotos: si es el día y faltan',
    /yaEsDiaDeFotos\(\) && faltanFotosDeLaSemana\(\) && !recordatorioCallado\('fotos'\)/.test(fn));
  check('cintura: si toca medirla',
    /tocaMedirCintura\(\) && !recordatorioCallado\('cintura'\)/.test(fn));

  // «Hoy toca» solo es verdad el día que toca.
  check('el título no dice «hoy» los días que no es hoy',
    /HOY\.getDay\(\) === inicioSemana/.test(fn) && /'Aún no subes tus 4 fotos'/.test(fn),
    'una app que miente en algo comprobable deja de valer para lo que no se puede comprobar');
}

console.log('\n— Y se van solos, sin tocar la × —');
{
  // Esto es lo que hace que «ya que se haya apuntado que ya no salga» sea
  // verdad venga el dato de donde venga: del botón Guardar, de la base al
  // abrir la app, o de deshacer un guardado que falló.
  const pregunta = n => cuerpoDe(APP, n).includes('revisarRecordatorios()');
  check('se pregunta al repintar el peso',    pregunta('pintarPeso'));
  check('se pregunta al repintar la cintura', pregunta('pintarCintura'));
  check('se pregunta al repintar las fotos',  pregunta('pintarFotos'));
  check('y al cargar los datos de la base', /revisarAvisoDeFotos\(\);\s*\n\s*revisarRecordatorios\(\);/.test(APP));

  // Las fotos se preguntan contra la semana de HOY. `pintarFotos` recibe
  // `semanaFoto`, que se mueve con las flechas: mirar las fotos de hace un
  // mes no puede apagar el recordatorio de esta semana.
  check('las fotos se cuentan contra la semana de HOY',
    /FOTOS\[claveSemana\(HOY\)\]/.test(cuerpoDe(APP, 'faltanFotosDeLaSemana')),
    'con semanaFoto, pasar a ver un mes atras apagaria el recordatorio de esta semana');
}

console.log('\n— Y no puede reventar el arranque —');
{
  // ESTO PASÓ, y se vio en el navegador antes de publicarlo:
  //
  //   Uncaught TypeError: Cannot read properties of undefined (reading '2026-W34')
  //
  // `pintarPeso()` corre en el arranque y pregunta por los recordatorios.
  // En ese momento `var FOTOS` y `var POSES` están declaradas pero valen
  // `undefined` -se asignan cientos de líneas más abajo-. Leer `FOTOS[...]`
  // lanzaba, y como todo el guion es un solo bloque, se llevaba por delante
  // TODOS los oyentes que se enganchan después. La app abría y no respondía
  // a nada: ni un botón.
  const fn = cuerpoDe(APP, 'faltanFotosDeLaSemana');
  check('se comprueba que FOTOS y POSES ya existan', /if\(!FOTOS \|\| !POSES\) return false;/.test(fn),
    'sin esto revienta en el arranque y se queda sin enganchar TODO lo que va despues');

  // La guarda tiene que ir ANTES de la primera lectura, no después.
  check('y la guarda va antes de leerlos',
    fn.indexOf('if(!FOTOS || !POSES)') < fn.indexOf('FOTOS[claveSemana'),
    'una guarda despues de la lectura no guarda nada');

  // Se declaran DESPUÉS del sitio donde se usan: por eso hace falta.
  check('el orden que lo provoca sigue ahí',
    APP.indexOf('var FOTOS = {}') > APP.indexOf('function pintarPeso('),
    'si algun dia FOTOS sube por encima, la guarda sobra pero no estorba');
}

console.log('\n— El día de fotos es el de cada quien —');
{
  const fn = cuerpoDe(APP, 'yaEsDiaDeFotos');
  check('la función existe', !!fn);
  check('sale de inicioSemana, no de un día fijo', /inicio == null \? inicioSemana : inicio/.test(fn),
    'la semana empieza donde dice week_start_dow: para Eduardo, el martes');

  // Se ejecuta de verdad, no se lee. La cuenta de posiciones dentro de la
  // semana ISO es justo el sitio donde es fácil equivocarse en uno.
  //
  // Y se ejecuta LA DEL FICHERO, no una copia escrita aquí. Al probar en
  // negativo -cambiando `inicioSemana` por un lunes fijo- solo se puso roja
  // la comprobación de texto: la copia seguía siendo la buena y daba verde
  // sobre código malo. Una prueba funcional que no lee el código que dice
  // probar mide su propia copia, y eso no es probar nada.
  const fabricar = new Function('inicioSemana',
    cuerpoDe(APP, 'yaEsDiaDeFotos') + '\nreturn yaEsDiaDeFotos;');
  const yaEsDiaDeFotos = (cuando, inicio, arranquePorDefecto) =>
    fabricar(arranquePorDefecto)(cuando, inicio);
  const dia = n => new Date(2026, 7, 17 + n);   // 17 ago 2026 = lunes
  const NOMBRES = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
  // Se pasa el día de arranque por DEFECTO -`inicioSemana`- y no como
  // argumento. Al principio se pasaba como argumento y el negativo no lo
  // pillaba: cambiar `inicioSemana` por un lunes fijo no cambiaba nada
  // porque el argumento siempre venía puesto y ganaba él. El camino que usa
  // la app de verdad es el otro: `yaEsDiaDeFotos()`, sin argumentos.
  const sale = inicio => NOMBRES.filter((_, n) => yaEsDiaDeFotos(dia(n), null, inicio));

  // Eduardo empieza en martes: el lunes NO, porque ese día por la noche le
  // sale el aviso de la víspera diciendo «mañana toca».
  check('empezando en martes: del martes en adelante',
    sale(2).join() === 'martes,miércoles,jueves,viernes,sábado,domingo',
    'el lunes le sale el aviso de la vispera: los dos a la vez se contradicen');
  check('empezando en lunes: toda la semana', sale(1).length === 7);
  check('empezando en domingo: solo el domingo', sale(0).join() === 'domingo',
    'su vispera es el sabado por la noche, asi que cuadra');
}

console.log('\n— La × calla, no borra —');
{
  const i = APP.indexOf("var x = t.closest('[data-rec-cerrar]');");
  const fn = APP.slice(i, i + 500);
  check('guarda el ciclo en curso', /localStorage\.setItem\(CLAVE_REC \+ cual, cicloDeRecordatorio\(cual\)\)/.test(fn));
  check('y repinta al momento', /revisarRecordatorios\(\);/.test(fn));
  check('el guardado va protegido', /try\{ localStorage\.setItem/.test(fn),
    'en navegacion privada setItem lanza, y sin try se llevaria el resto del oyente');
  check('va en el navegador y no en la base', !/sb[A-Z]\w*\(/.test(fn),
    'es una preferencia de pantalla, no un dato: no merece una tabla');

  // Por delegación, como el chequeo. Estas tarjetas se esconden y se
  // enseñan constantemente.
  check('se escucha en document, no en cada tarjeta',
    /document\.addEventListener\('click', function\(e\)\{[\s\S]{0,300}data-rec-cerrar/.test(APP));

  // La cintura no tiene pantalla propia: se apunta en la del peso, en el
  // campo que `pintarCintura` destapa cuando toca.
  check('cintura lleva a la pantalla del peso',
    /ir\.dataset\.recIr === 'cintura' \? 'peso' : ir\.dataset\.recIr/.test(APP));
  check('y si navegar fallara, se vería', /No pude abrirlo: /.test(APP),
    'sin esto el sintoma seria «hace la animacion y no pasa nada», que ya costo una tarde');
}

console.log('\n— Y se leen con el sol de frente —');
{
  // El texto es blanco fijo sobre color fijo, así que el contraste se puede
  // calcular aquí sin navegador. El mínimo legible es 4.5.
  const lin = v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
  const lum = hex => { const n = parseInt(hex.slice(1), 16);
    return [16, 8, 0].map(s => lin(((n >> s) & 255) / 255))
      .reduce((a, v, i) => a + [.2126, .7152, .0722][i] * v, 0); };
  const contra = hex => 1.05 / (lum(hex) + .05);

  const color = clase => (CSS.match(new RegExp('\\.' + clase + '\\s*\\{background:(#[0-9a-f]{6})')) || [])[1];
  for (const [clase, nombre] of [['rec-peso', 'peso'], ['rec-fotos', 'fotos'], ['rec-cintura', 'cintura']]) {
    const c = color(clase);
    check(`${nombre}: ${c} da ${contra(c).toFixed(2)} de contraste`, c && contra(c) >= 4.5,
      'los tonos de partida daban 2.6 y 3.3: se ven en un monitor a oscuras y se pierden en la calle');
  }
  check('el subtítulo no se queda corto por la transparencia',
    /\.rec-txt span\{[^}]*rgba\(255,255,255,\.94\)/.test(CSS),
    'a .88 se quedaba en 4.2, justo por debajo del minimo');

  // El aviso de la víspera y el de «te faltan las fotos» se ven juntos en
  // la misma pantalla. Con dos azules distintos parecerían dos cosas sin
  // relación cuando son la misma.
  const azulRec = color('rec-fotos');
  const azulAviso = (CSS.match(/\.aviso-fotos\{[\s\S]*?background:(#[0-9a-f]{6})/) || [])[1];
  check('la víspera usa el mismo azul que las fotos', azulRec === azulAviso,
    `rec-fotos=${azulRec} vs aviso-fotos=${azulAviso}`);

  // La × está pegada al borde de la pantalla y justo al lado de algo que
  // navega a otra pantalla: fallarla sale caro.
  check('la × llega a 44 px de blanco táctil', /\.rec-x::after\{content:'';position:absolute;inset:-7px;\}/.test(CSS));
  check('y el cuerpo no la pisa', /\.rec-cuerpo\{[\s\S]*?flex:1;min-width:0;/.test(CSS));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

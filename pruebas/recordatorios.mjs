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
const BASE = readFileSync(join(RAIZ, 'docs', 'estilos', 'base.css'), 'utf8');

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
  // La semana de la PERSONA, no la ISO. Con `claveSemana(HOY)`, a quien
  // empieza en martes la × pulsada el domingo se le deshacía sola el lunes,
  // en mitad de su propia semana.
  check('fotos: por semana de cada quien', /if\(cual === 'fotos'\) return claveDeMisFotos\(\);/.test(fn));
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
  // Sin «¿ya es mi día?»: el cajón de `claveDeMisFotos` YA es el de la
  // semana de esta persona, así que «faltan fotos» solo puede ser cierto
  // dentro de su semana. La ventana sale de siete días para todos.
  check('fotos: si faltan las de su semana',
    /faltanFotosDeLaSemana\(\) && !recordatorioCallado\('fotos'\)/.test(fn));
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
  check('y al cargar los datos de la base',
    /revisarAvisoDeFotos\(\);[\s\S]{0,400}revisarRecordatorios\(\);/.test(APP));
  // Y con el día de arranque ya leído del perfil: antes de eso `inicioSemana`
  // vale el lunes por defecto y apuntaría al cajón que no es.
  check('y la semana de fotos se reancla tras cargar el perfil',
    APP.indexOf('semanaFoto = inicioDeMiSemana();', APP.indexOf('inicioSemana = dow;')) > 0,
    'sin esto, a quien no empieza en lunes las fotos se le archivan en otro cajon');

  // Las fotos se preguntan contra la semana de HOY. `pintarFotos` recibe
  // `semanaFoto`, que se mueve con las flechas: mirar las fotos de hace un
  // mes no puede apagar el recordatorio de esta semana.
  check('las fotos se cuentan contra el cajón de su semana',
    /FOTOS\[claveDeMisFotos\(\)\]/.test(cuerpoDe(APP, 'faltanFotosDeLaSemana')),
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
    fn.indexOf('if(!FOTOS || !POSES)') < fn.indexOf('FOTOS[claveDeMisFotos'),
    'una guarda despues de la lectura no guarda nada');

  // Se declaran DESPUÉS del sitio donde se usan: por eso hace falta.
  check('el orden que lo provoca sigue ahí',
    APP.indexOf('var FOTOS = {}') > APP.indexOf('function pintarPeso('),
    'si algun dia FOTOS sube por encima, la guarda sobra pero no estorba');
}

console.log('\n— La semana de fotos es la de cada quien —');
{
  // LO QUE ESTABA MAL, medido antes de tocarlo.
  //
  // El recordatorio se apagaba al acabar la semana ISO -domingo- aunque la
  // semana de la persona siguiera abierta, así que la ventana salía de un
  // tamaño distinto para cada quien:
  //
  //     empieza el lunes ..... 7 días
  //     empieza el martes .... 6
  //     empieza el jueves .... 4
  //     empieza el domingo ... 1   <- si ese día no abría la app, sin aviso
  //
  // Y las fotos se archivaban con la semana ISO del día en que se subían,
  // así que la MISMA semana de quien no empieza en lunes caía en dos
  // cajones según el día. Ahora todo se mide desde el ARRANQUE de su
  // semana, y el cajón no se mueve en siete días.
  const iniFn = cuerpoDe(APP, 'inicioDeMiSemana');
  const claFn = cuerpoDe(APP, 'claveDeMisFotos');
  check('existe el arranque de la semana propia', !!iniFn);
  check('y el cajón que sale de él', !!claFn);
  check('el arranque sale de inicioSemana, no de un día fijo',
    /inicio == null \? inicioSemana : inicio/.test(iniFn),
    'la semana empieza donde dice week_start_dow: para Eduardo, el martes');
  check('el cajón se calcula desde el arranque, no desde hoy',
    /return claveSemana\(inicioDeMiSemana\(cuando, inicio\)\);/.test(claFn),
    'desde hoy, el cajon cambia solo al pasar el domingo en mitad de su semana');

  // Se ejecuta EL DEL FICHERO, no una copia escrita aquí, y por el camino
  // por defecto -sin argumentos-, que es el que usa la app. Pasando el día
  // como argumento el negativo no pillaba nada: el argumento ganaba y la
  // copia seguía siendo la buena.
  const lunesDe   = new Function(cuerpoDe(APP, 'lunesDe')   + '\nreturn lunesDe;')();
  const numSemana = new Function(cuerpoDe(APP, 'numSemana') + '\nreturn numSemana;')();
  const claveSemana = d => { const l = lunesDe(d);
    return l.getFullYear() + '-W' + String(numSemana(l)).padStart(2, '0'); };
  const cajon = (fecha, inicio) => new Function('inicioSemana', 'HOY', 'claveSemana',
    iniFn + '\n' + claFn + '\nreturn claveDeMisFotos;')(inicio, fecha, claveSemana)();

  const dia = n => { const d = new Date(2026, 7, 17 + n); d.setHours(0,0,0,0); return d; };
  const N = ['dom','lun','mar','mié','jue','vie','sáb'];
  for (let ini = 0; ini < 7; ini++) {
    // Catorce días seguidos, para ver dos semanas enteras y el salto.
    const cajones = [...Array(14)].map((_, n) => cajon(dia(n), ini));
    const medio = cajones[7];
    check(`empezando en ${N[ini]}: siete días en el mismo cajón`,
      cajones.filter(c => c === medio).length === 7,
      `dio ${cajones.filter(c => c === medio).length}: ${cajones.join(' ')}`);
    // Y que salte justo en SU día, ni antes ni después.
    const salta = cajones.findIndex((c, n) => n > 0 && c !== cajones[n - 1]);
    check(`  · y salta el ${N[ini]}, que es su día`, dia(salta).getDay() === ini,
      `salto un ${N[dia(salta).getDay()]}`);
  }

  // Y lo que NO puede pasar: que a quien empieza en lunes -o sea, todos
  // menos Eduardo- se le mueva el historial. Su cajón tiene que seguir
  // siendo exactamente la semana ISO de siempre.
  check('quien empieza en lunes conserva su cajón de siempre',
    [...Array(14)].every((_, n) => cajon(dia(n), 1) === claveSemana(dia(n))),
    'cambiar el cajon de los que ya estaban bien les partiria el historial de fotos');

  // La víspera avisa «mañana toca» la noche antes de que salte el cajón. Si
  // no encajaran, la app diría dos cosas distintas el mismo día.
  const vispera = new Function('inicioSemana', 'HORA_AVISO_FOTOS',
    cuerpoDe(APP, 'esVisperaDeCerrarSemana') + '\nreturn esVisperaDeCerrarSemana;');
  for (let ini = 0; ini < 7; ini++) {
    const cajones = [...Array(14)].map((_, n) => cajon(dia(n), ini));
    const salta = cajones.findIndex((c, n) => n > 0 && c !== cajones[n - 1]);
    const anoche = dia(salta - 1);
    check(`  · empezando en ${N[ini]}, la víspera avisa la noche antes`,
      vispera(ini, 19)(new Date(anoche.getFullYear(), anoche.getMonth(), anoche.getDate(), 20)),
      'si no encajan, la app dice «manana toca» un dia que no es');
  }
}

console.log('\n— Y la cintura, el día 28 y no el 29 —');
{
  // EL FALLO, medido:  se midió el 21 de julio, DIAS_ENTRE_CINTURAS = 28
  //
  //     día 27 -> no      día 28 -> NO      día 29 -> le toca
  //
  // Se comparaba `HOY` -que va a medianoche- contra el MEDIODÍA del día en
  // que se midió, así que el día 28 solo habían pasado 27,5. Medio día de
  // retraso todos los meses, y acumulándose: la medida se corre un día cada
  // dos meses. Ahora las dos fechas van a medianoche.
  const fn = cuerpoDe(APP, 'tocaMedirCintura');
  check('las dos fechas van a medianoche', /ultima\.setHours\(0, 0, 0, 0\);/.test(fn),
    'sin esto se compara medianoche contra mediodia y falta medio dia');
  check('y se redondea a días enteros', /Math\.round\(\(HOY - ultima\) \/ 86400000\)/.test(fn),
    'un dia dura 23 o 25 horas al cambiar el horario: sin round la resta da 27,96');

  // Se ejecuta la del fichero, no una copia.
  const hacer = c => new Function('CINTURAS', 'HOY', 'DIAS_ENTRE_CINTURAS',
    fn + '\nreturn tocaMedirCintura;');
  const toca = (medida, cuando) => hacer()([{ fecha: medida }], cuando, 28)();
  const masDias = (medida, n) => { const d = new Date(medida + 'T12:00:00');
    d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); return d; };

  // Cuatro fechas que cruzan las trampas de calendario: el cambio de
  // horario, el cambio de mes y el fin de año.
  for (const [medida, que] of [['2026-07-21', 'un mes normal'],
                               ['2026-03-15', 'cruzando el cambio de horario'],
                               ['2026-01-20', 'cruzando el cambio de mes'],
                               ['2025-12-15', 'cruzando el fin de año']]) {
    check(`${que}: el día 27 todavía no`, !toca(medida, masDias(medida, 27)));
    check(`  · y el 28 sí`,               toca(medida, masDias(medida, 28)),
      'salia el 29: medio dia de retraso que se acumula');
  }
  check('y si nunca se la ha medido, le toca ya', hacer()([], new Date(), 28)());
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
  // Van en PASTEL, y el pastel solo se lee si el texto es oscuro. Por eso
  // cada tarjeta es un par -fondo suave y tinta del mismo tono- y aquí se
  // comprueba el par entero, no el fondo suelto.
  //
  // Antes esto medía un color plano contra blanco fijo. Con el pastel esa
  // cuenta no significa nada: un fondo claro contra texto blanco da 1.2 y
  // la prueba lo habría dado por bueno si solo mirara el fondo.
  const lin = v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
  const lum = hex => { const n = parseInt(hex.slice(1), 16);
    return [16, 8, 0].map(s => lin(((n >> s) & 255) / 255))
      .reduce((a, v, i) => a + [.2126, .7152, .0722][i] * v, 0); };
  const contra = (a, b) => { const L = [lum(a), lum(b)];
    return (Math.max(...L) + .05) / (Math.min(...L) + .05); };

  // Los pares viven en base.css, y HAY TRES LISTAS: la fija, la que impone
  // `data-theme="dark"` cuando se elige a mano, y la del ajuste del
  // teléfono. Se comprueban las tres. Olvidar una deja el tema oscuro con
  // el pastel claro de fondo, que a las once de la noche es un foco.
  const listas = [
    ['clara',            BASE.slice(BASE.indexOf(':root{'), BASE.indexOf(':root[data-theme="dark"]'))],
    ['la de a mano',     BASE.slice(BASE.indexOf(':root[data-theme="dark"]'), BASE.indexOf('@media (prefers-color-scheme: dark)'))],
    ['la del teléfono',  BASE.slice(BASE.indexOf('@media (prefers-color-scheme: dark)'))],
  ];
  for (const [nombre, lista] of listas) {
    for (const cual of ['peso', 'fotos', 'cintura']) {
      const bg  = (lista.match(new RegExp(`--rec-${cual}-bg:(#[0-9a-f]{6})`)) || [])[1];
      const ink = (lista.match(new RegExp(`--rec-${cual}-ink:(#[0-9a-f]{6})`)) || [])[1];
      const c = bg && ink ? contra(bg, ink) : 0;
      check(`${nombre} · ${cual}: ${bg} + ${ink} = ${c.toFixed(2)}`, c >= 4.5,
        bg && ink ? 'el minimo legible es 4.5' : 'falta el par en esta lista de tema');
    }
  }

  // Y LA TARJETA TIENE QUE USAR ESA TINTA. Este hueco salió al probar en
  // negativo: poniendo `color:#fff` sobre el fondo pastel, todo lo de
  // arriba seguía verde -los pares están bien, nadie los tocó- mientras el
  // texto real quedaba en 1.2 de contraste, o sea invisible. Medir la
  // paleta no sirve de nada si luego no se usa.
  check('la tarjeta usa la tinta del par, no blanco',
    /\.rec\{[\s\S]*?background:var\(--rec-bg\);color:var\(--rec-ink\);/.test(CSS),
    'con color:#fff sobre pastel el contraste cae a 1.2 y los pares seguirian pareciendo correctos');
  check('y cada tarjeta engancha su par',
    /\.rec-peso\s*\{--rec-bg:var\(--rec-peso-bg\);\s*--rec-ink:var\(--rec-peso-ink\);\}/.test(CSS) &&
    /\.rec-cintura\{--rec-bg:var\(--rec-cintura-bg\); --rec-ink:var\(--rec-cintura-ink\);\}/.test(CSS));

  // El subtítulo se aclara HACIA EL FONDO de la tarjeta, no hacia el
  // blanco: sobre pastel el blanco desaparece. Y al 90%, no al 82% del
  // primer intento, que lo dejaba en 4.1.
  check('el subtítulo se aclara hacia el fondo, no hacia el blanco',
    /\.rec-txt span\{[\s\S]*?color-mix\(in srgb, var\(--rec-ink\) 90%, var\(--rec-bg\)\)/.test(CSS),
    'con blanco translucido sobre pastel el subtitulo se pierde');

  // El aviso de la víspera y el de «te faltan las fotos» se ven juntos en
  // la misma pantalla. Con dos azules distintos parecerían dos cosas sin
  // relación cuando son la misma. Ahora comparten el mismo token, que es
  // más fuerte que compartir el mismo valor escrito dos veces.
  check('la víspera usa el mismo par que las fotos',
    /\.aviso-fotos\{[\s\S]*?background:var\(--rec-fotos-bg\);color:var\(--rec-fotos-ink\)/.test(CSS),
    'compartir el token, y no el numero, es lo que impide que se separen al cambiar uno');

  // La × está pegada al borde de la pantalla y justo al lado de algo que
  // navega a otra pantalla: fallarla sale caro.
  check('la × llega a 44 px de blanco táctil', /\.rec-x::after\{content:'';position:absolute;inset:-7px;\}/.test(CSS));
  check('y el cuerpo no la pisa', /\.rec-cuerpo\{[\s\S]*?flex:1;min-width:0;/.test(CSS));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

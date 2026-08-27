// Lo que se pinta antes de guardar tiene que saber volver atrás.
//
// La app cambia la pantalla al momento y guarda después. Está bien: nadie
// quiere esperar a la red para ver su propia comida. Pero entonces, si el
// guardado falla, hay que deshacer TODO lo que se tocó — no una parte.
//
// EL FALLO QUE ENCONTRÓ ESTA PRUEBA:
//
// Al guardar peso y cintura juntos, el `catch` devolvía el peso a como
// estaba y se olvidaba de la cintura. Quedaba en memoria una medida que
// NO estaba en la base, y eso no se queda quieto:
//
//   · la pantalla enseñaba una cintura que no existe
//   · `tocaMedirCintura()` la daba por medida y no la volvía a pedir en 28 días
//   · el cierre del domingo se la mandaba a la IA, que decidía calorías
//     razonando sobre una medida inventada
//
// Van en la MISMA fila de la base: si no se guardó una, tampoco la otra.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Peso y cintura vuelven juntos —');
{
  // El manejador entero, contando llaves. Era una ventana de 2400 caracteres
  // y se quedó corta en cuanto el guardado creció —al dejar que se apunte
  // solo la cintura, ver la-cintura-no-se-perdia—: todo el deshacer quedaba
  // fuera del recorte y las cuatro comprobaciones se ponían rojas sin faltar
  // nada. Es la misma trampa que ya se pagó unas líneas más abajo.
  const i = APP.indexOf("getElementById('saveWeightBtn')");
  const fn = (() => {
    if (i < 0) return '';
    let n = 0, j = APP.indexOf('{', APP.indexOf('function(){', i));
    for (; j < APP.length; j++) {
      if (APP[j] === '{') n++;
      else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
    }
    return APP.slice(i);
  })();
  check('existe el guardado de peso', i > 0);

  // Se guarda el estado ANTES de tocarlo, y de las dos cosas.
  check('se recuerda cómo estaba el peso', /var k = isoDe\(HOY\), antes = PESOS\[k\]/.test(fn));
  check('y cómo estaban las cinturas', /cinturasAntes = CINTURAS\.slice\(\)/.test(fn),
    'sin copiarlas antes no hay a qué volver');
  // .slice() y no la referencia: CINTURAS se reasigna con filter/push, y
  // guardar la referencia vieja no serviría de nada.
  check('se copia la lista, no se apunta a ella', /CINTURAS\.slice\(\)/.test(fn));

  const cat = fn.slice(fn.indexOf("sbGuardarPeso(k, PESOS[k], cin)['catch']"));
  check('al fallar vuelve el peso', /if\(antes == null\) delete PESOS\[k\]; else PESOS\[k\] = antes;/.test(cat));
  check('y también la cintura', /CINTURAS = cinturasAntes;/.test(cat),
    'sin esto queda una medida que no existe en la base');
  // Y se repintan las dos: dejar la pantalla con el dato viejo es el mismo
  // problema al revés.
  check('se repintan las dos', /pintarPeso\(\);/.test(cat) && /pintarCintura\(\);/.test(cat));
  check('y se dice que falló', /No se pudo guardar/.test(cat));
}

console.log('\n— La cintura fantasma tenía tres efectos, y los tres se cortan —');
{
  // No se comprueba el texto: se comprueba que lo que LEE la cintura sea
  // CINTURAS, que es lo que hace que restaurarla lo arregle todo de golpe.
  const toca = APP.slice(APP.indexOf('function tocaMedirCintura('), APP.indexOf('function tocaMedirCintura(') + 400);
  check('el «¿toca medir?» lee CINTURAS', /CINTURAS/.test(toca),
    'por eso una medida fantasma callaba la pregunta 28 días');
  const cin = APP.slice(APP.indexOf('function cinturasRecientes('), APP.indexOf('function cinturasRecientes(') + 300);
  check('y lo que se manda a la IA también', /CINTURAS\.slice\(-6\)/.test(cin),
    'por eso el domingo se razonaba sobre una medida inventada');
}

console.log('\n— Un alimento borrado vuelve a SU sitio —');
{
  const i = APP.indexOf("var b = e.target.closest('[data-quitar]')");
  const fn = APP.slice(i, i + 1200);
  check('se recuerda dónde estaba', /var dondeEstaba = Number\(b\.dataset\.quitar\);/.test(fn));
  // Con `push`, borrar el primero de tres y que fallara lo devolvia el
  // tercero: la lista queda distinta y parece que paso algo mas.
  check('vuelve a su posición, no al final',
    /COMIDAS\[comida\]\.splice\(dondeEstaba, 0, quitado\);/.test(fn) &&
    !/COMIDAS\[comida\]\.push\(quitado\);/.test(fn),
    'con push, el primero de tres volvia el tercero');
  check('y se devuelven sus macros al día', /sumarAlRegistro\(quitado, \+1\);/.test(fn));
}

console.log('\n— Los otros sitios que ya lo hacían bien —');
{
  // Se fijan para que no se rompan: son la misma clase de codigo.
  const nota = APP.slice(APP.indexOf('function aplicarNota('), APP.indexOf('function aplicarNota(') + 900);
  check('una nota vuelve si no se guarda',
    /if\(antes === undefined\) delete NOTAS\[nombre\]; else NOTAS\[nombre\] = antes;/.test(nota));
  check('y se repinta su marca', /marcaNotas\(card, nombre\);/.test(nota));

  // La previa del objetivo no persiste nada: prueba el calculo y lo deja
  // como estaba en la misma linea.
  const obj = APP.slice(APP.indexOf('function pintarPreviaObjetivo('), APP.indexOf('function pintarPreviaObjetivo(') + 400);
  check('probar un objetivo no lo cambia', /reg\.objetivo = antes;/.test(obj));
}

console.log('\n— Y una sesión de entreno que no se guarda —');
{
  // El manejador entero, contando llaves. Era una ventana de 5400
  // caracteres —la quinta que se cae hoy por lo mismo— y basta con que el
  // guardado crezca unas líneas para que todo el deshacer quede fuera del
  // recorte y las comprobaciones se pongan rojas sin faltar nada.
  // La lógica salió del `addEventListener` a `guardarSesionAhora`: el
  // manejador es ahora un envoltorio de tres líneas que suelta el candado si
  // algo revienta —ver candado-de-la-sesion—. Lo que se prueba aquí, el
  // deshacer, vive en la función.
  const i = APP.indexOf('  function guardarSesionAhora(){');
  const fn = (() => {
    if (i < 0) return '';
    let n = 0, j = APP.indexOf('{', i);
    for (; j < APP.length; j++) {
      if (APP[j] === '{') n++;
      else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
    }
    return APP.slice(i);
  })();
  check('existe el guardado de sesión', i > 0);

  // Lo que ya se deshacía.
  check('se deshace la sesión', /delete SESIONES\[iso\(HOY\)\];/.test(fn));
  check('y el historial de volumen', /HISTORIAL\[d\.nombre\]\.pop\(\);/.test(fn));

  // LO QUE FALTABA, y era justo lo que se ve.
  check('se apunta qué palomitas estaban puestas',
    /var palomitasAntes = Array\.from\(exList\.querySelectorAll\('\.set-check\.done'\)\);/.test(fn),
    'sin esto, quien marco veinte series se queda sin ninguna y sin saber por que');
  check('y vuelven si falla',
    /palomitasAntes\.forEach\(function\(v\)\{ v\.classList\.add\('done'\); \}\);/.test(fn));

  check('se apunta la referencia anterior del volumen',
    /refsAntes\.push\(\{ card: c, valor: c\.getAttribute\('data-prev-vol'\) \}\)/.test(fn));
  check('y vuelve si falla', /r\.card\.setAttribute\('data-prev-vol', r\.valor\)/.test(fn),
    'si se queda la nueva, el porcentaje en vivo compara contra una sesion que no existe');
  // Sin referencia previa hay que QUITAR el atributo, no dejar la cadena
  // "null": parseFloat daria NaN y el porcentaje se apagaria sin motivo.
  check('y si antes no había, se quita',
    /if\(r\.valor === null\) r\.card\.removeAttribute\('data-prev-vol'\);/.test(fn));

  // Lo devuelto hay que volver a persistirlo, o al reabrir se pierde igual.
  const cat = fn.slice(fn.indexOf('delete SESIONES'));
  check('lo devuelto se vuelve a guardar', /programarGuardado\(\);/.test(cat),
    'la pantalla enseñaria las palomitas y la base seguiria con la rutina apagada');
  check('y se repinta el porcentaje', /recalcAll\(\);/.test(cat));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

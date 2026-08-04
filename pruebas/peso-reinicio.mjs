// Reiniciar el historial de peso.
//
// El fallo que cierra esto: borrabas el historial, salias, entrabas, y el
// peso seguia ahi. No era que el borrado fallara —la base si se vaciaba—
// sino que el CAMPO de la pantalla nunca se tocaba:
//
//   1. index.html traia value="83.8" escrito a mano, del maquetado.
//   2. La carga solo escribia el campo SI habia peso de hoy. Sin `else`,
//      lo que hubiera antes se quedaba.
//
// Es la peor forma de fallar: la accion funciono, pero la pantalla dice que
// no, y la persona vuelve a pulsar el boton pensando que esta roto.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El campo no trae números de fábrica —');
{
  const inp = HTML.match(/<input[^>]*id="pesoInput"[^>]*>/)[0];
  check('pesoInput no tiene value fijo', !/\svalue="/.test(inp), inp);
  // Ojo con generalizar esto: `regEdad="28"` o `goalP="170"` tambien son
  // valores fijos, pero son SUGERENCIAS de un formulario y estan bien —un
  // campo de edad en blanco es peor—. Lo que no puede traer valor de fabrica
  // es lo que muestra un dato GUARDADO, porque ahi el numero miente sobre lo
  // que hay en la base.
  const muestranDatos = ['pesoInput'];
  for (const id of muestranDatos) {
    const el = (HTML.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
    check(`${id} no trae dato de maquetado`, !/\svalue="/.test(el), el);
  }
}

console.log('\n— La carga vacía el campo si no hay peso de hoy —');
{
  const i = APP.indexOf('var hoyPeso = PESOS[hoy]');
  // Ventana generosa: entre la variable y la linea que importa hay un
  // comentario de cuatro renglones, y una ventana corta cortaba la linea a
  // la mitad y hacia fallar la prueba con el codigo correcto delante.
  const t = APP.slice(i, i + 700);
  check('se escribe el campo siempre, no solo si hay dato',
    /pesoInput'\)\.value = hoyPeso != null \? hoyPeso : ''/.test(t),
    'con un `if` a secas, el valor anterior sobrevive a la recarga');
  // El fallo original, escrito para que no vuelva por descuido.
  check('ya no queda el `if` que lo causaba',
    !/if\(hoyPeso != null\) document\.getElementById\('pesoInput'\)\.value = hoyPeso;/.test(APP));
}

console.log('\n— Reiniciar vacía la pantalla y la base —');
{
  const i = APP.indexOf("getElementById('pesoReinicioOk')");
  const f = APP.slice(i, i + 2400);
  check('borra el historial en memoria', /delete PESOS\[k\]/.test(f));
  check('y vacía el campo', /pesoInput'\)\.value = '';/.test(f));
  check('y borra en la base de verdad',
    /weight_logs\?user_id=eq\.[\s\S]{0,60}method:'DELETE'/.test(f),
    'sin esto vuelve al recargar, que es el fallo de las fotos otra vez');
  // La pantalla se vacia con sesion o sin ella: antes se salia antes de
  // tiempo y el boton se quedaba mudo.
  check('se vacía aunque no haya sesión',
    f.indexOf('delete PESOS[k]') < f.indexOf('if(!sesion'));
}

console.log('\n— Y si el borrado falla, se deshace entero —');
{
  const i = APP.indexOf("getElementById('pesoReinicioOk')");
  const f = APP.slice(i, i + 2400);
  check('se guarda lo que había', /var antes = Object\.assign\(\{\}, PESOS\)/.test(f));
  check('y también lo que decía el campo', /var antesInput = /.test(f));
  check('se restauran los pesos', /PESOS\[k\] = antes\[k\]/.test(f));
  // Restaurar los datos y dejar el campo vacio seria mentir a medias: la
  // grafica volveria y el numero de hoy no.
  check('y el campo, con su valor', /pesoInput'\)\.value = antesInput/.test(f));
  check('y se dice que no se pudo', /No se pudo borrar/.test(f));

  // Un DELETE que no encaja con ninguna fila NO da error: sale bien sin
  // tocar nada. Sin releer despues, un borrado que no borro se ve igual que
  // uno que si, y la persona solo se entera al recargar.
  check('se relee para comprobar que de verdad se borró',
    /select=log_date&limit=1/.test(f));
  check('y si quedan filas, se trata como fallo',
    /quedaron registros sin borrar/.test(f));
}

console.log('\n— El token vencido no se confunde con falta de permisos —');
{
  // Storage responde 403 con «"exp" claim timestamp check failed» cuando el
  // token vence, no 401. Mirando solo el 401, subir una foto a la hora de
  // sesion fallaba para siempre y parecia un problema de permisos.
  check('un 403 por caducidad cuenta como vencido',
    /r\.status === 403 && \/exp\.\{0,3\} claim\|jwt expired\/i/.test(APP));
  check('y Storage refresca y reintenta', /function sbStorage\(/.test(APP));
  check('subir la foto va por ahí', /sbStorage\('\/storage\/v1\/object\/' \+ BUCKET/.test(APP));
  check('y los enlaces firmados también',
    /sbStorage\('\/storage\/v1\/object\/sign\/' \+ BUCKET/.test(APP));
  // Ya no queda ninguna llamada cruda a Storage sin refresco.
  check('no queda fetch crudo a Storage',
    !/fetch\(SB_URL \+ '\/storage\/v1/.test(APP));
  // El cuerpo se lee de una copia o la Response llega vacia a quien llamo.
  check('la respuesta se clona para leerla', /r\.clone\(\)\.text\(\)/.test(APP));
}

console.log('\n— El peso del perfil NO se borra —');
{
  // Reiniciar el HISTORIAL no es olvidar cuánto pesa: `profiles.weight_kg`
  // alimenta el cálculo de macros, y limpiarlo dejaría a esa persona con
  // 1.200 calorías y 0 g de proteína la próxima vez que recalcule.
  const i = APP.indexOf("getElementById('pesoReinicioOk')");
  const f = APP.slice(i, i + 2400);
  check('no toca profiles', !/rest\/v1\/profiles/.test(f),
    'borrar el peso del perfil rompería el cálculo de macros');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

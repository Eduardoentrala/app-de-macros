// Cuándo sale el chequeo semanal.
//
// Es una regla que no se ve fallar: si se rompe, o le sale a alguien todos
// los días —y deja de contestarlo— o no le sale nunca y esa semana nadie le
// ajusta nada. Ninguna de las dos cosas da error en pantalla.
//
// La regla, entera:
//   · Sale al empezar su semana.
//   · Deja de salir cuando lo CONTESTAN, no cuando se les enseña.
//   · Quien manda es la base, no el navegador: contestado en el teléfono
//     no vuelve a salir en la tablet.
//   · Y no insiste el mismo día si lo cerraron.
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

const ini = APP.indexOf('function ofrecerChequeoSiEsSemanaNueva(');
const fin = APP.indexOf('\n  document.getElementById(\'chqEnviar\')', ini);
const fn = ini >= 0 ? APP.slice(ini, fin > ini ? fin : ini + 2000) : '';

console.log('\n— Ya no vive en Perfil —');
{
  check('no hay fila "Mi semana" en Perfil', !HTML.includes('profSemanaBtn'));
  check('ni codigo que la busque', !APP.includes('profSemanaBtn'),
    'un getElementById a algo que no existe revienta el arranque');
  // Sigue existiendo la hoja: lo que se quito es el acceso manual.
  check('pero la hoja sigue ahi', HTML.includes('id="chequeoSheet"'));
}

console.log('\n— Lo decide la base, no el navegador —');
{
  check('la funcion existe', fn.length > 0);
  check('consulta chequeos_semanales', fn.includes('/rest/v1/chequeos_semanales'));
  check('filtrando por esta persona', fn.includes('user_id=eq.'));
  check('y por esta semana', fn.includes('semana=eq.'));
  check('si ya hay fila, no sale', /if\(filas && filas\.length\) return/.test(fn),
    'esta es la linea que hace que deje de salir al contestarlo');
}

console.log('\n— Y no insiste el mismo dia —');
{
  // La marca lleva semana Y dia: si solo llevara la semana, cerrarla una
  // vez la mataria hasta el lunes aunque nunca la contestaran.
  check('la marca local lleva semana y dia',
    /semana \+ '\|' \+ isoDe\(HOY\)/.test(fn),
    'solo con la semana, cerrarla una vez valdria por contestada');
  check('se pone DESPUES de comprobar la base',
    fn.indexOf('filas && filas.length') < fn.indexOf('localStorage.setItem'),
    'marcarla antes haria que un fallo de red la enterrase');
  check('si la consulta falla, no molesta', /\['catch'\]\(function\(\)\{\}\)/.test(fn));
}

console.log('\n— Contestarlo es lo que la entierra —');
{
  // guardarChequeo escribe la fila que la consulta de arriba mira. Si
  // dejara de escribirla, el cuestionario volveria cada dia para siempre.
  const g = APP.slice(APP.indexOf('function guardarChequeo('),
                      APP.indexOf('function macrosDeHoy('));
  check('guardarChequeo escribe en chequeos_semanales',
    g.includes('/rest/v1/chequeos_semanales'));
  check('con la semana como clave', /semana: isoDe\(anclaSemana\)/.test(g));
  check('y se guarda tanto si ajusto como si no', /ajusto: !!r\.ajusto/.test(g),
    'que no se ajustara tambien es una respuesta, y tiene que enterrar la hoja');
  check('se llama al recibir la respuesta',
    (APP.match(/guardarChequeo\(/g) || []).length >= 2);
}

console.log('\n— No salta encima de nadie —');
{
  check('espera un poco antes de abrirse', /setTimeout\(abrirChequeo, \d{3,}\)/.test(fn),
    'saltarle una hoja a alguien que entro a apuntar el desayuno es como se cierra sin leer');
  check('y solo con sesion', /if\(!sesion \|\| !sesion\.user\) return/.test(fn));
}

console.log('\n— Las palomitas se apagan al guardar la sesión —');
{
  // Marcan "esta serie ya la hice HOY", no "este ejercicio lleva palomita
  // para siempre". Si sobreviven, la próxima sesión empieza con todo dado
  // por hecho y dejan de significar nada.
  const i = APP.indexOf("getElementById('saveSessionBtn')");
  const f = APP.slice(i, i + 3000);
  check('se quitan al guardar', /querySelectorAll\('\.set-check\.done'\)[\s\S]{0,120}classList\.remove\('done'\)/.test(f));

  // El orden importa en los dos sentidos.
  const leer = f.indexOf(".set-check.done')");        // dentro de `detalle`
  const limpiar = f.indexOf("querySelectorAll('.set-check.done')");
  const guardar = f.indexOf('saveCurrentDay()');
  check('después de leer cuáles estaban marcadas', leer < limpiar,
    'limpiar antes perdería el dato que se guarda en el historial');
  check('y antes de persistir la plantilla', limpiar < guardar,
    'saveCurrentDay es quien las guarda: limpiar después no serviría de nada');

  // Y la otra mitad, que faltaba: quitar la clase por código NO dispara
  // ningún evento, así que `volcarRutina` no tenía nada pendiente y salía
  // sin guardar. La pantalla quedaba limpia y la base seguía con las
  // palomitas puestas; al reabrir la app volvían todas.
  check('se avisa de que hay algo que subir a la base',
    /programarGuardado\(\);\s*\n\s*saveCurrentDay\(\)/.test(f),
    'sin esto se limpian en pantalla pero no en el servidor');
  const avisar = f.indexOf('programarGuardado()');
  check('el aviso va después de limpiar', limpiar < avisar);
}

console.log('\n— Las barras siguen a su cifra —');
{
  // Cada modo pinta en su sentido: "consumido" se llena, "restantes" se
  // vacía. Una barra que se llena mientras el número de al lado baja es lo
  // que de verdad se contradice.
  const i = APP.indexOf('var llevado = meta > 0');
  const t = APP.slice(i, i + 220);
  check('se calcula lo llevado', /var llevado = meta > 0/.test(t));
  check('y en "restantes" se invierte', /var pct = restando \? 100 - llevado : llevado/.test(t),
    'sin esto las dos vistas pintan igual y una de las dos miente');
}

console.log('\n— El entreno entra en el ajuste semanal —');
{
  check('se piden las sesiones', /function datosDeEntreno\(/.test(APP));
  check('de dos semanas, para poder comparar', /haceDias\(13\)/.test(APP));
  check('separadas por semana', /f\.session_date >= corte \? estaSemana : anterior/.test(APP));
  // Llega dentro del Promise.all que trae entreno, historial y cinturas a
  // la vez. Antes era `entreno: entreno`, cuando era la única consulta.
  check('y se mandan al asistente', /entreno: extra\[0\]/.test(APP));
  // Si falla la consulta, el ajuste sigue: quedarse sin ajuste por no poder
  // leer el gimnasio seria peor que ajustar sin ese dato.
  check('si falla, no bloquea el ajuste', /\['catch'\]\(function\(\)\{ return null; \}\)/.test(APP));

  const FN = readFileSync(
    join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
  check('la función lo recibe', /cuerpo\.entreno/.test(FN));
  check('y solo lo menciona si llega', /const entreno = e[\s\S]{0,40}\?/.test(FN));
  // Lo que de verdad se quiere que aprenda: peso plano NO significa lo
  // mismo segun lo que pase en el gimnasio.
  check('sabe que subir volumen con peso plano es bueno',
    /volumen SUBIENDO[\s\S]{0,120}NO le toques nada/.test(FN));
  check('y que sin entrenar no faltan calorías',
    /le falta[\s\S]{0,30}est[ií]mulo/.test(FN));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

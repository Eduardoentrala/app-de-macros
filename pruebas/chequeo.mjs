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

console.log('\n— El porcentaje se mueve mientras entrenas —');
{
  // Antes solo se pintaba lo decidido al guardar. El motivo era bueno -a
  // media rutina el número diría "-70%" y asusta-, pero aquí las series se
  // cargan con los números de la sesión anterior: el volumen arranca igual
  // que la última vez y solo se mueve cuando la persona cambia algo, que es
  // justo cuando quiere saber si va mejor o peor.
  const i = APP.indexOf('function recalcCard(');
  const trozo = i > 0 ? APP.slice(i, i + 2600) : '';
  check('se calcula en vivo', /pintarPorcentaje\(badge, Math\.round\(\(vol - prev\) \/ prev \* 100\)\)/.test(trozo));

  // Sale al tocar algo y se va al guardar. Son tres situaciones distintas y
  // las tres importan:
  //   abrir la rutina   → nada (las series traen los números de la última
  //                       vez: diría "igual al anterior" sin haber hecho ya)
  //   cambiar algo      → el porcentaje, en vivo
  //   guardar la sesión → se va; el número que importa es el de la próxima
  check('sin tocar nada no se enseña',
    /if\(!card\.hasAttribute\('data-tocado'\)\)\{[\s\S]{0,80}badge\.textContent = ''; return;/.test(trozo),
    'al reabrir la rutina saldría "igual al anterior" en todas las tarjetas');
  check('tocar una serie lo enciende',
    /card\.setAttribute\('data-tocado', '1'\);\s*\n\s*recalcCard\(card\);/.test(APP));
  check('y guardar la sesión lo apaga',
    /c\.removeAttribute\('data-tocado'\);/.test(APP));
  // Y se repinta después de guardar, que es lo que apaga los porcentajes en
  // pantalla. Se ancla en el manejador de "Guardar sesión": `saveCurrentDay`
  // aparece tres veces en el archivo y un indexOf a secas coge la primera.
  const g = APP.indexOf("getElementById('saveSessionBtn')");
  check('se repinta después de guardar, para que se apague de verdad',
    /removeAttribute\('data-tocado'\)[\s\S]*recalcAll\(\);/.test(APP.slice(g, g + 4000)));

  // Ya no queda el veredicto que sobrevivía al guardado.
  check('no queda el porcentaje que se quedaba pegado',
    !/data-veredicto/.test(APP) && !/function pintarVeredicto/.test(APP));

  // Volumen cero es una tarjeta a medio llenar, no un retroceso del 100%.
  check('no grita -100% con la tarjeta a medio llenar',
    /if\(vol <= 0\)\{ badge\.className = 'ex-delta'; badge\.textContent = ''; return; \}/.test(trozo));
  // Sin sesión anterior no hay con qué comparar.
  check('sin sesión anterior no inventa nada',
    /if\(prev === null \|\| !isFinite\(prev\) \|\| prev <= 0\)/.test(trozo));

  // Un solo sitio decide cómo se ve: separados, uno diría "+3%" y el otro
  // "3% más" sin que nadie lo notara.
  check('los dos caminos pintan igual', /function pintarPorcentaje\(badge, pct\)/.test(APP));
  check('subir y bajar se ven distinto',
    /'ex-delta show up'/.test(APP) && /'ex-delta show down'/.test(APP) && /'ex-delta show same'/.test(APP));
}

console.log('\n— El reloj también marca la serie —');
{
  // Poner el descanso ES haber terminado la serie: nadie descansa antes de
  // hacerla. Eran dos toques -la palomita y el reloj- para decir una sola
  // cosa, y el segundo se olvidaba.
  const i = APP.indexOf("var clock = e.target.closest('.clock-btn');");
  const trozo = i > 0 ? APP.slice(i, i + 1200) : '';
  check('el reloj existe y se atiende', i > 0);
  check('marca la palomita de SU fila',
    /var palomita = row \? row\.querySelector\('\.set-check'\) : null;/.test(trozo));
  check('poniéndola en verde', /palomita\.classList\.add\('done'\);/.test(trozo));
  // Alternar sería deshacer la serie al reiniciar el descanso. Volver a
  // darle al reloj es querer descansar otra vez, no borrar lo hecho.
  check('la añade, no la alterna', !/palomita\.classList\.toggle/.test(trozo));
  check('y arranca el descanso igual', /startRest\(restSeconds,/.test(trozo));
  // Marcar antes de arrancar: si startRest tardara o fallara, la serie ya
  // quedó marcada, que es lo que la persona vino a hacer.
  check('marca antes de arrancar el cronómetro',
    trozo.indexOf("classList.add('done')") < trozo.indexOf('startRest('));

  // Y que se guarde. No hace falta pedirlo aquí: hay un oyente de clic en
  // toda la lista que programa el guardado pase lo que pase.
  check('el clic programa el guardado solo',
    /exList\.addEventListener\('click', programarGuardado\);/.test(APP));

  // La palomita por su cuenta sigue alternando: tocarla es corregirse.
  const j = APP.indexOf("var chk = e.target.closest('.set-check');");
  check('tocar la palomita sigue alternando',
    /if\(chk\)\{ chk\.classList\.toggle\('done'\); return; \}/.test(APP.slice(j, j + 200)));
}

console.log('\n— Y no se toca el de al lado sin querer —');
{
  // El fallo reportado: "toco el cuadro y se activa el cronómetro". No era
  // lógica -el código sale antes de llegar al reloj- sino tamaño: palomita
  // de 26 px, reloj de 33 y × de 20, separados 8. Una yema mide unos 50.
  const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'pantallas.css'), 'utf8');

  check('los tres tienen blanco táctil ampliado',
    /\.set-check::after\{[\s\S]{0,90}position:absolute/.test(CSS) &&
    /\.clock-btn::after\{[\s\S]{0,90}position:absolute/.test(CSS) &&
    /\.rm-set::after\s*\{[\s\S]{0,90}position:absolute/.test(CSS));

  // Cada uno crece ALEJÁNDOSE del vecino: la palomita a la izquierda y el
  // reloj a la derecha. Si crecieran hacia dentro se solaparían, y "gana el
  // que esté encima" es igual de aleatorio que el problema original.
  check('la palomita crece hacia la izquierda',
    /\.set-check::after\{[^}]*inset:-11px -4px -11px -14px/.test(CSS));
  check('y el reloj hacia la derecha',
    /\.clock-btn::after\{[^}]*inset:-11px -10px -11px -4px/.test(CSS));

  // El hueco no puede engordar mucho: la fila tiene 375 px y cada píxel se
  // lo quita a los campos de reps y peso. Con hueco de 20 se quedaron en 35
  // px, y ahí no entra "102.5".
  const hueco = (CSS.match(/\.set-row-actions\{display:flex;gap:(\d+)px/) || [])[1];
  check('el hueco entre botones no se come los campos',
    hueco && Number(hueco) <= 12, `gap: ${hueco}px`);

  // Y que solo el reloj arranque el cronómetro. Es la mitad de la queja:
  // que la palomita NO lo dispare.
  const arranques = (APP.match(/startRest\(/g) || []).length;
  check('startRest se llama en pocos sitios y controlados', arranques <= 3, `${arranques} veces`);
  const i = APP.indexOf("var chk = e.target.closest('.set-check');");
  check('el camino de la palomita corta antes del reloj',
    /if\(chk\)\{ chk\.classList\.toggle\('done'\); return; \}/.test(APP.slice(i, i + 200)),
    'sin ese return, tocar la palomita seguiría al reloj');
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

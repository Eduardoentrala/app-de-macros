// Apuntar sin señal: que no se pierda, que no se duplique y que se note.
//
// EL FALLO QUE CIERRA ESTO
//
// El service worker conseguía que la app ABRIERA sin señal, pero no que se
// pudiera usar: se apuntaba una comida, el guardado fallaba, y la app
// deshacía lo que acababas de escribir. Se perdía. Y duele donde más se
// usa —restaurantes, gimnasio, viajando—, que es donde peor va la señal.
//
// POR QUÉ ESTA PRUEBA EJECUTA EL CÓDIGO Y NO LO LEE
//
// Casi todas las pruebas de esta carpeta miran el texto de app.js. Aquí no
// bastaría: lo que hay que comprobar son los CAMINOS —qué pasa cuando falla
// la red a la mitad, qué pasa si el servidor dice que no, qué pasa si el
// mismo apunte se manda dos veces—, y eso no se ve leyendo. Así que el
// bloque de la cola se corre de verdad en un sandbox con `localStorage` y
// `fetch` de mentira.
//
// LO QUE MÁS IMPORTA DE TODO ESTO son dos cosas que van en direcciones
// contrarias:
//   · un fallo de RED no puede deshacer lo apuntado  (se perdería la comida)
//   · un fallo del SERVIDOR sí tiene que deshacerlo   (o se promete guardar
//     algo que no se va a guardar nunca)
// La función que decide cuál es cuál es `sinConexion`, y por eso se prueba
// por los dos lados.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'diario.css'), 'utf8');

const ini = APP.indexOf('  // ================= APUNTAR SIN SEÑAL');
const fin = APP.indexOf('  // Vuelca en `profiles`');
const BLOQUE = APP.slice(ini, fin);

let ok = 0, mal = 0;
const check = (n, c, e = '') => {
  if (c) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${e ? '\n        ' + e : ''}`); }
};

// Un banco de pruebas con lo justo para que el bloque corra.
function montar({ online = true, respuestas = [], guardado = null } = {}) {
  const almacen = new Map();
  if (guardado) almacen.set('macros.cola', JSON.stringify(guardado));
  const enviados = [];
  const avisos = [];
  let turno = 0;

  const ctx = vm.createContext({
    Promise, JSON, Error, Array, String, Math, Date, Uint8Array, RegExp,
    sesion: { user: { id: 'yo' }, access_token: 't' },
    navigator: { onLine: online },
    window: { addEventListener: () => {} },
    crypto: {
      // Ids previsibles, para poder afirmar sobre ellos.
      randomUUID: () => 'id-' + (++turno),
      getRandomValues: (a) => a
    },
    localStorage: {
      getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => { almacen.set(k, v); },
      removeItem: (k) => { almacen.delete(k); }
    },
    document: { getElementById: () => null, addEventListener: () => {}, hidden: false },
    toast: (id, m) => { avisos.push(m); },
    // El `fetch` de la app pasa por aquí: cada llamada consume una respuesta.
    sbFetch: (ruta, op) => {
      enviados.push({ ruta, metodo: (op && op.method) || 'GET', body: op && op.body });
      const r = respuestas[enviados.length - 1] || { ok: true };
      if (r.red) { const e = new TypeError('Failed to fetch'); return Promise.reject(e); }
      if (r.error) return Promise.reject(new Error(r.error));
      return Promise.resolve(r.dato !== undefined ? r.dato : null);
    }
  });

  vm.runInContext(BLOQUE, ctx);
  return {
    ctx, enviados, avisos,
    cola: () => JSON.parse(almacen.get('macros.cola') || '[]'),
    crudo: () => almacen.get('macros.cola')
  };
}

console.log('\n— Distinguir "no hay red" de "el servidor dice que no" —');
{
  const m = montar();
  const s = m.ctx.sinConexion;
  // Lo que rechaza `fetch` cuando no llega a hablar con nadie.
  check('un TypeError es falta de red', s(new TypeError('Failed to fetch')));
  // En un iPhone el mensaje es otro. Por eso se mira el TIPO y no el texto.
  check('y en Safari también, que dice otra cosa', s(new TypeError('Load failed')));
  // ESTO ES LO QUE NO PUEDE FALLAR: un error del servidor NO es falta de
  // red. Si se tomara por tal, el apunte se reintentaría para siempre y a la
  // persona se le diría que se guardó algo que nunca se va a guardar.
  check('un error del servidor NO lo es', !s(new Error('new row violates row-level security policy')));
  check('ni un duplicado', !s(new Error('duplicate key value violates unique constraint')));
  check('ni una sesión caducada', !s(new Error('Sesión caducada')));
  // Con el teléfono en modo avión ni se intenta adivinar por el mensaje.
  check('el modo avión se detecta sin mirar el error', montar({ online: false }).ctx.sinConexion(null));
}

console.log('\n— El id lo pone el teléfono, no la base —');
{
  const m = montar();
  const a = m.ctx.idNuevo(), b = m.ctx.idNuevo();
  check('se genera un id', !!a);
  check('y no se repite', a !== b);
  // Sin `crypto.randomUUID` -contextos no seguros y navegadores viejos- hay
  // que seguir teniendo id, o el reintento deja de ser seguro justo donde
  // menos se puede comprobar.
  const viejo = montar();
  viejo.ctx.crypto.randomUUID = undefined;
  const uuid = viejo.ctx.idNuevo();
  check('y hay respaldo si el navegador no trae randomUUID',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid), uuid);
}

console.log('\n— Lo encolado sobrevive a cerrar la app —');
{
  const m = montar();
  m.ctx.encolar({ ruta: '/rest/v1/diary_entries', op: { method: 'POST', body: '{"id":"a"}' }, fila: 'a', tipo: 'comida' });
  check('se escribe en el almacenamiento del teléfono', m.cola().length === 1);
  check('con la ruta y el cuerpo enteros', m.cola()[0].ruta === '/rest/v1/diary_entries' && !!m.cola()[0].op.body);
  // Sin dueño, cerrar sesión y entrar con otra cuenta le mandaría a la
  // nueva los apuntes de la anterior.
  check('y con el dueño apuntado', m.cola()[0].dueno === 'yo');
  check('y la hora en que se apuntó', !!m.cola()[0].creado);
}

console.log('\n— La cola se manda en orden y se para al perder la red —');
{
  const m = montar({
    guardado: [
      { ruta: '/uno', op: { method: 'POST' }, dueno: 'yo', tipo: 'comida' },
      { ruta: '/dos', op: { method: 'POST' }, dueno: 'yo', tipo: 'comida' },
      { ruta: '/tres', op: { method: 'POST' }, dueno: 'yo', tipo: 'comida' }
    ],
    respuestas: [{ ok: true }, { red: true }]
  });
  await m.ctx.vaciarCola();
  check('manda la primera', m.enviados[0] && m.enviados[0].ruta === '/uno');
  // EN ORDEN Y DE UNA EN UNA: si se mandaran a la vez, un alta y su borrado
  // podrían llegar al revés y el apunte quedaría vivo para siempre.
  check('y la segunda después, no a la vez', m.enviados.length === 2);
  check('al perder la red se para', m.enviados.length === 2,
    'seguir con las siguientes las adelantaría');
  check('la que subió sale de la cola', !m.cola().some(x => x.ruta === '/uno'));
  check('y las que faltan se quedan para la próxima', m.cola().length === 2);
}

console.log('\n— Un apunte que ya estaba no se duplica —');
{
  // El caso feo: `fetch` falla DESPUÉS de que el servidor recibiera la
  // petición. El apunte está guardado aunque aquí parezca que no. Al
  // reintentar, el id que mandamos nosotros choca contra la clave primaria.
  const m = montar({
    guardado: [{ ruta: '/uno', op: { method: 'POST' }, dueno: 'yo', tipo: 'comida' }],
    respuestas: [{ error: 'duplicate key value violates unique constraint "diary_entries_pkey"' }]
  });
  await m.ctx.vaciarCola();
  check('un 409 se toma como "ya estaba"', m.cola().length === 0);
  check('y se cuenta como subido, no como fallo',
    m.avisos.some(a => /Se subió 1 apunte/.test(a)), m.avisos.join(' | '));
}

console.log('\n— Un error de verdad no atasca la cola —');
{
  const m = montar({
    guardado: [
      { ruta: '/malo', op: { method: 'POST' }, dueno: 'yo', tipo: 'comida' },
      { ruta: '/bueno', op: { method: 'POST' }, dueno: 'yo', tipo: 'comida' }
    ],
    respuestas: [{ error: 'new row violates row-level security policy' }, { ok: true }]
  });
  await m.ctx.vaciarCola();
  // Si el rechazado se quedara, nada de lo que venga detrás volvería a subir
  // nunca: una fila mala congelaría el diario entero para siempre.
  check('el rechazado se tira', !m.cola().some(x => x.ruta === '/malo'));
  check('y lo de detrás sí sube', m.enviados.some(e => e.ruta === '/bueno'));
  check('la cola queda vacía', m.cola().length === 0);
  // No se calla: es un apunte que la persona ve en pantalla y que el
  // servidor no aceptó. Sin aviso desaparece en la siguiente recarga.
  check('y se avisa de lo que no se pudo',
    m.avisos.some(a => /no se pudo/.test(a)), m.avisos.join(' | '));
}

console.log('\n— Cada quien sube lo suyo —');
{
  const m = montar({
    guardado: [
      { ruta: '/mio', op: { method: 'POST' }, dueno: 'yo', tipo: 'comida' },
      { ruta: '/ajeno', op: { method: 'POST' }, dueno: 'otro', tipo: 'comida' }
    ],
    respuestas: [{ ok: true }, { ok: true }]
  });
  await m.ctx.vaciarCola();
  check('sube lo del que está dentro', m.enviados.some(e => e.ruta === '/mio'));
  check('y NO lo de otra cuenta', !m.enviados.some(e => e.ruta === '/ajeno'),
    'sería mandar la comida de una persona a la cuenta de otra');
  check('lo ajeno se queda esperando a su dueño', m.cola().some(x => x.dueno === 'otro'));
  check('y no se cuenta como pendiente propio', m.ctx.hayPendientes() === 0);
}

console.log('\n— Borrar algo que aún no había subido —');
{
  const m = montar({
    guardado: [{ ruta: '/rest/v1/diary_entries', op: { method: 'POST' }, fila: 'abc', dueno: 'yo', tipo: 'comida' }]
  });
  check('se cancela el alta', m.ctx.desencolar('abc') === true);
  check('y no queda nada que mandar', m.cola().length === 0);
  // Mandar un DELETE de una fila que el servidor no ha visto nunca no
  // borraría nada y dejaría un error en la cola.
  check('no se encola ningún borrado', m.enviados.length === 0);
  check('borrar algo que no está no rompe', m.ctx.desencolar('noexiste') === false);
}

console.log('\n— No crece sin fin —');
{
  const m = montar();
  for (let i = 0; i < 450; i++)
    m.ctx.encolar({ ruta: '/x' + i, op: { method: 'POST' }, tipo: 'comida' });
  check('hay tope', m.cola().length <= 400, 'quedaron ' + m.cola().length);
  // Se tira lo MÁS VIEJO: lo que la persona acaba de apuntar es lo que
  // tiene delante y lo que notaría desaparecer.
  check('y se conserva lo más reciente', m.cola()[m.cola().length - 1].ruta === '/x449');
}

console.log('\n— En el código de la comida —');
{
  // OJO AL CORTAR. La primera versión de esto iba de `sbAgregarAlimento`
  // hasta `sbAlimentos`, y por en medio queda `sbQuitarAlimento`, que tiene
  // las MISMAS líneas. Al probar la mutación —quitarle el `sinConexion` al
  // alta— la prueba seguía pasando, porque el patrón lo encontraba en el
  // borrado. Cada función se mira por separado.
  const alta = APP.slice(APP.indexOf('function sbAgregarAlimento('),
                         APP.indexOf('function sbQuitarAlimento('));
  const baja = APP.slice(APP.indexOf('function sbQuitarAlimento('),
                         APP.indexOf('function sbAlimentos('));

  check('el id se manda desde el teléfono', /id: idNuevo\(\)/.test(alta),
    'sin esto el reintento duplica el apunte');
  // El diario se lee ordenado por created_at. Si lo pusiera la base al
  // subir, todo lo apuntado sin señal saldría junto y al final.
  check('y la hora también', /created_at: new Date\(\)\.toISOString\(\)/.test(alta));
  check('un fallo de red encola el alta', /if\(!sinConexion\(e\)\) throw e;[\s\S]{0,300}encolar\(/.test(alta));
  // LO QUE NO PUEDE PERDERSE: al encolar se RESUELVE, no se rechaza. Si
  // rechazara, el `catch` de quien llama borraría de la pantalla la comida
  // que se acaba de apuntar, que es el fallo original.
  check('y se resuelve para que la pantalla no se deshaga', /return fila;/.test(alta));
  check('un error de verdad se sigue lanzando', /if\(!sinConexion\(e\)\) throw e;/.test(alta),
    'si no, se prometería guardar algo que no se va a guardar');

  check('borrar cancela el alta si aún no subió',
    /if\(desencolar\(id\)\) return Promise\.resolve\(\);/.test(baja));
  check('y si ya había subido, el borrado también se encola',
    /if\(!sinConexion\(e\)\) throw e;[\s\S]{0,200}encolar\(/.test(baja),
    'sin esto, borrar sin señal no borra nada y la fila vuelve al recargar');
}

console.log('\n— Y no desaparece al volver a abrir sin señal —');
{
  // Hasta el bloque siguiente, y no `i + 12000`. Se probó con la ventana
  // fija y ya se quedaba corta por 233 caracteres: el catch que hay que
  // comprobar caía justo fuera y la prueba pasaba sin mirar nada. Es el
  // mismo tropiezo que está documentado en recordatorios.mjs.
  const i = APP.indexOf('function cargarDatos(');
  const fn = APP.slice(i, APP.indexOf('  // ---- Tema claro / oscuro ----'));
  check('lo de la cola se mezcla con lo del servidor',
    /llenarDiario\(filas\.concat\(filasEnCola\(\)\)\)/.test(fn));
  // EL CASO QUE MÁS IMPORTA: sin señal no llega NADA, así que si el catch no
  // pintara la cola, lo apuntado sin conexión desaparecería de la pantalla
  // al cerrar y abrir. La persona lo volvería a apuntar y al recuperar la
  // señal subirían los dos.
  check('y si la carga falla, se pinta la cola igual',
    /var pendientes = filasEnCola\(\);[\s\S]{0,200}llenarDiario\(pendientes\)/.test(fn));
  check('con el aviso de que falta subirlo', /pintarPendientes\(\);/.test(fn));

  const orden = APP.indexOf('vaciarCola().then(function(){ cargarDatos(); })');
  check('al abrir se sube lo pendiente ANTES de cargar', orden > 0,
    'a la vez, la carga podría traer un diario sin lo que aún no ha subido');
  check('y se reintenta al volver la señal',
    /addEventListener\('online', function\(\)\{ vaciarCola\(\); \}\)/.test(APP));
  // El caso corriente es el wifi del restaurante: da señal pero no sale a
  // internet, así que `navigator.onLine` vale true todo el rato y el evento
  // `online` no llega NUNCA. Sin esto la cola espera a que se cierre y se
  // vuelva a abrir la app.
  check('y al volver a la app desde el segundo plano',
    /visibilitychange[\s\S]{0,120}vaciarCola\(\)/.test(APP),
    'con solo el evento online, el wifi sin internet deja la cola esperando');

  // Los borrados de la cola también cuentan: si el alta ya subió y el
  // borrado no, la fila sigue en el servidor y volvería a aparecer.
  const fc = APP.slice(APP.indexOf('function filasEnCola('), APP.indexOf('function llenarDiario('));
  check('un borrado en cola descuenta su fila', /borrados\[f\.id\]/.test(fc));
  check('y solo se pinta lo propio', /x\.dueno && x\.dueno !== yo/.test(fc));
}

console.log('\n— Se ve que falta subir —');
{
  // Sin esto la app se comporta igual con señal que sin ella, que es la
  // peor version posible: la persona cree que su comida esta guardada.
  check('hay aviso en el Diario', HTML.includes('id="avisoPendientes"'));
  check('nace oculto', /id="avisoPendientes"[^>]*hidden/.test(HTML));
  check('y tiene estilo propio', /\.pendientes\{/.test(CSS));
  // No es un recordatorio: no se calla, se va solo cuando sube lo que falta.
  const caja = HTML.slice(HTML.indexOf('id="avisoPendientes"'), HTML.indexOf('class="recordatorios"'));
  check('no se puede cerrar', !/<button/.test(caja),
    'un aviso de datos sin guardar que se puede callar no sirve de nada');
  check('dice cuántos faltan', /Faltan subir/.test(APP));
  check('y que están a salvo en el teléfono', /guardados en el tel/i.test(HTML));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

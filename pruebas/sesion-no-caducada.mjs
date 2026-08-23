// Quedarse sin red no es quedarse sin sesión.
//
// El token de acceso dura una hora. Cuando vence, la API responde 401 y la
// app canjea el refresh_token por uno nuevo. Si ese canje falla, se da la
// sesión por caducada: se borra del teléfono y se manda a la pantalla de
// entrar.
//
// DOS FALLOS.
//
// 1. Se daba por caducada ante CUALQUIER fallo del canje. Sin red, el fetch
//    rechaza y ahí se acabó: la app borra la sesión y pide la contraseña
//    otra vez. O sea que abrir la app con datos móviles flojos, pasada una
//    hora, te echa de tu propia cuenta. Y un 503 de Supabase, igual.
//
//    Caducada solo lo dice el servidor, y lo dice con un 400 o un 401 en la
//    ruta de auth. Lo demás es "ahora no".
//
// 2. Al arrancar se piden SIETE cosas a la vez. Con el token vencido, las
//    siete reciben 401 y las siete pedían su propio canje. Supabase rota el
//    refresh_token: el primero que llega lo gasta y a los otros seis les
//    contesta que el suyo ya no vale... y cada uno de esos seis llama a
//    sesión caducada. El canje SALE BIEN y aun así te echa.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const trozo = (desde, hasta, dentro) => {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  const j = dentro ? APP.indexOf(dentro, i) : i;
  return APP.slice(i, APP.indexOf(hasta, j) + hasta.length);
};

// El bloque ENTERO, de guardarSesion al final de sbFetch, en un solo corte.
//
// Antes se listaban las piezas una por una y cualquier ayuda nueva entre
// medias se quedaba fuera: dentro de sbRefrescar saltaba un ReferenceError,
// el error que llegaba no era el de "caducada" y la prueba se ponía roja
// culpando al código. Estas cuatro funciones van seguidas en el archivo
// porque son una sola cosa; cortarlas juntas es lo que se parece a la app.
const FUENTE = trozo('  function guardarSesion(s){', '\n  }', 'return d;');

// `auth` describe qué contesta el canje del token.
//   'ok'      -> devuelve una sesión nueva
//   'sinred'  -> el fetch rechaza, como sin señal
//   {status}  -> el servidor responde con ese código
function montar({ auth, cuantas = 1, sinRefresh = false }) {
  const visto = { canjes: 0, login: 0, avisos: [], guardado: [] };
  // Los tokens que ya no valen. El canje devuelve uno nuevo cada vez, para
  // poder hacer que venza OTRA VEZ y ver si se vuelve a canjear.
  const muertos = new Set(['viejo']);
  const fetch = (url, op) => {
    if (String(url).indexOf('/auth/v1/token') >= 0) {
      visto.canjes++;
      if (auth === 'sinred') return Promise.reject(new TypeError('Failed to fetch'));
      if (auth === 'ok') return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({
          access_token: 'nuevo' + visto.canjes, refresh_token: 'r' + visto.canjes,
          user: { id: 'yo' } }),
      });
      return Promise.resolve({ ok: false, status: auth.status, json: () => Promise.resolve({}) });
    }
    // Los datos: 401 con un token muerto, bien con uno vivo.
    const token = String((op.headers || {}).Authorization).replace('Bearer ', '');
    const vencido = muertos.has(token);
    return Promise.resolve({
      ok: !vencido, status: vencido ? 401 : 200,
      text: () => Promise.resolve(vencido ? JSON.stringify({ message: 'JWT expired' }) : '[]'),
    });
  };

  const caja = new Function('fetch', 'SB_URL', 'SB_KEY', 'SESION_KEY',
    'localStorage', 'goto', 'avisarLogin', 'visto', 'sinRefresh', `
    var sesion = { access_token: 'viejo', user: { id: 'yo' } };
    if(!sinRefresh) sesion.refresh_token = 'r1';
    ${FUENTE}
    return {
      pedir: function(){ return sbFetch('/rest/v1/diary_entries'); },
      canjear: sbRefrescar,
      sesion: function(){ return sesion; }
    };`)(fetch, 'https://x.supabase.co', 'clave', 'macros.sesion',
      { setItem: (k, v) => visto.guardado.push(v), removeItem: () => visto.guardado.push(null) },
      () => { visto.login++; }, (t) => { visto.avisos.push(t); }, visto, sinRefresh);

  const resumen = () => ({ ...visto, sesion: caja.sesion() });
  const varias = [];
  for (let i = 0; i < cuantas; i++) varias.push(caja.pedir().then(() => 'bien', (e) => e.message));
  return Promise.all(varias).then((r) => ({
    ...resumen(), resultados: r,
    // Para seguir jugando después de la primera ronda.
    matar: (t) => muertos.add(t),
    otraVez: () => caja.pedir().then(() => 'bien', (e) => e.message),
    canjear: caja.canjear,
    resumen,
  }));
}

// ------------------------------------------------------------------
console.log('\nLo que ya funcionaba: el token vence y se renueva');
{
  const r = await montar({ auth: 'ok' });
  ok(r.resultados[0] === 'bien', 'la petición se reintenta y sale bien', String(r.resultados[0]));
  // El canje numera los tokens para poder hacerlos vencer más de una vez.
  ok(r.sesion.access_token === 'nuevo1', 'con el token nuevo guardado',
     'quedó ' + r.sesion.access_token);
  ok(r.login === 0, 'y sin echar a nadie');
}

// ------------------------------------------------------------------
console.log('\n1. Sin red no es sin sesión');
{
  const r = await montar({ auth: 'sinred' });
  ok(r.login === 0, 'no se manda a la pantalla de entrar',
     'te echa de tu cuenta por abrir la app sin cobertura');
  ok(r.sesion && r.sesion.refresh_token === 'r1',
     'y la sesión sigue en el teléfono, para cuando vuelva la señal',
     'se borró: hay que teclear la contraseña otra vez');
  ok(!r.guardado.includes(null), 'no se borra del almacenamiento');

  for (const status of [500, 503, 429]) {
    const s = await montar({ auth: { status } });
    ok(s.login === 0 && s.sesion.refresh_token === 'r1',
       `un ${status} del servidor tampoco te echa`);
  }
}

// ------------------------------------------------------------------
console.log('\nPero caducada de verdad sí se dice');
{
  for (const status of [400, 401, 403]) {
    const r = await montar({ auth: { status } });
    ok(r.login === 1, `un ${status} en el canje es la sesión caducada de verdad`);
    ok(r.guardado.includes(null), '   ...y se borra del teléfono');
  }
}

// ------------------------------------------------------------------
console.log('\n2. Siete peticiones a la vez, UN canje');
{
  // Es lo que pasa al arrancar: siete cosas se piden juntas.
  const r = await montar({ auth: 'ok', cuantas: 7 });
  ok(r.canjes === 1, 'se canjea una sola vez',
     'se canjeó ' + r.canjes + ' veces: Supabase rota el token, el primero lo gasta ' +
     'y a los demás les dice que el suyo ya no vale... y cada uno te echa');
  ok(r.login === 0, 'y nadie acaba en la pantalla de entrar');
  ok(r.resultados.every((x) => x === 'bien'), 'las siete salen bien',
     JSON.stringify(r.resultados));
}

// ------------------------------------------------------------------
console.log('\nY el canje compartido se suelta al acabar');
{
  // Compartirlo evita las siete llamadas de golpe. Pero si no se suelta, la
  // SIGUIENTE vez que venza el token -una hora después- se devuelve aquella
  // promesa ya resuelta, la petición se reintenta con el token viejo otra
  // vez y se queda sin cargar. La app funcionaría una hora y luego no.
  const r = await montar({ auth: 'ok' });
  ok(r.canjes === 1, 'primer vencimiento: un canje');

  r.matar('nuevo1');                     // pasa otra hora
  const otra = await r.otraVez();
  ok(otra === 'bien', 'al segundo vencimiento la petición vuelve a salir bien', String(otra));
  ok(r.resumen().canjes === 2, 'porque se canjea otra vez, no se reusa el canje de antes',
     'se quedó en ' + r.resumen().canjes + ' canjes: la app dejaría de cargar datos');
}

// ------------------------------------------------------------------
console.log('\nY sin refresh_token no hay nada que canjear: eso sí es caducada');
{
  const r = await montar({ auth: 'ok', sinRefresh: true });
  const e = await r.canjear().then(() => null, (x) => x);
  ok(e && e.caducada === true,
     'el canje sin refresh_token se rechaza marcado como caducada',
     'llegó ' + (e && e.message) + ' sin la marca: quien lo llame no sabrá que hay que entrar de nuevo');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

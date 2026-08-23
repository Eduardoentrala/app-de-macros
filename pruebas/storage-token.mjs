// Que un token vencido no parezca falta de permisos.
//
// El fallo que cierra esto: subir una foto a la hora de sesion devolvia
// 403 «"exp" claim timestamp check failed» y ahi se quedaba. Dos causas
// sumadas: las llamadas a Storage usaban fetch a pelo -sin el refresco que
// sbFetch si tiene- y ademas Storage no responde 401 cuando el token vence,
// responde 403.
//
// Lo dificil no es refrescar: es NO refrescar ante un 403 de permisos de
// verdad, porque eso esconderia un fallo real detras de un reintento.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const ini = APP.indexOf('function sbStorage(');
const fin = APP.indexOf('\n  function sbRegistrar(');

let ok = 0, mal = 0;
const check = (n, c, e = '') => {
  if (c) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${e ? '\n        ' + e : ''}`); }
};

function montar(respuestas) {
  const llamadas = [];
  let refrescos = 0, caducadas = 0;
  const ctx = vm.createContext({
    SB_URL: 'https://x', SB_KEY: 'anon',
    sesion: { access_token: 'viejo', refresh_token: 'rt' },
    Promise, JSON, Error,
    sbRefrescar: () => { refrescos++; ctx.sesion.access_token = 'nuevo'; return Promise.resolve(); },
    sesionCaducada: () => { caducadas++; },
    fetch: (url, op) => {
      llamadas.push(op.headers.Authorization);
      const r = respuestas[llamadas.length - 1];
      return Promise.resolve({
        ok: r.status < 400, status: r.status,
        text: () => Promise.resolve(r.body || ''),
        clone(){ return this; }
      });
    }
  });
  vm.runInContext(APP.slice(ini, fin), ctx);
  return { ctx, llamadas, ref: () => refrescos, cad: () => caducadas };
}

console.log('\n— 403 por token vencido —');
{
  const m = montar([
    { status: 403, body: '{"statusCode":"403","message":"\\"exp\\" claim timestamp check failed"}' },
    { status: 200 }
  ]);
  const r = await m.ctx.sbStorage('/storage/v1/object/x', { method: 'POST' });
  check('refresca una vez', m.ref() === 1, 'refrescos: ' + m.ref());
  check('reintenta con el token nuevo', m.llamadas[1] === 'Bearer nuevo', m.llamadas.join(' | '));
  check('y devuelve el resultado bueno', r.status === 200);
  check('sin marcar la sesion como caducada', m.cad() === 0);
}

console.log('\n— 403 de permisos de verdad —');
{
  const m = montar([{ status: 403, body: '{"error":"Unauthorized","message":"new row violates policy"}' }]);
  const r = await m.ctx.sbStorage('/storage/v1/object/x', { method: 'POST' });
  check('NO refresca', m.ref() === 0, 'refrescar aqui esconderia un fallo real');
  check('una sola llamada', m.llamadas.length === 1);
  check('y el 403 llega a quien llamo', r.status === 403);
}

console.log('\n— Si el refresco falla porque la sesion ya no vale —');
{
  const m = montar([{ status: 401, body: 'jwt expired' }]);
  // La marca `caducada` es la que pone sbRefrescar cuando el SERVIDOR dice
  // que ese refresh_token ya no sirve.
  m.ctx.sbRefrescar = () => {
    const e = new Error('Sesion caducada'); e.caducada = true;
    return Promise.reject(e);
  };
  let err = null;
  await m.ctx.sbStorage('/storage/v1/object/x', {}).catch(e => { err = e; });
  check('avisa de sesion caducada', m.cad() === 1);
  check('y no se traga el error', err !== null && /caducada/i.test(err.message));
}

console.log('\n— Pero si el refresco falla por la red, la sesion sigue —');
{
  // Esto comprobaba lo contrario: daba por caducada cualquier caida del
  // refresco. Con eso, subir una foto sin cobertura pasada la hora que dura
  // el token te borraba la sesion y te pedia la contrasena otra vez.
  const m = montar([{ status: 401, body: 'jwt expired' }]);
  m.ctx.sbRefrescar = () => Promise.reject(new TypeError('Failed to fetch'));
  let err = null;
  await m.ctx.sbStorage('/storage/v1/object/x', {}).catch(e => { err = e; });
  check('NO se marca la sesion como caducada', m.cad() === 0,
    'te echa de tu cuenta por subir una foto sin cobertura');
  check('pero el fallo llega a quien llamo', err !== null,
    'callarlo dejaria la foto sin subir y sin decirlo');
  check('y es el de la red, no uno inventado', err && /fetch/i.test(err.message),
    'llego: ' + (err && err.message));
}

console.log('\n— Todo bien a la primera —');
{
  const m = montar([{ status: 200 }]);
  await m.ctx.sbStorage('/storage/v1/object/x', {});
  check('una sola llamada', m.llamadas.length === 1);
  check('sin refrescos', m.ref() === 0);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

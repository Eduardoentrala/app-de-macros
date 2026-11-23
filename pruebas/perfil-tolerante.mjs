// Que guardar el perfil no se caiga entero por una columna que aun no
// existe.
//
// Pasó de verdad: se subió el consentimiento antes que su migracion y el
// registro dejó de guardar nada. Y va a volver a pasar, porque la app se
// publica sola al empujar y las migraciones se aplican a mano: el desfase
// es parte del proceso, no un accidente.
//
// Lo que NO debe hacer es tragarse cualquier error. Un fallo de permisos o
// de restriccion tiene que llegar arriba; solo el "no existe esa columna"
// se reintenta sin ella.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const ini = APP.indexOf('function patchPerfilTolerante(');
const fin = APP.indexOf('\n  function sbGuardarPerfil(');
if (ini < 0 || fin < 0) {
  console.log('  FALLA  no se encontro patchPerfilTolerante en app.js');
  console.log('\n0 pasan · 1 fallan');
  process.exit(1);
}

// Cada caso monta su propio contexto: asi se puede cambiar como se comporta
// sbFetch sin arrastrar estado del caso anterior.
function conBackend(comportamiento) {
  const llamadas = [];
  const ctx = vm.createContext({
    sesion: { user: { id: 'abc' } },
    Promise, JSON, Object, String,
    sbFetch: (url, op) => {
      llamadas.push(JSON.parse(op.body));
      return comportamiento(llamadas.length, JSON.parse(op.body));
    }
  });
  vm.runInContext(APP.slice(ini, fin), ctx);
  return { ctx, llamadas };
}

console.log('\n— Cuando la base está al día —');
{
  const { ctx, llamadas } = conBackend(() => Promise.resolve('ok'));
  await ctx.patchPerfilTolerante({ nombre: 'Ana' }, { consentimiento_en: 'hoy' });
  check('se manda todo de una vez', llamadas.length === 1, `hubo ${llamadas.length} llamadas`);
  check('y con los campos nuevos incluidos',
    llamadas[0].nombre === 'Ana' && llamadas[0].consentimiento_en === 'hoy',
    JSON.stringify(llamadas[0]));
}

console.log('\n— Cuando la columna todavía no existe —');
{
  const { ctx, llamadas } = conBackend((n) =>
    n === 1
      ? Promise.reject(new Error('column profiles.consentimiento_en does not exist (42703)'))
      : Promise.resolve('ok'));
  let error = null;
  await ctx.patchPerfilTolerante({ nombre: 'Ana' }, { consentimiento_en: 'hoy' })
    .catch(e => { error = e; });

  check('no revienta', error === null, error && error.message);
  check('reintenta una segunda vez', llamadas.length === 2, `hubo ${llamadas.length}`);
  // Lo importante: la cuenta se guarda igual. Perderla por una columna que
  // llega mañana seria un precio absurdo.
  check('y en el reintento va lo esencial', llamadas[1].nombre === 'Ana',
    JSON.stringify(llamadas[1]));
  check('sin el campo que no existe', !('consentimiento_en' in llamadas[1]),
    JSON.stringify(llamadas[1]));
}

console.log('\n— Pero no se traga cualquier error —');
{
  for (const feo of [
    'permission denied for table profiles',
    'new row violates row-level security policy',
    'violates check constraint "profiles_salud_con_consentimiento"'
  ]) {
    const { ctx, llamadas } = conBackend(() => Promise.reject(new Error(feo)));
    let error = null;
    await ctx.patchPerfilTolerante({ nombre: 'Ana' }, { x: 1 }).catch(e => { error = e; });
    check(`"${feo.slice(0, 34)}…" llega arriba`, error !== null);
    check('  ...y no reintenta a ciegas', llamadas.length === 1, `hubo ${llamadas.length}`);
  }
}

console.log('\n— El consentimiento ya volvio a lo obligatorio —');
{
  // Aqui habia un recordatorio con dientes: el consentimiento estaba en el
  // grupo "puede fallar" SOLO mientras la 0031 no estuviera aplicada, y
  // esta comprobacion exigia que la nota siguiera escrita para que nadie se
  // olvidara. El 23 de noviembre de 2026 se miro la base y las tres
  // columnas estaban, asi que subio.
  //
  // El recordatorio se cambia por lo que recordaba: que este arriba. Dejar
  // el de antes seria pedir una nota sobre algo que ya se hizo, y la nota
  // acabaria volviendo a ponerse sin mover el codigo.
  const g = APP.slice(APP.indexOf('function sbGuardarPerfil('),
                      APP.indexOf('function traducirError('));
  const i = g.indexOf('patchPerfilTolerante(');
  const corte = g.indexOf('}, {', i);
  const primero = corte > 0 ? g.slice(i, corte) : '';
  check('va en el grupo que el reintento NO tira',
    corte > 0 && /consentimiento_en/.test(primero) &&
                 /consentimiento_version/.test(primero) &&
                 /consentimiento_salud_en/.test(primero),
    'un consentimiento que se pierde en silencio no vale como consentimiento; ' +
    'lo mide entero `el-consentimiento-no-se-cae`');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

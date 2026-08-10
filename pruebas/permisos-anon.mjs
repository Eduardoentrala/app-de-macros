// Que nadie sin sesión pueda llamar a lo que se salta RLS.
//
// EL FALLO QUE CIERRA ESTO, y era grave:
//
// `nombrar_super_admin(correo)` convierte una cuenta en super admin. Su
// guarda era `if auth.uid() is not null then raise exception`, o sea que
// abortaba SI HABÍA SESIÓN — la intención era "solo desde el editor SQL".
// Pero `anon` no tiene sesión: auth.uid() es null y la guarda le dejaba
// pasar. Y los revoke eran `from public` y `from authenticated`, que no
// alcanzan a `anon`, porque Supabase le concede execute por su cuenta.
//
// Con la clave publishable -que está a la vista en la app publicada, como
// debe estar- bastaba un POST a /rest/v1/rpc/nombrar_super_admin con
// cualquier correo registrado. Comprobado contra la base real antes de
// arreglarlo: la función se ejecutó.
//
// La lección, que es la que hay que recordar:
//   `revoke ... from public` NO revoca a anon ni a authenticated.
//   Hay que nombrarlos.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'supabase', 'migrations');
const SQL = readFileSync(join(DIR, '0035_cerrar_escalada_de_privilegios.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— La función de escalada queda fuera de la API —');
{
  for (const rol of ['public', 'anon', 'authenticated'])
    check(`se le revoca a ${rol}`,
      new RegExp(`revoke execute on function public\\.nombrar_super_admin\\(text\\) from [^;]*\\b${rol}\\b`).test(SQL));
}

console.log('\n— Y su guarda mira quién llama, no si hay sesión —');
{
  // El fallo estaba aquí: "no hay sesión" es justo la situación del atacante.
  // Se mira solo el CÓDIGO: el archivo explica en sus comentarios cuál era
  // la guarda mala, y buscarla a secas encontraba esa explicación.
  const ordenes = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  check('ya no se guía por auth.uid()',
    !/if auth\.uid\(\) is not null then/.test(ordenes),
    'esa guarda deja pasar a anon, que es quien no tiene sesión');
  check('mira el rol con el que se entra',
    /if current_user in \('anon', 'authenticated'\) then/.test(SQL));
  check('y aborta', /raise exception/.test(SQL));
  // Dos capas: el permiso Y la guarda. Una sola ya falló una vez.
  const iRevoke = SQL.indexOf('revoke execute on function public.nombrar_super_admin');
  const iGuarda = SQL.indexOf("current_user in ('anon', 'authenticated')");
  check('quedan las dos capas, no una', iRevoke >= 0 && iGuarda >= 0);
}

console.log('\n— El barrido alcanza a las que vengan mañana —');
{
  check('recorre todas las SECURITY DEFINER de public',
    /where ns\.nspname = 'public'\s*\n\s*and p\.prosecdef/.test(SQL));
  check('y les quita el permiso a anon',
    /revoke execute on function %s from anon/.test(SQL));
  // Solo a anon: quitárselo a authenticated rompería la app entera, porque
  // las políticas RLS llaman a puede_ver(), mi_rol() y compañía.
  check('no toca a authenticated en el barrido',
    !/revoke execute on function %s from anon, authenticated/.test(SQL));
  check('limpiar_uso_ia también se cierra',
    /revoke execute on function public\.limpiar_uso_ia\(\) from public, anon, authenticated;/.test(SQL));
}

console.log('\n— Y de aquí en adelante no se repite el patrón —');
{
  // El patrón que causó todo esto: `revoke ... from public` sin nombrar a
  // anon. Está por TODAS las migraciones viejas -de la 0002 a la 0031- y ahí
  // se queda: reescribir una migración ya ejecutada no cambia nada en la
  // base, y el barrido de la 0035 las cierra todas de una vez.
  //
  // Lo que sí se vigila es lo que venga DESPUÉS. Si mañana se escribe una
  // función nueva y se revoca solo a public, salta aquí.
  const flojos = [];
  for (const f of readdirSync(DIR).filter(x => x.endsWith('.sql')).sort()) {
    if (parseInt(f.slice(0, 4), 10) < 35) continue;
    const t = readFileSync(join(DIR, f), 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    for (const m of t.matchAll(/revoke\s+(?:execute\s+)?on\s+function\s+([^;]+?)\s+from\s+([^;]+);/gi)) {
      const roles = m[2];
      if (/\bpublic\b/.test(roles) && !/\banon\b/.test(roles))
        flojos.push(`${f}: ... from ${roles.trim()}`);
    }
  }
  check('en las migraciones nuevas, todo revoke a public nombra también a anon',
    flojos.length === 0,
    flojos.join('\n        ') + '\n        (revoke from public NO alcanza a anon)');

  // Y que quede constancia de cuántas heredaron el patrón, para que no se
  // dé por hecho que era un caso aislado.
  let viejas = 0;
  for (const f of readdirSync(DIR).filter(x => x.endsWith('.sql'))) {
    if (parseInt(f.slice(0, 4), 10) >= 35) continue;
    const t = readFileSync(join(DIR, f), 'utf8');
    for (const m of t.matchAll(/revoke\s+(?:execute\s+)?on\s+function\s+[^;]+?\s+from\s+([^;]+);/gi))
      if (/\bpublic\b/.test(m[1]) && !/\banon\b/.test(m[1])) viejas++;
  }
  console.log(`        (nota: ${viejas} revoke antiguos con el mismo patrón; los cierra el barrido de la 0035)`);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

// El contrato de la Edge Function que borra cuentas.
//
// Aqui no se prueba que borre -eso esta en supabase/tests/borrar-cuenta.mjs,
// contra un Postgres de verdad-. Se prueba lo que no se ve mirando la
// pantalla: QUIEN decide, y en QUE ORDEN pasan las cosas.
//
// Las dos cosas importan y las dos son faciles de romper sin darse cuenta:
//   · Si la funcion decidiera los permisos por su cuenta, habria dos sitios
//     donde mirar y un dia dirian cosas distintas.
//   · Si leyera las rutas de las fotos DESPUES de borrar la cuenta, no
//     encontraria ninguna: la cascada ya se llevo las filas, y los archivos
//     se quedarian en el bucket para siempre.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(
  join(RAIZ, 'supabase', 'functions', 'borrar-cuenta', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El permiso lo sigue decidiendo Postgres —');
{
  // La llamada al RPC tiene que ir con el cliente que lleva el token de
  // quien pide, no con el de servicio. Con el de servicio no hay auth.uid()
  // y admin_borrar_cuenta() no podria comprobar nada: borraria a cualquiera
  // que llegase a la funcion.
  check('admin_borrar_cuenta se llama con el token de quien pide',
    /suyo\.rpc\('admin_borrar_cuenta'/.test(FN),
    'si va por `admin`, la comprobacion de super admin deja de existir');
  check('el cliente del solicitante lleva su Authorization',
    /headers: \{ Authorization: auth \}/.test(FN));
  check('y se rechaza si no trae sesion',
    /auth\.startsWith\('Bearer '\)/.test(FN));
  // La funcion no debe tener su propia idea de quien es super admin.
  check('la funcion no reimplementa el permiso',
    !/es_super_admin|role\s*===\s*'super_admin'/.test(FN),
    'duplicar la regla es como se separan las dos versiones');
}

console.log('\n— El orden: rutas, borrado, archivos —');
{
  const rutas   = FN.indexOf("from('progress_photos')");
  const borrado = FN.indexOf("rpc('admin_borrar_cuenta'");
  const fichero = FN.indexOf('.storage.from(BUCKET).remove(');
  check('lee las rutas de las fotos', rutas >= 0);
  check('antes de borrar la cuenta', rutas < borrado,
    `rutas en ${rutas}, borrado en ${borrado}: despues no quedaria ninguna fila`);
  check('y borra los archivos al final', borrado < fichero,
    `borrado en ${borrado}, archivos en ${fichero}`);
  check('pide TODAS, archivadas incluidas',
    !/archivado_en/.test(FN.slice(rutas, borrado)),
    'una foto archivada sigue siendo una foto suya en un servidor');
}

console.log('\n— Y si algo queda suelto, se dice —');
{
  check('cuenta los archivos que no se pudieron borrar', /sueltos/.test(FN));
  check('la app lo enseña en vez de callarlo', /r\.sueltos/.test(APP));
}

console.log('\n— La app usa la funcion, no el RPC pelado —');
{
  // Desde el panel no existe la sesion de esa persona, asi que el RPC solo
  // borraria la base y dejaria las fotos accesibles con su ruta.
  check('el panel llama a la Edge Function',
    APP.includes("'/functions/v1/borrar-cuenta'"));
  const iBoton = APP.indexOf("usrBorrarBtn');");
  const trozo = APP.slice(iBoton, iBoton + 1600);
  check('y ya no al RPC directo desde el panel',
    !/sbRpc\('admin_borrar_cuenta'/.test(trozo),
    'ese camino deja las fotos huerfanas');

  // El borrado propio SI va por el navegador: ahi si existe la sesion del
  // dueño, que es lo unico que la API de Storage acepta sin clave.
  check('el borrado propio sigue limpiando sus fotos antes',
    /borrarMisFotosDelBucket\(\)[\s\S]{0,200}borrar_mi_cuenta/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

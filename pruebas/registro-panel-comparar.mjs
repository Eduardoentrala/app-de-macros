// Las tres zonas que quedaban sin revisar: alta de cuenta, panel de admin
// y comparador de fotos. Salieron tres fallos.
//
//  1. LA CUENTA SE CREABA Y TE DEJABA FUERA
//
//     Al registrarte pasan dos cosas: se crea la cuenta y se guarda tu
//     perfil. Si lo segundo fallaba, el error caía en el `catch` de arriba
//     y salía junto al CAMPO DEL CORREO, en la pantalla de registro.
//
//     Pero la cuenta ya existía y la sesión estaba activa. Quien lo viera
//     reintentaría, y el reintento falla con "ese correo ya tiene cuenta":
//     atrapado fuera de una cuenta que ya es suya. Y si entraba por login,
//     sin peso, altura, edad ni objetivo, y sin saber por qué.
//
//  2. EL BOTÓN DE RECUPERAR CONTRASEÑA NO MANDABA NADA
//
//     Sacaba el aviso "Enlace de recuperación enviado" y se quedaba tan
//     ancho: ni una llamada. En toda la app, la palabra "recuperación"
//     aparecía SOLO en ese texto. Quien no podía entrar a su cuenta oía "ya
//     te lo mandé" y esperaba un correo que no existía.
//
//  3. CON UNA SEMANA DE FOTOS SE COMPARABA UNA FOTO CONSIGO MISMA
//
//     Los dos selectores caían en la única semana que hay, y salía la misma
//     imagen rotulada "Antes" y "Después".
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

console.log('\n— Si la cuenta se creó, se entra —');
{
  const i = APP.indexOf("btnEmpezar.addEventListener('click'");
  const fn = APP.slice(i, i + 2600);
  check('existe el alta', i > 0);

  // El guardado del perfil tiene SU PROPIO catch. Sin él, el fallo cae en
  // el de abajo, que pinta el error junto al correo.
  const gp = fn.indexOf('return sbGuardarPerfil()');
  const suyo = fn.indexOf("['catch']", gp);
  const general = fn.indexOf('marcarError(campoCorreo, avisoCorreo');
  check('el guardado del perfil se atrapa aparte', gp > 0 && suyo > gp && suyo < general,
    'sin su propio catch, un fallo de perfil se enseña como si el correo estuviera mal');

  const cat = fn.slice(suyo, general);
  check('se entra igual, que es lo cierto', /goto\('diario', false\);/.test(cat));
  check('y se dice qué es lo único que falta', /Tu cuenta está lista, pero no pude guardar tus datos/.test(cat));
  check('mandando a completarlo en Perfil', /Complétalos en Perfil/.test(cat));
  check('y se cargan los datos igual', /return cargarDatos\(\);/.test(cat));

  // El catch general se queda para lo que SÍ es del correo: correo repetido,
  // contraseña corta, sin conexión.
  check('el catch general sigue para los fallos del alta', general > 0);
}

console.log('\n— El enlace de recuperación se manda de verdad —');
{
  const i = APP.indexOf("var pw = e.target.closest('[data-pass]');");
  const fn = APP.slice(i, i + 1400);
  check('existe el botón', i > 0);

  // ESTO ERA EL FALLO: decia "enviado" y no habia ni una llamada.
  check('llama a la recuperación de verdad', /'\/auth\/v1\/recover'/.test(fn),
    'antes solo sacaba el aviso: nadie recibia nada');
  check('con el correo de esa persona', /JSON\.stringify\(\{ email: up\.c \}\)/.test(fn));

  // El aviso, DESPUES de que conteste.
  const llamada = fn.indexOf("'/auth/v1/recover'");
  const aviso = fn.indexOf("'Enlace enviado a '");
  check('el «enviado» va después de la respuesta', llamada > 0 && aviso > llamada,
    'decirlo antes es exactamente lo que hacia antes');
  check('y si falla, lo dice', /No se pudo enviar/.test(fn));

  // Le llega a alguien de verdad a su bandeja: se pregunta.
  check('se pregunta antes de mandarlo', /confirm\('¿Mandar a ' \+ up\.c/.test(fn));
  // Y no se puede pulsar dos veces mientras va.
  check('no se puede pulsar dos veces', /boton\.disabled = true;/.test(fn) && /boton\.disabled = false;/.test(fn));
  check('sin correo no se intenta', /No tengo el correo de esa persona/.test(fn));
}

console.log('\n— No se compara una foto consigo misma —');
{
  const i = APP.indexOf('function pintarComparacion(');
  const fn = APP.slice(i, i + 1400);
  check('existe el comparador', i > 0);

  // Con una sola semana, los dos selectores caen en ella: ks[0] y
  // ks[ks.length-1] son la misma.
  check('dos semanas iguales no se comparan', /if\(a === b\)\{/.test(fn),
    'con una sola semana salia la misma foto rotulada Antes y Despues');
  check('y se dice qué hacer', /Elige dos distintas/.test(fn));

  // El aviso pedia "al menos una semana", que es justo cuando NO se puede
  // comparar nada.
  check('el aviso pide dos semanas, no una', /al menos <b>dos<\/b> semanas/.test(fn),
    'pedir una semana es pedir justo lo que no basta');
  // Sin comentarios: el comentario que explica el arreglo CITA el texto
  // viejo, y buscarlo a secas ponía roja la prueba por documentarse bien.
  const sinComentar = APP.replace(/\/\/[^\n]*/g, '');
  check('y ya no lo dice en pantalla', !/al menos una semana/.test(sinComentar));
}

console.log('\n— Lo que se miró y estaba bien —');
{
  // Se fija para que no se rompa: las acciones del panel tocan a OTRAS
  // personas, y ahi un fallo mudo es peor que en cualquier otro sitio.
  for (const [n, marca] of [
    ['encender la IA de alguien', "sbRpc('admin_ia'"],
    ['suspender una cuenta', "sbRpc('admin_estado'"],
    ['activar o desactivar', "sbRpc('admin_activar'"],
  ]) {
    const j = APP.indexOf(marca);
    const t = APP.slice(j, j + 320);
    check(`${n}: se deshace si falla`, /pintarAdmin\(\);/.test(t) && /No se pudo guardar/.test(t));
  }
  // Suspender deja a alguien fuera de su cuenta: eso se pregunta.
  check('suspender pregunta antes', /confirm\('¿Suspender a '/.test(APP));
  // Y las tres pasan por funciones que comprueban el rol en la base, no
  // por un update directo desde el navegador.
  check('van por funciones que revisan el rol', !/rest\/v1\/profiles\?id=eq\.' \+ (u|us|ui)\.id/.test(APP),
    'un update directo desde el navegador se salta la comprobacion de rol');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

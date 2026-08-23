// Recuperar la cuenta cuando no te acuerdas de la contraseña.
//
// QUÉ HABÍA. El super admin podía mandar el enlace desde su panel, y ya. En
// la pantalla de entrar no había nada, y —lo importante— LA APP NUNCA LEÍA
// LA VUELTA: Supabase devuelve a la app con la sesión detrás de la
// almohadilla, y ahí no se miraba. O sea que aquel botón del panel mandaba
// un correo cuyo enlace no llevaba a ninguna parte: se abría la app normal,
// en la pantalla de entrar, y el enlace —que es de un solo uso— quedaba
// gastado.
//
// Es un escalón más del mismo fallo que ya arregló ese botón en su día: «no
// mandaba nada y decía que sí». Aquí mandaba, pero no servía de nada.
//
// LO QUE TIENE QUE PASAR AHORA, de punta a punta:
//   1. «Olvidé mi contraseña» pide el enlace, diciendo a dónde volver.
//   2. Al volver, la app lee la almohadilla y enseña «contraseña nueva».
//   3. Se guarda, se entra con la nueva y se limpia la dirección.
//   4. Y si el enlace caducó, se dice, que es el caso corriente.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const CSS = readFileSync(join(RAIZ, 'docs', 'estilos', 'cuenta.css'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const hasta = (desde, fin) => {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  return APP.slice(i, APP.indexOf(fin, i) + fin.length);
};

// ------------------------------------------------------------------
console.log('\nLa pantalla tiene por dónde empezar');
{
  ok(/id="logOlvide"/.test(HTML), 'hay un «Olvidé mi contraseña» en la pantalla de entrar');
  const i = HTML.indexOf('id="logPass"');
  const j = HTML.indexOf('id="logOlvide"');
  ok(j > i && j - i < 400, 'y está pegado a la contraseña, que es donde se busca');
  ok(/data-view="clave"/.test(HTML), 'y existe la pantalla de poner una nueva');
  ok(/id="clavePass2"/.test(HTML), 'que la pide dos veces',
     'si se teclea mal, se guarda mal y la persona se queda fuera con el enlace ya gastado');
  ok(/\.enlace-legal,\.enlace-suave\{/.test(CSS),
     'el estilo del enlace es uno solo para los dos sitios');
}

// ------------------------------------------------------------------
console.log('\nSe lee lo que trae el enlace, ejecutándolo');
{
  const fuente = hasta('  function loQueTraeElEnlace(){', '\n  }');
  const leer = (hash) => new Function('location',
    fuente + '; return loQueTraeElEnlace();')({ hash });

  ok(leer('') === null, 'sin almohadilla, nada');
  ok(leer('#') === null, 'una almohadilla vacía, tampoco');
  ok(leer('#foo=bar') === null, 'y una almohadilla de otra cosa no se confunde con esto');

  const bueno = leer('#access_token=abc.def&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery');
  ok(bueno && bueno.access_token === 'abc.def', 'de un enlace bueno sale el token');
  ok(bueno && bueno.type === 'recovery', 'y para qué es');
  ok(bueno && bueno.refresh_token === 'r1', 'y con qué renovarse');

  const malo = leer('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  ok(malo && malo.error === 'access_denied', 'de uno caducado sale el error');
  ok(malo && malo.error_description === 'Email link is invalid or has expired',
     'con el + del correo convertido en espacio', JSON.stringify(malo && malo.error_description));

  // Una dirección rara no puede tumbar el arranque de la app entera.
  let reventado = false;
  try { leer('#access_token=a&%%%=1&b'); } catch (e) { reventado = true; }
  ok(!reventado, 'una almohadilla mal formada no revienta el arranque');
}

// ------------------------------------------------------------------
console.log('\nY se traduce a algo que se entienda');
{
  const t = new Function(hasta('  function traducirError(msg){', '\n  }') +
                         '; return traducirError;')();
  ok(/ya no vale/.test(t('Email link is invalid or has expired')),
     'el enlace caducado se explica');
  ok(/ya no vale/.test(t('otp_expired')), 'y por su código también');
  ok(/Espera un minuto/.test(t('For security purposes, you can only request this after 55 seconds')),
     'pedir dos seguidos se explica');
  ok(/Espera un minuto/.test(t('over_email_send_rate_limit')), 'y por su código');
  ok(/ya tenías/.test(t('New password should be different from the old password.')),
     'y repetir la de antes');

  // Lo que decía antes de esto: el 429 del asistente. Leer «llegaste a tu
  // tope de consultas por hoy» tras pedir un enlace no tiene sentido.
  ok(!/consultas/.test(t('over_email_send_rate_limit')),
     'y NO se cuela el mensaje del tope de la IA',
     'dijo: ' + t('over_email_send_rate_limit'));
}

// ------------------------------------------------------------------
console.log('\nEl enlace dice a dónde volver, y se calcula solo');
{
  const d = new Function('location', hasta('  function dondeVuelve(){', '\n  }') +
                         '; return dondeVuelve();');
  ok(d({ origin: 'https://eduardoentrala.github.io', pathname: '/app-de-macros/' })
       === 'https://eduardoentrala.github.io/app-de-macros/',
     'sale la dirección de esta misma app');
  ok(d({ origin: 'http://localhost:8080', pathname: '/' }) === 'http://localhost:8080/',
     'y vale igual probándola en local, sin una dirección escrita a mano');

  const r = hasta('  function sbRecuperar(correo){', '\n  }');
  ok(/redirect_to=' \+ encodeURIComponent\(dondeVuelve\(\)\)/.test(r),
     'y se manda en la petición, codificada');
  ok(/\/auth\/v1\/recover/.test(r), 'a la ruta de recuperar de Supabase');
}

// ------------------------------------------------------------------
console.log('\nAl volver, la contraseña nueva gana a todo');
{
  const arranque = APP.slice(APP.indexOf('  // AL ABRIR, LO PRIMERO ES MIRAR SI SE VIENE DEL CORREO.'),
                             APP.indexOf('  // ================= FOTOS DE PROGRESO'));
  ok(/var delCorreo = loQueTraeElEnlace\(\);/.test(arranque), 'se mira al arrancar');
  ok(/if\(delCorreo\) limpiarElEnlace\(\);/.test(arranque),
     'y la dirección se limpia en cuanto se ha leído',
     'ese token es una sesión: dejarlo ahí lo deja en el historial');

  // El orden: la vuelta del correo va ANTES que la sesión guardada.
  const iRec = arranque.indexOf("delCorreo.type === 'recovery'");
  const iSes = arranque.indexOf('else if(sesion && sesion.access_token)');
  ok(iRec > 0 && iSes > iRec,
     'quien ya tenía sesión abierta también acaba en «contraseña nueva»',
     'mandarlo al Diario ignora lo que vino a hacer y le gasta el enlace');
  ok(/goto\('clave', false\)/.test(arranque), 'se enseña la pantalla de la contraseña');
  ok(/avisarLogin\(traducirError\(delCorreo\.error_description \|\| delCorreo\.error\)\)/.test(arranque),
     'y si el enlace venía caducado, se dice',
     'sin esto la app arranca normal y la persona no sabe por qué su enlace no hizo nada');
}

// ------------------------------------------------------------------
console.log('\nGuardar la nueva: lo que no puede fallar');
{
  const g = hasta("  btnClave.addEventListener('click', function(){", '\n  });');
  ok(/nueva\.length < 6/.test(g), 'se pide un mínimo, el mismo que al registrarse');
  ok(/nueva !== otra/.test(g), 'y que las dos coincidan');
  ok(/if\(!claveToken\)/.test(g), 'y sin token no se intenta');

  // La sesión del enlace NO se guarda hasta que la contraseña está cambiada:
  // si se abandona la pantalla, no queda nada en el teléfono.
  ok(!/guardarSesion\(delCorreo\)/.test(APP),
     'la sesión del enlace no se guarda solo por llegar',
     'quien abre el enlace y se arrepiente se quedaría dentro sin haber puesto nada');

  ok(/sbEntrar\(correo, nueva\)/.test(g),
     'se entra con la contraseña NUEVA, no con el token del enlace',
     'ese token puede venir sin con qué renovarse: la app iría una hora y luego echaría a la persona');
  ok(/Tu contraseña ya está cambiada\. Entra con ella\./.test(g),
     'y si eso falla, se dice la verdad: ya está cambiada',
     'decir «no se pudo» dejaría a la persona probando la vieja');
}

// ------------------------------------------------------------------
console.log('\nY la recarga por versión nueva no se come el enlace');
{
  // El index se recarga solo cuando hay versión nueva publicada. Sin el hash
  // detrás, quien pulsa su enlace justo después de un despliegue lo pierde.
  ok(/location\.replace\(location\.pathname \+ '\?v=' \+ nuevo \+ location\.hash\)/.test(HTML),
     'la recarga se lleva la almohadilla con ella',
     'un despliegue reciente se comía el enlace y lo gastaba para nada');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

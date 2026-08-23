// Tres cosas del panel del entrenador.
//
// 1. iniciales(null) revienta. La lista de "a quién inscribo" se pinta con
//    iniciales(u.nombre) y en la línea de al lado ya se contempla que ese
//    nombre venga vacío: `u.nombre || '(sin nombre)'`. Y viene: plan_buscar
//    devuelve `p.full_name::text` sin coalesce, y encuentra a la gente
//    TAMBIÉN por su correo, así que alguien sin nombre puesto sale en la
//    búsqueda. Al pintarlo salta un TypeError dentro del .map y no se pinta
//    NADA: la búsqueda entera se queda en blanco por una sola persona.
//
// 2. El nombre de otra persona se pinta sin escapar. Todo el resto de la app
//    lo escapa; esta tarjeta se quedó fuera. Un nombre con un `<` descoloca
//    la tarjeta, y uno hecho a mala idea mete HTML en la pantalla del
//    entrenador que lo mira.
//
// 3. «Clientes 109 en total», a pelo en el código. Es de cuando la pantalla
//    era un mockup.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations',
  '0043_buscar_a_quien_inscribir.sql'), 'utf8');

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

const app = new Function(
  hasta('  function escapar(', '\n  }') + '\n' +
  hasta('  function iniciales(nombre){', '\n  }') + '\n' +
  hasta('  function tarjetaCliente(c){', '\n  }') + '\n' +
  'return { iniciales: iniciales, tarjetaCliente: tarjetaCliente, escapar: escapar };')();

// ------------------------------------------------------------------
console.log('\n1. Un nombre que falta no puede tumbar la lista');
{
  const sinRomper = (v) => { try { return { val: app.iniciales(v) }; } catch (e) { return { err: e }; } };

  const nulo = sinRomper(null);
  ok(!nulo.err, 'iniciales(null) no revienta',
     'salta ' + (nulo.err && nulo.err.message) +
     ' dentro del .map: la búsqueda entera se queda en blanco');
  ok(nulo.val === '', 'y no devuelve nada, que es lo que hay', JSON.stringify(nulo.val));

  ok(!sinRomper(undefined).err, 'iniciales(undefined) tampoco');
  ok(sinRomper('').val === '', 'un nombre vacío da vacío');
  ok(sinRomper('   ').val === '', 'y uno de solo espacios también',
     JSON.stringify(sinRomper('   ').val));
  ok(sinRomper('Ana  María  López').val === 'AM',
     'los espacios de más no se cuelan como iniciales en blanco',
     JSON.stringify(sinRomper('Ana  María  López').val));
}

console.log('\nY lo que ya hacía bien');
{
  ok(app.iniciales('Ana') === 'A', 'un nombre solo da una inicial');
  ok(app.iniciales('Ana María López') === 'AM', 'dos como mucho');
  ok(app.iniciales('eduardo entrala') === 'EE', 'en mayúsculas');
}

// ------------------------------------------------------------------
console.log('\n2. El nombre de otra persona, escapado');
{
  const html = app.tarjetaCliente({
    n: '<img src=x onerror="alert(1)">', obj: 'Bajar grasa', sem: '3 sem', act: '—' });
  ok(html.indexOf('<img') < 0,
     'un nombre con HTML dentro no se pinta como HTML',
     'sale tal cual en la pantalla de quien lo mira');
  ok(html.indexOf('&lt;img') >= 0, 'se ve el texto, que es lo que se escribió');
  // Y el nombre de verdad se sigue viendo bien.
  ok(app.tarjetaCliente({ n: 'Ana', obj: 'x', sem: '1 sem', act: '—' }).indexOf('<b>Ana</b>') >= 0,
     'y un nombre normal se ve igual que siempre');
}

// ------------------------------------------------------------------
console.log('\n3. Nada de números inventados');
{
  // Se busca el trozo que se PINTA, no el texto suelto: el comentario que
  // cuenta por qué se quitó lo nombra, y buscar solo «109 en total» daba
  // rojo por explicar el arreglo.
  ok(!/<small>109 en total<\/small>/.test(APP), 'no queda el «109 en total» del mockup',
     'el super admin lee 109 clientes donde hay los que haya');
  // Y la lista que lo acompañaba: COACHES no la llenaba nadie, así que esa
  // sección salía siempre vacía.
  const quedan = (APP.match(/COACHES/g) || []).length;
  ok(quedan === 0, 'ni la lista de entrenadores que nadie llenaba',
     'quedan ' + quedan + ' menciones de COACHES');
}

// ------------------------------------------------------------------
console.log('\nY el aviso de por qué el nombre puede venir vacío');
{
  ok(/p\.full_name::text/.test(SQL), 'plan_buscar devuelve el nombre tal cual');
  ok(/normalizar_texto\(u\.email::text\) like/.test(SQL),
     'y encuentra por correo, así que alguien sin nombre puesto sale en la lista');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

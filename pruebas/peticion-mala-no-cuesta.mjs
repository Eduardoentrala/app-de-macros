// Una petición que no se va a atender no puede gastarte una consulta.
//
// La regla está escrita TRES veces en la propia función:
//
//   «Se lee ANTES del tope: hay una acción que no debe gastarlo.»
//   «va aquí, ANTES del tope diario, a propósito: si algo está apagado no
//    puede gastar una de las consultas del día. Al revés, alguien perdería
//    sus consultas pulsando un botón que nunca le iba a contestar.»
//   «se devuelve el motivo en vez de lanzar para que cada acción conteste
//    con su propio 400 y el tope diario no se gaste en una petición mal
//    formada.»
//
// Y había dos caminos que no la cumplían, los dos por lo mismo: la
// comprobación vivía DESPUÉS del cobro.
//
// 1. LA FOTO MAL FORMADA. `leerImagenes` devuelve el motivo en vez de lanzar
//    justo para esto —lo dice su comentario— pero se llamaba dentro de cada
//    acción, en la línea 1275, y el tope se cobra en la 1159. Mandar una foto
//    demasiado grande o de un tipo que no se acepta costaba una consulta y
//    devolvía un error. Con el tope normal en unas pocas al día, unos cuantos
//    intentos dejaban a alguien sin asistente hasta mañana, sin haber
//    recibido ni una respuesta.
//
// 2. LA ACCIÓN QUE NO EXISTE. El «Acción desconocida» está al final del todo,
//    después de las siete ramas. Para llegar ahí ya se pasó por el cobro. Una
//    versión vieja de la app llamando a algo que se renombró gastaría el día
//    entero a base de 400.
//
// El arreglo es mover las dos comprobaciones delante del cobro. Nada más.
//
// ESTA PRUEBA MIRA EL ORDEN, que es lo único que importa aquí: da igual cómo
// esté escrita cada comprobación mientras ocurra antes de cobrar.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// El punto exacto en que se cobra. Todo lo que sea rechazar una petición
// tiene que estar ANTES de aquí.
const COBRO = FN.indexOf("await admin.rpc('gastar_consulta_ia'");
const linea = (i) => FN.slice(0, i).split('\n').length;

console.log('\nSe encuentra el punto donde se cobra');
ok(COBRO > 0, 'la llamada que gasta una consulta está, en la línea ' + linea(COBRO));

// ------------------------------------------------------------------
console.log('\nLa acción que no existe se rechaza antes de cobrar');
{
  // No se busca una frase: se saca la guarda y se EJECUTA. Tener la lista no
  // sirve de nada si nadie la mira — comprobar solo que la lista existe deja
  // pasar el caso de borrar el `if` y dejarse el `const`, que es exactamente
  // lo que una mutación hizo y esta prueba no vio.
  const decl = FN.indexOf('const ACCIONES');
  ok(decl > 0, 'hay una lista de las acciones que existen');

  const guarda = FN.indexOf('if (!ACCIONES', decl);
  ok(guarda > 0, 'y algo la mira para rechazar lo que no está en ella',
     'la lista sola no rechaza nada');
  ok(guarda > 0 && guarda < COBRO,
     'antes de cobrar (línea ' + linea(guarda) + ' < ' + linea(COBRO) + ')',
     'el «Acción desconocida» del final llega después del cobro: una app vieja ' +
     'llamando a algo renombrado gastaría el día entero a base de 400');

  // Y que rechace lo que tiene que rechazar, y solo eso.
  const arr = FN.slice(FN.indexOf('[', decl), FN.indexOf(']', decl) + 1);
  const cond = FN.slice(FN.indexOf('(', guarda) + 1, FN.indexOf(') return', guarda));
  const rechaza = new Function('accion',
    'const ACCIONES = ' + arr + '; return (' + cond + ');');
  ok(rechaza('inventada') === true, 'una acción que no existe se rechaza');
  ok(rechaza('') === true, 'y una petición sin acción, también');
  ok(rechaza('chat') === false && rechaza('semana') === false,
     'y las que sí existen pasan',
     'si rechazara de más, la app entera dejaría de funcionar');

  // Y que la lista sea la de verdad: las siete ramas que se atienden.
  const atendidas = [...FN.matchAll(/\n\s{4}if \(accion === '([a-z]+)'\)/g)].map((m) => m[1]);
  ok(atendidas.length >= 7, 'se atienden ' + atendidas.length + ' acciones');

  const listadas = [...arr.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  const faltan = atendidas.filter((a) => !listadas.includes(a));
  ok(faltan.length === 0,
     'y todas están en la lista, así que ninguna se rechaza por error',
     'faltan: ' + faltan.join(', ') + ' — se rechazarían con 400 aunque tengan rama');
  const sobran = listadas.filter((a) => !atendidas.includes(a));
  ok(sobran.length === 0,
     'y no hay ninguna de más, que cobraría y luego moriría en el final',
     'sobran: ' + sobran.join(', '));
}

// ------------------------------------------------------------------
console.log('\nLa foto mal formada se rechaza antes de cobrar');
{
  // `leerImagenes` devuelve un string cuando algo no cuadra. Lo que importa
  // es que ESE string se convierta en 400 antes del cobro.
  const usos = [...FN.matchAll(/leerImagenes\(cuerpo\)/g)].map((m) => m.index);
  ok(usos.length >= 1, 'se leen las imágenes en ' + usos.length + ' sitio(s)');
  ok(usos.some((u) => u < COBRO),
     'y al menos una lectura ocurre antes de cobrar (línea ' +
       usos.map(linea).join(', ') + ' vs ' + linea(COBRO) + ')',
     'leerla solo dentro de la acción es leerla después del cobro: una foto ' +
     'demasiado grande cuesta una consulta y devuelve un error');

  // Y el rechazo, no solo la lectura.
  const primera = Math.min(...usos);
  const rechazo = FN.indexOf("typeof fotosPedidas === 'string'", primera);
  ok(rechazo > 0 && rechazo < COBRO,
     'y el 400 por foto mala también sale antes de cobrar',
     'leerla antes no sirve de nada si el error se contesta después');
}

// ------------------------------------------------------------------
console.log('\nY lo que ya estaba bien sigue estando');
{
  // Las llaves apagadas. Esta era la única de las tres que sí se cumplía, y
  // el arreglo mueve código a su alrededor: conviene fijarla.
  const llaves = FN.indexOf("from('ia_permisos')");
  ok(llaves > 0 && llaves < COBRO,
     'una llave apagada se rechaza antes de cobrar',
     'si no, se pierden consultas pulsando un botón que nunca iba a contestar');

  // El JSON ilegible.
  const malFormada = FN.indexOf("error: 'Petición mal formada.'");
  ok(malFormada > 0 && malFormada < COBRO, 'y un JSON ilegible también');

  // Y actuar sobre otra persona sin permiso.
  const ajeno = FN.indexOf('await mandaSobre(admin, userId, pedido)');
  ok(ajeno > 0 && ajeno < COBRO, 'y mandar sobre quien no te toca, también');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

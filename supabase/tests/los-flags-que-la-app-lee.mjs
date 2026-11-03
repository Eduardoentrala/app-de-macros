// Un interruptor que la app lee y que nadie encendió apaga en silencio.
//
// LO QUE PASÓ. El flag `ia` se sembró en `false` en la 0003 y ahí se quedó,
// inofensivo, porque nadie lo leía: la app enseñaba el asistente a todo el
// mundo sin preguntar. El día que los interruptores del panel empezaron a
// hacer algo, la app pasó a obedecer un flag que llevaba meses diciendo
// «apagado» y el asistente desapareció para todos a la vez.
//
// No lo rompió ese cambio: lo destapó. El cambio hizo justo lo que prometía.
//
// Y ES EL PEOR APAGADO QUE HAY, porque `public.flag()` hace:
//
//     coalesce((select activo from feature_flags where clave = ...), false)
//
// o sea que «está apagado» y «esa fila no existe» dan exactamente lo mismo.
// Desde fuera no hay error, ni aviso, ni registro: solo un botón que ya no
// está. Se tarda más en darse cuenta que en arreglarlo.
//
// LO QUE FIJA ESTA PRUEBA: que todo flag del que la app dependa para enseñar
// una pantalla EXISTA y esté ENCENDIDO en una base recién levantada. No que
// existan todos los flags —hay cuatro que son promesas de cosas que no
// existen, y esos tienen que seguir apagados—: solo los que, estando
// apagados, esconden algo que la app ya tiene hecho.
//
// Se corre contra un Postgres de verdad con TODAS las migraciones aplicadas,
// así que mide lo que mediría un proyecto nuevo.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');
const APP = readFileSync(join(AQUI, '..', '..', 'docs', 'app.js'), 'utf8');

const db = await PGlite.create();
await db.exec(readFileSync(join(AQUI, 'bootstrap.sql'), 'utf8'));
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(MIG, f), 'utf8'));
}

let ok = 0, bad = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { bad++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// ------------------------------------------------------------------
console.log('\n— De qué flags depende la app para enseñar algo —');

// Se leen del CÓDIGO, no de una lista escrita aquí: una lista a mano se
// queda vieja el día que alguien añada un `flagActiva('loquesea')` y nadie
// se acuerde de venir a apuntarlo.
const pedidos = [...APP.matchAll(/flagActiva\('([a-z_]+)'\)/g)].map((m) => m[1]);
const unicos = [...new Set(pedidos)];

check(`la app pregunta por ${unicos.length} interruptor(es): ${unicos.join(', ')}`,
  unicos.length > 0,
  'si salen cero, `flagActiva` se renombró y esta prueba no está mirando nada');

// ------------------------------------------------------------------
console.log('\n— Y todos existen y están encendidos —');
{
  const filas = (await db.query(
    `select clave, activo from public.feature_flags order by clave`)).rows;
  const porClave = new Map(filas.map((f) => [f.clave, f.activo]));

  for (const clave of unicos) {
    check(`«${clave}» existe en la tabla`, porClave.has(clave),
      'la app lo lee y `flag()` devuelve false para una fila que no existe: ' +
      'esa función queda apagada sin que nada lo diga');
    check(`y nace encendido`, porClave.get(clave) === true,
      `«${clave}» se siembra en ${porClave.get(clave)}. La app lo lee para ` +
      'decidir si enseña su pantalla, así que un proyecto nuevo nacería sin ' +
      'ella. Es exactamente lo que pasó con `ia`: meses apagado sin que se ' +
      'notara, hasta el día que el código empezó a mirarlo.');
  }
}

// ------------------------------------------------------------------
console.log('\n— Y los que todavía no existen siguen apagados —');
{
  // El otro lado de la moneda: encenderlos todos «por si acaso» pondría en
  // la pantalla interruptores de cosas que no están hechas.
  const filas = (await db.query(
    `select clave, activo from public.feature_flags
      where clave in ('chat','notificaciones','suscripciones',
                      'registro_entrenadores','modo_mantenimiento')`)).rows;
  const encendidosDeMas = filas
    .filter((f) => f.activo && f.clave !== 'notificaciones')
    .map((f) => f.clave);
  check('ninguno promete algo que no existe', encendidosDeMas.length === 0,
    'encendidos: ' + encendidosDeMas.join(', '));
  check('y el modo mantenimiento nace apagado',
    filas.find((f) => f.clave === 'modo_mantenimiento')?.activo === false,
    'nacer en mantenimiento dejaría fuera a todo el mundo menos al super admin');
}

// ------------------------------------------------------------------
console.log('\n— Y `flag()` sigue siendo el silencio que es —');
{
  // No se arregla la función: que una fila ausente dé `false` es lo correcto
  // —un interruptor que no existe no enciende nada—. Lo que hay que saber es
  // que NO SE DISTINGUE de uno apagado, y por eso hace falta la prueba de
  // arriba. Si algún día eso cambia, que se entere alguien.
  const ausente = (await db.query(`select public.flag('no_existe_este') as v`)).rows[0];
  check('un flag que no existe devuelve false, no nulo', ausente.v === false,
    'si pasara a devolver null, la app lo leería como «no se pudo preguntar» ' +
    'y lo dejaría encendido: cambiaría el sentido de todos los interruptores');

  const ia = (await db.query(`select public.flag('ia') as v`)).rows[0];
  check('y el de la IA contesta que sí', ia.v === true,
    'es el que esconde el asistente entero');
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);

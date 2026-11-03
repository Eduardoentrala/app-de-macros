// La app no tenía dónde decir que algo le salió mal.
//
// Todo lo encontrado hasta hoy se encontró igual: alguien mirando su
// teléfono y diciéndolo. El interruptor de la IA llevaba MESES apagado.
// Ninguno de esos fallos levantó la mano, porque no había sitio donde
// levantarla.
//
// Esta tabla es ese sitio. Y como va a recibir escrituras desde dentro de
// `catch` —el peor momento posible— tiene que cumplir tres cosas que se
// comprueban aquí ejecutándolas:
//
//   1. Que no pueda tumbar lo que ya estaba fallando: devuelve false, no
//      revienta.
//   2. Que un fallo en bucle no llene la tabla.
//   3. Que no la lea quien no debe. Un registro de fallos es, por su
//      naturaleza, lo más indiscreto que hay en una base.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIG = join(AQUI, '..', 'migrations');

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
const as = async (uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
  await db.exec('set role authenticated');
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
};

const YO    = '11111111-1111-1111-1111-111111111111';
const OTRO  = '22222222-2222-2222-2222-222222222222';
const JEFE  = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users(id,email) values
  ('${YO}','yo@x.com'),('${OTRO}','otro@x.com'),('${JEFE}','jefe@x.com')`);
await db.exec(`update public.profiles set role='super_admin' where id='${JEFE}'`);

const apuntar = (uid, donde, que, ver = null) => as(uid,
  `select public.apuntar_error(${esc(donde)}, ${esc(que)}, ${ver ? esc(ver) : 'null'}) as v`);
function esc(s) { return `'` + String(s).replace(/'/g, `''`) + `'`; }

// ------------------------------------------------------------------
console.log('— Se apunta, y se apunta lo justo —');
{
  const r = await apuntar(YO, 'guardar_sesion', 'Failed to fetch', 'ad83201b42');
  check('devuelve que sí lo apuntó', r.rows[0].v === true);

  const f = (await db.query(
    `select donde, que, version, user_id from public.errores`)).rows;
  check('y la fila está', f.length === 1, JSON.stringify(f));
  check('con el sitio', f[0]?.donde === 'guardar_sesion');
  check('con el mensaje', f[0]?.que === 'Failed to fetch');
  check('con la versión de la app', f[0]?.version === 'ad83201b42',
    'sin esto, «eso ya lo arreglé» no se puede comprobar: un error de hace ' +
    'una semana y uno de ahora se leen igual');
  check('y a nombre de quien lo sufrió', f[0]?.user_id === YO);
}

// ------------------------------------------------------------------
console.log('\n— Lo largo se recorta, no revienta —');
{
  // Se escribe desde dentro de un `catch`. Si un mensaje largo hiciera
  // fallar la inserción, el registro de fallos estaría provocando fallos.
  const r = await apuntar(YO, 'x'.repeat(200), 'y'.repeat(5000));
  check('un mensaje enorme se apunta igual', r.rows[0].v === true);
  const f = (await db.query(
    `select donde, que from public.errores order by creado_en desc limit 1`)).rows[0];
  check('con el sitio recortado', f.donde.length === 60, 'quedó en ' + f.donde.length);
  check('y el mensaje recortado', f.que.length === 300, 'quedó en ' + f.que.length);

  const vacío = await apuntar(YO, '   ', '   ');
  check('y uno vacío tampoco revienta', vacío.rows[0].v === true,
    'un `catch` puede recoger un error sin mensaje, y ahí es cuando más ' +
    'falta hace saber dónde fue');
}

// ------------------------------------------------------------------
console.log('\n— Y un fallo en bucle no llena la tabla —');
{
  await db.exec(`delete from public.errores`);
  let últimas = [];
  for (let i = 0; i < 60; i++) {
    const r = await apuntar(YO, 'bucle', 'otra vez ' + i);
    últimas.push(r.rows[0].v);
  }
  const cuántas = (await db.query(
    `select count(*)::int as n from public.errores where user_id='${YO}'`)).rows[0].n;
  check('se paran a los 50', cuántas === 50, 'quedaron ' + cuántas);
  check('y las de más dicen que no se apuntaron', últimas[59] === false,
    'devolver true sin guardar sería mentirle a quien llama');

  // Y el freno es POR PERSONA: que a alguien se le dispare un bucle no
  // puede dejar sin registro a los demás, que es cuando más falta hace.
  const otra = await apuntar(OTRO, 'lo suyo', 'su error');
  check('pero a otra persona se le siguen apuntando', otra.rows[0].v === true);
}

// ------------------------------------------------------------------
console.log('\n— Y no los lee cualquiera —');
{
  const míos = await as(YO, `select count(*)::int as n from public.errores`);
  check('ni siquiera quien los sufrió los ve', míos.rows[0].n === 0,
    've ' + míos.rows[0].n + '. No puede hacer nada con ellos y enseñárselos ' +
    'solo preocupa');

  const delJefe = await as(JEFE, `select count(*)::int as n from public.errores`);
  check('y el super admin los ve todos', delJefe.rows[0].n > 0,
    've ' + delJefe.rows[0].n + '. Si no los ve nadie, la tabla no sirve de nada');
}

// ------------------------------------------------------------------
console.log('\n— Y nadie se los inventa a mano —');
{
  let negado = false;
  try {
    await as(YO, `insert into public.errores(user_id, donde, que)
                  values ('${OTRO}','inventado','no pasó')`);
  } catch { negado = true; }
  const colados = (await db.query(
    `select count(*)::int as n from public.errores where donde='inventado'`)).rows[0].n;
  check('no se puede escribir directo en la tabla', negado || colados === 0,
    'la puerta es `apuntar_error()`, que es donde está el freno de los 50');
}

console.log(`\n${ok} pasan · ${bad} fallan`);
process.exit(bad ? 1 : 0);

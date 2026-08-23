// Pedir algo EN NOMBRE de otra persona.
//
// Dos acciones del asistente reciben un id ajeno por el cuerpo de la
// petición: `cliente` (el resumen para el entrenador) y `plan`. La función
// corre con la clave de servicio, o sea saltándose las políticas de la base,
// así que ese id hay que comprobarlo a mano.
//
// EL FALLO. La comprobación estaba escrita DENTRO de la acción `cliente`,
// así que `plan` se quedó sin ella. Y ese id no es decorativo: es el que
// decide DE QUIÉN son las llaves de la IA que se miran. Quien tuviera su
// «plan de la semana» apagado -que es la llave que más dinero mueve- lo
// esquivaba mandando el id de cualquiera que la tuviera encendida.
//
// No filtra datos de nadie, porque el plan se arma con lo que va en la misma
// petición. Lo que se salta es el interruptor, que está puesto justo para
// que no gaste.

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

// ---- La regla de verdad, sacada y ejecutada ----
// Se le quita el molde de TypeScript de la firma, que es lo único que Node
// no entiende; el cuerpo va tal cual.
const i = FN.indexOf('async function mandaSobre(');
ok(i > 0, 'la regla vive en una función suya');

const fuente = FN.slice(i, FN.indexOf('\n}', i) + 2)
  .replace(/mandaSobre\([\s\S]*?\)\s*:\s*Promise<string \| null>\s*\{/,
           'mandaSobre(admin, userId, cliente) {');
ok(!/:\s*(string|ReturnType|Promise)/.test(fuente),
   'y se le pudo quitar el molde para ejecutarla', fuente.slice(0, 120));

const mandaSobre = new Function(fuente + '; return mandaSobre;')();

// Un `admin` de mentira: un rol por persona y una lista de quién lleva a quién.
const baseDe = (roles, asignados) => ({
  from(tabla) {
    const q = { tabla, filtros: {} };
    q.select = () => q;
    q.eq = (col, val) => { q.filtros[col] = val; return q; };
    q.single = () => Promise.resolve({
      data: roles[q.filtros.id] ? { role: roles[q.filtros.id] } : null });
    q.maybeSingle = () => Promise.resolve({
      data: asignados.some((a) => a[0] === q.filtros.coach_id && a[1] === q.filtros.cliente_id)
        ? { cliente_id: q.filtros.cliente_id } : null });
    return q;
  },
});

const ROLES = { yo: 'cliente', entre: 'coach', jefe: 'super_admin',
                orga: 'org_admin', otro: 'cliente' };
const LLEVA = [['entre', 'otro'], ['orga', 'otro']];
const db = baseDe(ROLES, LLEVA);

// ------------------------------------------------------------------
console.log('\nSobre uno mismo, siempre');
{
  ok(await mandaSobre(db, 'yo', '') === null, 'sin id ajeno no hay nada que comprobar');
  ok(await mandaSobre(db, 'yo', 'yo') === null, 'y sobre uno mismo, adelante');
}

console.log('\nSobre otra persona, solo quien puede');
{
  ok(await mandaSobre(db, 'entre', 'otro') === null, 'el entrenador, sobre su cliente');
  ok(await mandaSobre(db, 'jefe', 'otro') === null, 'el super admin, sobre cualquiera');
  // El admin de organización lleva gente igual que un coach. Sin él en la
  // regla, quien administra una organización no puede pedir un plan para
  // los suyos y no hay forma de saber por qué.
  ok(await mandaSobre(db, 'orga', 'otro') === null, 'y el admin de organización, sobre los suyos');
  ok(await mandaSobre(db, 'orga', 'yo') !== null, 'pero tampoco sobre quien no lleva');

  const ajeno = await mandaSobre(db, 'yo', 'otro');
  ok(ajeno !== null, 'un cliente NO puede pedir sobre otro',
     'con esto se esquiva la llave apagada mandando el id de quien la tenga encendida');
  ok(/entrenadores/.test(ajeno || ''), 'y se le dice por qué', String(ajeno));

  const noSuyo = await mandaSobre(db, 'entre', 'yo');
  ok(noSuyo !== null, 'ni un entrenador sobre alguien que no lleva');
  ok(/no es cliente tuyo/.test(noSuyo || ''), 'con su motivo', String(noSuyo));
}

// ------------------------------------------------------------------
console.log('\nY las DOS acciones que reciben un id ajeno la usan');
{
  // El sitio donde se decide de quién son las llaves: si se comprueba ahí,
  // vale para plan y para cliente a la vez.
  const iLlave = FN.indexOf("const pedido = (accion === 'plan' || accion === 'cliente')");
  ok(iLlave > 0, 'el id ajeno se recoge una vez para las dos acciones');
  const trozo = FN.slice(iLlave, iLlave + 900);
  ok(/await mandaSobre\(admin, userId, pedido\)/.test(trozo),
     'y se comprueba ANTES de mirar las llaves',
     'sin esto, plan mira las llaves de otra persona sin permiso');
  ok(/return json\(\{ error: motivo \}, 403\)/.test(trozo), 'y se responde 403');
  // El orden importa: comprobar después de mirar las llaves ya habría
  // dejado que las llaves de otro decidieran.
  ok(trozo.indexOf('mandaSobre') < trozo.indexOf(".from('ia_permisos')"),
     'la comprobación va antes que la consulta de llaves');

  // Y la acción `cliente` no se queda colgando de que exista esa llave.
  const iCli = FN.indexOf("if (accion === 'cliente')");
  ok(/const noPuede = await mandaSobre\(admin, userId, cliente\)/
      .test(FN.slice(iCli, iCli + 2000)),
     'y el análisis lo vuelve a comprobar por su cuenta');

  // Que no quede la copia vieja escrita a mano en ningún sitio.
  const copias = (FN.match(/\.from\('coach_clientes'\)/g) || []).length;
  ok(copias === 1, 'la regla no está copiada en dos sitios',
     'aparece ' + copias + ' veces: se arregla una y se olvida la otra, que es justo lo que pasó');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

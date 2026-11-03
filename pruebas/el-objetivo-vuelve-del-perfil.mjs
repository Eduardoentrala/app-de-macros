// La app olvidaba tu objetivo al iniciar sesión, y eso borraba tus macros.
//
// `volcarPerfilEnRegistro()` repone en los campos del registro lo que hace
// falta para volver a calcular: la edad, la altura, el peso, el sexo, los
// días de entreno, las condiciones de salud y la nota. Todo menos UNA cosa.
//
// EL OBJETIVO NO VOLVÍA. `reg.objetivo` arranca en 'mantener' y ahí se
// quedaba, aunque en la base pusiera 'bajar'. Tres cosas se rompían:
//
// 1. LA PANTALLA MIENTE. `pintarObjetivoPerfil()` lee `reg.objetivo`, así que
//    Perfil decía «Mantener peso» a quien está bajando.
//
// 2. Y PEOR: EL GUARD QUE PROTEGE LOS MACROS DEJA DE PROTEGER. Al elegir
//    objetivo hay un `if(objElegido === reg.objetivo){ cerrar; return; }`
//    puesto ahí a propósito, y su comentario lo dice entero: sin él, tocar
//    el objetivo «solo puede hacer una cosa: borrar de un toque lo que el
//    cierre de los lunes llevaba ajustado —semanas de moverte las calorías
//    según tu peso, lo que apuntaste y el hambre—».
//
//    Comparando contra 'mantener', alguien que entra y toca SU PROPIO
//    objetivo —«bajar», el que ya tenía— no coincide, así que el guard no
//    salta: se recalcula desde la fórmula del registro y se tiran meses de
//    ajuste fino. El guard existía y no servía.
//
// 3. Y cualquier recálculo usaba el factor de 'mantener' (×1) en vez del de
//    'bajar' (×0,80): un 25 % más de calorías, en la dirección contraria.
//
// Se vio en una base de verdad: `profiles.goal` = 'bajar', y la app
// enseñando otra cosa.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '{') n++;
    else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// Se ejecuta la función DE VERDAD con un perfil de mentira y se mira qué
// deja en `reg`. Nada de buscar la línea escrita: lo que importa es el
// estado en el que queda la app.
function volcar(perfil) {
  const campos = {};
  const pedir = (id) => (campos[id] = campos[id] || { value: '', textContent: '' });
  const reg = { sexo: 'h', objetivo: 'mantener', dias: 3 };
  const caja = { querySelectorAll: () => [] };
  const doc = {
    getElementById: pedir,
    querySelectorAll: () => [],
  };
  //  y  se llaman al final y tocan el
  // DOM entero. Aqui no se prueban: se pasan como dobles para que la
  // funcion llegue hasta el final y se pueda mirar que dejo en `reg`.
  new Function('p', 'reg', 'document', 'cajaCond', 'marcarUno', 'Array', 'Number',
    'calcularMacros', 'pintarSaludPerfil', 'CONSENTIMIENTO_SALUD',
    sacar('function volcarPerfilEnRegistro(p){') + '; volcarPerfilEnRegistro(p);')(
    perfil, reg, doc, caja, () => {}, Array, Number, () => ({}), () => {}, null);
  return { reg, campos };
}

// ------------------------------------------------------------------
console.log('\nEl objetivo vuelve de la base');
{
  for (const suyo of ['bajar', 'subir', 'mantener']) {
    const { reg } = volcar({ goal: suyo, age: 30, height_cm: 175, weight_kg: 82 });
    ok(reg.objetivo === suyo, `«${suyo}» vuelve tal cual`,
       'quedó en «' + reg.objetivo + '». La pantalla enseñaría eso y el guard ' +
       'del objetivo compararía contra eso');
  }
}

console.log('\nY lo que ya volvía sigue volviendo');
{
  const { reg, campos } = volcar({
    goal: 'bajar', age: 41, height_cm: 178, weight_kg: 82, sexo: 'h', dias_entreno: 5,
  });
  ok(campos.regEdad.value === 41, 'la edad');
  ok(campos.regAltura.value === 178, 'la altura');
  ok(campos.regPeso.value === 82, 'el peso');
  ok(reg.sexo === 'h', 'el sexo');
  ok(reg.dias === 5, 'y los días de entreno');
}

console.log('\nY un perfil a medias no inventa nada');
{
  // Sin objetivo guardado no se puede adivinar: se queda como estaba, que es
  // lo que hacen los demás campos. Inventar uno movería las calorías de
  // alguien por un hueco en la base.
  const { reg } = volcar({ age: 30 });
  ok(reg.objetivo === 'mantener', 'sin objetivo en la base se queda el de antes');
  ok(reg.dias === 3, 'y sin días de entreno, igual',
     'es el caso de un perfil con `dias_entreno` en NULL, que los hay');
  ok(volcar(null).reg.objetivo === 'mantener', 'y sin perfil no revienta');
}

// ------------------------------------------------------------------
console.log('\nY el guard del objetivo sigue puesto');
{
  // Es lo único que impide que entrar a mirar borre meses de ajuste. Si
  // `reg.objetivo` vuelve bien pero alguien quita el guard, volvemos al
  // mismo sitio por otro camino.
  const i = APP.indexOf('if(objElegido === reg.objetivo)');
  ok(i > 0, 'tocar el objetivo que ya tienes no recalcula nada',
     'sin esto, abrir la hoja y confirmar lo mismo tira lo que el cierre de ' +
     'los lunes llevaba ajustado');
  ok(/cerrarObjetivo\(\); return;/.test(APP.slice(i, i + 120)),
     'y se sale sin tocar las metas');
}

console.log('\nY la pantalla de Perfil enseña lo que hay en `reg`');
{
  // Por eso importa que `reg` sea de verdad lo que dice la base: esta
  // función no mira el perfil, mira `reg`.
  const f = sacar('function pintarObjetivoPerfil(){');
  ok(/reg\.objetivo/.test(f), 'Perfil pinta `reg.objetivo`',
     'si un día lee el perfil directamente, esta prueba sobra; mientras lo ' +
     'lea de `reg`, `reg` tiene que venir de la base');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

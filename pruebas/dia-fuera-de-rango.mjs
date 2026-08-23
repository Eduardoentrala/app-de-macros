// La fecha de apunte tiene un rango, y hasta ahora solo lo decía.
//
// El selector pone `min` y `max` en el input: de lunes de esta semana a hoy.
// Pero eso solo manda en el calendario que abre el teléfono. En el ordenador
// la fecha se teclea, y `change` salta igual con lo que se haya escrito.
//
// Lo que se colaba por ahí:
//
// - Un día FUTURO. Comida que no se ha comido, contando ya en el total de la
//   semana que lee el cierre.
// - Un día de una semana ANTERIOR. Es justo lo que el comentario del
//   selector dice que no se puede hacer: son semanas que la app ya dio por
//   cerradas y sobre las que quiza ya ajusto calorias, y cambiarlas ahora
//   descuadra ese ajuste sin que nadie se entere.

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

// ---- El manejador de verdad, con un input de mentira ----
const i = APP.indexOf("    var inp = document.getElementById('mealFecha');");
const j = APP.indexOf("    inp.addEventListener('change', function(){", i);
const k = APP.indexOf('\n    });', j);
const CUERPO = APP.slice(APP.indexOf('{', j + 40) + 1, k);

const HOY = new Date(2026, 7, 22);                       // sábado 22 ago
const anclaSemana = new Date(2026, 7, 17);               // lunes 17 ago
const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');

const probar = (escrito) => {
  const visto = { cargado: [], avisos: [], repintado: 0 };
  let DIA_APUNTE = null;
  const caja = new Function('valor', 'HOY', 'anclaSemana', 'isoDe', 'visto', `
    var DIA_APUNTE = null;
    var self = { value: valor };
    function pintarSelectorDia(){ visto.repintado++; }
    function cargarComidasDelDia(d){ visto.cargado.push(isoDe(d)); }
    function diaDeApunte(){ return DIA_APUNTE || HOY; }
    function toast(donde, txt){ visto.avisos.push(txt); }
    (function(){${CUERPO}}).call(self);
    return DIA_APUNTE;`);
  visto.dia = caja(escrito, HOY, anclaSemana, isoDe, visto);
  return visto;
};

// ------------------------------------------------------------------
console.log('\nLo de dentro del rango sigue igual');
{
  const r = probar('2026-08-19');                        // miércoles de esta semana
  ok(r.dia !== null && isoDe(r.dia) === '2026-08-19', 'se cambia al miércoles');
  ok(r.cargado[0] === '2026-08-19', 'y se pide la comida de ese día');
  ok(r.avisos.length === 0, 'sin avisos: es una fecha buena');

  const hoy = probar('2026-08-22');
  ok(hoy.dia === null, 'hoy se guarda como null, no como fecha');
  // Que quede en null no basta para saber que se aceptó: rechazarlo también
  // lo deja en null. Lo que separa un caso del otro es que se cargue el día
  // y que no salte el aviso.
  ok(hoy.cargado[0] === '2026-08-22' && hoy.avisos.length === 0,
     'y hoy se acepta: se carga y sin aviso',
     'cargado ' + JSON.stringify(hoy.cargado) + ', avisos ' + JSON.stringify(hoy.avisos));

  const lunes = probar('2026-08-17');
  ok(lunes.dia !== null && isoDe(lunes.dia) === '2026-08-17',
     'el lunes, que es el borde de abajo, entra');

  const vacio = probar('');
  ok(vacio.dia === null && vacio.cargado[0] === isoDe(HOY),
     'borrar la fecha vuelve a hoy');
}

// ------------------------------------------------------------------
console.log('\nEl futuro no');
{
  const r = probar('2026-08-25');
  ok(r.dia === null, 'no se cambia de día',
     'quedó en ' + (r.dia && isoDe(r.dia)) + ': se apuntaría comida que no se ha comido');
  ok(r.cargado.length === 0, 'y no se va a buscar la comida de un día que no ha llegado');
  ok(r.avisos.length === 1, 'se dice por qué', 'avisos: ' + JSON.stringify(r.avisos));
  ok(r.repintado > 0, 'y el selector vuelve a lo que había');
}

// ------------------------------------------------------------------
console.log('\nY una semana ya cerrada tampoco');
{
  const r = probar('2026-08-14');                        // viernes de la semana pasada
  ok(r.dia === null, 'no se cambia de día',
     'quedó en ' + (r.dia && isoDe(r.dia)) +
     ': esa semana ya contó para el cierre y quiza ya movió calorías');
  ok(r.cargado.length === 0, 'no se carga');
  ok(r.avisos.length === 1, 'y se dice');
}

// ------------------------------------------------------------------
console.log('\nY el rango es el mismo que enseña el selector');
{
  const sel = APP.slice(APP.indexOf('  function pintarSelectorDia(){'),
                        APP.indexOf('  function cargarComidasDelDia'));
  ok(/inp\.max = isoDe\(HOY\);/.test(sel), 'el selector enseña hasta hoy');
  ok(/inp\.min = isoDe\(anclaSemana\);/.test(sel), 'y desde el lunes de esta semana');
  const man = APP.slice(j, k);
  ok(/isoDe\(HOY\)/.test(man) && /isoDe\(anclaSemana\)/.test(man),
     'y el manejador comprueba ESOS mismos dos, no otros dos escritos aparte');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

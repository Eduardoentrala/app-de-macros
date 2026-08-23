// El registro de un día no puede depender de qué día se está mirando.
//
// Que un día tenga entrada en REGISTRO es lo que sostiene la racha y lo que
// hace que cuente para repartir las calorías de la semana. `sumarAlRegistro`
// borra esa entrada cuando ya no queda nada apuntado, y para saberlo mira
// COMIDAS.
//
// El problema es que COMIDAS es la lista del día que se está MIRANDO y el
// registro que se toca es el del día en que se está APUNTANDO, y desde que
// se puede apuntar en un día pasado esos dos días se separan. El guardia
// decía `apuntandoEnHoy()`, que no es la pregunta.
//
// Salen dos averías opuestas:
//
// 1. Se vacía un día pasado y su registro se queda a cero en vez de irse:
//    un día fantasma que mantiene viva la racha y le regala a hoy las
//    calorías de una jornada entera.
//
// 2. Peor: se apunta algo en HOY, se cambia a mirar un día pasado y el
//    guardado falla. Al deshacerlo, el guardia mira la lista del día pasado
//    -vacía- y borra el registro de HOY entero, con todo lo demás que
//    llevara apuntado.

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

// ---- La función de verdad, con lo justo alrededor ----
const hasta = (desde, fin) => {
  const i = APP.indexOf(desde);
  if (i < 0) throw new Error('no encuentro: ' + desde);
  return APP.slice(i, APP.indexOf(fin, i) + fin.length);
};

const fuente =
  APP.slice(APP.indexOf('  var DIA_APUNTE = null;'),
            APP.indexOf('function apuntandoEnHoy()') + 200).split('\n').slice(0, 3).join('\n') + '\n' +
  (APP.match(/^ {2}var DIA_LISTA[^\n]*$/m) || [''])[0] + '\n' +
  hasta('  function sumarAlRegistro(a, signo){', '\n  }');

const nuevo = () => {
  const REGISTRO = {}, COMIDAS = { Desayuno: [], Comida: [], Cena: [] };
  const HOY = new Date(2026, 7, 22);
  const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                       '-' + String(d.getDate()).padStart(2, '0');
  const caja = new Function('REGISTRO', 'COMIDAS', 'HOY', 'isoDe',
    'actualizarMetas', 'pintarRacha',
    fuente + `
    return {
      sumar: sumarAlRegistro,
      mirar: function(d){ DIA_APUNTE = d; },
      lista: function(iso){ if(typeof DIA_LISTA !== 'undefined') DIA_LISTA = iso; }
    };`)(REGISTRO, COMIDAS, HOY, isoDe, () => {}, () => {});
  return { REGISTRO, COMIDAS, HOY, isoDe, ...caja };
};

const ARROZ = { n: 'Arroz', P: 7, C: 78, G: 0.6 };
const AGUA  = { n: 'Agua', P: 0, C: 0, G: 0 };

// ------------------------------------------------------------------
console.log('\nLo que ya funcionaba y no se puede romper');
{
  const s = nuevo();
  s.COMIDAS.Comida.push(AGUA);
  s.sumar(AGUA, +1);
  ok(s.REGISTRO['2026-08-22'] !== undefined,
     'apuntar solo agua deja el día registrado: cero calorías es un día usado');

  s.COMIDAS.Comida.pop();
  s.sumar(AGUA, -1);
  ok(s.REGISTRO['2026-08-22'] === undefined,
     'y quitar lo último de hoy sí borra el día');
}

// ------------------------------------------------------------------
console.log('\n1. Un día pasado que se vacía no puede dejar fantasma');
{
  const s = nuevo();
  const PASADO = new Date(2026, 7, 15);
  s.mirar(PASADO);
  s.lista('2026-08-15');
  s.COMIDAS.Comida.push(ARROZ);
  s.sumar(ARROZ, +1);
  ok(s.REGISTRO['2026-08-15'] !== undefined, 'se apunta en el día pasado');

  // Y se quita lo único que tenía, mirándolo.
  s.COMIDAS.Comida.pop();
  s.sumar(ARROZ, -1);
  ok(s.REGISTRO['2026-08-15'] === undefined,
     'al quitarlo, el día pasado deja de contar',
     'se quedó ' + JSON.stringify(s.REGISTRO['2026-08-15']) +
     ': un día a cero mantiene viva la racha y le regala a hoy un día entero de calorías');
  ok(s.REGISTRO['2026-08-22'] === undefined, 'y hoy no se toca');
}

// ------------------------------------------------------------------
console.log('\n2. Y deshacer lo de hoy mientras se mira otro día no puede borrar hoy');
{
  const s = nuevo();
  // Se comió de verdad hoy: dos cosas apuntadas.
  s.COMIDAS.Desayuno.push(ARROZ); s.sumar(ARROZ, +1);
  s.COMIDAS.Comida.push(AGUA);    s.sumar(AGUA, +1);

  // Se apunta una tercera, y falla el guardado. Mientras iba, la persona se
  // fue a mirar un día pasado, así que COMIDAS ya no es la de hoy.
  s.COMIDAS.Cena.push(ARROZ); s.sumar(ARROZ, +1);
  s.COMIDAS.Desayuno = []; s.COMIDAS.Comida = []; s.COMIDAS.Cena = [];
  s.lista('2026-08-15');

  // El deshacer apunta sobre HOY a propósito: es donde se sumó.
  s.mirar(null);
  s.sumar(ARROZ, -1);

  ok(s.REGISTRO['2026-08-22'] !== undefined,
     'el registro de hoy sobrevive: lo demás sigue apuntado',
     'se borró entero, con el desayuno y la comida dentro');
  const r = s.REGISTRO['2026-08-22'] || {};
  ok(Math.abs((r.P || 0) - 7) < 0.001 && Math.abs((r.C || 0) - 78) < 0.001,
     'y con lo que de verdad quedó: solo se deshizo la cena',
     'quedó ' + JSON.stringify(r));
}

// ------------------------------------------------------------------
console.log('\nY el guardia pregunta por el día, no por la pantalla');
{
  const i = APP.indexOf('  function sumarAlRegistro(a, signo){');
  const trozo = APP.slice(i, APP.indexOf('\n  }', i));
  ok(!/if\(apuntandoEnHoy\(\)\)/.test(trozo),
     'ya no se apoya en apuntandoEnHoy(), que responde a otra pregunta');
  ok(/DIA_LISTA/.test(trozo),
     'sino en de qué día es la lista que tiene delante');
  ok(/^ {2}var DIA_LISTA/m.test(APP), 'que se declara arriba, con el día de apunte');
  // Y quien cambia la lista tiene que decirlo, o el guardia se queda con el
  // día de antes y vuelve el fallo por el otro lado.
  const j = APP.indexOf('  function cargarComidasDelDia(fecha){');
  ok(/DIA_LISTA = isoDe\(fecha\)/.test(APP.slice(j, j + 400)),
     'cargarComidasDelDia lo apunta al empezar');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

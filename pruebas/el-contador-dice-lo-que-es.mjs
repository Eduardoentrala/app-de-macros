// «13 consultas hoy», y eran las que le QUEDABAN.
//
// La cabecera del asistente pone el plan y un contador. El número viene de
// `gastar_consulta_ia`, que devuelve `tope - usadas`: las que quedan. La
// pantalla lo pintaba como «13 consultas hoy», que cualquiera lee como
// trece hechas.
//
// Y SE LEÍA AL REVÉS JUSTO CUANDO IMPORTA. A una consulta del tope decía
// «1 consulta hoy» —«apenas he usado nada»— cuando la siguiente te deja
// fuera hasta mañana. Cuanto más cerca del límite, más tranquilizador.
//
// No es un fallo de cálculo: el número siempre fue el correcto. Es la
// palabra de al lado, que decía otra cosa. Lo mismo que apuntar bien y
// enseñarlo mal.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const MIG = readFileSync(join(RAIZ, 'supabase', 'migrations',
  '0039_el_tope_diario_se_reinicia_a_medianoche.sql'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

function sacar(cabecera) {
  const i = APP.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0, j = APP.indexOf('(', i);
  for (; j < APP.length; j++) {
    if (APP[j] === '(') n++;
    else if (APP[j] === ')') { n--; if (!n) break; }
  }
  n = 0;
  let k = APP.indexOf('{', j);
  for (; k < APP.length; k++) {
    if (APP[k] === '{') n++;
    else if (APP[k] === '}') { n--; if (!n) return APP.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + cabecera);
}

// ------------------------------------------------------------------
console.log('\nEl número que llega son las que QUEDAN');
{
  // De la base, que es quien lo decide. Si algún día devolviera las
  // usadas, esta prueba entera cambia de sentido — y hay que enterarse.
  ok(/return tope - 1;/.test(MIG),
     'la primera consulta del día deja `tope - 1`',
     'o sea que lo que vuelve son las restantes, no las gastadas');
  ok(/return tope - usadas;/.test(MIG) || /tope - usadas/.test(MIG),
     'y las siguientes, `tope - usadas`');
  ok(/return -1;/.test(MIG), 'y -1 cuando se acabó');
}

// ------------------------------------------------------------------
console.log('\nY la pantalla lo dice así, ejecutándola');
{
  const pintar = (quedan, plan) => {
    let puesto = '';
    const el = { set textContent(v) { puesto = v; }, get textContent() { return puesto; } };
    new Function('document', 'planPorId', 'MI_NIVEL_IA', 'iaQuedanNum',
      sacar('function pintarQuedanIA(') + '; return pintarQuedanIA;')(
      { getElementById: () => el }, () => ({ nombre: plan }), 'plus', quedan)();
    return puesto;
  };

  const trece = pintar(13, 'IA Plus');
  ok(/quedan 13/.test(trece), 'con 13 restantes dice que quedan 13', 'puso: ' + trece);
  ok(!/^IA Plus · 13 consultas/.test(trece),
     'y no «13 consultas hoy» a secas',
     'puso: ' + trece + ' — eso se lee como trece hechas');

  // EL CASO QUE MÁS ENGAÑABA: una sola restante.
  const una = pintar(1, 'IA Plus');
  ok(/queda 1 consulta/.test(una),
     'con una restante avisa de que queda UNA',
     'puso: ' + una + '. Antes decía «1 consulta hoy», que se lee como ' +
     '«apenas he usado nada» cuando la siguiente te deja fuera');
  ok(!/quedan 1 consultas/.test(una), 'y en singular, sin el plural pegado');

  const cero = pintar(0, 'IA Plus');
  ok(/quedan 0/.test(cero), 'con cero lo dice', 'puso: ' + cero);

  // Sin dato no se inventa un número.
  const sinDato = pintar(null, 'IA normal');
  ok(sinDato === 'IA normal', 'y sin contador solo sale el plan', 'puso: ' + sinDato);

  // El plan va primero: es lo que explica qué puede y qué no.
  ok(trece.indexOf('IA Plus') === 0, 'y el plan va delante del contador');
}

// ------------------------------------------------------------------
console.log('\nY el número sigue viniendo de donde venía');
{
  ok(/if\(typeof r\.quedan === 'number'\)\{ iaQuedanNum = r\.quedan; \}/.test(APP),
     'se toma de la respuesta del servidor',
     'y solo si es un número: un `undefined` dejaría el contador anterior ' +
     'en pantalla, que sería peor que ninguno');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

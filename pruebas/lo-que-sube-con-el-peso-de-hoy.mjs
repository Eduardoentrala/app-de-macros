// La cintura se perdía al pesarse dos veces el mismo día sin señal.
//
// El guardado mandaba `cin`, que es null si ESTA VEZ no se tecleó ninguna.
// Online da igual: el upsert solo pisa las columnas que van en el cuerpo, así
// que la cintura que ya estaba en la fila se queda. Sin señal no:
//
//   · se guarda peso y cintura, y la petición se encola con la clave
//     `peso:<fecha>`, que es una por día;
//   · la cintura se esconde y su campo se vacía, porque ya está medida;
//   · esa misma tarde uno se vuelve a pesar —otra báscula, o por curiosidad—;
//   · ese segundo guardado va sin cintura y, por la clave, SUSTITUYE en la
//     cola al que sí la llevaba.
//
// Y ahí se perdió. La medida sigue en pantalla, `tocaMedirCintura()` cree que
// ya se midió y no la vuelve a pedir en quince días, pero lo que va a subir
// no la lleva. Se nota al recargar, cuando reaparece el aviso de medirse y no
// hay forma de saber por qué. Es una medida que se toma dos veces al mes.
//
// Y EL PERFIL NO SE ENTERABA DE QUE TE HABÍAS PESADO. `profiles.weight_kg` es
// la media de siete días y de ella salen la meta de proteína —peso × 2— y el
// suelo de calorías, que nunca baja del basal. Se recalculaba solo al abrir
// la app, así que pesarse no movía nada hasta la siguiente vez que entraras.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const sinC = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const LIMPIO = sinC(APP);
function fn(cabecera) {
  const i = LIMPIO.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro: ' + cabecera);
  let n = 0;
  for (let j = LIMPIO.indexOf('{', i); j < LIMPIO.length; j++) {
    if (LIMPIO[j] === '{') n++;
    else if (LIMPIO[j] === '}') { n--; if (!n) return LIMPIO.slice(i, j + 1); }
  }
  throw new Error('llaves sin cerrar: ' + cabecera);
}

const HOY = new Date(2026, 10, 15);
const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');
const AYER = '2026-11-14';

// `guardarElPeso` de verdad, con todo lo de fuera de mentira.
async function guardar({ peso, cintura, cinturasYa, resultado = true, revienta }) {
  const PESOS = {};
  const subidos = [], perfil = [], avisos = [], fallos = [];
  const campos = { pesoInput: { value: '' } };
  const armar = new Function(
    'PESOS', 'CINTURAS', 'isoDe', 'HOY', 'pintarPeso', 'pintarCintura', 'toast',
    'sbGuardarPeso', 'ponerPesoDeLaBascula', 'apuntarFallo', 'traducirError', 'document',
    sinC(fn('function guardarElPeso(v, cin, cinturaFuera){')) +
    '; return { guardar: guardarElPeso, cinturas: function(){ return CINTURAS; } };'
  );
  const caja = armar(
    PESOS, (cinturasYa || []).slice(), isoDe, HOY, () => {}, () => {},
    (donde, msg) => avisos.push(msg),
    (fecha, kg, cin) => {
      subidos.push({ fecha, kg, cin });
      return resultado === 'falla' ? Promise.reject(new Error('no pude'))
                                   : Promise.resolve(resultado);
    },
    () => { perfil.push(1); if (revienta) throw new Error('reventó el perfil'); },
    (donde) => fallos.push(donde), (m) => m,
    { getElementById: (id) => campos[id] || (campos[id] = { value: '' }) }
  );
  caja.guardar(peso, cintura == null ? null : cintura, false);
  await new Promise((r) => setTimeout(r, 0));
  return { PESOS, subidos, perfil, avisos, fallos, cinturas: caja.cinturas() };
}

// ------------------------------------------------------------------
console.log('\nLa fila de hoy sube con todo lo que se sabe de hoy');
{
  const conCintura = await guardar({ peso: 85.2, cintura: 88 });
  ok(conCintura.subidos[0] && conCintura.subidos[0].cin === 88,
     'si se teclea una cintura, va con el peso',
     JSON.stringify(conCintura.subidos));

  // EL CASO QUE SE PERDÍA. Hoy ya hay cintura medida —se guardó esta mañana,
  // y por eso el campo está escondido y vacío— y esta vez solo se teclea el
  // peso. Lo que suba tiene que seguir llevándola: sin señal, esta petición
  // SUSTITUYE en la cola a la de la mañana.
  const otraVez = await guardar({ peso: 84.9, cintura: null, cinturasYa: [{ fecha: '2026-11-15', cm: 88 }] });
  ok(otraVez.subidos[0] && otraVez.subidos[0].cin === 88,
     'y si ya había una de hoy, va igual aunque no se teclee',
     JSON.stringify(otraVez.subidos) + ' — sin señal este envío pisa al de ' +
     'la mañana en la cola: lo que no vaya aquí no sube nunca');
  ok(otraVez.subidos[0].kg === 84.9, 'con el peso nuevo, no el de la mañana',
     JSON.stringify(otraVez.subidos));

  // Y NO SE INVENTA NINGUNA. La de otro día es de otro día.
  const deOtroDia = await guardar({ peso: 85.2, cintura: null, cinturasYa: [{ fecha: AYER, cm: 91 }] });
  ok(deOtroDia.subidos[0] && deOtroDia.subidos[0].cin === null,
     'pero la medida de otro día no se sube como de hoy',
     JSON.stringify(deOtroDia.subidos) + ': sería inventarse una medida del cuerpo');

  const ninguna = await guardar({ peso: 85.2, cintura: null });
  ok(ninguna.subidos[0] && ninguna.subidos[0].cin === null,
     'y sin ninguna medida, va nulo y no cero',
     JSON.stringify(ninguna.subidos));
}

// ------------------------------------------------------------------
console.log('\nY el perfil se entera de que te pesaste');
{
  const subio = await guardar({ peso: 85.2, resultado: true });
  ok(subio.perfil.length === 1,
     'al guardar se recalcula el peso del perfil',
     'de ahí salen la meta de proteína —peso × 2— y el suelo de calorías: ' +
     'esperar a la próxima apertura los deja un día viejos');

  // ENCOLADO NO. Sin señal no hay red con la que escribir el perfil, y el
  // reintento ya está donde estaba: en la próxima apertura.
  const enCola = await guardar({ peso: 85.2, resultado: false });
  ok(enCola.perfil.length === 0, 'pero no si se quedó en la cola',
     'no hay red con la que escribirlo, y apuntaría un fallo que no lo es');

  const falló = await guardar({ peso: 85.2, resultado: 'falla' });
  ok(falló.perfil.length === 0, 'ni si el guardado falló');
  ok(falló.PESOS['2026-11-15'] === undefined, '  y el peso se deshace',
     JSON.stringify(falló.PESOS));

  // LO QUE NO PUEDE PASAR: que un fallo pintando el perfil deshaga un peso
  // que YA está en la base. Lo que se tira desde ese `then` cae en el `catch`
  // del guardado, que borra el peso de la pantalla y avisa de que no se pudo.
  const roto = await guardar({ peso: 85.2, resultado: true, revienta: true });
  ok(roto.PESOS['2026-11-15'] === 85.2,
     'y si el perfil revienta, el peso guardado se queda',
     JSON.stringify(roto.PESOS) + ' — está en la base: quitarlo de la pantalla ' +
     'sería enseñar lo contrario de lo que pasó');
  ok(roto.fallos.length === 1, '  con su fallo apuntado', JSON.stringify(roto.fallos));
  ok(!/No se pudo guardar/.test(roto.avisos.join(' ')),
     '  y sin decir que no se pudo, porque sí se pudo',
     JSON.stringify(roto.avisos));
}

// ------------------------------------------------------------------
console.log('\nY el guardado dice si subió o si se quedó esperando');
{
  // EJECUTADO: `sbGuardarPeso` entero. El `then` de arriba depende de que
  // esto devuelva `true` solo cuando de verdad llegó al servidor.
  const correr = (sbFetch, sinConexion) => new Function(
    'sesion', 'sbFetch', 'sinConexion', 'encolar', 'toast',
    sinC(fn('function sbGuardarPeso(fecha, kg, cintura){')) +
    '; return sbGuardarPeso("2026-11-15", 85.2, null);'
  )({ user: { id: 'yo' } }, sbFetch, sinConexion, () => {}, () => {});

  ok(await correr(() => Promise.resolve(null), () => false) === true,
     'subido es `true`, aunque el servidor no devuelva cuerpo',
     'la petición va con `return=minimal`: sin el `then` que lo fija, un 204 ' +
     'se confunde con el `null` de la cola');
  ok(await correr(() => Promise.reject(new Error('sin red')), () => true) === false,
     'y encolado es `false`');

  let tiró = false;
  await correr(() => Promise.reject(new Error('400')), () => false)['catch'](() => { tiró = true; });
  ok(tiró, 'y un error de verdad se sigue tirando',
     'es lo que deshace el guardado en quien llama');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

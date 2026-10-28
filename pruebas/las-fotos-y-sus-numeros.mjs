// Las fotos de septiembre no explican la cintura de octubre.
//
// El análisis mensual compara la ÚLTIMA SERIE COMPLETA de fotos contra una
// de al menos tres semanas antes. Si hace un mes que no se suben fotos,
// esas dos series son de hace un mes. Y junto a ellas se le mandaban al
// modelo los últimos ocho pesos y las últimas seis cinturas, sin decir
// cuáles caían dentro de ese periodo y cuáles no.
//
// SE VIO EN UNA CAPTURA. El análisis decía «la cintura sigue exactamente
// donde estaba el mes pasado» mientras el cierre del lunes, la misma
// semana, decía «Cintura 94 (sep) → 91.5 (21-oct): pérdida de grasa
// clara». Los dos tenían razón —hablan de periodos distintos— pero
// ninguno lo decía, y leído seguido parece que la app se equivoca.
//
// Lo de después NO se tira: una cintura que bajó después de la última foto
// es justo lo que explica por qué las fotos no lo enseñan todavía. Va
// aparte y con su nombre.
//
// Se prueba EJECUTANDO el armado real del bloque de números, con el caso
// que lo destapó.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// ------------------------------------------------------------------
console.log('\nEl prompt le dice que cada número tiene su periodo');
{
  ok(/CADA NÚMERO CON SU PERIODO/.test(FN), 'tiene su regla');
  ok(/no lo uses para explicar lo que\nse ve/.test(FN),
     'y le prohíbe explicar las fotos con lo que pasó después',
     'sin esto junta todo y la persona lee una contradicción');
  ok(/las fotos son de antes y todavía\nno lo enseñan/.test(FN),
     'y le dice qué hacer con ello en vez de solo prohibirlo',
     'una cintura que bajó después de la última foto es la frase más útil ' +
     'que se le puede dar, no un dato a esconder');
}

// ------------------------------------------------------------------
console.log('\nY el bloque de números los separa de verdad');
{
  // Se saca el armado real, sin copiarlo.
  const i = FN.indexOf('      const finNueva = lunesDeClave(semanaNueva)');
  const f = FN.indexOf("(semanaBase ? '\\n- Además tiene fotos desde ", i);
  ok(i > 0 && f > i, 'se encuentra el armado en la función');
  // Se le quitan los tipos para poder EJECUTARLO. En este orden y no a
  // ojo: los genéricos llevan coma dentro -`Record<string, unknown>`- así
  // que hay que colapsarlos ANTES de buscar dónde acaba cada anotación. Al
  // revés, el `, unknown>` parecía un parámetro más y salía un `: ` suelto.
  const cuerpo = FN.slice(i, FN.indexOf(';', f) + 1)
    .replace(/Record<string, unknown>/g, 'Obj')
    .replace(/\(x: Obj\) => string/g, 'Fn')
    .replace(/: (Obj\[\]|Obj|Fn|unknown|number|string)/g, '');

  const lunesDeClave = (k) => {
    const y = Number(k.slice(0, 4)), w = Number(k.slice(6));
    const ene4 = new Date(Date.UTC(y, 0, 4));
    const lunes = new Date(ene4);
    lunes.setUTCDate(ene4.getUTCDate() - ((ene4.getUTCDay() + 6) % 7) + (w - 1) * 7);
    return lunes.getTime();
  };

  // EL CASO DE LA CAPTURA: fotos de 2026-W37 contra 2026-W40, y una
  // cintura medida el 21 de octubre, muy posterior a las dos.
  const armar = new Function('lunesDeClave', 'semanaVieja', 'semanaNueva', 'semanaBase',
    'p', 'c', 'visto',
    cuerpo + '\n return numeros;');

  const texto = armar(lunesDeClave, '2026-W37', '2026-W40', null,
    [{ fecha: '2026-09-10', kg: 82.9 }, { fecha: '2026-10-21', kg: 82.5 }],
    [{ log_date: '2026-09-12', cintura_cm: 94 }, { log_date: '2026-10-21', cintura_cm: 91.5 }],
    'de frente y de espalda se ven practicamente iguales');

  ok(/LO QUE CUBREN ESAS FOTOS: del 2026-09-07 al 2026-10-04/.test(texto),
     'dice de cuándo a cuándo son las fotos',
     'salió: ' + (texto.match(/LO QUE CUBREN[^\n]*/) || [''])[0]);

  const dentro = texto.slice(texto.indexOf('SUS NÚMEROS DE ESE MISMO PERIODO'),
                             texto.indexOf('POSTERIOR A LA ÚLTIMA FOTO'));
  ok(/2026-09-12: 94 cm/.test(dentro), 'la cintura de septiembre va dentro del periodo');
  ok(!/91\.5/.test(dentro), 'y la del 21 de octubre NO',
     'ésa es la que hacía al modelo hablar de un cambio que las fotos no ven');

  const fuera = texto.slice(texto.indexOf('POSTERIOR A LA ÚLTIMA FOTO'));
  ok(/2026-10-21: 91\.5 cm/.test(fuera), 'y aparece aparte, marcada como posterior',
     'tirarla sería peor: es lo que explica por qué las fotos no lo enseñan');
  ok(/2026-10-21: 82\.5 kg/.test(fuera), 'y el peso de esa fecha, igual');
  ok(/2026-09-10: 82\.9 kg/.test(dentro), 'mientras el de septiembre se queda dentro');
  // Y NO EN LOS DOS SITIOS A LA VEZ. Faltaba esta: se comprobaba que la
  // cintura de octubre no estuviera dentro, pero no el peso, así que un
  // cambio que dejara todos los pesos dentro Y repetidos abajo pasaba. Se
  // vio mutando.
  ok(!/82\.5/.test(dentro), 'y el peso posterior no sale también dentro',
     'repetido arriba y abajo, el modelo lo lee como del periodo de las fotos, ' +
     'que es exactamente lo que se está arreglando');

  // Y CUANDO NO HAY NADA DESPUÉS, no se inventa la sección: un encabezado
  // vacío le dice al modelo que mire algo que no existe.
  const sinFuera = armar(lunesDeClave, '2026-W37', '2026-W40', null,
    [{ fecha: '2026-09-10', kg: 82.9 }],
    [{ log_date: '2026-09-12', cintura_cm: 94 }], 'nada');
  ok(!/POSTERIOR A LA ÚLTIMA FOTO/.test(sinFuera),
     'y sin nada posterior, esa sección no sale');

  // Ni se pierde el caso de siempre: sin medidas, se dice.
  const vacio = armar(lunesDeClave, '2026-W37', '2026-W40', null, [], [], 'nada');
  ok(/Peso: no apuntó/.test(vacio) && /Cintura: no la midió/.test(vacio),
     'y sin medidas lo dice, en vez de dejar el hueco');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

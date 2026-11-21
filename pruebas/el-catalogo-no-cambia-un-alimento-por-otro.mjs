// El afinado con el catálogo le metió 488 gramos de leche light a un postre.
//
// PASÓ DE VERDAD, el 20 de noviembre de 2026. Una ensalada de fruta con
// lechera y crema. El modelo propuso «Crema, 2 cucharadas» con su
// estimación, y el servidor se la reemplazó por esto:
//
//     Crema · 2 cucharadas · P16.6 C24.4 G4.9 · 208 kcal
//
// Que no es crema: la crema es casi toda grasa. Esos números son
// EXACTAMENTE 488 g de «Leche light» (P3.4 C5.0 G1.0 por 100 g, × 4.88).
//
// DE DÓNDE SALEN LOS 488. `buscar_catalogo('Crema')` devuelve, en este
// orden: Leche light, Leche descremada, Queso crema, Crema… La «Crema»
// buena es la CUARTA. Y el código coge la primera fila que le encaje el
// estado, que con todo en `unico` es `filas[0]`: Leche light. Después
// multiplica la cantidad del modelo —2— por el `porcion_g` de esa fila
// —244 g, lo que pesa un vaso de leche— y le sale 488 g.
//
// O sea DOS fallos encadenados, y cada uno basta:
//
//   1. NO SE COMPRUEBA EL NOMBRE. El comentario de la función promete que
//      sí —«Solo cuando el nombre coincide de verdad»— y el código no lo
//      hace en ningún sitio. Buscar «Crema» y escribir leche es eso.
//
//   2. `porcion_g` ES LO QUE PESA UNA PORCIÓN DE LA FILA, no lo que pesa
//      una cucharada. Multiplicarlo por la cantidad del modelo sin mirar
//      si las dos unidades son la misma convierte «2 cucharadas» en «2
//      porciones», que aquí era medio litro de leche.
//
// Y lo peor: lo marca `seguridad: 'alta'` —«ya no es estimación: es
// tabla»—, así que la tarjeta pierde el aviso de «aprox» que habría hecho
// sospechar.
//
// EL ARREGLO ES QUE SE NIEGUE. Si el nombre no es el mismo alimento, o si
// la unidad no se puede convertir honestamente, se deja la estimación del
// modelo marcada como estimación. Es la misma regla que ya está escrita
// para la búsqueda de sesiones: no poder saberlo no es una respuesta.

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

// La función de verdad, sin tipos. Los quita Node; a mano se rompe a la
// primera anotación con corchetes.
//
// Se corta desde `PALABRAS_DE_ESTADO`, que es donde empieza el ayudante que
// compara nombres: si se cortara solo la función, ese ayudante se quedaría
// fuera y la prueba reventaría con un `is not defined` en vez de medir nada.
const i = FN.indexOf('const PALABRAS_DE_ESTADO');
const iFn = FN.indexOf('async function afinarConCatalogo');
if (i < 0 || iFn < 0 || i > iFn) {
  throw new Error('no encuentro el afinado con su comparador de nombres delante');
}
const fuente = FN.slice(i, FN.indexOf('\n}', iFn) + 2);
const afinar = new Function(
  stripTypeScriptTypes(fuente, { mode: 'strip' }) + '; return afinarConCatalogo;')();

// EL CATÁLOGO DE VERDAD, copiado de producción con su orden de verdad.
// Este orden ES el fallo: la «Crema» buena sale cuarta.
const COMO_BUSCA_CREMA = [
  { nombre: 'Leche light',        unidad: 'Gramos', macros_por: '100g', porcion_g: 244, proteina: 3.4,  carbos: 5.0,  grasas: 1.0,  estado: 'unico' },
  { nombre: 'Leche descremada',   unidad: 'Gramos', macros_por: '100g', porcion_g: 245, proteina: 3.4,  carbos: 5.0,  grasas: 0.1,  estado: 'unico' },
  { nombre: 'Queso crema',        unidad: 'Gramos', macros_por: '100g', porcion_g: 15,  proteina: 6.2,  carbos: 5.5,  grasas: 34.4, estado: 'unico' },
  { nombre: 'Crema',              unidad: 'Gramos', macros_por: '100g', porcion_g: 120, proteina: 2.2,  carbos: 3.0,  grasas: 30.9, estado: 'unico' },
  { nombre: 'Crema de cacahuate', unidad: 'Gramos', macros_por: '100g', porcion_g: 32,  proteina: 22.2, carbos: 22.3, grasas: 51.4, estado: 'unico' },
];

const buscador = (porTexto) => ({
  rpc: (_f, p) => Promise.resolve({ data: porTexto[String(p.p_texto).toLowerCase()] || [] }),
});

// ------------------------------------------------------------------
console.log('\nEl postre del 20 de noviembre');
{
  const propuesta = [{ nombre: 'Crema', cantidad: 2, unidad: 'Cucharada',
                       proteina: 0.8, carbos: 1, grasas: 9, seguridad: 'media' }];
  const r = await afinar(buscador({ crema: COMO_BUSCA_CREMA }), propuesta);
  const a = r[0];

  ok(!(Math.abs(a.proteina - 16.6) < 0.2 && Math.abs(a.carbos - 24.4) < 0.2),
     'dos cucharadas de crema NO salen con los macros de medio litro de leche',
     'salió P' + a.proteina + ' C' + a.carbos + ' G' + a.grasas +
     '\n         que es 488 g de «Leche light»: la primera fila que devuelve el ' +
     'buscador,\n         por su `porcion_g` de 244, multiplicado por las 2 del modelo');

  // LO QUE SE ESPERA: que se niegue. La «Crema» del catálogo va en gramos y
  // el modelo habló en cucharadas; no hay conversión honesta, así que se
  // queda lo que dijo el modelo, marcado como estimación.
  ok(a.proteina === 0.8 && a.carbos === 1 && a.grasas === 9,
     'se queda la estimación del modelo, intacta',
     'salió P' + a.proteina + ' C' + a.carbos + ' G' + a.grasas);
  ok(a.seguridad !== 'alta',
     'y NO se marca como dato de tabla',
     'con «alta» la tarjeta pierde el aviso de «aprox», que es lo único que ' +
     'habría\n         hecho sospechar de un número inventado');
  ok(!a.catalogo, 'ni se dice que venga del catálogo', String(a.catalogo));
}

// ------------------------------------------------------------------
console.log('\nY el nombre tiene que ser el mismo alimento');
{
  const uno = async (nombre, filas, extra) => (await afinar(
    buscador({ [nombre.toLowerCase()]: filas }),
    [Object.assign({ nombre: nombre, cantidad: 100, unidad: 'Gramos',
                     proteina: 1, carbos: 1, grasas: 1, seguridad: 'media' }, extra)]
  ))[0];

  const crema = await uno('Crema', COMO_BUSCA_CREMA);
  ok(crema.grasas !== 1.0,
     'con el nombre bueno en la lista, se coge ESE y no el primero',
     'salió G' + crema.grasas + '. Con 100 g: la Crema son 30.9 y la Leche ' +
     'light 1.0');
  ok(Math.abs(crema.grasas - 30.9) < 0.05,
     'o sea los 30.9 de grasa de la crema',
     'salió G' + crema.grasas);
  ok(crema.seguridad === 'alta', 'y ESTE sí es dato de tabla');

  // Y si no está, no se coge el que más se le parezca.
  const nada = await uno('Guisado de la abuela', COMO_BUSCA_CREMA);
  ok(nada.proteina === 1 && nada.carbos === 1 && nada.grasas === 1,
     'y un nombre que no está en el catálogo no se cambia por nada',
     'salió P' + nada.proteina + ' C' + nada.carbos + ' G' + nada.grasas +
     '\n         es el caso que el propio comentario pone de ejemplo');
  ok(nada.seguridad !== 'alta', 'y se queda como estimación');

  // NI UNO MÁS ESPECÍFICO. «Crema» no es «Crema de cacahuate»: el catálogo
  // puede tener algo que EMPIECE igual y sea otra cosa muy distinta.
  const sinCrema = COMO_BUSCA_CREMA.filter((f) => f.nombre !== 'Crema');
  const cacahuate = await uno('Crema', sinCrema);
  ok(cacahuate.proteina === 1 && cacahuate.grasas === 1,
     'y «Crema» no se afina con «Crema de cacahuate»',
     'salió P' + cacahuate.proteina + ' G' + cacahuate.grasas +
     '\n         empiezan igual y no tienen nada que ver: 22 g de proteína ' +
     'contra 2');

  // TILDES Y MAYÚSCULAS NO SON OTRO ALIMENTO. El catálogo lo llenan
  // personas: ahí dentro conviven «Crema» y «crema alpura» en minúscula.
  // Comparando en crudo, «Plátano» y «Platano» serían dos cosas y se
  // perdería el afinado sin que nada lo dijera.
  const PLATANO = [{ nombre: 'Platano', unidad: 'Gramos', macros_por: '100g',
                     porcion_g: 118, proteina: 1.1, carbos: 23, grasas: 0.3,
                     estado: 'unico' }];
  const p = await uno('PLÁTANO', PLATANO);
  ok(Math.abs(p.carbos - 23) < 0.05,
     'y «PLÁTANO» encuentra a «Platano»',
     'salió C' + p.carbos + ', esperaba 23');

  // EL PLURAL NO ES OTRO ALIMENTO, y este casi se me escapa. El catálogo
  // guarda «Uva» y «Fresa» en singular; el modelo escribe lo que se dice
  // al hablar. Comprobado contra todo lo que él lleva apuntado: de los
  // alimentos suyos que SÍ tienen fila en el catálogo, el plural era la
  // única diferencia. Sin esto, exigir el nombre entero deja la fruta
  // fuera del afinado y nadie se entera.
  const UVA = [{ nombre: 'Uva', unidad: 'Gramos', macros_por: '100g',
                 porcion_g: 92, proteina: 0.7, carbos: 18.1, grasas: 0.2,
                 estado: 'unico' }];
  const uvas = (await afinar(buscador({ uvas: UVA }),
    [{ nombre: 'Uvas', cantidad: 200, unidad: 'Gramos',
       proteina: 9, carbos: 9, grasas: 9, seguridad: 'media' }]))[0];
  ok(Math.abs(uvas.carbos - 36.2) < 0.05,
     '«Uvas» encuentra la fila «Uva»',
     'salió C' + uvas.carbos + ', esperaba 36.2 (18.1 × 2)');

  // Y al revés, que el catálogo también tiene nombres en plural.
  const FRIJOL = [{ nombre: 'Frijoles', unidad: 'Gramos', macros_por: '100g',
                    porcion_g: 172, proteina: 8.9, carbos: 23.7, grasas: 0.5,
                    estado: 'cocido' }];
  const frijol = (await afinar(buscador({ frijol: FRIJOL }),
    [{ nombre: 'Frijol', cantidad: 100, unidad: 'Gramos',
       proteina: 1, carbos: 1, grasas: 1, seguridad: 'media' }]))[0];
  ok(Math.abs(frijol.proteina - 8.9) < 0.05,
     'y «Frijol» encuentra «Frijoles»', 'salió P' + frijol.proteina);

  // PERO LA ESE NO SE QUITA DE CUALQUIER PALABRA. «Arroz» acaba en zeta y
  // las de tres letras se quedan enteras: recortar a lo bruto junta
  // alimentos que no tienen nada que ver.
  const ARROZ_SOLO = [{ nombre: 'Arroz', unidad: 'Gramos', macros_por: '100g',
                        porcion_g: 158, proteina: 2.7, carbos: 28, grasas: 0.3,
                        estado: 'unico' }];
  const arroz = (await afinar(buscador({ arroz: ARROZ_SOLO }),
    [{ nombre: 'Arroz', cantidad: 100, unidad: 'Gramos',
       proteina: 1, carbos: 1, grasas: 1, seguridad: 'media' }]))[0];
  ok(Math.abs(arroz.carbos - 28) < 0.05,
     'y «Arroz» sigue siendo arroz, no «arro»', 'salió C' + arroz.carbos);

  // Y EL PLURAL NO PUEDE JUNTAR DOS ALIMENTOS DISTINTOS. Si algún día la
  // regla se afloja, esto lo dice.
  const PAPA = [
    { nombre: 'Papa',  unidad: 'Gramos', macros_por: '100g', porcion_g: 173, proteina: 2.0, carbos: 17.5, grasas: 0.1, estado: 'cocido' },
    { nombre: 'Papaya', unidad: 'Gramos', macros_por: '100g', porcion_g: 145, proteina: 0.5, carbos: 10.8, grasas: 0.3, estado: 'unico' },
  ];
  const papa = (await afinar(buscador({ papas: PAPA }),
    [{ nombre: 'Papas', cantidad: 100, unidad: 'Gramos',
       proteina: 1, carbos: 1, grasas: 1, seguridad: 'media' }]))[0];
  ok(Math.abs(papa.carbos - 17.5) < 0.05,
     'y «Papas» es papa, no papaya', 'salió C' + papa.carbos);

  // Y EL RESPALDO, cuando ninguna fila encaja el estado que pidió el
  // modelo. Ahí la función se queda con la primera de las que SÍ se
  // llaman igual; con la primera de la BÚSQUEDA volvería a escribir otro
  // alimento, que es el fallo entero otra vez por la puerta de atrás.
  const POLLO = [
    { nombre: 'Arroz', unidad: 'Gramos', macros_por: '100g', porcion_g: 158, proteina: 2.7, carbos: 28, grasas: 0.3, estado: 'unico' },
    { nombre: 'Pollo', unidad: 'Gramos', macros_por: '100g', porcion_g: 140, proteina: 31,  carbos: 0,  grasas: 3.6, estado: 'crudo' },
  ];
  const pollo = (await afinar(buscador({ 'pollo asado': POLLO }),
    [{ nombre: 'Pollo asado', cantidad: 100, unidad: 'Gramos',
       proteina: 1, carbos: 1, grasas: 1, seguridad: 'media' }]))[0];
  ok(Math.abs(pollo.proteina - 31) < 0.05,
     'sin fila del estado pedido, se usa la del mismo nombre',
     'salió P' + pollo.proteina + '. Con 28 de carbos sería el arroz, que es ' +
     'la primera\n         de la búsqueda y no se llama pollo');
  ok(pollo.carbos === 0, 'y no los carbos de otra cosa', 'salió C' + pollo.carbos);
}

// ------------------------------------------------------------------
console.log('\nY lo que YA funcionaba sigue funcionando');
{
  // EN GRAMOS: el camino normal y el más usado. Aquí no hay nada que
  // adivinar y el catálogo tiene que ganar siempre.
  const ARROZ = [
    { nombre: 'Arroz', unidad: 'Gramos', macros_por: '100g', porcion_g: 158, proteina: 2.7, carbos: 28, grasas: 0.3, estado: 'cocido' },
    { nombre: 'Arroz', unidad: 'Gramos', macros_por: '100g', porcion_g: 185, proteina: 7.1, carbos: 80, grasas: 0.7, estado: 'crudo' },
  ];
  const cocido = (await afinar(buscador({ 'arroz cocido': ARROZ }),
    [{ nombre: 'Arroz cocido', cantidad: 200, unidad: 'Gramos',
       proteina: 9, carbos: 9, grasas: 9, seguridad: 'media' }]))[0];
  ok(Math.abs(cocido.carbos - 56) < 0.05,
     'el arroz cocido en gramos se afina con la fila cocida',
     'salió C' + cocido.carbos + ', esperaba 56 (28 × 2). El crudo daría 160.' +
     '\n         El catálogo guarda el estado en su columna, no en el nombre: ' +
     'si la\n         comparación no lo tiene en cuenta, «arroz cocido» deja de ' +
     'afinarse');
  ok(cocido.seguridad === 'alta', 'y queda como dato de tabla');

  const crudo = (await afinar(buscador({ 'arroz crudo': ARROZ }),
    [{ nombre: 'Arroz crudo', cantidad: 100, unidad: 'Gramos',
       proteina: 9, carbos: 9, grasas: 9, seguridad: 'media' }]))[0];
  ok(Math.abs(crudo.carbos - 80) < 0.05, 'y el crudo con la cruda',
     'salió C' + crudo.carbos);

  // POR PIEZAS, con la MISMA unidad en el catálogo: ahí `porcion_g` sí es
  // lo que pesa una, y la conversión es honesta.
  const HUEVO = [{ nombre: 'Huevo', unidad: 'Pieza', macros_por: '100g',
                   porcion_g: 50, proteina: 12.6, carbos: 0.7, grasas: 9.5, estado: 'unico' }];
  const huevo = (await afinar(buscador({ huevo: HUEVO }),
    [{ nombre: 'Huevo', cantidad: 2, unidad: 'Pieza',
       proteina: 9, carbos: 9, grasas: 9, seguridad: 'media' }]))[0];
  ok(Math.abs(huevo.proteina - 12.6) < 0.05,
     'dos huevos se afinan con el peso de una pieza',
     'salió P' + huevo.proteina + ', esperaba 12.6 (12.6 × 100/100)');

  // Y LA FILA QUE TRAE LOS MACROS POR UNIDAD, que no convierte nada.
  const BARRA = [{ nombre: 'Barrita', unidad: 'Pieza', macros_por: 'unidad',
                   porcion_g: null, proteina: 20, carbos: 23, grasas: 7, estado: 'unico' }];
  const barra = (await afinar(buscador({ barrita: BARRA }),
    [{ nombre: 'Barrita', cantidad: 2, unidad: 'Pieza',
       proteina: 1, carbos: 1, grasas: 1, seguridad: 'media' }]))[0];
  ok(Math.abs(barra.proteina - 40) < 0.05,
     'y dos barritas son el doble de una, sin dividir entre cien',
     'salió P' + barra.proteina + ', esperaba 40');
}

// ------------------------------------------------------------------
console.log('\nY una porción no es una cucharada');
{
  // El segundo fallo, aislado: la fila existe, el nombre coincide, pero la
  // unidad del modelo no es la del catálogo. `porcion_g` dice lo que pesa
  // una PORCIÓN de esa fila, no lo que pesa una cucharada.
  const MIEL = [{ nombre: 'Miel', unidad: 'Gramos', macros_por: '100g',
                  porcion_g: 339, proteina: 0.3, carbos: 82, grasas: 0, estado: 'unico' }];
  const m = (await afinar(buscador({ miel: MIEL }),
    [{ nombre: 'Miel', cantidad: 1, unidad: 'Cucharada',
       proteina: 0.1, carbos: 17, grasas: 0, seguridad: 'media' }]))[0];
  ok(m.carbos < 100,
     'una cucharada de miel no son 339 gramos de miel',
     'salió C' + m.carbos + '. Con `porcion_g` 339 salen 278 g de azúcar en ' +
     'una cucharada');
  ok(m.carbos === 17, 'se queda la estimación del modelo', 'salió C' + m.carbos);
  ok(m.seguridad !== 'alta', 'y marcada como estimación');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

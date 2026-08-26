// Que las Edge Functions sean al menos código válido.
//
// EL HUECO. Hay veinte y pico pruebas que leen `asistente/index.ts`, pero
// todas lo leen COMO TEXTO: buscan una frase, comprueban un orden, ejecutan
// un trozo suelto. Ninguna comprobaba que el archivo entero sea siquiera
// parseable. Una coma de más en un sitio que ninguna prueba mira, y las 119
// pruebas siguen en verde.
//
// Y eso importa aquí más que en otros proyectos, porque estas funciones NO se
// despliegan con la CLI: se pegan a mano en el panel web de Supabase. No hay
// un paso de compilación entre el editor y producción que avise. El primero
// en enterarse sería quien pulsara «Revisar mi semana».
//
// CÓMO. Node 24 sabe quitar los tipos de TypeScript él solo
// (`stripTypeScriptTypes`), así que se le quitan y se comprueba el JavaScript
// que queda con el `--check` de siempre. Sin instalar nada, que es la regla de
// este proyecto: no tiene dependencias y no va a empezar a tenerlas por esto.
//
// LO QUE ESTO NO ES. No es un chequeo de tipos: `--check` mira la sintaxis, no
// si un string cabe en un number. Para eso haría falta `tsc` y resolver los
// imports de Deno, que son URLs. Esto es el suelo, no el techo — pero el suelo
// no estaba puesto.
//
// (`node --check archivo.ts` a secas NO vale: no mira los .ts y devuelve 0
// aunque el archivo esté roto. Se probó.)

import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'supabase', 'functions');

let pasan = 0, fallan = 0;
const ok = (c, q, extra = '') => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q + (extra ? '\n         ' + extra : '')); }
};

const taller = mkdtempSync(join(tmpdir(), 'parsean-'));

// Devuelve null si parsea, o el motivo si no.
function porQueNoParsea(ruta) {
  let js;
  try {
    js = stripTypeScriptTypes(readFileSync(ruta, 'utf8'), { mode: 'strip' });
  } catch (e) {
    return 'no se le pueden quitar los tipos: ' + e.message;
  }
  const tmp = join(taller, 'x.mjs');
  writeFileSync(tmp, js);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    return null;
  } catch (e) {
    const salida = String(e.stderr || e.message);
    const linea = salida.split('\n').find((l) => /SyntaxError|Error:/.test(l));
    return linea ? linea.trim() : salida.slice(0, 200);
  }
}

// ------------------------------------------------------------------
console.log('\nSe encuentran las funciones');
const funciones = existsSync(DIR)
  ? readdirSync(DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ nombre: d.name, ruta: join(DIR, d.name, 'index.ts') }))
      .filter((f) => existsSync(f.ruta))
  : [];

ok(funciones.length >= 2,
   'hay ' + funciones.length + ': ' + funciones.map((f) => f.nombre).join(', '),
   'si salen cero, esta prueba está pasando sin mirar nada');

// ------------------------------------------------------------------
console.log('\nY todas son código válido');
for (const f of funciones) {
  const mal = porQueNoParsea(f.ruta);
  ok(mal === null, f.nombre + '/index.ts parsea',
     'se despliega pegándola a mano en el panel de Supabase: nadie la compila ' +
     'antes de que la use una persona. ' + mal);
}

// ------------------------------------------------------------------
console.log('\nY esta prueba se entera cuando algo está roto');
{
  // Sin esto, un fallo del método —que `--check` deje de mirar, que la API de
  // quitar tipos cambie— dejaría todo en verde para siempre sin comprobar
  // nada. Se rompe una copia a propósito y tiene que cantar.
  const copia = join(taller, 'roto.ts');
  writeFileSync(copia, readFileSync(funciones[0].ruta, 'utf8') + '\nfunction rota( {\n');
  ok(porQueNoParsea(copia) !== null, 'una copia rota se detecta',
     'el método dejó de funcionar: todo lo de arriba está pasando en falso');

  // Y que no cante con algo que es TypeScript legítimo pero no JavaScript.
  const conTipos = join(taller, 'tipos.ts');
  writeFileSync(conTipos,
    'interface A { x: number }\n' +
    'const f = (a: A): string => String(a.x);\n' +
    'export default f;\n');
  ok(porQueNoParsea(conTipos) === null, 'y los tipos de verdad no la confunden',
     'si esto falla, la prueba daría por rotas funciones que están bien');
}

rmSync(taller, { recursive: true, force: true });

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

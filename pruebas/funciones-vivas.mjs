// ¿Las Edge Functions ARRANCAN, y son las del repo?
//
// Esto existe por dos fallos de proceso, no de código.
//
// EL PRIMERO: se desplegó el asistente, se comprobó en el editor que las
// líneas y el sello fueran los correctos, y se dio por bueno. Pero subir un
// archivo no es que arranque: la función se quedó devolviendo
//
//     503 {"code":"BOOT_ERROR","message":"Function failed to start"}
//
// durante horas, y nadie se enteró porque nadie la LLAMÓ.
//
// Una petición sin sesión basta: si la función arranca, responde con su
// propio mensaje de "falta tu sesión". Si no arranca, responde 503 antes de
// llegar a ejecutar una sola línea. No gasta tokens ni toca datos.
//
// EL SEGUNDO: que arranque no dice QUÉ arrancó. Se despliega a mano por el
// panel, así que el repo y lo que corre allí se separan en silencio — el
// cambio del 1 de septiembre estuvo dos meses sin que se pudiera decir si
// había subido—. Ahora cada función lleva un sello sacado de su contenido
// y lo devuelve en un GET. Si el de allí no es el de aquí, hay que
// desplegar. Ver `herramientas/sellar-funciones.mjs`.
//
// Correr esto DESPUÉS de cada despliegue.
import { funciones, selloEscrito, sellar } from '../herramientas/sellar-funciones.mjs';

const BASE = 'https://jeeoxcsbkcthpwtkimdt.supabase.co/functions/v1/';
const KEY = 'sb_publishable_rCM5cTJ40dCrstUhB2ZAqw_qMIeYQNw';

const FUNCIONES = funciones();

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Las funciones arrancan —');
for (const f of FUNCIONES) {
  let estado = 0, cuerpo = '';
  try {
    const r = await fetch(BASE + f, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: '{}',
    });
    estado = r.status;
    cuerpo = (await r.text()).slice(0, 160);
  } catch (e) {
    cuerpo = 'no se pudo llamar: ' + e.message;
  }

  // 503 BOOT_ERROR = ni siquiera empezó. Cualquier otra cosa —401, 400,
  // 403— significa que arrancó y llegó a su propio código, que es lo único
  // que se está comprobando aquí.
  const arranco = estado !== 503 && !/BOOT_ERROR/.test(cuerpo);
  check(`${f} arranca`, arranco, `${estado} :: ${cuerpo}`);
  if (arranco) {
    check(`  ...y responde con lo suyo`, /"error"|"message"/.test(cuerpo),
      `${estado} :: ${cuerpo}`);
  }
}

// Antes de comparar con lo de fuera hay que poder fiarse de lo de aquí: si
// alguien tocó una función y no selló, el archivo sigue diciendo el sello
// de antes y la comparación de abajo daría verde con el código cambiado.
console.log('\n— El sello del repo está al día —');
for (const { nombre, sello, anterior, cambio } of sellar({ escribir: false })) {
  check(`${nombre}`, !cambio,
    `el archivo dice '${anterior}' y su contenido da '${sello}'.\n` +
    `        Correr: node herramientas/sellar-funciones.mjs`);
}

console.log('\n— Y lo desplegado es eso mismo —');
for (const f of FUNCIONES) {
  const aqui = selloEscrito(f);
  let estado = 0, cuerpo = '', alla = null;
  try {
    const r = await fetch(BASE + f, { headers: { apikey: KEY } });
    estado = r.status;
    cuerpo = (await r.text()).slice(0, 160);
    try { alla = JSON.parse(cuerpo).sello ?? null; } catch { /* no es JSON */ }
  } catch (e) {
    cuerpo = 'no se pudo llamar: ' + e.message;
  }

  // Sin sello en la respuesta no hay nada que comparar, y eso ya es la
  // respuesta: lo que corre allí es anterior a este cambio.
  if (alla === null) {
    check(`${f}: dice su sello`, false,
      `${estado} :: ${cuerpo}\n` +
      `        Si no trae "sello", lo desplegado es ANTERIOR a esto: hay que desplegarlo.`);
    continue;
  }
  check(`${f}: desplegado = repo`, alla === aqui,
    `allá '${alla}', aquí '${aqui}' — lo desplegado NO es lo del repo.`);
}

console.log(`\n${ok} pasan · ${mal} fallan`);
if (mal) {
  console.log('\nSi alguna no arranca: Supabase → Edge Functions → esa función →');
  console.log('Logs. El error de arranque sale ahí con su línea.');
  console.log('Si el sello no cuadra: Functions → la función → Code → pegar el');
  console.log('archivo del repo → Deploy updates, y volver a correr esto.');
}
process.exit(mal ? 1 : 0);

// ¿Las Edge Functions ARRANCAN?
//
// Esto existe por un fallo de proceso, no de código. Se desplegó el
// asistente, se comprobó en el editor que las líneas y el sello fueran los
// correctos, y se dio por bueno. Pero subir un archivo no es que arranque:
// la función se quedó devolviendo
//
//     503 {"code":"BOOT_ERROR","message":"Function failed to start"}
//
// durante horas, y nadie se enteró porque nadie la LLAMÓ.
//
// Una petición sin sesión basta: si la función arranca, responde con su
// propio mensaje de "falta tu sesión". Si no arranca, responde 503 antes de
// llegar a ejecutar una sola línea. No gasta tokens ni toca datos.
//
// Correr esto DESPUÉS de cada despliegue.
const BASE = 'https://jeeoxcsbkcthpwtkimdt.supabase.co/functions/v1/';
const KEY = 'sb_publishable_rCM5cTJ40dCrstUhB2ZAqw_qMIeYQNw';

const FUNCIONES = ['asistente', 'borrar-cuenta'];

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

console.log(`\n${ok} pasan · ${mal} fallan`);
if (mal) {
  console.log('\nSi alguna no arranca: Supabase → Edge Functions → esa función →');
  console.log('Logs. El error de arranque sale ahí con su línea.');
}
process.exit(mal ? 1 : 0);

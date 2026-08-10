// Que lo que escribe una persona no pueda ejecutarse.
//
// Esto no es teórico. Se comprobó en la app: un ejercicio llamado
//   <img src=x onerror="...">
// creaba la etiqueta de verdad y el código se ejecutaba al pintar la
// tarjeta. Y como el nombre del ejercicio se guarda en la base, volvía a
// ejecutarse cada vez que se recargaba la rutina — y en el navegador de un
// coach que mirara a ese cliente, con SU sesión abierta.
//
// La app arma HTML pegando cadenas (`'<div>' + nombre + '</div>'`). Eso no
// es malo en sí, pero obliga a que TODO lo que venga de una persona pase
// por escapar(). Un solo sitio olvidado basta.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— escapar() tapa los cinco caracteres —');
{
  const i = APP.indexOf('function escapar(');
  let n = 0, j = APP.indexOf('{', i);
  for (; j < APP.length; j++) { if (APP[j] === '{') n++; else if (APP[j] === '}') { n--; if (!n) break; } }
  const ctx = vm.createContext({});
  vm.runInContext(APP.slice(i, j + 1) + '\nthis.escapar = escapar;', ctx);
  const e = ctx.escapar;

  check('escapa <', e('<b>') === '&lt;b&gt;', e('<b>'));
  check('escapa &', e('a&b') === 'a&amp;b', e('a&b'));
  // Las comillas hacen falta aunque solo se noten dentro de un atributo: el
  // nombre del alimento viaja en data-alim="...".
  check('escapa comilla doble', e('a"b') === 'a&quot;b', e('a"b'));
  check('escapa comilla simple', e("a'b") === 'a&#39;b', e("a'b"));
  // El & primero, o si no se escaparían las propias entidades otra vez.
  check('el & va primero, no se escapa dos veces',
    e('<') === '&lt;' && !e('<').includes('&amp;'), e('<'));
  check('null y undefined no revientan', e(null) === '' && e(undefined) === '');

  // La carga con la que se probó de verdad.
  const payload = '<img src=x onerror="alert(1)">';
  check('la carga que funcionaba ya no tiene etiqueta',
    !/[<>]/.test(e(payload)), e(payload));
}

console.log('\n— Y no queda ningún sitio sin escapar —');
{
  // Barrido: cualquier concatenación dentro de HTML con una variable que
  // lleve texto de persona. La lista de variables es la que se uso al
  // encontrar el fallo; si mañana aparece otra, se añade aquí.
  const DE_PERSONA = /^(name|nombre|ej\.nombre|a\.n|r\.n|x\.nombre|f\.name|p\.nombre|p\.resumen|u\.email|u\.nombre)$/;
  const sinEscapar = [];
  APP.split('\n').forEach((l, idx) => {
    if (!l.includes('<')) return;
    if (l.includes('escapar(')) return;
    for (const m of l.matchAll(/'\s*\+\s*([A-Za-z_$][\w.$]*)\s*/g)) {
      if (DE_PERSONA.test(m[1])) { sinEscapar.push(`línea ${idx + 1}: ${m[1]} — ${l.trim().slice(0, 80)}`); break; }
    }
  });
  check('ninguna variable de persona entra cruda en HTML', sinEscapar.length === 0,
    sinEscapar.join('\n        '));
}

console.log('\n— Los sitios que estaban mal, uno por uno —');
{
  // Escritos por nombre para que quede constancia de cuáles eran y no se
  // "simplifiquen" de vuelta.
  const casos = [
    ['el ejercicio al crearlo',      "'<div><div class=\"ex-name\">'+escapar(name)+"],
    ['el ejercicio desde la base',   "'<div><div class=\"ex-name\">' + escapar(ej.nombre) +"],
    ['el catálogo de ejercicios',    "'<div class=\"ex-lib-name\">'+escapar(name)+"],
    ['el alimento en el diario',     "<div class=\"fc-name\">'+escapar(a.n)+"],
    ['el atributo data-alim',        "data-alim=\"'+escapar(a.n)+'\""],
    ['la receta',                    "<div class=\"fc-name\">'+escapar(r.n)+"],
    ['la persona en el panel',       "'<div><b>' + escapar(p.nombre) + '</b><span>' + escapar(p.resumen)"]
  ];
  for (const [nombre, aguja] of casos)
    check(nombre + ' va escapado', APP.includes(aguja), aguja);
}

console.log('\n— La nota se pinta con textContent, que no interpreta nada —');
{
  // El adelanto de la nota no pasa por innerHTML: se asigna con
  // textContent, que trata el texto como texto pase lo que pase. Es la
  // forma segura por construcción, mejor que acordarse de escapar.
  const i = APP.indexOf('function marcaNotas(');
  const trozo = APP.slice(i, i + 700);
  check('el adelanto usa textContent', /previa\.textContent =/.test(trozo));
  check('y no innerHTML', !/previa\.innerHTML/.test(trozo));
}

console.log('\n— La clave del cliente es la pública —');
{
  // La `service_role` salta RLS entera. En un archivo que se descarga
  // cualquiera sería el fin de la privacidad de todos.
  check('no hay service_role en la app', !/service_role\s*[:=]/.test(APP));
  check('la clave que se usa es publishable', /var SB_KEY = 'sb_publishable_/.test(APP));
  check('y está dicho que la otra nunca va aquí',
    /La clave `service_role` NUNCA debe estar aquí/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

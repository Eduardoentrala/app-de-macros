// El aviso de privacidad y el consentimiento.
//
// Esto no es una pantalla mas: la app recoge condiciones medicas, fotos del
// cuerpo y peso, y va a cobrar. En Mexico eso cae bajo la LFPDPPP y los
// datos de salud son sensibles, con consentimiento expreso y distinguible.
//
// Se prueban tres cosas:
//   1. Que el texto diga lo que la ley exige que diga.
//   2. Que no se pueda entrar sin aceptar.
//   3. Que el renderizador no rompa el texto ni deje inyectar nada.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MD = readFileSync(join(RAIZ, 'docs', 'legal.md'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const SQL = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0031_consentimiento.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— El aviso dice lo que tiene que decir —');
{
  // Lo que la LFPDPPP exige que aparezca. Si alguien recorta el texto, esto
  // salta antes de que se publique.
  const debe = [
    ['identifica al responsable',      /responsable del tratamiento/i],
    ['da domicilio',                   /domicilio/i],
    ['da una forma de contacto',       /CORREO DE CONTACTO|escribe a/i],
    ['dice para que se usan',          /Para qu[eé] los usamos/i],
    ['marca los datos sensibles',      /[Dd]atos sensibles/],
    ['explica los derechos ARCO',      /Acceder[\s\S]{0,400}Rectificar[\s\S]{0,400}Cancelar[\s\S]{0,400}Oponerte/],
    ['dice como revocar',              /revocar tu consentimiento/i],
    ['menciona al INAI',               /INAI/],
    ['declara las transferencias',     /Supabase[\s\S]{0,200}Anthropic/],
    ['avisa de que salen del pais',    /salen de M[eé]xico|Estados Unidos/],
    ['dice cuanto se guardan',         /Cu[aá]nto tiempo/i],
    ['dice como se avisan los cambios',/Cambios a este aviso/i]
  ];
  for (const [nombre, re] of debe) check(nombre, re.test(MD));

  // Y lo que la app promete, que tiene que ser verdad de lo que hace.
  check('dice que no vende datos', /No vendemos tus datos/i.test(MD));
  check('dice que no es consejo medico', /no da consejo m[eé]dico/i.test(MD));
  check('advierte de que la IA se equivoca', /se puede equivocar/i.test(MD));
  // Los huecos que solo puede llenar el dueño tienen que seguir marcados:
  // publicarlo con corchetes es feo, publicarlo SIN rellenar y sin marcar
  // es peor.
  check('los huecos por rellenar estan marcados', /\[NOMBRE COMPLETO/.test(MD));
}

console.log('\n— Sin aceptar no se entra —');
{
  check('hay casilla de terminos', HTML.includes('id="regAceptoTerminos"'));
  // Dos casillas y no una: el consentimiento para datos sensibles tiene que
  // ser expreso Y distinguible del general.
  check('y una APARTE para datos de salud', HTML.includes('id="regAceptoSalud"'));
  check('el boton nace bloqueado', /id="regEmpezar"[^>]*disabled/.test(HTML));

  // La funcion entera, contando llaves. Antes eran 800 caracteres a ojo, y
  // eso se queda corto en cuanto la funcion crece por un motivo bueno.
  const i = APP.indexOf('function revisarConsentimiento(');
  const f = (() => {
    let n = 0, j = APP.indexOf('{', i);
    for (; j < APP.length; j++) {
      if (APP[j] === '{') n++;
      else if (APP[j] === '}') { n--; if (!n) return APP.slice(i, j + 1); }
    }
    return APP.slice(i);
  })();
  // Sin espacios, para no fijar como esta escrita: la condicion crecio a tres
  // lineas al anadir `datosCompletos()` y esta comprobacion se puso roja
  // aunque lo que mira siguiera siendo verdad.
  const plano = f.replace(/\s+/g, '');
  check('el boton depende de las dos',
        plano.includes('!terminos.checked||(hayCondiciones&&!salud.checked)'));
  // Y de que los datos esten: sin edad ni altura se llegaba al final del alta
  // con calorias inventadas. Ver alta-sin-datos.
  check('y de que los datos esten completos', plano.includes('!datosCompletos()'),
        'sin esto se termina el alta con la altura en blanco y la cuenta sale igual');
  check('la de salud solo sale si declaro algo', /caja\.hidden = !hayCondiciones/.test(f));
  // Dejar marcada una casilla que ya no se ve seria consentir a ciegas.
  check('si quita las condiciones, se desmarca', /if\(!hayCondiciones\) salud\.checked = false/.test(f));
  check('se revisa al tocar una condicion', APP.includes('revisarConsentimiento();'));
}

console.log('\n— Queda constancia, y de QUE version —');
{
  check('se guarda la fecha', /consentimiento_en: new Date\(\)\.toISOString\(\)/.test(APP));
  check('y la version', /consentimiento_version: VERSION_LEGAL/.test(APP),
    'sin version, "acepto" no significa nada dentro de un año');
  check('la de salud va aparte', /consentimiento_salud_en/.test(APP));
  check('la base tiene las tres columnas',
    /consentimiento_en/.test(SQL) && /consentimiento_version/.test(SQL) &&
    /consentimiento_salud_en/.test(SQL));
  // La pantalla no es la unica puerta: se puede llamar a PostgREST directo.
  check('y la base rechaza salud sin consentimiento',
    /profiles_salud_con_consentimiento/.test(SQL));
  check('sin tumbar a quien ya tenia condiciones', /\) not valid;/.test(SQL),
    'sin not valid, el propio ALTER TABLE fallaria y la migracion no entraria');
}

console.log('\n— El texto se pinta sin romperse —');
{
  // Se extrae el renderizador real y se le da markdown de verdad.
  const ini = APP.indexOf('function comoHtml(');
  const fin = APP.indexOf('\n  function abrirLegal(');
  const ctx = vm.createContext({
    escapar: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                             .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  });
  vm.runInContext(APP.slice(ini, fin), ctx);
  const html = ctx.comoHtml(MD);

  check('salen los encabezados', (html.match(/<h2>/g) || []).length >= 10);
  check('y las dos tablas', (html.match(/<table>/g) || []).length === 2);
  check('y las listas', html.includes('<li>'));
  // Un parrafo de markdown sigue hasta la linea en blanco. Cortando en cada
  // salto, las frases se parten y una **negrita** a caballo sale literal.
  check('no quedan asteriscos sueltos', !/\*\*/.test(html),
    'el parrafo se esta partiendo en cada salto de linea');
  check('las negritas se convierten', html.includes('<b>'));

  // Lo que de verdad importa: que nada del texto pueda inyectar HTML.
  const malicioso = 'Hola <script>alert(1)</script> y <img src=x onerror=y>';
  const sucio = ctx.comoHtml(malicioso);
  check('el HTML del texto se escapa', !/<script>|<img /.test(sucio), sucio);
  check('pero se sigue leyendo', sucio.includes('Hola'));
}

console.log('\n— Se puede leer antes de aceptar —');
{
  check('hay vista legal', HTML.includes('data-view="legal"'));
  check('se abre desde el registro', /id="regLegal"[\s\S]{0,400}data-ver-legal/.test(HTML));
  check('y desde Perfil', /enlace-legal[^>]*data-ver-legal/.test(HTML));
  // El texto se trae de legal.md: un solo sitio que editar, y el que se
  // revisa es el que se enseña.
  check('el texto sale del mismo archivo', APP.includes("fetch('legal.md'"));
  check('se abre apilada, con boton de regresar', /goto\('legal', true\)/.test(APP));
}

// ------------------------------------------------------------------
console.log('\n- Dos cosas que estuvieron mal -');
{
  // 1. El aviso decia que la foto DEL PLATILLO va a Anthropic, y callaba
  //    que las de progreso -ocho fotos del cuerpo- tambien.
  check('dice que las fotos de progreso tambien van a la IA',
    /fotos de progreso también/i.test(MD) && /cuatro fotos tuyas/i.test(MD),
    'son fotos del cuerpo: callarlo en el aviso no vale');
  check('y que hace falta autorizarlo antes',
    /si lo autorizas/i.test(MD) && /puedes decir que no/i.test(MD));

  // 2. Anunciaba planes de $99 y $199 al mes en una app que no cobra. Su
  //    familia podia abrirlo y pensar que se les iba a facturar.
  check('no anuncia precios que nadie cobra',
    !/\$99|\$199/.test(MD),
    'la app no cobra: poner precios asusta para nada');
  check('y lo dice claro', /no cobra nada/i.test(MD));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

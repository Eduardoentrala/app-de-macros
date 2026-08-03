// Que iniciar sesion deje la pantalla lista para volver a calcular.
//
// El fallo que cierra esto: calcularMacros() lee los campos de la pantalla
// de REGISTRO. Quien iniciaba sesion los encontraba vacios, y cambiar el
// objetivo desde Perfil recalculaba sobre ceros -> 1.200 cal y 0 g de
// proteina, guardados en la base. No se ve: sale un numero, y un numero
// siempre parece correcto.
//
// Se comprueba sobre el texto real de app.js. No hay DOM aqui, asi que lo
// que se verifica es el contrato: que cada entrada de la formula se guarde,
// se pida y se devuelva. Las tres puntas tienen que existir o la cadena se
// rompe por donde no se mira.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const SQL = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0022_sexo_y_dias_de_entreno.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

// Lo que entra en Mifflin-St Jeor y en el factor de actividad. Si una sola
// de estas cinco no vuelve al iniciar sesion, el recalculo miente.
const ENTRADAS = [
  { dato: 'age',          campo: 'regEdad'   },
  { dato: 'height_cm',    campo: 'regAltura' },
  { dato: 'weight_kg',    campo: 'regPeso'   },
  { dato: 'sexo',         campo: null        },  // va a reg.sexo, no a un input
  { dato: 'dias_entreno', campo: null        }
];

const trozo = (desde, hasta) => {
  const a = APP.indexOf(desde);
  if (a < 0) return '';
  const b = APP.indexOf(hasta, a);
  return APP.slice(a, b < 0 ? APP.length : b);
};

console.log('\n— La migracion guarda lo que faltaba —');
{
  check('anade sexo', /add column if not exists sexo\b/.test(SQL));
  check('anade dias_entreno', /add column if not exists dias_entreno\b/.test(SQL));
  check('el sexo solo admite h o m', /sexo in \('h', 'm'\)/.test(SQL));
  check('los dias van de 0 a 7', /dias_entreno between 0 and 7/.test(SQL));
  // Un default aqui seria afirmar algo que la persona nunca dijo.
  check('ninguna se inventa un valor por defecto',
        !/add column if not exists (sexo|dias_entreno)[^,;]*default/.test(SQL));
}

console.log('\n— El perfil se guarda con las cinco entradas —');
{
  const guardar = trozo('function sbGuardarPerfil(', '\n  }');
  check('sbGuardarPerfil existe', guardar.length > 0);
  for (const { dato } of ENTRADAS) {
    check(`guarda ${dato}`, new RegExp(`${dato}\\s*:`).test(guardar) ||
          new RegExp(`${dato}:`).test(guardar),
          'si no se guarda, no hay nada que devolver despues');
  }
}

console.log('\n— Y se devuelven a la pantalla al volver a entrar —');
{
  const volcar = trozo('function volcarPerfilEnRegistro(', '\n  }\n');
  check('volcarPerfilEnRegistro existe', volcar.length > 0);
  for (const { dato, campo } of ENTRADAS) {
    check(`devuelve ${dato}`, volcar.includes(`p.${dato}`));
    if (campo) check(`  ...al campo ${campo}`, volcar.includes(campo));
  }
  check('devuelve tambien las condiciones', volcar.includes('p.condiciones'));
  check('y recalcula al terminar', /calcularMacros\(\)/.test(volcar),
        'sin esto el aviso de salud se queda con lo de la sesion anterior');
}

console.log('\n— Y alguien la llama de verdad —');
{
  // Una funcion perfecta que nadie invoca no arregla nada. Se cuentan las
  // llamadas fuera de su propia definicion.
  const llamadas = (APP.match(/volcarPerfilEnRegistro\(/g) || []).length;
  check('se llama desde la carga del perfil', llamadas >= 2,
        `aparece ${llamadas} vez/veces: solo la definicion`);
}

console.log('\n— Nada restaura sobre un null —');
{
  const volcar = trozo('function volcarPerfilEnRegistro(', '\n  }\n');
  // Las cuentas de antes de la 0022 no tienen sexo ni dias. Meter un null
  // en reg.dias deja NIVEL[null] undefined y revienta el calculo entero.
  check('el sexo se comprueba antes de usarlo', /if\(p\.sexo\)/.test(volcar));
  check('los dias se comprueban antes de usarlos', /p\.dias_entreno\s*!=\s*null/.test(volcar));
  check('sale pronto si no hay perfil', /if\(!p\)\s*return/.test(volcar));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

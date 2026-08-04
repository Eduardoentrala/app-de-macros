// El tope por plan y la memoria del asistente.
//
// El tope no es un detalle tecnico: es lo que decide si el negocio gana o
// pierde. Con un tope unico de 5 para los dos planes, un usuario intenso de
// 99 pesos costaba ~$7 al mes y dejaba ~$4.75: cuanto mas le gustaba la
// app, mas dinero se perdia con el. Si alguien vuelve a igualar los topes,
// esto salta.
//
// La memoria es lo otro: si deja de guardarse o de inyectarse, el asistente
// vuelve a ser un buscador con buenos modales y nadie paga 199 por eso.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = readFileSync(
  join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const SQL = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0029_memoria_del_asistente.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

console.log('\n— Cada plan tiene su tope —');
{
  const m = FN.match(/const TOPES = \{ apagada: (\d+), normal: (\d+), plus: (\d+) \}/);
  check('los tres topes estan escritos', !!m, 'no se encontro la tabla TOPES');
  if (m) {
    const [, apagada, normal, plus] = m.map(Number);
    check('apagada no gasta nada', apagada === 0);
    check('plus tiene mas que normal', plus > normal, `normal ${normal}, plus ${plus}`);
    // El margen sale de aqui. A $0.046 la consulta con foto, 30 dias:
    const costeNormal = normal * 0.046 * 30;
    check('el plan normal no puede dar perdidas', costeNormal < 4.75,
      `en el peor caso costaria $${costeNormal.toFixed(2)} y deja $4.75`);
  }
  check('ya no queda un tope unico', !/const TOPE_DIARIO = \d+;/.test(FN),
    'una constante suelta se vuelve a usar para todos sin querer');
  check('el tope se elige por el nivel de la persona',
    /TOPES\[nivel as keyof typeof TOPES\]/.test(FN));
  check('y si el nivel es raro, cae en el mas bajo de pago',
    /\?\? TOPES\.normal/.test(FN), 'nunca debe caer en el de plus por defecto');
}

console.log('\n— Lo que dice la app cuadra con lo que hace la funcion —');
{
  // Prometer cinco y dar tres es como se pierde la confianza de golpe.
  const m = FN.match(/const TOPES = \{ apagada: \d+, normal: (\d+), plus: (\d+) \}/);
  const palabras = { 1:'Una', 2:'Dos', 3:'Tres', 4:'Cuatro', 5:'Cinco',
                     10:'Diez', 15:'Quince', 20:'Veinte' };
  if (m) {
    check(`el plan normal anuncia ${palabras[+m[1]]?.toLowerCase()} consultas`,
      APP.includes(`${palabras[+m[1]]} consultas al día`),
      `la funcion da ${m[1]}`);
    check(`el plan plus anuncia ${palabras[+m[2]]?.toLowerCase()} consultas`,
      APP.includes(`${palabras[+m[2]]} consultas al día`),
      `la funcion da ${m[2]}`);
  }
  check('ya no se anuncian cinco en ningun plan',
    !APP.includes('Cinco consultas al día'));
}

console.log('\n— La memoria se guarda —');
{
  check('la columna existe con su tope', /memoria_ia text/.test(SQL) &&
    /length\(memoria_ia\) <= 1200/.test(SQL));
  check('el esquema del chat la devuelve', /memoria: \{ anyOf:/.test(FN));
  check('la app la guarda en el perfil',
    /memoria_ia: String\(texto\)/.test(APP));
  check('y alguien llama a esa funcion',
    (APP.match(/guardarMemoriaIA\(/g) || []).length >= 2);
  // Recortar solo en la base haria fallar el guardado entero por un
  // caracter de mas, y se perderia por nada.
  check('se recorta antes de llegar al CHECK',
    /salida\.memoria\.trim\(\)\.slice\(0, 1200\)/.test(FN));
}

console.log('\n— Y se usa —');
{
  check('se lee de la base y se inyecta', /LO QUE YA SABES DE ESTA PERSONA/.test(FN));
  // Si viniera por el cuerpo de la peticion, cualquiera podria escribir en
  // el sistema del modelo desde la consola del navegador.
  const i = FN.indexOf('let loQueSe');
  const bloque = FN.slice(i, i + 500);
  check('la memoria se lee de la base, no del cuerpo',
    /admin[\s\S]{0,80}\.from\('profiles'\)/.test(bloque),
    'leerla de cuerpo.memoria dejaria inyectar lo que sea en el sistema');
  check('solo Plus la tiene', /esPlus \? SISTEMA_EVENTOS \+ SISTEMA_MEMORIA/.test(FN));
  check('y a quien no es Plus se le borra de la salida',
    /if \(!esPlus\) \{ salida\.evento = null; salida\.memoria = null; \}/.test(FN));
}

console.log('\n— No se guarda lo que ya esta en otro sitio —');
{
  const i = FN.indexOf('LO QUE RECUERDAS DE ESTA PERSONA');
  const s = FN.slice(i, i + 1800);
  check('se le dice que no duplique lo que ya tiene', /no lo dupliques/.test(s));
  check('ni que guarde diagnosticos', /Diagn[oó]sticos/.test(s));
  // Ojo al escribir estas comprobaciones: el prompt va envuelto a 72
  // columnas, asi que una frase puede partirse por cualquier hueco. Se
  // busca con \s+ o se falla por un salto de linea.
  check('la memoria se reescribe entera, no se acumula',
    /no\s+un\s+a[ñn]adido/.test(s),
    'acumular la vuelve un ladrillo que se paga cada mensaje');
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

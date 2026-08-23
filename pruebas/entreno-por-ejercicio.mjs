// ¿Sabe la IA en QUÉ ejercicio subiste, o solo cuánto pesó la semana?
//
// LO QUE PASABA. Al cierre de semana solo le llegaba el VOLUMEN TOTAL: la
// suma de peso × reps × series de todos los ejercicios del día. Un solo
// número por semana.
//
// Y ese número esconde lo que de verdad pasa. Si subes un 10% en piernas y
// bajas un 10% en espalda, la suma sale plana y se lee «estancado» cuando
// hay una mitad avanzando y otra frenada. Tampoco podía decir «llevas
// cuatro semanas sin subir en press banca», que es lo más accionable que
// hay.
//
// Y EL DETALLE YA ESTABA GUARDADO. Cada sesión guarda `exercises` con el
// nombre, el volumen y las series con su PESO —es lo que alimenta el
// «+9% vs anterior» de la pantalla—. Solo que la consulta del cierre pedía
// `session_date, total_volume` y lo dejaba en la base.
//
// Se mira el peso MÁXIMO de la semana y no el volumen: subir de 25 a 27 kg
// es progreso aunque hicieras una serie menos, y es lo que la persona
// reconoce como «subí».

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(AQUI, '..', 'docs', 'app.js'), 'utf8');
const FUN = readFileSync(
  join(AQUI, '..', 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');

let pasan = 0, fallan = 0;
const ok = (c, q) => {
  if (c) { pasan++; console.log('  ok  ' + q); }
  else { fallan++; console.log('  FALLA  ' + q); }
};

// ---- El cálculo real, sacado de app.js y ejecutado ----
const i = APP.indexOf('        // ---- EJERCICIO POR EJERCICIO ----');
// Anclado al principio de línea. Sin el salto, `indexOf` encontraba el
// `return {` de dentro del `.map()` —que va con dos espacios más, así que
// contiene la cadena de ocho— y el recorte salía partido a la mitad.
const j = APP.indexOf('\n        return {', i) + 1;
if (i < 0 || j < 0) {
  console.log('  FALLA  no encuentro el cálculo en app.js');
  process.exit(1);
}
const CALCULO = APP.slice(i, j);

// El lunes de referencia. Las cuatro ventanas van hacia atrás desde aquí.
const ANCLA = new Date('2026-08-17T00:00:00');
const iso = (d) => d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// Día 0 = el lunes de hace 4 semanas.
const dia = (n) => iso(new Date(ANCLA.getTime() + (n - 28) * 86400000));

const calcular = new Function('filas', 'anclaSemana', 'isoDe', CALCULO + '; return ejercicios;');

// ------------------------------------------------------------------
console.log('\nDistingue el que sube del que se atora');
{
  // Sentadilla sube cada semana. Press banca lleva tres clavado en 40.
  const filas = [];
  [[0, 60], [7, 65], [14, 70], [21, 75]].forEach(([d, peso]) => {
    filas.push({ session_date: dia(d), exercises: [
      { nombre: 'Sentadilla', volumen: peso * 30, series: [{ reps: 10, peso }] },
      { nombre: 'Press banca', volumen: 40 * 30, series: [{ reps: 10, peso: 40 }] },
    ] });
  });

  const r = calcular(filas, ANCLA, iso);
  const sent = r.find((x) => x.nombre === 'Sentadilla');
  const press = r.find((x) => x.nombre === 'Press banca');

  ok(!!sent && sent.peso === 75 && sent.peso_antes === 70,
     'la sentadilla: 75 kg esta semana, 70 la anterior', sent);
  ok(!!sent && sent.semanas_sin_subir === 0,
     'y como sube cada semana, cero semanas atorada');
  ok(!!press && press.peso === 40 && press.peso_antes === 40,
     'el press banca sigue en 40');
  ok(!!press && press.semanas_sin_subir === 3,
     `y lleva 3 semanas sin subir de peso (dice ${press && press.semanas_sin_subir})`);
}

// ------------------------------------------------------------------
console.log('\nY esto es justo lo que el volumen total escondía');
{
  // Piernas sube un 10%, espalda baja un 10%. La SUMA sale plana.
  const semana = (d, pierna, espalda) => ({
    session_date: dia(d), exercises: [
      { nombre: 'Prensa', volumen: pierna * 40, series: [{ reps: 10, peso: pierna }] },
      { nombre: 'Remo', volumen: espalda * 40, series: [{ reps: 10, peso: espalda }] },
    ],
  });
  const filas = [semana(14, 100, 100), semana(21, 110, 90)];
  const r = calcular(filas, ANCLA, iso);

  const volAntes = 100 * 40 + 100 * 40;
  const volAhora = 110 * 40 + 90 * 40;
  ok(volAhora === volAntes, 'el volumen total de las dos semanas es IDÉNTICO: 8000');

  const prensa = r.find((x) => x.nombre === 'Prensa');
  const remo = r.find((x) => x.nombre === 'Remo');
  ok(prensa && prensa.peso > prensa.peso_antes, 'pero la prensa subió: 110 contra 100');
  ok(remo && remo.peso < remo.peso_antes, 'y el remo bajó: 90 contra 100');
}

// ------------------------------------------------------------------
console.log('\nNo haber hecho un ejercicio no es estar atorado');
{
  // Dominadas solo dos semanas, y la última con más peso.
  const filas = [
    { session_date: dia(7),  exercises: [{ nombre: 'Dominadas', volumen: 0, series: [{ reps: 8, peso: 5 }] }] },
    { session_date: dia(21), exercises: [{ nombre: 'Dominadas', volumen: 0, series: [{ reps: 8, peso: 10 }] }] },
  ];
  const r = calcular(filas, ANCLA, iso);
  const d = r.find((x) => x.nombre === 'Dominadas');
  ok(!!d && d.semanas_sin_subir === 0,
     'las semanas que no lo hizo no cuentan como atoradas', d);
  ok(!!d && d.peso === 10, 'y sale el peso de la última vez que sí lo hizo');

  // EL CASO QUE DE VERDAD LO DISTINGUE: mismo peso dos veces en el mes, con
  // dos semanas de por medio sin hacerlo. Son DOS veces sin subir, no
  // cuatro: las semanas que no pisó el gimnasio para ese ejercicio no son
  // semanas atorado, y contarlas convierte a alguien que entrena cada
  // quince días en alguien «estancado hace un mes».
  const salteado = calcular([
    { session_date: dia(0),  exercises: [
      { nombre: 'Curl', volumen: 300, series: [{ reps: 10, peso: 20 }] }] },
    { session_date: dia(21), exercises: [
      { nombre: 'Curl', volumen: 300, series: [{ reps: 10, peso: 20 }] }] },
  ], ANCLA, iso);
  const curl = salteado.find((x) => x.nombre === 'Curl');
  ok(!!curl && curl.semanas_sin_subir === 1,
     `solo cuentan las semanas en que SÍ lo hizo (dice ${curl && curl.semanas_sin_subir}, deben ser 1)`);

  // Y lo que se dejó de hacer hace tiempo ni aparece: la IA no tiene por
  // qué opinar de un ejercicio que ya no está en la rutina.
  const abandonado = calcular([
    { session_date: dia(0), exercises: [
      { nombre: 'Curl', volumen: 300, series: [{ reps: 10, peso: 20 }] }] },
  ], ANCLA, iso);
  ok(abandonado.length === 0,
     'y lo que no se hace desde hace dos semanas no sale en la lista');
}

// ------------------------------------------------------------------
console.log('\nSe manda lo que dice algo, no una hoja de cálculo');
{
  // Doce ejercicios: uno subió mucho, otro lleva tres atorado, el resto
  // sin novedad. Deben salir los dos primeros y caber en ocho.
  const ejs = [];
  for (let n = 0; n < 12; n++) {
    ejs.push({ nombre: 'Ej' + n, volumen: 500, series: [{ reps: 10, peso: 50 }] });
  }
  const filas = [];
  for (const d of [0, 7, 14, 21]) {
    const copia = ejs.map((x) => ({ ...x, series: [{ ...x.series[0] }] }));
    // Ej0 sube de golpe la última semana.
    if (d === 21) copia[0].series[0].peso = 80;
    filas.push({ session_date: dia(d), exercises: copia });
  }
  const r = calcular(filas, ANCLA, iso);

  ok(r.length === 12, 'se calculan los doce');
  const ocho = r.slice(0, 8);
  ok(ocho[0].nombre === 'Ej0',
     'y el que más se movió sale primero: es lo que la persona reconoce como progreso');
  ok(r.every((x) => x.semanas_sin_subir === 3 || x.nombre === 'Ej0'),
     'los demás llevan 3 semanas clavados en 50, que es lo otro que importa');
}

// ------------------------------------------------------------------
console.log('\nUn ejercicio NUEVO no es una subida');
{
  // Lleva un mes con el press banca clavado en 40 y esta semana añade un
  // ejercicio a la rutina. Antes de arreglarlo, el nuevo salía como
  // «↑ SUBIÓ de 0 a 12» Y se ponía PRIMERO: puntuaba 100 por «subir de
  // cero», así que bastaba añadir tres ejercicios para que el que lleva un
  // mes atorado —lo único accionable— se cayera de la lista de ocho.
  //
  // Cambiarle el nombre a un ejercicio produce exactamente lo mismo: el
  // viejo desaparece y el nuevo parece un estreno.
  const filas = [];
  for (const d of [0, 7, 14]) {
    filas.push({ session_date: dia(d), exercises: [
      { nombre: 'Press banca', volumen: 1200, series: [{ reps: 10, peso: 40 }] }] });
  }
  filas.push({ session_date: dia(21), exercises: [
    { nombre: 'Press banca', volumen: 1200, series: [{ reps: 10, peso: 40 }] },
    { nombre: 'Face pull', volumen: 300, series: [{ reps: 15, peso: 12 }] }] });

  const r = calcular(filas, ANCLA, iso);
  const nuevo = r.find((x) => x.nombre === 'Face pull');
  ok(!!nuevo && nuevo.nuevo === true, 'se marca como estreno, no como subida');
  ok(!!nuevo && !nuevo.peso_antes, 'y no tiene con qué comparar: eso es lo que era');

  ok(r[0].nombre === 'Press banca',
     `y el que lleva 3 semanas atorado va PRIMERO (va «${r[0].nombre}»): ` +
     'lo accionable no puede caerse de la lista porque alguien añadió ejercicios');
}

// ------------------------------------------------------------------
console.log('\nY entrenar cada quince días tampoco es estrenar');
{
  // Se compara con LA ÚLTIMA VEZ QUE LO HIZO, no con «la semana pasada» a
  // secas. Quien hace un ejercicio cada dos semanas tenía la anterior en
  // cero, y salía como debut cada vez que lo hacía.
  const r = calcular([
    { session_date: dia(7),  exercises: [
      { nombre: 'Dominadas', volumen: 400, series: [{ reps: 8, peso: 20 }] }] },
    { session_date: dia(21), exercises: [
      { nombre: 'Dominadas', volumen: 500, series: [{ reps: 8, peso: 25 }] }] },
  ], ANCLA, iso);
  const d = r.find((x) => x.nombre === 'Dominadas');

  ok(!!d && d.nuevo === false, 'no es un estreno: ya lo hacía');
  ok(!!d && d.peso_antes === 20, `compara con los 20 kg de hace dos semanas (dice ${d && d.peso_antes})`);
  ok(!!d && d.vol_antes === 400,
     'y el volumen de antes sale de LA MISMA semana que el peso: mezclarlos ' +
     'daría «25 kg (antes 20) · volumen 500 (antes 0)», que parece un derrumbe');
}

// ------------------------------------------------------------------
console.log('\nUn peso tecleado y no levantado no es un récord');
{
  // Las filas se rellenan solas con lo de la sesión anterior, y se puede
  // teclear un peso «para la próxima» sin llegar a hacerlo. Contándolo, la
  // IA le dice «subiste a 50 kg» a quien no lo movió.
  const r = calcular([
    { session_date: dia(14), exercises: [{ nombre: 'Sentadilla', volumen: 800,
      series: [{ reps: 10, peso: 40, hecho: true }] }] },
    { session_date: dia(21), exercises: [{ nombre: 'Sentadilla', volumen: 900,
      series: [
        { reps: 10, peso: 42, hecho: true },   // esta sí la hizo
        { reps: 10, peso: 50, hecho: false },  // esta la dejó escrita
      ] }] },
  ], ANCLA, iso);
  const s = r.find((x) => x.nombre === 'Sentadilla');
  ok(!!s && s.peso === 42,
     `cuenta los 42 que hizo, no los 50 que escribió (dice ${s && s.peso})`);

  // Pero mucha gente no usa las palomitas. Si no hay NINGUNA marcada, se
  // cuentan todas: mejor eso que dejar el ejercicio en cero y que
  // desaparezca de la lista.
  const sinPalomitas = calcular([
    { session_date: dia(21), exercises: [{ nombre: 'Remo', volumen: 600,
      series: [{ reps: 10, peso: 30 }, { reps: 10, peso: 35 }] }] },
  ], ANCLA, iso);
  const remo = sinPalomitas.find((x) => x.nombre === 'Remo');
  ok(!!remo && remo.peso === 35,
     'sin ninguna palomita se cuentan todas: no se castiga a quien no las usa');
}

// ------------------------------------------------------------------
console.log('\nY llega de verdad a la IA');
{
  ok(/select=session_date,total_volume,exercises/.test(APP),
     'la consulta pide el detalle, que antes se quedaba en la base');
  ok(/ejercicios: ejercicios\.slice\(0, 8\)/.test(APP),
     'y se mandan ocho como mucho: un mensaje corto de lunes, no un informe');

  ok(/EJERCICIO POR EJERCICIO \(peso máximo de la semana\)/.test(FUN),
     'la función lo pone en el contexto');
  ok(/semanas sin subir de peso/.test(FUN),
     'diciendo cuántas semanas lleva atorado cada uno');
  ok(/porEjercicio \+/.test(FUN),
     'y se pega al contexto que se manda de verdad');

  // Las reglas para leerlo. Sin esto, el modelo recibe la lista y no sabe
  // qué hacer con ella.
  ok(/El volumen total esconde lo que pasa dentro/.test(FUN),
     'y se le explica por qué el total no basta');
  ok(/PERO NOMBRA COMO MUCHO UNO/.test(FUN),
     'con el freno: uno, no doce. El lunes se lee un mensaje, no una tabla');

  // Y que la linea que lee el modelo no diga «subio» de un estreno.
  ok(/const nuevo = x\.nuevo === true \|\| !Number\(x\.peso_antes\);/.test(FUN),
     'la línea marca los estrenos');
  ok(/const subio = !nuevo &&/.test(FUN),
     'y «subió» exige que hubiera algo con qué comparar');
  ok(/NUEVO, primera vez que lo hace/.test(FUN),
     'se le dice al modelo cuál es nuevo');
  ok(/No lo cuentes como progreso ni como retroceso/.test(FUN),
     'y qué hacer con eso');

  // El nombre del ejercicio lo teclea la persona y no tiene tope en la
  // pantalla. Todo lo demás que escribe y acaba en el prompt va recortado
  // —la nota a 300, la memoria a 1200, el nombre de un plan a 60—; esto se
  // había quedado sin recortar. Ocho nombres de cinco mil letras son
  // tokens pagados por nada, y el nombre lo controla quien usa la app.
  ok(/String\(x\.nombre \?\? 'ejercicio'\)\.trim\(\)\.slice\(0, 40\)/.test(FUN),
     'el nombre del ejercicio va recortado, como todo lo que escribe la persona');
}

console.log('\n' + pasan + ' bien, ' + fallan + ' mal');
process.exit(fallan ? 1 : 0);

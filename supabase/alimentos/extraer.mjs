// Saca de USDA SR Legacy los alimentos que sirven para contar macros.
//
// SR Legacy y no la base completa: son 7.793 alimentos GENERICOS -sin una
// sola marca comercial- y ya trae crudo y cocido como registros
// independientes, que es justo lo que se pidio. La base completa son 477
// MB de los que el 95% son productos de marca.
//
// Uso:  node extraer.mjs <carpeta-csv>  > crudo.json
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
if (!DIR) { console.error('falta la carpeta con los CSV'); process.exit(1); }

// Los CSV de USDA vienen con comillas y comas dentro de los campos, asi
// que no vale partir por comas. Este lector respeta las comillas.
function leerCsv(ruta) {
  const texto = readFileSync(ruta, 'utf8');
  const filas = [];
  let campo = '', fila = [], enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const cab = filas.shift();
  return filas.filter(f => f.length === cab.length)
              .map(f => Object.fromEntries(cab.map((k, i) => [k, f[i]])));
}

const P = { PROT: '1003', GRASA: '1004', CARB: '1005', KCAL: '1008' };

const alimentos = leerCsv(join(DIR, 'food.csv'));
const categorias = Object.fromEntries(
  leerCsv(join(DIR, 'food_category.csv')).map(c => [c.id, c.description]));

// 644 mil filas: se recorre una vez quedandose solo con los cuatro
// nutrientes que importan. Cargarlas todas en memoria como objetos seria
// gastar 300 MB para tirar el 99%.
const macros = new Map();
for (const n of leerCsv(join(DIR, 'food_nutrient.csv'))) {
  if (!Object.values(P).includes(n.nutrient_id)) continue;
  let m = macros.get(n.fdc_id);
  if (!m) macros.set(n.fdc_id, m = {});
  m[n.nutrient_id] = parseFloat(n.amount);
}

// Una porcion casera por alimento ("1 taza", "1 pieza mediana"), la de
// menor seq_num que es la principal. Sirve para que la app pueda ofrecer
// algo mas util que "100 g".
const porciones = new Map();
for (const p of leerCsv(join(DIR, 'food_portion.csv'))) {
  const g = parseFloat(p.gram_weight);
  if (!g || g <= 0) continue;
  const prev = porciones.get(p.fdc_id);
  if (prev && Number(prev.seq) <= Number(p.seq_num || 99)) continue;
  const desc = [p.portion_description, p.modifier].filter(Boolean)
    .join(' ').trim().replace(/\s+/g, ' ');
  if (!desc || desc.toLowerCase() === 'quantity not specified') continue;
  porciones.set(p.fdc_id, { seq: p.seq_num || 99, desc, g: Math.round(g) });
}

const salida = [];
for (const a of alimentos) {
  const m = macros.get(a.fdc_id);
  if (!m) continue;
  const kcal = m[P.KCAL], prot = m[P.PROT], carb = m[P.CARB], gra = m[P.GRASA];
  // Sin las cuatro cifras el registro no sirve para contar macros.
  if ([kcal, prot, carb, gra].some(v => v === undefined || Number.isNaN(v))) continue;

  const por = porciones.get(a.fdc_id);
  salida.push({
    fdc: Number(a.fdc_id),
    en: a.description,
    cat_usda: categorias[a.food_category_id] || '',
    kcal: Math.round(kcal * 10) / 10,
    p: Math.round(prot * 10) / 10,
    c: Math.round(carb * 10) / 10,
    g: Math.round(gra * 10) / 10,
    porcion: por ? por.desc : null,
    porcion_g: por ? por.g : null,
  });
}

salida.sort((a, b) => a.en.localeCompare(b.en));
console.log(JSON.stringify(salida));
console.error(`${salida.length} alimentos con macros completos, de ${alimentos.length}`);

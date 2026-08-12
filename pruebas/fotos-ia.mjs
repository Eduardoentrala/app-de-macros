// La comparación mensual de fotos.
//
// Hasta ahora las fotos NUNCA salían de Supabase: el bucket es privado y
// la app las mira con URLs firmadas. Esto las manda a Anthropic, y eso es
// una cosa distinta de mandar números.
//
// Dos cosas se prueban aquí por encima de todo:
//
//  1. QUE NO SALGAN SIN PERMISO. Fotos de cuerpo de una persona
//     identificable son datos sensibles bajo la ley mexicana, que pide
//     consentimiento expreso. `null` -no se le ha preguntado- no puede
//     valer como sí.
//
//  2. QUE LA PRIMERA LECTURA SEA A CIEGAS. Si el modelo ve el peso antes
//     de mirar las fotos, "ve" en ellas lo que los números le contaron y
//     describe un cambio que no está. Suena coherente, encaja con los
//     datos, y nadie lo detectaría jamás.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RAIZ, 'docs', 'app.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'docs', 'index.html'), 'utf8');
const FN = readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8');
const SQL = readFileSync(join(RAIZ, 'supabase', 'migrations', '0037_analisis_de_fotos.sql'), 'utf8');

let ok = 0, mal = 0;
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  PASA  ${n}`); }
  else { mal++; console.log(`  FALLA ${n}${extra ? '\n        ' + extra : ''}`); }
};

const ACC = FN.slice(FN.indexOf("if (accion === 'fotos')"), FN.indexOf("if (accion === 'plan')"));

console.log('\n— Sin permiso no sale ni una foto —');
{
  check('el servidor exige el permiso', /permiso\?\.fotos_ia_ok !== true/.test(ACC),
    'sin esto, cualquiera con sesion manda sus fotos a Anthropic sin haberlo aceptado');
  // `!== true` y no `=== false`: null es "no se le ha preguntado" y ese es
  // justo el caso que la ley no permite dar por consentido.
  check('«todavia no le pregunte» NO cuenta como si',
    !/fotos_ia_ok === false/.test(ACC) && /!== true/.test(ACC),
    'con === false, un perfil en null pasaria el filtro sin haber consentido');
  check('lo comprueba el SERVIDOR, no el navegador',
    /from\('profiles'\)[\s\S]{0,120}fotos_ia_ok/.test(ACC),
    'fiarse del cliente aqui es fiarse de quien pueda robar un token');
  check('y responde por que se nego', /motivo: 'sin_permiso'/.test(ACC));

  // En la base: null por defecto, nunca true.
  check('la columna nace en NULL', /add column if not exists fotos_ia_ok boolean;/.test(SQL) &&
    !/fotos_ia_ok boolean[^;]*default true/.test(SQL),
    'un default true convertiria a todo el que ya subio fotos en alguien que consintio sin saberlo');
  check('se guarda cuando lo dijo', /fotos_ia_fecha timestamptz/.test(SQL),
    'sin fecha no hay forma de demostrar que se pregunto antes de mandar nada');
}

console.log('\n— El cliente no elige qué fotos —');
{
  // Si la app mandara rutas, un token robado serviria para pedir el
  // analisis de las fotos de otra persona cambiando una cadena de texto.
  check('las rutas salen de la base, filtrando por la sesion',
    /from\('progress_photos'\)[\s\S]{0,200}\.eq\('user_id', userId\)/.test(ACC));
  const envio = APP.slice(APP.indexOf("accion: 'fotos'"), APP.indexOf("accion: 'fotos'") + 700);
  check('la app no manda rutas', !/storage_path|week_key|ruta/.test(envio),
    'la app solo dice «compara las mias»');
  check('ni manda las imagenes', !/base64|imagen|src/.test(envio),
    'las baja el servidor del bucket con su propia clave');
  check('el servidor las baja el mismo',
    /admin\.storage\.from\('progress-photos'\)\.download/.test(ACC));
}

console.log('\n— Series completas, y separadas —');
{
  // Comparar tres angulos contra cuatro produce "cambio la espalda" cuando
  // lo que pasa es que falta la foto de espalda de un mes.
  check('solo cuenta la serie de cuatro poses',
    /POSES\.every\(\(x\) => p\[x\]\)/.test(ACC));
  check('con dos series o mas', /completas\.length < 2/.test(ACC));
  // Dos semanas seguidas no enseñan nada y cuestan lo mismo.
  check('separadas por tres semanas como minimo', />= 3/.test(ACC));
  check('y lo dice en vez de fingir', /estado: 'demasiado_pronto'/.test(ACC));
  // Contra la primera serie es donde de verdad se nota, y es lo que
  // sostiene a alguien en el mes cuatro.
  check('guarda tambien contra la primera serie', /semanaBase/.test(ACC));
  check('una vez al mes y persona', /unique \(user_id, mes\)/.test(SQL));
  check('si ya esta hecho no se vuelve a pagar',
    /if \(yaEsta && cuerpo\.rehacer !== true\)/.test(ACC));
}

console.log('\n— La primera lectura es a ciegas —');
{
  const ver = FN.slice(FN.indexOf('const SISTEMA_FOTOS_VER'), FN.indexOf('const SISTEMA_FOTOS_DECIR'));
  check('existe el sistema de mirar', ver.length > 200);
  check('se le dice que no sabe nada mas', /NO SABES NADA MÁS DE ESTA PERSONA/.test(ver));
  check('y por que', /acabarías viendo en las fotos lo que los números/.test(ver.replace(/\s+/g, ' ')));

  // LO IMPORTANTE: la llamada de mirar NO puede llevar numeros.
  const paso1 = ACC.slice(ACC.indexOf('const verR = await ia.messages.create'),
                          ACC.indexOf('const visto ='));
  check('la llamada de mirar no lleva peso', !/pesos|kg/.test(paso1),
    'con el peso delante, el modelo describe el cambio que los numeros le contaron');
  check('ni cintura', !/cintura/.test(paso1));
  check('ni el objetivo', !/objetivo|bajar|subir/.test(paso1));
  check('solo las fotos y de cuando son', /GRUPO ANTIGUO/.test(paso1) && /GRUPO NUEVO/.test(paso1));
  check('usa el sistema de mirar', /system: SISTEMA_FOTOS_VER/.test(paso1));

  // Y la segunda NO puede llevar las fotos.
  const paso2 = ACC.slice(ACC.indexOf('const decirR = await ia.messages.create'),
                          ACC.indexOf('const mensaje ='));
  check('la segunda llamada ya no manda fotos', !/imgs|type: 'image'/.test(paso2),
    'volver a mandarlas dejaria retocar lo que se vio para que cuadre con los numeros');
  check('lleva lo visto y los numeros', /system: SISTEMA_FOTOS_DECIR \+ numeros/.test(ACC));
  check('el orden es mirar y luego contar',
    ACC.indexOf('SISTEMA_FOTOS_VER') < ACC.indexOf('SISTEMA_FOTOS_DECIR'));
}

console.log('\n— Lo que no puede decir —');
{
  const ver = FN.slice(FN.indexOf('const SISTEMA_FOTOS_VER'), FN.indexOf('const SISTEMA_FOTOS_DECIR'));
  const dec = FN.slice(FN.indexOf('const SISTEMA_FOTOS_DECIR'), FN.indexOf('const SISTEMA_AVISO'));
  const uno = ver.replace(/\s+/g, ' '), dos = dec.replace(/\s+/g, ' ');

  // Un porcentaje de grasa sacado de una foto es inventado, y suena tan
  // preciso que se lo van a creer.
  check('nada de porcentaje de grasa, al mirar', /No des un porcentaje de grasa corporal/.test(uno));
  check('nada de porcentaje de grasa, al contar', /Ni porcentajes de grasa/.test(dos));
  check('ni kilos estimados', /No estimes kilos/.test(uno));
  // Describe cambios, no a la persona.
  check('nada sobre su aspecto', /No hables del aspecto/.test(uno) && /Nada sobre su aspecto/.test(dos));
  check('ni la cara, ni la ropa, ni la piel', /ni la cara, ni la ropa/.test(uno));
  check('nunca consejo medico', /No des consejo médico/.test(uno) && /Nunca consejo médico/.test(dos));
  // Si no ve cambio tiene que decirlo. Decir que si para quedar bien es lo
  // peor que puede hacer: hace que se fien de el para la proxima.
  check('si no ve cambio, lo dice', /SI NO VES CAMBIO, DILO/.test(uno));
  check('y avisa de la trampa de las fotos',
    /la luz, la hora, la distancia, la postura/.test(uno),
    'la luz y la hora cambian lo que se ve mas que cuatro semanas de dieta');
  // El caso que mas se lee mal, y el motivo de que esto exista.
  check('busca la recomposicion', /recomposición/.test(dos));
  // Las calorias se deciden el domingo con la semana entera delante.
  check('no toca las calorias', /No le cambies las calorías/.test(dos));
  check('no se inventa lo que no vio', /NO VISTE LAS FOTOS/.test(dos));
}

console.log('\n— Ni gasta el tope diario ni escribe desde el navegador —');
{
  check('el analisis no gasta consultas del dia',
    /if \(accion !== 'fotos'\) \{/.test(FN),
    'analizar sus fotos no puede dejarle sin poder apuntar la cena');
  check('el cuerpo se lee antes del tope',
    FN.indexOf('const accion = String(cuerpo.accion') < FN.indexOf("if (accion !== 'fotos')"));
  // El analisis lo escribe la funcion con su clave de servicio. Si el
  // navegador pudiera escribirlo, un token robado serviria para inventarle
  // a alguien un analisis de sus fotos.
  check('nadie escribe el analisis desde el navegador',
    /revoke insert, update, delete on public\.analisis_fotos from authenticated/.test(SQL));
  check('y anon no lo toca', /revoke all on public\.analisis_fotos from anon/.test(SQL),
    '«revoke from public» NO alcanza a anon en Supabase');
  check('solo se puede leer lo propio', /for select using \( public\.puede_ver\(user_id\) \)/.test(SQL));
  // Se guarda el TEXTO, nunca las imagenes.
  // Sin los comentarios: ahi dentro se HABLA de imagenes justo para decir
  // que no se guardan, y buscar la palabra a secas daba un falso rojo.
  const sinComentar = SQL.replace(/--[^\n]*/g, '');
  check('se guarda texto, no imagenes',
    /visto\s+text/.test(sinComentar) && /mensaje\s+text not null/.test(sinComentar) &&
    !/bytea|base64|imagen/i.test(sinComentar),
    'guardar cualquier cosa derivada de las fotos multiplica el daño de una fuga');
}

console.log('\n— El permiso se pide bien y se puede retirar —');
{
  check('hay pantalla de permiso', /id="permisoFotos"/.test(HTML));
  const hoja = HTML.slice(HTML.indexOf('id="permisoFotos"'), HTML.indexOf('id="permisoFotos"') + 2200);
  check('dice que se manda a Anthropic', /se mandan a Anthropic/.test(hoja));
  check('dice que solo se guarda el texto', /Se guarda solo el <b>texto<\/b>/.test(hoja));
  check('dice que no entrenan modelos', /No se usan para entrenar/.test(hoja));
  check('y que decir que no no quita nada',
    /tus fotos se siguen subiendo y viendo igual/.test(hoja),
    'un «no» que quita funciones no es un no de verdad');
  check('se puede decir que no', /id="permisoFotosNo"/.test(HTML));
  // Sin × ni cerrar tocando fuera: no contestar no puede quedarse como un
  // sí a medias.
  check('no se puede escapar sin contestar',
    !/permisoFotos'\)\.addEventListener\('click'/.test(APP),
    'cerrar sin contestar dejaria el permiso en un limbo');

  // Se pregunta cuando ya tiene dos series, no al registrarse: en el
  // registro no significa nada todavia.
  check('se pregunta cuando ya hay dos series',
    /if\(series\.length < 2\) return;\s*\r?\n\s*if\(PERMISO_FOTOS === null\)\{ pedirPermisoFotos\(\); return; \}/.test(APP));
  check('null no dispara el analisis', /if\(PERMISO_FOTOS !== true\) return;/.test(APP));

  // Poder retirarlo no es un adorno: un si que no se puede retirar no es un
  // permiso.
  check('se puede quitar desde el Perfil', /id="profFotosIaBtn"/.test(HTML));
  check('quitarlo es inmediato y sin trabas',
    /if\(PERMISO_FOTOS === true\)\{\s*\r?\n\s*guardarPermisoFotos\(false\);/.test(APP),
    'poner trabas para retirarlo es la forma educada de no dejar retirarlo');
  // Si el guardado falla, NO se da por bueno.
  check('un si que no se guardo no vale',
    /PERMISO_FOTOS = null;\s*\r?\n\s*toast\('toastFotos'/.test(APP),
    'mandar fotos con un permiso que no consta en la base es peor que no mandarlas');
}

console.log('\n— Y no se enciende antes que el servidor —');
{
  // Si esto corriera con la funcion vieja arriba, decir que si al permiso
  // llamaria a una accion que el servidor no conoce: una consulta de IA
  // gastada por cada apertura, y nada a cambio. Pedir permiso para algo que
  // todavia no funciona es peor que no pedirlo.
  check('hay un interruptor', /var FOTOS_IA_LISTO = /.test(APP));
  check('y lo primero que se mira es ese',
    /function revisarAnalisisDeFotos\(\)\{\s*\r?\n\s*if\(!FOTOS_IA_LISTO\) return;/.test(APP),
    'antes que la sesion y antes que el nivel: si no esta listo, no se toca nada');
  // Lo ya guardado si se enseña: no depende del servidor.
  check('lo ya guardado se sigue enseñando',
    !/FOTOS_IA_LISTO/.test(APP.slice(APP.indexOf('function cargarAnalisis('),
                                     APP.indexOf('function cargarAnalisis(') + 600)));
}

console.log('\n— Y se ve —');
{
  check('hay sitio para el analisis', /id="analisisCard"/.test(HTML));
  check('nace oculto', /id="analisisCard" hidden/.test(HTML));
  check('se pinta lo guardado, sin gastar IA',
    /analisis_fotos\?select=mes,mensaje/.test(APP));
  check('dice que dos semanas compara', /Comparando ' \+ ANALISIS\.semana_vieja/.test(APP));
  check('una vez al mes', /localStorage\.getItem\(CLAVE_ANALISIS\) === mes/.test(APP));

  // LA MARCA DEL MES SE PONE CUANDO EL SERVIDOR CONTESTA, NO ANTES.
  //
  // Ponerla antes parece lo prudente y es el error: si la llamada no llega
  // -sin red, la funcion caida, o desplegada mas tarde que la app- el mes
  // queda marcado como hecho y esa persona se queda sin su comparacion
  // hasta el mes siguiente sin enterarse de nada.
  check('la marca del mes va DESPUES de contestar',
    APP.indexOf("accion: 'fotos'") < APP.indexOf('localStorage.setItem(CLAVE_ANALISIS, mes)'),
    'marcarla antes deja sin comparacion todo el mes si la llamada no llega');
  // Y para no repetirlo en bucle basta una marca de sesion, que muere al
  // cerrar la app: un intento por apertura.
  check('pero no se repite en bucle dentro de una sesion',
    /if\(ANALISIS_INTENTADO\) return;\s*\r?\n\s*ANALISIS_INTENTADO = true;/.test(APP));
  check('un fallo no interrumpe a nadie',
    /\['catch'\]\(function\(\)\{[\s\S]{0,260}en silencio/i.test(APP),
    'nadie pidio esto: no puede saltarle un error a quien entro a apuntar la comida');
  check('y un fallo no marca el mes',
    /NO se marca el mes/.test(APP));
}

console.log(`\n${ok} pasan · ${mal} fallan`);
process.exit(mal ? 1 : 0);

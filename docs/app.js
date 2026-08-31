// Mockup de diseño — Fase −1. Datos de ejemplo; solo se recuerda la cuenta registrada.
(function(){
  var views = Array.from(document.querySelectorAll('.app-view'));
  var stack = ['registro'];

  function show(id){
    // SALIR DE PERFIL SIN ACEPTAR DESHACE LO TECLEADO.
    //
    //  `actualizarMetas()` corre en cada tecla y escribe DIRECTO en el
    //  anillo del Diario y en las metas de hoy. Eso esta bien mientras se
    //  esta en la tarjeta -es lo que enseña a donde se esta llegando- pero
    //  si se sale sin pulsar «Aceptar», el resto de la app se quedaria
    //  enseñando unas metas que no estan guardadas en ningun sitio.
    //
    //  Antes no hacia falta: el aviso saltaba al salir de cada campo, asi
    //  que nunca habia nada pendiente mas de un segundo. Al mover el aviso
    //  a un boton, esto se convirtio en un cabo suelto.
    if(typeof revertirMetasSinGuardar === 'function' && id !== 'perfil') {
      revertirMetasSinGuardar();
    }
    views.forEach(function(v){ v.classList.toggle('active', v.dataset.view === id); });
    // Al mostrarse la pantalla ya se puede medir el ancho: revisar las flechas
    if(typeof refrescarFlechas === 'function') setTimeout(refrescarFlechas, 0);
  }
  var libView = document.querySelector('[data-view="library"]');
  // Anima la pantalla que acaba de aparecer. 'der' = entra desde la derecha
  // (se avanza), 'izq' = entra desde la izquierda (se vuelve). Sin dirección
  // no se anima: es lo que se quiere al arrancar la app o al cambiar de
  // pestaña, donde un deslizamiento no significaría nada.
  function animarVista(dir){
    if(!dir) return;
    var v = document.querySelector('.app-view.active');
    if(!v) return;
    v.classList.remove('vista-entra', 'desde-izq');
    void v.offsetWidth;                 // fuerza reflujo: si no, no se relanza
    v.classList.add('vista-entra');
    if(dir === 'izq') v.classList.add('desde-izq');
  }

  // ---- Que la interfaz no se quede desfasada ----
  // En iOS, enfocar un campo desplaza la VENTANA para hacerle sitio al
  // teclado. Con la carcasa en `position:fixed` ya no puede pasar, pero
  // esto es el cinturón: si algo lo consigue igual —un `scrollIntoView`,
  // un autofocus—, la ventana vuelve a su sitio en cuanto se suelta.
  function enderezarVentana(){
    if(window.scrollY || window.scrollX) window.scrollTo(0, 0);
  }
  ['focusout', 'orientationchange'].forEach(function(ev){
    window.addEventListener(ev, function(){ setTimeout(enderezarVentana, 50); });
  });
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) setTimeout(enderezarVentana, 50);
  });

  function arribaDelTodo(id){
    var v = document.querySelector('[data-view="' + id + '"]');
    if(!v) return;
    Array.from(v.querySelectorAll('.scroll')).forEach(function(s){ s.scrollTop = 0; });
  }

  function goto(id, push){
    if(push){ stack.push(id); } else { stack = [id]; }
    // La librería siempre se abre apilada, con su botón de regresar: ya no
    // existe como pestaña de la barra de abajo, solo se llega desde
    // "+ agregar ejercicio" dentro de Mi Rutina.
    if(id === 'library') renderBottom();
    show(id);
    // Entrar a una pantalla nueva empieza arriba. Al VOLVER no se toca: la
    // posición donde estabas es justo lo que se espera encontrar.
    if(push) arribaDelTodo(id);
    animarVista(push ? 'der' : null);   // solo al entrar en una subpantalla

    // Los paneles traen sus datos al abrirse, no al arrancar la app
    if(id === 'admin' && typeof cargarPanelAdmin === 'function') cargarPanelAdmin();
    if(id === 'panel' && typeof cargarPanelCoach === 'function') cargarPanelCoach();
    if(id === 'plan'  && typeof cargarPlan       === 'function') cargarPlan();
    if(id === 'missemanas' && typeof cargarMisSemanas === 'function') cargarMisSemanas();
  }
  function back(){
    if(stack.length > 1){ stack.pop(); }
    show(stack[stack.length-1]);
    animarVista('izq');
  }
  // Vuelve a una pantalla que ya está en la pila, conservando el camino de regreso.
  // (Antes se usaba goto(id,false), que borraba la pila y dejaba "Regresar" sin destino.)
  function volverA(id, base){
    var i = stack.lastIndexOf(id);
    if(i >= 0){ stack.length = i + 1; }
    else { stack = (base ? [base, id] : [id]); }
    show(stack[stack.length-1]);
    animarVista('izq');                 // también es un regreso
  }

  // ---- Volver arrastrando desde el borde izquierdo ----
  // El gesto de toda la vida en un teléfono: se empieza pegado al borde y
  // se tira hacia la derecha. Hasta ahora solo se podía con el botón
  // "Regresar", que obliga a estirar el pulgar hasta arriba del todo.
  (function volverArrastrando(){
    var pantalla = document.getElementById('phoneScreen');
    if(!pantalla) return;
    var x0 = 0, y0 = 0, desdeBorde = false;

    pantalla.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1){ desdeBorde = false; return; }
      var t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY;
      // Solo cuenta si arranca pegado al borde. Sin esta condición,
      // cualquier arrastre hacia la derecha en mitad de la pantalla
      // retrocedería, y sería imposible usar los deslizadores.
      desdeBorde = (x0 - pantalla.getBoundingClientRect().left) <= 28;
    }, {passive:true});

    pantalla.addEventListener('touchend', function(e){
      if(!desdeBorde) return;
      desdeBorde = false;
      if(stack.length <= 1) return;                     // no hay a dónde volver
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;
      if(dx < 70) return;                               // recorrido suficiente
      if(Math.abs(dy) > Math.abs(dx) * 0.7) return;     // y claramente horizontal
      back();
    }, {passive:true});
  })();

  document.getElementById('phoneScreen').addEventListener('click', function(e){
    var push = e.target.closest('[data-push]');
    if(push){
      if(push.dataset.meal){ comidaActual = push.dataset.meal; pintarComida(); }
      // Entrar a apuntar SIEMPRE empieza en hoy. Un selector que recuerda el
      // día anterior acaba metiendo la cena de hoy en el martes pasado, y
      // nadie revisa una fecha que ya estaba puesta.
      if(push.dataset.push === 'mealadd') volverAHoyElApunte();
      goto(push.dataset.push, true);
      return;
    }
    var backBtn = e.target.closest('[data-back]');
    if(backBtn){
      volverAHoyElApunte();
      back(); return;
    }
    var tabbar = e.target.closest('[data-tabbar]');
    if(tabbar){
      var destino = tabbar.dataset.tabbar;
      volverAHoyElApunte();       // la barra también es salir de apuntar
      // Peso y Fotos conservan su cabecera con "Regresar", así que se abren
      // con el Diario debajo en la pila: al regresar se vuelve ahí. Si se
      // abrieran como raíz, ese botón no tendría a dónde ir y parecería roto.
      // Diario y Perfil sí son raíz: no se llega a ellos desde ningún sitio.
      if(destino === 'peso' || destino === 'fotos') volverA(destino, 'diario');
      else goto(destino, false);
      return;
    }
  });

  // Diario Hoy/Semana toggle
  var tabHoy = document.querySelector('.tab-hoy');
  var tabSemana = document.querySelector('.tab-semana');
  var paneHoy = document.getElementById('pane-hoy');
  var paneSemana = document.getElementById('pane-semana');
  // Reinicia la animación aunque se repita el gesto muy rápido: sin forzar
  // un reflujo entre quitar y poner la clase, el navegador no vuelve a
  // lanzarla y el segundo deslizamiento saldría seco.
  function animarEntrada(pane, desdeIzquierda){
    pane.classList.remove('pane-entra', 'desde-izq');
    void pane.offsetWidth;
    pane.classList.add('pane-entra');
    if(desdeIzquierda) pane.classList.add('desde-izq');
  }

  function mostrarHoy(animar){
    tabHoy.classList.add('active'); tabSemana.classList.remove('active');
    paneHoy.style.display=''; paneSemana.style.display='none';
    // Se retrocede: el panel entra por la izquierda, siguiendo al dedo
    if(animar) animarEntrada(paneHoy, true);
  }
  function mostrarSemana(animar){
    tabSemana.classList.add('active'); tabHoy.classList.remove('active');
    paneSemana.style.display=''; paneHoy.style.display='none';
    // Se avanza: entra por la derecha
    if(animar) animarEntrada(paneSemana, false);
  }
  tabHoy.addEventListener('click',    function(){ mostrarHoy(true); });
  tabSemana.addEventListener('click', function(){ mostrarSemana(true); });

  // Deslizar sobre el anillo cambia de Hoy a Semana y de vuelta. Los dos
  // puntitos bajo el anillo ya insinuaban que había dos páginas; ahora se
  // pueden pasar con el dedo, además de con las pestañas de arriba.
  function deslizar(anillo, haciaIzquierda, haciaDerecha){
    if(!anillo) return;
    var x0 = 0, y0 = 0, activo = false;

    anillo.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1) return;      // dos dedos = zoom, no es lo nuestro
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      // Si arranca pegado al borde izquierdo manda el gesto de volver, que
      // se escucha en toda la pantalla. La tarjeta empieza a 16px, así que
      // sin esto los dos gestos se solaparían en esa franja.
      var pantalla = document.getElementById('phoneScreen');
      var borde = pantalla ? pantalla.getBoundingClientRect().left : 0;
      activo = (x0 - borde) > 30;
    }, {passive:true});

    anillo.addEventListener('touchend', function(e){
      if(!activo) return;
      activo = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;

      // Dos filtros, y los dos hacen falta:
      //  - recorrido mínimo, para que un toque no cuente como deslizamiento
      //  - claramente más horizontal que vertical, o desplazar la pantalla
      //    hacia abajo cambiaría de pestaña sin querer
      if(Math.abs(dx) < 45) return;
      if(Math.abs(dx) < Math.abs(dy) * 1.5) return;

      if(dx < 0) haciaIzquierda(); else haciaDerecha();
    }, {passive:true});
  }

  // Deslizar el anillo cambia entre CONSUMIDAS y RESTANTES, no entre día y
  // semana: para eso ya están las dos pestañas de arriba, y lo que uno mira
  // veinte veces al día es cuánto le queda. Los dos anillos comparten modo
  // para que nunca digan cosas distintas.
  var vistaAnillo = 'consumidas';

  function cambiarVistaAnillo(cual){
    if(cual === vistaAnillo) return;
    vistaAnillo = cual;
    var restando = cual === 'restantes';
    ['ringDots','ringDotsSem'].forEach(function(id){
      var p = document.getElementById(id).children;
      p[0].classList.toggle('on', !restando);
      p[1].classList.toggle('on',  restando);
    });
    // Las cifras, las barras y los rótulos los recalcula quien ya sabe
    // hacerlo: el rótulo también depende de si se ha pasado, no solo del modo.
    actualizarMetas();
  }

  ['cardHoy','cardSemana','ringDots','ringDotsSem'].forEach(function(id){
    var el = document.getElementById(id);
    deslizar(el, function(){ cambiarVistaAnillo('restantes'); },
                 function(){ cambiarVistaAnillo('consumidas'); });
    // Los puntos también se pueden tocar: en un teléfono no siempre se
    // adivina que la tarjeta se desliza.
    if(id.indexOf('Dots') > 0) el.addEventListener('click', function(e){
      var i = Array.prototype.indexOf.call(this.children, e.target);
      if(i >= 0) cambiarVistaAnillo(i === 0 ? 'consumidas' : 'restantes');
    });
  });

  // ---- Días de rutina: seleccionar, renombrar, agregar, quitar ----
  // Los días son plantillas con nombre libre (Push, Pierna, Lunes...), no fechas.
  var dayTabs = document.getElementById('dayTabs');
  var addDayBtn = document.getElementById('addDayBtn');
  var nameSheet = document.getElementById('nameSheet');
  var dayNameInput = document.getElementById('dayNameInput');
  var nameSheetTitle = document.getElementById('nameSheetTitle');
  var pendingNewTab = null; // tab recién creada, se borra si cancelas

  function activeTab(){ return dayTabs.querySelector('.day-tab.active'); }

  // Cada día guarda sus propios ejercicios. Un día nuevo abre vacío.
  var dayContent = {};
  var daySeq = 100;
  var emptyDay = document.getElementById('emptyDay');
  var emptyDayName = document.getElementById('emptyDayName');

  function syncEmptyState(){
    var vacio = exList.querySelectorAll('.exercise-card').length === 0;
    emptyDay.style.display = vacio ? '' : 'none';
    var t = activeTab();
    if(vacio && t) emptyDayName.textContent = t.textContent.trim();
  }
  function saveCurrentDay(){
    var t = activeTab();
    if(t) dayContent[t.dataset.day] = exList.innerHTML;
    // Se vuelca YA, sin esperar al retardo: en cuanto se cambie de día la
    // pantalla tendrá otro contenido y ya no se podría leer el anterior.
    if(typeof volcarRutina === 'function') volcarRutina();
  }
  function loadDay(tab){
    exList.innerHTML = dayContent[tab.dataset.day] || '';
    // Repone la referencia: cambiar de día rehace las tarjetas desde cero.
    if(typeof ponerReferencias === 'function') ponerReferencias(); else recalcAll();
    syncEmptyState();
    if(typeof marcarTodasLasNotas === 'function') marcarTodasLasNotas();
  }

  function openNameSheet(opts){
    opts = opts || {};
    nameSheetTitle.textContent = opts.title || 'Nombre del día';
    dayNameInput.value = opts.value || '';
    nameSheet.classList.add('open');
    setTimeout(function(){ dayNameInput.focus(); dayNameInput.select(); }, 60);
  }
  function closeNameSheet(){
    nameSheet.classList.remove('open');
    // Si cancelaste al crear un día nuevo, se descarta
    if(pendingNewTab){
      var prev = pendingNewTab.previousElementSibling;
      delete dayContent[pendingNewTab.dataset.day];
      pendingNewTab.remove();
      pendingNewTab = null;
      var rest = Array.from(dayTabs.querySelectorAll('.day-tab:not(.add)'));
      if(rest.length && !dayTabs.querySelector('.day-tab.active')){
        var back = (prev && prev.classList.contains('day-tab') && !prev.classList.contains('add'))
          ? prev : rest[rest.length-1];
        back.classList.add('active');
        loadDay(back);
      }
    }
  }

  dayTabs.addEventListener('click', function(e){
    var t = e.target.closest('.day-tab');
    if(!t || t.classList.contains('add')) return;
    // Tocar el día que ya está activo lo renombra
    if(t.classList.contains('active')){
      openNameSheet({title:'Renombrar día', value:t.textContent.trim()});
      return;
    }
    saveCurrentDay();
    Array.from(dayTabs.querySelectorAll('.day-tab')).forEach(function(x){ x.classList.remove('active'); });
    t.classList.add('active');
    loadDay(t);
  });

  document.getElementById('renameDayBtn').addEventListener('click', function(){
    var t = activeTab();
    if(!t) return;
    openNameSheet({title:'Renombrar día', value:t.textContent.trim()});
  });

  addDayBtn.addEventListener('click', function(){
    saveCurrentDay();
    var t = document.createElement('button');
    t.className = 'day-tab';
    t.dataset.day = 'd' + (++daySeq);
    t.textContent = 'Día ' + (dayTabs.querySelectorAll('.day-tab:not(.add)').length + 1);
    dayTabs.insertBefore(t, addDayBtn);
    Array.from(dayTabs.querySelectorAll('.day-tab')).forEach(function(x){ x.classList.remove('active'); });
    t.classList.add('active');
    t.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
    setTimeout(refrescarFlechas, 320);
    loadDay(t); // día nuevo = vacío
    pendingNewTab = t;
    openNameSheet({title:'Nombre del día nuevo', value:''});
  });

  document.getElementById('nameSave').addEventListener('click', function(){
    var val = dayNameInput.value.trim();
    if(!val){ dayNameInput.focus(); return; }
    var t = activeTab();
    if(t) t.textContent = val;
    pendingNewTab = null;            // se confirma, ya no se descarta
    nameSheet.classList.remove('open');
    syncEmptyState();
    toast('toastRutina', 'Día: ' + val);
    // Crear o renombrar un día no pasa por la lista de ejercicios, así que
    // hay que pedir el guardado a mano.
    if(t && typeof guardarDia === 'function'){
      guardarDia(t)['catch'](function(e){
        // Ya se enseñó "Día: X" arriba. Sin esto, el nombre vive solo en la
        // pantalla y al recargar vuelve el viejo sin que nadie sepa por qué.
        toast('toastRutina', 'No se pudo guardar el día: ' + traducirError(e.message));
      });
    }
  });
  dayNameInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter') document.getElementById('nameSave').click();
  });
  nameSheet.addEventListener('click', function(e){
    if(e.target === nameSheet) closeNameSheet();
  });

  document.getElementById('deleteDayBtn').addEventListener('click', function(){
    var tabs = Array.from(dayTabs.querySelectorAll('.day-tab:not(.add)'));
    if(tabs.length <= 1){ toast('toastRutina', 'Debe quedar al menos un día'); return; }
    var active = activeTab();
    if(!active) return;
    var i = tabs.indexOf(active);
    var idBorrado = active.dataset.id;
    delete dayContent[active.dataset.day];
    active.remove();
    var rest = Array.from(dayTabs.querySelectorAll('.day-tab:not(.add)'));
    var next = rest[i] || rest[rest.length-1];
    next.classList.add('active');
    loadDay(next);
    toast('toastRutina', 'Día borrado');

    // En la base esto no borra: la 0007 lo archiva, con sus ejercicios y
    // series. Se puede recuperar si hiciera falta.
    if(idBorrado && sesion){
      sbFetch('/rest/v1/routine_days?id=eq.' + idBorrado, { method:'DELETE' })
        ['catch'](function(e){ toast('toastRutina', 'No se pudo borrar: ' + traducirError(e.message)); });
    }
  });

  // ---- Volumen y carga progresiva (se calcula solo) ----
  // Volumen = suma de reps x peso de cada serie. El % solo aparece si HAY sesión
  // anterior de ese mismo ejercicio; si subiste sale verde, si bajaste sale rojo.
  var exList = document.getElementById('exerciseList');

  // ---- Cuánto trabajo cuenta una serie ----
  //
  // `reps × peso` deja en CERO todo lo que se hace con el peso del cuerpo.
  // Diez dominadas al fallo valían lo mismo que no haber ido al gimnasio, y
  // además hundía la base contra la que se compara: con el volumen cerca de
  // cero, cualquier cambio se convierte en un porcentaje absurdo. De ahí
  // salía un "+157%" donde la app de referencia enseñaba "+25%".
  //
  // Sin peso, cada repetición cuenta 1. Es lo que hace la app en la que nos
  // fijamos: para las mismas series -10 sin lastre y tres de 6×5- ellos
  // enseñan 100 y esto daba 90; la diferencia son justo esas 10 reps.
  //
  // Sí, mezcla unidades: suma repeticiones con kilos. Y da igual, porque
  // este número no se compara con el de nadie más — solo consigo mismo, de
  // una semana a la siguiente.
  function volumenDeSerie(reps, peso){
    return peso > 0 ? reps * peso : reps;
  }

  function recalcCard(card){
    var vol = 0;
    Array.from(card.querySelectorAll('.sets-table tr')).forEach(function(tr){
      var inputs = tr.querySelectorAll('.set-input');
      if(inputs.length < 2) return;
      var reps = parseFloat(inputs[0].value) || 0;
      var peso = parseFloat(inputs[1].value) || 0;
      vol += volumenDeSerie(reps, peso);
    });

    var volNum = card.querySelector('.vol-num');
    if(volNum) volNum.textContent = vol.toLocaleString('es-MX');

    var badge = card.querySelector('.ex-delta');
    var prevEl = card.querySelector('.ex-vol .prev');
    var raw = card.getAttribute('data-prev-vol');
    var prev = raw === null ? null : parseFloat(raw);

    // Sin sesión anterior -> no se muestra nada
    if(prev === null || !isFinite(prev) || prev <= 0){
      if(badge){ badge.className = 'ex-delta'; badge.textContent = ''; }
      if(prevEl) prevEl.textContent = '';
      return;
    }

    if(prevEl) prevEl.textContent = 'antes ' + prev.toLocaleString('es-MX');
    if(!badge) return;

    // ---- El porcentaje, en vivo y solo mientras entrenas ----
    //
    // Sale cuando tocas algo y desaparece al guardar la sesión. Las tres
    // situaciones, que son distintas:
    //
    //   Abres la rutina        → nada. Las series vienen con los números de
    //                            la última vez, así que el porcentaje sería
    //                            "igual al anterior" antes de haber hecho
    //                            nada: ruido.
    //   Cambias reps o peso    → el porcentaje, en vivo. Ver el +3% al subir
    //                            una repetición es media razón para subirla.
    //   Guardas la sesión      → se va. Ya está hecha; el número que importa
    //                            es el de la PRÓXIMA vez, contra esta.
    //
    // Por eso manda `data-tocado` y no el volumen: sin él, al reabrir la
    // rutina saldría "igual al anterior" en todas las tarjetas.
    if(!card.hasAttribute('data-tocado')){
      badge.className = 'ex-delta'; badge.textContent = ''; return;
    }

    // Volumen cero es una tarjeta a medio llenar -sin peso todavía-, no un
    // retroceso del 100%. Callarse es más honesto que asustar.
    if(vol <= 0){ badge.className = 'ex-delta'; badge.textContent = ''; return; }

    pintarPorcentaje(badge, Math.round((vol - prev) / prev * 100));
  }

  // Un solo sitio donde se decide cómo se ve el porcentaje. Separado en dos
  // acabaría diciendo "+3%" en un sitio y "3% más" en el otro sin que nadie
  // lo notara.
  function pintarPorcentaje(badge, pct){
    if(!badge) return;
    if(pct === 0){
      badge.className = 'ex-delta show same';
      badge.textContent = 'igual al anterior';
    } else if(pct > 0){
      badge.className = 'ex-delta show up';
      badge.textContent = '+' + pct + '% vs anterior';
    } else {
      badge.className = 'ex-delta show down';
      badge.textContent = pct + '% vs anterior';
    }
  }

  // Aquí vivía `pintarVeredicto`, que enseñaba el porcentaje decidido al
  // guardar. Se quitó: ese número ya no se muestra después de guardar. La
  // sesión ya está hecha, y el porcentaje que importa es el de la PRÓXIMA
  // vez, comparada contra esta.

  function recalcAll(){
    Array.from(exList.querySelectorAll('.exercise-card')).forEach(recalcCard);
  }

  // ---- Contra qué se compara ----
  // `data-prev-vol` es el volumen de la última sesión de ESE ejercicio. Se
  // ponía en un solo sitio: al guardar, sobre el elemento vivo. Y ahí estaba
  // el fallo por el que el porcentaje no aparecía nunca: al cerrar la app la
  // rutina se reconstruye desde la base y ese atributo no se reponía, así
  // que `recalcCard` salía por "no hay sesión anterior" y no enseñaba nada.
  //
  // El dato ya estaba cargado en HISTORIAL, que se llena de
  // `workout_sessions`. Aquí solo se baja a las tarjetas.
  //
  // Va por NOMBRE y no por id de fila: así sobrevive a reordenar la rutina,
  // y si borras un ejercicio y lo vuelves a crear sigue comparando contra lo
  // que levantabas antes, que es lo que la persona espera.
  function ponerReferencias(){
    Array.from(exList.querySelectorAll('.exercise-card')).forEach(function(card){
      var el = card.querySelector('.ex-name');
      if(!el) return;
      var nombre = el.childNodes[0].textContent.trim();
      var hist = HISTORIAL[nombre];
      if(hist && hist.length) card.setAttribute('data-prev-vol', hist[hist.length - 1]);
      else card.removeAttribute('data-prev-vol');
    });
    recalcAll();
  }

  // Tarjeta de un ejercicio recién agregado (escrito a mano o tomado del catálogo).
  // Sin data-prev-vol: no hay sesión anterior, así que no muestra ningún porcentaje.
  function nuevaTarjetaEjercicio(name){
    var card = document.createElement('div');
    card.className = 'exercise-card';
    card.innerHTML = '<div class="ex-head"><div class="ex-top">'+
      '<div><div class="ex-name">'+escapar(name)+' <span class="nota-badge" hidden title="Tiene notas">📝</span></div>'+
      '<div class="nota-previa" hidden title="Toca «notas» para verla entera"></div><div class="ex-delta"></div></div>'+
      '<div class="ex-vol">vol<br><b class="vol-num">0</b><span class="prev"></span></div></div>'+
      '<div class="ex-pills">'+
      '<button class="chip" data-act="grafica">📈 gráfica</button>'+
      '<button class="chip" data-act="notas">notas</button>'+
      '<span class="icon-mini">'+
      '<button data-act="subir" title="Subir ejercicio">▲</button>'+
      '<button data-act="bajar" title="Bajar ejercicio">▼</button>'+
      '<button class="danger" data-act="quitar" title="Quitar ejercicio">×</button></span></div></div>'+
      '<table class="sets-table"><tr><th>set</th><th class="num">reps</th><th class="num">peso</th><th></th></tr>'+
      '<tr><td>1</td><td class="num"><input class="set-input" type="number" inputmode="decimal" step="any" value="10"></td><td class="num"><input class="set-input" type="number" inputmode="decimal" step="any" value="0"></td>'+
      '<td><div class="set-row-actions"><div class="set-check">✓</div><button class="clock-btn">⏰</button><button class="rm-set">×</button></div></td></tr></table>'+
      '<div class="add-set-row"><button class="add-set">+ set</button></div>';
    return card;
  }

  // "+ agregar ejercicio" ofrece las dos opciones: escribirlo o tomarlo del catálogo
  var addExSheet = document.getElementById('addExSheet');
  var exNameInput = document.getElementById('exNameInput');

  document.getElementById('addExerciseBtn').addEventListener('click', function(){
    exNameInput.value = '';
    addExSheet.classList.add('open');
    setTimeout(function(){ exNameInput.focus(); }, 60);
  });
  function cerrarAddEx(){ addExSheet.classList.remove('open'); }
  addExSheet.addEventListener('click', function(e){ if(e.target === addExSheet) cerrarAddEx(); });

  function agregarEjercicioEscrito(){
    var nombre = exNameInput.value.trim();
    if(!nombre){ exNameInput.focus(); return; }
    exList.appendChild(nuevaTarjetaEjercicio(nombre));
    recalcAll();
    syncEmptyState();
    cerrarAddEx();
    toast('toastRutina', nombre + ' agregado');
  }
  document.getElementById('exNameSave').addEventListener('click', agregarEjercicioEscrito);
  exNameInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') agregarEjercicioEscrito(); });

  document.getElementById('exFromLib').addEventListener('click', function(){
    cerrarAddEx();
    goto('library', true);
  });
  exList.addEventListener('input', function(e){
    var card = e.target.closest('.exercise-card');
    if(card && e.target.classList.contains('set-input')){
      // Esto es lo que enciende el porcentaje. Antes de tocar nada no se
      // enseña: las series vienen con los números de la última vez y diría
      // "igual al anterior" sin que la persona haya hecho todavía nada.
      card.setAttribute('data-tocado', '1');
      recalcCard(card);
    }
  });
  recalcAll();
  // Arranque: solo el día activo trae ejercicios de ejemplo; los demás abren vacíos.
  syncEmptyState();

  // Set completion checkboxes
  document.getElementById('exerciseList').addEventListener('click', function(e){
    var chk = e.target.closest('.set-check');
    if(chk){ chk.classList.toggle('done'); return; }
    var clock = e.target.closest('.clock-btn');
    if(clock){
      var card = clock.closest('.exercise-card');
      var row = clock.closest('tr');
      var name = card ? card.querySelector('.ex-name').textContent : 'Ejercicio';
      var setNo = row ? row.querySelector('td').textContent : '';

      // Poner el descanso ES haber terminado la serie: nadie descansa antes
      // de hacerla. Antes había que dar dos toques -la palomita y el reloj-
      // para decir una sola cosa, y el segundo se olvidaba.
      //
      // Se AÑADE la clase, no se alterna como al tocar la palomita: volver a
      // darle al reloj es reiniciar el descanso, no deshacer la serie.
      // Guardarla no hace falta pedirlo: hay un listener de clic en la lista
      // que programa el guardado pase lo que pase.
      var palomita = row ? row.querySelector('.set-check') : null;
      if(palomita) palomita.classList.add('done');

      startRest(restSeconds, 'Descanso · ' + name + ', set ' + setNo);
      return;
    }

    // Agregar serie
    var addSet = e.target.closest('.add-set');
    if(addSet){
      var c = addSet.closest('.exercise-card');
      var table = c.querySelector('.sets-table');
      var last = table.querySelector('tr:last-child');
      var lastInputs = last.querySelectorAll('.set-input');
      var reps = lastInputs.length ? lastInputs[0].value : '10';
      var peso = lastInputs.length > 1 ? lastInputs[1].value : '0';
      var n = table.querySelectorAll('tr').length; // encabezado cuenta como 1
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>'+n+'</td>'+
        '<td class="num"><input class="set-input" type="number" inputmode="decimal" step="any" value="'+reps+'"></td>'+
        '<td class="num"><input class="set-input" type="number" inputmode="decimal" step="any" value="'+peso+'"></td>'+
        '<td><div class="set-row-actions"><div class="set-check">✓</div>'+
        '<button class="clock-btn">⏰</button><button class="rm-set">×</button></div></td>';
      table.appendChild(tr);
      recalcCard(c);
      return;
    }

    // Quitar serie
    var rm = e.target.closest('.rm-set');
    if(rm){
      var c2 = rm.closest('.exercise-card');
      var tbl = c2.querySelector('.sets-table');
      if(tbl.querySelectorAll('tr').length <= 2){ toast('toastRutina', 'Debe quedar al menos una serie'); return; }
      rm.closest('tr').remove();
      Array.from(tbl.querySelectorAll('tr')).forEach(function(tr, i){
        if(i === 0) return;
        tr.querySelector('td').textContent = i;
      });
      recalcCard(c2);
      return;
    }

    // Acciones de la tarjeta: gráfica, notas, subir, bajar, quitar
    var act = e.target.closest('[data-act]');
    if(!act) return;
    var card = act.closest('.exercise-card');
    var nombre = card.querySelector('.ex-name').childNodes[0].textContent.trim();

    if(act.dataset.act === 'quitar'){
      card.remove(); syncEmptyState(); toast('toastRutina', 'Ejercicio quitado'); return;
    }
    if(act.dataset.act === 'subir'){
      var prev = card.previousElementSibling;
      if(prev && prev.classList.contains('exercise-card')) card.parentNode.insertBefore(card, prev);
      else toast('toastRutina', 'Ya es el primero');
      return;
    }
    if(act.dataset.act === 'bajar'){
      var next = card.nextElementSibling;
      if(next && next.classList.contains('exercise-card')) card.parentNode.insertBefore(next, card);
      else toast('toastRutina', 'Ya es el último');
      return;
    }
    if(act.dataset.act === 'notas'){ abrirNotas(card, nombre); return; }
    if(act.dataset.act === 'grafica'){ abrirGrafica(card, nombre); return; }
  });

  // ---- Notas por ejercicio ----
  // Van por NOMBRE de ejercicio, no por la tarjeta: la nota es de "press
  // banca", no de la fila del lunes. Así reaparece al hacerlo otro día, y
  // sigue ahí aunque quites el ejercicio de la rutina y lo vuelvas a poner.
  //
  // Se guardan en la base y no solo aquí. Antes vivían en esta variable y
  // nada más: escribías "banco en el hoyo 3", cerrabas la app y no volvías
  // a verlo. Una nota que no sobrevive a cerrar la app no es una nota.
  //
  // Se borran cuando se pide y no antes: al borrar desaparece de verdad, y
  // no reaparece hasta que se escriba otra.
  var NOTAS = {};
  var cardNotas = null, nombreNotas = '';

  // Traer las de esta persona. El `user_id` va aunque RLS ya lo exija: RLS
  // dice lo que PUEDES ver y un coach ve a sus clientes, así que sin esto
  // se colarían notas ajenas en la rutina propia.
  function cargarNotas(){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/exercise_notes?select=exercise_name,body' +
                   '&user_id=eq.' + sesion.user.id)
      .then(function(filas){
        NOTAS = {};
        (filas || []).forEach(function(f){
          if(f.body && f.body.trim()) NOTAS[f.exercise_name] = f.body;
        });
        marcarTodasLasNotas();
      })['catch'](function(){
        // Sin ruido: quedarse sin notas no debe impedir entrenar. Lo que no
        // se hace es inventarlas: si no llegaron, no hay marca de que las
        // haya, y así nadie cree que su nota se perdió cuando sigue ahí.
      });
  }

  function guardarNota(nombre, texto){
    if(!sesion || !sesion.user) return Promise.resolve();
    // Uno por persona y ejercicio: la tabla tiene unique(user_id,
    // exercise_name), así que esto pisa la nota anterior en vez de dejar
    // dos. Sin `on_conflict` daría error de duplicado a la segunda vez.
    return sbFetch('/rest/v1/exercise_notes?on_conflict=user_id,exercise_name', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: sesion.user.id, exercise_name: nombre, body: texto
      })
    });
  }

  function borrarNota(nombre){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/exercise_notes?user_id=eq.' + sesion.user.id +
                   '&exercise_name=eq.' + encodeURIComponent(nombre), { method: 'DELETE' });
  }

  function marcaNotas(card, nombre){
    var tiene = !!(NOTAS[nombre] && NOTAS[nombre].trim());
    var badge = card.querySelector('.nota-badge');
    var pill = card.querySelector('[data-act="notas"]');
    // Un adelanto de lo escrito debajo del nombre. La marca sola dice que
    // hay algo; esto dice QUÉ, y evita abrir la hoja para acordarte.
    var previa = card.querySelector('.nota-previa');
    if(previa){
      previa.textContent = tiene ? NOTAS[nombre].replace(/\s+/g, ' ').trim() : '';
      previa.hidden = !tiene;
    }
    if(badge) badge.hidden = !tiene;
    if(pill){
      pill.classList.toggle('con-nota', tiene);
      pill.textContent = tiene ? '📝 notas' : 'notas';
    }
  }
  function marcarTodasLasNotas(){
    Array.from(exList.querySelectorAll('.exercise-card')).forEach(function(c){
      marcaNotas(c, c.querySelector('.ex-name').childNodes[0].textContent.trim());
    });
  }
  function abrirNotas(card, nombre){
    cardNotas = card; nombreNotas = nombre;
    document.getElementById('notasTitulo').textContent = 'Notas · ' + nombre;
    document.getElementById('notasTexto').value = NOTAS[nombre] || '';

    // El botón de eliminar solo cuando hay algo que eliminar. En una nota
    // que todavía no existe no borra nada, y ofrecerlo hace dudar de si se
    // escribió algo o no.
    var hayNota = !!(NOTAS[nombre] && NOTAS[nombre].trim());
    document.getElementById('notasBorrar').hidden = !hayNota;
    document.getElementById('notasAviso').hidden = !hayNota;

    document.getElementById('notasSheet').classList.add('open');
    setTimeout(function(){ document.getElementById('notasTexto').focus(); }, 60);
  }
  // Cerrar sin tocar nada. Antes solo se podía tocando fuera de la hoja, que
  // en un teléfono es un blanco pequeño y con el teclado abierto casi no hay.
  document.getElementById('notasCerrar').addEventListener('click', function(){
    document.getElementById('notasSheet').classList.remove('open');
  });
  // Se aplica en pantalla y se manda a la base en segundo plano: la hoja se
  // cierra al momento, que es lo que hace que la app se sienta rápida. Pero
  // si el guardado falla hay que deshacerlo — enseñar como guardada una nota
  // que no está es peor que no guardarla, porque nadie la vuelve a escribir.
  function aplicarNota(nombre, texto, card){
    var antes = NOTAS[nombre];
    if(texto) NOTAS[nombre] = texto; else delete NOTAS[nombre];
    if(card) marcaNotas(card, nombre);
    document.getElementById('notasSheet').classList.remove('open');
    toast('toastRutina', texto ? 'Nota guardada' : 'Nota borrada');

    var p = texto ? guardarNota(nombre, texto) : borrarNota(nombre);
    p['catch'](function(e){
      if(antes === undefined) delete NOTAS[nombre]; else NOTAS[nombre] = antes;
      if(card) marcaNotas(card, nombre);
      toast('toastRutina', 'No se pudo guardar la nota: ' + traducirError(e.message));
    });
  }

  document.getElementById('notasGuardar').addEventListener('click', function(){
    // Guardar con el campo vacío borra: es lo que espera quien acaba de
    // seleccionar todo y darle a suprimir.
    aplicarNota(nombreNotas, document.getElementById('notasTexto').value.trim(), cardNotas);
  });
  document.getElementById('notasBorrar').addEventListener('click', function(){
    document.getElementById('notasTexto').value = '';
    // Se va de la base, no solo de la pantalla: al volver a entrar no
    // reaparece, y no vuelve a haber nota hasta que se escriba otra.
    aplicarNota(nombreNotas, '', cardNotas);
  });
  document.getElementById('notasSheet').addEventListener('click', function(e){
    if(e.target === this) this.classList.remove('open');
  });

  // ================= RUTINA GUARDADA EN LA BASE =================
  // La rutina vive en el DOM: los días son pestañas y el contenido de cada
  // uno se guarda como HTML en dayContent. Para llevarla a la base hay que
  // leer ese DOM y convertirlo en filas de tres tablas encadenadas:
  // routine_days → routine_exercises → exercise_sets.
  //
  // Cada elemento lleva su `data-id` con el uuid de su fila. Eso permite
  // ACTUALIZAR lo que ya existe en vez de borrar todo y volver a insertar:
  // como la 0007 archiva en lugar de borrar, un reemplazo completo en cada
  // guardado dejaría cientos de filas archivadas por rutina.

  function leerEjerciciosDelDOM(){
    return Array.from(exList.querySelectorAll('.exercise-card')).map(function(card, i){
      var series = [];
      Array.from(card.querySelectorAll('.sets-table tr')).forEach(function(tr){
        var ins = tr.querySelectorAll('.set-input');
        if(ins.length < 2) return;                     // la fila de encabezados
        series.push({
          // La fila misma, para poder apuntarle su id cuando vuelva el
          // servidor sin tener que buscarla otra vez por su posición.
          el: tr,
          id: tr.dataset.id || null,
          orden: series.length + 1,
          // ACOTADOS ARRIBA TAMBIÉN. La base exige `between 0 and 1000` en
          // los dos, y los campos de la pantalla no tienen `min` ni `max`:
          // un dedo torpe —o alguien apuntando en libras— manda 1500 y se
          // cae el guardado de TODA la rutina, no solo el de esa serie.
          // Mil kilos y mil repeticiones no le quedan cortos a nadie.
          reps: Math.min(1000, Math.max(0, Number(ins[0].value) || 0)),
          peso: Math.min(1000, Math.max(0, Number(ins[1].value) || 0)),
          hecho: !!tr.querySelector('.set-check.done')
        });
      });
      return {
        el: card,
        id: card.dataset.id || null,
        // childNodes[0] y no textContent: el nombre convive con la insignia
        // de notas dentro del mismo elemento.
        nombre: card.querySelector('.ex-name').childNodes[0].textContent.trim(),
        orden: i,
        series: series
      };
    });
  }

  function htmlSerie(s, n){
    return '<tr' + (s.id ? ' data-id="' + s.id + '"' : '') + '>' +
      '<td>' + n + '</td>' +
      '<td class="num"><input class="set-input" type="number" inputmode="decimal" step="any" value="' + s.reps + '"></td>' +
      '<td class="num"><input class="set-input" type="number" inputmode="decimal" step="any" value="' + s.peso + '"></td>' +
      '<td><div class="set-row-actions"><div class="set-check' + (s.hecho ? ' done' : '') + '">✓</div>' +
      '<button class="clock-btn">⏰</button><button class="rm-set">×</button></div></td></tr>';
  }

  function htmlEjercicio(ej){
    var filas = ej.series.length
      ? ej.series.map(function(s, i){ return htmlSerie(s, i + 1); }).join('')
      : htmlSerie({reps:10, peso:0, hecho:false}, 1);
    return '<div class="exercise-card" data-id="' + ej.id + '">' +
      '<div class="ex-head"><div class="ex-top">' +
      '<div><div class="ex-name">' + escapar(ej.nombre) +
        ' <span class="nota-badge" hidden title="Tiene notas">📝</span></div>' +
        '<div class="nota-previa" hidden title="Toca «notas» para verla entera"></div><div class="ex-delta"></div></div>' +
      '<div class="ex-vol">vol<br><b class="vol-num">0</b><span class="prev"></span></div></div>' +
      '<div class="ex-pills">' +
      '<button class="chip" data-act="grafica">📈 gráfica</button>' +
      '<button class="chip" data-act="notas">notas</button>' +
      '<span class="icon-mini">' +
      '<button data-act="subir" title="Subir ejercicio">▲</button>' +
      '<button data-act="bajar" title="Bajar ejercicio">▼</button>' +
      '<button class="danger" data-act="quitar" title="Quitar ejercicio">×</button></span></div></div>' +
      '<table class="sets-table"><tr><th>set</th><th class="num">reps</th><th class="num">peso</th><th></th></tr>' +
      filas + '</table>' +
      '<div class="add-set-row"><button class="add-set">+ set</button></div></div>';
  }

  // ---- Guardar un día completo ----
  // Se lee lo que hay en la base para ese día y se compara con el DOM: lo
  // nuevo se inserta, lo que cambió se actualiza y lo que desapareció se
  // borra (que en estas tablas significa archivar).
  // UN GUARDADO CADA VEZ, Y EN FILA.
  //
  // El retardo de 900 ms evita mandar una petición por tecla, pero no que dos
  // guardados se SOLAPEN: con la red lenta el anterior sigue en el aire
  // cuando sale el siguiente. Y el id del día no existe hasta que vuelve el
  // POST, así que los dos leían `tab.dataset.id` vacío, los dos se creían el
  // primero, y se insertaban DOS filas: el día repetido en la rutina. Igual
  // con cada ejercicio y cada serie nuevos.
  //
  // No hace falta mala fe para provocarlo: crear un día, ponerle nombre -eso
  // guarda por su cuenta, saltándose el retardo- y tocar algo antes de que
  // conteste el servidor. Por eso el turno se pide AQUÍ y no en el retardo:
  // hay dos puertas, y vigilar una sola no sirve de nada.
  var colaRutina = Promise.resolve();

  function guardarDia(tab){
    if(!sesion || !sesion.user || !tab) return Promise.resolve();

    // La pantalla se lee AHORA, no cuando le toque el turno. Para entonces
    // puede estar enseñando otro día -se cambió de pestaña mientras subía- y
    // se guardarían los ejercicios de ese otro día con el id de este.
    var foto = {
      nombre: tab.textContent.trim(),
      orden: Array.from(dayTabs.querySelectorAll('.day-tab:not(.add)')).indexOf(tab),
      ejercicios: leerEjerciciosDelDOM()
    };

    var mio = colaRutina.then(function(){ return volcarDia(tab, foto); },
                              function(){ return volcarDia(tab, foto); });
    // Este catch CALLA A PROPÓSITO y no se pierde nada con ello: el error va
    // por `mio`, que es lo que se devuelve a quien pidió el guardado y quien
    // enseña el aviso. Esta copia perdonada existe solo para que la fila siga
    // corriendo; encadenar el rechazo dejaría una promesa sin recoger y el
    // siguiente guardado heredaría el fallo del anterior.
    colaRutina = mio['catch'](function(){});
    return mio;
  }

  // El id de la fila que acaba de devolver el servidor. Sin esto, una
  // respuesta vacía daba un TypeError a media escritura y el guardado se
  // quedaba a mitad sin decir por qué.
  function idDevuelto(r){
    if(!r || !r[0] || !r[0].id) throw new Error('El servidor no devolvió lo que guardó');
    return r[0].id;
  }

  function volcarDia(tab, foto){
    var nombre = foto.nombre, orden = foto.orden, ejercicios = foto.ejercicios;

    // LOS VALORES SON DE LA FOTO; EL ID, EL DE AHORA.
    //
    // Entre pedir el turno y recibirlo, el guardado de delante pudo haber
    // creado ya este ejercicio y haberle apuntado su id en la tarjeta. Si se
    // hiciera caso al id de la foto -vacío, porque entonces no existía- se
    // insertaría otra vez: el ejercicio duplicado, que es el mismo fallo del
    // día pero un piso más abajo.
    ejercicios.forEach(function(ej){
      if(ej.el && ej.el.dataset.id) ej.id = ej.el.dataset.id;
      ej.series.forEach(function(se){
        if(se.el && se.el.dataset.id) se.id = se.el.dataset.id;
      });
    });

    var pDia = tab.dataset.id
      ? sbFetch('/rest/v1/routine_days?id=eq.' + tab.dataset.id, {
          method:'PATCH', headers:{ 'Prefer':'return=minimal' },
          body: JSON.stringify({ name: nombre, sort_order: orden })
        }).then(function(){ return tab.dataset.id; })
      : sbFetch('/rest/v1/routine_days', {
          method:'POST', headers:{ 'Prefer':'return=representation' },
          body: JSON.stringify({ user_id: sesion.user.id, name: nombre, sort_order: orden })
        }).then(function(r){ tab.dataset.id = idDevuelto(r); return tab.dataset.id; });

    return pDia.then(function(diaId){
      // Lo que la base cree que hay ahora mismo en este día
      return sbFetch('/rest/v1/routine_exercises?select=id&routine_day_id=eq.' + diaId)
        .then(function(previos){
          var vivos = {};
          ejercicios.forEach(function(ej){ if(ej.id) vivos[ej.id] = true; });

          // Los que ya no están en pantalla: fuera (se archivan)
          var borrados = (previos || [])
            .filter(function(p){ return !vivos[p.id]; })
            .map(function(p){
              return sbFetch('/rest/v1/routine_exercises?id=eq.' + p.id, { method:'DELETE' });
            });

          // Y los que están, en orden
          var guardados = ejercicios.map(function(ej){
            return guardarEjercicio(diaId, ej);
          });

          return Promise.all(borrados.concat(guardados));
        });
    });
  }

  function guardarEjercicio(diaId, ej){
    var cuerpo = {
      user_id: sesion.user.id, routine_day_id: diaId,
      name: ej.nombre, sort_order: ej.orden
    };
    var p = ej.id
      ? sbFetch('/rest/v1/routine_exercises?id=eq.' + ej.id, {
          method:'PATCH', headers:{ 'Prefer':'return=minimal' }, body: JSON.stringify(cuerpo)
        }).then(function(){ return ej.id; })
      : sbFetch('/rest/v1/routine_exercises', {
          method:'POST', headers:{ 'Prefer':'return=representation' }, body: JSON.stringify(cuerpo)
        }).then(function(r){
          var id = idDevuelto(r);
          // Se apunta en LA MISMA tarjeta que se leyó, no en la que ocupe
          // ahora esa posición: entre que salió la petición y volvió, la
          // lista puede haber cambiado de orden o de día, y el id acabaría
          // en el ejercicio de otro.
          if(ej.el) ej.el.dataset.id = id;
          return id;
        });

    return p.then(function(ejId){
      return sbFetch('/rest/v1/exercise_sets?select=id&routine_exercise_id=eq.' + ejId)
        .then(function(previas){
          var vivas = {};
          ej.series.forEach(function(s){ if(s.id) vivas[s.id] = true; });

          var borradas = (previas || [])
            .filter(function(p){ return !vivas[p.id]; })
            .map(function(p){
              return sbFetch('/rest/v1/exercise_sets?id=eq.' + p.id, { method:'DELETE' });
            });

          var unaSerie = function(s){
            var c = {
              user_id: sesion.user.id, routine_exercise_id: ejId,
              sort_order: s.orden, reps: s.reps, weight_kg: s.peso, done: s.hecho
            };
            return s.id
              ? sbFetch('/rest/v1/exercise_sets?id=eq.' + s.id, {
                  method:'PATCH', headers:{ 'Prefer':'return=minimal' }, body: JSON.stringify(c) })
              : sbFetch('/rest/v1/exercise_sets', {
                  method:'POST', headers:{ 'Prefer':'return=representation' }, body: JSON.stringify(c)
                }).then(function(r){
                  // Igual que arriba: la fila que se leyó se queda con su id.
                  if(s.el && !s.el.dataset.id) s.el.dataset.id = idDevuelto(r);
                });
          };

          // EL ORDEN DE ESTAS ESCRITURAS NO ES UN DETALLE.
          //
          //  `exercise_sets` lleva un índice único por (ejercicio, orden)
          //  —parcial: solo cuenta lo que no está archivado—, y el orden se
          //  recalcula desde la pantalla, así que quitar una serie del medio
          //  RENUMERA las de abajo. Mandándolo todo a la vez había dos
          //  carreras, las dos comprobadas contra Postgres:
          //
          //    · Se borra la 1 y la 2 pasa a ser 1. Si el UPDATE llega antes
          //      que el archivado, la 1 sigue ocupando el hueco.
          //    · La 3 pasa a 2 y la 2 pasa a 1. Si la primera llega antes,
          //      la 2 todavía vale 2. Esta no la arregla el orden de envío:
          //      las dos son UPDATE y salían en paralelo.
          //
          //  Se ve como «No se pudo guardar», con parte de la rutina ya
          //  escrita: la pantalla y la base dicen cosas distintas.
          //
          //  Primero los borrados, ESPERÁNDOLOS. Y después las series de una
          //  en una, de menor a mayor orden: como solo se pueden añadir al
          //  final o quitar —no se arrastran—, el destino siempre es menor o
          //  igual que el actual, y subiendo desde el 1 el hueco está libre
          //  antes de ocuparlo.
          var enOrden = ej.series.slice().sort(function(a, b){ return a.orden - b.orden; });
          return Promise.all(borradas).then(function(){
            return enOrden.reduce(function(cola, s){
              return cola.then(function(){ return unaSerie(s); });
            }, Promise.resolve());
          });
        });
    });
  }

  // ---- Cuándo se guarda ----
  // Con retardo: escribir un peso dispara un evento por tecla, y no tiene
  // sentido mandar una petición por cada dígito.
  var relojGuardado = null, tabPendiente = null;
  function programarGuardado(){
    var t = activeTab();
    if(!t || !sesion) return;
    tabPendiente = t;
    clearTimeout(relojGuardado);
    relojGuardado = setTimeout(volcarRutina, 900);
  }
  function volcarRutina(){
    clearTimeout(relojGuardado); relojGuardado = null;
    var t = tabPendiente; tabPendiente = null;
    if(!t) return;
    guardarDia(t)['catch'](function(e){
      toast('toastRutina', 'No se pudo guardar: ' + traducirError(e.message));
    });
  }

  // Estos van DESPUÉS de los manejadores que ya existían, así que leen el
  // DOM ya modificado. El de dayTabs no sirve para el cambio de día -para
  // entonces la pantalla ya cambió-; eso lo cubre saveCurrentDay().
  exList.addEventListener('input', programarGuardado);
  exList.addEventListener('click', programarGuardado);

  // ---- Cargar la rutina al entrar ----
  // Las sesiones guardadas alimentan la racha de fuerza y las gráficas de
  // progresión. Son historial: se leen, no se editan.
  function sbCargarSesiones(){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/workout_sessions?select=session_date,exercises,total_volume' +
                   '&user_id=eq.' + sesion.user.id +
                   '&order=session_date.asc')
      .then(function(ss){
        Object.keys(SESIONES).forEach(function(k){ delete SESIONES[k]; });
        Object.keys(HISTORIAL).forEach(function(k){ delete HISTORIAL[k]; });

        (ss || []).forEach(function(s){
          SESIONES[s.session_date] = true;
          (s.exercises || []).forEach(function(e){
            if(!e || !e.nombre) return;

            // El volumen guardado se calculó con la fórmula VIEJA, la que
            // dejaba en cero el trabajo sin lastre. Compararlo contra el de
            // hoy daría un salto inventado la primera semana: la misma
            // rutina saldría como una mejora enorme solo por el cambio de
            // cuenta.
            //
            // Las series se guardan con sus reps y su peso, así que se
            // rehace el número con la regla de ahora. Si una sesión vieja no
            // las trae -las hubo antes de guardarlas-, se usa lo que haya.
            var vol = Array.isArray(e.series) && e.series.length
              ? e.series.reduce(function(t, x){
                  return t + volumenDeSerie(Number(x.reps) || 0, Number(x.peso) || 0);
                }, 0)
              : Number(e.volumen) || 0;

            if(!(vol > 0)) return;
            (HISTORIAL[e.nombre] = HISTORIAL[e.nombre] || []).push(Math.round(vol));
          });
        });
        pintarEjercicio();
        // Las dos cargas van en paralelo y no se sabe cuál termina antes,
        // así que las dos llaman a esto. Es idempotente a propósito.
        ponerReferencias();
      });
  }

  function sbCargarRutina(){
    if(!sesion || !sesion.user) return Promise.resolve();
    return Promise.all([
      sbFetch('/rest/v1/routine_days?select=id,name,sort_order&user_id=eq.' + sesion.user.id + '&order=sort_order.asc,created_at.asc'),
      sbFetch('/rest/v1/routine_exercises?select=id,routine_day_id,name,sort_order&user_id=eq.' + sesion.user.id + '&order=sort_order.asc,created_at.asc'),
      sbFetch('/rest/v1/exercise_sets?select=id,routine_exercise_id,sort_order,reps,weight_kg,done&user_id=eq.' + sesion.user.id + '&order=sort_order.asc')
    ]).then(function(r){
      var dias = r[0] || [], ejs = r[1] || [], sets = r[2] || [];
      if(!dias.length) return;    // sin rutina guardada: se queda el "Día 1" de arranque

      // Agrupar de abajo hacia arriba
      var porEjercicio = {};
      sets.forEach(function(s){
        (porEjercicio[s.routine_exercise_id] = porEjercicio[s.routine_exercise_id] || []).push({
          id: s.id, orden: s.sort_order,
          reps: Number(s.reps) || 0, peso: Number(s.weight_kg) || 0, hecho: !!s.done
        });
      });
      var porDia = {};
      ejs.forEach(function(e){
        (porDia[e.routine_day_id] = porDia[e.routine_day_id] || []).push({
          id: e.id, nombre: e.name, orden: e.sort_order,
          series: porEjercicio[e.id] || []
        });
      });

      // Reconstruir las pestañas
      Array.from(dayTabs.querySelectorAll('.day-tab:not(.add)')).forEach(function(t){ t.remove(); });
      Object.keys(dayContent).forEach(function(k){ delete dayContent[k]; });

      dias.forEach(function(d, i){
        var t = document.createElement('button');
        t.className = 'day-tab' + (i === 0 ? ' active' : '');
        t.dataset.day = 'd' + (++daySeq);
        t.dataset.id = d.id;
        t.textContent = d.name;
        dayTabs.insertBefore(t, addDayBtn);
        dayContent[t.dataset.day] = (porDia[d.id] || []).map(htmlEjercicio).join('');
      });

      var primera = dayTabs.querySelector('.day-tab:not(.add)');
      if(primera) loadDay(primera);
      refrescarFlechas();
    })
    // Las notas al final y no dentro del Promise.all de arriba: marcan las
    // tarjetas, y ahí todavía no existen. Van encadenadas para que la marca
    // encuentre dónde ponerse.
    // Fuera del `if(!dias.length) return` a propósito: aunque no haya rutina
    // guardada está el "Día 1" de arranque, y sus notas son igual de tuyas.
    .then(cargarNotas)
    // Y la referencia contra la que se compara. La otra mitad la pone
    // sbCargarSesiones(): van en paralelo y gana la que termine después,
    // que es justo lo que hace falta para que estén las dos cosas -las
    // tarjetas y el historial- antes de emparejarlas.
    .then(ponerReferencias);
  }

  // ---- Gráfica de progreso por ejercicio ----
  // Historial de volumen por sesión; "Guardar sesión" agrega el punto de hoy.
  // Volumen de sesiones anteriores por ejercicio. Se llena al guardar
  // sesiones; hasta entonces la gráfica avisa de que faltan datos.
  var HISTORIAL = {};
  function abrirGrafica(card, nombre){
    var hist = (HISTORIAL[nombre] || []).slice();
    var volHoy = 0;
    Array.from(card.querySelectorAll('.sets-table tr')).forEach(function(tr){
      var ins = tr.querySelectorAll('.set-input');
      if(ins.length >= 2) volHoy += (Number(ins[0].value)||0) * (Number(ins[1].value)||0);
    });
    if(volHoy > 0) hist.push(volHoy);

    document.getElementById('grafTitulo').textContent = 'Progreso · ' + nombre;
    var cont = document.getElementById('grafChart');
    var resumen = document.getElementById('grafResumen');

    if(hist.length < 2){
      cont.innerHTML = '<div class="sin-datos">Necesitas al menos dos sesiones de este ejercicio para ver la tendencia.</div>';
      resumen.textContent = 'Guarda esta sesión y la próxima vez aparecerá tu progreso.';
      document.getElementById('graficaSheet').classList.add('open');
      return;
    }

    var W=320, H=170, L=38, R=310, T=16, B=132;
    var min = Math.min.apply(null, hist), max = Math.max.apply(null, hist);
    if(max === min){ min -= 1; max += 1; }
    var pad = (max-min)*0.18; min -= pad; max += pad;
    function x(i){ return L + i*(R-L)/(hist.length-1); }
    function y(v){ return B - (v-min)/(max-min)*(B-T); }

    var svg = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="165" role="img">';
    for(var g=0; g<=3; g++){
      var gy = T + g*(B-T)/3, gv = max - (max-min)*g/3;
      svg += '<line x1="'+L+'" y1="'+gy+'" x2="'+R+'" y2="'+gy+'" stroke="var(--line)"/>'+
             '<text x="0" y="'+(gy+3.5)+'" font-size="9.5" fill="var(--ink-faint)">'+Math.round(gv)+'</text>';
    }
    svg += '<polyline fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round" points="'+
           hist.map(function(v,i){ return x(i)+','+y(v); }).join(' ')+'"/>';
    svg += hist.map(function(v,i){
      var ult = i === hist.length-1;
      return '<circle cx="'+x(i)+'" cy="'+y(v)+'" r="'+(ult?4.4:3.2)+'" fill="'+(ult&&volHoy>0?'var(--green)':'var(--ink)')+'"/>';
    }).join('');
    svg += '<text x="'+L+'" y="'+(H-6)+'" font-size="9.5" fill="var(--ink-faint)">sesión 1</text>'+
           '<text x="'+R+'" y="'+(H-6)+'" font-size="9.5" fill="var(--ink-faint)" text-anchor="end">'+
           (volHoy>0 ? 'hoy' : 'sesión '+hist.length)+'</text>';
    cont.innerHTML = svg + '</svg>';

    var dif = hist[hist.length-1] - hist[0];
    var pct = Math.round(dif / hist[0] * 100);
    resumen.textContent = (dif >= 0 ? 'Subiste ' : 'Bajaste ') + mil(Math.abs(dif)) +
      ' de volumen desde la primera sesión (' + (dif>=0?'+':'') + pct + '%) · ' + hist.length + ' sesiones';
    document.getElementById('graficaSheet').classList.add('open');
  }
  document.getElementById('grafCerrar').addEventListener('click', function(){
    document.getElementById('graficaSheet').classList.remove('open');
  });
  document.getElementById('graficaSheet').addEventListener('click', function(e){
    if(e.target === this) this.classList.remove('open');
  });
  marcarTodasLasNotas();

  // ---- Cronómetro de descanso ----
  var restSeconds = 180;
  var remaining = 0, ticking = null, paused = false, total = 0;
  var restBar = document.getElementById('restBar');
  var restTime = document.getElementById('restTime');
  var restWho = document.getElementById('restWho');
  var restFill = document.getElementById('restFill');
  var restPause = document.getElementById('restPause');
  var timerChip = document.getElementById('timerChip');

  function fmt(s){
    var m = Math.floor(s/60), r = s%60;
    return m + ':' + (r<10?'0':'') + r;
  }
  function paintRest(){
    restTime.textContent = fmt(Math.max(0,remaining));
    restFill.style.width = total ? (Math.max(0,remaining)/total*100)+'%' : '0%';
  }
  // Avisos sonoros del descanso: uno al llegar a 10 s y otro al terminar
  var audioCtx = null;
  function tono(freq, dur, cuando, vol){
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if(audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime + (cuando || 0);
      var osc = audioCtx.createOscillator(), g = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      // Ataque y caída exponenciales: así se apaga como una campana en vez
      // de cortarse en seco, que es lo que hace que un pitido corto suene a
      // microondas. El 0.0001 es porque la curva exponencial no admite cero.
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + dur + 0.05);
    }catch(e){ /* si el navegador no deja sonar, seguimos sin ruido */ }
  }

  // Faltan 10 segundos: DOS notas, no una. Un pitido suelto de 0.14s se
  // confunde con cualquier ruido del gimnasio; un par se reconoce al vuelo.
  // Van graves a propósito, para no parecerse al aviso del final.
  function bipAviso(){
    tono(587.33, 0.30, 0,    0.22);
    tono(587.33, 0.36, 0.30, 0.22);
  }

  // Cuenta atrás en los últimos tres segundos. Esto es lo que de verdad da
  // tiempo a colocarse: antes había un aviso a los 10 s y después silencio
  // hasta el cero, así que había que estar mirando la pantalla.
  function bipCuenta(){ tono(784, 0.18, 0, 0.20); }

  // Final: arpegio de re mayor con las notas encadenadas y la última
  // sostenida, apagándose sola. Dura ~1.7 s en vez de 0.7.
  function bipFinal(){
    tono(587.33, 0.50, 0,    0.26);   // re
    tono(739.99, 0.50, 0.18, 0.26);   // fa#
    tono(880.00, 0.55, 0.36, 0.26);   // la
    tono(1174.66, 1.20, 0.56, 0.30);  // re agudo, la que se queda sonando
  }
  function vibrar(ms){ if(navigator.vibrate) try{ navigator.vibrate(ms); }catch(e){} }

  function stopTick(){ if(ticking){ clearInterval(ticking); ticking = null; } }
  // ---- Por qué el cronómetro se congelaba ----
  // Contaba restando uno por tick. Al salir de la app, iOS congela los
  // temporizadores: al volver, seguía marcando el segundo en que te fuiste.
  //
  // Ahora se guarda CUÁNDO termina y cada tick calcula lo que falta contra
  // el reloj del sistema. Los ticks siguen congelándose —eso no se puede
  // evitar en una web— pero el número deja de ser mentira: al volver ya está
  // puesto al día, y si terminó mientras estabas fuera, lo dice.
  //
  // Lo que sigue sin poder hacerse: sonar o vibrar con la app cerrada. Eso
  // necesita notificaciones del sistema, no un temporizador.
  var finRest = 0;

  function segundosQueFaltan(){
    return Math.max(0, Math.ceil((finRest - Date.now()) / 1000));
  }

  function startRest(secs, label){
    stopTick();
    finRest = Date.now() + secs * 1000;
    total = secs; remaining = secs; paused = false;
    restBar.classList.remove('done');
    restPause.textContent = 'Pausar';
    restWho.textContent = label;
    restBar.classList.add('open');
    paintRest();
    tono(523.25, 0.22, 0, 0.18);   // confirma que arrancó
    ticking = setInterval(function(){
      if(paused) return;
      var antes = remaining;
      remaining = segundosQueFaltan();
      paintRest();
      // Si se saltaron segundos —estuvo en segundo plano— no se disparan
      // los avisos de los que se pasó: sonar cinco pitidos de golpe al
      // volver es peor que no sonar.
      if(antes - remaining > 1){
        if(remaining <= 0) terminarRest();
        return;
      }
      // Aviso doble a los 10 s, y cuenta atrás en los tres últimos
      if(remaining === 10){ bipAviso(); vibrar([90,90,90]); }
      if(remaining === 3 || remaining === 2 || remaining === 1){ bipCuenta(); vibrar(45); }
      if(remaining <= 0) terminarRest();
    }, 1000);
  }

  function terminarRest(){
    stopTick();
    restBar.classList.add('done');
    restWho.textContent = '¡Descanso terminado! A la siguiente serie';
    restTime.textContent = '0:00';
    bipFinal(); vibrar([150,90,150,90,260]);
  }

  // Al volver a la app se pone al día de golpe, sin esperar al siguiente
  // tick: ver el número viejo aunque sea un segundo es lo que hace pensar
  // que se quedó parado.
  document.addEventListener('visibilitychange', function(){
    if(document.hidden || !ticking || paused) return;
    remaining = segundosQueFaltan();
    paintRest();
    if(remaining <= 0) terminarRest();
  });
  restPause.addEventListener('click', function(){
    if(remaining <= 0) return;
    paused = !paused;
    // Al reanudar se corre la hora de fin: si no, el tiempo pausado habría
    // seguido corriendo por dentro y volvería con menos del que dejó.
    if(!paused) finRest = Date.now() + remaining * 1000;
    restPause.textContent = paused ? 'Seguir' : 'Pausar';
  });
  document.getElementById('restPlus').addEventListener('click', function(){
    remaining += 30; total = Math.max(total, remaining);
    finRest = Date.now() + remaining * 1000;   // +30 s de verdad, no solo en pantalla
    restBar.classList.remove('done');
    if(!ticking) startRest(remaining, restWho.textContent);
    paintRest();
  });
  document.getElementById('restClose').addEventListener('click', function(){
    stopTick(); restBar.classList.remove('open');
  });

  // Panel de configuración del cronómetro
  var timerSheet = document.getElementById('timerSheet');
  var presetGrid = document.getElementById('presetGrid');
  var customSecs = document.getElementById('customSecs');

  function syncPresets(val){
    Array.from(presetGrid.querySelectorAll('.preset')).forEach(function(p){
      p.classList.toggle('active', Number(p.dataset.secs) === Number(val));
    });
  }
  timerChip.addEventListener('click', function(){
    customSecs.value = restSeconds;
    syncPresets(restSeconds);
    timerSheet.classList.add('open');
  });
  timerSheet.addEventListener('click', function(e){
    if(e.target === timerSheet) timerSheet.classList.remove('open');
  });
  presetGrid.addEventListener('click', function(e){
    var p = e.target.closest('.preset');
    if(!p) return;
    customSecs.value = p.dataset.secs;
    syncPresets(p.dataset.secs);
  });
  customSecs.addEventListener('input', function(){ syncPresets(customSecs.value); });
  document.getElementById('timerSave').addEventListener('click', function(){
    var v = Math.min(900, Math.max(5, Number(customSecs.value) || 180));
    restSeconds = v;
    timerChip.textContent = '⏱ ' + fmt(v);
    timerSheet.classList.remove('open');
    toast('toastRutina', 'Descanso: ' + fmt(v));
  });

  // Un aviso abajo, durante segundo y medio.
  //
  //  POR QUÉ NO BASTA CON getElementById
  //
  //  Cada toast vive DENTRO de una vista, y las vistas que no están activas
  //  son `display:none`. Un toast pedido por su id se añade la clase y no se
  //  pinta: mide 0×0 y nadie lo ve. La app no falla, simplemente se calla.
  //
  //  Y pasaba de verdad, en dos sitios que importan:
  //
  //   · El editor de planes (`planedit`) no tiene toast propio y pedía el de
  //     `plan` o el de `admin`. Se perdían SEIS mensajes, entre ellos «No
  //     pude cargar su plan: no guardes o lo sobrescribes», que existe justo
  //     para evitar que un entrenador borre el plan de alguien sin querer.
  //
  //   · Los errores de carga (`cargarDatos`) piden `toastComida`, que vive
  //     en `mealadd`, y salen estando en `diario`. Ahí se perdían «No pude
  //     cargar tu rutina», «...tus fotos» y el «Sin señal: se ve lo que
  //     apuntaste» que se añadió al arreglar lo de la señal.
  //
  //  Arreglarlo uno a uno dejaría el mismo agujero abierto para el
  //  siguiente: hay doce vistas sin toast. Así que si el que se pide no se
  //  ve, se usa el de la vista activa, y si esa tampoco tiene, se le pone
  //  uno. Cuando el pedido SÍ se ve —que es lo normal— no cambia nada.
  function toast(id, msg){
    var el = document.getElementById(id);

    // offsetParent nulo = no se está pintando. Es la comprobación barata:
    // cubre tanto que el elemento no exista como que su vista esté oculta.
    if(!el || el.offsetParent === null){
      var activa = document.querySelector('.app-view.active');
      if(!activa) return;                       // nada visible: no hay dónde
      el = activa.querySelector('.toast');
      if(!el){
        el = document.createElement('div');
        el.className = 'toast';
        activa.appendChild(el);
      }
    }

    if(msg) el.textContent = msg;
    el.classList.add('show');
    setTimeout(function(){ el.classList.remove('show'); }, 1600);
  }
  // Aquí había dos manejadores de relleno, uno para "Guardar sesión" y otro
  // para "Guardar peso", que solo mostraban un aviso. Los de verdad están
  // más abajo, y con estos delante el aviso salía dos veces.

  // ---- Ejercicios recomendados (library) ----
  var groups = [
    {key:'pecho', label:'Pecho', accent:'#3b82f6', ex:['Press de banca con barra','Press inclinado mancuerna','Aperturas con mancuerna','Fondos en paralelas','Press en máquina','Cruce de poleas']},
    {key:'espalda', label:'Espalda', accent:'#8b5cf6', ex:['Dominadas','Remo con barra','Remo con mancuerna','Jalón al pecho','Peso muerto','Remo en máquina']},
    {key:'piernas', label:'Piernas', accent:'#22c55e', ex:['Sentadilla con barra','Prensa de piernas','Zancadas con mancuerna','Peso muerto rumano','Extensión de cuádriceps','Curl femoral']},
    {key:'hombros', label:'Hombros', accent:'#f59e0b', ex:['Press militar con barra','Press con mancuerna','Elevaciones laterales','Elevaciones frontales','Pájaros posterior','Press Arnold']},
    {key:'biceps', label:'Bíceps', accent:'#ec4899', ex:['Curl con barra','Curl con mancuerna','Curl martillo','Curl concentrado','Curl en polea','Curl predicador']},
    {key:'triceps', label:'Tríceps', accent:'#06b6d4', ex:['Press francés','Extensión en polea','Fondos en banco','Patada de tríceps','Press cerrado con barra','Extensión sobre cabeza']},
    {key:'abdomen', label:'Abdomen', accent:'#ef4444', ex:['Crunch abdominal','Plancha','Elevación de piernas','Rueda abdominal','Crunch en polea','Giro ruso']},
    {key:'gluteos', label:'Glúteos', accent:'#a855f7', ex:['Hip thrust','Puente de glúteo','Patada de glúteo en polea','Sentadilla sumo','Zancada búlgara','Abducción de cadera']}
  ];
  // Figura anatómica: cuerpo en gris, músculo trabajado resaltado en rojo,
  // vista frontal y posterior (marcador de posición del arte final).
  var MUSCLE = '#c2c7ce', MUSCLE_D = '#a8aeb6', SKIN = '#dfe3e8', HL = '#d94a2b', HL_D = '#b03a20';

  function on(group, key){ return group === key; }

  // Qué vista del cuerpo se muestra según el grupo muscular
  var VISTA = {
    pecho:'frente', abdomen:'frente', biceps:'frente', hombros:'frente', piernas:'frente',
    espalda:'espalda', triceps:'espalda', gluteos:'espalda'
  };

  function figureSvg(key){
    function f(part){ return on(key, part) ? HL : MUSCLE; }
    function fd(part){ return on(key, part) ? HL_D : MUSCLE_D; }
    var vista = VISTA[key] || 'frente';
    var vb = vista === 'frente' ? '8 8 94 224' : '98 8 94 224';

    return '<svg viewBox="'+vb+'" width="100%" height="100%" role="img">'+
    '<g stroke="'+MUSCLE_D+'" stroke-width="1.1" stroke-linejoin="round">'+

      /* ---------- VISTA FRONTAL ---------- */
      '<g transform="translate(0,0)">'+
        /* cabeza y cuello */
        '<ellipse cx="55" cy="26" rx="12" ry="14" fill="'+SKIN+'"/>'+
        '<path d="M49 38 h12 v9 h-12 z" fill="'+SKIN+'"/>'+
        /* trapecio frontal */
        '<path d="M42 50 q13 -8 26 0 l-4 7 q-9 -5 -18 0 z" fill="'+f('hombros')+'"/>'+
        /* hombros (deltoides) */
        '<ellipse cx="34" cy="59" rx="10" ry="11" fill="'+f('hombros')+'" stroke="'+fd('hombros')+'"/>'+
        '<ellipse cx="76" cy="59" rx="10" ry="11" fill="'+f('hombros')+'" stroke="'+fd('hombros')+'"/>'+
        /* pectorales */
        '<path d="M55 56 q-13 -1 -18 6 q-2 9 5 13 q9 3 13 -5 z" fill="'+f('pecho')+'" stroke="'+fd('pecho')+'"/>'+
        '<path d="M55 56 q13 -1 18 6 q2 9 -5 13 q-9 3 -13 -5 z" fill="'+f('pecho')+'" stroke="'+fd('pecho')+'"/>'+
        /* bíceps */
        '<ellipse cx="29" cy="79" rx="8" ry="13" fill="'+f('biceps')+'" stroke="'+fd('biceps')+'"/>'+
        '<ellipse cx="81" cy="79" rx="8" ry="13" fill="'+f('biceps')+'" stroke="'+fd('biceps')+'"/>'+
        /* antebrazos */
        '<ellipse cx="25" cy="103" rx="7" ry="14" fill="'+SKIN+'"/>'+
        '<ellipse cx="85" cy="103" rx="7" ry="14" fill="'+SKIN+'"/>'+
        /* abdomen */
        '<path d="M44 74 h22 v34 q0 8 -11 12 q-11 -4 -11 -12 z" fill="'+f('abdomen')+'" stroke="'+fd('abdomen')+'"/>'+
        '<g stroke="'+fd('abdomen')+'" stroke-width="1">'+
          '<line x1="55" y1="76" x2="55" y2="116"/>'+
          '<line x1="45" y1="86" x2="65" y2="86"/>'+
          '<line x1="45" y1="97" x2="65" y2="97"/>'+
          '<line x1="46" y1="107" x2="64" y2="107"/>'+
        '</g>'+
        /* cadera */
        '<path d="M43 118 h24 l-3 12 h-18 z" fill="'+SKIN+'"/>'+
        /* cuádriceps */
        '<path d="M46 130 q-6 24 -2 44 q6 5 10 0 q3 -22 1 -44 z" fill="'+f('piernas')+'" stroke="'+fd('piernas')+'"/>'+
        '<path d="M64 130 q6 24 2 44 q-6 5 -10 0 q-3 -22 -1 -44 z" fill="'+f('piernas')+'" stroke="'+fd('piernas')+'"/>'+
        /* pantorrillas */
        '<ellipse cx="49" cy="196" rx="7" ry="17" fill="'+f('piernas')+'" stroke="'+fd('piernas')+'"/>'+
        '<ellipse cx="61" cy="196" rx="7" ry="17" fill="'+f('piernas')+'" stroke="'+fd('piernas')+'"/>'+
        '<path d="M43 214 h12 v6 h-12 z M55 214 h12 v6 h-12 z" fill="'+SKIN+'"/>'+
      '</g>'+

      /* ---------- VISTA POSTERIOR ---------- */
      '<g transform="translate(90,0)">'+
        '<ellipse cx="55" cy="26" rx="12" ry="14" fill="'+SKIN+'"/>'+
        '<path d="M49 38 h12 v9 h-12 z" fill="'+SKIN+'"/>'+
        /* trapecio */
        '<path d="M55 47 l16 6 l-6 22 l-10 4 l-10 -4 l-6 -22 z" fill="'+f('espalda')+'" stroke="'+fd('espalda')+'"/>'+
        /* deltoides posteriores */
        '<ellipse cx="34" cy="59" rx="10" ry="11" fill="'+f('hombros')+'" stroke="'+fd('hombros')+'"/>'+
        '<ellipse cx="76" cy="59" rx="10" ry="11" fill="'+f('hombros')+'" stroke="'+fd('hombros')+'"/>'+
        /* dorsales */
        '<path d="M43 66 q-4 22 3 34 l9 6 v-30 z" fill="'+f('espalda')+'" stroke="'+fd('espalda')+'"/>'+
        '<path d="M67 66 q4 22 -3 34 l-9 6 v-30 z" fill="'+f('espalda')+'" stroke="'+fd('espalda')+'"/>'+
        /* tríceps */
        '<ellipse cx="29" cy="79" rx="8" ry="13" fill="'+f('triceps')+'" stroke="'+fd('triceps')+'"/>'+
        '<ellipse cx="81" cy="79" rx="8" ry="13" fill="'+f('triceps')+'" stroke="'+fd('triceps')+'"/>'+
        '<ellipse cx="25" cy="103" rx="7" ry="14" fill="'+SKIN+'"/>'+
        '<ellipse cx="85" cy="103" rx="7" ry="14" fill="'+SKIN+'"/>'+
        /* lumbar */
        '<path d="M48 104 h14 v14 h-14 z" fill="'+f('espalda')+'" stroke="'+fd('espalda')+'"/>'+
        /* glúteos */
        '<path d="M55 118 q-14 0 -13 12 q1 10 13 10 z" fill="'+f('gluteos')+'" stroke="'+fd('gluteos')+'"/>'+
        '<path d="M55 118 q14 0 13 12 q-1 10 -13 10 z" fill="'+f('gluteos')+'" stroke="'+fd('gluteos')+'"/>'+
        /* femorales */
        '<path d="M46 142 q-5 18 -1 32 q6 5 10 0 q2 -18 1 -32 z" fill="'+f('piernas')+'" stroke="'+fd('piernas')+'"/>'+
        '<path d="M64 142 q5 18 1 32 q-6 5 -10 0 q-2 -18 -1 -32 z" fill="'+f('piernas')+'" stroke="'+fd('piernas')+'"/>'+
        /* gemelos */
        '<ellipse cx="49" cy="196" rx="7.5" ry="18" fill="'+f('piernas')+'" stroke="'+fd('piernas')+'"/>'+
        '<ellipse cx="61" cy="196" rx="7.5" ry="18" fill="'+f('piernas')+'" stroke="'+fd('piernas')+'"/>'+
        '<path d="M43 214 h12 v6 h-12 z M55 214 h12 v6 h-12 z" fill="'+SKIN+'"/>'+
      '</g>'+
    '</g></svg>';
  }

  var selected = new Set();
  var activeGroup = groups[0].key;
  var muscleTabs = document.getElementById('muscleTabs');
  var grid = document.getElementById('exerciseGrid');
  var libBottom = document.getElementById('libBottomBtn');

  function renderTabs(){
    muscleTabs.innerHTML = groups.map(function(g){
      return '<button class="muscle-tab'+(g.key===activeGroup?' active':'')+'" data-group="'+g.key+'">'+
        '<span class="dot" style="background:'+g.accent+'"></span>'+g.label+'</button>';
    }).join('');
  }
  function renderGrid(){
    var g = groups.find(function(x){ return x.key===activeGroup; });
    grid.innerHTML = g.ex.map(function(name){
      var id = g.key+'::'+name;
      var picked = selected.has(id);
      return '<div class="ex-lib-card'+(picked?' picked':'')+'" data-id="'+id+'">'+
        '<div class="ex-lib-pic">'+figureSvg(g.key)+
          '<span class="ex-lib-view">'+(VISTA[g.key]==='espalda' ? 'vista posterior' : 'vista frontal')+'</span></div>'+
        '<div class="ex-lib-name">'+escapar(name)+'</div>'+
        '<div class="ex-lib-check">✓</div>'+
        '</div>';
    }).join('');
  }
  function renderBottom(){
    var n = selected.size;
    libBottom.textContent = 'Agregar seleccionados (' + n + ')';
    libBottom.classList.toggle('disabled', n===0);
  }
  renderTabs(); renderGrid(); renderBottom();

  muscleTabs.addEventListener('click', function(e){
    var b = e.target.closest('.muscle-tab');
    if(!b) return;
    activeGroup = b.dataset.group;
    renderTabs(); renderGrid();
  });
  grid.addEventListener('click', function(e){
    var card = e.target.closest('.ex-lib-card');
    if(!card) return;
    var id = card.dataset.id;
    if(selected.has(id)) selected.delete(id); else selected.add(id);
    renderGrid(); renderBottom();
  });
  libBottom.addEventListener('click', function(){
    if(selected.size===0) return;
    var cuantos = selected.size;
    var list = document.getElementById('exerciseList');
    selected.forEach(function(id){ list.appendChild(nuevaTarjetaEjercicio(id.split('::')[1])); });
    selected.clear(); renderGrid();
    recalcAll();
    syncEmptyState();
    if(typeof marcarTodasLasNotas === 'function') marcarTodasLasNotas();

    // Solo se llega aquí desde "+ agregar ejercicio", así que regresar
    // siempre devuelve a Mi Rutina, que es de donde se vino.
    back();
    var dia = activeTab() ? activeTab().textContent.trim() : 'tu rutina';
    toast('toastRutina', cuantos + (cuantos===1?' ejercicio agregado a ':' ejercicios agregados a ') + dia);
    renderBottom();
  });

  // ---- Semana personalizada: el usuario elige en qué día arranca su semana ----
  // "Hoy" fijo para que el mockup coincida con el encabezado (30 de julio de 2026).
  // Fecha real del dispositivo, a medianoche. Todo el resto se deriva de aquí.
  var HOY = new Date(); HOY.setHours(0,0,0,0);
  var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio',
                     'agosto','septiembre','octubre','noviembre','diciembre'];
  // El día en que empieza SU semana. Lunes por defecto; cada persona puede
  // tener el suyo, guardado en `profiles.week_start_dow`.
  //
  // NO HAY CONTROL EN EL PERFIL PARA CAMBIARLO. Se lee de la base y ya. Hoy
  // el único que no está en lunes es Eduardo, que está en martes porque se
  // le puso a mano. Aquí decía que se elegía en el Perfil y no era verdad;
  // queda escrito para que nadie vuelva a buscar ese control.
  //
  // OJO CON LO QUE SE ARREGLÓ AQUÍ, porque no es esto.
  //
  // El fallo no era que cada quien tuviera su día: era que el día SE MOVÍA
  // SOLO. Cambiar los macros o el objetivo lo ponía en el día en que
  // estuvieras, así que quien tocaba sus macros un miércoles se despertaba
  // con la semana de miércoles a martes sin haber pedido nada, y el
  // calendario de apuntar -que solo deja moverse dentro de la semana en
  // curso- ya no le dejaba volver al lunes de su propia semana.
  //
  // Se llegó a quitar la columna entera, y eso fue pasarse: le cambió la
  // semana a quien la tenía bien puesta a propósito. Lo que no puede volver
  // es la reasignación automática, no el ajuste.
  var inicioSemana = 1; // 0=domingo … 6=sábado

  function isoDe(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function haceDias(n){ var d = new Date(HOY); d.setDate(d.getDate() - n); return d; }

  // Progreso de ejercicio (se declara aquí porque la semana lo consulta al recalcular)
  // Días con sesión de fuerza guardada. Vacío al empezar: enseñar doce
  // entrenamientos de ejemplo a quien acaba de registrarse le falsea la
  // racha y el resumen de la semana en Progreso.
  var SESIONES = {};

  function fmtFecha(d){ return d.getDate() + ' ' + MESES[d.getMonth()]; }

  // Qué número de día de TU semana es hoy (1 a 7)
  function diaDeLaSemana(){
    return ((HOY.getDay() - inicioSemana + 7) % 7) + 1;
  }
  function arranqueSemana(){
    var d = new Date(HOY);
    d.setDate(d.getDate() - (diaDeLaSemana() - 1));
    return d;
  }

  // Comidas ya registradas (ejemplo), relativas a hoy para que siempre tengan sentido.
  // Las calorías salen de los macros, igual que en el perfil.
  // Totales por día, {'2026-07-31': {P,C,G}}. Arranca vacío: quien acaba de
  // registrarse no tiene historial, y enseñarle una semana inventada le
  // falsea el anillo, la racha y el reparto semanal. Lo llena cargarDatos().
  var REGISTRO = {};

  // ---- En qué día se está apuntando ----
  // Normalmente hoy. Pero "ayer comí esto y no lo registré" es de las cosas
  // que más pasan, y hasta ahora no había forma: `HOY` estaba fijo dentro
  // de las dos funciones que guardan.
  //
  // Se guarda la FECHA, no un desfase en días: si alguien deja la pantalla
  // abierta y cruza la medianoche, un "-1 día" apuntaría en el día
  // equivocado sin avisar.
  //
  // null = hoy. Se declara aquí arriba, junto a REGISTRO, porque las
  // funciones que lo leen corren al arrancar: un `var` mil líneas más abajo
  // vale undefined en ese momento y tumba el arranque entero.
  var DIA_APUNTE = null;
  function diaDeApunte(){ return DIA_APUNTE || HOY; }

  // Salir de apuntar vuelve a HOY, y por TODAS las salidas.
  //
  // Apuntar en otro día deja dos cosas puestas: DIA_APUNTE, que decide en qué
  // día se escribe, y la lista de COMIDAS de aquel día. Volvían a hoy al
  // entrar de nuevo a apuntar y al salir con el botón de regresar, pero no al
  // salir por la barra de abajo, que es una salida como las otras.
  //
  // Y no era solo cosmético: el asistente también apunta comida, y apunta en
  // diaDeApunte(). Elegir el miércoles, salir tocando una pestaña de abajo y
  // apuntar lo que propuso el asistente guardaba esa comida en el miércoles
  // pasado, en silencio.
  //
  // Vive en un solo sitio para que la próxima salida que se añada no se
  // quede sin la mitad: poner el día a hoy sin rehacer la lista deja el
  // Diario enseñando las comidas del martes mientras el anillo cuenta las de
  // hoy.
  function volverAHoyElApunte(){
    var veniaDeOtroDia = !!DIA_APUNTE;
    DIA_APUNTE = null;
    if(typeof pintarSelectorDia === 'function') pintarSelectorDia();
    if(veniaDeOtroDia && typeof cargarComidasDelDia === 'function') cargarComidasDelDia(HOY);
    return veniaDeOtroDia;
  }
  function apuntandoEnHoy(){ return isoDe(diaDeApunte()) === isoDe(HOY); }

  // De qué día es la lista que hay ahora mismo en COMIDAS. Null quiere decir
  // hoy, igual que arriba.
  //
  // Casi siempre coincide con diaDeApunte(), pero NO siempre: al deshacer un
  // guardado que falló se resta del día en que se sumó, que puede que ya no
  // sea el que se está mirando. Son dos preguntas distintas y hacía falta
  // poder hacer la segunda.
  var DIA_LISTA = null;

  // Eventos apartados, por fecha: { 'AAAA-MM-DD': {titulo, calorias, ...} }
  //
  // Se declara AQUÍ y no junto a las funciones que lo llenan, que están mil
  // líneas más abajo. `var` iza la declaración pero no la asignación: con
  // ella abajo, el balance del día se ejecutaba al arrancar con EVENTOS
  // todavía en undefined y reventaba el arranque entero de la app.
  var EVENTOS = {};

  var iso = isoDe;
  function calDe(m){ return m.P*4 + m.C*4 + m.G*9; }

  // El "ancla" es el lunes de esta semana: el día 1. Se recalcula sola cada
  // vez que se abre la app, así que al llegar el lunes la semana se reinicia
  // sin que nadie toque nada.
  function ultimoDia(dow){
    var d = new Date(HOY);
    d.setDate(d.getDate() - ((HOY.getDay() - dow + 7) % 7));
    return d;
  }
  var anclaSemana = ultimoDia(inicioSemana);

  // Suma solo lo registrado desde el ancla hasta hoy (nunca días anteriores al reinicio)
  function sumaDesde(ancla){
    var tot = {P:0, C:0, G:0};
    var d = new Date(ancla);
    while(d <= HOY){
      var reg = REGISTRO[iso(d)];
      if(reg){ tot.P += reg.P; tot.C += reg.C; tot.G += reg.G; }
      d.setDate(d.getDate() + 1);
    }
    var dias = Math.round((HOY - ancla) / 86400000) + 1;
    var fin = new Date(ancla); fin.setDate(fin.getDate() + 6);
    return {total:tot, cal:calDe(tot), inicio:new Date(ancla), fin:fin, dia:dias,
            rango:'Del ' + fmtFecha(ancla) + ' al ' + fmtFecha(fin)};
  }
  function sumaSemana(){ return sumaDesde(anclaSemana); }

  // El anillo se hizo más pequeño para que el Diario quepa en una pantalla
  // sin desplazar. El trazo va por `pathLength`, así que el largo del
  // círculo es siempre 100 y no hay que recalcular 2πr al cambiar el radio.
  // `valor` es lo que se enseña dentro y lo que llena el trazo. En
  // "consumidas" es lo comido y el anillo se llena; en "restantes" es lo
  // que falta, así que empieza entero y se vacía. Quien llama decide cuál
  // de los dos manda, y aquí no hay que saberlo.
  //
  // Pasarse no es "te quedan 0": es un dato que hay que ver. Cuando se
  // excede, el anillo se queda vacío y el número pasa a ser lo que sobra,
  // en rojo. Un anillo lleno diría lo contrario de lo que ocurre.
  function pintarAnillo(cardId, valor, meta, excedido){
    var card = document.getElementById(cardId);
    if(!card) return;
    var pct = (excedido || !(meta > 0)) ? 0 : Math.min(1, valor / meta);
    card.querySelector('.ring-num').textContent = mil(valor);
    card.classList.toggle('excedido', !!excedido);
    card.querySelector('.ring-prog').setAttribute('stroke-dashoffset', String(100 - 100 * pct));
  }

  // El rótulo depende del modo Y de si se ha pasado, así que se decide en
  // un solo sitio, cada vez que se recalculan las metas. Ponerlo desde el
  // cambio de vista dejaba "RESTANTES" escrito sobre un número que ya era
  // exceso, hasta que algo más repintara.
  function etiquetaAnillo(id, excedido){
    var el = document.getElementById(id);
    if(!el) return;
    el.textContent = vistaAnillo !== 'restantes' ? 'CALORÍAS CONSUMIDAS'
                   : excedido ? 'CALORÍAS EXCEDIDAS'
                   : 'CALORÍAS RESTANTES';
  }

  function actualizarSemana(){
    var s = sumaSemana();

    Array.from(document.querySelectorAll('.day-count')).forEach(function(el){
      el.textContent = s.dia + '/7 días';
    });
    document.getElementById('weekRange').textContent = s.rango;
    document.getElementById('profWeekRange').textContent = s.rango;
    document.getElementById('profWeekDay').textContent =
      'Hoy es el día ' + s.dia + ' de 7. Se reinicia el próximo ' + DIAS[inicioSemana] + '.';

    // Con SU día, no con uno fijo. Antes aquí ponía "de lunes a domingo"
    // escrito a mano y a quien empieza en martes le mentía en su propia
    // pantalla de ajustes.
    var finSem = DIAS[(inicioSemana + 6) % 7];
    var hint = document.getElementById('profSemanaHint');
    if(hint) hint.textContent = 'de ' + DIAS[inicioSemana] + ' a ' + finSem;
    var txt = document.getElementById('profSemanaTexto');
    if(txt) txt.textContent =
      'Tu semana va de ' + DIAS[inicioSemana] + ' a ' + finSem + '. El ' +
      DIAS[inicioSemana] + ' es tu día 1 y el conteo vuelve a cero solo, cada ' +
      DIAS[inicioSemana] + '.';

    refrescarFlechas();
    if(typeof pintarEjercicio === 'function') pintarEjercicio();  // el progreso sigue la misma semana
    if(typeof pintarGastoReal === 'function') pintarGastoReal();
    actualizarMetas(); // recalcula anillos, barras y el resumen del Diario
  }

  // Su gasto medido, en el Perfil. Se enseña porque es SUYO y porque explica
  // por qué la IA le mueve lo que le mueve; esconderlo dejaría los ajustes
  // pareciendo caprichos.
  //
  // `typeof` arriba y comprobación de la caja aquí: esto vive mil líneas más
  // abajo y actualizarSemana corre al arrancar, antes de que exista.
  function pintarGastoReal(){
    var caja = document.getElementById('gastoBox');
    if(!caja || typeof gastoMedido !== 'function') return;

    var g;
    try{ g = gastoMedido(); }catch(e){ caja.hidden = true; return; }

    // Sin datos suficientes, o con un número que no se sostiene, no se
    // enseña nada. Un "todavía no se puede" solo genera la pregunta de
    // cuándo, y el número descartado es justo el que no hay que creerse.
    if(!g || g.estado !== 'ok'){ caja.hidden = true; return; }

    caja.hidden = false;
    document.getElementById('gastoReal').textContent = mil(g.gasto) + ' cal';

    var dif = g.gasto - g.estimado;
    var comparado = dif === 0 ? 'lo mismo que decía la fórmula del registro'
      : (dif > 0 ? mil(dif) + ' más' : mil(-dif) + ' menos') +
        ' de lo que decía la fórmula del registro';

    document.getElementById('gastoNota').textContent =
      'Medido con ' + g.semanas + ' semanas y ' + g.dias + ' días apuntados: ' +
      comparado + '.';
  }

  // Cambiar los macros pide confirmación, enseñando las calorías de antes y
  // las de ahora. La hoja se queda aunque ya no se pierda nada: son las
  // calorías de todos los días y merecen un "¿seguro?" antes de moverlas.
  var weekConfirm = document.getElementById('weekConfirm');
  var metasPendientes = null;   // lo tecleado, a la espera de confirmar
  var metasVigentes = null;     // lo último confirmado, para poder revertir

  function leerMetas(){ return { P:num(goalP,600), C:num(goalC,900), G:num(goalG,400) }; }
  function escribirMetas(m){ goalP.value = m.P; goalC.value = m.C; goalG.value = m.G; }
  function mismasMetas(a, b){ return a && b && a.P === b.P && a.C === b.C && a.G === b.G; }

  function cerrarConfirm(){ weekConfirm.classList.remove('open'); metasPendientes = null; }

  // Se llama al salir de cualquiera de los tres campos, y solo pregunta si
  // el número cambió de verdad.
  function pedirConfirmacionMetas(){
    var nuevas = leerMetas();
    if(mismasMetas(nuevas, metasVigentes)) return;

    metasPendientes = nuevas;
    // Se comparan las calorías DIARIAS de antes y de ahora, que es lo que de
    // verdad cambia. Antes aquí salía el acumulado de la semana contra un
    // cero, porque la semana se cortaba; ahora no se corta y ese cero sería
    // mentira.
    document.getElementById('wcNowCal').textContent   = mil(calDe(metasVigentes || nuevas));
    document.getElementById('wcNowRange').textContent = 'cal al día';
    document.getElementById('wcNextCal').textContent  = mil(calDe(nuevas));
    document.getElementById('wcNextRange').textContent = 'cal al día';
    weekConfirm.classList.add('open');
  }

  // ---- Cambios de meta hechos a mano, con su fecha ----
  //
  // La semana ya no se corta al cambiar los macros, y eso deja un cabo: si
  // alguien se sube las calorías un miércoles, esa semana tiene dos días con
  // una meta y cinco con otra. Al cerrarla se le manda a la IA una sola
  // meta -la de ahora- y la media de los siete días. Sin saber que hubo un
  // cambio, la IA lee "se pasó 300 al día" cuando en realidad iba clavado.
  //
  // Solo se apuntan los cambios A MANO. Los que hace la IA al cerrar la
  // semana caen en lunes, ya sabe que los hizo, y los tiene en su historial.
  //
  // Vive en el navegador y no en la base a propósito: es una pista para
  // afinar el mensaje, no un dato del que dependa nada. Si falta -teléfono
  // nuevo, otro navegador- la IA se comporta como se comportaba hasta hoy.
  var CLAVE_CAMBIOS = 'macros.cambiosMeta';

  function apuntarCambioDeMeta(antes, despues){
    if(!antes || !despues || antes === despues) return;
    try{
      var l = JSON.parse(localStorage.getItem(CLAVE_CAMBIOS) || '[]');
      if(!Array.isArray(l)) l = [];
      l.push({ fecha: isoDe(HOY), antes: antes, despues: despues });
      // Cinco semanas y fuera: el cierre nunca mira más atrás, y una lista
      // que solo crece acaba llenando el almacén del navegador.
      var corte = isoDe(haceDias(35));
      l = l.filter(function(c){ return c && c.fecha >= corte; });
      localStorage.setItem(CLAVE_CAMBIOS, JSON.stringify(l));
    }catch(e){}
  }

  function cambiosDeMetaEn(desde, hasta){        // `hasta` no entra
    try{
      var l = JSON.parse(localStorage.getItem(CLAVE_CAMBIOS) || '[]');
      if(!Array.isArray(l)) return [];
      var a = isoDe(desde), b = isoDe(hasta);
      return l.filter(function(c){ return c && c.fecha >= a && c.fecha < b; });
    }catch(e){ return []; }
  }

  document.getElementById('wcAccept').addEventListener('click', function(){
    if(!metasPendientes) return;
    apuntarCambioDeMeta(calDe(metasVigentes), calDe(metasPendientes));
    metasVigentes = metasPendientes;
    pintarMetasPendientes();      // guardado: el botón se va

    // La semana NO se corta. Sigue de lunes a domingo y los macros nuevos
    // valen desde hoy. Cortarla aquí dejaba el inicio en el día en que se
    // tocaran los macros y la semana ya no era de lunes a domingo.

    cerrarConfirm();
    actualizarSemana();
    // El aviso va DESPUÉS de que la base conteste, no antes.
    //
    // Decía "Macros guardados" y se tragaba el fallo: quien lo leyera se
    // pasaría la semana comiendo para unos números que solo existían en la
    // pantalla de su teléfono, y al abrir la app en otro sitio -o al
    // recargar- volverían los viejos sin explicación.
    sbActualizarPerfil({
      goal_protein_g: metasVigentes.P,
      goal_carbs_g:   metasVigentes.C,
      goal_fat_g:     metasVigentes.G
    })
      .then(function(){ toast('toastPeso', 'Macros guardados'); })
      ['catch'](function(e){
        toast('toastPeso', 'No se pudieron guardar: ' + traducirError(e.message));
      });
  });
  // ---- Cambiar el objetivo desde el Perfil ----
  // Cambiar de "mantener" a "bajar" recalcula las calorías, así que es el
  // mismo caso que editar los macros a mano: arranca semana nueva.
  var objSheet = document.getElementById('objSheet');
  var objElegido = null;

  function pintarPreviaObjetivo(){
    var antes = reg.objetivo;
    reg.objetivo = objElegido;              // se prueba el cálculo con el nuevo
    var m = calcularMacros();
    reg.objetivo = antes;                   // y se deja como estaba hasta guardar

    document.getElementById('objCal').textContent = mil(m.cal) + ' cal';
    document.getElementById('objNota').textContent =
      'Gastas ~' + mil(Math.round(m.gasto)) + ' al día · ' + textoRitmo(m.kgSemana) +
      ' · P ' + m.P + ' · C ' + m.C + ' · G ' + m.G;

    Array.from(document.querySelectorAll('#objOpts .meta-opt')).forEach(function(b){
      b.classList.toggle('active', b.dataset.obj === objElegido);
    });
    // Aquí había un aviso de que el conteo volvía a cero. Ya no vuelve: la
    // semana es de lunes a domingo y cambiar el objetivo no la corta.
  }

  document.getElementById('profObjetivoBtn').addEventListener('click', function(){
    objElegido = reg.objetivo;
    pintarPreviaObjetivo();
    objSheet.classList.add('open');
  });
  document.getElementById('objOpts').addEventListener('click', function(e){
    var b = e.target.closest('.meta-opt');
    if(!b) return;
    objElegido = b.dataset.obj;
    pintarPreviaObjetivo();
  });

  function cerrarObjetivo(){ objSheet.classList.remove('open'); objElegido = null; }
  document.getElementById('objCancelar').addEventListener('click', cerrarObjetivo);
  objSheet.addEventListener('click', function(e){ if(e.target === objSheet) cerrarObjetivo(); });

  document.getElementById('objGuardar').addEventListener('click', function(){
    if(!objElegido) return;
    reg.objetivo = objElegido;

    var m = calcularMacros();
    apuntarCambioDeMeta(calDe(metasVigentes || leerMetas()), calDe(m));
    goalP.value = m.P; goalC.value = m.C; goalG.value = m.G;
    metasVigentes = leerMetas();            // ya confirmado: no debe volver a preguntar
    document.getElementById('profObjetivo').innerHTML =
      NOMBRE_OBJ[reg.objetivo] + '<i>›</i>';

    // Igual que al cambiar los macros: la semana no se corta, sigue de lunes
    // a domingo, y las calorías nuevas valen desde hoy.
    cerrarObjetivo();
    actualizarSemana();
    toast('toastPeso', NOMBRE_OBJ[reg.objetivo] + ' · ' + mil(m.cal) + ' cal al día');

    sbActualizarPerfil({
      goal: reg.objetivo,
      goal_protein_g: m.P, goal_carbs_g: m.C, goal_fat_g: m.G
    })['catch'](function(e){
      toast('toastPeso', 'No se pudo guardar: ' + traducirError(e.message));
    });
  });

  // Cancelar devuelve los campos a como estaban: si no, quedarían con los
  // números nuevos en pantalla y la semana con los viejos, y el usuario
  // creería que se guardó.
  function cancelarMetas(){
    if(metasVigentes) escribirMetas(metasVigentes);
    cerrarConfirm();
    actualizarMetas();
    pintarMetasPendientes();
  }
  document.getElementById('wcCancel').addEventListener('click', cancelarMetas);
  weekConfirm.addEventListener('click', function(e){ if(e.target === weekConfirm) cancelarMetas(); });

  // ---- Metas de macros: el usuario edita gramos, las calorías se calculan solas ----
  // Proteína 4 cal/g · Carbos 4 cal/g · Grasas 9 cal/g
  var goalP = document.getElementById('goalP');
  var goalC = document.getElementById('goalC');
  var goalG = document.getElementById('goalG');

  function num(el, max){
    var v = Math.max(0, Math.min(max, Math.round(Number(el.value) || 0)));
    return v;
  }
  function mil(n){ return Math.round(n).toLocaleString('es-MX'); }

  // ---- El aviso de calorías que sobran o faltan ----
  // Se enseña UNA vez por día y se retira solo. Es un dato del arranque —
  // "hoy te tocan 600 menos"—, no algo que haya que tener delante todo el
  // rato: leído una vez, el resto del día solo estorba encima del anillo.
  //
  // Lo visto se guarda por fecha y no como un simple "ya se vio": así el
  // día siguiente vuelve a salir sin tener que borrar nada.
  var CLAVE_AVISO = 'macros.avisoAjuste';
  var SEGUNDOS_AVISO = 9;
  var avisoAjustePendiente = (function(){
    try{ return localStorage.getItem(CLAVE_AVISO) !== isoDe(HOY); }
    catch(e){ return true; }       // sin almacenamiento, mejor enseñarlo
  })();
  var relojAviso = null;

  function programarRetiradaDelAviso(){
    if(relojAviso) return;         // ya contando: no reiniciar en cada repintado
    try{ localStorage.setItem(CLAVE_AVISO, isoDe(HOY)); }catch(e){}
    relojAviso = setTimeout(function(){
      avisoAjustePendiente = false;
      var n = document.getElementById('ajusteNota');
      n.classList.add('yendose');
      // Se quita del todo cuando acaba el desvanecido, no antes: si se
      // vaciara ya, desaparecería de golpe y no se vería irse.
      setTimeout(function(){
        n.className = 'ajuste-nota';
        n.textContent = '';
      }, 400);
    }, SEGUNDOS_AVISO * 1000);
  }

  function actualizarMetas(){
    var P = num(goalP, 600), C = num(goalC, 900), G = num(goalG, 400);
    var calDia = P*4 + C*4 + G*9;
    var calSem = calDia * 7;   // lo sigue usando el anillo de la semana

    document.getElementById('calDay').textContent = mil(calDia);

    // ---- Balance semanal: lo que sobró o faltó se reparte entre los días que quedan ----
    // Meta de hoy = (meta de la semana − lo consumido antes de hoy) ÷ días que faltan (incluido hoy).
    // Sin piso mínimo: si te pasaste, el número queda bajo (o negativo) y así se muestra.
    var s = sumaSemana();
    var diasRestantes = Math.max(1, 8 - s.dia);      // en el día 7 queda 1: todo el saldo de golpe
    var antes = {P:0, C:0, G:0};
    var diasUsados = 0;                              // días ya pasados CON registro
    var dd = new Date(anclaSemana);
    while(dd < HOY){
      var reg = REGISTRO[iso(dd)];
      if(reg){ antes.P += reg.P; antes.C += reg.C; antes.G += reg.G; diasUsados++; }
      dd.setDate(dd.getDate() + 1);
    }

    // Solo cuentan los días que se usaron de verdad, no los siete.
    //
    // Antes se repartía (meta×7 − lo comido) entre los días que faltan. Con
    // la semana empezada eso regalaba calorías: quien apuntaba UN día y se
    // pasaba veía la meta de hoy SUBIR, porque los días en blanco anteriores
    // se leían como ahorro. Pasarse acababa premiando.
    //
    // El saldo se hace sobre los días con registro más los que quedan. Así
    // pasarse resta y ahorrar suma, que es lo que se espera, y los días en
    // los que no se usó la app no ponen ni quitan nada.
    var diasCuenta = diasUsados + diasRestantes;
    var hayHistorialSemana = diasUsados > 0;
    var metaHoy = hayHistorialSemana ? {
      P: (P*diasCuenta - antes.P) / diasRestantes,
      C: (C*diasCuenta - antes.C) / diasRestantes,
      G: (G*diasCuenta - antes.G) / diasRestantes
    } : {P:P, C:C, G:G};

    // Lo apartado para un evento sale de los días de ANTES. En el día del
    // evento no se recorta: ese día es el que se está protegiendo.
    //
    // El suelo se calcula sobre la meta base y no sobre la de hoy: si
    // alguien ya viene compensando, el margen que queda es menor, y
    // apartar sobre un suelo inflado dejaría días por debajo de lo sano.
    var hoyEsEvento = !!EVENTOS[isoDe(HOY)];
    var reserva = hoyEsEvento ? 0 : reservaDeLaSemana();
    var pisoDia = Math.max(1200, calDe({P:P, C:C, G:G}) * 0.65);
    if(reserva > 0){
      var conEvento = apartarParaEvento(metaHoy, diasRestantes, reserva, pisoDia);
      metaHoy = { P: conEvento.P, C: conEvento.C, G: conEvento.G };
    }

    // EL SUELO, COMO ÚLTIMA PALABRA Y PARA TODOS LOS CAMINOS.
    //
    // Antes solo existía dentro de `apartarParaEvento`, o sea únicamente
    // cuando había un evento apartando calorías. La compensación normal no
    // lo tenía, y la compensación no está acotada por abajo:
    //
    //   con 2.315 de meta, comiendo 1,5 veces eso cinco días seguidos
    //   -unas vacaciones, una Navidad- el día 5 salía 772 cal y el día 6
    //   MENOS 579.
    //
    // O sea: la app decía que comieras 772 calorías, por debajo de su
    // propio mínimo, y después números negativos que no significan nada.
    // Y lo decía justo al volver de una mala semana, que es cuando más
    // caso se le hace.
    //
    // Compensar está bien; castigar no. Lo que no cabe en la semana se
    // pierde, y se dice en voz alta más abajo.
    var pisoTocado = false;
    if(calDe(metaHoy) < pisoDia){
      pisoTocado = true;
      // La proteína se queda en su base: es lo que se protege cuando hay
      // que recortar. El resto del suelo se reparte entre carbos y grasa
      // en la misma proporción que ya tenía esta persona.
      var restoCal = Math.max(0, pisoDia - P * 4);
      var basC = C * 4, basG = G * 9, baseCG = basC + basG;
      metaHoy = baseCG > 0
        ? { P: P, C: (restoCal * (basC / baseCG)) / 4, G: (restoCal * (basG / baseCG)) / 9 }
        : { P: P, C: 0, G: 0 };
    }

    pintarEventos();
    var calHoyMeta = calDe(metaHoy);

    // El Diario usa estas metas y lo que realmente se ha registrado
    var hoy = REGISTRO[iso(HOY)] || {P:0,C:0,G:0};
    var sem = s.total;

    Array.from(document.querySelectorAll('.macros')).forEach(function(box){
      var esSemana = box.dataset.scope === 'semana';
      var metasBox = esSemana ? {P:P*7, C:C*7, G:G*7} : metaHoy;
      var comidoBox = esSemana ? sem : hoy;
      // Cada modo pinta la barra en su sentido, y la barra dice lo mismo
      // que la cifra que tiene al lado:
      //
      //   consumido → se LLENA según comes. Cuánto llevas.
      //   restantes → se VACÍA según comes. Cuánto te queda.
      //
      // Estuvieron las dos llenándose igual, con la idea de que una barra
      // que baja se lee al revés. Se cambia a petición: teniendo la cifra
      // de "te faltan 120 g" al lado, una barra que se llena mientras el
      // número baja es lo que de verdad se contradice.
      //
      // Pasarse deja la barra a cero en este modo: no queda nada, y eso es
      // exactamente lo que hay que ver.
      var restando = vistaAnillo === 'restantes';
      Array.from(box.querySelectorAll('.val')).forEach(function(el){
        var k = el.dataset.macro;
        var meta = metasBox[k];
        var comido = comidoBox[k] || 0;
        var pasado = restando && comido > meta;
        if(pasado){
          el.textContent = '+' + mil(comido - meta) + 'g exc';
        } else if(restando){
          el.textContent = mil(meta - comido) + 'g';
        } else {
          el.textContent = mil(comido) + '/' + mil(meta) + 'g';
        }
        el.classList.toggle('exc', pasado);
        var llevado = meta > 0 ? Math.min(100, comido / meta * 100) : 0;
        var pct = restando ? 100 - llevado : llevado;
        el.closest('.macro-row').querySelector('.bar-fill').style.width = pct + '%';
      });
    });

    // En "restantes" el anillo se vacía según se come. Y si ya se pasó, en
    // vez de quedarse clavado en cero enseña por cuánto.
    var restando = vistaAnillo === 'restantes';
    function pintarCard(cardId, comido, meta){
      if(!restando) return pintarAnillo(cardId, comido, meta, false);
      var pasado = comido > meta;
      pintarAnillo(cardId, pasado ? comido - meta : meta - comido, meta, pasado);
      return pasado;
    }
    var excHoy = pintarCard('cardHoy',    calDe(hoy), calHoyMeta);
    var excSem = pintarCard('cardSemana', calDe(sem), calSem);
    etiquetaAnillo('ringLabelHoy', excHoy);
    etiquetaAnillo('ringLabelSem', excSem);

    // Nota que explica por qué la meta de hoy cambió
    var nota = document.getElementById('ajusteNota');
    var dif = Math.round(calHoyMeta - calDia);
    if(pisoTocado){
      // Esta gana a todas las demás, incluso a "ya se enseñó hoy": no es un
      // ajuste, es que la compensación se paró en el mínimo. Callarlo
      // dejaría a alguien pensando que hoy le tocan 1.200 porque sí.
      nota.className = 'ajuste-nota debe';
      nota.textContent = 'Te pasaste bastante. Hoy te dejo en ' +
        mil(calHoyMeta) + ' cal y no menos: recuperarlo de golpe no es sano ' +
        'ni funciona. Lo que sobra se olvida.';
    } else if(!avisoAjustePendiente){
      // Ya se enseñó hoy: la nota no vuelve hasta mañana.
      nota.className = 'ajuste-nota';
      nota.textContent = '';
    } else if(Math.abs(dif) < 5){
      nota.className = 'ajuste-nota';
      nota.textContent = '';
    } else if(dif > 0){
      nota.className = 'ajuste-nota sobra';
      nota.textContent = diasRestantes === 1
        ? 'Último día: te sobran ' + mil(dif) + ' cal de la semana, van todas hoy.'
        : 'Te sobraron calorías de días anteriores: hoy puedes comer ' + mil(dif) +
          ' cal más, repartidas entre los ' + diasRestantes + ' días que faltan.';
    } else {
      nota.className = 'ajuste-nota debe';
      nota.textContent = diasRestantes === 1
        ? 'Último día: te pasaste, solo te quedan ' + mil(calHoyMeta) + ' cal.'
        : 'Te pasaste en días anteriores: hoy te tocan ' + mil(-dif) +
          ' cal menos, repartidas entre los ' + diasRestantes + ' días que faltan.';
    }
    if(nota.textContent) programarRetiradaDelAviso();
    document.getElementById('weekSummary').textContent =
      'P ' + P + ' · C ' + C + ' · G ' + G + ' · ' + mil(calDia) + ' cal/día · se reinicia cada ' + DIAS[inicioSemana];
  }
  // NO SE PREGUNTA AL SALIR DE CADA CAMPO.
  //
  //  Antes sí: el aviso colgaba del 'change' de los tres campos, así que
  //  tocabas carbos y, antes de llegar a las grasas, ya estaba preguntando
  //  si querías esas calorías. Cambiar los tres macros —que es UNA decisión—
  //  eran tres avisos seguidos, y los dos primeros sobre números a medias.
  //
  //  Ahora se cambian los tres con calma y se pulsa «Aceptar». El 'input'
  //  se queda: es lo que va enseñando las calorías mientras se teclea, y sin
  //  eso no se sabe a dónde se está llegando hasta pulsar.
  [goalP, goalC, goalG].forEach(function(el){
    el.addEventListener('input', function(){ actualizarMetas(); pintarMetasPendientes(); });
    el.addEventListener('blur', function(){
      el.value = num(el, 900); actualizarMetas(); pintarMetasPendientes();
    });
  });

  // El botón solo sale cuando hay algo distinto de lo guardado. Puesto
  // siempre no diría nada; así, que esté ahí ES el aviso de que falta
  // guardar.
  function pintarMetasPendientes(){
    var caja = document.getElementById('metasPendientesCaja');
    if(!caja) return;
    caja.hidden = mismasMetas(leerMetas(), metasVigentes);
  }
  document.getElementById('metasAceptar').addEventListener('click', pedirConfirmacionMetas);

  // Deshacer lo tecleado y no guardado. La llama `show()` al salir de
  // Perfil; sin esto, el Diario se quedaria con unas metas que no existen.
  //
  // Con la hoja de confirmar abierta NO se toca nada: ahi ya se esta
  // decidiendo, y `cancelarMetas` se encarga si se cancela.
  function revertirMetasSinGuardar(){
    if(!metasVigentes || metasPendientes) return;
    if(mismasMetas(leerMetas(), metasVigentes)) return;
    escribirMetas(metasVigentes);
    actualizarMetas();
    pintarMetasPendientes();
  }
  // Punto de partida: lo que hay en pantalla al arrancar. Va AQUÍ y no
  // arriba con las demás variables porque goalP/C/G se asignan en estas
  // líneas; leerlas antes daría error.
  metasVigentes = leerMetas();
  actualizarSemana(); // calcula el contador de días y, dentro, las metas

  // ---- Foto de perfil (cada usuario la suya) ----
  var avatarBox = document.getElementById('avatarBox');
  var avatarInput = document.getElementById('avatarInput');
  function pedirFoto(){ avatarInput.click(); }
  avatarBox.addEventListener('click', pedirFoto);
  document.getElementById('editPhotoBtn').addEventListener('click', pedirFoto);
  // ---- Encuadrar y guardar la foto de perfil ----
  // Antes solo se pintaba en pantalla: no se guardaba en ningún sitio, así
  // que al cerrar la app desaparecía. Y el recorte automático corta la cara
  // de casi todo el mundo, porque las fotos se toman con la cabeza arriba
  // y no en el centro.
  //
  // Se guarda YA RECORTADA, a 256 px. Así no hay que guardar también la
  // posición ni volver a recortar cada vez que se pinta: lo que se guardó
  // es exactamente lo que se ve.
  var LADO_AVATAR = 256;
  var avaSheet = document.getElementById('avatarSheet');
  var avaImg   = document.getElementById('avaImg');
  var avaZoom  = document.getElementById('avaZoom');
  var ava = { x:0, y:0, escala:1, natW:0, natH:0 };

  function pintarAva(){
    avaImg.style.transform =
      'translate(' + ava.x + 'px,' + ava.y + 'px) scale(' + ava.escala + ')';
  }

  avatarInput.addEventListener('change', function(){
    var file = avatarInput.files && avatarInput.files[0];
    avatarInput.value = '';            // deja volver a elegir la misma
    if(!file) return;
    var reader = new FileReader();
    // Los dos fallos posibles, dichos. Sin esto, elegir un archivo que no se
    // puede leer —o que el navegador no sabe decodificar, como un HEIC en un
    // móvil viejo— no abría la hoja de recortar y no pasaba absolutamente
    // nada: ni aviso, ni error. Desde fuera es «el botón no hace nada», que
    // es el sintoma más caro de esta app.
    reader.onerror = function(){
      toast('toastPerfil', 'No se pudo leer ese archivo. Prueba con otra foto.');
    };
    reader.onload = function(ev){
      avaImg.onerror = function(){
        toast('toastPerfil', 'Ese archivo no se ve como una imagen. Prueba con otra.');
      };
      avaImg.onload = function(){
        ava.natW = avaImg.naturalWidth;
        ava.natH = avaImg.naturalHeight;
        ava.x = 0; ava.y = 0; ava.escala = 1;
        avaZoom.value = 100;
        pintarAva();
        avaSheet.classList.add('open');
      };
      avaImg.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  avaZoom.addEventListener('input', function(){
    ava.escala = Number(this.value) / 100;
    pintarAva();
  });

  // Arrastrar con el dedo o con el ratón, sin librerías: son diez líneas.
  (function(){
    var marco = document.getElementById('avaMarco');
    var arrastrando = false, x0 = 0, y0 = 0, ax = 0, ay = 0;
    marco.addEventListener('pointerdown', function(e){
      arrastrando = true; x0 = e.clientX; y0 = e.clientY; ax = ava.x; ay = ava.y;
      marco.setPointerCapture(e.pointerId);
    });
    marco.addEventListener('pointermove', function(e){
      if(!arrastrando) return;
      e.preventDefault();            // o el móvil desplaza la hoja entera
      ava.x = ax + (e.clientX - x0);
      ava.y = ay + (e.clientY - y0);
      pintarAva();
    });
    ['pointerup','pointercancel'].forEach(function(ev){
      marco.addEventListener(ev, function(){ arrastrando = false; });
    });
  })();

  document.getElementById('avaCancelar').addEventListener('click', function(){
    avaSheet.classList.remove('open');
  });
  avaSheet.addEventListener('click', function(e){
    if(e.target === avaSheet) avaSheet.classList.remove('open');
  });

  document.getElementById('avaGuardar').addEventListener('click', function(){
    var marco = document.getElementById('avaMarco');
    var lado = marco.clientWidth;

    // El tamaño se lee de la imagen AHORA, no de lo guardado al abrir. Con
    // un 0 ahí las cuentas dan NaN, drawImage no pinta nada y el JPEG sale
    // negro —sin alfa, lo transparente se vuelve negro— sin ningún error.
    // Una foto negra guardada en silencio es de lo peor que puede pasar.
    var natW = avaImg.naturalWidth || ava.natW;
    var natH = avaImg.naturalHeight || ava.natH;
    if(!natW || !natH || !lado){
      toast('toastPerfil', 'No se pudo leer la foto. Inténtalo otra vez.');
      return;
    }

    // La imagen se pinta con `object-fit:cover`, así que primero se calcula
    // a qué escala la puso el navegador y desde ahí se traduce el arrastre
    // a coordenadas de la imagen original.
    var cubrir = Math.max(lado / natW, lado / natH) * ava.escala;
    var anchoP = natW * cubrir, altoP = natH * cubrir;
    var izq = (lado - anchoP) / 2 + ava.x;
    var arr = (lado - altoP) / 2 + ava.y;

    var c = document.createElement('canvas');
    c.width = c.height = LADO_AVATAR;
    var g = c.getContext('2d');
    // Fondo blanco antes de pintar: si la foto trae transparencia (un PNG
    // recortado), el JPEG la convertiría en negro.
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, LADO_AVATAR, LADO_AVATAR);
    var f = LADO_AVATAR / lado;
    g.drawImage(avaImg, izq * f, arr * f, anchoP * f, altoP * f);

    var url = c.toDataURL('image/jpeg', 0.85);
    avatarBox.innerHTML = '<img alt="Foto de perfil" src="' + url + '">';
    avaSheet.classList.remove('open');

    if(!sesion || !sesion.user) return;
    sbActualizarPerfil({ avatar_url: url })['catch'](function(e){
      toast('toastPerfil', 'No se pudo guardar la foto: ' + traducirError(e.message));
    });
  });

  function pintarAvatarGuardado(url){
    if(!url) return;
    avatarBox.innerHTML = '<img alt="Foto de perfil" src="' + url + '">';
  }

  // ---- Flujo de agregar comida (Desayuno / Comida / Cena) ----
  // Base de alimentos del usuario. Todo es entrada manual: macros por 100 g o por pieza.
  // Vacías a propósito: cada persona construye su propia despensa. Antes
  // traían ejemplos, pero ahora hay cuentas de verdad y a quien empieza no
  // le sirve encontrarse la Nutella de otro. `cargarDatos()` las rellena
  // con lo suyo.
  //
  // Se llenan EN SITIO (length = 0 y push), nunca reasignando: los
  // manejadores de clic guardan una referencia a estos mismos arrays, y
  // cambiarles la referencia los dejaría escuchando a la lista vieja.
  var FRECUENTES = [];
  var MIS_ALIMENTOS = [];
  var RECETAS = [];

  // Lo ya agregado a cada comida del día. Suma exactamente lo que el Diario
  // muestra como consumido hoy, para que ambas pantallas nunca se contradigan.
  // También vacío: el día empieza sin nada apuntado. Lo que haya de hoy lo
  // trae cargarDatos() desde la base.
  var COMIDAS = { Desayuno: [], Comida: [], Cena: [] };
  var comidaActual = 'Desayuno';

  function calAlim(a){ return a.P*4 + a.C*4 + a.G*9; }
  function un(x){ return (Math.round(x*10)/10); }
  function lineaMacros(a){
    return 'P ' + un(a.P) + 'g · C ' + un(a.C) + 'g · G ' + un(a.G) + 'g · ' +
           Math.round(calAlim(a)) + 'kcal · ' + a.u;
  }

  // ---- Cantidad de un alimento ya apuntado ----
  // Para poder cambiar "me comí 150 g y no 100" hacen falta dos cosas que
  // antes no se guardaban: cuánto se comió (cant) y los macros de UNA
  // porción base (porBase). Los P/C/G de la tarjeta son siempre lo
  // consumido; la base es lo que permite recalcularlos.
  // La onza NO va con los gramos. La pantalla pide «Macros por onza» y con
  // base 100 se guardaban como los de cien: el alimento se apuntaba con
  // cantidad 100 llevando los macros de UNA, y al corregir la cantidad a dos
  // onzas los macros salían divididos por cincuenta.
  function baseDeUnidad(u){ return u === 'Gramos' ? 100 : 1; }

  // Las cantidades ya guardadas que hoy querrían decir otra cosa. Vive aquí
  // una sola vez porque el diario se lee por dos caminos —el del arranque y
  // el de cambiar de día— y una regla escrita dos veces acaba corregida en un
  // sitio y no en el otro.
  function cantidadDeLaFila(unidad, cantidad){
    // Antes de que existiera la edición todo se guardaba con quantity=1
    // queriendo decir «una porción», no «1 gramo». Sin esto,
    // prepararAlimento() deduce que si 1 g da 20 g de proteína, 100 g dan
    // 2000: los macros salían multiplicados por cien.
    if(cantidad === 1 && baseDeUnidad(unidad) === 100) return 100;
    // Y las onzas se dieron de alta con la base de los gramos, así que «una
    // onza» quedó apuntada como 100. Se leen por lo que de verdad se comió.
    if(unidad === 'Onzas' && cantidad === 100) return 1;
    return cantidad;
  }

  function prepararAlimento(a){
    a.base = baseDeUnidad(a.u);
    if(a.cant == null) a.cant = a.base;        // recién agregado: una porción
    if(!a.porBase){
      // Al venir de la base de datos ya trae cantidad y macros consumidos,
      // así que la porción base se deduce dividiendo.
      var f = (a.cant / a.base) || 1;
      a.porBase = { P: a.P / f, C: a.C / f, G: a.G / f };
    }
    return a;
  }

  function aplicarCantidad(a, cant){
    a.cant = Math.max(0.1, Number(cant) || 0.1);
    var f = a.cant / a.base;
    a.P = Math.round(a.porBase.P * f * 10) / 10;
    a.C = Math.round(a.porBase.C * f * 10) / 10;
    a.G = Math.round(a.porBase.G * f * 10) / 10;
  }

  // En la comida interesa primero cuánto y cuántas calorías; los macros van
  // detrás y compactos, o la línea se parte en dos en un teléfono.
  function lineaComida(a){
    return un(a.cant) + ' ' + textoUnidad(a.cant, a.u) +
           ' · ' + Math.round(calAlim(a)) + ' kcal' +
           ' · P' + un(a.P) + ' C' + un(a.C) + ' G' + un(a.G);
  }

  // Las calorías de cada fila del Diario salen de lo que tiene esa comida
  function pintarFilasComidas(){
    Array.from(document.querySelectorAll('[data-cal]')).forEach(function(el){
      var t = (COMIDAS[el.dataset.cal] || []).reduce(function(s,a){
        s.P+=a.P; s.C+=a.C; s.G+=a.G; return s; }, {P:0,C:0,G:0});
      el.textContent = mil(Math.round(calAlim(t))) + ' cal ›';
    });
  }

  function pintarComida(){
    pintarFilasComidas();
    var lista = COMIDAS[comidaActual];
    var cont = document.getElementById('mealList');
    document.getElementById('mealAddTitle').textContent = comidaActual;
    document.getElementById('mealEmpty').style.display = lista.length ? 'none' : '';

    cont.innerHTML = lista.length ? '<div class="food-list">' + lista.map(function(a, i){
      prepararAlimento(a);
      return '<div class="food-card"><div class="fc-main"><div class="fc-name">'+escapar(a.n)+'</div>'+
        '<div class="fc-sub">'+lineaComida(a)+'</div></div>'+
        '<div class="fc-actions">'+
          // La estrella va primero y sin texto: es la acción que se repite
          // a diario, y las otras dos ya tienen su palabra.
          '<button class="btn-estrella'+(a.guardado?' on':'')+'" data-guardar="'+i+'" '+
            'title="'+(a.guardado?'Ya está en Guardados':'Guardar para encontrarlo rápido')+'">'+
            (a.guardado?'★':'☆')+'</button>'+
          '<button class="btn-mini edit" data-editar="'+i+'">Editar</button>'+
          '<button class="btn-mini del" data-quitar="'+i+'">Quitar</button>'+
        '</div></div>';
    }).join('') + '</div>' : '';

    var t = lista.reduce(function(s,a){ s.P+=a.P; s.C+=a.C; s.G+=a.G; return s; }, {P:0,C:0,G:0});
    document.getElementById('tP').textContent = un(t.P).toFixed(1) + ' g';
    document.getElementById('tC').textContent = un(t.C).toFixed(1) + ' g';
    document.getElementById('tG').textContent = un(t.G).toFixed(1) + ' g';
    var cal = Math.round(calAlim(t));
    document.getElementById('tCal').textContent = mil(cal) + ' cal';
    document.getElementById('mealAddCal').textContent = mil(cal) + ' cal';
  }

  // ---- El selector de día ----
  // Solo la semana que va corriendo, de su lunes a hoy. Más atrás ya no es
  // "se me olvidó apuntar", es reescribir la historia: son semanas que la app
  // ya dio por cerradas y sobre las que quizá ya ajustó calorías. El límite
  // está en pintarSelectorDia() y lo comprueba el manejador del cambio; aquí
  // vivía además un DIAS_ATRAS_APUNTE de 14 días que ya no usaba nadie y que
  // decía una regla distinta de la que se aplica.

  function pintarSelectorDia(){
    var inp = document.getElementById('mealFecha');
    var btn = document.getElementById('mealFechaBtn');
    var txt = document.getElementById('mealFechaTxt');
    if(!inp || !btn) return;
    inp.max = isoDe(HOY);
    // Solo la semana que va corriendo. Retocar días de semanas ya cerradas
    // es reescribir la historia: son semanas sobre las que la app quizá ya
    // ajustó calorías, y cambiarlas ahora descuadra ese ajuste sin que nadie
    // se entere. Lo de esta semana todavía no ha contado para nada.
    inp.min = isoDe(anclaSemana);
    inp.value = isoDe(diaDeApunte());

    // "Hoy" en vez de la fecha cuando es hoy: es lo que la persona espera
    // leer, y una fecha completa ahí obliga a comprobarla cada vez.
    var fuera = !apuntandoEnHoy();
    txt.textContent = fuera ? fmtFecha(diaDeApunte()) : 'Hoy';
    btn.classList.toggle('otro-dia', fuera);
  }

  // ---- Lo que se comió ESE día ----
  // Antes se podía apuntar en un día pasado, pero la lista seguía enseñando
  // la comida de hoy: no había forma de ver lo que ya había ahí, ni de
  // corregirlo. Se apuntaba a ciegas.
  //
  // Se pide solo ese día y no se guarda todo el historial en memoria: son
  // tres o cuatro filas y se consultan cuando hacen falta.
  function cargarComidasDelDia(fecha){
    COMIDAS.Desayuno = []; COMIDAS.Comida = []; COMIDAS.Cena = [];
    DIA_LISTA = isoDe(fecha);            // de quién es la lista, para sumarAlRegistro
    pintarComida();                      // vacío mientras llega
    if(!sesion || !sesion.user) return Promise.resolve();

    return sbFetch('/rest/v1/diary_entries' +
        '?select=id,meal,food_name,unit,quantity,protein_g,carbs_g,fat_g' +
        '&user_id=eq.' + sesion.user.id +
        '&entry_date=eq.' + isoDe(fecha) + '&order=created_at.asc')
      .then(function(filas){
        // Si mientras llegaba se cambió de día otra vez, esta respuesta ya
        // no vale: pintarla dejaría la lista de un día con el rótulo de otro.
        if(isoDe(diaDeApunte()) !== isoDe(fecha)) return;
        (filas || []).forEach(function(f){
          if(!COMIDAS[f.meal]) return;   // la base admite 'Snack', que no se lista
          var unidad = f.unit || 'Gramos';
          var cantidad = Number(f.quantity) || null;
          cantidad = cantidadDeLaFila(unidad, cantidad);
          COMIDAS[f.meal].push(prepararAlimento({
            id: f.id, n: f.food_name, u: unidad, cant: cantidad,
            P: Number(f.protein_g) || 0,
            C: Number(f.carbs_g)   || 0,
            G: Number(f.fat_g)     || 0
          }));
        });
        pintarComida();
      })['catch'](function(e){
        // Aquí NO se puede callar. Una lista vacía significa "ese día no
        // comiste nada", y si en realidad es "no pude leerlo", la persona
        // vuelve a apuntar lo que ya estaba y acaba con el día duplicado.
        // Mejor decirlo y que no se fíe de lo que ve.
        toast('toastComida', 'No pude leer ese día: ' + traducirError(e.message));
      });
  }

  (function(){
    var inp = document.getElementById('mealFecha');
    if(!inp) return;
    inp.addEventListener('change', function(){
      if(!this.value){ volverAHoyElApunte(); return; }
      // Mediodía y no medianoche: con las horas a cero, una zona horaria
      // por detrás de UTC convierte la fecha en el día anterior.
      var d = new Date(this.value + 'T12:00:00');
      d.setHours(0,0,0,0);

      // El selector trae `min` y `max`, pero eso solo manda en el calendario
      // que abre el teléfono: en el ordenador la fecha se teclea y `change`
      // salta igual con lo que se haya escrito. Por ahí se colaba apuntar en
      // un día futuro -comida que no se ha comido contando ya en la semana- y
      // en una semana ya cerrada, que es lo que el selector dice justamente
      // que no se puede hacer.
      if(isoDe(d) > isoDe(HOY) || isoDe(d) < isoDe(anclaSemana)){
        pintarSelectorDia();              // devuelve el input a lo que había
        toast('toastComida', 'Solo puedes apuntar en esta semana, hasta hoy.');
        return;
      }

      DIA_APUNTE = isoDe(d) === isoDe(HOY) ? null : d;
      pintarSelectorDia();
      cargarComidasDelDia(diaDeApunte());
    });
    // El input está encima de la píldora y transparente, así que el toque
    // ya cae en él. Este listener es para cuando el foco llega por teclado.
    document.getElementById('mealFechaBtn').addEventListener('click', function(){
      try{ inp.showPicker ? inp.showPicker() : inp.focus(); }catch(e){ inp.focus(); }
    });
  })();

  function agregarAlimento(a){
    var comida = comidaActual;      // se fija: la pantalla puede cambiar mientras se guarda
    var enHoy = apuntandoEnHoy();
    var dia = diaDeApunte();
    prepararAlimento(a);            // deja lista la cantidad y la porción base

    // COMIDAS es la lista del día que se está mirando, no la de hoy. Antes
    // era siempre la de hoy y por eso lo apuntado en un día pasado no
    // aparecía en ningún sitio: se guardaba bien y no había forma de verlo
    // ni de corregirlo.
    COMIDAS[comida].push(a);
    if(typeof sumarAlRegistro === 'function') sumarAlRegistro(a, +1);
    pintarComida();
    // El anillo y la semana son de HOY: si se apunta en otro día, hay que
    // rehacer la semana porque ese día ya cuenta para ella.
    if(!enHoy) actualizarSemana();

    volverA('mealadd', 'diario');   // conserva el camino: diario › mealadd
    toast('toastComida', a.n + ' agregado a ' + comida +
          (enHoy ? '' : ' del ' + fmtFecha(dia)));

    // Se guarda en segundo plano: la pantalla ya respondió, que es lo que
    // hace que la app se sienta rápida. Pero si el guardado falla hay que
    // deshacerlo — mostrar un alimento que no está guardado es peor que
    // no mostrarlo.
    if(sesion && sesion.user){
      sbAgregarAlimento(a, comida)
        .then(function(fila){ if(fila) a.id = fila.id; })
        ['catch'](function(e){
          // Se deshace sobre el MISMO día en que se sumó. Para cuando falla
          // la red, la persona ya puede haber cambiado la fecha, y restar
          // del día equivocado dejaría dos días mal en vez de uno.
          var eraDia = DIA_APUNTE;
          DIA_APUNTE = enHoy ? null : dia;
          var i = COMIDAS[comida].indexOf(a);
          if(i >= 0) COMIDAS[comida].splice(i, 1);
          sumarAlRegistro(a, -1);
          DIA_APUNTE = eraDia;

          // Se repinta siempre: la lista es la del día que se está
          // mirando, así que el alimento que se quita tiene que
          // desaparecer de ahí sea el día que sea.
          pintarComida();
          if(!enHoy) actualizarSemana();
          toast('toastComida', 'No se pudo guardar: ' + traducirError(e.message));
        });
    }
  }

  // ---- Editar cuánto se comió ----
  var cantSheet = document.getElementById('cantSheet');
  var cantValor = document.getElementById('cantValor');
  var alimentoEditando = null;

  function abreviarUnidad(u){ return u === 'Gramos' ? 'g' : u.toLowerCase(); }

  // Aquí se calculaba el ancho del campo midiendo el texto. Fuera: esa
  // medida depende de la fuente que acabe usando cada sistema y en el
  // teléfono salía corta, así que cortaba el último dígito. Ahora el ancho
  // es fijo en el CSS, con sitio de sobra, y no hay nada que pueda fallar.

  function pintarPreviaCantidad(){
    if(!alimentoEditando) return;
    var a = alimentoEditando;
    var f = (Number(cantValor.value) || 0) / a.base;
    var P = a.porBase.P * f, C = a.porBase.C * f, G = a.porBase.G * f;
    document.getElementById('cantCal').textContent = mil(P*4 + C*4 + G*9);
    // Con un decimal siempre, como la ficha de la comida: sin él, "6 g" y
    // "1.5 g" en la misma fila bailan de alto y se lee peor.
    document.getElementById('cantP').textContent = un(P).toFixed(1) + ' g';
    document.getElementById('cantC').textContent = un(C).toFixed(1) + ' g';
    document.getElementById('cantG').textContent = un(G).toFixed(1) + ' g';
  }

  // La misma hoja sirve para dos momentos: antes de apuntar algo que se
  // acaba de elegir, y para corregir algo ya apuntado. Cambia el texto del
  // botón y qué pasa al pulsarlo; todo lo demás es idéntico, y por eso no
  // son dos hojas.
  var confirmarCantidad = null;

  function textoBase(a){
    // Con su artículo y en singular. Salía de abreviarUnidad(), que devuelve
    // la unidad tal cual en minúsculas, y la hoja decía «por una onzas» y
    // «por una servicio».
    return UNIDAD_UNA[a.u] || UNIDAD_UNA.Gramos;
  }

  function abrirCantidad(a, opciones){
    opciones = opciones || {};
    alimentoEditando = prepararAlimento(a);
    confirmarCantidad = opciones.alConfirmar || guardarCantidadEditada;
    document.getElementById('cantNombre').textContent = a.n;
    document.getElementById('cantBase').textContent = 'por ' + textoBase(alimentoEditando);
    document.getElementById('cantUnidad').textContent = abreviarUnidad(a.u);
    document.getElementById('cantGuardar').textContent = opciones.etiqueta || 'Guardar';
    cantValor.value = a.cant;
    pintarPreviaCantidad();
    cantSheet.classList.add('open');
    // Con el número ya seleccionado: se teclea encima sin tener que borrarlo
    setTimeout(function(){ cantValor.focus(); cantValor.select(); }, 80);
  }

  // Elegir un alimento ya no lo apunta: primero se dice cuánto. Antes se
  // agregaba una porción base de golpe y había que entrar a corregirla,
  // que es un paso de más para algo que casi nunca es justo 100 g.
  // `guardado` es la ficha ORIGINAL de la lista, no la copia que se apunta.
  // Tiene que venir de fuera y no deducirse aquí: por el `id` no vale
  // —sbAgregarAlimento se lo pisa con el de la fila del diario, y un
  // alimento recién creado sin conexión todavía no tiene—, y por el nombre
  // tampoco, porque el catálogo trae nombres que pueden coincidir con los
  // tuyos. Quien llama sabe si esto salió de tus guardados; aquí no.
  function elegirAlimento(a, guardado){
    abrirCantidad(a, {
      etiqueta: 'Agregar',
      alConfirmar: function(){
        var elegido = alimentoEditando;
        aplicarCantidad(elegido, cantValor.value);
        cerrarCantidad();
        agregarAlimento(elegido);
        if(guardado) contarUso(guardado);
        // Después de contar el uso: contarUso() repinta las listas, y si se
        // vaciara antes las volvería a dejar filtradas por el texto viejo.
        limpiarBuscadoresDeAlimento();
      }
    });
  }

  // ---- Frecuentes ----
  // No es una lista aparte que haya que mantener: son tus mismos alimentos
  // guardados, los que ya has repetido lo bastante como para que valga la
  // pena tenerlos a un toque.
  var VECES_PARA_FRECUENTE = 5;

  function recalcularFrecuentes(){
    // En sitio: conectarLista() guarda una referencia a este array y
    // reasignarlo le haría perder el hilo de los clics.
    FRECUENTES.length = 0;
    MIS_ALIMENTOS.forEach(function(a){
      if((Number(a.veces) || 0) >= VECES_PARA_FRECUENTE) FRECUENTES.push(a);
    });
    // El que más repites, primero.
    FRECUENTES.sort(function(x, y){ return (y.veces || 0) - (x.veces || 0); });
  }

  function contarUso(a){
    a.veces = (Number(a.veces) || 0) + 1;
    var acabaDeEntrar = a.veces === VECES_PARA_FRECUENTE;
    recalcularFrecuentes();
    pintarListas();
    // Que se entere: si no, el alimento aparece en Frecuentes sin más y
    // nadie sabe por qué ni desde cuándo.
    if(acabaDeEntrar) toast('toastComida', a.n + ' ya está en tus frecuentes');

    // El contador vive en la base porque tiene que sobrevivir a cerrar la
    // app y seguir igual en el teléfono y en el ordenador. Se suma allí y
    // no aquí para que dos dispositivos a la vez no se pisen la cuenta.
    if(a.id && sesion && sesion.user){
      sbFetch('/rest/v1/rpc/registrar_uso_alimento', {
        method: 'POST',
        body: JSON.stringify({ p_alimento: a.id })
      })['catch'](function(){
        // Sin ruido: el contador de pantalla ya subió y la próxima carga
        // lo pondrá en su sitio. Fallar aquí no le estropea la comida a
        // nadie, y un aviso por esto sería puro estorbo.
      });
    }
  }

  cantValor.addEventListener('input', function(){
    // Tope de cuatro cifras: es lo que cabe en el campo, y por encima de
    // 9999 g de un solo alimento el dato ya no tiene sentido.
    if(Number(cantValor.value) > 9999) cantValor.value = '9999';
    pintarPreviaCantidad();
  });
  cantValor.addEventListener('keydown', function(e){
    if(e.key === 'Enter') document.getElementById('cantGuardar').click();
  });

  function cerrarCantidad(){ cantSheet.classList.remove('open'); alimentoEditando = null; }
  document.getElementById('cantCancelar').addEventListener('click', cerrarCantidad);
  cantSheet.addEventListener('click', function(e){ if(e.target === cantSheet) cerrarCantidad(); });

  // ---- La estrella: mandar un alimento a Guardados ----
  // Va a saved_foods, la misma tabla que alimenta la pestaña Guardados, y
  // se guarda por 100 g (base_qty) y no por lo que se comió hoy: si mañana
  // come otra cantidad, la ficha guardada tiene que seguir sirviendo.
  document.getElementById('mealList').addEventListener('click', function(e){
    var b = e.target.closest('[data-guardar]');
    if(!b) return;
    var a = COMIDAS[comidaActual][Number(b.dataset.guardar)];
    if(!a || a.guardado) { toast('toastComida', a && a.guardado ? 'Ya está en Guardados' : ''); return; }
    if(!sesion){ toast('toastComida', 'Inicia sesión para guardar'); return; }

    // ---- ¿YA LO TIENE, CON OTROS MACROS? ----
    //
    //  Este camino tambien se estrellaba: el `insert` chocaba con el indice
    //  unico, se devolvia la estrella a su sitio y salia «Ese ya estaba en
    //  Guardados». Cierto, pero callejon sin salida: si la ficha guardada
    //  estaba mal, no habia forma de corregirla desde aqui.
    //
    //  Se comprueba ANTES de tocar nada, con lo que ya esta en memoria.
    var yaEsta = guardadoIgual(a.n, a.u || 'Gramos');
    if(yaEsta){
      var nueva = { P: a.porBase ? a.porBase.P : a.P,
                    C: a.porBase ? a.porBase.C : a.C,
                    G: a.porBase ? a.porBase.G : a.G };
      var mismos = Math.round(nueva.P * 10) === Math.round(yaEsta.P * 10) &&
                   Math.round(nueva.C * 10) === Math.round(yaEsta.C * 10) &&
                   Math.round(nueva.G * 10) === Math.round(yaEsta.G * 10);
      // Si son los mismos macros no hay nada que preguntar: se dice y ya.
      if(mismos){
        a.guardado = true; a.id_guardado = yaEsta.id;
        pintarComida();
        toast('toastComida', 'Ya lo tenías guardado ★');
        return;
      }
      preguntar(
        'Ya lo tienes guardado',
        '«' + a.n + '» ya está en tus guardados con otros macros: ' +
        mil(Math.round(yaEsta.P * 4 + yaEsta.C * 4 + yaEsta.G * 9)) + ' cal por ' +
        (UNIDAD_BASE[a.u || 'Gramos'] || '100g') + ', y este tiene ' +
        mil(Math.round(nueva.P * 4 + nueva.C * 4 + nueva.G * 9)) +
        '. ¿Le cambio los macros a los de este?',
        'Sí, cambiarlos'
      ).then(function(cambiar){
        if(cambiar) actualizarGuardado(yaEsta, nueva.P, nueva.C, nueva.G);
        a.guardado = true; a.id_guardado = yaEsta.id;
        pintarComida();
      });
      return;
    }

    a.guardado = true;
    pintarComida();

    sbFetch('/rest/v1/saved_foods', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({
        user_id: sesion.user.id,
        name: a.n,
        unit: a.u || 'Gramos',
        base_qty: a.base || baseDeUnidad(a.u || 'Gramos'),
        // Los macros de UNA porción base, no los de hoy. prepararAlimento
        // ya los tiene calculados en porBase justamente para esto.
        protein_g: Math.round((a.porBase ? a.porBase.P : a.P) * 10) / 10,
        carbs_g:   Math.round((a.porBase ? a.porBase.C : a.C) * 10) / 10,
        fat_g:     Math.round((a.porBase ? a.porBase.G : a.G) * 10) / 10
      })
    }).then(function(f){
      var fila = f && f[0];
      if(fila) a.id_guardado = fila.id;
      // Se mete en la lista que ya está en memoria en vez de recargarlo
      // todo: aparece en Guardados al instante y sin ir a la red.
      MIS_ALIMENTOS.push({
        id: fila ? fila.id : null, n: a.n, u: a.u || 'Gramos',
        P: a.porBase ? a.porBase.P : a.P,
        C: a.porBase ? a.porBase.C : a.C,
        G: a.porBase ? a.porBase.G : a.G,
        veces: 0
      });
      if(typeof pintarListas === 'function') pintarListas();
      toast('toastComida', a.n + ' guardado ★');
    })['catch'](function(err){
      a.guardado = false; pintarComida();
      var m = err.message || '';
      toast('toastComida', /duplicate|unique/.test(m)
        ? 'Ese ya estaba en Guardados'
        : 'No se pudo guardar: ' + traducirError(m));
    });
  });

  document.getElementById('cantGuardar').addEventListener('click', function(){
    if(alimentoEditando && confirmarCantidad) confirmarCantidad();
  });

  // Cambia lo que va a mandar un alta que TODAVÍA ESTÁ EN LA COLA.
  //
  //  Al apuntar sin señal, el id lo pone el teléfono y `a.id` se asigna
  //  igual: el `catch` devuelve la fila que se iba a mandar. Así que editar
  //  la cantidad después mandaba un PATCH de una fila que el servidor no ha
  //  visto nunca. Sin señal eso falla y deshace la edición —no se puede
  //  corregir lo que acabas de apuntar—; y con señal recién vuelta, el
  //  PATCH no encuentra nada, PostgREST contesta 204 porque cero filas
  //  cambiadas no es un error, y después la cola sube la CANTIDAD VIEJA. La
  //  pantalla dice 150 y el servidor guarda 100.
  //
  //  Si el alta sigue pendiente, se retoca ahí y ya está: todavía no ha
  //  salido. Es la misma idea que `desencolar()` al borrar algo que no
  //  había subido — no mandar correcciones de lo que nadie ha visto.
  //
  //  Devuelve true si lo ha hecho, para que quien llame sepa que no tiene
  //  que mandar nada.
  //
  //  `tabla` dice a cuál de ellas: la cola lleva comidas y alimentos
  //  guardados a la vez, y los dos usan ids del mismo estilo. Sin mirarlo,
  //  editar los macros de un guardado podría metérselos a un apunte del
  //  diario que casualmente compartiera id.
  function retocarEnCola(id, cambios, tabla){
    if(!id) return false;
    for(var i = 0; i < COLA.length; i++){
      var x = COLA[i];
      // Por `fila` Y por ruta: la cola lleva pesos, fotos y borrados, y
      // retocar por id a secas podría meterle una cantidad a un peso.
      if(x.fila !== id || !x.op || !x.op.body) continue;
      if(x.ruta.indexOf(tabla || '/diary_entries') < 0) continue;
      var cuerpo;
      try { cuerpo = JSON.parse(x.op.body); } catch(e){ return false; }
      for(var k in cambios) if(cambios.hasOwnProperty(k)) cuerpo[k] = cambios[k];
      x.op.body = JSON.stringify(cuerpo);
      colaGuardar();
      return true;
    }
    return false;
  }

  function guardarCantidadEditada(){
    var a = alimentoEditando;
    var antes = { cant:a.cant, P:a.P, C:a.C, G:a.G };

    // El día lleva la cuenta de lo consumido, así que hay que restar lo
    // viejo antes de sumar lo nuevo o el anillo se descuadra.
    sumarAlRegistro(a, -1);
    aplicarCantidad(a, cantValor.value);
    sumarAlRegistro(a, +1);

    cerrarCantidad();
    pintarComida();
    toast('toastComida', a.n + ': ' + un(a.cant) + ' ' + abreviarUnidad(a.u));

    if(!a.id || !sesion) return;

    // Si su alta sigue en la cola, se cambia ahí y no hay nada que mandar.
    if(retocarEnCola(a.id, { quantity: a.cant, protein_g: a.P,
                             carbs_g: a.C, fat_g: a.G })) return;

    {
      sbFetch('/rest/v1/diary_entries?id=eq.' + a.id, {
        method:'PATCH', headers:{ 'Prefer':'return=minimal' },
        body: JSON.stringify({ quantity: a.cant, protein_g: a.P, carbs_g: a.C, fat_g: a.G })
      })['catch'](function(e){
        sumarAlRegistro(a, -1);
        a.cant = antes.cant; a.P = antes.P; a.C = antes.C; a.G = antes.G;
        sumarAlRegistro(a, +1);
        pintarComida();
        toast('toastComida', 'No se pudo guardar: ' + traducirError(e.message));
      });
    }
  }

  document.getElementById('mealList').addEventListener('click', function(e){
    var ed = e.target.closest('[data-editar]');
    if(ed){
      var aEd = COMIDAS[comidaActual][Number(ed.dataset.editar)];
      if(aEd) abrirCantidad(aEd);
      return;
    }
    var b = e.target.closest('[data-quitar]');
    if(!b) return;
    var comida = comidaActual;
    var dondeEstaba = Number(b.dataset.quitar);
    var quitado = COMIDAS[comida].splice(dondeEstaba, 1)[0];
    if(quitado && typeof sumarAlRegistro === 'function') sumarAlRegistro(quitado, -1);
    pintarComida();

    // Si estaba guardado, se borra también de la base. Si el borrado falla,
    // vuelve a su sitio: la pantalla no debe mentir sobre lo que hay guardado.
    if(quitado && quitado.id && sesion){
      sbQuitarAlimento(quitado.id)['catch'](function(e){
        // A su sitio, no al final. Con `push`, borrar el primero de tres y
        // que fallara lo devolvía el tercero: la lista queda distinta de
        // como estaba y parece que pasó algo más.
        COMIDAS[comida].splice(dondeEstaba, 0, quitado);
        sumarAlRegistro(quitado, +1);
        pintarComida();
        toast('toastComida', 'No se pudo borrar: ' + traducirError(e.message));
      });
    }
  });

  // Listas de Frecuentes y Mis alimentos
  function tarjeta(a, conAcciones){
    return '<div class="food-card" data-alim="'+escapar(a.n)+'">'+
      // Sin flechas de subir/bajar: no hacían nada. Eran dos botones cuya
      // única función era no agregar el alimento al tocarlos.
      '<div class="fc-main"><div class="fc-name">'+escapar(a.n)+'</div>'+
      '<div class="fc-sub">'+lineaMacros(a)+'</div></div>'+
      (conAcciones ? '<div class="fc-actions"><button class="btn-mini edit">Editar</button>'+
                     '<button class="btn-mini del">Borrar</button></div>' : '')+
      '</div>';
  }
  // Se pintan desde una función para poder repintarlas cuando lleguen los
  // datos del usuario. Cada lista dice qué hacer cuando está vacía: una
  // pantalla en blanco parece un error, y quien empieza las tendrá vacías.
  // Lo que hay escrito en cada buscador. Los campos existían desde el
  // maquetado pero no tenían id ni nadie los escuchaba: escribías y no
  // pasaba absolutamente nada, que es peor que no tener buscador.
  function textoDe(id){
    var e = document.getElementById(id);
    return e ? normalizarBusqueda(e.value.trim()) : '';
  }
  function filtrar(lista, texto, campo){
    if(!texto) return lista;
    return lista.filter(function(x){
      return normalizarBusqueda(x[campo] || '').indexOf(texto) >= 0;
    });
  }
  // Dos vacíos distintos: no es lo mismo no tener nada guardado que tener
  // cosas y que ninguna se llame así. El primero se arregla creando; el
  // segundo, borrando lo que escribiste.
  function vacio(hayTexto, texto, sinNada, sinCoincidencia){
    // El reemplazo va con función a propósito: en la forma de cadena, un
    // `$` de lo tecleado se interpreta como referencia y el mensaje sale
    // roto. Buscar "$5" no debería enseñar cualquier cosa.
    return '<div class="sin-datos">' +
      (hayTexto ? sinCoincidencia.replace('%s', function(){ return escapar(texto); }) : sinNada) +
      '</div>';
  }

  function pintarListas(){
    // Frecuentes no lleva buscador: es una lista corta de lo que más
    // repites, no un archivo donde haya que buscar.
    document.getElementById('frecList').innerHTML = FRECUENTES.length
      ? FRECUENTES.map(function(a){ return tarjeta(a, false); }).join('')
      : '<div class="sin-datos">Aquí aparecerán tus alimentos guardados en cuanto los apuntes ' +
        VECES_PARA_FRECUENTE + ' veces.</div>';

    var qMios = textoDe('buscarMisAlim');
    var mios = filtrar(MIS_ALIMENTOS, qMios, 'n');
    var escritoMios = document.getElementById('buscarMisAlim')
      ? document.getElementById('buscarMisAlim').value.trim() : '';
    document.getElementById('misAlimList').innerHTML = mios.length
      ? mios.map(function(a){ return tarjeta(a, true); }).join('')
      : vacio(!!qMios, escritoMios,
              'Todavía no has guardado alimentos. Créalos en la pestaña «Crear».',
              'No tienes «%s» entre tus alimentos guardados. Créalo en la pestaña «Crear» y quedará aquí.');

    var qRec = textoDe('buscarRecetas');
    var recs = filtrar(RECETAS, qRec, 'n');
    var escritoRec = document.getElementById('buscarRecetas')
      ? document.getElementById('buscarRecetas').value.trim() : '';
    document.getElementById('recetaList').innerHTML = recs.length
      ? recs.map(function(r){
          return '<div class="food-card"><div class="fc-main"><div class="fc-name">'+escapar(r.n)+'</div>'+
            '<div class="fc-sub">'+r.cal+' kcal por porción · '+r.vis+'</div></div>'+
            '<span style="color:var(--ink-faint)">›</span></div>';
        }).join('')
      : vacio(!!qRec, escritoRec,
              'Todavía no tienes recetas.',
              'No tienes ninguna receta que se llame «%s».');
  }
  pintarListas();

  // Al escribir se repinta la lista. `input` y no `change`: filtra mientras
  // se teclea, que es lo que espera cualquiera.
  ['buscarMisAlim', 'buscarRecetas'].forEach(function(id){
    var e = document.getElementById(id);
    if(e) e.addEventListener('input', pintarListas);
  });

  function conectarLista(id, datos){
    document.getElementById(id).addEventListener('click', function(e){
      var card = e.target.closest('.food-card');
      if(!card) return;
      var a = datos.filter(function(x){ return x.n === card.dataset.alim; })[0];
      if(!a) return;

      // Editar y Borrar tienen que ir ANTES de agregar: los dos viven
      // dentro de la tarjeta, y sin esto tocar cualquiera de ellos abriría
      // además la hoja de cantidad.
      if(e.target.closest('.btn-mini.edit')){ editarGuardado(a); return; }
      if(e.target.closest('.btn-mini.del')){ borrarGuardado(a); return; }

      // Copia: la hoja va a fijarle cantidad y porción base, y no debe
      // tocar la ficha que vive en la lista.
      // Se manda la copia para apuntar y la ficha original para contarle el
      // uso: las dos listas que pasan por aquí -frecuentes y guardados- son
      // tuyas, así que todo lo que se elija desde ellas cuenta.
      elegirAlimento(Object.assign({}, a), a);
    });
  }
  conectarLista('frecList', FRECUENTES);
  conectarLista('misAlimList', MIS_ALIMENTOS);

  // ---- Editar y borrar un alimento de Guardados ----
  // Los botones estaban pintados desde el principio pero no hacían nada:
  // el manejador de la lista los descartaba y no había ningún otro
  // escuchándolos. Se reaprovecha la pantalla de "Crear" en lugar de
  // duplicar el formulario; solo cambia a qué alimento apunta al guardar.
  var alimentoGuardadoEditando = null;

  function editarGuardado(a){
    alimentoGuardadoEditando = a;
    document.getElementById('nfTitulo').textContent = 'Editar alimento';
    document.getElementById('nfSave').textContent = 'Guardar cambios';
    document.getElementById('nfName').value = a.n;
    nfP.value = a.P || ''; nfC.value = a.C || ''; nfG.value = a.G || '';
    ponerUnidad(a.u || 'Gramos');
    calcNuevo();
    goto('crearalimento', true);
  }

  function borrarGuardado(a){
    if(!confirm('¿Borrar "' + a.n + '" de Guardados?')) return;
    var i = MIS_ALIMENTOS.indexOf(a);
    if(i < 0) return;
    MIS_ALIMENTOS.splice(i, 1);
    // Frecuentes sale de MIS_ALIMENTOS, así que se recalcula en vez de
    // andar buscando la posición: al ir ordenado por usos, el índice de
    // una lista no vale para la otra.
    recalcularFrecuentes();
    pintarListas();
    toast('toastGuardados', a.n + ' borrado');

    if(!a.id || !sesion) return;

    // Si su alta sigue en la cola, se cancela y no se manda nada. Un DELETE
    // de una fila que el servidor no ha visto nunca no borra —cero filas es
    // un 204 normal, sin error— y luego la cola sube el alta: el alimento
    // RESUCITA al recargar. Es lo mismo que ya hace `sbQuitarAlimento`.
    if(desencolar(a.id)) return;

    // Si el borrado falla se devuelve a la lista: enseñar como borrado algo
    // que sigue en la base es peor que no borrarlo.
    {
      sbFetch('/rest/v1/saved_foods?id=eq.' + a.id, { method:'DELETE' })
        ['catch'](function(e){
          MIS_ALIMENTOS.splice(i, 0, a);
          recalcularFrecuentes();
          pintarListas();
          toast('toastGuardados', 'No se pudo borrar: ' + traducirError(e.message));
        });
    }
  }

  // ---- Sugerencias mientras escribes ----
  // Salen de lo que otras personas ya guardaron. Qué se sugiere y qué no lo
  // decide la base (buscar_alimentos): solo aparece lo que varias personas
  // han creado por separado, así nadie enseña sin querer sus alimentos.
  var mealSearch = document.getElementById('mealSearch');
  var mealSugeridos = document.getElementById('mealSugeridos');
  var SUGERIDOS = [], relojBusqueda = null;

  // Dos fuentes, y el orden importa: primero el catálogo -datos de USDA,
  // medidos- y debajo lo que registra la gente, que es estimado. Quien
  // busca "pollo" debe encontrar antes el dato bueno.
  // `sinRed` = las dos búsquedas del servidor fallaron por falta de señal.
  //
  // NO ES UN DETALLE DE REDACCIÓN. Sin esto el mensaje decía «No encontré
  // «salmón»» cuando en realidad no había mirado: el catálogo vive en el
  // servidor y sin señal no se consulta. Quien lee eso concluye que ese
  // alimento no está en la app y lo crea a mano con macros a ojo — cuando
  // en el catálogo estaba, medido. La app afirmaba algo que no comprobó.
  function pintarSugerencias(lista, texto, sinRed){
    if(!texto || texto.length < 2){ mealSugeridos.innerHTML = ''; return; }

    var deMios     = lista.filter(function(a){ return a.fuente === 'mio'; });
    var deCatalogo = lista.filter(function(a){ return a.fuente === 'catalogo'; });
    var deGente    = lista.filter(function(a){ return a.fuente === 'gente'; });

    if(!lista.length){
      mealSugeridos.innerHTML = '<p class="calc-note" style="padding:14px 20px 0;">' +
        (sinRed
          ? 'Sin conexión: ahora solo puedo buscar entre tus alimentos guardados, ' +
            'y «' + escapar(texto) + '» no está ahí. Puedes crearlo en la pestaña ' +
            '«Crear» y se subirá cuando vuelva la señal, o esperar a tener red ' +
            'para buscarlo en el catálogo.'
          : 'No encontré «' + escapar(texto) + '». Créalo en la pestaña «Crear»: ' +
            'quedará guardado para ti y, si otras personas lo registran también, ' +
            'empezará a sugerirse solo.') +
        '</p>';
      return;
    }

    // Y si SÍ hay resultados pero eran solo los tuyos, se dice igual: ver
    // dos alimentos donde normalmente salen doce hace pensar que el
    // catálogo se quedó corto, no que no se ha consultado.
    var aviso = sinRed
      ? '<p class="calc-note" style="padding:12px 20px 0;">Sin conexión: solo tus ' +
        'alimentos guardados. El catálogo vuelve con la señal.</p>'
      : '';

    // Cada procedencia con su franja. Antes los dos bloques se distinguían
    // solo por un título del mismo color que el resto y las tarjetas se
    // leían como una lista sola: no había forma de saber qué venía de la
    // base de datos y qué de otra gente.
    var bloque = function(titulo, sub, arr){
      if(!arr.length) return '';
      return '<div class="sug-franja">' + titulo + '<small>' + sub + '</small></div>' +
        '<div class="food-list">' + arr.map(function(a){
          return '<div class="food-card" data-sug="' + lista.indexOf(a) + '">' +
            '<div class="fc-main"><div class="fc-name">' + escapar(a.n) +
              (a.estado && a.estado !== 'unico'
                ? ' <span class="cat-estado">' + escapar(a.estado) + '</span>' : '') + '</div>' +
            '<div class="fc-sub">' + lineaMacros(a) +
              (a.personas ? ' · lo usan ' + a.personas : '') + '</div></div>' +
            '<span style="color:var(--ink-faint);font-size:19px;">+</span></div>';
        }).join('') + '</div>';
    };

    mealSugeridos.innerHTML = aviso +
      bloque('Tus guardados', 'lo que ya usas', deMios) +
      bloque('Base de datos', 'medido, en gramos', deCatalogo) +
      bloque('De otras personas', 'lo que registran otros', deGente);
  }

  function buscarSugerencias(){
    var texto = mealSearch.value.trim();
    if(texto.length < 2 || !sesion){ SUGERIDOS = []; pintarSugerencias([], texto); return; }

    // Las dos búsquedas van a la vez. Si una falla, la otra sigue
    // sirviendo: quedarse sin catálogo no debe dejar sin sugerencias.
    //
    // Pero se APUNTA si el fallo fue por falta de señal, porque cambia lo
    // que hay que decirle a la persona: «no lo encontré» y «no pude
    // buscarlo» son cosas distintas y llevan a decisiones distintas.
    var sinRed = false;
    var falloBusqueda = function(e){
      if(sinConexion(e)) sinRed = true;
      return [];
    };
    Promise.all([
      sbRpc('buscar_catalogo',  { p_texto: texto, p_limite: 12 })['catch'](falloBusqueda),
      sbRpc('buscar_alimentos', { p_texto: texto, p_limite: 8  })['catch'](falloBusqueda)
    ]).then(function(r){
      // Si mientras llegaba la respuesta ya se escribió otra cosa, esta sobra
      if(mealSearch.value.trim() !== texto) return;

      // El catálogo va en gramos, tal y como viene de USDA: por 100 g y sin
      // convertir. La excepción son los alimentos con `pieza_g`, que dicen
      // cuánto pesa UNA unidad de comer de verdad. Hoy solo los huevos:
      // nadie pesa un huevo, se dicen "dos huevos".
      //
      // Antes, si el alimento traía peso de porción se ofrecía en "piezas"
      // y los macros se multiplicaban por ese peso. La idea era acercarse a
      // como mide la gente, pero la porción de USDA no es una pieza: son
      // cosas como "cup, chopped", "oz" o "cup spaghetti". De 164 alimentos
      // ninguno dice cuántos gramos pesa una unidad de comer. Así que
      // "1 Pieza" de espagueti acababa significando una taza, y nadie
      // podía saberlo mirando la pantalla.
      //
      // En gramos el dato es el que es y se pesa. Si algún día hace falta
      // ofrecer piezas, tiene que salir de un peso por pieza de verdad, no
      // de reinterpretar el texto de la porción.
      var cat = (r[0] || []).map(function(x){
        var P = Number(x.proteina) || 0,
            C = Number(x.carbos)   || 0,
            G = Number(x.grasas)   || 0;
        // La unidad la dice la fila, no se deduce del dato. Antes se
        // asumía "si hay pieza_g, es una pieza", y eso valía mientras la
        // pieza fuese la única forma de contar que no era gramos. Desde que
        // el panel puede dar de alta servicios, cuánto pesa una unidad y
        // cómo se llama esa unidad son dos cosas distintas.
        //
        // El peso sigue saliendo de `pieza_g`, un peso medido, y nunca del
        // texto de la porción: de ahí venía que "1 Pieza" de espagueti
        // acabara siendo una taza.
        var pz = Number(x.pieza_g) || 0;
        var uni = x.unidad || 'Gramos';

        // LOS MACROS DE LA FILA SON LOS DE UNA UNIDAD.
        //
        // No hay nada que convertir: se cogen tal cual. Existe para poder dar
        // de alta algo por piezas SIN saber cuánto pesa una, que es lo normal
        // -de un huevo o de una barrita sabes lo que dice la caja, no lo que
        // pesa-. Antes había que inventarse un peso para poder guardarlo, y
        // un peso inventado se propaga a todas las cantidades.
        if(uni !== 'Gramos' && x.macros_por === 'unidad'){
          return { fuente:'catalogo', n:x.nombre, estado:x.estado,
                   u:uni, cant:1, P:P, C:C, G:G };
        }

        // Y lo de siempre: por 100 g, convertidos con el peso de una unidad.
        if(uni !== 'Gramos' && pz > 0){
          var por = function(v){ return Math.round(v * pz / 100 * 10) / 10; };
          return { fuente:'catalogo', n:x.nombre, estado:x.estado,
                   u:uni, cant:1, P:por(P), C:por(C), G:por(G) };
        }
        return { fuente:'catalogo', n:x.nombre, estado:x.estado,
                 u:'Gramos', cant:100, P:P, C:C, G:G };
      });

      var gente = (r[1] || []).map(function(x){
        return { fuente:'gente', n:x.nombre, u:x.unit, personas:x.personas, cant:null,
                 P:Number(x.protein_g)||0, C:Number(x.carbs_g)||0, G:Number(x.fat_g)||0 };
      // Lo que ya está en el catálogo no se repite abajo.
      }).filter(function(x){
        return !cat.some(function(c){
          return normalizarBusqueda(c.n) === normalizarBusqueda(x.n); });
      });

      // Lo que la persona ya guardó va PRIMERO y no hace falta pedirlo: ya
      // está en memoria. Antes no aparecía en la búsqueda —solo en la
      // pestaña Guardados—, así que escribir "avena" no encontraba tu
      // propia avena y acababas eligiendo la de otro.
      var suyo = normalizarBusqueda(texto);
      var mios = MIS_ALIMENTOS.filter(function(a){
        return normalizarBusqueda(a.n).indexOf(suyo) >= 0;
      }).map(function(a){
        return { fuente:'mio', n:a.n, u:a.u || 'Gramos', cant:null,
                 P:Number(a.P)||0, C:Number(a.C)||0, G:Number(a.G)||0 };
      });

      // Lo suyo manda: si ya lo tiene guardado, no se repite abajo.
      var noRepetido = function(x){
        return !mios.some(function(m){
          return normalizarBusqueda(m.n) === normalizarBusqueda(x.n); });
      };

      SUGERIDOS = mios.concat(cat.filter(noRepetido), gente.filter(noRepetido));
      pintarSugerencias(SUGERIDOS, texto, sinRed);
    });
  }

  // Misma normalización que usa la base (0012): sin acentos y en
  // minúsculas, para que "Plátano" y "platano" cuenten como el mismo.
  function normalizarBusqueda(s){
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  mealSearch.addEventListener('input', function(){
    clearTimeout(relojBusqueda);
    // Con retardo: una petición por tecla saturaría por nada
    relojBusqueda = setTimeout(buscarSugerencias, 350);
  });

  mealSugeridos.addEventListener('click', function(e){
    var c = e.target.closest('[data-sug]');
    if(!c) return;
    var a = SUGERIDOS[Number(c.dataset.sug)];
    if(!a) return;
    // Aquí se vaciaba el buscador nada más tocar el alimento. Se quitó: en
    // medio está la hoja de la cantidad, y quien la cancela se encontraba
    // la búsqueda borrada sin haber apuntado nada. Ahora se vacía al
    // registrarlo de verdad, en limpiarBuscadoresDeAlimento().
    // El nombre lleva el estado cuando lo tiene: en el diario hay que
    // poder distinguir el arroz crudo del cocido de un vistazo, que es
    // toda la razón de que sean registros separados.
    var nombre = (a.estado && a.estado !== 'unico') ? a.n + ' (' + a.estado + ')' : a.n;
    elegirAlimento({ n:nombre, u:a.u, cant:a.cant || undefined, P:a.P, C:a.C, G:a.G });
  });

  // ---- Al registrar un alimento, los buscadores se vacían ----
  // Escribir "huevo", apuntarlo, y tener que borrar "huevo" a mano para
  // buscar lo siguiente es trabajo que la app puede ahorrarse: cuando ya lo
  // apuntaste, esa palabra no le sirve a nadie.
  //
  // Se llama al CONFIRMAR, no al tocar el alimento: entre una cosa y otra
  // está la hoja de la cantidad, y quien la cancela quiere volver a su
  // búsqueda, no encontrarla borrada.
  function limpiarBuscadoresDeAlimento(){
    // Lo primero: si hay una búsqueda esperando su turno, al llegar
    // repintaría las sugerencias que acabamos de quitar.
    clearTimeout(relojBusqueda);
    mealSearch.value = '';
    mealSugeridos.innerHTML = '';
    SUGERIDOS = [];
    ['buscarMisAlim', 'buscarRecetas'].forEach(function(id){
      var e = document.getElementById(id);
      if(e) e.value = '';
    });
    // Y las listas vuelven a salir enteras, que si no quedarían filtradas
    // por una palabra que ya no está escrita en ningún sitio.
    pintarListas();
  }

  // Crear alimento: las calorías salen solas de los macros
  var unitPills = document.getElementById('unitPills');
  var unidadActual = 'Gramos';
  var UNIDAD_ABREV = {Gramos:'(g)', Pieza:'(pza)', Servicio:'(serv)', Taza:'(taza)', Cucharada:'(cda)', Onzas:'(oz)'};
  var UNIDAD_BASE  = {Gramos:'100g', Pieza:'pieza', Servicio:'servicio', Taza:'taza', Cucharada:'cucharada', Onzas:'onza'};
  // Lo mismo, con artículo, para la hoja de la cantidad: «por una onza».
  var UNIDAD_UNA   = {Gramos:'100 g', Pieza:'una pieza', Servicio:'un servicio', Taza:'una taza', Cucharada:'una cucharada', Onzas:'una onza'};

  // «2 piezas», no «2 pieza».
  //
  // Se escribía `a.u.toLowerCase()`, que devuelve el nombre de la unidad tal
  // cual: en singular siempre, y en el caso de las onzas siempre en plural.
  // Los gramos van con su abreviatura y no se pluralizan.
  //
  // El plural sale de UNIDAD_BASE, que ya tiene el singular bueno, y todas
  // estas palabras lo hacen igual: pieza→piezas, taza→tazas, onza→onzas.
  function textoUnidad(cant, u){
    var s = UNIDAD_BASE[u];
    if(!s || u === 'Gramos') return 'g';
    return Math.abs(Number(cant)) === 1 ? s : s + 's';
  }

  // Sacado del manejador para poder dejar la unidad puesta desde fuera, al
  // abrir la pantalla para editar un alimento que ya la tiene.
  function ponerUnidad(u){
    if(!UNIDAD_ABREV[u]) u = 'Gramos';
    unidadActual = u;
    Array.from(unitPills.querySelectorAll('button')).forEach(function(x){
      x.classList.toggle('active', x.textContent === u);
    });
    document.getElementById('unitLabel').textContent = UNIDAD_ABREV[u];
    document.getElementById('baseLabel').textContent = UNIDAD_BASE[u];

    // Y LA CANTIDAD, al número que tenga sentido para esa unidad.
    //
    // El `value="100"` está escrito en el HTML y no lo cambiaba nadie, así
    // que al elegir «Pieza» la caja seguía diciendo 100 con la etiqueta
    // (pza) —como si fueras a apuntar cien huevos— y luego se apuntaba uno.
    // La pantalla decía una cosa y la app hacía otra.
    var q = document.getElementById('nfQty');
    if(q) q.value = baseDeUnidad(u);
    if(typeof pintarTotalNuevo === 'function') pintarTotalNuevo();
  }

  unitPills.addEventListener('click', function(e){
    var b = e.target.closest('button');
    if(b) ponerUnidad(b.textContent);
  });

  var nfP = document.getElementById('nfP'), nfC = document.getElementById('nfC'), nfG = document.getElementById('nfG');
  function calcNuevo(){
    var P = Number(nfP.value)||0, C = Number(nfC.value)||0, G = Number(nfG.value)||0;
    document.getElementById('nfCal').textContent = mil(P*4 + C*4 + G*9);
    pintarTotalNuevo();
  }

  // LO QUE SE TECLEA, CONVERTIDO EN ALIMENTO.
  //
  // Son dos cosas distintas y hasta ahora la segunda no se leía:
  //
  //   · los macros van POR PORCIÓN BASE —la etiqueta dice «Macros por 100g»—
  //   · la cantidad es lo que se va a apuntar AHORA
  //
  // `nfQty` no aparecía ni una vez en este archivo. Se escribía 150 y se
  // apuntaban 100: la caja estaba ahí de adorno.
  //
  // Sale como función suya, y no dentro del manejador del botón, para poder
  // ejecutarla en una prueba con números y sin pantalla.
  function alimentoDelFormulario(nombre, P, C, G, unidad, cantidad){
    var a = { n: nombre, u: unidad, porBase: { P:P, C:C, G:G }, P:P, C:C, G:G };
    a.base = baseDeUnidad(unidad);
    var cant = Number(cantidad);
    // Vacío, cero o un disparate: una porción, que es lo que ya hacía antes.
    if(!(cant > 0)) cant = a.base;
    aplicarCantidad(a, cant);
    return a;
  }

  // Lo que se va a apuntar, debajo de la cantidad. Los macros se escriben
  // por 100 g y se apunta otra cosa: sin esto hay que multiplicar de cabeza
  // para saber qué va a entrar en el diario, y nadie lo hace.
  function pintarTotalNuevo(){
    var caja = document.getElementById('nfTotal');
    if(!caja) return;
    var q = document.getElementById('nfQty');
    var a = alimentoDelFormulario('x',
      Number(nfP.value)||0, Number(nfC.value)||0, Number(nfG.value)||0,
      unidadActual, q ? q.value : '');
    var cal = Math.round(calAlim(a));
    if(!cal){ caja.textContent = ' '; return; }
    caja.textContent = 'Se apunta ' + un(a.cant) + ' ' + textoUnidad(a.cant, a.u) +
      ' · ' + mil(cal) + ' cal · P' + un(a.P) + ' C' + un(a.C) + ' G' + un(a.G);
  }

  [nfP, nfC, nfG].forEach(function(el){ el.addEventListener('input', calcNuevo); });
  (function(){
    var q = document.getElementById('nfQty');
    if(q) q.addEventListener('input', pintarTotalNuevo);
  })();

  // Se vuelve a "crear" siempre que se entra por el botón Crear: si no, la
  // pantalla se quedaría en modo editar desde la vez anterior.
  function limpiarFormularioAlimento(){
    alimentoGuardadoEditando = null;
    document.getElementById('nfTitulo').textContent = 'Agregar alimento';
    document.getElementById('nfSave').textContent = 'Guardar alimento';
    document.getElementById('nfName').value = '';
    nfP.value = ''; nfC.value = ''; nfG.value = '';
    ponerUnidad('Gramos');            // deja también la cantidad en 100
    calcNuevo();
  }
  document.getElementById('pillCrear').addEventListener('click', limpiarFormularioAlimento);

  // ---- Preguntar antes de hacer algo ----
  //
  //  Devuelve una promesa que se resuelve con true o false, para poder
  //  escribir `preguntar(...).then(function(si){ ... })` en vez de partir la
  //  funcion en dos por culpa de un dialogo.
  //
  //  Es una hoja y no el `confirm()` del navegador: en iPhone ese sale con
  //  «eduardoentrala.github.io dice:» encima, que delata que esto es una
  //  pagina web. Los cuatro `confirm()` que quedan son de cosas que se hacen
  //  una vez al ano -suspender a alguien, borrar-; este se va a ver seguido.
  function preguntar(titulo, texto, textoSi){
    return new Promise(function(listo){
      var hoja = document.getElementById('preguntaSheet');
      var si = document.getElementById('preguntaSi');
      var no = document.getElementById('preguntaNo');
      var tit = document.getElementById('preguntaTitulo');
      var txt = document.getElementById('preguntaTexto');

      // SI LA HOJA NO ESTÁ, SE CANCELA Y SE DICE. No se espera.
      //
      //  Esta promesa solo se resuelve cuando alguien pulsa uno de sus dos
      //  botones. Sin hoja no hay pulsación posible, así que el flujo que la
      //  esperaba —apuntar la comida, guardar el alimento— no continúa
      //  nunca, y no queda un solo error en ninguna consola. Desde fuera es
      //  «le doy a guardar y no pasa nada», que es el sintoma más caro de
      //  esta app y ya costó una tarde.
      //
      //  Se responde que NO, o sea cancelar: los que llaman ya lo tratan, y
      //  en el caso que dolió —«¿le cambio los macros?»— cancelar significa
      //  no tocar la ficha Y APUNTAR LA COMIDA IGUAL, que es a lo que la
      //  persona venía.
      if(!hoja || !si || !no || !tit || !txt){
        toast('toastComida', 'No pude abrir la confirmación. Inténtalo otra vez.');
        listo(false);
        return;
      }

      tit.textContent = titulo;
      txt.textContent = texto;
      si.textContent = textoSi || 'Sí';

      var cerrar = function(respuesta){
        hoja.classList.remove('open');
        si.removeEventListener('click', alSi);
        no.removeEventListener('click', alNo);
        hoja.removeEventListener('click', alFondo);
        listo(respuesta);
      };
      var alSi = function(){ cerrar(true); };
      var alNo = function(){ cerrar(false); };
      // Tocar fuera es cancelar, como en todas las hojas de la app.
      var alFondo = function(e){ if(e.target === hoja) cerrar(false); };

      si.addEventListener('click', alSi);
      no.addEventListener('click', alNo);
      hoja.addEventListener('click', alFondo);
      hoja.classList.add('open');

      // Y ABIERTA, ¿SE VE? `offsetParent` nulo quiere decir que no se está
      // pintando — la misma comprobación que usa `toast()`, y la que cubre
      // el caso que de verdad pasó: la hoja vivía dentro de una vista, las
      // vistas apagadas son `display:none`, y se abría midiendo 0×0 con la
      // clase puesta, `display:flex` y `opacity:1`. Todo decía que estaba
      // abierta menos la pantalla.
      //
      // Eso ya se arregló sacándola de las vistas y tiene su prueba; esto
      // es para que si vuelve a pasar por otro motivo, el peor caso sea «no
      // pasa nada y te lo digo».
      if(hoja.offsetParent === null){
        cerrar(false);
        toast('toastComida', 'No pude abrir la confirmación. Inténtalo otra vez.');
      }
    });
  }

  // ¿Ya tiene guardado un alimento que se llame así y en la misma unidad?
  //
  //  NOMBRE Y UNIDAD, no solo el nombre: la base tiene un indice unico sobre
  //  (persona, nombre, unidad), asi que «Churro de azucar» en Gramos y en
  //  Pieza son dos fichas distintas y las dos son legitimas -cien gramos de
  //  churro y un churro no tienen los mismos macros-. Preguntar por el
  //  nombre a secas estorbaria en un caso que funciona bien.
  //
  //  Sin acentos ni mayusculas: quien escribe «platano» tiene que encontrar
  //  su «Plátano», que es justo el duplicado que se quiere evitar.
  function guardadoIgual(nombre, unidad){
    var n = normalizarBusqueda(nombre);
    for(var i = 0; i < MIS_ALIMENTOS.length; i++){
      var a = MIS_ALIMENTOS[i];
      if(normalizarBusqueda(a.n) === n && (a.u || 'Gramos') === unidad) return a;
    }
    return null;
  }

  document.getElementById('nfSave').addEventListener('click', function(){
    var nombre = document.getElementById('nfName').value.trim();
    if(!nombre){ document.getElementById('nfName').focus(); return; }

    // Editando: se cambia la ficha que ya existe en vez de crear otra.
    if(alimentoGuardadoEditando){
      var ed = alimentoGuardadoEditando;
      var antes = { n:ed.n, P:ed.P, C:ed.C, G:ed.G, u:ed.u };
      ed.n = nombre;
      ed.P = Number(nfP.value)||0; ed.C = Number(nfC.value)||0; ed.G = Number(nfG.value)||0;
      ed.u = unidadActual;
      pintarListas();
      limpiarFormularioAlimento();
      back();
      toast('toastGuardados', nombre + ' actualizado');

      if(ed.id && sesion && !retocarEnCola(ed.id,
            { name:ed.n, unit:ed.u, protein_g:ed.P, carbs_g:ed.C, fat_g:ed.G },
            '/saved_foods')){
        sbFetch('/rest/v1/saved_foods?id=eq.' + ed.id, {
          method:'PATCH', headers:{ 'Prefer':'return=minimal' },
          body: JSON.stringify({ name:ed.n, unit:ed.u,
                                 protein_g:ed.P, carbs_g:ed.C, fat_g:ed.G })
        })['catch'](function(e){
          ed.n = antes.n; ed.P = antes.P; ed.C = antes.C; ed.G = antes.G; ed.u = antes.u;
          pintarListas();
          toast('toastGuardados', 'No se pudo guardar: ' + traducirError(e.message));
        });
      }
      return;
    }

    var P = Number(nfP.value)||0, C = Number(nfC.value)||0, G = Number(nfG.value)||0;

    // ---- ¿YA LO TIENE GUARDADO? ----
    //
    //  Antes esto se estrellaba. Se creaba la ficha, se apuntaba la comida,
    //  y el `insert` chocaba con el índice único de (persona, nombre,
    //  unidad): la ficha se borraba de la lista y salía «No se pudo guardar
    //  el alimento: ...». O sea que corregir los macros de algo que ya
    //  tenías era imposible desde aquí, y el error no decía qué hacer.
    //
    //  Ahora se pregunta antes. Y pase lo que pase, LA COMIDA SE APUNTA: se
    //  entró aquí a apuntar algo, y cancelar la pregunta de los macros no
    //  puede llevarse por delante eso.
    var yaLoTiene = guardadoIgual(nombre, unidadActual);
    if(yaLoTiene){
      var cal = Math.round(P * 4 + C * 4 + G * 9);
      var calAntes = Math.round(yaLoTiene.P * 4 + yaLoTiene.C * 4 + yaLoTiene.G * 9);
      preguntar(
        'Ya lo tienes guardado',
        '«' + nombre + '» ya está en tus guardados por ' + (UNIDAD_BASE[unidadActual] || '100g') +
        ': ' + mil(calAntes) + ' cal. Lo que acabas de escribir son ' +
        mil(cal) + '. ¿Le cambio los macros a los nuevos?',
        'Sí, cambiarlos'
      ).then(function(cambiar){
        if(cambiar) actualizarGuardado(yaLoTiene, P, C, G);
        // Apuntar la comida de hoy con lo que se acaba de escribir, se haya
        // actualizado la ficha o no: es lo que la persona vino a hacer.
        var conCantidad = alimentoDelFormulario(nombre, P, C, G, unidadActual,
                                                document.getElementById('nfQty').value);
        conCantidad.id = yaLoTiene.id;
        apuntarYLimpiar(conCantidad);
      });
      return;
    }

    var a = alimentoDelFormulario(nombre, P, C, G, unidadActual,
                                  document.getElementById('nfQty').value);
    MIS_ALIMENTOS.unshift(a);
    pintarListas();
    apuntarYLimpiar(a);

    // Queda en tu despensa para volver a usarlo, no solo apuntado hoy.
    sbGuardarAlimento(a).then(function(f){
      if(f) a.id = f.id;
    })['catch'](function(e){
      var i = MIS_ALIMENTOS.indexOf(a);
      if(i >= 0){ MIS_ALIMENTOS.splice(i, 1); pintarListas(); }
      toast('toastComida', 'No se pudo guardar el alimento: ' + traducirError(e.message));
    });
  });

  // Apuntar lo que se acaba de escribir y dejar el formulario listo para
  // otro. Sale aparte porque ahora hay dos caminos que acaban igual: el
  // alimento nuevo y el que ya estaba guardado.
  function apuntarYLimpiar(a){
    document.getElementById('nfName').value = '';
    nfP.value = ''; nfC.value = ''; nfG.value = ''; calcNuevo();
    agregarAlimento(a);
  }

  // Cambiarle los macros a una ficha que ya existe. En pantalla al momento y
  // en la base después; si la base dice que no, se deshace y se avisa —una
  // ficha que dice 300 cal y guarda 200 es peor que un error.
  function actualizarGuardado(g, P, C, G){
    var antes = { P:g.P, C:g.C, G:g.G };
    g.P = P; g.C = C; g.G = G;
    pintarListas();
    toast('toastComida', '«' + g.n + '» actualizado');

    if(!g.id || !sesion) return;

    // Si su alta sigue en la cola, se retoca ahí: el PATCH no encontraría la
    // fila, contestaria que si, y despues la cola subiria los macros VIEJOS.
    if(retocarEnCola(g.id, { protein_g:P, carbs_g:C, fat_g:G },
                     '/saved_foods')) return;

    sbFetch('/rest/v1/saved_foods?id=eq.' + g.id, {
      method:'PATCH', headers:{ 'Prefer':'return=minimal' },
      body: JSON.stringify({ protein_g:P, carbs_g:C, fat_g:G })
    })['catch'](function(e){
      g.P = antes.P; g.C = antes.C; g.G = antes.G;
      pintarListas();
      toast('toastComida', 'No se pudo actualizar: ' + traducirError(e.message));
    });
  }

  pintarComida();

  // ---- Progreso de ejercicio: se alimenta de las sesiones guardadas ----
  // Cada "Guardar sesión" marca ese día como día de fuerza. La semana usa la
  // misma ancla que las calorías, así que se reinicia junto con ella.
  function pintarEjercicio(){
    var filas = document.getElementById('ejFilas');
    if(!filas || !SESIONES) return;
    var ini = new Date(anclaSemana);

    // LOS DÍAS QUE DIJO QUE ENTRENA, no siete. Nadie entrena siete días:
    // midiendo contra 7, quien dijo cuatro y fue los cuatro veía el anillo a
    // poco más de la mitad y un «4 de 7». Su semana era perfecta y la
    // pantalla se la pintaba a medias. `reg.dias` ya está cargado —es lo que
    // fija el factor de actividad de sus calorías—; aquí no se miraba.
    //
    // El respaldo es 7 y no 4: si el perfil todavía no ha llegado, es mejor
    // enseñar la semana entera que inventarle una meta que no dijo.
    var meta = Math.round(Number(reg && reg.dias));
    if(!(meta >= 1 && meta <= 7)) meta = 7;

    var diasFuerza = 0, html = '';
    var hoyIso = iso(HOY);
    for(var i = 0; i < 7; i++){
      var d = new Date(ini); d.setDate(d.getDate() + i);
      var k = iso(d);
      var esHoy = k === hoyIso;
      // Por la fecha en texto y no comparando objetos Date: `d > HOY` daba
      // verdadero para el día de HOY, porque `d` es mediodía y `HOY` puede
      // llevar cualquier hora. Comparando el día se acaba la ambigüedad.
      var esFuturo = k > hoyIso;
      var hizo = !!SESIONES[k];
      if(hizo) diasFuerza++;

      // Un día que no ha llegado NO es un día fallado. Antes las dos cosas
      // se pintaban con el mismo «—»: el martes, con la semana recién
      // empezada, cinco filas se leían como cinco días saltados.
      var marca = hizo     ? '<span class="pill-si">SÍ</span>'
                : esFuturo ? '<span class="pill-futuro">·</span>'
                           : '<span class="pill-dash">—</span>';

      html += '<tr'+(esHoy ? ' class="today"' : '')+'>'+
        // El nombre del día y no «Día 1»: la semana de cada quien empieza en
        // un día distinto, así que «Día 1» no dice nada y para encontrar el
        // sábado había que mirar la fecha y contar.
        '<td>' + escapar(DIAS[d.getDay()]) + (esHoy ? ' · hoy' : '') + '</td>'+
        '<td>' + d.getDate() + '/' + (d.getMonth()+1) + '</td>'+
        '<td>' + marca + '</td>'+
        '</tr>';
    }
    filas.innerHTML = html;

    document.getElementById('ejDias').textContent = diasFuerza;
    document.getElementById('ejMeta').textContent = meta;
    // Acotado a 1: entrenar más días de los previstos no puede mandar el
    // trazo a negativo, que lo dibuja al revés. El número de arriba sí
    // enseña los de más — eso cuenta.
    var parte = Math.min(1, diasFuerza / meta);
    document.getElementById('ejRing').setAttribute('stroke-dashoffset',
      String(Math.round(182 - 182 * parte)));

    var fin = new Date(ini); fin.setDate(fin.getDate() + 6);
    document.getElementById('ejWeekRange').textContent = 'Del ' + fmtFecha(ini) + ' al ' + fmtFecha(fin);

  }

  // Guardar sesión = queda registrado el día de hoy como día de fuerza
  // Mientras una sesión se está guardando, el botón no vuelve a disparar.
  //
  //  Preguntar «¿ya hay una de hoy?» tarda un viaje de ida y vuelta, y dos
  //  toques seguidos no le dan tiempo: las dos consultas contestarían «no
  //  hay» y se crearían dos filas igual. El candado tapa esa ventana; la
  //  consulta tapa el caso de volver a guardar más tarde, o tras recargar.
  var guardandoSesion = false;

  // EL CANDADO SE SUELTA PASE LO QUE PASE.
  //
  //  Se ponía en la primera línea y después venían cincuenta líneas que leen
  //  el DOM —nombres de ejercicio, filas de series, celdas— antes del primer
  //  `return`. Si cualquiera de ellas lanzaba, el candado se quedaba cerrado
  //  PARA SIEMPRE: a partir de ahí «Guardar sesión» no hacía absolutamente
  //  nada, sin aviso, sin toast y sin error a la vista, hasta cerrar y volver
  //  a abrir la app. Y lo que se ve entonces es lo peor que puede verse:
  //  entrenaste, le diste a guardar, y tu semana dice cero días de fuerza.
  //
  //  El `finally` no sustituye a los `guardandoSesion = false` de la promesa:
  //  aquellos sueltan el candado cuando TERMINA la escritura, que es de lo
  //  que protege. Este suelta el candado si nunca se llegó a empezar.
  document.getElementById('saveSessionBtn').addEventListener('click', function(){
    try { guardarSesionAhora(); }
    catch(e){
      guardandoSesion = false;
      toast('toastRutina', 'No se pudo guardar: ' + traducirError(e && e.message));
      throw e;              // que siga saliendo en la consola: es un fallo
    }
  });

  function guardarSesionAhora(){
    if(guardandoSesion) return;
    guardandoSesion = true;
    SESIONES[iso(HOY)] = true;

    // La rutina es la PLANTILLA, que se sigue editando. Esto es el
    // HISTORIAL: una foto de lo que se hizo hoy, que ya no cambia aunque
    // mañana se reordene la rutina. De aquí salen las gráficas.
    // Lo que hay que poder devolver si el guardado no llega. La sesión y el
    // historial ya se deshacían; esto no, y era lo que se veía.
    var detalle = [], total = 0, refsAntes = [];
    Array.from(exList.querySelectorAll('.exercise-card')).forEach(function(c){
      var nombre = c.querySelector('.ex-name').childNodes[0].textContent.trim();
      var vol = 0, series = [];
      Array.from(c.querySelectorAll('.sets-table tr')).forEach(function(tr){
        var ins = tr.querySelectorAll('.set-input');
        if(ins.length < 2) return;
        var reps = Number(ins[0].value) || 0, peso = Number(ins[1].value) || 0;
        vol += volumenDeSerie(reps, peso);
        series.push({ reps: reps, peso: peso, hecho: !!tr.querySelector('.set-check.done') });
      });
      if(vol > 0){
        if(!HISTORIAL[nombre]) HISTORIAL[nombre] = [];
        HISTORIAL[nombre].push(vol);

        // El porcentaje se apaga: la sesión ya está hecha. Vuelve a salir
        // la próxima vez, en cuanto se cambien reps o peso, comparado
        // contra ESTA sesión.
        c.removeAttribute('data-tocado');

        // La referencia de antes, por si hay que devolverla: si el guardado
        // falla y esta se queda puesta, el porcentaje en vivo compara contra
        // una sesión que no existe.
        refsAntes.push({ card: c, valor: c.getAttribute('data-prev-vol') });
        c.setAttribute('data-prev-vol', vol);   // la próxima sesión compara contra esta
        detalle.push({ nombre: nombre, volumen: vol, series: series });
        total += vol;
      }
    });
    // Las palomitas se apagan al guardar. Marcan "esta serie ya la hice
    // HOY", no "este ejercicio lleva palomita para siempre": si se quedan
    // puestas, la próxima sesión empieza con todo dado por hecho y dejan de
    // significar nada.
    //
    // Va DESPUÉS de leer `detalle` -que necesita saber cuáles estaban
    // marcadas- y ANTES de saveCurrentDay, que es quien las persiste.
    // Se apunta CUÁLES estaban puestas antes de apagarlas: si el guardado
    // falla, quien acaba de marcar veinte series no puede quedarse sin
    // ninguna y sin saber por qué.
    var palomitasAntes = Array.from(exList.querySelectorAll('.set-check.done'));
    palomitasAntes.forEach(function(v){ v.classList.remove('done'); });
    // Y se avisa de que hay algo que subir. Quitar la clase por código no
    // dispara ningún evento, así que `volcarRutina` no tenía nada pendiente
    // y salía sin guardar: la pantalla quedaba limpia y la base seguía con
    // las palomitas puestas. Al reabrir la app volvían todas.
    if(typeof programarGuardado === 'function') programarGuardado();

    saveCurrentDay();
    pintarEjercicio();
    // Después de repintar: es lo que apaga los porcentajes de la sesión
    // que se acaba de guardar.
    recalcAll();

    if(!sesion || !sesion.user){ guardandoSesion = false; toast('toastRutina', 'Sesión guardada'); return; }
    if(!detalle.length){ guardandoSesion = false; toast('toastRutina', 'No hay series con peso que guardar'); return; }

    var tab = activeTab();
    var diaId = (tab && tab.dataset.id) || null;
    var fila = {
      user_id: sesion.user.id,
      session_date: iso(HOY),
      routine_day_id: diaId,
      day_name: tab ? tab.textContent.trim() : null,
      exercises: detalle,
      total_volume: total
    };

    // SI YA HAY UNA SESIÓN DE HOY PARA ESTE MISMO DÍA DE RUTINA, SE
    // ACTUALIZA EN VEZ DE AÑADIR OTRA.
    //
    //  Los reps y los pesos NO se borran al guardar —solo se apagan las
    //  palomitas—, así que un segundo toque leía exactamente lo mismo y
    //  mandaba una fila idéntica. Las VECES ya se cuentan por días y no se
    //  inflaban, pero el volumen suma todas las filas, así que el volumen
    //  del día salía por dos. Y de ese número sale la regla más cara del
    //  cierre: «peso plano y volumen SUBIENDO → está funcionando, no le
    //  toques nada». Un volumen doblado le dice a la IA que progresaste
    //  cuando no.
    //
    //  La clave es (fecha + día de rutina) y no la fecha sola: entrenar dos
    //  veces de verdad en un día son dos días de rutina distintos —empuje
    //  por la mañana, tirón por la tarde— y esos siguen siendo dos filas.
    //  Guardar el MISMO día dos veces es el accidente.
    //
    //  `is.null` y no `eq.null` cuando no hay día: con `eq.null` PostgREST
    //  no casa nada y siempre se crearía fila nueva.
    var busca = '/rest/v1/workout_sessions?select=id' +
                '&user_id=eq.' + sesion.user.id +
                '&session_date=eq.' + iso(HOY) +
                (diaId ? '&routine_day_id=eq.' + diaId : '&routine_day_id=is.null') +
                '&limit=1';

    //  Y si la consulta falla, se guarda igual. Preguntar es una mejora y no
    //  puede convertirse en un motivo para perder la sesión: peor un volumen
    //  duplicado que un entrenamiento que no queda registrado.
    sbFetch(busca)
      ['catch'](function(){ return null; })
      .then(function(hay){
        var id = hay && hay[0] && hay[0].id;
        if(id){
          // Con el `user_id` además del id. RLS ya lo impediría, pero la
          // regla aquí es no apoyarse solo en ella: si algún día una
          // política se afloja, esto sigue tocando únicamente lo suyo.
          return sbFetch('/rest/v1/workout_sessions?id=eq.' + id +
                         '&user_id=eq.' + sesion.user.id, {
            method:'PATCH', headers:{ 'Prefer':'return=minimal' },
            body: JSON.stringify(fila)
          });
        }
        return sbFetch('/rest/v1/workout_sessions', {
          method:'POST', headers:{ 'Prefer':'return=minimal' },
          body: JSON.stringify(fila)
        });
      }).then(function(){
      guardandoSesion = false;
      toast('toastRutina', 'Sesión guardada · ' + mil(total) + ' kg de volumen');
    })['catch'](function(e){
      guardandoSesion = false;
      // Se deshace lo local: si no se guardó, la racha y las gráficas no
      // deben contarla.
      delete SESIONES[iso(HOY)];
      detalle.forEach(function(d){
        if(HISTORIAL[d.nombre]) HISTORIAL[d.nombre].pop();
      });
      // Y lo que se VE, que era lo que faltaba por deshacer.
      palomitasAntes.forEach(function(v){ v.classList.add('done'); });
      refsAntes.forEach(function(r){
        if(r.valor === null) r.card.removeAttribute('data-prev-vol');
        else r.card.setAttribute('data-prev-vol', r.valor);
      });
      // Se vuelve a persistir lo devuelto: sin esto la pantalla enseña otra
      // vez las palomitas pero la base se quedó con la rutina ya apagada, y
      // al reabrir la app desaparecen igual.
      if(typeof programarGuardado === 'function') programarGuardado();
      pintarEjercicio();
      recalcAll();
      toast('toastRutina', 'No se pudo guardar: ' + traducirError(e.message));
    });
  }


  // ---- Todas las fechas visibles salen de la fecha real del dispositivo ----
  function pintarFechas(){
    document.getElementById('subDate').textContent =
      (HOY.getDate() + ' DE ' + MESES_LARGO[HOY.getMonth()] + ' DE ' + HOY.getFullYear()).toUpperCase();

    document.getElementById('pesoFecha').textContent = fmtFecha(HOY) + ' ' + HOY.getFullYear();

    // El detalle de comida muestra un día pasado de ejemplo (anteayer)
    var d = haceDias(2);
    document.getElementById('mealDetailDate').textContent =
      d.getDate() + ' ' + MESES_LARGO[d.getMonth()] + ', ' + d.getFullYear();
    document.getElementById('mealDetailChip').innerHTML =
      DIAS[d.getDay()].slice(0,3).replace(/^./, function(c){ return c.toUpperCase(); }) + '<br>' + d.getDate();

  }
  pintarFechas();

  // ---- Mi Peso: registros reales, rangos y variación calculada ----
  // Un año de registros de ejemplo: bajada progresiva con altibajos.
  // Igual que el diario: vacío hasta que lleguen los pesos de la persona.
  var PESOS = {};

  var RANGO = '14';
  var DIAS_RANGO = {'14': 14, 'mes': 30, 'anio': 365};
  var NOMBRE_RANGO = {'14': '14 días', 'mes': 'el mes', 'anio': 'el año'};

  function serieDePeso(){
    var n = DIAS_RANGO[RANGO], pts = [];
    for(var i = n - 1; i >= 0; i--){
      var d = haceDias(i), k = isoDe(d);
      if(PESOS[k] != null) pts.push({d: d, w: PESOS[k]});
    }
    return pts;
  }

  function pintarPeso(){
    var pts = serieDePeso();
    var cont = document.getElementById('pesoChart');
    var delta = document.getElementById('pesoDelta');
    var resumen = document.getElementById('pesoResumen');

    document.getElementById('pesoHoyNota').style.display = PESOS[isoDe(HOY)] != null ? 'none' : '';

    // Antes del `return` de "aún no hay suficientes registros": justo ahí es
    // cuando más falta hace el recordatorio, y puesto después no se
    // ejecutaría nunca en esos primeros días.
    if(typeof revisarRecordatorios === 'function') revisarRecordatorios();

    if(pts.length < 2){
      cont.innerHTML = '<div class="sin-datos">Aún no hay suficientes registros en este periodo.</div>';
      delta.textContent = '—'; delta.className = 'chart-delta';
      resumen.textContent = 'Registra tu peso varios días para ver la tendencia.';
      return;
    }

    // Variación real: del primer registro del periodo al último
    var ini = pts[0].w, fin = pts[pts.length-1].w;
    var difKg = Math.round((fin - ini) * 10) / 10;
    var pct = Math.round((fin - ini) / ini * 1000) / 10;
    var signo = difKg > 0 ? '+' : '';
    delta.textContent = signo + pct + '% en ' + NOMBRE_RANGO[RANGO];
    delta.className = 'chart-delta ' + (difKg > 0 ? 'sube' : difKg < 0 ? 'baja' : '');
    resumen.textContent = difKg === 0
      ? 'Sin cambio en ' + NOMBRE_RANGO[RANGO] + ' · ' + fin.toFixed(1) + ' kg'
      : (difKg > 0 ? 'Subiste ' : 'Bajaste ') + Math.abs(difKg).toFixed(1) + ' kg en ' +
        NOMBRE_RANGO[RANGO] + ' · de ' + ini.toFixed(1) + ' a ' + fin.toFixed(1) + ' kg';

    // Para el año se muestrean puntos para que la línea se lea bien
    var vista = pts;
    if(vista.length > 45){
      var paso = Math.ceil(vista.length / 45);
      vista = pts.filter(function(_, i){ return i % paso === 0 || i === pts.length - 1; });
    }

    var W = 320, H = 180, L = 34, R = 312, T = 18, B = 142;
    var min = Math.min.apply(null, vista.map(function(p){ return p.w; }));
    var max = Math.max.apply(null, vista.map(function(p){ return p.w; }));
    if(max - min < 1){ var c = (max + min) / 2; min = c - 0.5; max = c + 0.5; }
    var pad = (max - min) * 0.15; min -= pad; max += pad;

    function x(i){ return vista.length === 1 ? L : L + i * (R - L) / (vista.length - 1); }
    function y(w){ return B - (w - min) / (max - min) * (B - T); }

    var svg = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="175" role="img">';
    for(var g = 0; g <= 3; g++){
      var gy = T + g * (B - T) / 3;
      var gw = max - (max - min) * g / 3;
      svg += '<line x1="'+L+'" y1="'+gy+'" x2="'+R+'" y2="'+gy+'" stroke="var(--line)"/>'+
             '<text x="0" y="'+(gy+3.5)+'" font-size="9.5" fill="var(--ink-faint)">'+gw.toFixed(1)+'</text>';
    }
    svg += '<polyline fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round" points="'+
           vista.map(function(p,i){ return x(i)+','+y(p.w); }).join(' ')+'"/>';
    // Puntos: pocos cuando hay muchos datos, para no saturar
    var mostrarPuntos = vista.length <= 20;
    svg += '<g fill="var(--ink)">' + vista.map(function(p,i){
      var esUltimo = i === vista.length - 1;
      if(!mostrarPuntos && !esUltimo) return '';
      return '<circle cx="'+x(i)+'" cy="'+y(p.w)+'" r="'+(esUltimo ? 4.2 : 3.2)+'"/>';
    }).join('') + '</g>';
    // Fechas del eje X
    var marcas = [0, Math.floor(vista.length/3), Math.floor(vista.length*2/3), vista.length-1]
      .filter(function(v,i,a){ return a.indexOf(v) === i; });
    svg += marcas.map(function(i){
      var p = vista[i];
      var etq = RANGO === 'anio'
        ? MESES[p.d.getMonth()]
        : String(p.d.getMonth()+1).padStart(2,'0')+'-'+String(p.d.getDate()).padStart(2,'0');
      var anchor = i === 0 ? 'start' : (i === vista.length-1 ? 'end' : 'middle');
      return '<text x="'+x(i)+'" y="'+(H-14)+'" font-size="9.5" fill="var(--ink-faint)" text-anchor="'+anchor+'">'+etq+'</text>';
    }).join('');
    cont.innerHTML = svg + '</svg>';
  }

  document.getElementById('pesoRango').addEventListener('click', function(e){
    var b = e.target.closest('button');
    if(!b) return;
    Array.from(this.querySelectorAll('button')).forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active');
    RANGO = b.dataset.rango;
    pintarPeso();
  });

  // ---- La cintura ----
  // No se pide todos los días: se mide una vez al mes y ya. El error de la
  // cinta -cómo de apretada, un dedo más arriba, si soltaste el aire- ronda
  // el centímetro, que es MÁS de lo que cambia una cintura en una semana.
  // Pedirla cada día sería recoger ruido y encima cansar a quien la apunta.
  //
  // Así que el campo aparece solo cuando toca, se va al guardarla, y vuelve
  // al mes siguiente.
  var CINTURAS = [];                    // [{fecha, cm}], de la vieja a la nueva
  var DIAS_ENTRE_CINTURAS = 28;

  // SE CUENTAN DÍAS DE CALENDARIO, NO HORAS, y eso no es una sutileza.
  //
  // Estaba comparando `HOY` -que va a medianoche- contra el MEDIODÍA del día
  // en que se midió. El día 28 solo habían pasado 27,5, así que no llegaba a
  // 28 y el aviso salía el 29. Medio día de retraso, todos los meses, y
  // acumulándose: la medida se corre un día cada dos meses.
  //
  // Ahora las dos fechas van a medianoche y la resta da días enteros. El
  // `round` es por el cambio de horario: un día puede durar 23 o 25 horas,
  // y sin él la resta daría 27,96 y volveríamos al mismo sitio.
  function tocaMedirCintura(){
    if(!CINTURAS.length) return true;   // nunca la ha medido
    var ultima = new Date(CINTURAS[CINTURAS.length - 1].fecha + 'T12:00:00');
    ultima.setHours(0, 0, 0, 0);
    return Math.round((HOY - ultima) / 86400000) >= DIAS_ENTRE_CINTURAS;
  }

  function pintarCintura(){
    var bloque = document.getElementById('cinturaBloque');
    var hist   = document.getElementById('cinturaHist');
    var filas  = document.getElementById('cinturaFilas');
    if(!bloque || !hist || !filas) return;

    bloque.hidden = !tocaMedirCintura();
    // El campo se vacía al esconderlo: si volviera con el número del mes
    // pasado, se guardaría el viejo sin querer al tocar Guardar.
    if(bloque.hidden) document.getElementById('cinturaInput').value = '';

    // Los recordatorios se preguntan aquí, y en `pintarPeso` y `pintarFotos`,
    // que son los tres sitios por los que pasa cualquier cambio en los tres
    // datos que vigilan. Colgarlo del botón de Guardar habría dejado la
    // tarjeta puesta cuando el dato llega por otro lado: al cargar de la
    // base al abrir la app, o al deshacer un guardado que falló.
    if(typeof revisarRecordatorios === 'function') revisarRecordatorios();

    hist.hidden = !CINTURAS.length;
    // De la más reciente a la más vieja: lo último medido es lo que se mira.
    filas.innerHTML = CINTURAS.slice().reverse().map(function(m, i, arr){
      var previa = arr[i + 1];          // la de antes en el tiempo
      var dif = previa ? Math.round((m.cm - previa.cm) * 10) / 10 : null;
      var clase = dif == null ? '' : (dif < 0 ? 'baja' : (dif > 0 ? 'sube' : 'igual'));
      // El número solo no dice nada; la dirección sí. 88 no significa
      // nada, 91 -> 88 significa que está perdiendo grasa.
      var texto = dif == null ? 'primera'
                : (dif === 0 ? 'igual' : (dif > 0 ? '+' : '−') + Math.abs(dif) + ' cm');
      return '<div class="medida-fila">' +
               '<div><div class="mf-val">' + m.cm + ' cm</div>' +
               '<div class="mf-fecha">Medida el ' + fmtFecha(new Date(m.fecha + 'T12:00:00')) + '</div></div>' +
               '<div class="mf-dif ' + clase + '">' + texto + '</div>' +
             '</div>';
    }).join('');
  }

  // Guardar peso: se registra en la fecha de hoy y la gráfica se actualiza
  document.getElementById('saveWeightBtn').addEventListener('click', function(){
    var v = Number(document.getElementById('pesoInput').value);
    var cin = Number(document.getElementById('cinturaInput').value) || null;
    var kHoy = isoDe(HOY);

    // APUNTAR SOLO LA CINTURA TIENE QUE VALER.
    //
    //  Esto era `if(!v || v <= 0) return;` en la segunda línea, y se llevaba
    //  por delante la cintura sin decir una palabra. El caso es de todos los
    //  días: el asistente pide la medida de cintura, se abre Peso, se teclea
    //  el número en su campo, se pulsa Guardar... y no pasa NADA. Ni aviso ni
    //  error. La medida se pierde, y como `tocaMedirCintura()` mira si hay
    //  alguna guardada, sigue pidiéndola.
    //
    //  `weight_kg` es `not null` en la base, así que una fila de cintura
    //  necesita un peso. Si ya hay uno de hoy se reutiliza: quien viene a
    //  apuntar la cintura no viene a pesarse otra vez.
    if(!(v > 0) && PESOS[kHoy] != null) v = Number(PESOS[kHoy]);

    //  Y si no hay ninguno, se DICE. Un botón que no responde y no explica
    //  por qué es indistinguible de uno roto —y aquí encima se pierde algo
    //  que solo se mide una vez al mes—.
    if(!(v > 0)){
      toast('toastPeso', cin != null
        ? 'Para guardar la cintura hace falta también tu peso de hoy.'
        : 'Escribe tu peso.');
      return;
    }
    // Fuera de rango se ignora en vez de rechazar el peso: quien se
    // equivoca tecleando la cintura no deberia perder el peso de hoy.
    //
    // PERO SE DICE. Antes se descartaba en silencio y el toast de abajo
    // felicitaba por el peso guardado sin mencionar la cintura, así que
    // parecía que había entrado. Se mide una vez al mes: perderla callando
    // es lo peor que puede hacerse con ella.
    var cinturaFuera = cin != null && (cin < 40 || cin > 200);
    if(cinturaFuera) cin = null;
    // Se guarda cómo estaba TODO lo que se va a tocar, no solo el peso. La
    // cintura se metía en memoria y no se retiraba nunca si el guardado
    // fallaba: quedaba una medida que no existe en la base, `tocaMedirCintura()`
    // creía que ya se había medido y no la volvía a pedir en 28 días, y el
    // cierre del domingo se la mandaba a la IA para que razonara sobre ella.
    var k = isoDe(HOY), antes = PESOS[k], cinturasAntes = CINTURAS.slice();
    PESOS[k] = Math.round(v * 10) / 10;
    pintarPeso();
    toast('toastPeso', 'Peso guardado: ' + PESOS[k] + ' kg' +
                       (cin != null ? ' · cintura ' + cin + ' cm' : '') +
                       (cinturaFuera ? ' · la cintura no se guardó: tiene que estar entre 40 y 200 cm' : ''));

    if(cin != null){
      // En sitio para que el historial y el "¿toca?" cuadren al momento,
      // sin esperar a la red. Si la fila de hoy ya existía, se sustituye.
      CINTURAS = CINTURAS.filter(function(m){ return m.fecha !== k; });
      CINTURAS.push({ fecha: k, cm: cin });
      CINTURAS.sort(function(a, b){ return a.fecha < b.fecha ? -1 : 1; });
      pintarCintura();
    }

    sbGuardarPeso(k, PESOS[k], cin)['catch'](function(e){
      if(antes == null) delete PESOS[k]; else PESOS[k] = antes;
      // La cintura va en la MISMA fila que el peso: si no se guardó una,
      // tampoco se guardó la otra, así que las dos vuelven atrás.
      CINTURAS = cinturasAntes;
      pintarPeso();
      pintarCintura();
      toast('toastPeso', 'No se pudo guardar: ' + traducirError(e.message));
    });
  });

  pintarPeso();
  pintarCintura();

  // ---- Empezar de cero ----
  // Borra el historial de peso entero. A diferencia de casi todo lo demás,
  // aquí el borrado es DE VERDAD: weight_logs no está entre las tablas que
  // la 0007 archiva, porque es historial y no algo que se edite. Por eso el
  // aviso dice que no se puede deshacer, y por eso pide confirmar.
  var pesoReinicioSheet = document.getElementById('pesoReinicioSheet');
  function cerrarReinicio(){ pesoReinicioSheet.classList.remove('open'); }

  document.getElementById('pesoReiniciar').addEventListener('click', function(){
    pesoReinicioSheet.classList.add('open');
  });
  document.getElementById('pesoReinicioNo').addEventListener('click', cerrarReinicio);
  pesoReinicioSheet.addEventListener('click', function(e){
    if(e.target === pesoReinicioSheet) cerrarReinicio();
  });

  document.getElementById('pesoReinicioOk').addEventListener('click', function(){
    // La pantalla se vacía SIEMPRE, haya sesión o no. Antes se salía antes
    // de tiempo cuando no la había y el botón se quedaba mudo: confirmabas
    // el borrado y no pasaba nada, sin siquiera un aviso.
    var antes = Object.assign({}, PESOS);
    var antesInput = document.getElementById('pesoInput').value;
    Object.keys(PESOS).forEach(function(k){ delete PESOS[k]; });
    document.getElementById('pesoInput').value = '';
    cerrarReinicio();
    pintarPeso();
    toast('toastPeso', 'Historial de peso borrado');

    if(!sesion || !sesion.user) return;
    // Se borra y SE COMPRUEBA. Un DELETE que no encaja con ninguna fila no
    // da error: sale bien sin tocar nada. Sin releer después, un borrado
    // que no borró se ve exactamente igual que uno que sí, y la persona
    // solo se entera al recargar y ver su peso de vuelta.
    sbFetch('/rest/v1/weight_logs?user_id=eq.' + sesion.user.id, { method:'DELETE' })
      .then(function(){
        return sbFetch('/rest/v1/weight_logs?select=log_date&limit=1' +
                       '&user_id=eq.' + sesion.user.id);
      })
      .then(function(quedan){
        if(quedan && quedan.length){
          throw new Error('quedaron registros sin borrar');
        }
      })
      ['catch'](function(e){
        Object.keys(antes).forEach(function(k){ PESOS[k] = antes[k]; });
        document.getElementById('pesoInput').value = antesInput;
        pintarPeso();
        toast('toastPeso', 'No se pudo borrar: ' + traducirError(e.message));
      });
  });

  // ---- Flechas para recorrer pestañas que no caben ----
  function estadoFlechas(id){
    var box = document.getElementById(id);
    if(!box) return;
    var max = box.scrollWidth - box.clientWidth;
    Array.from(document.querySelectorAll('.sc-arrow[data-scroll="'+id+'"]')).forEach(function(b){
      var dir = Number(b.dataset.dir);
      b.disabled = max <= 1 || (dir < 0 ? box.scrollLeft <= 1 : box.scrollLeft >= max - 1);
    });
  }
  Array.from(document.querySelectorAll('.sc-arrow')).forEach(function(b){
    b.addEventListener('click', function(){
      var box = document.getElementById(b.dataset.scroll);
      box.scrollLeft += Number(b.dataset.dir) * Math.round(box.clientWidth * 0.7);
      setTimeout(function(){ estadoFlechas(b.dataset.scroll); }, 320);
    });
  });
  ['muscleTabs','dayTabs'].forEach(function(id){
    var box = document.getElementById(id);
    if(box) box.addEventListener('scroll', function(){ estadoFlechas(id); });
    estadoFlechas(id);
  });
  // Recalcular cuando cambia el contenido o se muestra la pantalla
  function refrescarFlechas(){ ['muscleTabs','dayTabs'].forEach(estadoFlechas); }
  window.addEventListener('resize', refrescarFlechas);

  // ---- Racha: días seguidos registrando comida ----
  // Cuenta hacia atrás desde hoy mientras haya comida registrada. Un día sin registrar la corta.
  function calcularRacha(){
    var d = new Date(HOY);
    // Si hoy todavía no registras nada, la racha se mide hasta ayer (no se pierde por ir empezando el día)
    if(!REGISTRO[isoDe(d)]) d.setDate(d.getDate() - 1);
    var n = 0;
    while(REGISTRO[isoDe(d)]){ n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function pintarRacha(){
    var n = calcularRacha();
    var el = document.getElementById('racha');
    if(!el) return;
    el.textContent = n === 0 ? 'sin racha' : '🔥 ' + n + (n === 1 ? ' día' : ' días');
    el.title = n === 0
      ? 'Registra comida hoy para empezar tu racha'
      : n + (n === 1 ? ' día seguido' : ' días seguidos') + ' registrando comida';
  }

  // Lo que agregas o quitas de una comida se refleja en el día (anillos, barras y racha)
  function sumarAlRegistro(a, signo){
    var k = isoDe(diaDeApunte());
    var r = REGISTRO[k];
    if(!r){ r = REGISTRO[k] = {P:0, C:0, G:0}; }
    r.P = Math.max(0, r.P + signo * a.P);
    r.C = Math.max(0, r.C + signo * a.C);
    r.G = Math.max(0, r.G + signo * a.G);

    // Que el día tenga registro es lo que sostiene la racha y lo que hace
    // que cuente para el reparto de la semana. Así que se borra cuando no
    // queda NADA apuntado, no cuando los macros suman cero: agua, café solo
    // o un refresco light son cero calorías y aun así son un día usado.
    //
    // Antes se miraba la suma, así que apuntar solo agua rompía la racha en
    // silencio y el día no contaba para compensar.
    //
    // Pero COMIDAS es la lista del día que se está MIRANDO y el registro que
    // se toca es el del día en que se está APUNTANDO. Desde que se puede
    // apuntar en un día pasado esos dos se separan, y preguntar
    // `apuntandoEnHoy()` daba dos averías opuestas: vaciar un día pasado le
    // dejaba el registro a cero -un día fantasma que mantiene viva la racha y
    // le regala a hoy las calorías de una jornada- y, al revés, deshacer algo
    // de hoy mientras se miraba un día pasado borraba el registro de HOY
    // entero, con todo lo demás que llevara apuntado.
    //
    // La pregunta buena es si la lista que tenemos delante es la de ESTE día.
    if((DIA_LISTA || isoDe(HOY)) === k){
      var hayAlgoApuntado = Object.keys(COMIDAS).some(function(m){
        return COMIDAS[m].length > 0;
      });
      if(!hayAlgoApuntado) delete REGISTRO[k];
    }

    actualizarMetas();
    pintarRacha();
  }
  pintarRacha();

  // ---- Apartar calorías para un evento ----
  // Una boda el sábado no es un fallo: es un dato que se sabe el martes. Lo
  // que hace cualquiera que sepa comer es dejar sitio antes, y eso es todo
  // lo que hace esto.
  //
  // Quién decide qué:
  //   · El asistente entiende "el viernes ceno fuera" y saca fecha y cuánto.
  //     Eso es lenguaje, y ahí un modelo es mejor que cualquier regla.
  //   · El reparto es esta función. Es aritmética con un suelo de seguridad,
  //     y eso no se le pregunta a un modelo: tiene que dar lo mismo siempre
  //     y tiene que poder probarse.
  //
  // La reserva sale de CARBOHIDRATOS Y GRASA, nunca de la proteína. Bajar
  // proteína para hacer sitio a una fiesta es justo lo contrario de lo que
  // se hace: es lo que sostiene el músculo mientras el resto se mueve.
  //
  // Si no cabe, no se fuerza. Se aparta lo que quepa por encima del suelo y
  // se devuelve cuánto se quedó fuera, para poder decirlo en voz alta en vez
  // de dejar tres días a 900 calorías sin avisar.
  function apartarParaEvento(meta, diasRestantes, reserva, piso){
    var n = Math.max(1, diasRestantes);
    var calMeta = calDe(meta);
    var vacio = { P:meta.P, C:meta.C, G:meta.G, apartado:0, sinSitio:Math.max(0, reserva) };
    if(!(reserva > 0)) return { P:meta.P, C:meta.C, G:meta.G, apartado:0, sinSitio:0 };

    // Lo que se puede quitar sin cruzar el suelo, contando todos los días
    // que quedan. En el día del evento no se recorta: el recorte lo llevan
    // los días de ANTES, que son los que tienen margen.
    var margen = Math.max(0, (calMeta - piso) * n);
    var apartado = Math.min(reserva, margen);
    if(apartado <= 0) return vacio;

    var porDia = apartado / n;

    // Se reparte entre carbo y grasa según lo que cada uno aporta hoy. Si
    // alguien ya come poca grasa, no se le quita casi nada de ahí.
    var calC = meta.C * 4, calG = meta.G * 9;
    var base = calC + calG;
    if(base <= 0) return vacio;      // sin nada que recortar fuera de proteína

    var quitaC = porDia * (calC / base);
    var quitaG = porDia * (calG / base);

    return {
      P: meta.P,
      C: Math.max(0, meta.C - quitaC / 4),
      G: Math.max(0, meta.G - quitaG / 9),
      apartado: apartado,
      sinSitio: reserva - apartado
    };
  }

  // ---- Registro: de los datos personales salen las calorías y los macros ----
  // Gasto en reposo con Mifflin-St Jeor, por factor de actividad, ajustado al objetivo.
  var reg = {sexo:'h', objetivo:'mantener', dias:3};
  var NIVEL = [
    {f:1.2,   t:'Sedentario'}, {f:1.375, t:'Actividad ligera'}, {f:1.375, t:'Actividad ligera'},
    {f:1.55,  t:'Actividad moderada'}, {f:1.55, t:'Actividad moderada'},
    {f:1.725, t:'Actividad alta'}, {f:1.725, t:'Actividad alta'}, {f:1.9, t:'Actividad muy alta'}
  ];
  // Proporcional al gasto: −20% para bajar, +15% para subir. Es el cálculo
  // original, el de siempre.
  //
  // Estuvo un tiempo en calorías fijas (−400 / +300) para forzar un ritmo
  // lento de ~0.35 kg por semana. Se quitó a petición: el porcentaje escala
  // con la persona, y a quien gasta mucho un déficit fijo se le queda corto.
  var AJUSTE = {bajar:0.80, mantener:1, subir:1.15};
  var KCAL_POR_KG = 7700;
  var NOMBRE_OBJ = {bajar:'Bajar de peso', mantener:'Mantener peso', subir:'Subir de peso'};

  // "~0.36 kg por semana" en lugar de "déficit del 20%": nadie sabe qué
  // significa un 20%, y todo el mundo entiende cuánto va a bajar.
  // La fila del objetivo ahora es un botón, así que lleva su flecha. En un
  // solo sitio para que no se pierda al repintarla desde otro lado.
  function pintarObjetivoPerfil(){
    var el = document.getElementById('profObjetivo');
    if(el) el.innerHTML = (NOMBRE_OBJ[reg.objetivo] || '—') + '<i>›</i>';
  }

  function textoRitmo(kgSemana){
    var k = Math.abs(kgSemana);
    if(k < 0.05) return 'mantener el peso';
    return (kgSemana < 0 ? 'bajar ~' : 'subir ~') +
           k.toFixed(2).replace('.', ',') + ' kg por semana';
  }

  // ---- Lo que cambia una condición de salud ----
  // Reglas escritas, no IA. Tres motivos:
  //   · Tiene que dar lo mismo siempre. Un modelo que hoy diga 1.800 y mañana
  //     2.100 para la misma persona no es ciencia, es ruido.
  //   · Se puede leer y discutir. La regla está aquí con su motivo al lado, y
  //     quien sepa de esto puede decir si está bien sin abrir la app.
  //   · Es gratis y no se cae. Justo al registrarse no es momento de depender
  //     de que responda una API.
  // El asistente entra después, en el recálculo semanal, que es donde de
  // verdad hace falta interpretar una tendencia y no aplicar una constante.
  //
  // Cuando se marcan varias gana la más restrictiva: los topes se quedan con
  // el menor y los extras de calorías se suman.
  var REGLAS_SALUD = {
    // Los carbohidratos no se prohíben, se acotan. En tipo 1 lo que manda es
    // que sean CONSTANTES, porque la dosis de insulina se calcula sobre
    // ellos; un tope muy bajo ahí complica más de lo que ayuda.
    diabetes_1:      { topeCarbPct:0.45,
      nota:'Carbohidratos parejos entre comidas, para que la insulina cuadre.' },
    diabetes_2:      { topeCarbPct:0.40,
      nota:'Menos carbohidratos y más proteína: es lo que mejor controla la glucosa.' },
    prediabetes:     { topeCarbPct:0.45,
      nota:'Menos carbohidratos para frenar la resistencia a la insulina.' },
    higado_graso:    { topeCarbPct:0.45,
      nota:'Bajar azúcares y harinas es lo que más mueve la grasa del hígado.' },
    colesterol_alto: { topeGrasaPct:0.30,
      nota:'Grasa por debajo del 30%, y que venga de aceite, aguacate, frutos secos y pescado.' },
    // El único tope que no se negocia: 2 g/kg en un riñón tocado hace daño.
    enfermedad_renal:{ topeProtGkg:0.8,
      nota:'Proteína limitada a 0,8 g por kilo: pasarse carga el riñón.' },
    // Estas no mueven ni calorías ni macros. Salen igual para que quien las
    // marcó vea que se le leyó, en vez de encontrarse un silencio.
    hipertension:    { nota:'Las calorías no cambian. Lo que importa aquí es la sal: menos de 5 g al día.' },
    celiaquia:       { nota:'Las calorías no cambian. Todo el cereal tiene que ser sin gluten.' },
    // Con tratamiento el gasto vuelve al normal. Recortar "por si acaso"
    // sería inventarse un déficit que nadie ha medido.
    hipotiroidismo:  { nota:'Con el tratamiento puesto el gasto es el de siempre: no se recorta nada por esto.' },
    embarazo:        { extraCal:340, sinDeficit:true,
      nota:'+340 cal al día (segundo trimestre) y nunca en déficit.' },
    lactancia:       { extraCal:450, sinDeficit:true,
      nota:'+450 cal al día mientras des pecho, y nunca en déficit.' }
  };

  // Mueve lo que salió de la fórmula y devuelve además los por qués: un
  // número que cambia sin decir de dónde viene no se lo cree nadie.
  // `opciones.soloTopes`: la cifra que entra YA ES UNA META VIGENTE, no una
  // recién salida de la fórmula. Se usa desde el cierre semanal, donde la
  // decide la IA.
  //
  // La diferencia está en el extra del embarazo y la lactancia. Al calcular
  // la meta por primera vez, ese extra se SUMA. Pero una vez sumado ya vive
  // dentro de la meta, así que volver a sumarlo cada lunes la haría crecer
  // sola: 2540 se convierte en 4580 en seis semanas. Se comprobó.
  //
  // En este modo el extra hace de SUELO y no de suma: nunca por debajo del
  // gasto más lo suyo. Los topes —el del riñón, los del carbohidrato y la
  // grasa— se aplican igual en los dos modos, porque esos sí son límites y
  // no aportes.
  function ajustarPorSalud(base, conds, opciones){
    var cal = base.cal, P = base.P, C = base.C, G = base.G;
    var notas = [], avisos = [];
    var soloTopes = !!(opciones && opciones.soloTopes);
    if(!conds || !conds.length) return {cal:cal, P:P, C:C, G:G, notas:notas, avisos:avisos};

    var extra = 0, sinDeficit = false;
    var topeCarb = null, topeGrasa = null, topeProt = null;
    function menor(a, b){ return a === null ? b : Math.min(a, b); }

    conds.forEach(function(c){
      var r = REGLAS_SALUD[c];
      if(!r) return;
      if(r.nota) notas.push(r.nota);
      if(r.extraCal) extra += r.extraCal;
      if(r.sinDeficit) sinDeficit = true;
      if(r.topeCarbPct  != null) topeCarb  = menor(topeCarb,  r.topeCarbPct);
      if(r.topeGrasaPct != null) topeGrasa = menor(topeGrasa, r.topeGrasaPct);
      if(r.topeProtGkg  != null) topeProt  = menor(topeProt,  r.topeProtGkg);
    });

    // 1. Calorías: primero se borra el déficit si no toca, luego el extra.
    if(soloTopes){
      // La meta que entra ya lleva el extra dentro. Aquí solo se le pone
      // suelo, y el suelo es el gasto MÁS lo que pida el embarazo o la
      // lactancia: es exactamente donde deja la cuenta de abajo la primera
      // vez. Se usa un máximo y no un «si baja, súbelo» para que subir siga
      // permitido: esto es un suelo, no una cifra fija.
      if(sinDeficit) cal = Math.max(cal, Math.round(base.gasto) + extra);
    } else {
      if(sinDeficit && cal < base.gasto) cal = Math.round(base.gasto);
      cal += extra;
    }

    // 2. Proteína: el tope renal manda sobre los 2 g/kg de siempre.
    if(topeProt !== null && base.peso > 0) P = Math.min(P, Math.round(base.peso * topeProt));

    // 3. Grasa: se queda en el 25% de siempre, con su tope si lo hay. El
    //    techo (35% si nadie lo baja) solo se usa para recolocar sobrantes.
    var techoG = Math.round(cal * (topeGrasa === null ? 0.35 : topeGrasa) / 9);
    G = Math.min(Math.round(cal * 0.25 / 9), techoG);

    // 4. Los carbohidratos son el resto; si se pasan del tope, se recortan.
    C = Math.max(0, Math.round((cal - P*4 - G*9) / 4));
    if(topeCarb !== null){
      var techoC = Math.round(cal * topeCarb / 4);
      if(C > techoC){
        C = techoC;
        // Lo recortado tiene que ir a algún sitio o las cuentas no cuadran:
        // primero a la grasa hasta su techo, y lo que quede a la proteína.
        var sobra = cal - C*4 - P*4 - G*9;
        var aGrasa = Math.min(Math.max(0, techoG - G), Math.round(sobra / 9));
        G += aGrasa; sobra -= aGrasa * 9;
        if(sobra > 0 && topeProt === null){ P += Math.round(sobra / 4); sobra = 0; }
        // Riñón limitado y carbohidrato limitado a la vez: no hay dónde
        // meterlo. Se devuelve al carbohidrato y se dice en voz alta, porque
        // el tope del riñón es el que no se puede tocar.
        if(sobra > 0){
          C += Math.round(sobra / 4);
          avisos.push('Con enfermedad renal no se puede bajar tanto el carbohidrato ' +
                      'sin subir la proteína, y ahí manda el riñón. Esto en concreto ' +
                      'tiene que verlo tu médico.');
        }
      }
    }
    return {cal:cal, P:P, C:C, G:G, notas:notas, avisos:avisos};
  }

  // El aviso deja de ser un texto fijo y dice qué se movió exactamente. Un
  // "consulta a tu médico" a secas no informa de nada.
  function pintarAvisoSalud(res){
    var caja = document.getElementById('regAvisoSalud');
    if(!caja) return;
    if(!res || (!res.notas.length && !res.avisos.length)){ caja.hidden = true; return; }
    caja.hidden = false;
    caja.innerHTML =
      // Sin icono: el simbolo medico no lo tiene esta fuente y salia un § roto.
      '<b>Qué cambia por lo que marcaste</b>' +
      '<ul>' + res.notas.map(function(n){ return '<li>' + n + '</li>'; }).join('') + '</ul>' +
      res.avisos.map(function(a){ return '<p class="cond-choque">' + a + '</p>'; }).join('') +
      '<span>No sustituye a tu médico: son reglas generales y conviene ' +
      'confirmarlas con tu médico.</span>';
  }

  // El gasto ESTIMADO: Mifflin-St Jeor por el factor de actividad.
  //
  // Sale aparte de calcularMacros porque lo necesita también la medición del
  // gasto real, que lo usa como tope de cordura. Copiarlo allí garantizaba
  // que un día se corrigiera aquí y allí no, y entonces la medición se
  // compararía contra una fórmula que ya no es la que da las calorías.
  //
  // Sin efectos: no pinta nada. calcularMacros sí pinta, y llamarla solo
  // para preguntarle el gasto repintaba media pantalla de registro.
  function gastoEstimado(){
    var edad = Number(document.getElementById('regEdad').value) || 0;
    var alt  = Number(document.getElementById('regAltura').value) || 0;
    var peso = Number(document.getElementById('regPeso').value) || 0;
    var tmb = 10*peso + 6.25*alt - 5*edad + (reg.sexo === 'h' ? 5 : -161);
    var nivel = NIVEL[reg.dias];
    return { tmb: tmb, gasto: tmb * nivel.f, nivel: nivel, peso: peso, alt: alt, edad: edad };
  }

  function calcularMacros(){
    var base = gastoEstimado();
    var edad = base.edad, alt = base.alt, peso = base.peso;
    var tmb = base.tmb, nivel = base.nivel, gasto = base.gasto;

    // Suelo de seguridad: nunca por debajo del metabolismo basal ni de
    // 1200 calorías. Por debajo de ahí ya no se pierde grasa, se pierde
    // músculo. Se queda aunque el ajuste vuelva a ser porcentual: en una
    // persona menuda y sedentaria, el −20% sí puede cruzar ese suelo.
    var cal = Math.max(
      Math.round(gasto * AJUSTE[reg.objetivo]),
      Math.round(tmb),
      1200
    );
    // Proteína 2 g/kg · grasas 25% de las calorías · el resto en carbos
    var P = Math.round(peso * 2);
    var G = Math.round(cal * 0.25 / 9);
    var C = Math.max(0, Math.round((cal - P*4 - G*9) / 4));

    // Y encima de eso, lo que pida la salud declarada.
    var salud = ajustarPorSalud(
      {cal:cal, P:P, C:C, G:G, gasto:gasto, peso:peso}, condicionesElegidas());
    cal = salud.cal; P = salud.P; C = salud.C; G = salud.G;
    pintarAvisoSalud(salud);

    // El ritmo se calcula del déficit REAL, no del que se pidió: si el suelo
    // recortó el déficit —o si el embarazo lo borró entero— la cifra que se
    // enseña tiene que reflejarlo. Por eso va después de la salud y no antes.
    var kgSemana = (cal - gasto) * 7 / KCAL_POR_KG;

    document.getElementById('regCal').textContent = mil(cal);
    document.getElementById('regP').textContent = P;
    document.getElementById('regC').textContent = C;
    document.getElementById('regG').textContent = G;
    document.getElementById('regNivel').textContent = nivel.t + ' · ' + reg.dias + ' días por semana';
    document.getElementById('regDetalle').textContent =
      'Gastas ~' + mil(Math.round(gasto)) + ' cal al día · ' + textoRitmo(kgSemana);
    return {cal:cal, P:P, C:C, G:G, peso:peso, alt:alt, edad:edad,
            gasto:gasto, kgSemana:kgSemana};
  }

  function grupoOpciones(id, campo){
    document.getElementById(id).addEventListener('click', function(e){
      var b = e.target.closest('button');
      if(!b) return;
      Array.from(this.querySelectorAll('button')).forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      reg[campo] = b.dataset.v !== undefined ? b.dataset.v : Number(b.textContent);
      calcularMacros();
    });
  }
  grupoOpciones('regSexo', 'sexo');
  grupoOpciones('regObjetivo', 'objetivo');

  // ---- Condiciones de salud ----
  // Se pueden marcar varias, así que no vale grupoOpciones (que deja una).
  // Diabetes 1 y 2 se excluyen entre sí: marcar una desmarca la otra. Eso
  // también lo rechaza la base (0020), porque la pantalla no es la única
  // puerta —la app habla por PostgREST y se puede llamar directo—.
  var CONDICIONES_EXCLUYENTES = [['diabetes_1', 'diabetes_2']];

  // Cuándo dio permiso para tratar esto. Si ya lo dio, no se le vuelve a
  // pedir; lo rellena el perfil al cargar.
  //
  // SE DECLARA AQUÍ, con lo que la usa, y no en la sección del aviso legal
  // que está seis mil líneas más abajo. `var` iza la declaración pero NO la
  // asignación: con ella allí, el `= null` corre al arrancar DESPUÉS de todo
  // esto, así que cualquiera que le pusiera valor durante el arranque se lo
  // encontraría borrado sin dejar rastro. Hoy no pasa —quien lo escribe llega
  // por una respuesta del servidor, más tarde— y por eso no se ve.
  //
  // Es exactamente la trampa que ya se cobró EVENTOS: está contada donde se
  // declara, unas líneas más arriba de aquí.
  var CONSENTIMIENTO_SALUD = null;
  var cajaCond = document.getElementById('regCondiciones');

  function condicionesElegidas(){
    return Array.from(cajaCond.querySelectorAll('button.on'))
                .map(function(b){ return b.dataset.cond; });
  }

  // ---- Devolver el perfil guardado a la pantalla del registro ----
  // calcularMacros() lee de esos campos, siempre, se haya llegado por el
  // alta o por el inicio de sesión. Quien iniciaba sesión los encontraba
  // vacíos: cambiar el objetivo desde Perfil recalculaba sobre ceros y
  // guardaba 1.200 cal y 0 g de proteína en la base.
  //
  // Cada dato solo se restaura si existe. Las seis cuentas de antes de la
  // migración 0022 no tienen sexo ni días, y en ese caso vale más el valor
  // por defecto de la pantalla que un null convertido en cero.
  function marcarUno(caja, valor){
    var els = document.getElementById(caja);
    if(!els || valor == null) return;
    Array.from(els.querySelectorAll('button')).forEach(function(b){
      var suyo = b.dataset.v !== undefined ? b.dataset.v : Number(b.textContent);
      b.classList.toggle('active', suyo === valor);
    });
  }

  function volcarPerfilEnRegistro(p){
    if(!p) return;
    if(p.age       != null) document.getElementById('regEdad').value   = p.age;
    if(p.height_cm != null) document.getElementById('regAltura').value = p.height_cm;
    if(p.weight_kg != null) document.getElementById('regPeso').value   = p.weight_kg;

    if(p.sexo){ reg.sexo = p.sexo; marcarUno('regSexo', p.sexo); }
    if(p.dias_entreno != null){ reg.dias = p.dias_entreno; marcarUno('regDias', p.dias_entreno); }

    // Las condiciones son parte del cálculo, no un adorno del alta: si no
    // vuelven, un diabético que cambie de objetivo recibe los macros de
    // alguien sano y nadie se entera.
    var suyas = p.condiciones || [];
    Array.from(cajaCond.querySelectorAll('[data-cond]')).forEach(function(b){
      b.classList.toggle('on', suyas.indexOf(b.dataset.cond) >= 0);
    });
    if(p.nota_salud) document.getElementById('regNotaSalud').value = p.nota_salud;
    CONSENTIMIENTO_SALUD = p.consentimiento_salud_en || null;

    calcularMacros();          // deja el aviso de salud acorde a lo restaurado
    pintarSaludPerfil();
  }

  cajaCond.addEventListener('click', function(e){
    var b = e.target.closest('[data-cond]');
    if(!b) return;
    var seEnciende = !b.classList.contains('on');
    b.classList.toggle('on', seEnciende);
    if(seEnciende){
      CONDICIONES_EXCLUYENTES.forEach(function(par){
        if(par.indexOf(b.dataset.cond) < 0) return;
        par.forEach(function(otra){
          if(otra === b.dataset.cond) return;
          var el = cajaCond.querySelector('[data-cond="' + otra + '"]');
          if(el) el.classList.remove('on');
        });
      });
    }
    calcularMacros();          // las calorías se mueven al momento, no al guardar
    revisarConsentimiento();   // marcar una condición pide la casilla de salud
  });

  // ---- Las dos casillas del registro ----
  // La de salud solo sale si declararon algo: pedirle consentimiento para
  // datos médicos a quien no dio ninguno es una casilla que no significa
  // nada, y las casillas que no significan nada se marcan sin leer.
  // ¿Están los tres números que deciden todo, y dicen algo posible?
  //
  //  Edad, altura y peso son la fórmula entera. Tenían su `min` y su `max`
  //  puestos en el HTML desde siempre, pero ninguno era obligatorio y nadie
  //  los miraba: el botón de empezar solo se apagaba por la casilla de los
  //  términos. Se podía terminar el alta con la edad y la altura en blanco.
  //
  //  Y ENTONCES LA CUENTA SIGUE SALIENDO, que es lo peor. `gastoEstimado()`
  //  hace `Number(campo.value) || 0`, así que un hueco vale cero, y Mifflin
  //  con altura 0 y edad 0 da un basal ridículo. Se midió: 80 kg con los
  //  otros dos vacíos daba «gastas ~1,248 cal al día», cuando lo real ronda
  //  las 2.200-2.800. Esa persona se lleva un déficit enorme que nadie quiso,
  //  se le queda guardado, y el anillo le dice cada día que se pasó.
  //
  //  Y no lo caza nada más: 1.248 pasa el suelo de 1.200 que protege de los
  //  déficits absurdos. El número parece correcto, y un número que parece
  //  correcto no lo mira nadie.
  //
  //  Los límites se leen del propio campo y no se copian aquí: dos listas de
  //  rangos se separan el día que se cambie uno.
  function datosCompletos(){
    return ['regEdad','regAltura','regPeso'].every(function(id){
      var el = document.getElementById(id);
      if(!el) return false;
      var t = String(el.value).trim();
      if(!t) return false;
      var v = Number(t);
      if(!isFinite(v)) return false;
      var min = Number(el.min), max = Number(el.max);
      if(isFinite(min) && v < min) return false;
      if(isFinite(max) && v > max) return false;
      return true;
    });
  }

  function revisarConsentimiento(){
    var hayCondiciones = condicionesElegidas().length > 0;
    var caja = document.getElementById('regAceptoSaludCaja');
    var salud = document.getElementById('regAceptoSalud');
    var terminos = document.getElementById('regAceptoTerminos');
    var boton = document.getElementById('regEmpezar');
    if(!caja || !boton) return;

    caja.hidden = !hayCondiciones;
    if(!hayCondiciones) salud.checked = false;
    boton.disabled = !terminos.checked ||
                     (hayCondiciones && !salud.checked) ||
                     !datosCompletos();
  }
  ['regAceptoTerminos', 'regAceptoSalud'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('change', revisarConsentimiento);
  });
  revisarConsentimiento();

  // ---- Las mismas condiciones, pero desde Perfil ----
  // Hasta ahora solo se podían declarar al darse de alta: quien ya tenía
  // cuenta no podía ponerlas y quien se equivocaba se quedaba con los macros
  // mal para siempre. Las píldoras se clonan de las del alta: dos listas
  // escritas a mano se desincronizan el día que se añada una condición.
  var saludSheet = document.getElementById('saludSheet');
  var cajaSalud  = document.getElementById('saludOpts');

  Array.from(cajaCond.querySelectorAll('[data-cond]')).forEach(function(b){
    var c = document.createElement('button');
    c.dataset.cond = b.dataset.cond;
    c.textContent  = b.textContent;
    cajaSalud.appendChild(c);
  });

  function elegidasEn(caja){
    return Array.from(caja.querySelectorAll('button.on'))
                .map(function(b){ return b.dataset.cond; });
  }
  function marcarEn(caja, lista){
    Array.from(caja.querySelectorAll('[data-cond]')).forEach(function(b){
      b.classList.toggle('on', lista.indexOf(b.dataset.cond) >= 0);
    });
  }
  function nombreCond(c){
    var b = cajaCond.querySelector('[data-cond="' + c + '"]');
    return b ? b.textContent : c;
  }

  // La fila de Perfil dice lo que hay puesto sin tener que abrir la hoja.
  function pintarSaludPerfil(){
    var el = document.getElementById('profSalud');
    if(!el) return;
    var n = condicionesElegidas();
    el.innerHTML = (n.length === 0 ? 'Ninguna' :
                    n.length <= 2  ? n.map(nombreCond).join(' · ') :
                    n.length + ' condiciones') + '<i>›</i>';
  }

  // Calcula con OTRA selección sin dejar rastro. Las condiciones de verdad
  // viven en las píldoras del alta, que es de donde lee calcularMacros();
  // aquí se prestan un momento y se devuelven como estaban.
  function comoSiTuviera(lista, fn){
    var antes = condicionesElegidas();
    marcarEn(cajaCond, lista);
    var r = fn();
    marcarEn(cajaCond, antes);
    calcularMacros();
    return r;
  }

  // La casilla expresa, también aquí. Declarar una condición desde Perfil
  // es exactamente lo mismo que declararla al registrarse: dato sensible y
  // consentimiento aparte. Si ya lo dio antes, no se le vuelve a pedir.
  function revisarConsentimientoSalud(){
    var hay = elegidasEn(cajaSalud).length > 0;
    var caja = document.getElementById('saludAceptoCaja');
    var chk = document.getElementById('saludAcepto');
    var btn = document.getElementById('saludGuardar');
    if(!caja) return;
    var hacefalta = hay && !CONSENTIMIENTO_SALUD;
    caja.hidden = !hacefalta;
    if(!hacefalta) chk.checked = false;
    btn.disabled = hacefalta && !chk.checked;
  }
  (function(){
    var c = document.getElementById('saludAcepto');
    if(c) c.addEventListener('change', revisarConsentimientoSalud);
  })();

  function pintarPreviaSalud(){
    revisarConsentimientoSalud();
    var elegidas = elegidasEn(cajaSalud);
    var m = comoSiTuviera(elegidas, calcularMacros);
    var caja = document.getElementById('saludPrevia');
    caja.hidden = false;
    caja.innerHTML =
      '<b>' + mil(m.cal) + ' cal · P ' + m.P + ' · C ' + m.C + ' · G ' + m.G + '</b>' +
      (elegidas.length
        ? '<ul>' + elegidas.map(function(c){
            var r = REGLAS_SALUD[c];
            return '<li>' + (r && r.nota ? r.nota : nombreCond(c)) + '</li>';
          }).join('') + '</ul>'
        : '<span>Sin ninguna marcada, el reparto es el de la fórmula.</span>');
  }

  document.getElementById('profSaludBtn').addEventListener('click', function(){
    marcarEn(cajaSalud, condicionesElegidas());
    document.getElementById('saludNota').value =
      document.getElementById('regNotaSalud').value;
    pintarPreviaSalud();
    saludSheet.classList.add('open');
  });

  cajaSalud.addEventListener('click', function(e){
    var b = e.target.closest('[data-cond]');
    if(!b) return;
    var seEnciende = !b.classList.contains('on');
    b.classList.toggle('on', seEnciende);
    if(seEnciende){
      CONDICIONES_EXCLUYENTES.forEach(function(par){
        if(par.indexOf(b.dataset.cond) < 0) return;
        par.forEach(function(otra){
          if(otra === b.dataset.cond) return;
          var el = cajaSalud.querySelector('[data-cond="' + otra + '"]');
          if(el) el.classList.remove('on');
        });
      });
    }
    pintarPreviaSalud();
  });

  function cerrarSalud(){ saludSheet.classList.remove('open'); }
  document.getElementById('saludCancelar').addEventListener('click', cerrarSalud);
  saludSheet.addEventListener('click', function(e){ if(e.target === saludSheet) cerrarSalud(); });

  document.getElementById('saludGuardar').addEventListener('click', function(){
    marcarEn(cajaCond, elegidasEn(cajaSalud));
    document.getElementById('regNotaSalud').value =
      document.getElementById('saludNota').value;

    var m = calcularMacros();
    goalP.value = m.P; goalC.value = m.C; goalG.value = m.G;
    // Igual que al cambiar de objetivo: esto ya lo confirmó la persona, no
    // debe volver a preguntarle si quiere guardar sus macros.
    metasVigentes = leerMetas();
    actualizarMetas();
    pintarSaludPerfil();
    cerrarSalud();
    toast('toastPeso', 'Salud guardada · ' + mil(m.cal) + ' cal al día');

    var tiene = condicionesElegidas().length > 0;
    if(tiene && !CONSENTIMIENTO_SALUD) CONSENTIMIENTO_SALUD = new Date().toISOString();
    sbActualizarPerfil({
      condiciones: condicionesElegidas(),
      nota_salud: document.getElementById('regNotaSalud').value.trim() || null,
      goal_protein_g: m.P, goal_carbs_g: m.C, goal_fat_g: m.G,
      // Se manda siempre: si quitó todas, se retira también el
      // consentimiento. Dejar de dar un dato no puede costar más que darlo.
      consentimiento_salud_en: tiene ? CONSENTIMIENTO_SALUD : null
    })['catch'](function(e){
      toast('toastPeso', 'No se pudo guardar: ' + traducirError(e.message));
    });
  });

  grupoOpciones('regDias', 'dias');
  ['regEdad','regAltura','regPeso'].forEach(function(id){
    document.getElementById(id).addEventListener('input', function(){
      calcularMacros();
      // Y volver a mirar si ya se puede empezar: sin esto el botón se
      // quedaría apagado para siempre, porque solo lo revisaban las casillas.
      revisarConsentimiento();
    });
  });
  calcularMacros();
  revisarConsentimiento();

  function aplicarRegistro(){
    var m = calcularMacros();
    var nombre = document.getElementById('regNombre').value.trim() || 'Eduardo';
    var correo = document.getElementById('regCorreo').value.trim();

    document.getElementById('saludoNombre').textContent = nombre;
    document.getElementById('profNombre').textContent = nombre;
    if(correo) document.getElementById('profEmail').textContent = correo;
    document.getElementById('profPeso').textContent = m.peso.toFixed(1) + ' kg';
    document.getElementById('profAltura').textContent = m.alt.toFixed(1) + ' cm';
    document.getElementById('profEdad').textContent = m.edad + ' años';
    pintarObjetivoPerfil();

    // Las metas del perfil quedan con lo calculado
    goalP.value = m.P; goalC.value = m.C; goalG.value = m.G;
    actualizarMetas();

    // El peso del registro cuenta como el primero
    PESOS[isoDe(HOY)] = Math.round(m.peso * 10) / 10;
    document.getElementById('pesoInput').value = PESOS[isoDe(HOY)];
    pintarPeso();
  }

  // ================= CONEXIÓN CON SUPABASE =================
  // Sin librería externa: la API de Supabase es HTTP corriente, así que
  // basta fetch. La app sigue siendo un solo archivo sin dependencias ni
  // build, que es lo que la hace fácil de alojar en cualquier sitio.
  //
  // La clave publicable va a la vista a propósito: es pública por diseño
  // y viaja en el HTML de cualquier app que use Supabase. Lo que impide
  // que alguien lea datos ajenos son las políticas RLS de la base, no el
  // secreto de esta clave. La clave `service_role` NUNCA debe estar aquí.
  var SB_URL = 'https://jeeoxcsbkcthpwtkimdt.supabase.co';
  var SB_KEY = 'sb_publishable_rCM5cTJ40dCrstUhB2ZAqw_qMIeYQNw';
  var SESION_KEY = 'macros.sesion';

  var sesion = null;
  try{ sesion = JSON.parse(localStorage.getItem(SESION_KEY) || 'null'); }catch(e){}

  function guardarSesion(s){
    sesion = s;
    try{
      if(s) localStorage.setItem(SESION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESION_KEY);
    }catch(e){}
  }

  // El token de acceso caduca en una hora. Cuando eso pasa, la API responde
  // 401 y hay que canjear el refresh_token por uno nuevo. Sin esto la app
  // funciona bien la primera hora y después deja de cargar datos sin
  // explicar por qué, que es la peor forma de fallar.
  // Caducada lo dice el SERVIDOR, y solo él.
  //
  // Antes se daba por caducada ante cualquier fallo del canje. Sin red el
  // fetch rechaza y ahí se acababa: la app borraba la sesión y pedía la
  // contraseña otra vez. O sea que abrir la app con datos flojos, pasada la
  // hora que dura el token, te echaba de tu propia cuenta. Un 503 de
  // Supabase, igual.
  //
  // Un 4xx en la ruta de auth sí es el servidor diciendo que ese
  // refresh_token ya no vale. Lo demás es "ahora no", y la sesión sigue
  // siendo buena.
  function noVale(){
    var e = new Error('Sesión caducada');
    e.caducada = true;
    return e;
  }

  // UN solo canje aunque lo pidan siete a la vez.
  //
  // Al arrancar se piden siete cosas juntas. Con el token vencido las siete
  // reciben 401 y las siete pedían su propio canje. Supabase ROTA el
  // refresh_token: el primero que llega lo gasta y a los otros seis les
  // contesta que el suyo ya no vale... y cada uno de esos seis daba la
  // sesión por caducada. El canje salía BIEN y aun así te echaba.
  var canjeEnMarcha = null;

  function sbRefrescar(){
    var rt = sesion && sesion.refresh_token;
    if(!rt) return Promise.reject(noVale());
    if(canjeEnMarcha) return canjeEnMarcha;

    canjeEnMarcha = fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method:'POST',
      headers:{ 'apikey': SB_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    }).then(function(r){
      if(!r.ok){
        // 408 y 429 no dicen que el token esté mal: dicen que se espere. El
        // 429 llega justo cuando la app arranca y pide varias cosas de
        // golpe, que es el peor momento para echar a nadie. Es la misma
        // distinción que hace esperaMejorMomento() con la cola, pero para
        // otra pregunta: aquella decide si algo se reintenta, esta si la
        // sesión sigue viva.
        var loDiceElServidor = r.status >= 400 && r.status < 500 &&
                               r.status !== 408 && r.status !== 429;
        if(loDiceElServidor) throw noVale();
        throw new Error('Error ' + r.status);
      }
      return r.json();
    }).then(function(s){
      guardarSesion(s);
      canjeEnMarcha = null;
      return s;
    })['catch'](function(e){
      canjeEnMarcha = null;
      throw e;
    });
    return canjeEnMarcha;
  }

  function sesionCaducada(){
    guardarSesion(null);
    goto('login', false);
    if(typeof avisarLogin === 'function') avisarLogin('Tu sesión caducó. Entra otra vez.');
  }

  function sbFetch(ruta, op, reintento){
    op = op || {};
    var h = { 'apikey': SB_KEY, 'Content-Type': 'application/json' };
    for(var k in (op.headers || {})) h[k] = op.headers[k];
    // Con sesión manda el token del usuario; sin ella, la clave anónima.
    h['Authorization'] = 'Bearer ' + ((sesion && sesion.access_token) || SB_KEY);

    return fetch(SB_URL + ruta, { method: op.method || 'GET', headers: h, body: op.body })
      .then(function(r){
        return r.text().then(function(t){
          var d = null;
          try{ d = t ? JSON.parse(t) : null; }catch(e){ d = t; }

          // Un 401 en las rutas de datos casi siempre es el token vencido.
          // Se refresca y se reintenta UNA vez; el `reintento` evita que dos
          // 401 seguidos se llamen en bucle.
          // Las rutas /auth/v1/ quedan fuera: ahí un 401 significa
          // "contraseña incorrecta", y refrescar no arregla eso.
          // Storage no responde 401 cuando el token vence: responde 403 con
          // «"exp" claim timestamp check failed». Mirando solo el 401, esa
          // petición no se reintentaba nunca y la persona veía un error de
          // permisos por algo que era simplemente una hora de sesión.
          var vencido = r.status === 401 ||
            (r.status === 403 && /exp.{0,3} claim|jwt expired/i.test(t || ''));

          if(vencido && !reintento && sesion && sesion.refresh_token &&
             ruta.indexOf('/auth/v1/') !== 0){
            return sbRefrescar()
              .then(function(){ return sbFetch(ruta, op, true); })
              ['catch'](function(e){
                // Solo si el servidor dijo que la sesión ya no vale. Si es
                // que no llegamos a preguntárselo -sin red, servidor caído-
                // la sesión sigue en el teléfono y se reintenta luego.
                if(e && e.caducada){ sesionCaducada(); throw new Error('Sesión caducada'); }
                throw e;
              });
          }

          if(!r.ok){
            var fallo = new Error((d && (d.msg || d.message || d.error_description || d.error))
                                  || ('Error ' + r.status));
            // El código va aparte del mensaje a propósito. Quien decide si
            // algo se reintenta -la cola- necesita distinguir un 400 de un
            // 503, y el mensaje no sirve: cuando la base manda el suyo, el
            // número no aparece por ningún lado.
            fallo.status = r.status;
            throw fallo;
          }
          return d;
        });
      });
  }

  // Storage no puede ir por sbFetch: sube archivos binarios y necesita su
  // propio Content-Type, no JSON. Pero sí necesita lo mismo que sbFetch
  // hace bien —refrescar el token vencido y reintentar una vez—, y por
  // usar `fetch` a pelo no lo tenía: a la hora de sesión, subir una foto
  // devolvía 403 y ahí se quedaba.
  //
  // Devuelve la Response tal cual: cada llamada la interpreta a su manera
  // (una sube un archivo, otra pide enlaces firmados).
  function sbStorage(ruta, op, reintento){
    op = op || {};
    var h = { 'apikey': SB_KEY };
    for(var k in (op.headers || {})) h[k] = op.headers[k];
    h['Authorization'] = 'Bearer ' + ((sesion && sesion.access_token) || SB_KEY);

    return fetch(SB_URL + ruta, { method: op.method || 'GET', headers: h, body: op.body })
      .then(function(r){
        if(r.ok || reintento || !sesion || !sesion.refresh_token) return r;
        // El cuerpo se lee de una copia: `r` tiene que llegar intacta a
        // quien llamó si al final no era el token.
        return r.clone().text().then(function(t){
          var vencido = r.status === 401 ||
            (r.status === 403 && /exp.{0,3} claim|jwt expired/i.test(t || ''));
          if(!vencido) return r;
          return sbRefrescar()
            .then(function(){ return sbStorage(ruta, op, true); })
            ['catch'](function(e){
              if(e && e.caducada){ sesionCaducada(); throw new Error('Sesión caducada'); }
              throw e;
            });
        });
      });
  }

  function sbRegistrar(correo, pass, nombre){
    return sbFetch('/auth/v1/signup', { method:'POST', body: JSON.stringify({
      email: correo, password: pass, data: { full_name: nombre }
    })});
  }
  function sbEntrar(correo, pass){
    return sbFetch('/auth/v1/token?grant_type=password', { method:'POST', body: JSON.stringify({
      email: correo, password: pass
    })});
  }
  // ---- Recuperar la cuenta desde el correo ----
  //
  //  A DÓNDE VUELVE EL ENLACE. Se manda `redirect_to` con la dirección de
  //  esta misma app. Supabase solo obedece si esa dirección está en su lista
  //  de permitidas (Authentication → URL Configuration); si no está, el
  //  enlace lleva al Site URL del proyecto, que de fábrica es localhost, y la
  //  persona acaba en una página que no existe con su enlace ya gastado.
  //
  //  Se calcula de `location` en vez de escribirla aquí: así vale igual
  //  desde el móvil, desde el ordenador y abriendo el archivo en local, y no
  //  hay una dirección escrita a mano que se quede vieja el día que cambie.
  function dondeVuelve(){
    return location.origin + location.pathname;
  }

  function sbRecuperar(correo){
    return sbFetch('/auth/v1/recover?redirect_to=' + encodeURIComponent(dondeVuelve()), {
      method: 'POST', body: JSON.stringify({ email: correo })
    });
  }

  // El cambio de contraseña NO puede ir por sbFetch: ahí la cabecera
  // `Authorization` se pone al final con la sesión guardada, y aquí hace
  // falta la del enlace del correo, que a propósito todavía no se ha
  // guardado en ningún sitio.
  function sbCambiarClave(token, nueva){
    return fetch(SB_URL + '/auth/v1/user', {
      method: 'PUT',
      headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ password: nueva })
    }).then(function(r){
      return r.text().then(function(t){
        var d = null;
        try{ d = t ? JSON.parse(t) : null; }catch(e){ d = t; }
        if(!r.ok){
          var fallo = new Error((d && (d.msg || d.message || d.error_description || d.error))
                                || ('Error ' + r.status));
          fallo.status = r.status;
          throw fallo;
        }
        return d;                       // el usuario, con su correo
      });
    });
  }

  // De quién es este token. Hace falta para guardar la sesión: la app usa
  // `sesion.user.id` por todas partes y la almohadilla del correo no trae el
  // usuario, solo el token.
  //
  // Va por `fetch` a pelo y no por sbFetch por lo mismo que sbCambiarClave:
  // ahí la cabecera Authorization se pone al final con la sesión guardada, y
  // aquí hace falta la del enlace, que todavía no lo está.
  function sbQuienEs(token){
    return fetch(SB_URL + '/auth/v1/user', {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token }
    }).then(function(r){
      return r.text().then(function(t){
        var d = null;
        try{ d = t ? JSON.parse(t) : null; }catch(e){ d = t; }
        if(!r.ok || !d || !d.id){
          var fallo = new Error((d && (d.msg || d.message || d.error_description || d.error))
                                || ('Error ' + r.status));
          fallo.status = r.status;
          throw fallo;
        }
        return d;
      });
    });
  }

  function sbSalir(){
    if(!sesion) return Promise.resolve();
    // CALLA A PROPOSITO: la sesion local ya se borro. Que el servidor no se
    // entere no cambia nada para quien acaba de salir, y un error al cerrar
    // sesion solo asusta.
    return sbFetch('/auth/v1/logout', { method:'POST' })['catch'](function(){});
  }

  // ================= APUNTAR SIN SEÑAL =================
  //
  //  EL PROBLEMA
  //
  //  El service worker ya conseguía que la app ABRIERA sin señal, pero no
  //  que se pudiera usar: se apuntaba una comida, el guardado fallaba, y la
  //  app deshacía lo que acababas de escribir. Se perdía.
  //
  //  Y duele donde más se usa: se apunta en restaurantes, en el gimnasio,
  //  viajando. Justo donde la señal es peor. Pasó de verdad en Celaya.
  //
  //  QUÉ HACE ESTO
  //
  //  Cuando una escritura falla PORQUE NO HAY RED, en vez de deshacerla se
  //  guarda en una cola en el teléfono y se manda cuando vuelva la señal.
  //  La pantalla se queda como está, que es lo que la persona espera.
  //
  //  LO QUE NO HACE: no toca las escrituras que fallan por otra cosa. Si el
  //  servidor dice que no —permisos, un dato inválido, la sesión caducada—
  //  eso sigue deshaciéndose como siempre. Encolar un error de verdad sería
  //  reintentarlo para siempre y decirle a la persona que se guardó algo
  //  que nunca se va a guardar.

  var COLA_KEY = 'macros.cola';
  var COLA = [];
  var COLA_TOPE = 400;      // ~400 apuntes sin señal; por encima de eso el
                            // problema es otro y llenar el almacenamiento
                            // del teléfono rompería también la sesión.

  // Un identificador propio para cada apunte.
  //
  // ES LO QUE HACE QUE REINTENTAR SEA SEGURO. `fetch` puede fallar DESPUÉS
  // de que el servidor haya recibido la petición -se corta al volver la
  // respuesta-, y entonces el apunte está guardado aunque aquí parezca que
  // no. Reintentar a ciegas lo duplicaría.
  //
  // Mandando nosotros el id, el reintento choca contra la clave primaria y
  // el servidor responde 409: "ya estaba". Eso no es un fallo, es la
  // confirmación de que llegó.
  function idNuevo(){
    try{ if(crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
    // Navegadores viejos, y `randomUUID` solo existe en contextos seguros.
    var b = new Uint8Array(16);
    (crypto.getRandomValues ? crypto : { getRandomValues: function(a){
      for(var i=0;i<a.length;i++) a[i] = Math.floor(Math.random()*256);
    }}).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;   // versión 4
    b[8] = (b[8] & 0x3f) | 0x80;   // variante
    var h = [].map.call(b, function(x){ return ('0'+x.toString(16)).slice(-2); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }

  // ¿Esto fue "no hay red" o fue el servidor diciendo que no?
  //
  // Es LA decisión de todo el mecanismo, y equivocarse tiene precio en las
  // dos direcciones: tomar un error real por falta de red deja al apunte
  // reintentándose para siempre; tomar la falta de red por error real
  // vuelve a perder la comida, que es justo lo que se venía a arreglar.
  //
  // Un `fetch` que no llega a hablar con nadie rechaza con TypeError y sin
  // status. Cualquier respuesta del servidor —incluido un 500— pasa por
  // sbFetch, que lanza un Error con el mensaje de la base. Por eso se mira
  // el tipo y no el texto: los mensajes cambian entre navegadores y entre
  // idiomas, y "Failed to fetch" en un iPhone es "Load failed".
  function sinConexion(e){
    if(navigator.onLine === false) return true;
    if(!e) return false;
    if(e.name === 'TypeError') return true;
    return /failed to fetch|load failed|networkerror|network request failed|conexi/i
      .test(String(e.message || ''));
  }

  function colaCargar(){
    try{ COLA = JSON.parse(localStorage.getItem(COLA_KEY) || '[]'); }catch(e){ COLA = []; }
    if(!Array.isArray(COLA)) COLA = [];
  }
  function colaGuardar(){
    try{ localStorage.setItem(COLA_KEY, JSON.stringify(COLA)); }
    catch(e){
      // Sin sitio en el teléfono. Se tira lo más viejo antes que perder lo
      // que se acaba de apuntar, que es lo que la persona tiene delante.
      COLA = COLA.slice(-50);
      try{ localStorage.setItem(COLA_KEY, JSON.stringify(COLA)); }catch(e2){}
    }
  }

  // Mete una escritura en la cola. `dueno` es el id de quien la apuntó: sin
  // eso, cerrar sesión y entrar con otra cuenta le mandaría los apuntes de
  // la anterior a la nueva.
  //
  // `clave` es opcional y sirve para lo que SE PISA a sí mismo. El peso es
  // uno por día: si alguien se pesa tres veces sin señal, lo que tiene que
  // subir es el último valor, no tres. Los apuntes de comida NO llevan
  // clave, porque dos platos iguales el mismo día son dos platos.
  function encolar(item){
    item.creado = item.creado || new Date().toISOString();
    item.dueno = (sesion && sesion.user && sesion.user.id) || null;
    if(item.clave) COLA = COLA.filter(function(x){ return x.clave !== item.clave; });
    COLA.push(item);
    if(COLA.length > COLA_TOPE) COLA = COLA.slice(-COLA_TOPE);
    colaGuardar();
    pintarPendientes();
  }

  // Quita de la cola una escritura que ya no hace falta mandar. Se usa al
  // borrar un apunte que todavía no había subido: en vez de encolar también
  // el borrado —y mandar un DELETE de algo que el servidor no ha visto
  // nunca— se cancela el alta y no queda rastro de ninguna de las dos.
  function desencolar(id){
    // Sin id no hay nada que quitar. Y colarse aquí con undefined se
    // llevaría por delante todo lo que no lleva `fila` -los borrados-,
    // porque undefined !== undefined es falso.
    if(!id) return false;
    var antes = COLA.length;
    COLA = COLA.filter(function(x){ return x.fila !== id; });
    if(COLA.length !== antes){ colaGuardar(); pintarPendientes(); }
    return COLA.length !== antes;
  }

  function hayPendientes(){
    var yo = sesion && sesion.user && sesion.user.id;
    return COLA.filter(function(x){ return !x.dueno || x.dueno === yo; }).length;
  }

  // Manda la cola, en orden y de una en una.
  //
  // EN ORDEN Y NO EN PARALELO a propósito: si se mandaran todas a la vez, un
  // alta y su borrado podrían llegar al revés y el apunte quedaría vivo para
  // siempre. Y EN CUANTO UNA FALLA POR RED, se para: seguir con las
  // siguientes las adelantaría por el mismo motivo.
  // ¿Esto fue el servidor diciendo que NO, o teniendo un mal minuto?
  //
  // Es la hermana de sinConexion(), y se le parece en lo que importa: los
  // dos casos significan "ahora no, luego". Un 500 o un 503 es Supabase
  // caído un rato; un 429 es haber mandado mucho de golpe, que es justo lo
  // que pasa al volver de un viaje con la cola llena. Tratarlos como un dato
  // inválido tiraba la comida apuntada sin señal por un rato malo del
  // servidor.
  //
  // Un 4xx normal SÍ es un no de verdad -un dato que no pasa una
  // restricción, un permiso- y ese hay que tirarlo: reintentarlo para
  // siempre atasca la cola y nada de lo que venga detrás vuelve a subir.
  function esperaMejorMomento(e){
    var c = e && e.status;
    return c === 408 || c === 429 || (c >= 500 && c <= 599);
  }

  var colaVaciando = false;
  function vaciarCola(){
    if(colaVaciando) return Promise.resolve(0);
    if(!sesion || !sesion.user) return Promise.resolve(0);
    var yo = sesion.user.id;
    var mios = COLA.filter(function(x){ return !x.dueno || x.dueno === yo; });
    if(!mios.length) return Promise.resolve(0);

    colaVaciando = true;
    var subidos = 0, rechazados = 0;

    function siguiente(){
      var item = COLA.filter(function(x){ return !x.dueno || x.dueno === yo; })[0];
      if(!item) return Promise.resolve();

      return sbFetch(item.ruta, item.op)
        .then(function(){ subidos++; })
        ['catch'](function(e){
          // Las dos formas de "ahora no": sin red, o el servidor de mal día.
          // Cortan la vuelta entera, porque seguir con los siguientes los
          // adelantaría y un alta podría llegar después de su borrado.
          if(sinConexion(e) || esperaMejorMomento(e)) throw e;
          // 409 es la clave primaria repitiéndose: este apunte YA estaba
          // guardado, la petición de antes sí llegó. No es un fallo.
          if(/duplicate key|already exists|409/i.test(String(e.message || ''))) subidos++;
          // Cualquier otro error del servidor: no se reintenta para siempre.
          // Se cuenta y se tira, o la cola se atasca y nada de lo que venga
          // detrás vuelve a subir nunca.
          else rechazados++;
        })
        .then(function(){
          COLA = COLA.filter(function(x){ return x !== item; });
          colaGuardar();
          return siguiente();
        });
    }

    return siguiente()
      ['catch'](function(){ /* sin red: lo que queda se queda para la próxima */ })
      .then(function(){
        colaVaciando = false;
        pintarPendientes();
        // Aunque no subiera NINGUNO. Si el servidor los rechazó todos, los
        // apuntes desaparecen de la cola y de la pantalla, y callarlo es la
        // peor versión posible: la persona cree que su comida está guardada.
        if(subidos || rechazados) avisarSubidos(subidos, rechazados);
        return subidos;
      });
  }

  // Se intenta al volver la señal, y también al abrir: `online` no salta si
  // el teléfono ya tenía red al arrancar.
  window.addEventListener('online', function(){ vaciarCola(); });

  // Y al volver a la app después de dejarla en segundo plano.
  //
  // No es redundante con `online`: el caso corriente es el wifi del
  // restaurante, que da señal pero no sale a internet. Ahí `navigator.onLine`
  // vale true todo el rato y el evento `online` NO llega nunca, así que sin
  // esto la cola se quedaría esperando a que la app se cerrara y se
  // volviera a abrir. Guardas el teléfono, sales a la calle, lo sacas: ahí
  // se sube.
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) vaciarCola();
  });

  colaCargar();

  // ---- Que se vea que hay cosas sin subir ----
  //
  // No es un adorno. Sin esto, la app se comporta EXACTAMENTE igual con
  // señal que sin ella, y esa es la peor versión posible: la persona cree
  // que su comida está guardada, borra la app o cambia de teléfono, y
  // descubre que no estaba. Mientras haya algo en la cola tiene que verse.
  function pintarPendientes(){
    var el = document.getElementById('avisoPendientes');
    if(!el) return;
    var n = hayPendientes();
    el.hidden = !n;
    if(!n) return;
    var t = el.querySelector('b');
    if(t) t.textContent = n === 1 ? 'Falta subir 1 apunte' : 'Faltan subir ' + n + ' apuntes';
  }

  // ---- La despensa, guardada en el teléfono ----
  //
  //  POR QUÉ
  //
  //  Tus alimentos guardados, tus recetas y tus frecuentes se piden al
  //  servidor en cada arranque y no se guardaban en ninguna parte. Con eso,
  //  abrir la app SIN señal desde cero dejaba la despensa vacía: se podía
  //  apuntar, pero tecleando el nombre y los macros a mano, uno por uno.
  //  O sea que lo de apuntar sin señal funcionaba de verdad solo si habías
  //  abierto la app con señal ANTES de quedarte sin ella.
  //
  //  Son unos pocos KB. Guardarlos convierte el caso malo en el bueno.
  //
  //  ES UNA COPIA, NO LA VERDAD. Se sobrescribe entera cada vez que la
  //  carga del servidor sale bien, así que no puede quedarse vieja más de
  //  una apertura con señal. Y va por usuario: la despensa de uno no puede
  //  aparecer en la sesión de otro.
  var DESPENSA_KEY = 'macros.despensa';
  var DESPENSA_TOPE = 600;      // alimentos; por encima de eso no cabe en el
                                // almacenamiento y tampoco se busca a mano.

  function guardarDespensa(){
    if(!sesion || !sesion.user) return;
    try{
      localStorage.setItem(DESPENSA_KEY, JSON.stringify({
        dueno: sesion.user.id,
        alimentos: MIS_ALIMENTOS.slice(0, DESPENSA_TOPE),
        recetas: RECETAS.slice(0, DESPENSA_TOPE)
      }));
    }catch(e){
      // Sin sitio: se prefiere quedarse sin copia antes que reventar el
      // arranque. La app sigue funcionando con señal, que es lo de siempre.
      try{ localStorage.removeItem(DESPENSA_KEY); }catch(e2){}
    }
  }

  // Se llama ANTES de pedir nada al servidor: si hay señal, lo de la red
  // llegará un segundo después y lo sustituirá; si no la hay, esto es todo
  // lo que va a haber y es mucho mejor que nada.
  function cargarDespensa(){
    if(!sesion || !sesion.user) return false;
    var d = null;
    try{ d = JSON.parse(localStorage.getItem(DESPENSA_KEY) || 'null'); }catch(e){}
    if(!d || d.dueno !== sesion.user.id) return false;
    MIS_ALIMENTOS.length = 0;
    (d.alimentos || []).forEach(function(a){ MIS_ALIMENTOS.push(a); });
    RECETAS.length = 0;
    (d.recetas || []).forEach(function(r){ RECETAS.push(r); });
    if(typeof recalcularFrecuentes === 'function') recalcularFrecuentes();
    if(typeof pintarListas === 'function') pintarListas();
    return true;
  }

  // Los pesos y cinturas que están en la cola sin subir. Igual que con la
  // comida: sin esto, quien se pesa sin señal y cierra la app se encuentra
  // el peso de hoy en blanco, lo vuelve a apuntar, y al volver la señal
  // suben dos veces -que en el peso ni siquiera duplica, PISA, así que el
  // segundo valor tecleado gana silenciosamente-.
  function pesosEnCola(){
    var yo = sesion && sesion.user && sesion.user.id;
    return COLA.filter(function(x){
      return x.tipo === 'peso' && (!x.dueno || x.dueno === yo);
    }).map(function(x){
      try{ return JSON.parse(x.op.body); }catch(e){ return null; }
    }).filter(Boolean);
  }

  // Vuelca esos pesos en PESOS y CINTURAS, encima de lo que haya venido del
  // servidor. Van DESPUÉS a propósito: si el mismo día está en los dos
  // sitios, lo que vale es lo que la persona acaba de teclear.
  function aplicarPesosEnCola(){
    pesosEnCola().forEach(function(f){
      var k = f.log_date;
      if(f.weight_kg != null) PESOS[k] = Number(f.weight_kg);
      if(f.cintura_cm != null){
        CINTURAS = CINTURAS.filter(function(m){ return m.fecha !== k; });
        CINTURAS.push({ fecha: k, cm: Number(f.cintura_cm) });
        CINTURAS.sort(function(a, b){ return a.fecha < b.fecha ? -1 : 1; });
      }
    });
  }

  function avisarSubidos(subidos, rechazados){
    var msg = subidos === 1 ? 'Se subió 1 apunte' : 'Se subieron ' + subidos + ' apuntes';
    // Los rechazados se dicen, no se callan: son apuntes que la persona ve
    // en pantalla y que el servidor no aceptó. Si no se avisa, desaparecen
    // en la siguiente recarga sin explicación.
    if(rechazados) msg += ' · ' + rechazados + (rechazados === 1 ? ' no se pudo' : ' no se pudieron');
    toast('toastComida', msg);
  }

  // Vuelca en `profiles` lo que el registro ya preguntó. El perfil lo creó
  // solo un trigger al darse de alta, así que aquí basta con actualizarlo.
  // Si la base va por detrás de la app, se reintenta sin los campos que no
  // existen todavía.
  //
  // Esto no es teoría: al subir el consentimiento antes que su migración,
  // el registro entero dejó de guardar. Perder la cuenta de alguien porque
  // una columna nueva aún no está es un precio absurdo, y la app se
  // despliega sola al empujar mientras que las migraciones van a mano, así
  // que ese desfase va a repetirse.
  //
  // 42703 es "column ... does not exist". Solo se reintenta ante ESE error:
  // ante cualquier otro se falla, porque tragarse un fallo de permisos o de
  // restricción sería mucho peor que un registro perdido.
  function patchPerfilTolerante(datos, opcionales){
    var url = '/rest/v1/profiles?id=eq.' + sesion.user.id;
    var opciones = { method:'PATCH', headers:{ 'Prefer':'return=minimal' } };
    var todo = {};
    Object.keys(datos).forEach(function(k){ todo[k] = datos[k]; });
    Object.keys(opcionales).forEach(function(k){ todo[k] = opcionales[k]; });

    opciones.body = JSON.stringify(todo);
    return sbFetch(url, opciones)['catch'](function(e){
      if(String(e.message || '').indexOf('42703') < 0 &&
         !/does not exist/i.test(String(e.message || ''))) throw e;
      return sbFetch(url, {
        method:'PATCH', headers:{ 'Prefer':'return=minimal' },
        body: JSON.stringify(datos)
      });
    });
  }

  function sbGuardarPerfil(){
    if(!sesion || !sesion.user) return Promise.resolve();
    var m = calcularMacros();
    return patchPerfilTolerante({
        full_name:      document.getElementById('regNombre').value.trim(),
        age:      Number(document.getElementById('regEdad').value)   || null,
        height_cm:Number(document.getElementById('regAltura').value) || null,
        weight_kg:Number(document.getElementById('regPeso').value)   || null,
        goal: reg.objetivo,                       // 'bajar' | 'mantener' | 'subir'
        // Las otras dos entradas de la fórmula. Sin ellas, recalcular al
        // volver a entrar usaba el valor por defecto de la pantalla en vez
        // del de la persona: 166 cal de error por el sexo y hasta un 11%
        // por los días de entreno.
        sexo: reg.sexo,
        dias_entreno: reg.dias,
        goal_protein_g: m.P, goal_carbs_g: m.C, goal_fat_g: m.G,
        condiciones: condicionesElegidas(),
        nota_salud: document.getElementById('regNotaSalud').value.trim() || null
      }, {
        // La constancia. La versión va con la fecha porque el texto va a
        // cambiar, y "aceptó" sin decir qué aceptó no sirve de nada.
        //
        // Va en el segundo grupo —el que se puede caer— solo mientras la
        // migración 0031 no esté aplicada. En cuanto lo esté, sube al
        // primero: un consentimiento que se pierde en silencio no vale.
        consentimiento_en: new Date().toISOString(),
        consentimiento_version: VERSION_LEGAL,
        consentimiento_salud_en: condicionesElegidas().length
          ? new Date().toISOString() : null
      });
  }

  // Los mensajes de Supabase vienen en inglés y de cara al usuario no sirven.
  function traducirError(msg){
    var m = String(msg || '').toLowerCase();
    if(m.indexOf('already regist') >= 0)   return 'Ese correo ya tiene cuenta. Usa "Ya tengo cuenta".';
    if(m.indexOf('invalid login') >= 0)    return 'Correo o contraseña incorrectos.';
    if(m.indexOf('email not confirmed')>=0)return 'Falta confirmar tu correo. Revisa tu bandeja de entrada.';
    if(m.indexOf('password') >= 0 && m.indexOf('least') >= 0)
                                           return 'La contraseña necesita al menos 6 caracteres.';

    // ---- Recuperar la contraseña ----
    // VAN ANTES DEL 429 GENÉRICO de más abajo. Ese dice «llegaste a tu tope
    // de consultas por hoy», que es del asistente: leerlo después de pedir un
    // enlace por correo no tiene ningún sentido y encima suena a que la
    // cuenta se quedó sin nada.
    if(m.indexOf('otp_expired') >= 0 ||
       (m.indexOf('email link') >= 0 && m.indexOf('expired') >= 0) ||
       m.indexOf('access_denied') >= 0)
      return 'Ese enlace ya no vale: caducó o ya se usó. Pide otro con «Olvidé mi contraseña».';
    if(m.indexOf('email_send_rate') >= 0 || m.indexOf('email rate limit') >= 0 ||
       m.indexOf('only request this after') >= 0)
      return 'Acabas de pedir uno. Espera un minuto y vuelve a intentarlo.';
    if(m.indexOf('should be different') >= 0)
      return 'Esa es la que ya tenías. Elige una distinta.';
    if(m.indexOf('same_password') >= 0)
      return 'Esa es la que ya tenías. Elige una distinta.';
    if(m.indexOf('failed to fetch') >= 0 || m.indexOf('networkerror') >= 0)
                                           return 'Sin conexión. Revisa tu internet e inténtalo otra vez.';

    // El asistente caído. Esto pasó de verdad y estuvo horas así: la función
    // no arrancaba y lo que se veía en pantalla era «Function failed to
    // start (please check logs)». En inglés, hablando de unos registros que
    // quien lo lee no puede abrir, y sin decir lo único que importa: que no
    // es culpa suya y que no ha perdido nada.
    if(m.indexOf('boot_error') >= 0 || m.indexOf('failed to start') >= 0 ||
       m.indexOf('worker_limit') >= 0 || m.indexOf('worker_error') >= 0)
      return 'El asistente está caído. No es cosa tuya y no perdiste nada: ' +
             'lo que apuntaste sigue guardado. Inténtalo en un rato.';

    // El servidor tardó más de lo que aguanta la petición. Con foto pasa:
    // la imagen viaja, se analiza y a veces no llega a tiempo.
    if(m.indexOf('timeout') >= 0 || m.indexOf('timed out') >= 0 || m.indexOf('504') >= 0)
      return 'El asistente tardó demasiado. Inténtalo otra vez; si mandaste ' +
             'foto, prueba con una más ligera.';

    // Los topes de gasto. Son a propósito, así que se explican como una
    // norma y no como una avería.
    if(m.indexOf('429') >= 0 || m.indexOf('rate limit') >= 0 || m.indexOf('too many') >= 0)
      return 'Llegaste a tu tope de consultas por hoy. Vuelve mañana.';

    // Un 5xx suelto de Supabase o de Anthropic. Sin esto salía «Error 500».
    if(/^error 5\d\d$/.test(m) || m.indexOf('internal server error') >= 0 ||
       m.indexOf('service unavailable') >= 0 || m.indexOf('bad gateway') >= 0)
      return 'El servidor falló. No perdiste nada de lo que ya apuntaste; ' +
             'inténtalo otra vez en un momento.';

    return msg;
  }

  // Deja el botón inutilizable mientras se espera al servidor, para que
  // nadie cree dos cuentas por pulsar dos veces.
  function ocupado(btn, si, txt){
    btn.disabled = si;
    if(si){ btn.dataset.txt = btn.textContent; btn.textContent = txt; }
    else if(btn.dataset.txt){ btn.textContent = btn.dataset.txt; }
  }

  // Una vez registrado, la app abre directo en el Diario. El registro no vuelve a salir.
  var CLAVE = 'macros.cuenta';
  function guardarCuenta(){
    try{
      localStorage.setItem(CLAVE, JSON.stringify({
        nombre: document.getElementById('regNombre').value.trim(),
        correo: document.getElementById('regCorreo').value.trim(),
        sexo: reg.sexo, objetivo: reg.objetivo, dias: reg.dias,
        edad: document.getElementById('regEdad').value,
        altura: document.getElementById('regAltura').value,
        peso: document.getElementById('regPeso').value
      }));
    }catch(e){}
  }
  function restaurarCuenta(){
    var raw = null;
    try{ raw = localStorage.getItem(CLAVE); }catch(e){}
    if(!raw) return false;
    try{
      var c = JSON.parse(raw);
      document.getElementById('regNombre').value = c.nombre || '';
      document.getElementById('regCorreo').value = c.correo || '';
      document.getElementById('regEdad').value = c.edad;
      document.getElementById('regAltura').value = c.altura;
      document.getElementById('regPeso').value = c.peso;
      reg.sexo = c.sexo; reg.objetivo = c.objetivo; reg.dias = c.dias;
      function marcar(id, val){
        Array.from(document.querySelectorAll('#'+id+' button')).forEach(function(b){
          var v = b.dataset.v !== undefined ? b.dataset.v : Number(b.textContent);
          b.classList.toggle('active', v === val);
        });
      }
      marcar('regSexo', c.sexo); marcar('regObjetivo', c.objetivo); marcar('regDias', c.dias);
      aplicarRegistro();
      return true;
    }catch(e){ return false; }
  }

  // El correo es obligatorio: sin él no se puede crear la cuenta
  var campoNombre = document.getElementById('regNombre');
  var campoCorreo = document.getElementById('regCorreo');
  var avisoCorreo = document.getElementById('regCorreoAviso');
  var AVISO_BASE = avisoCorreo.textContent;

  function correoValido(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function marcarError(campo, aviso, msg){
    campo.classList.add('error');
    campo.focus();
    if(aviso){ aviso.textContent = msg; aviso.classList.add('error'); }
  }
  function limpiarError(){
    campoNombre.classList.remove('error');
    campoCorreo.classList.remove('error');
    avisoCorreo.textContent = AVISO_BASE;
    avisoCorreo.classList.remove('error');
  }
  campoNombre.addEventListener('input', limpiarError);
  campoCorreo.addEventListener('input', limpiarError);

  function validarRegistro(){
    limpiarError();
    if(!campoNombre.value.trim()){ marcarError(campoNombre, null); return false; }
    var c = campoCorreo.value.trim();
    if(!c){ marcarError(campoCorreo, avisoCorreo, 'Necesitas un correo para crear tu cuenta.'); return false; }
    if(!correoValido(c)){ marcarError(campoCorreo, avisoCorreo, 'Ese correo no se ve bien. Revísalo.'); return false; }
    return true;
  }

  // ---- Alta de cuenta real ----
  var campoPass  = document.getElementById('regPass');
  var avisoPass  = document.getElementById('regPassAviso');
  var AVISO_PASS = avisoPass.textContent;
  campoPass.addEventListener('input', function(){
    campoPass.classList.remove('error');
    avisoPass.textContent = AVISO_PASS;
    avisoPass.classList.remove('error');
  });

  var btnEmpezar = document.getElementById('regEmpezar');
  btnEmpezar.addEventListener('click', function(){
    if(!validarRegistro()) return;
    if(campoPass.value.length < 6){
      marcarError(campoPass, avisoPass, 'La contraseña necesita al menos 6 caracteres.');
      return;
    }
    var correo = campoCorreo.value.trim(), pass = campoPass.value;
    ocupado(btnEmpezar, true, 'Creando tu cuenta…');

    sbRegistrar(correo, pass, campoNombre.value.trim())
      .then(function(r){
        // Si el proyecto NO exige confirmar el correo, el alta ya devuelve
        // la sesión y se entra directo. Si la exige, no hay sesión todavía:
        // se avisa y se manda a iniciar sesión, que es donde volverá tras
        // pulsar el enlace del correo.
        if(r && r.access_token) return r;
        aplicarRegistro();
        guardarCuenta();
        logCorreo.value = correo;
        goto('login', false);
        avisarLogin('Cuenta creada. Te mandamos un correo a ' + correo +
                    ' — ábrelo, confirma, y entra aquí.');
        return null;
      })
      .then(function(s){
        if(!s) return;          // quedó pendiente de confirmar: no hay sesión
        guardarSesion(s);
        aplicarRegistro();
        guardarCuenta();
        return sbGuardarPerfil()
          .then(function(){ goto('diario', false); return cargarDatos(); })
          ['catch'](function(e){
            // AQUÍ LA CUENTA YA EXISTE Y LA SESIÓN ESTÁ ACTIVA. Si esto
            // cayera al catch de abajo, saldría un error junto al correo
            // en la pantalla de registro, esta persona lo reintentaría, y
            // el reintento falla con "ese correo ya tiene cuenta": queda
            // atrapada fuera de una cuenta que ya es suya, y si entra por
            // login se la encuentra sin peso, altura, edad ni objetivo.
            //
            // Así que se entra igual -que es lo cierto- y se dice qué es lo
            // único que falta.
            goto('diario', false);
            toast('toastComida', 'Tu cuenta está lista, pero no pude guardar tus datos: ' +
                  traducirError(e.message) + ' Complétalos en Perfil.');
            return cargarDatos();
          });
      })
      ['catch'](function(e){ marcarError(campoCorreo, avisoCorreo, traducirError(e.message)); })
      .then(function(){ ocupado(btnEmpezar, false); });
  });

  // "Ya tengo cuenta" ahora lleva de verdad a iniciar sesión
  document.getElementById('regSaltar').addEventListener('click', function(){
    goto('login', false);
  });
  document.getElementById('logCrear').addEventListener('click', function(){
    goto('registro', false);
  });

  // ---- Inicio de sesión ----
  var logCorreo = document.getElementById('logCorreo');
  var logPass   = document.getElementById('logPass');
  var logAviso  = document.getElementById('logAviso');
  var btnEntrar = document.getElementById('logEntrar');

  function avisarLogin(msg){
    logAviso.textContent = msg || ' ';
    logAviso.classList.toggle('error', !!msg);
  }
  // Lo mismo, pero sin pintarlo de rojo: hay cosas que decir ahí que no son
  // un fallo. Se escribía llamando a avisarLogin('') y pisando el texto
  // justo después, que funciona y no se entiende.
  function decirLogin(msg){
    logAviso.textContent = msg;
    logAviso.classList.remove('error');
  }
  logCorreo.addEventListener('input', function(){ avisarLogin(''); });
  logPass.addEventListener('input', function(){ avisarLogin(''); });

  function entrar(){
    var correo = logCorreo.value.trim(), pass = logPass.value;
    if(!correoValido(correo)){ avisarLogin('Ese correo no se ve bien. Revísalo.'); return; }
    if(!pass){ avisarLogin('Escribe tu contraseña.'); return; }

    ocupado(btnEntrar, true, 'Entrando…');
    sbEntrar(correo, pass)
      .then(function(s){
        guardarSesion(s);
        logPass.value = '';
        avisarLogin('');
        goto('diario', false);
        return cargarDatos();
      })
      ['catch'](function(e){ avisarLogin(traducirError(e.message)); })
      .then(function(){ ocupado(btnEntrar, false); });
  }
  btnEntrar.addEventListener('click', entrar);
  logPass.addEventListener('keydown', function(e){ if(e.key === 'Enter') entrar(); });

  // ---- "Olvidé mi contraseña" ----
  //
  //  SE CONTESTA LO MISMO EXISTA O NO LA CUENTA, que es lo que hace el
  //  servidor: si aquí se dijera «ese correo no está registrado», cualquiera
  //  podría averiguar quién tiene cuenta probando correos.
  var btnOlvide = document.getElementById('logOlvide');
  btnOlvide.addEventListener('click', function(){
    var correo = logCorreo.value.trim();
    if(!correoValido(correo)){
      // El correo hace falta y es lo único que hace falta. Se pide arriba en
      // vez de abrir otra pantalla a pedir lo mismo.
      avisarLogin('Escribe arriba tu correo y vuelve a tocar aquí.');
      logCorreo.focus();
      return;
    }
    ocupado(btnOlvide, true, 'Mandando…');
    sbRecuperar(correo)
      .then(function(){
        decirLogin('Si esa cuenta existe, te llegó un correo con un enlace para ' +
                   'poner otra contraseña. Revisa también el spam.');
      })
      ['catch'](function(e){ avisarLogin(traducirError(e.message)); })
      .then(function(){ ocupado(btnOlvide, false); });
  });

  // ---- Entrar con un enlace que trae sesión ----
  //
  //  Supabase manda la vuelta igual para varias cosas y se distinguen por
  //  `type`: `recovery` es la de aquí, pero también hay `signup` -confirmar
  //  la cuenta-, `invite`, `magiclink` y `email_change`. Todas traen una
  //  sesión buena en la almohadilla.
  //
  //  Leyendo solo `recovery`, las demás caían al último `else`... DESPUÉS de
  //  que la dirección se hubiera limpiado. O sea que el token se destruía y
  //  la persona acababa en la pantalla de registro como si no hubiera pulsado
  //  nada, sin poder ni recargar para reintentar. Tirar el token es peor que
  //  no leerlo.
  //
  //  Hoy el proyecto no manda ninguno —confirmar el correo está apagado— pero
  //  eso es una casilla del panel, y el día que se encienda esto ya funciona.
  var TIPOS_DE_ENLACE = ['signup', 'invite', 'magiclink', 'email_change'];

  function entrarConElEnlace(p){
    sbQuienEs(p.access_token)
      .then(function(u){
        guardarSesion({
          access_token: p.access_token,
          // Puede no venir. Si falta, dentro de una hora la sesión se acaba y
          // se pide entrar, que es lo honesto: no hay con qué renovarla.
          refresh_token: p.refresh_token || null,
          user: u
        });
        goto('diario', false);
        return cargarDatos();
      })
      ['catch'](function(e){
        goto('login', false);
        // AQUÍ SIEMPRE SE VIENE DE UN ENLACE, así que se puede decir con esas
        // palabras. El traductor general no puede: el mismo error del
        // servidor —«invalid JWT: unable to parse or verify signature»— en
        // otra pantalla es una sesión caducada, y hablar ahí de «enlaces»
        // confundiría. Sin esto salía ese texto tal cual, en inglés y
        // hablando de JWT, a quien solo pulsó un enlace de su correo.
        //
        // Menos si es la red: decirle «pide otro enlace» a quien no tiene
        // cobertura le gasta el que ya tiene para nada.
        avisarLogin(sinConexion(e)
          ? traducirError(e.message)
          : 'Ese enlace ya no vale: caducó o ya se usó. Pide uno nuevo.');
      });
  }

  // ---- La vuelta del enlace del correo ----
  //
  //  Supabase manda de vuelta a la app con la sesión detrás de la almohadilla:
  //  #access_token=...&refresh_token=...&type=recovery
  //
  //  Esa parte de la dirección NO viaja al servidor —se queda en el
  //  navegador—, así que leerla aquí es la única forma de enterarse.
  function loQueTraeElEnlace(){
    var h = String(location.hash || '').replace(/^#/, '');
    if(!h) return null;
    var p = {};
    h.split('&').forEach(function(par){
      var i = par.indexOf('=');
      if(i <= 0) return;
      try{
        p[decodeURIComponent(par.slice(0, i))] =
          decodeURIComponent(par.slice(i + 1).replace(/\+/g, ' '));
      }catch(e){}                       // una almohadilla cualquiera no puede tumbar el arranque
    });
    if(!p.access_token && !p.error && !p.error_description) return null;
    return p;
  }

  // Se limpia en cuanto se ha leído: ese token es una sesión, y dejarlo en la
  // barra de direcciones lo deja también en el historial y en lo que se
  // comparta de esa pantalla.
  function limpiarElEnlace(){
    try{
      history.replaceState(null, '', location.pathname + location.search);
    }catch(e){ location.hash = ''; }
  }

  var claveToken = null;               // la sesión del enlace, sin guardar todavía
  var clavePass  = document.getElementById('clavePass');
  var clavePass2 = document.getElementById('clavePass2');
  var claveAviso = document.getElementById('claveAviso');
  var btnClave   = document.getElementById('claveGuardar');

  function avisarClave(msg){
    claveAviso.textContent = msg || ' ';
    claveAviso.classList.toggle('error', !!msg);
  }
  clavePass.addEventListener('input', function(){ avisarClave(''); });
  clavePass2.addEventListener('input', function(){ avisarClave(''); });

  document.getElementById('claveCancelar').addEventListener('click', function(){
    claveToken = null;
    clavePass.value = ''; clavePass2.value = '';
    goto('login', false);
  });

  clavePass2.addEventListener('keydown', function(e){
    if(e.key === 'Enter') btnClave.click();
  });

  btnClave.addEventListener('click', function(){
    var nueva = clavePass.value, otra = clavePass2.value;
    if(nueva.length < 6){ avisarClave('La contraseña necesita al menos 6 caracteres.'); return; }
    // Dos veces, porque aquí no hay forma de darse cuenta del error: si se
    // teclea mal, se guarda mal y la persona se queda fuera otra vez, y ya
    // gastó su enlace.
    if(nueva !== otra){ avisarClave('Las dos no son iguales. Revísalas.'); return; }
    if(!claveToken){ avisarClave('Este enlace ya no vale. Pide otro desde «Olvidé mi contraseña».'); return; }

    ocupado(btnClave, true, 'Guardando…');
    var elToken = claveToken;
    sbCambiarClave(elToken, nueva)
      .then(function(usuario){
        // YA ESTÁ CAMBIADA. A partir de aquí nada puede hacer que no lo esté,
        // y todo lo que venga después se cuenta desde ahí.
        claveToken = null;
        var correo = (usuario && usuario.email) || '';
        clavePass.value = ''; clavePass2.value = '';

        // Se entra con la contraseña NUEVA en vez de aprovechar la sesión del
        // enlace. Es una petición más, pero deja una sesión completa y
        // normal; la del enlace puede venir sin con qué renovarse, y entonces
        // la app funcionaría una hora y luego echaría a la persona.
        // Sin correo no hay con qué entrar. Llamar igual da un error que
        // suena a que la contraseña no se guardó, cuando sí se guardó.
        if(!correo){
          goto('login', false);
          avisarLogin('Tu contraseña ya está cambiada. Entra con ella.');
          return;
        }

        return sbEntrar(correo, nueva)
          .then(function(sn){
            guardarSesion(sn);
            goto('diario', false);
            return cargarDatos();
          })
          ['catch'](function(){
            // La contraseña SÍ se cambió. Decir «no se pudo» aquí sería
            // mentir y dejar a la persona probando la vieja.
            logCorreo.value = correo;
            goto('login', false);
            avisarLogin('Tu contraseña ya está cambiada. Entra con ella.');
          });
      })
      ['catch'](function(e){ avisarClave(traducirError(e.message)); })
      .then(function(){ ocupado(btnClave, false); });
  });

  // ---- Cerrar sesión ----
  document.getElementById('cerrarSesion').addEventListener('click', function(){
    sbSalir().then(function(){
      guardarSesion(null);
      try{ localStorage.removeItem(CLAVE); }catch(e){}
      // La despensa guardada se va con la sesión. `cargarDespensa` ya
      // comprueba el dueño antes de usarla, así que esto no arregla un
      // fallo: es no dejar la lista de comidas de alguien en un teléfono
      // que puede no ser suyo.
      try{ localStorage.removeItem(DESPENSA_KEY); }catch(e){}
      try{ localStorage.removeItem(PLAN_KEY); }catch(e){}
      goto('registro', false);
    });
  });

  // AL ABRIR, LO PRIMERO ES MIRAR SI SE VIENE DEL CORREO.
  //
  //  Y gana a todo lo demás, incluida una sesión guardada. Quien pulsa el
  //  enlace desde el teléfono donde ya tenía la sesión abierta viene a
  //  cambiar su contraseña; mandarlo al Diario sería ignorarlo, y su enlace
  //  -que es de un solo uso- se habría gastado para nada.
  restaurarCuenta();

  var delCorreo = loQueTraeElEnlace();
  if(delCorreo){
    // EL COMPROBADOR DE VERSIÓN DEL INDEX NO PUEDE RECARGAR ENCIMA DE ESTO.
    //
    // Los dos corren en esta misma carga de la página y no se conocen, y cuál
    // va primero NO ESTÁ DECIDIDO: `app.js` sale de la caché del service
    // worker —instantáneo— y `version.txt` va siempre a la red. En un
    // servidor local gana el comprobador; en un teléfono con datos, este
    // arranque. O sea que el resultado dependía de la latencia, que es la
    // peor clase de fallo: funciona en las pruebas y falla en el teléfono.
    //
    // Si gana el comprobador, la almohadilla sigue en la dirección y la
    // recarga se la lleva con ella —eso se arregla en el index—. Si gana este
    // arranque, la almohadilla ya está limpia y llevársela no sirve de nada:
    // la recarga caería encima de la persona mientras teclea su contraseña
    // nueva, se la borraría, y la dejaría en la pantalla de entrar con el
    // enlace —de un solo uso— ya gastado.
    //
    // Por eso hacen falta las dos mitades. Esta es la de este lado.
    try{ window.enlaceDeCorreoEnMarcha = true; }catch(e){}
    limpiarElEnlace();
  }

  if(delCorreo && (delCorreo.error || delCorreo.error_description)){
    // El caso corriente: el enlace caducó o ya se usó. Sin esto no pasaba
    // NADA -la app arrancaba normal- y la persona se quedaba mirando la
    // pantalla de entrar sin saber por qué su enlace no hizo nada.
    goto('login', false);
    avisarLogin(traducirError(delCorreo.error_description || delCorreo.error));
  } else if(delCorreo && delCorreo.type === 'recovery' && delCorreo.access_token){
    claveToken = delCorreo.access_token;
    goto('clave', false);
  } else if(delCorreo && delCorreo.access_token &&
            TIPOS_DE_ENLACE.indexOf(String(delCorreo.type || '')) >= 0){
    entrarConElEnlace(delCorreo);
  } else if(sesion && sesion.access_token){
    goto('diario', false);
    // La cola PRIMERO y la carga después, encadenadas.
    //
    // El orden importa: si se pidieran a la vez, la carga podría llegar
    // antes de que suba lo pendiente y traer un diario sin ello, mientras la
    // cola sigue llena. Se vería dos veces lo mismo —una del servidor y otra
    // de la cola— o ninguna, según quién ganara.
    //
    // `vaciarCola` no rechaza nunca: sin señal se queda con lo suyo y sigue.
    //
    // La despensa guardada va PRIMERO y sin esperar a nadie: si hay señal,
    // lo del servidor llega un segundo después y la sustituye; si no la hay,
    // esto es todo lo que va a haber, y con ello se puede apuntar eligiendo
    // de tus alimentos en vez de teclearlos a mano.
    cargarDespensa();
    vaciarCola().then(function(){ cargarDatos(); });
    pintarPendientes();
  }

  // ================= FOTOS DE PROGRESO =================
  // 4 poses por semana. La imagen se comprime en el teléfono ANTES de subirse:
  // máximo 1080 px, calidad 80–85%, objetivo 200–500 KB. El original nunca se guarda.
  // Las claves (`k`) son las que están guardadas en la base y en las rutas
  // de Storage: no se tocan. Lo que cambia es cómo se llaman en pantalla.
  var POSES = [
    {k:'frente',  t:'Frente'},
    {k:'espalda', t:'Espalda'},
    {k:'izq',     t:'Lado izquierdo'},
    {k:'der',     t:'Lado derecho'}
  ];
  var MAX_LADO = 1080, CAL_MAX = 0.85, CAL_MIN = 0.80;
  var OBJ_MIN = 200*1024, OBJ_MAX = 500*1024;

  var FOTOS = {};              // clave "2026-W31" -> {frente:{src,bytes,w,h,tipo}, ...}
  var inicioPrograma = null;   // lunes de la semana en que se registró; lo pone cargarDatos()
  // Anclada al ARRANQUE de la semana de cada quien, no al día de hoy. Si
  // apunta a hoy, quien empieza en martes y sube las fotos el lunes -que
  // sigue siendo su semana- las archiva en la semana ISO SIGUIENTE, en un
  // cajón distinto al que mira el recordatorio. El recordatorio no se
  // apagaría nunca y esa semana quedaría partida en dos.
  //
  // Se vuelve a anclar al cargar el perfil, porque aquí `inicioSemana`
  // todavía es el lunes por defecto.
  var semanaFoto = inicioDeMiSemana();
  var poseEnCurso = null;

  function soportaWebp(){
    try{ return document.createElement('canvas').toDataURL('image/webp').indexOf('image/webp') === 0; }
    catch(e){ return false; }
  }
  var TIPO_SALIDA = soportaWebp() ? 'image/webp' : 'image/jpeg';

  // Lunes de la semana de una fecha + número de semana ISO
  function lunesDe(d){
    var x = new Date(d); x.setHours(0,0,0,0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function numSemana(d){
    var x = new Date(d); x.setHours(0,0,0,0);
    x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));
    var ene4 = new Date(x.getFullYear(), 0, 4);
    return 1 + Math.round(((x - ene4) / 86400000 - 3 + ((ene4.getDay() + 6) % 7)) / 7);
  }
  // La CLAVE de guardado sigue siendo la semana ISO del año ('2026-W31'):
  // es estable, no depende de quién la mire, y es el formato que valida la
  // base de datos. Lo que cambia es solo la ETIQUETA que se enseña.
  //
  // EL AÑO SALE DEL JUEVES, no del lunes. Es la definición del estándar, y
  // `numSemana` ya cuenta así —se va al jueves antes de nada—; el año se
  // cogía del lunes, y en la semana que cruza el 1 de enero esos dos no son
  // el mismo año. El lunes 29 de diciembre de 2025 salía como «2025-W01»
  // cuando es «2026-W01».
  //
  // Y «2025-W01» no es un hueco libre: es la semana del 30 de diciembre de
  // 2024. Dos semanas con la misma clave, con un año entre ellas. Como las
  // fotos llevan `unique (user_id, week_key, pose)` y antes de guardar una se
  // borra la que hubiera con esa clave y esa pose, subir la foto de frente el
  // 31 de diciembre BORRABA la de primeros del año anterior. Sin aviso.
  function claveSemana(d){
    var l = lunesDe(d);
    var j = new Date(l); j.setDate(j.getDate() + 3);
    return j.getFullYear() + '-W' + String(numSemana(l)).padStart(2,'0');
  }

  // Lunes de una semana ISO, a partir de su clave. La semana 1 es la que
  // contiene el 4 de enero, por definición del estándar.
  function lunesDeClave(k){
    var p = String(k).split('-W');
    var lunes1 = lunesDe(new Date(Number(p[0]), 0, 4));
    var d = new Date(lunes1);
    d.setDate(d.getDate() + (Number(p[1]) - 1) * 7);
    return d;
  }

  // Cuántas semanas lleva la persona: la de su registro es la 1.
  // Enseñar "Semana 31" a alguien que lleva tres semanas no significa nada;
  // ese 31 es el número de semana del año, no el suyo.
  function semanaDelPrograma(fecha){
    if(!inicioPrograma) return null;                 // sin perfil cargado aún
    var l = lunesDe(fecha);
    var n = Math.round((l - inicioPrograma) / 604800000) + 1;
    return n > 0 ? n : 1;
  }
  function rangoSemana(d){
    var l = lunesDe(d), f = new Date(l); f.setDate(f.getDate() + 6);
    return fmtFecha(l) + ' – ' + fmtFecha(f) + ' ' + f.getFullYear();
  }
  function kb(b){ return b < 1024*1024 ? Math.round(b/1024) + ' KB' : (b/1048576).toFixed(1) + ' MB'; }

  // --- Compresión ---
  function comprimir(file, listo){
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function(){
      URL.revokeObjectURL(url);
      var lado = MAX_LADO;

      function intento(){
        var w = img.width, h = img.height;
        if(w > lado || h > lado){
          if(w >= h){ h = Math.round(h * lado / w); w = lado; }
          else { w = Math.round(w * lado / h); h = lado; }
        }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        // Baja la calidad de 0.85 a 0.80; si sigue pesando, reduce el lado y repite
        var q = CAL_MAX;
        (function probar(){
          c.toBlob(function(blob){
            if(!blob){ listo(null); return; }
            if(blob.size > OBJ_MAX && q > CAL_MIN + 0.001){
              q = Math.max(CAL_MIN, q - 0.025);
              probar();
              return;
            }
            if(blob.size > OBJ_MAX && lado > 480){
              lado = Math.round(lado * 0.85);   // nunca subimos de calidad: encogemos
              intento();
              return;
            }
            var fr = new FileReader();
            // Si la lectura falla, se dice. Sin esto `listo` no se llamaba
            // NUNCA: el aviso se quedaba en «Comprimiendo…» hasta recargar
            // la app, sin un error en ninguna consola. El que llama ya sabe
            // tratar un null —enseña «No se pudo leer la imagen»—, así que
            // basta con avisarle por el camino que ya existe.
            fr.onerror = function(){ listo(null); };
            fr.onload = function(){
              // `blob` va aparte del base64: es lo que se sube al bucket.
              // El base64 solo sirve para pintarla al instante sin esperar.
              listo({src: fr.result, blob: blob, bytes: blob.size,
                     w: w, h: h, tipo: TIPO_SALIDA, calidad: q});
            };
            fr.readAsDataURL(blob);   // el original ya se descartó: solo vive la versión comprimida
          }, TIPO_SALIDA, q);
        })();
      }
      intento();
    };
    img.onerror = function(){ URL.revokeObjectURL(url); listo(null); };
    img.src = url;
  }

  // --- Fotos en Supabase Storage ---
  // El bucket es PRIVADO. No hay URL pública: para ver una foto hay que
  // pedir un enlace firmado que caduca, y Storage solo lo concede si las
  // políticas dejan. La ruta empieza por el id del dueño y es justo eso lo
  // que miran, así que nadie alcanza la carpeta de otro.
  var BUCKET = 'progress-photos';

  function sbSubirFoto(clave, pose, res){
    if(!sesion || !sesion.user) return Promise.resolve(null);
    var ext = res.tipo === 'image/webp' ? 'webp' : 'jpg';
    // Con marca de tiempo: si se reemplaza la foto de un hueco, la anterior
    // queda archivada CON su archivo intacto. Reutilizar la ruta la pisaría,
    // y además chocaría con el índice único de storage_path.
    var ruta = sesion.user.id + '/' + clave + '/' + pose + '-' + Date.now() + '.' + ext;

    return sbStorage('/storage/v1/object/' + BUCKET + '/' + ruta, {
      method: 'POST',
      headers: { 'Content-Type': res.tipo },
      body: res.blob
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error(t.slice(0,140)); });

      // Archiva la que hubiera en ese hueco: el índice único de
      // (user_id, week_key, pose) solo cuenta las no archivadas, así que hay
      // que apartarla antes de meter la nueva.
      return sbFetch('/rest/v1/progress_photos?user_id=eq.' + sesion.user.id +
                     '&week_key=eq.' + clave + '&pose=eq.' + pose, { method:'DELETE' });
    }).then(function(){
      // DE AQUÍ EN ADELANTE LA ANTERIOR YA NO ESTÁ.
      //
      // Si esto falla, ese hueco se queda vacío en el servidor: la vieja
      // apartada y la nueva sin ficha. Quien recoge el error tiene que
      // saberlo, porque si repone la de antes en pantalla -que es lo
      // razonable cuando no ha pasado nada- le está diciendo a la persona
      // que no perdió nada, y se entera al recargar.
      return sbFetch('/rest/v1/progress_photos', {
        method:'POST', headers:{ 'Prefer':'return=representation' },
        body: JSON.stringify({
          user_id: sesion.user.id, week_key: clave, pose: pose,
          storage_path: ruta, bytes: res.bytes, width: res.w, height: res.h
        })
      })['catch'](function(e){
        e.laAnteriorSeAparto = true;
        throw e;
      });
    });
  }

  // Quitar una foto tiene que llegar a la base. Antes se borraba solo del
  // mapa en memoria, así que volvía a aparecer en cuanto se recargaba la
  // app: era como no haberla borrado.
  //
  // El archivo del bucket NO se toca. En esta base un DELETE no borra: un
  // trigger lo archiva (0007) para que exista una papelera de la que
  // restaurar. Borrar el archivo dejaría la ficha apuntando a la nada y lo
  // restaurado sería un hueco roto. De los archivos ya se encarga
  // limpiar_fotos_viejas(), que sí borra de verdad pasados seis meses.
  function sbBorrarFoto(clave, pose){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/progress_photos?user_id=eq.' + sesion.user.id +
                   '&week_key=eq.' + clave + '&pose=eq.' + pose, { method:'DELETE' });
  }

  // Los enlaces firmados se piden en bloque, no uno por uno: son decenas de
  // fotos y una petición por cada una tardaría una eternidad.
  function sbFirmar(rutas){
    if(!rutas.length || !sesion) return Promise.resolve({});
    return sbStorage('/storage/v1/object/sign/' + BUCKET, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ expiresIn: 3600, paths: rutas })
    }).then(function(r){ return r.ok ? r.json() : []; })
      .then(function(arr){
        var m = {};
        (arr || []).forEach(function(x){
          if(x.signedURL) m[x.path] = SB_URL + '/storage/v1' + x.signedURL;
        });
        return m;
      })['catch'](function(){ return {}; });
  }

  // Carga las fichas y las convierte en lo que la pantalla ya sabe pintar.
  // `deQuien` permite al super admin mirar las de otra persona; si se omite,
  // son las propias. Quien no tenga permiso recibe una lista vacía de la
  // base, no un error: no hay nada que ocultar porque no llega nada.
  function sbCargarFotos(deQuien){
    if(!sesion || !sesion.user) return Promise.resolve({});
    var quien = deQuien || sesion.user.id;
    return sbFetch('/rest/v1/progress_photos' +
        '?select=week_key,pose,storage_path,bytes,width,height' +
        '&user_id=eq.' + quien +
        '&week_key=gte.' + claveLimiteFotos() +   // solo seis meses
        '&order=week_key.desc')
      .then(function(fs){
        fs = fs || [];
        return sbFirmar(fs.map(function(f){ return f.storage_path; })).then(function(urls){
          var out = {};
          fs.forEach(function(f){
            if(!urls[f.storage_path]) return;
            (out[f.week_key] = out[f.week_key] || {})[f.pose] = {
              src: urls[f.storage_path], bytes: Number(f.bytes) || 0,
              w: f.width || 0, h: f.height || 0, tipo: 'image/webp'
            };
          });
          return out;
        });
      });
  }

  // Las fotos se guardan seis meses. Pasado eso dejan de mostrarse, y la
  // función limpiar_fotos_viejas() de la migración 0011 las quita de la base.
  // Se compara por clave de semana ('2026-W31'), que ordena bien también
  // entre años: '2025-W52' < '2026-W01'.
  function claveLimiteFotos(){
    var MESES_FOTOS = 6;      // dentro: como constante suelta valdría
    var d = new Date(HOY);    // undefined al arrancar, por el hoisting de var
    d.setMonth(d.getMonth() - MESES_FOTOS);
    return claveSemana(d);
  }

  // --- Pantalla de fotos ---
  function pintarFotos(){
    var clave = claveSemana(semanaFoto);
    var set = FOTOS[clave] || {};
    // Se pregunta contra la semana de HOY, no contra `semanaFoto`: mirar las
    // fotos de hace un mes no puede apagar el recordatorio de esta semana.
    if(typeof revisarRecordatorios === 'function') revisarRecordatorios();
    document.getElementById('fotoSemLabel').textContent =
      'Semana ' + (semanaDelPrograma(semanaFoto) || numSemana(lunesDe(semanaFoto)));
    document.getElementById('fotoSemRango').textContent = rangoSemana(semanaFoto);
    document.getElementById('fotoCuenta').textContent = POSES.filter(function(p){ return set[p.k]; }).length + ' / 4';

    document.getElementById('fotoGrid').innerHTML = POSES.map(function(p){
      var f = set[p.k];
      return '<div class="foto-slot'+(f?' llena':'')+'" data-pose="'+p.k+'">'+
        '<div class="foto-lienzo">'+
          (f ? '<img src="'+escapar(f.src)+'" alt="'+escapar(p.t)+'">'
             : '<div class="foto-vacia"><b>＋</b></div>')+
          // Dentro del recuadro, no debajo: es lo que dice qué foto va en
          // ese hueco, y ahí es donde se mira antes de subirla.
          '<span class="foto-rotulo">'+p.t+'</span>'+
        '</div>'+
        // Aquí había un pie con el nombre de la pose y el tamaño del
        // archivo. Nunca se vio: la rejilla reparte el alto disponible, el
        // lienzo se lo lleva entero y el pie caía 25 px por debajo del
        // recuadro, recortado. Por eso no había etiquetas en ningún hueco.
        //
        // No se le hace sitio: Fotos cabe en una pantalla y eso costó
        // trabajo. El nombre ya va dentro, y el peso del archivo es un
        // detalle que la tarjeta de abajo ya explica.
        (f ? '<button class="foto-quitar" data-quitar-foto="'+p.k+'" aria-label="Quitar">✕</button>' : '')+
      '</div>';
    }).join('');
  }

  document.getElementById('fotoGrid').addEventListener('click', function(e){
    var quitar = e.target.closest('[data-quitar-foto]');
    if(quitar){
      var c = claveSemana(semanaFoto);
      var pose = quitar.dataset.quitarFoto;
      var borrada = (FOTOS[c] || {})[pose];
      if(!borrada) return;

      // Se quita ya de la pantalla y el borrado va detrás, como en el resto
      // de la app. Si falla, la foto vuelve: decir "eliminada" sobre algo
      // que sigue guardado es justo el fallo que había aquí.
      delete FOTOS[c][pose];
      pintarFotos(); llenarSelectores();
      toast('toastFotos', 'Foto eliminada');

      sbBorrarFoto(c, pose)['catch'](function(err){
        FOTOS[c] = FOTOS[c] || {};
        FOTOS[c][pose] = borrada;
        pintarFotos(); llenarSelectores();
        toast('toastFotos', 'No se pudo borrar: ' + traducirError(err.message));
      });
      return;
    }
    var slot = e.target.closest('.foto-slot');
    if(!slot) return;
    poseEnCurso = slot.dataset.pose;
    document.getElementById('fotoInput').click();
  });

  document.getElementById('fotoInput').addEventListener('change', function(){
    var file = this.files && this.files[0];
    this.value = '';
    if(!file || !poseEnCurso) return;
    var pesoOriginal = file.size;
    toast('toastFotos', 'Comprimiendo…');
    var pose = poseEnCurso;
    comprimir(file, function(res){
      if(!res){ toast('toastFotos', 'No se pudo leer la imagen'); return; }
      var c = claveSemana(semanaFoto);
      var antes = (FOTOS[c] || {})[pose];

      // Se pinta ya, con el base64, para no tener a nadie esperando a que
      // suba. La subida va detrás.
      if(!FOTOS[c]) FOTOS[c] = {};
      FOTOS[c][pose] = res;
      pintarFotos(); llenarSelectores();
      toast('toastFotos', kb(pesoOriginal) + ' → ' + kb(res.bytes) + ' · guardando…');

      sbSubirFoto(c, pose, res).then(function(){
        toast('toastFotos', kb(pesoOriginal) + ' → ' + kb(res.bytes) + ' · ' + res.w + '×' + res.h);
      })['catch'](function(e){
        // Si no subió, se quita: una foto que solo existe en este teléfono
        // y desaparece al recargar es peor que no haberla puesto.
        //
        // Y la de antes se repone SOLO si de verdad sigue guardada. Cuando
        // falla el último paso, la anterior ya está apartada en el servidor:
        // reponerla aquí sería enseñar una foto que ya no existe y dar por
        // hecho que no se perdió nada.
        if(antes && !(e && e.laAnteriorSeAparto)) FOTOS[c][pose] = antes;
        else delete FOTOS[c][pose];
        pintarFotos(); llenarSelectores();
        toast('toastFotos', (e && e.laAnteriorSeAparto)
          ? 'No se pudo guardar, y la anterior quedó apartada. Ese hueco está vacío: vuelve a poner una.'
          : 'No se pudo subir: ' + traducirError(e.message));
      });
    });
  });

  document.getElementById('fotoPrev').addEventListener('click', function(){
    semanaFoto.setDate(semanaFoto.getDate() - 7); pintarFotos();
  });
  document.getElementById('fotoNext').addEventListener('click', function(){
    semanaFoto.setDate(semanaFoto.getDate() + 7); pintarFotos();
  });
  document.getElementById('irComparar').addEventListener('click', function(){
    llenarSelectores(); goto('comparar', true); pintarComparacion();
  });

  // =====================================================================
  //  LA COMPARACIÓN MENSUAL DE FOTOS
  //
  //  Hasta aquí las fotos NUNCA salían: el bucket es privado y la app las
  //  mira con URLs firmadas. Esto las manda a Anthropic una vez al mes, y
  //  eso es una cosa distinta de mandar números. Por eso hay un permiso, y
  //  por eso `null` no vale como sí.
  //
  //  Nada de lo de aquí decide QUÉ fotos se analizan. La app solo dice
  //  "compara las mías"; las rutas las saca el servidor de la base
  //  filtrando por la sesión. Si el cliente mandara rutas, un token robado
  //  serviría para pedir el análisis de las fotos de otra persona.
  // =====================================================================
  // INTERRUPTOR: se enciende cuando la función `asistente` con la acción
  // 'fotos' esté desplegada, y no antes.
  //
  // No es un adorno. Si esto estuviera encendido con la función vieja
  // arriba, decir que sí al permiso llamaría a una acción que el servidor
  // no conoce: le gastaría una consulta de IA por cada apertura de la app y
  // no daría nada a cambio. Pedir un permiso para algo que todavía no
  // funciona es peor que no pedirlo.
  //
  // Apagado, no se pide el permiso ni se llama a nada. Lo ya guardado sí se
  // enseña, que no depende del servidor.
  //
  // ENCENDIDO el 13 de agosto de 2026: la función quedó desplegada con la
  // acción 'fotos', comprobado con el hash del código sin comentarios contra
  // el fuente local.
  var FOTOS_IA_LISTO = true;

  var PERMISO_FOTOS = null;    // true / false / null = no se le ha preguntado
  var ANALISIS = null;         // el último guardado, para pintarlo
  var ANALISIS_INTENTADO = false;   // solo un intento por apertura de la app

  function pintarAnalisis(){
    var caja = document.getElementById('analisisCard');
    if(!caja) return;
    if(!ANALISIS || !ANALISIS.mensaje){ caja.hidden = true; return; }
    caja.hidden = false;
    document.getElementById('analisisTxt').textContent = ANALISIS.mensaje;
    document.getElementById('analisisCuando').textContent = ANALISIS.mes || '';
    document.getElementById('analisisPie').textContent =
      ANALISIS.semana_vieja && ANALISIS.semana_nueva
        ? 'Comparando ' + ANALISIS.semana_vieja + ' con ' + ANALISIS.semana_nueva + '.'
        : '';
  }

  // Lo último guardado, que es lo que se enseña. No cuesta una llamada a la
  // IA: es una fila de la base.
  function cargarAnalisis(){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/analisis_fotos?select=mes,mensaje,semana_nueva,semana_vieja' +
        '&user_id=eq.' + sesion.user.id + '&order=mes.desc&limit=1')
      .then(function(filas){
        ANALISIS = (filas && filas[0]) || null;
        pintarAnalisis();
      })['catch'](function(){});
    // CALLA A PROPÓSITO: si no se puede leer, la tarjeta se queda oculta,
    // que es lo mismo que se ve cuando todavía no hay ninguna comparación.
    // No hay nada que la persona pueda hacer al respecto y nadie lo pidió.
  }

  // ---- El permiso ----
  var permisoSheet = document.getElementById('permisoFotos');

  // Se pregunta la PRIMERA VEZ que sube una serie completa, no al
  // registrarse: en el registro no significa nada todavía, y un sí dado sin
  // entender qué se acepta no es un sí.
  //
  // Ni botón de cerrar ni cerrar tocando fuera: no contestar no puede
  // quedarse como un sí a medias.
  function pedirPermisoFotos(){
    if(!permisoSheet) return;
    permisoSheet.classList.add('open');
  }

  function guardarPermisoFotos(si){
    PERMISO_FOTOS = si;
    permisoSheet.classList.remove('open');
    pintarPermisoPerfil();
    sbActualizarPerfil({ fotos_ia_ok: si, fotos_ia_fecha: new Date().toISOString() })
      ['catch'](function(){
        // Si no se pudo guardar, se vuelve a preguntar la próxima vez. Dar
        // por bueno un sí que no llegó a la base sería mandar fotos con un
        // permiso que no consta en ninguna parte.
        PERMISO_FOTOS = null;
        toast('toastFotos', 'No se pudo guardar tu respuesta. Te lo pregunto otra vez.');
      });
    if(si) revisarAnalisisDeFotos();
  }

  (function(){
    var si = document.getElementById('permisoFotosSi');
    var no = document.getElementById('permisoFotosNo');
    if(si) si.addEventListener('click', function(){ guardarPermisoFotos(true); });
    if(no) no.addEventListener('click', function(){ guardarPermisoFotos(false); });
  })();

  // Poder cambiar de opinión no es un adorno: se prometió en la pantalla del
  // permiso, y un sí que no se puede retirar no es un permiso, es una
  // trampa. La fila sale solo si ya se le preguntó alguna vez.
  function pintarPermisoPerfil(){
    var fila = document.getElementById('profFotosIaBtn');
    var val  = document.getElementById('profFotosIa');
    if(!fila || !val) return;
    fila.hidden = (PERMISO_FOTOS === null);
    val.innerHTML = (PERMISO_FOTOS === true ? 'Sí' : 'No') + '<i>›</i>';
  }

  (function(){
    var fila = document.getElementById('profFotosIaBtn');
    if(!fila) return;
    fila.addEventListener('click', function(){
      // Quitarlo es inmediato y no pregunta: poner trabas para retirar un
      // permiso es la forma educada de no dejar retirarlo. Volver a darlo sí
      // vuelve a enseñar la pantalla con lo que se acepta.
      if(PERMISO_FOTOS === true){
        guardarPermisoFotos(false);
        toast('toastPeso', 'Tus fotos ya no se analizan.');
      }else{
        pedirPermisoFotos();
      }
    });
  })();

  // ---- Cuándo se pide el análisis ----
  //
  // Una vez al mes y por su cuenta, sin que nadie pulse nada: es lo que se
  // pidió. El freno de verdad está en el servidor -uno por mes y persona,
  // y solo con dos series completas separadas por tres semanas-, así que
  // aquí basta con no llamar cuando es evidente que no toca.
  var CLAVE_ANALISIS = 'macros.analisisPedido';

  function mesDeHoy(){ return isoDe(HOY).slice(0, 7); }

  function revisarAnalisisDeFotos(){
    if(!FOTOS_IA_LISTO) return;      // la función todavía no lo sabe hacer
    if(!sesion || !sesion.user) return;
    if(MI_NIVEL_IA !== 'plus') return;

    // Sin permiso no se manda nada. Y si todavía no se le ha preguntado, se
    // le pregunta —pero solo cuando ya tiene dos series completas, que es
    // cuando la pregunta significa algo.
    var series = semanasConFotos().filter(function(k){
      return Object.keys(FOTOS[k] || {}).length >= 4;
    });
    if(series.length < 2) return;
    if(PERMISO_FOTOS === null){ pedirPermisoFotos(); return; }
    if(PERMISO_FOTOS !== true) return;

    // Una vez al mes. Pero la marca del mes se pone cuando el servidor
    // CONTESTA, no antes.
    //
    // Ponerla antes parecía lo prudente y era el error: si la llamada no
    // llega -sin red, la función caída, o desplegada más tarde que la app-
    // el mes queda marcado como hecho y esa persona se queda sin su
    // comparación hasta el mes siguiente, sin enterarse de nada.
    //
    // Para no repetirlo en bucle basta con una marca de sesión, que muere al
    // cerrar la app: se intenta una vez por apertura y ya.
    var mes = mesDeHoy();
    try{
      if(localStorage.getItem(CLAVE_ANALISIS) === mes) return;
    }catch(e){}
    if(ANALISIS_INTENTADO) return;
    ANALISIS_INTENTADO = true;

    iaLlamar({
      accion: 'fotos',
      // Los números para el segundo paso. Las fotos NO van por aquí: las
      // baja el servidor del bucket con su propia clave.
      pesos: Object.keys(PESOS).sort().slice(-8).map(function(k){
        return { fecha: k, kg: Number(PESOS[k]) };
      }),
      // Con la misma forma que usa el cierre de semana. Mandarlas como
      // están en memoria -{fecha, cm}- llegaría al servidor con los nombres
      // cambiados y saldría "undefined: undefined cm" en el mensaje.
      cinturas: CINTURAS.slice(-6).map(function(m){
        return { log_date: m.fecha, cintura_cm: m.cm };
      })
    }).then(function(r){
      // Contestó. Sea lo que sea -hecho, faltan series, demasiado pronto-,
      // el mes ya está mirado y no hay que volver a preguntarlo.
      try{ localStorage.setItem(CLAVE_ANALISIS, mes); }catch(e){}
      if(r && r.estado === 'ok'){
        ANALISIS = r;
        pintarAnalisis();
      }
    })['catch'](function(){
      // NO se marca el mes: no llegó a contestar, así que se vuelve a
      // intentar la próxima vez que abra la app.
      //
      // Y en silencio: nadie pidió esto, así que un fallo no puede
      // interrumpir a quien entró a apuntar la comida.
    });
  }

  // --- Comparador ---
  var cmpPose = 'frente', cmpModo = 'lado';

  function semanasConFotos(){
    return Object.keys(FOTOS).filter(function(k){ return Object.keys(FOTOS[k]).length; }).sort();
  }
  function etiquetaClave(k){
    var lunes = lunesDeClave(k);
    var n = semanaDelPrograma(lunes);
    // Con la fecha al lado se distinguen dos semanas con el mismo número
    // si algún día se comparan periodos de años distintos.
    return n ? ('Semana ' + n + ' · ' + fmtFecha(lunes))
             : ('Semana ' + Number(k.split('-W')[1]) + ' · ' + k.split('-W')[0]);
  }
  function llenarSelectores(){
    var ks = semanasConFotos();
    ['cmpA','cmpB'].forEach(function(id, i){
      var sel = document.getElementById(id), previo = sel.value;
      sel.innerHTML = ks.map(function(k){ return '<option value="'+k+'">'+etiquetaClave(k)+'</option>'; }).join('');
      if(ks.indexOf(previo) >= 0) sel.value = previo;
      else if(ks.length) sel.value = i === 0 ? ks[0] : ks[ks.length-1];
    });
  }

  function pintarComparacion(){
    var area = document.getElementById('cmpArea');
    var a = document.getElementById('cmpA').value, b = document.getElementById('cmpB').value;
    var fa = (FOTOS[a]||{})[cmpPose], fb = (FOTOS[b]||{})[cmpPose];

    // Hacen falta DOS semanas distintas.
    //
    // Antes solo se miraba que hubiera valor en los dos selectores. Con una
    // sola semana de fotos, los dos caían en ella -`ks[0]` y
    // `ks[ks.length-1]` son la misma- y salía la MISMA foto rotulada
    // "Antes" y "Después". Y el aviso pedía "al menos una semana", que es
    // justo el caso en el que no se puede comparar nada.
    if(!a || !b){
      area.innerHTML = '<p class="cmp-aviso">Sube fotos de al menos <b>dos</b> semanas para poder comparar.</p>';
      return;
    }
    if(a === b){
      area.innerHTML = '<p class="cmp-aviso">Esas son la misma semana. Elige dos distintas ' +
        'para ver el cambio.</p>';
      return;
    }
    if(!fa || !fb){
      area.innerHTML = '<p class="cmp-aviso">Falta la foto de <b>'+
        POSES.filter(function(p){return p.k===cmpPose;})[0].t.toLowerCase()+
        '</b> en alguna de las dos semanas.</p>';
      return;
    }

    if(cmpModo === 'lado'){
      area.innerHTML = '<div class="cmp-lado">'+
        '<div class="cmp-foto" data-ver="'+a+'"><div class="foto-lienzo"><img src="'+fa.src+'" alt="Antes"></div><b>'+etiquetaClave(a)+'</b></div>'+
        '<div class="cmp-foto" data-ver="'+b+'"><div class="foto-lienzo"><img src="'+fb.src+'" alt="Después"></div><b>'+etiquetaClave(b)+'</b></div>'+
      '</div><p class="cmp-aviso">Toca una foto para verla en grande con zoom.</p>';
      return;
    }

    area.innerHTML =
      '<div class="cmp-slider" id="cmpSlider">'+
        '<img src="'+fb.src+'" alt="Después">'+
        '<div class="capa" id="cmpCapa" style="width:50%"><img src="'+fa.src+'" alt="Antes" style="width:'+
          (document.getElementById('cmpArea').clientWidth - 32)+'px"></div>'+
        '<div class="cmp-etq" style="left:10px;">'+etiquetaClave(a)+'</div>'+
        '<div class="cmp-etq" style="right:10px;">'+etiquetaClave(b)+'</div>'+
        '<div class="cmp-linea" id="cmpLinea" style="left:50%"></div>'+
        '<div class="cmp-tirador" id="cmpTirador" style="left:50%">⇔</div>'+
      '</div><p class="cmp-aviso">Arrastra para revelar el antes y el después.</p>';
    activarSlider();
  }

  function activarSlider(){
    var cont = document.getElementById('cmpSlider');
    if(!cont) return;
    var capa = document.getElementById('cmpCapa');
    var linea = document.getElementById('cmpLinea');
    var tirador = document.getElementById('cmpTirador');
    var imgAntes = capa.querySelector('img');

    function ajustaAncho(){ imgAntes.style.width = cont.clientWidth + 'px'; }
    ajustaAncho();
    window.addEventListener('resize', ajustaAncho);

    function mover(clientX){
      var r = cont.getBoundingClientRect();
      var pct = Math.max(0, Math.min(100, (clientX - r.left) / r.width * 100));
      capa.style.width = pct + '%';
      linea.style.left = pct + '%';
      tirador.style.left = pct + '%';
    }
    var arrastrando = false;
    cont.addEventListener('pointerdown', function(e){ arrastrando = true; cont.setPointerCapture(e.pointerId); mover(e.clientX); });
    cont.addEventListener('pointermove', function(e){ if(arrastrando) mover(e.clientX); });
    cont.addEventListener('pointerup',   function(){ arrastrando = false; });
    cont.addEventListener('pointercancel', function(){ arrastrando = false; });
  }

  document.getElementById('cmpA').addEventListener('change', pintarComparacion);
  document.getElementById('cmpB').addEventListener('change', pintarComparacion);
  document.getElementById('cmpPose').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    Array.from(this.querySelectorAll('button')).forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active'); cmpPose = b.dataset.pose; pintarComparacion();
  });
  document.getElementById('cmpModo').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    Array.from(this.querySelectorAll('button')).forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active'); cmpModo = b.dataset.modo; pintarComparacion();
  });
  document.getElementById('cmpArea').addEventListener('click', function(e){
    var f = e.target.closest('[data-ver]');
    if(f) abrirVisor(f.dataset.ver, cmpPose);
  });

  // --- Visor con zoom ---
  var visor = document.getElementById('visor'), visorImg = document.getElementById('visorImg');
  var zoom = 1, panX = 0, panY = 0;

  function aplicarZoom(){
    visorImg.style.transform = 'translate('+panX+'px,'+panY+'px) scale('+zoom+')';
    document.getElementById('zoomNivel').textContent = Math.round(zoom*100) + '%';
  }
  function abrirVisor(clave, pose){
    var f = (FOTOS[clave]||{})[pose];
    if(!f) return;
    visorImg.src = f.src;
    document.getElementById('visorTitulo').textContent =
      etiquetaClave(clave) + ' · ' + POSES.filter(function(p){return p.k===pose;})[0].t;
    zoom = 1; panX = 0; panY = 0; aplicarZoom();
    visor.hidden = false;
  }
  document.getElementById('visorCerrar').addEventListener('click', function(){ visor.hidden = true; });
  document.getElementById('zoomMas').addEventListener('click', function(){ zoom = Math.min(5, zoom*1.35); aplicarZoom(); });
  document.getElementById('zoomMenos').addEventListener('click', function(){ zoom = Math.max(1, zoom/1.35); if(zoom===1){panX=0;panY=0;} aplicarZoom(); });
  document.getElementById('zoomReset').addEventListener('click', function(){ zoom=1; panX=0; panY=0; aplicarZoom(); });
  visorImg.addEventListener('dblclick', function(){ zoom = zoom > 1 ? 1 : 2.5; panX=0; panY=0; aplicarZoom(); });

  (function panEnVisor(){
    var activo = false, x0 = 0, y0 = 0;
    visorImg.addEventListener('pointerdown', function(e){
      if(zoom <= 1) return;
      activo = true; x0 = e.clientX - panX; y0 = e.clientY - panY;
      visorImg.setPointerCapture(e.pointerId);
    });
    visorImg.addEventListener('pointermove', function(e){
      if(!activo) return;
      panX = e.clientX - x0; panY = e.clientY - y0; aplicarZoom();
    });
    visorImg.addEventListener('pointerup', function(){ activo = false; });
  })();

  // Aquí se sembraban dos semanas de fotos falsas (siluetas dibujadas) para
  // poder probar la comparación. Fuera: quien se registra no debe encontrarse
  // el cuerpo de nadie en su galería.
  //
  // Debajo decía que las fotos no se subían y vivían solo en memoria. Ya no:
  // van al bucket privado 'progress-photos' y su ficha a progress_photos.
  // Un comentario que se quedó viejo miente igual que un número inventado, y
  // este decía que se perdía algo que sí se guarda.
  pintarFotos();
  llenarSelectores();

  // ================= ROLES =================
  // El rol lo pone el perfil que llega de la base (`ROL = p.role`), no se
  // elige aquí; esto es solo el valor con el que se arranca mientras llega.
  // La seguridad de verdad vive en Postgres (supabase/migrations/0002_roles_y_rls.sql):
  // las políticas RLS filtran las filas antes de que salgan de la base de datos.
  var ROL = 'cliente';
  var NOMBRE_ROL = {cliente:'Cliente', coach:'Coach', org_admin:'Admin org', super_admin:'Super admin'};

  // Los llena cargarPanelCoach() desde la vista mis_clientes
  var CLIENTES_DEL_COACH = [];

  // Aguanta un nombre que no está.
  //
  // La lista de "a quién inscribo" se pinta con iniciales(u.nombre) y en la
  // línea de al lado ya se contemplaba que viniera vacío. Y viene:
  // plan_buscar devuelve full_name sin coalesce y encuentra a la gente
  // TAMBIÉN por su correo, así que alguien que no puso su nombre sale en la
  // búsqueda. Con `nombre.split` eso era un TypeError dentro del .map, y no
  // se pintaba nada: la búsqueda entera en blanco por una sola persona.
  // Unas iniciales son letras. Que devuelva letras.
  //
  // Dos caracteres parecen inofensivos, y por eso los cuatro sitios que
  // pintan esta bolita se olvidaban de escaparla —incluso los que escapan el
  // nombre de al lado, con su comentario y todo—. Pero coge la primera letra
  // de cada palabra: de «<b Juan» saca «<J», y ese `<` abre una etiqueta
  // igual que cualquier otro.
  //
  // Se limpia AQUÍ y no en cada sitio que la llama: son cuatro, y el próximo
  // que la use no se va a acordar. Y se limpia en vez de escapar para que lo
  // que devuelve se pueda seguir usando tal cual, sin que nadie tenga que
  // saber si ya viene escapado o no.
  function iniciales(nombre){
    return String(nombre == null ? '' : nombre)
      .split(' ')
      .filter(function(p){ return p; })      // los espacios de más no cuentan
      .map(function(p){ return p[0]; })
      .slice(0, 2).join('').toUpperCase()
      // Solo lo que significa algo en HTML. Dejar pasar acentos y eñes: un
      // filtro a lo bruto de A-Z borraría media agenda.
      .replace(/[<>&"']/g, '');
  }
  function tarjetaCliente(c){
    // El nombre va escapado como en todas las demás listas: lo escribe otra
    // persona y esta tarjeta la mira su entrenador.
    return '<div class="cliente-card"><div class="cliente-ava">'+iniciales(c.n)+'</div>'+
      '<div class="info"><b>'+escapar(c.n)+'</b><span>'+escapar(c.obj)+' · '+escapar(c.sem)+' en el plan</span></div>'+
      '<span style="font:600 11px/1 sans-serif;color:var(--ink-faint);">'+escapar(c.act)+'</span></div>';
  }

  function pintarPanel(){
    var cont = document.getElementById('panelContenido');
    var tit = document.getElementById('panelTitulo');

    if(ROL === 'coach'){
      tit.textContent = 'Mis clientes';
      cont.innerHTML =
        '<div class="panel-seccion">Clientes asignados <small>'+CLIENTES_DEL_COACH.length+'</small></div>' +
        CLIENTES_DEL_COACH.map(tarjetaCliente).join('') +
        '<p class="cmp-aviso">Solo aparecen los clientes que el super admin te asignó. ' +
        'Puedes ver su progreso y armarles la rutina; su diario de comida y su peso son de solo lectura.</p>';
      return;
    }
    // Aquí había una rama para el super admin con «Clientes 109 en total»
    // escrito a pelo y una lista de entrenadores que no llenaba nadie. Era
    // del mockup, y además no se veía nunca: el botón del Perfil manda al
    // super admin a la vista `admin`, que es el panel de verdad y saca sus
    // números de admin_estadisticas(). Un número inventado en pantalla es
    // peor que no tener pantalla.
    tit.textContent = 'Panel';
    cont.innerHTML = '<p class="cmp-aviso">Tu cuenta es de cliente: solo tú ves tu información.</p>';
  }

  function aplicarRol(){
    var badge = document.getElementById('rolBadge');
    badge.className = 'rol-badge ' + ROL;
    badge.textContent = NOMBRE_ROL[ROL];

    var tarjeta = document.getElementById('tarjetaPanel');
    tarjeta.hidden = (ROL === 'cliente');
    if(ROL === 'coach'){
      document.getElementById('panelTarjetaTit').textContent = 'Mis clientes';
      document.getElementById('panelTarjetaSub').textContent = CLIENTES_DEL_COACH.length + ' asignados';
    } else if(ROL === 'super_admin'){
      document.getElementById('panelTarjetaTit').textContent = 'Administración';
      document.getElementById('panelTarjetaSub').textContent = 'toda la plataforma';
    }
    pintarPanel();
  }

  document.getElementById('abrirPanel').addEventListener('click', function(){
    goto(ROL === 'super_admin' ? 'admin' : 'panel', true);
  });
  aplicarRol();

  // ================= PANEL DE SUPER ADMIN =================
  // Separado del panel de coach a propósito: son públicos distintos.
  // Los números vendrían del RPC admin_estadisticas(), que falla si
  // quien llama no es super admin.
  // Todo en cero: lo rellena admin_estadisticas() al abrir el panel. Antes
  // traía cifras inventadas (486 clientes, 2 GB de fotos) que se veían un
  // instante antes de llegar las de verdad, y se quedaban ahí si la consulta
  // fallaba. Un tablero que miente es peor que uno vacío.
  var STATS = {
    entrenadores: 0, entrenadores_activos: 0,
    clientes: 0, usuarios: 0, cuentas_desactivadas: 0,
    clientes_activos: 0, altas_7_dias: 0, altas_30_dias: 0, sin_coach: 0,
    fotos_total: 0, storage_bytes: 0, storage_objetos: 0,
    comidas_registradas: 0, sesiones_entreno: 0, dias_inactividad: 14
  };
  // Vacíos: los trae cargarPanelAdmin() de la tabla feature_flags y de
  // admin_buscar_usuarios(). Las listas inventadas (Diana Salas, Ana Rivas…)
  // se veían mezcladas con las cuentas reales.
  var FLAGS = [];
  var USUARIOS = [];
  var USO_IA = null;          // { consultas, personas, tope_por_persona }

  // Lo que cuesta de media una consulta con el modelo de hoy. Vive aquí y
  // no en la base porque el precio depende del modelo y cambia: guardarlo
  // en PostgreSQL sería mentira en cuanto se toque la Edge Function.
  // Es una MEDIA de los tres tipos de llamada, no un precio exacto.
  var COSTE_MEDIO_CONSULTA = 0.035;   // dólares

  function pintarUsoIA(){
    if(!USO_IA) return '';
    var n = Number(USO_IA.consultas) || 0;
    var gasto = (n * COSTE_MEDIO_CONSULTA).toFixed(2);
    var techo = (Number(USO_IA.personas) || 0) * (Number(USO_IA.tope_por_persona) || 0);
    return '<div class="uso-ia' + (n === 0 ? ' tranquilo' : '') + '">' +
      '<b>' + n + '</b> ' + (n === 1 ? 'consulta hoy' : 'consultas hoy') +
      ' · <span>~$' + gasto + '</span>' +
      (techo ? '<small>Con ' + USO_IA.personas + ' ' +
        (USO_IA.personas === 1 ? 'persona activa' : 'personas activas') +
        ' el máximo de hoy son ' + techo + ' consultas (~$' +
        (techo * COSTE_MEDIO_CONSULTA).toFixed(2) + ')</small>' : '') +
    '</div>';
  }
  var admVista = 'tablero', admFiltro = '';

  function gb(b){ return (b/1073741824).toFixed(2) + ' GB'; }
  function mil0(n){ return n.toLocaleString('es-MX'); }

  function pintarTablero(){
    var inactivos = Math.max(0, STATS.clientes - STATS.clientes_activos);
    // Sin clientes, la división da NaN y el tablero mostraría "NaN%".
    var pct = STATS.clientes > 0
      ? Math.round(STATS.clientes_activos / STATS.clientes * 100) : 0;
    var kbFoto = STATS.storage_objetos > 0
      ? Math.round(STATS.storage_bytes / STATS.storage_objetos / 1024) : 0;
    return pintarUsoIA() + '<div class="kpi-grid">'+
      '<div class="kpi"><b>'+mil0(STATS.entrenadores)+'</b><span>Entrenadores</span>'+
        '<div class="sub">'+STATS.entrenadores_activos+' activos</div></div>'+
      '<div class="kpi"><b>'+mil0(STATS.clientes)+'</b><span>Clientes</span>'+
        '<div class="sub">'+STATS.sin_coach+' sin coach</div></div>'+
      '<div class="kpi bien"><b>'+mil0(STATS.clientes_activos)+'</b><span>Clientes activos</span>'+
        '<div class="sub">'+pct+'% · últimos '+STATS.dias_inactividad+' días</div></div>'+
      '<div class="kpi alerta"><b>'+mil0(inactivos)+'</b><span>Clientes inactivos</span>'+
        '<div class="sub">sin registrar nada</div></div>'+
      '<div class="kpi ancho"><b>'+mil0(STATS.usuarios)+'</b><span>Usuarios registrados</span>'+
        '<div class="sub">+'+STATS.altas_7_dias+' esta semana · +'+STATS.altas_30_dias+' este mes · '+
        STATS.cuentas_desactivadas+' desactivadas</div></div>'+
      '<div class="kpi ancho"><b>'+gb(STATS.storage_bytes)+'</b><span>Almacenamiento de fotos</span>'+
        '<div class="sub">'+mil0(STATS.storage_objetos)+' archivos · '+
        kbFoto+' KB de promedio</div></div>'+
      '<div class="kpi"><b>'+mil0(STATS.comidas_registradas)+'</b><span>Comidas registradas</span></div>'+
      '<div class="kpi"><b>'+mil0(STATS.sesiones_entreno)+'</b><span>Sesiones de entreno</span></div>'+
    '</div>'+
    '<p class="cmp-aviso">Todo sale de una sola llamada a <b>admin_estadisticas()</b>, que revisa tu rol antes de responder.</p>';
  }

  function pintarUsuarios(){
    var lista = USUARIOS.filter(function(u){
      var t = admFiltro.toLowerCase();
      return !t || u.n.toLowerCase().indexOf(t) >= 0 || u.c.toLowerCase().indexOf(t) >= 0;
    });
    return '<div class="adm-busca">'+
      '<div class="searchbox"><span>🔍</span><input id="admBuscar" placeholder="Buscar por nombre o correo…" value="'+escapar(admFiltro)+'"></div>'+
      '<button class="btn-primary" id="admInvitar" style="width:100%;margin-top:10px;">+ Agregar a alguien por correo</button>'+
      '<button class="btn-rename" id="admCrear" style="width:100%;margin-top:7px;">Crear entrenador con contraseña</button>'+
    '</div>'+
    '<div class="panel-seccion">Usuarios <small>'+lista.length+' de '+USUARIOS.length+'</small></div>'+
    (lista.length ? lista.map(function(u, i){
      return '<div class="usr-row'+(u.on?'':' apagado')+'" data-usr="'+USUARIOS.indexOf(u)+'">'+
        '<div class="cliente-ava">'+iniciales(u.n)+'</div>'+
        // NOMBRE_ROL y no un if de dos ramas: ahora hay cuatro roles, y con
        // el if tu propia cuenta de super admin salía etiquetada "Cliente".
        '<div class="txt"><b>'+escapar(u.n)+' <span class="rol-badge '+escapar(u.r)+'" style="margin:0;">'+
          escapar(NOMBRE_ROL[u.r] || u.r)+'</span></b>'+
          '<span>'+escapar(u.c)+' · '+escapar(u.extra)+
            (u.estado !== 'activo' ? ' · <b class="usr-susp">'+escapar(u.estado.toUpperCase())+'</b>' : '')+
          '</span></div>'+
        '<div class="usr-acc">'+
          // La IA se apaga sola, sin tocar la cuenta: sigue apuntando a
          // mano pero deja de gastar. Es el caso más común, así que va
          // primero y con su estado a la vista.
          '<button class="'+(u.ia?'b-on':'b-off')+'" data-ia="'+USUARIOS.indexOf(u)+'" '+
            'title="'+(u.ia?'Apagarle la IA':'Encenderle la IA')+'">'+(u.ia?'✨ on':'✨ off')+'</button>'+
          '<button class="'+(u.estado==='suspendido'?'b-on':'b-off')+'" data-susp="'+USUARIOS.indexOf(u)+'">'+
            (u.estado==='suspendido'?'Reactivar':'Suspender')+'</button>'+
          '<button class="b-key" data-pass="'+USUARIOS.indexOf(u)+'">🔑</button>'+
        '</div></div>';
    }).join('')
      : (USUARIOS.length ? '<p class="cmp-aviso">Nadie coincide con esa búsqueda.</p>'
                         : '<p class="cmp-aviso">Cargando usuarios…</p>'))+
    '<p class="cmp-aviso">Crear cuentas y reiniciar contraseñas pasan por una Edge Function que verifica tu rol en el servidor: la clave de servicio nunca viaja en el teléfono.</p>';
  }

  function pintarConfig(){
    if(!FLAGS.length) return '<p class="cmp-aviso">Cargando ajustes…</p>';
    var grupos = {};
    FLAGS.forEach(function(f){ (grupos[f.g] = grupos[f.g] || []).push(f); });
    return Object.keys(grupos).map(function(g){
      return '<div class="panel-seccion">'+g+'</div>'+ grupos[g].map(function(f){
        return '<div class="flag-row'+(f.k==='modo_mantenimiento'&&f.on?' peligro':'')+'">'+
          '<div class="txt"><b>'+escapar(f.t)+'</b><span>'+escapar(f.d)+'</span></div>'+
          '<button class="switch'+(f.on?' on':'')+'" data-flag="'+f.k+'" role="switch" aria-checked="'+f.on+'"><i></i></button>'+
        '</div>';
      }).join('');
    }).join('')+
    '<p class="cmp-aviso">Estos interruptores viven en la tabla <b>feature_flags</b>. Se aplican al instante para todos, sin publicar una versión nueva de la app.</p>';
  }

  // ---- El catálogo de alimentos, solo para el super admin ----
  // Se carga bajo demanda y por búsqueda, no entero: son cientos de filas
  // y cargarlas todas para ver una sería tirar red y memoria.
  var CATALOGO = [], catFiltro = '', catCargando = false;
  var CATEGORIAS = ['carnes','aves','pescados','mariscos','huevos','lacteos','verduras',
    'frutas','legumbres','cereales','pastas','arroces','tuberculos','semillas',
    'frutos_secos','aceites','grasas','condimentos','bebidas','harinas','panes',
    'azucares','otros'];

  function cargarCatalogo(){
    if(catCargando) return;
    catCargando = true;
    // Aquí sí se lee la tabla directa y no buscar_catalogo(): el super
    // admin necesita ver los campos que la función no devuelve (fdc_id,
    // el nombre de USDA, si está activo) y su política se lo permite.
    // UNIDAD, PIEZA_G Y MACROS_POR TAMBIÉN, que faltaban.
    //
    // Sin ellas, abrir un alimento para editarlo dejaba el desplegable en
    // «Gramos» -porque `a.unidad` venía sin definir- y el peso en blanco. Y
    // al guardar se escribía eso: entrar a corregirle una tilde al nombre de
    // un huevo lo convertía en gramos y le borraba el peso, sin un aviso.
    // Justo la regresión silenciosa que la 0033 se cuidó de evitar.
    var q = '/rest/v1/alimentos_catalogo?select=id,nombre,categoria,estado,kcal,' +
            'proteina,carbos,grasas,porcion,porcion_g,fdc_id,nombre_usda,activo,' +
            'unidad,pieza_g,macros_por' +
            '&order=nombre.asc&limit=400';
    if(catFiltro.trim().length >= 2){
      q += '&nombre=ilike.*' + encodeURIComponent(catFiltro.trim()) + '*';
    }
    sbFetch(q).then(function(r){
      CATALOGO = r || [];
      catCargando = false;
      if(admVista !== 'alimentos') return;
      // Repintar destruye el campo de búsqueda. Se guarda dónde estaba el
      // cursor y se devuelve el foco, o escribir se volvería imposible:
      // cada resultado echaría al usuario fuera del campo.
      var antes = document.getElementById('catBuscar');
      var pos = antes && document.activeElement === antes ? antes.selectionStart : null;
      pintarAdmin();
      if(pos !== null){
        var nuevo = document.getElementById('catBuscar');
        if(nuevo){ nuevo.focus(); nuevo.setSelectionRange(pos, pos); }
      }
    })['catch'](function(e){
      catCargando = false;
      toast('toastAdmin', 'No se pudo cargar: ' + traducirError(e.message));
    });
  }

  function pintarAlimentos(){
    var filas = CATALOGO;
    return '<div class="adm-busca">' +
      '<div class="searchbox"><span>🔍</span>' +
      '<input id="catBuscar" placeholder="Buscar en el catálogo…" value="' + escapar(catFiltro) + '"></div>' +
      '<button class="btn-primary" id="catNuevo" style="width:100%;margin-top:10px;">+ Agregar alimento</button>' +
    '</div>' +
    '<div class="panel-seccion">Catálogo <small>' + filas.length +
      (catFiltro ? ' que coinciden' : ' cargados') + '</small></div>' +
    (filas.length ? filas.map(function(a, i){
      var cal = Math.round(Number(a.kcal));
      return '<div class="cat-row' + (a.activo ? '' : ' apagado') + '" data-cat="' + i + '">' +
        '<div class="info">' +
          '<b>' + escapar(a.nombre) +
            (a.estado !== 'unico' ? ' <span class="cat-estado">' + escapar(a.estado) + '</span>' : '') +
            (a.activo ? '' : ' <span class="cat-estado">oculto</span>') + '</b>' +
          '<span>' + a.categoria + ' · ' + cal + ' cal · P' + a.proteina +
            ' C' + a.carbos + ' G' + a.grasas + ' · por 100 g</span>' +
        '</div>' +
        '<span style="color:var(--ink-faint)">›</span></div>';
    }).join('')
      : '<p class="cmp-aviso">' + (catFiltro
          ? 'Nada coincide con esa búsqueda.'
          : 'Toca aquí arriba para buscar, o agrega un alimento nuevo.') + '</p>') +
    '<p class="cmp-aviso">Los datos vienen de USDA. Cada fila guarda su identificador ' +
      'original para poder comprobarla contra la fuente. Nadie más ve esta tabla: ' +
      'el resto solo la usa al buscar un alimento.</p>';
  }

  // ---- Editar un alimento del catálogo ----
  var catSheet = document.getElementById('catSheet');
  var catEditando = null;

  document.getElementById('catCategoria').innerHTML =
    CATEGORIAS.map(function(c){
      return '<option value="' + c + '">' + c.replace(/_/g, ' ') + '</option>'; }).join('');

  function calcularCalCatalogo(){
    var p = Number(document.getElementById('catP').value) || 0;
    var c = Number(document.getElementById('catC').value) || 0;
    var g = Number(document.getElementById('catG').value) || 0;
    document.getElementById('catCal').textContent = Math.round(p*4 + c*4 + g*9) + ' cal';
  }
  ['catP','catC','catG'].forEach(function(id){
    document.getElementById(id).addEventListener('input', calcularCalCatalogo);
  });

  // ---- En qué se registra el alimento ----
  // Los macros de la ficha van SIEMPRE por 100 g, venga de USDA o lo escriba
  // un admin. Esto solo decide cómo se le pide la cantidad a la persona:
  // "150 g de arroz" o "2 huevos" o "1 servicio de batido". La conversión
  // la hace la app con el peso de una unidad, así que en cuanto la unidad
  // no es gramos ese peso deja de ser opcional.
  // ---- La unidad del catálogo, en píldoras ----
  //
  //  Las mismas seis que la pantalla de «Agregar alimento», y por lo mismo:
  //  de una barrita conoces los macros de la barrita y de un aceite los de una
  //  cucharada. Traducirlo todo a «por 100 g» de cabeza es lo que hacía falta
  //  antes, y para contar por piezas encima había que saber lo que pesa una.
  var catUnidadActual = 'Gramos';
  var catPills = document.getElementById('catUnidadPills');

  function ponerUnidadCat(u){
    if(!UNIDAD_ABREV[u]) u = 'Gramos';
    catUnidadActual = u;
    Array.from(catPills.querySelectorAll('button')).forEach(function(x){
      x.classList.toggle('active', x.textContent === u);
    });
    // Y la cantidad, al número que tenga sentido para esa unidad.
    document.getElementById('catCantidad').value = baseDeUnidad(u);
    pintarUnidadCatalogo();
  }
  catPills.addEventListener('click', function(e){
    var b = e.target.closest('button');
    if(b) ponerUnidadCat(b.textContent);
  });

  // Cuánto vale una ficha: la cantidad que se teclea arriba, saneada.
  function catCantidad(){
    var n = Number(document.getElementById('catCantidad').value);
    return n > 0 ? n : baseDeUnidad(catUnidadActual);
  }

  // A qué se refieren los macros GUARDADOS de esta ficha.
  //
  // En gramos siempre a 100 g -«los macros de un gramo» no es como lo escribe
  // nadie-. En cualquier otra unidad, a UNA de ellas: es lo único que se puede
  // guardar sin saber el peso, y es justo lo que se quería poder hacer.
  function macrosPorDelCatalogo(){
    return catUnidadActual === 'Gramos' ? '100g' : 'unidad';
  }

  // Cómo se lee «100 g» o «2 piezas» en esta pantalla.
  function catCuanto(){
    var n = catCantidad();
    return un(n) + ' ' + textoUnidad(n, catUnidadActual);
  }

  function pintarUnidadCatalogo(){
    var u = catUnidadActual;
    var enGramos = u === 'Gramos';
    var cuanto = catCuanto();

    document.getElementById('catCantUnidad').textContent = UNIDAD_ABREV[u];
    document.getElementById('catMacrosQue').textContent =
      'Macros para ' + cuanto + '. Las calorías se calculan solas.';
    document.getElementById('catCalQue').textContent = 'Calorías para ' + cuanto;

    // EL PESO YA NO SE PIDE PARA PODER GUARDAR. Los macros que se teclean
    // arriba ya son los de esa cantidad, así que no hay nada que convertir.
    // Se deja como dato opcional porque, cuando se sabe, deja al asistente
    // pasar de gramos a piezas al leer una foto.
    document.getElementById('catPesoUnidad').hidden = enGramos;
    // Solo se lee cuando NO son gramos —ahí está oculto—, pero se calcula
    // igual: en gramos saldría «¿cuánto pesa 100 g?», que no es una pregunta.
    document.getElementById('catPesoUnidadLabel').textContent = enGramos
      ? 'Peso de una unidad (g)'
      : 'Y si lo sabes, ¿cuánto pesa ' + UNIDAD_UNA[u] + '? (g)';

    document.getElementById('catUnidadNota').textContent = enGramos
      ? 'Se apunta en gramos.'
      : 'Se apunta por ' + textoUnidad(2, u) + '. No hace falta saber lo que pesa.';
    pintarPreviaCatalogo();
  }

  // Lo que va a ver quien lo apunte, con los números ya hechos.
  //
  // Los macros se teclean por 100 g y se apunta por piezas: para saber si
  // lo escrito tiene sentido hay que multiplicar de cabeza, y nadie lo
  // hace. Con esto se ve de un vistazo, y un dato absurdo canta solo.
  function pintarPreviaCatalogo(){
    var caja = document.getElementById('catPreview');
    if(!caja) return;
    var u = catUnidadActual;
    var g = Number(document.getElementById('catPiezaG').value) || 0;

    // En gramos no hace falta: lo tecleado ya se lee como lo que es.
    if(u === 'Gramos'){ caja.hidden = true; return; }

    var P = Number(document.getElementById('catP').value) || 0;
    var C = Number(document.getElementById('catC').value) || 0;
    var G = Number(document.getElementById('catG').value) || 0;
    // Lo tecleado es para `catCantidad()` unidades; quien lo apunte lo verá
    // por UNA, que es como se lo va a ofrecer la app.
    var f = 1 / catCantidad();

    caja.hidden = false;
    document.getElementById('catPreviewQue').textContent =
      UNIDAD_UNA[u].charAt(0).toUpperCase() + UNIDAD_UNA[u].slice(1) +
      (g > 0 ? ' (' + g + ' g)' : '');
    document.getElementById('catPreviewCal').textContent =
      mil(Math.round((P*4 + C*4 + G*9) * f)) + ' cal';
    document.getElementById('catPreviewDet').textContent =
      'P ' + Math.round(P*f*10)/10 + ' g · C ' + Math.round(C*f*10)/10 +
      ' g · G ' + Math.round(G*f*10)/10 + ' g';
  }

  // La cantidad rehace las etiquetas: «Macros para 45 g» tiene que seguir a
  // lo que se acaba de escribir, o se teclean unos macros creyendo que son
  // de otra cosa.
  document.getElementById('catCantidad').addEventListener('input', pintarUnidadCatalogo);
  // La previa se rehace con cualquier número que la cambie, no solo al
  // elegir unidad: se teclea el peso y se ve al momento si cuadra.
  Array.from(['catPiezaG','catP','catC','catG']).forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', pintarPreviaCatalogo);
  });

  function abrirCatalogo(a){
    catEditando = a || null;
    var nuevo = !a;
    document.getElementById('catTitulo').textContent = nuevo ? 'Alimento nuevo' : 'Editar alimento';
    // De dónde salió el dato. Si alguien lo cambia a mano, deja de ser de
    // USDA y hay que decirlo: es lo que permite auditarlo después.
    var deUsda = !!(a && a.fdc_id);
    document.getElementById('catFuente').textContent = deUsda
      ? 'USDA #' + a.fdc_id + ' · ' + (a.nombre_usda || '')
      : 'Alimento propio, no viene de USDA';

    // La porción de USDA solo sale si el alimento viene de USDA. En uno
    // propio no hay nada que cuadrar contra la fuente, y tener DOS campos
    // de gramos en la misma pantalla -«pesa una» y «pesa»- es exactamente
    // como se acaba rellenando el que no era.
    document.getElementById('catBloqueUsda').hidden = !deUsda;

    document.getElementById('catNombre').value    = a ? a.nombre : '';
    document.getElementById('catCategoria').value = a ? a.categoria : 'otros';
    document.getElementById('catEstado').value    = a ? a.estado : 'unico';
    document.getElementById('catPorcion').value  = (a && a.porcion) || '';
    document.getElementById('catPorcionG').value = (a && a.porcion_g) || '';
    document.getElementById('catPiezaG').value  = (a && a.pieza_g) || '';

    // La unidad PRIMERO: al ponerla se repinta la pantalla y se ajusta la
    // cantidad, así que los macros van después o se rellenarían y acto
    // seguido se leerían con una cantidad que ya no es la suya.
    ponerUnidadCat((a && a.unidad) || 'Gramos');

    // Y la cantidad a la que se refieren los macros GUARDADOS, que es lo que
    // la base sabe: 100 g, o una unidad. Reeditar una barrita que se dio de
    // alta «para 45 g» la enseña por 100 g, que es como está guardada; el
    // dato de los 45 no se guarda en ningún sitio.
    document.getElementById('catCantidad').value =
      ((a && a.unidad) || 'Gramos') === 'Gramos' ? 100 : 1;

    document.getElementById('catP').value = a ? a.proteina : '';
    document.getElementById('catC').value = a ? a.carbos : '';
    document.getElementById('catG').value = a ? a.grasas : '';
    pintarUnidadCatalogo();
    document.getElementById('catOcultar').hidden = nuevo;
    document.getElementById('catOcultar').textContent =
      (a && !a.activo) ? 'Volver a mostrarlo' : 'Ocultar del buscador';
    calcularCalCatalogo();
    catSheet.classList.add('open');
  }

  function cerrarCatalogo(){ catSheet.classList.remove('open'); catEditando = null; }
  document.getElementById('catCancelar').addEventListener('click', cerrarCatalogo);
  catSheet.addEventListener('click', function(e){ if(e.target === catSheet) cerrarCatalogo(); });

  document.getElementById('catGuardar').addEventListener('click', function(){
    var nombre = document.getElementById('catNombre').value.trim();
    if(!nombre){ toast('toastAdmin', 'Ponle nombre'); return; }

    var unidad = catUnidadActual;
    var piezaG = Number(document.getElementById('catPiezaG').value) || 0;
    // AQUÍ HABÍA UN AVISO DE «FALTA CUÁNTO PESA UNA PIEZA», y ya no hace
    // falta: los macros que se teclean son los de la cantidad que se teclea,
    // así que siempre hay algo que guardar. El peso pasó a ser un extra.
    //
    // Se borra en vez de dejarlo apagado con un `if(false)`: un bloque que no
    // se ejecuta se lee como si se ejecutara, y el siguiente que pase por
    // aquí creerá que ese aviso puede saltar.
    var macrosPor = macrosPorDelCatalogo();
    document.getElementById('catPiezaG').classList.remove('falta');

    // ---- DE LO QUE SE TECLEA A LO QUE GUARDA LA BASE ----
    //
    // Arriba se escribe «los macros de ESTA cantidad», que es como viene un
    // envase. La base guarda dos formas y solo dos:
    //
    //   Gramos  -> por 100 g          (se reescala: 45 g de barrita x 100/45)
    //   lo demás -> los de UNA unidad (se divide entre cuántas se dijeron)
    //
    // La cuenta se hace AQUÍ y no se le pide a quien rellena el formulario,
    // que es justo lo que había que dejar de hacer.
    var cant = catCantidad();
    var factor = unidad === 'Gramos' ? 100 / cant : 1 / cant;
    var red = function(v){ return Math.round(v * factor * 10) / 10; };

    var cuerpo = {
      nombre: nombre,
      categoria: document.getElementById('catCategoria').value,
      estado: document.getElementById('catEstado').value,
      proteina: red(Number(document.getElementById('catP').value) || 0),
      carbos:   red(Number(document.getElementById('catC').value) || 0),
      grasas:   red(Number(document.getElementById('catG').value) || 0),
      porcion:   document.getElementById('catPorcion').value.trim() || null,
      porcion_g: Number(document.getElementById('catPorcionG').value) || null,
      unidad:    unidad,
      macros_por: macrosPor,
      // En gramos se limpia a null en vez de dejar el número escrito: si
      // alguien pone 50, cambia a gramos y guarda, un peso por pieza
      // colgando ahí no significa nada y confunde al siguiente que lo abra.
      pieza_g:   unidad === 'Gramos' || piezaG <= 0 ? null : piezaG
    };
    // Las calorías no se piden: se calculan. Pedirlas invita a que un día
    // no cuadren con los macros de su propia fila.
    cuerpo.kcal = Math.round((cuerpo.proteina*4 + cuerpo.carbos*4 + cuerpo.grasas*9) * 10) / 10;

    var p = catEditando
      ? sbFetch('/rest/v1/alimentos_catalogo?id=eq.' + catEditando.id, {
          method:'PATCH', headers:{ 'Prefer':'return=minimal' }, body: JSON.stringify(cuerpo) })
      : sbFetch('/rest/v1/alimentos_catalogo', {
          method:'POST', headers:{ 'Prefer':'return=minimal' }, body: JSON.stringify(cuerpo) });

    p.then(function(){
      toast('toastAdmin', catEditando ? 'Alimento actualizado' : 'Alimento agregado');
      cerrarCatalogo();
      cargarCatalogo();
    })['catch'](function(e){
      var m = e.message || '';
      toast('toastAdmin', /duplicate|unique/.test(m)
        ? 'Ya existe ese alimento en ese estado'
        : 'No se pudo guardar: ' + traducirError(m));
    });
  });

  // Ocultar en vez de borrar: si alguien ya lo tiene apuntado en su
  // diario, borrarlo del catálogo no debe hacer desaparecer su comida.
  document.getElementById('catOcultar').addEventListener('click', function(){
    if(!catEditando) return;
    var mostrar = !catEditando.activo;
    sbFetch('/rest/v1/alimentos_catalogo?id=eq.' + catEditando.id, {
      method:'PATCH', headers:{ 'Prefer':'return=minimal' },
      body: JSON.stringify({ activo: mostrar })
    }).then(function(){
      toast('toastAdmin', mostrar ? 'Vuelve a aparecer al buscar' : 'Ya no aparece al buscar');
      cerrarCatalogo();
      cargarCatalogo();
    })['catch'](function(e){
      toast('toastAdmin', 'No se pudo: ' + traducirError(e.message));
    });
  });

  // ================= LO QUE CUESTA LA IA =================
  //
  //  Los tokens se llevan apuntando desde que se monto `ia_gasto`, pero no
  //  habia forma de MIRARLOS: la unica respuesta a «cuanto me cuesta» era
  //  una estimacion hecha a mano. Esto es lo que faltaba.
  //
  //  LOS PRECIOS VIVEN AQUI y no en la base a proposito. Cambian -Anthropic
  //  ajusta tarifas y el dolar se mueve todos los dias-, y guardarlos con
  //  cada fila congelaria un tipo de cambio de hace tres meses. Aqui son dos
  //  numeros que se editan y ya.
  var PRECIO_IA = {
    'claude-opus-5':  { ent: 5,  sal: 25 },   // dolares por millon de tokens
    'claude-sonnet-5':{ ent: 3,  sal: 15 },
    'claude-haiku-4-5-20251001': { ent: 1, sal: 5 }
  };
  // La cache no es gratis ni cuesta lo mismo segun se acierte o se falle:
  // leer sale a la decima parte, escribir un 25% mas caro. Por eso hace
  // falta un 22% de aciertos para que compense -1.25 - 1.15h < 1-, y por
  // eso se ensena el porcentaje: por debajo de ahi la cache ESTORBA.
  var CACHE_LEE = 0.1, CACHE_ESCRIBE = 1.25, CACHE_UMBRAL = 0.217;
  var USD_MXN = 18.5;

  // El nombre que sale en los interruptores, para que el informe y la
  // pantalla de llaves hablen de lo mismo. Sin esto, aqui pondria
  // «plan_semana» y alli «Armar la semana entera».
  var NOMBRE_LLAVE = {
    foto:        'Apuntar comida con foto',
    chat:        'Preguntas y avisos',
    semanal:     'Cierre del lunes y fotos',
    plan_dia:    'Plan de un día',
    plan_semana: 'Armar la semana entera',
    analisis:    'Analizar cómo va'
  };

  var GASTO = null, gastoDias = 30, gastoCargando = false;

  // «claude-sonnet-5» se lee mal en una frase. Esto lo deja en «Sonnet 5»,
  // y si mañana aparece uno que no está en la lista, se enseña su nombre
  // tal cual en vez de esconderlo: saber que hay un modelo desconocido es
  // parte de poder fiarse del número.
  function nombreDeModelo(m){
    var bonitos = {
      'claude-opus-5': 'Opus 5',
      'claude-sonnet-5': 'Sonnet 5',
      'claude-haiku-4-5-20251001': 'Haiku 4.5'
    };
    return bonitos[m] || m;
  }

  function pesosDe(f){
    var p = PRECIO_IA[f.modelo] || PRECIO_IA['claude-opus-5'];
    var ent = Number(f.entrada) || 0;
    var lee = Number(f.cache_lee) || 0;
    var esc = Number(f.cache_escribe) || 0;
    return (((ent + lee * CACHE_LEE + esc * CACHE_ESCRIBE) * p.ent +
             (Number(f.salida) || 0) * p.sal) / 1e6) * USD_MXN;
  }

  // Lo que habria costado esto MISMO sin cache: todos los tokens del prompt
  // a precio entero. La diferencia con lo de arriba es lo que la cache
  // ahorro -o lo que costo, si sale en negativo-.
  function pesosSinCache(f){
    var p = PRECIO_IA[f.modelo] || PRECIO_IA['claude-opus-5'];
    var todo = (Number(f.entrada) || 0) + (Number(f.cache_lee) || 0) +
               (Number(f.cache_escribe) || 0);
    return ((todo * p.ent + (Number(f.salida) || 0) * p.sal) / 1e6) * USD_MXN;
  }

  function cargarGasto(){
    if(gastoCargando) return;
    gastoCargando = true;
    sbRpc('ia_gasto_resumen', { p_dias: gastoDias })
      .then(function(r){ GASTO = r || []; })
      ['catch'](function(){ GASTO = 'error'; })
      .then(function(){ gastoCargando = false; if(admVista === 'gasto') pintarAdmin(); });
  }

  function pintarGasto(){
    if(GASTO === 'error') return '<p class="cmp-aviso">No pude traer el gasto.</p>';
    if(!GASTO) return '<p class="cmp-aviso">Cargando…</p>';

    var dias = '<div class="src-pills adm-tabs" style="margin:0 16px 10px;">' +
      [7, 30, 90].map(function(d){
        return '<button class="' + (d === gastoDias ? 'active' : '') + '" ' +
               'data-gdias="' + d + '">' + d + ' días</button>';
      }).join('') + '</div>';

    if(!GASTO.length){
      return dias + '<p class="cmp-aviso">Todavía no hay nada apuntado en ' +
        'estos ' + gastoDias + ' días. Se apunta solo, cada vez que alguien ' +
        'usa la IA.</p>';
    }

    // Se suma POR LLAVE y no por fila: la misma llave puede venir con dos
    // modelos distintos, y lo que se decide -apagar o no- es la llave.
    var porLlave = {}, total = 0, llamadas = 0;
    var lee = 0, escribe = 0, sinCache = 0;
    GASTO.forEach(function(f){
      var k = f.llave || f.accion;
      var g = porLlave[k] || (porLlave[k] = { k: k, pesos: 0, n: 0 });
      g.pesos += pesosDe(f);
      g.n += Number(f.llamadas) || 0;
      total += pesosDe(f);
      sinCache += pesosSinCache(f);
      llamadas += Number(f.llamadas) || 0;
      lee += Number(f.cache_lee) || 0;
      escribe += Number(f.cache_escribe) || 0;
    });
    var filas = Object.keys(porLlave).map(function(k){ return porLlave[k]; })
      .sort(function(a, b){ return b.pesos - a.pesos; });

    return dias +
      '<div class="kpi-grid">' +
        '<div class="kpi"><b>$' + total.toFixed(0) + '</b><span>en ' + gastoDias + ' días</span>' +
          '<span class="sub">' + mil(llamadas) + ' respuestas</span></div>' +
        '<div class="kpi"><b>$' + (total / Math.max(gastoDias, 1) * 30).toFixed(0) + '</b>' +
          '<span>al mes, a este ritmo</span>' +
          '<span class="sub">$' + (llamadas ? (total / llamadas).toFixed(2) : '0') +
          ' cada una</span></div>' +
      '</div>' +
      // ---- La cache, y si esta valiendo la pena ----
      //
      //  No basta con decir «hay cache»: por debajo del 22% de aciertos
      //  CUESTA MAS que no tenerla, porque escribirla vale 1.25x. Asi que
      //  lo que se ensena es el porcentaje y, al lado, lo que ha ahorrado
      //  o costado en pesos. Con eso se decide si dejarla o quitarla.
      (lee + escribe > 0
        ? (function(){
            var pct = lee / (lee + escribe);
            var dif = sinCache - total;
            var bien = pct >= CACHE_UMBRAL;
            return '<div class="gasto-cache' + (bien ? '' : ' floja') + '">' +
              '<div class="txt"><b>Caché de instrucciones</b>' +
                '<span>' + Math.round(pct * 100) + '% de aciertos' +
                ' · hace falta ' + Math.round(CACHE_UMBRAL * 100) +
                '% para que compense</span></div>' +
              '<div class="val"><b>' + (dif >= 0 ? '−$' : '+$') +
                Math.abs(dif).toFixed(0) + '</b>' +
                '<span>' + (dif >= 0 ? 'ahorrados' : 'de más') + '</span></div>' +
            '</div>'; })()
        : '') +
      filas.map(function(g){
        // La barra dice de un vistazo cuánto pesa cada cosa. Un porcentaje
        // en texto se lee; una barra se ve.
        var pct = total > 0 ? Math.round(g.pesos / total * 100) : 0;
        return '<div class="gasto-row">' +
          '<div class="txt"><b>' + escapar(NOMBRE_LLAVE[g.k] || g.k) + '</b>' +
            '<span>' + mil(g.n) + (g.n === 1 ? ' vez' : ' veces') +
            ' · $' + (g.pesos / Math.max(g.n, 1)).toFixed(2) + ' cada una</span>' +
            '<i class="barra"><u style="width:' + pct + '%"></u></i></div>' +
          '<div class="val"><b>$' + g.pesos.toFixed(0) + '</b><span>' + pct + '%</span></div>' +
        '</div>';
      }).join('') +
      // EL PIE DICE EL PRECIO DE LO QUE DE VERDAD CORRIÓ.
      //
      //  El dinero ya se calculaba bien —`pesosDe()` mira el modelo de cada
      //  fila— pero aquí el modelo estaba escrito a mano, así que decía 5 y
      //  25 pasara lo que pasara. Y eso engaña justo cuando más se mira este
      //  panel: al cambiar de modelo para gastar menos. El gasto baja de
      //  verdad y la pantalla que debe confirmarlo enseña los precios del
      //  modelo viejo, así que la cuenta no se puede comprobar.
      //
      //  Si corrieron dos, se dicen los dos.
      (function(){
        var vistos = [], falta = false;
        GASTO.forEach(function(f){
          var m = f.modelo || 'claude-opus-5';
          if(vistos.indexOf(m) < 0) vistos.push(m);
          if(!PRECIO_IA[m]) falta = true;
        });
        var lista = vistos.map(function(m){
          var p = PRECIO_IA[m];
          // Sin precio se dice ahí mismo, o la frase queda coja: «un modelo
          // por millón» no significa nada.
          return nombreDeModelo(m) + (p ? ' a $' + p.ent + ' y $' + p.sal
                                        : ' (sin precio)');
        }).join(', ');

        return '<p class="cmp-aviso">Son los tokens EXACTOS que devolvió ' +
          'Anthropic: ' + escapar(lista) + ' por millón, y ' + USD_MXN +
          ' pesos por dólar. Lo que más pese aquí es lo que más ahorra apagar ' +
          'en las llaves de cada persona.' +
          // Y si algún modelo no tiene precio, se dice. Callarlo deja un
          // número con dos decimales que puede estar al doble.
          (falta
            ? ' <b>Ojo: hay respuestas de un modelo cuyo precio no tengo, y ' +
              'esas están contadas a precio de Opus. Ese total puede no ser ' +
              'exacto.</b>'
            : '') + '</p>';
      })();
  }

  function pintarAdmin(){
    var c = document.getElementById('admCuerpo');
    c.innerHTML = admVista === 'tablero' ? pintarTablero()
                : admVista === 'usuarios' ? pintarUsuarios()
                : admVista === 'alimentos' ? pintarAlimentos()
                : admVista === 'gasto' ? pintarGasto()
                : pintarConfig();
    // La del catálogo va a la base en cada búsqueda -son cientos de filas
    // y no están todas en memoria-, con retardo para no lanzar una
    // petición por tecla.
    var catB = document.getElementById('catBuscar');
    if(catB){
      catB.addEventListener('input', function(){
        catFiltro = this.value;
        clearTimeout(catB._reloj);
        catB._reloj = setTimeout(cargarCatalogo, 350);
      });
    }

    var busca = document.getElementById('admBuscar');
    if(busca){
      busca.addEventListener('input', function(){
        admFiltro = this.value;
        var pos = this.selectionStart;
        pintarAdmin();
        var nuevo = document.getElementById('admBuscar');
        if(nuevo){ nuevo.focus(); nuevo.setSelectionRange(pos, pos); }
      });
    }
  }

  document.getElementById('admTabs').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    Array.from(this.querySelectorAll('button')).forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active'); admVista = b.dataset.adm; pintarAdmin();
    // El catálogo se trae al entrar en su pestaña, no al abrir el panel:
    // son cientos de filas que casi nunca se miran.
    if(admVista === 'alimentos' && !CATALOGO.length) cargarCatalogo();
    // Igual que el catálogo: se pide al entrar en su pestaña, no al abrir
    // el panel. Es una consulta que agrupa toda la tabla.
    if(admVista === 'gasto' && !GASTO) cargarGasto();
  });

  document.getElementById('admCuerpo').addEventListener('click', function(e){
    var gd = e.target.closest('[data-gdias]');
    if(gd){
      gastoDias = Number(gd.getAttribute('data-gdias'));
      GASTO = null;
      pintarAdmin();      // «Cargando…» al momento; los datos llegan después
      cargarGasto();
      return;
    }

    var fl = e.target.closest('[data-flag]');
    if(fl){
      var f = FLAGS.filter(function(x){ return x.k === fl.dataset.flag; })[0];
      f.on = !f.on;
      pintarAdmin();
      toast('toastAdmin', f.t + (f.on ? ': encendido' : ': apagado'));

      // Se guarda en la tabla; si falla, el interruptor vuelve solo. Un
      // interruptor que dice "encendido" y no lo está es peor que un error.
      sbFetch('/rest/v1/feature_flags?clave=eq.' + encodeURIComponent(f.k), {
        method:'PATCH', headers:{ 'Prefer':'return=minimal' },
        body: JSON.stringify({ activo: f.on })
      })['catch'](function(err){
        f.on = !f.on; pintarAdmin();
        toast('toastAdmin', 'No se pudo guardar: ' + traducirError(err.message));
      });
      return;
    }
    // --- Catálogo: abrir uno, o crear ---
    var bc = e.target.closest('[data-cat]');
    if(bc){ abrirCatalogo(CATALOGO[Number(bc.dataset.cat)]); return; }
    if(e.target.closest('#catNuevo')){ abrirCatalogo(null); return; }

    // --- Apagarle la IA a alguien ---
    var bi = e.target.closest('[data-ia]');
    if(bi){
      var ui = USUARIOS[Number(bi.dataset.ia)];
      ui.ia = !ui.ia;
      pintarAdmin();
      toast('toastAdmin', ui.n + (ui.ia ? ': IA encendida' : ': IA apagada'));
      if(ui.id){
        sbRpc('admin_ia', { p_usuario: ui.id, p_habilitada: ui.ia })['catch'](function(err){
          ui.ia = !ui.ia; pintarAdmin();
          toast('toastAdmin', 'No se pudo guardar: ' + traducirError(err.message));
        });
      }
      return;
    }

    // --- Suspender o reactivar ---
    var bs = e.target.closest('[data-susp]');
    if(bs){
      var us = USUARIOS[Number(bs.dataset.susp)];
      var suspender = us.estado !== 'suspendido';
      // Suspender deja a alguien fuera de su propia cuenta. Eso se
      // pregunta; encenderla de vuelta no hace falta.
      if(suspender && !confirm('¿Suspender a ' + us.n + '?\n\n' +
          'No podrá entrar a la app. Sus comidas, fotos y progreso se conservan, ' +
          'y puedes reactivarla cuando quieras.')) return;

      var antes = us.estado;
      us.estado = suspender ? 'suspendido' : 'activo';
      if(suspender) us.on = false; else us.on = true;
      pintarAdmin();
      toast('toastAdmin', us.n + (suspender ? ' suspendido' : ' reactivado'));
      if(us.id){
        sbRpc('admin_estado', { p_usuario: us.id, p_estado: us.estado })['catch'](function(err){
          us.estado = antes; us.on = (antes === 'activo'); pintarAdmin();
          toast('toastAdmin', 'No se pudo guardar: ' + traducirError(err.message));
        });
      }
      return;
    }

    // --- Invitar por correo ---
    if(e.target.closest('#admInvitar')){
      var correo = (prompt('Correo de la persona que quieres agregar:') || '').trim();
      if(!correo) return;
      if(correo.indexOf('@') < 0){ toast('toastAdmin', 'Ese correo no parece válido'); return; }

      sbFetch('/rest/v1/invitaciones', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ correo: correo, rol: 'cliente', invitado_por: sesion.user.id })
      }).then(function(){
        toast('toastAdmin', 'Apuntado. Entrará como tu cliente al registrarse.');
      })['catch'](function(err){
        var m = err.message || '';
        toast('toastAdmin', m.indexOf('duplicate') >= 0 || m.indexOf('unique') >= 0
          ? 'Ese correo ya está invitado'
          : 'No se pudo: ' + traducirError(m));
      });
      return;
    }

    var tg = e.target.closest('[data-toggle]');
    if(tg){
      var u = USUARIOS[Number(tg.dataset.toggle)];
      u.on = !u.on;
      pintarAdmin();
      toast('toastAdmin', u.n + (u.on ? ' activado' : ' desactivado'));

      // admin_activar() comprueba en la base que quien llama es super admin
      // y deja anotado el cambio en la bitácora.
      if(u.id){
        sbRpc('admin_activar', { p_usuario: u.id, p_activo: u.on })['catch'](function(err){
          u.on = !u.on; pintarAdmin();
          toast('toastAdmin', 'No se pudo guardar: ' + traducirError(err.message));
        });
      }
      return;
    }
    // --- Mandar enlace para recuperar la contraseña ---
    //
    // ESTO NO MANDABA NADA. Solo sacaba el aviso de "enlace enviado" y se
    // quedaba tan ancho: no había ni una llamada, en toda la app la palabra
    // "recuperación" solo aparecía en ese texto.
    //
    // O sea que quien no podía entrar a su cuenta oía "ya te lo mandé" y se
    // quedaba esperando un correo que no existía. Mentir sobre algo hecho es
    // peor que no tener el botón.
    var pw = e.target.closest('[data-pass]');
    if(pw){
      var up = USUARIOS[Number(pw.dataset.pass)];
      if(!up || !up.c){ toast('toastAdmin', 'No tengo el correo de esa persona'); return; }
      // Se pregunta porque esto le llega a alguien de verdad a su bandeja.
      if(!confirm('¿Mandar a ' + up.c + ' un enlace para cambiar su contraseña?')) return;

      var boton = pw;
      boton.disabled = true;
      sbFetch('/auth/v1/recover', {
        method: 'POST',
        body: JSON.stringify({ email: up.c })
      }).then(function(){
        // El aviso va DESPUÉS de que conteste, que es lo que faltaba.
        toast('toastAdmin', 'Enlace enviado a ' + up.c);
      })['catch'](function(err){
        toast('toastAdmin', 'No se pudo enviar: ' + traducirError(err.message));
      }).then(function(){ boton.disabled = false; });
      return;
    }
    if(e.target.closest('#admCrear')){
      toast('toastAdmin', 'Se enviaría la invitación por correo');
      return;
    }
    // Va al final: los botones de la fila ya devolvieron antes, así que
    // tocar el resto de la fila abre la ficha sin pelearse con ellos.
    var fila = e.target.closest('[data-usr]');
    if(fila && typeof abrirFichaUsuario === 'function'){
      var u = USUARIOS[Number(fila.dataset.usr)];
      if(u && u.id) abrirFichaUsuario(u);
    }
  });

  pintarAdmin();

  // ================= PLAN DE COMIDA =================
  // Para quien no quiere contar nada: abre la app y ve qué le toca comer.
  // Lo escribe su entrenador; el cliente solo lo lee.
  // Va aquí arriba y no junto al editor: lo usan tanto la vista del
  // cliente como el editor, y la primera está antes en el archivo. Con
  // `var` funcionaría igual por hoisting, pero leer una variable cien
  // líneas antes de su declaración es una trampa esperando a alguien.
  var DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

  var MOMENTOS = [
    { k:'Desayuno', emoji:'🌅' },
    { k:'Comida',   emoji:'🍽️' },
    { k:'Cena',     emoji:'🌙' },
    { k:'Snack',    emoji:'🍎' }
  ];
  var MI_PLAN = null;        // el plan propio, si alguien me lo escribió
  var PLAN_CLIENTES = [];    // a quiénes les escribo yo
  var planEditando = null;   // { userId, nombre, plan }

  function sbPlanDe(userId){
    return sbFetch('/rest/v1/planes?select=id,nombre,nota,comidas,user_id' +
                   '&user_id=eq.' + userId + '&activo=is.true&limit=1')
      .then(function(r){ return (r || [])[0] || null; });
  }

  // ---- El plan, guardado en el teléfono ----
  //
  // Es lo que MÁS falta hace sin señal de toda la app: «qué me toca comer»
  // se mira en la calle, y es texto puro. Antes no se guardaba en ninguna
  // parte, así que sin conexión `cargarPlan()` fallaba, `pintarMiPlan()` no
  // llegaba a llamarse y la pestaña se quedaba EN BLANCO —ni el plan, ni el
  // «todavía no tienes uno», nada—.
  //
  // Copia por usuario, igual que la despensa, y se sustituye entera en
  // cuanto la carga con señal sale bien.
  var PLAN_KEY = 'macros.plan';

  function guardarMiPlan(){
    if(!sesion || !sesion.user) return;
    try{
      if(MI_PLAN) localStorage.setItem(PLAN_KEY,
        JSON.stringify({ dueno: sesion.user.id, plan: MI_PLAN }));
      // Si ya no hay plan -se lo quitaron- se borra la copia: dejarla haría
      // que el teléfono siguiera enseñando un plan que ya no existe.
      else localStorage.removeItem(PLAN_KEY);
    }catch(e){}
  }

  function cargarMiPlanGuardado(){
    if(!sesion || !sesion.user) return false;
    var d = null;
    try{ d = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null'); }catch(e){}
    if(!d || d.dueno !== sesion.user.id || !d.plan) return false;
    MI_PLAN = d.plan;
    return true;
  }

  // `sinRed` cambia lo que se dice cuando no hay plan que enseñar: «todavía
  // no tienes un plan» es una afirmación, y sin conexión no se ha podido
  // comprobar. Quien la lee se queda esperando a un entrenador que a lo
  // mejor ya se lo escribió.
  // ---- Cuánto le toca comer, arriba del plan ----
  //
  //  Para que la persona sepa cuánto está comiendo sin tener que contar, y
  //  para que el entrenador vea contra qué números se armó el plan.
  //
  //  Sale del PERFIL, no se guarda con el plan. Si el entrenador le cambia
  //  las metas, esta tira cambia y el plan de comida no: esa diferencia es
  //  justo la señal de que hay que rearmarlo. Guardar aquí una copia de las
  //  metas de aquel día la escondería.
  function tiraDeMetas(m){
    if(!m || !m.P) return '';
    var cal = Math.round(m.P * 4 + m.C * 4 + m.G * 9);
    var uno = function(valor, etiqueta){
      return '<div class="plan-meta"><b>' + escapar(valor) + '</b>' +
             '<span>' + escapar(etiqueta) + '</span></div>';
    };
    return '<div class="plan-metas">' +
      uno(mil(cal), 'CALORÍAS') +
      uno(m.P + ' g', 'PROTEÍNA') +
      uno(m.C + ' g', 'CARBOS') +
      uno(m.G + ' g', 'GRASAS') +
      '</div>';
  }

  function pintarMiPlan(sinRed){
    var cont = document.getElementById('planMio');
    if(!MI_PLAN || !(MI_PLAN.comidas || []).length){
      cont.innerHTML = sinRed
        ? '<div class="plan-vacio"><div class="ico">📡</div>' +
          '<b>Sin conexión</b>' +
          '<span>No pude comprobar si tienes un plan. Vuelve a abrir esta ' +
          'pestaña cuando tengas señal.</span></div>'
        : '<div class="plan-vacio"><div class="ico">🍽️</div>' +
          '<b>Todavía no tienes un plan</b>' +
          '<span>Cuando tu entrenador te escriba uno, aparecerá aquí: qué desayunar, ' +
          'qué comer y qué cenar. Sin pesar ni apuntar nada.</span></div>';
      document.getElementById('planSub').textContent = 'Qué comer hoy';
      return;
    }

    document.getElementById('planSub').textContent = MI_PLAN.nombre || 'Qué comer hoy';

    var comidas = MI_PLAN.comidas || [];
    var semanal = comidas.some(function(c){ return !!c.dia; });

    // Con plan semanal se abre en el día de HOY, no en lunes: quien lo
    // consulta a media semana quiere ver lo de hoy, no buscarlo.
    if(semanal && !MI_PLAN.diaVisto){
      var hoyN = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date().getDay()];
      MI_PLAN.diaVisto = comidas.some(function(c){ return c.dia === hoyN; }) ? hoyN : 'Lunes';
    }

    var tabs = semanal
      ? '<div class="plan-dias plan-dias-ver">' + DIAS_SEMANA.map(function(d){
          return '<button class="plan-dia' + (d === MI_PLAN.diaVisto ? ' active' : '') +
                 '" data-verdia="' + d + '">' + d.slice(0,3) + '</button>';
        }).join('') + '</div>'
      : '';

    var delDia = semanal
      ? comidas.filter(function(c){ return c.dia === MI_PLAN.diaVisto; })
      : comidas;

    cont.innerHTML = tiraDeMetas(leerMetas()) + tabs + delDia.map(function(c){
      var m = MOMENTOS.filter(function(x){ return x.k === c.momento; })[0];
      return '<div class="plan-comida">' +
        '<div class="plan-momento"><span>' + (m ? m.emoji : '•') + '</span>' + c.momento + '</div>' +
        '<div class="plan-texto">' + escapar(c.texto) + '</div></div>';
    }).join('') +
    (MI_PLAN.nota ? '<div class="plan-nota">' + escapar(MI_PLAN.nota) + '</div>' : '');
  }

  // El texto lo escribe una persona y se pinta con innerHTML: hay que
  // escaparlo o un "<" cualquiera rompería la tarjeta.
  // Todo lo que escribe una persona y acaba dentro de HTML pasa por aquí.
  //
  // Las comillas NO sobran, aunque solo hagan falta dentro de un atributo:
  // el nombre de un alimento viaja en `data-alim="..."`, y sin escaparlas
  // un alimento llamado  " onclick="algo   se sale del atributo y mete lo
  // que quiera en la etiqueta. En texto normal no molestan: &quot; se pinta
  // como una comilla y ya.
  //
  // Esto se añadió después de comprobar en la app que un ejercicio llamado
  // <img src=x onerror=...> ejecutaba el código al pintar la tarjeta.
  function escapar(t){
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Cuántas llaves apagadas, dicho como se dice de viva voz. Seis de seis no
  // es «6 apagadas»: es que no tiene IA.
  function textoLlaves(n){
    if(n >= 6) return 'sin IA';
    if(n === 1) return '1 cosa de IA apagada';
    return n + ' cosas de IA apagadas';
  }

  function pintarPlanClientes(){
    var caja = document.getElementById('planCoach');
    var puedeEscribir = ROL === 'coach' || ROL === 'super_admin' || ROL === 'org_admin';
    caja.hidden = !puedeEscribir;
    if(!puedeEscribir) return;

    document.getElementById('planCuenta').textContent = PLAN_CLIENTES.length || '';
    document.getElementById('planClientes').innerHTML = PLAN_CLIENTES.length
      ? PLAN_CLIENTES.map(function(c, i){
          return '<div class="plan-cliente" data-plan-cli="' + i + '">' +
            '<div class="cliente-ava">' + iniciales(c.nombre) + '</div>' +
            // El correo debajo del nombre: dos personas pueden llamarse
            // igual y el correo es lo que de verdad las distingue. Un
            // entrenador no lo ve porque su vista de clientes no lo trae.
            '<div class="info"><b>' + escapar(c.nombre) + '</b>' +
            (c.correo ? '<span class="cli-correo">' + escapar(c.correo) + '</span>' : '') +
            '<span>' + (c.tienePlan ? 'con plan' : 'sin plan todavía') +
            // Lo que está apagado SOLO se dice cuando hay algo apagado. Poner
            // «IA: todo» en cada renglón sería ruido en diez de cada diez
            // filas para avisar de lo normal.
            (c.iaApagadas ? ' · ' + textoLlaves(c.iaApagadas) : '') + '</span></div>' +
            // La pastilla al lado del nombre. Siempre igual y sin color: es
            // el mando, no el aviso. Lo que cambia según el estado es la
            // línea de arriba.
            '<button class="pill-ia" data-plan-ia="' + i + '" ' +
              'aria-label="Qué hace la IA con ' + escapar(c.nombre) + '">IA</button>' +
            '<span style="color:var(--ink-faint)">›</span></div>';
        }).join('')
      : '<p class="calc-note" style="padding:4px 20px 0;">Aquí solo sale quien lleva plan. ' +
        'Busca a alguien por su nombre para empezar.</p>';
  }

  // ---- Inscribir a alguien, buscándolo por su nombre ----
  //
  //  ANTES ERA UN prompt() PIDIENDO EL CORREO EXACTO. Para inscribir a Lety
  //  había que sabérselo de memoria y escribirlo entero sin erratas; una
  //  letra mal y salía «No hay ninguna cuenta con ese correo», sin decir
  //  cuál de las que hay se le parece.
  //
  //  Ahora se escribe «lety» y van saliendo. El correo va debajo de cada
  //  una porque dos personas pueden llamarse igual y es lo único que de
  //  verdad las distingue.
  //
  //  La lista sale de `plan_buscar`, que filtra por `puede_ver`: un
  //  entrenador solo encuentra a los suyos. Si buscara entre todos, con
  //  escribir una letra leería los nombres y correos de los clientes de
  //  otros.
  var inscribirSheet = document.getElementById('inscribirSheet');
  var inscribirBuscar = document.getElementById('inscribirBuscar');
  var relojInscribir = null;

  function cerrarInscribir(){
    inscribirSheet.classList.remove('open');
    inscribirBuscar.value = '';
    document.getElementById('inscribirLista').innerHTML = '';
  }

  function pintarBusqueda(gente, texto){
    var c = document.getElementById('inscribirLista');
    if(!texto || texto.length < 2){ c.innerHTML = ''; return; }
    if(!gente.length){
      c.innerHTML = '<p class="calc-note" style="padding:4px 2px 8px;">' +
        'Nadie que lleves se llama «' + escapar(texto) + '». Solo puedes ' +
        'inscribir a las personas que ya son clientes tuyas.</p>';
      return;
    }
    c.innerHTML = gente.map(function(u, i){
      return '<div class="plan-cliente" data-inscribir="' + i + '">' +
        '<div class="cliente-ava">' + iniciales(u.nombre) + '</div>' +
        '<div class="info"><b>' + escapar(u.nombre || '(sin nombre)') + '</b>' +
        '<span class="cli-correo">' + escapar(u.correo || '') + '</span>' +
        // Sin esto, tocar a quien ya está dentro no hace nada visible —el
        // alta es «si ya está, no hagas nada»— y parece que la app se colgó.
        '<span>' + (u.ya_inscrito ? 'ya está en tu Plan' : 'tocar para inscribir') + '</span></div>' +
        '<span style="color:var(--ink-faint)">›</span></div>';
    }).join('');
  }

  var ULTIMA_BUSQUEDA = [];

  function buscarParaInscribir(){
    var texto = inscribirBuscar.value.trim();
    if(texto.length < 2){ ULTIMA_BUSQUEDA = []; pintarBusqueda([], texto); return; }
    sbRpc('plan_buscar', { p_texto: texto, p_limite: 20 })
      .then(function(r){
        // Si mientras llegaba se escribió otra cosa, esta respuesta ya no
        // vale: pintarla enseñaría resultados de lo anterior.
        if(inscribirBuscar.value.trim() !== texto) return;
        ULTIMA_BUSQUEDA = r || [];
        pintarBusqueda(ULTIMA_BUSQUEDA, texto);
      })
      ['catch'](function(e){
        if(inscribirBuscar.value.trim() !== texto) return;
        document.getElementById('inscribirLista').innerHTML =
          '<p class="calc-note" style="padding:4px 2px 8px;">No pude buscar: ' +
          escapar(traducirError(e.message)) + '</p>';
      });
  }

  document.getElementById('planInscribir').addEventListener('click', function(){
    inscribirSheet.classList.add('open');
    document.getElementById('inscribirLista').innerHTML = '';
    inscribirBuscar.value = '';
    setTimeout(function(){ inscribirBuscar.focus(); }, 80);
  });
  document.getElementById('inscribirCerrar').addEventListener('click', cerrarInscribir);
  inscribirSheet.addEventListener('click', function(e){
    if(e.target === inscribirSheet) cerrarInscribir();
  });
  inscribirBuscar.addEventListener('input', function(){
    clearTimeout(relojInscribir);
    // Con retardo: una consulta por tecla satura por nada.
    relojInscribir = setTimeout(buscarParaInscribir, 300);
  });

  document.getElementById('inscribirLista').addEventListener('click', function(e){
    var f = e.target.closest('[data-inscribir]');
    if(!f) return;
    var u = ULTIMA_BUSQUEDA[Number(f.dataset.inscribir)];
    if(!u) return;
    if(u.ya_inscrito){ toast('toastPlan', u.nombre + ' ya está en tu Plan'); cerrarInscribir(); return; }

    f.style.opacity = '.5';
    // Por id y no por correo: ya se eligió a esta persona en concreto, y
    // mandar el correo de vuelta para que el servidor lo busque otra vez
    // sería dar un rodeo.
    sbRpc('plan_inscribir_id', { p_cliente: u.id })
      .then(function(){ cerrarInscribir(); return cargarPlan(); })
      .then(function(){ toast('toastPlan', u.nombre + ' ya aparece en tu lista.'); })
      ['catch'](function(e2){
        f.style.opacity = '';
        toast('toastPlan', traducirError(e2.message));
      });
  });

  // Dar de baja. Va con pulsación larga y no con una equis: la lista se
  // toca para abrir el plan de alguien, y una equis al lado del nombre se
  // pulsa sin querer al ir a entrar.
  function darDeBajaDePlan(c){
    if(!confirm('¿Quitar a ' + c.nombre + ' de Plan?\n\n' +
                'Su plan actual no se borra: deja de aparecer en tu lista.')) return;
    sbRpc('plan_dar_baja', { p_cliente: c.id })
      .then(function(){ return cargarPlan(); })
      .then(function(){ toast('toastPlan', c.nombre + ' ya no está en tu lista.'); })
      ['catch'](function(e){ toast('toastPlan', traducirError(e.message)); });
  }

  function cargarPlan(){
    if(!sesion || !sesion.user) return Promise.resolve();

    // Lo guardado se pinta YA, sin esperar a la red. Con señal, lo del
    // servidor llega un segundo después y lo sustituye; sin ella, esto es lo
    // único que va a haber y es justo lo que se viene a mirar.
    if(cargarMiPlanGuardado()) pintarMiPlan();

    var tareas = [ sbPlanDe(sesion.user.id).then(function(p){ MI_PLAN = p; }) ];

    // Una sola llamada para los dos roles. Antes eran dos caminos —el coach
    // por `mis_clientes`, el super admin por `admin_buscar_usuarios`— y
    // salían TODOS los registrados. Ahora Plan solo enseña a quien se
    // inscribió: no todo el mundo lleva plan de comidas, y la lista crecía
    // con cada alta hasta que encontrar a alguien costaba más que armarle
    // la semana.
    //
    // plan_lista() ya filtra por dentro: el super admin recibe a todos los
    // inscritos y el coach solo a los suyos. Y trae el correo, que un
    // entrenador nunca había podido ver.
    if(ROL === 'coach' || ROL === 'org_admin' || ROL === 'super_admin'){
      tareas.push(
        sbRpc('plan_lista', {}).then(function(us){
          PLAN_CLIENTES = (us || []).map(function(u){
            return { id:u.id, nombre:(u.nombre || '').trim() || '(sin nombre)',
                     correo:u.correo || '', tienePlan: !!u.tiene_plan,
                     // Cuántas de las seis llaves de IA tiene apagadas. Viene
                     // en la misma consulta: preguntarlo por persona serían
                     // diez peticiones para pintar diez renglones.
                     //
                     // El `|| 0` es por si la migración va por detrás del
                     // despliegue: sin la columna, ninguna apagada.
                     iaApagadas: u.ia_apagadas || 0 };
          });
        })['catch'](function(){ PLAN_CLIENTES = []; }));
    } else {
      PLAN_CLIENTES = [];
    }

    return Promise.all(tareas).then(function(){
      // Quién tiene plan ya viene en plan_lista(): antes hacía falta una
      // segunda consulta a `planes` con todos los ids metidos en la URL,
      // que además se rompía sola en cuanto la lista crecía.
      guardarMiPlan();
      pintarMiPlan();
      pintarPlanClientes();
    })['catch'](function(e){
      // AQUÍ NO SE PUEDE SALIR SIN PINTAR. Antes solo se avisaba, y como
      // `planMio` nace vacío la pestaña se quedaba en blanco: ni el plan, ni
      // el «todavía no tienes uno», nada. Sin señal, que es cuando más falta
      // hace mirar qué toca comer.
      //
      // MI_PLAN vale aquí lo que dejó la copia del teléfono -si la había-,
      // porque el `.then` que lo sustituye no llegó a correr.
      var red = sinConexion(e);
      pintarMiPlan(red && !MI_PLAN);
      pintarPlanClientes();
      // Sin plan guardado NO se dice nada: la pantalla ya explica que no hay
      // conexión, y un aviso encima diciendo «este es tu último plan
      // guardado» cuando no hay ninguno es peor que callarse.
      if(red && !MI_PLAN) return;
      toast('toastPlan', red
        ? 'Sin conexión: esto es tu último plan guardado'
        : 'No se pudo cargar: ' + traducirError(e.message));
    });
  }

  document.getElementById('planMio').addEventListener('click', function(e){
    var b = e.target.closest('[data-verdia]');
    if(!b || !MI_PLAN) return;
    MI_PLAN.diaVisto = b.dataset.verdia;
    pintarMiPlan();
  });

  (function(){
    var caja = document.getElementById('planClientes');
    var reloj = null, salioLarga = false;

    function quien(e){
      var f = e.target.closest('[data-plan-cli]');
      return f ? PLAN_CLIENTES[Number(f.dataset.planCli)] : null;
    }
    function empezar(e){
      var c = quien(e); if(!c) return;
      salioLarga = false;
      reloj = setTimeout(function(){ salioLarga = true; darDeBajaDePlan(c); }, 600);
    }
    function soltar(){ if(reloj){ clearTimeout(reloj); reloj = null; } }

    caja.addEventListener('pointerdown', empezar);
    ['pointerup','pointerleave','pointercancel'].forEach(function(ev){
      caja.addEventListener(ev, soltar);
    });
    caja.addEventListener('click', function(e){
      // Si acaba de salir el menú de baja, este clic es el final de la
      // pulsación larga y no una intención de abrir el plan.
      if(salioLarga){ salioLarga = false; return; }

      // La pastilla de IA va PRIMERO y corta aquí: sin esto, tocarla abriría
      // además la ficha por debajo y las dos pantallas se pisarían.
      var pIa = e.target.closest && e.target.closest('[data-plan-ia]');
      if(pIa){
        var ci = PLAN_CLIENTES[+pIa.getAttribute('data-plan-ia')];
        if(ci) abrirLlavesIa(ci);
        return;
      }

      var c = quien(e);
      // A la FICHA, no al editor. El plan se escribe una vez y se consulta
      // veinte: lo que se quiere al tocar un nombre es saber cómo va esa
      // persona. Escribirlo está en el botón de abajo de la ficha.
      if(c) abrirFichaCliente(c);
    });
  })();

  // ================= LAS LLAVES DE LA IA =================
  //
  //  La app no cobra: es para la familia. Cada respuesta la paga Eduardo, y
  //  hasta ahora era todo o nada por persona.
  //
  //  EL ORDEN DE LOS SEIS INTERRUPTORES va de lo que MAS dinero ahorra a lo
  //  que menos. Y ESO NO ES LO MISMO que de lo mas caro a lo mas barato:
  //
  //    * armar la semana entera es lo mas caro de una sentada -veinticuatro
  //      mil tokens y esfuerzo alto, unos siete pesos- pero se pide UNA VEZ
  //      POR SEMANA: unos veintiocho pesos al mes;
  //    * apuntar comida con foto cuesta menos de dos pesos, pero se usa
  //      varias veces al dia todos los dias: ciento cincuenta al mes.
  //
  //  ESTE ORDEN ESTUVO MAL. La semana entera iba primera, diciendo que era
  //  «lo que mas ahorra apagar». Al medirlo con los precios reales salio que
  //  la foto la adelanta a partir de DIECISEIS FOTOS AL MES -media al dia-,
  //  o sea en cualquier uso real. La pantalla estaba aconsejando apagar lo
  //  que menos ahorra.
  //
  //  Los tres primeros son el 91% de la factura; los de abajo se apagan por
  //  gusto, no por dinero. Cada uno lo dice en su linea para que la decision
  //  no dependa de acordarse de esto.
  var LLAVES_DE = null;   // de quien son las que estan en pantalla

  var LLAVES_IA = [
    { k:'foto', t:'Apuntar comida con foto',
      d:'Lo que más ahorra, con diferencia. Cuesta poco cada vez —menos de dos pesos— pero se usa varias veces al día: es dos tercios de la factura.' },
    { k:'plan_semana', t:'Armar la semana entera',
      d:'Lo más caro de una sola vez, unos siete pesos. Pero se pide una vez por semana, así que suma menos que la foto.' },
    { k:'chat', t:'Preguntas y avisos',
      d:'Respuestas cortas, pero se preguntan seguido. Apagarlo deja la cámara: son llaves distintas.' },
    { k:'plan_dia', t:'Armar el plan de un día',
      d:'Una quinta parte de la semana entera. Con esto le sigues armando los días sueltos.' },
    { k:'semanal', t:'Cierre del lunes y comparar fotos',
      d:'Una vez por semana y una vez al mes. Apagarlo casi no mueve la cuenta.' },
    { k:'analisis', t:'Analizar cómo va',
      d:'El resumen que pides tú en su ficha. Se guarda, así que volver a entrar no gasta otro.' }
  ];

  // Los cuatro atajos. Son las cuatro posturas que de verdad se toman; los
  // seis interruptores estan debajo para quien quiera afinar.
  var ATAJOS_IA = {
    todo:  { foto:true,  chat:true,  semanal:true,  plan_dia:true,  plan_semana:true,  analisis:true  },
    // «Lo justo» apagaba SOLO la semana entera: un 12% de ahorro con un
    // nombre que promete mucho mas. Ahora apaga tambien lo de arriba del
    // todo -las preguntas- y deja lo que hace util la app a diario: la foto
    // y los planes. Ahi si hay un tercio de diferencia.
    justo: { foto:true,  chat:false, semanal:false, plan_dia:true,  plan_semana:false, analisis:true  },
    foto:  { foto:true,  chat:false, semanal:false, plan_dia:false, plan_semana:false, analisis:false },
    nada:  { foto:false, chat:false, semanal:false, plan_dia:false, plan_semana:false, analisis:false }
  };
  var TEXTO_ATAJO = {
    todo:  'Todo encendido, como ha funcionado siempre.',
    justo: 'La foto y los planes del día, que es lo que se usa. Sin preguntas, sin cierre del lunes y sin la semana entera.',
    foto:  'Solo apuntar comida con foto, que es lo que hace útil la app a diario. Lo demás, a mano.',
    nada:  'Nada de IA. La app sigue entera: apuntar, peso, fotos y su plan. Solo deja de gastar.',
    medida:'A tu medida.'
  };

  function abrirLlavesIa(c){
    if(!c) return;
    LLAVES_DE = { id:c.id, nombre:c.nombre, llaves:null };
    document.getElementById('kiTitulo').textContent = c.nombre;
    document.getElementById('kiResumen').textContent = 'Cargando…';
    document.getElementById('kiLlaves').innerHTML = '';
    goto('clienteia', true);

    sbRpc('ia_permisos_ver', { p_cliente: c.id })
      .then(function(v){
        if(!LLAVES_DE || LLAVES_DE.id !== c.id) return;
        LLAVES_DE.llaves = v || {};
        pintarLlaves();
      })
      ['catch'](function(e){
        if(!LLAVES_DE || LLAVES_DE.id !== c.id) return;
        // NO se deja «Cargando…» puesto: se queda ahí para siempre y
        // parece que la app se colgó.
        document.getElementById('kiResumen').textContent =
          'No pude traer sus ajustes: ' + traducirError(e.message);
      });
  }

  // Cual de los cuatro atajos describe lo que hay puesto. Ninguno, si se
  // afino a mano: entonces no se enciende ninguno, en vez de mentir con el
  // que mas se parezca.
  function atajoActual(l){
    for(var a in ATAJOS_IA){
      if(!Object.prototype.hasOwnProperty.call(ATAJOS_IA, a)) continue;
      var igual = true;
      for(var i=0;i<LLAVES_IA.length;i++){
        var k = LLAVES_IA[i].k;
        if((l[k] !== false) !== ATAJOS_IA[a][k]){ igual = false; break; }
      }
      if(igual) return a;
    }
    return 'medida';
  }

  function pintarLlaves(){
    if(!LLAVES_DE || !LLAVES_DE.llaves) return;
    var l = LLAVES_DE.llaves;
    var cual = atajoActual(l);

    var atajos = document.getElementById('kiAtajos');
    [].forEach.call(atajos.querySelectorAll('button'), function(b){
      b.classList.toggle('active', b.getAttribute('data-modo-ia') === cual);
    });
    document.getElementById('kiResumen').textContent = TEXTO_ATAJO[cual];

    document.getElementById('kiLlaves').innerHTML = LLAVES_IA.map(function(f){
      var on = l[f.k] !== false;
      return '<div class="flag-row">' +
        '<div class="txt"><b>' + escapar(f.t) + '</b><span>' + escapar(f.d) + '</span></div>' +
        '<button class="switch' + (on ? ' on' : '') + '" data-llave="' + f.k + '" ' +
          'role="switch" aria-checked="' + on + '" ' +
          'aria-label="' + escapar(f.t) + '"><i></i></button>' +
      '</div>';
    }).join('');
  }

  // Guardar. Se pinta ANTES de que conteste el servidor y se deshace si
  // falla: un interruptor que tarda medio segundo en moverse se vuelve a
  // tocar, y el segundo toque lo deja como estaba.
  function guardarLlaves(cambio){
    if(!LLAVES_DE || !LLAVES_DE.llaves) return;
    var antes = {}, l = LLAVES_DE.llaves, k;
    for(k in l) if(Object.prototype.hasOwnProperty.call(l, k)) antes[k] = l[k];
    for(k in cambio) if(Object.prototype.hasOwnProperty.call(cambio, k)) l[k] = cambio[k];
    pintarLlaves();

    var dequien = LLAVES_DE.id;
    sbRpc('ia_permisos_guardar', { p_cliente: dequien, p_llaves: cambio })
      .then(function(v){
        // Manda lo que diga el servidor, no lo que supuso la pantalla.
        if(!LLAVES_DE || LLAVES_DE.id !== dequien || !v) return;
        LLAVES_DE.llaves = v;
        pintarLlaves();
        apuntarApagadasEnLista(dequien, v);
      })
      ['catch'](function(e){
        if(!LLAVES_DE || LLAVES_DE.id !== dequien) return;
        LLAVES_DE.llaves = antes;
        pintarLlaves();
        toast('toastLlaves', 'No se pudo guardar: ' + traducirError(e.message));
      });
  }

  // Que la lista de atras quede al dia sin volver a pedirla entera.
  function apuntarApagadasEnLista(id, l){
    for(var i=0;i<PLAN_CLIENTES.length;i++){
      if(PLAN_CLIENTES[i].id !== id) continue;
      var n = 0;
      LLAVES_IA.forEach(function(f){ if(l[f.k] === false) n++; });
      PLAN_CLIENTES[i].iaApagadas = n;
      pintarPlanClientes();
      return;
    }
  }

  document.getElementById('kiLlaves').addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-llave]');
    if(!b || !LLAVES_DE || !LLAVES_DE.llaves) return;
    var k = b.getAttribute('data-llave'), cambio = {};
    cambio[k] = LLAVES_DE.llaves[k] === false;
    guardarLlaves(cambio);
  });

  document.getElementById('kiAtajos').addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-modo-ia]');
    if(!b || !LLAVES_DE || !LLAVES_DE.llaves) return;
    // Las seis de golpe y en una sola peticion: de una en una, tocar un
    // atajo serian seis viajes y la pantalla se encenderia a trozos.
    guardarLlaves(ATAJOS_IA[b.getAttribute('data-modo-ia')]);
  });

  // ---- Editor ----
  // planComidas guarda TODO el plan (un día o los siete). El editor pinta
  // solo el día activo; sin esto, siete días serían 28 campos a la vez.
  var planComidas = [];
  var planDia = null;          // el día que se está editando

  // El editor es SIEMPRE semanal: al abrir a una persona salen los siete
  // días y se va llenando el que toque. Antes las pestañas solo aparecían si
  // el plan ya traía días, así que un plan nuevo no tenía forma de volverse
  // semanal — el modo dependía de lo que ya hubiera, no de lo que quisieras.
  function pintarEditorComidas(){
    var cont = document.getElementById('peComidas');
    if(!planDia) planDia = DIAS_SEMANA[0];

    var tabs = '<div class="plan-dias">' + DIAS_SEMANA.map(function(d){
      var lleno = planComidas.some(function(c){ return c.dia === d && c.texto; });
      return '<button class="plan-dia' + (d === planDia ? ' active' : '') +
             (lleno ? ' lleno' : '') + '" data-dia="' + d + '">' + d.slice(0,3) + '</button>';
    }).join('') + '</div>';

    // Crecen con el texto. Con `rows=3` fijo, una comida de cuatro renglones
    // se queda con una barra de desplazamiento DENTRO del recuadro: se ve
    // el texto cortado por arriba y por abajo, y hay que hacer scroll en un
    // hueco de tres líneas para leer lo que uno mismo escribió.
    var crecer = function(t){
      t.style.height = 'auto';
      t.style.height = (t.scrollHeight + 2) + 'px';
    };

    cont.innerHTML = tabs + MOMENTOS.map(function(m){
      var c = planComidas.filter(function(x){
        return x.momento === m.k && x.dia === planDia; })[0];
      return '<div class="card">' +
        '<div class="field-label" style="margin-top:0;">' + m.emoji + ' ' + m.k + '</div>' +
        '<textarea class="notas-input" rows="3" maxlength="400" data-momento="' + m.k + '" ' +
        'placeholder="Ej. 2 huevos, pan integral y café">' +
        escapar(c ? c.texto : '') + '</textarea></div>';
    }).join('');

    Array.prototype.forEach.call(cont.querySelectorAll('[data-momento]'), function(t){
      crecer(t);
      t.addEventListener('input', function(){ crecer(t); });
    });
  }

  // Lo escrito se guarda en planComidas al cambiar de día o al guardar: si
  // solo se leyera al final, cambiar de pestaña perdería lo tecleado.
  function volcarDiaActual(){
    Array.from(document.querySelectorAll('#peComidas [data-momento]')).forEach(function(t){
      var txt = t.value.trim();
      var i = planComidas.findIndex(function(x){
        return x.momento === t.dataset.momento && x.dia === planDia; });
      if(txt){
        if(i >= 0) planComidas[i].texto = txt;
        else planComidas.push({ dia: planDia, momento: t.dataset.momento, texto: txt });
      } else if(i >= 0) planComidas.splice(i, 1);
    });
  }

  // Los planes guardados antes de esto no tienen día. Se colocan en lunes en
  // vez de dejarlos invisibles: el editor solo enseña comidas con día, así
  // que sin esto un plan viejo se abriría en blanco y se perdería al guardar.
  function ponerDiaALosViejos(){
    planComidas.forEach(function(c){ if(!c.dia) c.dia = DIAS_SEMANA[0]; });
  }

  document.getElementById('peComidas').addEventListener('click', function(e){
    var b = e.target.closest('[data-dia]');
    if(!b) return;
    volcarDiaActual();
    planDia = b.dataset.dia;
    pintarEditorComidas();
  });

  function abrirEditorPlan(cliente){
    if(!cliente) return;
    document.getElementById('peTitulo').textContent = 'Plan de ' + cliente.nombre;
    // Sus metas arriba, si vienen. Sin ellas el entrenador escribe a ojo y
    // luego el plan no cuadra con lo que la app le está pidiendo comer.
    var caja = document.getElementById('peMetas');
    if(caja) caja.innerHTML = cliente.metas ? tiraDeMetas(cliente.metas) : '';
    planComidas = [];
    planDia = null;
    pintarEditorComidas();
    document.getElementById('peNombre').value = '';
    document.getElementById('peNota').value = '';
    planEditando = { userId: cliente.id, nombre: cliente.nombre, plan: null };
    goto('planedit', true);

    sbPlanDe(cliente.id).then(function(p){
      if(!planEditando || planEditando.userId !== cliente.id) return;
      planEditando.plan = p;
      document.getElementById('peNombre').value = (p && p.nombre) || ('Plan de ' + cliente.nombre);
      document.getElementById('peNota').value = (p && p.nota) || '';
      planComidas = ((p && p.comidas) || []).slice();
      ponerDiaALosViejos();
      pintarEditorComidas();
    })['catch'](function(e){
      // Este es el peor de callar. El editor se queda vacío, parece que esa
      // persona no tiene plan, y lo que se guarde encima BORRA el que sí
      // tenía. Callarlo convierte un fallo de red en pérdida de datos de
      // otro.
      toast('toastPlan', 'No pude cargar su plan: ' + traducirError(e.message) +
            ' No guardes o lo sobrescribes.');
    });
  }

  function leerEditorPlan(){
    volcarDiaActual();
    // Solo lo que tiene texto: un plan de dos comidas no debe enseñar dos
    // tarjetas vacías.
    return planComidas.filter(function(c){ return c.texto && c.texto.trim(); });
  }

  document.getElementById('peGuardar').addEventListener('click', function(){
    if(!planEditando || !sesion) return;
    var comidas = leerEditorPlan();
    if(!comidas.length){ toast('toastPlan', 'Escribe al menos una comida'); return; }

    var cuerpo = {
      user_id: planEditando.userId,
      nombre: document.getElementById('peNombre').value.trim() || 'Mi plan',
      nota: document.getElementById('peNota').value.trim() || null,
      comidas: comidas,
      activo: true,
      creado_por: sesion.user.id
    };
    var p = planEditando.plan
      ? sbFetch('/rest/v1/planes?id=eq.' + planEditando.plan.id, {
          method:'PATCH', headers:{ 'Prefer':'return=minimal' }, body: JSON.stringify(cuerpo) })
      : sbFetch('/rest/v1/planes', {
          method:'POST', headers:{ 'Prefer':'return=minimal' }, body: JSON.stringify(cuerpo) });

    p.then(function(){
      toast('toastPlan', 'Plan guardado');
      back();
      return cargarPlan();
    })['catch'](function(e){
      toast('toastPlan', 'No se pudo guardar: ' + traducirError(e.message));
    });
  });

  // ---- Que el asistente arme el plan ----
  // Necesita las calorías de esa persona; sin ellas el plan no cuadraría
  // con nada. Salen de sus macros, que es lo que la app ya calcula.
  function generarPlan(semana){
    if(!planEditando || !sesion) return;

    // DE QUIÉN ES ESTO, DECIDIDO UNA SOLA VEZ Y AQUÍ.
    //
    //  `planEditando` cambia en cuanto se abre el plan de otra persona, y
    //  armar un plan con IA tarda segundos. Leyéndolo en cada paso, la
    //  petición salía mezclada: los macros de quien se pidió, pero el
    //  nombre y las llaves de IA de quien se acabara de abrir.
    var quien = planEditando.userId;
    var suNombre = planEditando.nombre;

    var btn = document.getElementById(semana ? 'peGenerarSemana' : 'peGenerar');
    var textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = semana ? 'Armando la semana…' : 'Pensando…';

    sbFetch('/rest/v1/profiles?select=goal_protein_g,goal_carbs_g,goal_fat_g' +
            '&id=eq.' + quien + '&limit=1')
      .then(function(ps){
        var p = (ps || [])[0];
        if(!p || !p.goal_protein_g){
          throw new Error('Esa persona todavía no tiene sus macros calculados.');
        }
        var cal = Math.round(p.goal_protein_g*4 + p.goal_carbs_g*4 + p.goal_fat_g*9);
        return iaLlamar({
          accion: 'plan',
          semana: semana,
          // DE QUIEN es el plan. Sin esto, el servidor miraria las llaves de
          // IA del entrenador -que es quien pide- en vez de las de la
          // persona a la que se le esta escribiendo, y apagarle la semana a
          // alguien no serviria de nada.
          cliente: quien,
          nombre: suNombre,
          calorias: cal,
          proteina: p.goal_protein_g,
          // Los tres, no solo la proteína: sin carbos ni grasas el modelo
          // los reparte a su gusto y dos planes de las mismas calorías
          // pueden salir con el doble de grasa uno que otro.
          carbos: p.goal_carbs_g,
          grasas: p.goal_fat_g,
          gustos: document.getElementById('peNota').value.trim()
        });
      })
      .then(function(r){
        // Y AL LLEGAR, ¿SIGUE SIENDO SU EDITOR? Si entre tanto se abrio el
        // plan de otra persona, escribir aqui volcaria el plan de una en la
        // ficha de la otra — y `peGuardar` guarda con el `planEditando` DE
        // AHORA, asi que se guardaria de verdad, diciendo «Plan guardado».
        //
        // Es la misma guarda que ya hace `abrirEditorPlan()` al volver de
        // pedir el plan guardado; aqui faltaba.
        if(!planEditando || planEditando.userId !== quien) return;

        // Se vuelca en los campos, no se guarda: quien firma el plan es
        // el entrenador, y tiene que poder corregirlo antes.
        if(r.nombre) document.getElementById('peNombre').value = r.nombre;
        if(r.nota)   document.getElementById('peNota').value = r.nota;
        planComidas = (r.comidas || []).slice();
        ponerDiaALosViejos();
        pintarEditorComidas();
        toast('toastPlan', semana
          ? 'Semana lista — revísala día por día y guarda'
          : 'Listo — revísalo y guarda');
      })
      ['catch'](function(e){
        toast('toastPlan', traducirError(e.message));
      })
      .then(function(){
        btn.disabled = false;
        btn.textContent = textoOriginal;
      });
  }

  document.getElementById('peGenerar').addEventListener('click', function(){ generarPlan(false); });
  document.getElementById('peGenerarSemana').addEventListener('click', function(){ generarPlan(true); });

  document.getElementById('peQuitar').addEventListener('click', function(){
    if(!planEditando || !planEditando.plan){ back(); return; }
    // No se borra de verdad: la 0007 lo archiva y se puede recuperar
    sbFetch('/rest/v1/planes?id=eq.' + planEditando.plan.id, { method:'DELETE' })
      .then(function(){
        toast('toastPlan', 'Plan quitado');
        back();
        return cargarPlan();
      })['catch'](function(e){
        toast('toastPlan', 'No se pudo quitar: ' + traducirError(e.message));
      });
  });

  // ================= CÓMO VA CADA PERSONA =================
  //
  //  Al tocar un nombre en la lista de Plan se abre esto, y el editor queda
  //  detrás del botón de abajo. Antes el nombre llevaba directo a escribir
  //  el plan, que es lo que menos veces se hace: se escribe una vez y se
  //  consulta veinte.
  //
  //  El orden de la pantalla tampoco es casual: arriba el resumen de la IA,
  //  que es lo que se lee de un vistazo, y debajo los números en crudo, que
  //  son los que lo sostienen. Un resumen que no se puede comprobar contra
  //  las cifras es una opinión.

  var fichaDe = null;      // { id, nombre } de quien se está mirando
  var METRICAS = null;

  function sbMetricas(id){ return sbRpc('plan_metricas', { p_cliente: id }); }

  function sbAnalisisDe(id){
    return sbFetch('/rest/v1/analisis_cliente?select=mensaje,creado_en' +
                   '&cliente_id=eq.' + id + '&limit=1')
      .then(function(r){ return (r || [])[0] || null; });
  }

  // ---- Pintar los números ----
  //
  //  Un número solo no dice nada: 2.180 calorías es mucho o poco según la
  //  meta, y «3 días» depende de cuántos. Por eso casi todo va con su
  //  comparación pegada al valor.
  //
  //  PEGADA, y no en una nota debajo de cada línea: así estaba la primera
  //  versión y la tarjeta se convertía en un muro de texto donde no se veía
  //  ninguna cifra. Ahora la aclaración va una sola vez, al pie.
  function filaFicha(etiqueta, valor, meta){
    var vacio = (valor == null || valor === '');
    return '<div class="fc-fila"><span class="et">' + escapar(etiqueta) + '</span>' +
      '<span class="va' + (vacio ? ' vacio' : '') + '">' +
      escapar(vacio ? '—' : String(valor)) +
      (meta ? ' <small>' + escapar(meta) + '</small>' : '') +
      '</span></div>';
  }

  function tarjetaFicha(titulo, filas, pie){
    return '<div class="card"><div class="field-label" style="margin-top:0;">' +
           escapar(titulo) + '</div>' + filas.join('') +
           (pie ? '<div class="fc-pie">' + escapar(pie) + '</div>' : '') +
           '</div>';
  }

  // Un cambio de peso con su signo. El `+` explícito porque sin él «0.4» y
  // «-0.4» se distinguen solo por un guion pequeño en una lista de cifras.
  function delta(ahora, antes, unidad){
    if(ahora == null || antes == null) return null;
    var d = Math.round((Number(ahora) - Number(antes)) * 10) / 10;
    if(d === 0) return 'igual';
    return (d > 0 ? '+' : '') + d + ' ' + unidad;
  }

  // Una fecha corta, o «nunca». Las fechas de la base vienen como
  // 'AAAA-MM-DD' y hay que anclarlas a mediodía: a medianoche, según la
  // zona, se van al día anterior.
  function diaCorto(iso){
    return iso ? fmtFecha(new Date(iso + 'T12:00:00')) : 'nunca';
  }

  // Una tarjeta que no tiene nada que enseñar se dice en UNA línea.
  //
  //  Esto es la mitad del diseño. La primera versión pintaba las cuatro
  //  tarjetas siempre, y para alguien que acaba de entrar eran VEINTE filas
  //  con un guion cada una: parecía que la app estaba rota o que los datos
  //  no habían cargado. Un «—» tan grande como una cifra de verdad hace que
  //  el vacío pese más que la información.
  function tarjetaVacia(titulo, frase){
    return '<div class="card"><div class="field-label" style="margin-top:0;">' +
           escapar(titulo) + '</div>' +
           '<div class="fc-pie" style="margin-top:2px;">' + escapar(frase) + '</div></div>';
  }

  function pintarMetricas(){
    var cont = document.getElementById('fcMetricas');
    if(!cont) return;
    var m = METRICAS;
    if(!m){ cont.innerHTML = ''; return; }

    var p = m.peso || {}, d = m.diario || {}, e = m.entreno || {},
        c = m.cardio || {}, f = m.fotos || {}, q = m.chequeo || {};

    var hayDiario  = (d.dias_30 || 0) > 0;
    var hayPeso    = p.ultimo != null || (p.apuntes_30 || 0) > 0;
    var hayEntreno = (e.sesiones_30 || 0) > 0 || (c.min_30 || 0) > 0;
    var haySentir  = (f.semanas_completas_90 || 0) > 0 || q.hambre != null;

    // Nadie ha hecho nada todavía: una frase y ya. Cuatro tarjetas vacías
    // no informan de nada que esta línea no diga mejor.
    if(!hayDiario && !hayPeso && !hayEntreno && !haySentir){
      cont.innerHTML = '<div class="card"><div class="fc-pie" style="margin-top:0;">' +
        'Todavía no hay nada suyo que mirar. En cuanto empiece a apuntar su ' +
        'comida o a pesarse, aparecerá aquí.</div></div>';
      return;
    }

    var html = '';

    // Adherencia primero: es la señal más honesta que hay. Quien deja de
    // apuntar suele haber dejado el plan una semana antes.
    html += hayDiario
      ? tarjetaFicha('Está apuntando', [
          filaFicha('Últimos 7 días',   (d.dias_7  || 0) + ' de 7'),
          filaFicha('Últimos 30 días',  (d.dias_30 || 0) + ' de 30'),
          filaFicha('Último apunte',    diaCorto(d.ultimo)),
          filaFicha('Calorías por día', d.cal_dia_7 != null ? mil(d.cal_dia_7) : null,
                    m.meta_cal ? 'de ' + mil(m.meta_cal) : ''),
          filaFicha('Proteína por día', d.prot_dia_7 != null ? d.prot_dia_7 + ' g' : null,
                    m.meta_p ? 'de ' + m.meta_p + ' g' : '')
        ], 'Las medias son de los días que APUNTÓ, no entre siete.')
      : tarjetaVacia('Está apuntando', 'No ha apuntado comida en los últimos 30 días.');

    html += hayPeso
      ? tarjetaFicha('Peso y cintura', [
          filaFicha('Último peso', p.ultimo != null ? p.ultimo + ' kg' : null,
                    p.ultimo_dia ? diaCorto(p.ultimo_dia) : ''),
          filaFicha('En la semana', delta(p.ultimo, p.hace_7, 'kg')),
          filaFicha('En el mes',    delta(p.ultimo, p.hace_30, 'kg')),
          filaFicha('Se pesó',      (p.apuntes_30 || 0) + ' de 30 días'),
          filaFicha('Última cintura', m.cintura && m.cintura.cm != null ? m.cintura.cm + ' cm' : null,
                    m.cintura && m.cintura.dia ? diaCorto(m.cintura.dia) : '')
        ])
      : tarjetaVacia('Peso y cintura', 'No se ha pesado en los últimos 30 días.');

    html += hayEntreno
      ? tarjetaFicha('Entrenamiento', [
          filaFicha('Fuerza esta semana', (e.sesiones_7 || 0),
                    m.dias_entreno ? 'de ' + m.dias_entreno : ''),
          filaFicha('Fuerza en el mes',   (e.sesiones_30 || 0)),
          filaFicha('Última sesión',      diaCorto(e.ultima)),
          filaFicha('Cardio esta semana', (c.min_7 || 0) + ' min',
                    m.meta_cardio ? 'de ' + m.meta_cardio : ''),
          filaFicha('Cardio en el mes',   (c.min_30 || 0) + ' min')
        ])
      : tarjetaVacia('Entrenamiento', 'Sin entrenamientos ni cardio en el mes.');

    // ---- Lo que la app le cambió, y por qué ----
    //
    //  Cada lunes el cierre de semana le puede mover las calorías. Eso lleva
    //  funcionando desde hace tiempo y el motivo SIEMPRE se guardó... pero
    //  no lo leía nadie: el entrenador se encontraba a alguien comiendo
    //  distinto sin saber por qué ni desde cuándo.
    //
    //  Solo las semanas en que SÍ se movió algo. Las que no, ya se ven en el
    //  hambre y la energía de arriba; listarlas aquí diciendo «no se cambió
    //  nada» llenaría la tarjeta de filas que no informan.
    //  Y desde que el entrenador puede moverlas a mano, LAS DOS COSAS van en
    //  la misma lista. Separadas, la tarjeta decía «bajó a 1800 el lunes» y
    //  la persona comía 1600 desde el miércoles, sin que nada explicara el
    //  salto: unas calorías tienen UNA historia, no una de la máquina y otra
    //  de las personas que hay que juntar de cabeza.
    var ajustes = (m.chequeos || [])
      .filter(function(x){ return x.ajusto && x.cal_despues; })
      .map(function(x){
        return { cuando: x.semana, antes: x.cal_antes, despues: x.cal_despues,
                 motivo: x.motivo, quien: 'El cierre de la semana' };
      })
      .concat((m.ajustes_mano || []).map(function(x){
        return { cuando: x.cuando, antes: x.cal_antes, despues: x.cal_despues,
                 motivo: x.motivo, quien: x.quien || 'A mano' };
      }))
      // Por fecha, del más nuevo al más viejo. Los del cierre traen el día de
      // la semana ('2026-08-18') y los de mano una hora entera; comparados
      // como texto siguen ordenando bien, porque los dos empiezan por la
      // fecha en el mismo formato.
      .sort(function(a, b){ return String(b.cuando).localeCompare(String(a.cuando)); })
      .slice(0, 8);

    if(ajustes.length){
      html += '<div class="card"><div class="field-label" style="margin-top:0;">' +
        'Ajustes de calorías</div>' +
        ajustes.map(function(a){
          var hay = a.antes != null;
          var sube = hay && Number(a.despues) > Number(a.antes);
          return '<div class="fc-ajuste">' +
            '<div class="fc-fila" style="border:none;padding:0;">' +
              '<span class="et">' + escapar(diaCorto(a.cuando)) + '</span>' +
              '<span class="va">' + (hay ? escapar(mil(a.antes)) + ' ' : '') +
                '<span class="fl">' + (hay ? (sube ? '↑' : '↓') : '') + '</span> ' +
                escapar(mil(a.despues)) + '</span>' +
            '</div>' +
            // QUIÉN lo hizo, siempre. Con las dos fuentes en la misma lista,
            // sin esto no se distingue lo que decidió la máquina de lo que
            // decidiste tú, que es justo lo que hay que poder distinguir.
            '<div class="fc-motivo"><b>' + escapar(a.quien) + '</b>' +
            (a.motivo ? ' · ' + escapar(a.motivo) : '') + '</div>' +
            '</div>';
        }).join('') +
        // La frase del botón va ENTERA en una línea, sin partirla entre dos
        // cadenas: es el nombre de algo que hay en pantalla, y partido no se
        // puede buscar ni aquí ni en una prueba.
        '<div class="fc-pie">El cierre de cada semana las decide con lo que ' +
        'contestó y con sus números. Para moverlas tú, ' +
        '«Ajustar sus calorías» aquí arriba.</div>' +
        '</div>';
    }

    // Esta se OMITE entera si no hay nada, no se colapsa: fotos y chequeo
    // son lo opcional del producto, y una tarjeta diciendo «no hay» por algo
    // que mucha gente no usa es ruido puro.
    if(haySentir){
      html += tarjetaFicha('Fotos y cómo se siente', [
        filaFicha('Semanas con sus 4 fotos', (f.semanas_completas_90 || 0), 'en 90 días'),
        filaFicha('Última completa', f.ultima_semana || null),
        filaFicha('Hambre',  q.hambre  != null ? q.hambre  + ' de 5' : null),
        filaFicha('Energía', q.energia != null ? q.energia + ' de 5' : null),
        filaFicha('Sueño',   q.sueno   != null ? q.sueno   + ' de 5' : null)
      ], q.nota ? 'Escribió: ' + q.nota : '');
    }

    cont.innerHTML = html;
  }

  function pintarAnalisisCliente(a){
    var caja = document.getElementById('fcAnalisisCard');
    if(!caja) return;
    caja.hidden = !a;
    if(!a) return;
    document.getElementById('fcAnalisisTxt').textContent = a.mensaje;
    document.getElementById('fcAnalisisCuando').textContent =
      a.creado_en ? fmtFecha(new Date(a.creado_en)) : '';
  }

  // Las llaves de IA de la persona cuya ficha está abierta. Nulo mientras no
  // llegan Y si la consulta falla, y nulo significa TODO ENCENDIDO: un
  // problema de red no puede esconderle botones al entrenador.
  var LLAVES_SUYAS = null;

  // Esconder lo que esa persona tiene apagado. Es la misma idea que
  // `aplicarLlavesIa` pero del otro lado del mostrador: allí se esconde lo
  // que no me van a contestar a mí, aquí lo que no van a contestar sobre
  // ella. El servidor lo comprueba igual —de esto no se fía nadie—; esto
  // solo evita ofrecer algo que ya se sabe que no va a pasar.
  function aplicarLlavesSuyas(){
    var l = LLAVES_SUYAS || {};
    var poner = function(id, si){
      var e = document.getElementById(id);
      if(e) e.hidden = !si;
    };

    // El botón Y su explicación: dejar el pie «gasta una de tus consultas»
    // sin el botón al que se refiere es peor que no decir nada.
    var analisis = l.analisis !== false;
    poner('fcAnalizar',    analisis);
    poner('fcAnalizarPie', analisis);
    // Y la caja que lo envuelve, que tiene margen propio: escondiendo solo
    // el botón queda un hueco sin nada dentro.
    var cajaA = document.getElementById('fcAnalizar');
    if(cajaA && cajaA.parentNode) cajaA.parentNode.hidden = !analisis;

    // ---- Los dos de armar plan ----
    var dia = l.plan_dia !== false, sem = l.plan_semana !== false;
    poner('peGenerar',       dia);
    poner('peGenerarSemana', sem);
    var cajaP = document.getElementById('peGenerar');
    if(cajaP && cajaP.parentNode){
      cajaP.parentNode.hidden = !dia && !sem;
      // Si queda uno solo, que ocupe la fila entera en vez de la mitad.
      cajaP.parentNode.classList.toggle('sola', dia !== sem);
    }
  }

  function abrirFichaCliente(c){
    if(!c) return;
    fichaDe = { id: c.id, nombre: c.nombre };
    METRICAS = null;
    document.getElementById('fcTitulo').textContent = c.nombre;
    document.getElementById('fcMetricas').innerHTML =
      '<p class="calc-note" style="padding:14px 20px 0;">Cargando sus números…</p>';
    pintarAnalisisCliente(null);
    // A cero mientras llegan las suyas. Sin esto, abrir la ficha de alguien
    // con la IA apagada y luego la de otra persona dejaba los botones
    // escondidos para quien sí los tiene.
    LLAVES_SUYAS = null;
    aplicarLlavesSuyas();
    goto('cliente', true);

    Promise.all([
        sbMetricas(c.id),
        sbAnalisisDe(c.id)['catch'](function(){ return null; }),
        // Sus llaves de IA, para no ofrecerle al entrenador lo que esa
        // persona tiene apagado. A ella ya se le esconden sus botones; sin
        // esto, el entrenador pulsaba «Analizar» y el servidor le contestaba
        // que no. Va en la MISMA tanda: llegando aparte, el botón se pintaría
        // y desaparecería medio segundo después, delante de él.
        sbRpc('ia_permisos_ver', { p_cliente: c.id })['catch'](function(){ return null; })
      ])
      .then(function(r){
        // Si mientras llegaba se abrió la ficha de otra persona, esto ya no
        // vale: pintarlo mezclaría los números de uno con el nombre de otro.
        if(!fichaDe || fichaDe.id !== c.id) return;
        METRICAS = r[0];
        LLAVES_SUYAS = r[2] || null;
        pintarMetricas();
        pintarAnalisisCliente(r[1]);
        aplicarLlavesSuyas();
      })
      ['catch'](function(e){
        if(!fichaDe || fichaDe.id !== c.id) return;
        // NO se deja «Cargando…» puesto: se queda ahí para siempre y parece
        // que la app se colgó.
        document.getElementById('fcMetricas').innerHTML =
          '<p class="calc-note" style="padding:14px 20px 0;">No pude traer sus números: ' +
          escapar(traducirError(e.message)) + '</p>';
        toast('toastCliente', 'No pude traer sus números');
      });
  }

  // ================= MOVERLE LAS CALORIAS =================
  //
  //  Sus calorias son tres columnas de su perfil -proteina, carbos, grasas-
  //  y hasta ahora las movian dos: ella misma, recalculando sus macros, y la
  //  IA cada lunes. Su entrenador no: la politica de `profiles` le deja VER
  //  el perfil de sus clientes, no escribirlo.
  //
  //  Ahora las mueve con `ajustar_calorias`, que solo deja tocar esos tres
  //  numeros y deja escrito quien fue y por que.
  //
  //  LA PROTEINA NO SE MUEVE. Se calcula por el peso de la persona, no por
  //  lo que come; bajarla mientras se recorta es como se pierde musculo en
  //  vez de grasa. La diferencia sale de carbohidratos y grasas, con un
  //  suelo para la grasa que pone el servidor.
  var CAL_DE = null;   // { id, nombre, p, c, g, cal }

  // El mismo reparto que hace el servidor, para poder ensenar el resultado
  // ANTES de guardar. Es una copia, si: la alternativa es pedirle al
  // servidor una simulacion en cada toque del boton, y entonces el numero
  // llegaria medio segundo tarde en un mando que se pulsa seguido.
  //
  // Si los dos se separan, la pantalla promete algo que no pasa. Por eso la
  // prueba compara los dos repartos con numeros de verdad.
  //
  // P, C y G en MAYUSCULAS porque es lo que lee `tiraDeMetas`, que es quien
  // los pinta: con minusculas devuelve cadena vacia sin quejarse y la
  // pantalla sale en blanco.
  function repartir(base, cal){
    var P = base.P;
    if(P * 4 > cal * 0.40) P = Math.floor(cal * 0.40 / 4);
    var resto = cal - P * 4;
    var noProt = base.C * 4 + base.G * 9;
    var rat = noProt > 0 ? (base.G * 9) / noProt : 0.35;
    var gcal = resto * rat;
    if(gcal < cal * 0.20) gcal = cal * 0.20;
    if(gcal > cal * 0.45) gcal = cal * 0.45;
    if(gcal > resto)      gcal = resto;
    var G = Math.round(gcal / 9);
    if(G > 400) G = 400;

    var C = Math.round((resto - G * 9) / 4);
    if(C < 0) C = 0;

    // Los topes de las columnas del perfil: 600 de proteina, 900 de carbos,
    // 400 de grasa. Con 6000 calorias y poca grasa el reparto pide 1071 g de
    // carbos y el servidor lo rechaza; sin esto, la pantalla ensenaria unos
    // numeros que no se pueden guardar.
    if(C > 900){
      G = Math.min(400, G + Math.floor((C - 900) * 4 / 9));
      C = 900;
    }
    return { P:P, C:C, G:G, cal: Math.round(P * 4 + C * 4 + G * 9) };
  }

  function abrirCalorias(){
    if(!fichaDe) return;
    if(!METRICAS || !METRICAS.meta_p){
      toast('toastCliente', 'Esa persona todavía no tiene sus macros calculados');
      return;
    }
    var base = { P: Number(METRICAS.meta_p), C: Number(METRICAS.meta_c),
                 G: Number(METRICAS.meta_g) };
    base.cal = Math.round(base.P * 4 + base.C * 4 + base.G * 9);
    CAL_DE = { id: fichaDe.id, nombre: fichaDe.nombre,
               P:base.P, C:base.C, G:base.G, cal: base.cal };

    document.getElementById('acTitulo').textContent = fichaDe.nombre;
    document.getElementById('acCal').value = base.cal;
    document.getElementById('acMotivo').value = '';
    document.getElementById('acAhora').innerHTML = tiraDeMetas(base);
    pintarCaloriasNuevas();
    pintarHistoriaCalorias();
    goto('calorias', true);
  }

  function pintarCaloriasNuevas(){
    if(!CAL_DE) return;
    var campo = document.getElementById('acCal');
    var cal = Math.round(Number(campo.value) || 0);
    var caja = document.getElementById('acDespues');
    var btn = document.getElementById('acGuardar');

    // Los mismos limites que el servidor, dichos antes de pulsar. Dejar
    // guardar para que conteste que no es hacer esperar para nada.
    if(cal < 800 || cal > 6000){
      caja.innerHTML = '<p class="calc-note" style="padding:0 20px;">' +
        'Entre 800 y 6000 calorías.</p>';
      btn.disabled = true;
      return;
    }
    var r = repartir(CAL_DE, cal);
    btn.disabled = (r.cal === CAL_DE.cal);
    caja.innerHTML = tiraDeMetas(r) +
      '<p class="calc-note" style="padding:6px 20px 0;">' +
      (r.cal === CAL_DE.cal
        ? 'Es lo que ya come.'
        : (r.cal > CAL_DE.cal ? 'Sube ' : 'Baja ') +
          mil(Math.abs(r.cal - CAL_DE.cal)) + ' calorías' +
          (r.P !== CAL_DE.P
            ? '. Y la proteína baja a ' + r.P + ' g porque con esas calorías no cabía.'
            : '. La proteína se queda en ' + r.P + ' g.')) +
      '</p>';
  }

  function pintarHistoriaCalorias(){
    var caja = document.getElementById('acHistoria');
    var lista = (METRICAS && METRICAS.ajustes_mano) || [];
    if(!lista.length){
      caja.innerHTML = '<p class="calc-note" style="padding:0 20px;">' +
        'Todavía nadie se las ha movido a mano.</p>';
      return;
    }
    caja.innerHTML = lista.map(function(a){
      var hay = a.cal_antes != null;
      var sube = hay && Number(a.cal_despues) > Number(a.cal_antes);
      return '<div class="cal-hist">' +
        // De cuánto a cuánto. Sin el «de cuánto» no se sabe si 1800 fue
        // subir o bajar, que es lo único que se quiere ver de un vistazo.
        '<div class="va">' + (hay ? escapar(mil(a.cal_antes)) + ' ' : '') +
        '<i class="' + (sube ? 'sube' : 'baja') + '">' + (hay ? (sube ? '↑' : '↓') : '') + '</i> ' +
        '<b>' + escapar(mil(a.cal_despues)) + '</b></div>' +
        '<div class="txt"><b>' + escapar(a.quien || 'alguien') + '</b>' +
        '<span>' + escapar(diaCorto(a.cuando)) +
        (a.motivo ? ' · ' + escapar(a.motivo) : '') + '</span></div>' +
      '</div>';
    }).join('');
  }

  document.getElementById('fcCalorias').addEventListener('click', abrirCalorias);
  document.getElementById('acCal').addEventListener('input', pintarCaloriasNuevas);
  document.getElementById('acMenos').addEventListener('click', function(){ mover(-100); });
  document.getElementById('acMas').addEventListener('click', function(){ mover(100); });

  function mover(n){
    var campo = document.getElementById('acCal');
    var v = Math.round(Number(campo.value) || 0) + n;
    campo.value = Math.max(800, Math.min(6000, v));
    pintarCaloriasNuevas();
  }

  document.getElementById('acGuardar').addEventListener('click', function(){
    if(!CAL_DE) return;
    var cal = Math.round(Number(document.getElementById('acCal').value) || 0);
    if(cal < 800 || cal > 6000){ toast('toastCal', 'Entre 800 y 6000 calorías'); return; }

    var btn = this, antes = btn.textContent;
    btn.disabled = true; btn.textContent = 'Guardando…';
    var quien = CAL_DE.id;

    sbRpc('ajustar_calorias', {
      p_cliente: quien, p_calorias: cal,
      p_motivo: document.getElementById('acMotivo').value.trim() || null
    })
      .then(function(r){
        btn.textContent = antes;
        // Manda lo que devuelve el servidor: el redondeo de los gramos mueve
        // las calorias unas pocas, y ensenar las pedidas seria mentir.
        if(!r) throw new Error('No devolvió nada.');
        // Sus numeros cambiaron, asi que la ficha de atras ya no vale. Se
        // vuelven a pedir enteros en vez de parchear METRICAS a mano: hay
        // media pantalla que depende de las metas.
        // Primero salir y DESPUÉS avisar. Al revés, el aviso sale en una
        // pantalla que se está cerrando y no se llega a leer; así cae en la
        // ficha, que es donde se ve el cambio.
        back();
        toast('toastCliente', 'Ahora come ' + mil(r.cal) + ' calorías');
        return sbMetricas(quien).then(function(m){
          if(!fichaDe || fichaDe.id !== quien) return;
          METRICAS = m;
          pintarMetricas();
        });
      })
      ['catch'](function(e){
        btn.disabled = false; btn.textContent = antes;
        toast('toastCal', 'No se pudo: ' + traducirError(e.message));
      });
  });

  document.getElementById('fcEditarPlan').addEventListener('click', function(){
    if(!fichaDe) return;
    // Las metas viajan con la persona: el editor las enseña arriba para que
    // se vea contra qué se está escribiendo el plan. Ya están en METRICAS,
    // así que no hace falta volver a pedirlas.
    abrirEditorPlan({
      id: fichaDe.id, nombre: fichaDe.nombre,
      metas: METRICAS && METRICAS.meta_p
        ? { P: METRICAS.meta_p, C: METRICAS.meta_c, G: METRICAS.meta_g }
        : null
    });
  });

  // ---- Que la IA lo resuma ----
  document.getElementById('fcAnalizar').addEventListener('click', function(){
    if(!fichaDe || !sesion) return;
    if(!METRICAS){ toast('toastCliente', 'Espera a que lleguen sus números'); return; }
    var btn = this, antes = btn.textContent;
    btn.disabled = true; btn.textContent = 'Pensando…';

    // El id va aparte de los numeros: el servidor comprueba con el que
    // quien pide el analisis puede ver a esa persona. Fiarse solo de los
    // numeros del cuerpo dejaria pedir un "analisis" de cualquiera.
    iaLlamar({ accion: 'cliente', cliente: fichaDe.id,
               nombre: fichaDe.nombre, metricas: METRICAS })
      .then(function(r){
        if(!fichaDe) return;
        var msg = (r && r.mensaje) || '';
        if(!msg) throw new Error('No devolvió nada.');
        // Se guarda al momento: la gracia de que cueste una consulta es no
        // volver a pagarla al reabrir la ficha.
        var cuerpo = {
          cliente_id: fichaDe.id, pedido_por: sesion.user.id,
          mensaje: msg, datos: METRICAS
        };
        pintarAnalisisCliente({ mensaje: msg, creado_en: new Date().toISOString() });
        return sbFetch('/rest/v1/analisis_cliente?on_conflict=cliente_id', {
          method:'POST',
          headers:{ 'Prefer':'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(cuerpo)
        })['catch'](function(){
          // El texto ya está en pantalla; que no se haya guardado solo
          // significa que la próxima vez costará otra consulta.
          toast('toastCliente', 'No pude guardarlo: al volver a entrar costará otra consulta');
        });
      })
      ['catch'](function(e){ toast('toastCliente', traducirError(e.message)); })
      .then(function(){ btn.disabled = false; btn.textContent = antes; });
  });

  // ---- Los paneles, con datos reales ----
  // Se cargan al ABRIR el panel, no al arrancar la app: son consultas caras
  // y la inmensa mayoría de la gente es cliente y nunca las va a ver.
  function sbRpc(nombre, args){
    return sbFetch('/rest/v1/rpc/' + nombre, { method:'POST', body: JSON.stringify(args || {}) });
  }

  function cargarPanelAdmin(){
    if(!sesion || !sesion.user) return Promise.resolve();
    // Cada parte va por su cuenta. Con Promise.all, que una sola fallara
    // -por ejemplo feature_flags- tumbaba también la lista de usuarios y el
    // panel salía vacío con un "no se pudo cargar" que no decía cuál.
    // Ahora se pinta lo que sí llegó y se avisa solo de lo que faltó.
    var fallos = [];
    function aparte(nombre, promesa, siFalla){
      return promesa['catch'](function(e){
        fallos.push(nombre + ' (' + traducirError(e.message) + ')');
        return siFalla;
      });
    }
    return Promise.all([
      aparte('las estadísticas', sbRpc('admin_estadisticas'), {}),
      aparte('el uso de la IA', sbRpc('admin_uso_ia_hoy'), []),
      aparte('los usuarios', sbRpc('admin_buscar_usuarios', { p_texto: '', p_limite: 200 }), []),
      aparte('los ajustes',
        sbFetch('/rest/v1/feature_flags?select=clave,activo,titulo,descripcion,grupo&order=grupo.asc,clave.asc'), [])
    ]).then(function(r){
      var s = r[0] || {}, uso = (r[1] || [])[0] || null, us = r[2] || [], fl = r[3] || [];
      USO_IA = uso;

      // Las claves que devuelve admin_estadisticas() son las mismas que ya
      // usaba el tablero, así que basta con volcarlas encima.
      Object.keys(s).forEach(function(k){ STATS[k] = s[k]; });

      USUARIOS.length = 0;
      us.forEach(function(u){
        USUARIOS.push({
          id: u.id,
          n: (u.nombre || '').trim() || '(sin nombre)',
          c: u.correo,
          r: u.rol,
          on: u.activo,
          ia: u.ia_habilitada !== false,
          nivel: u.nivel_ia || (u.ia_habilitada === false ? 'apagada' : 'normal'),
          estado: u.estado || 'activo',
          extra: (u.coach ? 'Coach: ' + u.coach : 'Sin coach') +
                 ' · ' + (u.ultima_actividad ? 'activo ' + u.ultima_actividad : 'sin actividad')
        });
      });

      FLAGS.length = 0;
      fl.forEach(function(f){
        FLAGS.push({ k:f.clave, on:f.activo, t:f.titulo,
                     d:f.descripcion || '', g:f.grupo || 'general' });
      });

      pintarAdmin();
      if(fallos.length) toast('toastAdmin', 'No se pudo cargar ' + fallos.join(' ni '));
    })['catch'](function(e){
      toast('toastAdmin', 'No se pudo cargar: ' + traducirError(e.message));
    });
  }

  // ---- Ficha de un usuario ----
  // Como super admin, el RLS ya te deja ver los datos de cualquiera: las
  // políticas incluyen es_super_admin(). Esto solo pone la pantalla.
  // Entre ellos siguen sin verse: un coach solo alcanza a sus asignados y un
  // cliente solo lo suyo, y eso lo decide Postgres, no esta consulta.
  var usrSheet = document.getElementById('usrSheet');
  var usrActual = null;

  function dias(desde){
    if(!desde) return null;
    return Math.round((HOY - new Date(desde + 'T00:00:00')) / 86400000);
  }
  function haceCuanto(fecha){
    var d = dias(fecha);
    if(d === null) return 'nunca';
    if(d <= 0) return 'hoy';
    if(d === 1) return 'ayer';
    return 'hace ' + d + ' días';
  }

  function abrirFichaUsuario(u){
    usrActual = u;
    document.getElementById('usrNombre').textContent = u.n;
    document.getElementById('usrCorreo').textContent = u.c;
    document.getElementById('usrCuerpo').innerHTML = '<p class="cmp-aviso">Cargando…</p>';
    Array.from(document.querySelectorAll('#usrRoles button')).forEach(function(b){
      b.classList.toggle('active', b.dataset.rol === u.r);
    });
    pintarNivelIA(u.nivel);
    usrSheet.classList.add('open');

    var q = '&user_id=eq.' + u.id;
    Promise.all([
      sbFetch('/rest/v1/profiles?select=weight_kg,height_cm,age,goal,estado,created_at&id=eq.' + u.id),
      sbFetch('/rest/v1/weight_logs?select=log_date,weight_kg&order=log_date.desc&limit=60' + q),
      sbFetch('/rest/v1/diary_entries?select=entry_date&order=entry_date.desc&limit=1' + q),
      sbFetch('/rest/v1/workout_sessions?select=session_date&order=session_date.desc&limit=1' + q),
      sbFetch('/rest/v1/progress_photos?select=week_key,pose&order=week_key.desc' + q)
    ]).then(function(r){
      if(usrActual !== u) return;                 // se abrió otra ficha mientras tanto
      var p = (r[0] || [])[0] || {};
      var pesos = r[1] || [], comida = (r[2] || [])[0], sesion = (r[3] || [])[0], fotos = r[4] || [];

      var linea = '';
      if(pesos.length){
        var hoy = Number(pesos[0].weight_kg);
        var viejo = Number(pesos[pesos.length - 1].weight_kg);
        var dif = hoy - viejo;
        linea = hoy.toFixed(1) + ' kg · ' + (dif === 0 ? 'sin cambio'
              : (dif > 0 ? '+' : '') + dif.toFixed(1) + ' kg en ' + pesos.length + ' registros');
      } else {
        linea = 'sin registros de peso';
      }

      document.getElementById('usrCuerpo').innerHTML =
        '<div class="calc-box">' +
          fila('Estado',    (p.estado || '—') + (u.on ? '' : ' · cuenta desactivada')) +
          fila('Objetivo',  NOMBRE_OBJ[p.goal] || '—') +
          // Espacios duros dentro de cada dato: si tiene que partirse que
          // parta por los puntos, no dejando "años" solo en la línea de abajo.
          fila('Físico',    (p.weight_kg != null ? Number(p.weight_kg).toFixed(1) + '&nbsp;kg' : '—') + ' · ' +
                            (p.height_cm != null ? Number(p.height_cm).toFixed(0) + '&nbsp;cm' : '—') + ' · ' +
                            (p.age != null ? p.age + '&nbsp;años' : '—')) +
          fila('Peso',      linea) +
          fila('Última comida',  haceCuanto(comida && comida.entry_date)) +
          fila('Último entreno', haceCuanto(sesion && sesion.session_date)) +
          fila('Fotos',     fotos.length ? fotos.length + ' en ' +
                            (new Set(fotos.map(function(f){ return f.week_key; }))).size + ' semanas'
                            : 'ninguna todavía') +
        '</div>';
    })['catch'](function(e){
      document.getElementById('usrCuerpo').innerHTML =
        '<p class="cmp-aviso">No se pudo cargar: ' + traducirError(e.message) + '</p>';
    });
  }
  // Clase propia y no .calc-line: esa está hecha para UN número grande y
  // pone el valor a 22px. Con siete filas de texto se amontonaba todo.
  function fila(k, v){
    return '<div class="dato-row"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  function cerrarFicha(){ usrSheet.classList.remove('open'); usrActual = null; }
  document.getElementById('usrCerrar').addEventListener('click', cerrarFicha);
  usrSheet.addEventListener('click', function(e){ if(e.target === usrSheet) cerrarFicha(); });

  // ---- Los tres niveles de IA ----
  // 'plus' es lo que cuesta tokens de verdad, así que se pinta distinto: no
  // es un ajuste más, es lo que se paga.
  var NOMBRE_NIVEL = { apagada:'sin IA', normal:'IA normal', plus:'IA Plus' };

  function pintarNivelIA(nivel){
    Array.from(document.querySelectorAll('#usrNivelIA button')).forEach(function(b){
      b.classList.toggle('active', b.dataset.nivel === (nivel || 'normal'));
    });
  }

  document.getElementById('usrNivelIA').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b || !usrActual) return;
    var u = usrActual, antes = u.nivel, nuevo = b.dataset.nivel;
    if(nuevo === antes) return;

    // Se pinta ya y se deshace si falla: esperar a la red deja el botón
    // muerto medio segundo y la gente vuelve a picarlo.
    u.nivel = nuevo;
    pintarNivelIA(nuevo);
    pintarAdmin();

    // admin_nivel_ia() vuelve a comprobar el permiso dentro de Postgres, y
    // revienta si el id no existe en vez de decir que sí sin hacer nada.
    sbRpc('admin_nivel_ia', { p_usuario: u.id, p_nivel: nuevo })
      .then(function(){ toast('toastAdmin', u.n + ': ' + NOMBRE_NIVEL[nuevo]); })
      ['catch'](function(err){
        u.nivel = antes;
        pintarNivelIA(antes);
        pintarAdmin();
        toast('toastAdmin', 'No se pudo cambiar: ' + traducirError(err.message));
      });
  });

  // Borrar la cuenta de otro desde el panel. Se pide escribir el nombre y
  // no un "¿seguro?": un botón de confirmar se pulsa igual de rápido que el
  // primero, y esto no tiene deshacer. Escribir el nombre obliga a mirar a
  // quién se está borrando, que es justo el error que se quiere evitar.
  document.getElementById('usrBorrarBtn').addEventListener('click', function(){
    var u = usrActual; if(!u) return;
    var dicho = prompt('Esto borra a ' + u.n + ' y todo lo suyo, para siempre.\n\n' +
                       'Escribe su nombre para confirmarlo:');
    if(dicho === null) return;
    if(dicho.trim().toLowerCase() !== u.n.trim().toLowerCase()){
      toast('toastAdmin', 'El nombre no coincide. No se borró nada.');
      return;
    }
    var btn = this;
    btn.disabled = true; btn.textContent = 'Eliminando…';
    // Por la Edge Function y no por el RPC directo: desde aquí no existe la
    // sesión de esa persona, y sin ella la API de Storage no deja borrar
    // sus fotos. La función tiene la clave de servicio; el permiso lo
    // sigue comprobando Postgres con TU token.
    sbFetch('/functions/v1/borrar-cuenta', {
      method: 'POST', body: JSON.stringify({ usuario: u.id })
    })
      .then(function(r){
        var i = USUARIOS.indexOf(u);
        if(i >= 0) USUARIOS.splice(i, 1);
        cerrarFicha();
        pintarAdmin();

        // UN SOLO AVISO, y por una razón. Antes eran dos seguidos y los dos
        // en el mismo hueco: el de «fue eliminado» le pisaba el texto al de
        // las fotos antes de que el navegador llegara a pintarlo. O sea que
        // el único mensaje que de verdad importaba —quedaron fotos de una
        // persona en un servidor después de que pidiera que no quedara nada
        // suyo— no se veía nunca.
        //
        // Y no hay segunda oportunidad de enterarse: la cuenta ya está
        // borrada, y con ella la lista de rutas de donde salían.
        var sueltos = (r && r.sueltos) || 0;
        toast('toastAdmin', sueltos
          ? u.n + ' fue eliminado, pero ' + sueltos +
            ' de sus fotos no se pudieron quitar del servidor.'
          : u.n + ' fue eliminado.');
      })['catch'](function(err){
        toast('toastAdmin', 'No se pudo eliminar: ' + traducirError(err.message));
      }).then(function(){
        btn.disabled = false; btn.textContent = 'Eliminar esta cuenta';
      });
  });

  document.getElementById('usrRoles').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b || !usrActual) return;
    var u = usrActual, antes = u.r, nuevo = b.dataset.rol;
    if(nuevo === antes) return;

    u.r = nuevo;
    Array.from(this.querySelectorAll('button')).forEach(function(x){
      x.classList.toggle('active', x.dataset.rol === nuevo);
    });
    pintarAdmin();

    // admin_cambiar_rol() vuelve a comprobar el permiso dentro de Postgres y
    // se niega si intentas cambiarte el rol a ti mismo.
    sbRpc('admin_cambiar_rol', { p_usuario: u.id, p_rol: nuevo })
      .then(function(){ toast('toastAdmin', u.n + ' ahora es ' + (NOMBRE_ROL[nuevo] || nuevo)); })
      ['catch'](function(err){
        u.r = antes;
        Array.from(document.querySelectorAll('#usrRoles button')).forEach(function(x){
          x.classList.toggle('active', x.dataset.rol === antes);
        });
        pintarAdmin();
        toast('toastAdmin', 'No se pudo cambiar: ' + traducirError(err.message));
      });
  });

  function cargarPanelCoach(){
    if(!sesion || !sesion.user) return Promise.resolve();
    // La vista mis_clientes ya viene filtrada por la base: un coach solo
    // recibe los suyos. No hay que filtrar nada aquí.
    return sbFetch('/rest/v1/mis_clientes?select=id,full_name,goal,asignado_en&order=asignado_en.desc')
      .then(function(cs){
        CLIENTES_DEL_COACH.length = 0;
        (cs || []).forEach(function(c){
          var sem = c.asignado_en
            ? Math.max(1, Math.round((HOY - new Date(c.asignado_en)) / 604800000)) : 1;
          CLIENTES_DEL_COACH.push({
            id: c.id,
            n: (c.full_name || '').trim() || '(sin nombre)',
            obj: NOMBRE_OBJ[c.goal] || '—',
            sem: sem + ' sem',
            act: '—'
          });
        });
        pintarPanel();
        aplicarRol();          // refresca el contador de la tarjeta del Perfil
      })['catch'](function(e){
        toast('toastAdmin', 'No se pudo cargar: ' + traducirError(e.message));
      });
  }

  // ================= DATOS REALES DEL DIARIO =================
  // No se reescribe nada de la interfaz: se rellenan las MISMAS estructuras
  // que ya usaba el mockup (REGISTRO y COMIDAS) y se llama a las funciones
  // de pintado de siempre. Lo único que cambia es de dónde salen los números.
  function sbPerfil(){
    return sbFetch('/rest/v1/profiles?select=*&id=eq.' + sesion.user.id)
      .then(function(f){
        // Se guarda tal cual además de devolverlo. La tarjeta de «Mis
        // semanas» necesita `cardio_goal_min` y `dias_entreno`, y son cosas
        // que solo viven en el perfil: sin esto habría que volver a pedir el
        // perfil entero cada vez que se abre una semana.
        MI_PERFIL = (f && f[0]) || null;
        return MI_PERFIL;
      });
  }
  // Los eventos que quedan por delante. Sin esto, una boda apuntada hoy
  // dejaba de repartir la semana en cuanto se cerraba la app: EVENTOS
  // arrancaba vacío y nadie lo rellenaba.
  //
  // Solo de hoy en adelante: lo que ya pasó no reparte nada, y traerse el
  // historial entero para descartarlo en el cliente es pagar por nada.
  function sbEventos(){
    return sbFetch('/rest/v1/eventos' +
      '?select=fecha,titulo,calorias,bebidas,prioridad' +
      '&user_id=eq.' + sesion.user.id +
      '&fecha=gte.' + isoDe(HOY) +
      '&cancelado_en=is.null' +
      '&order=fecha.asc')['catch'](function(){
        // Que falle esto no puede dejar sin app a nadie: se pierde el
        // reparto de la semana, no el diario.
        return [];
      });
  }

  function sbDiario(desde){
    return sbFetch('/rest/v1/diary_entries' +
      '?select=id,entry_date,meal,food_name,unit,quantity,protein_g,carbs_g,fat_g' +
      '&user_id=eq.' + sesion.user.id +
      '&entry_date=gte.' + desde + '&order=created_at.asc');
  }
  function sbAgregarAlimento(a, comida){
    // El id y la hora se ponen AQUÍ y no en la base.
    //
    // El id, para que reintentar sea seguro: si esto se encola y se manda
    // dos veces, la segunda choca contra la clave primaria en vez de crear
    // un duplicado. Está explicado largo en `idNuevo`.
    //
    // La hora, porque el diario se lee ordenado por `created_at` y si la
    // pusiera la base al subir, todo lo apuntado sin señal aparecería junto
    // y al final, en el orden en que se sincronizó y no en el que se comió.
    var fila = {
      id: idNuevo(),
      user_id: sesion.user.id,
      entry_date: isoDe(diaDeApunte()),
      meal: comida,
      food_name: a.n,
      // Cuánto se comió, en su unidad. Los macros van ya multiplicados por
      // esta cantidad; guardarla aparte es lo que permite editarla después.
      quantity: a.cant || 1,
      unit: a.u || 'Gramos',
      protein_g: a.P, carbs_g: a.C, fat_g: a.G,
      created_at: new Date().toISOString()
    };
    var op = {
      method:'POST',
      headers:{ 'Prefer':'return=representation' },
      body: JSON.stringify(fila)
    };
    return sbFetch('/rest/v1/diary_entries', op)
      .then(function(f){ return (f && f[0]) || fila; })
      ['catch'](function(e){
        if(!sinConexion(e)) throw e;      // error de verdad: que lo deshaga quien llamó
        encolar({ ruta:'/rest/v1/diary_entries', op: op, fila: fila.id, tipo:'comida' });
        toast('toastComida', 'Sin señal: se subirá cuando vuelva');
        // Se resuelve como si hubiera ido bien —con la fila que se mandó—
        // para que la pantalla NO se deshaga. El apunte está a salvo en el
        // teléfono; que no esté todavía en el servidor lo dice el aviso de
        // pendientes, no el borrado de lo que acabas de escribir.
        return fila;
      });
  }
  function sbQuitarAlimento(id){
    // Si el alta todavía está en la cola, se cancela y no se manda nada. Un
    // DELETE de una fila que el servidor no ha visto nunca no borraría nada
    // y encima dejaría un error en la cola.
    if(desencolar(id)) return Promise.resolve();
    var op = { method:'DELETE' };
    return sbFetch('/rest/v1/diary_entries?id=eq.' + id, op)
      ['catch'](function(e){
        if(!sinConexion(e)) throw e;
        encolar({ ruta:'/rest/v1/diary_entries?id=eq.' + id, op: op, tipo:'comida' });
        return null;
      });
  }
  // Los archivados no vuelven: la política de la 0007 ya los filtra en la
  // base, así que aquí no hay que acordarse de excluirlos.
  function sbAlimentos(){
    return sbFetch('/rest/v1/saved_foods?select=id,name,unit,protein_g,carbs_g,fat_g,veces_usado' +
                   '&user_id=eq.' + sesion.user.id +
                   '&order=veces_usado.desc,name.asc');
  }
  function sbRecetas(){
    return sbFetch('/rest/v1/recipes?select=id,name,servings,calories,is_public' +
                   '&user_id=eq.' + sesion.user.id +
                   '&order=created_at.desc');
  }
  function sbGuardarAlimento(a){
    if(!sesion || !sesion.user) return Promise.resolve(null);
    // Id propio, por lo mismo que en la comida: si esto se encola y se manda
    // dos veces, la segunda choca contra la clave primaria en vez de dejar
    // el alimento repetido en la despensa.
    var fila = {
      id: idNuevo(),
      user_id: sesion.user.id, name: a.n, unit: a.u || 'Gramos',
      base_qty: a.base || baseDeUnidad(a.u || 'Gramos'),
      // LOS DE LA PORCIÓN BASE, no los de lo que se apuntó hoy. Mientras la
      // cantidad era siempre la base los dos números coincidían y esto no se
      // notaba; en cuanto alguien apunta 150 g, la ficha se guardaba con un
      // 50 % de más etiquetado como «por 100 g», y así cada vez que la
      // reutilizara. La otra ruta que guarda un alimento ya lo hacía bien.
      protein_g: a.porBase ? a.porBase.P : a.P,
      carbs_g:   a.porBase ? a.porBase.C : a.C,
      fat_g:     a.porBase ? a.porBase.G : a.G
    };
    var op = {
      method:'POST', headers:{ 'Prefer':'return=representation' },
      body: JSON.stringify(fila)
    };
    return sbFetch('/rest/v1/saved_foods', op)
      .then(function(f){ return (f && f[0]) || fila; })
      ['catch'](function(e){
        if(!sinConexion(e)) throw e;
        // SIN ESTO SALÍAN DOS AVISOS QUE SE CONTRADECÍAN. Al crear un
        // alimento nuevo sin señal, el apunte del diario se encolaba y decía
        // «se subirá cuando vuelva», y un instante después este otro decía
        // «No se pudo guardar el alimento» y lo borraba de la despensa.
        // Las dos cosas eran ciertas por separado y juntas parecían que se
        // había perdido algo. Ahora las dos se encolan y el mensaje es uno.
        encolar({ ruta:'/rest/v1/saved_foods', op: op, fila: fila.id, tipo:'despensa' });
        // Y a la copia del teléfono, o el alimento que acabas de crear sin
        // señal desaparecería de tu despensa al cerrar y abrir la app —
        // `guardarDespensa` solo se llama tras una carga con señal.
        guardarDespensa();
        return fila;
      });
  }
  function sbPesos(desde){
    return sbFetch('/rest/v1/weight_logs?select=log_date,weight_kg,cintura_cm' +
                   '&user_id=eq.' + sesion.user.id +
                   '&log_date=gte.' + desde + '&order=log_date.asc');
  }
  function sbActualizarPerfil(campos){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/profiles?id=eq.' + sesion.user.id, {
      method:'PATCH', headers:{ 'Prefer':'return=minimal' },
      body: JSON.stringify(campos)
    });
  }
  // Un peso por día: si ya hay uno en esa fecha se pisa, no se duplica.
  // Eso lo garantiza el índice único (user_id, log_date) de la 0001.
  function sbGuardarPeso(fecha, kg, cintura){
    if(!sesion || !sesion.user) return Promise.resolve();
    var fila = { user_id: sesion.user.id, log_date: fecha, weight_kg: kg };
    // Solo si la midio. Mandar null la borraria: el upsert pisa la fila
    // entera, y quien apunta el peso a diario no vuelve a medirse la
    // cintura cada dia.
    if(cintura != null) fila.cintura_cm = cintura;
    var ruta = '/rest/v1/weight_logs?on_conflict=user_id,log_date';
    var op = {
      method:'POST',
      headers:{ 'Prefer':'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(fila)
    };
    return sbFetch(ruta, op)
      ['catch'](function(e){
        if(!sinConexion(e)) throw e;   // error de verdad: que lo deshaga quien llamó
        // Aquí no hace falta mandar un id propio como en la comida: la tabla
        // tiene `unique (user_id, log_date)` y esto es un upsert, así que
        // reintentarlo escribe la misma fila otra vez en vez de duplicarla.
        // La idempotencia ya la da el esquema.
        //
        // La `clave` sí importa: uno por día. Pesarse tres veces sin señal
        // tiene que subir el último valor, no tres upserts encadenados.
        encolar({ ruta: ruta, op: op, tipo:'peso', clave:'peso:' + fecha });
        toast('toastPeso', 'Sin señal: se subirá cuando vuelva');
        return null;
      });
  }
  // Las altas de comida que están en la cola sin subir, con la MISMA forma
  // que las filas que devuelve la base. Así se pueden mezclar con ellas y
  // pintarlas con el mismo código.
  //
  // Los borrados de la cola se aplican aquí también: si alguien apuntó algo
  // sin señal y luego lo quitó cuando el alta ya se había mandado, la fila
  // sigue en el servidor y volvería a aparecer al recargar. Se descuenta.
  function filasEnCola(){
    var yo = sesion && sesion.user && sesion.user.id;
    var altas = [], borrados = {};
    COLA.forEach(function(x){
      if(x.dueno && x.dueno !== yo) return;
      if(x.tipo !== 'comida') return;
      if(x.op && x.op.method === 'DELETE'){
        var m = /id=eq\.([^&]+)/.exec(x.ruta || '');
        if(m) borrados[m[1]] = true;
        return;
      }
      try{ altas.push(JSON.parse(x.op.body)); }catch(e){}
    });
    return altas.filter(function(f){ return !borrados[f.id]; });
  }

  // Vuelca filas de diario en REGISTRO y COMIDAS.
  //
  // Estaba metido dentro de cargarDatos(). Se sacó para que lo pendiente de
  // la cola pase por el mismo sitio, y sobre todo para poder pintarlo
  // TAMBIÉN cuando la carga falla: sin señal no llega nada del servidor, y
  // si esto no se llamara, lo que la persona apuntó sin conexión
  // desaparecería de la pantalla en cuanto cerrara y abriera la app. Que es
  // exactamente el fallo que se venía a arreglar.
  function llenarDiario(filas){
    // Se vacía antes de llenar; si no, se sumaría encima.
    REGISTRO = {};
    COMIDAS.Desayuno = []; COMIDAS.Comida = []; COMIDAS.Cena = [];
    var hoy = isoDe(HOY);

    // Por hora, no por el orden en que llegaron: lo de la cola se apuntó
    // intercalado con lo que ya estaba subido, no después de todo.
    filas.slice().sort(function(a, b){
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    }).forEach(function(f){
      var P = Number(f.protein_g) || 0,
          C = Number(f.carbs_g)   || 0,
          G = Number(f.fat_g)     || 0;

      var r = REGISTRO[f.entry_date] || (REGISTRO[f.entry_date] = {P:0, C:0, G:0});
      r.P += P; r.C += C; r.G += G;

      // La base admite 'Snack', que el Diario todavía no muestra: se
      // suma al día pero no se lista, en vez de reventar.
      if(f.entry_date === hoy && COMIDAS[f.meal]){
        var unidad = f.unit || 'Gramos';
        var cantidad = Number(f.quantity) || null;

        // Está explicada en cantidadDeLaFila(), al lado de la base.
        cantidad = cantidadDeLaFila(unidad, cantidad);

        // prepararAlimento() deduce la porción base a partir de la
        // cantidad y los macros consumidos, para poder volver a editarla.
        COMIDAS[f.meal].push(prepararAlimento({
          id:f.id, n:f.food_name, u:unidad,
          cant: cantidad, P:P, C:C, G:G
        }));
      }
    });
  }

  function cargarDatos(){
    if(!sesion || !sesion.user) return Promise.resolve();

    // La despensa guardada, ANTES de pedir nada.
    //
    // Va aquí y no solo en el arranque porque hay más caminos que llegan a
    // cargar datos: entrar por el formulario, registrarse, volver de una
    // sesión caducada. Se probó y fallaba justo ahí: quien entraba con su
    // correo y contraseña sin señal se quedaba sin despensa —el arranque no
    // había pasado por el `if(sesion)`— y al buscar «pollo» no salía su
    // propia pechuga de pollo. Poniéndolo dentro, lo cubren todos.
    //
    // Si hay señal, lo del servidor llega después y lo sustituye.
    cargarDespensa();

    // Va DENTRO de la función a propósito. Como constante suelta arriba
    // valdría `undefined` al arrancar: el bloque de datos está al final del
    // archivo pero cargarDatos() se llama antes, y aunque la función sí se
    // eleva por hoisting, el valor de un `var` no. La fecha salía NaN y la
    // consulta se iba con `entry_date=gte.NaN-NaN-NaN`.
    var DIAS_ATRAS = 60;   // de sobra para la racha y la semana en curso

    // El peso se trae de un año atrás porque la gráfica de
    // peso tiene un rango "el año"; el diario no lo necesita.
    var UN_ANIO = isoDe(haceDias(365));

    return Promise.all([
        sbPerfil(),
        sbDiario(isoDe(haceDias(DIAS_ATRAS))),
        sbPesos(UN_ANIO),
        sbAlimentos(),
        sbRecetas(),
        sbEventos(),
        // Lo que su entrenador le dejó encendido de la IA.
        //
        // Con `catch` a nulo Y EN LA MISMA TANDA, no en una petición aparte
        // que llegue después: si llegara tarde, los botones se pintarían
        // encendidos y se apagarían solos medio segundo después, delante de
        // la persona. Y si falla, nulo significa todo encendido: un
        // problema de red no puede apagarle la IA a nadie.
        sbRpc('ia_permisos_ver', { p_cliente: sesion.user.id })['catch'](function(){ return null; })
      ])
      .then(function(res){
        var p = res[0], filas = res[1] || [], pesos = res[2] || [],
            alimentos = res[3] || [], recetas = res[4] || [], eventos = res[5] || [];
        MIS_LLAVES = res[6] || null;
        aplicarLlavesIa();

        // ---- Eventos ----
        // Antes que nada: el balance del día se calcula con esto, así que
        // tiene que estar puesto cuando se pinte, no después.
        Object.keys(EVENTOS).forEach(function(k){ delete EVENTOS[k]; });
        eventos.forEach(function(e){
          EVENTOS[e.fecha] = {
            titulo: e.titulo,
            calorias: Number(e.calorias) || 0,
            bebidas: Number(e.bebidas) || 0,
            prioridad: e.prioridad || 'ambas'
          };
        });
        // Solo con IA Plus: a quien no la tiene no se le ofrece algo que la
        // app le va a negar después.
        MI_NIVEL_IA = (p && p.nivel_ia) || 'normal';
        pintarPlanIA();
        // Los avisos que dependen de la semana NO van aquí: se lanzaban
        // antes de aplicar `week_start_dow`, así que miraban la semana del
        // lunes por defecto en vez de la de cada quien. Están más abajo,
        // cuando el ancla ya es la buena.

        // ---- Perfil ----
        if(p){
          var nom = (p.full_name || '').trim();
          if(nom){
            document.getElementById('saludoNombre').textContent = nom.split(' ')[0];
            document.getElementById('profNombre').textContent = nom;
          }
          if(sesion.user.email) document.getElementById('profEmail').textContent = sesion.user.email;
          pintarAvatarGuardado(p.avatar_url);

          if(p.goal) reg.objetivo = p.goal;
          if(p.weight_kg != null) document.getElementById('profPeso').textContent   = Number(p.weight_kg).toFixed(1) + ' kg';
          if(p.height_cm != null) document.getElementById('profAltura').textContent = Number(p.height_cm).toFixed(1) + ' cm';
          if(p.age != null)       document.getElementById('profEdad').textContent   = p.age + ' años';
          pintarObjetivoPerfil();

          // Los <span> de arriba son solo para leer. Lo que hace falta para
          // volver a calcular vive en los campos del registro, y hasta ahora
          // nadie los rellenaba al iniciar sesión.
          volcarPerfilEnRegistro(p);

          goalP.value = p.goal_protein_g;
          goalC.value = p.goal_carbs_g;
          goalG.value = p.goal_fat_g;
          // Punto de partida traído de la base: cargar el perfil no es un
          // cambio del usuario y no debe abrir el aviso de reinicio.
          metasVigentes = leerMetas();

          // Las semanas de Fotos se cuentan desde aquí: la del registro es la 1
          if(p.created_at) inicioPrograma = lunesDe(new Date(p.created_at));

          // El rol de verdad, el de la base. Es lo que decide si aparece la
          // tarjeta del panel en Perfil y a cuál de los dos lleva. El
          // selector de la barra de estudio solo sirve para ver los diseños.
          if(p.role && NOMBRE_ROL[p.role]){
            ROL = p.role;
            aplicarRol();
          }

          // Su día de inicio de semana, si tiene uno puesto.
          //
          // Se vuelve a leer, y no es un paso atrás: lo que se quitó -y no
          // vuelve- es que este valor se REESCRIBIERA SOLO al cambiar los
          // macros. Leerlo no torcía la semana de nadie; escribirlo sin
          // permiso, sí.
          //
          // Solo 0-6 y nada más: un valor raro en la base dejaría el ancla en
          // una fecha inválida y con ella la semana entera, el calendario de
          // apuntar y el chequeo.
          var dow = Number(p.week_start_dow);
          if(p.week_start_dow != null && dow >= 0 && dow <= 6){
            inicioSemana = dow;
            anclaSemana  = ultimoDia(inicioSemana);
          }

          // El permiso para analizar las fotos. Se copia TAL CUAL, sin
          // convertirlo a booleano: `null` significa "todavía no se le ha
          // preguntado" y hay que poder distinguirlo de un "dijo que no".
          // Un `!!p.fotos_ia_ok` los juntaría en `false` y no se le
          // preguntaría nunca. Y si la columna aún no existe -la migración
          // puede ir por detrás- se queda en null y no se manda nada, que
          // es el lado seguro.
          PERMISO_FOTOS = (p.fotos_ia_ok === true || p.fotos_ia_ok === false)
            ? p.fotos_ia_ok : null;
          if(typeof pintarPermisoPerfil === 'function') pintarPermisoPerfil();
        }

        // AHORA, y no antes: los tres preguntan "¿en qué semana estamos?", y
        // eso hay que contestarlo con el perfil ya cargado. Se quedan aquí
        // aunque la semana ya sea fija de lunes a domingo: lo que miran
        // depende también del nivel de IA y de lo que haya en el perfil, que
        // arriba todavía no está.
        if(MI_NIVEL_IA === 'plus'){
          revisarChequeoPendiente();
          revisarAvisoDelCoach();
        }
        // Fuera del `if` de Plus a propósito: las fotos de progreso las sube
        // cualquiera, no son parte de la IA.
        revisarAvisoDeFotos();
        // Con el día de arranque ya cargado: hasta aquí valía el lunes por
        // defecto, y para quien no empieza en lunes eso apunta al cajón que
        // no es.
        semanaFoto = inicioDeMiSemana();
        revisarRecordatorios();

        // ---- Diario ----
        // Lo que está en la cola sin subir entra POR AQUÍ, mezclado con lo
        // que vino del servidor y ordenado por hora. Es a propósito: así lo
        // pendiente pasa por el mismo camino que lo demás —la corrección de
        // las cantidades viejas, los 'Snack' que no se listan, todo— en vez
        // de tener una copia aparte de esta lógica que se iría desviando.
        llenarDiario(filas.concat(filasEnCola()));

        // ---- Peso ----
        // Se sustituye la serie de ejemplo entera, no se mezcla con ella.
        PESOS = {};
        pesos.forEach(function(f){ PESOS[f.log_date] = Number(f.weight_kg); });
        // Las cinturas medidas, para el historial y para saber si toca.
        CINTURAS = pesos.filter(function(f){ return f.cintura_cm != null; })
                        .map(function(f){ return { fecha: f.log_date, cm: Number(f.cintura_cm) }; });
        // Y encima, lo que se pesó sin señal y aún no ha subido. Después del
        // servidor a propósito: si el mismo día está en los dos sitios, vale
        // lo que la persona acaba de teclear.
        aplicarPesosEnCola();
        // A partir de aquí PESOS y CINTURAS ya son los de verdad, no el
        // arranque vacío: los recordatorios de peso y cintura pueden confiar
        // en lo que digan.
        PESO_CINTURA_LISTOS = true;
        pintarCintura();
        // Se declara AQUÍ y no arriba. Antes venía del bloque del diario,
        // que compartía este `hoy`; al sacar ese bloque a `llenarDiario()`
        // la declaración se fue con él y esta línea se quedó apuntando a una
        // variable que ya no existía.
        //
        // Reventaba con «hoy is not defined» a la mitad de la carga: el
        // diario ya estaba puesto —va antes— pero lo de debajo no llegaba a
        // correr NUNCA. Alimentos guardados, frecuentes, recetas, rutina,
        // sesiones y fotos se quedaban vacíos en cada arranque, y como el
        // error se recogía en el catch de abajo, lo único que se veía era un
        // aviso de un segundo y medio.
        var hoy = isoDe(HOY);
        var hoyPeso = PESOS[hoy];
        // El `else` importa tanto como el `if`: sin él, el campo se quedaba
        // con lo que hubiera antes —el 83.8 del maquetado, o el peso de la
        // sesión anterior— y parecía que borrar el historial no había hecho
        // nada. Vaciarlo aquí es lo que hace visible que sí.
        document.getElementById('pesoInput').value = hoyPeso != null ? hoyPeso : '';

        // ---- Alimentos guardados y recetas ----
        // En sitio, no reasignando: conectarLista() guarda una referencia
        // a estos arrays y perdería el hilo si les cambio la identidad.
        MIS_ALIMENTOS.length = 0;
        FRECUENTES.length = 0;
        alimentos.forEach(function(f){
          var a = { id:f.id, n:f.name, u:f.unit || 'Gramos',
                    P:Number(f.protein_g)||0, C:Number(f.carbs_g)||0, G:Number(f.fat_g)||0,
                    veces:Number(f.veces_usado)||0 };
          MIS_ALIMENTOS.push(a);
        });
        // "Frecuentes" no es otra lista: son los mismos, los que ya repetiste
        // lo bastante. El corte lo pone recalcularFrecuentes().
        recalcularFrecuentes();

        RECETAS.length = 0;
        recetas.forEach(function(r){
          var porciones = Math.max(1, Number(r.servings) || 1);
          RECETAS.push({ id:r.id, n:r.name,
                         cal: Math.round((Number(r.calories)||0) / porciones),
                         vis: r.is_public ? 'pública' : 'privada' });
        });
        pintarListas();
        // Copia al teléfono, para poder abrir la app sin señal y seguir
        // teniendo tus alimentos. Se hace AQUÍ, con lo recién llegado del
        // servidor, que es lo único que se sabe correcto.
        guardarDespensa();

        // ---- A pintar, con las funciones de siempre ----
        actualizarMetas();
        actualizarSemana();
        pintarComida();
        pintarRacha();
        pintarPeso();
        if(typeof pintarEjercicio    === 'function') pintarEjercicio();
        // Repintar Fotos: ya se sabe desde cuándo contar las semanas
        if(typeof pintarFotos        === 'function') pintarFotos();

        // Rutina y sesiones. Aparte del Promise.all de arriba porque son
        // tres tablas encadenadas y no deben retrasar al Diario.
        // Si estas dos fallan calladas, la app se ve como si no tuvieras
        // rutina ni entrenamientos: se puede montar la rutina otra vez
        // encima de la que ya existe, y el cierre del domingo decide sin
        // saber lo que entrenaste.
        if(typeof sbCargarRutina === 'function')
          sbCargarRutina()['catch'](function(e){
            toast('toastComida', 'No pude cargar tu rutina: ' + traducirError(e.message));
          });
        if(typeof sbCargarSesiones === 'function')
          sbCargarSesiones()['catch'](function(e){
            toast('toastComida', 'No pude cargar tus entrenamientos: ' + traducirError(e.message));
          });

        // Y traer las fotos del bucket. Va aparte del Promise.all de arriba
        // porque son dos saltos (fichas y luego enlaces firmados) y no debe
        // retrasar al Diario, que es lo que se ve primero.
        if(typeof sbCargarFotos === 'function'){
          sbCargarFotos().then(function(mapa){
            Object.keys(FOTOS).forEach(function(k){ delete FOTOS[k]; });
            Object.keys(mapa).forEach(function(k){ FOTOS[k] = mapa[k]; });
            // Igual que con peso y cintura arriba: hasta que no llega el
            // mapa real del bucket, FOTOS es el {} de arranque y no "esta
            // semana no tiene ninguna".
            FOTOS_LISTAS = true;
            pintarFotos();
            if(typeof llenarSelectores === 'function') llenarSelectores();
            // AQUÍ y no antes: mirar si toca comparar necesita saber cuántas
            // series completas hay, y eso no se sabe hasta tener las fotos.
            if(typeof cargarAnalisis === 'function'){
              cargarAnalisis().then(function(){
                if(typeof revisarAnalisisDeFotos === 'function') revisarAnalisisDeFotos();
              });
            }
          })['catch'](function(e){
            // Callado, la pestaña Fotos se ve vacía y parece que se
            // perdieron. Y quien lo crea vuelve a subirlas, duplicando la
            // semana.
            toast('toastComida', 'No pude cargar tus fotos: ' + traducirError(e.message));
          });
        }
      })
      ['catch'](function(e){
        // SIN SEÑAL NO SE PIERDE LO APUNTADO.
        //
        // Aquí no llegó nada del servidor, así que REGISTRO y COMIDAS se
        // quedan como nacieron: vacíos. Si esto no estuviera, quien apuntó
        // su comida sin conexión y cerró la app la encontraría en blanco al
        // volver a abrirla —y su comida sigue en la cola, a salvo, pero sin
        // verse—. Volvería a apuntarla, y al recuperar la señal subirían
        // las dos.
        //
        // Se pinta solo lo que hay en la cola. No es el diario entero, pero
        // es lo único que existe ahora mismo y es justo lo que la persona
        // acaba de escribir.
        var pendientes = filasEnCola();
        if(pendientes.length){
          llenarDiario(pendientes);
          actualizarMetas();
          actualizarSemana();
          pintarComida();
        }
        // El peso apuntado sin señal, igual. Sin esto se ve el campo vacío,
        // se vuelve a teclear, y al volver la señal el segundo valor pisa al
        // primero sin que nadie se entere -el peso no duplica, sustituye-.
        if(pesosEnCola().length){
          aplicarPesosEnCola();
          pintarPeso();
          pintarCintura();
        }
        pintarPendientes();
        toast('toastComida', sinConexion(e)
          ? 'Sin señal: se ve lo que apuntaste, sin subir todavía'
          : 'No se pudieron cargar tus datos: ' + traducirError(e.message));
      });
  }

  // ---- Tema claro / oscuro ----
  // Se recuerda la elección: quien pone claro se queda en claro aunque su
  // teléfono esté en oscuro, hasta que él mismo lo cambie.
  var TEMA_KEY = 'macros.tema';

  // Qué tema se está VIENDO ahora mismo. El script del <head> deja siempre
  // puesto data-theme -claro si no hay nada guardado-, así que basta con
  // leerlo; ya no hay que preguntarle al sistema.
  function temaEfectivo(){
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  // La franja de arriba del teléfono (barra de estado) la pinta el navegador
  // según los <meta name="theme-color">, que van por preferencia del
  // SISTEMA. Si alguien elige claro con el teléfono en oscuro, esa franja se
  // quedaría oscura y la app se vería partida en dos. Al elegir tema se les
  // fija el color a mano para que manden ellos y no el sistema.
  function pintarBarraNavegador(t){
    var color = t === 'dark' ? '#1b1c1e' : '#ffffff';
    Array.prototype.forEach.call(
      document.querySelectorAll('meta[name="theme-color"]'),
      function(m){ m.setAttribute('content', color); }
    );
  }

  function toggleTheme(){
    var siguiente = temaEfectivo() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', siguiente);
    pintarBarraNavegador(siguiente);
    try{ localStorage.setItem(TEMA_KEY, siguiente); }catch(e){}
  }

  // La barra del navegador se pone a juego desde el arranque: ahora siempre
  // hay tema puesto, así que no hay caso en el que deba mandar el sistema.
  pintarBarraNavegador(temaEfectivo());

  // ================= ASISTENTE =================
  // Una conversación, no un formulario. La clave de Anthropic vive en una
  // Edge Function, nunca aquí: este archivo se descarga entero en cada
  // teléfono y el repositorio es público.
  var iaChat = document.getElementById('iaChat');
  var iaTexto = document.getElementById('iaTexto');
  // Hasta CUATRO fotos, cada una { base64, tipo, vista } ya reducida.
  //
  // Antes era una sola. Un plato del que hacen falta dos angulos —o una
  // comida de varios platos— obligaba a mandarlas de una en una, y cada
  // envio gasta una consulta del tope diario.
  var IA_FOTOS = [];
  var TOPE_FOTOS_IA = 4;
  var IA_MSGS = [];           // { rol:'yo'|'el', texto, foto?, alimentos? }
  var iaOcupado = false;

  var IA_ATAJOS = [
    { icono:'🛒', texto:'Hazme la lista del súper' },
    { icono:'🍽️', texto:'¿Qué me recomiendas comer hoy?' }
  ];

  // Lo que su entrenador le dejó encendido. Nace vacío y VACÍO SIGNIFICA
  // TODO ENCENDIDO: si la consulta falla o la migración va por detrás del
  // despliegue, la app funciona como siempre en vez de apagarse sola.
  var MIS_LLAVES = null;
  // El perfil recién traído, tal cual. Lo llena `sbPerfil()` y lo lee la
  // tarjeta de «Mis semanas», que necesita las metas de entreno y de cardio.
  //
  // SE DECLARA AQUÍ ARRIBA, no junto a quien lo usa seis mil líneas más
  // abajo: `var` iza la declaración pero no la asignación, así que un
  // `var MI_PERFIL = null` allí correría DESPUÉS del arranque y borraría lo
  // que `sbPerfil()` acabara de poner. Es la trampa que ya se cobró EVENTOS.
  var MI_PERFIL = null;

  // De qué llave depende cada acción. Es el mismo reparto que hace la Edge
  // Function, y tiene que seguir siéndolo: aquí solo se adelanta la
  // respuesta para no hacer esperar a nadie por un "no".
  var LLAVE_DE_ACCION = {
    apuntar:'foto', chat:'chat', aviso:'chat', semana:'semanal', fotos:'semanal'
  };

  // De qué llave depende una petición concreta.
  //
  // LA FOTO DE COMIDA VIAJA COMO `chat`, no como `apuntar`: la cámara vive
  // dentro del asistente, así que mandar el plato es un chat con imágenes.
  // Sin esta distinción los dos interruptores mentirían —apagar «foto» no
  // pararía la foto, y apagar «preguntas» sí—, y esta cuenta tiene que dar
  // lo mismo que la del servidor.
  function llaveDe(cuerpo){
    var a = String(cuerpo && cuerpo.accion || '');
    if(a === 'chat'){
      var hayFoto = !!cuerpo.imagen ||
        (Array.isArray(cuerpo.imagenes) && cuerpo.imagenes.length > 0);
      return hayFoto ? 'foto' : 'chat';
    }
    return LLAVE_DE_ACCION[a];
  }

  function iaLlamar(cuerpo){
    // CORTAR AQUÍ CUANDO YA SE SABE QUE NO. Sin esto, quien tenga algo
    // apagado pulsa, ve «Pensando…», espera el viaje de ida y vuelta y
    // recibe un no. El servidor lo comprueba igual —de esto no se fía
    // nadie—; esto solo evita la espera.
    //
    // `plan` y `cliente` NO se miran aquí: los pide el entrenador SOBRE
    // otra persona, y las llaves que hay en este teléfono son las suyas,
    // no las de ella. Eso lo decide el servidor, que sí tiene las buenas.
    var llave = llaveDe(cuerpo);
    if(llave && MIS_LLAVES && MIS_LLAVES[llave] === false){
      return Promise.reject(new Error('Tu entrenador desactivó esto en tu cuenta.'));
    }
    return sbFetch('/functions/v1/asistente', {
      method: 'POST', body: JSON.stringify(cuerpo)
    });
  }

  // ---- Dictar en vez de escribir ----
  // "Me comí unos tacos de suadero y una coca" se dice en tres segundos y
  // se teclea en treinta. Los entrenadores mandan audios; esto es lo más
  // parecido que puede hacer una app web.
  //
  // Transcribe el PROPIO TELÉFONO con la API del navegador. No viaja audio
  // a ningún servidor, no cuesta un céntimo y funciona sin conexión al
  // asistente. De las cosas que más caras parecen y menos cuestan.
  var Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  var oyendo = null;

  // Esconder lo que ya no va a contestar.
  //
  //  Un boton que siempre responde «tu entrenador desactivo esto» es peor
  //  que no tenerlo: se pulsa igual, hace esperar y deja la sensacion de que
  //  la app esta rota. Esto no es la seguridad -de eso se encarga el
  //  servidor, que no se fia de este telefono-; es no ofrecer lo que no hay.
  //
  //  El asistente es UNA pantalla con dos cosas dentro: la camara apunta
  //  comida y el texto pregunta. Por eso se apagan por separado y solo
  //  desaparece entero cuando no queda ninguna de las dos.
  function aplicarLlavesIa(){
    var l = MIS_LLAVES || {};
    var foto = l.foto !== false, chat = l.chat !== false;

    var mostrar = function(id, si){
      var e = document.getElementById(id);
      if(e) e.hidden = !si;
    };

    mostrar('iaBtn', foto || chat);
    mostrar('iaTomarFoto', foto);
    mostrar('iaTexto', chat);
    // ENVIAR se queda si queda CUALQUIERA de las dos. Con él se manda
    // también la foto —el asistente acepta una foto sin texto—, así que
    // atarlo solo al chat dejaba a quien tuviera las preguntas apagadas con
    // una cámara y ninguna forma de mandar lo que acababa de fotografiar.
    mostrar('iaEnviar', foto || chat);
    // El dictado lo resuelve `pintarBotonHablar`, que ya mira la llave del
    // chat por dentro. Aquí solo hay que volver a pedírselo.
    pintarBotonHablar();
  }

  function pintarBotonHablar(){
    var b = document.getElementById('iaHablar');
    if(!b) return;
    // Sin soporte no se enseña un botón que no va a hacer nada. Y solo con
    // Plus: es parte de lo que se paga.
    //
    // La llave del chat VA AQUÍ DENTRO y no en `aplicarLlavesIa`. Esta
    // función se vuelve a llamar cada vez que se repinta el nivel de IA
    // -desde `pintarPlanIA`-, así que apagarlo desde fuera duraba hasta el
    // siguiente repintado y el micrófono reaparecía solo. Dictar es escribir
    // aunque lo transcriba el teléfono: si el chat está apagado, sobra.
    var chat = !MIS_LLAVES || MIS_LLAVES.chat !== false;
    b.hidden = !Reconocedor || MI_NIVEL_IA !== 'plus' || !chat;
  }

  var relojOido = null, algoOido = false;
  // Diez segundos sin una sola palabra. En iPhone la sesión puede abrirse
  // -el botón late, el micro se enciende- y no llegar NADA: pasa cuando el
  // dictado del sistema está apagado, porque el navegador se apoya en él.
  // Sin este reloj el botón se queda latiendo para siempre y la persona no
  // sabe si la está oyendo o no.
  var ESPERA_MUDA = 10000;

  function pararDeOir(){
    if(relojOido){ clearTimeout(relojOido); relojOido = null; }
    if(!oyendo) return;
    try{ oyendo.stop(); }catch(e){}
    oyendo = null;
    document.getElementById('iaHablar').classList.remove('oyendo');
  }

  // El mensaje cuando no se entendió nada. Dice DÓNDE mirar: "no te
  // entendí" no ayuda a nadie a arreglarlo, y el 90% de las veces es el
  // dictado del sistema apagado.
  function avisarSinVoz(){
    toast('toastIA2', 'No se escuchó nada. Si se repite, revisa que el ' +
                      'dictado esté activado en los ajustes del teléfono.');
  }

  if(Reconocedor){
    document.getElementById('iaHablar').addEventListener('click', function(){
      if(oyendo){ pararDeOir(); return; }

      var r = new Reconocedor();
      r.lang = 'es-MX';
      // Resultados parciales para que se vea aparecer el texto mientras se
      // habla: sin eso parece que no está haciendo nada y se pulsa otra vez.
      r.interimResults = true;
      r.continuous = false;

      var yaEstaba = iaTexto.value.trim();
      algoOido = false;

      r.onresult = function(e){
        var dicho = '';
        for(var i = 0; i < e.results.length; i++) dicho += e.results[i][0].transcript;
        if(dicho.trim()) algoOido = true;
        iaTexto.value = (yaEstaba ? yaEstaba + ' ' : '') + dicho.trim();
        // El textarea crece con el contenido, igual que al teclear.
        iaTexto.dispatchEvent(new Event('input', {bubbles:true}));
      };
      r.onerror = function(e){
        pararDeOir();
        if(e.error === 'aborted') return;      // volvió a pulsar: normal
        // 'no-speech' se silenciaba por considerarlo ruido, y resulta que es
        // JUSTO la señal que hace falta cuando el teléfono abre el micro y
        // no transcribe nada. Callarlo dejaba a la persona sin saber nada.
        if(e.error === 'no-speech'){ avisarSinVoz(); return; }
        toast('toastIA2', e.error === 'not-allowed'
          ? 'Tienes que darle permiso al micrófono.'
          : 'No se pudo dictar (' + e.error + '). Prueba otra vez.');
      };
      r.onend = function(){
        var hubo = algoOido;
        pararDeOir();
        if(!hubo) avisarSinVoz();
      };

      try{
        r.start();
        oyendo = r;
        this.classList.add('oyendo');
        relojOido = setTimeout(function(){
          if(!oyendo) return;
          var hubo = algoOido;
          pararDeOir();
          if(!hubo) avisarSinVoz();
        }, ESPERA_MUDA);
      }catch(e){
        toast('toastIA2', 'No se pudo abrir el micrófono.');
      }
    });

    // Salir del asistente con el micro abierto lo dejaría escuchando de
    // fondo. Eso no se hace.
    document.getElementById('iaCerrar').addEventListener('click', pararDeOir);
  }

  // ---- La foto ----
  // Una foto de teléfono son 3-6 MB. Para reconocer un plato sobran 1024
  // píxeles: mandarla entera costaría muchos más tokens -o sea, dinero-
  // sin acertar mejor, y viajaría de más por la red.
  function reducirFoto(archivo){
    return new Promise(function(ok, mal){
      var lector = new FileReader();
      lector.onerror = function(){ mal(new Error('No se pudo leer la foto')); };
      lector.onload = function(){
        var img = new Image();
        img.onerror = function(){ mal(new Error('Ese archivo no es una imagen')); };
        img.onload = function(){
          var MAX = 1024;
          var f = Math.min(1, MAX / Math.max(img.width, img.height));
          var l = document.createElement('canvas');
          l.width = Math.round(img.width * f);
          l.height = Math.round(img.height * f);
          l.getContext('2d').drawImage(img, 0, 0, l.width, l.height);
          var url = l.toDataURL('image/jpeg', 0.82);
          ok({ base64: url.split(',')[1], tipo: 'image/jpeg', vista: url });
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  function pintarFotoIA(){
    var z = document.getElementById('iaFotoZona');
    if(!IA_FOTOS.length){ z.innerHTML = ''; return; }
    // La × lleva el indice: quitar la tercera de cuatro tiene que quitar
    // ESA y no la ultima.
    z.innerHTML = '<div class="ia-fotos' + (IA_FOTOS.length > 1 ? ' varias' : '') + '">' +
      IA_FOTOS.map(function(f, i){
        return '<div class="ia-foto-previa"><img src="' + f.vista + '" alt="">' +
          '<button data-quita-foto="' + i + '" aria-label="Quitar foto ' + (i+1) + '">✕</button></div>';
      }).join('') + '</div>';
  }

  document.getElementById('iaTomarFoto').addEventListener('click', function(){
    document.getElementById('iaArchivo').click();
  });
  document.getElementById('iaFotoZona').addEventListener('click', function(e){
    var b = e.target.closest('[data-quita-foto]');
    if(!b) return;
    IA_FOTOS.splice(Number(b.dataset.quitaFoto), 1);
    pintarFotoIA();
  });
  document.getElementById('iaArchivo').addEventListener('change', function(e){
    var elegidas = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';                  // deja volver a elegir las mismas
    if(!elegidas.length) return;

    // Se SUMAN a las que ya hubiera: en el telefono la galeria y la camara
    // son dos toques distintos, y quien hace una foto y luego elige otra de
    // la galeria espera tener las dos.
    var hueco = TOPE_FOTOS_IA - IA_FOTOS.length;
    if(hueco <= 0){ toast('toastIA2', 'Ya tienes ' + TOPE_FOTOS_IA + ' fotos'); return; }
    var sobran = elegidas.length - hueco;
    if(sobran > 0) elegidas = elegidas.slice(0, hueco);

    // De una en una y en orden: reducir cuatro a la vez en un telefono
    // modesto las descomprime todas en memoria al mismo tiempo, y ahi es
    // donde la pestaña se muere sin decir nada.
    elegidas.reduce(function(cadena, archivo){
      return cadena.then(function(){
        return reducirFoto(archivo).then(function(f){ IA_FOTOS.push(f); pintarFotoIA(); });
      });
    }, Promise.resolve())
      .then(function(){
        if(sobran > 0) toast('toastIA2', 'Solo caben ' + TOPE_FOTOS_IA + ': dejé las primeras');
      })
      ['catch'](function(err){ toast('toastIA2', err.message); pintarFotoIA(); });
  });

  // ---- La conversación ----
  function pintarChat(){
    if(!IA_MSGS.length){
      iaChat.innerHTML =
        '<div class="ia-msg de-el"><div class="burbuja">' +
        'Cuéntame qué comiste y lo apunto, o mándame una foto del plato. ' +
        'También te digo qué te conviene comer con lo que te queda del día.' +
        '</div></div>' +
        IA_ATAJOS.map(function(a){
          return '<button class="ia-atajo" data-atajo="' + escapar(a.texto) + '">' +
                 a.icono + '  ' + escapar(a.texto) + '</button>';
        }).join('');
      return;
    }

    iaChat.innerHTML = IA_MSGS.map(function(m, i){
      var cuerpo = (m.foto ? '<img src="' + m.foto + '" alt="">' : '') +
        (m.texto ? '<div class="burbuja">' + escapar(m.texto) + '</div>' : '');
      var tarjetas = (m.alimentos && m.alimentos.length)
        ? pintarAlimentosPropuestos(m, i) : '';
      return '<div class="ia-msg ' + (m.rol === 'yo' ? 'de-mi' : 'de-el') + '">' +
             cuerpo + '</div>' + tarjetas;
    }).join('');
    iaChat.scrollTop = iaChat.scrollHeight;
  }

  // Los alimentos que propone no se apuntan solos: se enseñan con sus
  // macros y un botón. Apuntar comida en el diario de alguien sin que lo
  // confirme sería pasarse.
  function pintarAlimentosPropuestos(m, idx){
    if(m.apuntados){
      return '<p class="calc-note" style="padding:0 20px 10px;">✓ Apuntado en ' +
             escapar(m.comida || 'tu diario') + '</p>';
    }
    return '<div class="calc-box" style="margin:0 16px 10px;">' +
      m.alimentos.map(function(a){
        var cal = Math.round(a.P*4 + a.C*4 + a.G*9);
        return '<div class="ia-fila">' +
          (a.seguridad !== 'alta'
            ? '<span class="ia-duda ' + a.seguridad + '">' +
              (a.seguridad === 'baja' ? 'a ojo' : 'aprox') + '</span>' : '') +
          '<div class="txt"><b>' + escapar(a.n) + '</b><span>' +
            un(a.cant) + ' ' + escapar(abreviarUnidad(a.u)) + ' · ' + mil(cal) + ' cal · ' +
            'P' + un(a.P) + ' C' + un(a.C) + ' G' + un(a.G) + '</span></div></div>';
      }).join('') +
      '<div class="ia-momento" style="margin-top:10px;">' +
        ['Desayuno','Comida','Cena'].map(function(c){
          return '<button class="meta-opt" data-apuntar="' + idx + '" data-comida="' + c + '">' +
                 c + '</button>';
        }).join('') +
      '</div>' +
      '<p class="calc-note" style="margin-top:8px;">Elige dónde apuntarlo. ' +
        'Los macros marcados son estimación: revísalos.</p>' +
    '</div>';
  }

  iaChat.addEventListener('click', function(e){
    var at = e.target.closest('[data-atajo]');
    if(at){ enviarIA(at.dataset.atajo); return; }

    var ap = e.target.closest('[data-apuntar]');
    if(ap) apuntarPropuesta(Number(ap.dataset.apuntar), ap.dataset.comida);
  });

  // ---- Mandar un mensaje ----
  function enviarIA(textoForzado){
    if(iaOcupado) return;
    var texto = (textoForzado != null ? textoForzado : iaTexto.value).trim();
    if(!texto && !IA_FOTOS.length){ return; }
    if(!sesion){ toast('toastIA2', 'Inicia sesión para usar el asistente'); return; }

    // En la conversacion se enseña la primera; las demas van al servidor
    // igual. Pintar cuatro miniaturas en la burbuja del chat la convierte
    // en un mosaico y se pierde lo que se escribio.
    IA_MSGS.push({ rol:'yo', texto: texto, foto: IA_FOTOS.length ? IA_FOTOS[0].vista : null });
    var fotosEnvio = IA_FOTOS.slice();
    iaTexto.value = '';
    iaTexto.style.height = '';
    IA_FOTOS = [];
    pintarFotoIA();

    IA_MSGS.push({ rol:'el', texto:'…', pensando:true });
    pintarChat();
    iaOcupado = true;
    document.getElementById('iaEnviar').disabled = true;

    iaLlamar({
      accion: 'chat',
      mensajes: IA_MSGS.filter(function(m){ return !m.pensando; })
                       .map(function(m){ return { rol:m.rol, texto:m.texto }; }),
      // Las dos formas a la vez, y no por gusto. La app y la funcion se
      // despliegan por separado; entre un despliegue y el otro hay minutos
      // en que esta app le habla a la funcion VIEJA, que solo entiende
      // `imagen`. Mandando la primera tambien asi, en esos minutos se
      // analiza una foto en vez de ninguna.
      //
      // La funcion nueva ignora `imagen` cuando viene `imagenes`, asi que
      // no se cuenta dos veces.
      imagen: fotosEnvio.length ? fotosEnvio[0].base64 : undefined,
      tipo_imagen: fotosEnvio.length ? fotosEnvio[0].tipo : undefined,
      imagenes: fotosEnvio.length
        ? fotosEnvio.map(function(f){ return { datos: f.base64, tipo: f.tipo }; })
        : undefined,
      macros: macrosDeHoy(),
      // El servidor corre en UTC. A las 8 de la noche en México allí ya es
      // mañana, y "el viernes" saldría corrido un día.
      zona: (function(){
        try{ return Intl.DateTimeFormat().resolvedOptions().timeZone; }
        catch(e){ return 'America/Mexico_City'; }
      })()
    }).then(function(r){
      IA_MSGS.pop();                       // quitar el "pensando"
      IA_MSGS.push({
        rol: 'el',
        texto: r.respuesta || '',
        alimentos: (r.alimentos || []).map(function(x){
          return prepararAlimento({
            n: x.nombre, u: x.unidad || 'Gramos',
            cant: Number(x.cantidad) || 1,
            P: Number(x.proteina) || 0,
            C: Number(x.carbos)   || 0,
            G: Number(x.grasas)   || 0,
            seguridad: x.seguridad || 'media'
          });
        })
      });
      // El plan lo pinta pintarQuedanIA: la cabecera dice qué tienes y
      // cuánto te queda, y las dos cosas salen del mismo sitio.
      if(typeof r.quedan === 'number'){ iaQuedanNum = r.quedan; }
      if(r.nivel){ MI_NIVEL_IA = r.nivel; }
      pintarQuedanIA();
      // Solo se guarda cuando ya no falta nada por preguntar. Mientras el
      // asistente siga conversando, `falta` trae algo y aquí no pasa nada:
      // en pantalla solo se ve su pregunta, que es lo que se quería.
      guardarEventoSiEstaCompleto(r.evento);
      guardarMemoriaIA(r.memoria);
      pintarChat();
    })['catch'](function(e){
      IA_MSGS.pop();
      IA_MSGS.push({ rol:'el', texto: traducirError(e.message) });

      // LAS FOTOS VUELVEN. Se vacían antes de llamar para que la pantalla
      // quede limpia mientras se espera, y eso está bien; lo que faltaba
      // era el otro lado. Se pueden adjuntar cuatro y la burbuja solo
      // enseña la primera, así que al fallar desaparecían las cuatro y tres
      // no dejaban ni rastro: había que volver a hacerlas.
      //
      // Y sin señal —que es cuando más falla— eso es lo contrario de lo que
      // hace el resto de la app: apuntar una comida sin red no borra lo que
      // escribiste, lo guarda y avisa.
      //
      // Solo cuando falla. Reponerlas siempre haría que la siguiente
      // pregunta arrastrara las fotos de la anterior y se analizaran dos
      // veces, gastando otra consulta del día.
      //
      // El texto no se repone a propósito: sigue a la vista en la burbuja
      // de la propia persona, así que no se ha perdido.
      if(fotosEnvio.length){ IA_FOTOS = fotosEnvio; pintarFotoIA(); }

      pintarChat();
    }).then(function(){
      iaOcupado = false;
      document.getElementById('iaEnviar').disabled = false;
    });
  }

  // Lo que el asistente ha aprendido de esta persona. Lo escribe él y lo
  // guarda la app, como los alimentos y los eventos: la Edge Function no
  // escribe en la base, y así no necesita permisos ni puede saltarse RLS.
  //
  // Llega la memoria ENTERA reescrita, no un añadido. Si llegara por trozos
  // acabaría siendo un ladrillo que se paga en tokens en cada mensaje.
  function guardarMemoriaIA(texto){
    if(!texto || !sesion || !sesion.user) return;
    sbActualizarPerfil({ memoria_ia: String(texto).slice(0, 1200) })
      ['catch'](function(){});   // en silencio: no es cosa del usuario
  }

  // ---- Cuando el entrenador escribe primero ----
  // Se pinta en el Diario y no como notificación del sistema: eso es un
  // canal más y llega después. Lo que hace falta primero es que TENGA algo
  // que decir; entregarlo por push es un envoltorio.
  function pintarAvisoCoach(texto, id){
    var caja = document.getElementById('avisoCoach');
    if(!caja) return;
    if(!texto){ caja.hidden = true; caja.innerHTML = ''; return; }
    caja.hidden = false;
    caja.innerHTML = '<p>' + escapar(texto) + '</p>' +
                     '<button data-visto="' + id + '">Entendido</button>';
  }

  // Marcar como visto es lo único que la app puede hacer con un aviso: el
  // texto lo escribe el modelo y lo guarda una función que comprueba antes
  // que el motivo sea de verdad el que toca.
  (function(){
    var caja = document.getElementById('avisoCoach');
    if(!caja) return;
    caja.addEventListener('click', function(e){
      var b = e.target.closest('[data-visto]');
      if(!b) return;
      pintarAvisoCoach(null);
      if(!sesion || !sesion.user) return;
      sbFetch('/rest/v1/avisos_coach?id=eq.' + b.dataset.visto, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ visto_en: new Date().toISOString() })
      })['catch'](function(){});
      // CALLA A PROPÓSITO: lo peor que pasa es que el mismo aviso vuelva a
      // salir en la próxima apertura. Y volver a enseñarlo no cuesta nada:
      // se lee la fila que ya existe, sin consultar a la IA.
    });
  })();

  // ---- "Prepara tus fotos para mañana" ----
  // Las fotos se suben el día que cierra la semana. Avisar ESE día llega
  // tarde: buscar luz, un espejo y un momento a solas no se improvisa. Así
  // que se avisa la víspera.
  //
  // Y a partir de las 7 de la tarde, no todo el sábado: por la mañana
  // todavía queda un día entero por delante y "mañana" no significa nada
  // urgente. A las 7 sí: es la noche de antes.
  var HORA_AVISO_FOTOS = 19;
  var CLAVE_AVISO_FOTOS = 'macros.avisoFotos';

  // La semana NO empieza el lunes para todo el mundo: sale de
  // `profiles.week_start_dow`, que se pone en la base y no desde la app.
  // Atar esto a un sábado fijo habría estado mal para cualquiera que no
  // empiece en lunes.
  //
  // El aviso sale el ÚLTIMO día de la semana por la noche, que es la víspera
  // de que arranque la siguiente. Si tu semana empieza el martes, el último
  // día es el lunes y el aviso te sale el lunes por la noche.
  //
  // Recibe la fecha y el día de inicio en vez de mirarlos por dentro: así se
  // comprueba contra un lunes a las 19:00 sin esperar al lunes.
  //
  // El día y la hora salen de la MISMA fecha, no de `HOY` por un lado y del
  // reloj por otro: quien deja la app abierta pasada la medianoche tendría
  // un `HOY` de ayer y una hora de hoy, y el aviso saldría un día tarde.
  function esVisperaDeCerrarSemana(cuando, inicio){
    var d = cuando || new Date();
    var arranca = inicio == null ? inicioSemana : inicio;   // 0=domingo … 6=sábado
    var ultimoDiaDeLaSemana = (arranca + 6) % 7;
    return d.getDay() === ultimoDiaDeLaSemana && d.getHours() >= HORA_AVISO_FOTOS;
  }

  function revisarAvisoDeFotos(){
    var caja = document.getElementById('avisoFotos');
    if(!caja) return;

    // Se guarda la SEMANA en la que se cerró, no un simple "ya lo vio". Así
    // no vuelve a salir esta semana por mucho que se cierre y se abra la
    // app, y la que viene sí sale, que es lo que se pidió.
    var semana = claveSemana(HOY);
    var cerrado = null;
    try{ cerrado = localStorage.getItem(CLAVE_AVISO_FOTOS); }catch(e){}

    caja.hidden = !(esVisperaDeCerrarSemana() && cerrado !== semana);
  }

  (function(){
    var b = document.getElementById('avisoFotosCerrar');
    if(!b) return;
    b.addEventListener('click', function(){
      document.getElementById('avisoFotos').hidden = true;
      // En el navegador y no en la base a propósito: es una preferencia de
      // pantalla, no un dato. Que reinstalar la app lo devuelva es aceptable;
      // montarle una tabla a un aviso que se cierra, no.
      try{ localStorage.setItem(CLAVE_AVISO_FOTOS, claveSemana(HOY)); }catch(e){}
    });
  })();

  // ---- Los tres recordatorios de arriba ----
  //
  // Peso todos los días, fotos una vez por semana, cintura una vez al mes.
  // Los tres funcionan igual: salen cuando toca, se van SOLOS en cuanto se
  // hace la cosa, y la × los calla hasta el ciclo siguiente.
  //
  // Lo que hace que "se vayan solos" no es el guardado, es que la condición
  // se pregunta cada vez que se repinta: ¿hay peso de hoy?, ¿están las
  // cuatro fotos?, ¿toca cintura? Atarlo al botón de guardar habría dejado
  // el recordatorio puesto cuando el dato entra por otro lado -al cargar
  // desde la base al abrir la app, por ejemplo-.
  var CLAVE_REC = 'macros.rec.';

  // Antes de que lleguen los datos de la base, PESOS es {}, CINTURAS es []
  // y FOTOS es {} -son sus valores de arranque, no "no hay nada que hacer"-.
  // Preguntarles a esas alturas si "toca" algo siempre da que sí, y los tres
  // recordatorios se encendían solos al abrir la app para apagarse un
  // instante después, en cuanto `cargarDatos()` (o `sbCargarFotos()`, que va
  // aparte y llega más tarde) traía lo real y corregía la respuesta.
  //
  // No es que la pregunta esté mal -`faltanFotosDeLaSemana()` ya se cuidaba
  // de este mismo caso-, es que "no sé todavía" no es lo mismo que "toca", y
  // hasta que estas dos banderas no se ponen a `true` ninguno de los tres
  // tiene forma de distinguirlos.
  var PESO_CINTURA_LISTOS = false;
  var FOTOS_LISTAS = false;

  // El ciclo de cada uno. Es la clave de "ya lo cerré", y a la vez lo que
  // hace que vuelva: cuando cambia el ciclo, lo guardado deja de coincidir
  // y el recordatorio reaparece sin tener que borrar nada.
  //
  // El mes sale de `isoDe`, que ya usa la fecha del teléfono. Con
  // `toISOString().slice(0,7)` habría sido el mes en UTC, y la última noche
  // de cada mes -a partir de las 18:00 en México- habría dado el siguiente.
  // CUÁNTO DURA LA × DE CADA RECORDATORIO.
  //
  //  Se guarda el ciclo en curso al cerrarlo, y vuelve a salir cuando el
  //  ciclo cambia. O sea que esto decide si la × calla el aviso un día, una
  //  semana o un mes.
  function cicloDeRecordatorio(cual){
    // Peso y CINTURA: un día. La × es «hoy no», no «ya no».
    //
    //  La cintura callaba un MES ENTERO: se guardaba '2026-08' y no volvía
    //  hasta septiembre. Quien la cerraba sin querer —o la cerraba pensando
    //  «ahorita»— se quedaba sin aviso hasta el mes siguiente, y como el
    //  campo para apuntarla solo aparece cuando toca, era bastante fácil
    //  no medirse en todo el mes sin enterarse.
    //
    //  Con el día, el aviso vuelve mañana y pasado hasta que se mida. Y en
    //  cuanto se mide, `tocaMedirCintura()` lo apaga solo hasta los 28 días
    //  siguientes: la × no tiene que hacer ese trabajo.
    if(cual === 'peso' || cual === 'cintura') return isoDe(HOY);

    // Fotos: la semana de la persona y no la ISO. Si no, a quien empieza en
    // martes la × pulsada el domingo se le desharía sola el lunes, en mitad
    // de su propia semana.
    return claveDeMisFotos();
  }

  function recordatorioCallado(cual){
    try{ return localStorage.getItem(CLAVE_REC + cual) === cicloDeRecordatorio(cual); }
    catch(e){ return false; }             // sin almacenamiento, mejor que salga
  }

  // Las cuatro fotos de la semana en curso. Se mira contra las MISMAS claves
  // con las que se guardan (`claveSemana`), no contra una cuenta aparte: si
  // se guardan en un sitio y se cuentan en otro, tarde o temprano no cuadra.
  function faltanFotosDeLaSemana(){
    // ESTA GUARDA NO ES PARANOIA, ES UN FALLO QUE YA PASÓ.
    //
    // `FOTOS` y `POSES` se declaran mucho más abajo en el fichero, y esto
    // llega a llamarse ANTES: `pintarPeso()` corre en el arranque y pregunta
    // por los recordatorios. En ese momento las dos valen `undefined` -`var`
    // sube la declaración pero no el valor-, así que leer `FOTOS[...]`
    // lanzaba y se llevaba por delante TODO lo que venía después en el
    // guion: ni un solo botón de los que se enganchan más abajo quedaba
    // vivo. La app abría y no respondía a nada.
    //
    // Decir "no faltan" durante ese instante no engaña a nadie:
    // `pintarFotos()` corre unas líneas después en el mismo arranque y
    // vuelve a preguntar con los datos ya puestos.
    if(!FOTOS || !POSES) return false;
    var set = FOTOS[claveDeMisFotos()] || {};
    return POSES.some(function(p){ return !set[p.k]; });
  }

  // ---- La semana de fotos es LA DE CADA QUIEN ----
  //
  // Aquí había una cuenta que medía la posición de hoy dentro de la semana
  // ISO -lunes a domingo- contra la posición del día de arranque. Encajaba
  // con el aviso de la víspera, pero la ventana salía de un tamaño distinto
  // para cada persona, porque la cortaba el domingo:
  //
  //     empieza el lunes ..... 7 días de recordatorio
  //     empieza el martes .... 6
  //     empieza el jueves .... 4
  //     empieza el domingo ... 1   <- si ese día no abre la app, se queda sin
  //
  // Y peor: las fotos se archivaban con `claveSemana(HOY)`, o sea la semana
  // ISO del día en que se subían. Para quien no empieza en lunes, la MISMA
  // semana suya caía en dos cajones distintos según el día que las subiera.
  //
  // La solución no es mover el archivo -eso le cambiaría el historial a
  // todo el mundo- sino mirar siempre desde el ARRANQUE de la semana de
  // cada quien. Para quien empieza en lunes esto da exactamente lo mismo
  // que antes, y ésos son todos menos Eduardo.
  function inicioDeMiSemana(cuando, inicio){
    var arranca = inicio == null ? inicioSemana : inicio;   // 0=domingo … 6=sábado
    var x = new Date(cuando || HOY);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() - arranca + 7) % 7));
    return x;
  }

  // El cajón donde van las fotos de la semana en curso. No cambia en toda
  // la semana de la persona, que es justo lo que faltaba: antes cambiaba
  // sola al pasar el domingo.
  function claveDeMisFotos(cuando, inicio){
    return claveSemana(inicioDeMiSemana(cuando, inicio));
  }

  function revisarRecordatorios(){
    var peso = document.getElementById('recPeso');
    var fot  = document.getElementById('recFotos');
    var cin  = document.getElementById('recCintura');
    if(!peso || !fot || !cin) return;

    peso.hidden = !(PESO_CINTURA_LISTOS && PESOS[isoDe(HOY)] == null && !recordatorioCallado('peso'));
    // Sin "¿ya es mi día?": el cajón de `claveDeMisFotos` YA es el de la
    // semana de esta persona, así que "faltan fotos" solo puede ser cierto
    // dentro de su semana. La ventana sale de siete días para todos.
    fot.hidden  = !(FOTOS_LISTAS && faltanFotosDeLaSemana() && !recordatorioCallado('fotos'));
    cin.hidden  = !(PESO_CINTURA_LISTOS && tocaMedirCintura() && !recordatorioCallado('cintura'));

    // "Hoy toca" solo es verdad el día que toca. A partir del segundo día es
    // mentira, y una app que te miente en algo comprobable deja de valer
    // para lo que no puedes comprobar.
    var tit = document.getElementById('recFotosTit');
    if(tit) tit.textContent = HOY.getDay() === inicioSemana
      ? 'Hoy toca subir tus 4 fotos'
      : 'Aún no subes tus 4 fotos';
  }

  // Por delegación, como el chequeo. El motivo es el mismo: estas tarjetas
  // se esconden y se enseñan constantemente, y un enganche directo depende
  // de que el elemento sea el mismo de siempre.
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target : null;
    if(!t) return;

    var x = t.closest('[data-rec-cerrar]');
    if(x){
      var cual = x.dataset.recCerrar;
      // En el navegador y no en la base: es una preferencia de pantalla, no
      // un dato. Que reinstalar la app la devuelva es aceptable.
      try{ localStorage.setItem(CLAVE_REC + cual, cicloDeRecordatorio(cual)); }catch(e2){}
      revisarRecordatorios();
      return;
    }

    var ir = t.closest('[data-rec-ir]');
    if(!ir) return;
    // La cintura se apunta en la pantalla del peso, en el campo que
    // `pintarCintura` destapa cuando toca: no tiene pantalla propia.
    var destino = ir.dataset.recIr === 'cintura' ? 'peso' : ir.dataset.recIr;
    try{ volverA(destino, 'diario'); }
    catch(err){
      toast('toastComida', 'No pude abrirlo: ' + (err && err.message || err));
    }
  });

  function revisarAvisoDelCoach(){
    if(!sesion || !sesion.user || MI_NIVEL_IA !== 'plus') return;

    // Primero lo que ya esté escrito y sin leer: eso no cuesta un céntimo.
    sbFetch('/rest/v1/avisos_coach?select=id,texto&visto_en=is.null' +
            '&user_id=eq.' + sesion.user.id + '&order=creado_en.desc&limit=1')
      .then(function(filas){
        if(filas && filas.length){
          pintarAvisoCoach(filas[0].texto, filas[0].id);
          return null;
        }
        // Y si no hay ninguno, ¿toca uno nuevo? Lo decide Postgres, gratis.
        //
        // CON LA FECHA DEL TELÉFONO. Antes no se mandaba y allá se usaba
        // `current_date`, que va en UTC: desde las 18:00 de México para la
        // base ya era mañana, así que la ventana de siete días incluía un
        // día que todavía no podía tener nada apuntado. "Racha" era
        // imposible de conseguir abriendo la app por la tarde.
        //
        // Las comidas se guardan con la fecha del teléfono; leerlas con otra
        // no podía salir bien.
        return sbRpc('aviso_pendiente', { p_usuario: sesion.user.id, p_hoy: isoDe(HOY) });
      })
      .then(function(motivo){
        if(!motivo) return;
        // Solo aquí se gasta una consulta, y solo cuando de verdad hay algo
        // que decir. Son cuatro o cinco al mes por persona.
        return iaLlamar({ accion: 'aviso', motivo: motivo })
          .then(function(r){
            if(!r || !r.texto) return;
            // La MISMA fecha que arriba. Con una distinta, se pide el aviso
            // con la del teléfono y se guarda comprobando con la del
            // servidor: podían dar motivos distintos y el guardado fallaba
            // después de haber pagado la consulta de IA.
            return sbRpc('guardar_aviso', { p_motivo: motivo, p_texto: r.texto, p_hoy: isoDe(HOY) })
              .then(function(id){ pintarAvisoCoach(r.texto, id); });
          });
      })['catch'](function(){});   // en silencio: nadie pidió esto
  }

  // ---- Eventos que el asistente detectó en la conversación ----
  // EVENTOS vive en memoria y en la base. En memoria porque el Diario lo
  // consulta en cada repintado y no puede esperar a la red; en la base
  // porque si no, cerrar la app deshace la semana que ya se repartió.
  // Se declara arriba del todo, junto a REGISTRO, por el orden de arranque.
  function guardarEventoSiEstaCompleto(ev){
    if(!ev || !ev.fecha) return;
    // Mientras falte algo, el asistente sigue preguntando y aquí no se
    // toca nada: guardar a medias dejaría la semana repartida con una
    // reserva que la persona todavía no ha confirmado.
    if(Array.isArray(ev.falta) && ev.falta.length) return;

    var cal = Math.max(0, Math.min(4000, Math.round(Number(ev.calorias) || 0)));
    if(!cal) return;

    // Un evento de la semana pasada no reparte nada: lo que ya pasó, pasó.
    if(ev.fecha < isoDe(HOY)) return;

    EVENTOS[ev.fecha] = {
      titulo: String(ev.titulo || 'Evento').slice(0, 120),
      calorias: cal,
      bebidas: Math.max(0, Math.min(30, Math.round(Number(ev.bebidas) || 0))),
      prioridad: ev.prioridad === 'comida' || ev.prioridad === 'bebida'
                 ? ev.prioridad : 'ambas'
    };
    actualizarSemana();          // la meta de hoy ya baja, sin recargar nada

    if(!sesion || !sesion.user) return;
    // upsert por (user_id, fecha): si cambian de idea sobre el mismo día,
    // se corrige la reserva en vez de sumar dos.
    sbFetch('/rest/v1/eventos?on_conflict=user_id,fecha', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: sesion.user.id,
        fecha: ev.fecha,
        titulo: EVENTOS[ev.fecha].titulo,
        calorias: cal,
        bebidas: EVENTOS[ev.fecha].bebidas,
        prioridad: EVENTOS[ev.fecha].prioridad
      })
    })['catch'](function(){
      // Sin toast: el asistente ya dijo que lo acomodó, y contradecirle con
      // un error rojo justo debajo es peor que reintentarlo al recargar.
    });
  }

  // Quitar un evento. Se cancela, no se borra: si a alguien se le repartió
  // la semana por una boda y luego la quita, hay que poder explicar por qué
  // sus calorías del miércoles fueron las que fueron.
  function cancelarEvento(fecha){
    if(!EVENTOS[fecha]) return Promise.resolve();
    var titulo = EVENTOS[fecha].titulo;
    delete EVENTOS[fecha];
    actualizarSemana();                 // la meta de hoy vuelve al momento
    toast('toastDiario', titulo + ' quitado · tus calorías vuelven a la normalidad');

    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/eventos?user_id=eq.' + sesion.user.id +
                   '&fecha=eq.' + fecha + '&cancelado_en=is.null', {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ cancelado_en: new Date().toISOString() })
    })['catch'](function(e){
      // La pantalla ya dijo "quitado · tus calorías vuelven a la
      // normalidad". Si la base no se enteró, el evento sigue vivo y al
      // recargar la app te vuelve a repartir la semana por una cena que
      // creías cancelada.
      toast('toastDiario', 'No se pudo quitar: ' + traducirError(e.message) +
            ' Sigue apuntado, inténtalo otra vez.');
    });
  }

  // La tira de eventos del Diario. Solo aparece si hay alguno: una sección
  // vacía permanente es ruido en una pantalla que ya está llena.
  function pintarEventos(){
    var caja = document.getElementById('eventosTira');
    if(!caja) return;
    var fin = new Date(anclaSemana); fin.setDate(fin.getDate() + 7);
    var proximos = Object.keys(EVENTOS).sort().filter(function(f){
      return f >= isoDe(HOY) && f < isoDe(fin);
    });
    caja.hidden = proximos.length === 0;
    caja.innerHTML = proximos.map(function(f){
      var e = EVENTOS[f];
      var d = new Date(f + 'T12:00:00');
      var cuando = f === isoDe(HOY) ? 'hoy'
                 : DIAS[d.getDay()];
      return '<div class="evento-chip">' +
               // Escapado: este título no lo teclea nadie en un formulario,
               // lo DEVUELVE EL MODELO a partir de lo que se dijo en el chat.
               // Es texto de fuera puesto como HTML.
               '<div class="txt"><b>' + escapar(e.titulo) + '</b>' +
               '<span>' + cuando + ' · ' + mil(e.calorias) + ' cal apartadas</span></div>' +
               '<button data-quitar="' + f + '" aria-label="Quitar">✕</button>' +
             '</div>';
    }).join('');
  }

  // Delegado en el contenedor: la tira se repinta en cada repintado del
  // Diario, así que un listener por chip se perdería en cuanto cambiara
  // cualquier otra cosa.
  (function(){
    var caja = document.getElementById('eventosTira');
    if(!caja) return;
    caja.addEventListener('click', function(e){
      var b = e.target.closest('[data-quitar]');
      if(b) cancelarEvento(b.dataset.quitar);
    });
  })();

  // Lo que hay apartado de hoy en adelante, dentro de esta semana. Los
  // eventos de más allá no tocan la semana en curso: cada semana reparte
  // lo suyo.
  function reservaDeLaSemana(){
    var total = 0;
    var fin = new Date(anclaSemana);
    fin.setDate(fin.getDate() + 7);
    Object.keys(EVENTOS).forEach(function(f){
      if(f >= isoDe(HOY) && f < isoDe(fin)) total += EVENTOS[f].calorias;
    });
    return total;
  }

  // ---- Aviso de privacidad y términos ----
  // La versión viaja con el consentimiento: sin ella, "acepto" no significa
  // nada dentro de un año, porque el texto habrá cambiado y no habrá forma
  // de saber qué leyó esa persona. Al tocar legal.md hay que subirla aquí.
  var VERSION_LEGAL = '1';
  var legalCargado = false;

  // Un markdown mínimo, solo lo que legal.md usa. Una librería entera para
  // esto serían 40 KB en cada teléfono para pintar cuatro encabezados.
  function comoHtml(md){
    var filas = md.replace(/\r/g, '').split('\n');
    var out = [], enLista = false, enTabla = false, parrafo = [];

    // Un párrafo de markdown sigue hasta la línea en blanco, no hasta el
    // salto. Tratando cada línea como un párrafo se parten las frases por
    // la mitad y, peor, una **negrita** que cruce el salto sale literal
    // porque la expresión no la encuentra entera.
    function soltarParrafo(){
      if(!parrafo.length) return;
      out.push('<p>' + enLinea(parrafo.join(' ')) + '</p>');
      parrafo = [];
    }
    function cerrar(){
      soltarParrafo();
      if(enLista){ out.push('</ul>'); enLista = false; }
      if(enTabla){ out.push('</tbody></table></div>'); enTabla = false; }
    }
    function enLinea(t){
      // El orden importa: primero se escapa, y solo después se meten las
      // etiquetas. Al revés, cualquier < del texto rompería el resultado.
      return escapar(t)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
    }

    filas.forEach(function(f){
      var t = f.trim();
      if(!t){ cerrar(); return; }
      if(t === '---'){ cerrar(); out.push('<hr>'); return; }

      var h = t.match(/^(#{1,3})\s+(.*)$/);
      if(h){ cerrar(); out.push('<h' + h[1].length + '>' + enLinea(h[2]) + '</h' + h[1].length + '>'); return; }

      // La raya de separación de la tabla: no se pinta, solo cambia de modo.
      if(/^\|[\s:|-]+\|$/.test(t)) return;

      if(t.indexOf('|') === 0){
        var celdas = t.split('|').slice(1, -1).map(function(c){ return enLinea(c.trim()); });
        if(!enTabla){
          soltarParrafo();
          if(enLista){ out.push('</ul>'); enLista = false; }
          out.push('<div class="tabla-legal"><table><thead><tr>' +
                   celdas.map(function(c){ return '<th>' + c + '</th>'; }).join('') +
                   '</tr></thead><tbody>');
          enTabla = true;
        } else {
          out.push('<tr>' + celdas.map(function(c){ return '<td>' + c + '</td>'; }).join('') + '</tr>');
        }
        return;
      }
      if(enTabla){ out.push('</tbody></table></div>'); enTabla = false; }

      if(t.indexOf('- ') === 0){
        soltarParrafo();
        if(!enLista){ out.push('<ul>'); enLista = true; }
        out.push('<li>' + enLinea(t.slice(2)) + '</li>');
        return;
      }
      // Dentro de una lista, una línea suelta continúa el punto anterior.
      if(enLista){ out[out.length - 1] = out[out.length - 1]
        .replace('</li>', ' ' + enLinea(t) + '</li>'); return; }
      parrafo.push(t);
    });
    cerrar();
    return out.join('');
  }

  function abrirLegal(){
    // Apilada, con su botón de regresar: se abre desde el registro y desde
    // Perfil, y hay que poder volver a donde se estaba.
    goto('legal', true);
    if(legalCargado) return;
    fetch('legal.md', { cache: 'no-cache' })
      .then(function(r){ return r.text(); })
      .then(function(md){
        document.getElementById('textoLegal').innerHTML = comoHtml(md);
        legalCargado = true;
      })['catch'](function(){
        // Sin el texto no se puede aceptar nada a ciegas: se dice y punto.
        document.getElementById('textoLegal').innerHTML =
          '<p>No se pudo cargar el aviso. Revisa tu conexión e inténtalo otra vez.</p>';
      });
  }

  // Se abre desde el registro y desde Perfil. Delegado en el documento
  // porque el del registro vive dentro de una tarjeta que se repinta.
  document.addEventListener('click', function(e){
    if(e.target.closest('[data-ver-legal]')) abrirLegal();
  });

  // ---- Qué plan tiene esta persona ----
  // Se escribe una sola vez y lo leen los tres sitios que lo enseñan: la
  // fila de Perfil, la hoja de detalle y la cabecera del asistente. Tres
  // textos sueltos se separan en cuanto se retoque uno.
  var MI_NIVEL_IA = 'normal';
  var PLANES_IA = [
    { id:'apagada', nombre:'Sin IA',
      resumen:'La app entera, sin asistente',
      incluye:[
        'Apuntar comida a mano y con la base de datos',
        'Tus alimentos y recetas guardados',
        'Rutinas, series y cronómetro',
        'Peso, gráfica y fotos de progreso',
        'El anillo y el reparto de la semana'
      ],
      no:['El asistente no está disponible'] },
    { id:'normal', nombre:'IA normal',
      resumen:'Todo lo anterior, y el asistente del día a día',
      incluye:[
        'Todo lo del plan sin IA',
        'Chat con el asistente: qué comer con lo que te queda',
        'Foto del platillo: lo reconoce y lo apunta por ti',
        'Lista del súper para comer así una semana',
        'Tres consultas al día'
      ],
      no:['No reparte la semana por eventos',
          'No te ajusta las calorías cada semana'] },
    { id:'plus', nombre:'IA Plus',
      resumen:'Como tener un entrenador encima',
      incluye:[
        'Todo lo del plan normal',
        'Se acuerda de ti: lo que no comes, cómo vives, qué te funciona',
        'Le cuentas tus planes ("el sábado hay boda") y te hace sitio antes',
        'Chequeo semanal: hambre, energía y antojo',
        'Te ajusta las calorías cada semana según cómo te fue y cómo te sientes',
        'Y si no hay datos suficientes, te lo dice en vez de ajustar a ciegas',
        'Quince consultas al día'
      ],
      no:[] }
  ];
  function planPorId(id){
    for(var i = 0; i < PLANES_IA.length; i++)
      if(PLANES_IA[i].id === id) return PLANES_IA[i];
    return PLANES_IA[1];
  }

  // La fila de Perfil y la cabecera del asistente dicen lo mismo, desde el
  // mismo sitio.
  function pintarPlanIA(){
    var p = planPorId(MI_NIVEL_IA);
    var fila = document.getElementById('profPlanIa');
    if(fila) fila.innerHTML = p.nombre + '<i>›</i>';
    pintarQuedanIA();
    pintarBotonHablar();
  }

  var iaQuedanNum = null;
  function pintarQuedanIA(){
    var el = document.getElementById('iaQuedan');
    if(!el) return;
    var p = planPorId(MI_NIVEL_IA);
    // El plan primero: es lo que explica por qué el asistente puede o no
    // puede hacer algo. El contador va detrás, y solo si se sabe.
    el.textContent = p.nombre + (iaQuedanNum === null ? '' :
      ' · ' + iaQuedanNum + (iaQuedanNum === 1 ? ' consulta hoy' : ' consultas hoy'));
  }

  var planIaSheet = document.getElementById('planIaSheet');
  var planIaAbierto = null;          // el que está desplegado

  function pintarHojaPlanes(){
    document.getElementById('planIaOpts').innerHTML = PLANES_IA.map(function(p){
      var mio = p.id === MI_NIVEL_IA;
      var abierto = p.id === planIaAbierto;
      return '<div class="plan-ia' + (mio ? ' mio' : '') + (abierto ? ' abierto' : '') +
             '" data-plan-ia="' + p.id + '">' +
        '<div class="plan-ia-cab">' +
          '<div><b>' + escapar(p.nombre) + '</b><span>' + escapar(p.resumen) + '</span></div>' +
          (mio ? '<em>Tu plan</em>' : '<i>' + (abierto ? '−' : '+') + '</i>') +
        '</div>' +
        (abierto
          ? '<ul>' + p.incluye.map(function(x){ return '<li>' + x + '</li>'; }).join('') +
            p.no.map(function(x){ return '<li class="no">' + x + '</li>'; }).join('') +
            '</ul>' +
            (mio ? '' : '<p class="plan-ia-como">Para cambiar de plan, habla con quien ' +
                        'te lleva: se activa desde su panel.</p>')
          : '') +
      '</div>';
    }).join('');
  }

  document.getElementById('profPlanIaBtn').addEventListener('click', function(){
    // Arranca con el suyo desplegado: lo primero que quiere saber alguien
    // que entra aquí es qué tiene, no qué le falta.
    planIaAbierto = MI_NIVEL_IA;
    pintarHojaPlanes();
    planIaSheet.classList.add('open');
  });
  document.getElementById('planIaCerrar').addEventListener('click', function(){
    planIaSheet.classList.remove('open');
  });
  planIaSheet.addEventListener('click', function(e){
    if(e.target === planIaSheet){ planIaSheet.classList.remove('open'); return; }
    var c = e.target.closest('[data-plan-ia]');
    if(!c) return;
    planIaAbierto = planIaAbierto === c.dataset.planIa ? null : c.dataset.planIa;
    pintarHojaPlanes();
  });

  // ---- Eliminar la propia cuenta ----
  // borrar_mi_cuenta() no lleva parámetro a propósito: el único id que
  // acepta es el de quien llama. Aquí solo se confirma la intención.
  var borrarSheet = document.getElementById('borrarSheet');
  var borrarConfirma = document.getElementById('borrarConfirma');
  var borrarConfirmar = document.getElementById('borrarConfirmar');

  // Se piden TODAS, archivadas incluidas: una foto archivada sigue siendo
  // una foto suya en un servidor. Y si esto falla, el borrado sigue igual:
  // dejar la cuenta viva porque no se pudo limpiar el bucket sería atrapar
  // a alguien que ya dijo que se iba.
  function borrarMisFotosDelBucket(){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/progress_photos?select=storage_path' +
                   '&user_id=eq.' + sesion.user.id)
      .then(function(filas){
        var rutas = (filas || []).map(function(f){ return f.storage_path; })
                                 .filter(Boolean);
        if(!rutas.length) return;
        // Por sbStorage y no por fetch: si el token venció justo aquí, las
        // fotos se quedarían en el bucket después de que alguien pidiera
        // que no quedara nada suyo. Es el peor momento para no reintentar.
        return sbStorage('/storage/v1/object/' + BUCKET, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: rutas })
        });
      })['catch'](function(){ /* que no detenga el borrado */ });
  }

  function cerrarBorrado(){
    borrarSheet.classList.remove('open');
    borrarConfirma.value = '';
    borrarConfirmar.disabled = true;
    borrarConfirmar.textContent = 'Eliminar mi cuenta';
  }
  document.getElementById('borrarCuentaBtn').addEventListener('click', function(){
    if(!sesion || !sesion.user){ toast('toastPerfil', 'Necesitas sesión.'); return; }
    cerrarBorrado();
    borrarSheet.classList.add('open');
  });
  document.getElementById('borrarCancelar').addEventListener('click', cerrarBorrado);
  borrarSheet.addEventListener('click', function(e){
    if(e.target === borrarSheet) cerrarBorrado();
  });
  borrarConfirma.addEventListener('input', function(){
    borrarConfirmar.disabled = this.value.trim().toUpperCase() !== 'ELIMINAR';
  });

  borrarConfirmar.addEventListener('click', function(){
    if(this.disabled) return;
    this.disabled = true;
    this.textContent = 'Eliminando…';
    // Las fotos primero, y desde aquí. Borrar la fila de `storage.objects`
    // en SQL suelta la referencia pero NO borra el archivo del bucket: se
    // queda ahí, accesible con su ruta, después de que la persona pidiera
    // que no quedara nada. La única forma de borrarlo de verdad es la API
    // de Storage, y esa necesita la sesión de su dueño —que es justo lo
    // que hay en este momento y no habrá dentro de un segundo.
    borrarMisFotosDelBucket()
      .then(function(){ return sbRpc('borrar_mi_cuenta', {}); })
      .then(function(){
        // La sesión ya no vale nada: el usuario no existe. Se limpia todo
        // lo local antes de recargar o la app arrancaría con los datos de
        // alguien que ya no está.
        try{ localStorage.clear(); }catch(e){}
        location.reload();
      })['catch'](function(err){
        borrarConfirmar.disabled = false;
        borrarConfirmar.textContent = 'Eliminar mi cuenta';
        toast('toastPerfil', 'No se pudo eliminar: ' + traducirError(err.message));
      });
  });

  // ---- Chequeo semanal ----
  // El peso solo no basta para decidir. Bajar 800 g pasando hambre y sin
  // energía no es lo mismo que bajarlos cómodo, y con lo primero lo que hay
  // que hacer es SUBIR calorías, no bajarlas más.
  var chequeoSheet = document.getElementById('chequeoSheet');

  function respuestasChequeo(){
    var r = {};
    Array.from(document.querySelectorAll('#chequeoSheet .chq-esc')).forEach(function(e){
      var b = e.querySelector('button.on');
      if(b) r[e.dataset.chq] = Number(b.dataset.v);
    });
    return r;
  }

  chequeoSheet.addEventListener('click', function(e){
    if(e.target === chequeoSheet){ chequeoSheet.classList.remove('open'); return; }

    // La × de una explicación abierta. Va ANTES que la «i»: las dos viven
    // dentro del mismo bloque y si se mirara primero la «i» nunca se
    // llegaría aquí.
    var cerrarInfo = e.target.closest('.chq-info-x');
    if(cerrarInfo){
      var caja = cerrarInfo.closest('.chq-info');
      var suBloque = cerrarInfo.closest('.chq-bloque');
      if(caja) caja.hidden = true;
      var suIcono = suBloque && suBloque.querySelector('.chq-ayuda');
      if(suIcono) suIcono.classList.remove('abierta');
      return;
    }

    // La «i» de cada pregunta. Se despliega debajo en vez de abrir otra hoja:
    // una hoja encima de otra tapa lo que se está contestando, y quien la
    // cierra pierde de vista la pregunta.
    var ayuda = e.target.closest('.chq-ayuda');
    if(ayuda){
      var bloque = ayuda.closest('.chq-bloque');
      var texto = bloque && bloque.querySelector('.chq-info');
      if(texto){
        texto.hidden = !texto.hidden;
        ayuda.classList.toggle('abierta', !texto.hidden);
      }
      return;
    }

    var b = e.target.closest('.chq-esc button');
    if(!b) return;
    Array.from(b.parentNode.children).forEach(function(x){ x.classList.remove('on'); });
    b.classList.add('on');
  });
  document.getElementById('chqCerrar').addEventListener('click', function(){
    chequeoSheet.classList.remove('open');
  });

  function abrirChequeo(){
    var caja = document.getElementById('chqRespuesta');
    caja.hidden = true; caja.textContent = '';
    // Las explicaciones se cierran: si se quedaran abiertas de la vez
    // anterior, la hoja arrancaría con tres párrafos y las opciones fuera de
    // pantalla, que es justo lo contrario de "tres cosas rápidas".
    Array.from(chequeoSheet.querySelectorAll('.chq-info')).forEach(function(x){ x.hidden = true; });
    Array.from(chequeoSheet.querySelectorAll('.chq-ayuda')).forEach(function(x){ x.classList.remove('abierta'); });
    var btn = document.getElementById('chqEnviar');
    btn.disabled = false; btn.textContent = 'Revisar mi semana';
    // Se vuelve al papel de revisar: si la hoja se reabre despues de una
    // revision, el boton se habia quedado en "Entiendo" y cerraba sin
    // revisar nada.
    delete btn.dataset.modo;
    document.getElementById('chqCerrar').hidden = false;
    chequeoSheet.classList.add('open');
  }
  // Sale al empezar la semana y deja de salir cuando lo CONTESTAN, no
  // cuando se les enseña. Que alguien cierre la hoja sin llenarla no es
  // haberla contestado, y darlo por bueno significaba que esa semana no se
  // le podía ajustar nada.
  //
  // Quien manda es la base y no el navegador: si contestó desde el teléfono
  // no tiene que volver a salirle en la tablet, y reinstalar la app no
  // puede resucitar un cuestionario ya llenado.
  //
  // El localStorage se queda, pero solo para no insistir el mismo día. Si
  // hoy la cerró, mañana vuelve; en cuanto la llene, no vuelve hasta el
  // lunes que viene.
  // ---- Cuándo se vuelve a preguntar ----
  //
  // Lo ÚNICO que apaga el chequeo es haberlo contestado, y eso lo dice la
  // base: existe la fila de esta semana o no existe.
  //
  // Antes se apagaba también con una marca en `localStorage` puesta ANTES de
  // contestar, para "no insistir el mismo día". Sonaba considerado y era un
  // fallo caro: quien abría la app, veía la hoja, la cerraba sin llenarla y
  // no volvía a abrir ese día se quedaba SIN CALORÍAS NUEVAS toda la semana.
  // Perder el ajuste por no molestar es un mal cambio.
  //
  // YA NO SALTA UNA VENTANA AL ABRIR.
  //
  // Saltaba, y ese fue el fallo caro: quien entraba a apuntar el desayuno se
  // encontraba una hoja en la cara, la cerraba sin leerla, y se quedaba sin
  // calorías nuevas toda la semana. Se intentó arreglar con marcas de "ya te
  // la enseñé", y cada intento empeoraba lo mismo: la app decidía por su
  // cuenta que ya estaba visto.
  //
  // Ahora hay un bloque fijo en lo alto del Diario. No tiene botón de
  // cerrar. No se va al recargar, ni al cambiar de pestaña, ni al día
  // siguiente. Se va cuando se contesta, y vuelve el lunes que viene.
  //
  // La diferencia importa: una ventana interrumpe y se cierra por reflejo;
  // un bloque espera. Nadie pierde una semana por cerrar algo sin querer.

  // Se mira al arrancar y cada vez que se guarda una respuesta.
  function pintarChequeoPendiente(pendiente){
    var b = document.getElementById('chequeoPend');
    // Va AQUI y no en `aplicarLlavesIa`: esto se vuelve a llamar cada vez
    // que se guarda una respuesta, asi que apagarlo desde fuera duraria
    // hasta el siguiente repintado y el aviso volveria solo.
    if(MIS_LLAVES && MIS_LLAVES.semanal === false) pendiente = false;
    if(b) b.hidden = !pendiente;
  }

  function revisarChequeoPendiente(){
    if(!sesion || !sesion.user) return;

    // Se busca en TODA la semana natural, no por el día exacto.
    //
    // El día de inicio se movió: quien tenía la semana empezando en martes
    // -porque cambió sus macros un martes, cuando eso aún movía el día 1-
    // pasó a tenerla en lunes. Su chequeo de esta semana está guardado con
    // el martes, y preguntando por el lunes exacto no aparece: se le
    // volvería a abrir el cuestionario de una semana que YA contestó, le
    // gastaría otra consulta de IA y podría ajustarle las calorías dos
    // veces por el mismo periodo.
    //
    // Buscando en el rango, cualquier chequeo de esos siete días lo apaga.
    var semana = isoDe(anclaSemana);
    var finSemana = new Date(anclaSemana); finSemana.setDate(finSemana.getDate() + 7);
    return sbFetch('/rest/v1/chequeos_semanales?select=semana' +
            '&user_id=eq.' + sesion.user.id +
            '&semana=gte.' + semana +
            '&semana=lt.' + isoDe(finSemana) + '&limit=1')
      .then(function(filas){
        // Lo ÚNICO que lo apaga es que exista la fila. Que se haya visto, que
        // se haya abierto o que se haya cerrado no cuenta.
        pintarChequeoPendiente(!(filas && filas.length));
      })['catch'](function(){
        // Si la consulta falla no se enseña: peor que no avisar es avisar de
        // algo ya contestado, porque llevaría a gastar otra consulta de IA y
        // a un segundo ajuste por el mismo periodo. Como el bloque es fijo y
        // no una ventana de una sola oportunidad, se vuelve a mirar en cuanto
        // se abra la app otra vez.
        pintarChequeoPendiente(false);
      });
  }

  // Tocar el bloque abre las preguntas. El bloque sigue ahí detrás: cerrar
  // la hoja no cuenta como haberla contestado.
  //
  // POR DELEGACIÓN, en `document`, y no enganchado al elemento.
  //
  // Estaba enganchado directo y a Eduardo no le funcionaba: «hace la
  // animación de tocar el botón pero no hace nada». Esa frase lo dice todo,
  // porque la animación es CSS -sale sola- y lo que faltaba era el
  // JavaScript. No conseguí reproducirlo: en el navegador de pruebas
  // funciona, el elemento existe cuando se pide el script, y nada reescribe
  // esa zona del Diario.
  //
  // Cuando no se encuentra la causa, se quita la clase entera de fallo. Con
  // delegación da igual cuándo corra el script, da igual si el elemento se
  // reemplaza después, y da igual el orden: el toque se escucha en
  // `document`, que existe siempre.
  //
  // Y el `try` no es adorno. Si `abrirChequeo` reventara, el resultado en
  // pantalla sería EXACTAMENTE el mismo síntoma -animación sí, nada
  // después- y volveríamos a estar a ciegas. Prefiero un mensaje feo a otro
  // silencio.
  document.addEventListener('click', function(e){
    var b = e.target && e.target.closest && e.target.closest('#chequeoPend');
    if(!b) return;
    try{ abrirChequeo(); }
    catch(err){
      toast('toastComida', 'No pude abrir las preguntas: ' + (err && err.message || err));
    }
  });

  // Lo que se le manda al asistente para que decida. Los días apuntados son
  // el dato que decide si hay material o no, así que se cuentan aquí y no
  // se estiman: contar de menos deja a alguien sin ajuste que sí lo merecía.
  // ---- Lo que se comió en la semana que se está cerrando ----
  //
  // OJO CON ESTO, que costó una semana de ajuste. La revisión salta el
  // PRIMER día de la semana nueva, y antes esta función contaba desde el
  // inicio de la semana ACTUAL hasta hoy. O sea: un solo día, el de hoy,
  // todavía sin apuntar nada. La IA recibía "0 días de 7", decía con toda
  // razón que no podía leer la semana... y quien había apuntado los siete
  // días se quedaba sin ajuste.
  //
  // Se cuenta la semana ANTERIOR completa, que es la que se está cerrando.
  //
  // `anterior` existe para poder seguir preguntando por la semana en curso
  // desde otros sitios sin repetir el recorrido.
  function datosDeLaSemana(anterior){
    var meta = leerMetas();
    var desde = new Date(anclaSemana);
    var hasta;                                  // exclusivo
    if(anterior){
      desde.setDate(desde.getDate() - 7);
      hasta = new Date(anclaSemana);            // los siete días de antes
    }else{
      hasta = new Date(HOY); hasta.setDate(hasta.getDate() + 1);
    }

    // Los tres macros además de las calorías. Con «2451 al día» a secas, una
    // semana con la proteína cumplida y otra con cuarenta gramos diarios de
    // menos son el MISMO dato, y para lo que se decide aquí no lo son:
    // adelgazar quedándose corto de proteína es adelgazar perdiendo también
    // músculo, y la báscula baja igual en los dos casos.
    var dias = 0, suma = 0, sP = 0, sC = 0, sG = 0;
    for(var d = new Date(desde); d < hasta; d.setDate(d.getDate() + 1)){
      var r = REGISTRO[isoDe(d)];
      if(r){
        dias++; suma += calDe(r);
        sP += Number(r.P) || 0; sC += Number(r.C) || 0; sG += Number(r.G) || 0;
      }
    }
    // CUÁNTO HACE QUE NO SE PESA. Sin esto, el cierre daba por bueno
    // ajustar calorías con dos pesos de hace tres semanas: se apuntó la
    // comida, sí, pero no hay forma de saber hacia dónde se movió el peso
    // en los días que se están juzgando. Mover la comida de alguien a
    // ciegas es peor que no moverla.
    var ultimoPeso = Object.keys(PESOS).sort().pop();
    var diasSinPesarse = ultimoPeso
      ? Math.round((HOY - new Date(ultimoPeso + 'T12:00:00')) / 86400000)
      : null;

    return {
      dias_apuntados: dias,
      dias_sin_pesarse: diasSinPesarse,
      meta_cal: calDe(meta),
      meta_p: meta.P, meta_c: meta.C, meta_g: meta.G,
      // Entre los días APUNTADOS, no entre siete: es la misma cuenta que ya
      // hacía `media_cal`. Dividir entre siete a quien apuntó cuatro días le
      // inventaría un déficit que no existió.
      media_cal: dias ? Math.round(suma / dias) : 0,
      media_p: dias ? Math.round(sP / dias) : 0,
      media_c: dias ? Math.round(sC / dias) : 0,
      media_g: dias ? Math.round(sG / dias) : 0,
      // Si la meta cambió a mitad de esta semana, `meta_cal` solo vale para
      // los últimos días y la media mezcla dos objetivos. Sin decirlo, la IA
      // lee un exceso que no existió.
      cambios_de_meta: cambiosDeMetaEn(desde, hasta)
    };
  }

  // Lo que se entrenó, para que el ajuste semanal no confunda dos cosas
  // muy distintas:
  //
  //   · Peso plano y volumen SUBIENDO  → está funcionando. Ganó músculo y
  //     perdió grasa a la vez, y tocarle las calorías sería estropearlo.
  //   · Peso plano y volumen plano     → ahí sí hay estancamiento de verdad.
  //   · Peso plano y sin entrenar      → no hay nada que ajustar: falta el
  //     estímulo, no las calorías.
  //
  // Se pide a la base y no a HISTORIAL, que solo guarda volúmenes sueltos
  // sin fecha: aquí hacen falta las dos semanas para poder compararlas.
  // ---- Las últimas semanas, resumidas ----
  //
  // Una semana suelta no basta para decidir bien, y el motivo es el ruido:
  // el peso de siete días miente con facilidad -agua, sal, glucógeno, lo que
  // tengas dentro mueven un kilo sin que hayas ganado ni perdido grasa-. Con
  // una sola semana no se distingue "no bajó" de "bajó y todavía no se ve".
  //
  // Así que se decide sobre la que cierra, pero se manda el contexto de las
  // cuatro anteriores. Resumidas por semana y no día a día: al modelo le
  // sirve la tendencia, y cuatro semanas de filas sueltas es ruido caro.
  //
  // Va con FECHA cada una. Sin fecha, cuatro números no dicen si son de un
  // mes o de medio año, y esa diferencia lo cambia todo.
  function resumenDeSemanas(cuantas){
    var out = [];
    for(var i = cuantas; i >= 1; i--){
      var ini = new Date(anclaSemana); ini.setDate(ini.getDate() - 7 * i);
      var fin = new Date(ini);         fin.setDate(fin.getDate() + 7);   // exclusivo

      var dias = 0, suma = 0, pesos = [];
      for(var d = new Date(ini); d < fin; d.setDate(d.getDate() + 1)){
        var k = isoDe(d);
        var r = REGISTRO[k];
        if(r){ dias++; suma += calDe(r); }
        if(PESOS[k] != null) pesos.push(Number(PESOS[k]));
      }
      // El peso MEDIO de la semana, no el del día que se pesó: es lo que
      // quita el ruido del día a día y deja ver hacia dónde va.
      var medio = pesos.length
        ? Math.round(pesos.reduce(function(a,b){ return a+b; }, 0) / pesos.length * 10) / 10
        : null;

      // Cuántas fotos subió esa semana. Va el NÚMERO, no las fotos: quedó
      // acordado que las imágenes no viajan a la IA en el chequeo semanal
      // -eso sería mensual, a petición y con consentimiento aparte, porque
      // el aviso de privacidad de hoy no cubre que las fotos del cuerpo
      // salgan de la app-. Saber si las subió es constancia, no contenido, y
      // es lo que un entrenador nota: "llevas tres semanas sin fotos".
      //
      // Las fotos se guardan por semana ISO -de lunes a domingo- y la semana
      // de cada quien puede empezar otro día. Se usa la semana ISO que
      // CONTIENE su inicio: no es exacto, y por eso solo se manda el conteo
      // y no se saca ninguna conclusión fina de él.
      var cuantasFotos = Object.keys(FOTOS[claveSemana(ini)] || {}).length;

      out.push({
        semana: isoDe(ini),
        dias_apuntados: dias,
        media_cal: dias ? Math.round(suma / dias) : null,
        peso_medio: medio,
        dias_con_peso: pesos.length,
        fotos: cuantasFotos
      });
    }
    return out;
  }

  // ---- El gasto MEDIDO, no estimado ----
  //
  // El número que da la app al registrarse sale de una fórmula por un factor
  // de actividad que la persona elige una vez y no se vuelve a mirar. Ese
  // factor es el error grande de todo el cálculo: pasar de "ligera" a
  // "moderada" son 300 calorías, y casi todo el mundo se sobreestima.
  //
  // Esto no lo estima: lo resta. Si comió una media de 2.400 y perdió 1,2 kg
  // en 28 días, su mantenimiento real es 2.400 + (1,2 × 7700 / 28) = 2.730.
  // No hace falta saber POR QUÉ el número estaba mal.
  //
  // Y tiene una propiedad que la fórmula no tiene: absorbe sola el error de
  // apuntar. Quien apunta 300 menos de lo que come sale con un gasto 300
  // más bajo del real, pero medido en LAS MISMAS unidades en las que apunta,
  // así que el objetivo que salga de ahí le deja el déficit correcto. Solo
  // pide que apunte igual de mal siempre, no que apunte bien.
  //
  // El peligro es el contrario del que parece: un número medido que está mal
  // es PEOR que una estimación floja, porque se deja de dudar de él. De ahí
  // las guardas, que son la mitad del trabajo.
  var GM = {
    SEMANAS: 3,     // menos que esto y el agua pesa más que la grasa
    DIAS: 5,        // días apuntados por semana
    PESAJES: 2,     // pesajes por semana
    MARGEN: 0.25    // cuánto puede alejarse del estimado antes de tirarlo
  };

  function gastoMedido(){
    var todas = resumenDeSemanas(4);
    // Solo semanas COMPLETAS de verdad. Una con tres días apuntados no dice
    // lo que se comió esa semana, dice lo que se comió tres días de ella.
    var s = todas.filter(function(x){
      return x.dias_apuntados >= GM.DIAS && x.dias_con_peso >= GM.PESAJES &&
             x.media_cal != null && x.peso_medio != null;
    });
    if(s.length < GM.SEMANAS)
      return { estado: 'faltan_semanas', semanas: s.length, faltan: GM.SEMANAS - s.length };

    // Recta de mínimos cuadrados sobre las MEDIAS semanales, no sobre los
    // pesos sueltos. El peso de un día se mueve un kilo por agua o sal; la
    // media de la semana no. Y la pendiente usa todos los puntos, no el
    // primero contra el último, que es tirar la mitad de los datos.
    var n = s.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for(var i = 0; i < n; i++){
      sx += i; sy += s[i].peso_medio; sxy += i * s[i].peso_medio; sxx += i * i;
    }
    var den = n * sxx - sx * sx;
    if(!den) return { estado: 'faltan_semanas', semanas: n, faltan: 1 };
    var kgPorSemana = (n * sxy - sx * sy) / den;

    // Ponderada por días apuntados: una semana de 7 días pesa más que una
    // de 5, porque se sabe más de ella.
    var totalCal = 0, totalDias = 0;
    for(var j = 0; j < n; j++){
      totalCal += s[j].media_cal * s[j].dias_apuntados;
      totalDias += s[j].dias_apuntados;
    }
    var mediaCal = Math.round(totalCal / totalDias);
    var gasto = Math.round(mediaCal - (kgPorSemana * KCAL_POR_KG / 7));

    // El tope de cordura. Si se aleja más de un 25% del estimado, eso no es
    // un metabolismo: es una semana rara -un viaje, una gripe, un fin de
    // semana sin apuntar- y darlo por bueno le movería las calorías por algo
    // que no volverá a pasar.
    var est = Math.round(gastoEstimado().gasto);
    if(!est || !isFinite(gasto) || gasto <= 0)
      return { estado: 'faltan_semanas', semanas: n, faltan: 1 };
    if(Math.abs(gasto - est) / est > GM.MARGEN)
      return { estado: 'fuera_de_rango', gasto: gasto, estimado: est,
               semanas: n, dias: totalDias };

    return {
      estado: 'ok',
      gasto: gasto,
      estimado: est,
      kg_por_semana: Math.round(kgPorSemana * 100) / 100,
      media_cal: mediaCal,
      semanas: n,
      dias: totalDias
    };
  }

  // Las DOS semanas que se comparan tienen que ser las mismas que las de la
  // comida, o la IA compara periodos distintos sin saberlo: diría "entrenó
  // más" mirando unos días y "comió menos" mirando otros.
  //
  // Se alinean con `anclaSemana`, que es el día en que empieza la semana de
  // ESTA persona. Antes se partía por "hace 6 días" a secas, que solo cuadra
  // si la revisión cae justo el mismo día de la semana, y no cuadra nunca
  // para quien no empieza en lunes.
  function datosDeEntreno(){
    if(!sesion || !sesion.user) return Promise.resolve(null);
    // La que se cierra: los siete días anteriores al inicio de la actual.
    var iniCerrada = new Date(anclaSemana); iniCerrada.setDate(iniCerrada.getDate() - 7);
    // Y la de antes, para tener con qué comparar.
    var iniPrevia  = new Date(anclaSemana); iniPrevia.setDate(iniPrevia.getDate() - 14);
    // Cuatro semanas para la tendencia, no solo las dos que se comparan: el
    // volumen sube y baja con las descargas, y dos puntos no distinguen una
    // descarga de un estancamiento.
    var iniTendencia = new Date(anclaSemana); iniTendencia.setDate(iniTendencia.getDate() - 28);

    var desde = isoDe(iniTendencia);
    // `exercises` viene DESDE SIEMPRE en cada sesión —nombre, volumen y las
    // series con su peso— y no lo pedía nadie. Es lo que alimenta el
    // «+9% vs anterior» de la pantalla; al cierre de semana solo llegaba el
    // volumen total, así que la IA no podía saber en QUÉ ejercicio subiste.
    return sbFetch('/rest/v1/workout_sessions' +
        '?select=session_date,total_volume,exercises&session_date=gte.' + desde +
        '&user_id=eq.' + sesion.user.id + '&order=session_date.asc')
      .then(function(filas){
        var corte = isoDe(iniCerrada);
        var finCerrada = isoDe(anclaSemana);      // exclusivo: ya es la nueva
        // LAS VECES SE CUENTAN POR DÍAS, EL VOLUMEN POR FILAS.
        //
        //  `workout_sessions` no tiene nada que impida dos filas el mismo
        //  día, y «Guardar sesión» hace un POST plano cada vez que se pulsa.
        //  Contando filas, quien guarda dos veces un martes —o le da dos
        //  veces al botón sin querer— le decía a la IA que entrenó el doble.
        //
        //  Y descuadraba dos cosas que dicen lo mismo: el anillo de Progreso
        //  cuenta DÍAS con sesión, así que la pantalla ponía «1 día» y el
        //  cierre leía «entrenó 2 veces». Ahora las dos cuentan lo mismo, y
        //  de paso «veces» no puede pasar de 7.
        //
        //  El volumen sí suma TODAS las filas: si entrenó dos veces ese día,
        //  las dos cuentan como trabajo hecho.
        var estaSemana = [], anterior = [];
        var diasEsta = {}, diasAntes = {};
        (filas || []).forEach(function(f){
          if(f.session_date >= finCerrada) return;   // de la semana en curso
          var esDeEsta = f.session_date >= corte;
          (esDeEsta ? estaSemana : anterior).push(Number(f.total_volume) || 0);
          (esDeEsta ? diasEsta : diasAntes)[f.session_date] = true;
        });
        var suma = function(a){ return a.reduce(function(x, y){ return x + y; }, 0); };

        // Y las cuatro semanas por separado, con su fecha, para la tendencia.
        var porSemana = [];
        for(var i = 4; i >= 1; i--){
          var ini = new Date(anclaSemana); ini.setDate(ini.getDate() - 7 * i);
          var fin = new Date(ini);         fin.setDate(fin.getDate() + 7);
          var a = isoDe(ini), b = isoDe(fin);
          var v = (filas || []).filter(function(f){ return f.session_date >= a && f.session_date < b; });
          porSemana.push({
            semana: a,
            // Por días, igual que arriba: dos filas del mismo día son un
            // día de entreno, no dos.
            sesiones: Object.keys(v.reduce(function(o, f){ o[f.session_date] = 1; return o; }, {})).length,
            volumen: Math.round(v.reduce(function(x, f){ return x + (Number(f.total_volume) || 0); }, 0))
          });
        }

        // ---- EJERCICIO POR EJERCICIO ----
        //
        //  El volumen total esconde lo que de verdad pasa: si subes un 10%
        //  en piernas y bajas un 10% en espalda, la suma sale plana y se lee
        //  «estancado» cuando hay una mitad avanzando y otra frenada.
        //
        //  Se mira el PESO MÁXIMO de cada semana y no el volumen: subir de
        //  25 a 27 kg es progreso aunque hicieras una serie menos, y es lo
        //  que la persona reconoce como «subí».
        var ventanas = [];
        for(var k = 4; k >= 1; k--){
          var vi = new Date(anclaSemana); vi.setDate(vi.getDate() - 7 * k);
          var vf = new Date(vi);          vf.setDate(vf.getDate() + 7);
          ventanas.push({ a: isoDe(vi), b: isoDe(vf) });
        }

        var porEj = {};
        (filas || []).forEach(function(f){
          var w = -1;
          for(var j = 0; j < ventanas.length; j++){
            if(f.session_date >= ventanas[j].a && f.session_date < ventanas[j].b) w = j;
          }
          if(w < 0) return;
          (f.exercises || []).forEach(function(ej){
            if(!ej || !ej.nombre) return;
            var fila = porEj[ej.nombre] || (porEj[ej.nombre] =
              [{p:0,v:0},{p:0,v:0},{p:0,v:0},{p:0,v:0}]);
            // El volumen tal cual se guardó, para que cuadre con el
            // `total_volume` que usa el resto de la app.
            fila[w].v += Number(ej.volumen) || 0;

            // EL PESO, SOLO DE LAS SERIES HECHAS. Las filas se rellenan
            // solas con lo de la sesión anterior, y se puede teclear un
            // peso «para la próxima» sin llegar a levantarlo. Contándolo,
            // una intención se convierte en un récord y la IA le dice
            // «subiste a 50 kg» a quien no lo movió — que es justo el tipo
            // de mentira comprobable que hace que una app deje de valer.
            //
            // Y si no hay NINGUNA marcada —mucha gente no usa las
            // palomitas— se cuentan todas: mejor eso que dejar el
            // ejercicio en cero y que desaparezca de la lista.
            var hechas = (ej.series || []).filter(function(x){ return x.hecho; });
            (hechas.length ? hechas : (ej.series || [])).forEach(function(x){
              var pe = Number(x.peso) || 0;
              if(pe > fila[w].p) fila[w].p = pe;
            });
          });
        });

        var ejercicios = Object.keys(porEj).map(function(n){
          var w = porEj[n], ahora = w[3];

          // LA ÚLTIMA VEZ QUE LO HIZO ANTES DE ESTA SEMANA, no «la semana
          // pasada» a secas. Quien entrena un ejercicio cada quince días
          // tenía la semana anterior en cero, y comparar contra ese cero lo
          // convertía en un estreno: «↑ SUBIÓ de 0 a 40».
          var antes = { p: 0, v: 0 };
          for(var j = 2; j >= 0; j--){
            if(w[j].p){ antes = w[j]; break; }
          }

          // Semanas seguidas sin superar el mejor peso de antes. Las
          // semanas que no hizo el ejercicio no cuentan: no haberlo hecho
          // no es estar atorado.
          var mejor = 0, sinSubir = 0;
          for(var j = 0; j < 4; j++){
            if(!w[j].p) continue;
            if(w[j].p > mejor){ mejor = w[j].p; sinSubir = 0; }
            else sinSubir++;
          }

          return {
            nombre: n,
            peso: ahora.p, peso_antes: antes.p,
            vol: Math.round(ahora.v), vol_antes: Math.round(antes.v),
            semanas_sin_subir: sinSubir,
            // ESTRENO, y no una subida. Sin esto, un ejercicio que se añade
            // a la rutina -o uno al que se le cambia el nombre, que para
            // esta cuenta es lo mismo- salía como «↑ SUBIÓ de 0 a 12».
            nuevo: !antes.p && ahora.p > 0
          };
        // SOLO LO QUE HIZO ESTA SEMANA. Al comparar contra «la última vez
        // que lo hizo» en vez de contra la semana pasada, un ejercicio que
        // se dejó de hacer empezó a salir como «0 kg (antes 20) ↓ bajó»:
        // se lee como un derrumbe y lo que pasó es que ya no lo hace.
        //
        // Esta lista es «qué hiciste esta semana y cómo se compara». Lo que
        // no se hizo no tiene nada que comparar.
        }).filter(function(e){ return e.peso > 0; });

        // Los OCHO que más dicen, no todos. Con veinte ejercicios y cuatro
        // semanas esto se vuelve una hoja de cálculo, y lo que sale al otro
        // lado es un mensaje corto de lunes.
        //
        // «Lo que más dice» es lo que más se movió -arriba o abajo- o lo que
        // más tiempo lleva atorado: lo demás es ruido de fondo.
        ejercicios.sort(function(x, y){
          var pesa = function(e){
            // UN ESTRENO NO ES UNA NOTICIA. Contándolo como «subió de 0»
            // puntuaba 100 y se llevaba los primeros puestos: bastaba
            // añadir tres ejercicios para que el que lleva un mes atorado
            // —lo único accionable que hay— se cayera de la lista.
            if(e.nuevo) return 1;
            var base = e.peso_antes || 1;
            return Math.max(Math.abs(e.peso - e.peso_antes) / base * 100,
                            e.semanas_sin_subir * 15);
          };
          return pesa(y) - pesa(x);
        });

        return {
          sesiones: Object.keys(diasEsta).length,
          sesiones_antes: Object.keys(diasAntes).length,
          // CUÁNTOS DIJO QUE IBA A ENTRENAR. Sin esto, «entrenó 4 veces» no
          // se puede juzgar: cuatro es la semana perfecta de quien planea
          // cuatro y es dejarse dos de quien planea seis. La regla del
          // cierre —«peso plano y entrenó poco → le falta estímulo, no
          // calorías»— no tenía con qué medir «poco».
          //
          // Es el mismo dato que el anillo de Progreso y el mismo que fija
          // el factor de actividad de sus calorías. Ya estaba; no se
          // mandaba. Va `null` y no un número inventado si no se sabe:
          // el servidor prefiere no decir nada a decir una cifra falsa.
          dias_previstos: (reg && reg.dias >= 1 && reg.dias <= 7) ? Number(reg.dias) : null,
          volumen: Math.round(suma(estaSemana)),
          volumen_antes: Math.round(suma(anterior)),
          por_semana: porSemana,
          ejercicios: ejercicios.slice(0, 8)
        };
      })['catch'](function(){ return null; });   // sin esto, igual se ajusta
  }

  document.getElementById('chqEnviar').addEventListener('click', function(){
    var btn = this;
    if(btn.disabled) return;
    // Ya revisada: el mismo boton cierra. Se comprueba lo PRIMERO, antes de
    // deshabilitarlo, o el clic de cerrar gastaria otra consulta de IA.
    if(btn.dataset.modo === 'cerrar'){
      chequeoSheet.classList.remove('open');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Revisando…';

    var caja = document.getElementById('chqRespuesta');
    // Con FECHA. Antes iban ocho números sueltos: el modelo no podía saber
    // si eran de ocho días seguidos o de tres meses, y eso cambia por
    // completo lo que significan.
    var desdePesos = new Date(anclaSemana); desdePesos.setDate(desdePesos.getDate() - 28);
    var pesosRecientes = Object.keys(PESOS).sort()
      .filter(function(k){ return k >= isoDe(desdePesos); })
      .map(function(k){ return { fecha: k, kg: Number(PESOS[k]) }; });

    // Las tres a la vez: son tres consultas independientes y esperarlas en
    // fila haria que la persona mirase "Revisando..." el triple de tiempo.
    // Lo que se le manda a la IA se guarda ADEMÁS en el historial, y se
    // apunta aquí, una sola vez. Recalcularlo al guardar daría números
    // distintos a los que la IA acaba de juzgar —el reloj corre entre una
    // cosa y otra, y a medianoche cambia hasta el día— y el historial
    // contaría una semana que nadie miró.
    var laFoto = null;

    Promise.all([datosDeEntreno(), chequeosDeAntes(), cinturasRecientes()])
    .then(function(extra){
      var d = datosDeLaSemana(true);
      var sem = resumenDeSemanas(4);
      laFoto = fotoDeLaSemana(d, sem, extra[0]);
      return iaLlamar({
        accion: 'semana',
        // La semana que se CIERRA, no la que acaba de empezar: cuando esto
        // salta, la nueva no tiene ni un día apuntado todavía.
        datos: d,
        // Y las cuatro anteriores, para que una mala semana suelta no se
        // confunda con una tendencia.
        semanas: sem,
        // Su gasto REAL, restado de lo que comió y de lo que pesó, cuando
        // hay semanas suficientes para que signifique algo. Es lo único de
        // todo esto que no depende de lo que dijo al registrarse.
        gasto: gastoMedido(),
        pesos: pesosRecientes,
        // Sin esto, el peso plano siempre parece estancamiento. Con el
        // entreno delante se distingue lo que de verdad son dos cosas
        // distintas: no avanzar, y avanzar sin que la báscula lo enseñe.
        entreno: extra[0],
        chequeo: respuestasChequeo(),
        // Lo que convierte un dato suelto en una tendencia: hambre alta una
        // semana no dice nada, tres seguidas si.
        historial: extra[1],
        // La bascula no distingue grasa de agua de musculo; la cintura si.
        cinturas: extra[2],
        nota: document.getElementById('chqNota').value.trim() || undefined
      });
    }).then(function(r){
      caja.hidden = false;
      caja.className = 'chq-respuesta' + (r.ajusto ? ' ajusto' : '');
      caja.textContent = r.mensaje || '';

      if(r.ajusto && r.cal_nueva) aplicarCaloriasNuevas(r.cal_nueva);
      guardarChequeo(r, laFoto);

      // El mismo botón pasa a cerrar. Antes se quedaba en "Listo" apagado y
      // había que salir por "Ahora no", que ahí ya no significa nada: la
      // semana ya se revisó. Quien acaba de leer sus calorías nuevas busca
      // el botón grande, no el texto gris de abajo.
      btn.disabled = false;
      btn.textContent = 'Entiendo';
      btn.dataset.modo = 'cerrar';
      document.getElementById('chqCerrar').hidden = true;
    })['catch'](function(e){
      caja.hidden = false;
      caja.className = 'chq-respuesta';
      caja.textContent = traducirError(e.message);
      btn.disabled = false;
      btn.textContent = 'Revisar mi semana';
    });
  });

  // Se cambian las calorías manteniendo el reparto que ya tenía: subir 150
  // no es motivo para rehacerle los macros a nadie.
  function aplicarCaloriasNuevas(nuevas){
    var m = leerMetas();
    var antes = calDe(m);
    if(!antes) return;
    var f = nuevas / antes;
    var P = Math.round(m.P * f), C = Math.round(m.C * f), G = Math.round(m.G * f);

    // LO QUE LA SALUD DECLARADA NO DEJA TOCAR.
    //
    // El modelo no sabe —ni puede saber— que quien está al otro lado está
    // embarazada o tiene el riñón tocado: la función del asistente no recibe
    // las condiciones de nadie, y su propio prompt dice que no son cosa
    // suya. Así que la protección que se puso al darse de alta hay que
    // volver a ponerla aquí, o dura hasta el primer lunes.
    //
    // Sin condiciones marcadas esto es transparente: `ajustarPorSalud`
    // devuelve lo que entró sin tocar una coma.
    var conds = condicionesElegidas();
    if(conds.length){
      var b = gastoEstimado();
      var salud = ajustarPorSalud(
        { cal: nuevas, P: P, C: C, G: G, gasto: b.gasto, peso: b.peso },
        conds, { soloTopes: true });
      P = salud.P; C = salud.C; G = salud.G;
    }

    goalP.value = P;
    goalC.value = C;
    goalG.value = G;
    metasVigentes = leerMetas();       // ya lo confirmó: no vuelve a preguntar
    actualizarMetas();

    if(!sesion || !sesion.user) return;
    // Estas son las calorías que acaba de decidir la IA en el cierre de
    // semana. Si el guardado falla en silencio, la pantalla enseña las
    // nuevas y la base conserva las viejas: al recargar vuelven las de
    // antes, la persona no entiende nada, y el domingo siguiente el
    // entrenador decide sobre una meta que nunca llegó a existir.
    sbActualizarPerfil({
      goal_protein_g: Number(goalP.value),
      goal_carbs_g:   Number(goalC.value),
      goal_fat_g:     Number(goalG.value)
    })['catch'](function(e){
      toast('toastPeso', 'Tus calorías nuevas no se guardaron: ' +
            traducirError(e.message) + ' Vuelve a abrir la app.');
    });
  }

  // Se guarda siempre, ajustara o no. Que a alguien no se le tocaran las
  // calorías tres semanas seguidas por falta de registros es una historia
  // que tiene que poder leerse.
  // ---- Las semanas de antes ----
  // Una semana suelta no dice casi nada: hambre 4 de 5 pudo ser una mala
  // semana. Hambre 4 de 5 TRES SEMANAS SEGUIDAS es la señal de que el
  // déficit es demasiado, y es justo cuando la gente abandona.
  //
  // Estos datos ya se guardaban y no se le mandaban nunca: la IA juzgaba
  // cada semana como si fuera la primera. Traerlos no le cuesta nada a
  // quien usa la app -no hay que preguntarle nada más- y es lo que más
  // cambia lo que el entrenador es capaz de ver.
  function chequeosDeAntes(){
    if(!sesion || !sesion.user) return Promise.resolve([]);
    // TODO LO QUE EL CIERRE DEJÓ GUARDADO, no solo la encuesta. Desde que
    // cada cierre deja su foto hay veinte columnas por semana; aquí se
    // pedían seis y el resto se guardaba para nadie.
    //
    // Y es lo único que queda a partir de los 60 días: el teléfono solo se
    // descarga ese trozo de diario, así que `resumenDeSemanas()` no puede
    // reconstruir nada más atrás. Esta tabla es la memoria larga.
    return sbFetch('/rest/v1/chequeos_semanales' +
                   '?select=semana,hambre,energia,sueno,ajusto,cal_despues,' +
                   'cal_antes,media_cal,media_p,meta_p,peso_medio,volumen,' +
                   'dias_apuntados,sesiones' +
                   '&user_id=eq.' + sesion.user.id +
                   '&order=semana.desc&limit=5')
      // Cuatro semanas antes de esta. La de ahora se manda aparte y todavía
      // no está guardada, así que se descarta si aparece.
      .then(function(f){
        return (f || []).filter(function(x){ return x.semana !== isoDe(anclaSemana); })
                        .slice(0, 4).reverse();
      })
      ['catch'](function(){ return []; });   // sin historial se decide igual
  }

  // Las cinturas que haya, con su fecha: lo que importa es la direccion, no
  // el numero. 88 no significa nada solo; 91 -> 88 en dos meses significa
  // que esta perdiendo grasa aunque la bascula no se mueva.
  //
  // Sale de memoria y no de otra consulta: CINTURAS ya se llena al cargar
  // los pesos, de la misma tabla. Pedirlo otra vez seria pagar dos veces
  // por el mismo dato y ademas retrasar la revision.
  function cinturasRecientes(){
    return Promise.resolve(CINTURAS.slice(-6).map(function(m){
      return { log_date: m.fecha, cintura_cm: m.cm };
    }));
  }

  // ================== MIS SEMANAS ==================
  //
  //  El historial que deja el cierre de cada lunes. Cuatro números por
  //  semana —peso, comida, proteína, gym— y el resto al desplegar.
  //
  //  EL COLOR SIGNIFICA ALGO Y POR ESO SE USA POCO. Verde es «esto fue
  //  hacia donde querías». Rojo se reserva para lo único que de verdad
  //  cuesta caro y no se ve en la báscula: quedarse corto de proteína. Un
  //  peso que sube no es rojo si tu objetivo es subir, y un volumen que
  //  baja tampoco: las descargas existen y son parte del plan. Todo lo
  //  demás va en gris. Una pantalla donde todo está coloreado no dice nada.

  var SEMANAS = [];

  function cargarMisSemanas(){
    var caja = document.getElementById('semanasLista');
    if(!caja) return Promise.resolve();
    if(!sesion || !sesion.user){ caja.innerHTML = ''; return Promise.resolve(); }
    if(!SEMANAS.length) caja.innerHTML = '<p class="cmp-aviso">Cargando…</p>';

    // Sesenta y no cincuenta y dos: la base guarda doce meses, y pedir un
    // poco de más evita quedarse corto el día que la limpieza vaya un pelo
    // por detrás.
    return sbFetch('/rest/v1/chequeos_semanales' +
        '?select=semana,dias_apuntados,media_cal,cal_antes,cal_despues,' +
        'media_p,media_c,media_g,meta_p,meta_c,meta_g,' +
        'peso_medio,peso_medio_antes,volumen,volumen_antes,sesiones,cintura,' +
        'ajusto,motivo,nota' +
        '&user_id=eq.' + sesion.user.id +
        '&order=semana.desc&limit=60')
      .then(function(filas){
        SEMANAS = filas || [];
        pintarMisSemanas();
      })
      ['catch'](function(){
        // Se dice. Una lista vacía por un fallo de red se lee como «no
        // tengo semanas», y eso es mentira.
        if(!SEMANAS.length)
          caja.innerHTML = '<p class="cmp-aviso">No pude cargar tus semanas. ' +
                           'Vuelve a entrar en un momento.</p>';
      });
  }




  // ------------------------------------------------------------------
  //  LA TARJETA DE LA SEMANA
  //
  //  Se abre al tocar una semana. Enseña lo mismo de un vistazo: qué comió
  //  contra lo que tocaba, qué entrenó contra lo que tocaba, cómo se movieron
  //  sus ejercicios, y lo que le dijo su coach.
  //
  //  DE DÓNDE SALEN LOS NÚMEROS. De la fila guardada cuando están, y de los
  //  apuntes cuando no. Las columnas de medias las añadió la 0054, así que
  //  toda semana anterior a eso las tiene en null y la pantalla era una
  //  rejilla de guiones —siete semanas seguidas sin un solo dato—. Los
  //  apuntes de aquellas semanas siguen ahí; solo había que ir a buscarlos.
  //
  //  Y se calcula IGUAL que en el cierre: la media es entre los días
  //  APUNTADOS y no entre siete. Dividir entre siete a quien apuntó cuatro
  //  días le inventa un déficit que no existió, y además daría dos verdades
  //  distintas para la misma semana según por dónde se mire.
  // ------------------------------------------------------------------

  // Lo que ya se calculó en su día manda; lo que falte se rellena.
  var CACHE_SEMANA = {};

  // DE QUÉ SEMANA HABLA UNA FILA DE CHEQUEO.
  //
  //  De la ANTERIOR a la que dice su columna `semana`, siempre, y esto hay
  //  que saberlo o todo lo demás sale corrido una semana.
  //
  //  El cierre salta cuando arranca una semana nueva y juzga la que acaba de
  //  terminar —`datosDeLaSemana(true)`, y su propio comentario lo dice: «la
  //  semana que se CIERRA, no la que acaba de empezar: cuando esto salta, la
  //  nueva no tiene ni un día apuntado todavía»—. Pero la fila se guarda con
  //  `semana: isoDe(anclaSemana)`, que es la que EMPIEZA.
  //
  //  Se veía sin buscarlo: la tarjeta del asistente decía «Semana 18 de
  //  agosto al 24 de agosto» y esa misma respuesta salía en la lista como
  //  «Semana del 25 ago».
  //
  //  Se corrige AL LEER y no cambiando lo guardado. Cambiar la columna
  //  obligaría a mover con un `update` todas las filas que ya existen —y a
  //  cambiar a la vez la consulta que decide si el chequeo de esta semana ya
  //  se contestó, porque busca por esa misma clave: si las dos no se mueven
  //  juntas, a alguien se le vuelve a preguntar una semana que ya contestó,
  //  gastando otra consulta de IA y pudiendo ajustarle las calorías dos veces
  //  por el mismo periodo—. Derivarlo aquí arregla las viejas y las nuevas de
  //  golpe y no toca ni un dato.
  //
  //  Vale también si se contesta tarde o si se salta una semana: el cierre
  //  mira siempre los siete días anteriores al arranque de la semana en
  //  curso, así que la resta es la misma en todos los casos.
  function semanaQueJuzga(f){
    var d = new Date(String(f && f.semana) + 'T12:00:00');
    if(isNaN(d)) return null;
    d.setDate(d.getDate() - 7);
    return isoDe(d);
  }

  function rangoDeSemana(iso){
    var a = new Date(iso + 'T12:00:00');
    var b = new Date(a); b.setDate(b.getDate() + 6);
    return { desde: isoDe(a), hasta: isoDe(b), ini: a, fin: b };
  }

  // Los apuntes, el cardio y las sesiones de esa semana —y de la anterior,
  // que hace falta para saber si cada ejercicio subió o bajó—.
  function crudosDeSemana(iso){
    // LA SEMANA EN CURSO NO SE GUARDA EN LA CACHÉ. Las pasadas ya no cambian
    // —lo que se comió el mes pasado es lo que se comió— pero la de esta
    // semana cambia cada vez que se apunta algo. Con caché, abrir la semana
    // actual, apuntar la comida y volver a abrirla enseñaba lo de antes, y
    // eso se lee como que el apunte no se guardó.
    var enCurso = iso >= isoDe(anclaSemana);
    if(!enCurso && CACHE_SEMANA[iso]) return Promise.resolve(CACHE_SEMANA[iso]);
    if(!sesion || !sesion.user) return Promise.resolve(null);
    var r = rangoDeSemana(iso);
    var antes = new Date(r.ini); antes.setDate(antes.getDate() - 7);
    var uid = sesion.user.id;
    var q = function(tabla, campos, campoFecha, desde){
      return sbFetch('/rest/v1/' + tabla + '?select=' + campos +
        '&user_id=eq.' + uid +
        '&' + campoFecha + '=gte.' + desde +
        '&' + campoFecha + '=lte.' + r.hasta)
        ['catch'](function(){ return null; });   // sin red se enseña lo guardado
    };
    return Promise.all([
      q('diary_entries', 'entry_date,protein_g,carbs_g,fat_g,calories', 'entry_date', r.desde),
      q('cardio_logs', 'log_date,minutes', 'log_date', r.desde),
      q('workout_sessions', 'session_date,exercises,total_volume', 'session_date', isoDe(antes))
    ]).then(function(x){
      var d = { comidas: x[0], cardio: x[1], sesiones: x[2], desde: r.desde, hasta: r.hasta,
                desdeAntes: isoDe(antes) };
      if(!enCurso) CACHE_SEMANA[iso] = d;
      return d;
    });
  }

  // Las medias de la semana a partir de los apuntes, con la misma regla que
  // el cierre: se suma por día y se promedia entre los días que TIENEN algo.
  function mediasDeApuntes(comidas, desde, hasta){
    if(!Array.isArray(comidas) || !comidas.length) return null;
    var porDia = {};
    comidas.forEach(function(e){
      var f = String(e.entry_date || '').slice(0, 10);
      if(f < desde || f > hasta) return;
      var d = porDia[f] || (porDia[f] = { P:0, C:0, G:0, cal:0 });
      d.P += Number(e.protein_g) || 0;
      d.C += Number(e.carbs_g)   || 0;
      d.G += Number(e.fat_g)     || 0;
      d.cal += Number(e.calories) || 0;
    });
    var dias = Object.keys(porDia);
    if(!dias.length) return null;
    var t = { P:0, C:0, G:0, cal:0 };
    dias.forEach(function(k){ t.P += porDia[k].P; t.C += porDia[k].C; t.G += porDia[k].G; t.cal += porDia[k].cal; });
    return {
      dias: dias.length,
      P: Math.round(t.P / dias.length),
      C: Math.round(t.C / dias.length),
      G: Math.round(t.G / dias.length),
      cal: Math.round(t.cal / dias.length)
    };
  }

  // Cuántos ejercicios subieron, se quedaron igual o bajaron respecto a la
  // SEMANA ANTERIOR. Semana contra semana, siempre.
  //
  // SE COMPARA LA MEJOR SERIE, NO EL VOLUMEN DE LA SEMANA.
  //
  //  Esto empezó comparando el volumen semanal de cada ejercicio y estaba
  //  mal, aunque el número saliera redondo. El volumen de la semana sube solo
  //  con entrenar más veces: hacer press de banca dos días en vez de uno
  //  duplica su volumen semanal sin haber levantado ni un kilo más. Se vio en
  //  una semana de verdad —de 2 a 5 sesiones— y salía «subieron 10, igual 0,
  //  bajaron 0». Eso no era progreso, era frecuencia disfrazada de progreso,
  //  y en algo que se titula «progresión de fuerza» eso es mentir.
  //
  //  Progresar en fuerza es levantar MÁS PESO, o el mismo peso a más
  //  repeticiones. Así que de cada ejercicio se coge su mejor serie de esa
  //  semana —más peso primero; a igual peso, más repeticiones— y se comparan
  //  las dos mejores. Entrenar más días ya no mueve esto por sí solo.
  //
  //  SOLO LAS SERIES HECHAS. Una fila con el peso tecleado y sin palomita es
  //  una intención, no un levantamiento.
  //
  //  Y SOLO LOS QUE ESTÁN EN LAS DOS SEMANAS: uno que no se hizo la semana
  //  pasada no «bajó», simplemente no estaba, y contarlo como bajada
  //  convertiría cambiar de rutina en un suspenso.
  function progresionDeFuerza(sesiones, desde, hasta, desdeAntes){
    if(!Array.isArray(sesiones) || !sesiones.length) return null;

    // ¿Es `b` mejor serie que `a`? Más peso; a igual peso, más repeticiones.
    var mejorDe = function(a, b){
      if(!a) return b;
      if(b.peso !== a.peso) return b.peso > a.peso ? b : a;
      return b.reps > a.reps ? b : a;
    };

    var ahora = {}, antes = {};
    sesiones.forEach(function(s){
      var f = String(s.session_date || '').slice(0, 10);
      var donde = (f >= desde && f <= hasta) ? ahora
                : (f >= desdeAntes && f < desde) ? antes : null;
      if(!donde) return;
      var lista = s.exercises;
      if(typeof lista === 'string'){ try{ lista = JSON.parse(lista); }catch(e){ lista = null; } }
      if(!Array.isArray(lista)) return;
      lista.forEach(function(ej){
        var n = String((ej && (ej.nombre || ej.name)) || '').trim();
        if(!n || !ej || !Array.isArray(ej.series)) return;
        ej.series.forEach(function(se){
          if(!se || se.hecho === false) return;
          var reps = Number(se.reps) || 0;
          if(!reps) return;              // una serie sin repeticiones no es nada
          donde[n] = mejorDe(donde[n], { peso: Number(se.peso) || 0, reps: reps });
        });
      });
    });

    var subieron = 0, iguales = 0, bajaron = 0;
    Object.keys(ahora).forEach(function(n){
      var a = antes[n], b = ahora[n];
      if(!a || !b) return;                         // no estaba: no se juzga
      if(b.peso > a.peso || (b.peso === a.peso && b.reps > a.reps)) subieron++;
      else if(b.peso < a.peso || (b.peso === a.peso && b.reps < a.reps)) bajaron++;
      else iguales++;
    });
    if(!subieron && !iguales && !bajaron) return null;
    return { subieron: subieron, iguales: iguales, bajaron: bajaron };
  }


  // ¿Logró sus macros?
  //
  //  Los cuatro dentro del 90-110 % de su meta. Los cuatro, no tres: la
  //  gracia del reparto es que se cumpla entero, y dar por bueno «casi» en
  //  proteína es justo lo que hace que no se note que falta.
  //
  //  El margen es simétrico a propósito. Pasarse de calorías cuenta igual que
  //  quedarse corto, y en proteína quedarse corto es lo que más pesa, pero
  //  premiar el exceso ahí llevaría a comer de más «por si acaso».
  function logroSusMacros(m){
    var dentro = function(hecho, meta){
      if(hecho == null || meta == null || !(meta > 0)) return null;
      var p = hecho / meta;
      return p >= 0.9 && p <= 1.1;
    };
    var v = [dentro(m.P, m.metaP), dentro(m.C, m.metaC),
             dentro(m.G, m.metaG), dentro(m.cal, m.metaCal)];
    if(v.some(function(x){ return x === null; })) return null;   // faltan datos
    return v.every(Boolean);
  }

  // Junta la fila guardada con lo que se calcule de los apuntes.
  function armarSemana(f, crudos){
    var m = {
      P: f.media_p, C: f.media_c, G: f.media_g, cal: f.media_cal,
      metaP: f.meta_p, metaC: f.meta_c, metaG: f.meta_g, metaCal: f.cal_antes,
      dias: f.dias_apuntados, sesiones: f.sesiones,
      cardio: null, metaCardio: null, metaDias: null, prog: null,
      peso: f.peso_medio != null ? Number(f.peso_medio) : null,
      pesoAntes: f.peso_medio_antes != null ? Number(f.peso_medio_antes) : null,
      cintura: f.cintura != null ? Number(f.cintura) : null,
      cinturaAntes: null
    };
    if(crudos){
      var med = mediasDeApuntes(crudos.comidas, crudos.desde, crudos.hasta);
      if(med){
        // Solo se rellena lo que falta: lo guardado es lo que la IA vio.
        if(m.P == null) m.P = med.P;
        if(m.C == null) m.C = med.C;
        if(m.G == null) m.G = med.G;
        if(m.cal == null) m.cal = med.cal;
        if(m.dias == null) m.dias = med.dias;
      }
      if(Array.isArray(crudos.cardio)){
        m.cardio = crudos.cardio.reduce(function(a, c){
          var f2 = String(c.log_date || '').slice(0, 10);
          return (f2 >= crudos.desde && f2 <= crudos.hasta) ? a + (Number(c.minutes) || 0) : a;
        }, 0);
      }
      if(Array.isArray(crudos.sesiones)){
        if(m.sesiones == null){
          var d = {};
          crudos.sesiones.forEach(function(s){
            var f2 = String(s.session_date || '').slice(0, 10);
            if(f2 >= crudos.desde && f2 <= crudos.hasta) d[f2] = 1;
          });
          m.sesiones = Object.keys(d).length;
        }
        m.prog = progresionDeFuerza(crudos.sesiones, crudos.desde, crudos.hasta, crudos.desdeAntes);
      }
    }
    // ---- El cuerpo: peso y cintura ----
    //
    //  No hace falta pedir nada al servidor. `PESOS` y `CINTURAS` ya vienen
    //  cargados de UN AÑO al arrancar la app —los usa la gráfica de Peso—,
    //  así que cualquier semana del último año se reconstruye sin una sola
    //  consulta más.
    //
    //  EL PESO ES LA MEDIA DE LA SEMANA, no el del día que se pesó. Medio
    //  kilo de agua y sal entra y sale en un día; una media contra otra media
    //  es lo único que dice algo en siete días.
    var mediaPesoDe = function(desde, hasta){
      var v = [];
      Object.keys(PESOS || {}).forEach(function(k){
        if(k >= desde && k <= hasta && PESOS[k] != null) v.push(Number(PESOS[k]));
      });
      if(!v.length) return null;
      return Math.round(v.reduce(function(a, b){ return a + b; }, 0) / v.length * 10) / 10;
    };
    if(crudos){
      if(m.peso == null)      m.peso      = mediaPesoDe(crudos.desde, crudos.hasta);
      if(m.pesoAntes == null) m.pesoAntes = mediaPesoDe(crudos.desdeAntes, crudos.desde);

      //  LA CINTURA NO SE PROMEDIA: se mide cada cuatro semanas, así que la de
      //  la semana es la última que caiga dentro, y la de comparación es la
      //  anterior a esa semana, venga de cuando venga. Promediar dos medidas
      //  separadas por un mes no significaría nada.
      var dentro = (CINTURAS || []).filter(function(c){
        return c.fecha >= crudos.desde && c.fecha <= crudos.hasta;
      });
      if(m.cintura == null && dentro.length) m.cintura = Number(dentro[dentro.length - 1].cm);
      var previas = (CINTURAS || []).filter(function(c){ return c.fecha < crudos.desde; });
      if(previas.length) m.cinturaAntes = Number(previas[previas.length - 1].cm);
    }

    // Las metas de entreno son las de HOY. No se guardan por semana, así que
    // para una semana vieja son las de ahora y no las de entonces; se prefiere
    // eso a no enseñar nada, pero conviene saberlo antes de leer «4 / 7» de
    // hace tres meses como un suspenso de entonces.
    //
    // `reg.dias` y no el perfil para los días: es el mismo número —el perfil
    // lo vuelca ahí al cargar— y así sigue valiendo si alguien lo cambia en
    // la pantalla sin haber recargado.
    m.metaDias   = (reg && reg.dias != null) ? Number(reg.dias) : null;
    m.metaCardio = (MI_PERFIL && MI_PERFIL.cardio_goal_min != null)
                   ? Number(MI_PERFIL.cardio_goal_min) : null;
    // LAS METAS DE MACROS QUE NO SE GUARDARON. Sin ellas la tarjeta enseñaba
    // «152g / —» en los tres y el sello se quedaba en «no hay datos
    // suficientes» aunque estuviera todo lo demás, porque `logroSusMacros`
    // necesita los cuatro pares para poder decir nada. Las filas anteriores a
    // la 0054 no las tienen; las calorías sí, porque `cal_antes` es más vieja.
    //
    // Son las de HOY, como las de entreno y por la misma razón. Solo se
    // rellena lo que falta, así que una semana que guardó las suyas conserva
    // las suyas.
    var suyas = leerMetas();
    if(suyas){
      if(m.metaP == null) m.metaP = suyas.P;
      if(m.metaC == null) m.metaC = suyas.C;
      if(m.metaG == null) m.metaG = suyas.G;
    }
    if(m.metaCal == null) m.metaCal = calDe({ P: m.metaP, C: m.metaC, G: m.metaG });
    return m;
  }

  // De quién es esta semana. Del perfil cargado, y si no del nombre que ya
  // se está enseñando en Perfil. Nunca vacío: la tarjeta lleva encabezado, y
  // un encabezado en blanco se ve roto.
  function nombreDeQuienEs(){
    var n = (MI_PERFIL && MI_PERFIL.full_name) || '';
    if(!n){
      var el = document.getElementById('profNombre');
      n = el ? el.textContent.trim() : '';
    }
    return n || 'Tu semana';
  }

  // El mismo rango, corto, para la lista: «del 18 al 24 de agosto». Antes
  // decía solo «Semana del 18 ago», que no dice hasta cuándo llega.
  //
  // Cuando la semana cambia de mes hay que nombrar los dos —«del 30 de agosto
  // al 5 de septiembre»—; con uno solo se lee como si empezara y acabara en
  // el mismo mes.
  function rangoCorto(iso){
    var r = rangoDeSemana(iso);
    if(!r || isNaN(r.ini)) return '';
    var mes = function(d){ return MESES_LARGO[d.getMonth()]; };
    return r.ini.getMonth() === r.fin.getMonth()
      ? 'del ' + r.ini.getDate() + ' al ' + r.fin.getDate() + ' de ' + mes(r.fin)
      : 'del ' + r.ini.getDate() + ' de ' + mes(r.ini) +
        ' al ' + r.fin.getDate() + ' de ' + mes(r.fin);
  }

  // El rango en palabras: «18 de agosto al 24 de agosto».
  //
  // CON LA MISMA GUARDA QUE `rangoCorto`, y por el mismo motivo: las dos
  // reciben lo que devuelve `semanaQueJuzga`, que devuelve `null` a
  // propósito cuando la fila no trae una fecha que se pueda leer. Su
  // hermana lo miraba y esta no, así que la misma fila daba «Semana » en
  // la lista y «Semana NaN de undefined al NaN de undefined» en la
  // tarjeta. Hoy no pasa —`semana` es `date not null` y todas las filas
  // vienen de la base—, pero la única razón de que no pase está en el
  // otro fichero.
  function rangoEnPalabras(iso){
    var r = rangoDeSemana(iso);
    if(!r || isNaN(r.ini)) return '';
    var dia = function(d){ return d.getDate() + ' de ' + MESES_LARGO[d.getMonth()]; };
    return dia(r.ini) + ' al ' + dia(r.fin);
  }

  function filaMacro(rotulo, hecho, meta, unidad){
    var v = (hecho == null ? '—' : Math.round(hecho) + unidad) + ' / ' +
            (meta  == null ? '—' : Math.round(meta)  + unidad);
    return '<div class="ts-fila"><span>' + escapar(rotulo) + '</span><b>' + escapar(v) + '</b></div>';
  }

  function tarjetaDeSemana(f, m){
    var logro = logroSusMacros(m);
    var sello = logro === null
      ? '<div class="ts-sello ts-gris">⚪ No hay datos suficientes</div>'
      : logro
        ? '<div class="ts-sello ts-verde">🟢 Logró sus macros</div>'
        : '<div class="ts-sello ts-rojo">🔴 No logró sus macros</div>';

    // ---- Cuerpo ----
    //
    //  Va en las MISMAS dos columnas que Alimentos y Ejercicio, no en una
    //  fila aparte: son dos datos y dos columnas ya hay. Con una fila suelta
    //  la tarjeta se queda con tres anchos distintos y se ve descuadrada.
    //
    //  La diferencia además del número: «84,3 kg» no dice nada sin saber de
    //  dónde viene. Con flecha, que es lo que se lee de un vistazo.
    //
    //  SIN COLOR, a propósito. Bajar es bueno para quien adelgaza y malo para
    //  quien intenta ganar, así que un verde fijo le diría a la mitad de la
    //  gente que lo está haciendo mal. Aquí se da el dato y ya.
    var conSigno = function(d, unidad){
      if(d == null) return '';
      var v = Math.abs(Math.round(d * 10) / 10);
      if(v < 0.05) return '  =';
      return '  ' + (d < 0 ? '↓' : '↑') + ' ' + String(v).replace('.', ',') + ' ' + unidad;
    };
    var unaMedida = function(rotulo, valor, antes, unidad){
      if(valor == null) return '<div class="ts-fila"><span>' + rotulo + '</span><b>—</b></div>';
      var txt = String(Math.round(valor * 10) / 10).replace('.', ',') + ' ' + unidad;
      return '<div class="ts-fila"><span>' + rotulo + '</span><b>' +
             escapar(txt + (antes == null ? '' : conSigno(valor - antes, unidad))) +
             '</b></div>';
    };
    var cuerpo = (m.peso != null || m.cintura != null)
      ? '<div class="ts-seccion">Cuerpo</div>' +
        '<div class="ts-columnas ts-cuerpo">' +
          '<div class="ts-col">' + unaMedida('Peso', m.peso, m.pesoAntes, 'kg') + '</div>' +
          '<div class="ts-col">' + unaMedida('Cintura', m.cintura, m.cinturaAntes, 'cm') + '</div>' +
        '</div>'
      : '';

    var prog = m.prog
      ? '<div class="ts-seccion">Progresión de fuerza</div>' +
        '<div class="ts-prog">' +
          '<span>↑ Subieron <b>' + m.prog.subieron + '</b></span>' +
          '<span>= Igual <b>' + m.prog.iguales + '</b></span>' +
          '<span>↓ Bajaron <b>' + m.prog.bajaron + '</b></span>' +
        '</div>'
      : '';

    // ---- Los dos textos, plegados ----
    //
    //  Van cerrados y se abren al tocarlos. Abiertos son diez o doce líneas
    //  cada uno y empujan los números tan arriba que hay que arrastrar para
    //  ver algo: la tarjeta pasa de leerse de una ojeada a leerse buscando.
    //  Plegados, lo que se ve de golpe son las cifras —que es a lo que se
    //  entra— y el texto está a un toque.
    //
    //  Con `<details>` y no con un botón y JavaScript: se abre y se cierra
    //  solo, se puede tocar con el teclado, y como la tarjeta se repinta
    //  entera cuando llegan los datos crudos, un estado guardado a mano se
    //  perdería en ese repintado. `open` en el HTML es lo que sobrevive.
    var plegado = function(clase, titulo, texto){
      return '<details class="' + clase + '">' +
               '<summary><b>' + titulo + '</b></summary>' +
               '<p>' + escapar(texto) + '</p>' +
             '</details>';
    };
    // Lo que le dijo su coach. Ya estaba guardado y no se enseñaba en ningún
    // sitio: es la parte que convierte una tabla de números en algo que se lee.
    var coach = f.motivo
      ? plegado('ts-plegable ts-coach', 'Tu coach de Macros 💪', f.motivo)
      : '<div class="ts-coach ts-firma"><b>Tu coach de Macros 💪</b></div>';
    var tuyo = f.nota
      ? plegado('ts-plegable ts-tuyo', 'Lo que dijiste', f.nota) : '';

    return '<div class="ts-marca">MACROS</div>' +
      '<div class="ts-nombre">' + escapar(nombreDeQuienEs()) + '</div>' +
      '<div class="ts-rango">Semana ' + escapar(rangoEnPalabras(semanaQueJuzga(f))) + '</div>' +
      sello +
      '<div class="ts-columnas">' +
        '<div class="ts-col">' +
          '<div class="ts-seccion">Alimentos</div>' +
          filaMacro('Proteína', m.P, m.metaP, 'g') +
          filaMacro('Carbos',   m.C, m.metaC, 'g') +
          filaMacro('Grasas',   m.G, m.metaG, 'g') +
          filaMacro('Calorías', m.cal, m.metaCal, '') +
        '</div>' +
        '<div class="ts-col">' +
          '<div class="ts-seccion">Ejercicio</div>' +
          '<div class="ts-fila"><span>Fuerza</span><b>' +
            (m.sesiones == null ? '—' : m.sesiones) + ' / ' +
            (m.metaDias == null ? '—' : m.metaDias) + ' días</b></div>' +
          '<div class="ts-fila"><span>Cardio</span><b>' +
            (m.cardio == null ? '—' : m.cardio) + ' / ' +
            (m.metaCardio == null ? '—' : m.metaCardio) + ' min</b></div>' +
          (m.dias == null ? '' :
            '<div class="ts-fila"><span>Apuntó</span><b>' + m.dias + ' / 7 días</b></div>') +
        '</div>' +
      '</div>' +
      cuerpo + prog + tuyo + coach;
  }

  function abrirSemana(i){
    var f = SEMANAS[i];
    if(!f) return;
    var hoja = document.getElementById('semanaSheet');
    var caja = document.getElementById('tarjetaSem');
    if(!hoja || !caja) return;
    // Se pinta YA con lo guardado y se completa cuando llegue lo demás: abrir
    // en blanco a esperar la red se lee como que no hizo nada.
    caja.innerHTML = tarjetaDeSemana(f, armarSemana(f, null));
    hoja.classList.add('open');
    crudosDeSemana(semanaQueJuzga(f)).then(function(crudos){
      // Si mientras tanto se cerró o se abrió otra, no se pisa.
      if(!hoja.classList.contains('open') || SEMANAS[i] !== f) return;
      caja.innerHTML = tarjetaDeSemana(f, armarSemana(f, crudos));
    })['catch'](function(){
      // Se calla A PROPÓSITO, y es el único sitio de la tarjeta donde vale
      // hacerlo: la hoja YA está pintada con lo que había guardado, que es lo
      // que la IA vio y lo que de verdad importa. Esto solo iba a completar
      // el cardio y la progresión. Un aviso rojo por no poder añadir un
      // adorno haría parecer rota una pantalla que se está viendo entera.
      //
      // Lo que NO se hace aquí es dejar huecos donde había datos: si esto
      // falla, en pantalla siguen los de la fila guardada.
    });
  }

  function pintarMisSemanas(){
    var caja = document.getElementById('semanasLista');
    if(!caja) return;
    if(!SEMANAS.length){
      caja.innerHTML = '<p class="cmp-aviso">Todavía no tienes semanas guardadas. ' +
        'Cada lunes, al contestar «¿Cómo te fue la semana?», se guarda aquí un ' +
        'resumen. Se conservan doce meses.</p>';
      return;
    }
    // SOLO LA FECHA Y CUÁNTOS DÍAS. Los cuatro recuadros —peso, comida,
    // proteína, gym— se quitaron a petición, y con razón: leían únicamente
    // lo guardado en la fila, y las semanas anteriores a la 0054 no tienen
    // nada guardado, así que la pantalla entera era una columna de guiones.
    // Cuatro huecos no informan de nada y ocupan el sitio de lo que sí. La
    // lista es para encontrar una semana; lo que hay dentro está en su
    // tarjeta, que además sabe reconstruirlo de los apuntes.
    caja.innerHTML = SEMANAS.map(function(f, i){
      var dias = f.dias_apuntados;
      return '<div class="sem-card sem-sola" data-sem="' + i + '">' +
        '<div class="sem-cab"><b>Semana ' + escapar(rangoCorto(semanaQueJuzga(f))) + '</b>' +
          '<span>' + (dias == null ? '' : dias + ' de 7 días') + '</span></div>' +
        '<i class="sem-ir">›</i>' +
      '</div>';
    }).join('');
  }

  // Tocar una semana abre su tarjeta.
  //
  //  ANTES SE DESPLEGABA HACIA ABAJO, dentro de la lista. El problema no era
  //  feo sino práctico: la tarjeta lleva encabezado con el nombre y el rango,
  //  dos columnas y la respuesta del coach, y metido entre las demás no se
  //  lee como una semana sino como un acordeón más. Aparte, en la lista larga
  //  el desplegado empujaba todo lo de abajo y había que buscar dónde se
  //  había quedado uno.
  (function(){
    var caja = document.getElementById('semanasLista');
    if(!caja) return;
    caja.addEventListener('click', function(e){
      var c = e.target.closest('[data-sem]');
      if(!c) return;
      abrirSemana(Number(c.dataset.sem));
    });
    var hoja = document.getElementById('semanaSheet');
    var cerrar = function(){ if(hoja) hoja.classList.remove('open'); };
    var btn = document.getElementById('semanaCerrar');
    if(btn) btn.addEventListener('click', cerrar);
    // Tocar el fondo también cierra, como las demás hojas.
    if(hoja) hoja.addEventListener('click', function(e){ if(e.target === hoja) cerrar(); });
  })();

  // LA FOTO DE LA SEMANA QUE SE CIERRA.
  //
  //  Todo esto se calcula ya para decidir si se mueven las calorías, y hasta
  //  ahora se tiraba en cuanto se tomaba la decisión. Guardarlo es lo que
  //  permite mirar atrás, y mirar atrás es donde se ve el patrón que ninguna
  //  semana suelta enseña: que las semanas en que falta proteína son las
  //  mismas en que el peso no se mueve.
  //
  //  `d` son los datos de la semana cerrada, `sem` el resumen de las últimas
  //  y `ent` lo del gimnasio. Se le pasan en vez de volver a calcularlos:
  //  recalcular aquí daría números distintos a los que la IA acaba de ver
  //  —el reloj corre entre una cosa y otra— y el historial contaría una
  //  semana que nadie juzgó.
  //
  //  Lo que no se sepa va a null y NO a cero: cero dice «comió cero gramos
  //  de proteína» y null dice «no se sabe». En la pantalla, un guion.
  //  LO QUE NO QUEPA SE DEJA FUERA, y esto no es remilgo. La foto viaja en
  //  la MISMA FILA que la nota y la decisión, y la base tiene límites en
  //  esas columnas: un solo número fuera de rango hace que Postgres rechace
  //  el INSERT entero y no se guarde nada. Ni la nota, ni el motivo, ni
  //  `ajusto`. Y entonces el lunes siguiente el chequeo vuelve a salir como
  //  si no lo hubiera contestado, gasta otra consulta de IA y puede
  //  ajustarle las calorías dos veces por el mismo periodo.
  //
  //  No es hipotético: el campo del peso no tiene `min` ni `max`, así que un
  //  dedo torpe mete un 5 o un 850; y las sesiones se cuentan por filas de
  //  `workout_sessions` y no por días, así que quien guarde cuatro entrenos
  //  al día manda 28 y el tope son 21.
  //
  //  Una casilla con un guion es infinitamente mejor que perder la semana.
  function fotoDeLaSemana(d, sem, ent){
    var enRango = function(v, min, max){
      // El `== null` primero, otra vez. `Number(null)` es 0, y 0 cabe en
      // casi todos estos rangos: sin esta línea, un hueco se convertía en un
      // cero y se deshacía justo lo que `oCero` acababa de proteger. Una
      // prueba que ya existía lo cazó al minuto.
      if(v == null) return null;
      var n = Number(v);
      return isFinite(n) && n >= min && n <= max ? n : null;
    };
    var oCero = function(v){ var n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : null; };
    // El peso MEDIO de cada semana, no el del día que se pesó: es lo que
    // quita el ruido del agua y la sal. Las dos últimas de `sem` son la que
    // se cierra y la de antes, que es justo la resta que interesa.
    var cerrada  = sem && sem.length ? sem[sem.length - 1] : null;
    var anterior = sem && sem.length > 1 ? sem[sem.length - 2] : null;
    // La cintura de esta semana, si se midió: la última medida que caiga
    // dentro de los siete días que se cierran. Una de hace un mes puesta en
    // esta fila diría que se midió cuando no lo hizo.
    var iniCerrada = new Date(anclaSemana); iniCerrada.setDate(iniCerrada.getDate() - 7);
    var desde = isoDe(iniCerrada), hasta = isoDe(anclaSemana);
    var suya = (CINTURAS || []).filter(function(m){
      return m.fecha >= desde && m.fecha < hasta;
    });

    // Cada rango es EL MISMO que el `check` de la 0054. Si allí se cambia
    // uno, hay que cambiarlo aquí; la prueba lee los rangos del propio SQL y
    // avisa si se separan.
    return {
      dias_apuntados: enRango(d && d.dias_apuntados, 0, 7),
      media_cal: enRango(oCero(d && d.media_cal), 0, 20000),
      media_p:   enRango(oCero(d && d.media_p),    0, 1000),
      media_c:   enRango(oCero(d && d.media_c),    0, 2000),
      media_g:   enRango(oCero(d && d.media_g),    0, 1000),
      meta_p:    enRango(oCero(d && d.meta_p),     0, 600),
      meta_c:    enRango(oCero(d && d.meta_c),     0, 900),
      meta_g:    enRango(oCero(d && d.meta_g),     0, 400),
      peso_medio:       enRango(cerrada  && cerrada.peso_medio,  20, 400),
      peso_medio_antes: enRango(anterior && anterior.peso_medio, 20, 400),
      volumen:       ent ? oCero(ent.volumen)       : null,
      volumen_antes: ent ? oCero(ent.volumen_antes) : null,
      // Las sesiones sí pueden ser cero de verdad —«no fue»— y eso es un
      // dato, no un hueco. Por eso no pasa por `oCero`, solo por el rango:
      // se cuentan por filas guardadas y no por días, así que cuatro
      // entrenos al día durante una semana son 28 y el tope son 21.
      sesiones: ent && ent.sesiones != null ? enRango(ent.sesiones, 0, 21) : null,
      cintura: suya.length ? enRango(suya[suya.length - 1].cm, 40, 200) : null
    };
  }

  function guardarChequeo(r, foto){
    if(!sesion || !sesion.user) return;
    var q = respuestasChequeo();
    // La foto va CON el resto, en la misma fila y la misma escritura: si se
    // guardara aparte, un fallo a medias dejaría semanas con la nota y sin
    // los números, o al revés, y no habría forma de saber cuál es cuál.
    //
    // `|| {}` para que un cierre sin foto —una versión vieja, o un fallo al
    // calcularla— siga guardando lo de siempre en vez de no guardar nada.
    var cuerpo = JSON.stringify(Object.assign({
      user_id: sesion.user.id,
      semana: isoDe(anclaSemana),
      hambre: q.hambre || null, energia: q.energia || null, sueno: q.sueno || null,
      nota: document.getElementById('chqNota').value.trim() || null,
      ajusto: !!r.ajusto,
      motivo: (r.motivo || '').slice(0, 500) || null,
      cal_antes: Math.round(datosDeLaSemana().meta_cal) || null,
      cal_despues: r.ajusto && r.cal_nueva ? Math.round(r.cal_nueva) : null
    }, foto || {}));
    var enviar = function(){
      return sbFetch('/rest/v1/chequeos_semanales?on_conflict=user_id,semana', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: cuerpo
      });
    };

    // ESTA FILA ES LA QUE APAGA EL BLOQUE. Si no se guarda, el lunes que
    // viene el chequeo vuelve a salir como si no lo hubiera contestado, y
    // contestarlo otra vez gasta otra consulta de IA y puede ajustarle las
    // calorías dos veces por el mismo periodo.
    //
    // Antes esto era un `.catch(function(){})`: el fallo se tragaba entero y
    // nadie se enteraba de nada. Ahora se reintenta una vez -casi siempre es
    // un tropiezo de red- y si sigue fallando se dice, que es lo mínimo.
    enviar()
      .then(function(){ pintarChequeoPendiente(false); })
      ['catch'](function(){
        return enviar()
          .then(function(){ pintarChequeoPendiente(false); })
          ['catch'](function(e){
            toast('toastPeso', 'Tus calorías sí se aplicaron, pero no pude ' +
                  'guardar el cuestionario: ' + traducirError(e.message));
          });
      });
  }

  // Lo que lleva y lo que le queda hoy. Sin esto, recomendar sería a
  // ciegas: no es lo mismo con 1.400 calorías libres que con 200.
  function macrosDeHoy(){
    var r = REGISTRO[isoDe(HOY)] || {P:0, C:0, G:0};
    var meta = leerMetas();
    return {
      meta_p: meta.P, meta_c: meta.C, meta_g: meta.G,
      meta_cal: Math.round(meta.P*4 + meta.C*4 + meta.G*9),
      hoy_p: Math.round(r.P), hoy_c: Math.round(r.C), hoy_g: Math.round(r.G),
      hoy_cal: Math.round(r.P*4 + r.C*4 + r.G*9)
    };
  }

  function apuntarPropuesta(idx, comida){
    var m = IA_MSGS[idx];
    if(!m || !m.alimentos || m.apuntados || !sesion) return;
    m.apuntados = true; m.comida = comida;
    pintarChat();

    // SE SIGUE DONDE SE QUEDÓ, no se empieza de cero.
    //
    //  Si uno de la cadena falla, los de antes YA ESTÁN en el servidor. El
    //  `catch` deja reintentar —y hace bien— pero antes la cadena volvía a
    //  empezar por el primero, y eso lo apuntaba OTRA VEZ: el id se genera
    //  en cada llamada, a propósito, así que el reintento crea una fila
    //  nueva en vez de chocar. El arroz salía dos veces en el diario y sus
    //  calorías contaban dobles en el anillo.
    //
    //  Deshacer los que ya entraron tampoco vale: están arriba, y borrarlos
    //  para volver a ponerlos son más viajes y más cosas que pueden fallar.
    //  Se apunta por dónde iba y se reanuda ahí.
    var desde = m.yaFueron || 0;
    var pendientes = m.alimentos.slice(desde);

    var cadena = pendientes.reduce(function(prev, a){
      return prev.then(function(){
        return sbAgregarAlimento(a, comida).then(function(fila){
          if(fila) a.id = fila.id;
          COMIDAS[comida].push(a);
          sumarAlRegistro(a, 1);
          // Uno más confirmado. Va aquí dentro y no al final: si el
          // siguiente revienta, esto ya quedó apuntado.
          m.yaFueron = (m.yaFueron || 0) + 1;
        });
      });
    }, Promise.resolve());

    cadena.then(function(){
      pintarFilasComidas();
      pintarComida();
      toast('toastIA2', m.alimentos.length + ' apuntado(s) en ' + comida.toLowerCase());
    })['catch'](function(e){
      m.apuntados = false; pintarChat();
      // Lo que ya entró SE DICE. «No se pudo guardar» a secas hace pensar
      // que no entró ninguno, y puede haber entrado la mitad: quien lo lea
      // así vuelve a apuntarlos a mano y acaba con todo duplicado.
      var hechos = m.yaFueron || 0;
      toast('toastIA2', hechos
        ? 'Se apuntaron ' + hechos + ' de ' + m.alimentos.length +
          '. Toca otra vez para los que faltan.'
        : 'No se pudo guardar: ' + traducirError(e.message));
      // La pantalla ya tiene lo que sí entró; que se vea.
      if(hechos){ pintarFilasComidas(); pintarComida(); }
    });
  }

  // El campo crece con el texto, hasta el tope que fija el CSS.
  iaTexto.addEventListener('input', function(){
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
  iaTexto.addEventListener('keydown', function(e){
    // Enter manda; Shift+Enter hace salto de línea, como en cualquier chat.
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); enviarIA(); }
  });
  document.getElementById('iaEnviar').addEventListener('click', function(){ enviarIA(); });

  document.getElementById('iaBtn').addEventListener('click', function(){
    pintarChat();
    pintarFotoIA();
    goto('asistente', true);
    setTimeout(function(){ iaTexto.focus(); }, 200);
  });
  document.getElementById('iaCerrar').addEventListener('click', function(){ back(); });


  // Único sitio donde se cambia el tema: el sol de arriba del Perfil. El
  // botón de la barra del estudio se fue -en el teléfono esa barra ni se
  // ve, así que dejaba la función a medio alcance.
  document.getElementById('profTemaBtn').addEventListener('click', toggleTheme);
})();

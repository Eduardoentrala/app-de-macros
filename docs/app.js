// Mockup de diseño — Fase −1. Datos de ejemplo; solo se recuerda la cuenta registrada.
(function(){
  var views = Array.from(document.querySelectorAll('.app-view'));
  var stack = ['registro'];

  function show(id){
    views.forEach(function(v){ v.classList.toggle('active', v.dataset.view === id); });
    Array.from(document.querySelectorAll('#toolbar button[data-go]')).forEach(function(b){
      b.classList.toggle('active', b.dataset.go === id);
    });
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

  function goto(id, push){
    if(push){ stack.push(id); } else { stack = [id]; }
    // La librería siempre se abre apilada, con su botón de regresar: ya no
    // existe como pestaña de la barra de abajo, solo se llega desde
    // "+ agregar ejercicio" dentro de Mi Rutina.
    if(id === 'library') renderBottom();
    show(id);
    animarVista(push ? 'der' : null);   // solo al entrar en una subpantalla

    // Los paneles traen sus datos al abrirse, no al arrancar la app
    if(id === 'admin' && typeof cargarPanelAdmin === 'function') cargarPanelAdmin();
    if(id === 'panel' && typeof cargarPanelCoach === 'function') cargarPanelCoach();
    if(id === 'plan'  && typeof cargarPlan       === 'function') cargarPlan();
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

  document.getElementById('toolbar').addEventListener('click', function(e){
    var btn = e.target.closest('button[data-go]');
    if(!btn) return;
    goto(btn.dataset.go, false);
  });

  document.getElementById('phoneScreen').addEventListener('click', function(e){
    var push = e.target.closest('[data-push]');
    if(push){
      if(push.dataset.meal){ comidaActual = push.dataset.meal; pintarComida(); }
      goto(push.dataset.push, true);
      return;
    }
    var backBtn = e.target.closest('[data-back]');
    if(backBtn){ back(); return; }
    var tabbar = e.target.closest('[data-tabbar]');
    if(tabbar){
      var destino = tabbar.dataset.tabbar;
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
    recalcAll();
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
      guardarDia(t)['catch'](function(){});
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

  function recalcCard(card){
    var vol = 0;
    Array.from(card.querySelectorAll('.sets-table tr')).forEach(function(tr){
      var inputs = tr.querySelectorAll('.set-input');
      if(inputs.length < 2) return;
      var reps = parseFloat(inputs[0].value) || 0;
      var peso = parseFloat(inputs[1].value) || 0;
      vol += reps * peso;
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

    // El veredicto NO se calcula aquí. Aquí solo se pinta lo que ya se
    // decidió al guardar la sesión, que es cuando tiene sentido comparar:
    // mientras se teclean las series el número baila con cada pulsación y
    // decía "-33%" a media serie, cuando aún faltaba la mitad del trabajo.
    pintarVeredicto(card);
  }

  // El veredicto vive en la propia tarjeta. Así sobrevive a los repintados
  // -que son muchos- y desaparece solo cuando se vuelve a tocar algo o
  // cuando se cambia de día, que es cuando deja de ser cierto.
  function pintarVeredicto(card){
    var badge = card.querySelector('.ex-delta');
    if(!badge) return;
    var v = card.getAttribute('data-veredicto');
    if(!v){ badge.className = 'ex-delta'; badge.textContent = ''; return; }

    var pct = Number(v);
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

  // Al tocar una serie el veredicto deja de valer: se borra hasta la
  // proxima vez que se guarde.
  function olvidarVeredicto(card){
    if(card) card.removeAttribute('data-veredicto');
  }

  function recalcAll(){
    Array.from(exList.querySelectorAll('.exercise-card')).forEach(recalcCard);
  }

  // Tarjeta de un ejercicio recién agregado (escrito a mano o tomado del catálogo).
  // Sin data-prev-vol: no hay sesión anterior, así que no muestra ningún porcentaje.
  function nuevaTarjetaEjercicio(name){
    var card = document.createElement('div');
    card.className = 'exercise-card';
    card.innerHTML = '<div class="ex-head"><div class="ex-top">'+
      '<div><div class="ex-name">'+name+' <span class="nota-badge" hidden title="Tiene notas">📝</span></div><div class="ex-delta"></div></div>'+
      '<div class="ex-vol">vol<br><b class="vol-num">0</b><span class="prev"></span></div></div>'+
      '<div class="ex-pills">'+
      '<button class="chip" data-act="grafica">📈 gráfica</button>'+
      '<button class="chip" data-act="notas">notas</button>'+
      '<span class="icon-mini">'+
      '<button data-act="subir" title="Subir ejercicio">▲</button>'+
      '<button data-act="bajar" title="Bajar ejercicio">▼</button>'+
      '<button class="danger" data-act="quitar" title="Quitar ejercicio">×</button></span></div></div>'+
      '<table class="sets-table"><tr><th>set</th><th class="num">reps</th><th class="num">peso</th><th></th></tr>'+
      '<tr><td>1</td><td class="num"><input class="set-input" value="10"></td><td class="num"><input class="set-input" value="0"></td>'+
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
      olvidarVeredicto(card);
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
        '<td class="num"><input class="set-input" value="'+reps+'"></td>'+
        '<td class="num"><input class="set-input" value="'+peso+'"></td>'+
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
  // Se guardan por nombre de ejercicio, así reaparecen la próxima vez que lo hagas.
  // Notas por ejercicio, las escribe cada quien. Vacío al empezar.
  var NOTAS = {};
  var cardNotas = null, nombreNotas = '';

  function marcaNotas(card, nombre){
    var tiene = !!(NOTAS[nombre] && NOTAS[nombre].trim());
    var badge = card.querySelector('.nota-badge');
    var pill = card.querySelector('[data-act="notas"]');
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
    document.getElementById('notasSheet').classList.add('open');
    setTimeout(function(){ document.getElementById('notasTexto').focus(); }, 60);
  }
  document.getElementById('notasGuardar').addEventListener('click', function(){
    var txt = document.getElementById('notasTexto').value.trim();
    if(txt) NOTAS[nombreNotas] = txt; else delete NOTAS[nombreNotas];
    if(cardNotas) marcaNotas(cardNotas, nombreNotas);
    document.getElementById('notasSheet').classList.remove('open');
    toast('toastRutina', txt ? 'Nota guardada' : 'Nota borrada');
  });
  document.getElementById('notasBorrar').addEventListener('click', function(){
    delete NOTAS[nombreNotas];
    document.getElementById('notasTexto').value = '';
    if(cardNotas) marcaNotas(cardNotas, nombreNotas);
    document.getElementById('notasSheet').classList.remove('open');
    toast('toastRutina', 'Nota borrada');
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
          id: tr.dataset.id || null,
          orden: series.length + 1,
          reps: Math.max(0, Number(ins[0].value) || 0),
          peso: Math.max(0, Number(ins[1].value) || 0),
          hecho: !!tr.querySelector('.set-check.done')
        });
      });
      return {
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
      '<td class="num"><input class="set-input" value="' + s.reps + '"></td>' +
      '<td class="num"><input class="set-input" value="' + s.peso + '"></td>' +
      '<td><div class="set-row-actions"><div class="set-check' + (s.hecho ? ' done' : '') + '">✓</div>' +
      '<button class="clock-btn">⏰</button><button class="rm-set">×</button></div></td></tr>';
  }

  function htmlEjercicio(ej){
    var filas = ej.series.length
      ? ej.series.map(function(s, i){ return htmlSerie(s, i + 1); }).join('')
      : htmlSerie({reps:10, peso:0, hecho:false}, 1);
    return '<div class="exercise-card" data-id="' + ej.id + '">' +
      '<div class="ex-head"><div class="ex-top">' +
      '<div><div class="ex-name">' + ej.nombre +
        ' <span class="nota-badge" hidden title="Tiene notas">📝</span></div><div class="ex-delta"></div></div>' +
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
  function guardarDia(tab){
    if(!sesion || !sesion.user || !tab) return Promise.resolve();

    var nombre = tab.textContent.trim();
    var orden = Array.from(dayTabs.querySelectorAll('.day-tab:not(.add)')).indexOf(tab);
    var ejercicios = leerEjerciciosDelDOM();

    var pDia = tab.dataset.id
      ? sbFetch('/rest/v1/routine_days?id=eq.' + tab.dataset.id, {
          method:'PATCH', headers:{ 'Prefer':'return=minimal' },
          body: JSON.stringify({ name: nombre, sort_order: orden })
        }).then(function(){ return tab.dataset.id; })
      : sbFetch('/rest/v1/routine_days', {
          method:'POST', headers:{ 'Prefer':'return=representation' },
          body: JSON.stringify({ user_id: sesion.user.id, name: nombre, sort_order: orden })
        }).then(function(r){ tab.dataset.id = r[0].id; return r[0].id; });

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
          var id = r[0].id;
          // Se apunta en la tarjeta para que el próximo guardado actualice
          var card = exList.querySelectorAll('.exercise-card')[ej.orden];
          if(card) card.dataset.id = id;
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

          var guardadas = ej.series.map(function(s){
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
                  // Igual que arriba: la fila se queda con su id
                  var card = exList.querySelectorAll('.exercise-card')[ej.orden];
                  var trs = card ? card.querySelectorAll('.sets-table tr') : [];
                  var tr = trs[s.orden];        // +1 por el encabezado, y orden empieza en 1
                  if(tr && !tr.dataset.id) tr.dataset.id = r[0].id;
                });
          });

          return Promise.all(borradas.concat(guardadas));
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
                   '&order=session_date.asc')
      .then(function(ss){
        Object.keys(SESIONES).forEach(function(k){ delete SESIONES[k]; });
        Object.keys(HISTORIAL).forEach(function(k){ delete HISTORIAL[k]; });

        (ss || []).forEach(function(s){
          SESIONES[s.session_date] = true;
          (s.exercises || []).forEach(function(e){
            if(!e || !e.nombre || !(Number(e.volumen) > 0)) return;
            (HISTORIAL[e.nombre] = HISTORIAL[e.nombre] || []).push(Number(e.volumen));
          });
        });
        pintarEjercicio();
      });
  }

  function sbCargarRutina(){
    if(!sesion || !sesion.user) return Promise.resolve();
    return Promise.all([
      sbFetch('/rest/v1/routine_days?select=id,name,sort_order&order=sort_order.asc,created_at.asc'),
      sbFetch('/rest/v1/routine_exercises?select=id,routine_day_id,name,sort_order&order=sort_order.asc,created_at.asc'),
      sbFetch('/rest/v1/exercise_sets?select=id,routine_exercise_id,sort_order,reps,weight_kg,done&order=sort_order.asc')
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
    });
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
  function startRest(secs, label){
    stopTick();
    total = secs; remaining = secs; paused = false;
    restBar.classList.remove('done');
    restPause.textContent = 'Pausar';
    restWho.textContent = label;
    restBar.classList.add('open');
    paintRest();
    tono(523.25, 0.22, 0, 0.18);   // confirma que arrancó
    ticking = setInterval(function(){
      if(paused) return;
      remaining--;
      paintRest();
      // Aviso doble a los 10 s, y cuenta atrás en los tres últimos
      if(remaining === 10){ bipAviso(); vibrar([90,90,90]); }
      if(remaining === 3 || remaining === 2 || remaining === 1){ bipCuenta(); vibrar(45); }
      if(remaining <= 0){
        stopTick();
        restBar.classList.add('done');
        restWho.textContent = '¡Descanso terminado! A la siguiente serie';
        restTime.textContent = '0:00';
        bipFinal(); vibrar([150,90,150,90,260]);
      }
    }, 1000);
  }
  restPause.addEventListener('click', function(){
    if(remaining <= 0) return;
    paused = !paused;
    restPause.textContent = paused ? 'Seguir' : 'Pausar';
  });
  document.getElementById('restPlus').addEventListener('click', function(){
    remaining += 30; total = Math.max(total, remaining);
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

  function toast(id, msg){
    var el = document.getElementById(id);
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
        '<div class="ex-lib-name">'+name+'</div>'+
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
  var inicioSemana = 1; // 0=domingo … 6=sábado. Por defecto lunes.

  function isoDe(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function haceDias(n){ var d = new Date(HOY); d.setDate(d.getDate() - n); return d; }

  // Progreso de ejercicio (se declara aquí porque la semana lo consulta al recalcular)
  // Días con sesión de fuerza guardada. Vacío al empezar: enseñar doce
  // entrenamientos de ejemplo a quien acaba de registrarse le falsea la
  // racha y el resumen de la semana en Progreso.
  var SESIONES = {};
  var CARDIO   = {};                     // minutos de cardio por día
  var META_CARDIO = 120;

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

  var iso = isoDe;
  function calDe(m){ return m.P*4 + m.C*4 + m.G*9; }

  // La semana en curso arranca en una fecha concreta (el "ancla").
  // Cambiar el día de inicio reinicia esa ancla: el conteo vuelve a cero.
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

    refrescarFlechas();
    if(typeof pintarEjercicio === 'function') pintarEjercicio();  // el progreso sigue la misma semana
    actualizarMetas(); // recalcula anillos, barras y el resumen del Diario
  }

  // Cambiar el día de inicio pide confirmación, mostrando cómo quedaría el acumulado
  var weekConfirm = document.getElementById('weekConfirm');
  // La semana ya no se elige a mano: arranca el día en que cambias tus
  // macros. Un plan nuevo es lo que de verdad marca un ciclo nuevo, así que
  // el ajuste sobra y una fecha menos que configurar es una decisión menos.
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
    var actual = sumaSemana();
    document.getElementById('wcNowCal').textContent   = mil(actual.cal);
    document.getElementById('wcNowRange').textContent = 'Empezó el ' + fmtFecha(actual.inicio);
    document.getElementById('wcNextCal').textContent  = '0';
    document.getElementById('wcNextRange').textContent = 'Empieza hoy, ' + fmtFecha(HOY);
    weekConfirm.classList.add('open');
  }

  document.getElementById('wcAccept').addEventListener('click', function(){
    if(!metasPendientes) return;
    metasVigentes = metasPendientes;

    // Hoy pasa a ser el día 1
    inicioSemana = HOY.getDay();
    anclaSemana  = new Date(HOY);

    cerrarConfirm();
    actualizarSemana();
    sbActualizarPerfil({
      goal_protein_g: metasVigentes.P,
      goal_carbs_g:   metasVigentes.C,
      goal_fat_g:     metasVigentes.G,
      week_start_dow: inicioSemana
    })['catch'](function(){});
    toast('toastPeso', 'Macros guardados · empieza tu semana');
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
    // El aviso de reinicio solo si de verdad hay algo que perder
    document.getElementById('objAviso').hidden = sumaSemana().cal === 0;
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
    var cambio = objElegido !== reg.objetivo;
    reg.objetivo = objElegido;

    var m = calcularMacros();
    goalP.value = m.P; goalC.value = m.C; goalG.value = m.G;
    metasVigentes = leerMetas();            // ya confirmado: no debe volver a preguntar
    document.getElementById('profObjetivo').innerHTML =
      NOMBRE_OBJ[reg.objetivo] + '<i>›</i>';

    if(cambio){                             // hoy pasa a ser el día 1
      inicioSemana = HOY.getDay();
      anclaSemana  = new Date(HOY);
    }
    cerrarObjetivo();
    actualizarSemana();
    toast('toastPeso', NOMBRE_OBJ[reg.objetivo] + ' · ' + mil(m.cal) + ' cal al día');

    sbActualizarPerfil({
      goal: reg.objetivo,
      goal_protein_g: m.P, goal_carbs_g: m.C, goal_fat_g: m.G,
      week_start_dow: inicioSemana
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
    var calHoyMeta = calDe(metaHoy);

    // El Diario usa estas metas y lo que realmente se ha registrado
    var hoy = REGISTRO[iso(HOY)] || {P:0,C:0,G:0};
    var sem = s.total;

    Array.from(document.querySelectorAll('.macros')).forEach(function(box){
      var esSemana = box.dataset.scope === 'semana';
      var metasBox = esSemana ? {P:P*7, C:C*7, G:G*7} : metaHoy;
      var comidoBox = esSemana ? sem : hoy;
      // En "restantes" cambia la CIFRA -lo que falta en vez de lo que va-,
      // pero la barra no: siempre se llena según se come y se queda llena al
      // llegar a la meta. Estuvo vaciándose en este modo y se leía al revés.
      // Lo que uno sobrepasa no se pinta: la barra dice cuánto de la meta
      // llevas, y ese tope es 100.
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
        var pct = meta > 0 ? Math.min(100, comido / meta * 100) : 0;
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
    if(!avisoAjustePendiente){
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
  // Se pregunta en 'change' y no en 'input': 'input' salta con cada tecla,
  // así que escribir "170" abriría el aviso tres veces. 'change' salta una
  // sola vez, al salir del campo, y solo si el valor cambió de verdad.
  [goalP, goalC, goalG].forEach(function(el){
    el.addEventListener('input', actualizarMetas);
    el.addEventListener('blur', function(){ el.value = num(el, 900); actualizarMetas(); });
    el.addEventListener('change', pedirConfirmacionMetas);
  });
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
  avatarInput.addEventListener('change', function(){
    var file = avatarInput.files && avatarInput.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      avatarBox.innerHTML = '<img alt="Foto de perfil" src="' + ev.target.result + '">';
    };
    reader.readAsDataURL(file);
  });

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
  function baseDeUnidad(u){ return (u === 'Gramos' || u === 'Onzas') ? 100 : 1; }

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
    return un(a.cant) + ' ' + (a.u === 'Gramos' ? 'g' : a.u.toLowerCase()) +
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
      return '<div class="food-card"><div class="fc-main"><div class="fc-name">'+a.n+'</div>'+
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

  function agregarAlimento(a){
    var comida = comidaActual;      // se fija: la pantalla puede cambiar mientras se guarda
    prepararAlimento(a);            // deja lista la cantidad y la porción base
    COMIDAS[comida].push(a);
    if(typeof sumarAlRegistro === 'function') sumarAlRegistro(a, +1);
    pintarComida();
    volverA('mealadd', 'diario');   // conserva el camino: diario › mealadd
    toast('toastComida', a.n + ' agregado a ' + comida);

    // Se guarda en segundo plano: la pantalla ya respondió, que es lo que
    // hace que la app se sienta rápida. Pero si el guardado falla hay que
    // deshacerlo — mostrar un alimento que no está guardado es peor que
    // no mostrarlo.
    if(sesion && sesion.user){
      sbAgregarAlimento(a, comida)
        .then(function(fila){ if(fila) a.id = fila.id; })
        ['catch'](function(e){
          var i = COMIDAS[comida].indexOf(a);
          if(i >= 0){
            COMIDAS[comida].splice(i, 1);
            sumarAlRegistro(a, -1);
            pintarComida();
          }
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
    return a.base === 100 ? '100 ' + abreviarUnidad(a.u) : 'una ' + abreviarUnidad(a.u);
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
  function elegirAlimento(a){
    abrirCantidad(a, {
      etiqueta: 'Agregar',
      alConfirmar: function(){
        var elegido = alimentoEditando;
        aplicarCantidad(elegido, cantValor.value);
        cerrarCantidad();
        agregarAlimento(elegido);
      }
    });
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

    a.guardado = true;
    pintarComida();

    sbFetch('/rest/v1/saved_foods', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({
        user_id: sesion.user.id,
        name: a.n,
        unit: a.u || 'Gramos',
        base_qty: a.base || 100,
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

    if(a.id && sesion){
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
    var quitado = COMIDAS[comida].splice(Number(b.dataset.quitar), 1)[0];
    if(quitado && typeof sumarAlRegistro === 'function') sumarAlRegistro(quitado, -1);
    pintarComida();

    // Si estaba guardado, se borra también de la base. Si el borrado falla,
    // vuelve a su sitio: la pantalla no debe mentir sobre lo que hay guardado.
    if(quitado && quitado.id && sesion){
      sbQuitarAlimento(quitado.id)['catch'](function(e){
        COMIDAS[comida].push(quitado);
        sumarAlRegistro(quitado, +1);
        pintarComida();
        toast('toastComida', 'No se pudo borrar: ' + traducirError(e.message));
      });
    }
  });

  // Listas de Frecuentes y Mis alimentos
  function tarjeta(a, conAcciones){
    return '<div class="food-card" data-alim="'+a.n+'">'+
      (conAcciones ? '<div class="fc-arrows"><button>▲</button><button>▼</button></div>' : '')+
      '<div class="fc-main"><div class="fc-name">'+a.n+'</div>'+
      '<div class="fc-sub">'+lineaMacros(a)+'</div></div>'+
      (conAcciones ? '<div class="fc-actions"><button class="btn-mini edit">Editar</button>'+
                     '<button class="btn-mini del">Borrar</button></div>' : '')+
      '</div>';
  }
  // Se pintan desde una función para poder repintarlas cuando lleguen los
  // datos del usuario. Cada lista dice qué hacer cuando está vacía: una
  // pantalla en blanco parece un error, y quien empieza las tendrá vacías.
  function pintarListas(){
    document.getElementById('frecList').innerHTML = FRECUENTES.length
      ? FRECUENTES.map(function(a){ return tarjeta(a, false); }).join('')
      : '<div class="sin-datos">Aquí aparecerán los alimentos que más repitas.</div>';

    document.getElementById('misAlimList').innerHTML = MIS_ALIMENTOS.length
      ? MIS_ALIMENTOS.map(function(a){ return tarjeta(a, true); }).join('')
      : '<div class="sin-datos">Todavía no has guardado alimentos. Créalos en la pestaña «Crear».</div>';

    document.getElementById('recetaList').innerHTML = RECETAS.length
      ? RECETAS.map(function(r){
          return '<div class="food-card"><div class="fc-main"><div class="fc-name">'+r.n+'</div>'+
            '<div class="fc-sub">'+r.cal+' kcal por porción · '+r.vis+'</div></div>'+
            '<span style="color:var(--ink-faint)">›</span></div>';
        }).join('')
      : '<div class="sin-datos">Todavía no tienes recetas.</div>';
  }
  pintarListas();

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
      if(e.target.closest('.fc-arrows')) return;     // las flechas no agregan

      // Copia: la hoja va a fijarle cantidad y porción base, y no debe
      // tocar la ficha que vive en la lista.
      elegirAlimento(Object.assign({}, a));
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
    var j = FRECUENTES.indexOf(a);
    if(j >= 0) FRECUENTES.splice(j, 1);
    pintarListas();
    toast('toastGuardados', a.n + ' borrado');

    // Si el borrado falla se devuelve a la lista: enseñar como borrado algo
    // que sigue en la base es peor que no borrarlo.
    if(a.id && sesion){
      sbFetch('/rest/v1/saved_foods?id=eq.' + a.id, { method:'DELETE' })
        ['catch'](function(e){
          MIS_ALIMENTOS.splice(i, 0, a);
          if(j >= 0) FRECUENTES.splice(j, 0, a);
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
  function pintarSugerencias(lista, texto){
    if(!texto || texto.length < 2){ mealSugeridos.innerHTML = ''; return; }

    var deMios     = lista.filter(function(a){ return a.fuente === 'mio'; });
    var deCatalogo = lista.filter(function(a){ return a.fuente === 'catalogo'; });
    var deGente    = lista.filter(function(a){ return a.fuente === 'gente'; });

    if(!lista.length){
      mealSugeridos.innerHTML = '<p class="calc-note" style="padding:14px 20px 0;">' +
        'No encontré «' + escapar(texto) + '». Créalo en la pestaña «Crear»: ' +
        'quedará guardado para ti y, si otras personas lo registran también, ' +
        'empezará a sugerirse solo.</p>';
      return;
    }

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
                ? ' <span class="cat-estado">' + a.estado + '</span>' : '') + '</div>' +
            '<div class="fc-sub">' + lineaMacros(a) +
              (a.personas ? ' · lo usan ' + a.personas : '') + '</div></div>' +
            '<span style="color:var(--ink-faint);font-size:19px;">+</span></div>';
        }).join('') + '</div>';
    };

    mealSugeridos.innerHTML =
      bloque('Tus guardados', 'lo que ya usas', deMios) +
      bloque('Base de datos', 'medido, en gramos', deCatalogo) +
      bloque('De otras personas', 'lo que registran otros', deGente);
  }

  function buscarSugerencias(){
    var texto = mealSearch.value.trim();
    if(texto.length < 2 || !sesion){ SUGERIDOS = []; pintarSugerencias([], texto); return; }

    // Las dos búsquedas van a la vez. Si una falla, la otra sigue
    // sirviendo: quedarse sin catálogo no debe dejar sin sugerencias.
    Promise.all([
      sbRpc('buscar_catalogo',  { p_texto: texto, p_limite: 12 })['catch'](function(){ return []; }),
      sbRpc('buscar_alimentos', { p_texto: texto, p_limite: 8  })['catch'](function(){ return []; })
    ]).then(function(r){
      // Si mientras llegaba la respuesta ya se escribió otra cosa, esta sobra
      if(mealSearch.value.trim() !== texto) return;

      // El catálogo va SIEMPRE en gramos, tal y como viene de USDA: por
      // 100 g y sin convertir.
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
        return {
          fuente: 'catalogo', n: x.nombre, estado: x.estado,
          u: 'Gramos', cant: 100,
          P: Number(x.proteina) || 0, C: Number(x.carbos) || 0, G: Number(x.grasas) || 0
        };
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
      pintarSugerencias(SUGERIDOS, texto);
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
    mealSearch.value = '';
    mealSugeridos.innerHTML = '';
    // El nombre lleva el estado cuando lo tiene: en el diario hay que
    // poder distinguir el arroz crudo del cocido de un vistazo, que es
    // toda la razón de que sean registros separados.
    var nombre = (a.estado && a.estado !== 'unico') ? a.n + ' (' + a.estado + ')' : a.n;
    elegirAlimento({ n:nombre, u:a.u, cant:a.cant || undefined, P:a.P, C:a.C, G:a.G });
  });

  // Crear alimento: las calorías salen solas de los macros
  var unitPills = document.getElementById('unitPills');
  var unidadActual = 'Gramos';
  var UNIDAD_ABREV = {Gramos:'(g)', Pieza:'(pza)', Servicio:'(serv)', Taza:'(taza)', Cucharada:'(cda)', Onzas:'(oz)'};
  var UNIDAD_BASE  = {Gramos:'100g', Pieza:'pieza', Servicio:'servicio', Taza:'taza', Cucharada:'cucharada', Onzas:'onza'};

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
  }

  unitPills.addEventListener('click', function(e){
    var b = e.target.closest('button');
    if(b) ponerUnidad(b.textContent);
  });

  var nfP = document.getElementById('nfP'), nfC = document.getElementById('nfC'), nfG = document.getElementById('nfG');
  function calcNuevo(){
    var P = Number(nfP.value)||0, C = Number(nfC.value)||0, G = Number(nfG.value)||0;
    document.getElementById('nfCal').textContent = mil(P*4 + C*4 + G*9);
  }
  [nfP, nfC, nfG].forEach(function(el){ el.addEventListener('input', calcNuevo); });

  // Se vuelve a "crear" siempre que se entra por el botón Crear: si no, la
  // pantalla se quedaría en modo editar desde la vez anterior.
  function limpiarFormularioAlimento(){
    alimentoGuardadoEditando = null;
    document.getElementById('nfTitulo').textContent = 'Agregar alimento';
    document.getElementById('nfSave').textContent = 'Guardar alimento';
    document.getElementById('nfName').value = '';
    nfP.value = ''; nfC.value = ''; nfG.value = '';
    ponerUnidad('Gramos');
    calcNuevo();
  }
  document.getElementById('pillCrear').addEventListener('click', limpiarFormularioAlimento);

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

      if(ed.id && sesion){
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

    var a = {n:nombre, P:Number(nfP.value)||0, C:Number(nfC.value)||0, G:Number(nfG.value)||0, u:unidadActual};
    MIS_ALIMENTOS.unshift(a);
    pintarListas();
    document.getElementById('nfName').value = '';
    nfP.value = ''; nfC.value = ''; nfG.value = ''; calcNuevo();
    agregarAlimento(a);

    // Queda en tu despensa para volver a usarlo, no solo apuntado hoy.
    sbGuardarAlimento(a).then(function(f){
      if(f) a.id = f.id;
    })['catch'](function(e){
      var i = MIS_ALIMENTOS.indexOf(a);
      if(i >= 0){ MIS_ALIMENTOS.splice(i, 1); pintarListas(); }
      toast('toastComida', 'No se pudo guardar el alimento: ' + traducirError(e.message));
    });
  });

  pintarComida();

  // ---- Progreso de ejercicio: se alimenta de las sesiones guardadas ----
  // Cada "Guardar sesión" marca ese día como día de fuerza. La semana usa la
  // misma ancla que las calorías, así que se reinicia junto con ella.
  function pintarEjercicio(){
    var filas = document.getElementById('ejFilas');
    if(!filas || !SESIONES) return;
    var ini = new Date(anclaSemana);

    var diasFuerza = 0, minCardio = 0, html = '';
    for(var i = 0; i < 7; i++){
      var d = new Date(ini); d.setDate(d.getDate() + i);
      var k = iso(d);
      var esFuturo = d > HOY;
      var esHoy = k === iso(HOY);
      var hizo = !!SESIONES[k];
      var min = CARDIO[k] || 0;
      if(hizo) diasFuerza++;
      minCardio += min;

      html += '<tr'+(esHoy ? ' class="today"' : '')+'>'+
        '<td>Día ' + (i+1) + (esHoy ? ' · hoy' : '') + '</td>'+
        '<td>' + d.getDate() + '/' + (d.getMonth()+1) + '</td>'+
        '<td>' + (hizo ? '<span class="pill-si">SI</span>' : '<span class="pill-dash">—</span>') + '</td>'+
        '<td>' + (esFuturo ? '<span class="pill-dash">—</span>'
                 : '<button class="pill-cardio" data-fecha="'+k+'">' + (min ? min + ' min' : '+ cardio') + '</button>') + '</td>'+
        '</tr>';
    }
    filas.innerHTML = html;

    document.getElementById('ejDias').textContent = diasFuerza;
    document.getElementById('ejRing').setAttribute('stroke-dashoffset', String(182 - 182 * (diasFuerza/7)));

    var fin = new Date(ini); fin.setDate(fin.getDate() + 6);
    document.getElementById('ejWeekRange').textContent = 'Del ' + fmtFecha(ini) + ' al ' + fmtFecha(fin);

    var pct = Math.min(100, Math.round(minCardio / META_CARDIO * 100));
    document.getElementById('ejCardio').textContent = minCardio;
    document.getElementById('ejCardioBar').style.width = pct + '%';
    document.getElementById('ejCardioPct').textContent = pct + '%';
  }

  // Guardar sesión = queda registrado el día de hoy como día de fuerza
  document.getElementById('saveSessionBtn').addEventListener('click', function(){
    SESIONES[iso(HOY)] = true;

    // La rutina es la PLANTILLA, que se sigue editando. Esto es el
    // HISTORIAL: una foto de lo que se hizo hoy, que ya no cambia aunque
    // mañana se reordene la rutina. De aquí salen las gráficas.
    var detalle = [], total = 0;
    Array.from(exList.querySelectorAll('.exercise-card')).forEach(function(c){
      var nombre = c.querySelector('.ex-name').childNodes[0].textContent.trim();
      var vol = 0, series = [];
      Array.from(c.querySelectorAll('.sets-table tr')).forEach(function(tr){
        var ins = tr.querySelectorAll('.set-input');
        if(ins.length < 2) return;
        var reps = Number(ins[0].value) || 0, peso = Number(ins[1].value) || 0;
        vol += reps * peso;
        series.push({ reps: reps, peso: peso, hecho: !!tr.querySelector('.set-check.done') });
      });
      if(vol > 0){
        if(!HISTORIAL[nombre]) HISTORIAL[nombre] = [];
        HISTORIAL[nombre].push(vol);

        // EL ORDEN IMPORTA: se compara contra la sesión anterior ANTES de
        // pisar la referencia con la de hoy. Al revés siempre saldría
        // "igual al anterior", porque se estaría comparando con uno mismo.
        var crudo = c.getAttribute('data-prev-vol');
        var antes = crudo === null ? null : parseFloat(crudo);
        if(antes !== null && isFinite(antes) && antes > 0){
          c.setAttribute('data-veredicto', String(Math.round((vol - antes) / antes * 100)));
        } else {
          // Primera vez que se hace este ejercicio: no hay con qué comparar.
          c.removeAttribute('data-veredicto');
        }

        c.setAttribute('data-prev-vol', vol);   // la próxima sesión compara contra esta
        detalle.push({ nombre: nombre, volumen: vol, series: series });
        total += vol;
      }
    });
    saveCurrentDay();
    pintarEjercicio();
    // Después de repintar, para que el veredicto recién decidido se vea.
    recalcAll();

    if(!sesion || !sesion.user){ toast('toastRutina', 'Sesión guardada'); return; }
    if(!detalle.length){ toast('toastRutina', 'No hay series con peso que guardar'); return; }

    var tab = activeTab();
    sbFetch('/rest/v1/workout_sessions', {
      method:'POST', headers:{ 'Prefer':'return=minimal' },
      body: JSON.stringify({
        user_id: sesion.user.id,
        session_date: iso(HOY),
        routine_day_id: (tab && tab.dataset.id) || null,
        day_name: tab ? tab.textContent.trim() : null,
        exercises: detalle,
        total_volume: total
      })
    }).then(function(){
      toast('toastRutina', 'Sesión guardada · ' + mil(total) + ' kg de volumen');
    })['catch'](function(e){
      // Se deshace lo local: si no se guardó, la racha y las gráficas no
      // deben contarla.
      delete SESIONES[iso(HOY)];
      detalle.forEach(function(d){
        if(HISTORIAL[d.nombre]) HISTORIAL[d.nombre].pop();
      });
      pintarEjercicio();
      toast('toastRutina', 'No se pudo guardar: ' + traducirError(e.message));
    });
  });

  // Cardio por día
  var cardioSheet = document.getElementById('cardioSheet');
  var csMin = document.getElementById('csMin');
  var fechaCardio = null;

  document.getElementById('ejFilas').addEventListener('click', function(e){
    var b = e.target.closest('.pill-cardio');
    if(!b) return;
    fechaCardio = b.dataset.fecha;
    var d = new Date(fechaCardio + 'T00:00:00');
    document.getElementById('csDia').textContent = fmtFecha(d);
    csMin.value = CARDIO[fechaCardio] || 30;
    cardioSheet.classList.add('open');
  });
  document.getElementById('csPresets').addEventListener('click', function(e){
    var p = e.target.closest('.preset');
    if(p) csMin.value = p.dataset.min;
  });
  document.getElementById('csSave').addEventListener('click', function(){
    if(!fechaCardio) return;
    var v = Math.max(0, Math.min(600, Number(csMin.value) || 0));
    var fecha = fechaCardio, antes = CARDIO[fecha];
    if(v) CARDIO[fecha] = v; else delete CARDIO[fecha];
    cardioSheet.classList.remove('open');
    pintarEjercicio();
    if(typeof pintarCardioPerfil === 'function') pintarCardioPerfil();
    toast('toastEjercicio', v ? v + ' min de cardio guardados' : 'Cardio quitado');

    sbGuardarCardio(fecha, v)['catch'](function(e){
      if(antes == null) delete CARDIO[fecha]; else CARDIO[fecha] = antes;
      pintarEjercicio();
      if(typeof pintarCardioPerfil === 'function') pintarCardioPerfil();
      toast('toastEjercicio', 'No se pudo guardar: ' + traducirError(e.message));
    });
  });
  cardioSheet.addEventListener('click', function(e){
    if(e.target === cardioSheet) cardioSheet.classList.remove('open');
  });

  // ---- Cardio también desde Perfil, contra la misma semana ----
  function pintarCardioPerfil(){
    var ini = new Date(anclaSemana), total = 0;
    for(var i=0;i<7;i++){ var d=new Date(ini); d.setDate(d.getDate()+i); total += CARDIO[isoDe(d)] || 0; }
    var pct = META_CARDIO > 0 ? Math.min(100, Math.round(total/META_CARDIO*100)) : 0;
    document.getElementById('perfCardioMeta').textContent = 'meta ' + META_CARDIO + ' min';
    document.getElementById('perfCardioHecho').textContent = total + ' min';
    document.getElementById('perfCardioBar').style.width = pct + '%';
    var metaEj = document.querySelector('[data-view="ejercicio"] .cardio-goal b');
    if(metaEj) metaEj.textContent = META_CARDIO + ' min';
  }

  var metaCardioSheet = document.getElementById('metaCardioSheet');
  var mcMin = document.getElementById('mcMin');
  document.getElementById('perfCardioMetaBtn').addEventListener('click', function(){
    mcMin.value = META_CARDIO;
    Array.from(document.querySelectorAll('#mcPresets .preset')).forEach(function(p){
      p.classList.toggle('active', Number(p.dataset.min) === META_CARDIO);
    });
    metaCardioSheet.classList.add('open');
  });
  document.getElementById('mcPresets').addEventListener('click', function(e){
    var p = e.target.closest('.preset'); if(p) mcMin.value = p.dataset.min;
  });
  document.getElementById('mcSave').addEventListener('click', function(){
    META_CARDIO = Math.max(0, Math.min(1200, Number(mcMin.value) || 0));
    metaCardioSheet.classList.remove('open');
    pintarEjercicio(); pintarCardioPerfil();
    toast('toastPeso', 'Meta de cardio: ' + META_CARDIO + ' min');
    sbActualizarPerfil({ cardio_goal_min: META_CARDIO })['catch'](function(){});
  });
  metaCardioSheet.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('open'); });

  // El cardio se registra desde Progreso, que es donde está el calendario
  // de la semana. En Perfil solo se ve el avance y se cambia la meta.

  pintarEjercicio();
  pintarCardioPerfil();

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

  // Guardar peso: se registra en la fecha de hoy y la gráfica se actualiza
  document.getElementById('saveWeightBtn').addEventListener('click', function(){
    var v = Number(document.getElementById('pesoInput').value);
    if(!v || v <= 0) return;
    var k = isoDe(HOY), antes = PESOS[k];
    PESOS[k] = Math.round(v * 10) / 10;
    pintarPeso();
    toast('toastPeso', 'Peso guardado: ' + PESOS[k] + ' kg');

    sbGuardarPeso(k, PESOS[k])['catch'](function(e){
      if(antes == null) delete PESOS[k]; else PESOS[k] = antes;
      pintarPeso();
      toast('toastPeso', 'No se pudo guardar: ' + traducirError(e.message));
    });
  });

  pintarPeso();

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
    Object.keys(PESOS).forEach(function(k){ delete PESOS[k]; });
    cerrarReinicio();
    pintarPeso();
    toast('toastPeso', 'Historial de peso borrado');

    if(!sesion || !sesion.user) return;
    sbFetch('/rest/v1/weight_logs?user_id=eq.' + sesion.user.id, { method:'DELETE' })
      ['catch'](function(e){
        Object.keys(antes).forEach(function(k){ PESOS[k] = antes[k]; });
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
    var k = isoDe(HOY);
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
    var hayAlgoApuntado = Object.keys(COMIDAS).some(function(m){
      return COMIDAS[m].length > 0;
    });
    if(!hayAlgoApuntado) delete REGISTRO[k];

    actualizarMetas();
    pintarRacha();
  }
  pintarRacha();

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
  function ajustarPorSalud(base, conds){
    var cal = base.cal, P = base.P, C = base.C, G = base.G;
    var notas = [], avisos = [];
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
    if(sinDeficit && cal < base.gasto) cal = Math.round(base.gasto);
    cal += extra;

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
      'confirmarlas con quien te lleva.</span>';
  }

  function calcularMacros(){
    var edad = Number(document.getElementById('regEdad').value) || 0;
    var alt  = Number(document.getElementById('regAltura').value) || 0;
    var peso = Number(document.getElementById('regPeso').value) || 0;

    var tmb = 10*peso + 6.25*alt - 5*edad + (reg.sexo === 'h' ? 5 : -161);
    var nivel = NIVEL[reg.dias];
    var gasto = tmb * nivel.f;

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
  var cajaCond = document.getElementById('regCondiciones');

  function condicionesElegidas(){
    return Array.from(cajaCond.querySelectorAll('button.on'))
                .map(function(b){ return b.dataset.cond; });
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
  });
  grupoOpciones('regDias', 'dias');
  ['regEdad','regAltura','regPeso'].forEach(function(id){
    document.getElementById(id).addEventListener('input', calcularMacros);
  });
  calcularMacros();

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
  function sbRefrescar(){
    var rt = sesion && sesion.refresh_token;
    if(!rt) return Promise.reject(new Error('Sesión caducada'));
    return fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method:'POST',
      headers:{ 'apikey': SB_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    }).then(function(r){
      if(!r.ok) throw new Error('Sesión caducada');
      return r.json();
    }).then(function(s){ guardarSesion(s); return s; });
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
          if(r.status === 401 && !reintento && sesion && sesion.refresh_token &&
             ruta.indexOf('/auth/v1/') !== 0){
            return sbRefrescar()
              .then(function(){ return sbFetch(ruta, op, true); })
              ['catch'](function(){ sesionCaducada(); throw new Error('Sesión caducada'); });
          }

          if(!r.ok){
            throw new Error((d && (d.msg || d.message || d.error_description || d.error))
                            || ('Error ' + r.status));
          }
          return d;
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
  function sbSalir(){
    if(!sesion) return Promise.resolve();
    return sbFetch('/auth/v1/logout', { method:'POST' })['catch'](function(){});
  }

  // Vuelca en `profiles` lo que el registro ya preguntó. El perfil lo creó
  // solo un trigger al darse de alta, así que aquí basta con actualizarlo.
  function sbGuardarPerfil(){
    if(!sesion || !sesion.user) return Promise.resolve();
    var m = calcularMacros();
    return sbFetch('/rest/v1/profiles?id=eq.' + sesion.user.id, {
      method:'PATCH',
      headers:{ 'Prefer':'return=minimal' },
      body: JSON.stringify({
        full_name:      document.getElementById('regNombre').value.trim(),
        age:      Number(document.getElementById('regEdad').value)   || null,
        height_cm:Number(document.getElementById('regAltura').value) || null,
        weight_kg:Number(document.getElementById('regPeso').value)   || null,
        goal: reg.objetivo,                       // 'bajar' | 'mantener' | 'subir'
        goal_protein_g: m.P, goal_carbs_g: m.C, goal_fat_g: m.G,
        condiciones: condicionesElegidas(),
        nota_salud: document.getElementById('regNotaSalud').value.trim() || null
      })
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
    if(m.indexOf('failed to fetch') >= 0 || m.indexOf('networkerror') >= 0)
                                           return 'Sin conexión. Revisa tu internet e inténtalo otra vez.';
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
          .then(function(){ goto('diario', false); return cargarDatos(); });
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

  // ---- Cerrar sesión ----
  document.getElementById('cerrarSesion').addEventListener('click', function(){
    sbSalir().then(function(){
      guardarSesion(null);
      try{ localStorage.removeItem(CLAVE); }catch(e){}
      goto('registro', false);
    });
  });

  // Al abrir: solo se entra directo si hay una sesión de verdad. Los datos
  // del formulario se recuperan igual, para no volver a pedirlos.
  restaurarCuenta();
  if(sesion && sesion.access_token){
    goto('diario', false);
    cargarDatos();
  }

  // ================= FOTOS DE PROGRESO =================
  // 4 poses por semana. La imagen se comprime en el teléfono ANTES de subirse:
  // máximo 1080 px, calidad 80–85%, objetivo 200–500 KB. El original nunca se guarda.
  var POSES = [
    {k:'frente',  t:'Frente'},
    {k:'espalda', t:'Espalda'},
    {k:'izq',     t:'Perfil izquierdo'},
    {k:'der',     t:'Perfil derecho'}
  ];
  var MAX_LADO = 1080, CAL_MAX = 0.85, CAL_MIN = 0.80;
  var OBJ_MIN = 200*1024, OBJ_MAX = 500*1024;

  var FOTOS = {};              // clave "2026-W31" -> {frente:{src,bytes,w,h,tipo}, ...}
  var inicioPrograma = null;   // lunes de la semana en que se registró; lo pone cargarDatos()
  var semanaFoto = new Date(HOY);
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
  function claveSemana(d){ var l = lunesDe(d); return l.getFullYear() + '-W' + String(numSemana(l)).padStart(2,'0'); }

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

    return fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + ruta, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + sesion.access_token,
        'Content-Type': res.tipo
      },
      body: res.blob
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error(t.slice(0,140)); });

      // Archiva la que hubiera en ese hueco: el índice único de
      // (user_id, week_key, pose) solo cuenta las no archivadas, así que hay
      // que apartarla antes de meter la nueva.
      return sbFetch('/rest/v1/progress_photos?user_id=eq.' + sesion.user.id +
                     '&week_key=eq.' + clave + '&pose=eq.' + pose, { method:'DELETE' });
    }).then(function(){
      return sbFetch('/rest/v1/progress_photos', {
        method:'POST', headers:{ 'Prefer':'return=representation' },
        body: JSON.stringify({
          user_id: sesion.user.id, week_key: clave, pose: pose,
          storage_path: ruta, bytes: res.bytes, width: res.w, height: res.h
        })
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
    return fetch(SB_URL + '/storage/v1/object/sign/' + BUCKET, {
      method:'POST',
      headers:{ 'apikey': SB_KEY, 'Authorization':'Bearer ' + sesion.access_token,
                'Content-Type':'application/json' },
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
    document.getElementById('fotoSemLabel').textContent =
      'Semana ' + (semanaDelPrograma(semanaFoto) || numSemana(lunesDe(semanaFoto)));
    document.getElementById('fotoSemRango').textContent = rangoSemana(semanaFoto);
    document.getElementById('fotoCuenta').textContent = POSES.filter(function(p){ return set[p.k]; }).length + ' / 4';

    document.getElementById('fotoGrid').innerHTML = POSES.map(function(p){
      var f = set[p.k];
      return '<div class="foto-slot'+(f?' llena':'')+'" data-pose="'+p.k+'">'+
        '<div class="foto-lienzo">'+
          (f ? '<img src="'+f.src+'" alt="'+p.t+'">'
             : '<div class="foto-vacia"><b>＋</b><span>Subir foto</span></div>')+
        '</div>'+
        '<div class="foto-pie"><b>'+p.t+'</b><span>'+
          (f ? kb(f.bytes) + ' · ' + f.w + '×' + f.h : 'Sin foto') + '</span></div>'+
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
        if(antes) FOTOS[c][pose] = antes; else delete FOTOS[c][pose];
        pintarFotos(); llenarSelectores();
        toast('toastFotos', 'No se pudo subir: ' + traducirError(e.message));
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

    if(!a || !b){
      area.innerHTML = '<p class="cmp-aviso">Sube fotos de al menos una semana para poder comparar.</p>';
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
  // PENDIENTE: las fotos todavía no se suben a Supabase. Viven solo en esta
  // variable, como base64 en memoria, y se pierden al recargar. Falta subirlas
  // al bucket privado 'progress-photos' y guardar su ficha en progress_photos.
  pintarFotos();
  llenarSelectores();

  // ================= ROLES =================
  // OJO: este selector es solo para que veas cómo cambia la interfaz.
  // La seguridad de verdad vive en Postgres (supabase/migrations/0002_roles_y_rls.sql):
  // las políticas RLS filtran las filas antes de que salgan de la base de datos.
  var ROL = 'cliente';
  var NOMBRE_ROL = {cliente:'Cliente', coach:'Coach', org_admin:'Admin org', super_admin:'Super admin'};

  // Los llena cargarPanelCoach() desde la vista mis_clientes
  var CLIENTES_DEL_COACH = [];
  var COACHES = [];

  function iniciales(nombre){
    return nombre.split(' ').map(function(p){ return p[0]; }).slice(0,2).join('').toUpperCase();
  }
  function tarjetaCliente(c){
    return '<div class="cliente-card"><div class="cliente-ava">'+iniciales(c.n)+'</div>'+
      '<div class="info"><b>'+c.n+'</b><span>'+c.obj+' · '+c.sem+' en el plan</span></div>'+
      '<span style="font:600 11px/1 sans-serif;color:var(--ink-faint);">'+c.act+'</span></div>';
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
    if(ROL === 'super_admin'){
      tit.textContent = 'Administración';
      cont.innerHTML =
        '<div class="panel-seccion">Entrenadores <small>'+COACHES.length+'</small></div>' +
        COACHES.map(function(c){
          return '<div class="cliente-card"><div class="cliente-ava">'+iniciales(c.n)+'</div>'+
            '<div class="info"><b>'+c.n+'</b><span>'+c.clientes+' clientes asignados</span></div>'+
            '<span style="font:600 11px/1 sans-serif;color:var(--ink-faint);">Coach</span></div>';
        }).join('') +
        '<div class="panel-seccion">Clientes <small>109 en total</small></div>' +
        CLIENTES_DEL_COACH.map(tarjetaCliente).join('') +
        '<p class="cmp-aviso">Como super admin ves toda la plataforma y eres el único que puede ' +
        'asignar clientes a un coach o cambiar el rol de alguien.</p>';
      return;
    }
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

  document.getElementById('rolDemo').addEventListener('change', function(){
    ROL = this.value;
    aplicarRol();
    if(document.querySelector('.app-view.active').dataset.view === 'panel') pintarPanel();
  });
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
      '<div class="searchbox"><span>🔍</span><input id="admBuscar" placeholder="Buscar por nombre o correo…" value="'+admFiltro+'"></div>'+
      '<button class="btn-primary" id="admInvitar" style="width:100%;margin-top:10px;">+ Agregar a alguien por correo</button>'+
      '<button class="btn-rename" id="admCrear" style="width:100%;margin-top:7px;">Crear entrenador con contraseña</button>'+
    '</div>'+
    '<div class="panel-seccion">Usuarios <small>'+lista.length+' de '+USUARIOS.length+'</small></div>'+
    (lista.length ? lista.map(function(u, i){
      return '<div class="usr-row'+(u.on?'':' apagado')+'" data-usr="'+USUARIOS.indexOf(u)+'">'+
        '<div class="cliente-ava">'+iniciales(u.n)+'</div>'+
        // NOMBRE_ROL y no un if de dos ramas: ahora hay cuatro roles, y con
        // el if tu propia cuenta de super admin salía etiquetada "Cliente".
        '<div class="txt"><b>'+u.n+' <span class="rol-badge '+u.r+'" style="margin:0;">'+
          (NOMBRE_ROL[u.r] || u.r)+'</span></b>'+
          '<span>'+u.c+' · '+u.extra+
            (u.estado !== 'activo' ? ' · <b class="usr-susp">'+u.estado.toUpperCase()+'</b>' : '')+
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
          '<div class="txt"><b>'+f.t+'</b><span>'+f.d+'</span></div>'+
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
    var q = '/rest/v1/alimentos_catalogo?select=id,nombre,categoria,estado,kcal,' +
            'proteina,carbos,grasas,porcion,porcion_g,fdc_id,nombre_usda,activo' +
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
            (a.estado !== 'unico' ? ' <span class="cat-estado">' + a.estado + '</span>' : '') +
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

  function abrirCatalogo(a){
    catEditando = a || null;
    var nuevo = !a;
    document.getElementById('catTitulo').textContent = nuevo ? 'Alimento nuevo' : 'Editar alimento';
    // De dónde salió el dato. Si alguien lo cambia a mano, deja de ser de
    // USDA y hay que decirlo: es lo que permite auditarlo después.
    document.getElementById('catFuente').textContent = (a && a.fdc_id)
      ? 'USDA #' + a.fdc_id + ' · ' + (a.nombre_usda || '')
      : 'Alimento propio, no viene de USDA';

    document.getElementById('catNombre').value    = a ? a.nombre : '';
    document.getElementById('catCategoria').value = a ? a.categoria : 'otros';
    document.getElementById('catEstado').value    = a ? a.estado : 'unico';
    document.getElementById('catP').value = a ? a.proteina : '';
    document.getElementById('catC').value = a ? a.carbos : '';
    document.getElementById('catG').value = a ? a.grasas : '';
    document.getElementById('catPorcion').value  = (a && a.porcion) || '';
    document.getElementById('catPorcionG').value = (a && a.porcion_g) || '';
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

    var cuerpo = {
      nombre: nombre,
      categoria: document.getElementById('catCategoria').value,
      estado: document.getElementById('catEstado').value,
      proteina: Number(document.getElementById('catP').value) || 0,
      carbos:   Number(document.getElementById('catC').value) || 0,
      grasas:   Number(document.getElementById('catG').value) || 0,
      porcion:   document.getElementById('catPorcion').value.trim() || null,
      porcion_g: Number(document.getElementById('catPorcionG').value) || null
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

  function pintarAdmin(){
    var c = document.getElementById('admCuerpo');
    c.innerHTML = admVista === 'tablero' ? pintarTablero()
                : admVista === 'usuarios' ? pintarUsuarios()
                : admVista === 'alimentos' ? pintarAlimentos()
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
  });

  document.getElementById('admCuerpo').addEventListener('click', function(e){
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
    var pw = e.target.closest('[data-pass]');
    if(pw){
      toast('toastAdmin', 'Enlace de recuperación enviado a ' + USUARIOS[Number(pw.dataset.pass)].c);
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

  function pintarMiPlan(){
    var cont = document.getElementById('planMio');
    if(!MI_PLAN || !(MI_PLAN.comidas || []).length){
      cont.innerHTML =
        '<div class="plan-vacio"><div class="ico">🍽️</div>' +
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

    cont.innerHTML = tabs + delDia.map(function(c){
      var m = MOMENTOS.filter(function(x){ return x.k === c.momento; })[0];
      return '<div class="plan-comida">' +
        '<div class="plan-momento"><span>' + (m ? m.emoji : '•') + '</span>' + c.momento + '</div>' +
        '<div class="plan-texto">' + escapar(c.texto) + '</div></div>';
    }).join('') +
    (MI_PLAN.nota ? '<div class="plan-nota">' + escapar(MI_PLAN.nota) + '</div>' : '');
  }

  // El texto lo escribe una persona y se pinta con innerHTML: hay que
  // escaparlo o un "<" cualquiera rompería la tarjeta.
  function escapar(t){
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
            '<span>' + (c.tienePlan ? 'con plan' : 'sin plan todavía') + '</span></div>' +
            '<span style="color:var(--ink-faint)">›</span></div>';
        }).join('')
      : '<p class="calc-note" style="padding:4px 20px 0;">Todavía no tienes a nadie asignado.</p>';
  }

  function cargarPlan(){
    if(!sesion || !sesion.user) return Promise.resolve();

    var tareas = [ sbPlanDe(sesion.user.id).then(function(p){ MI_PLAN = p; }) ];

    // Un entrenador ve a sus asignados; el super admin, a todo el mundo
    if(ROL === 'coach' || ROL === 'org_admin'){
      tareas.push(
        sbFetch('/rest/v1/mis_clientes?select=id,full_name&order=full_name.asc')
          .then(function(cs){
            PLAN_CLIENTES = (cs || []).map(function(c){
              return { id:c.id, nombre:(c.full_name || '').trim() || '(sin nombre)' };
            });
          }));
    } else if(ROL === 'super_admin'){
      // Por admin_buscar_usuarios y no por profiles: el correo no está en
      // profiles -vive en auth.users, que la app no puede leer- y esa
      // función sí lo devuelve. Es la misma que ya alimenta el panel.
      tareas.push(
        sbRpc('admin_buscar_usuarios', { p_texto: '', p_limite: 200 })
          .then(function(us){
            PLAN_CLIENTES = (us || [])
              .filter(function(u){ return u.rol !== 'super_admin'; })
              .map(function(u){
                return { id:u.id, nombre:(u.nombre || '').trim() || '(sin nombre)',
                         correo:u.correo || '' };
              })
              .sort(function(a,b){ return a.nombre.localeCompare(b.nombre, 'es'); });
          }));
    } else {
      PLAN_CLIENTES = [];
    }

    return Promise.all(tareas).then(function(){
      // Marcar quién ya tiene plan, para no tener que entrar a comprobarlo
      if(!PLAN_CLIENTES.length){ pintarMiPlan(); pintarPlanClientes(); return; }
      var ids = PLAN_CLIENTES.map(function(c){ return c.id; }).join(',');
      return sbFetch('/rest/v1/planes?select=user_id&activo=is.true&user_id=in.(' + ids + ')')
        .then(function(ps){
          var con = {};
          (ps || []).forEach(function(p){ con[p.user_id] = true; });
          PLAN_CLIENTES.forEach(function(c){ c.tienePlan = !!con[c.id]; });
        })['catch'](function(){})
        .then(function(){ pintarMiPlan(); pintarPlanClientes(); });
    })['catch'](function(e){
      toast('toastPlan', 'No se pudo cargar: ' + traducirError(e.message));
    });
  }

  document.getElementById('planMio').addEventListener('click', function(e){
    var b = e.target.closest('[data-verdia]');
    if(!b || !MI_PLAN) return;
    MI_PLAN.diaVisto = b.dataset.verdia;
    pintarMiPlan();
  });

  document.getElementById('planClientes').addEventListener('click', function(e){
    var f = e.target.closest('[data-plan-cli]');
    if(!f) return;
    abrirEditorPlan(PLAN_CLIENTES[Number(f.dataset.planCli)]);
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

    cont.innerHTML = tabs + MOMENTOS.map(function(m){
      var c = planComidas.filter(function(x){
        return x.momento === m.k && x.dia === planDia; })[0];
      return '<div class="card">' +
        '<div class="field-label" style="margin-top:0;">' + m.emoji + ' ' + m.k + '</div>' +
        '<textarea class="notas-input" rows="3" maxlength="400" data-momento="' + m.k + '" ' +
        'placeholder="Ej. 2 huevos, pan integral y café">' +
        escapar(c ? c.texto : '') + '</textarea></div>';
    }).join('');
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
    })['catch'](function(){});
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
    var btn = document.getElementById(semana ? 'peGenerarSemana' : 'peGenerar');
    var textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = semana ? 'Armando la semana…' : 'Pensando…';

    sbFetch('/rest/v1/profiles?select=goal_protein_g,goal_carbs_g,goal_fat_g' +
            '&id=eq.' + planEditando.userId + '&limit=1')
      .then(function(ps){
        var p = (ps || [])[0];
        if(!p || !p.goal_protein_g){
          throw new Error('Esa persona todavía no tiene sus macros calculados.');
        }
        var cal = Math.round(p.goal_protein_g*4 + p.goal_carbs_g*4 + p.goal_fat_g*9);
        return iaLlamar({
          accion: 'plan',
          semana: semana,
          nombre: planEditando.nombre,
          calorias: cal,
          proteina: p.goal_protein_g,
          gustos: document.getElementById('peNota').value.trim()
        });
      })
      .then(function(r){
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
          fila('Físico',    (p.weight_kg != null ? Number(p.weight_kg).toFixed(1) + ' kg' : '—') + ' · ' +
                            (p.height_cm != null ? Number(p.height_cm).toFixed(0) + ' cm' : '—') + ' · ' +
                            (p.age != null ? p.age + ' años' : '—')) +
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
  function fila(k, v){
    return '<div class="calc-line"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  function cerrarFicha(){ usrSheet.classList.remove('open'); usrActual = null; }
  document.getElementById('usrCerrar').addEventListener('click', cerrarFicha);
  usrSheet.addEventListener('click', function(e){ if(e.target === usrSheet) cerrarFicha(); });

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
      .then(function(f){ return (f && f[0]) || null; });
  }
  function sbDiario(desde){
    return sbFetch('/rest/v1/diary_entries' +
      '?select=id,entry_date,meal,food_name,unit,quantity,protein_g,carbs_g,fat_g' +
      '&entry_date=gte.' + desde + '&order=created_at.asc');
  }
  function sbAgregarAlimento(a, comida){
    return sbFetch('/rest/v1/diary_entries', {
      method:'POST',
      headers:{ 'Prefer':'return=representation' },
      body: JSON.stringify({
        user_id: sesion.user.id,
        entry_date: isoDe(HOY),
        meal: comida,
        food_name: a.n,
        // Cuánto se comió, en su unidad. Los macros van ya multiplicados por
        // esta cantidad; guardarla aparte es lo que permite editarla después.
        quantity: a.cant || 1,
        unit: a.u || 'Gramos',
        protein_g: a.P, carbs_g: a.C, fat_g: a.G
      })
    }).then(function(f){ return (f && f[0]) || null; });
  }
  function sbQuitarAlimento(id){
    return sbFetch('/rest/v1/diary_entries?id=eq.' + id, { method:'DELETE' });
  }
  // Los archivados no vuelven: la política de la 0007 ya los filtra en la
  // base, así que aquí no hay que acordarse de excluirlos.
  function sbAlimentos(){
    return sbFetch('/rest/v1/saved_foods?select=id,name,unit,protein_g,carbs_g,fat_g,veces_usado' +
                   '&order=veces_usado.desc,name.asc');
  }
  function sbRecetas(){
    return sbFetch('/rest/v1/recipes?select=id,name,servings,calories,is_public' +
                   '&order=created_at.desc');
  }
  function sbGuardarAlimento(a){
    if(!sesion || !sesion.user) return Promise.resolve(null);
    return sbFetch('/rest/v1/saved_foods', {
      method:'POST', headers:{ 'Prefer':'return=representation' },
      body: JSON.stringify({
        user_id: sesion.user.id, name: a.n, unit: a.u || 'Gramos', base_qty: 100,
        protein_g: a.P, carbs_g: a.C, fat_g: a.G
      })
    }).then(function(f){ return (f && f[0]) || null; });
  }
  function sbPesos(desde){
    return sbFetch('/rest/v1/weight_logs?select=log_date,weight_kg' +
                   '&log_date=gte.' + desde + '&order=log_date.asc');
  }
  function sbCardio(desde){
    return sbFetch('/rest/v1/cardio_logs?select=log_date,minutes' +
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
  function sbGuardarPeso(fecha, kg){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/weight_logs?on_conflict=user_id,log_date', {
      method:'POST',
      headers:{ 'Prefer':'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: sesion.user.id, log_date: fecha, weight_kg: kg })
    });
  }
  // La base permite varias sesiones de cardio el mismo día, pero la
  // pantalla maneja un único total por fecha. Se traduce una cosa en la
  // otra: se borra lo de ese día y se guarda el total como una sola fila.
  function sbGuardarCardio(fecha, minutos){
    if(!sesion || !sesion.user) return Promise.resolve();
    return sbFetch('/rest/v1/cardio_logs?user_id=eq.' + sesion.user.id +
                   '&log_date=eq.' + fecha, { method:'DELETE' })
      .then(function(){
        if(!minutos) return null;
        return sbFetch('/rest/v1/cardio_logs', {
          method:'POST', headers:{ 'Prefer':'return=minimal' },
          body: JSON.stringify({ user_id: sesion.user.id, log_date: fecha, minutes: minutos })
        });
      });
  }

  function cargarDatos(){
    if(!sesion || !sesion.user) return Promise.resolve();

    // Va DENTRO de la función a propósito. Como constante suelta arriba
    // valdría `undefined` al arrancar: el bloque de datos está al final del
    // archivo pero cargarDatos() se llama antes, y aunque la función sí se
    // eleva por hoisting, el valor de un `var` no. La fecha salía NaN y la
    // consulta se iba con `entry_date=gte.NaN-NaN-NaN`.
    var DIAS_ATRAS = 60;   // de sobra para la racha y la semana en curso

    // El peso y el cardio se traen de un año atrás porque la gráfica de
    // peso tiene un rango "el año"; el diario no lo necesita.
    var UN_ANIO = isoDe(haceDias(365));

    return Promise.all([
        sbPerfil(),
        sbDiario(isoDe(haceDias(DIAS_ATRAS))),
        sbPesos(UN_ANIO),
        sbCardio(UN_ANIO),
        sbAlimentos(),
        sbRecetas()
      ])
      .then(function(res){
        var p = res[0], filas = res[1] || [], pesos = res[2] || [], cardios = res[3] || [],
            alimentos = res[4] || [], recetas = res[5] || [];

        // ---- Perfil ----
        if(p){
          var nom = (p.full_name || '').trim();
          if(nom){
            document.getElementById('saludoNombre').textContent = nom.split(' ')[0];
            document.getElementById('profNombre').textContent = nom;
          }
          if(sesion.user.email) document.getElementById('profEmail').textContent = sesion.user.email;

          if(p.goal) reg.objetivo = p.goal;
          if(p.weight_kg != null) document.getElementById('profPeso').textContent   = Number(p.weight_kg).toFixed(1) + ' kg';
          if(p.height_cm != null) document.getElementById('profAltura').textContent = Number(p.height_cm).toFixed(1) + ' cm';
          if(p.age != null)       document.getElementById('profEdad').textContent   = p.age + ' años';
          pintarObjetivoPerfil();

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

          if(p.cardio_goal_min != null) META_CARDIO = Number(p.cardio_goal_min);
          if(p.week_start_dow != null){
            inicioSemana = Number(p.week_start_dow);
            anclaSemana  = ultimoDia(inicioSemana);   // el ancla depende del día elegido
          }
        }

        // ---- Diario ----
        // Se vacía lo de ejemplo antes de llenar; si no, se sumaría encima.
        REGISTRO = {};
        COMIDAS.Desayuno = []; COMIDAS.Comida = []; COMIDAS.Cena = [];
        var hoy = isoDe(HOY);

        filas.forEach(function(f){
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

            // COMPATIBILIDAD. Antes de que existiera la edición, todo se
            // guardaba con quantity=1 queriendo decir "una porción", no
            // "1 gramo". Sin esta corrección, prepararAlimento() deduce que
            // si 1 g da 20 g de proteína, 100 g dan 2000: los macros salían
            // multiplicados por cien.
            if(cantidad === 1 && baseDeUnidad(unidad) === 100) cantidad = 100;

            // prepararAlimento() deduce la porción base a partir de la
            // cantidad y los macros consumidos, para poder volver a editarla.
            COMIDAS[f.meal].push(prepararAlimento({
              id:f.id, n:f.food_name, u:unidad,
              cant: cantidad, P:P, C:C, G:G
            }));
          }
        });

        // ---- Peso ----
        // Se sustituye la serie de ejemplo entera, no se mezcla con ella.
        PESOS = {};
        pesos.forEach(function(f){ PESOS[f.log_date] = Number(f.weight_kg); });
        var hoyPeso = PESOS[hoy];
        if(hoyPeso != null) document.getElementById('pesoInput').value = hoyPeso;

        // ---- Cardio ----
        // La base admite varias sesiones por día; aquí se suman, que es
        // lo que la pantalla muestra.
        CARDIO = {};
        cardios.forEach(function(f){
          CARDIO[f.log_date] = (CARDIO[f.log_date] || 0) + (Number(f.minutes) || 0);
        });

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
          // "Frecuentes" no es otra lista: son los mismos, los que ya usaste.
          if(a.veces > 0) FRECUENTES.push(a);
        });

        RECETAS.length = 0;
        recetas.forEach(function(r){
          var porciones = Math.max(1, Number(r.servings) || 1);
          RECETAS.push({ id:r.id, n:r.name,
                         cal: Math.round((Number(r.calories)||0) / porciones),
                         vis: r.is_public ? 'pública' : 'privada' });
        });
        pintarListas();

        // ---- A pintar, con las funciones de siempre ----
        actualizarMetas();
        actualizarSemana();
        pintarComida();
        pintarRacha();
        pintarPeso();
        if(typeof pintarCardioPerfil === 'function') pintarCardioPerfil();
        if(typeof pintarEjercicio    === 'function') pintarEjercicio();
        // Repintar Fotos: ya se sabe desde cuándo contar las semanas
        if(typeof pintarFotos        === 'function') pintarFotos();

        // Rutina y sesiones. Aparte del Promise.all de arriba porque son
        // tres tablas encadenadas y no deben retrasar al Diario.
        if(typeof sbCargarRutina === 'function') sbCargarRutina()['catch'](function(){});
        if(typeof sbCargarSesiones === 'function') sbCargarSesiones()['catch'](function(){});

        // Y traer las fotos del bucket. Va aparte del Promise.all de arriba
        // porque son dos saltos (fichas y luego enlaces firmados) y no debe
        // retrasar al Diario, que es lo que se ve primero.
        if(typeof sbCargarFotos === 'function'){
          sbCargarFotos().then(function(mapa){
            Object.keys(FOTOS).forEach(function(k){ delete FOTOS[k]; });
            Object.keys(mapa).forEach(function(k){ FOTOS[k] = mapa[k]; });
            pintarFotos();
            if(typeof llenarSelectores === 'function') llenarSelectores();
          })['catch'](function(){});
        }
      })
      ['catch'](function(e){
        toast('toastComida', 'No se pudieron cargar tus datos: ' + traducirError(e.message));
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
  var iaFoto = null;          // { base64, tipo, vista } ya reducida
  var IA_MSGS = [];           // { rol:'yo'|'el', texto, foto?, alimentos? }
  var iaOcupado = false;

  var IA_ATAJOS = [
    { icono:'🛒', texto:'Hazme la lista del súper' },
    { icono:'🍽️', texto:'¿Qué me recomiendas comer hoy?' }
  ];

  function iaLlamar(cuerpo){
    return sbFetch('/functions/v1/asistente', {
      method: 'POST', body: JSON.stringify(cuerpo)
    });
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
    z.innerHTML = iaFoto
      ? '<div class="ia-foto-previa"><img src="' + iaFoto.vista + '" alt="">' +
        '<button id="iaQuitarFoto" title="Quitar">✕</button></div>'
      : '';
  }

  document.getElementById('iaTomarFoto').addEventListener('click', function(){
    document.getElementById('iaArchivo').click();
  });
  document.getElementById('iaFotoZona').addEventListener('click', function(e){
    if(e.target.closest('#iaQuitarFoto')){ iaFoto = null; pintarFotoIA(); }
  });
  document.getElementById('iaArchivo').addEventListener('change', function(e){
    var archivo = e.target.files && e.target.files[0];
    e.target.value = '';                  // deja volver a elegir la misma
    if(!archivo) return;
    reducirFoto(archivo)
      .then(function(f){ iaFoto = f; pintarFotoIA(); })
      ['catch'](function(err){ toast('toastIA2', err.message); });
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
    if(!texto && !iaFoto){ return; }
    if(!sesion){ toast('toastIA2', 'Inicia sesión para usar el asistente'); return; }

    IA_MSGS.push({ rol:'yo', texto: texto, foto: iaFoto ? iaFoto.vista : null });
    var fotoEnvio = iaFoto;
    iaTexto.value = '';
    iaTexto.style.height = '';
    iaFoto = null;
    pintarFotoIA();

    IA_MSGS.push({ rol:'el', texto:'…', pensando:true });
    pintarChat();
    iaOcupado = true;
    document.getElementById('iaEnviar').disabled = true;

    iaLlamar({
      accion: 'chat',
      mensajes: IA_MSGS.filter(function(m){ return !m.pensando; })
                       .map(function(m){ return { rol:m.rol, texto:m.texto }; }),
      imagen: fotoEnvio ? fotoEnvio.base64 : undefined,
      tipo_imagen: fotoEnvio ? fotoEnvio.tipo : undefined,
      macros: macrosDeHoy()
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
      if(typeof r.quedan === 'number'){
        document.getElementById('iaQuedan').textContent =
          r.quedan + (r.quedan === 1 ? ' consulta hoy' : ' consultas hoy');
      }
      pintarChat();
    })['catch'](function(e){
      IA_MSGS.pop();
      IA_MSGS.push({ rol:'el', texto: traducirError(e.message) });
      pintarChat();
    }).then(function(){
      iaOcupado = false;
      document.getElementById('iaEnviar').disabled = false;
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

    var cadena = m.alimentos.reduce(function(prev, a){
      return prev.then(function(){
        return sbAgregarAlimento(a, comida).then(function(fila){
          if(fila) a.id = fila.id;
          COMIDAS[comida].push(a);
          sumarAlRegistro(a, 1);
        });
      });
    }, Promise.resolve());

    cadena.then(function(){
      pintarFilasComidas();
      pintarComida();
      toast('toastIA2', m.alimentos.length + ' apuntado(s) en ' + comida.toLowerCase());
    })['catch'](function(e){
      m.apuntados = false; pintarChat();
      toast('toastIA2', 'No se pudo guardar: ' + traducirError(e.message));
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

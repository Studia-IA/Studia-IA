/* =========================================================
   Studia-IA · modules/study.js
   Módulo de estudio: temporizador pomodoro, registro de
   sesiones, objetivo diario y racha.
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var timer = {
    mode: 'work',            // work | short | long
    remaining: 25 * 60,
    total: 25 * 60,
    running: false,
    endAt: null,             // epoch ms en que debe terminar el tramo actual
    cycle: 0,
    subjectId: null,
    taskId: null,
    notes: '',
    tick: null,              // interval de refresco visual (no cuenta nada)
    lastFinishedEndAt: null,
    taskAtStart: null,       // tarea que había al arrancar: es la que se marca al terminar
    pausedByVisibility: false    // el pomodoro se congeló al ocultar la pestaña
  };

  var TICK_MS = 250;
  var wakeLock = null;
  var wakeLockRequest = 0;

  var MODES = {
    work: { label: 'Enfoque', color: 'var(--brand-500)' },
    short: { label: 'Descanso corto', color: 'var(--mint-500)' },
    long: { label: 'Descanso largo', color: 'var(--sky-500)' }
  };

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* `U.h` crea nodos HTML; los hijos de un <svg> necesitan el namespace SVG
     o el navegador no pinta el anillo. Helper local para no tocar core. */
  function svgEl(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var val = attrs[key];
      if (val === null || val === undefined || val === false) return;
      node.setAttribute(key, val);
    });
    var list = children === null || children === undefined ? [] : (Array.isArray(children) ? children : [children]);
    list.forEach(function (c) {
      if (c instanceof Node) node.appendChild(c);
      else node.appendChild(document.createTextNode(String(c)));
    });
    return node;
  }

  /* ---------------- Timer ---------------- */
  function settings() {
    /* `autoBreak` lo añade esta versión: si el ajuste no existe todavía
       (datos antiguos), activado por defecto. */
    var p = Object.assign({ autoBreak: true }, store.get().settings.pomodoro);
    return p;
  }

  /* Evita que la pantalla se apague mientras corre el pomodoro. Si el
     navegador no lo soporta (o la pestaña está oculta), se ignora. */
  function requestWakeLock() {
    if (wakeLock || !timer.running || !global.navigator || !navigator.wakeLock) return;
    if (document.visibilityState !== 'visible') return;
    var requestId = ++wakeLockRequest;
    try {
      navigator.wakeLock.request('screen').then(function (lock) {
        if (requestId !== wakeLockRequest || !timer.running) {
          try { lock.release(); } catch (e) { /* ya liberado */ }
          return;
        }
        wakeLock = lock;
        lock.addEventListener('release', function () {
          if (wakeLock === lock) wakeLock = null;
        });
      }).catch(function () { /* sin permiso o no soportado */ });
    } catch (e) { /* API no disponible */ }
  }

  function releaseWakeLock() {
    wakeLockRequest++;
    if (!wakeLock) return;
    try { wakeLock.release(); } catch (e) { /* ya liberado */ }
    wakeLock = null;
  }

  /* Guarda el estado del pomodoro para que sobreviva a recargas. No se
     llama en cada tick: con `running` + `endAt` basta para recalcular. */
  function saveTimer(extra) {
    store.update(function (s) {
      var prev = s.timer || {};
      s.timer = {
        mode: timer.mode,
        total: timer.total,
        remaining: timer.remaining,
        running: timer.running,
        endAt: timer.running ? timer.endAt : null,
        cycle: timer.cycle,
        subjectId: timer.subjectId,
        taskId: timer.taskId,
        taskAtStart: timer.taskAtStart,
        notes: timer.notes,
        lastFinishedEndAt: prev.lastFinishedEndAt || null
      };
      if (extra && extra.lastFinishedEndAt) s.timer.lastFinishedEndAt = extra.lastFinishedEndAt;
    });
  }

  /* Devuelve el modo de descanso tocaba según los pomodoros completados. */
  function nextBreakMode() {
    var p = settings();
    return timer.cycle % (p.cycle || 4) === 0 ? 'long' : 'short';
  }

  /* El descanso puede arrancar solo: si no, queda preparado y espera el clic. */
  function nextBreakAutostarts() {
    return !!settings().autoBreak;
  }

  function secondsFor(mode) {
    var p = settings();
    if (mode === 'work') return p.work * 60;
    if (mode === 'short') return p.short * 60;
    return p.long * 60;
  }

  /* Devuelve true si quedaba una ronda a medias que conservar en pausa. */
  function parkWork() {
    if (!timer.running) return false;
    timer.remaining = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    stop();
    return timer.mode === 'work' && timer.remaining > 0 && timer.remaining < timer.total;
  }

  /* Cierra el reloj y escribe en el acto. `store.flush()` escribe en
     localStorage sin pasar por el debounce, así que vale dentro de
     `pagehide`/`beforeunload`, donde una promesa puede no resolverse a
     tiempo. */
  function commitWork() {
    var parked = parkWork();
    saveTimer();
    try { store.flush(); } catch (e) { /* sin storage */ }
    return parked;
  }

  /* La pestaña oculta congela el intervalo: guardamos al instante. El
     pomodoro sigue corriendo en tiempo real (mismo criterio que al
     recargar): al volver, si debería haber terminado se cierra la ronda;
     si no, se reanuda. */
  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      if (timer.running) { commitWork(); timer.pausedByVisibility = true; }
      refresh();
      updateChip();
    } else if (timer.pausedByVisibility) {
      timer.pausedByVisibility = false;
      if (timer.endAt && Date.now() >= timer.endAt) {
        timer.remaining = 0;
        finish(timer.mode !== 'work');
        return;
      }
      if (!timer.running && timer.endAt && timer.remaining > 0) {
        timer.running = true;
        timer.remaining = Math.max(1, Math.round((timer.endAt - Date.now()) / 1000));
        timer.tick = setInterval(onTick, TICK_MS);
        requestWakeLock();
        refresh();
        updateChip();
        saveTimer();
      }
    }
  }

  /* Antes de cerrar o recargar: consolidar y escribir en el acto. */
  function flushOnExit() {
    commitWork();
  }

  function setMode(mode, autostart) {
    if (mode === timer.mode) {
      /* Clic en el modo actual: no reiniciamos la ronda, solo paramos el
         reloj y guardamos lo llevado si estaba en marcha. */
      if (commitWork()) { refresh(); updateChip(); }
      return;
    }
    parkWork();
    timer.mode = mode;
    timer.total = secondsFor(mode);
    timer.remaining = timer.total;
    if (autostart) start();
    refresh();
    updateChip();
    saveTimer();
  }

  function start() {
    if (timer.running) return;
    timer.running = true;
    /* La tarea que había al arrancar es la que se marca al terminar: si se
       cambia durante la ronda, `timer.taskId` es otra y no debe marcarse. */
    timer.taskAtStart = timer.taskId;
    timer.endAt = Date.now() + timer.remaining * 1000;
    timer.tick = setInterval(onTick, TICK_MS);
    requestWakeLock();
    refresh();
    updateChip();
    saveTimer();
  }

  function pause() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    stop();
    refresh();
    updateChip();
    saveTimer();
  }

  function stop() {
    timer.running = false;
    if (timer.tick) clearInterval(timer.tick);
    timer.tick = null;
    releaseWakeLock();
  }

  function reset() {
    parkWork();
    timer.remaining = timer.total;
    refresh();
    updateChip();
    saveTimer();
  }

  function onTick() {
    timer.remaining = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    if (timer.remaining <= 0) finish();
    paint();
    updateChip();
  }

  /* Se terminó el pomodoro (o el descanso). Con `skipSession` solo se
     cierra el temporizador: es el caso del descanso terminado mientras la
     app estaba cerrada, sin estudio que registrar. */
  function finish(skipSession) {
    var endedAt = timer.endAt || Date.now();
    stop();
    if (!skipSession) beep();
    if (timer.mode === 'work') {
      var p = settings();
      timer.lastFinishedEndAt = endedAt;
      if (!skipSession) {
        var result = store.addSession({
          date: U.toISO(new Date(endedAt)),
          minutes: p.work,
          subjectId: timer.subjectId,
          taskId: timer.taskId,
          mode: 'pomodoro',
          notes: timer.notes
        });
      }
      timer.cycle += 1;
      var next = nextBreakMode();
      timer.mode = next;
      timer.total = secondsFor(next);
      timer.remaining = timer.total;

      if (!skipSession) {
        var info = result.streak;
        ui.toast('¡Sesión completada! +' + result.xp + ' XP · racha de ' + info.current + ' días', 'success', 4200);
        notifyUser('Sesión de estudio completada', 'Has estudiado ' + p.work + ' minutos. Racha: ' + info.current + ' días.');
        checkMilestones(info);

        if (timer.taskAtStart) {
          var task = store.find('tasks', timer.taskAtStart);
          if (task) {
            store.updateRow('tasks', task.id, { done: true, completedAt: U.today() });
            ui.toast('Tarea marcada como completada ✓', 'success');
          }
        }

        /* El descanso arranca solo si está activado y estabas mirando la app:
           si tabatabas, se deja el descanso preparado sin empezar a escondidas
           (así no "consume" un descanso cuando vuelves horas después). */
        if (!skipSession && nextBreakAutostarts() && document.visibilityState === 'visible') {
          refresh();
          start();
          return;   // start() guarda, refresca y actualiza el chip
        }
      }
    } else {
      timer.mode = 'work';
      timer.total = secondsFor('work');
      timer.remaining = timer.total;
      if (!skipSession) ui.toast('¡Descanso terminado! Vuelve al estudio.', 'info');
    }
    refresh();
    updateChip();
    saveTimer({ lastFinishedEndAt: endedAt });
  }

  function checkMilestones(info) {
    var claimed = store.get().rewards.claimed || [];
    Studia.rewards.MILESTONES.forEach(function (m) {
      if (info.current >= m.days && claimed.indexOf(m.id) === -1) {
        ui.toast('🏅 Hito desbloqueado: ' + m.name + ' (' + m.desc + ')', 'success', 5000);
        store.update(function (s) {
          s.rewards.claimed = (s.rewards.claimed || []).concat([m.id]);
          s.xp = (s.xp || 0) + m.xp;
        });
      }
    });
  }

  function beep() {
    try {
      var ctx = new (global.AudioContext || global.webkitAudioContext)();
      var notes = [880, 1174.66];
      notes.forEach(function (f, i) {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.22);
        osc.stop(ctx.currentTime + i * 0.22 + 0.4);
      });
    } catch (e) { /* sin audio: no es crítico */ }
  }

  function notifyUser(title, body) {
    try {
      if (global.Notification && Notification.permission === 'granted') {
        new Notification(title, { body: body, icon: 'assets/img/favicon.svg' });
      }
    } catch (e) { /* sin permisos de notificación */ }
  }

  function notificationState() {
    if (!global.Notification) return 'unsupported';
    return Notification.permission || 'default';
  }

  function askNotifications() {
    var state = notificationState();
    if (state === 'unsupported') {
      ui.toast('Este navegador no admite avisos de escritorio.', 'warn');
      return;
    }
    if (state === 'granted') {
      ui.toast('Los avisos ya están activados.', 'success');
      return;
    }
    if (state === 'denied') {
      ui.toast('Los avisos están bloqueados. Actívalos en los permisos del navegador para este sitio.', 'warn', 6000);
      return;
    }
    try {
      var result = Notification.requestPermission(function () { refresh(); });
      if (result && typeof result.then === 'function') result.then(function () { refresh(); });
    } catch (e) {
      ui.toast('No se pudieron activar los avisos.', 'warn');
    }
  }

  /* Tareas rápidas desde el pomodoro. Solo usamos `store.add`/`store.remove`
     (API del núcleo) y `ui.formModal`, sin duplicar la lógica de tasks.js. */
  function quickAddTask() {
    var subjects = store.get().subjects;
    ui.formModal({
      title: 'Nueva tarea',
      subtitle: 'Se crea como pendiente y queda asociada a este pomodoro.',
      fields: [
        { name: 'title', label: 'Tarea', required: true, placeholder: 'Ej. Terminar ejercicios 4-7' },
        { name: 'subjectId', label: 'Asignatura', type: 'select', value: timer.subjectId || (subjects[0] || {}).id || '', options: subjects.map(function (s) { return { value: s.id, label: s.name }; }) },
        { name: 'due', label: 'Fecha de entrega', type: 'date', value: U.today() },
        { name: 'priority', label: 'Prioridad', type: 'select', value: 'media', options: [{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'baja', label: 'Baja' }] }
      ],
      submitLabel: 'Crear tarea',
      onSubmit: function (v) {
        /* Si había una tarea en la lista, esa era la "elegida al arrancar"
           (aunque el reloj estuviera parado) y la nueva la sustituye. */
        timer.taskAtStart = timer.taskId;
        var task = store.add('tasks', {
          title: String(v.title || '').trim(),
          subjectId: v.subjectId || '',
          due: v.due || U.today(),
          priority: v.priority || 'media',
          notes: '',
          done: false
        });
        timer.taskId = task.id;
        saveTimer();
        ui.toast('Tarea creada y asociada al pomodoro', 'success');
      }
    });
  }

  function quickRemoveTask() {
    var task = store.find('tasks', timer.taskId);
    if (!task) return;
    ui.confirm({
      title: '¿Eliminar esta tarea?',
      message: '«' + task.title + '» se eliminará de Tareas y del pomodoro.',
      okLabel: 'Eliminar',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      timer.taskId = null;
      if (timer.taskAtStart === task.id) timer.taskAtStart = null;
      store.remove('tasks', task.id);
      saveTimer();
      refresh();
      ui.toast('Tarea eliminada', 'info');
    });
  }

  function manualAddMinutes() {
    ui.formModal({
      title: 'Sesión manual',
      subtitle: '¿Has estudiado sin el temporizador? Apúntalo aquí.',
      fields: [
        { name: 'minutes', label: 'Minutos', type: 'number', required: true, value: 30, min: 1, max: 600 },
        { name: 'subjectId', label: 'Asignatura', type: 'select', value: timer.subjectId || '', options: [{ value: '', label: 'Sin asignatura' }].concat(store.get().subjects.map(function (s) { return { value: s.id, label: s.name }; })) },
        { name: 'notes', label: 'Apuntes', placeholder: 'Opcional: qué has estudiado' }
      ],
      submitLabel: 'Registrar sesión',
      onSubmit: function (v) {
        var raw = parseInt(v.minutes, 10);
        if (!raw || raw < 1) { ui.toast('Pon al menos 1 minuto.', 'warn'); return false; }
        var minutes = U.clamp(raw, 1, 600);
        var result = store.addSession({
          date: U.today(),
          minutes: minutes,
          subjectId: v.subjectId || null,
          mode: 'manual',
          notes: String(v.notes || '').trim()
        });
        ui.toast('Sesión registrada: ' + minutes + ' min · +' + result.xp + ' XP · racha de ' + result.streak.current + ' días', 'success', 4200);
      }
    });
  }

  function removeSession(s) {
    ui.confirm({
      title: '¿Eliminar esta sesión?',
      message: s.minutes + ' min de ' + store.subjectName(s.subjectId) + '. Se quitan también el XP y la racha que sumó.',
      okLabel: 'Eliminar',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      store.removeSession(s.id);
      ui.toast('Sesión eliminada', 'info');
    });
  }

  function notificationRow() {
    var state = notificationState();
    var labels = {
      granted: ['Avisos activados', 'Te avisaremos al terminar cada pomodoro.'],
      denied: ['Avisos bloqueados', 'El navegador los tiene bloqueados para este sitio.'],
      unsupported: ['Avisos no disponibles', 'Este navegador no admite notificaciones.'],
      default: ['Avisos al terminar', 'Actívalos para enterarte aunque estés en otra pestaña.']
    };
    var info = labels[state] || labels.default;
    var button = U.h('button.btn.btn--sm' + (state === 'granted' ? '.btn--soft' : '.btn--ghost'), {
      type: 'button',
      disabled: state === 'granted' || state === 'unsupported',
      onclick: askNotifications
    }, state === 'granted' ? 'Activados' : 'Activar');
    return U.h('div.row.row--between.gap-2.mt-2', [
      U.h('div', [U.h('div.small.strong', info[0]), U.h('div.tiny.soft', info[1])]),
      button
    ]);
  }

  /* ---------------- Chip del topbar ---------------- */
  function updateChip() {
    var chip = document.getElementById('timerChip');
    if (!chip) return;
    if (!timer.running && timer.mode === 'work' && timer.remaining === timer.total) { chip.hidden = true; return; }
    chip.hidden = false;
    var label = U.fmtClock(timer.remaining);
    chip.querySelector('[data-timer-time]').textContent = label;
    chip.querySelector('[data-timer-mode]').textContent = MODES[timer.mode].label;
  }

  /* ---------------- Render ---------------- */
  function render(root) {
    U.clear(root);
    var today = U.today();
    var goal = store.get().settings.dailyGoal || 120;
    var done = store.minutesOn(today);

    root.appendChild(U.h('div.grid.grid--split', [
      U.h('div.col.gap-2', [
        timerCard(),
        goalCard(done, goal),
        sessionsCard(today)
      ]),
      U.h('div.col.gap-2', [
        setupCard(),
        focusCard(),
        streakCard()
      ])
    ]));
  }

  function timerCard() {
    var p = settings();
    var subjects = store.get().subjects;
    var mode = MODES[timer.mode];
    var pct = timer.total ? (timer.remaining / timer.total) : 0;
    var R = 118, C = 2 * Math.PI * R;

    var ring = U.h('div.timer__ring', [
      svgEl('svg', { viewBox: '0 0 268 268', width: '268', height: '268' }, [
        svgEl('defs', null, [
          svgEl('linearGradient', { id: 'timerGrad', x1: '0', y1: '0', x2: '1', y2: '1' }, [
            svgEl('stop', { offset: '0%', 'stop-color': 'var(--brand-500)' }),
            svgEl('stop', { offset: '100%', 'stop-color': 'var(--violet-500)' })
          ])
        ]),
        svgEl('circle', { class: 'timer__track', cx: '134', cy: '134', r: R, 'stroke-width': '14' }),
        svgEl('circle', {
          class: 'timer__prog', cx: '134', cy: '134', r: R, 'stroke-width': '14',
          'stroke-dasharray': C, 'stroke-dashoffset': C * (1 - pct)
        })
      ]),
      U.h('div.timer__center', [
        U.h('div.timer__time', { 'data-timer-display': '' }, U.fmtClock(timer.remaining)),
        U.h('div.timer__mode', { 'data-timer-mode-label': '' }, mode.label),
        U.h('div.timer__subject', timer.subjectId ? store.subjectName(timer.subjectId) : 'Sin asignatura')
      ])
    ]);

    var subjectSelect = U.h('select.select.select--sm', { onchange: function () { timer.subjectId = subjectSelect.value || null; updateChip(); saveTimer(); } }, [
      U.h('option', { value: '' }, 'Sin asignatura')
    ].concat(subjects.map(function (s) {
      var o = U.h('option', { value: s.id }, s.name);
      if (timer.subjectId === s.id) o.selected = true;
      return o;
    })));

    var openTasks = store.openTasks();
    var taskSelect = U.h('select.select.select--sm', { onchange: function () {
      /* Con el reloj en marcha, cambiar la selección no reetiqueta la ronda
         en curso: la marca sigue yendo a la tarea con la que se arrancó. */
      timer.taskId = taskSelect.value || null;
      if (!timer.running) timer.taskAtStart = timer.taskId;
      saveTimer();
    } }, [
      U.h('option', { value: '' }, 'Sin tarea asociada')
    ].concat(openTasks.map(function (t) {
      var o = U.h('option', { value: t.id }, t.title);
      if (timer.taskId === t.id) o.selected = true;
      return o;
    })));

    var taskRow = U.h('div.row.gap-2', [
      U.h('div.grow', taskSelect),
      U.h('button.icon-btn', { onclick: quickAddTask, title: 'Añadir tarea', 'aria-label': 'Añadir tarea' }, U.icon('plus')),
      U.h('button.icon-btn', {
        onclick: quickRemoveTask,
        title: timer.taskId ? 'Eliminar la tarea asociada' : 'Primero elige una tarea',
        'aria-label': 'Eliminar la tarea asociada',
        disabled: !timer.taskId,
        /* `disabled` real (no solo pointer-events) para que el teclado lo
           salte; el estilo de deshabilitado va inline porque components.css
           no lo define y no podemos tocarlo. */
        style: timer.taskId ? null : { opacity: '.4', cursor: 'not-allowed' }
      }, U.icon('trash'))
    ]);

    return U.h('div.card', [
      U.h('div.timer', [
        ring,
        U.h('div.row.gap-2.row--wrap', { style: { justifyContent: 'center' } }, [
          subjectSelect, taskRow
        ]),
        U.h('div.timer__controls', [
          U.h('button.icon-btn', { onclick: function () { setMode('work'); }, title: 'Modo enfoque' }, U.icon('play')),
          timer.running
            ? U.h('button.btn.btn--primary.btn--lg', { onclick: pause }, [U.icon('pause'), 'Pausar'])
            : U.h('button.btn.btn--primary.btn--lg', { onclick: start }, [U.icon('play'), timer.remaining < timer.total ? 'Continuar' : 'Empezar']),
          U.h('button.icon-btn', { onclick: reset, title: 'Reiniciar' }, U.icon('reset')),
          U.h('button.icon-btn', { onclick: function () { setMode(timer.mode === 'work' ? 'short' : 'work'); }, title: 'Cambiar modo' }, U.icon('timer'))
        ]),
        U.h('div.timer__mode-tabs', ['work', 'short', 'long'].map(function (k) {
          return U.h('button.btn.btn--sm' + (timer.mode === k ? '.btn--soft' : '.btn--ghost'), {
            onclick: function () { setMode(k); }
          }, MODES[k].label + ' · ' + (secondsFor(k) / 60) + ' min');
        })),
        U.h('p.tiny.soft', 'Ciclo ' + (timer.cycle % (p.cycle || 4)) + ' de ' + (p.cycle || 4) + ' · al completar se guarda la sesión y sube tu racha')
      ])
    ]);
  }

  function goalCard(done, goal) {
    var pct = Math.min(100, Math.round(done / goal * 100));
    return U.h('div.card', [
      U.h('div.card__head', [
        U.h('div', [U.h('h3', 'Objetivo diario'), U.h('p', goal + ' min de estudio al día')]),
        U.h('span.badge' + (done >= goal ? '.badge--mint' : '.badge--brand'), done + ' / ' + goal + ' min')
      ]),
      U.h('div.progress' + (done >= goal ? '.progress--mint' : ''), U.h('div.progress__bar', { style: { width: pct + '%' } })),
      U.h('p.tiny.soft.mt-1', done >= goal ? '¡Objetivo cumplido! Mantén la racha para conseguir el hito de esta semana.' : 'Te faltan ' + (goal - done) + ' minutos para cumplirlo hoy.')
    ]);
  }

  function sessionsCard(today) {
    var sessions = U.sortBy(store.get().sessions.filter(function (s) { return s.date === today; }), function (s) { return s.id; });
    return U.h('div.card', [
      U.h('div.card__head', [
        U.h('h3', 'Sesiones de hoy'),
        U.h('div.row.gap-1', [
          U.h('button.btn.btn--sm.btn--ghost', { onclick: manualAddMinutes }, [U.icon('plus'), 'Añadir']),
          U.h('span.badge', sessions.length)
        ])
      ]),
      sessions.length ? U.h('div.pomo-sessions', sessions.map(function (s) {
        return U.h('div.pomo-session', [
          U.h('span.pomo-session__dot', { style: { background: store.subjectColor(s.subjectId) } }),
          U.h('span.grow', store.subjectName(s.subjectId)),
          U.h('span.badge', s.mode === 'pomodoro' ? 'Pomodoro' : 'Manual'),
          U.h('span.small.strong', s.minutes + ' min'),
          U.h('button.icon-btn', {
            onclick: function () { removeSession(s); },
            title: 'Eliminar sesión',
            'aria-label': 'Eliminar sesión de ' + s.minutes + ' min',
            style: { width: '28px', height: '28px', flex: '0 0 auto' }
          }, U.icon('trash'))
        ]);
      })) : U.h('div.col.gap-2', [
        U.h('p.small.soft', 'Todavía no has estudiado hoy. Arranca un pomodoro de 25 minutos o apunta una sesión manual.'),
        U.h('button.btn.btn--sm.btn--ghost', { onclick: manualAddMinutes }, [U.icon('plus'), 'Registrar sesión manual'])
      ])
    ]);
  }

  function setupCard() {
    var p = settings();
    function num(label, key, min, max) {
      var input = U.h('input.input.input--sm', { type: 'number', min: min, max: max, value: p[key] });
      input.addEventListener('change', function () {
        var v = U.clamp(+input.value || p[key], min, max);
        input.value = v;
        store.update(function (s) { s.settings.pomodoro[key] = v; });
        if (timer.mode === key || (key === 'work' && timer.mode === 'work')) {
          timer.total = secondsFor(timer.mode);
          if (!timer.running) timer.remaining = timer.total;
        }
        refresh();
      });
      return U.h('div.field', [U.h('label.field__label', label), input]);
    }
    /* Sin `type:'checkbox'` el input valdría "on"/"off" como valor. */
    function toggle(label, key, help) {
      var input = U.h('input', { type: 'checkbox', checked: !!p[key], style: { width: '18px', height: '18px', accentColor: 'var(--brand-500)', cursor: 'pointer' } });
      input.addEventListener('change', function () {
        store.update(function (s) { s.settings.pomodoro[key] = input.checked; });
        refresh();
      });
      return U.h('label.row.row--between.gap-2', { style: { cursor: 'pointer' } }, [
        U.h('div', [U.h('div.small.strong', label), U.h('div.tiny.soft', help)]),
        input
      ]);
    }
    return U.h('div.card', [
      U.h('h3.mb-2', 'Ajustes del temporizador'),
      U.h('div.col.gap-2', [
        num('Foco (min)', 'work', 5, 90),
        num('Descanso corto (min)', 'short', 1, 30),
        num('Descanso largo (min)', 'long', 5, 60),
        num('Ciclos antes del descanso largo', 'cycle', 2, 8),
        toggle('Descanso automático', 'autoBreak', 'Al terminar el enfoque, el descanso empieza solo si tienes la app abierta.')
      ]),
      notificationRow()
    ]);
  }

  function focusCard() {
    var exam = store.nextExam();
    var days = exam ? U.daysBetween(new Date(), exam.date) : null;
    return U.h('div.card', [
      U.h('h3.mb-2', 'Próximo examen'),
      exam ? U.h('div', [
        U.h('div.row.gap-2', [
          U.h('span.dot-color', { style: { background: store.subjectColor(exam.subjectId) } }),
          U.h('strong', exam.title)
        ]),
        U.h('p.small.muted.mt-1', U.fmtDate(exam.date, { weekday: true }) + (exam.start ? ' · ' + exam.start.slice(0, 5) : '')),
        days !== null ? U.h('p.small.mt-1', days === 0 ? '¡Es hoy!' : 'Quedan ' + days + ' días') : null
      ]) : U.h('p.small.soft', 'No hay exámenes programados.')
    ]);
  }

  function streakCard() {
    var info = store.streakInfo();
    var levels = Studia.rewards.status(info, store.get().rewards.claimed);
    var next = levels.filter(function (l) { return !l.unlocked; })[0];
    return U.h('div.card', [
      U.h('div.card__head', [U.h('h3', 'Racha'), U.h('span.badge.badge--amber', info.current + ' días')]),
      U.h('p.small.muted', 'Mejor racha: ' + info.best + ' días · ' + info.total + ' días estudiados en total'),
      next ? U.h('div.mt-2', [
        U.h('div.row.row--between.tiny.mb-1', [
          U.h('span.soft', 'Siguiente hito: ' + next.milestone.name),
          U.h('span.strong', Math.max(0, next.milestone.days - info.current) + ' días')
        ]),
        U.h('div.progress.progress--amber.progress--thin', U.h('div.progress__bar', { style: { width: (info.current / next.milestone.days * 100) + '%' } }))
      ]) : U.h('p.small.mt-2', '¡Has desbloqueado todos los hitos! Eres una leyenda.')
    ]);
  }

  /* ---------------- Auxiliares ---------------- */
  function paint() {
    var display = document.querySelector('[data-timer-display]');
    if (display) display.textContent = U.fmtClock(timer.remaining);
    var label = document.querySelector('[data-timer-mode-label]');
    if (label) label.textContent = MODES[timer.mode].label;
    var ring = document.querySelector('.timer__prog');
    if (ring) {
      var C = 2 * Math.PI * 118;
      var pct = timer.total ? (timer.remaining / timer.total) : 0;
      ring.setAttribute('stroke-dashoffset', C * (1 - pct));
    }
  }

  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'study') render(main);
  }

  /* Recupera el pomodoro guardado. Devuelve false si no había ninguno. */
  function restoreTimer() {
    var saved = store.get().timer;
    if (!saved) return false;
    timer.mode = MODES[saved.mode] ? saved.mode : 'work';
    /* Si los ajustes cambiaron desde que se guardó, el total guardado (p. ej.
       1500) no cuadra con el modo (p. ej. descanso de 5 min) y el anillo
       arranca casi vacío: se recalcula y el tiempo restante se recorta en la
       línea de más abajo con `min(remaining, total)`. */
    timer.total = secondsFor(timer.mode);
    timer.cycle = saved.cycle || 0;
    timer.subjectId = saved.subjectId || null;
    timer.taskId = saved.taskId || null;
    /* Datos guardados antes de `taskAtStart`: la única tarea conocida es la
       seleccionada, así que se toma como punto de partida. */
    timer.taskAtStart = saved.taskAtStart !== undefined ? saved.taskAtStart : timer.taskId;
    timer.notes = saved.notes || '';
    timer.lastFinishedEndAt = saved.lastFinishedEndAt || null;

    if (saved.running && saved.endAt) {
      timer.endAt = saved.endAt;
      var left = Math.round((saved.endAt - Date.now()) / 1000);
      if (left > 0) {
        timer.remaining = Math.min(left, timer.total);
        start();                       // reanuda con el tiempo real restante
        return true;
      }
      if (saved.endAt !== saved.lastFinishedEndAt) {
        timer.remaining = 0;
        finish(timer.mode !== 'work');  // terminó cerrado: cierra la ronda sin duplicar
        return true;
      }
      timer.remaining = timer.total;
    } else {
      timer.remaining = Math.min(saved.remaining || timer.total, timer.total);
    }
    refresh();
    updateChip();
    return true;
  }

  function init() {
    if (init.done) return;
    init.done = true;
    if (!restoreTimer()) {
      timer.subjectId = store.get().subjects.length ? store.get().subjects[0].id : null;
      timer.total = secondsFor('work');
      timer.remaining = timer.total;
    }
    store.subscribe(function () {
      /* Solo refresca la vista Estudio: si estamos en otra, `refresh()` hace
         nothing, así que cambiar tareas desde Tareas no provoca bucles. */
      refresh();
    });
    document.addEventListener('visibilitychange', onVisibility);
    global.addEventListener('pagehide', flushOnExit);
    global.addEventListener('beforeunload', flushOnExit);
  }

  Studia.modules = Studia.modules || {};
  Studia.modules.study = {
    init: init, render: render,
    state: function () { return timer; },
    setMode: setMode, start: start, pause: pause, reset: reset
  };
  Studia.router.register('study', {
    title: 'Estudio',
    subtitle: 'Temporizador pomodoro, sesiones y objetivo diario',
    render: render
  });
})(window);

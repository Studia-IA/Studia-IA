/* =========================================================
   Studia-IA · main.js
   Arranque de la aplicación: tema, barra superior, búsqueda,
   recordatorios y navegación.
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia;
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  /* Limpiezas de los listeners montados por startApp(). En el arranque
     se registran y se liberan al cambiar de usuario sin recargar. */
  var wireOnce = {};
  var lastMountedUser = null;

  /* Expuesto para que otros módulos (router) puedan reportar fallos. */
  Studia.captureError = function (kind, message, detail) { captureError(kind, message, detail); };
  Studia.diagnostics = function () { return diagnosticsText(); };

  /* ---------------- Tema ---------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.update(function (s) { s.settings.theme = next; });
  }

  /* ---------------- Barra lateral ---------------- */
  var sidebarWired = false;
  function wireSidebar() {
    if (sidebarWired) return;
    sidebarWired = true;
    var sidebar = document.getElementById('sidebar');
    var scrim = document.getElementById('sidebarScrim');
    var app = document.getElementById('app');

    function isMobile() {
      return global.matchMedia ? global.matchMedia('(max-width: 768px)').matches : global.innerWidth <= 768;
    }
    function open() {
      sidebar.classList.remove('is-open');
      scrim.classList.remove('is-open');
      if (isMobile()) {
        app.classList.remove('sidebar--collapsed');
        sidebar.classList.add('is-open');
        scrim.classList.add('is-open');
      } else {
        app.classList.remove('sidebar--collapsed');
      }
    }
    function close() {
      sidebar.classList.remove('is-open');
      scrim.classList.remove('is-open');
      if (isMobile()) app.classList.remove('sidebar--collapsed');
      else app.classList.add('sidebar--collapsed');
    }
    function syncViewportMode() {
      sidebar.classList.remove('is-open');
      scrim.classList.remove('is-open');
      if (isMobile()) app.classList.remove('sidebar--collapsed');
    }

    document.getElementById('btnOpenSidebar').addEventListener('click', open);
    document.getElementById('btnCloseSidebar').addEventListener('click', close);
    scrim.addEventListener('click', close);
    global.addEventListener('resize', syncViewportMode);
    U.$$('.nav__item[data-nav]').forEach(function (a) {
      a.addEventListener('click', function () { if (isMobile()) close(); });
    });
    syncViewportMode();
  }

  /* ---------------- Búsqueda global ---------------- */
  function wireSearch() {
    var input = document.getElementById('globalSearch');
    var results = document.getElementById('searchResults');

    function close() { results.hidden = true; }

    function run() {
      var q = U.norm(input.value.trim());
      if (q.length < 2) { close(); return; }
      var state = store.get();
      var found = [];

      state.subjects.forEach(function (s) {
        if (U.norm(s.name + ' ' + (s.code || '') + ' ' + (s.teacher || '')).indexOf(q) !== -1) {
          found.push({ group: 'Asignaturas', icon: 'book', title: s.name, sub: s.teacher || '', action: function () { Studia.router.go('subjects'); } });
        }
      });
      state.tasks.forEach(function (t) {
        if (U.norm(t.title).indexOf(q) !== -1) {
          found.push({ group: 'Tareas', icon: 'check', title: t.title, sub: store.subjectName(t.subjectId), action: function () { Studia.router.go('tasks'); } });
        }
      });
      state.notes.forEach(function (n) {
        if (U.norm(n.title).indexOf(q) !== -1) {
          found.push({ group: 'Apuntes', icon: 'file', title: n.title, sub: store.subjectName(n.subjectId), action: function () { Studia.router.go('subjects'); } });
        }
      });
      state.events.forEach(function (e) {
        if (U.norm(e.title).indexOf(q) !== -1) {
          found.push({ group: 'Calendario', icon: 'calendar', title: e.title, sub: U.fmtDate(e.date, { short: true, day: true }), action: function () { Studia.router.go('calendar'); } });
        }
      });
      state.forum.forEach(function (p) {
        if (U.norm(p.text).indexOf(q) !== -1) {
          found.push({ group: 'Foro', icon: 'users', title: p.text.slice(0, 60), sub: p.author, action: function () { Studia.router.go('social'); } });
        }
      });

      U.clear(results);
      if (!found.length) {
        results.appendChild(U.h('div.search-results__item.soft', 'Sin resultados para «' + q + '»'));
      } else {
        var groups = U.groupBy(found, function (f) { return f.group; });
        Object.keys(groups).forEach(function (g) {
          results.appendChild(U.h('div.search-results__group', g));
          groups[g].slice(0, 5).forEach(function (f) {
            results.appendChild(U.h('button.search-results__item', {
              onclick: function () { close(); input.value = ''; f.action(); }
            }, [
              U.icon(f.icon),
              U.h('div.grow', [U.h('div', f.title), U.h('div.tiny.soft', f.sub || '')])
            ]));
          });
        });
      }
      results.hidden = false;
    }

    input.addEventListener('input', U.debounce(run, 180));
    input.addEventListener('focus', function () { if (input.value.trim().length >= 2) run(); });
    document.addEventListener('click', function (e) {
      if (!results.contains(e.target) && e.target !== input) close();
    });
  }

  /* ---------------- Recordatorios ---------------- */
  function wireBell() {
    var btn = document.getElementById('btnBell');
    var popover = document.getElementById('bellPopover');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!popover.hidden) { popover.hidden = true; return; }
      drawReminders(popover);
      popover.hidden = false;
      setTimeout(function () {
        document.addEventListener('click', function h(ev) {
          if (!popover.contains(ev.target) && ev.target !== btn) { popover.hidden = true; document.removeEventListener('click', h); }
        });
      }, 0);
    });
  }

  /* Sugerencia diaria de pomodoro si hoy hay examen o entrega. Se guarda en
     localStorage para no repetir el aviso cada vez que se abre la campana. */
  function examNudge(popover) {
    var today = U.today();
    var exam = store.get().events.filter(function (e) {
      return e.date === today && (e.type === 'exam' || e.type === 'deadline');
    })[0];
    if (!exam) return null;
    var key = 'studia.nudge.' + exam.id + '.' + today;
    try { if (global.localStorage.getItem(key)) return null; } catch (e) { /* sin storage */ }

    var timer = Studia.modules && Studia.modules.study ? Studia.modules.study.state() : null;
    if (timer && timer.running) return null;   // ya está estudiando

    return U.h('div.ai-retry', { style: { margin: '0 0 10px' } }, [
      U.icon('target'),
      U.h('span', '📝 ' + exam.title + ' · hoy. Un pomodoro ayuda.'),
      U.h('button.btn.btn--soft.btn--sm', {
        onclick: function () {
          try { global.localStorage.setItem(key, '1'); } catch (e) { /* sin storage */ }
          popover.hidden = true;
          Studia.router.go('study');
        }
      }, 'A estudiar')
    ]);
  }

  function drawReminders(popover) {
    U.clear(popover);
    var today = U.today();
    var soon = U.sortBy(store.get().events.filter(function (e) {
      return e.date >= today && U.daysBetween(today, e.date) <= 3;
    }), function (e) { return e.date + (e.start || ''); });

    var overdue = store.overdueTasks();

    popover.appendChild(U.h('div.row.row--between.mb-2', [
      U.h('strong.small', 'Recordatorios'),
      U.h('span.badge', soon.length + overdue.length)
    ]));

    var nudge = examNudge(popover);
    if (nudge) popover.appendChild(nudge);

    if (overdue.length) {
      popover.appendChild(U.h('p.field__label.mb-1', 'Tareas vencidas'));
      overdue.forEach(function (t) {
        popover.appendChild(U.h('div.row.gap-1', [
          U.h('button.search-results__item', { style: { flex: '1', minWidth: '0' },
            onclick: function () { popover.hidden = true; Studia.router.go('tasks'); }
          }, [U.icon('check'), U.h('div.grow', [U.h('div.tiny.strong', t.title), U.h('div.tiny.soft', 'Vencía ' + U.fmtRelative(t.due))])]),
          U.h('button.icon-btn', {
            style: { flex: 'none' },
            title: 'Posponer 7 días', 'aria-label': 'Posponer ' + t.title + ' 7 días',
            onclick: function (ev) {
              ev.stopPropagation();
              store.updateRow('tasks', t.id, { due: U.toISO(U.addDays(new Date(), 7)) });
              ui.toast('Pospuesta 7 días', 'success');
              drawReminders(popover);
            }
          }, U.icon('calendar'))
        ]));
      });
    }

    if (soon.length) {
      popover.appendChild(U.h('p.field__label.mb-1', 'Próximos 3 días'));
      soon.forEach(function (e) {
        popover.appendChild(U.h('button.search-results__item', {
          onclick: function () { popover.hidden = true; Studia.router.go('calendar'); }
        }, [U.icon('calendar'), U.h('div.grow', [U.h('div.tiny.strong', e.title), U.h('div.tiny.soft', U.fmtRelative(e.date) + (e.start ? ' · ' + e.start.slice(0, 5) : ''))])]));
      });
    }

    if (!soon.length && !overdue.length) {
      popover.appendChild(U.h('p.small.soft.pad-2', 'Nada urgente. Disfruta del día 🎉'));
    }

    var enabled = store.get().settings.notifications;
    popover.appendChild(U.h('div.row.row--between.mt-2', { style: { borderTop: '1px solid var(--border)', paddingTop: '10px' } }, [
      U.h('span.small', 'Avisos del navegador'),
      (function () {
        var input = U.h('input', { type: 'checkbox' });
        input.checked = enabled;
        input.addEventListener('change', function () {
          if (input.checked && global.Notification && Notification.permission === 'default') {
            Notification.requestPermission().then(function (perm) {
              store.update(function (s) { s.settings.notifications = perm === 'granted'; });
              ui.toast(perm === 'granted' ? 'Avisos activados' : 'Permiso de notificaciones denegado', perm === 'granted' ? 'success' : 'warn');
            });
          } else {
            store.update(function (s) { s.settings.notifications = input.checked; });
          }
        });
        return U.h('label.switch', [input, U.h('span.switch__track')]);
      })()
    ]));
  }

  /* ---------------- Perfil y ajustes ---------------- */
  function wireProfile() {
    function showProfile(anchor) {
      var p = store.get().profile;
      var cloud = !!(Studia.auth && Studia.auth.user && Studia.auth.user());
      var items = [
        U.h('div', [U.h('strong.small', p.name), U.h('p.tiny.soft', (cloud ? Studia.auth.email() : p.university) || '')]),
        U.h('button.btn.btn--ghost.btn--sm.btn--block', { onclick: function () { openSettings(); } }, [U.icon('settings'), 'Ajustes'])
      ];
      if (!cloud) {
        items.push(U.h('button.btn.btn--ghost.btn--sm.btn--block', {
          onclick: function () {
            ui.confirm({ title: '¿Restablecer los datos de demostración?', message: 'Se borrarán tus tareas, sesiones y ajustes y volverán los datos de ejemplo.', okLabel: 'Restablecer', danger: true })
              .then(function (ok) {
                if (!ok) return;
                store.reset();
                applyTheme('light');
                ui.toast('Datos restablecidos', 'info');
                Studia.router.go('dashboard');
              });
          }
        }, [U.icon('reset'), 'Restablecer demo']));
      } else {
        items.push(U.h('button.btn.btn--ghost.btn--sm.btn--block', {
          onclick: function () {
            ui.confirm({ title: '¿Cerrar sesión?', message: 'Tus datos quedan guardados en tu cuenta de Studia-IA.', okLabel: 'Cerrar sesión', danger: true })
              .then(function (ok) { if (ok) Studia.auth.signOut(); });
          }
        }, [U.icon('exit'), 'Cerrar sesión']));
      }
      ui.popover(anchor, U.h('div.col.gap-2', { style: { padding: '6px' } }, items));
    }
    ['btnProfile', 'btnSidebarProfile'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        showProfile(el);
      });
    });
  }

  function downloadBackup() {
    try {
      var json = JSON.stringify(store.exportData(), null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'studia-ia-' + U.today() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      ui.toast('Copia descargada', 'success');
    } catch (e) {
      ui.toast('No se pudo crear la copia', 'error');
    }
  }

  function openSettings() {
    var s = store.get().settings;
    var p = store.get().profile;
    var nameInput = U.h('input.input', { value: p.name });
    var uniInput = U.h('input.input', { value: p.university || '' });
    var goalInput = U.h('input.input.input--sm', { type: 'number', min: 15, step: 15, value: s.dailyGoal || 120 });
    var firstDaySelect = U.h('select.select.select--sm', {}, [
      U.h('option', { value: '1' }, 'Lunes'),
      U.h('option', { value: '0' }, 'Domingo')
    ]);
    firstDaySelect.value = String(s.firstDay === undefined ? 1 : s.firstDay);

    var regions = (s.holidayRegions || []).slice();
    var fileInput = U.h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var payload;
        try { payload = JSON.parse(String(reader.result)); }
        catch (err) { ui.toast('El archivo no es un JSON válido', 'error'); return; }
        ui.confirm({
          title: 'Restaurar copia de seguridad',
          message: 'Se reemplazarán TODOS los datos actuales (tareas, sesiones, ajustes…) por los de la copia. Esta acción no se puede deshacer.',
          okLabel: 'Restaurar', danger: true
        }).then(function (ok) {
          if (!ok) return;
          try {
            store.importData(payload);
            applyTheme(store.get().settings.theme);
            updateChrome();
            if (modalApi) modalApi.close();
            ui.toast('Copia restaurada correctamente', 'success');
            Studia.router.go('dashboard');
          } catch (err) {
            ui.toast(err.message || 'No se pudo restaurar la copia', 'error');
          }
        });
      };
      reader.onerror = function () { ui.toast('No se pudo leer el archivo', 'error'); };
      reader.readAsText(file);
    });

    var modalApi = ui.modal({
      title: 'Ajustes',
      subtitle: 'Preferencias de tu cuenta',
      body: U.h('div.col.gap-3', [
        U.h('div.field', [U.h('label.field__label', 'Nombre'), nameInput]),
        U.h('div.field', [U.h('label.field__label', 'Universidad'), uniInput]),
        U.h('div.field', [U.h('label.field__label', 'Objetivo de estudio diario (min)'), goalInput]),
        U.h('div.field', [U.h('label.field__label', 'Primer día de la semana'), firstDaySelect]),
        U.h('div.field', [
          U.h('label.field__label', 'Festivos visibles'),
          U.h('div.col.gap-1', Object.keys(Studia.holidays.REGIONS).map(function (key) {
            var input = U.h('input', { type: 'checkbox' });
            input.checked = regions.indexOf(key) !== -1;
            input.addEventListener('change', function () {
              var i = regions.indexOf(key);
              if (input.checked && i === -1) regions.push(key);
              if (!input.checked && i !== -1) regions.splice(i, 1);
            });
            return U.h('label.switch', [input, U.h('span.switch__track'), U.h('span.small', Studia.holidays.REGIONS[key].label)]);
          }))
        ]),
        U.h('div.field', [
          U.h('label.field__label', 'Copia de seguridad'),
          U.h('p.tiny.soft.mb-1', 'Tus datos viven solo en este navegador. Descarga una copia si vas a cambiar de equipo o borrar datos.'),
          U.h('div.row.row--wrap.gap-2', [
            U.h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: downloadBackup }, [U.icon('file'), 'Descargar copia']),
            U.h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { fileInput.click(); } }, [U.icon('upload'), 'Restaurar copia'])
          ]),
          fileInput
        ])
      ]),
      actions: [
        { label: 'Diagnóstico', align: 'left', variant: 'ghost', onClick: function () { openDiagnostics(); return false; } },
        { label: 'Cancelar', variant: 'ghost' },
        {
          label: 'Guardar', variant: 'primary', onClick: function () {
            store.update(function (st) {
              st.profile.name = nameInput.value.trim() || 'Estudiante';
              st.profile.initials = st.profile.name.split(/\s+/).map(function (x) { return x[0]; }).join('').slice(0, 2).toUpperCase();
              st.profile.university = uniInput.value;
              st.settings.dailyGoal = U.clamp(+goalInput.value || 120, 15, 600);
              st.settings.firstDay = +firstDaySelect.value;
              st.settings.holidayRegions = regions;
            });
            ui.toast('Ajustes guardados', 'success');
          }
        }
      ]
    });
  }

  /* ---------------- Elementos de la interfaz ---------------- */
  function updateChrome() {
    var state = store.get();
    var info = store.streakInfo();
    var level = store.levelInfo();

    var topStreak = document.getElementById('topStreakValue');
    if (topStreak) topStreak.textContent = info.current;

    var mini = document.getElementById('streakMiniValue');
    if (mini) mini.textContent = info.current + (info.current === 1 ? ' día' : ' días');
    var best = document.getElementById('streakMiniBest');
    if (best) best.textContent = info.best;

    var badgeTasks = document.getElementById('navBadgeTasks');
    if (badgeTasks) {
      var open = store.openTasks().length;
      badgeTasks.textContent = open;
      badgeTasks.hidden = !open;
    }

    var badgeCal = document.getElementById('navBadgeCalendar');
    if (badgeCal) {
      var today = U.today();
      var count = state.events.filter(function (e) { return e.date === today; }).length;
      badgeCal.textContent = count;
      badgeCal.hidden = !count;
    }

    var plan = document.getElementById('brandPlan');
    if (plan) plan.textContent = state.profile.plan === 'premium' ? 'Plan Premium' : 'Plan gratuito';

    var initials = document.getElementById('avatarInitials');
    if (initials) initials.textContent = state.profile.initials || 'ES';

    var bellDot = document.getElementById('bellDot');
    if (bellDot) {
      var urgent = store.overdueTasks().length + state.events.filter(function (e) {
        if (e.date < U.today()) return false;
        var left = U.daysBetween(U.today(), e.date);
        // exámenes y entregas avisan con 3 días; el resto, con 1
        return left <= (e.type === 'exam' || e.type === 'deadline' ? 3 : 1);
      }).length;
      bellDot.hidden = !urgent;
    }
  }

  function mountTimerChip() {
    var actions = document.querySelector('.topbar__actions');
    if (!actions || document.getElementById('timerChip')) return;
    var chip = U.h('div.chip#timerChip', { hidden: true, style: { borderColor: 'var(--brand-200)', background: 'var(--brand-50)', color: 'var(--brand-600)' } }, [
      U.icon('timer'),
      U.h('span', { 'data-timer-time': '' }, '25:00'),
      U.h('span.tiny', { 'data-timer-mode': '' }, 'Enfoque')
    ]);
    chip.addEventListener('click', function () { Studia.router.go('study'); });
    actions.insertBefore(chip, actions.firstChild);
  }

  /* ---------------- Atajos de teclado ---------------- */
  function onGlobalKey(e) {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === '/') { e.preventDefault(); var gs = document.getElementById('globalSearch'); if (gs) gs.focus(); }
    if (e.key === 't') Studia.router.go('study');
    if (e.key === 'c') Studia.router.go('calendar');
    if (e.key === 'h') Studia.router.go('schedule');
  }

  function wireShortcuts() {
    document.addEventListener('keydown', onGlobalKey);
  }

  /* ---------------- Scroll ----------------
     Red de seguridad: si la rueda del ratón cae sobre un elemento que NO
     puede desplazarse (tarjetas, tablas, celdas...), se desplaza la página.
     Sin esto hay navegadores donde el scroll "se queda" y no baja nada. */
  function canScroll(node) {
    if (!node || node === document.body || node === document.documentElement) return false;
    var s = getComputedStyle(node);
    if (!/(auto|scroll|overlay)/.test(s.overflowY)) return false;
    return node.scrollHeight - node.clientHeight > 1;
  }
  function scrollableAncestor(node) {
    while (node && node !== document.body) {
      if (canScroll(node)) return node;
      node = node.parentElement;
    }
    return null;
  }
  function wireA11y() {
    var skip = document.getElementById('skipToMain');
    if (skip) skip.addEventListener('click', function () {
      var main = document.getElementById('appMain');
      if (!main) return;
      main.focus();
      main.scrollIntoView({ block: 'start' });
    });
  }

  function wireScroll() {
    document.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.defaultPrevented) return;
      if (document.body.style.overflow === 'hidden') return;          // hay un modal abierto
      if (scrollableAncestor(e.target)) return;                     // ese contenedor se encarga
      var se = document.scrollingElement || document.documentElement;
      var max = se.scrollHeight - se.clientHeight;
      if (max <= 1) return;                                          // no hay nada más abajo
      var next = se.scrollTop + e.deltaY;
      if (next <= 0 || next >= max) return;                          // ya está en el borde
      e.preventDefault();
      se.scrollTop = next;
    }, { passive: false });

    /* Botón "volver arriba": deja claro que la página se ha desplazado. */
    var top = U.h('button.to-top', { 'aria-label': 'Volver arriba', title: 'Volver arriba' }, U.icon('arrow-up'));
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(top);
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        top.classList.toggle('is-visible', window.scrollY > 260);
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------------- Diagnóstico ----------------
     Cualquier error no controlado se guarda aquí para poder copiarlo y
     reportarlo. Es la forma más rápida de saber qué falla en otro equipo. */
  var APP_VERSION = '0.5.0';
  var recentErrors = [];

  function captureError(kind, message, detail) {
    var item = {
      kind: kind,
      message: String(message || 'Error desconocido'),
      detail: detail ? String(detail) : '',
      at: new Date()
    };
    recentErrors.push(item);
    if (recentErrors.length > 20) recentErrors.shift();
    Studia.lastError = item;
    // Los avisos esperados (kind 'ia') se registran pero no ensucian la consola.
    if (kind !== 'ia' && global.console && console.error) {
      console.error('[Studia-IA ' + APP_VERSION + '] ' + kind + ':', message, detail || '');
    }
    if (kind === 'unhandledrejection') return;
    var root = document.getElementById('toastRoot');
    if (!root || root.querySelector('.toast--error')) return;
    var t = U.h('div.toast.toast--error', [
      U.h('span.toast__icon', U.icon('alert')),
      U.h('div.grow', [
        U.h('strong', 'Algo ha fallado'),
        U.h('div.small.mt-1', 'Pulsa aquí para copiar el detalle y enviarlo al equipo.')
      ])
    ]);
    t.addEventListener('click', function () {
      U.copy(diagnosticsText()).then(function () {
        if (t.parentNode) t.remove();
        ui.toast('Detalle del fallo copiado', 'success');
      }).catch(function () { if (t.parentNode) t.remove(); });
    });
    root.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 9000);
  }

  function wireErrors() {
    global.addEventListener('error', function (e) {
      captureError('error', e.message, e.error && e.error.stack);
    });
    global.addEventListener('unhandledrejection', function (e) {
      var r = e.reason;
      captureError('unhandledrejection', (r && (r.message || r)) || 'Promesa rechazada', r && r.stack);
    });
  }

  function diagnosticsText() {
    var state = null;
    try { state = store.get(); } catch (e) { /* datos ilegibles */ }
    var lines = [
      'Studia-IA ' + APP_VERSION,
      'URL: ' + global.location.href,
      'Navegador: ' + (global.navigator ? navigator.userAgent : '?'),
      'Pantalla: ' + global.innerWidth + 'x' + global.innerHeight + ' @' + (global.devicePixelRatio || 1) + 'x',
      'Tema: ' + document.documentElement.getAttribute('data-theme'),
      'Vista: ' + (Studia.router.current() || '?'),
      'Plan: ' + (state && state.profile ? state.profile.plan : '?'),
      'Datos: ' + (state
        ? state.tasks.length + ' tareas · ' + state.events.length + ' eventos · ' +
          state.sessions.length + ' sesiones · ' + state.subjects.length + ' asignaturas'
        : 'no se pudieron cargar'),
      '',
      recentErrors.length ? 'Errores recientes (' + recentErrors.length + '):' : 'Errores recientes: ninguno'
    ];
    recentErrors.forEach(function (e, i) {
      lines.push((i + 1) + '. [' + e.kind + '] ' + e.message);
      if (e.detail) lines.push('   ' + e.detail.split('\n').slice(0, 5).join('\n   '));
    });
    return lines.join('\n');
  }

  function openDiagnostics() {
    var pre = U.h('pre.diag', { style: { userSelect: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, diagnosticsText());
    ui.modal({
      title: 'Diagnóstico',
      subtitle: 'Copia esto si algo no funciona y pégalo en el grupo',
      body: U.h('div.col.gap-2', [
        pre,
        U.h('p.tiny.soft', 'No incluye contraseñas: la app guarda todo en este navegador, sin cuenta.')
      ]),
      actions: [
        { label: 'Limpiar errores', align: 'left', variant: 'ghost', onClick: function () { recentErrors.length = 0; } },
        {
          label: 'Copiar', variant: 'primary', onClick: function () {
            U.copy(diagnosticsText())
              .then(function () { ui.toast('Diagnóstico copiado', 'success'); })
              .catch(function () { ui.toast('No se pudo copiar; selecciona el texto', 'warn'); });
          }
        }
      ]
    });
  }

  /* ---------------- Pantalla de carga y arranque ---------------- */
  function showBoot() {
    var el = document.getElementById('bootScreen');
    if (el) el.hidden = false;
  }
  function hideBoot() {
    var el = document.getElementById('bootScreen');
    if (el) el.hidden = true;
  }

  /* Guarda lo pendiente al cerrar/ocultar: así no se pierde el último
     cambio (p. ej. arrancar el pomodoro y recargar en el acto). */
  function wireLifecycle() {
    function flush() { try { store.flush(); } catch (e) { /* sin storage */ } }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flush();
    });
  }

  function startApp() {
    /* Re-entradas (cambio de sesión sin recargar): se quitan los
       listeners del arranque anterior para no duplicarlos. */
    var uid = (Studia.auth.user() && Studia.auth.user().id) || 'anon';
    if (lastMountedUser && lastMountedUser !== uid) {
      Object.keys(wireOnce).forEach(function (k) {
        try { wireOnce[k](); } catch (e) { /* ya liberado */ }
      });
      wireOnce = {};
      document.removeEventListener('keydown', onGlobalKey);
      var chip = document.getElementById('timerChip');
      if (chip) chip.remove();
    }
    lastMountedUser = uid;

    applyTheme(store.get().settings.theme);
    wireLifecycle();

    Object.keys(Studia.modules).forEach(function (key) {
      if (Studia.modules[key] && typeof Studia.modules[key].init === 'function') Studia.modules[key].init();
    });

    mountTimerChip();
    wireSidebar();
    wireSearch();
    wireBell();
    wireProfile();
    wireShortcuts();
    wireA11y();
    wireScroll();
    document.getElementById('btnTheme').addEventListener('click', toggleTheme);
    document.getElementById('btnSettings').addEventListener('click', openSettings);

    var unsub = store.subscribe(updateChrome);
    wireOnce.chrome = unsub;
    /* Cambio de usuario: la recarga la atiende el listener global del boot. */
    updateChrome();

    Studia.router.start();
    document.body.classList.add('is-ready');

    /* Con la app ya montada: si había datos del prototipo en este
       navegador, se suben a la cuenta la primera vez. */
    if (Studia.db.migrateLegacy) {
      Studia.db.migrateLegacy().then(function (res) {
        if (res === 'migrated') {
          /* Se recarga para pintar el estado real de la cuenta (ya
             sincronizado con la nube) tras el volcado. */
          store.load().then(function () { Studia.router.render(); });
          ui.toast('Tus datos de prueba se han subido a tu cuenta', 'success');
        }
      });
    }
  }

  /* ---------------- Pantalla de acceso (obligatorio) ---------------- */
  function showError(box, message) {
    var err = box.querySelector('.login-screen__error');
    if (!err) {
      err = U.h('p.login-screen__error', { role: 'alert' });
      box.insertBefore(err, box.querySelector('.login-screen__actions'));
    }
    U.clear(err);
    err.appendChild(document.createTextNode(message));
  }

  function drawLogin() {
    var root = document.getElementById('loginScreen');
    if (!root) return;
    document.body.classList.remove('is-ready');   // oculta la app hasta entrar
    U.clear(root);
    root.hidden = false;

    var email = U.h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'tu@correo.edu', class: 'field__input' });
    var pass = U.h('input', { type: 'password', required: true, minlength: '6', autocomplete: 'current-password', placeholder: '••••••••', class: 'field__input' });
    var mode = 'in';
    var tabIn = U.h('button.btn.btn--soft.btn--sm', { type: 'button' }, 'Entrar');
    var tabUp = U.h('button.btn.btn--ghost.btn--sm', { type: 'button' }, 'Crear cuenta');

    function setMode(next) {
      mode = next;
      tabIn.className = 'btn btn--sm ' + (mode === 'in' ? 'btn--soft' : 'btn--ghost');
      tabUp.className = 'btn btn--sm ' + (mode === 'up' ? 'btn--soft' : 'btn--ghost');
      pass.setAttribute('autocomplete', mode === 'in' ? 'current-password' : 'new-password');
      submitBtn.textContent = mode === 'in' ? 'Entrar' : 'Crear cuenta';
      help.textContent = mode === 'in'
        ? 'Estudia mejor con tus tareas, tu horario y Luna.'
        : 'Se crea gratis y empieza con una cuenta vacía: la app se adapta a ti.';
    }

    var help = U.h('p.tiny.soft', 'Estudia mejor con tus tareas, tu horario y Luna.');
    var submitBtn = U.h('button.btn.btn--primary.btn--block', { type: 'submit' }, 'Entrar');
    tabIn.addEventListener('click', function () { setMode('in'); });
    tabUp.addEventListener('click', function () { setMode('up'); });

    var form = U.h('form.login-screen__form', { novalidate: false }, [
      U.h('div.row.gap-1.login-screen__tabs', [tabIn, tabUp]),
      U.h('div.field', [U.h('label.field__label', { for: 'loginEmail' }, 'Email'), email]),
      U.h('div.field', [U.h('label.field__label', { for: 'loginPass' }, 'Contraseña (mínimo 6 caracteres)'), pass]),
      U.h('div.login-screen__actions', [submitBtn]),
      help
    ]);
    email.id = 'loginEmail';
    pass.id = 'loginPass';

    function submit(e) {
      e.preventDefault();
      var em = email.value.trim();
      var pw = pass.value;
      if (!em || !pw) { showError(form, 'Escribe email y contraseña.'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Espera…';
      var op = mode === 'in'
        ? Studia.auth.signIn(em, pw)
        : Studia.auth.signUp(em, pw);
      op.then(function (res) {
        if (mode === 'up') {
          var d = res && res.data ? res : res;
          var needsConfirm = res && res.data && res.data.session == null;
          if (needsConfirm) {
            showError(form, 'Cuenta creada. Confirma el email (en cuanto lo activemos) y entra.');
            return;
          }
        }
        /* onAuthStateChange mostrará la app al haber sesión */
      }).catch(function (err) {
        var msg = (err && err.message) || 'No se ha podido continuar.';
        if (/invalid login/i.test(msg)) msg = 'Email o contraseña incorrectos.';
        if (/already registered|already exists/i.test(msg)) msg = 'Ese email ya tiene cuenta. Prueba a entrar.';
        showError(form, msg);
      }).then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'in' ? 'Entrar' : 'Crear cuenta';
      });
    }
    form.addEventListener('submit', submit);

    root.appendChild(U.h('div.login-screen__box', [
      U.h('img', { src: 'assets/img/favicon.svg', alt: '', width: '52', height: '52' }),
      U.h('h1.login-screen__title', 'Studia-IA'),
      U.h('p.login-screen__sub', 'Organiza tu curso: tareas, horario, pomodoro y Luna.'),
      form
    ]));
    setTimeout(function () { email.focus(); }, 60);
  }

  function hideLogin() {
    var root = document.getElementById('loginScreen');
    if (root) { root.hidden = true; U.clear(root); }
  }

  function boot() {
    wireErrors();
    var t = setTimeout(showBoot, 150);   // solo aparece si la carga tarda
    var appStarted = false;

    function openApp() {
      store.load().then(function () {
        clearTimeout(t);
        hideBoot();
        hideLogin();
        startApp();
      }, function (e) {
        clearTimeout(t);
        hideBoot();
        hideLogin();
        startApp();
        captureError('carga', e && e.message, e && e.stack);
        ui.toast('No se pudieron cargar tus datos guardados: se muestran datos vacíos. Puedes restaurar una copia en Ajustes → Copia de seguridad.', 'warn', 9000);
      });
    }

    var sdkReady = Studia.auth.init().then(function () { return true; }, function () { return false; });
    sdkReady.then(function (ok) {
      if (!ok) {
        clearTimeout(t);
        hideBoot();
        showBoot();
        document.querySelector('.boot-screen__card p').textContent =
          'Sin conexión con Supabase: revisa internet y recarga.';
        return;
      }
      /* Cambio de sesión: con usuario se abre la app; sin él, pantalla de acceso.
         Tras arrancar ya, la recarga la hace store.watchAuth (estado); aquí solo
         montar la app si aún no estaba montada. */
      Studia.auth.onChange(function (user) {
        if (user) { if (!appStarted) openApp(); }
        else { appStarted = false; drawLogin(); }
      });
      clearTimeout(t);
      hideBoot();                       // sin usuario → no quedarse "Cargando…"
      if (Studia.auth.user()) openApp();
      else drawLogin();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

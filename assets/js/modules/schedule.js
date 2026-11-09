/* =========================================================
   Studia-IA · modules/schedule.js
   Horario semanal: clases, laboratorios, detección de
   solapamientos y resumen de horas por asignatura.
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var HOUR_H = 56;          // px por hora
  var DEFAULT_START_H = 8;
  var DEFAULT_END_H = 21;
  var WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  var COLORS = ['var(--brand-500)', 'var(--mint-500)', 'var(--amber-500)', 'var(--rose-500)', 'var(--sky-500)', 'var(--violet-500)'];

  var view = { showWeekend: false, selectedDay: null, hiddenSubjects: {} };

  var dragClass = null;
  var dragCol = null;
  var dragMoved = false;
  var suppressClick = false;

  function visibleClasses() {
    return store.get().timetable.filter(function (c) { return !view.hiddenSubjects[c.subjectId]; });
  }

  /* Rango de horas visible: de la clase más temprana a la más tarde,
     con mínimo el tramo por defecto (8:00–21:00). */
  function visibleHoursRange() {
    var startH = DEFAULT_START_H, endH = DEFAULT_END_H;
    store.get().timetable.forEach(function (c) {
      var s = U.timeToMinutes(c.start), e = U.timeToMinutes(c.end);
      if (!isNaN(s)) startH = Math.min(startH, Math.floor(s / 60));
      if (!isNaN(e)) endH = Math.max(endH, Math.ceil(e / 60));
    });
    if (endH <= startH) endH = startH + 1;
    return { startH: startH, endH: endH };
  }

  function subjectIdsInTimetable() {
    var ids = [];
    store.get().timetable.forEach(function (c) {
      if (ids.indexOf(c.subjectId) === -1) ids.push(c.subjectId);
    });
    return ids.sort(function (a, b) {
      return store.subjectName(a).localeCompare(store.subjectName(b), 'es');
    });
  }

  function subjectFilterBar() {
    var ids = subjectIdsInTimetable();
    if (!ids.length) return null;
    var all = ids.every(function (id) { return !view.hiddenSubjects[id]; });
    var chips = ids.map(function (id) {
      var on = !view.hiddenSubjects[id];
      var color = store.subjectColor(id);
      return U.h('button.badge.badge--outline', {
        style: {
          cursor: 'pointer',
          opacity: on ? '1' : '.45',
          borderColor: on ? color : 'var(--border)',
          color: on ? color : 'var(--text-soft)'
        },
        title: on ? 'Ocultar ' + store.subjectName(id) : 'Mostrar ' + store.subjectName(id),
        onclick: function () {
          if (view.hiddenSubjects[id]) delete view.hiddenSubjects[id];
          else view.hiddenSubjects[id] = true;
          refresh();
        }
      }, [U.h('span.dot-color', { style: { background: color } }), store.subjectName(id)]);
    });
    chips.push(U.h('button.btn.btn--ghost.btn--sm', {
      style: { marginLeft: 'auto' },
      onclick: function () {
        if (all) {
          ids.forEach(function (id) { view.hiddenSubjects[id] = true; });
        } else {
          view.hiddenSubjects = {};
        }
        refresh();
      }
    }, all ? 'Ocultar todas' : 'Mostrar todas'));
    return U.h('div.row.row--wrap.gap-1', { style: { padding: '0 18px 12px' } }, chips);
  }

  /* ---------------- Detección de conflictos ---------------- */
  function conflictsOf(day) {
    var list = store.get().timetable.filter(function (c) { return c.day === day; });
    var pairs = [];
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j];
        var aS = U.timeToMinutes(a.start), aE = U.timeToMinutes(a.end);
        var bS = U.timeToMinutes(b.start), bE = U.timeToMinutes(b.end);
        if (aS < bE && bS < aE) pairs.push([a.id, b.id]);
      }
    }
    return pairs;
  }

  function isConflicting(id) {
    return conflictsOf(store.find('timetable', id).day)
      .some(function (p) { return p[0] === id || p[1] === id; });
  }

  /* ---------------- Resumen ---------------- */
  function weeklySummary() {
    var bySubject = {};
    visibleClasses().forEach(function (c) {
      var mins = U.minutesBetween(c.start, c.end);
      bySubject[c.subjectId] = (bySubject[c.subjectId] || 0) + mins;
    });
    return Object.keys(bySubject).map(function (id) {
      return { subjectId: id, minutes: bySubject[id], hours: (bySubject[id] / 60).toFixed(1) };
    }).sort(function (a, b) { return b.minutes - a.minutes; });
  }

  /* ---------------- Render ---------------- */
  function render(root) {
    suppressClick = false;
    dragClass = null;
    dragCol = null;
    dragMoved = false;
    U.clear(root);
    root.appendChild(U.h('div.grid.grid--split', { style: { '--split': '320px' } }, [
      scheduleCard(),
      sideColumn()
    ]));
  }

  function scheduleCard() {
    var range = visibleHoursRange();
    var START_H = range.startH, END_H = range.endH;
    var startMin = START_H * 60, endMin = END_H * 60;

    function hourLabel(m) {
      var h = Math.floor(m / 60);
      var mm = m % 60;
      if (h >= 24) h -= 24;
      return U.pad(h) + ':' + (mm ? U.pad(mm) : '00');
    }

    function yOf(min) { return (min - startMin) / 60 * HOUR_H; }

    var days = view.showWeekend ? 7 : 5;
    var todayIdx = U.dayIndex(new Date());
    var gridTpl = '64px repeat(' + days + ', minmax(0, 1fr))';

    var head = U.h('div.tt__head', { style: { gridTemplateColumns: gridTpl } }, [U.h('div.tt__corner', 'Hora')]);
    for (var d = 0; d < days; d++) {
      head.appendChild(U.h('div.tt__day' + (d === todayIdx ? '.tt__day--today' : ''), U.DIAS[d].slice(0, 3) + (d === todayIdx ? ' · hoy' : '')));
    }

    var body = U.h('div.tt__body', { style: { gridTemplateColumns: gridTpl } });

    /* Columna de horas: cada franja de 30 min, etiqueta en hora en punto */
    var hours = U.h('div.tt__hours');
    for (var m30 = startMin; m30 < endMin; m30 += 30) {
      hours.appendChild(U.h('div.tt__hour', {
        style: { height: (HOUR_H / 2) + 'px' },
        title: hourLabel(m30)
      }, (m30 % 60 === 0 ? hourLabel(m30) : '')));
    }
    body.appendChild(hours);

    /* Columnas de días */
    for (var day = 0; day < days; day++) {
      (function (day) {
        var col = U.h('div.tt__col' + (day === todayIdx ? '.tt__col--today' : ''));
        for (var q = START_H * 4; q < END_H * 4; q++) {
          col.appendChild(U.h('div.tt__grid-line' + (q % 2 ? '.tt__grid-line--half' : ''), {
            style: { top: ((q * 15 - startMin) / 60 * HOUR_H) + 'px' }
          }));
        }
        col.addEventListener('click', function (ev) {
          if (suppressClick) { suppressClick = false; return; }
          if (ev.target !== col) return;
          var rect = col.getBoundingClientRect();
          var minutes = startMin + Math.round((ev.clientY - rect.top) / HOUR_H * 60 / 15) * 15;
          minutes = U.clamp(minutes, startMin, endMin - 60);
          openForm(null, { day: day, start: U.minutesToTime(minutes), end: U.minutesToTime(Math.min(minutes + 90, endMin)) });
        });
        col.addEventListener('dragover', function (ev) {
          if (!dragClass) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          if (dragCol !== col) {
            if (dragCol) dragCol.classList.remove('tt__col--droptarget');
            dragCol = col;
            col.classList.add('tt__col--droptarget');
          }
        });
        col.addEventListener('dragleave', function () { col.classList.remove('tt__col--droptarget'); });
        col.addEventListener('drop', function (ev) {
          ev.preventDefault();
          col.classList.remove('tt__col--droptarget');
          if (!dragClass) return;
          var moved = dragClass;
          var rect = col.getBoundingClientRect();
          var dur = U.timeToMinutes(moved.end) - U.timeToMinutes(moved.start);
          var minutes = U.clamp(
            startMin + Math.round((ev.clientY - rect.top) / HOUR_H * 60 / 15) * 15,
            startMin, Math.max(startMin, endMin - dur)
          );
          dragClass = null; dragCol = null; dragMoved = true; suppressClick = true;
          store.updateRow('timetable', moved.id, {
            day: day,
            start: U.minutesToTime(minutes),
            end: U.minutesToTime(Math.min(minutes + dur, 1440))
          });
          ui.toast(store.subjectName(moved.subjectId) + ' movida al ' + U.DIAS[day] + ' a las ' + U.minutesToTime(minutes), 'success');
          refresh();
        });

        visibleClasses().filter(function (c) { return c.day === day; }).forEach(function (c) {
          var s = U.timeToMinutes(c.start), e = U.timeToMinutes(c.end);
          var top = yOf(s);
          var height = Math.max(26, (e - s) / 60 * HOUR_H - 3);
          var color = store.subjectColor(c.subjectId);
          col.appendChild(U.h('button.tt__class' + (isConflicting(c.id) ? '.tt__class--conflict' : ''), {
            style: { top: top + 'px', height: height + 'px', borderLeftColor: color, background: 'color-mix(in srgb, ' + color + ' 12%, var(--surface))' },
            draggable: 'true',
            onclick: function (ev) {
              ev.stopPropagation();
              if (suppressClick) { suppressClick = false; return; }
              openForm(c);
            },
            ondragstart: function (ev) { dragClass = c; ev.dataTransfer.effectAllowed = 'move'; },
            ondragend: function () {
              if (dragCol) dragCol.classList.remove('tt__col--droptarget');
              if (dragMoved) { suppressClick = true; dragMoved = false; }
              dragClass = null; dragCol = null;
            },
            title: c.start + '–' + c.end + ' · ' + store.subjectName(c.subjectId)
          }, [
            U.h('strong', store.subjectName(c.subjectId)),
            U.h('span', c.start.slice(0, 5) + '–' + c.end.slice(0, 5) + (c.room ? ' · ' + c.room : ''))
          ]));
        });

        /* Línea de "ahora" */
        if (day === todayIdx) {
          var now = new Date();
          var nowMin = now.getHours() * 60 + now.getMinutes();
          if (nowMin >= startMin && nowMin <= endMin) {
            col.appendChild(U.h('div.tt__now', { style: { top: yOf(nowMin) + 'px' } }));
          }
        }
        body.appendChild(col);
      })(day);
    }

    return U.h('div.card.card--flush', [
      U.h('div.row.row--between.row--wrap.gap-2', { style: { padding: '16px 18px' } }, [
        U.h('div', [
          U.h('h3', 'Horario semanal'),
          U.h('p.tiny.soft', 'Haz clic en una franja para crear una clase · arrastra una clase para moverla')
        ]),
        U.h('div.row.gap-1', [
          U.h('div.segmented', [
            U.h('button', { class: view.showWeekend ? '' : 'is-active', onclick: function () { view.showWeekend = false; refresh(); } }, 'L–V'),
            U.h('button', { class: view.showWeekend ? 'is-active' : '', onclick: function () { view.showWeekend = true; refresh(); } }, 'L–D')
          ]),
          U.h('button.btn.btn--primary.btn--sm', { onclick: function () { openForm(null, { day: U.dayIndex(new Date()), start: '09:00', end: '10:30' }); } }, [U.icon('plus'), 'Clase'])
        ])
      ]),
      subjectFilterBar(),
      U.h('div.tt', [head, body]),
      U.h('p.tt-hint.tiny.soft', 'Desliza en horizontal para ver toda la semana')
    ]);
  }

  function sideColumn() {
    var summary = weeklySummary();
    var conflicts = [];
    for (var d = 0; d < 7; d++) {
      conflictsOf(d).forEach(function (p) { conflicts.push({ day: d, ids: p }); });
    }
    var today = store.todayClasses().filter(function (c) { return !view.hiddenSubjects[c.subjectId]; });

    return U.h('div.col.gap-2', [
      U.h('div.card', [
        U.h('div.card__head', [U.h('h3', 'Hoy en clase'), U.h('span.badge.badge--brand', today.length + ' clases')]),
        today.length ? U.h('div.col.gap-1', today.map(function (c) {
          return U.h('div.row.gap-2', [
            U.h('span.mono.small.soft.nowrap', c.start.slice(0, 5)),
            U.h('span.dot-color', { style: { background: store.subjectColor(c.subjectId) } }),
            U.h('span.small.grow.truncate', store.subjectName(c.subjectId)),
            U.h('span.tiny.soft.nowrap', c.room || '')
          ]);
        })) : U.h('p.small.soft', 'Hoy no tienes clases registradas.')
      ]),
      U.h('div.card', [
        U.h('div.card__head', [U.h('h3', 'Horas por asignatura'), U.h('span.tiny.soft', 'semanales')]),
        U.h('div.col.gap-2', summary.length ? summary.map(function (s) {
          var total = summary.reduce(function (a, b) { return a + b.minutes; }, 0);
          return U.h('div.goal', [
            U.h('div.goal__row', [
              U.h('span.row.gap-2', [U.h('span.dot-color', { style: { background: store.subjectColor(s.subjectId) } }), U.h('span.small', store.subjectName(s.subjectId))]),
              U.h('span.small.strong', s.hours + ' h')
            ]),
            U.h('div.progress.progress--thin', U.h('div.progress__bar', { style: { width: (s.minutes / total * 100) + '%', background: store.subjectColor(s.subjectId) } }))
          ]);
        }) : U.h('p.small.soft', 'Añade clases para ver el reparto de horas.'))
      ]),
      conflicts.length ? U.h('div.card', { style: { borderColor: 'rgba(244,63,94,.4)' } }, [
        U.h('div.card__head', [U.h('h3', 'Solapamientos'), U.h('span.badge.badge--rose', conflicts.length)]),
        U.h('div.col.gap-1', conflicts.map(function (c) {
          var a = store.find('timetable', c.ids[0]), b = store.find('timetable', c.ids[1]);
          return U.h('p.small', [
            U.h('strong', U.DIAS[c.day] + ': '),
            store.subjectName(a.subjectId) + ' y ' + store.subjectName(b.subjectId) + ' se pisan.'
          ]);
        }))
      ]) : null
    ]);
  }

  /* ---------------- CRUD ---------------- */
  function openForm(existing, defaults) {
    var isNew = !existing;
    var c = existing || Object.assign({ subjectId: '', day: 0, start: '09:00', end: '10:30', room: '', type: 'class' }, defaults || {});
    var subjectOptions = store.get().subjects.map(function (s) { return { value: s.id, label: s.name }; });

    var form = U.h('form', { onsubmit: function (ev) { ev.preventDefault(); if (submit() !== false) m.close(); } });
    var m = { close: function () {} };
    var inputs = {};

    function fieldRow(f) {
      var el = U.h('div.field');
      if (f.label) el.appendChild(U.h('label.field__label', f.label));
      el.appendChild(buildInput(f));
      if (f.hint) el.appendChild(U.h('span.field__hint', f.hint));
      return el;
    }

    var range = visibleHoursRange();
    var startMin = range.startH * 60, endMin = range.endH * 60;

    function hourLabel(m) {
      var h = Math.floor(m / 60);
      var mm = m % 60;
      if (h >= 24) h -= 24;
      return U.pad(h) + ':' + (mm ? U.pad(mm) : '00');
    }

    function buildInput(f) {
      var input;
      if (f.type === 'select') {
        input = U.h('select.select', { name: f.name });
        (f.options || []).forEach(function (o) {
          var opt = U.h('option', { value: o.value }, o.label);
          if (String(o.value) === String(f.value)) opt.selected = true;
          input.appendChild(opt);
        });
      } else if (f.type === 'minutes') {
        input = U.h('select.select', { name: f.name });
        var cur = U.timeToMinutes(f.value || '');
        var exact = null;
        for (var m = startMin; m <= endMin; m += 15) {
          var op = U.h('option', { value: U.minutesToTime(m % 1440) }, hourLabel(m));
          if (m === cur) exact = op;
          input.appendChild(op);
        }
        if (!exact && !isNaN(cur)) {
          exact = U.h('option', { value: U.minutesToTime(cur % 1440) }, hourLabel(cur));
          input.appendChild(exact);
        }
        if (exact) exact.selected = true;
      } else {
        input = U.h('input.input', {
          type: f.type || 'text', name: f.name,
          placeholder: f.placeholder || ''
        });
        input.value = f.value === undefined || f.value === null ? '' : f.value;
      }
      inputs[f.name] = input;
      return input;
    }

    var FIELDS = [
      { name: 'subjectId', label: 'Asignatura', type: 'select', value: c.subjectId, options: subjectOptions, required: true },
      { name: 'day', label: 'Día', type: 'select', value: c.day, options: U.DIAS.map(function (d, i) { return { value: i, label: d }; }) },
      { name: 'start', label: 'Hora de inicio', type: 'minutes', value: c.start, required: true },
      { name: 'end', label: 'Hora de fin', type: 'minutes', value: c.end, required: true },
      { name: 'type', label: 'Tipo', type: 'select', value: c.type, options: [
        { value: 'class', label: 'Clase' }, { value: 'lab', label: 'Laboratorio' }, { value: 'study', label: 'Sesión de estudio' }
      ] }
    ];

    FIELDS.forEach(function (f) { form.appendChild(fieldRow(f)); });
    form.appendChild(U.h('div.field', [
      U.h('label.field__label', 'Aula'),
      U.h('div.row.gap-1', { style: { alignItems: 'center' } }, [
        buildInput({ name: 'room', placeholder: 'B-204, Lab. 3…', value: c.room }),
        isNew ? null : U.h('button.btn.btn--danger', {
          style: { flex: 'none', height: '42px' },
          onclick: function () { removeClass(c, m); }
        }, [U.icon('trash'), 'Eliminar'])
      ])
    ]));

    function submit() {
      var values = {};
      var missing = null;
      Object.keys(inputs).forEach(function (k) { values[k] = inputs[k].value; });
      if (!String(values.subjectId || '').trim()) missing = 'Asignatura';
      else if (!String(values.start || '').trim()) missing = 'Hora de inicio';
      else if (!String(values.end || '').trim()) missing = 'Hora de fin';
      if (missing) {
        ui.toast('Rellena «' + missing + '»', 'warn');
        inputs[{ 'Asignatura': 'subjectId', 'Hora de inicio': 'start', 'Hora de fin': 'end' }[missing]].focus();
        return false;
      }
      if (U.timeToMinutes(values.end) <= U.timeToMinutes(values.start)) {
        ui.toast('La hora de fin debe ser posterior a la de inicio', 'warn');
        return false;
      }
      var payload = {
        subjectId: values.subjectId, day: +values.day, start: values.start, end: values.end, room: values.room, type: values.type
      };
      if (isNew) {
        store.add('timetable', payload);
        ui.toast('Clase añadida al horario', 'success');
      } else {
        store.updateRow('timetable', c.id, payload);
        ui.toast('Clase actualizada', 'success');
      }
      refresh();
    }

    m = ui.modal({
      title: isNew ? 'Nueva clase' : 'Editar clase',
      subtitle: 'El horario se actualiza al instante y avisa de solapamientos.',
      body: form,
      actions: [
        { label: 'Cancelar', variant: 'ghost' },
        { label: isNew ? 'Añadir al horario' : 'Guardar', variant: 'primary', onClick: function () { if (submit() !== false) m.close(); return false; } }
      ],
      onOpen: function (api) { m = api; }
    });
  }

  function removeClass(c, modalApi) {
    ui.confirm({
      title: '¿Eliminar esta clase?',
      message: U.DIAS[c.day] + ' ' + c.start.slice(0, 5) + '–' + c.end.slice(0, 5) + ' · ' + store.subjectName(c.subjectId) + '. Se quitará del horario.',
      okLabel: 'Sí, eliminar',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      if (modalApi) modalApi.close();
      store.remove('timetable', c.id);
      ui.toast('Clase eliminada del horario', 'success');
      refresh();
    });
  }

  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'schedule') render(main);
  }

  function init() {
    store.subscribe(function () {
      if (Studia.router.current() === 'schedule') refresh();
    });
  }

  Studia.modules = Studia.modules || {};
  Studia.modules.schedule = { init: init, render: render };
  Studia.router.register('schedule', {
    title: 'Horario',
    subtitle: 'Tus clases, laboratorios y sesiones de la semana',
    render: render
  });
})(window);

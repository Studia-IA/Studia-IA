/* =========================================================
   Studia-IA · modules/calendar.js
   Calendario mensual: eventos, exámenes, entregas, bloques de
   estudio y días festivos configurables por comunidad.
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var TYPES = {
    exam: { label: 'Examen', icon: 'target', color: 'var(--rose-500)' },
    class: { label: 'Clase', icon: 'book', color: 'var(--sky-500)' },
    deadline: { label: 'Entrega', icon: 'check', color: 'var(--amber-500)' },
    study: { label: 'Estudio', icon: 'timer', color: 'var(--mint-500)' },
    other: { label: 'Otro', icon: 'calendar', color: 'var(--text-soft)' }
  };

  var view = {
    month: U.startOfMonth(new Date()),
    selected: U.today(),
    mode: 'month',
    filters: { exam: true, class: true, deadline: true, study: true, other: true },
    hiddenSubjects: {}
  };

  var dragEvent = null;
  var dragOverCell = null;
  var dragMoved = false;
  var suppressClick = false;

  /* ---------------- Datos ---------------- */
  function holidaysMap() {
    var regions = store.get().settings.holidayRegions || [];
    return Studia.holidays.active(regions, view.month.getFullYear());
  }

  function eventsOf(iso) {
    return store.eventsOn(iso).filter(function (e) {
      return view.filters[e.type] !== false && !view.hiddenSubjects[e.subjectId || ''];
    });
  }

  function subjectIdsWithEvents() {
    var ids = [];
    store.get().events.forEach(function (e) {
      if (e.subjectId && ids.indexOf(e.subjectId) === -1) ids.push(e.subjectId);
    });
    return ids.sort(function (a, b) {
      return store.subjectName(a).localeCompare(store.subjectName(b), 'es');
    });
  }

  function subjectFilterRow() {
    var ids = subjectIdsWithEvents();
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
      onclick: function () {
        if (all) {
          ids.forEach(function (id) { view.hiddenSubjects[id] = true; });
        } else {
          view.hiddenSubjects = {};
        }
        refresh();
      }
    }, all ? 'Ocultar todas' : 'Mostrar todas'));
    return U.h('div.row.row--wrap.gap-1', chips);
  }

  /* ---------------- Render ---------------- */
  function render(root) {
    suppressClick = false;
    dragEvent = null;
    dragOverCell = null;
    dragMoved = false;
    U.clear(root);
    var wrap = U.h('div', [
      header(),
      U.h('div.grid.grid--split', { style: { '--split': '330px' } }, [
        view.mode === 'month' ? monthGrid() : agendaList(),
        sidePanel()
      ])
    ]);
    root.appendChild(wrap);
  }

  function header() {
    var y = view.month.getFullYear(), m = view.month.getMonth();
    var months = U.MESES;

    var legend = U.h('div.row.row--wrap.gap-1', Object.keys(TYPES).map(function (key) {
      var t = TYPES[key];
      var chip = U.h('button.badge.badge--outline', {
        style: {
          cursor: 'pointer',
          opacity: view.filters[key] ? '1' : '.45',
          borderColor: view.filters[key] ? t.color : 'var(--border)',
          color: view.filters[key] ? t.color : 'var(--text-soft)'
        },
        onclick: function () {
          view.filters[key] = !view.filters[key];
          refresh();
        }
      }, [U.h('span.dot-color', { style: { background: t.color } }), t.label]);
      return chip;
    }));

    var subBar = subjectFilterRow();

    return U.h('div.card.mb-3', [
      U.h('div.row.row--between.row--wrap.gap-2.cal-head', [
        U.h('div.row.row--wrap.gap-1.cal-nav', [
          U.h('button.icon-btn', { onclick: function () { view.month = U.startOfMonth(U.addMonths(view.month, -1)); refresh(); }, 'aria-label': 'Mes anterior' }, U.icon('chev-left')),
          U.h('h2.cal-title', months[m] + ' ' + y),
          U.h('button.icon-btn', { onclick: function () { view.month = U.startOfMonth(U.addMonths(view.month, 1)); refresh(); }, 'aria-label': 'Mes siguiente' }, U.icon('chev-right')),
          U.h('button.btn.btn--ghost.btn--sm', {
            onclick: function () { view.month = U.startOfMonth(new Date()); view.selected = U.today(); refresh(); }
          }, 'Hoy')
        ]),
        U.h('div.row.row--wrap.gap-2.cal-tools', [
          U.h('div.segmented', [
            U.h('button', { class: view.mode === 'month' ? 'is-active' : '', onclick: function () { view.mode = 'month'; refresh(); } }, 'Mes'),
            U.h('button', { class: view.mode === 'agenda' ? 'is-active' : '', onclick: function () { view.mode = 'agenda'; refresh(); } }, 'Agenda')
          ]),
          U.h('button.btn.btn--ghost.btn--sm', { onclick: openRegions }, [U.icon('calendar'), 'Festivos']),
          U.h('button.btn.btn--primary.btn--sm', { onclick: function () { openEventForm(null, view.selected); } }, [U.icon('plus'), 'Evento'])
        ])
      ]),
      U.h('div.row.row--between.row--wrap.mt-2', [legend,
        U.h('span.tiny.soft', 'Arrastra un evento para cambiarlo de día · sáb y dom en rojo · festivos marcados')
      ]),
      subBar ? U.h('div.row.row--wrap.gap-1.mt-2', { style: { alignItems: 'center' } }, [
        U.h('span.tiny.soft', 'Por asignatura:'),
        subBar
      ]) : null
    ]);
  }

  function monthGrid() {
    var cells = U.monthMatrix(view.month, store.get().settings.firstDay || 1);
    var hols = holidaysMap();
    var grid = U.h('div.cal');

    U.DIAS.forEach(function (d, i) {
      grid.appendChild(U.h('div.cal__dow' + (i >= 5 ? '.cal__dow--weekend' : ''), d.slice(0, 3)));
    });

    cells.forEach(function (cell) {
      var evs = eventsOf(cell.iso);
      var hol = hols[cell.iso] || [];
      var classes = ['cal__cell'];
      if (!cell.inMonth) classes.push('cal__cell--out');
      if (U.isToday(cell.date)) classes.push('cal__cell--today');
      if (cell.iso === view.selected) classes.push('cal__cell--selected');
      if (U.dayIndex(cell.date) >= 5) classes.push('cal__cell--weekend');

      var list = U.h('div.cal__events');
      evs.slice(0, 3).forEach(function (e) {
        list.appendChild(U.h('button.cal__event.cal__event--' + e.type, {
          type: 'button',
          title: e.title,
          draggable: 'true',
          'aria-label': U.fmtDate(cell.iso, { weekday: true }) + ' · abrir «' + e.title + '»',
          onclick: function (ev) {
            ev.stopPropagation();
            if (suppressClick) { suppressClick = false; return; }
            view.selected = cell.iso; openEventForm(e);
          },
          ondragstart: function (ev) { dragEvent = e; ev.dataTransfer.effectAllowed = 'move'; },
          ondragend: function () {
            if (dragOverCell) dragOverCell.classList.remove('cal__cell--droptarget');
            if (dragMoved) { suppressClick = true; dragMoved = false; }
            dragEvent = null; dragOverCell = null;
          }
        }, [
          e.start ? U.h('span.mono', { style: { opacity: .75, fontSize: '.66rem' } }, e.start.slice(0, 5)) : null,
          U.h('span.truncate', e.title)
        ]));
      });
      if (evs.length > 3) list.appendChild(U.h('button.cal__more', {
        type: 'button',
        'aria-label': U.fmtDate(cell.iso, { weekday: true }) + ' · ver los ' + evs.length + ' eventos del día',
        onclick: function (ev) { ev.stopPropagation(); view.selected = cell.iso; refresh(); }
      }, '+' + (evs.length - 3) + ' más'));

      var node = U.h('button', {
        class: classes.join(' '),
        onclick: function () { view.selected = cell.iso; refresh(); },
        ondragover: function (ev) {
          if (!dragEvent) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          if (dragOverCell !== node) {
            if (dragOverCell) dragOverCell.classList.remove('cal__cell--droptarget');
            dragOverCell = node;
            node.classList.add('cal__cell--droptarget');
          }
        },
        ondragleave: function () { node.classList.remove('cal__cell--droptarget'); },
        ondrop: function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          node.classList.remove('cal__cell--droptarget');
          if (!dragEvent || dragEvent.date === cell.iso) { dragEvent = null; dragOverCell = null; return; }
          var moved = dragEvent;
          dragEvent = null; dragOverCell = null; dragMoved = true;
          store.updateRow('events', moved.id, { date: cell.iso });
          ui.toast('«' + moved.title + '» movido al ' + U.fmtDate(cell.iso, { weekday: true }), 'success');
          view.selected = cell.iso;
          refresh();
        }
      }, [
        U.h('div.cal__head', [U.h('span.cal__num', String(cell.date.getDate()))]),
        hol.length ? U.h('div.cal__holiday', '🎉 ' + hol[0].name) : null,
        list
      ]);
      grid.appendChild(node);
    });

    return grid;
  }

  function agendaList() {
    var today = U.today();
    var monthStart = U.toISO(U.startOfMonth(view.month));
    var monthEnd = U.toISO(U.addDays(U.addMonths(U.startOfMonth(view.month), 1), -1));
    var monthLabel = U.MESES[view.month.getMonth()] + ' ' + view.month.getFullYear();
    var from = view.month.getTime() < U.toDate(U.startOfMonth(new Date())).getTime() ? monthStart : today;
    var events = store.eventsBetween(from, monthEnd).filter(function (e) { return view.filters[e.type] !== false; });
    var hols = holidaysMap();
    var byDate = U.groupBy(events, function (e) { return e.date; });
    var dates = Object.keys(byDate).sort();

    var list = U.h('div.card');
    if (!dates.length) {
      list.appendChild(U.h('div.empty', [
        U.h('div.empty__icon', U.icon('calendar')),
        U.h('h4', 'No hay eventos en ' + monthLabel),
        U.h('p', 'Tampoco hay nada programado para los próximos días de este mes. Crea el primero y aparecerá aquí y en el calendario.'),
        U.h('button.btn.btn--primary.btn--sm', { onclick: function () { openEventForm(null, view.selected); } }, [U.icon('plus'), 'Añadir evento'])
      ]));
      return list;
    }

    dates.forEach(function (date) {
      var hol = hols[date];
      list.appendChild(U.h('div', { style: { padding: '14px 0 4px', borderTop: '1px solid var(--border)' } }, [
        U.h('div.row.gap-2', [
          U.h('strong', U.fmtDate(date, { weekday: true })),
          hol ? U.h('span.badge.badge--rose', '🎉 ' + hol.map(function (x) { return x.name; }).join(' · ')) : null
        ])
      ]));
      byDate[date].forEach(function (e) {
        list.appendChild(U.h('div.day-item.day-item--' + e.type, {
          style: { margin: '8px 0' },
          onclick: function () { openEventForm(e); }
        }, [
          U.h('div.grow', [
            U.h('div.day-item__title', e.title),
            U.h('div.day-item__meta', [
              e.start ? e.start.slice(0, 5) + (e.end ? '–' + e.end.slice(0, 5) : '') + ' · ' : '',
              e.subjectId ? store.subjectName(e.subjectId) + ' · ' : '',
              e.location || ''
            ])
          ]),
          U.h('span.badge.badge--' + (e.type === 'exam' ? 'rose' : e.type === 'class' ? 'sky' : e.type === 'deadline' ? 'amber' : e.type === 'study' ? 'mint' : ''), TYPES[e.type].label)
        ]));
      });
    });
    return list;
  }

  function sidePanel() {
    var iso = view.selected;
    var evs = eventsOf(iso);
    var hol = holidaysMap()[iso] || [];
    var classes = store.timetable().filter(function (c) { return c.day === U.dayIndex(U.toDate(iso)); });

    var panel = U.h('div.col.gap-2', [
      U.h('div.card', [
        U.h('div.card__head', [
          U.h('div', [
            U.h('h3', { style: { textTransform: 'capitalize' } }, U.fmtDate(iso, { weekday: true })),
            U.h('p.day-panel__date', U.fmtDate(iso, { numeric: true }))
          ]),
          U.h('button.icon-btn', { onclick: function () { openEventForm(null, iso); }, 'aria-label': 'Añadir evento' }, U.icon('plus'))
        ]),
        hol.length ? U.h('div.badge.badge--rose.mb-2', '🎉 ' + hol.map(function (x) { return x.name; }).join(' · ')) : null,
        classes.length ? U.h('div.mb-2', [
          U.h('p.field__label.mb-1', 'Clases del día'),
          U.h('div.col.gap-1', classes.map(function (c) {
            return U.h('div.row.gap-2.small', [
              U.h('span.mono.soft', c.start.slice(0, 5) + '–' + c.end.slice(0, 5)),
              U.h('span.dot-color', { style: { background: store.subjectColor(c.subjectId) } }),
              U.h('span.truncate', store.subjectName(c.subjectId))
            ]);
          }))
        ]) : null,
        U.h('div.day-list', evs.length ? evs.map(function (e) {
          return U.h('div.day-item.day-item--' + e.type, [
            U.h('div.grow', [
              U.h('div.day-item__title', e.title),
              U.h('div.day-item__meta', [
                e.start ? e.start.slice(0, 5) + (e.end ? '–' + e.end.slice(0, 5) : '') : 'Todo el día',
                e.location ? ' · ' + e.location : ''
              ])
            ]),
            U.h('div.row.gap-1.cal-day-actions', [
              U.h('button.icon-btn', { onclick: function () { openEventForm(e); }, 'aria-label': 'Editar' }, U.icon('edit')),
              U.h('button.icon-btn', { onclick: function () { removeEvent(e); }, 'aria-label': 'Eliminar' }, U.icon('trash'))
            ])
          ]);
        }) : [U.h('div.empty', { style: { padding: '18px 8px' } }, [
          U.h('div.empty__icon', U.icon('calendar')),
          U.h('p.small', 'Sin eventos este día.'),
          U.h('button.btn.btn--primary.btn--sm', { onclick: function () { openEventForm(null, iso); } }, [U.icon('plus'), 'Añadir evento'])
        ])])
      ]),
      U.h('div.card', [
        U.h('h3.mb-2', 'Acciones rápidas'),
        U.h('div.col.gap-1', [
          U.h('button.btn.btn--ghost.btn--block', { onclick: function () { openEventForm({ type: 'study' }, iso); } }, [U.icon('timer'), 'Bloque de estudio']),
          U.h('button.btn.btn--ghost.btn--block', { onclick: function () { openEventForm({ type: 'exam' }, iso); } }, [U.icon('target'), 'Examen']),
          U.h('button.btn.btn--ghost.btn--block', { onclick: function () { openEventForm({ type: 'deadline' }, iso); } }, [U.icon('check'), 'Entrega'])
        ])
      ])
    ]);
    return panel;
  }

  /* ---------------- Formulario de evento ---------------- */
  function openEventForm(existing, defaultDate) {
    var isNew = !existing;
    var e = existing || { title: '', type: 'study', date: defaultDate || U.today(), start: '', end: '', subjectId: '', location: '', notes: '' };
    var subjectOptions = [{ value: '', label: 'Sin asignatura' }].concat(store.get().subjects.map(function (s) {
      return { value: s.id, label: s.name };
    }));

    var beforeBody = isNew ? null : U.h('div.row.gap-1.mb-2', [
      U.h('button.btn.btn--danger.btn--sm', { onclick: function () { removeEvent(e); } }, [U.icon('trash'), 'Eliminar evento'])
    ]);

    ui.formModal({
      title: isNew ? 'Nuevo evento' : 'Editar evento',
      subtitle: 'Se añadirá al calendario y a tus recordatorios.',
      beforeBody: beforeBody,
      fields: [
        { name: 'title', label: 'Título', value: e.title, required: true, placeholder: 'Ej. Examen de Programación' },
        { name: 'type', label: 'Tipo', type: 'select', value: e.type, options: Object.keys(TYPES).map(function (k) { return { value: k, label: TYPES[k].label }; }) },
        { name: 'subjectId', label: 'Asignatura', type: 'select', value: e.subjectId, options: subjectOptions },
        { name: 'date', label: 'Fecha', type: 'date', value: e.date, required: true },
        { name: 'start', label: 'Hora de inicio', type: 'time', value: e.start || '' },
        { name: 'end', label: 'Hora de fin', type: 'time', value: e.end || '' },
        { name: 'location', label: 'Lugar', value: e.location, placeholder: 'Aula, biblioteca…' },
        { name: 'notes', label: 'Notas', type: 'textarea', value: e.notes, placeholder: 'Temario, material, avisos…' }
      ],
      submitLabel: isNew ? 'Crear evento' : 'Guardar cambios',
      onSubmit: function (v) {
        var payload = {
          title: v.title, type: v.type, subjectId: v.subjectId, date: v.date,
          start: v.start, end: v.end, location: v.location, notes: v.notes
        };
        if (isNew) {
          store.add('events', payload);
          ui.toast('Evento añadido al calendario', 'success');
        } else {
          store.updateRow('events', e.id, payload);
          ui.toast('Evento actualizado', 'success');
        }
        view.month = U.startOfMonth(U.toDate(v.date));
        view.selected = v.date;
        refresh();
      }
    });
  }

  function removeEvent(e) {
    ui.confirm({
      title: '¿Eliminar este evento?',
      message: 'Se quitará del calendario: «' + e.title + '». No se puede deshacer.',
      okLabel: 'Sí, eliminar',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      ui.closeAllModals();
      store.remove('events', e.id);
      ui.toast('Evento eliminado', 'success');
      refresh();
    });
  }

  function openRegions() {
    var settings = store.get().settings;
    var selected = (settings.holidayRegions || []).slice();
    var body = U.h('div.col.gap-2', [
      U.h('p.small.muted', 'Marca las comunidades cuyos festivos quieres ver en el calendario. Se pueden cambiar en cualquier momento desde Ajustes.'),
      U.h('div.col.gap-1', Object.keys(Studia.holidays.REGIONS).map(function (key) {
        var reg = Studia.holidays.REGIONS[key];
        var input = U.h('input', { type: 'checkbox' });
        input.checked = selected.indexOf(key) !== -1;
        input.addEventListener('change', function () {
          var i = selected.indexOf(key);
          if (input.checked && i === -1) selected.push(key);
          if (!input.checked && i !== -1) selected.splice(i, 1);
        });
        return U.h('label.switch', [
          input,
          U.h('span.switch__track'),
          U.h('span', [U.h('strong.small', reg.label), U.h('div.tiny.soft', key === 'espanya' ? 'Festivos nacionales' : 'Festivos autonómicos')])
        ]);
      }))
    ]);
    ui.modal({
      title: 'Festivos y días no lectivos',
      subtitle: 'Tus holidays se aplican a todo el calendario.',
      body: body,
      actions: [
        { label: 'Cancelar', variant: 'ghost' },
        {
          label: 'Guardar', variant: 'primary', onClick: function () {
            store.update(function (s) { s.settings.holidayRegions = selected; });
            ui.toast('Festivos actualizados', 'success');
            refresh();
          }
        }
      ]
    });
  }

  /* ---------------- Utilidades ---------------- */
  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'calendar') render(main);
  }

  function init() {
    store.subscribe(function () {
      if (Studia.router.current() === 'calendar') refresh();
    });
  }

  Studia.modules = Studia.modules || {};
  Studia.modules.calendar = { init: init, render: render, TYPES: TYPES };
  Studia.router.register('calendar', {
    title: 'Calendario',
    subtitle: 'Exámenes, entregas, clases y bloques de estudio',
    render: render
  });
})(window);

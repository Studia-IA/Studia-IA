/* =========================================================
   Studia-IA · modules/tasks.js
   Lista de tareas por asignatura, prioridad y fecha
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var view = { filter: 'open', subject: 'all', priority: 'all' };

  var PRIORITIES = {
    alta: { label: 'Alta', order: 0 },
    media: { label: 'Media', order: 1 },
    baja: { label: 'Baja', order: 2 }
  };

  function list() {
    var today = U.today();
    var items = store.get().tasks.filter(function (t) {
      if (view.filter === 'open' && t.done) return false;
      if (view.filter === 'done' && !t.done) return false;
      if (view.filter === 'overdue' && (t.done || !t.due || t.due >= today)) return false;
      if (view.subject !== 'all' && t.subjectId !== view.subject) return false;
      if (view.priority !== 'all' && (t.priority || 'media') !== view.priority) return false;
      return true;
    });
    return U.sortBy(items, function (t) {
      return (t.due || '9999-12-31') + '-' + (PRIORITIES[t.priority] ? PRIORITIES[t.priority].order : 1);
    });
  }

  function render(root) {
    U.clear(root);
    var items = list();
    var today = U.today();
    var overdue = store.overdueTasks().length;

    root.appendChild(U.h('div.col.gap-2', [
      U.h('div.card', [
      U.h('div.row.row--between.row--wrap.gap-2', [
        U.h('div.grow.col.gap-2', [
          U.h('div.segmented.task-filters', { role: 'group', 'aria-label': 'Filtrar por estado' }, [
              U.h('button', { class: view.filter === 'open' ? 'is-active' : '', onclick: function () { view.filter = 'open'; refresh(); } }, 'Pendientes'),
              U.h('button', { class: view.filter === 'all' ? 'is-active' : '', onclick: function () { view.filter = 'all'; refresh(); } }, 'Todas'),
              U.h('button', { class: view.filter === 'done' ? 'is-active' : '', onclick: function () { view.filter = 'done'; refresh(); } }, 'Completadas'),
              U.h('button', { class: view.filter === 'overdue' ? 'is-active' : '', onclick: function () { view.filter = 'overdue'; refresh(); } }, 'Vencidas')
            ]),
            U.h('select.select.select--sm', {
              'aria-label': 'Filtrar por prioridad',
              onchange: function () { view.priority = this.value; refresh(); },
              style: { width: 'auto' }
            }, ['all', 'alta', 'media', 'baja'].map(function (p) {
              var label = p === 'all' ? 'Cualquier prioridad' : 'Prioridad: ' + PRIORITIES[p].label.toLowerCase();
              var o = U.h('option', { value: p }, label);
              if (view.priority === p) o.selected = true;
              return o;
            })),
            U.h('select.select.select--sm', {
              'aria-label': 'Filtrar por asignatura',
              onchange: function () { view.subject = this.value; refresh(); },
              style: { width: 'auto' }
            }, [U.h('option', { value: 'all' }, 'Todas las asignaturas')].concat(
              store.get().subjects.map(function (s) {
                var o = U.h('option', { value: s.id }, s.name);
                if (view.subject === s.id) o.selected = true;
                return o;
              })
            ))
          ]),
          U.h('div.row.gap-1.row--wrap', [
            view.filter !== 'open' || view.priority !== 'all' || view.subject !== 'all' ? U.h('button.btn.btn--ghost.btn--sm', {
              onclick: function () { view.filter = 'open'; view.priority = 'all'; view.subject = 'all'; refresh(); }
            }, 'Limpiar filtros') : null,
            U.h('button.btn.btn--primary.btn--sm', { onclick: function () { openForm(null); } }, [U.icon('plus'), 'Nueva tarea'])
          ])
        ])
      ]),
      overdue ? U.h('div.card', { style: { borderColor: 'rgba(244,63,94,.35)', background: 'rgba(244,63,94,.05)' } }, [
        U.h('div.row.gap-2', [
          U.icon('bell'),
          U.h('div.grow', [
            U.h('strong.small', overdue + ' ' + (overdue === 1 ? 'tarea ha vencido' : 'tareas han vencido')),
            U.h('p.tiny.soft', 'Revísalas o posponlas para no acumular trabajo.')
          ]),
          U.h('button.btn.btn--danger.btn--sm', { onclick: function () { view.filter = 'overdue'; refresh(); } }, 'Verlas')
        ])
      ]) : null,
      U.h('div.card', items.length ? U.h('div.col.gap-2', items.map(taskRow)) : [
        U.h('div.empty', [
          U.h('div.empty__icon', U.icon('check')),
          U.h('h4', 'Nada por aquí'),
          U.h('p', 'Crea una tarea para no perder ningún plazo.')
        ])
      ])
    ]));
  }

  function taskRow(t) {
    var today = U.today();
    var overdue = !t.done && t.due && t.due < today;
    var isToday = !t.done && t.due === today;
    return U.h('div.task' + (t.done ? '.is-done' : ''), [
      U.h('button.task__check', {
        onclick: function () {
          store.updateRow('tasks', t.id, { done: !t.done, completedAt: !t.done ? U.today() : null });
          if (!t.done) ui.toast('Tarea completada ✓', 'success');
        },
        'aria-label': 'Alternar completada'
      }, U.icon('check')),
      U.h('div.grow', [
        U.h('div.task__title', t.title),
        U.h('div.task__meta', [
          U.h('span.tiny', { style: { color: store.subjectColor(t.subjectId), fontWeight: '650' } }, store.subjectName(t.subjectId)),
          overdue ? U.h('span.badge.badge--rose', 'Vencida') : null,
          t.due ? U.h('span.tiny' + (overdue ? '.due--over' : isToday ? '.due--today' : ''), U.fmtRelative(t.due)) : null,
          U.h('span.prio.prio--' + (t.priority || 'media'), (PRIORITIES[t.priority] || PRIORITIES.media).label),
          t.notes ? U.h('span.tiny.soft.truncate', { style: { maxWidth: '260px' } }, t.notes) : null
        ])
      ]),
      U.h('div.row.gap-1', [
        overdue ? U.h('button.icon-btn', {
          onclick: function () {
            store.updateRow('tasks', t.id, { due: U.toISO(U.addDays(new Date(), 7)) });
            ui.toast('Pospuesta 7 días', 'success');
          },
          title: 'Posponer 7 días'
        }, U.icon('calendar')) : null,
        U.h('button.icon-btn', { onclick: function () { openForm(t); }, title: 'Editar' }, U.icon('edit')),
        U.h('button.icon-btn', { onclick: function () { store.remove('tasks', t.id); ui.toast('Tarea eliminada', 'info'); }, title: 'Eliminar' }, U.icon('trash'))
      ])
    ]);
  }

  function openForm(existing) {
    var isNew = !existing;
    var t = existing || { title: '', subjectId: (store.get().subjects[0] || {}).id || '', due: U.today(), priority: 'media', notes: '', done: false };
    ui.formModal({
      title: isNew ? 'Nueva tarea' : 'Editar tarea',
      fields: [
        { name: 'title', label: 'Tarea', value: t.title, required: true, placeholder: 'Ej. Terminar ejercicios 4-7' },
        { name: 'subjectId', label: 'Asignatura', type: 'select', value: t.subjectId, options: store.get().subjects.map(function (s) { return { value: s.id, label: s.name }; }) },
        { name: 'due', label: 'Fecha de entrega', type: 'date', value: t.due },
        { name: 'priority', label: 'Prioridad', type: 'select', value: t.priority, options: Object.keys(PRIORITIES).map(function (k) { return { value: k, label: PRIORITIES[k].label }; }) },
        { name: 'notes', label: 'Notas', type: 'textarea', value: t.notes, placeholder: 'Detalles, material necesario…' }
      ],
      submitLabel: isNew ? 'Crear tarea' : 'Guardar',
      onSubmit: function (v) {
        if (isNew) store.add('tasks', v);
        else store.updateRow('tasks', t.id, v);
        ui.toast(isNew ? 'Tarea creada' : 'Tarea actualizada', 'success');
      }
    });
  }

  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'tasks') render(main);
  }

  var inited = false;

  function init() {
    if (inited) return;
    inited = true;
    store.subscribe(function () {
      if (Studia.router.current() === 'tasks') refresh();
    });
  }

  Studia.modules = Studia.modules || {};
  Studia.modules.tasks = { init: init, render: render };
  Studia.router.register('tasks', {
    title: 'Tareas',
    subtitle: 'Todo lo que tienes pendiente, ordenado por fecha',
    render: render
  });
})(window);

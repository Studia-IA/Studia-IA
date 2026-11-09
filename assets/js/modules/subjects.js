/* =========================================================
   Studia-IA · modules/subjects.js
   Asignaturas, apuntes y enlaces directos a Word / Excel
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var PALETTE = [
    { color: '#64748b', name: 'Pizarra' },
    { color: '#bd6969', name: 'Terracota' },
    { color: '#4f7cae', name: 'Azul' },
    { color: '#438780', name: 'Turquesa' },
    { color: '#80669c', name: 'Morado' },
    { color: '#b67d45', name: 'Naranja' },
    { color: '#568363', name: 'Verde' },
    { color: '#ad6686', name: 'Rosa' }
  ];

  var NOTE_TYPES = {
    link: { label: 'Enlace', icon: 'link' },
    file: { label: 'Documento', icon: 'file' },
    video: { label: 'Vídeo', icon: 'video' }
  };

  function safeColor(color) {
    return /^#[\da-f]{6}$/i.test(String(color || '')) ? color : PALETTE[0].color;
  }

  function colorWash(color, alpha) {
    var value = safeColor(color).slice(1);
    return 'rgba(' + parseInt(value.slice(0, 2), 16) + ',' + parseInt(value.slice(2, 4), 16) + ',' + parseInt(value.slice(4, 6), 16) + ',' + alpha + ')';
  }

  function minutesLast30(subjectId) {
    var from = U.toISO(U.addDays(new Date(), -29));
    return U.sum(store.get().sessions.filter(function (s) { return s.subjectId === subjectId && s.date >= from; }), function (s) { return s.minutes; });
  }

  function notesOf(subjectId) {
    return store.get().notes.filter(function (n) { return n.subjectId === subjectId; });
  }

  function nextExamOf(subjectId) {
    var t = U.today();
    return U.sortBy(store.get().events.filter(function (e) { return e.subjectId === subjectId && e.type === 'exam' && e.date >= t; }), function (e) { return e.date; })[0] || null;
  }

  /* ---------------- Render ---------------- */
  function render(root) {
    U.clear(root);
    var subjects = store.get().subjects;

    root.appendChild(U.h('div.col.gap-2', [
      U.h('div.card', [
        U.h('div.row.row--between.row--wrap.gap-2', [
          U.h('div', [
            U.h('h3', 'Tus asignaturas'),
            U.h('p.tiny.soft', 'Cada asignatura reúne apuntes, tareas, exámenes y tu tiempo de estudio.')
          ]),
          U.h('button.btn.btn--primary.btn--sm', { onclick: function () { openSubjectForm(null); } }, [U.icon('plus'), 'Nueva asignatura'])
        ])
      ]),
      subjects.length ? U.h('div.grid.grid-3', subjects.map(subjectCard)) : U.h('div.card', [
        U.h('div.empty', [
          U.h('div.empty__icon', U.icon('book')),
          U.h('h4', 'Todavía no tienes asignaturas'),
          U.h('p', 'Crea la primera para empezar a organizar tus apuntes y exámenes.')
        ])
      ])
    ]));
  }

  function subjectCard(s) {
    var mins = minutesLast30(s.id);
    var notes = notesOf(s.id);
    var exam = nextExamOf(s.id);
    var open = store.openTasks().filter(function (t) { return t.subjectId === s.id; });

    var color = safeColor(s.color);
    return U.h('div.subject-card', { style: {
      '--sub-color': color,
      background: colorWash(color, '.08'),
      borderColor: colorWash(color, '.32')
    } }, [
      U.h('div.subject-card__head', [
        U.h('div', [
          U.h('div.subject-card__code', s.code || ''),
          U.h('div.subject-card__name', s.name)
        ]),
        U.h('span.dot-color', { style: { background: color, width: '14px', height: '14px', boxShadow: '0 0 0 4px ' + colorWash(color, '.18') }, 'aria-label': 'Color de ' + s.name })
      ]),
      U.h('div.subject-card__meta', [
        s.teacher ? s.teacher + ' · ' : '',
        (s.credits || 0) + ' ECTS'
      ].join('')),
      U.h('div.row.gap-2.row--wrap', [
        U.h('span.badge', U.fmtMinutes(mins) + ' en 30 días'),
        U.h('span.badge', notes.length + ' apuntes'),
        open.length ? U.h('span.badge.badge--brand', open.length + ' tareas') : null
      ]),
      exam ? U.h('div.row.gap-2.small', [
        U.h('span.badge.badge--rose', 'Examen ' + U.fmtRelative(exam.date))
      ]) : null,
      U.h('div.row.gap-1', { style: { marginTop: 'auto' } }, [
        U.h('button.btn.btn--soft.btn--sm.grow', { onclick: function () { openDetail(s); } }, [U.icon('book'), 'Apuntes']),
        U.h('button.icon-btn', { onclick: function () { openSubjectForm(s); }, title: 'Editar asignatura y color', 'aria-label': 'Editar asignatura y color de ' + s.name }, U.icon('edit')),
        U.h('button.icon-btn', { onclick: function () { confirmRemove(s); }, title: 'Eliminar' }, U.icon('trash'))
      ])
    ]);
  }

  function openDetail(s) {
    var body = U.h('div.col.gap-2');
    var modalRef;

    function draw() {
      U.clear(body);
      var notes = notesOf(s.id);
      body.appendChild(U.h('div.row.row--between.gap-2', [
        U.h('div.row.gap-2', [
          U.h('span.dot-color', { style: { background: s.color, width: '12px', height: '12px' } }),
          U.h('strong', s.name),
          U.h('span.badge', s.code || '')
        ]),
        U.h('button.btn.btn--primary.btn--sm', { onclick: function () { openNoteForm(s, null, function () { draw(); }); } }, [U.icon('plus'), 'Añadir apunte'])
      ]));

      body.appendChild(U.h('div.row.gap-1.row--wrap', [
        U.h('button.btn.btn--ghost.btn--sm', { onclick: function () { openNoteForm(s, { type: 'link', title: 'Apuntes (Word)', url: 'https://docs.google.com/document/d/' }, draw); } }, [U.icon('link'), 'Enlace a Word']),
        U.h('button.btn.btn--ghost.btn--sm', { onclick: function () { openNoteForm(s, { type: 'link', title: 'Hoja de cálculo (Excel)', url: 'https://docs.google.com/spreadsheets/d/' }, draw); } }, [U.icon('link'), 'Enlace a Excel']),
        U.h('button.btn.btn--ghost.btn--sm', { onclick: function () { openNoteForm(s, { type: 'file' }, draw); } }, [U.icon('file'), 'Registrar archivo']),
        U.h('button.btn.btn--ghost.btn--sm', { onclick: function () { openNoteForm(s, { type: 'video' }, draw); } }, [U.icon('video'), 'Añadir vídeo'])
      ]));

      if (!notes.length) {
        body.appendChild(U.h('div.empty', [
          U.h('div.empty__icon', U.icon('file')),
          U.h('h4', 'Sin apuntes todavía'),
          U.h('p', 'Registra una referencia de archivo, añade un enlace a Word/Excel o pega un vídeo de clase.')
        ]));
        return;
      }

      body.appendChild(U.h('div.col.gap-1', notes.map(function (n) {
        return U.h('div.note-item.note-item--' + n.type, [
          U.h('div.note-item__icon', U.icon(NOTE_TYPES[n.type] ? NOTE_TYPES[n.type].icon : 'file')),
          U.h('div.grow', [
            U.h('div.small.strong.truncate', n.title),
            U.h('div.tiny.soft', n.size || (n.type === 'link' ? 'Enlace externo' : n.type === 'file' ? 'Referencia de archivo · demo' : 'Vídeo'))
          ]),
          n.url ? U.h('a.icon-btn', { href: n.url, target: '_blank', rel: 'noopener', title: 'Abrir' }, U.icon('link')) : null,
          U.h('button.icon-btn', { onclick: function () { store.remove('notes', n.id); draw(); }, title: 'Eliminar' }, U.icon('trash'))
        ]);
      })));
    }

    draw();
    modalRef = ui.modal({ title: 'Apuntes de ' + s.name, subtitle: s.teacher || '', body: body, wide: true });
  }

  /* ---------------- Formularios ---------------- */
  function openSubjectForm(existing) {
    var isNew = !existing;
    var s = existing || { name: '', code: '', teacher: '', credits: 6, color: PALETTE[store.get().subjects.length % PALETTE.length].color, room: '' };
    var currentColor = safeColor(s.color);
    var preview = U.h('span', { style: {
      display: 'inline-flex', alignItems: 'center', minHeight: '32px', padding: '5px 12px',
      borderRadius: '999px', color: '#fff', background: currentColor, fontSize: '.78rem', fontWeight: '700'
    } }, 'Vista previa · ' + s.name);
    var swatches = U.h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '9px', margin: '10px 0' } }, PALETTE.map(function (item) {
      var button = U.h('button', {
        type: 'button',
        'aria-label': 'Elegir color ' + item.name,
        'aria-pressed': currentColor.toLowerCase() === item.color.toLowerCase(),
        title: item.name,
        style: {
          width: '30px', height: '30px', padding: '0', borderRadius: '50%', background: item.color,
          border: currentColor.toLowerCase() === item.color.toLowerCase() ? '3px solid var(--text)' : '2px solid var(--surface)',
          boxShadow: '0 0 0 1px var(--border)', cursor: 'pointer'
        },
        onclick: function () { setColor(item.color); }
      });
      return button;
    }));
    var colorInput = U.h('input.input.input--sm', {
      type: 'color', value: currentColor, 'aria-label': 'Elegir un color personalizado',
      style: { width: '52px', height: '38px', padding: '4px', cursor: 'pointer' },
      oninput: function () { setColor(this.value, true); }
    });
    function setColor(color, custom) {
      currentColor = color;
      preview.style.background = color;
      colorInput.value = color;
      Array.prototype.forEach.call(swatches.children, function (button, index) {
        var selected = !custom && PALETTE[index].color.toLowerCase() === color.toLowerCase();
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        button.style.border = selected ? '3px solid var(--text)' : '2px solid var(--surface)';
      });
    }
    var colorPicker = U.h('div', { class: 'col gap-1', style: { marginBottom: '12px' } }, [
      U.h('strong.small', 'Color de la asignatura'),
      U.h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' } }, [preview, colorInput]),
      swatches,
      U.h('span.tiny.soft', 'El color se guarda solo en esta asignatura.')
    ]);
    ui.formModal({
      title: isNew ? 'Nueva asignatura' : 'Editar asignatura',
      beforeBody: colorPicker,
      fields: [
        { name: 'name', label: 'Nombre', value: s.name, required: true, placeholder: 'Ej. Programación I' },
        { name: 'code', label: 'Código', value: s.code, placeholder: 'PR1' },
        { name: 'teacher', label: 'Profesor/a', value: s.teacher },
        { name: 'credits', label: 'ECTS', type: 'number', value: s.credits, min: 0, step: 0.5 },
        { name: 'room', label: 'Aula habitual', value: s.room }
      ],
      submitLabel: isNew ? 'Crear asignatura' : 'Guardar',
      onSubmit: function (v) {
        var payload = {
          name: v.name, code: v.code, teacher: v.teacher,
          credits: +v.credits || 0, room: v.room, color: currentColor
        };
        if (isNew) {
          var created = store.add('subjects', payload);
          ui.toast('Asignatura creada', 'success');
        } else {
          store.updateRow('subjects', s.id, payload);
          ui.toast('Asignatura actualizada', 'success');
        }
      }
    });
  }

  function openNoteForm(subject, preset, done) {
    var note = Object.assign({ subjectId: subject.id, title: '', type: 'link', url: '', size: '' }, preset || {});
    var isNew = !note.id;
    var isFile = note.type === 'file';
    ui.formModal({
      title: isNew ? (isFile ? 'Registrar archivo' : 'Añadir apunte') : 'Editar apunte',
      subtitle: isFile ? subject.name + ' · Demo: no se sube ningún archivo, solo se guarda su referencia.' : subject.name,
      fields: [
        { name: 'title', label: 'Título', value: note.title, required: true, placeholder: 'Ej. Apuntes tema 3' },
        { name: 'type', label: 'Tipo', type: 'select', value: note.type, options: Object.keys(NOTE_TYPES).map(function (k) { return { value: k, label: NOTE_TYPES[k].label }; }) },
        { name: 'url', label: isFile ? 'Ruta o enlace (opcional)' : 'Enlace', value: note.url, placeholder: 'https://… o ubicación del archivo' },
        { name: 'size', label: 'Tamaño / duración', value: note.size, placeholder: 'Ej. 1,2 MB · 18 min' }
      ],
      submitLabel: isNew ? 'Guardar apunte' : 'Actualizar',
      onSubmit: function (v) {
        if (isNew) store.add('notes', { subjectId: subject.id, title: v.title, type: v.type, url: v.url, size: v.size });
        else store.updateRow('notes', note.id, v);
        if (done) done();
      }
    });
  }

  function confirmRemove(s) {
    ui.confirm({
      title: '¿Eliminar «' + s.name + '»?',
      message: 'Se borrarán también sus tareas y apuntes asociados.',
      okLabel: 'Eliminar',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      store.update(function (st) {
        st.tasks = st.tasks.filter(function (t) { return t.subjectId !== s.id; });
        st.notes = st.notes.filter(function (n) { return n.subjectId !== s.id; });
        st.events = st.events.filter(function (e) { return e.subjectId !== s.id; });
        st.subjects = st.subjects.filter(function (x) { return x.id !== s.id; });
      });
      ui.toast('Asignatura eliminada', 'info');
    });
  }

  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'subjects') render(main);
  }

  function init() {
    store.subscribe(function () {
      if (Studia.router.current() === 'subjects') refresh();
    });
  }

  Studia.modules = Studia.modules || {};
  Studia.modules.subjects = { init: init, render: render };
  Studia.router.register('subjects', {
    title: 'Asignaturas',
    subtitle: 'Apuntes, documentos y vídeos de cada asignatura',
    render: render
  });
})(window);

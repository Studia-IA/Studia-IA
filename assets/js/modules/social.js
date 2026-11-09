/* =========================================================
   Studia-IA · modules/social.js
   Comunidad educativa: publicaciones, recursos y comentarios
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var COLORS = ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#f43f5e', '#8b5cf6'];
  var POST_TYPES = {
    general: 'General',
    question: 'Duda',
    note: 'Apunte',
    resource: 'Recurso',
    announcement: 'Aviso'
  };
  var expandedPosts = {};
  var openReplies = {};
  var lastLikeAt = {};
  var notePicker = null;
  var postTypePicker = null;

  function initialsOf(name) {
    return String(name || 'Estudiante').split(/\s+/).map(function (p) { return p[0] || ''; }).join('').slice(0, 2).toUpperCase();
  }

  function colorOf(name) {
    var sum = 0, value = String(name || 'Estudiante');
    for (var i = 0; i < value.length; i++) sum += value.charCodeAt(i);
    return COLORS[sum % COLORS.length];
  }

  function timeAgo(iso) {
    var d = new Date(iso || Date.now());
    var mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    if (mins < 1) return 'ahora';
    if (mins < 60) return 'hace ' + mins + ' min';
    var hours = Math.round(mins / 60);
    if (hours < 24) return 'hace ' + hours + ' h';
    var days = Math.round(hours / 24);
    if (days < 7) return 'hace ' + days + ' días';
    return U.fmtDate(d, { short: true, day: true });
  }

  function safeResourceUrl(value) {
    var url = String(value || '').trim();
    if (!url) return '';
    try {
      var parsed = new URL(url, global.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (e) { return ''; }
  }

  function commentsOf(post) {
    if (Array.isArray(post.comments)) return post.comments;
    return (post.replies || []).map(function (reply, index) {
      return {
        id: 'legacy-' + post.id + '-' + index,
        author: reply.author || 'Estudiante',
        text: reply.text || '',
        createdAt: reply.createdAt || post.createdAt,
        replies: []
      };
    });
  }

  function replyCount(comments) {
    return comments.reduce(function (total, comment) {
      return total + 1 + (Array.isArray(comment.replies) ? comment.replies.length : 0);
    }, 0);
  }

  function render(root) {
    U.clear(root);
    notePicker = null;
    postTypePicker = null;
    var state = store.get();
    var posts = U.sortBy(state.forum || [], function (p) { return p.createdAt || ''; }, 'desc');
    var profile = state.profile || { name: 'Estudiante', initials: 'ES' };
    var subjects = state.subjects || [];
    var ownPosts = posts.filter(function (p) { return p.author === profile.name; }).length;

    root.appendChild(U.h('div.grid.grid--split', { style: { '--split': '300px', gap: '20px' } }, [
      U.h('div.col.gap-2', [
        composer(profile, subjects),
        posts.length ? U.h('div.col.gap-2', posts.map(postCard)) : U.h('div.card', [
          U.h('div.empty', [
            U.h('div.empty__icon', U.icon('users')),
            U.h('h4', 'El feed empieza contigo'),
            U.h('p', 'Comparte una duda, un recurso o un avance para iniciar la conversación con tu clase.')
          ])
        ])
      ]),
      U.h('aside.col.gap-2', [
        U.h('div.card', [
          U.h('div.row.gap-2', [
            U.h('div.post__avatar', { style: { background: colorOf(profile.name), width: '44px', height: '44px' } }, profile.initials || initialsOf(profile.name)),
            U.h('div.grow', [
              U.h('strong.small', profile.name),
              U.h('p.tiny.soft', profile.university || 'Comunidad Studia-IA')
            ])
          ]),
          U.h('div.row.gap-2.row--wrap', { style: { marginTop: '16px' } }, [
            U.h('span.badge.badge--brand', posts.length + (posts.length === 1 ? ' publicación' : ' publicaciones')),
            U.h('span.badge', ownPosts + ' tuyas')
          ])
        ]),
        U.h('div.card', [
          U.h('div.card__head', [U.h('h3', 'Tus asignaturas')]),
          subjects.length ? U.h('div.col.gap-1', subjects.slice(0, 6).map(function (subject) {
            var color = subject.color || 'var(--brand-500)';
            return U.h('div.row.gap-2', [
              U.h('span', { style: { width: '9px', height: '9px', borderRadius: '50%', background: color, flex: 'none' } }),
              U.h('span.small.grow', subject.name),
              U.h('span.tiny.soft', posts.filter(function (p) { return p.subjectId === subject.id; }).length)
            ]);
          })) : U.h('p.small.soft', 'Añade asignaturas para etiquetar tus publicaciones.')
        ]),
        U.h('div.card', [
          U.h('div.card__head', [U.h('h3', 'Un espacio para aprender')]),
          U.h('p.small.muted', 'Pregunta con contexto, comparte fuentes útiles y cuida los datos personales al publicar recursos.'),
          U.h('button.btn.btn--soft.btn--sm.btn--block.mt-2', { onclick: chooseNote }, [U.icon('file'), 'Compartir un apunte'])
        ])
      ])
    ]));
  }

  function composer(profile, subjects) {
    var text = U.h('textarea.textarea', { placeholder: '¿Qué estás estudiando? Comparte una duda, un logro o un recurso…', rows: '3', 'aria-label': 'Texto de la publicación' });
    var type = U.h('select.select.select--sm', { 'aria-label': 'Tipo de publicación' }, Object.keys(POST_TYPES).map(function (key) {
      return U.h('option', { value: key }, POST_TYPES[key]);
    }));
    postTypePicker = type;
    var subject = U.h('select.select.select--sm', { 'aria-label': 'Asignatura de la publicación' }, [
      U.h('option', { value: '' }, 'Sin asignatura')
    ].concat(subjects.map(function (s) { return U.h('option', { value: s.id }, s.name); })));
    var title = U.h('input.input.input--sm', { placeholder: 'Título del recurso (opcional)', 'aria-label': 'Título del recurso' });
    var url = U.h('input.input.input--sm', { type: 'url', placeholder: 'https://… (opcional)', 'aria-label': 'Enlace externo' });
    notePicker = U.h('select.select.select--sm', { 'aria-label': 'Adjuntar un apunte guardado' }, [
      U.h('option', { value: '' }, 'Sin apunte adjunto')
    ].concat((store.get().notes || []).map(function (note) {
      return U.h('option', { value: note.id }, note.title + ' · ' + store.subjectName(note.subjectId));
    })));
    notePicker.addEventListener('change', function () {
      var note = store.find('notes', notePicker.value);
      if (!note) return;
      if (!title.value.trim()) title.value = note.title;
      if (!url.value.trim() && note.url) url.value = note.url;
      if (!subject.value && note.subjectId) subject.value = note.subjectId;
      if (type.value === 'general') type.value = 'note';
    });

    return U.h('div.card', { style: { borderTop: '3px solid var(--brand-500)' } }, [
      U.h('div.row.gap-2.mb-2', [
        U.h('div.post__avatar', { style: { background: colorOf(profile.name), width: '38px', height: '38px' } }, profile.initials || initialsOf(profile.name)),
        U.h('div.grow', [U.h('strong.small', '¿Qué quieres compartir?'), U.h('p.tiny.soft', 'Publica para tu comunidad de estudio')])
      ]),
      text,
      U.h('div.col.gap-1', { style: { marginTop: '10px' } }, [
        U.h('div.row.gap-1.row--wrap', [type, subject]),
        U.h('div.row.gap-1.row--wrap', [title, url]),
        notePicker
      ]),
      U.h('div.row.row--between.row--wrap.gap-2', { style: { marginTop: '12px' } }, [
        U.h('span.tiny.soft', 'Los archivos no se suben: puedes adjuntar un apunte guardado o un enlace.'),
        U.h('button.btn.btn--primary.btn--sm', {
          onclick: function () {
            var content = text.value.trim();
            if (!content) { ui.toast('Escribe algo antes de publicar', 'warn'); text.focus(); return; }
            var selectedNote = store.find('notes', notePicker.value);
            var resourceTitle = title.value.trim() || (selectedNote ? selectedNote.title : '');
            var resourceUrl = url.value.trim() || (selectedNote ? selectedNote.url || '' : '');
            var resource = resourceTitle || resourceUrl || selectedNote ? {
              title: resourceTitle || 'Recurso compartido',
              url: resourceUrl,
              type: selectedNote ? selectedNote.type : 'link',
              noteId: selectedNote ? selectedNote.id : null,
              subjectId: selectedNote ? selectedNote.subjectId : subject.value || null,
              size: selectedNote ? selectedNote.size || '' : ''
            } : null;
            var p = store.get().profile;
            store.add('forum', {
              author: p.name, initials: p.initials || initialsOf(p.name), color: colorOf(p.name),
              subjectId: subject.value || (selectedNote && selectedNote.subjectId) || '',
              text: content, type: type.value, resource: resource, likes: 0, likesBy: [],
              createdAt: new Date().toISOString(), comments: [], shares: 0
            });
            ui.toast('Publicado en el feed', 'success');
          }
        }, [U.icon('send'), 'Publicar'])
      ])
    ]);
  }

  function chooseNote() {
    if (!notePicker || !notePicker.options.length || notePicker.options.length < 2) {
      ui.toast('Primero guarda un apunte en Asignaturas', 'info');
      return;
    }
    notePicker.value = notePicker.options[1].value;
    notePicker.dispatchEvent(new Event('change', { bubbles: true }));
    if (postTypePicker) postTypePicker.value = 'note';
    notePicker.focus();
    ui.toast('Apunte seleccionado: completa el texto y publica', 'info');
  }

  function postCard(p) {
    var profile = store.get().profile;
    var liked = Array.isArray(p.likesBy) && p.likesBy.indexOf(profile.name) !== -1;
    var comments = commentsOf(p);
    var count = replyCount(comments);
    var commentPanel = U.h('div', { hidden: !expandedPosts[p.id], style: { marginTop: '12px' } }, [
      U.h('div.col.gap-2', comments.length ? comments.map(function (comment) { return commentCard(p, comment); }) : [
        U.h('p.tiny.soft', 'Todavía no hay comentarios. Abre la conversación con una respuesta útil.')
      ]),
      commentComposer(p)
    ]);

    return U.h('article.card.post-card', [
      p.sharedFrom ? U.h('div.tiny.soft', { style: { marginBottom: '8px' } }, '↗ ' + (p.sharedFromAuthor || 'Publicación compartida')) : null,
      U.h('div.post', [
        U.h('div.post__avatar', { style: { background: p.color || colorOf(p.author) } }, p.initials || initialsOf(p.author)),
        U.h('div.post__body', [
          U.h('div.post__head', [
            U.h('span.post__author', p.author || 'Estudiante'),
            U.h('span.post__time', timeAgo(p.createdAt)),
            U.h('span.badge.badge--brand', POST_TYPES[p.type] || POST_TYPES.general),
            p.subjectId ? U.h('span.badge', store.subjectName(p.subjectId)) : null
          ]),
          U.h('div.post__text', p.text || ''),
          p.sharedText ? U.h('div', { style: { marginTop: '9px', padding: '12px', borderLeft: '3px solid var(--brand-300)', background: 'var(--surface-2)', borderRadius: '8px', whiteSpace: 'pre-wrap' } }, p.sharedText) : null,
          p.resource ? resourceCard(p.resource) : null,
          U.h('div.post__actions', [
            U.h('button.post__action' + (liked ? '.is-liked' : ''), {
              type: 'button', 'aria-pressed': liked, 'aria-label': (liked ? 'Quitar Me gusta' : 'Dar Me gusta') + ' · ' + (p.likes || 0),
              onclick: function () { toggleLike(p.id, this); }
            }, [U.icon('star'), (p.likes || 0) + ' Me gusta']),
            U.h('button.post__action', {
              type: 'button', 'aria-expanded': !!expandedPosts[p.id],
              onclick: function () {
                expandedPosts[p.id] = !expandedPosts[p.id];
                commentPanel.hidden = !expandedPosts[p.id];
                this.setAttribute('aria-expanded', expandedPosts[p.id] ? 'true' : 'false');
              }
            }, [U.icon('send'), 'Comentar · ' + count]),
            U.h('button.post__action', { type: 'button', onclick: function () { sharePost(p.id); } }, [U.icon('layers'), 'Compartir · ' + (p.shares || 0)])
          ]),
          commentPanel
        ])
      ])
    ]);
  }

  function resourceCard(resource) {
    var href = safeResourceUrl(resource.url);
    return U.h('div', { style: {
      display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', padding: '11px 12px',
      border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface-2)', minWidth: '0'
    } }, [
      U.h('div', { style: { width: '34px', height: '34px', flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '10px', color: 'var(--brand-600)', background: 'var(--brand-50)' } }, U.icon(resource.type === 'video' ? 'video' : 'file')),
      U.h('div.grow', [
        U.h('strong.small', resource.title || 'Recurso compartido'),
        U.h('div.tiny.soft', [resource.type === 'file' ? 'Referencia de archivo · sin subida' : resource.size || 'Recurso educativo', resource.subjectId ? ' · ' + store.subjectName(resource.subjectId) : ''].join(''))
      ]),
      href ? U.h('a.btn.btn--ghost.btn--sm', { href: href, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir') : U.h('span.tiny.soft', 'Sin enlace válido')
    ]);
  }

  function toggleLike(postId, button) {
    var current = store.find('forum', postId);
    if (!current || button.disabled) return;
    var now = Date.now();
    if (lastLikeAt[postId] && now - lastLikeAt[postId] < 350) return;
    lastLikeAt[postId] = now;
    var actor = store.get().profile.name;
    var by = Array.isArray(current.likesBy) ? current.likesBy.slice() : [];
    by = by.filter(function (name, index) { return by.indexOf(name) === index; });
    var index = by.indexOf(actor);
    var total = Number(current.likes);
    if (!isFinite(total) || total < 0) total = by.length;
    if (index === -1) { by.push(actor); total++; }
    else { by.splice(index, 1); total = Math.max(0, total - 1); }
    button.disabled = true;
    store.updateRow('forum', postId, { likesBy: by, likes: total });
  }

  function commentComposer(post) {
    var text = U.h('textarea.textarea', { rows: '2', placeholder: 'Escribe un comentario…', 'aria-label': 'Nuevo comentario' });
    var send = U.h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: function () {
      var value = text.value.trim();
      if (!value || send.disabled) return;
      var current = store.find('forum', post.id);
      if (!current) return;
      send.disabled = true;
      text.disabled = true;
      var comments = commentsOf(current).slice();
      comments.push({ id: U.uid('comment'), author: store.get().profile.name, text: value, createdAt: new Date().toISOString(), replies: [] });
      expandedPosts[post.id] = true;
      store.updateRow('forum', post.id, { comments: comments });
    } }, [U.icon('send'), 'Comentar']);
    text.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send.click(); }
    });
    return U.h('div.col.gap-1', { style: { marginTop: '12px' } }, [text, U.h('div.row', { style: { justifyContent: 'flex-end' } }, send)]);
  }

  function commentCard(post, comment) {
    var replies = Array.isArray(comment.replies) ? comment.replies : [];
    var replyKey = post.id + ':' + comment.id;
    var replyText = U.h('textarea.textarea', { rows: '2', placeholder: 'Responde a ' + (comment.author || 'este comentario') + '…', 'aria-label': 'Responder a ' + (comment.author || 'comentario') });
    var replyButton = U.h('button.btn.btn--soft.btn--sm', { type: 'button', onclick: function () {
      var value = replyText.value.trim();
      if (!value || replyButton.disabled) return;
      var current = store.find('forum', post.id);
      if (!current) return;
      var comments = commentsOf(current).map(function (item) {
        if (item.id !== comment.id) return item;
        var nextReplies = (item.replies || []).slice();
        nextReplies.push({ id: U.uid('reply'), author: store.get().profile.name, replyTo: item.author, text: value, createdAt: new Date().toISOString() });
        return Object.assign({}, item, { replies: nextReplies });
      });
      replyButton.disabled = true;
      replyText.disabled = true;
      expandedPosts[post.id] = true;
      openReplies[replyKey] = false;
      store.updateRow('forum', post.id, { comments: comments });
    } }, 'Enviar respuesta');
    replyText.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); replyButton.click(); }
    });
    var replyForm = U.h('div', { hidden: !openReplies[replyKey], style: { marginTop: '9px' } }, [
      U.h('div.col.gap-1', [replyText, U.h('div.row', { style: { justifyContent: 'flex-end' } }, replyButton)])
    ]);
    var replyNodes = replies.map(function (reply) {
      return U.h('div.comment-reply', { style: { display: 'flex', gap: '7px', padding: '8px 0 0 12px', marginLeft: '5px', borderLeft: '2px solid var(--brand-200)' } }, [
        U.h('span.tiny.soft', '↳'),
        U.h('div.small', [
          U.h('strong', reply.author || 'Estudiante'),
          U.h('span.tiny.soft', ' respondió a ' + (reply.replyTo || comment.author || 'comentario') + ' · ' + timeAgo(reply.createdAt)),
          U.h('div', reply.text || '')
        ])
      ]);
    });
    return U.h('div.comment-card', { style: { padding: '10px 12px', background: 'var(--surface-2)', borderRadius: '10px' } }, [
      U.h('div.row.gap-2', [
        U.h('div.post__avatar', { style: { width: '28px', height: '28px', fontSize: '.68rem', borderRadius: '9px', background: colorOf(comment.author) } }, initialsOf(comment.author)),
        U.h('div.grow', [
          U.h('div.small', [U.h('strong', comment.author || 'Estudiante'), U.h('span.tiny.soft', ' · ' + timeAgo(comment.createdAt))]),
          U.h('div.small', comment.text || '')
        ])
      ]),
      replies.length ? U.h('div.col', { style: { gap: '2px' } }, replyNodes) : null,
      U.h('button.post__action', {
        type: 'button', 'aria-expanded': !!openReplies[replyKey],
        onclick: function () {
          openReplies[replyKey] = !openReplies[replyKey];
          replyForm.hidden = !openReplies[replyKey];
          this.setAttribute('aria-expanded', openReplies[replyKey] ? 'true' : 'false');
          if (openReplies[replyKey]) replyText.focus();
        }
      }, [U.icon('send'), 'Responder']),
      replyForm
    ]);
  }

  function sharePost(postId) {
    var original = store.find('forum', postId);
    if (!original) return;
    var profile = store.get().profile;
    store.add('forum', {
      author: profile.name, initials: profile.initials || initialsOf(profile.name), color: colorOf(profile.name),
      subjectId: original.subjectId || '', type: 'general',
      text: 'Ha compartido una publicación de ' + (original.author || 'Estudiante'),
      sharedFrom: original.id, sharedFromAuthor: original.author || 'Estudiante',
      sharedText: original.text || '', resource: original.resource || null,
      likes: 0, likesBy: [], comments: [], shares: 0, createdAt: new Date().toISOString()
    });
    var latest = store.find('forum', postId);
    if (latest) store.updateRow('forum', postId, { shares: (Number(latest.shares) || 0) + 1 });
    ui.toast('Publicación compartida en el feed', 'success');
  }

  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'social') render(main);
  }

  var inited = false;
  function init() {
    if (inited) return;
    inited = true;
    store.subscribe(function () {
      if (Studia.router.current() === 'social') refresh();
    });
  }

  Studia.modules = Studia.modules || {};
  Studia.modules.social = { init: init, render: render };
  Studia.router.register('social', {
    title: 'Social',
    subtitle: 'Comparte, pregunta y aprende en comunidad',
    render: render
  });
})(window);

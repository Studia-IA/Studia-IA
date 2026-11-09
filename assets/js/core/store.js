/* =========================================================
   Studia-IA · core/store.js
   Estado central de la aplicación + selectores derivados
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils;

  /* Versión del formato de datos. Súbela SIEMPRE que cambies la forma
     del estado y añade el paso correspondiente en `migrate()`. */
  var SCHEMA_VERSION = 2;

  var state = null;
  var listeners = [];
  var saveTimer = null;
  var status = 'idle';                 // idle | loading | ready | error
  var readyPromise = null;
  var lastSaveError = null;

  /* ---------------- Base de estado ---------------- */
  function defaults() {
    return {
      version: SCHEMA_VERSION,
      profile: {
        name: 'Estudiante',
        initials: 'ES',
        university: 'Mi universidad',
        course: '1º curso',
        plan: 'premium',
        avatar: '🎓',
        joinedAt: U.today(),
        /* true cuando el usuario ya pasó (u omitió) el asistente de
           bienvenida. Si no, se muestra al entrar. */
        onboarded: false,
        municipio: ''
      },
      settings: {
        theme: 'light',
        firstDay: 1,
        dailyGoal: 120,
        notifications: false,
        holidayRegions: ['catalunya', 'espanya'],
        showAds: false,
        pomodoro: { work: 25, short: 5, long: 15, cycle: 4 }
      },
      subjects: [],
      tasks: [],
      events: [],
      timetable: [],
      sessions: [],
      notes: [],
      forum: [],
      rewards: { claimed: [] },
      ai: {
        name: 'Luna',
        avatar: '🤖',
        tone: 'motivador',
        lang: 'es',
        messages: [],
        knowledge: null
      },
      streak: { history: {}, best: 0 },
      xp: 0,
      /* Estado guardado del pomodoro (ver modules/study.js). */
      timer: null
    };
  }

  function merge(base, extra) {
    var out = Object.assign({}, base);
    Object.keys(extra || {}).forEach(function (k) {
      if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = merge(base[k], extra[k]);
      } else {
        out[k] = extra[k];
      }
    });
    return out;
  }

  /* ---------------- Migraciones ----------------
     Cada cambio de forma del estado sube SCHEMA_VERSION y añade un bloque
     aquí. Así los datos guardados por una versión anterior se actualizan
     solos en vez de romper la app. */
  function migrate(saved) {
    if (!saved || typeof saved !== 'object') return saved;
    var data = saved;
    var from = data.version || 1;

    if (from < 2) {
      /* v2: el pomodoro se guarda para sobrevivir a recargas. */
      if (data.timer === undefined) data.timer = null;
    }
    /* if (from < 3) { ... } */

    data.version = SCHEMA_VERSION;
    if (from > SCHEMA_VERSION) {
      console.warn('[Studia] Los datos son de una versión más nueva (' + from + '). Se intentará cargar igualmente.');
    }
    return data;
  }

  function hydrate(saved) {
    var data = migrate(saved);
    /* Con cuenta de Supabase (Supabase manda): usuario nuevo arranca
       vacío, sin datos de ejemplo. Sin sesión (prototipo local/tests):
       seed de demostración, como siempre. */
    var cloud = !!(Studia.auth && Studia.auth.user && Studia.auth.user());
    if (!data || !data.profile) {
      state = cloud ? defaults() : merge(defaults(), Studia.seed.build());
    } else {
      state = merge(defaults(), data);
    }
    state.version = SCHEMA_VERSION;
    return state;
  }

  function persistNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    var p;
    try { p = Studia.db.save(state); } catch (e) { p = Promise.reject(e); }
    if (p && typeof p.catch === 'function') {
      p.catch(function (e) {
        lastSaveError = e;
        if (Studia.captureError) Studia.captureError('guardado', e && e.message, e && e.stack);
      });
    }
    return p;
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 120);
  }

  function notify(opts) {
    if (!opts || opts.persist !== false) persist();
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) { console.error('[Studia] Error en suscriptor:', e); }
    });
  }

  /* Carga (o crea) el estado. Devuelve una promesa: con localStorage se
     resuelve al instante y con Supabase esperará a la red. */
  function load() {
    if (readyPromise) return readyPromise;
    status = 'loading';
    readyPromise = Promise.resolve()
      .then(function () { return Studia.db.load(); })
      .then(function (saved) {
        hydrate(saved);
        status = 'ready';
        if (!saved) persistNow();
        return state;
      })
      .catch(function (e) {
        status = 'error';
        lastSaveError = e;
        hydrate(null);           // la app sigue abriendo con datos de ejemplo
        throw e;
      });
    return readyPromise;
  }

  /* Recarga el estado al cambiar de usuario (login, logout o expiración).
     Con Supabase no hace falta sincronía entre pestañas en tiempo real:
     cada pestaña recarga al enterarse del cambio de sesión. */
  function watchAuth() {
    if (!Studia.auth || typeof Studia.auth.onChange !== 'function') return;
    var lastUid = null;
    Studia.auth.onChange(function (user) {
      var uid = (user && user.id) || null;
      if (uid === lastUid) return;
      lastUid = uid;
      readyPromise = null;
      status = 'loading';
      if (!uid) {
        /* Cerrada la sesión: se vacía la memoria para que el siguiente
           logado no vea datos ajenos ni un guardado lo suba a su cuenta. */
        state = null;
        return;
      }
      readyPromise = load()
        .then(function () {
          if (Studia.router) Studia.router.render();
        })
        .catch(function (e) {
          if (Studia.captureError) Studia.captureError('carga', e && e.message, e && e.stack);
        });
    });
  }

  /* ---------------- API ---------------- */
  var store = {
    SCHEMA: SCHEMA_VERSION,
    get: function () { return state; },

    /** Carga (o crea) el estado inicial. Devuelve una promesa. */
    load: function () { return load(); },

    /** Promesa que se resuelve cuando los datos están listos. */
    ready: function () { return readyPromise || Promise.resolve(state); },

    /** idle | loading | ready | error */
    status: function () { return status; },

    /** Fuerza el guardado pendiente (tests, antes de cerrar…). */
    flush: function () { return persistNow(); },
    lastSaveError: function () { return lastSaveError; },

    /** update(fn) → muta el estado y notifica. */
    update: function (fn) {
      if (typeof fn === 'function') fn(state);
      else state = merge(state, fn);
      notify();
      return state;
    },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },

    reset: function () {
      state = merge(defaults(), Studia.seed.build());
      state.version = SCHEMA_VERSION;
      notify();
    },

    /** Deja la cuenta en blanco (sin datos de ejemplo): se usa en el
        asistente de bienvenida y en Ajustes → "Empezar de cero". */
    startFresh: function () {
      var name = (state && state.profile && state.profile.name) || 'Estudiante';
      var initials = (state && state.profile && state.profile.initials) || 'ES';
      state = defaults();
      state.profile.name = name;
      state.profile.initials = initials;
      state.profile.onboarded = true;
      state.profile.plan = 'premium';   // modo creadores hasta que haya pagos
      state.version = SCHEMA_VERSION;
      notify();
      return state;
    },

    /* --------------- Copia de seguridad --------------- */
    /** Devuelve un objeto serializable con todos los datos. */
    exportData: function () {
      return {
        app: 'Studia-IA',
        schema: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        state: JSON.parse(JSON.stringify(state))
      };
    },

    /** Restaura una copia creada por `exportData()`. Lanza si no es válida. */
    importData: function (payload) {
      var data = payload && payload.state ? payload.state : payload;
      if (!data || !data.profile || !Array.isArray(data.tasks) || !Array.isArray(data.subjects)) {
        throw new Error('El archivo no parece una copia de Studia-IA');
      }
      hydrate(data);
      status = 'ready';
      persistNow();
      notify({ persist: false });
      if (Studia.router) Studia.router.render();
      return state;
    },

    /* --------------- Selectores --------------- */
    subjectById: function (id) {
      return state.subjects.filter(function (s) { return s.id === id; })[0] || null;
    },
    subjectName: function (id) {
      var s = store.subjectById(id);
      return s ? s.name : 'Sin asignatura';
    },
    subjectColor: function (id) {
      var s = store.subjectById(id);
      return s ? s.color : 'var(--brand-500)';
    },

    tasks: function (filter) {
      var list = state.tasks.slice();
      if (filter) list = list.filter(filter);
      return list;
    },
    openTasks: function () {
      return U.sortBy(state.tasks.filter(function (t) { return !t.done; }), function (t) { return (t.due || '9999') + (t.priority === 'alta' ? '0' : t.priority === 'media' ? '1' : '2'); });
    },
    overdueTasks: function () {
      var t = U.today();
      return state.tasks.filter(function (x) { return !x.done && x.due && x.due < t; });
    },

    eventsOn: function (iso) {
      return state.events.filter(function (e) { return e.date === iso; })
        .sort(function (a, b) { return (a.start || '') < (b.start || '') ? -1 : 1; });
    },
    eventsBetween: function (from, to) {
      return state.events.filter(function (e) { return e.date >= from && e.date <= to; });
    },
    upcomingEvents: function (limit) {
      var t = U.today();
      return U.sortBy(state.events.filter(function (e) { return e.date >= t; }), function (e) { return e.date + (e.start || ''); })
        .slice(0, limit || 6);
    },
    nextExam: function () {
      var t = U.today();
      return U.sortBy(state.events.filter(function (e) { return e.type === 'exam' && e.date >= t; }), function (e) { return e.date; })[0] || null;
    },

    /** Horario semanal completo. */
    timetable: function () { return state.timetable; },

    classAt: function (dayIndex, time) {
      var m = U.timeToMinutes(time);
      return state.timetable.filter(function (c) {
        return c.day === dayIndex && U.timeToMinutes(c.start) <= m && U.timeToMinutes(c.end) > m;
      })[0] || null;
    },
    todayClasses: function () {
      return U.sortBy(state.timetable.filter(function (c) { return c.day === U.dayIndex(new Date()); }), function (c) { return c.start; });
    },

    /* --------------- Estudio / racha --------------- */
    sessionsOn: function (iso) {
      return state.sessions.filter(function (s) { return s.date === iso; });
    },
    minutesOn: function (iso) {
      return U.sum(state.sessions.filter(function (s) { return s.date === iso; }), function (s) { return s.minutes; });
    },
    minutesBetween: function (from, to) {
      return U.sum(state.sessions.filter(function (s) { return s.date >= from && s.date <= to; }), function (s) { return s.minutes; });
    },
    /** Racha actual, mejor racha y días estudiados. */
    streakInfo: function () {
      var history = state.streak.history || {};
      var days = Object.keys(history).filter(function (d) { return history[d] > 0; }).sort();
      var current = 0;
      var cursor = U.today();
      // Si hoy todavía no se ha estudiado, la racha cuenta desde ayer
      if (!history[cursor]) cursor = U.toISO(U.addDays(cursor, -1));
      while (history[cursor] && history[cursor] > 0) {
        current++;
        cursor = U.toISO(U.addDays(cursor, -1));
      }
      var best = state.streak.best || 0;
      // Recalcular el mejor racha a partir del histórico
      var run = 0;
      days.forEach(function (d, i) {
        if (i > 0 && U.daysBetween(days[i - 1], d) === 1) run++;
        else run = 1;
        if (run > best) best = run;
      });
      return { current: current, best: best, total: days.length, history: history, days: days };
    },

    /** XP y nivel. */
    levelInfo: function () {
      var xp = state.xp || 0;
      var level = Math.floor(Math.sqrt(xp / 60)) + 1;
      var base = Math.pow(level - 1, 2) * 60;
      var next = Math.pow(level, 2) * 60;
      var current = xp - base;
      var needed = next - base;
      return {
        xp: xp,
        level: level,
        current: current,
        needed: needed,
        percent: Math.min(100, Math.round((current / needed) * 100)),
        next: next
      };
    },

    /** Registra una sesión de estudio y actualiza racha, XP e hitos. */
    addSession: function (session) {
      var s = Object.assign({
        id: U.uid('ses'),
        date: U.today(),
        minutes: 0,
        subjectId: null,
        taskId: null,
        mode: 'pomodoro',
        notes: ''
      }, session);
      state.sessions.push(s);

      var history = state.streak.history || (state.streak.history = {});
      history[s.date] = (history[s.date] || 0) + s.minutes;
      var info = store.streakInfo();
      if (info.current > (state.streak.best || 0)) state.streak.best = info.current;

      var gained = Math.round(s.minutes * 0.6) + (s.mode === 'pomodoro' ? 15 : 0);
      state.xp = (state.xp || 0) + gained;

      notify();
      return { session: s, xp: gained, streak: store.streakInfo() };
    },

    removeSession: function (id) {
      state.sessions = state.sessions.filter(function (s) { return s.id !== id; });
      notify();
    },

    /* --------------- Colecciones genéricas --------------- */
    add: function (collection, row) {
      var item = Object.assign({ id: U.uid(collection.slice(0, 3)) }, row);
      state[collection] = (state[collection] || []).concat([item]);
      notify();
      return item;
    },
    updateRow: function (collection, id, patch) {
      state[collection] = (state[collection] || []).map(function (r) {
        return r.id === id ? Object.assign({}, r, patch) : r;
      });
      notify();
    },
    remove: function (collection, id) {
      state[collection] = (state[collection] || []).filter(function (r) { return r.id !== id; });
      notify();
    },
    find: function (collection, id) {
      return (state[collection] || []).filter(function (r) { return r.id === id; })[0] || null;
    }
  };

  watchAuth();
  Studia.store = store;
})(window);

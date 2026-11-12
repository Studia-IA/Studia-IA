/* =========================================================
   Studia-IA · core/db.js
   Capa de persistencia.

   Hoy guarda en localStorage. La interfaz está preparada para
   cambiar a Supabase (ver `supabaseAdapter`) sin tocar los
   módulos de la aplicación: solo hay que implementar las
   mismas cinco funciones.
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var KEY = 'studia.db.v1';
  var COLLECTIONS = ['subjects', 'tasks', 'events', 'timetable', 'sessions', 'notes', 'forum', 'rewards', 'ai'];

  function read() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Studia] No se pudo leer el almacenamiento local:', e);
      return null;
    }
  }

  function write(data) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('[Studia] No se pudo guardar (¿cuota agotada?):', e);
      if (Studia.ui) Studia.ui.toast('No se pudo guardar el progreso en este navegador.', 'error');
      return false;
    }
  }

  /* ---------------- Adaptador local (desarrollo / prototipo) ---------------- */
  var localAdapter = {
    name: 'local',
    load: function () { return Promise.resolve(read()); },
    save: function (data) { return Promise.resolve(write(data)); },
    clear: function () {
      global.localStorage.removeItem(KEY);
      return Promise.resolve(true);
    },
    select: function (collection, filter) {
      var db = read() || {};
      var rows = db[collection] || [];
      if (filter) rows = rows.filter(filter);
      return Promise.resolve(rows);
    },
    insert: function (collection, row) {
      var db = read() || {};
      db[collection] = db[collection] || [];
      db[collection].push(row);
      write(db);
      return Promise.resolve(row);
    },
    update: function (collection, id, patch) {
      var db = read() || {};
      db[collection] = db[collection] || [];
      db[collection] = db[collection].map(function (r) { return r.id === id ? Object.assign({}, r, patch) : r; });
      write(db);
      return Promise.resolve(true);
    },
    remove: function (collection, id) {
      var db = read() || {};
      db[collection] = (db[collection] || []).filter(function (r) { return r.id !== id; });
      write(db);
      return Promise.resolve(true);
    }
  };

  /* ---------------- Adaptador Supabase (producción) ----------------
     Todo el estado viaja como un único blob JSON en la tabla `state`
     (una fila por usuario; RLS: solo el dueño la lee y escribe).
     El `client` es el de Studia.auth; sin sesión no hay persistencia.
     El localStorage sigue usándose como caché y para la migración
     única de la cuenta prototipo (ver migrateLegacy).
     ------------------------------------------------------------------ */
  var MIGRATED_FLAG = 'studia.migrated.v1';

  var supabaseAdapter = {
    name: 'supabase',
    client: null,

    _client: function () {
      if (this.client) return this.client;
      if (Studia.auth && Studia.auth.client) {
        this.client = Studia.auth.client();
        if (this.client) return this.client;
      }
      if (global.supabase && global.supabase.createClient) {
        console.warn('[Studia] Supabase sin sesión: se usará el almacenamiento local.');
      } else {
        console.warn('[Studia] El SDK de Supabase no está disponible: se usará el almacenamiento local.');
      }
      return null;
    },

    /* El último guardado en vuelo; los nuevos esperan al anterior
       para no escribir dos blobs a la vez. */
    _saving: Promise.resolve(),

    /* El blob llega en state.data (columna jsonb). */
    load: function () {
      var c = this._client();
      if (!c) return localAdapter.load();
      return c.from('state').select('data').maybeSingle().then(function (r) {
        if (r.error) throw r.error;
        /* Sin blob en la nube → usuario nuevo: arranca vacío (el seed
           solo es para el prototipo local). */
        return (r.data && r.data.data) || null;
      });
    },

    save: function (data) {
      var self = this;
      /* Caché local siempre: sirve para el modo local, la copia de
         seguridad y la migración única. */
      localAdapter.save(data);

      var c = this._client();
      var p = this._saving.then(function () {
        if (!c) return true;
        return c.auth.getSession().then(function (rs) {
          var uid = rs && rs.data && rs.data.session && rs.data.session.user && rs.data.session.user.id;
          if (!uid) return true;   // sin sesión: no hay a dónde guardar
          return c.from('state')
            .upsert({ user_id: uid, data: data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
            .then(function (r) { if (r.error) throw r.error; return true; });
        });
      });
      /* Los fallos no encadenan: un error no bloquea el siguiente guardado. */
      this._saving = p.catch(function () { return false; });
      return p;
    },

    clear: function () {
      /* No borra la nube (no hay DELETE por API); limpia la caché local. */
      return localAdapter.clear();
    },

    select: function (c, f) { return localAdapter.select(c, f); },
    insert: function (c, r) { return localAdapter.insert(c, r); },
    update: function (c, id, p) { return localAdapter.update(c, id, p); },
    remove: function (c, id) { return localAdapter.remove(c, id); }
  };

  /* ---------------- Migración única del prototipo ----------------
     El estado que había en localStorage antes del login se sube a la
     cuenta la primera vez (decisión de grupo: migrar una vez). Si ya
     hay blob en la nube, la nube manda. */
  function migrateLegacy() {
    try { if (global.localStorage.getItem(MIGRATED_FLAG)) return Promise.resolve('done'); } catch (e) { /* sin storage */ }
    var legacy = read();
    if (!legacy || !legacy.profile) {
      try { global.localStorage.setItem(MIGRATED_FLAG, '1'); } catch (e) { /* sin storage */ }
      return Promise.resolve('none');
    }
    return supabaseAdapter.save(legacy).then(function (ok) {
      if (ok) {
        try { global.localStorage.setItem(MIGRATED_FLAG, '1'); } catch (e) { /* sin storage */ }
        return 'migrated';
      }
      return 'failed';
    }).catch(function () { return 'failed'; });
  }

  var adapter = localAdapter;

  Studia.db = {
    COLLECTIONS: COLLECTIONS,
    KEY: KEY,
    get adapter() { return adapter; },
    /** Cambia de backend de persistencia (local ↔ supabase). */
    use: function (name) {
      adapter = name === 'supabase' ? supabaseAdapter : localAdapter;
      return adapter;
    },
    configureSupabase: function (client) { supabaseAdapter.client = client; },
    /** El localStorage del prototipo se sube a la cuenta una sola vez. */
    migrateLegacy: function () { return migrateLegacy(); },
    load: function () { return adapter.load(); },
    save: function (data) { return adapter.save(data); },
    clear: function () { return adapter.clear(); },
    select: function (c, f) { return adapter.select(c, f); },
    insert: function (c, r) { return adapter.insert(c, r); },
    update: function (c, id, p) { return adapter.update(c, id, p); },
    remove: function (c, id) { return adapter.remove(c, id); }
  };
})(window);

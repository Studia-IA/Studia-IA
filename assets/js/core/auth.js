/* =========================================================
   Studia-IA · core/auth.js
   Autenticación con Supabase (SDK oficial por CDN).

   El proyecto es obligatorio: sin sesión no se entra en la app.
   La anon key es pública por diseño; la seguridad real la da
   el Row Level Security de Supabase.

   API:
     Studia.auth.ready            → Promise<boolean> (SDK + proyecto configurado)
     Studia.auth.init()           → crea el cliente Supabase
     Studia.auth.user()           → usuario actual o null
     Studia.auth.email()          → email del usuario o ''
     Studia.auth.token()          → JWT actual o ''
     Studia.auth.signIn(email, pass)
     Studia.auth.signUp(email, pass)
     Studia.auth.signOut()
     Studia.auth.onChange(fn)     → escucha cambios de sesión
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};

  var SUPABASE_URL = 'https://naiedtswuyrlcxorztlo.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5haWVkdHN3dXlybGN4b3J6dGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NjgyMjUsImV4cCI6MjEwOTU0NDIyNX0.i_6dp7HpYC_AWuCAM8etKznsJkP1vxQVKtH-c8KwdIA';

  var LUNA_FUNCTION = SUPABASE_URL + '/functions/v1/luna-chat';

  var client = null;
  var current = null;
  var listeners = [];

  /* ---------------- Rol/plan del perfil ----------------
     La tabla profiles se crea sola con un trigger al registrarse
     (role y plan 'free'). Aquí solo leemos; los cambios de rol se
     hacen a mano desde el panel de Supabase. */
  var profileCache = null;   // { role, plan } o null
  var profilePromise = null;

  function fetchProfile(userId) {
    if (!client || !userId) return Promise.resolve(null);
    return client.from('profiles')
      .select('role, plan')
      .eq('user_id', userId)
      .maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        return r.data || { role: 'free', plan: 'free' };
      });
  }

  function refreshProfile() {
    var user = current;
    if (!user) {
      profileCache = null;
      profilePromise = null;
      return Promise.resolve(null);
    }
    profilePromise = fetchProfile(user.id)
      .then(function (p) { profileCache = p; return p; })
      .catch(function (e) {
        console.warn('[Studia.auth] No se pudo leer el perfil:', e);
        profileCache = { role: 'free', plan: 'free' };
        return profileCache;
      });
    return profilePromise;
  }

  /* ---------------- Sesión ---------------- */
  function setUser(user) {
    var changed = (current && current.id) !== (user && user.id);
    current = user || null;
    refreshProfile();
    listeners.forEach(function (fn) {
      try { fn(user, changed); } catch (e) { console.error('[Studia.auth] Error en listener:', e); }
    });
  }

  /* ---------------- API pública ---------------- */
  var auth = {
    ready: Promise.resolve(false),

    /** Crea el cliente Supabase y detecta la sesión guardada. */
    init: function () {
      return Promise.resolve(global.studiaSdkWait).then(function () {
        return auth._initSdk();
      });
    },

    _initSdk: function () {
      if (!global.supabase || (typeof global.supabase !== "object") || !global.supabase.createClient) {
        return Promise.reject(new Error('El SDK de Supabase no está disponible (¿sin conexión?).'));
      }
      client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });

      client.auth.onAuthStateChange(function (_event, session) {
        setUser(session ? session.user : null);
      });

      return client.auth.getSession()
        .then(function (r) {
          var session = r && r.data && r.data.session;
          setUser(session ? session.user : null);
          return !!current;
        });
    },

    user: function () { return current; },
    email: function () { return (current && current.email) || ''; },
    /** El cliente Supabase (null hasta init()). */
    client: function () { return client; },

    /** JWT actual (para la Edge Function y peticiones con RLS). */
    token: function () {
      if (!client) return Promise.resolve('');
      return client.auth.getSession().then(function (r) {
        return (r && r.data && r.data.session && r.data.session.access_token) || '';
      });
    },

    /** Rol/plan { role, plan } del usuario logado (nunca 'admin' si no se asigna a mano). */
    profile: function () {
      if (!current) return Promise.resolve(null);
      if (profileCache) return Promise.resolve(profileCache);
      return profilePromise || refreshProfile();
    },

    signIn: function (email, password) {
      if (!client) return Promise.reject(new Error('Supabase no está listo.'));
      return client.auth.signInWithPassword({
        email: String(email).trim().toLowerCase(),
        password: String(password)
      }).then(function (r) {
        if (r.error) throw r.error;
        setUser(r.data.user);
        return r.data.user;
      });
    },

    /** Alta nueva. El trigger de Supabase crea el perfil 'free'. */
    signUp: function (email, password) {
      if (!client) return Promise.reject(new Error('Supabase no está listo.'));
      return client.auth.signUp({
        email: String(email).trim().toLowerCase(),
        password: String(password)
      }).then(function (r) {
        if (r.error) throw r.error;
        if (r.data.user && r.data.session) setUser(r.data.user);
        return r.data;
      });
    },

    signOut: function () {
      if (!client) return Promise.resolve();
      return client.auth.signOut().then(function () { setUser(null); });
    },

    onChange: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },

    /* --------------- Luna: Edge Function --------------- */
    lunaUrl: function () { return LUNA_FUNCTION; },

    /**
     * Pregunta a la Edge Function luna-chat con el JWT del usuario.
     * @param {Array} messages [{ role: 'me'|'ai', text: string }]
     * @param {object} context contexto de estudio para el system prompt
     * @param {object} opts    { signal } (AbortSignal)
     * @returns {Promise<string>} texto de la respuesta
     */
    askLuna: function (messages, context, opts) {
      return auth.token().then(function (token) {
        if (!token) { var e = new Error('No has iniciado sesión.'); e.code = 401; throw e; }
        return fetch(LUNA_FUNCTION, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ messages: messages, context: context || {} }),
          signal: opts && opts.signal
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
              var err = new Error((data && data.error) || ('Error ' + res.status));
              err.code = res.status;
              throw err;
            }
            if (!data || !data.text) { var e2 = new Error('Luna no devolvió respuesta'); e2.code = 502; throw e2; }
            return data.text;
          });
        });
      });
    }
  };

  Studia.auth = auth;
})(window);

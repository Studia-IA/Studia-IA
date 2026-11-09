/* =========================================================
   Studia-IA · modules/ai.js
   Luna: asistente de estudio con memoria.
   Incluye chat (motor local de respuestas), test inicial de
   conocimientos y personalización del robot.
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var AVATARS = ['🤖', '👾', '🧠', '🐱', '🦊', '🛸', '🌙', '⚡'];
  var TONES = ['motivador', 'formal', 'divertido', 'conciso'];
  var LANGS = { es: 'Español', ca: 'Català', en: 'English' };

  /* ---------------- Banco de preguntas del test inicial ---------------- */
  var BANK = {
    sub_pr1: [
      { topic: 'Operadores', q: 'En C, ¿cuál es el valor de `y` tras `int x = 5; int y = x++ + ++x;`?',
        options: ['11', '12', '10', 'Error de compilación'], correct: 1,
        explanation: 'x++ devuelve 5 (x pasa a 6) y ++x devuelve 7 (x pasa a 7): 5 + 7 = 12.' },
      { topic: 'Memoria', q: 'Si `int *p = NULL;` y ejecutas `*p = 5;`, ¿qué ocurre?',
        options: ['Se asigna 5 al NULL', 'Error en tiempo de ejecución', 'El programa se cierra sin error', 'El puntero se crea solo'], correct: 1,
        explanation: 'Desreferenciar un puntero nulo provoca un fallo de segmentación.' },
      { topic: 'Algoritmos', q: '¿Qué estructura de datos ofrece acceso por clave en tiempo medio O(1)?',
        options: ['Lista enlazada', 'Pila', 'Tabla hash', 'Árbol binario de búsqueda'], correct: 2,
        explanation: 'La tabla hash dispersa la clave y permite búsquedas en O(1) medio.' },
      { topic: 'Tipos', q: 'En C, ¿qué resulta de `5 / 2` con operandos enteros?',
        options: ['2.5', '2', '3', 'Error'], correct: 1,
        explanation: 'Es división entera: se descarta la parte decimal.' },
      { topic: 'POO', q: 'En qué se diferencia una clase de un objeto?',
        options: ['Son lo mismo', 'La clase es la plantilla y el objeto la instancia', 'El objeto es la plantilla', 'Depende del lenguaje'], correct: 1,
        explanation: 'La clase define atributos y métodos; el objeto es una instancia concreta.' }
    ],
    sub_alg: [
      { topic: 'Determinantes', q: 'El determinante de la matriz [[a, b], [c, d]] es:',
        options: ['ad + bc', 'ad − bc', 'ac − bd', 'ab − cd'], correct: 1,
        explanation: 'det(A) = a·d − b·c.' },
      { topic: 'Inversas', q: 'Si una matriz 3×3 tiene determinante 0, ¿qué se puede afirmar?',
        options: ['Es invertible', 'Es singular y no tiene inversa', 'Es la identidad', 'Tiene rango 3'], correct: 1,
        explanation: 'det(A) = 0 implica que A es singular, por lo que no existe A⁻¹.' },
      { topic: 'Rango', q: 'El rango de una matriz es:',
        options: ['El número de filas', 'El número de columnas', 'El número de filas o columnas linealmente independientes', 'El determinante'], correct: 2,
        explanation: 'El rango es la dimensión del espacio lineal generado por sus filas o columnas.' },
      { topic: 'Autovalores', q: 'Los valores propios de una matriz real simétrica:',
        options: ['Son todos reales', 'Son todos complejos', 'Siempre son 0', 'No existen'], correct: 0,
        explanation: 'Una matriz simétrica real se diagonaliza con base ortonormal y sus autovalores son reales.' },
      { topic: 'Sistemas', q: 'Un sistema cuadrado compatible y determinado tiene:',
        options: ['0 soluciones', 'Una única solución', 'Infinitas soluciones', 'Depende del determinante'], correct: 1,
        explanation: 'Compatible y determinado significa solución única.' }
    ],
    sub_cal: [
      { topic: 'Derivadas', q: '¿Cuál es la derivada de ln(x)?',
        options: ['ln(x)/x', '1/x', 'x·ln(x)', 'eˣ'], correct: 1,
        explanation: 'd/dx ln(x) = 1/x (para x > 0).' },
      { topic: 'Derivadas', q: 'Si f′(a) = 0 y f″(a) > 0, entonces a es:',
        options: ['Máximo local', 'Mínimo local', 'Punto de inflexión', 'Máximo absoluto'], correct: 1,
        explanation: 'La segunda derivada positiva indica concavidad hacia arriba: mínimo local.' },
      { topic: 'Integración', q: '¿Cuál es ∫ 1/x dx?',
        options: ['x + C', 'ln|x| + C', '−1/x² + C', 'x²/2 + C'], correct: 1,
        explanation: 'La integral de 1/x es ln|x| + C.' },
      { topic: 'Series', q: 'El polinomio de Taylor sirve para:',
        options: ['Resolver ecuaciones diferenciales', 'Aproximar funciones con sus derivadas', 'Calcular áreas exactas', 'Demostrar teorías'], correct: 1,
        explanation: 'Taylor aproxima una función mediante sus derivadas en un punto.' },
      { topic: 'Límites', q: 'El teorema de L’Hôpital se aplica a límites del tipo:',
        options: ['0/0 o ∞/∞', 'Sumas finitas', 'Integrales definidos', 'Derivadas de orden superior'], correct: 0,
        explanation: 'Se usa para indeterminaciones 0/0 e ∞/∞ derivando numerador y denominador.' }
    ],
    sub_bbd: [
      { topic: 'Normalización', q: 'La tercera forma normal (3FN) elimina sobre todo:',
        options: ['La dependencia transitiva', 'Las claves candidatas', 'Los índices', 'Las tablas anidadas'], correct: 0,
        explanation: '3FN elimina las dependencias transitivas entre atributos no clave.' },
      { topic: 'Claves', q: '¿Qué diferencia hay entre clave primaria y clave única?',
        options: ['Ninguna', 'La primaria no admite nulos y la única sí', 'La única no admite nulos', 'La primaria siempre es numérica'], correct: 1,
        explanation: 'La clave primaria identifica cada fila y nunca puede ser nula.' },
      { topic: 'Transacciones', q: 'El acrónimo ACID en bases de datos significa:',
        options: ['Atomicidad, consistencia, aislamiento, durabilidad', 'Acceso, control, integridad, datos', 'Análisis, consulta, indexado, diseño', 'Ninguna de las anteriores'], correct: 0,
        explanation: 'Las propiedades ACID garantizan que las transacciones se ejecuten de forma segura.' },
      { topic: 'SQL', q: 'Un INNER JOIN devuelve:',
        options: ['Todas las filas de la primera tabla', 'Las filas que coinciden en ambas tablas según la condición', 'Las filas sin coincidencia', 'Una tabla nueva'], correct: 1,
        explanation: 'INNER JOIN combina las filas que cumplen la condición de coincidencia.' },
      { topic: 'Índices', q: 'Un índice en una base de datos:',
        options: ['Duplica los datos', 'Acelera las consultas que lo usan', 'Impide borrar filas', 'Reduce siempre el tamaño'], correct: 1,
        explanation: 'Los índices aceleran búsquedas y filtros a costa de coste en las escrituras.' }
    ]
  };

  /* ---------------- Motor de respuestas (local) ---------------- */
  function reply(text) {
    var q = text.toLowerCase();
    var ai = store.get().ai;
    var tone = ai.tone || 'motivador';

    function hello() {
      var hours = store.minutesOn(U.today());
      var lines = {
        motivador: '¡Hola de nuevo! Ya has studied ' + U.fmtMinutes(hours) + ' hoy. Dime en qué te ayudo y seguimos avanzando 💪',
        formal: 'Hola. Has estudiado ' + U.fmtMinutes(hours) + ' hoy. ¿En qué puedo ayudarte?',
        divertido: '¡Holaaa! ' + U.fmtMinutes(hours) + ' de estudio hoy. ¿Y qué tal?',
        conciso: 'Hola. ' + U.fmtMinutes(hours) + ' estudiados hoy. ¿Qué necesitas?'
      };
      return lines[tone] || lines.motivador;
    }

    if (/^(hola|buenas|hey|holi)\b/.test(q)) return hello();

    if (/(qu[eé] tengo que estudiar|qu[eé] estudio|prioridad|empezar)/.test(q)) {
      var open = store.openTasks();
      if (!open.length) return 'No tienes tareas pendientes. Buen momento para repasar la materia que más racha tengas: ' + topSubject() + '.';
      var lines = open.slice(0, 4).map(function (t, i) {
        return (i + 1) + '. ' + t.title + ' — ' + store.subjectName(t.subjectId) + (t.due ? ' (para el ' + U.fmtRelative(t.due) + ')' : '');
      });
      return 'Esto es lo que te toca ahora mismo:\n' + lines.join('\n') + '\n\n¿Empiezas por el primero? Puedo prepararte un pomodoro de 25 minutos.';
    }

    if (/(plan|repaso|prepare|examen)/.test(q)) {
      var exam = store.nextExam();
      if (!exam) return 'Ahora mismo no tienes exámenes programados. Podemos crear uno en el calendario y te preparo un plan.';
      var days = Math.max(1, U.daysBetween(new Date(), exam.date));
      var subj = store.subjectName(exam.subjectId);
      var tasks = store.openTasks().filter(function (t) { return t.subjectId === exam.subjectId; });
      var plan = ['Repasa los apuntes del tema y marca lo que no entiendes.', 'Resuelve ejercicios de años anteriores sin mirar apuntes.', 'Haz un resumen de una página con lo esencial.'];
      if (tasks.length) plan.push('Tareas pendientes de ' + subj + ': ' + tasks.map(function (t) { return t.title; }).join('; ') + '.');
      plan.push('Simula el examen con cronómetro el último día.');
      return 'Plan para ' + exam.title + ' (quedan ' + days + ' días):\n' +
        plan.map(function (p, i) { return '· ' + p; }).join('\n') +
        '\n\n¿Quiero que te programe bloques de estudio en el calendario?';
    }

    if (/(progreso|racha|resumen|estad[ií]stica)/.test(q)) {
      var info = store.streakInfo();
      var lvl = store.levelInfo();
      var week = store.minutesBetween(U.toISO(U.addDays(new Date(), -6)), U.today());
      return 'Tu estado actual:\n' +
        '· Racha: ' + info.current + ' días (mejor: ' + info.best + ')\n' +
        '· Esta semana: ' + U.fmtMinutes(week) + '\n' +
        '· Nivel ' + lvl.level + ' · ' + lvl.xp + ' XP\n' +
        '· Asignatura con más tiempo: ' + topSubject() + '\n' +
        (info.current >= 3 ? '\n¡Vas muy bien! Mantén el ritmo.' : '\nCon 25 minutos hoy ya sumas al streak.');
    }

    if (/(examen|entrega|deadline|pr[eé]xim)/.test(q)) {
      var upcoming = store.upcomingEvents(5);
      if (!upcoming.length) return 'No tienes nada programado en el calendario.';
      return 'Lo próximo en tu calendario:\n' + upcoming.map(function (e) {
        return '· ' + U.fmtDate(e.date, { short: true, day: true }) + ' — ' + e.title + (e.start ? ' (' + e.start.slice(0, 5) + ')' : '');
      }).join('\n');
    }

    if (/(horario|clase|profesor)/.test(q)) {
      var today = store.todayClasses();
      if (!today.length) return 'Hoy no tienes clases. Buen día para estudiar en casa sin interrupciones 😄';
      return 'Hoy tienes:\n' + today.map(function (c) {
        return '· ' + c.start.slice(0, 5) + '–' + c.end.slice(0, 5) + ' · ' + store.subjectName(c.subjectId) + (c.room ? ' (' + c.room + ')' : '');
      }).join('\n');
    }

    if (/(resumen|apuntes|resume|idea)/.test(q)) {
      var s = guessSubject(q);
      var notes = store.get().notes.filter(function (n) { return !s || n.subjectId === s; });
      var name = s ? store.subjectName(s) : 'todas tus asignaturas';
      if (!notes.length) return 'No tengo apuntes guardados de ' + name + ' todavía. Añádelos en Asignaturas y los resumo en cuanto los tenga.';
      return 'Apuntes que tengo de ' + name + ':\n' + notes.slice(0, 6).map(function (n) { return '· ' + n.title; }).join('\n') +
        '\n\nCuando subas el documento completo, te hago un resumen por temas y una lista de conceptos clave.';
    }

    if (/(idioma|ingl[eé]s|verano|vacaciones|extra)/.test(q)) {
      return 'Puedo preparar un plan de verano o de idiomas:\n' +
        '· Plan de verano: 20 min/día repartidos entre repasos y asignaturas de ahead.\n' +
        '· Plan de idioma: 5 palabras nuevas al día + una redacción semanal.\n' +
        'Dime el número de semanas y lo añado a tu calendario.';
    }

    if (/(test|diagn[oó]stico|conocimiento|nivel)/.test(q)) {
      return 'Puedo hacerte el test inicial de conocimientos: elige una asignatura y te hago 5 preguntas para saber desde dónde partir. Está en el panel de la derecha.';
    }

    if (/(gracias|gracias!|thank)/.test(q)) {
      return tone === 'formal' ? 'Gracias a ti. ¿Necesitas algo más?' : '¡A ti! Aquí sigo si necesitas algo más 💪';
    }

    return 'Puedo ayudarte con:\n' +
      '· Qué estudiar ahora mismo\n' +
      '· Un plan para tu próximo examen\n' +
      '· Resúmenes de tus apuntes\n' +
      '· Tu progreso y tu racha\n' +
      '· El test inicial de conocimientos\n\n' +
      '¿Cuál prefieres?';
  }

  function topSubject() {
    var from = U.toISO(U.addDays(new Date(), -29));
    var m = {};
    store.get().sessions.filter(function (s) { return s.date >= from && s.subjectId; }).forEach(function (s) {
      m[s.subjectId] = (m[s.subjectId] || 0) + s.minutes;
    });
    var ids = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; });
    return ids.length ? store.subjectName(ids[0]) : 'ninguna todavía';
  }

  function guessSubject(text) {
    var subjects = store.get().subjects;
    for (var i = 0; i < subjects.length; i++) {
      var s = subjects[i];
      if (text.indexOf(s.name.toLowerCase()) !== -1) return s.id;
      if (s.code && text.indexOf(s.code.toLowerCase()) !== -1) return s.id;
    }
    return null;
  }

  /* ---------------- Motor de respuestas ----------------
     Interfaz pensada para enchufar una API real sin tocar la vista:

       Studia.ai.setEngine({
         name: 'api',
         ask: function (text, ctx, opts) {
           // debe devolver Promise<{ text: string }>
           // y respetar opts.signal (AbortSignal) para cancelar
         }
       });

     El contexto (ctx) incluye perfil, asignaturas, tareas abiertas,
     próximo examen, minutos de hoy y los últimos mensajes. */
  var localEngine = {
    name: 'local',
    ask: function (text, ctx, opts) {
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { resolve({ text: reply(text) }); }, 620);
        if (opts && opts.signal) {
          opts.signal.addEventListener('abort', function () {
            clearTimeout(t);
            var err = new Error('Petición cancelada');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    }
  };

  /* ---------------- Motor Groq (IA real) ----------------
     La clave se guarda SOLO en localStorage (clave `studia.groq.key`),
     nunca en el repositorio ni en la base de datos. Sin clave, o si la
     API falla, Luna usa el motor local: el chat nunca se queda vacío.

       Studia.ai.groq.setKey('gsk_...')   // activa el motor Groq
       Studia.ai.groq.setKey(null)        // vuelve al motor local     */
  var GROQ_KEY_LS = 'studia.groq.key';
  var GROQ_MODELS = ['openai/gpt-oss-20b'];

  function groqKey() {
    try { return global.localStorage.getItem(GROQ_KEY_LS) || ''; } catch (e) { return ''; }
  }

  function groqSystem(ctx) {
    var lines = [
      'Eres Luna, la asistente de estudio de la app Studia-IA.',
      'Idioma: español, en todo momento y sin excepciones. Tutea al estudiante.',
      'Responde SIEMPRE de forma directa, como si hablaras con un compañero. 2-4 frases o una lista de 3-5 puntos.',
      'PROHIBIDO escribir tu razonamiento, tus notas internas o comentarios sobre cómo vas a responder. Solo la respuesta final.',
      'Usas SOLO los datos del contexto; no inventes tareas, fechas ni asignaturas.',
      'Perfil: ' + (ctx.profile.name || 'estudiante') + ', curso ' + (ctx.profile.course || '-') + '.',
      'Minutos de estudio de hoy: ' + ctx.minutesToday + '.',
      'Asignaturas: ' + (ctx.subjects.map(function (x) { return x.name; }).join(', ') || 'ninguna') + '.',
      ctx.nextExam ? 'Próximo examen: ' + ctx.nextExam.title + ' el ' + ctx.nextExam.date + '.' : 'No hay exámenes próximos.',
      ctx.openTasks.length ? 'Tareas abiertas: ' + ctx.openTasks.map(function (t) { return t.title + ' (vence ' + t.due + ')'; }).join('; ') + '.' : 'No hay tareas abiertas.',
      'Si piden un plan, da pasos realizables con pomodoros de 25 minutos.'
    ];
    return lines.join('\n');
  }

  var groqEngine = {
    name: 'groq',
    ask: function (text, ctx, opts) {
      var key = groqKey();
      if (!key) return Promise.reject(new Error('Sin clave de Groq'));
      var msgs = [{ role: 'system', content: groqSystem(ctx) }];
      (ctx.history || []).forEach(function (m) {
        msgs.push({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text });
      });
      msgs.push({ role: 'user', content: text });

      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeout = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
      var onAbort = function () { if (ctrl) ctrl.abort(); };
      if (opts && opts.signal) {
        if (opts.signal.aborted) { clearTimeout(timeout); return Promise.reject(new DOMException('Cancelado', 'AbortError')); }
        opts.signal.addEventListener('abort', onAbort);
      }

      function attempt(i) {
        var model = GROQ_MODELS[Math.min(i, GROQ_MODELS.length - 1)];
        return fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model: model, messages: msgs, temperature: 0.6, max_tokens: 400 }),
          signal: ctrl ? ctrl.signal : undefined
        }).then(function (res) {
          if (res.status === 404 || res.status === 429 || res.status >= 500) {
            // modelo no disponible, saturado o caído: probamos el siguiente
            if (i + 1 < GROQ_MODELS.length) return attempt(i + 1);
            if (res.status === 429) { var e = new Error('Luna está saturada; espera unos segundos'); e.groq = 'rate'; throw e; }
            throw new Error(res.status === 404 ? 'Ningún modelo de Groq está disponible ahora' : 'Groq ' + res.status);
          }
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (b) {
              var msg = (b.error && b.error.message) || ('Groq ' + res.status);
              var e = new Error(/key|api/i.test(msg) && res.status === 401 ? 'La clave de Groq no es válida' : msg);
              throw e;
            });
          }
          return res.json();
        });
      }

      return attempt(0).then(function (data) {
        clearTimeout(timeout);
        if (opts && opts.signal) opts.signal.removeEventListener('abort', onAbort);
        var choice = data && data.choices && data.choices[0] && data.choices[0].message;
        var raw = (choice && (choice.content || choice.reasoning)) || '';
        var content = String(raw).replace(/<\|[^|>]*\|>/g, '').trim();
        return { text: content, leaked: !(choice && choice.content) };
      }).then(function (r) {
        // gpt-oss a veces devuelve su razonamiento interno: se pide una vez
        // más, en seco, solo la respuesta final.
        if (!r.text || !r.leaked) return r.text ? { text: r.text } : { text: 'No he sabido responder. Prueba otra vez.' };
        var retry = msgs.concat([{ role: 'user', content: 'Responde otra vez, en español y SOLO con la respuesta final. Nada de razonamiento ni notas internas.' }]);
        return fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model: GROQ_MODELS[0], messages: retry, temperature: 0.4, max_tokens: 350 }),
          signal: ctrl ? ctrl.signal : undefined
        }).then(function (res) { return res.ok ? res.json() : data; })
          .catch(function () { return data; })
          .then(function (data2) {
            var c2 = data2 && data2.choices && data2.choices[0] && data2.choices[0].message;
            var t2 = String((c2 && (c2.content || '')) || '').replace(/<\|[^|>]*\|>/g, '').trim();
            return { text: t2 || 'No he sabido responder. Prueba otra vez.' };
          });
      }).catch(function (err) {
        clearTimeout(timeout);
        if (opts && opts.signal) opts.signal.removeEventListener('abort', onAbort);
        throw err;
      });
    }
  };

  var engine = groqKey() ? groqEngine : localEngine;
  var pending = null;

  function applyEngineFromKey() {
    engine = groqKey() ? groqEngine : localEngine;
  }

  function buildContext() {
    var s = store.get();
    return {
      profile: { name: s.profile.name, course: s.profile.course, plan: s.profile.plan },
      subjects: s.subjects.map(function (x) { return { id: x.id, name: x.name, code: x.code }; }),
      openTasks: s.tasks.filter(function (t) { return !t.done; }).slice(0, 10).map(function (t) {
        return { title: t.title, due: t.due, priority: t.priority, subjectId: t.subjectId };
      }),
      nextExam: store.nextExam(),
      minutesToday: store.minutesOn(U.today()),
      history: (s.ai.messages || []).slice(-8).map(function (m) { return { role: m.role, text: m.text }; })
    };
  }

  function showTyping() {
    removeTyping();
    var chat = document.getElementById('aiChat');
    if (!chat) return;
    var node = U.h('div.msg.msg--ai', { id: 'aiTyping' }, [
      U.h('div.msg__avatar', store.get().ai.avatar || '🤖'),
      U.h('div.msg__bubble.msg__typing', [U.h('i'), U.h('i'), U.h('i')])
    ]);
    chat.appendChild(node);
    chat.scrollTop = chat.scrollHeight;
  }

  function removeTyping() {
    var node = document.getElementById('aiTyping');
    if (node) node.remove();
  }

  /* ---------------- Chat ---------------- */
  var lastSent = null;   // último texto enviado, por si falla la respuesta
  var lastFailed = null; // texto que se quedó sin respuesta (botón reintentar)

  function setTyping(on) {
    var bar = document.getElementById('aiTypingBar');
    if (bar) bar.hidden = !on;
  }

  function send(text) {
    lastSent = text;
    lastFailed = null;
    var messages = (store.get().ai.messages || []).slice();
    messages.push({ id: U.uid('m'), role: 'me', text: text, time: new Date().toISOString() });
    store.update(function (s) { s.ai.messages = messages; });
    showTyping();
    setTyping(true);

    if (pending) pending.abort();            // una sola respuesta a la vez
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    pending = ctrl;

    engine.ask(text, buildContext(), { signal: ctrl && ctrl.signal })
      .then(function (res) {
        if (pending === ctrl) pending = null;
        removeTyping();
        setTyping(false);
        var list = (store.get().ai.messages || []).slice();
        list.push({ id: U.uid('m'), role: 'ai', text: (res && res.text) || '', time: new Date().toISOString() });
        store.update(function (s) { s.ai.messages = list; });
      })
      .catch(function (err) {
        if (pending === ctrl) pending = null;
        removeTyping();
        setTyping(false);
        if (err && err.name === 'AbortError') return;
        // Si el fallo es de la API real, Luna responde con el motor local.
        if (engine !== localEngine) {
          localEngine.ask(text, buildContext(), { signal: ctrl && ctrl.signal })
            .then(function (res) {
              removeTyping();
              setTyping(false);
              var list = (store.get().ai.messages || []).slice();
              list.push({ id: U.uid('m'), role: 'ai', text: (res && res.text) || '', time: new Date().toISOString() });
              store.update(function (s) { s.ai.messages = list; });
              ui.toast('Luna real no disponible: respondo con el modo sin conexión', 'warn');
            })
            .catch(function () {
              lastFailed = lastSent;
              refresh();
            });
          if (Studia.captureError) Studia.captureError('ia', err && err.message, err && err.stack);
          return;
        }
        lastFailed = lastSent;
        refresh();
        if (Studia.captureError) Studia.captureError('ia', err && err.message, err && err.stack);
      });
  }

  /* ---------------- Test inicial ---------------- */
  function openQuiz() {
    var subjects = store.get().subjects.filter(function (s) { return BANK[s.id]; });
    if (!subjects.length) {
      ui.toast('No hay test inicial disponible para estas asignaturas', 'warn');
      return;
    }
    var subjectId = subjects[0].id;
    var state = { subjectId: subjectId, index: 0, answers: [], questions: BANK[subjectId] };
    var body = U.h('div');
    var m;

    function draw() {
      U.clear(body);
      if (state.index < state.questions.length) {
        drawQuestion();
      } else {
        drawReport();
      }
    }

    function drawQuestion() {
      var q = state.questions[state.index];
      body.appendChild(U.h('div.row.row--between.mb-2', [
        U.h('span.badge.badge--brand', 'Pregunta ' + (state.index + 1) + ' de ' + state.questions.length),
        U.h('span.tiny.soft', store.subjectName(state.subjectId))
      ]));
      body.appendChild(U.h('div.progress.progress--thin.mb-3', U.h('div.progress__bar', { style: { width: ((state.index) / state.questions.length * 100) + '%' } })));
      body.appendChild(U.h('p.strong.mb-2', q.q));
      body.appendChild(U.h('div.col.gap-1', q.options.map(function (opt, i) {
        return U.h('button.quiz-option', {
          onclick: function () {
            state.answers.push({ correct: i === q.correct, topic: q.topic, explanation: q.explanation });
            state.index++;
            draw();
          }
        }, [
          U.h('span.quiz-option__key', String.fromCharCode(65 + i)),
          U.h('span', opt)
        ]);
      })));
    }

    function drawReport() {
      var right = state.answers.filter(function (a) { return a.correct; }).length;
      var total = state.questions.length;
      var pct = Math.round(right / total * 100);
      var level = pct >= 80 ? 'avanzado' : pct >= 50 ? 'intermedio' : 'inicial';
      var weak = {};
      state.answers.forEach(function (a) { if (!a.correct) weak[a.topic] = (weak[a.topic] || 0) + 1; });
      var weakTopics = Object.keys(weak);

      body.appendChild(U.h('div.center', [
        U.h('div.stat__icon.stat__icon--violet', { style: { margin: '0 auto 10px', width: '54px', height: '54px' } }, U.icon('sparkles')),
        U.h('h3', 'Resultado: ' + level),
        U.h('p.muted.small', right + ' de ' + total + ' respuestas correctas (' + pct + '%)'),
        U.h('p.small.mt-2', 'Nivel detectado en ' + store.subjectName(state.subjectId) + ': ' + level + '.')
      ]));
      if (weakTopics.length) {
        body.appendChild(U.h('div.mt-3', [
          U.h('p.field__label.mb-1', 'Temas a reforzar'),
          U.h('div.row.gap-1.row--wrap', weakTopics.map(function (t) { return U.h('span.badge.badge--rose', t); }))
        ]));
      }
      body.appendChild(U.h('div.mt-3', [
        U.h('p.field__label.mb-1', 'Errores'),
        U.h('div.col.gap-1', state.answers.map(function (a, i) {
          if (a.correct) return null;
          return U.h('p.tiny.muted', '· ' + a.topic + ': ' + a.explanation);
        }).filter(Boolean))
      ]));

      store.update(function (s) {
        s.ai.knowledge = {
          subjectId: state.subjectId,
          date: U.today(),
          score: pct,
          level: level,
          weak: weakTopics
        };
      });
    }

    m = ui.modal({
      title: 'Test inicial de conocimientos',
      subtitle: '5 preguntas para saber desde dónde partir',
      wide: true,
      body: body,
      onOpen: function (api) { m = api; }
    });
    draw();
    return m;
  }

  /* ---------------- Personalización del robot ---------------- */
  function openSettings() {
    var ai = store.get().ai;
    var nameInput = U.h('input.input', { value: ai.name || 'Luna' });
    var avatarSelect = U.h('div.row.gap-1.row--wrap', AVATARS.map(function (a) {
      var btn = U.h('button.btn.btn--sm' + (ai.avatar === a ? '.btn--soft' : '.btn--ghost'), {
        onclick: function () {
          avatarSelect.querySelectorAll('button').forEach(function (b) { b.className = 'btn btn--sm btn--ghost'; });
          btn.className = 'btn btn--sm btn--soft';
          ai.avatar = a;
        }
      }, a);
      return btn;
    }));
    var toneSelect = U.h('select.select', {}, TONES.map(function (t) {
      var o = U.h('option', { value: t }, t);
      if (ai.tone === t) o.selected = true;
      return o;
    }));
    var langSelect = U.h('select.select', {}, Object.keys(LANGS).map(function (k) {
      var o = U.h('option', { value: k }, LANGS[k]);
      if (ai.lang === k) o.selected = true;
      return o;
    }));

    ui.modal({
      title: 'Personaliza a ' + (ai.name || 'Luna'),
      subtitle: 'El nombre, el tono y el avatar se guardan con tu cuenta.',
      body: U.h('div.col.gap-3', [
        U.h('div.field', [U.h('label.field__label', 'Nombre del robot'), nameInput]),
        U.h('div.field', [U.h('label.field__label', 'Avatar'), avatarSelect]),
        U.h('div.field', [U.h('label.field__label', 'Tono'), toneSelect]),
        U.h('div.field', [U.h('label.field__label', 'Idioma'), langSelect])
      ]),
      actions: [
        { label: 'Cancelar', variant: 'ghost' },
        {
          label: 'Guardar', variant: 'primary', onClick: function () {
            store.update(function (s) {
              s.ai.name = nameInput.value.trim() || 'Luna';
              s.ai.tone = toneSelect.value;
              s.ai.lang = langSelect.value;
            });
            ui.toast('Robot actualizado ✨', 'success');
          }
        }
      ]
    });
  }

  /* ---------------- Render ---------------- */
  function render(root) {
    U.clear(root);
    var ai = store.get().ai;
    var messages = ai.messages || [];

    var chat = U.h('div.chat', { id: 'aiChat' });
    if (!messages.length) {
      chat.appendChild(U.h('div.msg.msg--ai', [
        U.h('div.msg__avatar', ai.avatar || '🤖'),
        U.h('div', [
          U.h('div.msg__bubble', '¡Hola! Soy ' + (ai.name || 'Luna') + ' 🤖\nTengo en cuenta tu calendario, tus tareas y tu racha. ¿Qué te toca hoy?'),
          U.h('div.msg__time', 'Ahora')
        ])
      ]));
    } else {
      messages.forEach(function (m) {
        chat.appendChild(U.h('div.msg.msg--' + (m.role === 'me' ? 'me' : 'ai'), [
          U.h('div.msg__avatar', m.role === 'me' ? (store.get().profile.initials || 'ES') : (ai.avatar || '🤖')),
          U.h('div', [
            U.h('div.msg__bubble', m.text),
            U.h('div.msg__time', new Date(m.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
          ])
        ]));
      });
    }
    setTimeout(function () { chat.scrollTop = chat.scrollHeight; }, 20);

    var input = U.h('textarea', { rows: '1', placeholder: 'Escribe a ' + (ai.name || 'Luna') + '…' });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var v = input.value.trim();
        if (!v) return;
        input.value = '';
        send(v);
      }
    });

    var quick = [
      '¿Qué tengo que estudiar?',
      'Hazme un plan para el próximo examen',
      '¿Cómo va mi progreso?',
      'Resume mis apuntes'
    ];

    root.appendChild(U.h('div.grid.grid--split', { style: { '--split': '330px' } }, [
      U.h('div.card.card--flush', [
        U.h('div.row.row--between.gap-2', { style: { padding: '14px 16px', borderBottom: '1px solid var(--border)' } }, [
          U.h('div.row.gap-2', [
            U.h('div.stat__icon.stat__icon--violet', { style: { width: '36px', height: '36px', fontSize: '1.1rem' } }, ai.avatar || '🤖'),
            U.h('div', [U.h('strong', ai.name || 'Luna'), U.h('p.tiny.soft', 'Asistente de estudio · ' + (ai.tone || 'motivador'))])
          ]),
          U.h('button.btn.btn--ghost.btn--sm', { onclick: function () { store.update(function (s) { s.ai.messages = []; }); } }, 'Limpiar chat')
        ]),
        chat,
        U.h('div.ai-retry', { hidden: !lastFailed }, [
          U.icon('alert'),
          U.h('span', 'Luna no ha podido responder.'),
          U.h('button.btn.btn--soft.btn--sm', {
            onclick: function () { var t = lastFailed; lastFailed = null; if (t) send(t); }
          }, 'Reintentar')
        ]),
        U.h('div.ai-typing-bar', { id: 'aiTypingBar', hidden: true, 'aria-live': 'polite' },
          [U.h('span', (ai.name || 'Luna') + ' está escribiendo…'), U.h('i'), U.h('i'), U.h('i')]),
        U.h('div.quick-prompts', quick.map(function (p) {
          return U.h('button.quick-prompt', { onclick: function () { send(p); } }, p);
        })),
        U.h('div.composer', [
          input,
          U.h('button.btn.btn--primary', { onclick: function () { var v = input.value.trim(); if (!v) return; input.value = ''; send(v); } }, [U.icon('send'), 'Enviar'])
        ])
      ]),
      U.h('div.col.gap-2', [
        U.h('div.card', [
          U.h('div.card__head', [U.h('h3', 'Test inicial'), U.h('span.badge.badge--violet', 'Diagnóstico')]),
          U.h('p.small.muted', 'Responde 5 preguntas por asignatura y te digo desde dónde partir y qué repasar.'),
          U.h('button.btn.btn--soft.btn--sm.btn--block.mt-2', { onclick: openQuiz }, [U.icon('target'), 'Empezar el test'])
        ]),
        ai.knowledge ? U.h('div.card', [
          U.h('div.card__head', [U.h('h3', 'Último diagnóstico')]),
          U.h('div.kv', [U.h('span.kv__k', 'Asignatura'), U.h('span.kv__v', store.subjectName(ai.knowledge.subjectId))]),
          U.h('div.kv', [U.h('span.kv__k', 'Nivel'), U.h('span.kv__v', ai.knowledge.level)]),
          U.h('div.kv', [U.h('span.kv__k', 'Aciertos'), U.h('span.kv__v', ai.knowledge.score + '%')]),
          ai.knowledge.weak && ai.knowledge.weak.length ? U.h('div.mt-2', [
            U.h('p.field__label.mb-1', 'Reforzar'),
            U.h('div.row.gap-1.row--wrap', ai.knowledge.weak.map(function (t) { return U.h('span.badge.badge--rose', t); }))
          ]) : null
        ]) : null,
        U.h('div.card', [
          U.h('div.card__head', [U.h('h3', 'Personaliza tu robot')]),
          U.h('p.small.muted', 'Nombre, avatar, tono e idioma. Luna recuerda el contexto de tu cuenta.'),
          U.h('button.btn.btn--ghost.btn--sm.btn--block.mt-2', { onclick: openSettings }, [U.icon('settings'), 'Configurar'])
        ]),
        U.h('div.card', { style: { background: 'var(--surface-2)' } }, [
          U.h('p.tiny.soft', 'Luna responde con IA real (Groq) si has puesto tu clave en Ajustes; si no, lo hace en el navegador a partir de tus datos, sin conexión.')
        ])
      ])
    ]));
  }

  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'ai') render(main);
    paintChatExtras();
  }

  /* El chat se pinta desde el estado en cada render, pero el aviso de
     reintento y la barra de "escribiendo" son transitorios: hay que
     sincronizarlos tras cada repintado. */
  function paintChatExtras() {
    var retry = document.querySelector('.ai-retry');
    if (retry) retry.hidden = !lastFailed;
    setTyping(!!pending);
  }

  function init() {
    store.subscribe(function () {
      if (Studia.router.current() === 'ai') refresh();
    });
  }

  Studia.ai = {
    engine: function () { return engine; },
    engineName: function () { return engine.name; },
    setEngine: function (next) { engine = next || localEngine; return engine; },
    ask: function (text, opts) { return engine.ask(text, buildContext(), opts); },
    localEngine: localEngine,
    groq: {
      hasKey: function () { return !!groqKey(); },
      models: GROQ_MODELS,
      setKey: function (k) {
        try {
          if (k) global.localStorage.setItem(GROQ_KEY_LS, k.trim());
          else global.localStorage.removeItem(GROQ_KEY_LS);
        } catch (e) { /* sin storage */ }
        applyEngineFromKey();
        return engine.name;
      },
      engine: groqEngine
    }
  };

  Studia.modules = Studia.modules || {};
  Studia.modules.ai = { init: init, render: render, BANK: BANK, reply: reply };
  Studia.router.register('ai', {
    title: 'Luna (IA)',
    subtitle: 'Tu asistente de estudio con memoria de tu progreso',
    render: render
  });
})(window);

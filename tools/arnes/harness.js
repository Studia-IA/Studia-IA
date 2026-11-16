/* =========================================================
   Studia-IA · tools/arnes/harness.js
   Copia el repo a tmp y sustituye el arranque de main.js por un
   stub minimo (chip + init de modulos + router) para poder probar
   el ciclo de vida del pomodoro sin login ni Supabase.
   index.html, core/ y los modulos son los originales del repo.
   Uso: node tools/arnes/harness.js
   ========================================================= */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var REPO = path.resolve(__dirname, '..', '..');
var WWW = process.env.ARNES_WWW || '/tmp/opencode/arnes/www';

var STUB = `
/* ==== stub minimo de main.js para el arnes ==== */
(function (global) {
  'use strict';
  var Studia = global.Studia;
  var store = Studia.store;

  function captureError(kind, message, detail) {
    console.error('[arnes] ' + kind + ':', message, detail || '');
  }
  Studia.captureError = captureError;
  global.addEventListener('error', function (e) { captureError('error', e.message, e.error && e.error.stack); });
  global.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    captureError('unhandledrejection', (r && (r.message || r)) || 'promesa', r && r.stack);
  });

  function mountChip() {
    var actions = document.querySelector('.topbar__actions');
    if (!actions || document.getElementById('timerChip')) return;
    var U = Studia.utils;
    var chip = U.h('div.chip#timerChip', { hidden: true, style: { borderColor: 'var(--brand-200)', background: 'var(--brand-50)', color: 'var(--brand-600)' } }, [
      U.icon('timer'),
      U.h('span', { 'data-timer-time': '' }, '25:00'),
      U.h('span.tiny', { 'data-timer-mode': '' }, 'Enfoque')
    ]);
    chip.addEventListener('click', function () { Studia.router.go('study'); });
    actions.insertBefore(chip, actions.firstChild);
  }

  /* Guardado inmediato: el arnes recarga y cierra pestanas a proposito. */
  var __tracking = false;
  store.subscribe(function () {
    if (__tracking) return;
    __tracking = true;
    setTimeout(function () { __tracking = false; try { store.flush(); } catch (e) {} }, 30);
  });

  function startApp() {
    document.documentElement.setAttribute('data-theme', store.get().settings.theme || 'light');
    mountChip();
    Object.keys(Studia.modules).forEach(function (k) {
      var m = Studia.modules[k];
      if (m && typeof m.init === 'function') {
        try { m.init(); } catch (e) { captureError('init:' + k, e.message, e.stack); }
      }
    });
    Studia.router.start();
    document.body.classList.add('is-ready');
  }

  global.addEventListener('DOMContentLoaded', function () {
    if (global.__CLOCK) global.__CLOCK.start();
    store.load().then(startApp, function (e) {
      captureError('carga', e && e.message, e && e.stack);
      startApp();
    });
  });

  global.__ARNES = { store: store, flush: function () { return store.flush(); } };
})(window);
`;

function build() {
  cp.execSync(
    'rm -rf ' + WWW + ' && mkdir -p ' + WWW + ' && ' +
    'tar -C ' + REPO + ' --exclude=.git --exclude=node_modules --exclude=tools/arnes/www -cf - . | tar -C ' + WWW + ' -xf -'
  );
  var idx = path.join(WWW, 'index.html');
  var html = fs.readFileSync(idx, 'utf8');
  html = html.replace('</head>', '<script src="arnes-sim.js?v=test"></script></head>');
  var marker = '<script src="assets/js/main.js';
  var i = html.indexOf(marker);
  if (i === -1) throw new Error('no se encuentra main.js en index.html');
  var lineEnd = html.indexOf('</script>', i);
  if (lineEnd === -1) throw new Error('script sin cierre');
  html = html.slice(0, i) + '<script src="arnes-stub.js?v=test"></script>' + html.slice(lineEnd + 9);
  fs.writeFileSync(path.join(WWW, 'arnes-stub.js'), STUB);
  fs.writeFileSync(path.join(WWW, 'arnes-sim.js'), fs.readFileSync(path.join(__dirname, 'sim.js')));
  fs.writeFileSync(idx, html);
  console.log('arnes montado en ' + WWW);
}

if (require.main === module) build();
module.exports = { build: build, WWW: WWW };

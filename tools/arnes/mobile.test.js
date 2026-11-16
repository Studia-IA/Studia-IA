/* =========================================================
   Studia-IA · tools/arnes/mobile.test.js
   Prueba movil del pomodoro (Estudio) y de Progreso con viewport
   real de 390 y 360 px: sin scroll horizontal de pagina, sin
   tarjetas desbordadas, el reloj se puede arrancar/pausar/reiniciar
   y la consola queda limpia.
   Requiere: node tools/arnes/serve.js y Google Chrome.
   Uso:
     node tools/arnes/harness.js
     ARNES_ROOT=/tmp/opencode/arnes/www node tools/arnes/serve.js
     node tools/arnes/mobile.test.js
   ========================================================= */
'use strict';
var driver = require('./driver');
var sleep = driver.sleep;

var pass = 0, fail = 0;
var failures = [];

function check(name, cond, info) {
  if (cond) { pass++; console.log('  ok · ' + name); }
  else { fail++; failures.push(name + ' :: ' + JSON.stringify(info)); console.log('  KO · ' + name + ' :: ' + JSON.stringify(info)); }
}

/* Mide la pagina y devuelve los elementos de interes que se salen
   del viewport. Ojo: con `mobile:true` Chrome ensancha `innerWidth` si el
   contenido desborda (viewport de layout), asi que la referencia real es
   `documentElement.clientWidth` / `visualViewport.width`. Los scrollers
   internos (mapa de calor) se miran por su caja, no por su scrollWidth. */
function layoutExpr() {
  return '(function(){' +
    'var vw = document.documentElement.clientWidth;' +
    'var out = {vw: vw, visual: window.visualViewport ? Math.round(window.visualViewport.width) : 0, page: document.documentElement.scrollWidth, main: 0, bad: []};' +
    'var main = document.getElementById("appMain");' +
    'if (main) out.main = main.scrollWidth;' +
    'var sel = "#appMain .card, #appMain .timer, #appMain .timer__mode-tabs, #appMain .chart, #appMain .heat, #appMain .pomo-sessions, #appMain .timer-chip, #appMain .goal, #appMain .kpi, #appMain table";' +
    'Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {' +
    '  var r = el.getBoundingClientRect();' +
    '  if (!r.width) return;' +
    '  if (r.right > vw + 1 || r.left < -1) out.bad.push((el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || el.tagName) + " " + Math.round(r.left) + ".." + Math.round(r.right));' +
    '});' +
    'return JSON.stringify(out);' +
  '})()';
}

function layout(h) {
  return h.eval_(layoutExpr()).then(JSON.parse);
}

function clickStart(h) {
  return h.eval_('(function(){' +
    'var b = Array.prototype.filter.call(document.querySelectorAll("#appMain button"), function (x) {' +
    '  return /^(Empezar|Continuar)$/.test((x.textContent || "").trim());' +
    '})[0];' +
    'if (!b) return "sin-boton";' +
    'b.click();' +
    'return "ok";' +
  '})()');
}

function probe(h, width, view, tag) {
  return h.eval_("location.hash = '#/" + view + "'")
    .then(function () { return sleep(500); })
    .then(function () { return layout(h); })
    .then(function (l) {
      check(tag + ' · viewport real ' + width + ' px', l.vw === width, l);
      check(tag + ' · sin scroll horizontal de pagina', l.page <= width + 1, l);
      check(tag + ' · el contenido cabe en el viewport', l.main <= width + 1, l);
      check(tag + ' · ningun elemento se sale', l.bad.length === 0, l.bad);
      return l;
    });
}

function runWidth(width) {
  var h = new driver.Harness('movil-' + width);
  return h.start({ width: width })
    .then(function () { return probe(h, width, 'study', 'Estudio ' + width); })
    .then(function () { return clickStart(h); })
    .then(function (r) {
      check('Estudio ' + width + ' · el boton Empezar existe', r === 'ok', r);
      return sleep(1200);
    })
    .then(function () { return h.timer(); })
    .then(function (t) {
      check('Estudio ' + width + ' · el reloj arranca', t.running === true && t.remaining < t.total, t);
      return probe(h, width, 'study', 'Estudio ' + width + ' (en marcha)');
    })
    .then(function () { return h.eval_('Studia.modules.study.pause()'); })
    .then(function () { return h.timer(); })
    .then(function (p) {
      check('Estudio ' + width + ' · pausar responde', p.running === false && p.remaining > 0, p);
      return h.eval_('Studia.modules.study.reset()');
    })
    .then(function () { return h.timer(); })
    .then(function (r) {
      check('Estudio ' + width + ' · resetear vuelve al total', r.remaining === r.total && !r.running, r);
      return probe(h, width, 'progress', 'Progreso ' + width);
    })
    .then(function () {
      check('consola limpia en ' + width + ' px', h.pageErrors.length === 0 && h.errors.length === 0 && h.netFailures.length === 0,
        { pe: h.pageErrors, er: h.errors, net: h.netFailures });
      return h.stop('movil-' + width);
    });
}

runWidth(390)
  .then(function () { return runWidth(360); })
  .then(function () {
    console.log('\n== resultado: ' + pass + ' ok, ' + fail + ' ko ==');
    process.exit(fail ? 1 : 0);
  })
  .catch(function (e) {
    console.error('\nERROR: ' + e.message);
    process.exit(1);
  });

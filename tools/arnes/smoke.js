/* Humo del arnes: abre la vista, corre el reloj acelerado, recarga y
   comprueba visibilidad. node tools/arnes/smoke.js */
'use strict';
var driver = require('./driver');
var Harness = driver.Harness;
var sleep = driver.sleep;

new Harness('humo').start().then(function (h) {
  return h.timer().then(function (t) { console.log('timer:', JSON.stringify(t)); })
    .then(function () { return h.saved(); })
    .then(function (s) { console.log('sesiones guardadas:', s && s.sessions); })
    .then(function () { return h.eval_('Studia.router.current()'); })
    .then(function (r) { console.log('ruta:', r); })
    .then(function () { return h.eval_('Studia.modules.study.start()'); })
    .then(function () { return h.eval_('__CLOCK.speed(600)'); })
    .then(function () { return sleep(3000); })
    .then(function () { return h.timer(); })
    .then(function (t) { console.log('x600 tras 3s:', JSON.stringify(t)); })
    .then(function () { return h.eval_('__CLOCK.speed(1)'); })
    .then(function () { return h.reload(); })
    .then(function () { return h.timer(); })
    .then(function (t) { console.log('tras reload:', JSON.stringify(t)); })
    .then(function () { return h.setVisible(false); })
    .then(function () { return sleep(200); })
    .then(function () { return h.setVisible(true); })
    .then(function () { return sleep(300); })
    .then(function () { return h.timer(); })
    .then(function (t) { console.log('tras visibilidad:', JSON.stringify(t)); })
    .then(function () { return h.stop('humo'); })
    .then(function (out) { console.log('pageErrors:', JSON.stringify(out.pageErrors)); process.exit(0); });
}).catch(function (e) { console.error('FALLO HUMO:', e.message); process.exit(1); });

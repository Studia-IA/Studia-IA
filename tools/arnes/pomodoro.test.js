/* =========================================================
   Studia-IA · tools/arnes/pomodoro.test.js
   Pruebas del pomodoro con reloj acelerado: ciclo completo,
   autoBreak, recargar en marcha, pestana oculta, descansar con
   la app cerrada, pausar/resetear y cambios de ajustes.
   Requiere: node tools/arnes/serve.js y Google Chrome.
   Uso:
     node tools/arnes/harness.js
     ARNES_ROOT=/tmp/opencode/arnes/www node tools/arnes/serve.js
     node tools/arnes/pomodoro.test.js
   ========================================================= */
'use strict';
var driver = require('./driver');
var Harness = driver.Harness;
var sleep = driver.sleep;
var setupConfigExpr = driver.setupConfigExpr;

var pass = 0, fail = 0;
var failures = [];

function check(name, cond, info) {
  if (cond) { pass++; console.log('  ok · ' + name); }
  else { fail++; failures.push(name + ' :: ' + JSON.stringify(info)); console.log('  KO · ' + name + ' :: ' + JSON.stringify(info)); }
}

  /* Reloj real y guardados al dia: Page.reload se hace con la pagina oculta
     y Chrome la congela (throttling), lo que falsea las pruebas de
     temporizacion. Con --disable-backgrounding-occluded-windows y el estado
     de ventana normal, el timer sigue corriendo mientras "ocultamos" la
     pestana via document.visibilityState. */
  function fresh(cfg, opts) {
    var h = new Harness();
    return h.start(Object.assign({
      chromeArgs: [
        '--disable-backgrounding-occluded-windows',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding'
      ]
    }, opts || {})).then(function () {
      if (!cfg) return h;
      /* Datos limpios de verdad: reset() revive el seed, asi que despues se
         deja la cuenta en blanco (perfil onboarded para saltar el asistente). */
      return h.eval_('localStorage.clear()')
        .then(function () { return h.eval_('Studia.store.reset()'); })
        .then(function () { return h.eval_('Studia.store.startFresh()'); })
        .then(function () { return h.eval_("Studia.store.update(function(s){ s.profile.onboarded = true; });"); })
        .then(function () { return h.eval_(setupConfigExpr(cfg)); })
        .then(function () { return h.eval_('Studia.store.flush()'); })
        .then(function () { return h.reload(); })
        .then(function () { return h; });
    });
  }

/* Espera hasta que se cumpla una condicion sobre el timer. */
Harness.prototype.waitTimer = function (fnBody, timeoutMs) {
  var self = this;
  var t0 = Date.now();
  function poll() {
    return self.timer().then(function (t) {
      if (new Function('t', 'return (' + fnBody + ')')(t)) return t;
      if (Date.now() - t0 > (timeoutMs || 15000)) return null;
      return sleep(120).then(poll);
    });
  }
  return poll();
};

/* Recarga con la pestana oculta (caso real: recargar con la app en segundo
   plano). Devuelve el timer ya con la pestana visible otra vez. */
Harness.prototype.reloadHidden = function () {
  var self = this;
  return this.eval_("document.body.classList.remove('is-ready');Object.defineProperty(document,'visibilityState',{configurable:true,get:function(){return 'hidden';}});Object.defineProperty(document,'hidden',{configurable:true,get:function(){return true;}});Studia.store.flush();setTimeout(function(){location.reload();},80);")
    .then(function () { return self.waitForApp(); })
    .then(function () { return self.setVisible(true); })
    .then(function () { return sleep(300); })
    .then(function () { return self.timer(); });
};

(function run() {
  var tests = [];

  function test(name, fn) { tests.push({ name: name, fn: fn }); }

  /* ---------- T1 ---------- */
  test('T1 · enfoque -> descanso con autoBreak por defecto', function () {
    return fresh({ work: 5, short: 1, long: 1, cycle: 2 }).then(function (h) {
      return h.eval_('__CLOCK.speed(600)')
        .then(function () { return h.eval_('Studia.modules.study.start()'); })
        .then(function () { return h.waitTimer('t.mode==="short"'); })
        .then(function (a) {
          check('al acabar el enfoque pasa a descanso', !!a && a.mode === 'short', a);
          check('el descanso arranca solo', !!a && a.running === true, a);
          return h.saved().then(function (s) {
            check('la sesion de estudio se guarda', s && s.sessions >= 1, s);
            return h.waitTimer('t.mode==="work"').then(function (b) {
              check('al acabar el descanso vuelve a enfoque', !!b && b.mode === 'work', b);
              check('y se queda preparado sin arrancar', !!b && b.running === false, b);
              check('sin errores de consola', h.pageErrors.length === 0 && h.errors.length === 0, { pe: h.pageErrors, er: h.errors });
              return h.stop('T1');
            });
          });
        });
    });
  });

  /* ---------- T2 ---------- */
  test('T2 · autoBreak desactivado: el descanso espera el clic', function () {
    return fresh({ work: 5, short: 1, long: 1, cycle: 2, autoBreak: false }).then(function (h) {
      return h.eval_('__CLOCK.speed(600)')
        .then(function () { return h.eval_('Studia.modules.study.start()'); })
        .then(function () { return h.waitTimer('t.mode==="short"'); })
        .then(function (a) {
          check('pasa a descanso', !!a && a.mode === 'short', a);
          check('el descanso NO arranca solo', !!a && a.running === false, a);
          return h.eval_('Studia.modules.study.start()')
            .then(function () { return h.waitTimer('t.mode==="work"'); })
            .then(function (b) {
              check('al arrancarlo, el descanso acaba y vuelve a enfoque', !!b && b.mode === 'work', b);
              return h.stop('T2');
            });
        });
    });
  });

  /* ---------- T3 ---------- */
  /* Reloj real: la recarga reinicia el reloj simulado. Con enfoque de 30
     min, recargar tras 60 s reales conserva la ronda. */
  test('T3 · recargar a mitad de enfoque', function () {
    return fresh({ work: 30, short: 5, long: 10, cycle: 4 }).then(function (h) {
      return h.eval_('Studia.modules.study.start()')
        .then(function () { return sleep(1500); })
        .then(function () { return h.timer(); })
        .then(function (before) {
          /* Recarga con la pestana OCULTA de verdad: es el caso real de
             recargar con la app en otra pestana. */
          return h.reloadHidden().then(function (after) {
            check('continua corriendo', after.running === true, after);
            check('mantiene el modo enfoque', after.mode === 'work', after);
            var lost = before.remaining - after.remaining;
            check('el tiempo avanzado se conserva', lost >= 0 && lost <= 30, { b: before.remaining, a: after.remaining, lost: lost });
            return h.saved().then(function (s) {
              check('no cuenta sesiones de mas al recargar', s.sessions === 0, s);
              return h.eval_('Studia.modules.study.pause()')
                .then(function () { return h.timer(); })
                .then(function (p) {
                  check('pausar funciona tras recargar', p.running === false && p.remaining > 0, p);
                  return h.eval_('Studia.modules.study.reset()')
                    .then(function () { return h.timer(); })
                    .then(function (r) {
                      check('resetear vuelve al total', r.remaining === r.total && r.running === false, r);
                      check('sin errores de consola', h.pageErrors.length === 0 && h.errors.length === 0, { pe: h.pageErrors, er: h.errors });
                      return h.stop('T3');
                    });
                });
            });
          });
        });
    });
  });

  /* ---------- T4 ---------- */
  /* Con reloj simulado no se puede: la recarga lo reinicia y la ronda
     "vencida" de verdad se cerraria al volver. Con reloj real y descanso
     de 2 min, tras 60 s de descanso la recarga no debe crear sesiones. */
  test('T4 · recargar con descanso en marcha no crea sesiones fantasma', function () {
    return fresh({ work: 5, short: 2, long: 2, cycle: 2 }).then(function (h) {
      return h.eval_('__CLOCK.speed(600)')
        .then(function () { return h.eval_('Studia.modules.study.start()'); })
        .then(function () { return h.waitTimer('t.mode==="short" && t.running'); })
        .then(function (b) {
          check('descanso en marcha', !!b, b);
          return h.eval_('__CLOCK.speed(1)')
            .then(function () { return h.saved(); })
            .then(function (s0) {
              return h.reloadHidden().then(function () { return h.saved(); }).then(function (s1) {
                check('recargar no crea sesiones fantasma', s1.sessions === s0.sessions, { s0: s0.sessions, s1: s1.sessions });
                return h.timer().then(function (t) {
                  check('el descanso continua tras la recarga', t.mode === 'short' && t.running === true, t);
                  return h.stop('T4');
                });
              });
            });
        });
    });
  });

  /* ---------- T5 ---------- */
  test('T5 · pestana oculta durante el descanso (autoBreak activo)', function () {
    return fresh({ work: 5, short: 1, long: 1, cycle: 2 }).then(function (h) {
      return h.eval_('__CLOCK.speed(600)')
        .then(function () { return h.eval_('Studia.modules.study.start()'); })
        .then(function () { return sleep(800); })
        .then(function () { return h.setVisible(false); })
        .then(function () { return h.timer(); })
        .then(function (hidden) {
          check('al ocultar, el descanso queda guardado', !!hidden, hidden);
          return sleep(2500)
            .then(function () { return h.setVisible(true); })
            .then(function () { return sleep(600); })
            .then(function () { return h.saved(); })
            .then(function (ses) {
              return h.timer().then(function (back) {
                check('al volver no se cuenta una sesion falsa', ses.sessions <= 1, { ses: ses.sessions, back: back });
                check('vuelve a modo enfoque preparado', back.mode === 'work', back);
                check('sin errores de consola', h.pageErrors.length === 0 && h.errors.length === 0, { pe: h.pageErrors, er: h.errors });
                return h.stop('T5');
              });
            });
        });
    });
  });

  /* ---------- T6 ---------- */
  /* Reloj real con duraciones cortas (los ajustes aceptan fracciones de
     minuto por API): el reloj simulado no sobrevive a una navegacion.
     "Cerrar la app" = ocultar y recargar durante el descanso. */
  test('T6 · cerrar la app durante el descanso y volver despues', function () {
    return fresh({ work: 0.05, short: 5 / 60, long: 5 / 60, cycle: 2 }).then(function (h) {
      return h.eval_('Studia.modules.study.start()')
        .then(function () { return h.waitTimer('t.mode==="short" && t.running'); })
        .then(function (b) {
          check('descanso en marcha', !!b, b);
          return h.saved().then(function (s0) {
            var base = s0.sessions;
            return h.setVisible(false)
              .then(function () { return sleep(300); })
              .then(function () { return h.eval_('location.reload()'); })
              .then(function () { return sleep(600); })
              .then(function () { return h.waitForApp(); })
              .then(function () { return h.saved(); })
              .then(function (s1) {
                check('con la app en segundo plano no suma sesiones', s1.sessions === base, { s0: base, s1: s1.sessions });
                return sleep(5500)                        /* el descanso vence fuera */
                  .then(function () { return h.setVisible(true); })
                  .then(function () { return sleep(400); })
                  .then(function () { return h.saved(); })
                  .then(function (s2) {
                    check('y al volver a visible tampoco', s2.sessions === base, { s0: base, s2: s2.sessions });
                    return h.timer().then(function (t) {
                      check('el descanso vencido se cierra y queda enfoque preparado', t.mode === 'work' && !t.running, t);
                      return h.stop('T6');
                    });
                  });
              });
          });
        });
    });
  });

  /* ---------- T7 ---------- */
  test('T7 · pausar y recargar', function () {
    return fresh({ work: 30, short: 5, long: 10, cycle: 4 }).then(function (h) {
      return h.eval_('Studia.modules.study.start()')
        .then(function () { return sleep(600); })
        .then(function () { return h.eval_('Studia.modules.study.pause()'); })
        .then(function () { return h.timer(); })
        .then(function (p) {
          return h.reload().then(function () { return h.timer(); }).then(function (a) {
            check('tras recargar sigue parado', a.running === false, a);
            check('mantiene el tiempo pausado', Math.abs(a.remaining - p.remaining) <= 2, { p: p.remaining, a: a.remaining });
            return h.stop('T7');
          });
        });
    });
  });

  /* ---------- T8 ---------- */
  /* Reloj real: la recarga reinicia el simulado. */
  test('T8 · cambiar los minutos con el reloj corriendo', function () {
    return fresh({ work: 30, short: 5, long: 10, cycle: 4 }).then(function (h) {
      return h.eval_('Studia.modules.study.start()')
        .then(function () { return sleep(500); })
        .then(function () { return h.eval_(setupConfigExpr({ work: 10 })); })
        .then(function () { return h.timer(); })
        .then(function (t) {
          /* La ronda en marcha conserva su total: no se reinicia lo
             estudiado; el nuevo valor aplica a la siguiente ronda. */
          check('la ronda en marcha conserva su total', t.remaining <= t.total && t.total === 1800 && t.running === true, t);
          return h.reloadHidden().then(function () { return h.timer(); }).then(function (r) {
            check('tras recargar sigue corriendo con su total', r.total === 1800 && r.running === true && r.remaining <= r.total, r);
            return h.stop('T8');
          });
        });
    });
  });

  /* ---------- T9: ocultar la pestana a mitad de enfoque ---------- */
  /* Ocultar no reinicia el reloj simulado: el tiempo real (simulado) corre
     y el reloj congelado no se gasta. Enfoque de 5 min x600 = 30 s
     simulados/segundo real, así que 1 s real ya se come la ronda: hay que
     ocultar a los 300 ms. */
  test('T9 · ocultar la pestana a mitad de enfoque: sigue el tiempo real', function () {
    return fresh({ work: 5, short: 30, long: 30, cycle: 2 }).then(function (h) {
      return h.eval_('__CLOCK.speed(600)')
        .then(function () { return h.eval_('Studia.modules.study.start()'); })
        .then(function () { return sleep(300); })
        .then(function () { return h.setVisible(false); })
        .then(function () { return h.saved(); })
        .then(function (s) {
          check('guarda la ronda congelada con su endAt', s && s.running === false && !!s.endAt, s);
          return sleep(1500)                                   // el enfoque vence en segundo plano
            .then(function () { return h.setVisible(true); })
            .then(function () { return sleep(300); })
            .then(function () { return h.timer(); })
            .then(function (t) {
              check('al volver, el enfoque cerrado pasa a descanso', t.mode === 'short', t);
              return h.saved().then(function (s2) {
                check('y se guarda UNA sola sesion', s2.sessions === 1, s2);
                return h.stop('T9');
              });
            });
        });
    });
  });

  /* ---------- T10: cerrar la app a mitad de ENFOQUE ---------- */
  /* Reloj real con ronda de 3 s (0.05 min): se oculta a mitad, se deja
     vencer fuera y se recarga. Al volver debe contar UNA sola sesion y
     pasar a descanso sin consumirlo dos veces. */
  test('T10 · cerrar la app a mitad de enfoque y volver', function () {
    return fresh({ work: 0.05, short: 5 / 60, long: 5 / 60, cycle: 2 }).then(function (h) {
      return h.eval_('Studia.modules.study.start()')
        .then(function () { return sleep(500); })           // ronda de 3 s, aun en marcha
        .then(function () { return h.setVisible(false); })  // "cerrar": congela
        .then(function () { return sleep(3200); })          // vence con la app cerrada
        .then(function () { return h.eval_('location.reload()'); })
        .then(function () { return sleep(600); })
        .then(function () { return h.waitForApp(); })
        .then(function () { return h.saved(); })
        .then(function (s) {
          check('al volver se guarda la sesion vencida UNA vez', s.sessions === 1, s);
          return h.timer().then(function (t) {
            check('y pasa a descanso', t.mode === 'short', t);
            return h.setVisible(true)
              .then(function () { return sleep(300); })
              .then(function () { return h.saved(); })
              .then(function (s1) {
                check('volver a visible no duplica la sesion', s1.sessions === 1, s1);
                return h.timer().then(function (t2) {
                  check('el descanso sigue disponible', t2.mode === 'short', t2);
                  return h.stop('T10');
                });
              });
          });
        });
    });
  });

  var i = 0;
  function next() {
    if (i >= tests.length) {
      console.log('\n== resultado: ' + pass + ' ok, ' + fail + ' ko ==');
      if (failures.length) console.log(failures.join('\n'));
      process.exit(fail ? 1 : 0);
      return;
    }
    var t = tests[i++];
    console.log('\n' + t.name);
    Promise.resolve().then(t.fn).catch(function (e) {
      fail++;
      failures.push(t.name + ' :: ' + e.message);
      console.log('  KO · ' + t.name + ' -> ' + e.message);
    }).then(next);
  }

  if (require.main === module) next();
  else module.exports = { run: next, tests: tests };
})();

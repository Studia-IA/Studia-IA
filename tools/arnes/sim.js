/* Reloj simulado: se instala ANTES del DOMContentLoaded (script en el head
   del HTML del arnes). Date.now y performance.now se sustituyen de forma
   coherente entre si; `new Date(x)` sigue siendo nativo, asi que toISO() y
   cia. funcionan. Las pruebas que recargan usan tiempo real (el reloj
   simulado no sobrevive a una navegacion). */
(function (global) {
  'use strict';
  var sim = { rate: 1, base: 0, lastReal: 0 };
  var perfRaw = performance.now.bind(performance);
  var realNow = Date.now.bind(Date);
  var realOrigin = realNow();
  function simNow() {
    var r = perfRaw();
    var t = sim.base + (r - sim.lastReal) * sim.rate;
    sim.lastReal = r; sim.base = t;
    return t;
  }
  performance.now = simNow;
  Date.now = function () { return realOrigin + Math.round(simNow()); };
  global.__CLOCK = {
    start: function () { sim.rate = 1; sim.base = 0; sim.lastReal = perfRaw(); },
    speed: function (x) { simNow(); sim.rate = x; },
    skip: function (ms) { simNow(); sim.base += ms; },
    now: function () { return realOrigin + Math.round(simNow()); }
  };
  global.addEventListener('DOMContentLoaded', function () { global.__CLOCK.start(); });
})(window);

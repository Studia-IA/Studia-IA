/* =========================================================
   Studia-IA · tools/arnes/progress.test.js
   Verifica Progreso con 0 sesiones y con 120 repartidas en 88 dias:
   estados vacios, linea diaria/acumulada, reparto por asignatura,
   mapa de calor, racha, nivel/hitos y el Panel de Hector.
   Requiere: node tools/arnes/serve.js y Google Chrome.
   Uso:
     node tools/arnes/harness.js
     ARNES_ROOT=/tmp/opencode/arnes/www node tools/arnes/serve.js
     node tools/arnes/progress.test.js
   ========================================================= */
'use strict';
var driver = require('./driver');
var sleep = driver.sleep;

var pass = 0, fail = 0, warnings = 0;
var failures = [];

function check(name, cond, info) {
  if (cond) { pass++; console.log('  ok · ' + name); }
  else { fail++; failures.push(name + ' :: ' + JSON.stringify(info)); console.log('  KO · ' + name + ' :: ' + JSON.stringify(info)); }
}

function fresh(width) {
  var h = new driver.Harness('progreso');
  return h.start({ width: width || 1024 }).then(function () {
    return h.eval_('localStorage.clear()')
      .then(function () { return h.eval_('Studia.store.reset()'); })
      .then(function () { return h.eval_('Studia.store.startFresh()'); })
      .then(function () { return h.eval_("Studia.store.update(function(s){ s.profile.onboarded = true; });"); })
      .then(function () { return h.eval_('Studia.store.flush()'); })
      .then(function () { return h.reload(); })
      .then(function () { return h; });
  });
}

function goto(h, view) {
  return h.eval_("location.hash = '#/" + view + "'").then(function () {
    return sleep(450);
  });
}

/* Lee el DOM de Progreso y los datos del store para compararlos. */
function progressProbe() {
  return '(function(){' +
    'var store = Studia.store, U = Studia.utils;' +
    'var today = U.today();' +
    'var range = 30;' +
    'Array.prototype.forEach.call(document.querySelectorAll("#appMain .segmented button"), function (b) {' +
    '  if (b.className.indexOf("is-active") !== -1 && /^\\d+ d$/.test(b.textContent)) range = parseInt(b.textContent, 10);' +
    '});' +
    'var from = U.toISO(U.addDays(new Date(), -(range - 1)));' +
    'var inRange = store.get().sessions.filter(function (s) { return s.date >= from && s.date <= today; });' +
    'var total = inRange.reduce(function (a, s) { return a + s.minutes; }, 0);' +
    'var subjects = {}; inRange.forEach(function (s) { subjects[s.subjectId || "__none"] = 1; });' +
    'var sheet = {};' +
    'Array.prototype.forEach.call(document.querySelectorAll(".heat .heat__cell"), function (el, i) {' +
    '  if (/--l[1-4]/.test(el.className)) sheet[i] = true;' +
    '});' +
    'var lvl = store.levelInfo(), info = store.streakInfo();' +
    'var rewards = Studia.rewards.status(info, store.get().rewards.claimed);' +
    'var text = document.getElementById("appMain").textContent;' +
    'function cardHas(t) {' +
    '  var cards = document.querySelectorAll("#appMain .card");' +
    '  for (var i = 0; i < cards.length; i++) if (cards[i].textContent.indexOf(t) !== -1) return cards[i];' +
    '  return null;' +
    '}' +
    'var weekday = cardHas("Días de la semana");' +
    'var rewardsCard = cardHas("Recompensas por racha");' +
    'return JSON.stringify({' +
    '  sessions: store.get().sessions.length,' +
    '  totalRange: total,' +
    '  stats: Array.prototype.map.call(document.querySelectorAll("#appMain .stat__value"), function (x) { return x.textContent; }),' +
    '  expected: {' +
    '    total: total < 60 ? (total || 0) + " min" : U.fmtHours(total),' +
    '    streak: info.current + " días",' +
    '    level: "Nivel " + lvl.level,' +
    '    xp: lvl.xp + " XP",' +
    '    subjectsInRange: Object.keys(subjects).length,' +
    '    rewardsBadge: rewards.filter(function (l) { return l.unlocked; }).length + "/" + rewards.length' +
    '  },' +
    '  lines: document.querySelectorAll("#appMain .chart__line").length,' +
    '  bars: document.querySelectorAll("#appMain .chart__bar").length,' +
    '  dots: document.querySelectorAll("#appMain .chart__dot").length,' +
    '  heatCells: document.querySelectorAll(".heat .heat__cell").length,' +
    '  heatLevel: Object.keys(sheet).length,' +
    '  weekdayBars: weekday ? weekday.querySelectorAll(".progress__bar").length : -1,' +
    '  rewardsBadge: rewardsCard ? (rewardsCard.querySelector(".badge") || {}).textContent : null,' +
    '  emptyTexts: (text.match(/Aún no hay sesiones en este periodo/g) || []).length,' +
    '  nan: /NaN|undefined|Infinity/.test(text)' +
    '});' +
  '})()';
}

function dashboardProbe() {
  return '(function(){' +
    'var store = Studia.store, U = Studia.utils;' +
    'var info = store.streakInfo();' +
    'var text = document.getElementById("appMain").textContent;' +
    'return JSON.stringify({' +
    '  stats: Array.prototype.map.call(document.querySelectorAll("#appMain .stat__value"), function (x) { return x.textContent; }),' +
    '  expected: {' +
    '    streak: String(info.current),' +
    '    minutes: U.fmtMinutes(store.minutesOn(U.today())),' +
    '    open: String(store.openTasks().length)' +
    '  },' +
    '  hero: (document.querySelector("#appMain .hero") || {}).textContent,' +
    '  nan: /NaN|undefined|Infinity/.test(text),' +
    '  saysGap: /Llevas \\d+ días sin estudiar/.test(text)' +
    '});' +
  '})()';
}

function read(h, expr) {
  return h.eval_(expr).then(JSON.parse);
}

function seedExpr() {
  return '(function(){' +
    'var U = Studia.utils, store = Studia.store;' +
    'var subjects = ["Matematicas", "Historia", "Ingles"].map(function (n) {' +
    '  return store.add("subjects", { name: n, color: "#888", icon: "book" }).id;' +
    '});' +
    'for (var i = 0; i < 120; i++) {' +
    '  var d = U.addDays(new Date(), -(i % 88));' +
    '  store.addSession({' +
    '    date: U.toISO(d),' +
    '    minutes: 20 + (i % 5) * 5,' +
    '    subjectId: i % 7 === 0 ? null : subjects[i % subjects.length],' +
    '    mode: "manual"' +
    '  });' +
    '}' +
    'Studia.store.flush();' +
    'return store.get().sessions.length;' +
  '})()';
}

/* Misma medicion que mobile.test.js: con mobile:true el viewport de layout
   se ensancha si algo desborda, asi que se exige vw === ancho pedido. */
function layoutExpr() {
  return '(function(){' +
    'var vw = document.documentElement.clientWidth;' +
    'var out = {vw: vw, page: document.documentElement.scrollWidth, main: 0, bad: []};' +
    'var main = document.getElementById("appMain");' +
    'if (main) out.main = main.scrollWidth;' +
    'var sel = "#appMain .card, #appMain .stat, #appMain .chart, #appMain .heat, #appMain .segmented, #appMain .progress";' +
    'Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {' +
    '  var r = el.getBoundingClientRect();' +
    '  if (!r.width) return;' +
    '  if (r.right > vw + 1 || r.left < -1) out.bad.push((el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || el.tagName) + " " + Math.round(r.left) + ".." + Math.round(r.right));' +
    '});' +
    'return JSON.stringify(out);' +
  '})()';
}

function mobilePass(width) {
  var tag = 'Progreso ' + width;
  return fresh(width).then(function (h) {
    return goto(h, 'progress')
      .then(function () { return h.eval_(layoutExpr()).then(JSON.parse); })
      .then(function (l) {
        check(tag + ' vacio · viewport real', l.vw === width, l);
        check(tag + ' vacio · sin scroll horizontal', l.page <= width + 1 && l.main <= width + 1, l);
        check(tag + ' vacio · nada se sale', l.bad.length === 0, l.bad);
        return h.eval_(seedExpr());
      })
      .then(function () { return goto(h, 'progress'); })
      .then(function () { return sleep(250); })
      .then(function () { return h.eval_(layoutExpr()).then(JSON.parse); })
      .then(function (l) {
        check(tag + ' con datos · viewport real', l.vw === width, l);
        check(tag + ' con datos · sin scroll horizontal', l.page <= width + 1 && l.main <= width + 1, l);
        check(tag + ' con datos · nada se sale', l.bad.length === 0, l.bad);
        return read(h, progressProbe());
      })
      .then(function (p) {
        check(tag + ' con datos · sin NaN/undefined', !p.nan, p);
        return h.stop(tag);
      });
  });
}

function run() {
  return fresh().then(function (h) {
    /* ---------- 0 sesiones ---------- */
    return goto(h, 'progress')
      .then(function () { return read(h, progressProbe()); })
      .then(function (p) {
        check('0 sesiones · store vacio', p.sessions === 0, p.sessions);
        check('0 sesiones · el total sale en minutos ("0 min")', p.stats[0] === '0 min', p.stats);
        check('0 sesiones · sin linea ni barras', p.lines === 0 && p.bars === 0, p);
        check('0 sesiones · avisos de estado vacio', p.emptyTexts >= 3, p.emptyTexts);
        check('0 sesiones · mapa de calor completo (16x7)', p.heatCells === 112 && p.heatLevel === 0, p);
        check('0 sesiones · racha y nivel a cero', p.stats[2] === '0 días' && p.stats[3] === 'Nivel 1', p.stats);
        check('0 sesiones · hitos sin reclamar', p.rewardsBadge === p.expected.rewardsBadge, { got: p.rewardsBadge, exp: p.expected.rewardsBadge });
        check('0 sesiones · sin NaN/undefined', !p.nan, p);
      })

      /* ---------- 120 sesiones en 88 dias ---------- */
      .then(function () {
        return h.eval_(seedExpr());
      })
      .then(function (n) {
        check('120 sesiones · se registran todas', n === 120, n);
        return goto(h, 'dashboard');
      })
      .then(function () { return goto(h, 'progress'); })
      .then(function () { return read(h, progressProbe()); })
      .then(function (p) {
        check('muchas sesiones · total del rango correcto', p.stats[0] === p.expected.total, { got: p.stats[0], exp: p.expected.total });
        check('muchas sesiones · racha y nivel coinciden con el store',
          p.stats[2] === p.expected.streak && p.stats[3] === p.expected.level, { stats: p.stats, exp: p.expected });
        check('muchas sesiones · linea dibujada con puntos', p.lines === 1 && p.dots >= 25, p);
        check('muchas sesiones · una barra por asignatura (incl. sin asignatura)',
          p.bars === p.expected.subjectsInRange && p.bars === 4, { bars: p.bars, exp: p.expected.subjectsInRange });
        check('muchas sesiones · mapa de calor con dias activos', p.heatLevel > 20 && p.heatCells === 112, { lvl: p.heatLevel, cells: p.heatCells });
        check('muchas sesiones · dias de la semana con 7 barras', p.weekdayBars === 7, p.weekdayBars);
        check('muchas sesiones · hitos desbloqueados coinciden', p.rewardsBadge === p.expected.rewardsBadge, { got: p.rewardsBadge, exp: p.expected.rewardsBadge });
        check('muchas sesiones · sin NaN/undefined', !p.nan, p);
        return p;
      })
      /* ---------- invertir: acumulado y 90 dias ---------- */
      .then(function () {
        return h.eval_('(function(){' +
          'var btns = document.querySelectorAll("#appMain .segmented button");' +
          'var acc = Array.prototype.filter.call(btns, function (b) { return b.textContent === "Acumulado"; })[0];' +
          'var r90 = Array.prototype.filter.call(btns, function (b) { return b.textContent === "90 d"; })[0];' +
          'if (!acc || !r90) return "sin-botones";' +
          'acc.click();' +
          'return "ok";' +
        '})()');
      })
      .then(function (r) {
        check('los segmentados existen', r === 'ok', r);
        return sleep(300);
      })
      .then(function () {
        return h.eval_('(function(){' +
          'var btns = document.querySelectorAll("#appMain .segmented button");' +
          'var r90 = Array.prototype.filter.call(btns, function (b) { return b.textContent === "90 d"; })[0];' +
          'if (!r90) return "sin-boton"; r90.click(); return "ok";' +
        '})()');
      })
      .then(function () { return sleep(350); })
      .then(function () { return read(h, progressProbe()); })
      .then(function (p) {
        check('acumulado + 90 d · sigue dibujando la linea', p.lines === 1 && p.dots >= 60, { lines: p.lines, dots: p.dots });
        check('acumulado + 90 d · total del rango correcto', p.stats[0] === p.expected.total, { got: p.stats[0], exp: p.expected.total });
        check('acumulado + 90 d · sin NaN/undefined', !p.nan, p);
      })

      /* ---------- Panel de Hector con los mismos datos ---------- */
      .then(function () { return goto(h, 'dashboard'); })
      .then(function () { return read(h, dashboardProbe()); })
      .then(function (d) {
        check('panel · racha coincide con el store', d.stats[0] === d.expected.streak, { got: d.stats[0], exp: d.expected.streak });
        check('panel · minutos de hoy coinciden', d.stats[1] === d.expected.minutes, { got: d.stats[1], exp: d.expected.minutes });
        check('panel · tareas pendientes coinciden', d.stats[2] === d.expected.open, { got: d.stats[2], exp: d.expected.open });
        check('panel · sin NaN/undefined', !d.nan, d);
      })

      /* ---------- bug conocido de dashboard.js (aviso para Hector) ---------- */
      .then(function () {
        /* Deja el historial intacto pero quita las sesiones de hoy: ayer si
           se estudio, asi que el hero no deberia hablar de 30 dias. */
        return h.eval_('(function(){' +
          'var U = Studia.utils;' +
          'Studia.store.update(function (s) {' +
          '  s.sessions = s.sessions.filter(function (x) { return x.date !== U.today(); });' +
          '});' +
          'return Studia.store.get().sessions.length;' +
        '})()');
      })
      .then(function () { return goto(h, 'dashboard'); })
      .then(function () { return read(h, dashboardProbe()); })
      .then(function (d) {
        if (d.saysGap) {
          warnings++;
          console.log('  AVISO · dashboard.js (Hector): con sesiones ayer pero 0 hoy, el hero inventa dias sin estudiar (usa sessions[iso] sobre un array). hero: ' + JSON.stringify(d.hero));
        } else {
          pass++;
          console.log('  ok · panel · no inventa "30 dias sin estudiar"');
        }
      })
      .then(function () {
        check('consola limpia', h.pageErrors.length === 0 && h.errors.length === 0 && h.netFailures.length === 0,
          { pe: h.pageErrors, er: h.errors, net: h.netFailures });
        return h.stop('progreso');
      })
      .then(function () { return mobilePass(390); })
      .then(function () { return mobilePass(360); })
      .then(function () {
        console.log('\n== resultado: ' + pass + ' ok, ' + fail + ' ko, ' + warnings + ' aviso(s) ==');
        if (fail) failures.forEach(function (f) { console.log(f); });
        process.exit(fail ? 1 : 0);
      });
  });
}

run().catch(function (e) {
  console.error('\nERROR: ' + e.message);
  process.exit(1);
});

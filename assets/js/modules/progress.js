/* =========================================================
   Studia-IA · modules/progress.js
   Línea de progresión, estadísticas, mapa de calor y
   recompensas por racha.
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var view = { range: 30, line: 'daily' };
  var chartSeq = 0;   // ids únicos: dos SVG en la página no pueden compartir 'areaGrad'

  /* ---------------- Estadísticas ---------------- */
  function stats(range) {
    var from = U.toISO(U.addDays(new Date(), -(range - 1)));
    var to = U.today();
    var inRange = store.get().sessions.filter(function (s) { return s.date >= from && s.date <= to; });
    var total = U.sum(inRange, function (s) { return s.minutes; });

    var weekFrom = U.toISO(U.addDays(new Date(), -6));
    var week = U.sum(store.get().sessions.filter(function (s) { return s.date >= weekFrom; }), function (s) { return s.minutes; });

    /* Semana anterior (los 7 días previos) para poder compararla. */
    var prevWeekFrom = U.toISO(U.addDays(new Date(), -13));
    var prevWeekTo = U.toISO(U.addDays(new Date(), -7));
    var prevWeek = U.sum(store.get().sessions.filter(function (s) {
      return s.date >= prevWeekFrom && s.date <= prevWeekTo;
    }), function (s) { return s.minutes; });

    var prevFrom = U.toISO(U.addDays(new Date(), -(range * 2 - 1)));
    var prevTo = U.toISO(U.addDays(new Date(), -range));
    var prevTotal = U.sum(store.get().sessions.filter(function (s) {
      return s.date >= prevFrom && s.date <= prevTo;
    }), function (s) { return s.minutes; });

    var activeDays = {};
    inRange.forEach(function (s) { activeDays[s.date] = true; });
    var days = Object.keys(activeDays).length;
    /* Media sobre los días naturales del rango (no solo los activos): «por día
       activo» suena bien pero esconde los días sin estudiar. */
    var avg = Math.round(total / range);
    var avgActive = days ? Math.round(total / days) : 0;

    var bySubject = {};
    inRange.forEach(function (s) {
      /* Las sesiones sin asignatura también cuentan: antes desaparecían del
         reparto y el total no cuadraba con las barras. */
      var key = s.subjectId || '__none';
      bySubject[key] = (bySubject[key] || 0) + s.minutes;
    });

    return {
      total: total,
      week: week,
      prevWeek: prevWeek,
      prevTotal: prevTotal,
      avg: avg,
      avgActive: avgActive,
      activeDays: days,
      bySubject: Object.keys(bySubject).map(function (key) {
        return { subjectId: key === '__none' ? null : key, minutes: bySubject[key] };
      }).sort(function (a, b) { return b.minutes - a.minutes; }),
      inRange: inRange
    };
  }

  function series(range) {
    var out = [];
    for (var i = range - 1; i >= 0; i--) {
      var d = U.addDays(new Date(), -i);
      out.push({ date: d, iso: U.toISO(d), minutes: store.minutesOn(U.toISO(d)) });
    }
    return out;
  }

  function cumulativeSeries(daily) {
    var total = 0;
    return daily.map(function (d) {
      total += d.minutes;
      return { date: d.date, iso: d.iso, minutes: total, dayMinutes: d.minutes };
    });
  }

  /* ---------------- Gráficos ---------------- */
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* `U.h` crea nodos HTML; los hijos de un <svg> necesitan el namespace
     SVG o el navegador pinta solo el texto y se salta líneas y barras.
     Helper local para no tocar core/utils.js. */
  function svgEl(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var val = attrs[key];
      if (val === null || val === undefined || val === false) return;
      if (key === 'style' && typeof val === 'object') {
        Object.keys(val).forEach(function (k) { node.style[k] = val[k]; });
      } else {
        node.setAttribute(key, val);
      }
    });
    var list = children === null || children === undefined ? [] : (Array.isArray(children) ? children : [children]);
    list.forEach(function (c) {
      if (c instanceof Node) node.appendChild(c);
      else node.appendChild(document.createTextNode(String(c)));
    });
    return node;
  }

  /* Escala "bonita" (30/60/90... 4 divisibles) para que el eje Y no salga con
     decimales en el acumulado: con max/4 = 37.5 las rejillas se leen mal. */
  var AXIS_STEPS = [30, 60, 120, 300, 600, 1200, 3000, 6000, 12000, 30000, 60000, 120000];

  function niceMax(rawMax) {
    for (var i = 0; i < AXIS_STEPS.length; i++) {
      if (AXIS_STEPS[i] >= rawMax) return AXIS_STEPS[i];
    }
    return Math.ceil(rawMax / 120000) * 120000;   // semanas enteras estudiando
  }

  function axisUnit(min) {
    /* Los ejes van en horas si llegan a la decena (p. ej. el acumulado a 90
       días), si no en minutos; "1350" a secas no dice nada. */
    return min >= 600 ? U.fmtHours(min) : Math.round(min) + ' min';
  }

  function lineChart(data, range, mode) {
    var cumulative = mode === 'cumulative';
    var W = 760, H = 240, padL = 42, padR = 12, padT = 16, padB = 28;
    var max = niceMax(Math.max(30, Math.max.apply(null, data.map(function (d) { return d.minutes; }))));
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var step = innerW / Math.max(1, data.length - 1);

    function x(i) { return padL + i * step; }
    function y(v) { return padT + innerH - (v / max) * innerH; }

    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' });

    /* el id del degradado va numerado: si no, dos SVG en la página (o un
       re-render con el anterior aún montado) pelean por el mismo 'areaGrad' */
    var gradId = 'areaGrad-' + (++chartSeq);
    svg.appendChild(svgEl('defs', null, [
      svgEl('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' }, [
        svgEl('stop', { offset: '0%', 'stop-color': 'var(--brand-500)', 'stop-opacity': '.28' }),
        svgEl('stop', { offset: '100%', 'stop-color': 'var(--brand-500)', 'stop-opacity': '0' })
      ])
    ]));

    /* rejilla y eje Y */
    for (var g = 0; g <= 4; g++) {
      var v = (max / 4) * g;
      svg.appendChild(svgEl('line', { class: 'chart__grid', x1: padL, x2: W - padR, y1: y(v), y2: y(v) }));
      svg.appendChild(svgEl('text', { class: 'chart__label', x: padL - 8, y: y(v) + 4, 'text-anchor': 'end' }, axisUnit(v)));
    }

    var pts = data.map(function (d, i) { return [x(i), y(d.minutes)]; });
    var linePath = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var areaPath = linePath + ' L' + x(data.length - 1).toFixed(1) + ' ' + (padT + innerH) + ' L' + padL + ' ' + (padT + innerH) + ' Z';

    /* Con 0 sesiones la línea queda pegada al suelo, que parece un fallo:
       se avisa en su lugar y solo se dibuja la rejilla de referencia. */
    var empty = !U.sum(data, function (d) { return cumulative ? d.dayMinutes : d.minutes; });

    if (!empty) {
      svg.appendChild(svgEl('path', { class: 'chart__area', d: areaPath, style: { fill: 'url(#' + gradId + ')' } }));
      svg.appendChild(svgEl('path', { class: 'chart__line', d: linePath }));
    }

    var every = (global.innerWidth || 1024) < 600 ? 2 : 1;
    pts.forEach(function (p, i) {
      var d = data[i];
      var active = cumulative ? d.dayMinutes : d.minutes;
      var dot = svgEl('circle', { class: 'chart__dot', cx: p[0], cy: p[1], r: 3.4, opacity: active ? 1 : 0 });
      var tip = cumulative
        ? U.fmtDate(d.iso, { short: true, day: true }) + ': ' + U.fmtMinutes(d.minutes) + ' acumulados (' + (d.dayMinutes ? '+' + d.dayMinutes + ' min' : 'sin estudiar') + ')'
        : U.fmtDate(d.iso, { short: true, day: true }) + ': ' + d.minutes + ' min';
      dot.appendChild(svgEl('title', null, tip));
      if (i % every !== 0) return;
      svg.appendChild(dot);
    });

    if (empty) {
      svg.appendChild(svgEl('text', {
        class: 'chart__label', x: W / 2, y: padT + innerH / 2,
        'text-anchor': 'middle', style: { 'font-size': '15px' }
      }, 'Aún no hay sesiones en este periodo'));
    }

    /* eje X: en etiquetas estrechas (móvil) se solapan, así que menos */
    var every = (global.innerWidth || 1024) < 600
      ? Math.max(2, Math.ceil(data.length / 5))
      : Math.ceil(data.length / 10);
    data.forEach(function (d, i) {
      if (i % every !== 0 && i !== data.length - 1) return;
      svg.appendChild(svgEl('text', { class: 'chart__label', x: x(i), y: H - 8, 'text-anchor': 'middle' }, U.fmtDate(d.iso, { short: true, day: true })));
    });

    return svg;
  }

  function barChart(items) {
    var W = 760, H = 210, padL = 42, padR = 12, padT = 14, padB = 34;
    var max = niceMax(Math.max.apply(null, items.map(function (i) { return i.minutes; })));
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var bw = Math.min(70, (innerW / Math.max(1, items.length)) * 0.55);
    var gap = (innerW - bw * items.length) / Math.max(1, items.length);

    var svg = svgEl('svg', { class: 'chart chart--bars', viewBox: '0 0 ' + W + ' ' + H });
    for (var g = 0; g <= 4; g++) {
      var v = (max / 4) * g;
      var yy = padT + innerH - (v / max) * innerH;
      svg.appendChild(svgEl('line', { class: 'chart__grid', x1: padL, x2: W - padR, y1: yy, y2: yy }));
      svg.appendChild(svgEl('text', { class: 'chart__label', x: padL - 8, y: yy + 4, 'text-anchor': 'end' }, axisUnit(v)));
    }

    items.forEach(function (it, i) {
      var x = padL + gap * (i + 1) + bw * i;
      var h = (it.minutes / max) * innerH;
      var y = padT + innerH - h;
      var rect = svgEl('rect', { class: 'chart__bar', x: x, y: y, width: bw, height: Math.max(3, h), fill: store.subjectColor(it.subjectId) });
      rect.appendChild(svgEl('title', null, store.subjectName(it.subjectId) + ': ' + U.fmtMinutes(it.minutes)));
      svg.appendChild(rect);
      svg.appendChild(svgEl('text', { class: 'chart__label', x: x + bw / 2, y: y - 6, 'text-anchor': 'middle' }, fmtTime(it.minutes)));
      var label = store.subjectName(it.subjectId);
      svg.appendChild(svgEl('text', { class: 'chart__label', x: x + bw / 2, y: H - 12, 'text-anchor': 'middle' }, label.length > 14 ? label.slice(0, 13) + '…' : label));
    });

    return svg;
  }

  /* Fila de etiquetas con las mismas alturas y huecos que las celdas del
     mapa (celda 12 px + gap 3 px). Las alturas van inline porque las clases
     .heat__* son de views.css y no podemos tocarla. */
  function heatLabels(children) {
    return U.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', flex: '0 0 auto' } },
      children.map(function (text) {
        return U.h('span.tiny.soft', {
          style: { height: '12px', lineHeight: '12px', fontSize: '.6rem', color: 'var(--text-soft)', whiteSpace: 'nowrap' }
        }, text);
      }));
  }

  /* Mapa de calor con etiquetas: día de la semana a la izquierda (como GitHub)
     y el mes de cada semana arriba (ene, feb…), una por columna. */
  function heatmap() {
    var weeks = 16;
    var cells = [];
    var weekHeads = [];
    /* La última columna debe ser la semana actual: si se resta
       semanas*7-1 y luego se redondea al lunes, el mapa acaba hasta 6 días
       antes de hoy y no pinta las sesiones de esta semana. */
    var start = U.addDays(U.startOfWeek(new Date(), 1), -(weeks - 1) * 7);
    /* El mapa se calcula desde las sesiones, igual que la línea y el reparto:
       así no se desincroniza si se importan datos o se borra una sesión. */
    var minutesByDay = {};
    store.get().sessions.forEach(function (s) {
      minutesByDay[s.date] = (minutesByDay[s.date] || 0) + s.minutes;
    });
    for (var i = 0; i < weeks * 7; i++) {
      var d = U.addDays(start, i);
      var iso = U.toISO(d);
      var mins = minutesByDay[iso] || 0;
      var level = mins === 0 ? 0 : mins < 30 ? 1 : mins < 60 ? 2 : mins < 120 ? 3 : 4;
      cells.push({ iso: iso, level: level, mins: mins, future: d > new Date() });
      if (i % 7 === 0) weekHeads.push({ iso: iso });
    }
    var grid = U.h('div.heat');
    cells.forEach(function (c) {
      var cell = U.h('div.heat__cell' + (c.level ? '.heat__cell--l' + c.level : ''), {
        title: U.fmtDate(c.iso, { weekday: true }) + ': ' + (c.mins ? U.fmtMinutes(c.mins) : 'sin estudiar'),
        style: c.future ? { opacity: '.35' } : null
      });
      grid.appendChild(cell);
    });

    /* Cabecera de meses: una etiqueta por semana (columna), con el mes en que
       cae el lunes de esa semana; `U.fmtDate(…, { short: true })` da "8 feb
       2026", así que se saca el mes del texto formateado. */
    var MESES_MIN = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var head = U.h('div', { style: { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '12px', gap: '3px', marginBottom: '4px' } },
      weekHeads.map(function (h) {
        var dd = U.toDate(h.iso);
        var label = MESES_MIN[dd.getMonth()];
        return U.h('span', { style: { fontSize: '.55rem', color: 'var(--text-soft)', lineHeight: '12px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden' } }, label);
      })
    );
    var body = U.h('div.row.gap-2', { style: { alignItems: 'flex-start', flexWrap: 'nowrap' } }, [
      heatLabels(WEEKDAYS_MINI),
      U.h('div.grow', { style: { minWidth: '0' } }, [head, grid])
    ]);
    return body;
  }

  /* ---------------- Render ---------------- */
  var WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var WEEKDAYS_MINI = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  /* Minutos por día de la semana dentro del rango. `U.toDate` parsea el ISO en
     local, así que `getDay` (0=domingo) es fiable. */
  function weekdaySeries(sessions) {
    var out = [0, 0, 0, 0, 0, 0, 0];
    sessions.forEach(function (s) { out[U.toDate(s.date).getDay()] += s.minutes; });
    return out;
  }

  function weekdayCard(s) {
    var mins = weekdaySeries(s.inRange);
    var totalMins = U.sum(mins);
    var max = Math.max.apply(null, mins) || 1;
    var best = mins.indexOf(max);
    var order = [1, 2, 3, 4, 5, 6, 0];   // lunes a domingo
    return U.h('div.card', [
      U.h('div.card__head', [
        U.h('div', [U.h('h3', 'Días de la semana'), U.h('p', 'En los últimos ' + view.range + ' días')]),
        totalMins ? U.h('span.badge', WEEKDAYS[best]) : null
      ]),
      totalMins ? U.h('div.col.gap-1', order.map(function (day) {
        var m = mins[day];
        var w = Math.max(2, Math.round(m / max * 100));
        return U.h('div.row.gap-2', [
          U.h('span.tiny.soft', { style: { width: '62px', flex: '0 0 auto' } }, WEEKDAYS[day]),
          U.h('div.progress.progress--thin.grow', U.h('div.progress__bar', { style: { width: w + '%' } })),
          U.h('span.tiny.strong', { style: { width: '56px', textAlign: 'right', flex: '0 0 auto' } }, m ? U.fmtMinutes(m) : '—')
        ]);
      })) : U.h('p.small.soft', 'Aún no hay sesiones en este periodo.')
    ]);
  }

  /* Un día sin estudiar corta la racha: si no se ha estudiado hoy y la racha
     es de 3 o más, conviene recordarlo antes de que se pierda. La lógica de
     "si hoy no hay sesión, la racha muere al cambiar el día" coincide con
     `store.streakInfo()`. */
  function streakDanger(info) {
    if (info.current < 3) return null;
    if ((store.get().streak.history || {})[U.today()]) return null;
    return U.h('div.card', [
      U.h('div.card__head', [U.h('h3', 'Tu racha está en juego'), U.h('span.badge.badge--amber', info.current + ' días')]),
      U.h('p.small', { style: { color: 'var(--rose-600)' } },
        'Hoy aún no has estudiado. Si no lo haces, mañana perderás la racha de ' + info.current + ' días.'),
      U.h('p.tiny.soft.mt-1', 'Con un pomodoro vale para mantenerla: mira cuánto dura tu Enfoque en Estudio.')
    ]);
  }

  function heatmapCard() {
    return U.h('div.card', [
      U.h('div.card__head', [
        U.h('div', [U.h('h3', 'Mapa de actividad'), U.h('p', 'Últimas 16 semanas')]),
        U.h('div.heat__legend', [
          U.h('span', 'menos'),
          U.h('span.heat__cell'), U.h('span.heat__cell.heat__cell--l1'), U.h('span.heat__cell.heat__cell--l2'),
          U.h('span.heat__cell.heat__cell--l3'), U.h('span.heat__cell.heat__cell--l4'),
          U.h('span', 'más')
        ])
      ]),
      heatmap()
    ]);
  }

  function render(root) {
    U.clear(root);
    var s = stats(view.range);
    var info = store.streakInfo();
    var lvl = store.levelInfo();
    var daily = series(view.range);
    var data = view.line === 'cumulative' ? cumulativeSeries(daily) : daily;
    var trend = trendInfo(s);

    root.appendChild(U.h('div.col.gap-2', [
      U.h('div.grid.grid-4', [
        statCard('timer', 'var(--brand-500)', fmtTime(s.total), 'Tiempo total', 'Últimos ' + view.range + ' días', 'brand'),
        statCard('chart', 'var(--mint-500)', fmtTime(s.week), 'Esta semana', weekTrend(s), 'mint'),
        statCard('fire', 'var(--amber-500)', info.current + ' días', 'Racha actual', 'Mejor: ' + info.best + ' días', 'amber'),
        statCard('star', 'var(--violet-500)', 'Nivel ' + lvl.level, lvl.xp + ' XP', 'Para el siguiente: ' + (lvl.needed - lvl.current) + ' XP', 'violet')
      ]),

      U.h('div.card', [
        U.h('div.card__head', [
          U.h('div', [
            U.h('h3', 'Línea de progresión'),
            U.h('p', view.line === 'cumulative' ? 'Minutos acumulados en el periodo' : 'Minutos de estudio por día')
          ])
        ]),
        U.h('div.row.row--between.row--wrap.gap-2.mb-2', [
          U.h('div.segmented', [['daily', 'Diario'], ['cumulative', 'Acumulado']].map(function (item) {
            return U.h('button', {
              class: view.line === item[0] ? 'is-active' : '',
              onclick: function () { view.line = item[0]; refresh(); }
            }, item[1]);
          })),
          U.h('div.segmented', [14, 30, 90].map(function (r) {
            return U.h('button', { class: view.range === r ? 'is-active' : '', onclick: function () { view.range = r; refresh(); } }, r + ' d');
          }))
        ]),
        lineChart(data, view.range, view.line),
        U.h('div.row.row--between.row--wrap.gap-2.mt-2', [
          U.h('span.tiny.soft', 'media de ' + s.avg + ' min al día' + (s.activeDays === view.range ? '' : ' (' + s.avgActive + ' los ' + s.activeDays + ' días con estudio)')),
          U.h('span.tiny' + (trend.cls ? '.' + trend.cls : '.soft'), trend.text),
          U.h('span.tiny.soft', 'Objetivo diario: ' + (store.get().settings.dailyGoal || 120) + ' min')
        ])
      ]),

      U.h('div.grid.grid--split', [
        U.h('div.col.gap-2', [
          weekdayCard(s),
          subjectCard(s),
          heatmapCard()
        ]),
        U.h('div.col.gap-2', [
          levelCard(lvl),
          streakDanger(info),
          rewardsCard(info)
        ])
      ])
    ]));
  }

  /* El desglose por asignatura se leía como reparto pero era el total del
     rango: la cabecera lo dice ahora claro. */
  function subjectCard(s) {
    return U.h('div.card', [
      U.h('div.card__head', [
        U.h('div', [U.h('h3', 'Reparto por asignatura'), U.h('p', 'Cómo se reparte tu tiempo')]),
        U.h('span.badge', U.fmtMinutes(s.total))
      ]),
      s.bySubject.length ? barChart(s.bySubject) : U.h('p.small.soft', 'Aún no hay sesiones en este periodo.')
    ]);
  }

  function statCard(ic, color, value, label, sub, tone) {
    return U.h('div.stat', [
      U.h('div.stat__icon' + (tone ? '.stat__icon--' + tone : ''), { style: { color: color } }, U.icon(ic)),
      U.h('div.stat__body', [
        U.h('span.stat__value', value),
        U.h('span.stat__label', label),
        U.h('span.tiny.soft', sub)
      ])
    ]);
  }

  /* '0 h' se lee como que la tarjeta está vacía: 0 horas se muestra en min. */
  function fmtTime(min) {
    return min < 60 ? (min || 0) + ' min' : U.fmtHours(min);
  }

  function deltaPct(cur, prev) {
    if (!prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
  }

  /* Subtexto de la tarjeta "Esta semana" con la comparación semanal: el
     "+30 % a secas" no se entiende sin decir con qué se compara. */
  function weekTrend(s) {
    var avg = 'media ' + fmtTime(Math.round(s.week / 7)) + '/día';
    var pct = deltaPct(s.week, s.prevWeek);
    if (s.week && pct === null) return avg + ' · semana nueva';
    if (pct === null) return avg;
    if (pct === 0) return avg + ' · igual que la semana pasada';
    return avg + ' · ' + (pct > 0 ? '+' : '−') + Math.abs(pct) + ' % que la anterior';
  }

  function trendInfo(s) {
    if (!s.prevTotal && !s.total) return { text: 'Sin actividad en los dos periodos.', cls: '' };
    if (!s.prevTotal) return { text: 'Todo el estudio es nuevo respecto a los ' + view.range + ' días anteriores.', cls: 'trend--up' };
    var pct = Math.round(((s.total - s.prevTotal) / s.prevTotal) * 100);
    if (pct === 0) return { text: 'Igual que los ' + view.range + ' días anteriores.', cls: '' };
    return {
      text: (pct > 0 ? '+' : '−') + Math.abs(pct) + ' % respecto a los ' + view.range + ' días anteriores.',
      cls: pct > 0 ? 'trend--up' : 'trend--down'
    };
  }

  function levelCard(lvl) {
    return U.h('div.card', [
      U.h('div.card__head', [U.h('h3', 'Nivel de estudiante'), U.h('span.badge.badge--violet', 'Nivel ' + lvl.level)]),
      U.h('div.progress.progress--thin', U.h('div.progress__bar', { style: { width: lvl.percent + '%' } })),
      U.h('p.tiny.soft.mt-1', lvl.current + ' / ' + lvl.needed + ' XP para el nivel ' + (lvl.level + 1)),
      U.h('p.tiny.soft.mt-2', 'Ganas XP por cada minuto de estudio y por completar pomodoros.')
    ]);
  }

  function rewardsCard(info) {
    var list = Studia.rewards.status(info, store.get().rewards.claimed);
    return U.h('div.card', [
      U.h('div.card__head', [U.h('h3', 'Recompensas por racha'), U.h('span.badge.badge--amber', list.filter(function (l) { return l.unlocked; }).length + '/' + list.length)]),
      U.h('div.col.gap-2', list.map(function (l) {
        var cls = l.claimed ? '.reward--claimed' : (l.unlocked ? '.reward--unlocked' : '');
        return U.h('div.reward' + cls, [
          U.h('div.reward__icon', U.icon(l.claimed ? 'check' : (l.unlocked ? 'trophy' : (l.milestone.icon || 'star')))),
          U.h('div.grow', [
            U.h('div.small.strong', l.milestone.name),
            U.h('div.tiny.soft', l.milestone.desc + ' · +' + l.milestone.xp + ' XP')
          ]),
          l.claimed ? U.h('span.badge.badge--mint', 'Reclamada') : (l.unlocked ? U.h('span.badge.badge--amber', 'Lista') : U.h('span.badge', 'Bloqueada'))
        ]);
      }))
    ]);
  }

  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'progress') render(main);
  }

  function init() {
    store.subscribe(function () {
      if (Studia.router.current() === 'progress') refresh();
    });
  }

  Studia.modules = Studia.modules || {};
  Studia.modules.progress = { init: init, render: render };
  Studia.router.register('progress', {
    title: 'Progresión',
    subtitle: 'Tu línea de progresión, estadísticas y recompensas',
    render: render
  });
})(window);

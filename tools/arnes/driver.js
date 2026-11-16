/* =========================================================
   Studia-IA · tools/arnes/driver.js
   Conductor del arnes: lanza Chrome headless (perfil nuevo en
   cada test) contra un servidor local y expone eval_, timer(),
   saved(), reload() y setVisible(). Solo usa CDP plano via
   WebSocket nativo de Node, sin dependencias externas
   (el proyecto es sin `npm install`).
   ========================================================= */
'use strict';
var cp = require('child_process');
var fs = require('fs');
var http = require('http');
var crypto = require('crypto');

var CHROME = process.env.CHROME || '/usr/bin/google-chrome';
var BASE = process.env.ARNES_BASE || 'http://127.0.0.1:8199/index.html';
var TMP = '/tmp/opencode/arnes';
var DEBUG = !!process.env.ARNES_DEBUG;
function dbg() { if (DEBUG) console.error.apply(console, ['[arnes]'].concat([].slice.call(arguments))); }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function httpJson(pathname, port) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: pathname }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

/* ---------- WebSocket minimo (solo cliente, texto) ---------- */
var WS = function (url) {
  var self = this;
  this.readyState = 0;
  this.onmessage = null;
  this.onclose = null;
  var u = new URL(url);
  var req = http.request({
    host: u.hostname, port: u.port, path: u.pathname + u.search,
    headers: {
      'Connection': 'Upgrade', 'Upgrade': 'websocket',
      'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
      'Sec-WebSocket-Version': '13'
    }
  });
  dbg('WS conectando', url);
  req.on('upgrade', function (res, socket, head) {
    dbg('WS upgrade');
    self.sock = socket;
    self.readyState = 1;
    var bufs = head && head.length ? [head] : [];
    var expected = -1, op = 0, masked = false, len = 0, mask = null;
    socket.on('data', function (chunk) {
      bufs.push(chunk);
      for (;;) {
        var buf = Buffer.concat(bufs);
        if (expected === -1) {
          if (buf.length < 2) return;
          op = buf[0] & 0x0f; masked = !!(buf[1] & 0x80);
          len = buf[1] & 0x7f;
          var off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (masked) { if (buf.length < off + 4) return; mask = buf.slice(off, off + 4); off += 4; }
          expected = off + len;
        }
        if (buf.length < expected) return;
        var payload = buf.slice(expected - len, expected);
        bufs = [buf.slice(expected)];
        expected = -1;
        if (masked) {
          var out = Buffer.from(payload);
          for (var k = 0; k < out.length; k++) out[k] ^= mask[k % 4];
          payload = out;
        }
        if (op === 8) { self.readyState = 3; socket.end(); if (self.onclose) self.onclose(); return; }
        if (op === 1 && self.onmessage) self.onmessage(payload.toString('utf8'));
      }
    });
    socket.on('close', function () { dbg('WS close'); self.readyState = 3; if (self.onclose) self.onclose(); });
    socket.on('error', function () { self.readyState = 3; if (self.onclose) self.onclose(); });
  });
  req.on('error', function (e) { dbg('WS error', e.message); self.readyState = 3; if (self.onerror) self.onerror(e); if (self.onclose) self.onclose(); });
  req.end();
};
WS.prototype.send = function (str) {
  var payload = Buffer.from(str, 'utf8');
  var mask = crypto.randomBytes(4);
  var header;
  if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0xFE; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0xFF; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  var masked = Buffer.from(payload);
  for (var i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
  this.sock.write(Buffer.concat([header, mask, masked]));
};
WS.prototype.close = function () { try { if (this.sock) this.sock.destroy(); } catch (e) {} };

/* ---------- cliente CDP minimo ---------- */
function CDPClient(wsUrl) {
  this.ws = new WS(wsUrl);
  this.next = 1;
  this.pending = {};
  this.events = {};
  var self = this;
  this.ws.onmessage = function (text) {
    var msg = JSON.parse(text);
    if (msg.id && self.pending[msg.id]) {
      var p = self.pending[msg.id];
      delete self.pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    } else if (msg.method) {
      (self.events[msg.method] || []).forEach(function (fn) { try { fn(msg.params); } catch (e) {} });
    }
  };
  this.ready = new Promise(function (resolve, reject) {
    var t0 = Date.now();
    (function poll() {
      if (self.ws.readyState === 1) return resolve();
      if (self.ws.readyState === 3) return reject(new Error('websocket CDP cerrado'));
      setTimeout(poll, 30);
    })();
  });
}
CDPClient.prototype.send = function (method, params) {
  var self = this;
  return this.ready.then(function () {
    return new Promise(function (resolve, reject) {
      var id = self.next++;
      self.pending[id] = { resolve: resolve, reject: reject };
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  });
};
CDPClient.prototype.on = function (method, fn) {
  (this.events[method] = this.events[method] || []).push(fn);
};
CDPClient.prototype.close = function () { this.ws.close(); };

/* ---------- arnes ---------- */
function Harness(name) {
  this.name = name || 'test';
  this.logs = [];
  this.errors = [];
  this.warns = [];
  this.netFailures = [];
  this.pageErrors = [];
  this.dir = null;
  this.port = null;
}

Harness.prototype.start = function (opts) {
  var self = this;
  opts = opts || {};
  fs.mkdirSync(TMP, { recursive: true });
  this.dir = fs.mkdtempSync(TMP + '/perfil-');
  this.port = Number(process.env.ARNES_PORT || 9333);
  var args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--disable-dev-shm-usage', '--disable-features=Translate',
    '--user-data-dir=' + this.dir,
    '--remote-debugging-port=' + this.port
  ].concat(opts.chromeArgs || []).concat([BASE + (opts.hash || '#/study')]);
  this.chrome = cp.spawn(CHROME, args, { stdio: 'ignore' });

  var t0 = Date.now();
  function findTarget() {
    return httpJson('/json/list', self.port).catch(function () { return []; }).then(function (list) {
      var page = list.filter(function (t) { return t.type === 'page' && /index\.html/.test(t.url); })[0];
      if (page) return page;
      if (Date.now() - t0 > 25000) throw new Error('no aparece la pestaña de index.html');
      return sleep(150).then(findTarget);
    });
  }

  dbg('buscando target en puerto', self.port);
  return findTarget().then(function (target) {
    dbg('target encontrado', target.webSocketDebuggerUrl);
    self.client = new CDPClient(target.webSocketDebuggerUrl);
    self.client.ready.then(function(){ dbg('CDP listo'); }, function(e){ dbg('CDP NO listo: '+e.message); });
    return self.client.send('Runtime.enable').then(function(r){ dbg('Runtime.enable ok'); return r; });
  }).then(function () {
    return self.client.send('Page.enable').then(function(r){ dbg('Page.enable ok'); return r; });
  }).then(function () {
    return self.client.send('Network.enable').then(function(r){ dbg('Network.enable ok'); return r; });
  }).then(function () {
    self.client.on('Runtime.consoleAPICalled', function (p) {
      var text = (p.args || []).map(function (a) { return a.value !== undefined ? a.value : (a.description || a.type); }).join(' ');
      self.logs.push({ type: p.type, text: String(text) });
      if (p.type === 'error') self.errors.push(String(text));
      if (p.type === 'warning') self.warns.push(String(text));
    });
    self.client.on('Runtime.exceptionThrown', function (p) {
      var d = p.exceptionDetails;
      self.pageErrors.push((d.exception && (d.exception.description || d.exception.message)) || d.text);
    });
    self.client.on('Network.loadingFailed', function (p) {
      if (!p.canceled) self.netFailures.push(p.errorText + ' ' + (p.blockedReason || ''));
    });
    if (opts.width) {
      return self.client.send('Emulation.setDeviceMetricsOverride', { width: opts.width, height: 800, deviceScaleFactor: 1, mobile: true });
    }
  }).then(function () {
    dbg('esperando app...');
    return self.waitForApp();
  }).then(function () {
    dbg('app lista, setVisible');
    return self.setVisible(true);
  }).then(function () { dbg('start completo'); return self; });
};

Harness.prototype.waitForApp = function () {
  var self = this;
  function poll() {
    return self.eval_("(document.body && document.body.classList.contains('is-ready')) ? true : false").then(function (ok) {
      if (ok) return true;
      return sleep(100).then(poll);
    });
  }
  var t0 = Date.now();
  function guard() {
    return poll().catch(function (e) {
      if (Date.now() - t0 > 25000) throw new Error('la app no arrancaba: ' + e.message);
      return sleep(300).then(guard);
    });
  }
  return guard();
};

Harness.prototype.eval_ = function (expression) {
  return this.client.send('Runtime.evaluate', { expression: expression, awaitPromise: true, returnByValue: true })
    .then(function (r) {
      if (r.exceptionDetails) {
        var d = r.exceptionDetails;
        var why = d.exception ? ((d.exception.description || d.exception.message) || d.exception.value) : d.text;
        throw new Error('eval (' + why + ') en: ' + String(expression).slice(0, 140).replace(/\n/g, ' '));
      }
      return r.result && r.result.value;
    });
};

Harness.prototype.timer = function () {
  return this.eval_("(function(){var t=Studia.modules.study.state();return JSON.stringify({mode:t.mode,running:t.running,remaining:t.remaining,total:t.total,cycle:t.cycle,subjectId:t.subjectId,taskId:t.taskId,taskAtStart:t.taskAtStart});})()").then(JSON.parse);
};

Harness.prototype.saved = function () {
  return this.eval_("(function(){Studia.store.flush();var d=JSON.parse(localStorage.getItem('studia.db.v1')||'null');if(!d)return null;var t=d.timer||{};return JSON.stringify({mode:t.mode,running:t.running,remaining:t.remaining,endAt:t.endAt,lastFinishedEndAt:t.lastFinishedEndAt,sessions:d.sessions.length,xp:d.xp});})()").then(function (s) { return s ? JSON.parse(s) : null; });
};

Harness.prototype.reload = function () {
  var self = this;
  return this.eval_("document.body.classList.remove('is-ready')").then(function () {
    return self.client.send('Page.reload', { ignoreCache: true }).catch(function (e) {
      if (!/navigated|closed|not found/i.test(String(e && e.message))) throw e;
    });
  }).then(function () { return sleep(400); })
    .then(function () { return self.waitForApp(); });
};

Harness.prototype.setVisible = function (visible) {
  var v = visible ? 'visible' : 'hidden';
  return this.eval_("Object.defineProperty(document,'visibilityState',{configurable:true,get:function(){return '" + v + "';}});Object.defineProperty(document,'hidden',{configurable:true,get:function(){return " + (!visible) + ";}});document.dispatchEvent(new Event('visibilitychange'));");
};

Harness.prototype.stop = function (label) {
  var self = this;
  var out = {
    name: this.name,
    pageErrors: this.pageErrors,
    errors: this.errors,
    netFailures: this.netFailures
  };
  if (label && (out.pageErrors.length || out.errors.length || out.netFailures.length)) {
    console.log('  consola [' + label + ']:', JSON.stringify(out));
  }
  if (this.client) this.client.close();
  if (this.chrome) this.chrome.kill('SIGKILL');
  return sleep(200).then(function () {
    if (self.dir) { cp.execSync('rm -rf ' + self.dir); self.dir = null; }
    return out;
  });
};

function setupConfigExpr(cfg) {
  return 'Studia.store.update(function(s){s.settings.pomodoro = Object.assign({}, s.settings.pomodoro, ' + JSON.stringify(cfg) + ');});';
}

module.exports = { Harness: Harness, sleep: sleep, setupConfigExpr: setupConfigExpr, BASE: BASE };

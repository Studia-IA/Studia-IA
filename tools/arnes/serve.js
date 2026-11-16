/* =========================================================
   Studia-IA · tools/arnes/serve.js
   Servidor HTTP minimo (sin dependencias) sobre la raiz del repo.
   Por defecto sirve la raiz del repo; con ARNES_ROOT se puede servir la
   copia del arnes (/tmp/opencode/arnes/www). Uso: node tools/arnes/serve.js [puerto]
   Uso: node tools/arnes/serve.js [puerto]
   ========================================================= */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(process.env.ARNES_ROOT || path.join(__dirname, '..', '..'));
var PORT = parseInt(process.argv[2], 10) || 8199;
var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};

http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  var file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  fs.stat(file, function (err, st) {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, function (err2, data) {
      if (err2) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('arnes: sirviendo ' + ROOT + ' en http://127.0.0.1:' + PORT);
});

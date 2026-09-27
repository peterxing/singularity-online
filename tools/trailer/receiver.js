// Minimal local upload receiver for the trailer tooling: POST /upload?name=file.ext writes the body into this folder.
const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = __dirname;
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (req.method !== 'POST' || u.pathname !== '/upload') { res.writeHead(404); return res.end(); }
  const name = path.basename(u.searchParams.get('name') || 'upload.bin');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    fs.writeFileSync(path.join(dir, name), buf);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name, bytes: buf.length }));
  });
}).listen(8099, '127.0.0.1', () => console.log('receiver on 8099'));

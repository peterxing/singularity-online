import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Terrain } from '../client/shared/terrain.js';
import { World } from '../client/shared/world.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'client');
const DATA = path.resolve(__dirname, '..', 'data');
const SAVE_FILE = path.join(DATA, 'characters.json');
const PORT = Number(process.env.PORT) || 8080;
const BOTS = process.env.BOTS !== undefined ? Number(process.env.BOTS) : 10;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

let saves = {};
try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch { saves = {}; }
let saveTimer = null;
function persist(rec) {
  if (!rec || !rec.name) return;
  saves[`${rec.name.toLowerCase()}|${rec.champion}`] = rec;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFile(SAVE_FILE, JSON.stringify(saves, null, 1), () => {});
  }, 1500);
}

const t0 = Date.now();
const terrain = new Terrain();
const world = new World({ terrain, bots: BOTS, onSave: persist });
console.log(`[realm] terrain + world generated in ${Date.now() - t0} ms (${world.ents.size} entities, ${BOTS} bots)`);

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  if (url === '/status') {
    const players = [...world.ents.values()].filter((e) => e.kind === 'player');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, uptime: world.time, players: players.length, humans: world.clients.size }));
  }
  const file = path.resolve(ROOT, '.' + url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  let id = 0;
  let msgs = 0, windowStart = Date.now();
  const send = (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; msgs = 0; }
    if (++msgs > 80) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!id) {
      if (msg.t !== 'join') return;
      const name = String(msg.name || '').slice(0, 16);
      const champion = String(msg.champion || 'elon');
      const save = saves[`${name.toLowerCase()}|${champion}`] || null;
      id = world.join({ name, champion, save }, send);
      console.log(`[realm] ${name} joined as ${champion} (#${id})`);
      return;
    }
    world.receive(id, msg);
  });
  ws.on('close', () => { if (id) { world.leave(id); console.log(`[realm] #${id} left`); } });
  ws.on('error', () => {});
});

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  world.step((now - last) / 1000);
  last = now;
}, 25);

server.listen(PORT, () => {
  console.log(`\n  SINGULARITY ONLINE realm is live:  http://localhost:${PORT}\n`);
});

function shutdown() {
  for (const c of world.clients.values()) { const p = world.ents.get(c.id); if (p) persist(world.saveOf(p)); }
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(SAVE_FILE, JSON.stringify(saves, null, 1)); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

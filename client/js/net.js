import { World } from '../shared/world.js';

export class Net {
  constructor(terrain) {
    this.terrain = terrain;
    this.handlers = [];
    this.mode = null;
    this.ws = null;
    this.world = null;
    this.localId = 0;
    this.queue = [];
    this.onClose = null;
  }

  connect() {
    const params = new URLSearchParams(location.search);
    if (params.has('offline')) return Promise.resolve(this._offline());
    const realm = params.get('realm') || window.SO_REALM || null;
    if (!realm && (location.protocol === 'file:' || location.hostname.endsWith('github.io'))) return Promise.resolve(this._offline());
    return new Promise((resolve) => {
      let done = false;
      let ws;
      const url = realm || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      try { ws = new WebSocket(url); } catch { resolve(this._offline()); return; }
      const finish = (mode) => { if (done) return; done = true; clearTimeout(timer); resolve(mode); };
      const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } finish(this._offline()); }, 2500);
      ws.onopen = () => {
        this.ws = ws;
        this.mode = 'online';
        ws.onmessage = (e) => { try { this._dispatch(JSON.parse(e.data)); } catch (err) { console.error(err); } };
        ws.onclose = () => { if (this.onClose) this.onClose(); };
        finish('online');
      };
      ws.onerror = () => finish(this._offline());
    });
  }

  _offline() { this.mode = 'offline'; return 'offline'; }

  join(name, champion) {
    if (this.mode === 'online') {
      this.ws.send(JSON.stringify({ t: 'join', name, champion }));
      return;
    }
    const load = () => { try { return JSON.parse(localStorage.getItem('so_saves') || '{}'); } catch { return {}; } };
    const saves = load();
    this.world = new World({
      terrain: this.terrain, bots: 10, dayTime: 0.62,
      onSave: (rec) => { const s = load(); s[`${rec.name.toLowerCase()}|${rec.champion}`] = rec; try { localStorage.setItem('so_saves', JSON.stringify(s)); } catch { /* quota */ } },
    });
    this.localId = this.world.join({ name, champion, save: saves[`${name.toLowerCase()}|${champion}`] || null }, (m) => this.queue.push(m));
  }

  send(msg) {
    if (this.mode === 'online') { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
    else if (this.world) this.world.receive(this.localId, msg);
  }

  on(fn) { this.handlers.push(fn); }

  _dispatch(msg) { for (const h of this.handlers) h(msg); }

  update(dt) {
    if (this.mode !== 'offline' || !this.world) return;
    this.world.step(dt);
    if (this.queue.length) {
      const q = this.queue;
      this.queue = [];
      for (const m of q) this._dispatch(m);
    }
  }

  saveNow() {
    if (this.world && this.localId) {
      const p = this.world.ents.get(this.localId);
      if (p && this.world.onSave) this.world.onSave(this.world.saveOf(p));
    }
  }
}

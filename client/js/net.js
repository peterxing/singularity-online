import { World } from '../shared/world.js';

// Shared online realm used by the GitHub Pages build (free Render instance; it sleeps when idle).
export const DEFAULT_REALM = null;

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
    this.onUpgrade = null;
    this.joined = false;
  }

  _realm() {
    const params = new URLSearchParams(location.search);
    if (params.has('offline') || params.has('solo')) return { solo: true };
    const hosted = location.hostname.endsWith('github.io');
    const realm = params.get('realm') || window.SO_REALM || (hosted ? DEFAULT_REALM : null);
    if (realm) return { url: realm, remote: true };
    if (location.protocol === 'file:' || hosted) return { solo: true };
    return { url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, remote: false };
  }

  async connect() {
    const r = this._realm();
    if (r.solo) return this._offline();
    this.realmUrl = r.url;
    if (await this._tryOpen(r.url, 2500)) return 'online';
    if (r.remote) { this._wake(r.url); this.mode = 'offline'; return 'waking'; }
    return this._offline();
  }

  _tryOpen(url, timeout) {
    return new Promise((resolve) => {
      let done = false, ws;
      try { ws = new WebSocket(url); } catch { resolve(false); return; }
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };
      const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } finish(false); }, timeout);
      ws.onopen = () => {
        if (done || this.joined) { try { ws.close(); } catch { /* ignore */ } return; }
        this.ws = ws;
        this.mode = 'online';
        ws.onmessage = (e) => { try { this._dispatch(JSON.parse(e.data)); } catch (err) { console.error(err); } };
        ws.onclose = () => { if (this.onClose && this.joined && this.mode === 'online') this.onClose(); };
        finish(true);
      };
      ws.onerror = () => finish(false);
    });
  }

  // Free hosts sleep when idle: ping the status endpoint to wake the server and keep retrying.
  _wake(url) {
    const status = url.replace(/^ws(s?):/, 'http$1:').replace(/\/ws\/?$/, '/status');
    let tries = 0;
    const tick = async () => {
      if (this.joined || this.mode === 'online') return;
      tries++;
      fetch(status, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
      if (await this._tryOpen(url, 4000)) { if (this.onUpgrade) this.onUpgrade('online'); return; }
      if (tries < 30 && !this.joined) setTimeout(tick, 3000);
      else if (!this.joined && this.onUpgrade) this.onUpgrade('offline');
    };
    setTimeout(tick, 300);
  }

  _offline() { this.mode = 'offline'; return 'offline'; }

  join(name, champion) {
    this.joined = true;
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

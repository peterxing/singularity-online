// Virtual clock for deterministic frame capture. Injected before the game loads.
// In "realtime" mode it follows the wall clock; in "manual" mode time only moves on __vt.advance(ms),
// so every captured frame is exactly 1/fps apart no matter how long rendering takes.
(() => {
  const realNow = performance.now.bind(performance);
  const realRAF = window.requestAnimationFrame.bind(window);
  const realDateNow = Date.now.bind(Date);
  let vnow = realNow();
  const dateOffset = realDateNow() - vnow;
  let manual = false;
  let lastReal = realNow();
  let rafQ = [];
  const timers = new Map();
  let nextId = 1;

  performance.now = () => vnow;
  Date.now = () => Math.floor(vnow + dateOffset);
  window.requestAnimationFrame = (cb) => { const id = nextId++; rafQ.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { rafQ = rafQ.filter((r) => r.id !== id); };
  window.setTimeout = (cb, ms = 0, ...args) => { const id = nextId++; timers.set(id, { t: vnow + Math.max(0, +ms || 0), cb, args, iv: 0 }); return id; };
  window.setInterval = (cb, ms = 0, ...args) => { const iv = Math.max(1, +ms || 0); const id = nextId++; timers.set(id, { t: vnow + iv, cb, args, iv }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };

  const runTimers = (until) => {
    for (let guard = 0; guard < 5000; guard++) {
      let best = null, bid = 0;
      for (const [id, tm] of timers) if (tm.t <= until && (!best || tm.t < best.t)) { best = tm; bid = id; }
      if (!best) break;
      vnow = Math.max(vnow, best.t);
      if (best.iv) best.t += best.iv; else timers.delete(bid);
      try { if (typeof best.cb === 'function') best.cb(...best.args); } catch (e) { console.error(e); }
    }
    vnow = Math.max(vnow, until);
  };
  const frame = () => {
    const q = rafQ; rafQ = [];
    for (const r of q) { try { r.cb(vnow); } catch (e) { console.error(e); } }
  };
  const pump = () => {
    const r = realNow();
    if (!manual) { runTimers(vnow + Math.min(100, r - lastReal)); frame(); }
    lastReal = r;
    realRAF(pump);
  };
  realRAF(pump);

  // Keep WebGL frames readable after the task that drew them.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl2' || type === 'webgl') attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    return getContext.call(this, type, attrs);
  };

  window.__vt = {
    now: () => vnow,
    manual: (on) => { manual = !!on; lastReal = realNow(); },
    advance: (ms) => { runTimers(vnow + ms); frame(); },
    realFrame: () => new Promise((res) => realRAF(() => realRAF(res))),
  };
})();

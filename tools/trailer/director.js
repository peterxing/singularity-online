// Trailer director: drives the live game engine (offline realm) for deterministic cinematic capture.
// Load order: virtual-time.js (init script) -> game boots -> this file -> shots.js.
(() => {
  const g = window.__game;
  const W = g.net.world;
  const cam = g.gfx.camera;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (k) => k * k * (3 - 2 * k);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

  const TR = (window.TR = {
    g, W, fps: 30,
    shots: [], titles: [], idx: -1, t: 0, T: 0, frameNo: 0,
    cam: { pos: [0, 30, 0], look: [0, 0, -10], fov: 50, roll: 0 },
    camFn: null, focus: null, dayTime: 0.3, hideMe: true, gameCam: false, speed: 1,
    staged: new Set(), events: [], fade: 0, flash: 0,
    ease: { lerp, clamp, smooth, easeInOut, easeOut },
  });

  // ---------------------------------------------------------------- engine hooks
  const ctrl = g.ctrl;
  const origCamera = ctrl._camera.bind(ctrl);
  ctrl._camera = (dt) => {
    if (TR.gameCam || TR.idx < 0) return origCamera(dt);
    const c = TR.cam;
    cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.look[0], c.look[1], c.look[2]);
    if (c.roll) cam.rotateZ(c.roll);
    if (Math.abs(cam.fov - c.fov) > 1e-3) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
  };
  const origDayTime = g.sky.dayTimeFor.bind(g.sky);
  g.sky.dayTimeFor = (t) => (TR.idx >= 0 && TR.dayTime != null ? TR.dayTime : origDayTime(t));
  const origSky = g.sky.update.bind(g.sky);
  g.sky.update = (dt, dayTime, focus, time) => origSky(dt, dayTime, TR.idx >= 0 && TR.focus ? { x: TR.focus[0], y: TR.focus[1], z: TR.focus[2] } : focus, time);
  const origEnts = g.ents.update.bind(g.ents);
  g.ents.update = (...a) => {
    origEnts(...a);
    const me = g.ents.map.get(g.myId);
    if (me && TR.hideMe && TR.idx >= 0) me.obj.visible = false;
    // Softer hit flashes on monsters so a boss under fire keeps its look.
    for (const v of g.ents.map.values()) {
      if (v.kind === 'mob' && v.model && !v.model._trFlash) { v.model._trFlash = true; v.model.flash = function () { this.flashT = Math.max(this.flashT, 0.06); }; }
    }
  };
  const origUpdatePlayer = W._updatePlayer.bind(W);
  W._updatePlayer = (p, dt) => {
    origUpdatePlayer(p, dt);
    if (p.script && p.alive) p.script(p, dt);
  };
  // Push grass away from the lens so blades never poke into close shots.
  const origGrass = g.grass.update.bind(g.grass);
  g.grass.update = (time, camPos, fwd, pushers) => {
    if (TR.idx >= 0 && !TR.gameCam) pushers = [{ x: camPos.x, y: camPos.y - 1.4, z: camPos.z, r: 2.4 }, ...pushers.slice(0, 5)];
    return origGrass(time, camPos, fwd, pushers);
  };
  if (g.audio) { g.audio.volume = 0; g.audio.musicVol = 0; try { g.audio.ctx && g.audio.ctx.suspend(); } catch { /* ignore */ } }
  // Log combat events with trailer time so the soundtrack can place SFX exactly on the frame they happen.
  TR.evlog = [];
  TR.logging = false;
  const origOnEvent = g.onEvent.bind(g);
  g.onEvent = (e) => {
    if (TR.logging && TR.idx >= 0 && TR.t >= 0) {
      const src = g.ents.map.get(e.s), tgt = g.ents.map.get(e.t);
      const cp = cam.position;
      const at = tgt || src;
      const dist = at ? at.pos.distanceTo(cp) : 50;
      let pan = 0;
      if (at) { const v = at.pos.clone().project(cam); pan = Math.max(-1, Math.min(1, v.x)); }
      TR.evlog.push({ T: +TR.T.toFixed(3), k: e.k, ab: e.ab || null, p: e.p || null, d: e.d || 0, c: e.c ? 1 : 0, a: e.a || 0, mob: src && src.kind === 'mob' ? src.info.mt : null, dist: +dist.toFixed(1), pan: +pan.toFixed(2), sp: +(typeof TR.speed === 'function' ? TR.speed(TR.t) : TR.speed).toFixed(2) });
    }
    return origOnEvent(e);
  };

  // ---------------------------------------------------------------- world helpers
  TR.gy = (x, z) => W.terrain.groundAt(x, z);
  TR.hy = (x, z) => Math.max(W.terrain.heightAt ? W.terrain.heightAt(x, z) : W.terrain.groundAt(x, z), 0);
  TR.actor = (champ, x, z, ry = 0, name) => {
    const p = W._createPlayer(name || champ, champ, null);
    p.x = x; p.z = z; p.y = TR.gy(x, z); p.ry = ry;
    p.level = 10; W._recalc(p); p.maxHp = p.hp = 1e7; p.en = p.maxEn;
    p.actor = true;
    TR.staged.add(p.id);
    return p;
  };
  TR.mob = (type, x, z, opts = {}) => {
    const m = W._spawnMob(type, x, z);
    m.spawn = { x, z }; m.ry = opts.ry ?? m.ry; m.spawnRy = m.ry;
    m.nextWander = Infinity;
    if (opts.hp) m.maxHp = m.hp = opts.hp;
    if (opts.frozen !== false) m.def = Object.assign({}, m.def, { aggro: 0, speed: opts.speed ?? 0, leash: 999 });
    if (opts.level) m.level = opts.level;
    m.temp = false;
    TR.staged.add(m.id);
    return m;
  };
  TR.findMob = (type) => [...W.ents.values()].find((e) => e.kind === 'mob' && e.mobType === type);
  TR.cast = (p, ab, tgt, keepMoving) => {
    if (!p || !p.alive) return false;
    p.cds = {}; p.gcdUntil = 0; p.en = p.maxEn; p.casting = null; p.stunUntil = 0;
    if (!keepMoving && p.script && p.script.walk) { TR.hold(p); p.moving = false; }
    const ok = W.tryCast(p, ab, tgt ? tgt.id : 0, true);
    p.autoAttack = false; p.swingAt = W.time + 99;
    if (!ok) console.warn('cast failed', p.champion, ab);
    return ok;
  };
  TR.face = (p, o) => { p.ry = Math.atan2(o.x - p.x, o.z - p.z); };
  TR.walk = (p, x, z, speed = 3, then) => {
    const fn = (e, dt) => {
      e.autoAttack = false;
      if (W._moveToward(e, x, z, speed, dt, 0.05)) { e.moving = false; if (then) then(e); else TR.hold(e); }
    };
    fn.walk = true;
    p.script = fn;
  };
  TR.hold = (p) => { p.script = (e) => { e.moving = false; e.autoAttack = false; }; };
  TR.emote = (p, e) => { p.emote = e; };
  TR.engage = (m, p) => { m.def = Object.assign({}, m.def, { aggro: 30 }); W._engage(m, p); };
  TR.view = (e) => g.ents.map.get(e.id);
  TR.vpos = (e, dy = 0) => { const v = TR.view(e); return v ? [v.pos.x, v.pos.y + dy, v.pos.z] : [e.x, e.y + dy, e.z]; };
  TR.clearStage = () => {
    for (const e of [...W.ents.values()]) {
      if (e.kind === 'summon' && TR.staged.has(e.owner)) W.ents.delete(e.id);
      else if (e.kind === 'mob' && e.temp) W.ents.delete(e.id);
    }
    for (const id of TR.staged) W.ents.delete(id);
    TR.staged.clear();
    W.projectiles.length = 0; W.delayed.length = 0;
    for (const e of W.ents.values()) {
      if (e.kind === 'mob' && e.state !== 'idle' && e.alive) { e.state = 'idle'; e.evading = false; e.target = 0; e.threat.clear(); e.casting = null; e.x = e.spawn.x; e.z = e.spawn.z; }
    }
  };
  // Park bots somewhere far away so they never wander into a shot.
  TR.parkBots = () => {
    let i = 0;
    for (const e of W.ents.values()) if (e.kind === 'player' && e.bot) {
      e.x = 480 - (i % 5) * 6; e.z = 480 - Math.floor(i / 5) * 6; e.y = TR.gy(e.x, e.z); e.script = (b) => { b.moving = false; b.target = 0; b.ai.goal = null; b.ai.think = W.time + 99; b.ai.chatAt = W.time + 999; };
      i++;
    }
  };
  TR.moveMe = (x, z) => {
    const p = W.ents.get(g.myId);
    const y = TR.gy(x, z);
    if (p) { p.x = x; p.z = z; p.y = y; p.lastMv = W.time; }
    ctrl.pos.set(x, y, z); ctrl.vy = 0;
    if (ctrl.dashTarget) ctrl.dashTarget = null;
  };

  // ---------------------------------------------------------------- spot solver
  // Sun azimuth (yaw toward the sun) for a day time, matching sky.js.
  TR.sunYaw = (d) => { const a = (d - 0.25) * Math.PI * 2; return Math.atan2(Math.cos(a) * 0.92, 0.38); };
  const dirV = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  TR.obstacles = () => {
    if (TR._obs) return TR._obs;
    const out = [];
    const sc = g.foliage.scatter;
    for (const t of sc.trees) out.push({ x: t.x, z: t.z, r: (t.type === 'pine' ? 2.2 : 3.4) * (t.s || 1) });
    for (const r of sc.rocks) if (r.s > 0.7) out.push({ x: r.x, z: r.z, r: r.s * 1.1 });
    for (const b of sc.bushes || []) out.push({ x: b.x, z: b.z, r: 1.3 * (b.s || 1) });
    for (const c of g.buildings.colliders) out.push({ x: c.x, z: c.z, r: c.r + 0.6 });
    for (const e of W.ents.values()) if (e.kind === 'npc') out.push({ x: e.x, z: e.z, r: 1.5 });
    TR._obs = out;
    return out;
  };
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  };
  TR.clearSeg = (a, b, pad = 0.6) => {
    const minx = Math.min(a[0], b[0]) - 6, maxx = Math.max(a[0], b[0]) + 6, minz = Math.min(a[1], b[1]) - 6, maxz = Math.max(a[1], b[1]) + 6;
    for (const o of TR.obstacles()) {
      if (o.x < minx || o.x > maxx || o.z < minz || o.z > maxz) continue;
      if (segDist(o.x, o.z, a[0], a[1], b[0], b[1]) < o.r + pad) return false;
    }
    return true;
  };
  TR.flat = (x, z, r = 3, tol = 0.9) => {
    const h0 = W.terrain.heightAt(x, z);
    if (h0 < 0.6) return false;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = W.terrain.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (Math.abs(h - h0) > tol || h < 0.4) return false;
    }
    return true;
  };
  TR.treesBehind = (from, yaw, near = 14, far = 70, half = 0.5) => {
    let n = 0;
    for (const o of TR.obstacles()) {
      const dx = o.x - from[0], dz = o.z - from[1], d = Math.hypot(dx, dz);
      if (d < near || d > far) continue;
      let da = Math.atan2(dx, dz) - yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < half) n++;
    }
    return n;
  };
  // Geometry for one hero shot. kind 'two': hero + target in profile two-shot; kind 'close': 3/4 close-up.
  // heroSide: which third of the frame the hero sits on ('left' | 'right').
  TR.heroGeom = (H, kind, heroSide, dayTime, o = {}) => {
    const sy = TR.sunYaw(dayTime) + (o.lightOff || 0);
    const s = heroSide === 'right' ? 1 : -1;
    if (kind === 'rev') {
      // Reverse angle from behind the target: the hero faces the camera (and the sun) and casts toward the lens.
      const D = o.D || 6.5, back = o.back ?? 1.8, side = o.side ?? 2.2;
      const f = sy + (o.faceOff || 0);
      const F = dirV(f);
      const T = [H[0] + F[0] * D, H[1] + F[1] * D];
      const v0 = [-F[0], -F[1]], right = [-v0[1], v0[0]];
      const C = [T[0] + F[0] * back + right[0] * side * s, T[1] + F[1] * back + right[1] * side * s];
      return { H, f, T, C, F, right, s, D, kind };
    }
    if (kind === 'two') {
      const D = o.D || 8, R = o.R || 7.2;
      const f = s > 0 ? sy - Math.PI / 4 : sy + Math.PI / 4;
      const F = dirV(f);
      const Pp = s > 0 ? [F[1], -F[0]] : [-F[1], F[0]];
      const T = [H[0] + F[0] * D, H[1] + F[1] * D];
      const C = [H[0] + F[0] * D * 0.36 + Pp[0] * R, H[1] + F[1] * D * 0.36 + Pp[1] * R];
      const L = [H[0] + F[0] * D * 0.46, H[1] + F[1] * D * 0.46];
      return { H, f, T, C, L, F, Pp, D, R };
    }
    const R = o.R || 3.6;
    const c = sy - (s > 0 ? -1 : 1) * 0.3;
    const f = c + (s > 0 ? -0.8 : 0.8);
    const C = [H[0] + Math.sin(c) * R, H[1] + Math.cos(c) * R];
    const v = [-Math.sin(c), -Math.cos(c)];
    const right = [-v[1], v[0]];
    const L = [H[0] + right[0] * s * -1.05, H[1] + right[1] * s * -1.05];
    return { H, f, C, L, c, R, T: null };
  };
  TR.findHeroSpot = (center, radius, kind, heroSide, dayTime, o = {}) => {
    let best = null;
    const step = o.step || 3;
    for (let dz = -radius; dz <= radius; dz += step) for (let dx = -radius; dx <= radius; dx += step) {
      if (dx * dx + dz * dz > radius * radius) continue;
      const H = [center[0] + dx, center[1] + dz];
      const G = TR.heroGeom(H, kind, heroSide, dayTime, o);
      if (!TR.flat(H[0], H[1], 3.5) || !TR.flat(G.C[0], G.C[1], 1.5, 1.2)) continue;
      if (!TR.clearSeg(G.C, H, 0.8)) continue;
      if (G.T && G.kind === 'rev' && (!TR.flat(G.T[0], G.T[1], 2.5) || !TR.clearSeg(H, G.T, 0.9) || !TR.clearSeg(G.C, G.T, 0.5))) continue;
      else if (G.T && G.kind !== 'rev' && (!TR.flat(G.T[0], G.T[1], 3) || !TR.clearSeg(G.C, G.T, 0.8) || !TR.clearSeg(H, G.T, 0.8))) continue;
      if (!TR.clearSeg(H, [H[0] + 0.01, H[1]], 2.2)) continue;
      const viewYaw = G.kind === 'rev' ? Math.atan2(H[0] - G.C[0], H[1] - G.C[1]) : Math.atan2(G.L[0] - G.C[0], G.L[1] - G.C[1]);
      const hy = W.terrain.heightAt(H[0], H[1]);
      if (Math.abs(W.terrain.heightAt(G.C[0], G.C[1]) - hy) > 1.2) continue;
      const score = Math.min(18, TR.treesBehind(H, viewYaw)) + (o.prefer ? o.prefer(H, G) : 0) - Math.hypot(dx, dz) * 0.04;
      if (!best || score > best.score) best = { ...G, score };
    }
    return best;
  };

  // ---------------------------------------------------------------- camera helpers
  // Catmull-Rom through keyframes [{t, pos, look, fov, roll}] with eased time.
  const cr = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  TR.path = (keys, ease = easeInOut) => (t) => {
    const n = keys.length;
    if (n === 1) return keys[0];
    const T0 = keys[0].t, T1 = keys[n - 1].t;
    const u = clamp((t - T0) / (T1 - T0), 0, 1);
    const tt = T0 + ease(u) * (T1 - T0);
    let i = 0;
    while (i < n - 2 && tt > keys[i + 1].t) i++;
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
    const s = clamp((tt - k1.t) / (k2.t - k1.t), 0, 1);
    const V = (f) => [0, 1, 2].map((j) => cr(k0[f][j], k1[f][j], k2[f][j], k3[f][j], s));
    return { pos: V('pos'), look: V('look'), fov: cr(k0.fov ?? 50, k1.fov ?? 50, k2.fov ?? 50, k3.fov ?? 50, s), roll: lerp(k1.roll || 0, k2.roll || 0, s) };
  };
  // Orbit around a (possibly moving) point.
  TR.orbit = ({ center, r0, r1 = r0, a0, a1, h0, h1 = h0, lookDy = 0, fov = 40, dur }) => (t) => {
    const k = easeInOut(clamp(t / dur, 0, 1));
    const c = typeof center === 'function' ? center(t) : center;
    const a = lerp(a0, a1, k), r = lerp(r0, r1, k), h = lerp(h0, h1, k);
    return { pos: [c[0] + Math.sin(a) * r, c[1] + h, c[2] + Math.cos(a) * r], look: [c[0], c[1] + lookDy, c[2]], fov: typeof fov === 'function' ? fov(k) : fov };
  };

  // ---------------------------------------------------------------- overlay (titles, fades)
  const css = document.createElement('style');
  css.textContent = `
  #trOverlay { position: fixed; inset: 0; z-index: 200; pointer-events: none; overflow: hidden; font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif; }
  #trOverlay .tt { position: absolute; left: 0; right: 0; text-align: center; opacity: 0; will-change: opacity, transform; }
  #trOverlay .cap { top: 44%; font-size: 46px; letter-spacing: 14px; color: #f4ecd8; text-transform: uppercase; text-shadow: 0 0 30px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.9); font-weight: 400; }
  #trOverlay .cap small { display: block; font-size: 20px; letter-spacing: 9px; color: #cfd6e4; margin-top: 16px; }
  #trOverlay .big { top: 37%; font-size: 128px; letter-spacing: 34px; font-weight: 700; text-transform: uppercase; padding-left: 34px; }
  #trOverlay .big.eacc { background: linear-gradient(180deg, #fff3c4 0%, #ffb347 45%, #d8480e 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 26px rgba(255,120,30,0.65)) drop-shadow(0 4px 6px rgba(0,0,0,0.8)); }
  #trOverlay .big.ea { background: linear-gradient(180deg, #ffffff 0%, #9fe3ff 45%, #2f7bff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 26px rgba(80,170,255,0.7)) drop-shadow(0 4px 6px rgba(0,0,0,0.8)); }
  #trOverlay .sub { top: 58.5%; font-size: 30px; letter-spacing: 10px; text-transform: uppercase; text-shadow: 0 2px 8px rgba(0,0,0,0.95); padding: 12px 0 12px 10px; background: linear-gradient(90deg, rgba(0,0,0,0) 12%, rgba(0,0,0,0.5) 32%, rgba(0,0,0,0.5) 68%, rgba(0,0,0,0) 88%); }
  #trOverlay .sub.eacc { color: #ffd9a8; } #trOverlay .sub.ea { color: #cfeaff; }
  #trOverlay .big.moloch { background: linear-gradient(180deg, #ffe3b8 0%, #ff5a1a 48%, #5a0600 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 34px rgba(255,60,10,0.85)) drop-shadow(0 4px 6px rgba(0,0,0,0.9)); }
  #trOverlay .sub.moloch { color: #ffb48f; }
  #trOverlay .lt { left: 70px; right: auto; bottom: 110px; text-align: left; padding: 26px 60px 26px 40px; background: radial-gradient(ellipse at 20% 55%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 72%); }
  #trOverlay .lt.r { left: auto; right: 70px; text-align: right; padding: 26px 40px 26px 60px; background: radial-gradient(ellipse at 80% 55%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 72%); }
  #trOverlay .lt .tag { font-family: 'Segoe UI', sans-serif; font-size: 18px; letter-spacing: 6px; font-weight: 600; text-transform: uppercase; padding: 4px 12px; border-radius: 3px; display: inline-block; margin-bottom: 10px; }
  #trOverlay .lt .tag.eacc { background: rgba(255,110,30,0.85); color: #fff; } #trOverlay .lt .tag.ea { background: rgba(50,130,255,0.85); color: #fff; }
  #trOverlay .lt .nm { font-size: 76px; letter-spacing: 6px; color: #fff; text-transform: uppercase; font-weight: 700; line-height: 1; text-shadow: 0 0 24px rgba(0,0,0,0.85), 0 3px 4px rgba(0,0,0,0.9); }
  #trOverlay .lt .ti { font-size: 32px; font-style: italic; color: #f0d27a; margin-top: 8px; text-shadow: 0 2px 6px rgba(0,0,0,0.95); }
  #trOverlay .lt .ab { font-family: 'Segoe UI', sans-serif; font-size: 20px; letter-spacing: 4px; color: rgba(255,255,255,0.85); margin-top: 12px; text-transform: uppercase; text-shadow: 0 2px 6px rgba(0,0,0,0.95); }
  #trOverlay .logo { top: 30%; }
  #trOverlay .logo .l1 { font-size: 132px; letter-spacing: 26px; font-weight: 700; background: linear-gradient(180deg, #fff6d0, #e8c46a 50%, #8a5a1a); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 6px 22px rgba(232,196,106,0.45)) drop-shadow(0 3px 3px rgba(0,0,0,0.8)); padding-left: 26px; }
  #trOverlay .logo .l2 { font-size: 48px; letter-spacing: 44px; color: #6fe3ff; margin-top: -4px; text-shadow: 0 0 28px rgba(111,227,255,0.8), 0 2px 4px rgba(0,0,0,0.8); padding-left: 44px; }
  #trOverlay .logo .l3 { margin-top: 28px; font-size: 28px; letter-spacing: 12px; color: #e9e2d0; text-transform: uppercase; text-shadow: 0 2px 8px rgba(0,0,0,0.95); }
  #trOverlay .cta { top: 70%; font-family: 'Segoe UI', sans-serif; }
  #trOverlay .cta .c1 { font-size: 30px; letter-spacing: 5px; color: #fff; text-transform: uppercase; font-weight: 600; text-shadow: 0 2px 8px rgba(0,0,0,0.95); }
  #trOverlay .cta .c2 { display: inline-block; margin-top: 18px; font-size: 34px; letter-spacing: 2px; color: #ffe7a8; padding: 10px 26px; border: 2px solid rgba(232,196,106,0.85); border-radius: 8px; background: rgba(8,10,18,0.55); text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
  #trOverlay .disc { bottom: 26px; top: auto; font-family: 'Segoe UI', sans-serif; font-size: 15px; color: rgba(255,255,255,0.62); letter-spacing: 1px; }
  #trOverlay .hud { top: auto; bottom: 150px; font-family: 'Segoe UI', sans-serif; font-size: 34px; letter-spacing: 8px; color: #fff; text-transform: uppercase; font-weight: 600; text-shadow: 0 0 18px rgba(0,0,0,0.9), 0 2px 4px #000; }
  #trOverlay .hud.top { top: 15%; bottom: auto; }
  #trOverlay .cap.low { top: 72%; font-size: 40px; }
  #trFade { position: fixed; inset: 0; background: #000; opacity: 0; z-index: 199; pointer-events: none; }
  #trFlash { position: fixed; inset: 0; background: #fff; opacity: 0; z-index: 198; pointer-events: none; mix-blend-mode: screen; }
  #trVignette { position: fixed; inset: 0; z-index: 197; pointer-events: none; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%); }
  body.tr-clean #hud, body.tr-clean #plates, body.tr-clean #fct, body.tr-clean #select, body.tr-clean #touch, body.tr-clean #rotateHint, body.tr-clean #tooltip { display: none !important; }
  #zoneText, #bannerText, #errorText, #death, #disconnect, #fps { display: none !important; }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'trOverlay'; document.body.appendChild(root);
  const fadeEl = document.createElement('div'); fadeEl.id = 'trFade'; document.body.appendChild(fadeEl);
  const flashEl = document.createElement('div'); flashEl.id = 'trFlash'; document.body.appendChild(flashEl);
  const vig = document.createElement('div'); vig.id = 'trVignette'; document.body.appendChild(vig);

  // title: { t0, t1, cls, html, fin, fout, anim: 'fade'|'rise'|'zoom'|'slide'|'spread' }
  TR.addTitle = (o) => {
    const el = document.createElement('div');
    el.className = 'tt ' + (o.cls || 'cap');
    el.innerHTML = o.html;
    root.appendChild(el);
    TR.titles.push(Object.assign({ fin: 0.45, fout: 0.45, anim: 'fade' }, o, { el }));
  };
  TR.updateTitles = (T) => {
    for (const o of TR.titles) {
      const { t0, t1, fin, fout, el } = o;
      if (T < t0 - 0.01 || T > t1 + 0.01) { if (el.style.opacity !== '0') el.style.opacity = '0'; continue; }
      const a = clamp(Math.min((T - t0) / fin, (t1 - T) / fout), 0, 1);
      const k = (T - t0) / Math.max(0.01, t1 - t0);
      let tr = '';
      if (o.anim === 'rise') tr = `translateY(${(1 - easeOut(clamp((T - t0) / (fin * 1.6), 0, 1))) * 28}px)`;
      else if (o.anim === 'zoom') tr = `scale(${1.0 + k * 0.06})`;
      else if (o.anim === 'slam') tr = `scale(${1 + (1 - easeOut(clamp((T - t0) / 0.35, 0, 1))) * 0.35 + k * 0.05})`;
      else if (o.anim === 'slide') tr = `translateX(${(o.cls || '').includes(' r') ? 1 : -1}${(1 - easeOut(clamp((T - t0) / (fin * 1.4), 0, 1))) * 60}px)`;
      else if (o.anim === 'spread') el.style.letterSpacing = `${(o.ls0 || 10) + k * (o.ls1 || 6)}px`;
      el.style.opacity = String(smooth(a));
      el.style.transform = tr;
    }
  };
  TR.setFade = (v) => { fadeEl.style.opacity = String(clamp(v, 0, 1)); };
  TR.setFlash = (v) => { flashEl.style.opacity = String(clamp(v, 0, 1)); };

  // ---------------------------------------------------------------- shot runner
  // shot: { name, start (global s), dur, pre (preroll s), speed, dayTime, focus, me:[x,z], setup(S), cam(t,S), events:[[t, fn]], hud, fade(t) }
  TR.defineShots = (list) => {
    TR.shots = list;
    let t = 0;
    for (const s of list) { if (s.start == null) s.start = t; t = s.start + s.dur; }
    TR.total = t;
  };
  TR.begin = (i) => {
    const s = TR.shots[i];
    TR.idx = i; TR.cur = s; TR.frameNo = 0;
    TR.clearStage();
    TR.parkBots();
    document.body.classList.toggle('tr-clean', !s.hud);
    TR.gameCam = !!s.gameCam;
    TR.hideMe = s.hideMe !== false;
    TR.dayTime = s.dayTime ?? 0.3;
    TR.speed = s.speed || 1;
    g.ents.showPlates = !!s.plates;
    const q = g.gfx.q;
    const wantRange = s.shadowRange || TR.baseShadowRange;
    if (q.shadowRange !== wantRange) { q.shadowRange = wantRange; g.sky.applyShadowQuality(); }
    if (s.me) TR.moveMe(s.me[0], s.me[1]);
    // The hidden camera-operator player must never be attacked or aggro anything.
    const meEnt = W.ents.get(g.myId);
    if (meEnt) {
      if (s.hud) { meEnt.faction = meEnt.ch.faction; }
      else { meEnt.faction = 'neutral'; meEnt.hp = meEnt.maxHp; meEnt.auras = []; meEnt.target = 0; meEnt.autoAttack = false; }
    }
    // Park wild mobs near the set so nothing unscripted walks into frame.
    if (s.clearR) {
      const c = s.clearAt || (s.focus && typeof s.focus !== 'function' ? [s.focus[0], s.focus[2]] : s.me);
      let n = 0;
      for (const e of W.ents.values()) {
        if (e.kind !== 'mob' || TR.staged.has(e.id) || e.def.boss || e.def.guard) continue;
        if (Math.hypot(e.x - c[0], e.z - c[1]) < s.clearR) { e.x = e.spawn.x = -490 + (n % 8) * 5; e.z = e.spawn.z = 470 - Math.floor(n / 8) * 5; e.y = TR.gy(e.x, e.z); e.goal = null; n++; }
      }
    }
    TR.S = { t: 0 };
    if (s.setup) s.setup(TR.S);
    TR.events = (s.events || []).map(([t, fn]) => ({ t, fn, done: false }));
    TR.t = -(s.pre ?? 1.0);
    TR.applyCam();
    return { frames: Math.round(s.dur * TR.fps), pre: Math.round((s.pre ?? 1.0) * TR.fps) };
  };
  TR.applyCam = () => {
    const s = TR.cur;
    const c = s.cam ? s.cam(Math.max(0, TR.t), TR.S) : null;
    if (c) { TR.cam = { pos: c.pos, look: c.look, fov: c.fov ?? 50, roll: c.roll || 0 }; }
    TR.focus = s.focus ? (typeof s.focus === 'function' ? s.focus(Math.max(0, TR.t), TR.S) : s.focus) : (c ? c.look : null);
  };
  // Advance one frame. Returns the global time of the frame that was rendered.
  TR.frame = () => {
    const s = TR.cur;
    const dt = 1 / TR.fps;
    for (const ev of TR.events) if (!ev.done && ev.t <= TR.t + 1e-6) { ev.done = true; try { ev.fn(TR.S); } catch (e) { console.error('event', e); } }
    TR.applyCam();
    if (s.onFrame) s.onFrame(Math.max(0, TR.t), TR.S);
    const T = s.start + Math.max(0, TR.t);
    TR.T = T;
    TR.updateTitles(TR.t >= 0 ? T : -99);
    TR.setFade(TR.fadeAt ? TR.fadeAt(T) : 0);
    TR.setFlash(TR.flashAt ? TR.flashAt(T) : 0);
    const sp = typeof TR.speed === 'function' ? TR.speed(Math.max(0, TR.t)) : TR.speed;
    window.__vt.advance(dt * 1000 * sp);
    try { g.gfx.renderer.getContext().finish(); } catch { /* ignore */ }
    TR.t += dt;
    TR.frameNo++;
    return T;
  };
  // Redraw the current state without advancing time (used to retake a torn capture).
  TR.redraw = () => { g.gfx.render(g.time); try { g.gfx.renderer.getContext().finish(); } catch { /* ignore */ } };
  // Stacked additive VFX can overflow half-float buffers to Inf/NaN; bloom then smears them into black blocks.
  // This pass, inserted right after the scene render, zeroes non-finite pixels and clamps HDR highlights.
  TR.sanitize = async () => {
    if (TR._sanitized) return;
    const { ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js');
    const pass = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); c.rgb = clamp(c.rgb, 0.0, 40.0); gl_FragColor = c; }',
    });
    g.gfx.composer.insertPass(pass, 1);
    TR._sanitized = true;
  };
  // Detect a torn/black-blocked frame by sampling a downscaled copy of the canvas on a 12x6 grid.
  const tc = document.createElement('canvas'); tc.width = 96; tc.height = 54;
  const tx = tc.getContext('2d', { willReadFrequently: true });
  TR.torn = () => {
    tx.drawImage(g.gfx.renderer.domElement, 0, 0, 96, 54);
    const d = tx.getImageData(0, 0, 96, 54).data;
    for (let cx = 0; cx < 12; cx++) for (let cy = 0; cy < 6; cy++) {
      let s = 0, n = 0;
      for (let y = cy * 9; y < cy * 9 + 9; y++) for (let x = cx * 8; x < cx * 8 + 8; x++) { const i = (y * 96 + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n++; }
      if (s / n < 3) return true;
    }
    return false;
  };
  TR.baseShadowRange = g.gfx.q.shadowRange;
  TR.ready = TR.sanitize();
})();

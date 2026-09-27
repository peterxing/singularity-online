import * as THREE from 'three';
import { angleLerp, clamp } from '../shared/rng.js';

const V3 = THREE.Vector3;

export class Controller {
  constructor(game) {
    this.g = game;
    this.pos = new V3();
    this.vy = 0;
    this.grounded = true;
    this.swim = false;
    this.yaw = 0;
    this.camYaw = 0;
    this.camPitch = 0.3;
    this.dist = 8.5;
    this.distCur = 8.5;
    this.keys = new Set();
    this.mouse = { l: false, r: false, x: 0, y: 0, downX: 0, downY: 0, moved: 0, btn: -1 };
    this.speedNow = 0;
    this.moveBack = false;
    this.strafeDir = 0;
    this.sendT = 0;
    this.lastSent = { x: 0, y: 0, z: 0, ry: 0, t: 0 };
    this.enabled = false;
    this.dash = null;
    this.grid = new Map();
    this.sens = 0.0042;
    this.invert = false;
    this.target = new V3();
    this.camPos = new V3();
    this.autorun = false;
    this.speedMul = 1;
    this.stunned = false;
    this.rooted = false;
    this.dead = false;
    this.speed = 7;
    this._bind();
  }

  setColliders(list) {
    this.grid.clear();
    for (const c of list) {
      const x0 = Math.floor((c.x - c.r) / 8), x1 = Math.floor((c.x + c.r) / 8);
      const z0 = Math.floor((c.z - c.r) / 8), z1 = Math.floor((c.z + c.r) / 8);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const k = i * 100000 + j;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
    }
  }

  typing() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  }

  _bind() {
    const canvas = document.getElementById('game');
    window.addEventListener('keydown', (e) => {
      if (this.typing()) return;
      const k = e.code;
      if (k === 'Tab' || k === 'Space') e.preventDefault();
      if (!this.keys.has(k)) this.g.onKey(k, e);
      this.keys.add(k);
      if (k === 'NumLock' || k === 'Backquote') this.autorun = !this.autorun;
      if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(k)) this.autorun = false;
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (e.button === 0) this.mouse.l = true;
      if (e.button === 2) this.mouse.r = true;
      this.mouse.btn = e.button;
      this.mouse.downX = e.clientX; this.mouse.downY = e.clientY; this.mouse.moved = 0;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.mouse.x, dy = e.clientY - this.mouse.y;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (!this.enabled && !this.g.selectMode) return;
      if (this.mouse.l || this.mouse.r) {
        this.mouse.moved += Math.abs(dx) + Math.abs(dy);
        if (this.mouse.moved > 3) {
          this.camYaw -= dx * this.sens;
          this.camPitch = clamp(this.camPitch + dy * this.sens * (this.invert ? -1 : 1), -0.5, 1.35);
          if (this.mouse.r && this.enabled && !this.stunned && !this.dead) this.yaw = this.camYaw;
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      const click = this.mouse.moved <= 4;
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
      if (click && e.target === canvas) this.g.onClick(e.clientX, e.clientY, e.button === 2 ? 'right' : 'left');
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.12), 2.2, 34);
    }, { passive: false });
  }

  orbit(dx, dy) {
    this.camYaw -= dx * this.sens;
    this.camPitch = clamp(this.camPitch + dy * this.sens * (this.invert ? -1 : 1), -0.5, 1.35);
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z);
    this.vy = 0;
    this.dash = null;
  }

  dashTo(x, y, z, dur) {
    if (dur <= 0.01) { this.teleport(x, y, z); return; }
    this.dash = { from: this.pos.clone(), to: new V3(x, y, z), t: 0, dur };
  }

  _collide(p) {
    const cx = Math.floor(p.x / 8), cz = Math.floor(p.z / 8);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
        const list = this.grid.get(i * 100000 + j);
        if (!list) continue;
        for (const c of list) {
          const dx = p.x - c.x, dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + 0.42;
          if (d < min && d > 1e-4) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
        }
      }
    }
  }

  update(dt) {
    const T = this.g.terrain;
    const k = this.keys;
    const active = this.enabled && !this.typing();
    let fwd = 0, strafe = 0, turn = 0;
    if (active) {
      if (k.has('KeyW') || k.has('ArrowUp') || (this.mouse.l && this.mouse.r) || this.autorun) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      const steer = this.mouse.r;
      if (k.has('KeyA') || k.has('ArrowLeft')) { if (steer) strafe += 1; else turn += 1; }
      if (k.has('KeyD') || k.has('ArrowRight')) { if (steer) strafe -= 1; else turn -= 1; }
      if (k.has('KeyQ')) strafe += 1;
      if (k.has('KeyE')) strafe -= 1;
    }
    const locked = this.stunned || this.dead;
    if (locked) { fwd = 0; strafe = 0; turn = 0; }
    if (this.rooted) { fwd = 0; strafe = 0; }
    if (turn) { const d = turn * 2.7 * dt; this.yaw += d; if (!this.mouse.l) this.camYaw += d; }
    const ground0 = T.heightAt(this.pos.x, this.pos.z);
    this.swim = ground0 < -1.25 && this.pos.y < 0.2;
    let spd = this.speed * this.speedMul * (fwd < 0 ? 0.6 : 1) * (this.swim ? 0.72 : 1);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    let mx = fx * fwd + lx * strafe, mz = fz * fwd + lz * strafe;
    const tm = this.g.touchCtl ? this.g.touchCtl.move : null;
    const joy = !!(tm && tm.active && active && !locked && !this.rooted);
    if (joy) {
      let dx = Math.sin(this.camYaw) * -tm.y - Math.cos(this.camYaw) * tm.x;
      let dz = Math.cos(this.camYaw) * -tm.y + Math.sin(this.camYaw) * tm.x;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      const kk = Math.min(1, tm.mag * 1.15);
      mx = dx * kk; mz = dz * kk;
      this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 14));
      spd = this.speed * this.speedMul * (this.swim ? 0.72 : 1);
      fwd = 1; strafe = 0;
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    this.moveBack = fwd < 0;
    this.strafeDir = fwd === 0 ? strafe : 0;
    const oldX = this.pos.x, oldZ = this.pos.z;
    if (this.dash) {
      this.dash.t += dt;
      const t = Math.min(1, this.dash.t / this.dash.dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.pos.lerpVectors(this.dash.from, this.dash.to, e);
      if (t >= 1) { this.dash = null; this.vy = 0; }
    } else if (ml > 0) {
      const nx = this.pos.x + mx * spd * dt, nz = this.pos.z + mz * spd * dt;
      const tryMove = (x, z) => {
        const h1 = T.heightAt(x, z);
        const step = Math.hypot(x - this.pos.x, z - this.pos.z);
        const rise = h1 - Math.max(ground0, -1.25);
        if (!this.swim && rise > 0.35 && rise / Math.max(step, 1e-3) > 1.35) return false;
        if (Math.abs(x) > 500 || Math.abs(z) > 500) return false;
        return true;
      };
      if (tryMove(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
      else if (tryMove(nx, this.pos.z)) this.pos.x = nx;
      else if (tryMove(this.pos.x, nz)) this.pos.z = nz;
      this._collide(this.pos);
    }
    // vertical
    const ground = T.heightAt(this.pos.x, this.pos.z);
    if (!this.dash) {
      if (ground < -1.25) {
        const surf = -1.1;
        if (this.pos.y > surf + 0.05) { this.vy -= 22 * dt; this.pos.y += this.vy * dt; if (this.pos.y <= surf) { this.pos.y = surf; this.vy = 0; } }
        else { this.pos.y += (surf - this.pos.y) * Math.min(1, dt * 6); this.vy = 0; }
        this.grounded = true;
        this.swim = true;
      } else {
        this.vy -= 22 * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= ground) {
          if (!this.grounded && this.vy < -6) this.g.onLand();
          this.pos.y = ground; this.vy = 0; this.grounded = true;
        } else if (this.pos.y > ground + 0.35) this.grounded = false;
        if (this.grounded && this.pos.y > ground) this.pos.y = Math.max(ground, this.pos.y - dt * 8);
      }
    }
    if (((active && k.has('Space')) || this.touchJump) && !locked && this.grounded && !this.swim && !this.dash) {
      this.vy = 8.4; this.grounded = false; this.pos.y += 0.05; this.g.onJump();
    }
    this.touchJump = false;
    const moved = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ);
    this.speedNow += ((dt > 0 ? moved / dt : 0) - this.speedNow) * Math.min(1, dt * 12);
    // camera auto-follow
    if (joy) { if (-tm.y > 0.75 && Math.abs(tm.x) < 0.3) this.camYaw = angleLerp(this.camYaw, this.yaw, 1 - Math.exp(-dt * 1.1)); }
    else if (!this.mouse.l && !this.mouse.r && (ml > 0 || turn)) this.camYaw = angleLerp(this.camYaw, this.yaw, 1 - Math.exp(-dt * (ml > 0 ? 2.2 : 0)));
    this.distCur += (this.dist - this.distCur) * Math.min(1, dt * 8);
    this._camera(dt);
    // network
    this.sendT += dt;
    const ls = this.lastSent;
    const changed = Math.hypot(this.pos.x - ls.x, this.pos.z - ls.z) > 0.03 || Math.abs(this.pos.y - ls.y) > 0.1 || Math.abs(this.yaw - ls.ry) > 0.02;
    if (this.enabled && ((changed && this.sendT > 1 / 15) || this.sendT > 0.5)) {
      this.sendT = 0;
      const anim = this.swim ? 5 : !this.grounded ? 4 : this.speedNow > 0.3 ? 1 : 0;
      this.g.net.send({ t: 'mv', x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), ry: +this.yaw.toFixed(3), a: anim });
      ls.x = this.pos.x; ls.y = this.pos.y; ls.z = this.pos.z; ls.ry = this.yaw;
    }
  }

  _camera(dt) {
    const cam = this.g.gfx.camera;
    const T = this.g.terrain;
    const scale = this.g.myScale || 1;
    const tgt = new V3(this.pos.x, this.pos.y + 1.65 * scale, this.pos.z);
    if (this.target.lengthSq() === 0) this.target.copy(tgt);
    this.target.lerp(tgt, 1 - Math.exp(-dt * 20));
    const p = this.camPitch;
    const dir = new V3(Math.sin(this.camYaw) * Math.cos(p), -Math.sin(p), Math.cos(this.camYaw) * Math.cos(p));
    let d = this.distCur;
    const cp = this.target.clone().addScaledVector(dir, -d);
    for (let i = 1; i <= 6; i++) {
      const f = i / 6;
      const sx = this.target.x - dir.x * d * f, sz = this.target.z - dir.z * d * f;
      const sy = this.target.y - dir.y * d * f;
      const h = Math.max(T.heightAt(sx, sz), 0) + 0.45;
      if (sy < h) { cp.y = Math.max(cp.y, h + (cp.y - sy)); }
    }
    const hc = Math.max(T.heightAt(cp.x, cp.z), -0.2) + 0.5;
    if (cp.y < hc) cp.y = hc;
    const tr = this.g.vfx.trauma;
    if (tr > 0) {
      const s = tr * tr * 0.5;
      cp.x += (Math.random() - 0.5) * s; cp.y += (Math.random() - 0.5) * s; cp.z += (Math.random() - 0.5) * s;
    }
    cam.position.copy(cp);
    cam.lookAt(this.target);
    this.camPos.copy(cp);
  }
}

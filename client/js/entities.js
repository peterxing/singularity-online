import * as THREE from 'three';
import { CHAMPIONS, NPCS, MOBS, FACTIONS } from '../shared/data.js';
import { FLAGS } from '../shared/world.js';
import { angleLerp } from '../shared/rng.js';
import { CharacterModel, NPC_LOOKS, enrichChampionLook } from './characters.js';
import { createMobModel } from './mobs.js';
import { markerTexture } from './textures.js';

const V3 = THREE.Vector3;
const tmp = new V3();
const RADIUS = { paperclip: 0.8, wraith: 0.9, imp: 0.6, golem: 1.3, shoggoth: 1.4, basilisk: 2.4, moloch: 3.2 };

export function isHostile(myFaction, v) {
  if (!v || v.kind === 'npc' || v.kind === 'node') return false;
  const f = v.info.f;
  if (f === 'neutral') return false;
  if (f === 'monster') return true;
  return f !== myFaction;
}

class View {
  constructor(ents, info) {
    this.ents = ents;
    this.id = info.id;
    this.info = info;
    this.kind = info.k;
    this.model = ents.makeModel(info);
    this.obj = this.model.object;
    ents.scene.add(this.obj);
    this.pos = new V3();
    this.ry = 0;
    this.renderRy = 0;
    this.buf = [];
    this.hp = info.mh; this.mh = info.mh;
    this.flags = 0; this.target = 0; this.level = info.l; this.anim = 0; this.emote = 0;
    this.speed = 0; this.prev = new V3(); this.init = false;
    this.cast = null; this.castW = 0;
    this.attackT = 99; this.hitT = 99; this.attackAlt = false;
    this.deadT = 0; this.fade = 1;
    this.radius = info.k === 'mob' ? (RADIUS[info.mt] || 0.7) : 0.55;
    this.height = this.model.height * (this.model.scale || 1);
    if (info.k === 'mob' && ['paperclip', 'wraith'].includes(info.mt)) this.height = this.model.height;
    this.bubble = null; this.bubbleUntil = 0;
    this.shield = null; this.stars = null; this.marker = null; this.markerType = null;
    this.glowT = 0;
    this._makePlate();
  }

  _makePlate() {
    const el = document.createElement('div');
    el.className = 'plate';
    el.innerHTML = '<div class="bw"></div><div class="pn"></div><div class="pt"></div><div class="ph"><div></div></div><div class="cb" style="display:none"><div></div></div>';
    this.ents.plates.appendChild(el);
    this.plate = el;
    this.plateName = el.children[1];
    this.plateTitle = el.children[2];
    this.plateHp = el.children[3];
    this.plateHpFill = el.children[3].firstChild;
    this.plateCast = el.children[4];
    this.plateCastFill = el.children[4].firstChild;
    this.plateBubble = el.children[0];
    this._refreshPlate();
  }

  _refreshPlate() {
    const i = this.info;
    this.plateName.textContent = i.n;
    let title = '';
    if (i.k === 'player') title = `‹${CHAMPIONS[i.c]?.name || ''}›${i.ti ? ' ' + i.ti : ''}`;
    else if (i.k === 'npc') title = i.ti ? `<${i.ti}>` : '';
    else if (i.k === 'mob') title = i.bs ? `Level ${this.level} · Boss` : `Level ${this.level}${i.el ? ' · Elite' : ''}${i.ti ? ' · ' + i.ti : ''}`;
    this.plateTitle.textContent = title;
    this._lastLevel = this.level;
  }

  get dead() { return (this.flags & FLAGS.F_DEAD) !== 0; }

  dispose() {
    this.ents.scene.remove(this.obj);
    this.model.dispose();
    this.plate.remove();
    if (this.selDecal) this.ents.g.vfx.removeDecal(this.selDecal);
  }
}

export class Entities {
  constructor(game) {
    this.g = game;
    this.scene = game.gfx.scene;
    this.map = new Map();
    this.plates = document.getElementById('plates');
    this.meId = 0;
    this.lastTm = 0;
    this.lastRecv = 0;
    this.markerTex = { '!': markerTexture('!'), '?': markerTexture('?'), 'g?': markerTexture('?', '#b8b8b8') };
    this.showPlates = true;
  }

  makeModel(info) {
    switch (info.k) {
      case 'player': {
        const ch = CHAMPIONS[info.c] || CHAMPIONS.elon;
        return new CharacterModel(enrichChampionLook(ch), { cacheKey: 'c:' + ch.id, seed: 1 });
      }
      case 'npc': {
        const preset = NPCS[info.npc]?.model.preset || 'scholar';
        const look = { ...NPC_LOOKS[preset], hover: preset === 'oracle' };
        return new CharacterModel(look, { cacheKey: 'n:' + preset, seed: 2 });
      }
      case 'mob': return createMobModel(info.mt);
      case 'summon': return createMobModel(info.w);
      case 'node': return createMobModel('sheaf');
      default: return createMobModel('sheaf');
    }
  }

  get me() { return this.map.get(this.meId); }

  add(info) {
    if (this.map.has(info.id)) this.remove(info.id);
    const v = new View(this, info);
    this.map.set(info.id, v);
    return v;
  }

  remove(id) {
    const v = this.map.get(id);
    if (!v) return;
    v.dispose();
    this.map.delete(id);
    if (this.g.targetId === id) this.g.setTarget(0);
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  applySnapshot(msg) {
    this.lastTm = msg.tm;
    this.lastRecv = performance.now();
    if (msg.add) for (const info of msg.add) this.add(info);
    if (msg.rem) for (const id of msg.rem) this.remove(id);
    for (const r of msg.e) {
      const v = this.map.get(r[0]);
      if (!v) continue;
      const wasDead = v.dead;
      v.buf.push({ t: msg.tm, x: r[1], y: r[2], z: r[3], ry: r[4] });
      if (v.buf.length > 6) v.buf.shift();
      if (!v.init) {
        v.init = true;
        v.pos.set(r[1], r[2], r[3]); v.ry = v.renderRy = r[4]; v.prev.copy(v.pos);
        v.obj.position.copy(v.pos); v.obj.rotation.y = v.ry;
      }
      if (r[5] < v.hp && v.id !== this.meId) v.hitT = 0;
      v.hp = r[5]; v.mh = r[6]; v.flags = r[7]; v.target = r[8];
      if (v.level !== r[9]) { v.level = r[9]; v._refreshPlate(); }
      v.anim = r[10]; v.emote = r[11] || 0;
      if (!(v.flags & FLAGS.F_CAST) && v.cast && !v.cast.channel) v.cast = null;
      if (wasDead && !v.dead) { v.fade = 0; v.deadT = 0; v.model.setFade(0.01); v.obj.visible = true; }
      if (!wasDead && v.dead) { v.deadT = 0; v.cast = null; }
    }
  }

  renderTime() {
    return this.lastTm + (performance.now() - this.lastRecv) / 1000 - 0.12;
  }

  setMarker(v, type) {
    if (v.markerType === type) return;
    v.markerType = type;
    if (v.marker) { v.obj.remove(v.marker); v.marker.material.dispose(); v.marker = null; }
    if (!type) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTex[type], depthWrite: false, fog: false }));
    s.scale.setScalar(1.25 / (v.model.scale || 1));
    s.position.y = (v.height + 0.9) / (v.model.scale || 1);
    s.renderOrder = 10;
    v.obj.add(s);
    v.marker = s;
  }

  update(dt, camera, myFaction, targetId, time) {
    const rt = this.renderTime();
    const w = window.innerWidth, h = window.innerHeight;
    const camPos = camera.position;
    const vfx = this.g.vfx;
    for (const v of this.map.values()) {
      // position
      if (v.id === this.meId) {
        const c = this.g.ctrl;
        v.pos.copy(c.pos);
        v.ry = c.yaw;
        v.renderRy = c.yaw;
        v.speed = c.speedNow;
      } else if (v.buf.length) {
        const b = v.buf;
        let a = b[0], c = b[b.length - 1];
        for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; break; }
        let k = c.t > a.t ? (rt - a.t) / (c.t - a.t) : 1;
        if (rt > c.t) { a = c; k = 0; }
        k = Math.max(0, Math.min(1, k));
        tmp.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
        if (v.dashTo && performance.now() < v.dashUntil) tmp.lerpVectors(v.pos, v.dashTo, Math.min(1, dt * 12));
        const moved = Math.hypot(tmp.x - v.pos.x, tmp.z - v.pos.z);
        v.speed += ((dt > 0 ? moved / dt : 0) - v.speed) * Math.min(1, dt * 8);
        if (moved > 30) v.speed = 0;
        v.pos.copy(tmp);
        v.ry = angleLerp(a.ry, c.ry, k);
        v.renderRy = angleLerp(v.renderRy, v.ry, 1 - Math.exp(-dt * 14));
      }
      v.obj.position.copy(v.pos);
      v.obj.rotation.y = v.renderRy;
      const dist = v.pos.distanceTo(camPos);
      // culling
      const far = v.kind === 'mob' && v.info.bs ? 400 : 190;
      const vis = dist < far && (v.fade > 0.02 || !v.dead);
      v.obj.visible = vis && !(v.kind === 'node' && v.dead);
      // death fade
      if (v.dead) {
        v.deadT += dt;
        if (v.kind === 'mob' && v.deadT > 9) { v.fade = Math.max(0, v.fade - dt * 0.8); v.model.setFade(v.fade); }
      } else if (v.fade < 1) { v.fade = Math.min(1, v.fade + dt * 2); v.model.setFade(v.fade); }
      // cast weight
      const casting = v.cast && (v.flags & FLAGS.F_CAST || v.cast.channel) && !v.dead;
      v.castW += ((casting ? 1 : 0) - v.castW) * Math.min(1, dt * 10);
      if (v.cast && v.cast.channel && performance.now() > v.cast.end) v.cast = null;
      v.attackT += dt; v.hitT += dt;
      if (v.obj.visible && dist < 120) {
        const fwd = v.speed > 0.3 && v.id === this.meId ? this.g.ctrl.moveBack : false;
        v.model.update(dt, {
          speed: v.dead ? 0 : v.speed, back: fwd, strafe: v.id === this.meId ? this.g.ctrl.strafeDir : 0,
          air: v.anim === 4, swim: v.anim === 5 || (v.kind === 'player' && v.pos.y < -0.7),
          dead: v.dead, sit: (v.flags & FLAGS.F_SIT) !== 0 || v.emote === 'sit', emote: v.emote,
          cast: v.castW, channel: v.cast?.channel, attackT: v.attackT, attackAlt: v.attackAlt, hitT: v.hitT,
          stun: (v.flags & FLAGS.F_STUN) !== 0, combat: (v.flags & FLAGS.F_COMBAT) !== 0, aimYaw: 0,
        });
      }
      // status effects
      this._status(v, dt, time);
      // nameplates
      this._plate(v, dist, camera, w, h, myFaction, targetId);
    }
  }

  _status(v, dt, time) {
    const vfx = this.g.vfx;
    const sh = (v.flags & FLAGS.F_SHIELD) && !v.dead && v.obj.visible;
    if (sh && !v.shield) {
      v.shield = vfx.shieldMesh(v.info.f === 'ea' ? 0x9fe0ff : 0xffd08a);
      const s = (v.model.scale || 1);
      v.shield.scale.set(v.radius * 1.6 / s + 0.5, v.height * 0.62 / s, v.radius * 1.6 / s + 0.5);
      v.shield.position.y = v.height * 0.5 / s;
      v.obj.add(v.shield);
    } else if (!sh && v.shield) { v.obj.remove(v.shield); v.shield.material.dispose(); v.shield = null; }
    if (v.shield) v.shield.material.uniforms.uTime.value = time;
    const st = (v.flags & FLAGS.F_STUN) && !v.dead && v.obj.visible;
    if (st && !v.stars) { v.stars = vfx.stunStars(); v.obj.add(v.stars); }
    else if (!st && v.stars) { v.obj.remove(v.stars); v.stars = null; }
    if (v.stars) {
      const s = v.model.scale || 1;
      v.stars.position.y = (v.height + 0.25) / s;
      v.stars.children.forEach((c, i) => { const a = time * 4 + c.userData.a; c.position.set(Math.cos(a) * 0.4 / s, Math.sin(time * 6 + i) * 0.05, Math.sin(a) * 0.4 / s); });
    }
    const glow = (v.flags & FLAGS.F_GLOW) && !v.dead;
    if (glow) {
      v.model.setGlow(0.7 + Math.sin(time * 6) * 0.3);
      if (v.obj.visible && Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        vfx.add.spawn(v.pos.x + Math.cos(a) * 0.5, v.pos.y + Math.random() * v.height, v.pos.z + Math.sin(a) * 0.5, 0, 1.5, 0, 3, 1.6, 0.4, 1, 0.25, 0.8, 0.5, -0.5);
      }
      v.glowT = 1;
    } else if (v.glowT > 0) { v.glowT = 0; v.model.setGlow(v.kind === 'mob' && v.info.mt === 'moloch' ? 0.2 : 0); }
    if ((v.flags & FLAGS.F_HASTE) && v.speed > 1 && v.obj.visible && Math.random() < dt * 25) {
      vfx.add.spawn(v.pos.x, v.pos.y + 0.2 + Math.random() * 1.2, v.pos.z, 0, 0.3, 0, 2.4, 2.2, 0.6, 0.8, 0.18, 0.4, 1, 0);
    }
    if (v.castW > 0.5 && v.cast && v.obj.visible && Math.random() < dt * 40) {
      const hand = v.model.worldOf(Math.random() < 0.5 ? 'handR' : 'handL', tmp);
      const c = v.cast.color || new THREE.Color(0xffd070);
      vfx.add.spawn(hand.x, hand.y, hand.z, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, c.r * 3, c.g * 3, c.b * 3, 1, 0.22, 0.5, 1, 0);
    }
    if (v.marker) v.marker.position.y = (v.height + 0.9 + Math.sin(time * 2.5) * 0.12) / (v.model.scale || 1);
  }

  _plate(v, dist, camera, w, h, myFaction, targetId) {
    const el = v.plate;
    const isMe = v.id === this.meId;
    const range = (v.kind === 'player' ? 80 : v.kind === 'npc' ? 50 : v.info.bs ? 120 : 55) * (this.g.gfx.q.plateRange || 1);
    const bubble = v.bubbleUntil > performance.now();
    if (!this.showPlates || !v.obj.visible || dist > range || (isMe && !bubble) || v.kind === 'node' || (v.dead && v.kind !== 'player')) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    tmp.set(v.pos.x, v.pos.y + v.height + 0.35, v.pos.z).project(camera);
    if (tmp.z > 1 || tmp.x < -1.2 || tmp.x > 1.2 || tmp.y < -1.2 || tmp.y > 1.2) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
    const sc = Math.max(0.6, Math.min(1.1, 18 / Math.max(dist, 1) + 0.55));
    el.style.transform = `translate(${x | 0}px, ${y | 0}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
    const hostile = isHostile(myFaction, v);
    let cls = 'plate';
    if (v.kind === 'npc') cls += ' npc';
    else if (v.kind === 'player') cls += hostile ? ' enemyplayer' : ' ' + v.info.f;
    else cls += hostile ? ' hostile' : ' friendly';
    if (v.id === targetId) cls += ' targeted';
    if (el.className !== cls) el.className = cls;
    const showHp = !isMe && v.kind !== 'npc' && (v.id === targetId || (v.flags & FLAGS.F_COMBAT) || v.hp < v.mh) && v.mh > 1;
    v.plateHp.style.display = showHp ? 'block' : 'none';
    if (showHp) v.plateHpFill.style.width = `${Math.max(0, (v.hp / v.mh) * 100).toFixed(1)}%`;
    v.plateName.style.display = isMe ? 'none' : '';
    v.plateTitle.style.display = isMe ? 'none' : '';
    const casting = v.cast && !v.cast.channel && (v.flags & FLAGS.F_CAST) && hostile;
    v.plateCast.style.display = casting ? 'block' : 'none';
    if (casting) v.plateCastFill.style.width = `${Math.min(100, ((performance.now() - v.cast.start) / (v.cast.dur * 1000)) * 100)}%`;
    if (bubble) { v.plateBubble.style.display = ''; v.plateBubble.className = 'bubble'; }
    else if (v.plateBubble.className) { v.plateBubble.className = ''; v.plateBubble.textContent = ''; }
  }

  say(id, text) {
    const v = this.map.get(id);
    if (!v) return;
    v.plateBubble.textContent = text.slice(0, 120);
    v.bubbleUntil = performance.now() + 6000;
  }

  pick(mx, my, camera) {
    let best = null, bestD = Infinity;
    const w = window.innerWidth, h = window.innerHeight;
    const f = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const v of this.map.values()) {
      if (!v.obj.visible || (v.kind === 'node' && v.dead)) continue;
      tmp.set(v.pos.x, v.pos.y + v.height * 0.5, v.pos.z);
      const dist = tmp.distanceTo(camera.position);
      if (dist > 120) continue;
      tmp.project(camera);
      if (tmp.z > 1) continue;
      const sx = (tmp.x * 0.5 + 0.5) * w, sy = (-tmp.y * 0.5 + 0.5) * h;
      const rx = Math.max(16, ((v.radius + 0.35) * f) / dist);
      const ry = Math.max(22, ((v.height * 0.55) * f) / dist);
      const dx = (mx - sx) / rx, dy = (my - sy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (dist < bestD) { bestD = dist; best = v; }
    }
    return best;
  }
}

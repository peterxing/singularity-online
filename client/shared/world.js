import { Terrain, SITES, inSafeZone, WORLD, zoneAt } from './terrain.js';
import {
  ABILITIES, CHAMPIONS, MOBS, SPAWNS, NPCS, QUESTS, NODES, ITEMS, FACTIONS, MAX_LEVEL,
  xpForLevel, mobXp, mobHp, mobDmg, lvlMul, BOT_NAMES, BOT_CHAT, CHAMPION_ORDER,
} from './data.js';
import { mulberry32, clamp } from './rng.js';

export const TICK = 1 / 20;
const GCD = 1.0;
const INTEREST = 270;
const DAY_LENGTH = 1800; // seconds per in-game day

const F_DEAD = 1, F_COMBAT = 2, F_CAST = 4, F_STUN = 8, F_SHIELD = 16, F_EVADE = 32, F_GLOW = 64, F_HASTE = 128, F_SIT = 256, F_ROOTED = 512;
export const FLAGS = { F_DEAD, F_COMBAT, F_CAST, F_STUN, F_SHIELD, F_EVADE, F_GLOW, F_HASTE, F_SIT, F_ROOTED };

const MOB_RADIUS = { paperclip: 0.7, wraith: 0.8, imp: 0.6, golem: 1.3, shoggoth: 1.4, basilisk: 2.2, moloch: 3.2, guard: 0.6 };
const RESPAWN = { basilisk: 90, moloch: 180 };

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class World {
  constructor(opts = {}) {
    this.terrain = opts.terrain || new Terrain();
    this.rand = mulberry32(opts.seed || 777);
    this.time = 0;
    this.acc = 0;
    this.tickNo = 0;
    this.dayTime = opts.dayTime ?? 0.6;
    this.ents = new Map();
    this.clients = new Map();
    this.nextId = 1;
    this.projectiles = [];
    this.delayed = [];
    this.events = [];
    this.onSave = opts.onSave || null;
    this.log = opts.log || (() => {});
    this._spawnStatic();
    const bots = opts.bots ?? 10;
    for (let i = 0; i < bots; i++) this._spawnBot(i);
  }

  // ------------------------------------------------------------------ setup
  _newId() { return this.nextId++; }

  _spawnStatic() {
    const T = this.terrain;
    for (const key in NPCS) {
      const d = NPCS[key];
      const e = this._base('npc', d.name, d.faction === 'neutral' ? 'neutral' : d.faction, d.pos[0], d.pos[1]);
      e.npcId = key; e.ry = d.facing; e.title = d.title; e.level = 12; e.maxHp = e.hp = 1000;
    }
    const rnd = mulberry32(99);
    for (const sp of SPAWNS) {
      for (let i = 0; i < sp.n; i++) {
        const [x, z] = sp.n === 1 ? [sp.x, sp.z] : T.randomPointIn(sp.x, sp.z, sp.r, rnd, { avoidRoads: true });
        this._spawnMob(sp.mob, x, z);
      }
    }
    for (const fk of ['eacc', 'ea']) {
      const s = SITES[fk];
      const type = fk === 'eacc' ? 'guard_eacc' : 'guard_ea';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const x = s.x + Math.cos(a) * 50, z = s.z + Math.sin(a) * 50;
        const g = this._spawnMob(type, x, z);
        g.ry = Math.atan2(x - s.x, z - s.z);
        g.spawnRy = g.ry;
      }
      for (let i = 0; i < 2; i++) {
        const x = s.x + (fk === 'eacc' ? -1 : 1) * 30, z = s.z + (i ? 8 : -8);
        const g = this._spawnMob(type, x, z);
        g.ry = fk === 'eacc' ? -Math.PI / 2 : Math.PI / 2; g.spawnRy = g.ry;
      }
    }
    for (const nk in NODES) {
      const nd = NODES[nk];
      for (let i = 0; i < nd.n; i++) {
        const [x, z] = T.randomPointIn(nd.x, nd.z, nd.r, rnd, { avoidRoads: true });
        const e = this._base('node', nd.name, 'neutral', x, z);
        e.nodeType = nk; e.maxHp = e.hp = 1;
      }
    }
  }

  _base(kind, name, faction, x, z) {
    const e = {
      id: this._newId(), kind, name, faction, x, z, y: this.terrain.groundAt(x, z), ry: 0,
      level: 1, hp: 100, maxHp: 100, en: 100, maxEn: 100, alive: true, target: 0,
      auras: [], cds: {}, gcdUntil: 0, casting: null, combatUntil: 0, swingAt: 0, stunUntil: 0,
      anim: 0, moving: false, radius: 0.5, autoAttack: false,
    };
    this.ents.set(e.id, e);
    return e;
  }

  _spawnMob(type, x, z) {
    const def = MOBS[type];
    const lvl = def.lvl[0] + Math.floor(this.rand() * (def.lvl[1] - def.lvl[0] + 1));
    const e = this._base('mob', def.name, def.faction || 'monster', x, z);
    e.mobType = type; e.def = def; e.level = lvl;
    e.maxHp = e.hp = def.hpFixed || Math.round(mobHp(lvl) * def.hp);
    e.spawn = { x, z }; e.state = 'idle'; e.threat = new Map(); e.tappers = new Set();
    e.nextWander = this.time + this.rand() * 6; e.nextAggro = 0; e.ry = this.rand() * Math.PI * 2; e.spawnRy = e.ry;
    e.radius = MOB_RADIUS[def.model] || 0.7;
    e.specialAt = this.time + 6 + this.rand() * 4;
    e.phase = 0;
    if (def.fly) e.fly = def.fly;
    return e;
  }

  _spawnBot(i) {
    const faction = i % 2 === 0 ? 'eacc' : 'ea';
    const names = BOT_NAMES[faction];
    const name = names[Math.floor(i / 2) % names.length];
    const champs = CHAMPION_ORDER[faction];
    const champ = champs[Math.floor(this.rand() * champs.length)];
    const p = this._createPlayer(name, champ, null);
    p.bot = true;
    p.level = 1 + Math.floor(this.rand() * 9);
    this._recalc(p); p.hp = p.maxHp;
    const areas = this._areasFor(p);
    const a = areas[Math.floor(this.rand() * areas.length)] || { x: p.x, z: p.z, r: 10 };
    const [x, z] = this.terrain.randomPointIn(a.x, a.z, a.r * 0.8, this.rand);
    p.x = x; p.z = z; p.y = this.terrain.groundAt(x, z);
    p.ai = { think: 0, goal: null, restUntil: 0, chatAt: this.time + 20 + this.rand() * 90, deadAt: 0, lastPos: [x, z], stuckT: 0 };
    return p;
  }

  _createPlayer(name, champion, save) {
    const ch = CHAMPIONS[champion];
    const home = FACTIONS[ch.faction].home;
    const e = this._base('player', name, ch.faction, home[0] + (this.rand() - 0.5) * 8, home[1] + (this.rand() - 0.5) * 8);
    e.champion = champion; e.ch = ch;
    e.xp = 0; e.gold = 0; e.quests = {}; e.done = []; e.items = { potion: 2 }; e.title = '';
    e.stats = { kills: 0, deaths: 0 };
    e.lastMv = this.time; e.moveLockUntil = 0; e.deadAt = 0;
    e.ry = ch.faction === 'eacc' ? -Math.PI / 2 : Math.PI / 2;
    if (save) {
      e.level = clamp(num(save.level, 1) | 0, 1, MAX_LEVEL);
      e.xp = Math.max(0, num(save.xp)); e.gold = Math.max(0, num(save.gold));
      e.quests = save.quests && typeof save.quests === 'object' ? save.quests : {};
      e.done = Array.isArray(save.done) ? save.done.filter((q) => QUESTS[q]) : [];
      for (const q in e.quests) if (!QUESTS[q]) delete e.quests[q];
      e.items = save.items && typeof save.items === 'object' ? save.items : { potion: 2 };
      e.title = typeof save.title === 'string' ? save.title : '';
    }
    this._recalc(e);
    e.hp = e.maxHp; e.en = e.maxEn;
    return e;
  }

  _recalc(p) {
    const ch = p.ch;
    p.maxHp = Math.round(ch.hp + ch.hpPer * (p.level - 1));
    p.maxEn = 100;
    p.hp = Math.min(p.hp, p.maxHp);
  }

  // ------------------------------------------------------------------ clients
  join({ name, champion, save }, send) {
    if (!CHAMPIONS[champion]) champion = 'elon';
    let nm = String(name || 'Anonymous').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, 16) || 'Anonymous';
    const taken = new Set([...this.ents.values()].filter((e) => e.kind === 'player').map((e) => e.name.toLowerCase()));
    let final = nm, k = 2;
    while (taken.has(final.toLowerCase())) final = `${nm}${k++}`;
    const p = this._createPlayer(final, champion, save && save.champion === champion ? save : null);
    const client = { id: p.id, send, known: new Set(), meTick: 0 };
    this.clients.set(p.id, client);
    send({ t: 'welcome', id: p.id, name: p.name, champion, time: this.time, dayTime: this.dayTime, dayLength: DAY_LENGTH, seed: this.terrain.seed });
    this._sys(p, `Welcome to Singularity Online, ${p.name}. Press H (or tap ?) for help.`);
    this._broadcastChat(null, `${p.name} the ${p.ch.name} (${FACTIONS[p.faction].short}) has entered the realm.`, 'sys');
    return p.id;
  }

  leave(id) {
    const p = this.ents.get(id);
    if (p && this.onSave) this.onSave(this.saveOf(p));
    this.clients.delete(id);
    this.ents.delete(id);
    for (const e of this.ents.values()) {
      if (e.target === id) e.target = 0;
      if (e.threat) e.threat.delete(id);
    }
    if (p) this._broadcastChat(null, `${p.name} has left the realm.`, 'sys');
  }

  saveOf(p) {
    return { name: p.name, champion: p.champion, level: p.level, xp: p.xp, gold: p.gold, quests: p.quests, done: p.done, items: p.items, title: p.title };
  }

  receive(id, msg) {
    const p = this.ents.get(id);
    if (!p || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'mv': return this._onMove(p, msg);
      case 'tg': {
        const t = this.ents.get(num(msg.id));
        p.target = t ? t.id : 0;
        if (!t || !this.hostile(p, t)) p.autoAttack = false;
        return;
      }
      case 'aa': {
        const t = this.ents.get(p.target);
        p.autoAttack = !!msg.on && !!t && this.hostile(p, t);
        return;
      }
      case 'cast': return this.tryCast(p, String(msg.ab), num(msg.tg, p.target));
      case 'stop': if (p.casting) this._interrupt(p); return;
      case 'chat': return this._onChat(p, String(msg.m || '').slice(0, 220), msg.ch === 'say' ? 'say' : 'world');
      case 'emote': {
        const e = String(msg.e || '');
        if (['dance', 'wave', 'sit', 'cheer', 'none'].includes(e)) { p.emote = e === 'none' ? null : e; this._event({ k: 'emote', s: p.id, e }, p); }
        return;
      }
      case 'accept': return this._acceptQuest(p, String(msg.q));
      case 'turnin': return this._turnIn(p, String(msg.q));
      case 'abandon': if (p.quests[msg.q]) { delete p.quests[msg.q]; this._sys(p, `Quest abandoned: ${QUESTS[msg.q].name}`); } return;
      case 'use': return this._useNode(p, num(msg.id));
      case 'release': if (!p.alive) this._respawnPlayer(p); return;
      case 'ping': this._send(p.id, { t: 'pong', c: msg.c, time: this.time }); return;
      default: return;
    }
  }

  _onMove(p, m) {
    if (!p.alive) return;
    const x = clamp(num(m.x, p.x), -505, 505), z = clamp(num(m.z, p.z), -505, 505), y = num(m.y, p.y);
    const now = this.time;
    const dt = Math.max(0.03, now - p.lastMv);
    p.lastMv = now;
    if (now < p.moveLockUntil) return;
    if (this.isStunned(p) || this._rooted(p)) {
      if (Math.hypot(x - p.x, z - p.z) > 0.5) this._send(p.id, { t: 'pos', x: p.x, y: p.y, z: p.z });
      return;
    }
    const d = Math.hypot(x - p.x, z - p.z);
    const allowed = p.ch.speed * this.speedMul(p) * 1.6 * dt + 2.5;
    if (d > allowed) {
      this._send(p.id, { t: 'pos', x: p.x, y: p.y, z: p.z });
      return;
    }
    if (p.casting && Math.hypot(x - p.casting.x, z - p.casting.z) > 0.35) this._interrupt(p);
    p.x = x; p.z = z; p.y = y; p.ry = num(m.ry, p.ry);
    p.anim = num(m.a, 0) | 0;
    p.moving = d > 0.05;
    if (p.moving && p.emote) p.emote = null;
  }

  _onChat(p, text, ch) {
    text = text.replace(/[\u0000-\u001f]/g, '').trim();
    if (!text) return;
    if (text.startsWith('/')) {
      const [cmd] = text.slice(1).split(/\s+/);
      if (cmd === 'who') {
        const list = [...this.ents.values()].filter((e) => e.kind === 'player').map((e) => `${e.name} (${e.level} ${e.ch.name})`);
        this._sys(p, `${list.length} heroes online: ${list.join(', ')}`);
      } else if (['dance', 'wave', 'sit', 'cheer'].includes(cmd)) {
        p.emote = cmd; this._event({ k: 'emote', s: p.id, e: cmd }, p);
      } else if (cmd === 'stuck') {
        this._respawnPlayer(p, true);
      } else this._sys(p, 'Unknown command. Try /who, /dance, /wave, /sit, /cheer, /stuck, /say');
      return;
    }
    if (ch === 'say') this._event({ k: 'say', s: p.id, n: p.name, f: p.faction, m: text, ch: 'say' }, p, 60);
    else this._broadcastChat(p, text, 'world');
  }

  _broadcastChat(p, text, ch) {
    const msg = { k: 'say', s: p ? p.id : 0, n: p ? p.name : '', f: p ? p.faction : '', m: text, ch };
    for (const c of this.clients.values()) this._queuePrivate(c.id, msg);
  }

  _sys(p, m) { if (!p.bot) this._queuePrivate(p.id, { k: 'sys', m }); }

  // ------------------------------------------------------------------ helpers
  factionOf(e) {
    if (e.kind === 'summon') { const o = this.ents.get(e.owner); return o ? o.faction : e.faction; }
    return e.faction;
  }

  hostile(a, b) {
    if (!a || !b || a === b) return false;
    if (a.kind === 'npc' || b.kind === 'npc' || a.kind === 'node' || b.kind === 'node') return false;
    const fa = this.factionOf(a), fb = this.factionOf(b);
    if (fa === 'neutral' || fb === 'neutral') return false;
    if (fa === 'monster' && fb === 'monster') return false;
    if (fa === 'monster' || fb === 'monster') return true;
    return fa !== fb;
  }

  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  face(a, b) { a.ry = Math.atan2(b.x - a.x, b.z - a.z); }

  isStunned(e) { return e.stunUntil > this.time; }
  _rooted(e) { return e.auras.some((a) => a.root && a.until > this.time); }

  speedMul(e) {
    let m = 1;
    for (const a of e.auras) {
      if (a.until <= this.time) continue;
      if (a.haste) m += a.haste;
      if (a.slow) m *= 1 - a.slow;
    }
    return clamp(m, 0.2, 2.2);
  }

  _stat(e, key) {
    let s = 0;
    for (const a of e.auras) if (a.until > this.time && a[key]) s += a[key];
    return s;
  }

  _auraStacks(e, id) { const a = e.auras.find((x) => x.id === id && x.until > this.time); return a ? a.stacks || 1 : 0; }

  _addAura(tgt, aura) {
    aura.until = this.time + aura.dur;
    aura.start = this.time;
    const ex = tgt.auras.find((a) => a.id === aura.id && (a.srcId === aura.srcId || !aura.harmful));
    if (ex) {
      Object.assign(ex, aura);
      return ex;
    }
    tgt.auras.push(aura);
    if (tgt.auras.length > 24) tgt.auras.shift();
    return aura;
  }

  _send(id, msg) { const c = this.clients.get(id); if (c) c.send(msg); }

  _event(ev, at, radius = INTEREST) {
    this.events.push({ ev, x: at ? at.x : 0, z: at ? at.z : 0, r: radius, to: 0 });
  }

  _queuePrivate(id, ev) { this.events.push({ ev, to: id }); }

  _inCombat(e) { return e.combatUntil > this.time; }

  // ------------------------------------------------------------------ abilities
  tryCast(p, abId, tgId, silent = false) {
    const ab = ABILITIES[abId];
    const err = (m) => { if (!silent) this._queuePrivate(p.id, { k: 'err', m }); return false; };
    if (!ab) return false;
    if (p.kind === 'player' && abId !== 'potion' && !p.ch.abilities.includes(abId)) return false;
    if (!p.alive) return err('You are dead.');
    if (this.isStunned(p)) return err('You are stunned.');
    if (p.casting) return err('Already casting.');
    if ((p.cds[abId] || 0) > this.time) return err('Ability is not ready yet.');
    if (ab.gcd !== false && p.gcdUntil > this.time) return err('Ability is not ready yet.');
    if (p.en < ab.cost) return err(`Not enough ${p.ch.resource}.`);
    if (ab.item && !(p.items[ab.item] > 0)) return err('You have none left.');
    let tgt = this.ents.get(tgId) || null;
    if (tgt && !tgt.alive) tgt = null;
    if (ab.target === 'self') tgt = p;
    else if (ab.target === 'ally') { if (!tgt || this.hostile(p, tgt) || tgt.kind === 'node' || tgt.kind === 'npc' || tgt.kind === 'mob') tgt = p; }
    else if (ab.target === 'any') { if (!tgt || tgt.kind === 'node' || tgt.kind === 'npc' || (!this.hostile(p, tgt) && tgt.kind !== 'player')) tgt = p; }
    else if (ab.target === 'enemy') {
      if (!tgt || !this.hostile(p, tgt)) return err('Invalid target.');
    }
    if (tgt !== p && ab.range) {
      const d = this.dist(p, tgt) - (tgt.radius || 0.5);
      if (d > ab.range + 0.5) return err('Out of range.');
      if (ab.minRange && d < ab.minRange - 1) return err('Too close.');
    }
    if (tgt && tgt !== p) this.face(p, tgt);
    if (ab.target === 'enemy' && p.kind === 'player') { p.target = tgt.id; p.autoAttack = true; }
    const castMul = 1 - clamp(this._stat(p, 'castSpeed'), 0, 0.6);
    if (ab.cast > 0) {
      const dur = ab.cast * castMul;
      p.casting = { ab: abId, tg: tgt.id, start: this.time, end: this.time + dur, dur, x: p.x, z: p.z };
      if (ab.gcd !== false) p.gcdUntil = this.time + GCD;
      p.emote = null;
      this._event({ k: 'cast', s: p.id, ab: abId, d: dur, t: tgt.id }, p);
      return true;
    }
    if (ab.channel) {
      p.en -= ab.cost;
      p.cds[abId] = this.time + ab.cd;
      if (ab.gcd !== false) p.gcdUntil = this.time + GCD;
      const ticks = ab.effects[0].ticks;
      p.casting = { ab: abId, tg: tgt.id, start: this.time, end: this.time + ab.channel, dur: ab.channel, x: p.x, z: p.z, channel: true, nextTick: this.time + ab.channel / ticks, tickDt: ab.channel / ticks };
      this._event({ k: 'beam', s: p.id, t: tgt.id, ab: abId, d: ab.channel }, p);
      return true;
    }
    this._execute(p, abId, tgt);
    return true;
  }

  _execute(p, abId, tgt) {
    const ab = ABILITIES[abId];
    p.en -= ab.cost;
    if (ab.cd) p.cds[abId] = this.time + ab.cd;
    if (ab.gcd !== false) p.gcdUntil = Math.max(p.gcdUntil, this.time + GCD);
    if (ab.item) p.items[ab.item] = Math.max(0, (p.items[ab.item] || 0) - 1);
    p.emote = null;
    if (tgt && tgt !== p && tgt.alive === false) return;
    if (ab.delivery === 'projectile') {
      const d = this.dist(p, tgt);
      const flight = d / ab.speed;
      this.projectiles.push({ src: p.id, tgt: tgt.id, at: this.time + flight, abId, effects: ab.effects, level: p.level });
      this._event({ k: 'fire', s: p.id, t: tgt.id, ab: abId, d: flight, p: ab.proj, c: ab.color }, p);
    } else {
      this._event({ k: 'fx', s: p.id, t: tgt ? tgt.id : 0, ab: abId, x: tgt ? tgt.x : p.x, z: tgt ? tgt.z : p.z }, p);
      this.applyEffects(p, tgt, ab.effects, abId, {});
    }
    if (p.kind === 'player' && tgt && this.hostile(p, tgt)) p.combatUntil = this.time + 6;
  }

  _interrupt(e) {
    if (!e.casting) return;
    const c = e.casting;
    e.casting = null;
    this._event({ k: 'cstop', s: e.id, ab: c.ab }, e);
  }

  _scaled(src, amount) {
    const lvl = src ? src.level || 1 : 1;
    return amount * lvlMul(lvl);
  }

  applyEffects(src, tgt, effects, abId, ctx) {
    for (const e of effects) {
      switch (e.type) {
        case 'damage': {
          if (!tgt || !tgt.alive) break;
          let amt = this._scaled(src, e.amount);
          if (e.scaling) {
            const st = this._auraStacks(src, e.scaling.id);
            amt *= 1 + e.scaling.per * st;
            const cur = src.auras.find((a) => a.id === e.scaling.id && a.until > this.time);
            const stacks = Math.min(e.scaling.max, (cur ? cur.stacks : 0) + 1);
            this._addAura(src, { id: e.scaling.id, name: 'Scaling', icon: 'bolt', dur: 10, stacks, srcId: src.id });
          }
          ctx.lastDamage = this.damage(src, tgt, amt, abId);
          break;
        }
        case 'splash': {
          if (!tgt) break;
          const base = ctx.lastDamage || 0;
          for (const o of this.ents.values()) {
            if (o === tgt || !o.alive || !this.hostile(src, o)) continue;
            if (Math.hypot(o.x - tgt.x, o.z - tgt.z) <= e.radius) this.damage(src, o, base * e.pct, abId);
          }
          break;
        }
        case 'dot':
          if (tgt && tgt.alive) this._addAura(tgt, { id: abId + '_dot', name: e.name, icon: e.icon, harmful: true, srcId: src.id, srcLevel: src.level, abId, dur: e.ticks * e.interval, tick: e.interval, next: this.time + e.interval, tickDmg: this._scaled(src, e.amount) });
          break;
        case 'hot':
          if (tgt && tgt.alive) this._addAura(tgt, { id: abId + '_hot', name: e.name, icon: e.icon, srcId: src.id, abId, dur: e.ticks * e.interval, tick: e.interval, next: this.time + e.interval, tickHeal: this._scaled(src, e.amount) });
          break;
        case 'stun': {
          if (!tgt || !tgt.alive || tgt.evading) break;
          let dur = e.dur;
          if (tgt.def && (tgt.def.boss)) dur *= 0.25;
          else if (tgt.def && tgt.def.elite) dur *= 0.6;
          tgt.stunUntil = Math.max(tgt.stunUntil, this.time + dur);
          this._addAura(tgt, { id: 'stun', name: 'Stunned', icon: 'stun', harmful: true, dur, srcId: src.id });
          if (tgt.casting) this._interrupt(tgt);
          break;
        }
        case 'slow':
          if (tgt && tgt.alive && !(tgt.def && tgt.def.boss)) this._addAura(tgt, { id: 'slow_' + abId, name: 'Slowed', icon: 'slow', harmful: true, slow: e.pct, dur: e.dur, srcId: src.id });
          break;
        case 'shield':
          if (tgt && tgt.alive) this._addAura(tgt, { id: 'shield_' + abId, name: e.name, icon: e.icon, shield: Math.round(this._scaled(src, e.amount)), dur: e.dur, srcId: src.id });
          break;
        case 'buff': {
          if (!tgt || !tgt.alive) break;
          const { type, ...rest } = e;
          this._addAura(tgt, { ...rest, srcId: src.id, srcLevel: src.level, next: this.time + 1, tick: rest.pulse ? 1 : 0 });
          break;
        }
        case 'debuff': {
          if (!tgt || !tgt.alive) break;
          const { type, ...rest } = e;
          this._addAura(tgt, { ...rest, harmful: true, srcId: src.id });
          break;
        }
        case 'heal': if (tgt && tgt.alive) this.heal(src, tgt, this._scaled(src, e.amount), abId); break;
        case 'selfheal': this.heal(src, src, this._scaled(src, e.amount), abId); break;
        case 'healpct': this.heal(src, src, src.maxHp * e.pct, abId); break;
        case 'smart':
          if (!tgt || !tgt.alive) break;
          if (this.hostile(src, tgt)) this.damage(src, tgt, this._scaled(src, e.damage), abId);
          else this.heal(src, tgt, this._scaled(src, e.heal), abId);
          break;
        case 'aoe': {
          const center = e.center === 'self' ? { x: src.x, z: src.z } : tgt ? { x: tgt.x, z: tgt.z } : { x: src.x, z: src.z };
          const run = () => {
            if (e.mark && tgt) { center.x = tgt.x; center.z = tgt.z; }
            this._event({ k: 'boom', s: src.id, ab: abId, x: center.x, z: center.z, r: e.radius }, center);
            for (const o of [...this.ents.values()]) {
              if (!o.alive || o.kind === 'npc' || o.kind === 'node') continue;
              if (Math.hypot(o.x - center.x, o.z - center.z) > e.radius + (o.radius || 0.5)) continue;
              if (e.friendly ? this.hostile(src, o) || o.kind === 'mob' : !this.hostile(src, o)) continue;
              this.applyEffects(src, o, e.effects, abId, {});
            }
          };
          if (e.delay) this.delayed.push({ at: this.time + e.delay, fn: run });
          else run();
          break;
        }
        case 'cone': {
          const fx = Math.sin(src.ry), fz = Math.cos(src.ry);
          const cosA = Math.cos((e.angle / 2) * Math.PI / 180);
          for (const o of [...this.ents.values()]) {
            if (!o.alive || !this.hostile(src, o)) continue;
            const dx = o.x - src.x, dz = o.z - src.z;
            const d = Math.hypot(dx, dz);
            if (d > e.range + (o.radius || 0.5)) continue;
            if (d > 1.2 && (dx * fx + dz * fz) / d < cosA) continue;
            this.applyEffects(src, o, e.effects, abId, {});
          }
          break;
        }
        case 'dash': {
          const fx = Math.sin(src.ry), fz = Math.cos(src.ry);
          let nx = src.x, nz = src.z;
          for (let s = 1; s <= 12; s++) {
            const tx = clamp(src.x + fx * e.dist * (s / 12), -500, 500), tz = clamp(src.z + fz * e.dist * (s / 12), -500, 500);
            if (this.terrain.heightAt(tx, tz) - this.terrain.heightAt(nx, nz) > 3.5) break;
            nx = tx; nz = tz;
          }
          this._moveTo(src, nx, nz, 0.28);
          break;
        }
        case 'charge': {
          if (!tgt || tgt === src) break;
          const d = this.dist(src, tgt);
          const back = Math.min(d, (tgt.radius || 0.5) + 1.2);
          const nx = tgt.x + ((src.x - tgt.x) / (d || 1)) * back, nz = tgt.z + ((src.z - tgt.z) / (d || 1)) * back;
          this._moveTo(src, nx, nz, Math.min(0.5, 0.12 + d / 60));
          this.face(src, tgt);
          break;
        }
        case 'summon': this._summon(src, e.what, e.dur); break;
        case 'taunt':
          for (const o of this.ents.values()) {
            if (o.kind !== 'mob' || !o.alive || !this.hostile(src, o)) continue;
            if (this.dist(o, src) > e.radius) continue;
            let max = 0;
            for (const v of o.threat.values()) max = Math.max(max, v);
            o.threat.set(src.id, max + 150);
            this._engage(o, src);
          }
          break;
        default: break;
      }
    }
  }

  _moveTo(e, x, z, dur) {
    e.x = x; e.z = z; e.y = this.terrain.groundAt(x, z);
    e.moveLockUntil = this.time + dur + 0.25;
    this._event({ k: 'dash', s: e.id, x, y: e.y, z, d: dur }, e);
  }

  _summon(owner, what, dur) {
    const fx = Math.sin(owner.ry), fz = Math.cos(owner.ry);
    const x = owner.x + fx * 2.2, z = owner.z + fz * 2.2;
    const s = this._base('summon', what === 'turret' ? `${owner.name}'s Turret` : `${owner.name}'s Cluster`, owner.faction, x, z);
    s.owner = owner.id; s.what = what; s.expire = this.time + dur; s.level = owner.level;
    s.maxHp = s.hp = Math.round(120 * lvlMul(owner.level)); s.ry = owner.ry; s.pulseAt = this.time + 1;
    s.radius = 0.8;
  }

  damage(src, tgt, amount, abId, opts = {}) {
    if (!tgt || !tgt.alive) return 0;
    if (tgt.kind === 'npc' || tgt.kind === 'node') return 0;
    if (tgt.evading) { this._event({ k: 'dmg', s: src ? src.id : 0, t: tgt.id, a: 0, ev: 1 }, tgt); return 0; }
    let a = amount;
    let crit = false;
    if (src) {
      a *= 1 + this._stat(src, 'dmg') + this._stat(src, 'dmgOut');
      if (!opts.tick && src.kind !== 'mob' && this.rand() < 0.1) { crit = true; a *= 1.5; }
      if (tgt.kind === 'mob' && src.kind !== 'mob' && tgt.level - src.level >= 3) a *= 0.75;
      if (src.kind === 'mob' && (tgt.kind === 'player' || tgt.kind === 'summon') && src.level - tgt.level >= 3) a *= 1.2;
      if (src.kind === 'player' && tgt.kind === 'player') a *= 0.7;
    }
    a *= 0.92 + this.rand() * 0.16;
    a *= 1 - clamp(this._stat(tgt, 'dr'), 0, 0.7);
    a = Math.max(1, Math.round(a));
    let absorbed = 0;
    for (const au of tgt.auras) {
      if (!au.shield || au.until <= this.time || a <= 0) continue;
      const take = Math.min(au.shield, a);
      au.shield -= take; a -= take; absorbed += take;
      if (au.shield <= 0) au.until = this.time;
    }
    tgt.hp -= a;
    const now = this.time;
    if (src) {
      src.combatUntil = now + 6;
      const owner = src.kind === 'summon' ? this.ents.get(src.owner) : src;
      if (owner && owner.kind === 'player') owner.combatUntil = now + 6;
      if (tgt.kind === 'mob') {
        const who = owner || src;
        if (who.kind !== 'mob') {
          const mul = who.champion === 'marc' || who.champion === 'dario' ? 1.8 : 1;
          tgt.threat.set(who.id, (tgt.threat.get(who.id) || 0) + (a + absorbed) * mul + 1);
          if (who.kind === 'player') tgt.tappers.add(who.id);
          if (tgt.state === 'idle') this._engage(tgt, who);
        }
      } else if (tgt.kind === 'player' && tgt.bot && src.kind !== 'mob' && tgt.alive) {
        tgt.ai.lastAttacker = (owner || src).id;
      }
      const ls = this._stat(src, 'lifesteal');
      if (ls > 0 && a > 0) this.heal(src, src, a * ls, abId, true);
    }
    tgt.combatUntil = now + 6;
    this._event({ k: 'dmg', s: src ? src.id : 0, t: tgt.id, a, c: crit ? 1 : 0, ab: abId || '', ab2: absorbed }, tgt);
    if (tgt.hp <= 0) this._kill(tgt, src);
    else if (tgt.emote === 'sit') tgt.emote = null;
    return a;
  }

  heal(src, tgt, amount, abId, quiet = false) {
    if (!tgt || !tgt.alive) return 0;
    let a = amount * (1 + (src ? this._stat(src, 'healUp') : 0));
    let crit = false;
    if (!quiet && this.rand() < 0.1) { crit = true; a *= 1.5; }
    a = Math.round(a);
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + a);
    const gained = tgt.hp - before;
    if (src && src.kind === 'player' && this._inCombat(tgt)) {
      src.combatUntil = this.time + 6;
      for (const m of this.ents.values()) {
        if (m.kind === 'mob' && m.alive && m.state === 'combat' && m.threat.has(tgt.id)) {
          m.threat.set(src.id, (m.threat.get(src.id) || 0) + gained * 0.5);
          m.tappers.add(src.id);
        }
      }
    }
    if (!quiet || gained > 0) this._event({ k: 'heal', s: src ? src.id : 0, t: tgt.id, a: gained, c: crit ? 1 : 0, ab: abId || '' }, tgt);
    return gained;
  }

  _kill(tgt, killer) {
    tgt.alive = false; tgt.hp = 0; tgt.casting = null; tgt.auras = []; tgt.stunUntil = 0; tgt.emote = null;
    tgt.deadAt = this.time;
    const kOwner = killer && killer.kind === 'summon' ? this.ents.get(killer.owner) : killer;
    this._event({ k: 'die', t: tgt.id, s: kOwner ? kOwner.id : 0 }, tgt);
    for (const e of this.ents.values()) if (e.target === tgt.id && e.kind === 'mob') e.target = 0;
    if (tgt.kind === 'mob') {
      tgt.state = 'dead';
      tgt.respawnAt = tgt.temp ? Infinity : this.time + (RESPAWN[tgt.mobType] || 26 + this.rand() * 12);
      if (tgt.temp) this.delayed.push({ at: this.time + 10, fn: () => this.ents.delete(tgt.id) });
      const credit = new Set(tgt.tappers);
      const radius = tgt.def.boss ? 90 : 45;
      for (const p of this.ents.values()) {
        if (p.kind !== 'player' || !p.alive) continue;
        if (this.dist(p, tgt) > radius) { credit.delete(p.id); continue; }
        if (!credit.has(p.id) && this._inCombat(p) && [...credit].some((id) => { const o = this.ents.get(id); return o && o.faction === p.faction; })) credit.add(p.id);
        if (tgt.def.boss && this._inCombat(p)) credit.add(p.id);
      }
      for (const pid of credit) {
        const p = this.ents.get(pid);
        if (!p || p.kind !== 'player') continue;
        this._reward(p, tgt);
      }
      if (tgt.def.boss) {
        const names = [...credit].map((id) => this.ents.get(id)).filter(Boolean).map((p) => p.name);
        const facs = new Set([...credit].map((id) => this.ents.get(id)).filter(Boolean).map((p) => p.faction));
        const both = facs.size > 1 ? ' Accelerationists and Aligned fought side by side. Coordination wins!' : '';
        this._broadcastChat(null, `MOLOCH HAS FALLEN! Slain by ${names.join(', ') || 'unknown heroes'}.${both}`, 'boss');
        this._event({ k: 'yell', s: tgt.id, m: 'Coordination... was never supposed to be possible...' }, tgt, 400);
      }
      tgt.threat.clear(); tgt.tappers.clear(); tgt.target = 0;
    } else if (tgt.kind === 'player') {
      tgt.stats.deaths++;
      if (kOwner && kOwner.kind === 'player') {
        kOwner.stats.kills++;
        this._broadcastChat(null, `${kOwner.name} (${FACTIONS[kOwner.faction].short}) has defeated ${tgt.name} (${FACTIONS[tgt.faction].short})!`, 'pvp');
        this._giveXp(kOwner, Math.round(mobXp(tgt.level) * 0.5));
      }
      for (const m of this.ents.values()) if (m.threat) m.threat.delete(tgt.id);
    } else if (tgt.kind === 'summon') {
      this.ents.delete(tgt.id);
    }
  }

  _reward(p, mob) {
    const diff = mob.level - p.level;
    let xp = mobXp(mob.level);
    if (mob.def.elite) xp *= 2.5;
    if (mob.def.boss) xp *= 6;
    if (diff < 0) xp *= Math.max(0, 1 + diff * 0.2);
    xp = Math.round(xp);
    if (xp > 0) this._giveXp(p, xp);
    const gold = Math.round((1 + this.rand() * 2) * mob.level * (mob.def.elite ? 4 : mob.def.boss ? 20 : 1));
    p.gold += gold;
    const loot = [];
    for (const qid in p.quests) {
      const q = QUESTS[qid];
      q.obj.forEach((o, i) => {
        if (o.kind === 'kill' && o.mob === mob.mobType && p.quests[qid][i] < o.n) {
          p.quests[qid][i]++;
          this._queuePrivate(p.id, { k: 'qp', q: qid, i, c: p.quests[qid][i], n: o.n, label: MOBS[o.mob].name + ' slain' });
        }
        if (o.kind === 'item' && mob.def.loot && mob.def.loot.item === o.item && (p.items[o.item] || 0) < o.n && this.rand() < mob.def.loot.chance) {
          p.items[o.item] = (p.items[o.item] || 0) + 1;
          p.quests[qid][i] = Math.min(o.n, p.items[o.item]);
          loot.push(ITEMS[o.item].name);
          this._queuePrivate(p.id, { k: 'qp', q: qid, i, c: p.quests[qid][i], n: o.n, label: ITEMS[o.item].name });
        }
      });
      this._checkQuestDone(p, qid);
    }
    if (this.rand() < 0.12 && (p.items.potion || 0) < 5) { p.items.potion = (p.items.potion || 0) + 1; loot.push(ITEMS.potion.name); }
    this._queuePrivate(p.id, { k: 'loot', g: gold, items: loot, xp });
  }

  _checkQuestDone(p, qid) {
    const q = QUESTS[qid], st = p.quests[qid];
    if (!st || st.doneNotified) return;
    if (q.obj.every((o, i) => st[i] >= o.n)) {
      this._queuePrivate(p.id, { k: 'qdone', q: qid });
      st.doneNotified = true;
    }
  }

  _giveXp(p, amt) {
    if (p.level >= MAX_LEVEL) return;
    p.xp += amt;
    while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      this._recalc(p);
      p.hp = p.maxHp; p.en = p.maxEn;
      this._event({ k: 'lvl', t: p.id, l: p.level }, p);
      if (!p.bot) this._broadcastChat(null, `${p.name} has reached level ${p.level}!`, 'sys');
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
  }

  _respawnPlayer(p, stuck = false) {
    const home = FACTIONS[p.faction].home;
    p.x = home[0] + (this.rand() - 0.5) * 10; p.z = home[1] + (this.rand() - 0.5) * 10;
    p.y = this.terrain.groundAt(p.x, p.z);
    if (!stuck || !p.alive) { p.hp = Math.round(p.maxHp * 0.7); p.en = p.maxEn; }
    p.alive = true; p.auras = []; p.casting = null; p.stunUntil = 0; p.target = 0; p.autoAttack = false;
    p.moveLockUntil = this.time + 0.4;
    this._event({ k: 'dash', s: p.id, x: p.x, y: p.y, z: p.z, d: 0, tp: 1 }, p);
    this._send(p.id, { t: 'pos', x: p.x, y: p.y, z: p.z });
  }

  // ------------------------------------------------------------------ quests
  questAvailable(p, qid) {
    const q = QUESTS[qid];
    if (!q) return false;
    if (q.faction !== 'both' && q.faction !== p.faction) return false;
    if (p.done.includes(qid) || p.quests[qid]) return false;
    if (q.req && !p.done.includes(q.req)) return false;
    return p.level >= q.level - 1;
  }

  _nearNpc(p, npcKey) {
    for (const e of this.ents.values()) if (e.kind === 'npc' && e.npcId === npcKey) return this.dist(p, e) < 9;
    return false;
  }

  _acceptQuest(p, qid) {
    const q = QUESTS[qid];
    if (!q || !this.questAvailable(p, qid) || !this._nearNpc(p, q.giver)) return;
    if (Object.keys(p.quests).length >= 10) return this._sys(p, 'Your quest log is full.');
    p.quests[qid] = q.obj.map((o) => (o.kind === 'item' ? Math.min(o.n, p.items[o.item] || 0) : 0));
    this._queuePrivate(p.id, { k: 'qacc', q: qid });
    this._checkQuestDone(p, qid);
  }

  _turnIn(p, qid) {
    const q = QUESTS[qid], st = p.quests[qid];
    if (!q || !st || !this._nearNpc(p, q.giver)) return;
    if (!q.obj.every((o, i) => st[i] >= o.n)) return this._sys(p, 'Objectives not complete.');
    for (const o of q.obj) if (o.kind === 'item') p.items[o.item] = Math.max(0, (p.items[o.item] || 0) - o.n);
    delete p.quests[qid];
    p.done.push(qid);
    p.gold += q.gold;
    if (q.title) { p.title = q.title; this._broadcastChat(null, `${p.name} has earned the title "${q.title}"!`, 'sys'); }
    this._giveXp(p, q.xp);
    this._queuePrivate(p.id, { k: 'qturn', q: qid, xp: q.xp, g: q.gold });
    if (this.onSave) this.onSave(this.saveOf(p));
  }

  _useNode(p, id) {
    const n = this.ents.get(id);
    if (!n || n.kind !== 'node' || !n.alive || !p.alive || p.casting) return;
    if (this.dist(p, n) > 5) return this._queuePrivate(p.id, { k: 'err', m: 'Too far away.' });
    p.casting = { ab: 'gather', node: id, tg: id, start: this.time, end: this.time + 1.5, dur: 1.5, x: p.x, z: p.z, gather: true };
    this._event({ k: 'cast', s: p.id, ab: 'gather', d: 1.5, t: id }, p);
  }

  _finishGather(p, c) {
    const n = this.ents.get(c.node);
    if (!n || !n.alive) return;
    const def = NODES[n.nodeType];
    n.alive = false; n.respawnAt = this.time + def.respawn;
    this._event({ k: 'die', t: n.id, s: p.id }, n);
    p.items[def.item] = (p.items[def.item] || 0) + 1;
    const loot = [ITEMS[def.item].name];
    for (const qid in p.quests) {
      QUESTS[qid].obj.forEach((o, i) => {
        if (o.kind === 'item' && o.item === def.item) {
          p.quests[qid][i] = Math.min(o.n, p.items[def.item]);
          this._queuePrivate(p.id, { k: 'qp', q: qid, i, c: p.quests[qid][i], n: o.n, label: ITEMS[def.item].name });
        }
      });
      this._checkQuestDone(p, qid);
    }
    this._queuePrivate(p.id, { k: 'loot', g: 0, items: loot, xp: 0 });
  }

  // ------------------------------------------------------------------ simulation
  step(dt) {
    this.acc += Math.min(dt, 0.5);
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this._tick(TICK);
    }
  }

  _tick(dt) {
    this.time += dt;
    this.tickNo++;
    this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
    const now = this.time;

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      if (this.delayed[i].at <= now) { const d = this.delayed[i]; this.delayed.splice(i, 1); d.fn(); }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.at > now) continue;
      this.projectiles.splice(i, 1);
      const src = this.ents.get(pr.src) || { id: pr.src, level: pr.level, auras: [], kind: 'ghost', ry: 0, x: 0, z: 0 };
      const tgt = this.ents.get(pr.tgt);
      if (!tgt || !tgt.alive) continue;
      if (pr.auto) this.damage(src, tgt, pr.amount, pr.abId);
      else this.applyEffects(src, tgt, pr.effects, pr.abId, {});
    }

    for (const e of [...this.ents.values()]) {
      if (e.kind === 'node') {
        if (!e.alive && now >= e.respawnAt) { e.alive = true; e.hp = 1; this._event({ k: 'respawn', t: e.id }, e); }
        continue;
      }
      if (e.kind === 'npc') continue;
      this._updateAuras(e, dt);
      if (e.kind === 'summon') { this._updateSummon(e); continue; }
      if (e.kind === 'player') this._updatePlayer(e, dt);
      else if (e.kind === 'mob') this._updateMob(e, dt);
    }

    if (this.tickNo % 2 === 0) this._flush();
    if (this.onSave && this.tickNo % 1200 === 0) {
      for (const c of this.clients.values()) { const p = this.ents.get(c.id); if (p) this.onSave(this.saveOf(p)); }
    }
  }

  _updateAuras(e, dt) {
    if (!e.alive) return;
    const now = this.time;
    for (const a of e.auras) {
      if (a.until <= now) continue;
      if (a.tick && a.next <= now) {
        a.next += a.tick;
        const src = this.ents.get(a.srcId) || { id: a.srcId, level: a.srcLevel || 1, auras: [], kind: 'ghost' };
        if (a.tickDmg) this.damage(src, e, a.tickDmg, a.abId, { tick: true });
        if (a.tickHeal) this.heal(src, e, a.tickHeal, a.abId, false);
        if (a.pulse) {
          const lm = lvlMul(a.srcLevel || e.level);
          for (const o of [...this.ents.values()]) {
            if (!o.alive || o.kind === 'npc' || o.kind === 'node') continue;
            if (Math.hypot(o.x - e.x, o.z - e.z) > a.pulse.radius) continue;
            if (this.hostile(e, o)) this.damage(e, o, a.pulse.damage * lm, 'racetop', { tick: true });
            else if (o.kind === 'player') this.heal(e, o, a.pulse.heal * lm, 'racetop', true);
          }
        }
        if (!e.alive) return;
      }
    }
    if (this.tickNo % 10 === 0) e.auras = e.auras.filter((a) => a.until > now);
  }

  _updateSummon(s) {
    const now = this.time;
    if (now >= s.expire || !this.ents.has(s.owner)) { this.ents.delete(s.id); return; }
    if (now < s.pulseAt) return;
    const lm = lvlMul(s.level);
    if (s.what === 'cluster') {
      s.pulseAt = now + 1;
      for (const o of this.ents.values()) {
        if (o.kind === 'player' && o.alive && !this.hostile(s, o) && this.dist(o, s) < 10 && o.hp < o.maxHp) this.heal(s, o, 12 * lm, 'cluster', true);
      }
    } else if (s.what === 'turret') {
      s.pulseAt = now + 1.2;
      let best = null, bd = 26;
      const owner = this.ents.get(s.owner);
      const pref = owner && owner.target ? this.ents.get(owner.target) : null;
      if (pref && pref.alive && this.hostile(s, pref) && this.dist(s, pref) < 26) best = pref;
      else for (const o of this.ents.values()) {
        if (!o.alive || !this.hostile(s, o) || o.kind === 'npc') continue;
        if (o.kind === 'mob' && o.state === 'idle' && !(owner && o.id === owner.target)) continue;
        const d = this.dist(s, o);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        this.face(s, best);
        const flight = this.dist(s, best) / 40;
        this.projectiles.push({ src: s.id, tgt: best.id, at: now + flight, auto: true, amount: 12 * lm, abId: 'turret', level: s.level });
        this._event({ k: 'fire', s: s.id, t: best.id, ab: 'turret', d: flight, p: 'spark', c: 0xffb347 }, s);
      }
    }
  }

  _updatePlayer(p, dt) {
    const now = this.time;
    if (!p.alive) {
      if (p.bot && now > p.deadAt + 6) this._respawnPlayer(p);
      return;
    }
    const inCombat = this._inCombat(p);
    p.en = Math.min(p.maxEn, p.en + (inCombat ? 7 : 14) * dt);
    if (!inCombat && p.hp < p.maxHp) {
      const rate = p.emote === 'sit' ? 0.07 : 0.03;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * rate * dt);
    }
    if (p.casting) {
      const c = p.casting;
      const tgt = this.ents.get(c.tg);
      if (c.channel) {
        if (!tgt || !tgt.alive || this.dist(p, tgt) > ABILITIES[c.ab].range + 6) { this._interrupt(p); }
        else if (now >= c.nextTick) {
          c.nextTick += c.tickDt;
          this.face(p, tgt);
          this.damage(p, tgt, this._scaled(p, ABILITIES[c.ab].effects[0].amount), c.ab);
          if (now >= c.end - 0.01) p.casting = null;
        }
        if (p.casting && now >= c.end + 0.05) p.casting = null;
      } else if (now >= c.end) {
        p.casting = null;
        if (c.gather) this._finishGather(p, c);
        else if (tgt && tgt.alive) {
          const ab = ABILITIES[c.ab];
          if (tgt !== p && this.dist(p, tgt) > ab.range + 4) this._queuePrivate(p.id, { k: 'err', m: 'Target moved out of range.' });
          else this._execute(p, c.ab, tgt);
        }
      }
    }
    if (p.autoAttack && !p.casting && !this.isStunned(p)) {
      const t = this.ents.get(p.target);
      if (!t || !t.alive || !this.hostile(p, t)) p.autoAttack = false;
      else if (now >= p.swingAt) {
        const au = p.ch.auto;
        const d = this.dist(p, t) - (t.radius || 0.5);
        if (d <= au.range) {
          const haste = 1 + this._stat(p, 'haste');
          p.swingAt = now + au.speed / haste;
          if (au.melee) {
            this.face(p, t);
            this._event({ k: 'swing', s: p.id, t: t.id }, p);
            this.damage(p, t, this._scaled(p, au.dmg), 'auto');
          } else {
            const flight = this.dist(p, t) / 36;
            this.projectiles.push({ src: p.id, tgt: t.id, at: now + flight, auto: true, amount: this._scaled(p, au.dmg), abId: 'auto', level: p.level });
            this._event({ k: 'fire', s: p.id, t: t.id, ab: 'auto', d: flight, p: au.proj, c: au.color }, p);
          }
          p.combatUntil = now + 6;
        }
      }
    }
    if (p.bot) this._updateBot(p, dt);
  }

  // ------------------------------------------------------------------ mob AI
  _findAggro(m) {
    let best = null, bd = Infinity;
    for (const p of this.ents.values()) {
      if ((p.kind !== 'player' && p.kind !== 'summon') || !p.alive || !this.hostile(m, p)) continue;
      if (p.kind === 'summon' && !m.def.guard) continue;
      if (!m.def.guard && inSafeZone(p.x, p.z)) continue;
      let r = m.def.aggro + clamp((m.level - p.level) * 1.1, -6, 8);
      if (m.def.guard) r = m.def.aggro;
      const d = this.dist(m, p);
      if (d < r && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _engage(m, t) {
    if (!m.alive) return;
    if (m.state !== 'combat') {
      m.state = 'combat';
      m.swingAt = this.time + 0.6;
      if (m.def.boss) this._event({ k: 'yell', s: m.id, m: 'Another race begins! Cut every corner, sacrifice every value — the lead is all that matters!' }, m, 400);
    }
    if (!m.threat.has(t.id)) m.threat.set(t.id, 1);
    if (!m.target) m.target = t.id;
    if (!m.def.guard) {
      for (const o of this.ents.values()) {
        if (o !== m && o.kind === 'mob' && o.alive && o.state === 'idle' && o.mobType === m.mobType && this.dist(o, m) < 7 && !o.def.boss) {
          o.state = 'combat'; o.threat.set(t.id, 1); o.target = t.id; o.swingAt = this.time + 0.8;
        }
      }
    }
  }

  _evade(m) {
    if (m.temp) { this.ents.delete(m.id); return; }
    m.state = 'evade'; m.evading = true; m.target = 0; m.threat.clear(); m.tappers.clear();
    m.casting = null; m.auras = [];
  }

  _moveToward(e, tx, tz, speed, dt, stopAt = 0) {
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt + 0.01) { e.moving = false; return true; }
    const step = Math.min(d - stopAt, speed * dt);
    e.x += (dx / d) * step; e.z += (dz / d) * step;
    e.ry = Math.atan2(dx, dz);
    e.y = this.terrain.groundAt(e.x, e.z);
    e.moving = true;
    return d - step <= stopAt + 0.05;
  }

  _updateMob(m, dt) {
    const now = this.time;
    if (!m.alive) {
      if (now >= m.respawnAt) {
        const [x, z] = m.def.boss || m.def.guard || m.def.elite ? [m.spawn.x, m.spawn.z] : this.terrain.randomPointIn(m.spawn.x, m.spawn.z, 6, this.rand);
        m.x = x; m.z = z; m.y = this.terrain.groundAt(x, z);
        m.alive = true; m.hp = m.maxHp; m.state = 'idle'; m.evading = false; m.auras = []; m.phase = 0;
        m.level = m.def.lvl[0] + Math.floor(this.rand() * (m.def.lvl[1] - m.def.lvl[0] + 1));
        m.maxHp = m.hp = m.def.hpFixed || Math.round(mobHp(m.level) * m.def.hp);
        this._event({ k: 'respawn', t: m.id }, m);
      }
      return;
    }
    m.moving = false;
    if (this.isStunned(m)) return;
    const def = m.def;
    const speed = def.speed * this.speedMul(m);
    if (m.state === 'idle') {
      if (now >= m.nextAggro) {
        m.nextAggro = now + 0.3;
        const t = this._findAggro(m);
        if (t) { this._engage(m, t); return; }
      }
      if (def.guard) {
        if (Math.hypot(m.x - m.spawn.x, m.z - m.spawn.z) > 0.5) this._moveToward(m, m.spawn.x, m.spawn.z, speed * 0.5, dt);
        else m.ry = m.spawnRy;
        return;
      }
      if (now >= m.nextWander && !def.boss) {
        m.nextWander = now + 5 + this.rand() * 9;
        const [x, z] = this.terrain.randomPointIn(m.spawn.x, m.spawn.z, 8, this.rand);
        m.goal = { x, z };
      }
      if (m.goal && this._moveToward(m, m.goal.x, m.goal.z, speed * 0.32, dt)) m.goal = null;
      return;
    }
    if (m.state === 'evade') {
      if (this._moveToward(m, m.spawn.x, m.spawn.z, speed * 1.6, dt, 0.3)) {
        m.state = 'idle'; m.evading = false; m.hp = m.maxHp; m.phase = 0; m.ry = m.spawnRy;
      }
      return;
    }
    // combat
    const leash = def.leash || (def.guard ? 34 : 42);
    if (Math.hypot(m.x - m.spawn.x, m.z - m.spawn.z) > leash) return this._evade(m);
    let tgt = null, top = -1;
    for (const [id, v] of m.threat) {
      const o = this.ents.get(id);
      if (!o || !o.alive || this.dist(o, m) > 70 || !this.hostile(m, o)) { m.threat.delete(id); continue; }
      if (!def.guard && inSafeZone(o.x, o.z)) { m.threat.delete(id); continue; }
      if (v > top) { top = v; tgt = o; }
    }
    if (!tgt) {
      const t = this._findAggro(m);
      if (t) { m.threat.set(t.id, 1); tgt = t; } else return this._evade(m);
    }
    m.target = tgt.id;
    if (m.casting) {
      const c = m.casting;
      if (now >= c.end) { m.casting = null; this._mobSpecial(m, tgt, true); }
      return;
    }
    if (def.boss) {
      const pct = m.hp / m.maxHp;
      if (m.phase === 0 && pct < 0.6) { m.phase = 1; this._molochAdds(m); }
      else if (m.phase === 1 && pct < 0.3) { m.phase = 2; this._molochAdds(m); }
    }
    if (def.special && now >= m.specialAt) {
      m.specialAt = now + def.special.cd;
      if (def.special.cast) {
        m.casting = { ab: def.special.id, start: now, end: now + def.special.cast, dur: def.special.cast, tg: tgt.id };
        this._event({ k: 'cast', s: m.id, ab: def.special.id, d: def.special.cast, t: tgt.id, n: def.special.name }, m);
        this._event({ k: 'tele', s: m.id, r: def.special.radius, d: def.special.cast }, m);
        return;
      }
      this._mobSpecial(m, tgt, false);
    }
    const range = def.range + (tgt.radius || 0.5);
    const d = this.dist(m, tgt);
    if (d > range) {
      this._moveToward(m, tgt.x, tgt.z, speed, dt, range * 0.8);
    } else {
      this.face(m, tgt);
      if (now >= m.swingAt) {
        const enrage = def.boss && m.phase === 2 ? 1.5 : 1;
        m.swingAt = now + def.atkSpeed / (enrage * (1 + this._stat(m, 'haste')));
        const dmg = mobDmg(m.level) * def.dmg;
        if (def.ranged) {
          const flight = d / 26;
          this.projectiles.push({ src: m.id, tgt: tgt.id, at: now + flight, auto: true, amount: dmg, abId: 'mob', level: m.level });
          this._event({ k: 'fire', s: m.id, t: tgt.id, ab: 'mob', d: flight, p: def.proj || 'bolt', c: def.color || 0xff5555 }, m);
        } else {
          this._event({ k: 'swing', s: m.id, t: tgt.id }, m);
          this.damage(m, tgt, dmg, 'mob');
        }
      }
    }
  }

  _mobSpecial(m, tgt, fromCast) {
    const sp = m.def.special;
    const lm = 1 + (m.level - 1) * 0.1;
    if (sp.id === 'gaze') {
      this._event({ k: 'fx', s: m.id, t: tgt.id, ab: 'gaze', x: tgt.x, z: tgt.z }, m);
      this.damage(m, tgt, sp.damage * lm, 'gaze');
      tgt.stunUntil = Math.max(tgt.stunUntil, this.time + sp.stun);
      this._addAura(tgt, { id: 'stun', name: 'Acausally Stunned', icon: 'stun', harmful: true, dur: sp.stun, srcId: m.id });
      if (tgt.casting) this._interrupt(tgt);
    } else if (sp.id === 'furnace') {
      this._event({ k: 'boom', s: m.id, ab: 'furnace', x: m.x, z: m.z, r: sp.radius }, m);
      for (const o of [...this.ents.values()]) {
        if (!o.alive || !this.hostile(m, o) || this.dist(o, m) > sp.radius) continue;
        this.damage(m, o, sp.damage * lm, 'furnace');
        if (o.alive) this._addAura(o, { id: 'furnace_dot', name: 'Burning Sacrifice', icon: 'flame', harmful: true, srcId: m.id, srcLevel: m.level, abId: 'furnace', dur: 5, tick: 1, next: this.time + 1, tickDmg: 7 * lm });
      }
    }
  }

  _molochAdds(m) {
    this._event({ k: 'yell', s: m.id, m: 'RACE TO THE BOTTOM! My imps will get there first!' }, m, 400);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const imp = this._spawnMob('imp', m.x + Math.cos(a) * 9, m.z + Math.sin(a) * 9);
      imp.level = 8; imp.maxHp = imp.hp = Math.round(mobHp(8) * 0.7);
      imp.temp = true; imp.spawn = { x: m.spawn.x, z: m.spawn.z };
      const t = this.ents.get(m.target);
      if (t) this._engage(imp, t);
    }
  }

  // ------------------------------------------------------------------ bot AI
  _areasFor(p) {
    const out = [];
    for (const sp of SPAWNS) {
      const def = MOBS[sp.mob];
      if (def.boss || def.elite) continue;
      if (def.lvl[0] <= p.level + 1 && def.lvl[1] >= p.level - 2) out.push({ x: sp.x, z: sp.z, r: sp.r, mob: sp.mob });
    }
    if (!out.length) {
      const sp = SPAWNS.find((s) => s.mob === 'shoggoth');
      out.push({ x: sp.x, z: sp.z, r: sp.r, mob: sp.mob });
    }
    return out;
  }

  _updateBot(b, dt) {
    const ai = b.ai, now = this.time;
    if (b.casting || this.isStunned(b)) { b.moving = false; return; }
    if (now >= ai.chatAt) {
      ai.chatAt = now + 60 + this.rand() * 160;
      const lines = BOT_CHAT[b.faction];
      if (this.clients.size) this._broadcastChat(b, lines[Math.floor(this.rand() * lines.length)], 'world');
    }
    if (now >= ai.think) {
      ai.think = now + 0.35 + this.rand() * 0.25;
      let tgt = this.ents.get(b.target);
      if (tgt && (!tgt.alive || !this.hostile(b, tgt) || tgt.evading || this.dist(b, tgt) > 80)) { b.target = 0; tgt = null; }
      let attacker = null, ad = 45;
      for (const o of this.ents.values()) {
        if (!o.alive || !this.hostile(b, o)) continue;
        if (o.target === b.id && (o.kind === 'mob' ? o.state === 'combat' : this._inCombat(o))) {
          const d = this.dist(b, o);
          if (d < ad) { ad = d; attacker = o; }
        }
      }
      if (ai.lastAttacker) {
        const la = this.ents.get(ai.lastAttacker);
        if (la && la.alive && this.dist(la, b) < 40) attacker = attacker || la;
        else ai.lastAttacker = 0;
      }
      if (attacker && (!tgt || tgt.kind !== 'mob' || tgt.state !== 'combat')) { b.target = attacker.id; tgt = attacker; }
      if (!tgt && !this._inCombat(b) && b.hp < b.maxHp * 0.5) { b.emote = 'sit'; ai.restUntil = now + 20; }
      if (b.emote === 'sit') {
        if (b.hp >= b.maxHp * 0.95 || this._inCombat(b) || now > ai.restUntil) b.emote = null;
        else return;
      }
      if (!tgt) {
        let best = null, bd = 60;
        for (const o of this.ents.values()) {
          if (o.kind !== 'mob' || !o.alive || o.evading || o.def.guard || o.faction !== 'monster') continue;
          if (o.def.boss) {
            if (b.level < 9) continue;
            const allies = [...this.ents.values()].filter((x) => x.kind === 'player' && x.alive && x.level >= 8 && this.dist(x, o) < 60).length;
            if (allies < 3 && o.state !== 'combat') continue;
          } else if (o.def.elite) {
            if (b.level < 8) continue;
          } else if (o.level > b.level + 2 || o.level < b.level - 4) continue;
          const d = this.dist(b, o);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) { b.target = best.id; tgt = best; ai.goal = null; }
      }
      if (!tgt && !ai.goal) {
        let areas = this._areasFor(b);
        if (b.level >= 9 && this.rand() < 0.35) areas = [{ x: SITES.spire.x, z: SITES.spire.z + 30, r: 12 }];
        const a = areas[Math.floor(this.rand() * areas.length)];
        const [x, z] = this.terrain.randomPointIn(a.x, a.z, a.r * 0.7, this.rand);
        ai.goal = { x, z };
      }
      ai.plan = tgt ? this._botPickAbility(b, tgt) : null;
    }
    const tgt = this.ents.get(b.target);
    if (tgt && tgt.alive) {
      const plan = ai.plan;
      const au = b.ch.auto;
      const want = plan ? Math.max(2.5, (ABILITIES[plan.ab].range || au.range) - 2) : Math.max(2.5, au.range - 2);
      const d = this.dist(b, tgt) - (tgt.radius || 0.5);
      b.autoAttack = true;
      if (d > want) {
        this._moveToward(b, tgt.x, tgt.z, b.ch.speed * this.speedMul(b), dt, want * 0.85 + (tgt.radius || 0.5));
        b.anim = 1;
        if (plan && ABILITIES[plan.ab].cast === 0 && d <= (ABILITIES[plan.ab].range || 0) && this.tryCast(b, plan.ab, plan.tg, true)) ai.plan = null;
      } else {
        b.moving = false; b.anim = 0;
        this.face(b, tgt);
        if (plan && this.tryCast(b, plan.ab, plan.tg, true)) ai.plan = null;
      }
    } else if (ai.goal) {
      b.autoAttack = false;
      if (this._moveToward(b, ai.goal.x, ai.goal.z, b.ch.speed * this.speedMul(b), dt, 1)) ai.goal = null;
      b.anim = b.moving ? 1 : 0;
      const [lx, lz] = ai.lastPos;
      if (Math.hypot(b.x - lx, b.z - lz) < 0.05) { ai.stuckT += dt; if (ai.stuckT > 4) { ai.goal = null; ai.stuckT = 0; } }
      else ai.stuckT = 0;
      ai.lastPos = [b.x, b.z];
    } else { b.moving = false; b.anim = 0; }
    if (b.y < -0.6) b.anim = 5;
  }

  _botPickAbility(b, tgt) {
    const now = this.time;
    const ready = (id) => (b.cds[id] || 0) <= now && b.en >= ABILITIES[id].cost && (ABILITIES[id].gcd === false || b.gcdUntil <= now);
    const abs = b.ch.abilities;
    const hpPct = b.hp / b.maxHp;
    const nearEnemies = [...this.ents.values()].filter((o) => o.alive && this.hostile(b, o) && this.dist(o, b) < 9).length;
    for (const id of abs) {
      const ab = ABILITIES[id];
      if (!ready(id)) continue;
      const ef = ab.effects[0];
      if (ab.target === 'ally' || (ab.target === 'any')) {
        if (hpPct < 0.6) return { ab: id, tg: b.id };
        if (ab.target === 'any' && ef.type === 'smart') return { ab: id, tg: tgt.id };
        continue;
      }
      if (ef.type === 'dash') continue;
      if (ef.type === 'shield' && ab.target === 'self') { if (hpPct < 0.65) return { ab: id, tg: b.id }; continue; }
      if (ef.type === 'aoe' && ef.friendly) { if (hpPct < 0.6 || ef.effects[0].type === 'buff') return { ab: id, tg: b.id }; continue; }
      if (ef.type === 'aoe' && ef.center === 'self') { if (nearEnemies >= 1 && this.dist(b, tgt) < ef.radius - 1) return { ab: id, tg: b.id }; continue; }
      if (ef.type === 'buff') { if (this._inCombat(b)) return { ab: id, tg: b.id }; continue; }
      if (ef.type === 'summon') { if (this._inCombat(b)) return { ab: id, tg: b.id }; continue; }
      if (ab.target === 'enemy') {
        if (ef.type === 'dot' && tgt.auras.some((a) => a.id === id + '_dot' && a.srcId === b.id)) continue;
        if (ab.cd >= 40 && tgt.hp < tgt.maxHp * 0.25 && !(tgt.def && tgt.def.boss)) continue;
        return { ab: id, tg: tgt.id };
      }
    }
    if ((b.items.potion || 0) > 0 && hpPct < 0.3 && ready('potion')) return { ab: 'potion', tg: b.id };
    return null;
  }

  // ------------------------------------------------------------------ networking
  _info(e) {
    const o = { id: e.id, k: e.kind, n: e.name, f: e.faction, l: e.level, mh: e.maxHp };
    if (e.champion) o.c = e.champion;
    if (e.mobType) { o.mt = e.mobType; if (e.def.elite) o.el = 1; if (e.def.boss) o.bs = 1; if (e.def.title) o.ti = e.def.title; }
    if (e.npcId) { o.npc = e.npcId; o.ti = e.title; }
    if (e.nodeType) o.nt = e.nodeType;
    if (e.kind === 'summon') { o.w = e.what; o.own = e.owner; }
    if (e.kind === 'player') { if (e.title) o.ti = e.title; if (e.bot) o.bot = 1; }
    return o;
  }

  _flags(e) {
    let f = 0;
    const now = this.time;
    if (!e.alive) f |= F_DEAD;
    if (e.combatUntil > now || e.state === 'combat') f |= F_COMBAT;
    if (e.casting) f |= F_CAST;
    if (e.stunUntil > now) f |= F_STUN;
    if (e.evading) f |= F_EVADE;
    if (e.emote === 'sit') f |= F_SIT;
    for (const a of e.auras) {
      if (a.until <= now) continue;
      if (a.shield > 0) f |= F_SHIELD;
      if (a.id === 'thermogod' || a.id === 'ev' || a.id === 'racetop') f |= F_GLOW;
      if (a.haste) f |= F_HASTE;
    }
    return f;
  }

  _flush() {
    const now = this.time;
    const evs = this.events;
    this.events = [];
    for (const c of this.clients.values()) {
      const p = this.ents.get(c.id);
      if (!p) continue;
      const add = [], rem = [], rows = [];
      const seen = new Set();
      for (const e of this.ents.values()) {
        if (e !== p && (Math.abs(e.x - p.x) > INTEREST || Math.abs(e.z - p.z) > INTEREST)) continue;
        seen.add(e.id);
        if (!c.known.has(e.id)) { c.known.add(e.id); add.push(this._info(e)); }
        rows.push([e.id, Math.round(e.x * 100) / 100, Math.round(e.y * 100) / 100, Math.round(e.z * 100) / 100, Math.round(e.ry * 100) / 100,
          Math.round(e.hp), e.maxHp, this._flags(e), e.target || 0, e.level, e.anim || (e.moving ? 1 : 0), e.emote || 0]);
      }
      for (const id of c.known) if (!seen.has(id)) { c.known.delete(id); rem.push(id); }
      const ev = [];
      for (const x of evs) {
        if (x.to) { if (x.to === c.id) ev.push(x.ev); continue; }
        if (Math.abs(x.x - p.x) < x.r && Math.abs(x.z - p.z) < x.r) ev.push(x.ev);
      }
      const msg = { t: 's', tm: Math.round(now * 1000) / 1000, dt: this.dayTime, e: rows, me: this._me(p) };
      if (add.length) msg.add = add;
      if (rem.length) msg.rem = rem;
      if (ev.length) msg.ev = ev;
      c.send(msg);
    }
  }

  _me(p) {
    const now = this.time;
    const cds = {};
    for (const k in p.cds) { const r = p.cds[k] - now; if (r > 0) cds[k] = Math.round(r * 100) / 100; }
    const au = [];
    for (const a of p.auras) {
      if (a.until <= now) continue;
      au.push([a.id, a.name || a.id, a.icon || 'star', Math.round((a.until - now) * 10) / 10, a.dur, a.harmful ? 1 : 0, a.stacks || 0, a.shield || 0]);
    }
    const c = p.casting;
    return {
      hp: Math.round(p.hp), mh: p.maxHp, en: Math.round(p.en), me: p.maxEn, l: p.level, xp: Math.round(p.xp), xn: xpForLevel(p.level),
      g: p.gold, cd: cds, gcd: Math.max(0, Math.round((p.gcdUntil - now) * 100) / 100), cast: c ? { ab: c.ab, r: Math.max(0, c.end - now), d: c.dur, ch: c.channel ? 1 : 0 } : null,
      au, q: p.quests, qd: p.done, it: p.items, st: Math.max(0, p.stunUntil - now), sm: this.speedMul(p), ti: p.title, aa: p.autoAttack ? 1 : 0,
      tg: p.target, cb: this._inCombat(p) ? 1 : 0, rt: this._rooted(p) ? 1 : 0,
    };
  }
}

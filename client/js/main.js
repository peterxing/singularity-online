import * as THREE from 'three';
import { Terrain, SITES } from '../shared/terrain.js';
import { CHAMPIONS, ABILITIES, FACTIONS, MOBS, NPCS, QUESTS, ITEMS } from '../shared/data.js';
import { FLAGS } from '../shared/world.js';
import { Gfx, QUALITY } from './gfx.js';
import { Sky } from './sky.js';
import { TerrainView, makeGridTextures } from './terrainView.js';
import { Water } from './water.js';
import { Grass } from './grass.js';
import { Foliage } from './foliage.js';
import { Buildings } from './buildings.js';
import { VFX } from './vfx.js';
import { Entities, isHostile } from './entities.js';
import { Controller } from './controller.js';
import { UI, buildMapImage } from './ui.js';
import { Net } from './net.js';
import { Audio } from './audio.js';
import { CharacterModel, NPC_LOOKS, enrichChampionLook } from './characters.js';
import { createMobModel } from './mobs.js';

const V3 = THREE.Vector3;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const tmp = new V3(), tmp2 = new V3();

const SHOWCASE = {
  eacc: { p: [234, 40], look: [310, 26] },
  ea: { p: [-234, 40], look: [-310, 26] },
};

class Game {
  constructor() {
    this.time = 0;
    this.dayTime = 0.62;
    this.me = null;
    this.meRecv = 0;
    this.myId = 0;
    this.targetId = 0;
    this.selectMode = true;
    this.showFps = false;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsShown = 0;
    this.qualityCheck = { t: 0, frames: 0, done: false };
    this.faction = 'eacc';
    this.placed = false;
  }

  async boot() {
    this.ui = new UI(this);
    this.audio = new Audio();
    this.ui.loading(3, 'Warming up the renderer…');
    await nextFrame();
    this.gfx = new Gfx(document.getElementById('game'));
    this.settings = this.loadSettings();
    this.ui.loading(8, 'Generating Latentia — heightfield, rivers and roads…');
    await nextFrame();
    this.terrain = new Terrain();
    this.ui.loading(30, 'Painting the sky…');
    await nextFrame();
    this.tex = makeGridTextures(this.terrain);
    this.sky = new Sky(this.gfx);
    this.sky.override = this.settings.tod || 'auto';
    this.terrainView = new TerrainView(this.gfx, this.terrain, this.tex);
    this.water = new Water(this.gfx, this.tex, this.sky);
    this.ui.loading(40, 'Growing a few hundred thousand blades of grass…');
    await nextFrame();
    this.grass = new Grass(this.gfx, this.tex);
    this.ui.loading(50, 'Planting forests…');
    await nextFrame();
    this.foliage = new Foliage(this.gfx, this.terrain);
    this.vfx = new VFX(this.gfx, this.tex);
    this.ui.loading(62, 'Raising the capitals and the Singularity Spire…');
    await nextFrame();
    this.buildings = new Buildings(this.gfx, this.terrain, this.vfx);
    this._ambientEmitters();
    this.ui.loading(74, 'Sculpting champions…');
    await nextFrame();
    this.portraits = this.makePortraits();
    this.ui.portraits = this.portraits;
    this.mapImage = buildMapImage(this.terrain, 512);
    this.ents = new Entities(this);
    this.ents.showPlates = this.settings.plates !== false;
    this.ctrl = new Controller(this);
    this.ctrl.sens = this.settings.sens || this.ctrl.sens;
    this.ctrl.invert = !!this.settings.invert;
    this.ctrl.setColliders([...this.foliage.colliders, ...this.buildings.colliders]);
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffaa55, 0, 24, 2); this.gfx.scene.add(l); this.lights.push(l); }
    this.ui.loading(88, 'Contacting the realm…');
    await nextFrame();
    this.net = new Net(this.terrain);
    this.net.on((m) => this.onMessage(m));
    this.net.onClose = () => document.getElementById('disconnect').classList.remove('hidden');
    this.mode = await this.net.connect();
    this.net.onUpgrade = (m) => { this.mode = m; if (this.selectMode) this.ui.setRealm(m); };
    this.ui.loading(95, 'Compiling shaders…');
    await nextFrame();
    this.enterSelect();
    if (new URLSearchParams(location.search).has('gallery')) this.enterGallery(new URLSearchParams(location.search).get('gallery'));
    this.sky.update(0.016, this.dayTime, this.gfx.camera.position, 0);
    try { this.gfx.renderer.compile(this.gfx.scene, this.gfx.camera); } catch (e) { console.warn(e); }
    this.ui.loading(100, 'Ready.');
    await nextFrame();
    this.ui.hideLoading();
    this.last = performance.now();
    window.addEventListener('beforeunload', () => this.net.saveNow());
    requestAnimationFrame(() => this.loop());
  }

  loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('so_settings') || '{}'); } catch { s = {}; }
    if (s.quality && QUALITY[s.quality]) { this.gfx.setQuality(s.quality); this.qualityCheck.done = true; }
    if (s.bloom === false) this.gfx.bloomOn = false;
    this.showFps = !!s.fps;
    document.getElementById('fps').classList.toggle('hidden', !this.showFps);
    if (s.vol !== undefined) this.audio.volume = s.vol;
    if (s.music !== undefined) this.audio.musicVol = s.music;
    return s;
  }

  saveSettings() {
    const s = { quality: this.gfx.qualityKey, tod: this.sky.override, bloom: this.gfx.bloomOn, plates: this.ents.showPlates, fps: this.showFps, vol: this.audio.volume, music: this.audio.musicVol, sens: this.ctrl.sens, invert: this.ctrl.invert };
    localStorage.setItem('so_settings', JSON.stringify(s));
  }

  setQuality(key) {
    this.gfx.setQuality(key);
    this.sky.applyShadowQuality();
    this.grass.build(this.gfx.q);
    this.qualityCheck.done = true;
    this.saveSettings();
  }

  _ambientEmitters() {
    const sc = this.foliage.scatter;
    for (let i = 0; i < sc.trees.length; i += 23) {
      const t = sc.trees[i];
      if (t.type === 'crystal' || t.type === 'dead') continue;
      this.vfx.addEmitter({ type: 'firefly', x: t.x, y: t.y + 0.5, z: t.z, rate: 0.6, radius: 6, range: 70, night: true });
    }
  }

  // ------------------------------------------------------------------ portraits (rendered offscreen with a tiny second renderer)
  makePortraits() {
    const out = {};
    let r;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch { return out; }
    r.setSize(160, 160, false);
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const envScene = new THREE.Scene();
    const eg = new THREE.SphereGeometry(10, 16, 8);
    const ec = [];
    for (let i = 0; i < eg.attributes.position.count; i++) { const y = eg.attributes.position.getY(i) / 10; const c = new THREE.Color().setHSL(0.58, 0.4, 0.25 + y * 0.35); ec.push(c.r, c.g, c.b); }
    eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
    envScene.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pm = new THREE.PMREMGenerator(r);
    const env = pm.fromScene(envScene, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(1.5, 2.5, 3);
    const rim = new THREE.DirectionalLight(0x8fd0ff, 2.2); rim.position.set(-2, 1.5, -2);
    scene.add(key, rim, new THREE.HemisphereLight(0xbfd8ff, 0x3a2a20, 0.6));
    const bg = (a, b) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); const g = x.createRadialGradient(32, 26, 4, 32, 32, 46); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const bgs = { eacc: bg('#7a3a10', '#1a0a04'), ea: bg('#1a4a7a', '#040a1a'), mob: bg('#5a1a1a', '#0a0404'), npc: bg('#4a4a2a', '#0a0a04') };
    const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 100);
    const shoot = (k, model, bgk, headBone = 'head', distMul = 1) => {
      scene.background = bgs[bgk];
      scene.add(model.object);
      for (let i = 0; i < 30; i++) model.update(0.033, { speed: 0 });
      model.object.updateMatrixWorld(true);
      const h = model.worldOf(headBone, new V3());
      if (!model.bones[headBone]) h.y = model.height * 0.55;
      const d = (model.bones[headBone] ? 1.0 * (model.scale || 1) : model.height * 1.2) * distMul;
      if (model.bones[headBone]) h.y += 0.05 * (model.scale || 1);
      cam.position.set(h.x + d * 0.35, h.y + d * 0.12, h.z + d);
      cam.lookAt(h.x, h.y - 0.02 * (model.scale || 1), h.z);
      r.render(scene, cam);
      out[k] = r.domElement.toDataURL('image/jpeg', 0.9);
      scene.remove(model.object);
      model.material.dispose();
    };
    for (const id in CHAMPIONS) shoot('c:' + id, new CharacterModel(enrichChampionLook(CHAMPIONS[id]), { cacheKey: 'c:' + id, seed: 1 }), CHAMPIONS[id].faction);
    for (const p in NPC_LOOKS) {
      if (p.startsWith('guard')) continue;
      shoot('n:' + p, new CharacterModel({ ...NPC_LOOKS[p] }, { cacheKey: 'n:' + p, seed: 2 }), 'npc');
    }
    for (const mt of ['paperclip', 'wraith', 'imp', 'golem', 'shoggoth', 'basilisk', 'moloch', 'guard_eacc', 'guard_ea', 'turret', 'cluster', 'sheaf']) {
      const m = createMobModel(mt);
      const bone = m.bones.head ? 'head' : m.bones.body ? 'body' : 'root';
      shoot('m:' + mt, m, mt.startsWith('guard') ? (mt === 'guard_ea' ? 'ea' : 'eacc') : 'mob', bone, mt === 'basilisk' ? 2.2 : mt === 'shoggoth' ? 1.4 : ['paperclip', 'wraith'].includes(mt) ? 1.3 : 1);
    }
    pm.dispose();
    r.dispose();
    try { r.forceContextLoss(); } catch { /* ignore */ }
    return out;
  }

  // ------------------------------------------------------------------ character select
  enterSelect() {
    this.selectMode = true;
    this.ui.setRealm(this.mode);
    const scene = this.gfx.scene;
    this.pedestal = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.45, 32), new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.5, metalness: 0.3 }));
    top.position.y = 0.22; top.receiveShadow = top.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.05, 8, 48), new THREE.MeshStandardMaterial({ color: 0x100a04, emissive: 0xffc060, emissiveIntensity: 2.5 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.45;
    this.pedestal.add(top, ring);
    this.pedestalRing = ring;
    scene.add(this.pedestal);
    this.ui.showSelect(this.portraits, (faction, champ) => this.setPreview(faction, champ), (name, champ) => this.enterWorld(name, champ));
  }

  setPreview(faction, champ) {
    const sc = SHOWCASE[faction];
    const px = sc.p[0], pz = sc.p[1];
    const py = this.terrain.heightAt(px, pz);
    this.pedestal.position.set(px, py - 0.05, pz);
    this.pedestalRing.material.emissive.set(FACTIONS[faction].color);
    if (this.preview) { this.gfx.scene.remove(this.preview.object); this.preview.material.dispose(); }
    const m = new CharacterModel(enrichChampionLook(CHAMPIONS[champ]), { cacheKey: 'c:' + champ, seed: 1 });
    m.object.position.set(px, py + 0.44, pz);
    const toLook = Math.atan2(sc.look[0] - px, sc.look[1] - pz);
    this.selYaw = toLook + Math.PI;
    m.object.rotation.y = this.selYaw;
    this.gfx.scene.add(m.object);
    this.preview = m;
    this.previewChamp = champ;
    this.previewT = 0;
    this.ctrl.camYaw = toLook;
    this.ctrl.camPitch = 0.08;
    const back = new V3(Math.sin(toLook), 0, Math.cos(toLook));
    this.selCam = new V3(px - back.x * 5.4 + Math.cos(toLook) * 1.3, py + 1.9, pz - back.z * 5.4 - Math.sin(toLook) * 1.3);
    this.selTarget = new V3(px, py + 1.45, pz);
    this.faction = faction;
    this.vfx.buffSpiral(new V3(px, py + 0.4, pz), new THREE.Color(FACTIONS[faction].color).getHex());
  }

  enterGallery(kind) {
    document.getElementById('select').classList.add('hidden');
    const px = -236, pz = 40;
    const py = this.terrain.heightAt(px, pz);
    this.gallery = [];
    const ids = kind === 'mobs' ? ['paperclip', 'wraith', 'imp', 'golem', 'shoggoth', 'guard_eacc', 'guard_ea', 'basilisk'] : Object.keys(CHAMPIONS);
    ids.forEach((id, i) => {
      const m = kind === 'mobs' ? createMobModel(id) : new CharacterModel(enrichChampionLook(CHAMPIONS[id]), { cacheKey: 'c:' + id, seed: 1 });
      const spacing = kind === 'mobs' ? 3.2 : 1.35;
      const x = px + (i - (ids.length - 1) / 2) * spacing;
      m.object.position.set(x, this.terrain.heightAt(x, pz), pz);
      m.object.rotation.y = Math.PI;
      this.gfx.scene.add(m.object);
      this.gallery.push(m);
    });
    this.selCam = new V3(px, py + (kind === 'mobs' ? 3.2 : 1.8), pz - (kind === 'mobs' ? 14 : 7.2));
    this.selTarget = new V3(px, py + (kind === 'mobs' ? 1.4 : 1.2), pz);
    this.preview && this.gfx.scene.remove(this.preview.object);
    this.preview = null;
    this.galleryMode = true;
  }

  updateSelect(dt) {
    if (this.galleryMode) {
      const cam = this.gfx.camera;
      cam.position.copy(this.selCam);
      cam.lookAt(this.selTarget);
      const pose = new URLSearchParams(location.search).get('pose');
      this.gallery.forEach((m, i) => m.update(dt, { speed: pose === 'run' ? 6 : 0, cast: pose === 'cast' ? 1 : 0, attackT: pose === 'attack' ? (this.time % 1.2) : 9, emote: pose || null }));
      return;
    }
    const cam = this.gfx.camera;
    this.previewT += dt;
    const sway = Math.sin(this.time * 0.25) * 0.35;
    cam.position.copy(this.selCam).add(tmp.set(Math.cos(this.time * 0.2) * 0.4, Math.sin(this.time * 0.3) * 0.15, 0));
    cam.lookAt(this.selTarget);
    if (this.preview) {
      const m = this.preview;
      if (this.ctrl.mouse.l) this.selYaw -= 0;
      m.object.rotation.y = this.selYaw + sway + (this.ctrl.camYaw - Math.atan2(SHOWCASE[this.faction].look[0] - SHOWCASE[this.faction].p[0], SHOWCASE[this.faction].look[1] - SHOWCASE[this.faction].p[1])) * -1;
      const cyc = this.previewT % 9;
      const casting = cyc > 5 && cyc < 7;
      m.update(dt, { speed: 0, cast: casting ? 1 : 0, emote: cyc > 7.4 ? 'cheer' : null });
      if (casting && Math.random() < dt * 40) {
        const hand = m.worldOf(Math.random() < 0.5 ? 'handR' : 'handL', tmp);
        const c = new THREE.Color(ABILITIES[CHAMPIONS[this.previewChamp].abilities[0]].color);
        this.vfx.add.spawn(hand.x, hand.y, hand.z, (Math.random() - 0.5), 0.8 + Math.random(), (Math.random() - 0.5), c.r * 3, c.g * 3, c.b * 3, 1, 0.25, 0.6, 1, 0);
      }
    }
  }

  enterWorld(name, champ) {
    this.pendingName = name;
    this.mode = this.net.mode === 'online' ? 'online' : 'offline';
    this.net.join(name, champ);
    document.getElementById('enterBtn').disabled = true;
  }

  // ------------------------------------------------------------------ networking
  onMessage(m) {
    switch (m.t) {
      case 'welcome': return this.onWelcome(m);
      case 's': return this.onSnapshot(m);
      case 'pos': this.ctrl.teleport(m.x, m.y, m.z); return;
      default: return;
    }
  }

  onWelcome(m) {
    this.myId = m.id;
    this.myName = m.name;
    this.champion = m.champion;
    this.faction = CHAMPIONS[m.champion].faction;
    this.ents.meId = m.id;
    this.dayTime = m.dayTime;
    this.selectMode = false;
    if (this.preview) { this.gfx.scene.remove(this.preview.object); this.preview.material.dispose(); this.preview = null; }
    this.gfx.scene.remove(this.pedestal);
    this.ui.hideSelect();
    this.ui.initHud(m.champion, m.name);
    this.ctrl.speed = CHAMPIONS[m.champion].speed;
    this.ctrl.camPitch = 0.28;
    this.ctrl.dist = this.ctrl.distCur = 9;
    this.sky.override = this.settings.tod || 'auto';
    this.ui.chat(`Connected to ${this.mode === 'online' ? 'the Latent Space realm' : 'the solo realm, where simulated players roam'}. Welcome, ${m.name}!`, 'sys');
    this.ui.chat('Talk to NPCs with a gold ! to get quests. Press H for controls.', 'sys');
    this.audio.faction = this.faction;
  }

  onSnapshot(m) {
    this.dayTime = m.dt;
    this.ents.applySnapshot(m);
    if (m.me) {
      this.me = m.me;
      this.meRecv = performance.now();
      this.ctrl.speedMul = m.me.sm;
      this.ctrl.stunned = m.me.st > 0;
      this.ctrl.rooted = !!m.me.rt;
      if (m.me.tg !== this.targetId && m.me.tg && !this.targetId) this.setTarget(m.me.tg, false);
    }
    const mine = this.ents.map.get(this.myId);
    if (mine) {
      if (!this.placed) {
        this.placed = true;
        this.ctrl.teleport(mine.pos.x, mine.pos.y, mine.pos.z);
        this.ctrl.yaw = this.ctrl.camYaw = mine.ry;
        this.ctrl.enabled = true;
        this.myScale = mine.model.scale || 1;
      }
      const dead = mine.dead;
      if (dead && !this.ctrl.dead) { this.ctrl.dead = true; setTimeout(() => { if (this.ctrl.dead) this.ui.showDeath(true); }, 1400); }
      if (!dead && this.ctrl.dead) { this.ctrl.dead = false; this.ui.showDeath(false); }
    }
    if (m.ev) for (const e of m.ev) { try { this.onEvent(e); } catch (err) { console.error(err, e); } }
  }

  chest(v, out = new V3()) { return out.set(v.pos.x, v.pos.y + v.height * 0.6, v.pos.z); }

  hand(v, out = new V3()) {
    if (!v) return out.set(0, 0, 0);
    if (v.kind === 'summon') return v.model.worldOf('head', out);
    if (v.model.bones.handR && v.obj.visible) return v.model.worldOf('handR', out);
    return this.chest(v, out);
  }

  near(v, d = 60) { return v && v.pos.distanceTo(this.ctrl.pos) < d; }

  onEvent(e) {
    const E = this.ents.map;
    const src = E.get(e.s), tgt = E.get(e.t);
    const me = this.myId;
    const mine = e.s === me || e.t === me || (src && src.info.own === me);
    const vfx = this.vfx, audio = this.audio;
    switch (e.k) {
      case 'dmg': {
        if (!tgt) break;
        const p = this.chest(tgt, new V3());
        if (e.ev) { if (mine) vfx.text(p, 'Evade', 'miss'); break; }
        tgt.model.flash();
        tgt.hitT = 0;
        const ab = ABILITIES[e.ab];
        const col = ab ? ab.color : e.ab === 'furnace' ? 0xff5a1a : 0xffe0b0;
        if (tgt.obj.visible) vfx.burst(p, col, e.c ? 16 : 7, e.c ? 5 : 3, 0.22, 0.35);
        if (mine) {
          if (e.t === me) { vfx.text(p, `-${e.a}`, 'taken'); this.gfx.grade.uniforms.uFlash.value.set(0.6, 0, 0, 0.35); vfx.shake(e.a > 40 ? 0.25 : 0.08); }
          else vfx.text(p, e.c ? `${e.a}!` : String(e.a), e.c ? 'crit' : 'dmg');
          if (e.ab2) vfx.text(p.clone().add(new V3(0, 0.4, 0)), `(${e.ab2} absorbed)`, 'absorb');
          audio.play(e.c ? 'crit' : 'hit', { vol: e.t === me ? 0.8 : 1 });
        } else if (this.near(tgt, 25)) audio.play('hit', { vol: 0.35 });
        break;
      }
      case 'heal': {
        if (!tgt || !e.a) break;
        const p = this.chest(tgt, new V3());
        if (mine) vfx.text(p, `+${e.a}`, 'heal');
        if (tgt.obj.visible && !['cluster', 'racetop'].includes(e.ab)) vfx.heal(tgt.pos, ABILITIES[e.ab]?.color || 0x7dffb0);
        else if (tgt.obj.visible && Math.random() < 0.3) vfx.heal(tgt.pos, 0x7dffb0);
        if (e.s === me && e.ab !== 'cluster') audio.play('heal');
        break;
      }
      case 'cast': {
        if (!src) break;
        const ab = ABILITIES[e.ab];
        const name = ab ? ab.name : e.ab === 'gather' ? 'Gathering' : e.n || MOBS[src.info.mt]?.special?.name || 'Casting';
        src.cast = { ab: e.ab, start: performance.now(), dur: e.d, name, color: new THREE.Color(ab ? ab.color : 0xff5a1a), channel: false };
        if (e.s === me) audio.play('cast');
        break;
      }
      case 'cstop': if (src) src.cast = null; if (e.s === me) this.ui.error('Interrupted'); break;
      case 'fire': {
        if (!src || !tgt) break;
        src.attackT = 0;
        if (!src.obj.visible && !tgt.obj.visible) break;
        const from = this.hand(src, new V3());
        vfx.projectile(() => from, () => this.chest(tgt, tmp2), e.d, e.p || 'bolt', e.c || 0xffaa33);
        if (mine || this.near(src, 30)) audio.play(e.p === 'rocket' ? 'rocket' : 'fire', { vol: mine ? 1 : 0.4 });
        break;
      }
      case 'fx': this.abilityFx(e, src, tgt); break;
      case 'boom': {
        const y = Math.max(this.terrain.heightAt(e.x, e.z), 0);
        const p = new V3(e.x, y, e.z);
        const ab = ABILITIES[e.ab];
        if (e.ab === 'furnace') {
          vfx.explosion(p, e.r, 0xff5a1a);
          for (let i = 0; i < 160; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * e.r; vfx.add.spawn(e.x + Math.cos(a) * r, y + 0.3, e.z + Math.sin(a) * r, 0, 3 + Math.random() * 5, 0, 4, 1.4, 0.3, 1, 0.9, 0.8, 1, -1, 0.2); }
        } else if (ab && ['marsdrop', 'vulnerable'].includes(e.ab)) vfx.explosion(p, e.r, ab.color);
        else vfx.nova(p, e.r, ab ? ab.color : 0xffffff);
        if (p.distanceTo(this.ctrl.pos) < 40) { audio.play('explosion', { vol: 0.8 }); vfx.shake(0.25); }
        break;
      }
      case 'beam': {
        if (!src || !tgt) break;
        const ab = ABILITIES[e.ab];
        src.cast = { ab: e.ab, start: performance.now(), dur: e.d, end: performance.now() + e.d * 1000, name: ab?.name, color: new THREE.Color(ab?.color || 0x9ad8ff), channel: true };
        vfx.beam(() => this.hand(src, new V3()), () => this.chest(tgt, new V3()), e.d, ab?.color || 0x9ad8ff, 0.8);
        if (mine) audio.play('nova');
        break;
      }
      case 'swing': if (src) { src.attackT = 0; src.attackAlt = !src.attackAlt; if (mine) audio.play('swing', { vol: 0.6 }); } break;
      case 'die': {
        if (!tgt) break;
        tgt.cast = null;
        if (tgt.kind === 'mob' && tgt.obj.visible) vfx.burst(this.chest(tgt, new V3()), tgt.info.mt === 'moloch' ? 0xff5a1a : 0xffffff, 30, 4, 0.3, 0.7, { up: 2 });
        if (tgt.kind === 'node') vfx.buffSpiral(tgt.pos, 0xffd24a);
        if (e.t === me) audio.play('death');
        if (e.t === this.targetId && tgt.kind !== 'node') { /* keep target so the player can see it died */ }
        if (tgt.kind === 'node' && e.t === this.targetId) this.setTarget(0);
        break;
      }
      case 'lvl': {
        if (!tgt) break;
        vfx.levelUp(tgt.pos);
        if (e.t === me) { this.ui.banner(`LEVEL ${e.l}`, 'Your capabilities have scaled.'); audio.play('levelup'); }
        break;
      }
      case 'dash': {
        if (e.s === me) {
          if (e.tp) this.ctrl.teleport(e.x, e.y, e.z); else { vfx.dashTrail(this.ctrl.pos.clone(), new V3(e.x, e.y, e.z), 0x9fd8ff); this.ctrl.dashTo(e.x, e.y, e.z, e.d); }
        } else if (src) {
          if (!e.tp && src.obj.visible) vfx.dashTrail(src.pos.clone(), new V3(e.x, e.y, e.z), 0x9fd8ff);
          src.dashTo = new V3(e.x, e.y, e.z); src.dashUntil = performance.now() + (e.d || 0.2) * 1000 + 150;
        }
        break;
      }
      case 'say': {
        const cls = e.ch === 'world' ? 'world' : e.ch;
        if (e.n) { this.ui.chat(e.m, cls, e.n, e.f); if (e.ch === 'say' || (src && e.ch === 'world' && src.pos.distanceTo(this.ctrl.pos) < 40)) this.ents.say(e.s, e.m); }
        else { this.ui.chat(e.m, cls); if (e.ch === 'boss') { this.ui.banner('MOLOCH HAS FALLEN', 'Coordination wins.'); audio.play('questdone'); } }
        break;
      }
      case 'yell': {
        const n = src ? src.info.n : 'Moloch';
        this.ui.chat(`${n} yells: ${e.m}`, 'yell');
        if (src) this.ents.say(e.s, e.m);
        audio.play('yell');
        break;
      }
      case 'tele': if (src) vfx.telegraph(src.pos, e.r, e.d, 0xff3a1a, () => src.pos); break;
      case 'emote': break;
      case 'sys': this.ui.chat(e.m, 'sys'); break;
      case 'err': this.ui.error(e.m); break;
      case 'loot': {
        if (e.xp) { vfx.text(this.chest(this.ents.me || { pos: this.ctrl.pos, height: 2 }, new V3()).add(new V3(0, 0.6, 0)), `+${e.xp} XP`, 'xp'); this.ui.chat(`You gain ${e.xp} experience.`, 'xp'); }
        if (e.g) this.ui.chat(`You loot ${e.g} Compute Credits.`, 'loot');
        if (e.items && e.items.length) { this.ui.chat(`You receive loot: ${e.items.map((i) => `[${i}]`).join(' ')}`, 'loot'); audio.play('loot'); }
        break;
      }
      case 'qp': this.ui.chat(`${e.label}: ${e.c}/${e.n}`, 'sys'); break;
      case 'qacc': this.ui.chat(`Quest accepted: ${QUESTS[e.q].name}`, 'sys'); audio.play('quest'); break;
      case 'qdone': this.ui.chat(`${QUESTS[e.q].name} — objectives complete! Return to ${NPCS[QUESTS[e.q].giver].name}.`, 'sys'); this.ui.zone('Objectives complete', QUESTS[e.q].name); audio.play('quest'); break;
      case 'qturn': this.ui.banner('Quest Complete', QUESTS[e.q].name); this.ui.chat(`Quest completed: ${QUESTS[e.q].name}. +${e.xp} XP, +${e.g} Compute Credits.`, 'loot'); audio.play('questdone'); break;
      case 'respawn': break;
      default: break;
    }
  }

  abilityFx(e, src, tgt) {
    const vfx = this.vfx, audio = this.audio;
    const ab = ABILITIES[e.ab];
    const col = ab ? ab.color : 0xff3a1a;
    const fx = ab ? ab.fx : e.ab === 'gaze' ? 'gaze' : null;
    const mine = e.s === this.myId;
    if (src) src.attackT = 0;
    if (!src) return;
    switch (fx) {
      case 'cone': {
        const dir = new V3(Math.sin(src.renderRy), 0, Math.cos(src.renderRy));
        vfx.cone(this.hand(src, new V3()), dir, 11, col);
        audio.play('fire', { vol: mine ? 1 : 0.4 });
        break;
      }
      case 'swing': if (mine) audio.play('swing'); break;
      case 'slam': vfx.slam(src.pos, 8, col); if (this.near(src, 30)) { audio.play('explosion', { vol: 0.5 }); vfx.shake(0.2); } break;
      case 'zap': if (tgt) { vfx.beam(() => this.hand(src, new V3()), () => this.chest(tgt, new V3()), 0.25, col, 0.35); vfx.burst(this.chest(tgt, new V3()), col, 14, 3, 0.3, 0.5); } if (mine) audio.play('fire', { vol: 0.6 }); break;
      case 'ray': if (tgt) vfx.beam(() => this.hand(src, new V3()), () => this.chest(tgt, new V3()), 0.45, col, 1.0); if (mine) audio.play('nova', { vol: 0.6 }); break;
      case 'shield': if (tgt) vfx.buffSpiral(tgt.pos, col); if (mine) audio.play('shield'); break;
      case 'heal': if (tgt) vfx.heal(tgt.pos, col); break;
      case 'healnova': vfx.nova(src.pos, 15, col); vfx.heal(src.pos, col); if (mine) audio.play('heal'); break;
      case 'buff': vfx.buffSpiral(src.pos, col); if (mine) audio.play('buff'); break;
      case 'aura': vfx.nova(src.pos, 18, col); vfx.buffSpiral(src.pos, col); if (mine) audio.play('buff'); break;
      case 'ascend': vfx.levelUp(src.pos); if (mine) audio.play('buff'); break;
      case 'meteor': if (tgt) vfx.meteor(tgt.pos.clone(), 0.9, col); if (mine) audio.play('rocket'); break;
      case 'nova': vfx.nova(src.pos, 10, col); if (this.near(src, 40)) { audio.play('nova'); vfx.shake(0.15); } break;
      case 'nova_t': if (tgt) vfx.burst(this.chest(tgt, new V3()), col, 30, 6, 0.4, 0.4); if (mine) audio.play('nova'); break;
      case 'bomb': if (tgt) vfx.telegraph(tgt.pos, 7, 3, 0xff4a2a, () => tgt.pos); if (mine) audio.play('cast'); break;
      case 'blink': vfx.burst(this.chest(src, new V3()), col, 30, 5, 0.3, 0.5); break;
      case 'gaze': if (tgt) vfx.beam(() => src.model.worldOf('head', new V3()), () => this.chest(tgt, new V3()), 0.6, 0xff3a1a, 0.9); audio.play('nova', { vol: 0.6 }); break;
      case 'dash': case 'charge': break;
      default: if (tgt) vfx.burst(this.chest(tgt, new V3()), col, 16, 3, 0.3, 0.4); break;
    }
  }

  // ------------------------------------------------------------------ player actions
  setTarget(id, send = true) {
    if (this.targetId === id) return;
    this.targetId = id;
    if (send) this.net.send({ t: 'tg', id });
    if (this.selDecal) { this.vfx.removeDecal(this.selDecal); this.selDecal = null; }
    const v = this.ents.map.get(id);
    if (v) {
      const col = v.kind === 'npc' ? 0x6dff7a : isHostile(this.faction, v) ? 0xff3a2a : v.kind === 'node' ? 0xffd24a : 0x6dff7a;
      this.selDecal = this.vfx.decal(0, v.pos, v.radius + 0.55, col, 1, { persistent: true, follow: () => (this.ents.map.get(id) || v).pos, lift: 0.1 });
      this.selDecalFollow = id;
    }
  }

  onClick(x, y, button) {
    if (this.selectMode || !this.me) return;
    const v = this.ents.pick(x, y, this.gfx.camera);
    if (!v) return;
    if (button === 'left') { this.setTarget(v.id); this.audio.play('click'); return; }
    this.setTarget(v.id);
    const d = v.pos.distanceTo(this.ctrl.pos);
    if (v.kind === 'npc') { if (d < 9) this.ui.openNpc(v); else this.ui.error('You are too far away.'); return; }
    if (v.kind === 'node') { if (d < 5) this.net.send({ t: 'use', id: v.id }); else this.ui.error('You are too far away.'); return; }
    if (isHostile(this.faction, v) && !v.dead) { this.faceTarget(v); this.net.send({ t: 'aa', on: true }); }
  }

  faceTarget(v) {
    const c = this.ctrl;
    c.yaw = Math.atan2(v.pos.x - c.pos.x, v.pos.z - c.pos.z);
    this.net.send({ t: 'mv', x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), ry: +c.yaw.toFixed(3), a: 0 });
  }

  castSlot(i) {
    const s = this.ui.slots[i];
    if (!s || !this.me || this.ctrl.dead) return;
    const ab = ABILITIES[s.ab];
    this.ui.pressSlot(i);
    let tg = this.targetId;
    let tv = this.ents.map.get(tg);
    if (ab.target === 'enemy') {
      if (!tv || !isHostile(this.faction, tv) || tv.dead) {
        const n = this.nearestHostile(ab.range || 30);
        if (!n) { this.ui.error('You have no target.'); return; }
        this.setTarget(n.id);
        tg = n.id; tv = n;
      }
      this.faceTarget(tv);
    } else if (ab.target === 'ally') {
      if (!tv || isHostile(this.faction, tv) || tv.kind !== 'player') tg = this.myId;
    } else if (ab.target === 'any') {
      if (!tv || tv.kind === 'npc' || tv.kind === 'node') tg = this.myId;
      else if (isHostile(this.faction, tv)) this.faceTarget(tv);
    }
    this.net.send({ t: 'cast', ab: s.ab, tg });
  }

  nearestHostile(range) {
    let best = null, bd = range + 1;
    for (const v of this.ents.map.values()) {
      if (v.dead || !isHostile(this.faction, v) || !v.obj.visible) continue;
      const d = v.pos.distanceTo(this.ctrl.pos);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  cycleTarget() {
    const c = this.ctrl;
    const fwd = new V3(Math.sin(c.camYaw), 0, Math.cos(c.camYaw));
    const list = [];
    for (const v of this.ents.map.values()) {
      if (v.dead || !isHostile(this.faction, v)) continue;
      const d = v.pos.distanceTo(c.pos);
      if (d > 45) continue;
      const dir = tmp.subVectors(v.pos, c.pos).setY(0).normalize();
      if (dir.dot(fwd) < -0.2) continue;
      list.push({ v, d });
    }
    list.sort((a, b) => a.d - b.d);
    if (!list.length) return;
    const idx = list.findIndex((x) => x.v.id === this.targetId);
    this.setTarget(list[(idx + 1) % list.length].v.id);
  }

  interact() {
    let best = null, bd = 8;
    for (const v of this.ents.map.values()) {
      if (v.kind !== 'npc' && !(v.kind === 'node' && !v.dead)) continue;
      const d = v.pos.distanceTo(this.ctrl.pos);
      if (d < bd && (v.kind === 'npc' || d < 5)) { bd = d; best = v; }
    }
    if (!best) return;
    this.setTarget(best.id);
    if (best.kind === 'npc') this.ui.openNpc(best);
    else this.net.send({ t: 'use', id: best.id });
  }

  sendChat(text) {
    if (text === '/help') { this.ui.toggleHelp(); return; }
    if (text === '/fps') { this.showFps = !this.showFps; document.getElementById('fps').classList.toggle('hidden', !this.showFps); return; }
    if (text.startsWith('/s ') || text.startsWith('/say ')) { this.net.send({ t: 'chat', m: text.replace(/^\/(s|say)\s+/, ''), ch: 'say' }); return; }
    this.net.send({ t: 'chat', m: text, ch: 'world' });
  }

  onKey(code, e) {
    if (this.selectMode) return;
    if (code.startsWith('Digit')) {
      const n = +code.slice(5);
      if (n >= 1 && n <= 6) this.castSlot(n - 1);
      return;
    }
    switch (code) {
      case 'Tab': this.cycleTarget(); break;
      case 'Escape':
        if (this.ui.closeAll()) break;
        if (this.targetId) { this.setTarget(0); break; }
        this.ui.toggleSettings();
        break;
      case 'Enter': e.preventDefault(); this.ui.focusChat(); break;
      case 'Slash': e.preventDefault(); this.ui.focusChat('/'); break;
      case 'KeyL': this.ui.toggleQuestLog(); break;
      case 'KeyM': this.ui.toggleMap(); break;
      case 'KeyH': this.ui.toggleHelp(); break;
      case 'KeyF': this.interact(); break;
      case 'KeyV': this.ents.showPlates = !this.ents.showPlates; break;
      default: break;
    }
  }

  onJump() { this.audio.play('jump'); }
  onLand() { this.vfx.dust(this.ctrl.pos, 6, 0.6); }

  // ------------------------------------------------------------------ main loop
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const rawDt = (now - this.last) / 1000;
    const dt = Math.min(0.05, rawDt);
    this.last = now;
    this.time += dt;
    this.net.update(dt);
    const cam = this.gfx.camera;
    let focus;
    if (this.selectMode) { this.updateSelect(dt); focus = this.pedestal.position; }
    else { this.ctrl.update(dt); focus = this.ctrl.pos; }
    const dayTime = this.selectMode && this.sky.override === 'auto' ? 0.705 : this.dayTime;
    this.sky.update(dt, dayTime, focus, this.time);
    this.water.update(this.time);
    const fwd = tmp.set(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
    const pushers = [];
    if (!this.selectMode) pushers.push({ x: this.ctrl.pos.x, y: this.ctrl.pos.y, z: this.ctrl.pos.z, r: 1.0 * (this.myScale || 1) });
    else if (this.preview) pushers.push({ x: this.pedestal.position.x, y: 0, z: this.pedestal.position.z, r: 2.2 });
    if (this.ents) {
      for (const v of this.ents.map.values()) {
        if (pushers.length >= 6) break;
        if (v.id === this.myId || v.kind === 'npc' || v.kind === 'node' || v.dead) continue;
        if (v.pos.distanceTo(cam.position) < 30) pushers.push({ x: v.pos.x, y: v.pos.y, z: v.pos.z, r: v.radius + 0.6 });
      }
    }
    this.grass.update(this.time, cam.position, fwd, pushers);
    this.foliage.update(this.time, cam.position, this.gfx.q.treeDist);
    this.buildings.update(this.time, dt, this.sky.nightFactor);
    for (const e of this.vfx.emitters) if (e.night) e.rate = this.sky.nightFactor > 0.4 ? 0.6 : 0;
    if (this.ents) this.ents.update(dt, cam, this.faction, this.targetId, this.time);
    if (this.selDecal && !this.ents.map.get(this.targetId)) { this.vfx.removeDecal(this.selDecal); this.selDecal = null; this.targetId = 0; }
    this.vfx.update(dt, cam, cam.position);
    this._lights(dt);
    const fl = this.gfx.grade.uniforms.uFlash.value;
    if (fl.w > 0) fl.w = Math.max(0, fl.w - dt * 1.5);
    if (!this.selectMode) this.ui.update(dt);
    this.audio.update(dt, { combat: this.me && this.me.cb, night: this.sky.nightFactor, faction: this.faction, altitude: this.ctrl.pos.y });
    this.gfx.render(this.time);
    this._fps(rawDt);
  }

  _lights(dt) {
    this.lightT = (this.lightT || 0) - dt;
    const night = this.sky.nightFactor;
    if (this.lightT <= 0) {
      this.lightT = 0.3;
      const cp = this.gfx.camera.position;
      this.nearLights = this.buildings.lights.map((l) => ({ l, d: l.pos.distanceTo(cp) })).filter((x) => x.d < 70).sort((a, b) => a.d - b.d).slice(0, this.lights.length);
    }
    const list = this.nearLights || [];
    this.lights.forEach((pl, i) => {
      const x = list[i];
      if (!x) { pl.intensity = 0; return; }
      pl.position.copy(x.l.pos);
      pl.color.copy(x.l.color);
      pl.distance = x.l.dist;
      const fl = x.l.flicker ? 0.85 + Math.sin(this.time * 13 + i * 3) * 0.08 + Math.sin(this.time * 29 + i) * 0.07 : 1;
      pl.intensity = x.l.intensity * (0.35 + night * 1.1) * fl;
    });
  }

  _fps(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      const fps = this.fpsN / this.fpsAcc;
      this.fpsShown = fps;
      if (this.showFps) document.getElementById('fps').textContent = `${fps.toFixed(0)} fps · ${this.gfx.q.label} · ${this.gfx.renderer.info.render.calls} draws`;
      this.fpsAcc = 0; this.fpsN = 0;
      const qc = this.qualityCheck;
      if (!this.selectMode && !qc.done) {
        qc.t += 0.5; qc.frames += fps;
        if (qc.t >= 8) {
          const avg = qc.frames / (qc.t / 0.5);
          const order = ['low', 'medium', 'high', 'ultra'];
          const i = order.indexOf(this.gfx.qualityKey);
          if (avg < 30 && i > 0) { this.setQuality(order[i - 1]); this.ui.chat(`Graphics quality lowered to ${QUALITY[order[i - 1]].label} for smoother play (change in Settings).`, 'sys'); qc.done = false; qc.t = 0; qc.frames = 0; }
          else qc.done = true;
        }
      }
    }
  }
}

const game = new Game();
window.__game = game;
game.boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('loadtext');
  if (t) t.textContent = 'Failed to start: ' + (e && e.message ? e.message : e);
});

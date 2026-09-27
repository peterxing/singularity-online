import { ABILITIES, CHAMPIONS, CHAMPION_ORDER, FACTIONS, QUESTS, NPCS, MOBS, ITEMS, SPAWNS, NODES, DISCLAIMER, lvlMul, MAX_LEVEL } from '../shared/data.js';
import { SITES, ZONES, zoneAt } from '../shared/terrain.js';
import { FLAGS } from '../shared/world.js';
import { icon } from './icons.js';
import { isHostile } from './entities.js';
import { QUALITY } from './gfx.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIPS = [
  'Tip: Hold right mouse to steer, left mouse to look around. Both buttons together run forward.',
  'Tip: Tab cycles through nearby enemies. Right-click NPCs to talk to them.',
  'Tip: Moloch can only be beaten together. Accelerationists and the Aligned are welcome to cooperate.',
  'Tip: Golden Sheaves glow in the Compute Fields. Right-click them to gather.',
  'Tip: Energy Drinks restore 40% health. Press 6 to use one.',
  'Tip: Out of combat you regenerate quickly. Type /sit to regenerate even faster.',
];

export function abilityDesc(abId, level) {
  const ab = ABILITIES[abId];
  if (!ab) return '';
  const m = lvlMul(level);
  const find = (type) => {
    const walk = (list) => { for (const e of list) { if (e.type === type) return e; if (e.effects) { const r = walk(e.effects); if (r) return r; } } return null; };
    return walk(ab.effects);
  };
  const dmg = find('damage'), heal = find('heal'), sh = find('shield'), dot = find('dot'), hot = find('hot'), ch = find('channel'), smart = find('smart');
  return ab.desc
    .replace('{d}', dmg ? Math.round(dmg.amount * m) : '')
    .replace('{h}', heal ? Math.round(heal.amount * m) : smart ? Math.round(smart.heal * m) : '')
    .replace('{s}', sh ? Math.round(sh.amount * m) : '')
    .replace('{dot}', dot ? Math.round(dot.amount * dot.ticks * m) : '')
    .replace('{hot}', hot ? Math.round(hot.amount * hot.ticks * m) : '')
    .replace('{c}', ch ? Math.round(ch.amount * ch.ticks * m) : '');
}

export function buildMapImage(terrain, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const S = terrain.size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -S / 2 + (i + 0.5) * (S / size), z = -S / 2 + (j + 0.5) * (S / size);
      const h = terrain.heightAt(x, z);
      const n = terrain.normalAt(x, z);
      const shade = Math.max(0.35, Math.min(1.25, 0.75 + (n[0] * -0.6 + n[2] * -0.6 + n[1] * 0.4) * 0.9));
      let r, g, b;
      if (h < 0) {
        const d = Math.min(1, -h / 12);
        r = 40 - d * 25; g = 120 - d * 60; b = 160 - d * 50;
      } else {
        const road = terrain.splatAt(x, z, 0), field = terrain.splatAt(x, z, 1), plaza = terrain.splatAt(x, z, 2), forest = terrain.splatAt(x, z, 3);
        const rock = terrain.grassAt(x, z, 3);
        r = 92; g = 140; b = 58;
        r += (54 - r) * forest * 0.8; g += (98 - g) * forest * 0.8; b += (40 - b) * forest * 0.8;
        r += (205 - r) * field; g += (170 - g) * field; b += (80 - b) * field;
        r += (150 - r) * rock; g += (144 - g) * rock; b += (136 - b) * rock;
        if (h < 1.8) { r = 214; g = 198; b = 146; }
        if (h > 100) { r = 240; g = 244; b = 250; }
        r += (168 - r) * road; g += (132 - g) * road; b += (90 - b) * road;
        r += (190 - r) * plaza; g += (184 - g) * plaza; b += (176 - b) * plaza;
        r *= shade; g *= shade; b *= shade;
      }
      const k = (j * size + i) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class UI {
  constructor(game) {
    this.g = game;
    this.chatLines = 0;
    this.slots = [];
    this.lastZone = '';
    this.mmZoom = 1.4;
    this.mmT = 0;
    this.slowT = 0;
    this.dialogNpc = null;
    this.tipTimer = null;
    $('loadtip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    $('disclaimer').textContent = DISCLAIMER;
    this._bindChat();
    this._bindMenus();
  }

  loading(pct, text) { $('loadfill').style.width = `${pct}%`; if (text) $('loadtext').textContent = text; }
  hideLoading() { $('loading').classList.add('hidden'); }

  // ------------------------------------------------------------------ character select
  showSelect(portraits, onChange, onEnter) {
    this.portraits = portraits;
    $('select').classList.remove('hidden');
    let faction = localStorage.getItem('so_faction') || 'eacc';
    let champ = localStorage.getItem('so_champ') || CHAMPION_ORDER[faction][0];
    if (!CHAMPIONS[champ] || CHAMPIONS[champ].faction !== faction) champ = CHAMPION_ORDER[faction][0];
    const name = $('heroName');
    name.value = localStorage.getItem('so_name') || '';
    const render = () => {
      document.querySelectorAll('.fac').forEach((b) => b.classList.toggle('active', b.dataset.f === faction));
      $('facMotto').textContent = FACTIONS[faction].motto;
      const list = $('champList');
      list.innerHTML = '';
      for (const id of CHAMPION_ORDER[faction]) {
        const c = CHAMPIONS[id];
        const b = document.createElement('button');
        b.className = 'champ' + (id === champ ? ' active' : '');
        b.innerHTML = `<img src="${portraits['c:' + id] || ''}" alt=""><span>${esc(c.name)}</span>`;
        b.onclick = () => { champ = id; this.g.audio.play('click'); render(); };
        list.appendChild(b);
      }
      const c = CHAMPIONS[champ];
      $('champName').textContent = c.name;
      $('champName').style.color = FACTIONS[faction].color;
      $('champTitle').textContent = c.title;
      $('champRole').textContent = `${c.role} · ${FACTIONS[faction].short}`;
      $('champBio').textContent = c.bio;
      $('champAbilities').innerHTML = c.abilities.map((a) => {
        const ab = ABILITIES[a];
        return `<div class="ab"><img src="${icon(ab.icon, ab.color)}" alt=""><div><b>${esc(ab.name)}</b><p>${esc(abilityDesc(a, 1))}</p></div></div>`;
      }).join('');
      localStorage.setItem('so_faction', faction);
      localStorage.setItem('so_champ', champ);
      onChange(faction, champ);
    };
    document.querySelectorAll('.fac').forEach((b) => { b.onclick = () => { faction = b.dataset.f; champ = CHAMPION_ORDER[faction][0]; this.g.audio.play('click'); render(); }; });
    const pools = { eacc: ['Throttle', 'Nova', 'Vector', 'Blaze', 'Kinetic', 'Rocketeer', 'Forge', 'Tachyon'], ea: ['Lumen', 'Solace', 'Prior', 'Candor', 'Beacon', 'Steward', 'Veritas', 'Harbor'] };
    $('randName').onclick = () => {
      const p = pools[faction];
      name.value = p[Math.floor(Math.random() * p.length)] + Math.floor(Math.random() * 90 + 10);
    };
    const go = () => {
      let n = name.value.trim().replace(/[^\p{L}\p{N}_\- ]/gu, '').slice(0, 16);
      if (!n) { $('randName').onclick(); n = name.value; }
      localStorage.setItem('so_name', n);
      this.g.audio.init();
      this.g.audio.play('questdone');
      onEnter(n, champ);
    };
    $('enterBtn').onclick = go;
    name.onkeydown = (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); };
    render();
  }

  setRealm(mode) {
    const r = $('realm');
    r.className = 'realm ' + (mode === 'waking' ? 'offline' : mode);
    r.textContent = mode === 'online' ? 'Realm: Latent Space (PvP) — Online'
      : mode === 'waking' ? 'Waking the online realm (free server naps when idle, ~1 min)… or enter now to play solo'
        : 'Realm: Solo Latent Space — simulated players';
  }

  hideSelect() { $('select').classList.add('hidden'); }

  // ------------------------------------------------------------------ HUD
  initHud(champId, name) {
    const ch = CHAMPIONS[champId];
    this.ch = ch;
    $('hud').classList.remove('hidden');
    $('pfPortrait').src = this.portraits['c:' + champId] || '';
    $('pfName').textContent = name;
    $('pfEn').parentElement.classList.toggle('eacc', ch.faction === 'eacc');
    const bar = $('actionBar');
    bar.innerHTML = '';
    this.slots = [];
    const ids = [...ch.abilities, 'potion'];
    ids.forEach((ab, i) => {
      const a = ABILITIES[ab];
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<img src="${icon(a.icon, a.color)}" alt=""><div class="cd"></div><div class="cdt"></div><div class="key">${i + 1}</div>${ab === 'potion' ? '<div class="cnt"></div>' : ''}`;
      el.onmousedown = (e) => { e.stopPropagation(); this.g.castSlot(i); };
      el.onmouseenter = (e) => this.showAbilityTip(ab, e.currentTarget);
      el.onmouseleave = () => this.hideTip();
      bar.appendChild(el);
      this.slots.push({ el, ab, cd: el.querySelector('.cd'), cdt: el.querySelector('.cdt'), cnt: el.querySelector('.cnt'), max: 1, lastRem: 0 });
    });
  }

  pressSlot(i) { const s = this.slots[i]; if (!s) return; s.el.classList.add('press'); setTimeout(() => s.el.classList.remove('press'), 110); }

  showAbilityTip(abId, anchor) {
    const ab = ABILITIES[abId];
    const lvl = this.g.me ? this.g.me.l : 1;
    const res = this.ch ? this.ch.resource : 'Energy';
    const cast = ab.channel ? `Channeled (${ab.channel} sec)` : ab.cast ? `${ab.cast} sec cast` : 'Instant';
    const meta = [cast, ab.cd ? `${ab.cd} sec cooldown` : null, ab.cost ? `${ab.cost} ${res}` : null, ab.range ? `${ab.range} yd range` : null].filter(Boolean).join(' · ');
    const extra = ab.item ? `<br><span style="color:#8dff9a">You have ${this.g.me?.it?.potion || 0}.</span>` : '';
    this.tip(`<b>${esc(ab.name)}</b><div class="tt-meta">${meta}</div><div class="tt-desc">${esc(abilityDesc(abId, lvl))}${extra}</div>`, anchor);
  }

  tip(html, anchor) {
    const t = $('tooltip');
    t.innerHTML = html;
    t.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`;
    t.style.top = `${Math.max(8, r.top - h - 10)}px`;
  }
  hideTip() { $('tooltip').classList.add('hidden'); }

  // ------------------------------------------------------------------ messages
  chat(text, cls = 'sys', who = null, fac = null) {
    const log = $('chatLog');
    const d = document.createElement('div');
    d.className = 'm ' + cls;
    if (who) d.innerHTML = `<span class="who ${fac || ''}">[${esc(who)}]</span>: ${esc(text)}`;
    else d.textContent = text;
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    log.appendChild(d);
    if (++this.chatLines > 150) { log.firstChild.remove(); this.chatLines--; }
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  error(text) {
    const e = $('errorText');
    e.textContent = text;
    e.classList.add('show');
    clearTimeout(this._errT);
    this._errT = setTimeout(() => e.classList.remove('show'), 1600);
    this.g.audio.play('error');
  }

  zone(main, sub) {
    const z = $('zoneText');
    z.querySelector('.zt-main').textContent = main;
    z.querySelector('.zt-sub').textContent = sub || '';
    z.classList.add('show');
    clearTimeout(this._zoneT);
    this._zoneT = setTimeout(() => z.classList.remove('show'), 3600);
  }

  banner(main, sub) {
    const b = $('bannerText');
    b.innerHTML = `<div class="b1">${esc(main)}</div><div class="b2">${esc(sub || '')}</div>`;
    b.classList.add('show');
    clearTimeout(this._banT);
    this._banT = setTimeout(() => b.classList.remove('show'), 3200);
  }

  showDeath(on) { $('death').classList.toggle('hidden', !on); }

  // ------------------------------------------------------------------ chat input
  _bindChat() {
    const inp = $('chatInput');
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = inp.value.trim();
        inp.value = '';
        inp.blur();
        if (v) this.g.sendChat(v);
      } else if (e.key === 'Escape') { inp.value = ''; inp.blur(); }
    });
  }

  focusChat(prefix = '') { const inp = $('chatInput'); inp.focus(); if (prefix) inp.value = prefix; }

  // ------------------------------------------------------------------ menus
  _bindMenus() {
    document.querySelectorAll('.menu-btns button').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'log') this.toggleQuestLog();
        else if (a === 'map') this.toggleMap();
        else if (a === 'help') this.toggleHelp();
        else if (a === 'settings') this.toggleSettings();
      };
    });
    $('mmIn').onclick = () => { this.mmZoom = Math.max(0.6, this.mmZoom / 1.3); };
    $('mmOut').onclick = () => { this.mmZoom = Math.min(4, this.mmZoom * 1.3); };
    $('mapBtn').onclick = () => this.toggleMap();
    $('releaseBtn').onclick = () => { this.g.net.send({ t: 'release' }); this.showDeath(false); };
  }

  closeAll() {
    let closed = false;
    for (const id of ['dialog', 'questLog', 'worldMap', 'settings', 'help']) {
      if (!$(id).classList.contains('hidden')) { $(id).classList.add('hidden'); closed = true; }
    }
    this.dialogNpc = null;
    this.hideTip();
    return closed;
  }

  _panel(id, html) {
    const p = $(id);
    p.innerHTML = `<button class="close-x">✕</button>${html}`;
    p.querySelector('.close-x').onclick = () => { p.classList.add('hidden'); if (id === 'dialog') this.dialogNpc = null; };
    p.classList.remove('hidden');
    return p;
  }

  toggleHelp() {
    if (!$('help').classList.contains('hidden')) { $('help').classList.add('hidden'); return; }
    const rows = [
      ['W / S', 'Run forward / backward'], ['A / D', 'Turn (strafe while holding right mouse)'], ['Q / E', 'Strafe left / right'],
      ['Space', 'Jump'], ['Left mouse drag', 'Look around'], ['Right mouse drag', 'Steer your champion'], ['Both mouse buttons', 'Run forward'],
      ['Mouse wheel', 'Zoom'], ['Left click', 'Select target'], ['Right click', 'Attack / talk / gather'], ['Tab', 'Cycle nearby enemies'],
      ['1 – 5', 'Champion abilities'], ['6', 'Energy Drink (heal 40%)'], ['F', 'Interact with nearest NPC or sheaf'], ['Enter', 'Chat (/s to say, /who, /dance, /wave, /sit, /cheer, /stuck)'],
      ['L', 'Quest log'], ['M', 'World map'], ['V', 'Toggle nameplates'], ['` or Num Lock', 'Auto-run'], ['Esc', 'Clear target / close windows / settings'],
    ];
    this._panel('help', `<h2>Field Manual</h2><table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
      <p style="color:#9aa6b8;font-size:12px;margin-top:14px">Quests: talk to NPCs with a gold <b style="color:#ffd24a">!</b>. Level up to 10 and gather allies — of any banner — to defeat Moloch at the Singularity Spire.</p>
      <p style="color:#9aa6b8;font-size:11px">${esc(DISCLAIMER)}</p>`);
  }

  toggleSettings() {
    if (!$('settings').classList.contains('hidden')) { $('settings').classList.add('hidden'); return; }
    const g = this.g;
    const qOpts = Object.entries(QUALITY).map(([k, v]) => `<option value="${k}" ${g.gfx.qualityKey === k ? 'selected' : ''}>${v.label}</option>`).join('');
    const tod = [['auto', 'Dynamic day/night'], ['golden', 'Golden hour'], ['noon', 'Midday'], ['dusk', 'Dusk'], ['night', 'Night']]
      .map(([k, v]) => `<option value="${k}" ${g.sky.override === k ? 'selected' : ''}>${v}</option>`).join('');
    const p = this._panel('settings', `<h2>Settings</h2>
      <label>Graphics quality <select id="setQ">${qOpts}</select></label>
      <label>Time of day <select id="setTod">${tod}</select></label>
      <label>Bloom <input type="checkbox" id="setBloom" ${g.gfx.bloomOn ? 'checked' : ''}></label>
      <label>Nameplates <input type="checkbox" id="setPlates" ${g.ents.showPlates ? 'checked' : ''}></label>
      <label>Show FPS <input type="checkbox" id="setFps" ${g.showFps ? 'checked' : ''}></label>
      <label>Master volume <input type="range" id="setVol" min="0" max="1" step="0.05" value="${g.audio.volume}"></label>
      <label>Music volume <input type="range" id="setMus" min="0" max="1" step="0.05" value="${g.audio.musicVol}"></label>
      <label>Mouse sensitivity <input type="range" id="setSens" min="0.001" max="0.009" step="0.0005" value="${g.ctrl.sens}"></label>
      <label>Invert mouse Y <input type="checkbox" id="setInv" ${g.ctrl.invert ? 'checked' : ''}></label>
      <div class="row" style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><button class="btn" id="setLogout">Log out</button><button class="btn primary" id="setClose">Done</button></div>`);
    p.querySelector('#setQ').onchange = (e) => g.setQuality(e.target.value);
    p.querySelector('#setTod').onchange = (e) => { g.sky.override = e.target.value; g.saveSettings(); };
    p.querySelector('#setBloom').onchange = (e) => { g.gfx.bloomOn = e.target.checked; g.saveSettings(); };
    p.querySelector('#setPlates').onchange = (e) => { g.ents.showPlates = e.target.checked; g.saveSettings(); };
    p.querySelector('#setFps').onchange = (e) => { g.showFps = e.target.checked; $('fps').classList.toggle('hidden', !g.showFps); g.saveSettings(); };
    p.querySelector('#setVol').oninput = (e) => { g.audio.setVolume(+e.target.value); g.saveSettings(); };
    p.querySelector('#setMus').oninput = (e) => { g.audio.setMusic(+e.target.value); g.saveSettings(); };
    p.querySelector('#setSens').oninput = (e) => { g.ctrl.sens = +e.target.value; g.saveSettings(); };
    p.querySelector('#setInv').onchange = (e) => { g.ctrl.invert = e.target.checked; g.saveSettings(); };
    p.querySelector('#setClose').onclick = () => p.classList.add('hidden');
    p.querySelector('#setLogout').onclick = () => { g.net.saveNow(); location.reload(); };
  }

  // ------------------------------------------------------------------ quests
  questState(qid) {
    const me = this.g.me;
    if (!me) return null;
    const q = QUESTS[qid];
    if (me.qd && me.qd.includes(qid)) return 'done';
    const st = me.q && me.q[qid];
    if (st) return q.obj.every((o, i) => st[i] >= o.n) ? 'complete' : 'active';
    if (q.faction !== 'both' && q.faction !== this.g.faction) return null;
    if (q.req && !(me.qd || []).includes(q.req)) return null;
    if (me.l < q.level - 1) return 'low';
    return 'available';
  }

  npcMarker(npcId) {
    let best = null;
    for (const qid in QUESTS) {
      if (QUESTS[qid].giver !== npcId) continue;
      const s = this.questState(qid);
      if (s === 'complete') return '?';
      if (s === 'available') best = '!';
      else if (s === 'active' && !best) best = 'g?';
    }
    return best;
  }

  openNpc(view) {
    const npcId = view.info.npc;
    const npc = NPCS[npcId];
    this.dialogNpc = view.id;
    const list = [];
    for (const qid in QUESTS) {
      const q = QUESTS[qid];
      if (q.giver !== npcId) continue;
      const s = this.questState(qid);
      if (s === 'complete') list.push(`<div class="q" data-q="${qid}" data-m="turnin"><span class="mk">?</span>${esc(q.name)}</div>`);
      else if (s === 'available') list.push(`<div class="q" data-q="${qid}" data-m="offer"><span class="mk">!</span>${esc(q.name)}</div>`);
      else if (s === 'active') list.push(`<div class="q" data-q="${qid}" data-m="progress"><span class="mk gray">?</span>${esc(q.name)}</div>`);
    }
    const p = this._panel('dialog', `<h2>${esc(npc.name)}</h2><div class="npc-sub">&lt;${esc(npc.title)}&gt;</div><div class="gossip">"${esc(npc.gossip)}"</div>${list.join('') || '<div class="gossip" style="opacity:.7">I have nothing for you right now.</div>'}`);
    p.querySelectorAll('.q').forEach((el) => { el.onclick = () => this.openQuest(el.dataset.q, el.dataset.m, view); });
    this.g.audio.play('click');
  }

  _objText(q, st) {
    return q.obj.map((o, i) => {
      const label = o.kind === 'kill' ? `${MOBS[o.mob].name} slain` : ITEMS[o.item].name;
      const c = st ? Math.min(o.n, st[i]) : 0;
      return `${label}: ${c}/${o.n}`;
    });
  }

  openQuest(qid, mode, view) {
    const q = QUESTS[qid];
    const me = this.g.me;
    const st = me.q && me.q[qid];
    const rew = `Rewards: <b>${q.xp} XP</b> · <b style="color:#ffe07a">${q.gold} Compute Credits</b>${q.title ? ` · Title: <b>${esc(q.title)}</b>` : ''}`;
    let body = '', btns = '';
    if (mode === 'offer') {
      body = `<div class="qtext">${esc(q.text)}</div><div class="obj">Objectives: ${this._objText(q, null).join(' · ')}</div><div class="rew">${rew}</div>`;
      btns = '<button class="btn" data-b="back">Decline</button><button class="btn primary" data-b="accept">Accept</button>';
    } else if (mode === 'turnin') {
      body = `<div class="qtext">${esc(q.done)}</div><div class="rew">${rew}</div>`;
      btns = '<button class="btn primary" data-b="turnin">Complete Quest</button>';
    } else {
      body = `<div class="qtext">${esc(q.text)}</div><div class="obj">${this._objText(q, st).join('<br>')}</div>`;
      btns = '<button class="btn" data-b="back">Back</button>';
    }
    const p = this._panel('dialog', `<h2>${esc(q.name)}</h2>${body}<div class="row">${btns}</div>`);
    p.querySelectorAll('[data-b]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.b;
        if (a === 'accept') { this.g.net.send({ t: 'accept', q: qid }); p.classList.add('hidden'); this.dialogNpc = null; }
        else if (a === 'turnin') { this.g.net.send({ t: 'turnin', q: qid }); p.classList.add('hidden'); this.dialogNpc = null; }
        else if (a === 'back') this.openNpc(view);
      };
    });
  }

  toggleQuestLog() {
    if (!$('questLog').classList.contains('hidden')) { $('questLog').classList.add('hidden'); return; }
    this.renderQuestLog();
  }

  renderQuestLog() {
    const me = this.g.me;
    const ids = me ? Object.keys(me.q || {}) : [];
    const html = ids.map((qid) => {
      const q = QUESTS[qid];
      const done = this.questState(qid) === 'complete';
      return `<div class="ql"><button class="btn ghost ab" data-q="${qid}">Abandon</button><b>${esc(q.name)}</b> <span style="color:#9aa6b8;font-size:12px">(Level ${q.level})</span>
        <p>${esc(q.text)}</p><p style="color:${done ? '#8dff9a' : '#ffe7a8'}">${done ? `Complete — return to ${esc(NPCS[q.giver].name)}.` : this._objText(q, me.q[qid]).join(' · ')}</p></div>`;
    }).join('') || '<p style="color:#9aa6b8">Your quest log is empty. Look for NPCs with a gold <b style="color:#ffd24a">!</b> above their heads.</p>';
    const p = this._panel('questLog', `<h2>Quest Log</h2>${html}`);
    p.querySelectorAll('.ab').forEach((b) => { b.onclick = () => { this.g.net.send({ t: 'abandon', q: b.dataset.q }); setTimeout(() => this.renderQuestLog(), 250); }; });
  }

  // ------------------------------------------------------------------ maps
  toggleMap() {
    const wm = $('worldMap');
    if (!wm.classList.contains('hidden')) { wm.classList.add('hidden'); return; }
    wm.classList.remove('hidden');
    if (!wm.querySelector('.close-x')) {
      const b = document.createElement('button');
      b.className = 'close-x'; b.textContent = '✕'; b.onclick = () => wm.classList.add('hidden');
      wm.appendChild(b);
    }
    this.drawWorldMap();
  }

  drawWorldMap() {
    const cv = $('worldMapCanvas');
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const img = this.g.mapImage;
    ctx.drawImage(img, 0, 0, W, W);
    const toS = (x, z) => [((x + 512) / 1024) * W, ((z + 512) / 1024) * W];
    const me = this.g.me;
    const activeMobs = new Set();
    if (me && me.q) for (const qid in me.q) for (const o of QUESTS[qid].obj) { if (o.kind === 'kill') activeMobs.add(o.mob); if (o.kind === 'item') { if (o.item === 'tensor') activeMobs.add('paperclip'); if (o.item === 'sheaf') activeMobs.add('sheaf'); } }
    for (const sp of SPAWNS) {
      if (!activeMobs.has(sp.mob)) continue;
      const [x, y] = toS(sp.x, sp.z);
      ctx.fillStyle = 'rgba(255,210,74,0.18)'; ctx.strokeStyle = 'rgba(255,210,74,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(10, (sp.r / 1024) * W), 0, 7); ctx.fill(); ctx.stroke();
    }
    if (activeMobs.has('sheaf')) { const [x, y] = toS(NODES.sheaf.x, NODES.sheaf.z); ctx.strokeStyle = 'rgba(255,210,74,0.8)'; ctx.beginPath(); ctx.arc(x, y, (NODES.sheaf.r / 1024) * W, 0, 7); ctx.stroke(); }
    ctx.textAlign = 'center';
    for (const zn of ZONES) {
      const [x, y] = toS(zn.x, zn.z);
      ctx.font = 'bold 15px Georgia'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#ffe7a8';
      ctx.strokeText(zn.name, x, y); ctx.fillText(zn.name, x, y);
    }
    for (const [k, s] of Object.entries(SITES)) {
      if (!['eacc', 'ea', 'spire', 'cross'].includes(k)) continue;
      const [x, y] = toS(s.x, s.z);
      ctx.fillStyle = k === 'eacc' ? '#ff8a1f' : k === 'ea' ? '#4fb3ff' : k === 'spire' ? '#6fe3ff' : '#ffe07a';
      ctx.beginPath(); ctx.arc(x, y + 12, 6, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    }
    const c = this.g.ctrl;
    const [px, py] = toS(c.pos.x, c.pos.z);
    this._arrow(ctx, px, py, c.yaw, 11);
  }

  _arrow(ctx, x, y, yaw, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-yaw + Math.PI);
    ctx.fillStyle = '#ffe24a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.65, s * 0.7); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.65, s * 0.7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawMinimap() {
    const cv = $('minimap');
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const c = this.g.ctrl;
    const img = this.g.mapImage;
    const span = 140 * this.mmZoom;
    const iw = img.width;
    const sx = ((c.pos.x - span / 2 + 512) / 1024) * iw, sz = ((c.pos.z - span / 2 + 512) / 1024) * iw;
    const sw = (span / 1024) * iw;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, 7); ctx.clip();
    ctx.fillStyle = '#123'; ctx.fillRect(0, 0, W, W);
    ctx.drawImage(img, sx, sz, sw, sw, 0, 0, W, W);
    const toM = (x, z) => [((x - c.pos.x) / span) * W + W / 2, ((z - c.pos.z) / span) * W + W / 2];
    const myF = this.g.faction;
    for (const v of this.g.ents.map.values()) {
      if (v.id === this.g.ents.meId) continue;
      const [x, y] = toM(v.pos.x, v.pos.z);
      if (x < -5 || y < -5 || x > W + 5 || y > W + 5) continue;
      if (v.kind === 'npc') {
        const mk = v.markerType;
        if (mk) { ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center'; ctx.fillStyle = mk === 'g?' ? '#aaa' : '#ffd24a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(mk === '!' ? '!' : '?', x, y + 5); ctx.fillText(mk === '!' ? '!' : '?', x, y + 5); }
        else { ctx.fillStyle = '#ffe07a'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); }
        continue;
      }
      if (v.dead) continue;
      let col = '#ff3a2a', r = 2.6;
      if (v.kind === 'player') { col = isHostile(myF, v) ? '#ff4a4a' : v.info.f === 'eacc' ? '#ffa04a' : '#5ac0ff'; r = 3.2; }
      else if (v.kind === 'node') { col = '#ffe24a'; r = 3; }
      else if (v.kind === 'summon') { col = '#8dff9a'; r = 2; }
      else if (!isHostile(myF, v)) col = '#6dff7a';
      else if (v.info.bs) { col = '#ff2a00'; r = 5; }
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    this._arrow(ctx, W / 2, W / 2, c.yaw, 9);
    ctx.fillStyle = '#ffe7a8'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('N', W / 2, 13);
  }

  // ------------------------------------------------------------------ per-frame update
  update(dt) {
    const g = this.g, me = g.me;
    if (!me) return;
    const now = performance.now();
    const age = (now - g.meRecv) / 1000;
    // player frame
    $('pfLevel').textContent = me.l;
    $('pfHp').style.width = `${(me.hp / me.mh) * 100}%`;
    $('pfHpText').textContent = `${me.hp} / ${me.mh}`;
    $('pfEn').style.width = `${(me.en / me.me) * 100}%`;
    $('pfEnText').textContent = `${me.en} / ${me.me} ${this.ch.resource}`;
    $('pfCombat').classList.toggle('on', !!me.cb);
    $('pfName').textContent = g.myName + (me.ti ? ` ${me.ti}` : '');
    // xp
    $('xpFill').style.width = me.l >= MAX_LEVEL ? '100%' : `${(me.xp / me.xn) * 100}%`;
    $('xpText').textContent = me.l >= MAX_LEVEL ? 'Maximum level' : `Level ${me.l} · ${me.xp} / ${me.xn} XP`;
    $('gold').textContent = `◆ ${me.g} Compute Credits`;
    // action bar
    const tv = g.ents.map.get(g.targetId);
    for (const s of this.slots) {
      const ab = ABILITIES[s.ab];
      const cdRem = Math.max(0, (me.cd[s.ab] || 0) - age);
      const gRem = ab.gcd === false ? 0 : Math.max(0, me.gcd - age);
      const rem = Math.max(cdRem, gRem);
      if (rem > s.lastRem + 0.05) s.max = cdRem >= gRem ? Math.max(ab.cd || 1, cdRem) : 1;
      s.lastRem = rem;
      const pct = rem > 0 ? (rem / s.max) * 100 : 0;
      s.cd.style.setProperty('--p', `${pct.toFixed(1)}%`);
      s.cdt.textContent = cdRem > 1.5 ? (cdRem > 60 ? `${Math.ceil(cdRem / 60)}m` : Math.ceil(cdRem)) : '';
      let oor = false;
      if (ab.target === 'enemy' && tv && isHostile(g.faction, tv) && ab.range) oor = tv.pos.distanceTo(g.ctrl.pos) - tv.radius > ab.range;
      s.el.classList.toggle('oor', oor);
      s.el.classList.toggle('noen', !!(me.en < ab.cost || (ab.item && !(me.it[ab.item] > 0))));
      if (s.cnt) s.cnt.textContent = me.it.potion || 0;
    }
    // cast bar
    const cb = $('castBar');
    if (me.cast && me.cast.r - age > 0) {
      cb.classList.remove('hidden');
      const rem = Math.max(0, me.cast.r - age);
      const k = me.cast.ch ? rem / me.cast.d : 1 - rem / me.cast.d;
      $('castFill').style.width = `${Math.min(100, k * 100)}%`;
      $('castText').textContent = me.cast.ab === 'gather' ? 'Gathering' : ABILITIES[me.cast.ab]?.name || '';
      $('castTime').textContent = rem.toFixed(1);
      cb.classList.toggle('channel', !!me.cast.ch);
    } else cb.classList.add('hidden');
    // target frame
    const tf = $('targetFrame');
    if (tv) {
      tf.classList.remove('hidden');
      const i = tv.info;
      const hostile = isHostile(g.faction, tv);
      $('tfName').textContent = i.n;
      $('tfName').style.color = tv.kind === 'npc' ? '#8dff9a' : hostile ? '#ff6a5a' : tv.kind === 'player' ? (i.f === 'eacc' ? '#ffb070' : '#8fd0ff') : '#8dff9a';
      $('tfLevel').textContent = i.bs ? '??' : tv.level;
      const hp = $('tfHp');
      hp.style.width = `${Math.max(0, (tv.hp / tv.mh) * 100)}%`;
      hp.parentElement.className = 'bar hp' + (hostile ? ' hostile' : '');
      $('tfHpText').textContent = tv.dead ? 'Dead' : `${Math.round((tv.hp / tv.mh) * 100)}%`;
      const key = tv.kind === 'player' ? 'c:' + i.c : tv.kind === 'npc' ? 'n:' + NPCS[i.npc]?.model.preset : tv.kind === 'mob' ? 'm:' + i.mt : tv.kind === 'node' ? 'm:sheaf' : 'm:' + i.w;
      const src = this.portraits[key] || '';
      if ($('tfPortrait').getAttribute('src') !== src) $('tfPortrait').src = src;
      const el = $('tfElite');
      el.classList.toggle('hidden', !(i.el || i.bs));
      el.classList.toggle('boss', !!i.bs);
      let sub = '';
      if (tv.kind === 'player') sub = `${CHAMPIONS[i.c].name} · ${FACTIONS[i.f].short}${i.bot ? '' : ''}`;
      else if (tv.kind === 'mob') sub = i.ti || (i.el ? 'Elite' : MOBS[i.mt]?.guard ? 'Guard' : 'Monster');
      else if (tv.kind === 'npc') sub = `<${i.ti}>`;
      else if (tv.kind === 'node') sub = 'Right-click to gather';
      else sub = 'Summon';
      $('tfSub').textContent = sub;
      const tc = $('tfCast');
      if (tv.cast && (tv.flags & FLAGS.F_CAST || tv.cast.channel)) {
        tc.classList.remove('hidden');
        const k = Math.min(1, (now - tv.cast.start) / (tv.cast.dur * 1000));
        $('tfCastFill').style.width = `${(tv.cast.channel ? 1 - k : k) * 100}%`;
        $('tfCastText').textContent = tv.cast.name || '';
      } else tc.classList.add('hidden');
    } else tf.classList.add('hidden');
    this._bossBar();
    this.slowT -= dt;
    if (this.slowT <= 0) {
      this.slowT = 0.25;
      this._auras(me, age);
      this._tracker(me);
      this._clock();
      const z = zoneAt(g.ctrl.pos.x, g.ctrl.pos.z);
      $('zoneName').textContent = z.name;
      if (z.name !== this.lastZone) { this.lastZone = z.name; this.zone(z.name, z.sub); }
      for (const v of g.ents.map.values()) if (v.kind === 'npc') g.ents.setMarker(v, this.npcMarker(v.info.npc));
      if (this.dialogNpc) { const v = g.ents.map.get(this.dialogNpc); if (!v || v.pos.distanceTo(g.ctrl.pos) > 10) { $('dialog').classList.add('hidden'); this.dialogNpc = null; } }
    }
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.1; this.drawMinimap(); if (!$('worldMap').classList.contains('hidden')) this.drawWorldMap(); }
  }

  _bossBar() {
    const g = this.g;
    let boss = null;
    for (const v of g.ents.map.values()) if (v.kind === 'mob' && v.info.bs && !v.dead && (v.flags & FLAGS.F_COMBAT) && v.pos.distanceTo(g.ctrl.pos) < 110) boss = v;
    const bb = $('bossBar');
    if (!boss) { bb.classList.add('hidden'); return; }
    bb.classList.remove('hidden');
    $('bossName').textContent = `${boss.info.n.toUpperCase()} — ${boss.info.ti || ''}`;
    $('bossHp').style.width = `${(boss.hp / boss.mh) * 100}%`;
    $('bossHp').parentElement.className = 'bar hp big hostile';
    $('bossHpText').textContent = `${boss.hp} / ${boss.mh}`;
  }

  _auras(me, age) {
    const row = $('buffs');
    const list = me.au || [];
    const html = list.map(([id, name, ic, rem, dur, harm, stacks]) => {
      const t = Math.max(0, rem - age);
      const col = harm ? 0xff4a3a : 0x6fe3ff;
      return `<div class="aura${harm ? ' harm' : ''}" data-n="${esc(name)}" data-t="${t.toFixed(0)}"><img src="${icon(ic, col, 32)}"><div class="t">${t >= 60 ? Math.ceil(t / 60) + 'm' : Math.ceil(t)}</div>${stacks > 1 ? `<div class="s">${stacks}</div>` : ''}</div>`;
    }).join('');
    if (row._h !== html) {
      row._h = html;
      row.innerHTML = html;
      row.querySelectorAll('.aura').forEach((el) => {
        el.onmouseenter = () => this.tip(`<b>${el.dataset.n}</b><div class="tt-meta">${el.dataset.t}s remaining</div>`, el);
        el.onmouseleave = () => this.hideTip();
      });
    }
    const tv = this.g.ents.map.get(this.g.targetId);
    const drow = $('debuffs');
    let dh = '';
    if (tv && !tv.dead) {
      if (tv.flags & FLAGS.F_STUN) dh += `<div class="aura harm"><img src="${icon('stun', 0xffd24a, 32)}"></div>`;
      if (tv.flags & FLAGS.F_SHIELD) dh += `<div class="aura"><img src="${icon('shield', 0x9fe0ff, 32)}"></div>`;
      if (tv.flags & FLAGS.F_GLOW) dh += `<div class="aura"><img src="${icon('sun', 0xffb030, 32)}"></div>`;
      if (tv.flags & FLAGS.F_HASTE) dh += `<div class="aura"><img src="${icon('haste', 0xffe14d, 32)}"></div>`;
    }
    if (drow._h !== dh) { drow._h = dh; drow.innerHTML = dh; }
  }

  _tracker(me) {
    const el = $('questTracker');
    const ids = Object.keys(me.q || {});
    const html = ids.map((qid) => {
      const q = QUESTS[qid];
      const st = me.q[qid];
      const done = q.obj.every((o, i) => st[i] >= o.n);
      const objs = done ? `<div class="qo done">Return to ${esc(NPCS[q.giver].name)}</div>`
        : q.obj.map((o, i) => `<div class="qo${st[i] >= o.n ? ' done' : ''}">- ${o.kind === 'kill' ? esc(MOBS[o.mob].name) + ' slain' : esc(ITEMS[o.item].name)}: ${Math.min(o.n, st[i])}/${o.n}</div>`).join('');
      return `<div class="qt"><div class="qn">${esc(q.name)}</div>${objs}</div>`;
    }).join('');
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
  }

  _clock() {
    const dt = this.g.sky.dayTimeFor(this.g.dayTime);
    const mins = Math.floor(dt * 24 * 60);
    $('clock').textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
}

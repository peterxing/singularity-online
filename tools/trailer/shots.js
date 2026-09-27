// Shot list for the Singularity Online trailer (48 s @ 30 fps on a 120 BPM grid: 1 beat = 0.5 s).
(() => {
  for (const o of TR.titles) o.el.remove();
  TR.titles = [];
  const E = TR.ease, G = TR.gy;
  const P = (x, z, h) => [x, G(x, z) + h, z];
  const fwd = (ry) => [Math.sin(ry), Math.cos(ry)];
  const yawTo = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
  const off = (xz, ry, d, side = 0) => { const f = fwd(ry), r = [f[1], -f[0]]; return [xz[0] + f[0] * d + r[0] * side, xz[1] + f[1] * d + r[1] * side]; };
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

  const T = [];
  const shot = (o) => T.push(o);
  const L3 = (t0, side, fac, name, title, ability) => TR.addTitle({
    t0, t1: t0 + 1.4, fin: 0.2, fout: 0.16, anim: 'slide', cls: 'lt' + (side === 'r' ? ' r' : ''),
    html: `<div class="tag ${fac}">${fac === 'eacc' ? 'e/acc' : 'EA'}</div><div class="nm">${name}</div><div class="ti">${title}</div><div class="ab">${ability}</div>`,
  });

  // ------------------------------------------------------------ 1. Opening aerial toward the Spire (0-4)
  shot({
    name: 'open', dur: 4, pre: 1.5, dayTime: 0.285, me: [30, 20], shadowRange: 160,
    cam: TR.path([
      { t: 0, pos: P(78, 118, 64), look: [0, 44, -175], fov: 48 },
      { t: 4, pos: P(52, 76, 50), look: [0, 40, -175], fov: 46 },
    ], (k) => k),
  });
  TR.addTitle({ t0: 0.7, t1: 3.75, fin: 0.9, fout: 0.5, anim: 'spread', ls0: 12, ls1: 5, cls: 'cap', html: 'The race to superintelligence' });

  // ------------------------------------------------------------ 2. Glide along the Compute Fields toward the mill (4-8)
  shot({
    name: 'fields', dur: 4, pre: 1.2, dayTime: 0.69, me: [70, 232],
    cam: TR.path([
      { t: 0, pos: P(20, 258, 5.5), look: [72, 16, 214], fov: 46 },
      { t: 4, pos: P(34, 246, 4.2), look: [72, 15, 214], fov: 44 },
    ], (k) => k),
  });
  TR.addTitle({ t0: 4.35, t1: 7.8, fin: 0.7, fout: 0.45, anim: 'spread', ls0: 12, ls1: 5, cls: 'cap', html: 'has split the world in two' });

  // ------------------------------------------------------------ 3. ACCELERATE — e/acc champions in Gigaforge Citadel (8-12)
  const eaccAt = [296, 40], eaccRy = -Math.PI / 2;
  shot({
    name: 'accelerate', dur: 4, pre: 1.5, dayTime: 0.665, me: [300, 40],
    setup: (S) => {
      const f = eaccRy;
      const pos = [off(eaccAt, f, 0, 0), off(eaccAt, f, -2.2, 2.6), off(eaccAt, f, -2.2, -2.6), off(eaccAt, f, -4.4, 0)];
      S.elon = TR.actor('elon', ...pos[0], f); S.beff = TR.actor('beff', ...pos[1], f); S.sam = TR.actor('sam', ...pos[2], f); S.marc = TR.actor('marc', ...pos[3], f);
      for (const a of [S.elon, S.beff, S.sam, S.marc]) TR.hold(a);
    },
    events: [
      [0.08, (S) => TR.cast(S.beff, 'thermogod')],
      [0.3, (S) => TR.cast(S.marc, 'manifesto')],
      [0.55, (S) => TR.cast(S.sam, 'cluster')],
      [1.2, (S) => TR.emote(S.elon, 'cheer')],
    ],
    cam: (t) => {
      const k = E.easeOut(Math.min(1, t / 4));
      const c = off(eaccAt, eaccRy, 9.5 - k * 3.2, 0.4);
      return { pos: [c[0], G(c[0], c[1]) + 0.9 + k * 0.35, c[1]], look: [eaccAt[0] - 1.2, G(eaccAt[0], eaccAt[1]) + 2.1, eaccAt[1]], fov: 44 - k * 4 };
    },
    focus: [293, 10, 40],
  });
  TR.addTitle({ t0: 8.02, t1: 11.85, fin: 0.12, fout: 0.4, anim: 'slam', cls: 'big eacc', html: 'Accelerate' });
  TR.addTitle({ t0: 8.6, t1: 11.85, fin: 0.5, fout: 0.4, anim: 'rise', cls: 'sub eacc', html: 'with the e/acc Accelerationists' });

  // ------------------------------------------------------------ 4. OR ALIGN — EA champions in Lumen Sanctum (12-16)
  const eaAt = TR.alignAt || [-300, 8], eaRy = TR.alignRy ?? TR.sunYaw(0.36);
  shot({
    name: 'align', dur: 4, pre: 1.5, dayTime: TR.alignDay ?? 0.36, me: [-300, 30],
    setup: (S) => {
      const f = eaRy;
      const pos = [off(eaAt, f, 0, 0), off(eaAt, f, -2.2, 2.6), off(eaAt, f, -2.2, -2.6), off(eaAt, f, -4.4, 0)];
      S.eli = TR.actor('eliezer', ...pos[0], f); S.dario = TR.actor('dario', ...pos[1], f); S.will = TR.actor('will', ...pos[2], f); S.bos = TR.actor('bostrom', ...pos[3], f);
      for (const a of [S.eli, S.dario, S.will, S.bos]) TR.hold(a);
    },
    events: [
      [0.1, (S) => TR.cast(S.will, 'bednet', S.eli)],
      [0.45, (S) => TR.cast(S.dario, 'rsp', S.will)],
      [1.1, (S) => TR.emote(S.bos, 'wave')],
      [1.6, (S) => TR.emote(S.eli, 'cheer')],
    ],
    cam: (t) => {
      const k = E.easeOut(Math.min(1, t / 4));
      const c = off(eaAt, eaRy, 9.5 - k * 3.2, -0.4);
      const L = off(eaAt, eaRy, -1.2, 0);
      return { pos: [c[0], G(c[0], c[1]) + 0.9 + k * 0.35, c[1]], look: [L[0], G(eaAt[0], eaAt[1]) + 2.1, L[1]], fov: 44 - k * 4 };
    },
    focus: () => [eaAt[0], G(...eaAt), eaAt[1]],
  });
  TR.addTitle({ t0: 12.02, t1: 15.85, fin: 0.12, fout: 0.4, anim: 'slam', cls: 'big ea', html: 'or Align' });
  TR.addTitle({ t0: 12.6, t1: 15.85, fin: 0.5, fout: 0.4, anim: 'rise', cls: 'sub ea', html: 'with the Effective Altruists' });

  // ------------------------------------------------------------ 5-12. Champion roll call (16-28), 1.5 s each
  // Hero spot, facing and camera come from TR.findHeroSpot so faces are sun-lit and sight lines are clear.
  const hero = (o) => {
    const { champ, start, fac, name, title, ability, dayTime, kind, region, radius = 34, events, setup, mobType = 'golem' } = o;
    const side = fac === 'eacc' ? 'right' : 'left';
    const geo = () => o._g || (o._g = TR.findHeroSpot(region, radius, kind, side, dayTime, { D: o.D, R: o.R, back: o.back, side: o.lat, lightOff: o.lightOff, faceOff: o.faceOff, step: 2.5 }));
    shot({
      name: champ, start, dur: 1.5, pre: o.pre ?? 1.35, dayTime, me: region, clearR: 45, clearAt: region,
      setup: (S) => {
        const gg = geo();
        if (!gg) throw new Error('no spot for ' + champ);
        S.G = gg;
        S.a = TR.actor(champ, gg.H[0], gg.H[1], gg.f);
        TR.hold(S.a);
        if (gg.T) { S.m = TR.mob(mobType, gg.T[0], gg.T[1], { hp: 3e6 }); S.m.ry = gg.f + Math.PI; S.m.spawnRy = S.m.ry; }
        if (setup) setup(S, gg);
      },
      events,
      cam: (t, S) => {
        const gg = S.G, k = E.easeInOut(Math.min(1, t / 1.5));
        const hy = G(gg.H[0], gg.H[1]);
        if (gg.kind === 'rev') {
          const s = side === 'right' ? 1 : -1;
          const push = (o.push ?? 0.8) * k, drift = (o.drift ?? 0.45) * (k - 0.5);
          const C = [gg.C[0] - gg.F[0] * push + gg.right[0] * drift * s, gg.C[1] - gg.F[1] * push + gg.right[1] * drift * s];
          const sh = o.shift ?? 1.35;
          const L = [gg.H[0] - gg.right[0] * s * sh, gg.H[1] - gg.right[1] * s * sh];
          return { pos: [C[0], G(C[0], C[1]) + (o.camH ?? 1.55), C[1]], look: [L[0], hy + (o.lookH ?? 1.4), L[1]], fov: o.fov ?? 34 };
        }
        if (gg.T) {
          const slide = (o.drift ?? 0.9) * (k - 0.5), push = (o.push ?? 0.9) * k;
          const C = [gg.C[0] + gg.F[0] * slide - gg.Pp[0] * push, gg.C[1] + gg.F[1] * slide - gg.Pp[1] * push];
          const L = [gg.L[0] + gg.F[0] * slide * 0.6, gg.L[1] + gg.F[1] * slide * 0.6];
          return { pos: [C[0], hy + (o.camH ?? 1.35) + k * 0.15, C[1]], look: [L[0], hy + 1.15, L[1]], fov: o.fov ?? 38 };
        }
        const arc = (o.arc ?? 0.22) * (k - 0.5) * (side === 'right' ? -1 : 1);
        const c = gg.c + arc, R = gg.R - (o.push ?? 0.45) * k;
        const C = [gg.H[0] + Math.sin(c) * R, gg.H[1] + Math.cos(c) * R];
        const v = [-Math.sin(c), -Math.cos(c)], right = [-v[1], v[0]], s = side === 'right' ? 1 : -1;
        const L = [gg.H[0] + right[0] * s * -1.0, gg.H[1] + right[1] * s * -1.0];
        return { pos: [C[0], hy + (o.camH ?? 1.45), C[1]], look: [L[0], hy + (o.lookH ?? 1.55), L[1]], fov: o.fov ?? 40 };
      },
      focus: (t, S) => [S.G.H[0], G(S.G.H[0], S.G.H[1]) + 1, S.G.H[1]],
    });
    L3(start + 0.08, fac === 'eacc' ? 'l' : 'r', fac, name, title, ability);
  };
  const around = (gg, angDeg, dist) => { const a = gg.f + (angDeg * Math.PI) / 180; return [gg.H[0] + Math.sin(a) * dist, gg.H[1] + Math.cos(a) * dist]; };

  hero({
    champ: 'elon', start: 16, fac: 'eacc', name: 'Elon Musk', title: 'The Technoking', ability: 'Starship Barrage',
    kind: 'rev', region: [214, 98], dayTime: 0.66, D: 7, back: 2.3, lat: 1.3, mobType: 'paperclip',
    events: [[-1.15, (S) => TR.cast(S.a, 'starship', S.m)], [1.02, (S) => TR.cast(S.a, 'flamethrower', S.m)]],
  });
  hero({
    champ: 'eliezer', start: 17.5, fac: 'ea', name: 'Eliezer Yudkowsky', title: 'The Doom Prophet', ability: 'Shut It All Down',
    kind: 'close', region: [-200, 102], dayTime: 0.31, R: 3.8,
    setup: (S, gg) => { S.ms = [[150, 3.4], [-150, 3.2], [105, 3.9], [-100, 3.7]].map(([a, d]) => { const p = around(gg, a, d); const m = TR.mob('paperclip', p[0], p[1], { hp: 3e6 }); m.ry = yawTo(p, gg.H); return m; }); },
    events: [[0.42, (S) => TR.cast(S.a, 'shutdown')], [1.05, (S) => TR.cast(S.a, 'dignity')]],
  });
  hero({
    champ: 'beff', start: 19, fac: 'eacc', name: 'Beff Jezos', title: 'Prophet of the Thermodynamic God', ability: 'Heat Death Slam',
    kind: 'close', region: [196, 60], dayTime: 0.64, R: 3.9, camH: 1.0, lookH: 1.7,
    setup: (S, gg) => {
      TR.W._addAura(S.a, { id: 'thermogod', name: 'Thermodynamic God', icon: 'sun', dur: 12, dmg: 0.35, lifesteal: 0.25, srcId: S.a.id });
      S.ms = [[140, 3.6], [-145, 3.8]].map(([a, d]) => { const p = around(gg, a, d); const m = TR.mob('golem', p[0], p[1], { hp: 3e6 }); m.ry = yawTo(p, gg.H); return m; });
    },
    events: [[0.08, (S) => TR.cast(S.a, 'accelerate')], [0.82, (S) => TR.cast(S.a, 'heatdeath')]],
  });
  hero({
    champ: 'dario', start: 20.5, fac: 'ea', name: 'Dario Amodei', title: 'The Constitutionalist', ability: 'Interpretability Ray',
    kind: 'rev', region: [-58, 244], dayTime: 0.34, D: 7, back: 2.4, lat: 1.5, mobType: 'imp',
    events: [[-0.95, (S) => TR.cast(S.a, 'interp', S.m)], [1.02, (S) => TR.cast(S.a, 'grace')]],
  });
  hero({
    champ: 'sam', start: 22, fac: 'eacc', name: 'Sam Altman', title: 'The Scaler', ability: 'Project Stargate',
    kind: 'two', region: [96, 196], dayTime: 0.68, D: 6, R: 9, fov: 34, drift: 0.6, push: 0.8,
    events: [[0.04, (S) => TR.cast(S.a, 'stargate', S.m)]],
  });
  hero({
    champ: 'will', start: 23.5, fac: 'ea', name: 'Will MacAskill', title: 'The Longtermist', ability: 'What We Owe the Future',
    kind: 'close', region: [-190, 150], dayTime: 0.3, R: 4.2,
    setup: (S, gg) => {
      const p1 = around(gg, 150, 2.8), p2 = around(gg, -150, 2.9);
      S.f1 = TR.actor('dario', p1[0], p1[1], gg.f); S.f2 = TR.actor('bostrom', p2[0], p2[1], gg.f);
      TR.hold(S.f1); TR.hold(S.f2); S.f1.hp = S.f1.maxHp * 0.3; S.f2.hp = S.f2.maxHp * 0.35;
    },
    events: [[0.36, (S) => TR.cast(S.a, 'owefuture')], [1.0, (S) => TR.cast(S.a, 'earntogive', S.f2)]],
  });
  hero({
    champ: 'marc', start: 25, fac: 'eacc', name: 'Marc Andreessen', title: 'The Techno-Optimist', ability: 'Hard Tech Hammer',
    kind: 'rev', region: [188, 146], dayTime: 0.64, D: 9, back: 2.6, lat: 1.7, fov: 38, push: 0.4, mobType: 'paperclip',
    events: [[0.32, (S) => TR.cast(S.a, 'hardtech', S.m)], [1.08, (S) => TR.cast(S.a, 'moat')]],
  });
  hero({
    champ: 'bostrom', start: 26.5, fac: 'ea', name: 'Nick Bostrom', title: 'The Simulation Theorist', ability: 'The Singleton',
    kind: 'rev', region: [-160, -80], radius: 55, dayTime: 0.4, D: 7, back: 2.4, lat: 1.35, mobType: 'imp',
    setup: (S, gg) => { S.ms = [[12, 7.6], [-12, 7.4]].map(([a, d]) => { const p = around(gg, a, d); const m = TR.mob('imp', p[0], p[1], { hp: 3e6 }); m.ry = yawTo(p, gg.H); return m; }); },
    events: [[-0.75, (S) => TR.cast(S.a, 'singleton', S.m)], [1.0, (S) => TR.cast(S.a, 'clips', S.m)], [1.36, (S) => TR.cast(S.a, 'simulation')]],
  });

  // ------------------------------------------------------------ 13. Faction clash (28-30)
  const clashC = [4, 58];
  shot({
    name: 'clash', dur: 2, pre: 1.3, dayTime: 0.6, me: [4, 40], clearR: 60, clearAt: clashC,
    setup: (S) => {
      const [cx, cz] = clashC;
      const e = [['elon', 5.5, -1.5], ['beff', 4.5, 2], ['marc', 6.2, 4.6]];
      const a = [['eliezer', -5.5, -1.5], ['dario', -4.5, 2], ['will', -6.2, 4.6]];
      S.e = e.map(([c, dx, dz]) => TR.actor(c, cx + dx, cz + dz, -Math.PI / 2));
      S.a = a.map(([c, dx, dz]) => TR.actor(c, cx + dx, cz + dz, Math.PI / 2));
      for (const p of [...S.e, ...S.a]) TR.hold(p);
    },
    events: [
      [-1.15, (S) => TR.cast(S.e[0], 'starship', S.a[0])],
      [-1.0, (S) => TR.cast(S.a[0], 'bayes', S.e[0])],
      [0.25, (S) => TR.cast(S.e[1], 'basedcharge', S.a[1])],
      [0.55, (S) => TR.cast(S.e[2], 'hardtech', S.a[2])],
      [0.85, (S) => TR.cast(S.a[1], 'smite', S.e[1])],
      [1.1, (S) => TR.cast(S.a[2], 'owefuture')],
      [1.2, (S) => TR.cast(S.e[0], 'neuralink', S.a[0])],
      [1.5, (S) => TR.cast(S.a[0], 'shutdown')],
    ],
    cam: TR.path([
      { t: 0, pos: P(clashC[0] - 1.6, clashC[1] + 9.5, 1.35), look: [clashC[0] + 0.4, G(...clashC) + 1.35, clashC[1] + 1.4], fov: 54 },
      { t: 2, pos: P(clashC[0] + 1.6, clashC[1] + 8.2, 1.7), look: [clashC[0] - 0.4, G(...clashC) + 1.25, clashC[1] + 1.4], fov: 54 },
    ], (k) => k),
    focus: [clashC[0], G(...clashC), clashC[1]],
  });
  TR.addTitle({ t0: 28.1, t1: 29.95, fin: 0.25, fout: 0.3, anim: 'rise', cls: 'hud', html: 'Pick a side &nbsp;·&nbsp; 8 champions &nbsp;·&nbsp; open-world PvP' });

  // ------------------------------------------------------------ 14. Real gameplay with the HUD (30-32)
  const gp = [200, 120];
  shot({
    name: 'gameplay', dur: 2, pre: 1.7, dayTime: 0.47, me: gp, hud: true, plates: true, gameCam: true, hideMe: false, clearR: 45, clearAt: gp,
    setup: (S) => {
      const g = TR.g, W = TR.W;
      const me = W.ents.get(g.myId);
      me.level = 4; W._recalc(me); me.hp = Math.round(me.maxHp * 0.86); me.en = me.maxEn; me.cds = {}; me.gcdUntil = 0; me.casting = null;
      me.quests = { e1: [3] }; me.done = [];
      S.ms = [[gp[0] - 7, gp[1] - 11], [gp[0] - 3.5, gp[1] - 8.5], [gp[0] - 10.5, gp[1] - 7]].map(([x, z]) => {
        const m = TR.mob('paperclip', x, z, { frozen: false, level: 2 });
        m.maxHp = m.hp = 60; m.def = Object.assign({}, m.def, { aggro: 0, leash: 999 });
        return m;
      });
      g.ctrl.yaw = Math.atan2(S.ms[0].x - gp[0], S.ms[0].z - gp[1]);
      g.ctrl.camYaw = g.ctrl.yaw + 0.35; g.ctrl.camPitch = 0.26; g.ctrl.dist = g.ctrl.distCur = 8.8;
      const log = document.getElementById('chatLog'); log.innerHTML = ''; g.ui.chatLines = 0;
      g.ui.chat('LFG Moloch — coordination is the whole point', 'world', 'UtilonCounter', 'ea');
      g.ui.chat('Quest accepted: The Paperclip Problem', 'sys');
    },
    events: [
      [-1.62, (S) => { const me = TR.W.ents.get(TR.g.myId); me.gcdUntil = 0; TR.g.setTarget(S.ms[0].id); TR.g.castSlot(0); }],
      [0.08, (S) => { for (const m of S.ms) TR.W._engage(m, TR.W.ents.get(TR.g.myId)); }],
      [0.42, (S) => { const me = TR.W.ents.get(TR.g.myId); me.gcdUntil = 0; me.cds = {}; TR.g.setTarget(S.ms[1].id); TR.g.castSlot(1); }],
      [1.12, (S) => { const me = TR.W.ents.get(TR.g.myId); me.gcdUntil = 0; me.cds = {}; TR.g.setTarget(S.ms[2].id); TR.g.castSlot(3); }],
    ],
    onFrame: () => { TR.g.ctrl.camYaw -= 0.0022; },
  });
  TR.addTitle({ t0: 30.15, t1: 31.9, fin: 0.25, fout: 0.3, anim: 'rise', cls: 'hud top', html: 'A real MMO &nbsp;—&nbsp; right in your browser' });

  // ------------------------------------------------------------ 15. Dusk: rivals walk up to the Spire together (32-34)
  const ap = [0, -136];
  shot({
    name: 'approach', dur: 2, pre: 1.2, dayTime: 0.742, me: [0, -150],
    setup: (S) => {
      const cast = [['elon', -2.4, 0], ['eliezer', -0.8, 0.6], ['sam', 0.8, 0.3], ['dario', 2.4, 0.8]];
      S.g = cast.map(([c, dx, dz]) => { const p = TR.actor(c, ap[0] + dx, ap[1] + dz, Math.PI); TR.walk(p, p.x, p.z - 30, 2.4); return p; });
    },
    cam: (t) => {
      const z = ap[1] + 4.6 - 2.4 * (t + 0.0);
      return { pos: [0.7, G(0.7, z) + 1.75, z], look: [0, G(0, -175) + 9, -175], fov: 46 };
    },
    focus: (t) => [0, G(0, ap[1] - 2.4 * t), ap[1] - 2.4 * t],
  });
  TR.addTitle({ t0: 32.1, t1: 33.75, fin: 0.35, fout: 0.25, anim: 'rise', cls: 'cap low', html: 'Until something worse awakens' });

  // ------------------------------------------------------------ 16. Moloch awakens (34-37.5)
  const mol = [0, -182];
  const camM = [-1.2, -193];
  shot({
    name: 'moloch', dur: 3.5, pre: 1.2, dayTime: 0.748, me: [0, -205],
    setup: (S) => {
      S.m = TR.findMob('moloch');
      S.m.x = mol[0]; S.m.z = mol[1]; S.m.y = G(...mol); S.m.alive = true; S.m.state = 'idle'; S.m.hp = S.m.maxHp; S.m.phase = 0;
      S.m.ry = S.m.spawnRy = Math.PI; S.m.spawn = { x: mol[0], z: mol[1] };
      S.bait = TR.actor('marc', camM[0] - 0.4, camM[1] - 7, 0); TR.hold(S.bait);
      S.m.def = Object.assign({}, S.m.def, { speed: 2.0, aggro: 0, range: 6.5 });
    },
    events: [
      [0.1, (S) => { TR.W._engage(S.m, S.bait); S.m.specialAt = TR.W.time + 0.45; }],
    ],
    cam: TR.path([
      { t: 0, pos: P(camM[0], camM[1], 0.5), look: [0, G(...mol) + 6.2, -183], fov: 58 },
      { t: 3.5, pos: P(camM[0] + 0.2, camM[1] + 1.4, 0.4), look: [0, G(...mol) + 7.0, -184], fov: 60 },
    ], (k) => E.easeOut(k)),
    focus: [0, G(...mol), -187],
  });
  TR.addTitle({ t0: 34.35, t1: 37.35, fin: 0.35, fout: 0.3, anim: 'zoom', cls: 'big moloch', html: 'Moloch' });
  TR.addTitle({ t0: 35.0, t1: 37.35, fin: 0.5, fout: 0.3, anim: 'rise', cls: 'sub moloch', html: 'Lord of the Race to the Bottom' });

  // ------------------------------------------------------------ 17. The raid: both factions together (37.5-41)
  shot({
    name: 'raid', dur: 3.5, pre: 1.6, dayTime: 0.752, me: [0, -205], shadowRange: 70,
    speed: (t) => (t > 1.85 && t < 2.85 ? 0.5 : 1),
    setup: (S) => {
      const W = TR.W;
      S.m = TR.findMob('moloch');
      S.m.x = mol[0]; S.m.z = mol[1]; S.m.y = G(...mol); S.m.alive = true; S.m.hp = S.m.maxHp; S.m.state = 'idle'; S.m.ry = Math.PI; S.m.phase = 0;
      S.m.def = Object.assign({}, S.m.def, { speed: 0, aggro: 40, range: 9 });
      const ring = ['marc', 'dario', 'beff', 'eliezer', 'elon', 'will', 'sam', 'bostrom'];
      S.r = ring.map((c, i) => {
        const melee = ['marc', 'dario', 'beff'].includes(c);
        const a = Math.PI + (i - 3.5) * 0.3;
        const d = melee ? 7.2 : 14;
        const p = TR.actor(c, mol[0] + Math.sin(a) * d, mol[1] + Math.cos(a) * d, 0);
        TR.face(p, S.m); TR.hold(p);
        return p;
      });
      W._engage(S.m, S.r[0]);
      S.m.specialAt = W.time + 99;
    },
    events: [
      [-1.2, (S) => { TR.cast(S.r[4], 'starship', S.m); TR.cast(S.r[3], 'bayes', S.m); }],
      [-0.6, (S) => { TR.cast(S.r[7], 'ortho', S.m); TR.cast(S.r[1], 'interp', S.m); }],
      [-0.2, (S) => { S.m.specialAt = TR.W.time; }],
      [0.15, (S) => { TR.cast(S.r[6], 'stargate', S.m); TR.cast(S.r[5], 'owefuture'); }],
      [0.5, (S) => TR.cast(S.r[2], 'heatdeath')],
      [0.9, (S) => TR.cast(S.r[0], 'moat')],
      [1.15, (S) => TR.cast(S.r[4], 'marsdrop', S.m)],
      [1.4, (S) => TR.cast(S.r[3], 'doomnova', S.m)],
      [2.7, (S) => TR.cast(S.r[7], 'singleton', S.m)],
      [2.95, (S) => TR.cast(S.r[5], 'bednet', S.r[0])],
    ],
    cam: TR.path([
      { t: 0, pos: P(-4.2, -198.5, 1.35), look: [0, G(...mol) + 4.4, -183], fov: 58 },
      { t: 3.5, pos: P(2.2, -198.0, 1.55), look: [0, G(...mol) + 4.8, -183], fov: 58 },
    ], (k) => k),
    focus: [0, G(...mol), -189],
  });
  TR.addTitle({ t0: 37.65, t1: 40.8, fin: 0.3, fout: 0.3, anim: 'rise', cls: 'hud', html: 'Only together can you stop him' });

  // ------------------------------------------------------------ 18. Title card over the island at dusk (41-48)
  shot({
    name: 'title', dur: 7, pre: 1.4, dayTime: 0.742, me: [10, 20], shadowRange: 160,
    cam: TR.path([
      { t: 0, pos: P(34, 96, 78), look: [0, 56, -175], fov: 50 },
      { t: 7, pos: P(26, 70, 70), look: [0, 60, -175], fov: 48 },
    ], (k) => k),
  });
  TR.addTitle({ t0: 41.0, t1: 48.2, fin: 0.9, fout: 0.01, anim: 'zoom', cls: 'logo', html: '<div class="l1">SINGULARITY</div><div class="l2">ONLINE</div><div class="l3">Accelerate &nbsp;or&nbsp; Align</div>' });
  TR.addTitle({ t0: 43.2, t1: 48.2, fin: 0.7, fout: 0.01, anim: 'rise', cls: 'cta', html: '<div class="c1">Free MMO &nbsp;·&nbsp; In your browser &nbsp;·&nbsp; Desktop &amp; mobile</div><div class="c2">peterxing.github.io/singularity-online</div>' });
  TR.addTitle({ t0: 43.8, t1: 48.2, fin: 0.7, fout: 0.01, anim: 'fade', cls: 'disc', html: 'Parody: characters are satirical caricatures of public personas, not affiliated with or endorsed by anyone depicted. &nbsp;Every pixel and sound is generated in code.' });

  TR.defineShots(T);

  const bell = (t, c, w) => Math.max(0, 1 - Math.abs(t - c) / w);
  TR.fadeAt = (t) => {
    if (t < 1.1) return 1 - TR.ease.smooth(Math.min(1, t / 1.1));
    if (t > 33.7 && t < 34.0) return (t - 33.7) / 0.3;
    if (t >= 34.0 && t < 34.4) return 1 - (t - 34.0) / 0.4;
    if (t > 47.3) return Math.min(1, (t - 47.3) / 0.7);
    return 0;
  };
  TR.flashAt = (t) => Math.max(bell(t, 8.02, 0.18) * 0.55, bell(t, 12.02, 0.18) * 0.55, bell(t, 16.0, 0.12) * 0.35, bell(t, 41.0, 0.3) * 0.7);
})();

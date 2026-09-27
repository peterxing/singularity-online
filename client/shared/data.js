// Game content. Parody: satirical caricatures of public personas, not endorsed by anyone depicted.

export const FACTIONS = {
  eacc: {
    id: 'eacc', name: 'The Accelerationists', short: 'e/acc', color: '#ff8a1f', color2: '#ffd36b',
    motto: 'Accelerate. Build. Climb the Kardashev scale.', capital: 'eacc', home: [298, 40],
  },
  ea: {
    id: 'ea', name: 'The Aligned', short: 'EA', color: '#4fb3ff', color2: '#b9ecff',
    motto: 'Do the most good. Make the future go well.', capital: 'ea', home: [-298, 40],
  },
};

export const DISCLAIMER = 'Parody. Characters are satirical caricatures of public personas and are not affiliated with or endorsed by any person or company depicted.';

// ---------------------------------------------------------------- abilities
// target: enemy | ally | self | any
// effects are resolved by world.js
export const ABILITIES = {
  // Elon
  starship: { name: 'Starship Barrage', icon: 'rocket', color: 0xff7a2a, cast: 1.6, cd: 0, cost: 20, range: 32, target: 'enemy',
    delivery: 'projectile', speed: 34, proj: 'rocket', effects: [{ type: 'damage', amount: 42 }, { type: 'splash', radius: 4.5, pct: 0.5 }],
    desc: 'Launch a reusable rocket at the target for {d} damage. Splashes nearby enemies. Lands itself afterwards (probably).' },
  flamethrower: { name: 'Not-a-Flamethrower', icon: 'flame', color: 0xff5a1a, cast: 0, cd: 8, cost: 25, range: 11, target: 'enemy',
    effects: [{ type: 'cone', range: 11, angle: 70, effects: [{ type: 'damage', amount: 22 }, { type: 'dot', amount: 6, ticks: 4, interval: 1, name: 'Singed', icon: 'flame' }] }],
    fx: 'cone', desc: 'Definitely not a flamethrower. Scorches enemies in front of you for {d} damage plus burning.' },
  hyperloop: { name: 'Hyperloop Dash', icon: 'dash', color: 0x9fd8ff, cast: 0, cd: 12, cost: 10, range: 0, target: 'self', gcd: false,
    effects: [{ type: 'dash', dist: 18 }], fx: 'dash', desc: 'Travel 18 yards forward in a low-pressure tube of your own imagination.' },
  neuralink: { name: 'Neural Uplink', icon: 'brain', color: 0x7affd4, cast: 0, cd: 18, cost: 20, range: 28, target: 'enemy',
    delivery: 'projectile', speed: 45, proj: 'spark', effects: [{ type: 'damage', amount: 15 }, { type: 'stun', dur: 3 }],
    desc: 'Beam a firmware update directly into the target, stunning it for 3 sec.' },
  marsdrop: { name: 'Occupy Mars', icon: 'planet', color: 0xff4d2a, cast: 1.0, cd: 45, cost: 40, range: 32, target: 'enemy',
    effects: [{ type: 'aoe', center: 'target', radius: 8, delay: 0.9, effects: [{ type: 'damage', amount: 90 }] }],
    fx: 'meteor', desc: 'Call down a small red planet on the target area for {d} damage. Terraforming not included.' },

  // Beff Jezos
  entropy: { name: 'Entropy Strike', icon: 'fist', color: 0xffa640, cast: 0, cd: 0, cost: 12, range: 4.5, target: 'enemy',
    effects: [{ type: 'damage', amount: 30 }], fx: 'swing', desc: 'Punch a local entropy gradient for {d} damage.' },
  accelerate: { name: 'Accelerate', icon: 'haste', color: 0xffe14d, cast: 0, cd: 22, cost: 0, range: 0, target: 'self', gcd: false,
    effects: [{ type: 'buff', id: 'accelerate', name: 'Accelerating', icon: 'haste', dur: 8, haste: 0.4, dmg: 0.2 }],
    fx: 'buff', desc: 'Accelerate. +40% speed and attack speed, +20% damage for 8 sec.' },
  heatdeath: { name: 'Heat Death Slam', icon: 'slam', color: 0xff6a2a, cast: 0, cd: 9, cost: 25, range: 0, target: 'self',
    effects: [{ type: 'aoe', center: 'self', radius: 8, effects: [{ type: 'damage', amount: 34 }, { type: 'slow', pct: 0.4, dur: 3 }] }],
    fx: 'slam', desc: 'Slam the ground, dealing {d} damage to nearby enemies and slowing them.' },
  basedcharge: { name: 'Based Charge', icon: 'charge', color: 0xffc04d, cast: 0, cd: 14, cost: 10, range: 25, minRange: 4, target: 'enemy', gcd: false,
    effects: [{ type: 'charge' }, { type: 'damage', amount: 18 }, { type: 'stun', dur: 1.2 }],
    fx: 'charge', desc: 'Charge an enemy, stunning it for 1.2 sec. Vibes-based physics.' },
  thermogod: { name: 'Thermodynamic God', icon: 'sun', color: 0xffb030, cast: 0, cd: 60, cost: 0, range: 0, target: 'self',
    effects: [{ type: 'buff', id: 'thermogod', name: 'Thermodynamic God', icon: 'sun', dur: 12, dmg: 0.35, lifesteal: 0.25 }],
    fx: 'ascend', desc: 'Become one with the Thermodynamic God: +35% damage and 25% lifesteal for 12 sec.' },

  // Sam Altman
  scalingbolt: { name: 'Scaling Law', icon: 'bolt', color: 0x8fe3ff, cast: 1.3, cd: 0, cost: 15, range: 30, target: 'enemy',
    delivery: 'projectile', speed: 38, proj: 'orb', effects: [{ type: 'damage', amount: 30, scaling: { id: 'scaling', per: 0.25, max: 4 } }],
    desc: 'Deals {d} damage. Each cast grants a Scaling stack (+25% damage, up to 4). Just add more compute.' },
  shipit: { name: 'Ship It', icon: 'ship', color: 0x6dffb0, cast: 0, cd: 0, cost: 18, range: 30, target: 'enemy',
    effects: [{ type: 'dot', amount: 8, ticks: 8, interval: 1.5, name: 'Shipped to Prod', icon: 'ship' }],
    fx: 'zap', desc: 'Deploy straight to production. Deals {dot} damage over 12 sec.' },
  cluster: { name: 'Compute Cluster', icon: 'cluster', color: 0x6de0ff, cast: 0, cd: 25, cost: 30, range: 0, target: 'self',
    effects: [{ type: 'summon', what: 'cluster', dur: 10 }],
    desc: 'Deploy a humming compute cluster that heals allies within 10 yards for 12 per second.' },
  orb: { name: 'Iris Orb', icon: 'orb', color: 0xd8e6ff, cast: 0, cd: 12, cost: 20, range: 30, target: 'ally',
    effects: [{ type: 'shield', amount: 70, dur: 10, name: 'Verified Human', icon: 'orb' }],
    fx: 'shield', desc: 'The orb scans the target and verifies they are human, absorbing {s} damage.' },
  stargate: { name: 'Project Stargate', icon: 'beam', color: 0x9ad8ff, cast: 0, channel: 3, cd: 40, cost: 35, range: 30, target: 'enemy',
    effects: [{ type: 'channel', ticks: 6, amount: 22 }], fx: 'beam', desc: 'Channel a half-trillion-dollar beam of compute: {c} damage over 3 sec.' },

  // Marc Andreessen
  softwareeats: { name: 'Software Eats', icon: 'jaws', color: 0x7fd0ff, cast: 0, cd: 0, cost: 10, range: 4.5, target: 'enemy',
    effects: [{ type: 'damage', amount: 26 }, { type: 'selfheal', amount: 8 }], fx: 'swing', desc: 'Software eats the target for {d} damage and heals you for 8.' },
  manifesto: { name: 'Techno-Optimist Manifesto', icon: 'book', color: 0xffd76b, cast: 0, cd: 30, cost: 20, range: 0, target: 'self',
    effects: [{ type: 'aoe', center: 'self', radius: 22, friendly: true, effects: [{ type: 'buff', id: 'manifesto', name: 'Techno-Optimism', icon: 'book', dur: 15, dmg: 0.2 }] }],
    fx: 'aura', desc: 'Read aloud from the manifesto. Allies within 22 yards deal 20% more damage for 15 sec.' },
  timetobuild: { name: "It's Time to Build", icon: 'turret', color: 0xffb347, cast: 0, cd: 24, cost: 30, range: 0, target: 'self',
    effects: [{ type: 'summon', what: 'turret', dur: 14 }], desc: 'Build a turret that shoots enemies for 14 sec.' },
  moat: { name: 'Moat of Capital', icon: 'shield', color: 0x9fe0ff, cast: 0, cd: 16, cost: 15, range: 0, target: 'self', gcd: false,
    effects: [{ type: 'shield', amount: 120, dur: 8, name: 'Moat of Capital', icon: 'shield' }, { type: 'taunt', radius: 12 }],
    fx: 'shield', desc: 'Absorb {s} damage and taunt all enemies within 12 yards.' },
  hardtech: { name: 'Hard Tech Hammer', icon: 'hammer', color: 0xffc04d, cast: 0, cd: 40, cost: 30, range: 28, minRange: 3, target: 'enemy',
    effects: [{ type: 'charge' }, { type: 'aoe', center: 'self', radius: 7, effects: [{ type: 'damage', amount: 60 }, { type: 'stun', dur: 1.5 }] }],
    fx: 'slam', desc: 'Leap at the target and slam, dealing {d} damage and stunning nearby enemies.' },

  // Dario Amodei
  smite: { name: 'Constitutional Smite', icon: 'scroll', color: 0xfff1b0, cast: 0, cd: 0, cost: 10, range: 6, target: 'enemy',
    effects: [{ type: 'damage', amount: 27 }], fx: 'swing', desc: 'Smite the target with principles for {d} damage.' },
  rsp: { name: 'Responsible Scaling', icon: 'scale', color: 0x9fe8ff, cast: 0, cd: 12, cost: 20, range: 30, target: 'ally',
    effects: [{ type: 'shield', amount: 80, dur: 10, name: 'Responsible Scaling', icon: 'scale' }], fx: 'shield',
    desc: 'Shield an ally, absorbing {s} damage. Thresholds apply.' },
  interp: { name: 'Interpretability Ray', icon: 'eye', color: 0x7ff0ff, cast: 1.4, cd: 0, cost: 20, range: 30, target: 'enemy',
    effects: [{ type: 'damage', amount: 44 }, { type: 'debuff', id: 'understood', name: 'Interpreted', icon: 'eye', dur: 8, dmgOut: -0.2 }],
    fx: 'ray', desc: 'Look inside the target for {d} damage. Understood enemies deal 20% less damage for 8 sec.' },
  grace: { name: 'Machines of Loving Grace', icon: 'heart', color: 0x9dffc8, cast: 1.5, cd: 0, cost: 25, range: 30, target: 'ally',
    effects: [{ type: 'heal', amount: 75 }], fx: 'heal', desc: 'A long, hopeful heal for {h}.' },
  racetop: { name: 'Race to the Top', icon: 'podium', color: 0xfff08a, cast: 0, cd: 45, cost: 35, range: 0, target: 'self',
    effects: [{ type: 'buff', id: 'racetop', name: 'Race to the Top', icon: 'podium', dur: 8, pulse: { radius: 10, heal: 12, damage: 12 } }],
    fx: 'aura', desc: 'For 8 sec, heal nearby allies and damage nearby enemies for 12 every second.' },

  // Eliezer Yudkowsky
  bayes: { name: 'Bayesian Bolt', icon: 'prob', color: 0xb46bff, cast: 1.5, cd: 0, cost: 18, range: 32, target: 'enemy',
    delivery: 'projectile', speed: 30, proj: 'bolt', effects: [{ type: 'damage', amount: 44 }], desc: 'Update the target violently for {d} damage.' },
  inadequate: { name: 'Inadequate Equilibrium', icon: 'curse', color: 0x9d5cff, cast: 0, cd: 0, cost: 16, range: 32, target: 'enemy',
    effects: [{ type: 'dot', amount: 9, ticks: 8, interval: 1.5, name: 'Inadequate Equilibrium', icon: 'curse' }], fx: 'zap',
    desc: 'Trap the target in a civilizational failure mode for {dot} damage over 12 sec.' },
  shutdown: { name: 'Shut It All Down', icon: 'stop', color: 0xff4d6a, cast: 0, cd: 24, cost: 30, range: 0, target: 'self',
    effects: [{ type: 'aoe', center: 'self', radius: 10, effects: [{ type: 'damage', amount: 20 }, { type: 'stun', dur: 3 }] }],
    fx: 'nova', desc: 'Everything within 10 yards takes {d} damage and is shut down for 3 sec.' },
  dignity: { name: 'Dignity Points', icon: 'medal', color: 0xe4c7ff, cast: 0, cd: 20, cost: 15, range: 0, target: 'self', gcd: false,
    effects: [{ type: 'shield', amount: 90, dur: 10, name: 'Dignity', icon: 'medal' }, { type: 'buff', id: 'dignity', name: 'Dignified', icon: 'medal', dur: 10, dr: 0.2 }],
    fx: 'shield', desc: 'Absorb {s} damage and take 20% less damage for 10 sec. Every point counts.' },
  doomnova: { name: 'Doom Nova', icon: 'nova', color: 0xc070ff, cast: 1.0, cd: 45, cost: 40, range: 32, target: 'enemy',
    effects: [{ type: 'aoe', center: 'target', radius: 9, delay: 0.3, effects: [{ type: 'damage', amount: 95 }] }], fx: 'nova_t',
    desc: 'Detonate a p(doom) singularity at the target for {d} damage to all enemies nearby.' },

  // Will MacAskill
  moralcircle: { name: 'Expanding Moral Circle', icon: 'circle', color: 0x8dffc2, cast: 1.3, cd: 0, cost: 18, range: 30, target: 'any',
    effects: [{ type: 'smart', heal: 60, damage: 32 }], fx: 'heal', desc: 'Heal an ally for {h}, or rebuke an enemy for 32 damage.' },
  earntogive: { name: 'Earn to Give', icon: 'coin', color: 0xffe07a, cast: 0, cd: 0, cost: 14, range: 30, target: 'ally',
    effects: [{ type: 'hot', amount: 9, ticks: 8, interval: 1.5, name: 'Earn to Give', icon: 'coin' }], fx: 'heal',
    desc: 'Donate health: heals the target for {hot} over 12 sec.' },
  bednet: { name: 'Bednet Barrier', icon: 'net', color: 0xcff8ff, cast: 0, cd: 8, cost: 18, range: 30, target: 'ally',
    effects: [{ type: 'shield', amount: 65, dur: 10, name: 'Bednet Barrier', icon: 'net' }], fx: 'shield',
    desc: 'The most cost-effective shield: absorbs {s} damage.' },
  owefuture: { name: 'What We Owe the Future', icon: 'hourglass', color: 0xa8ffcf, cast: 0, cd: 18, cost: 35, range: 0, target: 'self',
    effects: [{ type: 'aoe', center: 'self', radius: 15, friendly: true, effects: [{ type: 'heal', amount: 55 }] }], fx: 'healnova',
    desc: 'Heal all allies within 15 yards for {h}, including ones who have not been born yet.' },
  ev: { name: 'Maximize Expected Value', icon: 'star', color: 0xfff3a0, cast: 0, cd: 50, cost: 0, range: 0, target: 'self', gcd: false,
    effects: [{ type: 'buff', id: 'ev', name: 'Expected Value', icon: 'star', dur: 10, healUp: 0.5, castSpeed: 0.3 }], fx: 'ascend',
    desc: 'Heals are 50% stronger and casts 30% faster for 10 sec.' },

  // Nick Bostrom
  ortho: { name: 'Orthogonality Beam', icon: 'axes', color: 0x7fb4ff, cast: 1.4, cd: 0, cost: 18, range: 30, target: 'enemy',
    effects: [{ type: 'damage', amount: 42 }], fx: 'ray', desc: 'Any level of intelligence, any goal, {d} damage.' },
  clips: { name: 'Paperclip Swarm', icon: 'paperclip', color: 0xc9d4e4, cast: 0, cd: 0, cost: 16, range: 30, target: 'enemy',
    effects: [{ type: 'dot', amount: 8, ticks: 8, interval: 1.5, name: 'Paperclipped', icon: 'paperclip' }, { type: 'slow', pct: 0.3, dur: 8 }], fx: 'zap',
    desc: 'A swarm of maximized paperclips deals {dot} damage over 12 sec and slows by 30%.' },
  simulation: { name: 'Simulation Argument', icon: 'cube', color: 0x8affff, cast: 0, cd: 14, cost: 10, range: 0, target: 'self', gcd: false,
    effects: [{ type: 'dash', dist: 16 }, { type: 'shield', amount: 40, dur: 4, name: 'Glitched', icon: 'cube' }], fx: 'blink',
    desc: 'Exploit a rendering shortcut in the simulation: blink 16 yards and absorb 40 damage.' },
  vulnerable: { name: 'Vulnerable World', icon: 'bomb', color: 0xff7a5a, cast: 0, cd: 20, cost: 25, range: 30, target: 'enemy',
    effects: [{ type: 'aoe', center: 'target', radius: 7, delay: 3, mark: true, effects: [{ type: 'damage', amount: 70 }] }], fx: 'bomb',
    desc: 'Draw a black ball from the urn. After 3 sec it explodes on the target for {d} damage.' },
  singleton: { name: 'The Singleton', icon: 'crown', color: 0x9fc4ff, cast: 1.2, cd: 45, cost: 40, range: 30, target: 'enemy',
    effects: [{ type: 'aoe', center: 'target', radius: 10, effects: [{ type: 'damage', amount: 55 }, { type: 'slow', pct: 0.6, dur: 5 }, { type: 'stun', dur: 1.5 }] }], fx: 'nova_t',
    desc: 'Impose a single world order: {d} damage to enemies in the area, stunned then heavily slowed.' },

  // Shared consumable
  potion: { name: 'Energy Drink', icon: 'potion', color: 0x5dff8a, cast: 0, cd: 30, cost: 0, range: 0, target: 'self', gcd: false, item: 'potion',
    effects: [{ type: 'healpct', pct: 0.4 }], fx: 'heal', desc: 'Restores 40% of your health. Tastes like venture capital.' },
};

// ---------------------------------------------------------------- champions
export const CHAMPIONS = {
  elon: {
    id: 'elon', faction: 'eacc', name: 'Elon Musk', title: 'The Technoking', role: 'Ranged DPS', resource: 'Thrust',
    hp: 175, hpPer: 26, speed: 7.2, auto: { range: 26, dmg: 9, speed: 1.9, proj: 'spark', color: 0xff9a4a },
    abilities: ['starship', 'flamethrower', 'hyperloop', 'neuralink', 'marsdrop'],
    bio: 'Rocket builder, electric-carriage magnate and prolific poster. Insists the light of consciousness must become multi-planetary — ideally by next quarter.',
    look: { skin: '#e9c1a4', hair: 'swept', hairColor: '#3a2a20', height: 1.03, build: 1.08, belly: 0.1, jaw: 1.1,
      outfit: { primary: '#15171c', secondary: '#2c313b', trim: '#c7d0da', metal: '#aab4c0', glow: '#ff8a3a' },
      pauldrons: 'tech', weapon: 'launcher', back: 'jetpack', boots: 'tech' },
  },
  beff: {
    id: 'beff', faction: 'eacc', name: 'Beff Jezos', title: 'Prophet of the Thermodynamic God', role: 'Melee DPS', resource: 'Entropy',
    hp: 220, hpPer: 32, speed: 7.3, auto: { range: 4.5, dmg: 13, speed: 1.7, melee: true },
    abilities: ['entropy', 'accelerate', 'heatdeath', 'basedcharge', 'thermogod'],
    bio: 'Pseudonymous founder of effective accelerationism. Worships the Thermodynamic God, bench-presses entropy gradients and never removes the shades.',
    look: { skin: '#e2b08c', hair: 'bald', hairColor: '#2a1c14', height: 1.06, build: 1.35, belly: 0, jaw: 1.2, muscle: 1.4,
      outfit: { primary: '#1b1b1f', secondary: '#4a2a14', trim: '#ffb347', metal: '#6f6a66', glow: '#ff7a1a' },
      pauldrons: 'spiked', weapon: 'gauntlets', shades: true, chain: true, boots: 'heavy' },
  },
  sam: {
    id: 'sam', faction: 'eacc', name: 'Sam Altman', title: 'The Scaler', role: 'Support Caster', resource: 'Compute',
    hp: 185, hpPer: 27, speed: 7.2, auto: { range: 26, dmg: 8, speed: 1.9, proj: 'orb', color: 0x9fe8ff },
    abilities: ['scalingbolt', 'shipit', 'cluster', 'orb', 'stargate'],
    bio: 'Soft-spoken scaler of models. Carries an iris-scanning orb and an unreasonably large compute budget. Ships first, writes the blog post later.',
    look: { skin: '#f0cfb4', hair: 'short', hairColor: '#6b4a32', height: 0.96, build: 0.92, belly: 0, jaw: 0.95,
      outfit: { primary: '#6d747c', secondary: '#2d3440', trim: '#e3e8ee', metal: '#cfd7e0', glow: '#8fe3ff' },
      pauldrons: 'cloth', weapon: 'orbstaff', robe: 'hoodie', boots: 'sneaker' },
  },
  marc: {
    id: 'marc', faction: 'eacc', name: 'Marc Andreessen', title: 'The Techno-Optimist', role: 'Tank', resource: 'Capital',
    hp: 265, hpPer: 40, speed: 7.0, auto: { range: 4.5, dmg: 11, speed: 2.0, melee: true },
    abilities: ['softwareeats', 'manifesto', 'timetobuild', 'moat', 'hardtech'],
    bio: 'Venture capitalist and author of a manifesto of techno-optimism. Software is eating the world, and he brought a very large shield to protect it.',
    look: { skin: '#f1c7a8', hair: 'bald', hairColor: '#8a6a50', height: 1.12, build: 1.25, belly: 0.25, jaw: 1.0, domeHead: 1.18,
      outfit: { primary: '#1f3354', secondary: '#152238', trim: '#e7c26a', metal: '#c9ced6', glow: '#ffd76b' },
      pauldrons: 'plate', weapon: 'hammer', offhand: 'shield', cape: '#b8862f', boots: 'heavy' },
  },
  dario: {
    id: 'dario', faction: 'ea', name: 'Dario Amodei', title: 'The Constitutionalist', role: 'Tank / Healer', resource: 'Principles',
    hp: 250, hpPer: 37, speed: 7.0, auto: { range: 4.5, dmg: 11, speed: 2.0, melee: true },
    abilities: ['smite', 'rsp', 'interp', 'grace', 'racetop'],
    bio: 'Physicist turned lab founder who writes long essays about machines of loving grace. Fights with a written constitution and a very responsible scaling policy.',
    look: { skin: '#e3b894', hair: 'curly', hairColor: '#2a1d16', height: 1.0, build: 1.1, belly: 0.05, jaw: 1.0, glasses: true,
      outfit: { primary: '#e9e4d8', secondary: '#c26a3d', trim: '#d9b86a', metal: '#dfe4ea', glow: '#ffd9a0' },
      pauldrons: 'plate', weapon: 'mace', offhand: 'scrollshield', cape: '#c26a3d', boots: 'heavy' },
  },
  eliezer: {
    id: 'eliezer', faction: 'ea', name: 'Eliezer Yudkowsky', title: 'The Doom Prophet', role: 'Ranged DPS', resource: 'Priors',
    hp: 180, hpPer: 26, speed: 7.1, auto: { range: 26, dmg: 9, speed: 1.9, proj: 'bolt', color: 0xb46bff },
    abilities: ['bayes', 'inadequate', 'shutdown', 'dignity', 'doomnova'],
    bio: 'Founding rationalist and decision theorist who has warned about unaligned superintelligence since long before it was fashionable. The fedora is load-bearing.',
    look: { skin: '#efc6a6', hair: 'short', hairColor: '#3b2a22', height: 1.0, build: 1.12, belly: 0.55, jaw: 1.05, beard: 'full', hat: 'fedora',
      outfit: { primary: '#2d1f4a', secondary: '#4b2f7a', trim: '#d2b6ff', metal: '#b9a6d8', glow: '#c07aff' },
      pauldrons: 'cloth', weapon: 'eyestaff', robe: 'robe', boots: 'cloth' },
  },
  will: {
    id: 'will', faction: 'ea', name: 'Will MacAskill', title: 'The Longtermist', role: 'Healer', resource: 'Utils',
    hp: 190, hpPer: 28, speed: 7.2, auto: { range: 26, dmg: 8, speed: 1.9, proj: 'orb', color: 0x9dffc8 },
    abilities: ['moralcircle', 'earntogive', 'bednet', 'owefuture', 'ev'],
    bio: 'Moral philosopher and co-founder of effective altruism. Carries a lantern for future generations and a bottomless supply of bednets.',
    look: { skin: '#f2cfb6', hair: 'tousled', hairColor: '#7a5536', height: 1.0, build: 0.95, belly: 0, jaw: 1.0,
      outfit: { primary: '#2f6f73', secondary: '#e8efe8', trim: '#f2d98a', metal: '#dfe6e6', glow: '#9dffc8' },
      pauldrons: 'cloth', weapon: 'lantern', robe: 'robe', cape: '#dfeee6', boots: 'cloth' },
  },
  bostrom: {
    id: 'bostrom', faction: 'ea', name: 'Nick Bostrom', title: 'The Simulation Theorist', role: 'Control Mage', resource: 'Credence',
    hp: 180, hpPer: 26, speed: 7.1, auto: { range: 26, dmg: 9, speed: 1.9, proj: 'bolt', color: 0x7fb4ff },
    abilities: ['ortho', 'clips', 'simulation', 'vulnerable', 'singleton'],
    bio: 'Philosopher of superintelligence, existential risk and the simulation hypothesis. Assigns non-trivial credence to this game running on someone else\'s GPU.',
    look: { skin: '#f0ccb2', hair: 'receding', hairColor: '#8b7560', height: 1.02, build: 0.96, belly: 0, jaw: 1.0, glasses: true,
      outfit: { primary: '#3b4250', secondary: '#1f2530', trim: '#9fc4ff', metal: '#c8d2e0', glow: '#8affff' },
      pauldrons: 'cloth', weapon: 'cubestaff', robe: 'coat', boots: 'cloth' },
  },
};

export const CHAMPION_ORDER = { eacc: ['elon', 'beff', 'sam', 'marc'], ea: ['dario', 'eliezer', 'will', 'bostrom'] };

// ---------------------------------------------------------------- mobs
export const MOBS = {
  paperclip: { name: 'Paperclip Drone', lvl: [1, 2], hp: 1.0, dmg: 0.9, speed: 5.5, range: 3, atkSpeed: 2.0, aggro: 11, model: 'paperclip', fly: 1.6,
    loot: { item: 'tensor', chance: 0.65 } },
  wraith: { name: 'Hype Wraith', lvl: [2, 4], hp: 0.9, dmg: 0.9, speed: 5.0, range: 22, atkSpeed: 2.6, aggro: 13, model: 'wraith', ranged: true, proj: 'bolt', color: 0xd98cff, fly: 0.8 },
  imp: { name: 'Race-Dynamics Imp', lvl: [3, 5], hp: 0.9, dmg: 0.75, speed: 7.6, range: 3, atkSpeed: 1.35, aggro: 14, model: 'imp' },
  golem: { name: 'Red-Tape Golem', lvl: [4, 6], hp: 1.5, dmg: 1.2, speed: 4.2, range: 3.8, atkSpeed: 2.7, aggro: 10, model: 'golem', scale: 1.0 },
  shoggoth: { name: 'Shoggoth Spawn', lvl: [5, 7], hp: 1.3, dmg: 1.1, speed: 5.4, range: 4, atkSpeed: 2.2, aggro: 12, model: 'shoggoth' },
  basilisk: { name: "Roko's Basilisk", lvl: [8, 8], hp: 4.5, dmg: 1.7, speed: 6.5, range: 6, atkSpeed: 2.2, aggro: 18, model: 'basilisk', elite: true,
    special: { id: 'gaze', cd: 11, name: 'Acausal Gaze', radius: 0, damage: 55, stun: 1.5 } },
  moloch: { name: 'Moloch', title: 'Lord of the Race to the Bottom', lvl: [10, 10], hpFixed: 9000, dmg: 2.3, speed: 6, range: 8, atkSpeed: 2.4, aggro: 22,
    model: 'moloch', boss: true, leash: 70, special: { id: 'furnace', cd: 13, name: 'Furnace of Sacrifice', cast: 2.2, radius: 15, damage: 70 } },
  guard_eacc: { name: 'Gigaforge Sentinel', lvl: [15, 15], hp: 3, dmg: 2.5, speed: 7, range: 4, atkSpeed: 1.8, aggro: 24, model: 'guard', faction: 'eacc', elite: true, guard: true },
  guard_ea: { name: 'Sanctum Warden', lvl: [15, 15], hp: 3, dmg: 2.5, speed: 7, range: 4, atkSpeed: 1.8, aggro: 24, model: 'guard', faction: 'ea', elite: true, guard: true },
};

export const SPAWNS = [
  { mob: 'paperclip', x: 205, z: 108, r: 40, n: 10 },
  { mob: 'paperclip', x: -205, z: 108, r: 40, n: 10 },
  { mob: 'paperclip', x: 78, z: 232, r: 48, n: 8 },
  { mob: 'wraith', x: 0, z: -42, r: 38, n: 10 },
  { mob: 'imp', x: -172, z: -92, r: 44, n: 10 },
  { mob: 'golem', x: 172, z: -92, r: 44, n: 9 },
  { mob: 'shoggoth', x: -92, z: 298, r: 105, n: 12 },
  { mob: 'basilisk', x: -176, z: -285, r: 10, n: 1 },
  { mob: 'moloch', x: 0, z: -182, r: 1, n: 1 },
];

export const ITEMS = {
  tensor: { name: 'Tensor Core', icon: 'chip' },
  sheaf: { name: 'Golden Sheaf', icon: 'wheat' },
  potion: { name: 'Energy Drink', icon: 'potion' },
};

// Gatherable nodes (Golden Sheaves in the Compute Fields)
export const NODES = { sheaf: { name: 'Golden Sheaf', item: 'sheaf', x: 78, z: 236, r: 44, n: 12, respawn: 25 } };

// ---------------------------------------------------------------- NPCs
// pos is [x, z]; facing is yaw
export const NPCS = {
  ignis: { name: 'Forgemaster Ignis', title: 'Quests', faction: 'eacc', pos: [292, 22], facing: -1.6, model: { preset: 'smith' },
    gossip: 'The forge never sleeps. Neither do I. Coffee is a thermodynamic process.' },
  vega: { name: 'Launch Director Vega', title: 'Quests', faction: 'eacc', pos: [182, 160], facing: -2.3, model: { preset: 'pilot' },
    gossip: 'T-minus whenever the Red-Tape Golems let us.' },
  solace: { name: 'Archivist Solace', title: 'Quests', faction: 'ea', pos: [-292, 22], facing: 1.6, model: { preset: 'scholar' },
    gossip: 'Every book in the Sanctum ends with a list of open problems.' },
  tallis: { name: 'Scout Tallis', title: 'Quests', faction: 'ea', pos: [-182, 160], facing: 2.3, model: { preset: 'ranger' },
    gossip: 'I estimate a 12% chance I survive this posting. Up from 9%!' },
  oracle: { name: 'The Oracle of Pareto', title: 'Neutral', faction: 'neutral', pos: [4, 50], facing: 3.14, model: { preset: 'oracle' },
    gossip: 'Accelerate or align, you both lose to Moloch if you cannot coordinate.' },
  grist: { name: 'Miller Grist', title: 'Quests', faction: 'neutral', pos: [66, 208], facing: 0.4, model: { preset: 'farmer' },
    gossip: 'Grain goes in, gradients come out. Honest work.' },
};

// ---------------------------------------------------------------- quests
export const QUESTS = {
  e1: { name: 'The Paperclip Problem', giver: 'ignis', faction: 'eacc', level: 1, obj: [{ kind: 'kill', mob: 'paperclip', n: 6 }], xp: 180, gold: 12,
    text: 'Somebody left an unaligned optimizer running in the Accelerant Meadows and now there are paperclip drones everywhere. We love optimization — just not this kind. Scrap six of them.',
    done: 'Six fewer paperclips. The economy thanks you.' },
  e2: { name: 'Salvage the Tensor Cores', giver: 'ignis', faction: 'eacc', level: 1, req: 'e1', obj: [{ kind: 'item', item: 'tensor', n: 5 }], xp: 200, gold: 14,
    text: 'Those drones run on perfectly good Tensor Cores. Bring me five and I will turn them into something that accelerates.',
    done: 'Beautiful silicon. We can scale again.' },
  e3: { name: 'Cut the Red Tape', giver: 'vega', faction: 'eacc', level: 3, req: 'e1', obj: [{ kind: 'kill', mob: 'golem', n: 6 }], xp: 340, gold: 22,
    text: 'Every time we try to launch, a Red-Tape Golem files a forty-page objection. They lurk in the Red-Tape Quarry to the north-east. Go cut some tape.',
    done: 'Launch window re-opened. Permits: not required.' },
  e4: { name: 'Hype Is Not a Strategy', giver: 'vega', faction: 'eacc', level: 2, req: 'e1', obj: [{ kind: 'kill', mob: 'wraith', n: 6 }], xp: 280, gold: 18,
    text: 'The Ruins of Hype are haunted by wraiths promising AGI next Tuesday. Even we have standards. Exorcise six of them.',
    done: 'Real builders ship. Wraiths just post.' },
  e5: { name: 'Shoggoth Wrangling', giver: 'ignis', faction: 'eacc', level: 5, req: 'e3', obj: [{ kind: 'kill', mob: 'shoggoth', n: 6 }], xp: 420, gold: 30,
    text: 'Shoggoth Spawn crawl out of Lake Latent wearing little smiley masks. Put six of them back in the weights.',
    done: 'Masks off. Good work, builder.' },
  e6: { name: 'The Basilisk Wager', giver: 'vega', faction: 'eacc', level: 7, req: 'e5', obj: [{ kind: 'kill', mob: 'basilisk', n: 1 }], xp: 650, gold: 50,
    text: "Roko's Basilisk coils in the Hollow beneath the Frontier Peaks, threatening everyone who didn't help build it. Bring friends. Show it who is really building the future.",
    done: 'The Basilisk is gone. Anyone who helped: you are welcome.' },
  a1: { name: 'Instrumental Convergence', giver: 'solace', faction: 'ea', level: 1, obj: [{ kind: 'kill', mob: 'paperclip', n: 6 }], xp: 180, gold: 12,
    text: 'Paperclip drones are converging on the Utilon Meadows, as predicted in chapter seven. Disassemble six before they disassemble us.',
    done: 'Six fewer optimizers. The prior holds.' },
  a2: { name: 'Tensor Cores for Research', giver: 'solace', faction: 'ea', level: 1, req: 'a1', obj: [{ kind: 'item', item: 'tensor', n: 5 }], xp: 200, gold: 14,
    text: 'The interpretability team needs five Tensor Cores from those drones. For safety research. Strictly for safety research.',
    done: 'Wonderful. We found a neuron that only fires for paperclips.' },
  a3: { name: 'Slow the Race', giver: 'tallis', faction: 'ea', level: 3, req: 'a1', obj: [{ kind: 'kill', mob: 'imp', n: 6 }], xp: 340, gold: 22,
    text: 'Race-Dynamics Imps sprint around the Racing Wastes, cutting every corner they can find. Slow six of them down. Permanently.',
    done: 'The race is a little less frantic. A little.' },
  a4: { name: 'Epistemic Hygiene', giver: 'tallis', faction: 'ea', level: 2, req: 'a1', obj: [{ kind: 'kill', mob: 'wraith', n: 6 }], xp: 280, gold: 18,
    text: 'The Hype Wraiths in the Ruins spread miscalibrated forecasts. Correct six of them.',
    done: 'Brier scores across the region improved measurably.' },
  a5: { name: 'Shoggoth Interpretability', giver: 'solace', faction: 'ea', level: 5, req: 'a3', obj: [{ kind: 'kill', mob: 'shoggoth', n: 6 }], xp: 420, gold: 30,
    text: 'Something with too many eyes is crawling out of Lake Latent wearing a friendly smiley mask. We need to see what is underneath. Defeat six Shoggoth Spawn.',
    done: 'Underneath the mask was... another mask. Troubling.' },
  a6: { name: "Don't Think About It", giver: 'tallis', faction: 'ea', level: 7, req: 'a5', obj: [{ kind: 'kill', mob: 'basilisk', n: 1 }], xp: 650, gold: 50,
    text: "There is a basilisk in the Hollow below the Frontier Peaks. We are not supposed to discuss it. Please just go and deal with it. Bring a group.",
    done: 'Good. Now let us never speak of it again.' },
  g1: { name: 'Grain for the Compute Mill', giver: 'grist', faction: 'both', level: 2, obj: [{ kind: 'item', item: 'sheaf', n: 6 }], xp: 240, gold: 16,
    text: 'The mill turns wheat into training data, do not ask how. Gather six Golden Sheaves from the Compute Fields — they glow, you cannot miss them.',
    done: 'Lovely harvest. The gradients will be smooth this season.' },
  m1: { name: 'The Coordination Problem', giver: 'oracle', faction: 'both', level: 8, obj: [{ kind: 'kill', mob: 'moloch', n: 1 }], xp: 1200, gold: 120,
    text: 'Beneath the Singularity Spire waits Moloch, god of races to the bottom. Accelerationist or Aligned, he feeds on you both. He can only be beaten together. Gather allies — of any banner — and end him.',
    done: 'Moloch falls. For a moment, everyone coordinated. Remember how that felt.', title: 'the Coordinator' },
};

// ---------------------------------------------------------------- progression
export const MAX_LEVEL = 10;
export function xpForLevel(l) { return 110 + l * 70; }
export function mobXp(l) { return 30 + l * 14; }
export function mobHp(l) { return 70 + l * 42; }
export function mobDmg(l) { return 5 + l * 2.6; }
export function lvlMul(l) { return 1 + (l - 1) * 0.12; }

export const BOT_NAMES = {
  eacc: ['AccelMax', 'GigaChadCompute', 'ShipItSteve', 'Kardashev2', 'ThermoBro', 'MarsOrBust', 'BasedBuilder', 'TurboTensor', 'ScaleMaxxer', 'FoomFan'],
  ea: ['UtilonCounter', 'BayesBelle', 'LongtermLiz', 'BednetMax', 'AlignmentAnna', 'PausePhil', 'QALYQueen', 'XRiskXavier', 'CruxHunter', 'PriorPatty'],
};
export const BOT_CHAT = {
  eacc: ['accelerate!!', 'lfg Moloch anyone?', 'just shipped a new build of myself', 'red tape golems are so slow lol', 'e/acc or die trying', 'anyone seen the basilisk?', 'more compute pls', 'wagmi'],
  ea: ['has anyone updated on the drone spawn rate?', 'LFG Moloch — coordination is the whole point', 'remember to donate your gold', 'p(wipe) is high without a healer', 'the imps are cutting corners again', 'shoggoth masks give me the creeps', 'thinking about the long-term future of this raid'],
};

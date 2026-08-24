'use strict';

/* =====================================================================
   Orchard & Cellar
   A three-stage chain: trees make FRUIT, presses turn fruit into MUST,
   the cellar ages must into BOTTLES. Each stage can bottleneck the next,
   which is where the decisions live.
   ===================================================================== */

const SAVE_KEY = 'orchard-and-cellar-save';
const TICK_MS = 100;

// ---------------------------------------------------------------- numbers
const UNITS = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
               'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
               'Vg', 'UVg', 'DVg', 'TVg'];

function fmt(n, places) {
  if (n === Infinity) return '∞';
  if (!isFinite(n) || isNaN(n)) return '0';
  if (n < 0) return '-' + fmt(-n, places);
  const notation = (typeof S !== 'undefined' && S.settings && S.settings.notation) || 'short';
  if (notation !== 'short' && n >= 1000) {
    if (notation === 'scientific') {
      const exp = Math.floor(Math.log10(n));
      return (n / Math.pow(10, exp)).toFixed(2) + 'e' + exp;
    }
    if (notation === 'engineering') {
      const exp = Math.floor(Math.log10(n) / 3) * 3;
      return (n / Math.pow(10, exp)).toFixed(2) + 'e' + exp;
    }
  }
  if (n < 1000) {
    if (n === 0) return '0';
    if (n < 0.01) return n.toExponential(1);
    if (n < 10) return n.toFixed(places === undefined ? (n < 1 ? 2 : 1) : places);
    return Math.floor(n).toString();
  }
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= UNITS.length) return n.toExponential(2);
  const scaled = n / Math.pow(1000, tier);
  return (scaled < 10 ? scaled.toFixed(2) : scaled < 100 ? scaled.toFixed(1)
          : Math.floor(scaled)) + UNITS[tier];
}

function fmtTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return Math.ceil(seconds) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
  return Math.floor(seconds / 86400) + 'd ' + Math.floor((seconds % 86400) / 3600) + 'h';
}

// ---------------------------------------------------------------- content
// Trees: produce fruit. Costs climb 1.175x per purchase - steeper than the 1.15
// the genre usually uses, because at 1.15 a run detonates and swallows the whole
// skill tree in one sitting. The single number lives in costOf(); see also
// maxAffordable(), which must use the same one.
const TREES = [
  { id: 'seedling', name: 'Seedling',        glyph: '🌱', base: 15,     rate: 0.1,
    desc: 'A whip in a tree guard. Everything starts here.' },
  { id: 'apple',    name: 'Apple tree',      glyph: '🍎', base: 165,    rate: 0.85,
    desc: 'Reliable, generous, forgiving of neglect.', trait: { lifts: 0.006 } },
  { id: 'pear',     name: 'Pear tree',       glyph: '🍐', base: 1800,  rate: 7.2,
    desc: 'Ripens in a window measured in hours.', trait: { season: 'Autumn' } },
  { id: 'quince',   name: 'Quince',          glyph: '🟡', base: 20000,   rate: 61,
    desc: 'Inedible raw, magnificent cooked.', trait: { feeds: 'press', per10: 0.02 } },
  { id: 'plum',     name: 'Plum thicket',    glyph: '🟣', base: 218000,  rate: 520,
    desc: 'Suckers everywhere. You stopped fighting it.', trait: { lifts: 0.005 } },
  { id: 'fig',      name: 'Fig',             glyph: '🫐', base: 2.4e+06,  rate: 4400,
    desc: 'Wants its roots confined and its head in the sun.', trait: { season: 'Summer' } },
  { id: 'cherry',   name: 'Cherry avenue',   glyph: '🍒', base: 2.6e+07,   rate: 37000,
    desc: 'Two weeks of glory, a year of waiting.', trait: { season: 'Summer' } },
  { id: 'heritage', name: 'Heritage grove',  glyph: '🌳', base: 2.9e+08,    rate: 320000,
    desc: 'Varieties nobody else still grows.', trait: { lifts: 0.004 } },
  { id: 'walled',   name: 'Walled garden',   glyph: '🧱', base: 3.2e+09,   rate: 2.7e+06,
    desc: 'Brick holds the day\'s heat well past dusk.', trait: { feeds: 'cellar', per10: 0.02 } },
  { id: 'estate',   name: 'Estate orchard',  glyph: '🏞️', base: 3.5e+10,  rate: 2.3e+07,
    desc: 'Rows to the horizon in every direction.', trait: { season: 'Autumn' } },
  { id: 'valley',   name: 'The whole valley', glyph: '🏔️', base: 3.85e+11, rate: 1.95e+08,
    desc: 'Every south-facing slope, planted.', trait: { feeds: 'press', per10: 0.03 } },
  { id: 'island',   name: 'Island orchards',  glyph: '🏝️', base: 4.2e+12,  rate: 1.7e+09,
    desc: 'Shipped by the boatload, twice a week.', trait: { lifts: 0.003 } },
  { id: 'canopy',   name: 'Continental canopy', glyph: '🌍', base: 4.6e+13, rate: 1.4e+10,
    desc: 'Visible from orbit, if anyone were looking.', trait: { season: 'Winter' } },
  { id: 'terrace',   name: 'Terraced slopes',       glyph: '⛰️', base: 5.75e+14,  rate: 1.19e+11,
    desc: 'Cut into the hill by people long gone.', trait: { lifts: 0.003 } },
  { id: 'rivermouth', name: 'River mouth',           glyph: '🏞️', base: 7.19e+15,  rate: 1.01e+12,
    desc: 'Silt, sun and a hundred years of luck.', trait: { feeds: 'cellar', per10: 0.02 } },
  { id: 'province',  name: 'The province',          glyph: '🗺️', base: 8.98e+16,  rate: 8.6e+12,
    desc: 'The name on the map is the name of your orchard.', trait: { season: 'Autumn' } },
  { id: 'shelfsea',  name: 'Shelf-sea groves',      glyph: '🌊', base: 1.12e+18,  rate: 7.31e+13,
    desc: 'Planted on ground the sea gave back.', trait: { feeds: 'press', per10: 0.02 } },
  { id: 'cloudfor',  name: 'Cloud forest',          glyph: '☁️', base: 1.4e+19,  rate: 6.21e+14,
    desc: 'Fruit that ripens in permanent mist.', trait: { season: 'Winter' } },
  { id: 'tundra',    name: 'Tundra belt',           glyph: '🧊', base: 1.75e+20,  rate: 5.28e+15,
    desc: 'Nothing should grow here. It does.', trait: { season: 'Winter' } },
  { id: 'rift',      name: 'The rift',              glyph: '🌋', base: 2.19e+21,  rate: 4.49e+16,
    desc: 'Warm ground, deep soil, and no neighbours.', trait: { lifts: 0.003 } },
  { id: 'worldrow',  name: 'World row',             glyph: '🌐', base: 2.74e+22,  rate: 3.81e+17,
    desc: 'One row, and it goes round.', trait: { season: 'Summer' } },
  { id: 'medlar',   name: 'Medlar',          glyph: '🟤', base: 3.43e+23,  rate: 6.92e+18,
    desc: 'Eaten only once it has gone soft. Worth the wait.', needsUnlock: 'medlar', trait: { feeds: 'cellar', per10: 0.03 } },
];

// Presses: convert fruit into must. Throughput is capped by fruit on hand,
// so overbuilding presses without trees does nothing - deliberately.
const PRESSES = [
  { id: 'basket',  name: 'Basket press',   glyph: '🧺', base: 150,    rate: 0.6,
    desc: 'Slats, a screw and a lot of patience.' },
  { id: 'screw',   name: 'Screw press',    glyph: '🔩', base: 3300,   rate: 5,
    desc: 'Cast iron. Older than the house.' },
  { id: 'hydro',   name: 'Hydraulic press',glyph: '⚙️', base: 36000,  rate: 43,
    desc: 'Squeezes the last of it out of the pomace.' },
  { id: 'belt',    name: 'Belt press',     glyph: '🎞️', base: 400000,   rate: 370,
    desc: 'Runs all day without being watched.' },
  { id: 'cont',    name: 'Continuous line',glyph: '🏭', base: 4.4e+06,  rate: 3100,
    desc: 'Fruit in one end, must out the other.' },
  { id: 'mill',    name: 'Mill complex',   glyph: '🏗️', base: 4.8e+07,  rate: 26000,
    desc: 'A building whose only job is squeezing.' },
  { id: 'works',   name: 'Pressing works', glyph: '⚙️', base: 5.3e+08,  rate: 225000,
    desc: 'Runs three shifts and never stops.' },
  { id: 'refine',  name: 'Juice refinery', glyph: '🧬', base: 5.8e+09,  rate: 1.9e+06,
    desc: 'More chemistry than orchard, now.' },
  { id: 'cascade',  name: 'Cascade house',         glyph: '🌊', base: 7.25e+10,  rate: 1.62e+07,
    desc: 'Six floors of it, each one feeding the next.' },
  { id: 'district', name: 'District works',        glyph: '🏙️', base: 9.06e+11,  rate: 1.37e+08,
    desc: 'The town smells of apples for half the year.' },
  { id: 'seaboard', name: 'Seaboard plant',        glyph: '⚓', base: 1.13e+13,  rate: 1.17e+09,
    desc: 'Barges in, tankers out, tide after tide.' },
  { id: 'arcology', name: 'Pressing arcology',     glyph: '🌆', base: 1.42e+14,  rate: 9.92e+09,
    desc: 'People live in the upper floors. Most of them work here.' },
  { id: 'orbital',  name: 'Orbital mill',          glyph: '🛰️', base: 1.77e+15,  rate: 8.43e+10,
    desc: 'Spun for gravity, and for the pressing.' },
  { id: 'leviath',  name: 'The Leviathan',         glyph: '🐋', base: 2.21e+16,  rate: 7.17e+11,
    desc: 'Nobody has seen all of it at once.' },
  { id: 'estuary',   name: 'Estuary works',         glyph: '🛳️', base: 2.76e+17,  rate: 6.09e+12,
    desc: 'Tide in, must out, without pause.' },
  { id: 'cordillera', name: 'Cordillera line',       glyph: '🏔️', base: 3.45e+18,  rate: 5.18e+13,
    desc: 'Strung along the range, mill after mill.' },
  { id: 'basin',     name: 'The basin',             glyph: '🕳️', base: 4.32e+19,  rate: 4.4e+14,
    desc: 'A pit you could lose a town in.' },
  { id: 'trenchp',   name: 'Trench press',          glyph: '⚓', base: 5.4e+20,  rate: 3.74e+15,
    desc: 'Pressure it did not have to be given.' },
  { id: 'geo',       name: 'Geothermal works',      glyph: '♨️', base: 6.74e+21,  rate: 3.18e+16,
    desc: 'The ground does the heavy part.' },
  { id: 'lagrange',  name: 'Lagrange mill',         glyph: '🛸', base: 8.43e+22,  rate: 2.7e+17,
    desc: 'Parked where nothing has to be held up.' },
  { id: 'ring',      name: 'The ring',              glyph: '💍', base: 1.05e+24,  rate: 2.3e+18,
    desc: 'It closed on itself some years ago.' },
  { id: 'titan',     name: 'Titan works',           glyph: '🌑', base: 1.32e+25,  rate: 1.95e+19,
    desc: 'Named for the moon, not the size. Barely.' },
];

// Casks: age must into bottles. Slower than pressing, but bottles are what
// the vintage is scored on.
const CASKS = [
  { id: 'demijohn', name: 'Demijohn',      glyph: '🍶', base: 80,     rate: 0.25,
    desc: 'Glass, an airlock, and hope.' },
  { id: 'barrel',   name: 'Oak barrel',    glyph: '🛢️', base: 1650,    rate: 2.1,
    desc: 'Second-hand from a distillery. Still good.' },
  { id: 'foudre',   name: 'Foudre',        glyph: '🗄️', base: 18000,  rate: 18,
    desc: 'Big enough to stand inside. Don\'t.' },
  { id: 'vault',    name: 'Stone vault',   glyph: '🏛️', base: 200000,   rate: 152,
    desc: 'Twelve degrees, year round, no effort.' },
  { id: 'cathedral',name: 'Cellar cathedral', glyph: '⛪', base: 2.2e+06, rate: 1300,
    desc: 'Vaulted, cold, and quietly enormous.' },
  { id: 'catacomb', name: 'Catacombs',     glyph: '🕯️', base: 2.4e+07,  rate: 11000,
    desc: 'Miles of it, mapped only in the cellar book.' },
  { id: 'glacier',  name: 'Glacier store', glyph: '🏔️', base: 2.65e+08, rate: 94000,
    desc: 'Ice does the work you used to pay for.' },
  { id: 'deeprock', name: 'Deep rock vault',glyph: '⛰️', base: 2.9e+09,  rate: 800000,
    desc: 'A kilometre down, at a constant nine degrees.' },
  { id: 'aquifer',  name: 'Aquifer cellar',        glyph: '💧', base: 3.62e+10,  rate: 6.8e+06,
    desc: 'The water table keeps it colder than any machine.' },
  { id: 'saltdome', name: 'Salt dome',             glyph: '🧂', base: 4.53e+11,  rate: 5.78e+07,
    desc: 'Dry, still, and older than the orchard by a long way.' },
  { id: 'trench',   name: 'Trench store',          glyph: '🌑', base: 5.66e+12,  rate: 4.91e+08,
    desc: 'Four degrees, four kilometres down, no light at all.' },
  { id: 'permaf',   name: 'Permafrost field',      glyph: '❄️', base: 7.08e+13,  rate: 4.18e+09,
    desc: 'Laid out across ground that has not thawed in an age.' },
  { id: 'mantle',   name: 'Mantle reserve',        glyph: '🌋', base: 8.85e+14,  rate: 3.55e+10,
    desc: 'Heat above, cold below, and a very long lease.' },
  { id: 'longnow',  name: 'The Long Now',          glyph: '🕰️', base: 1.11e+16,  rate: 3.02e+11,
    desc: 'Casks laid down for people not yet born.' },
  { id: 'abyssal',   name: 'Abyssal store',         glyph: '🌌', base: 1.39e+17,  rate: 2.57e+12,
    desc: 'Cold, black, and utterly still.' },
  { id: 'icecap',    name: 'Ice cap reserve',       glyph: '🏔️', base: 1.73e+18,  rate: 2.18e+13,
    desc: 'Laid into ice older than agriculture.' },
  { id: 'basalt',    name: 'Basalt vault',          glyph: '🪨', base: 2.17e+19,  rate: 1.85e+14,
    desc: 'Cut where the rock cooled slowest.' },
  { id: 'cryo',      name: 'Cryogenic cellar',      glyph: '❄️', base: 2.71e+20,  rate: 1.58e+15,
    desc: 'Colder than the cellar book allows for.' },
  { id: 'mantlec',   name: 'Deep mantle',           glyph: '🔥', base: 3.39e+21,  rate: 1.34e+16,
    desc: 'Heat above, patience below.' },
  { id: 'orbitalc',  name: 'Orbital reserve',       glyph: '🛰️', base: 4.23e+22,  rate: 1.14e+17,
    desc: 'Ageing without gravity, and without hurry.' },
  { id: 'centuryc',  name: 'Century vault',         glyph: '🕯️', base: 5.29e+23,  rate: 9.68e+17,
    desc: 'Opened once every hundred years.' },
  { id: 'millennium', name: 'The Millennium',        glyph: '⏳', base: 6.62e+24,  rate: 8.23e+18,
    desc: 'Nobody alive will taste it.' },
];

const SEASONS = [
  { name: 'Spring', effect: 'Trees produce +60%',   colour: '#8FBF6A', key: 'tree' },
  { name: 'Summer', effect: 'Presses run +60%',     colour: '#E0B03C', key: 'press' },
  { name: 'Autumn', effect: 'Harvest: tending x4',  colour: '#C97A3D', key: 'harvest' },
  { name: 'Winter', effect: 'Cellar ages +60%',     colour: '#7FA6C9', key: 'cellar' },
];

/* ---------------------------------------------------------------- skill tree
   Four branches of fourteen, plus cross-branch capstones that need points in
   two branches. Branches keep every point a real choice; a fully open web
   drifts towards "take everything eventually", which is no choice at all.
   x/y are laid out on a grid and drawn as an SVG the player can pan.        */

const BRANCHES = {
  grove:  { name: 'The Grove',  colour: '#8FBF6A', root: [0, 0] },
  press:  { name: 'The Press',  colour: '#E0B03C', root: [0, 0] },
  cellar: { name: 'The Cellar', colour: '#7FA6C9', root: [0, 0] },
  estate: { name: 'The Estate', colour: '#C08BD9', root: [0, 0] },
};

// effect kinds are read by the recalc pass; keeping them declarative means a
// node can never quietly do something the tooltip doesn't mention.
const TREE = [
  // ---- GROVE: fruit production -----------------------------------------
  { id:'g1', b:'grove', name:'Mulching',      x:-2, y:-1, cost:1,  ranks:10,
    eff:{ treeMult:0.10 }, glyph:'🍂', needs:[] },
  { id:'g2', b:'grove', name:'Grafting',      x:-3, y:-2, cost:2,  ranks:10,
    eff:{ treeMult:0.14 }, glyph:'🌿', needs:['g1'] },
  { id:'g3', b:'grove', name:'Deep roots',    x:-1.2, y:-2.3, cost:2, ranks:6,
    eff:{ offlineRate:0.10 }, glyph:'🪱', needs:['g1'] },
  { id:'g4', b:'grove', name:'Pollinators',   x:-4, y:-3, cost:6,  ranks:10,
    eff:{ treeMult:0.20 }, glyph:'🐝', needs:['g2'] },
  { id:'g5', b:'grove', name:'Windbreak',     x:-2.4, y:-3.6, cost:7, ranks:6,
    eff:{ seasonSoften:0.15 }, glyph:'🌬️', needs:['g2','g3'] },
  { id:'g6', b:'grove', name:'Old wood',      x:-5.2, y:-4.2, cost:13, ranks:10,
    eff:{ treeMult:0.25 }, glyph:'🪵', needs:['g4'] },
  { id:'g7', b:'grove', name:'Understorey',   x:-3.6, y:-5, cost:18, ranks:8,
    eff:{ cheapTrees:0.04 }, glyph:'🌾', needs:['g4','g5'] },
  { id:'g8', b:'grove', name:'Espalier',      x:-6.4, y:-5.4, cost:32, ranks:10,
    eff:{ treeMult:0.32 }, glyph:'🪜', needs:['g6'] },
  { id:'g9', b:'grove', name:'Seed bank',     x:-4.8, y:-6.4, cost:48, ranks:6,
    eff:{ startTrees:5 }, glyph:'🫙', needs:['g7'] },
  { id:'g10', b:'grove', name:'Terracing',    x:-7.4, y:-6.8, cost:82, ranks:10,
    eff:{ treeMult:0.40 }, glyph:'⛰️', needs:['g8'] },
  { id:'g11', b:'grove', name:'Coppice',      x:-6, y:-7.8, cost:117, ranks:8,
    eff:{ treeSynergy:0.004 }, glyph:'🪓', needs:['g9','g8'] },
  { id:'g12', b:'grove', name:'Ancient stock',x:-8.4, y:-8.2, cost:202, ranks:10,
    eff:{ treeMult:0.55 }, glyph:'🌲', needs:['g10'] },
  { id:'g13', b:'grove', name:'Living hedge',  x:-7, y:-9.4, cost:297, ranks:6,
    eff:{ seasonBoost:0.20 }, glyph:'🌵', needs:['g11'] },
  { id:'g14', b:'grove', name:'The Great Tree',x:-9.4, y:-10, cost:659, ranks:1,
    eff:{ treeMult:3.00 }, glyph:'🌳', needs:['g12','g13'], big:true },

  // ---- PRESS: conversion and clicking ----------------------------------
  { id:'p1', b:'press', name:'Sharp blades',  x:2, y:-1, cost:1, ranks:10,
    eff:{ pressMult:0.10 }, glyph:'🔪', needs:[] },
  { id:'p2', b:'press', name:'Strong arms',   x:3, y:-2, cost:2, ranks:10,
    eff:{ clickMult:0.35 }, glyph:'💪', needs:['p1'] },
  { id:'p3', b:'press', name:'Fine mesh',     x:1.2, y:-2.3, cost:2, ranks:10,
    eff:{ pressMult:0.14 }, glyph:'🕸️', needs:['p1'] },
  { id:'p4', b:'press', name:'Second pressing',x:4, y:-3, cost:6, ranks:8,
    eff:{ pressYield:0.06, pressShare:0.04 }, glyph:'♻️', needs:['p2'] },
  { id:'p5', b:'press', name:'Rhythm',        x:2.4, y:-3.6, cost:7, ranks:10,
    eff:{ vigourRate:0.20 }, glyph:'🥁', needs:['p2','p3'] },
  { id:'p6', b:'press', name:'Steel frame',   x:5.2, y:-4.2, cost:13, ranks:10,
    eff:{ pressMult:0.25 }, glyph:'🔧', needs:['p4'] },
  { id:'p7', b:'press', name:'Windfalls',     x:3.6, y:-5, cost:18, ranks:8,
    eff:{ clickFromRate:0.02 }, glyph:'🍏', needs:['p4','p5'] },
  { id:'p8', b:'press', name:'Pomace mill',   x:6.4, y:-5.4, cost:32, ranks:10,
    eff:{ pressMult:0.32 }, glyph:'⚗️', needs:['p6'] },
  { id:'p9', b:'press', name:'Burst',         x:4.8, y:-6.4, cost:48, ranks:6,
    eff:{ vigourPower:0.60 }, glyph:'💥', needs:['p7'] },
  { id:'p10', b:'press', name:'Hydraulics',   x:7.4, y:-6.8, cost:82, ranks:10,
    eff:{ pressMult:0.40 }, glyph:'🛠️', needs:['p8'] },
  { id:'p11', b:'press', name:'Nothing wasted',x:6, y:-7.8, cost:117, ranks:8,
    eff:{ pressYield:0.10, pressShare:0.05 }, glyph:'🧃', needs:['p9','p8'] },
  { id:'p12', b:'press', name:'Cold pressing',x:8.4, y:-8.2, cost:202, ranks:10,
    eff:{ pressMult:0.55 }, glyph:'❄️', needs:['p10'] },
  { id:'p13', b:'press', name:'Momentum',     x:7, y:-9.4, cost:297, ranks:6,
    eff:{ vigourKeep:0.25 }, glyph:'🌀', needs:['p11'] },
  { id:'p14', b:'press', name:'The Great Press',x:9.4, y:-10, cost:659, ranks:1,
    eff:{ pressMult:3.00 }, glyph:'🏗️', needs:['p12','p13'], big:true },

  // ---- CELLAR: ageing and bottle value ---------------------------------
  { id:'c1', b:'cellar', name:'Airlocks',     x:-2, y:1, cost:1, ranks:10,
    eff:{ cellarMult:0.10 }, glyph:'🫧', needs:[] },
  { id:'c2', b:'cellar', name:'Cool store',   x:-3, y:2, cost:2, ranks:10,
    eff:{ cellarMult:0.14 }, glyph:'🧊', needs:['c1'] },
  { id:'c3', b:'cellar', name:'Wild yeast',   x:-1.2, y:2.3, cost:2, ranks:8,
    eff:{ bottleValue:0.08 }, glyph:'🦠', needs:['c1'] },
  { id:'c4', b:'cellar', name:'Racking',      x:-4, y:3, cost:6, ranks:10,
    eff:{ cellarMult:0.20 }, glyph:'🧴', needs:['c2'] },
  { id:'c5', b:'cellar', name:'Long ageing',  x:-2.4, y:3.6, cost:7, ranks:8,
    eff:{ bottleValue:0.12 }, glyph:'⏳', needs:['c2','c3'] },
  { id:'c6', b:'cellar', name:'Blending',     x:-5.2, y:4.2, cost:13, ranks:10,
    eff:{ cellarMult:0.25 }, glyph:'🥃', needs:['c4'] },
  { id:'c7', b:'cellar', name:'Cellar book',  x:-3.6, y:5, cost:18, ranks:8,
    eff:{ offlineCap:1.5 }, glyph:'📖', needs:['c4','c5'] },
  { id:'c8', b:'cellar', name:'Bottle shock', x:-6.4, y:5.4, cost:32, ranks:10,
    eff:{ cellarMult:0.32 }, glyph:'🍾', needs:['c6'] },
  { id:'c9', b:'cellar', name:'Reserve stock',x:-4.8, y:6.4, cost:48, ranks:6,
    eff:{ keepBottles:0.02 }, glyph:'🔒', needs:['c7'] },
  { id:'c10', b:'cellar', name:'Solera',      x:-7.4, y:6.8, cost:82, ranks:10,
    eff:{ cellarMult:0.40 }, glyph:'🪣', needs:['c8'] },
  { id:'c11', b:'cellar', name:'Vintage chart',x:-6, y:7.8, cost:117, ranks:8,
    eff:{ bottleValue:0.18 }, glyph:'📊', needs:['c9','c8'] },
  { id:'c12', b:'cellar', name:'Deep cellar', x:-8.4, y:8.2, cost:202, ranks:10,
    eff:{ cellarMult:0.55 }, glyph:'🕳️', needs:['c10'] },
  { id:'c13', b:'cellar', name:'Cork library',x:-7, y:9.4, cost:297, ranks:6,
    eff:{ offlineRate:0.15 }, glyph:'🗝️', needs:['c11'] },
  { id:'c14', b:'cellar', name:'The Great Vintage',x:-9.4, y:10, cost:659, ranks:1,
    eff:{ bottleValue:1.50 }, glyph:'🏆', needs:['c12','c13'], big:true },

  // ---- ESTATE: automation, offline, global -----------------------------
  { id:'e1', b:'estate', name:'Farmhand',     x:2, y:1, cost:1, ranks:10,
    eff:{ allMult:0.05 }, glyph:'🧑‍🌾', needs:[] },
  { id:'e2', b:'estate', name:'Ledger',       x:3, y:2, cost:2, ranks:8,
    eff:{ terroirGain:0.10 }, glyph:'📒', needs:['e1'] },
  // A switch, not a scale: sumEffect('autoBuy') > 0 is all that is ever read, so
  // ranks two to six were 74 terroir for nothing.
  { id:'e3', b:'estate', name:'Barrow',       x:1.2, y:2.3, cost:2, ranks:1,
    eff:{ autoBuy:1 }, glyph:'🛒', needs:['e1'] },
  { id:'e4', b:'estate', name:'Almanac',      x:4, y:3, cost:6, ranks:8,
    eff:{ seasonLength:-0.10 }, glyph:'🗓️', needs:['e2'] },
  { id:'e5', b:'estate', name:'Dry stone wall',x:2.4, y:3.6, cost:7, ranks:10,
    eff:{ allMult:0.07 }, glyph:'🪨', needs:['e2','e3'] },
  { id:'e6', b:'estate', name:'Cider house',  x:5.2, y:4.2, cost:13, ranks:8,
    eff:{ terroirGain:0.15 }, glyph:'🏠', needs:['e4'] },
  { id:'e7', b:'estate', name:'Night watch',  x:3.6, y:5, cost:18, ranks:8,
    eff:{ offlineRate:0.12 }, glyph:'🌙', needs:['e4','e5'] },
  { id:'e8', b:'estate', name:'Apprentices',  x:6.4, y:5.4, cost:32, ranks:10,
    eff:{ allMult:0.10 }, glyph:'👥', needs:['e6'] },
  { id:'e9', b:'estate', name:'Standing order',x:4.8, y:6.4, cost:48, ranks:6,
    eff:{ offlineCap:2 }, glyph:'📦', needs:['e7'] },
  { id:'e10', b:'estate', name:'Reputation',  x:7.4, y:6.8, cost:82, ranks:10,
    eff:{ terroirGain:0.20 }, glyph:'⭐', needs:['e8'] },
  { id:'e11', b:'estate', name:'Rootstock',    x:6, y:7.8, cost:117, ranks:8,
    eff:{ keepTree:0.05 }, glyph:'📜', needs:['e9','e8'] },
  { id:'e12', b:'estate', name:'Estate manager',x:8.4, y:8.2, cost:202, ranks:10,
    eff:{ allMult:0.14 }, glyph:'🎩', needs:['e10'] },
  { id:'e13', b:'estate', name:'Land trust',  x:7, y:9.4, cost:297, ranks:6,
    eff:{ terroirGain:0.30 }, glyph:'🏛️', needs:['e11'] },
  { id:'e14', b:'estate', name:'The Whole Estate',x:9.4, y:10, cost:659, ranks:1,
    eff:{ allMult:1.00 }, glyph:'👑', needs:['e12','e13'], big:true },

  // ---- CROSS-BRANCH CAPSTONES ------------------------------------------
  // Each needs points in two branches, so specialising has a real cost.
  { id:'x1', b:'cross', name:'Windfall cider', x:0, y:-6.5, cost:70, ranks:6,
    eff:{ treeMult:0.20, pressMult:0.20 }, glyph:'🍺',
    needs:['g4','p4'], needPoints:{ grove:8, press:8 } },
  { id:'x2', b:'cross', name:'Estate bottling',x:0, y:6.5, cost:70, ranks:6,
    eff:{ cellarMult:0.20, allMult:0.06 }, glyph:'🏷️',
    needs:['c4','e4'], needPoints:{ cellar:8, estate:8 } },
  { id:'x3', b:'cross', name:'Perry works',    x:-11, y:0, cost:167, ranks:6,
    eff:{ treeMult:0.30, cellarMult:0.30 }, glyph:'🍐',
    needs:['g8','c8'], needPoints:{ grove:25, cellar:25 } },
  { id:'x4', b:'cross', name:'Contract press', x:11, y:0, cost:167, ranks:6,
    eff:{ pressMult:0.30, terroirGain:0.15 }, glyph:'🤝',
    needs:['p8','e8'], needPoints:{ press:25, estate:25 } },
  { id:'x5', b:'cross', name:'The Long View',  x:0, y:0, cost:994, ranks:1,
    eff:{ allMult:1.50, terroirGain:0.50 }, glyph:'🧭',
    needs:['g12','p12','c12','e12'],
    needPoints:{ grove:40, press:40, cellar:40, estate:40 }, big:true },
];

const TREE_BY_ID = Object.fromEntries(TREE.map(n => [n.id, n]));


/* ---------------------------------------------------------------- upgrades
   The doublings. Without a steady stream of these a run grows only as fast as
   you can buy buildings, which is a crawl - these are what bend the curve and
   give you something to want every couple of minutes.                       */

const UPGRADES = [];

function addBuildingUpgrades(list, kind, mapKey) {
  const steps = [
    { at: 10,  costMult: 22,   mult: 2 },
    { at: 25,  costMult: 220,  mult: 2 },
    { at: 50,  costMult: 2600, mult: 2 },
    { at: 100, costMult: 32000, mult: 2 },
    // Owning 200 of a tier costs about 5.8e14 times its base, so a x200 upgrade
    // priced like the tiers below it would be free by the time you qualified.
    // This is roughly a tenth of the ground you had to buy to earn it.
    { at: 200, costMult: 5.0e13, mult: 3 },
  ];
  for (const item of list) {
    for (const step of steps) {
      UPGRADES.push({
        id: `u_${item.id}_${step.at}`,
        name: `${item.name} ×${step.mult}`,
        desc: `${item.name} produces twice as much. Needs ${step.at} of them.`,
        glyph: item.glyph,
        cost: item.base * step.costMult,
        currency: kind === 'cask' ? 'must' : 'fruit',
        need: (S) => (S[mapKey][item.id] || 0) >= step.at,
        eff: { each: { [item.id]: step.mult } },
      });
    }
  }
}
addBuildingUpgrades(TREES, 'tree', 'trees');
addBuildingUpgrades(PRESSES, 'press', 'presses');
addBuildingUpgrades(CASKS, 'cask', 'casks');

// Broad multipliers, gated on how far along you are rather than on one building.
const GLOBALS = [
  { id:'ug1', name:'Winter pruning',   glyph:'✂️', cost:2e3,   cur:'fruit',
    desc:'All trees ×1.5. Needs 30 trees.',        need:S=>totalOwned(S.trees)>=30,   eff:{treeMult:0.5} },
  { id:'ug2', name:'Compost heap',     glyph:'🍂', cost:40e3,  cur:'fruit',
    desc:'All trees ×1.5. Needs 75 trees.',        need:S=>totalOwned(S.trees)>=75,   eff:{treeMult:0.5} },
  { id:'ug3', name:'Beehives',         glyph:'🐝', cost:900e3, cur:'fruit',
    desc:'All trees ×2. Needs 150 trees.',         need:S=>totalOwned(S.trees)>=150,  eff:{treeMult:1} },
  { id:'ug4', name:'Irrigation',       glyph:'💧', cost:30e6,  cur:'fruit',
    desc:'All trees ×2. Needs 250 trees.',         need:S=>totalOwned(S.trees)>=250,  eff:{treeMult:1} },
  { id:'ug5', name:'Rootstock trials', glyph:'🧪', cost:2e9,   cur:'fruit',
    desc:'All trees ×2.5. Needs 400 trees.',       need:S=>totalOwned(S.trees)>=400,  eff:{treeMult:1.5} },
  { id:'up1', name:'Sharper knives',   glyph:'🔪', cost:6e3,   cur:'fruit',
    desc:'All presses ×1.5. Needs 15 presses.',    need:S=>totalOwned(S.presses)>=15, eff:{pressMult:0.5} },
  { id:'up2', name:'Steam power',      glyph:'♨️', cost:200e3, cur:'fruit',
    desc:'All presses ×2. Needs 40 presses.',      need:S=>totalOwned(S.presses)>=40, eff:{pressMult:1} },
  { id:'up3', name:'Enzyme treatment', glyph:'⚗️', cost:12e6,  cur:'fruit',
    desc:'All presses ×2. Needs 80 presses.',      need:S=>totalOwned(S.presses)>=80, eff:{pressMult:1} },
  { id:'up4', name:'Continuous run',   glyph:'🔁', cost:900e6, cur:'fruit',
    desc:'All presses ×2.5. Needs 140 presses.',   need:S=>totalOwned(S.presses)>=140,eff:{pressMult:1.5} },
  { id:'uc1', name:'Temperature control',glyph:'🌡️', cost:4e3, cur:'must',
    desc:'All casks ×1.5. Needs 15 casks.',        need:S=>totalOwned(S.casks)>=15,   eff:{cellarMult:0.5} },
  { id:'uc2', name:'Better corks',     glyph:'🍾', cost:120e3, cur:'must',
    desc:'All casks ×2. Needs 40 casks.',          need:S=>totalOwned(S.casks)>=40,   eff:{cellarMult:1} },
  { id:'uc3', name:'Cellar tracking',  glyph:'📋', cost:8e6,   cur:'must',
    desc:'All casks ×2. Needs 80 casks.',          need:S=>totalOwned(S.casks)>=80,   eff:{cellarMult:1} },
  { id:'uc4', name:'Master blender',   glyph:'🥃', cost:600e6, cur:'must',
    desc:'All casks ×2.5. Needs 140 casks.',       need:S=>totalOwned(S.casks)>=140,  eff:{cellarMult:1.5} },
  { id:'uk1', name:'Sturdy ladder',    glyph:'🪜', cost:2364,   cur:'fruit',
    desc:'Tending ×3. Needs 50 tends this run.',   need:S=>S.clicks>=50,              eff:{clickMult:2} },
  { id:'uk2', name:'Picking basket',   glyph:'🧺', cost:25e3,  cur:'fruit',
    desc:'Tending ×3. Needs 300 tends this run.',  need:S=>S.clicks>=300,             eff:{clickMult:2} },
  { id:'uk3', name:'Whole family out', glyph:'👨‍👩‍👧', cost:1.5e6, cur:'fruit',
    desc:'Tending ×3. Needs 1,000 tends this run.',need:S=>S.clicks>=1000,            eff:{clickMult:2} },
  { id:'uk4', name:'Tending pays',     glyph:'📈', cost:300e3, cur:'fruit',
    desc:'Tending also gives 3% of your fruit per second. Needs 500 tends this run.',
    need:S=>S.clicks>=500, eff:{clickFromRate:0.03} },
  { id:'us1', name:'Mixed planting',   glyph:'🌻', cost:150e3, cur:'fruit',
    desc:'Every tree you own boosts all trees by 0.15%. Needs 5 kinds of tree.',
    need:S=>TREES.filter(t=>(S.trees[t.id]||0)>0).length>=5, eff:{treeSynergy:0.0015} },
  { id:'us2', name:'Old orchard mix',  glyph:'🌳', cost:60e6,  cur:'fruit',
    desc:'Another 0.15% per tree. Needs 8 kinds of tree.',
    need:S=>TREES.filter(t=>(S.trees[t.id]||0)>0).length>=8, eff:{treeSynergy:0.0015} },
  { id:'uy1', name:'Slow pressing',    glyph:'🐌', cost:80e3,  cur:'fruit',
    desc:'+25% must from the same fruit. Needs 25 presses.',
    need:S=>totalOwned(S.presses)>=25, eff:{pressYield:0.25} },
  { id:'uy2', name:'Whole fruit',      glyph:'🍎', cost:20e6,  cur:'fruit',
    desc:'Presses may take 65% of the crop instead of 50%. Needs 60 presses.',
    need:S=>totalOwned(S.presses)>=60, eff:{pressShare:0.15} },
  { id:'uv1', name:'Fine bottling',    glyph:'🏺', cost:60e3,  cur:'must',
    desc:'+30% bottles from the same must. Needs 25 casks.',
    need:S=>totalOwned(S.casks)>=25, eff:{bottleValue:0.3} },
  { id:'uv2', name:'Estate label',     glyph:'🏷️', cost:15e6,  cur:'must',
    desc:'+50% bottles. Needs 60 casks.',
    need:S=>totalOwned(S.casks)>=60, eff:{bottleValue:0.5} },
];
for (const g of GLOBALS) {
  UPGRADES.push({ id:g.id, name:g.name, desc:g.desc, glyph:g.glyph,
                  cost:g.cost, currency:g.cur, need:g.need, eff:g.eff });
}

const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

function upgradeBought(id) { return !!(S.upgrades && S.upgrades[id]); }

function availableUpgrades() {
  return UPGRADES.filter(u => !upgradeBought(u.id) && u.need(S));
}

function upgradeSum(key) {
  let total = 0;
  for (const id in (S.upgrades || {})) {
    const u = UPGRADE_BY_ID[id];
    if (u && u.eff[key]) total += u.eff[key];
  }
  return total;
}

function perBuildingMult(id) {
  let mult = 1;
  for (const key in (S.upgrades || {})) {
    const u = UPGRADE_BY_ID[key];
    if (u && u.eff.each && u.eff.each[id]) mult *= u.eff.each[id];
  }
  return mult;
}


/* ---------------------------------------------------------------- cultivars
   The third layer. Heirlooms are a flat multiplier and stop being interesting
   once you have a few; cultivars change how the chain behaves instead, so a
   later game is a different game rather than the same one with bigger numbers. */

const CULTIVARS = [
  { id:'windfall', name:'Windfall stock', cost:1, glyph:'🍏',
    desc:'Presses may take the entire crop, not half of it. The income share cap is lifted.' },
  { id:'coldcellar', name:'Cold cellar', cost:1, glyph:'❄️',
    desc:'The cellar ages at full rate while you are away, however long the rest runs at.' },
  { id:'perennial', name:'Perennial roots', cost:2, glyph:'🌱',
    desc:'Keep a quarter of your trees through a vintage instead of starting bare.' },
  { id:'taproot', name:'Deep taproot', cost:2, glyph:'🪱',
    desc:'Twelve more hours of offline time before the cellar book runs out.' },
  { id:'evenyear', name:'Even year', cost:3, glyph:'🗓️',
    desc:'No off-season penalty. Whatever is out of season simply does not suffer.' },
  { id:'grafted', name:'Grafted stock', cost:3, glyph:'🌿',
    desc:'Trees cost 30% less, for good.' },
  { id:'memory', name:'Terroir memory', cost:4, glyph:'🧠',
    desc:'Keep a tenth of your terroir through a succession rather than losing all of it.' },
  { id:'overflow', name:'Cellar overflow', cost:4, glyph:'🫗',
    desc:'Must left standing ages itself slowly, even with no cask free to take it.' },
  { id:'handsfree', name:'Hands free', cost:5, glyph:'🤲',
    desc:'The orchard is tended for you, twice a second, at full strength.' },
  { id:'lineage', name:'Long lineage', cost:6, glyph:'📜',
    desc:'Each heirloom is worth +40% instead of +25%.' },
];

const CULTIVAR_BY_ID = Object.fromEntries(CULTIVARS.map(c => [c.id, c]));
function hasCultivar(id) { return !!(S.cultivars && S.cultivars[id]); }

function seedsFor(heirloomsEver) {
  // The first seed should be a visible goal rather than a rumour; later ones
  // cost the square, so cultivars stay rare.
  if (heirloomsEver < 25) return 0;
  return Math.floor(Math.pow(heirloomsEver / 25, 0.5));
}

function doLineage() {
  const gain = seedsFor(S.stats.heirloomsEver) - S.stats.seedsClaimed;
  if (gain <= 0) return false;
  S.stats.lineages++;
  S.stats.seedsClaimed += gain;
  const keptTerroir = 0;
  // The lifetime terroir counter is the fuel heirlooms are made from, so it has
  // to burn with them. Left standing, succession's gain - heirloomsFor(counter)
  // minus heirlooms held - saw a zeroed hand against an untouched counter and
  // handed every heirloom straight back, free, the instant a lineage finished.
  // It also counted them into heirloomsEver a second time, roughly doubling
  // seed income. Heirlooms are now re-earned from nothing each lineage, which
  // goes faster than the first time because the cultivars carry.
  S.stats.terroirEver = 0;
  const carried = { terroir: keptTerroir, heirlooms: 0,
                    tree: {}, achievements: S.achievements,
                    stats: S.stats, settings: S.settings,
                    cultivars: S.cultivars, seeds: S.seeds + gain };
  S = freshState(carried);
  log(`A new lineage begins. <b>+${fmt(gain)} seeds</b>.`);
  toast(`New lineage — <b>+${fmt(gain)} seeds</b> to spend on cultivars`);
  return true;
}

function buyCultivar(c) {
  // Without this, a bad argument passes the affordability test (n < undefined is
  // false), and S.seeds -= undefined turns the currency into NaN for good.
  if (!c || typeof c.cost !== 'number' || !CULTIVARS.includes(c)) return false;
  if (hasCultivar(c.id)) return false;
  if (S.seeds < c.cost) return false;
  S.seeds -= c.cost;
  S.cultivars[c.id] = true;
  recalc();
  log(`Cultivar established: <b>${c.name}</b>.`);
  toast(`<b>${c.name}</b> — ${c.desc}`);
  return true;
}

const ACHIEVEMENTS = [
  { id:'a1', name:'First fruit',      desc:'Tend the trees once',            bonus:0.01, test:s=>s.stats.clicks>=1 },
  { id:'a2', name:'A hundred hands',  desc:'Tend 100 times',                 bonus:0.02, test:s=>s.stats.clicks>=100 },
  { id:'a3', name:'Blistered',        desc:'Tend 1,000 times',               bonus:0.03, test:s=>s.stats.clicks>=1000 },
  { id:'a4', name:'Windfall',         desc:'Hold 1,000 fruit',               bonus:0.01, test:s=>s.fruit>=1e3 },
  { id:'a5', name:'Glut',             desc:'Hold 1 million fruit',           bonus:0.02, test:s=>s.fruit>=1e6 },
  { id:'a6', name:'Biblical harvest', desc:'Hold 1 billion fruit',           bonus:0.04, test:s=>s.fruit>=1e9 },
  { id:'a7', name:'Beyond counting',  desc:'Hold 1 trillion fruit',          bonus:0.06, test:s=>s.fruit>=1e12 },
  { id:'a8', name:'First pressing',   desc:'Make any must',                  bonus:0.01, test:s=>s.stats.mustEver>=1 },
  { id:'a9', name:'Running sweet',    desc:'Make 100k must',                 bonus:0.03, test:s=>s.stats.mustEver>=1e5 },
  { id:'a10',name:'Rivers of it',     desc:'Make 1 billion must',            bonus:0.05, test:s=>s.stats.mustEver>=1e9 },
  { id:'a11',name:'First bottle',     desc:'Age a single bottle',            bonus:0.01, test:s=>s.stats.bottlesEver>=1 },
  { id:'a12',name:'A proper cellar',  desc:'Age 10,000 bottles',             bonus:0.03, test:s=>s.stats.bottlesEver>=1e4 },
  { id:'a13',name:'Stacked to the vault', desc:'Age 100 million bottles',    bonus:0.05, test:s=>s.stats.bottlesEver>=1e8 },
  { id:'a14',name:'Legendary cellar', desc:'Age 1 trillion bottles',         bonus:0.08, test:s=>s.stats.bottlesEver>=1e12 },
  { id:'a15',name:'Planted out',      desc:'Own 50 trees of any kind',       bonus:0.02, test:s=>totalOwned(s.trees)>=50 },
  { id:'a16',name:'An orchard proper',desc:'Own 250 trees',                  bonus:0.04, test:s=>totalOwned(s.trees)>=250 },
  { id:'a17',name:'Every variety',    desc:'Own at least one of every tree', bonus:0.05,
    unlock:'medlar', reward:'Unlocks the Medlar, a variety nobody else still grows',
    test:s=>TREES.filter(t=>!t.needsUnlock).every(t=>(s.trees[t.id]||0)>0) },
  { id:'a18',name:'Pressing on',      desc:'Own 25 presses',                 bonus:0.02, test:s=>totalOwned(s.presses)>=25 },
  { id:'a19',name:'Full cellar',      desc:'Own 25 casks',                   bonus:0.02,
    unlock:'buybest', reward:'Unlocks the Buy best button, and the B key',
    test:s=>totalOwned(s.casks)>=25 },
  { id:'a20',name:'First vintage',    desc:'Bottle a vintage',               bonus:0.03, test:s=>s.stats.vintages>=1 },
  { id:'a21',name:'Five good years',  desc:'Bottle 5 vintages',              bonus:0.05,
    unlock:'stats', reward:'Unlocks the Records tab',
    test:s=>s.stats.vintages>=5 },
  { id:'a22',name:'A life\'s work',   desc:'Bottle 25 vintages',             bonus:0.08, test:s=>s.stats.vintages>=25 },
  { id:'a23',name:'Rooted',           desc:'Spend 25 terroir',               bonus:0.03, test:s=>s.stats.terroirSpent>=25 },
  { id:'a24',name:'Deeply rooted',    desc:'Spend 250 terroir',              bonus:0.06, test:s=>s.stats.terroirSpent>=250 },
  { id:'a25',name:'A whole branch',   desc:'Max every node in one branch',   bonus:0.10,
    unlock:'bulk', reward:'Unlocks buying ×1,000 at a time',
    test:s=>branchComplete(s) },
  { id:'a26',name:'Green fingers',    desc:'Reach 1M fruit per second',      bonus:0.05, test:s=>s.rates.fruit>=1e6 },
  { id:'a27',name:'Industrial',       desc:'Reach 1M must per second',       bonus:0.06, test:s=>s.rates.must>=1e6 },
  { id:'a28',name:'The good stuff',   desc:'Reach 100k bottles per second',  bonus:0.07, test:s=>s.rates.bottles>=1e5 },
  { id:'a29',name:'Succession',       desc:'Hand the estate on once',        bonus:0.10, test:s=>s.stats.successions>=1 },
  { id:'a30',name:'Four seasons',     desc:'Play through a full year',       bonus:0.03, test:s=>s.stats.seasonsSeen>=4 },
  { id:'a31',name:'Patient',          desc:'Return to 4 hours of offline gain', bonus:0.04, test:s=>s.stats.bestOffline>=4*3600 },
  { id:'a32',name:'Vigorous',         desc:'Land 50 full-vigour bursts',     bonus:0.05, test:s=>s.stats.bursts>=50 },
  /* ---- the middle of the game ----
     Measured on a full run, nine achievements landed in the first hour, then
     only four across the next thirteen, then seventeen at once as the first
     succession came in. These sit in that gap, which is where a player decides
     whether the game is going anywhere. */
  { id:'a33',name:'A hundred of one', desc:'Own 100 of a single variety', bonus:0.04,
    test:s=>TREES.some(t=>(s.trees[t.id]||0)>=100) },
  { id:'a34',name:'Well equipped',    desc:'Own at least one of every press', bonus:0.05,
    test:s=>PRESSES.every(p=>(s.presses[p.id]||0)>0) },
  { id:'a35',name:'Ten good years',   desc:'Bottle 10 vintages',            bonus:0.04,
    test:s=>s.stats.vintages>=10 },
  { id:'a36',name:'Barrels of it',    desc:'Make 10 million must',          bonus:0.04,
    test:s=>s.stats.mustEver>=1e7 },
  { id:'a37',name:'A serious cellar', desc:'Age 1 million bottles',         bonus:0.04,
    test:s=>s.stats.bottlesEver>=1e6 },
  { id:'a38',name:'Well read',        desc:'Learn 50 skill ranks',          bonus:0.05,
    test:s=>Object.values(s.tree).reduce((a,b)=>a+b,0)>=50 },
  { id:'a39',name:'Deep in the book', desc:'Learn 150 skill ranks',         bonus:0.06,
    test:s=>Object.values(s.tree).reduce((a,b)=>a+b,0)>=150 },
  { id:'a40',name:'Well spent',       desc:'Spend 2,500 terroir',           bonus:0.05,
    test:s=>s.stats.terroirSpent>=2500 },

  /* ---- the long game ----
     Everything above is finished inside a day. Reaching every cultivar takes
     thirty-one lineages, and until these there was nothing at all out there.
     Deliberately modest bonuses: thirty more achievements at the old sizes
     would be a balance change wearing a content hat. The reward that matters
     here is the unlock. */
  { id:'a41',name:'A new line',       desc:'Begin a second lineage',        bonus:0.03,
    test:s=>s.stats.lineages>=2 },
  { id:'a42',name:'Five generations', desc:'Begin a fifth lineage',         bonus:0.04,
    unlock:'bulk10k', reward:'Unlocks buying ×10,000 at a time',
    test:s=>s.stats.lineages>=5 },
  { id:'a43',name:'Ten generations',  desc:'Begin a tenth lineage',         bonus:0.05,
    test:s=>s.stats.lineages>=10 },
  { id:'a44',name:'Established',      desc:'Establish your first cultivar', bonus:0.03,
    test:s=>CULTIVARS.some(c=>s.cultivars[c.id]) },
  { id:'a45',name:'Bred true',        desc:'Establish three cultivars',     bonus:0.04,
    test:s=>CULTIVARS.filter(c=>s.cultivars[c.id]).length>=3 },
  { id:'a46',name:'The whole seedbank',desc:'Establish every cultivar',     bonus:0.08,
    test:s=>CULTIVARS.every(c=>s.cultivars[c.id]) },
  { id:'a47',name:'Handed on',        desc:'Hand the estate on five times', bonus:0.03,
    test:s=>s.stats.successions>=5 },
  { id:'a48',name:'A long line',      desc:'Hand the estate on 25 times',   bonus:0.05,
    test:s=>s.stats.successions>=25 },
  { id:'a49',name:'A century',        desc:'Bottle 100 vintages',           bonus:0.04,
    test:s=>s.stats.vintages>=100 },
  { id:'a50',name:'Five centuries',   desc:'Bottle 500 vintages',           bonus:0.06,
    test:s=>s.stats.vintages>=500 },
  { id:'a51',name:'Inheritance',      desc:'Hold 100 heirlooms at once',    bonus:0.04,
    test:s=>s.heirlooms>=100 },
  { id:'a52',name:'The whole estate', desc:'Max every node in the tree',    bonus:0.08,
    test:s=>TREE.every(n=>(s.tree[n.id]||0)>=n.ranks) },
  /* ---- the ladders, carried on ----
     Every counting achievement stopped at a figure passed around twenty hours,
     in a game that runs for weeks. These are deliberately worth little: at this
     point the satisfaction is the marker, and sixty-odd global multipliers
     stacked on each other is a balance change wearing a content hat. */
  { id:'a53',name:'Orchards of it',   desc:'Hold 1 quadrillion fruit',      bonus:0.02,
    test:s=>s.fruit>=1e15 },
  { id:'a54',name:'Past reckoning',   desc:'Hold 1 quintillion fruit',      bonus:0.02,
    test:s=>s.fruit>=1e18 },
  { id:'a55',name:'Absurd',           desc:'Hold 1 sextillion fruit',       bonus:0.03,
    test:s=>s.fruit>=1e21 },
  { id:'a56',name:'A sea of must',    desc:'Make 1 trillion must',          bonus:0.02,
    test:s=>s.stats.mustEver>=1e12 },
  { id:'a57',name:'An ocean of it',   desc:'Make 1 quadrillion must',       bonus:0.02,
    test:s=>s.stats.mustEver>=1e15 },
  { id:'a58',name:'Cellars unending', desc:'Age 1 quadrillion bottles',     bonus:0.02,
    test:s=>s.stats.bottlesEver>=1e15 },
  { id:'a59',name:'The whole vintage',desc:'Age 1 quintillion bottles',     bonus:0.03,
    test:s=>s.stats.bottlesEver>=1e18 },
  { id:'a60',name:'Faster than picking',desc:'Reach 1 billion fruit per second', bonus:0.02,
    test:s=>s.rates.fruit>=1e9 },
  { id:'a61',name:'A river a second', desc:'Reach 1 trillion fruit per second', bonus:0.03,
    test:s=>s.rates.fruit>=1e12 },
  { id:'a62',name:'Pressing hard',    desc:'Reach 1 billion must per second', bonus:0.02,
    test:s=>s.rates.must>=1e9 },
  { id:'a63',name:'Bottling hard',    desc:'Reach 100 million bottles per second', bonus:0.02,
    test:s=>s.rates.bottles>=1e8 },

  /* ---- the character of the place ----
     The varietal traits are the newest thing in the game and nothing pointed at
     them. These do, by asking for the shapes of orchard the traits reward: a
     spread rather than a stack, the seasons covered, the chain fed from the
     trees themselves. */
  { id:'a64',name:'Well spread',      desc:'Own 25 of every variety',       bonus:0.05,
    test:s=>TREES.every(t=>(s.trees[t.id]||0)>=25) },
  { id:'a65',name:'In season',        desc:'Own 50 of every variety that has a season', bonus:0.04,
    test:s=>TREES.filter(t=>t.trait&&t.trait.season).every(t=>(s.trees[t.id]||0)>=50) },
  { id:'a66',name:'Good neighbours',  desc:'Own 100 of every variety that lifts the others', bonus:0.04,
    test:s=>TREES.filter(t=>t.trait&&t.trait.lifts).every(t=>(s.trees[t.id]||0)>=100) },
  /* The two ends of the final run: everything bought at once, and the first
     proof you have engaged with how steeply owning gets dear. */
  { id:'a68',name:'Nothing left to buy', desc:'Hold every upgrade at once', bonus:0.10,
    test:s=>UPGRADES.every(u=>s.upgrades[u.id]) },
  { id:'a69',name:'Two hundred',      desc:'Own 200 of a single tier', bonus:0.06,
    test:s=>[...TREES,...PRESSES,...CASKS].some(b=>
      (s.trees[b.id]||s.presses[b.id]||s.casks[b.id]||0)>=200) },
  { id:'a67',name:'Self-sufficient',  desc:'Feed both the presses and the cellar to the limit from the orchard alone', bonus:0.06,
    test:s=>fedShare('press')>=FED_CAP && fedShare('cellar')>=FED_CAP },
];

function totalOwned(map) { return Object.values(map || {}).reduce((a, b) => a + b, 0); }

function branchComplete(s) {
  return ['grove','press','cellar','estate'].some(branch =>
    TREE.filter(n => n.b === branch).every(n => (s.tree[n.id] || 0) >= n.ranks));
}

/* ---------------------------------------------------------------- state */
function freshState(keep) {
  const base = {
    fruit: 0, must: 0, bottles: 0,
    trees: {}, presses: {}, casks: {},
    upgrades: {},
    clicks: 0,          // this run only - the click-gated upgrades reset with it
    vigour: 0,
    season: 0, seasonTime: 0,
    lastSave: Date.now(),
    rates: { fruit: 0, must: 0, bottles: 0 },
  };
  const persistent = {
    terroir: 0, heirlooms: 0,
    seeds: 0, cultivars: {},
    tree: {}, achievements: {},
    stats: {
      clicks: 0, clicksEver: 0, mustEver: 0, bottlesEver: 0, vintages: 0, successions: 0,
      terroirSpent: 0, terroirEver: 0, bestOffline: 0, bursts: 0,
      seasonsSeen: 0, started: Date.now(), bestVintage: 0,
      heirloomsEver: 0, lineages: 0, seedsClaimed: 0,
      // Buildings go at every vintage, so completion counts what has ever been
      // grown rather than what happens to be standing.
      grownEver: {},
      // terroirEver is the fuel succession converts and burns at a lineage;
      // terroirAllTime is only ever read by Records, so it never resets.
      terroirAllTime: 0,
      // High-water marks. The tree goes at a succession and the upgrades go at
      // every vintage, so completion counts the furthest you ever got, not what
      // happens to be standing right now - otherwise the figure would drop each
      // time you bottled, which is the opposite of what it is for.
      bestTreeRanks: 0, bestUpgrades: 0,
      vintageHistory: [], bestBottles: 0, runStarted: Date.now(),
    },
    settings: { notation: 'short', autoBuy: true, showLog: true, buyMaxNodes: false },
  };
  if (!keep) return { ...base, ...persistent };
  return {
    ...base,
    terroir: keep.terroir, heirlooms: keep.heirlooms,
    seeds: keep.seeds !== undefined ? keep.seeds : 0,
    cultivars: keep.cultivars || {},
    tree: keep.tree, achievements: keep.achievements,
    stats: keep.stats, settings: keep.settings,
  };
}

let S = freshState();
let MOD = {};            // recalculated multipliers, never stored
let buyAmount = 1;
let activeTab = 'grove';

/* ------------------------------------------------------- derived numbers */
function rank(id) { return S.tree[id] || 0; }

function branchPoints(branch) {
  return TREE.filter(n => n.b === branch)
             .reduce((total, n) => total + rank(n.id) * n.cost, 0);
}

function sumEffect(key) {
  let total = 0;
  for (const node of TREE) {
    const r = rank(node.id);
    if (r && node.eff[key]) total += node.eff[key] * r;
  }
  return total + upgradeSum(key);
}

function achievementBonus() {
  let total = 0;
  for (const a of ACHIEVEMENTS) if (S.achievements[a.id]) total += a.bonus;
  return total;
}

/** Everything multiplicative lives here so the sim and the UI can never
 *  disagree about what a number should be. */
/* A hard Math.min turns every rank past the cap into terroir spent on nothing:
   the tree offered 2.46 of offlineRate into 0.40 of headroom, so Night watch and
   Cork library could be bought out entirely for no effect at all. This approaches
   the cap instead of hitting it. It is deliberately linear at the start - the
   first rank is worth what it says - and each rank after is worth a little less,
   but never nothing.

     soften(1, 0.6, 0.10) = 0.689   where the old clamp gave 0.700
     soften(1, 0.6, 2.46) = 0.999   where the old clamp gave 1.000 from 0.40 on

   Use it only where the tree really can overshoot. Where the overshoot is a
   rounding error the cap is simply set to fit, because bending a curve to save
   one rank costs every other rank more than it saves. */
function soften(cap, base, sum) {
  const room = cap - base;
  if (room <= 0) return cap;
  return cap - room * Math.exp(-sum / room);
}

function recalc() {
  const heir = 1 + S.heirlooms * (hasCultivar('lineage') ? 0.40 : 0.25);
  const ach = 1 + achievementBonus();
  const all = 1 + sumEffect('allMult');

  // Even year removes the off-season penalty outright rather than softening it.
  const seasonSoft = hasCultivar('evenyear') ? 1 : Math.min(0.9, sumEffect('seasonSoften'));
  const seasonPower = 0.6 * (1 + sumEffect('seasonBoost'));
  const season = SEASONS[S.season].key;
  const seasonFor = (which) => {
    if (season === which) return 1 + seasonPower;
    return 1 - (0.15 * (1 - seasonSoft));   // off-season is a mild penalty
  };

  MOD = {
    heir, ach, all,
    tree:   (1 + sumEffect('treeMult'))   * seasonFor('tree')   * all * ach * heir,
    press:  (1 + sumEffect('pressMult'))  * seasonFor('press')  * all * ach * heir,
    cellar: (1 + sumEffect('cellarMult')) * seasonFor('cellar') * all * ach * heir,
    click:  (1 + sumEffect('clickMult'))  * (season === 'harvest' ? 4 : 1) * all * ach * heir,
    pressYield: 1 + sumEffect('pressYield'),
    pressShare: hasCultivar('windfall') ? 1 : Math.min(0.95, 0.5 + sumEffect('pressShare')),
    bottleValue: 1 + sumEffect('bottleValue'),
    terroirGain: 1 + sumEffect('terroirGain'),
    // Overshoots by 0.02 with Grafted stock: the cap moves to fit rather than
    // curving the whole range to reclaim a fiftieth of one rank.
    cheapTrees: Math.min(0.62, sumEffect('cheapTrees') + (hasCultivar('grafted') ? 0.3 : 0)),
    treeSynergy: sumEffect('treeSynergy'),
    vigourRate: 1 + sumEffect('vigourRate'),
    vigourPower: 2 + sumEffect('vigourPower'),
    // 6 ranks x 0.25 = 1.50 into 0.80 of room, so this has to curve.
    vigourKeep: soften(0.8, 0, sumEffect('vigourKeep')),
    clickFromRate: sumEffect('clickFromRate'),
    // Being away shouldn't be punished in a game meant to last months. Three
    // nodes feed this, 2.46 between them against 0.40 of room, so it curves.
    // The cap is 1 for a reason: above it, being away would beat playing.
    offlineRate: soften(1, 0.6, sumEffect('offlineRate')),
    offlineCap: (8 + sumEffect('offlineCap') + (hasCultivar('taproot') ? 12 : 0)) * 3600,
    seasonLength: Math.max(30, 180 * (1 + sumEffect('seasonLength'))),
    // The skill node unlocks it; the switch decides whether it actually runs.
    // Left always-on it will happily spend the fruit you were saving for a tier.
    autoBuyUnlocked: sumEffect('autoBuy') > 0,
    autoBuy: sumEffect('autoBuy') > 0 && S.settings.autoBuy !== false,
    keepBottles: Math.min(0.5, sumEffect('keepBottles')),
    // Lives here rather than inside doVintage so it can be read and tested like
    // every other multiplier - while it was a local, nothing could see whether
    // Rootstock's ranks did anything.
    keepTree: Math.min(0.65, sumEffect('keepTree') + (hasCultivar('perennial') ? 0.25 : 0)),
    startTrees: Math.floor(sumEffect('startTrees')),
  };
}

// Trees and presses are bought with fruit; casks with must. Giving must its own
// sink stops the three stages competing for one pile.
function currencyOf(list) { return list === CASKS ? 'must' : 'fruit'; }

function costOf(list, map, item, count) {
  const owned = map[item.id] || 0;
  const discount = list === TREES ? (1 - MOD.cheapTrees) : 1;
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += item.base * Math.pow(1.175, owned + i);
  }
  return total * discount;
}

function maxAffordable(list, map, item, budget) {
  let count = 0, spent = 0;
  const owned = map[item.id] || 0;
  const discount = list === TREES ? (1 - MOD.cheapTrees) : 1;
  while (count < 5000) {
    const next = item.base * Math.pow(1.175, owned + count) * discount;
    if (spent + next > budget) break;
    spent += next; count++;
  }
  return count;
}

/* Varietal character. Without this every tree is the same tree with a bigger
   number on it, the choice is pure arithmetic, and Buy best does the arithmetic
   for you. Three kinds of trait, so a mixed orchard beats a stack of the top
   tier for reasons a player can actually reason about:

     lifts   raises every OTHER variety, per ten of this one owned
     season  worth much more during its own season than outside it
     feeds   adds capacity to the presses or the casks, which is the one thing
             that answers the bottleneck the chain strip is always pointing at

   The feeding trait is a proportion of that stage's own capacity, not of the
   variety's output. It has to be: the varieties sit fourteen tiers apart, so a
   share of a variety's own crop meant the Medlar supplied 99.9997% of a real
   save's cellar while the Quince supplied 0.0000001% of its presses. As a
   proportion it is worth the same at every scale, it is capped so the buildings
   always matter, and it is worth nothing if you own no presses or casks.

   Kept multiplicative and small: these are reasons to plant a spread, not a
   replacement for the tiers. */
/* No variety carries Spring: Spring already gives every tree +60%, so a Spring
   variety would double-dip and every other season would look like a punishment.
   Spring is the grove's season; Summer, Autumn and Winter each belong to
   somebody. The comparison this trait is for is between varieties within a
   season, not the same variety across seasons - Spring still out-produces
   everything for everyone, which is what a spring is. */
const SEASON_TRAIT = 0.8;        // a variety during its own season

const FED_CAP = 0.5;      // the most the trees can add to a stage, all told

function varietalLift() {
  // Total lift on offer. Each tree subtracts its own share, so nothing lifts
  // itself and a monoculture gains nothing from this at all.
  let lift = 0;
  for (const t of TREES)
    if (t.trait && t.trait.lifts)
      lift += t.trait.lifts * Math.floor((S.trees[t.id] || 0) / 10);
  return lift;
}

function varietalMult(t, liftTotal) {
  let mult = 1;
  if (t.trait && t.trait.lifts)
    mult += liftTotal - t.trait.lifts * Math.floor((S.trees[t.id] || 0) / 10);
  else mult += liftTotal;
  if (t.trait && t.trait.season === SEASONS[S.season].name) mult *= 1 + SEASON_TRAIT;
  return mult;
}

/* How much the orchard adds to a stage, as a proportion of that stage's own
   capacity: each feeding variety gives its per10 for every ten owned. */
function fedShare(stage) {
  let share = 0;
  for (const t of TREES)
    if (t.trait && t.trait.feeds === stage)
      share += t.trait.per10 * Math.floor((S.trees[t.id] || 0) / 10);
  return Math.min(FED_CAP, share);
}

function production() {
  // Trees make fruit. Synergy gives every tree a nudge for each other tree
  // owned, which rewards spreading out rather than stacking one variety.
  let fruit = 0;
  const totalTrees = totalOwned(S.trees);
  const synergy = 1 + MOD.treeSynergy * totalTrees;
  const liftTotal = varietalLift();
  for (const t of TREES) {
    const owned = S.trees[t.id] || 0;
    if (!owned) continue;
    const made = owned * t.rate * perBuildingMult(t.id) * varietalMult(t, liftTotal);
    fruit += made;
  }
  fruit *= MOD.tree * synergy;

  let press = 0;
  for (const p of PRESSES) press += (S.presses[p.id] || 0) * p.rate * perBuildingMult(p.id);
  press *= MOD.press * (1 + fedShare('press'));

  let cellar = 0;
  for (const c of CASKS) cellar += (S.casks[c.id] || 0) * c.rate * perBuildingMult(c.id);
  cellar *= MOD.cellar * (1 + fedShare('cellar'));

  return { fruit, pressCap: press, cellarCap: cellar };
}

/* One short line per variety, so the trait is visible where the buying decision
   is made rather than buried in a wiki nobody will write. */
function traitText(t) {
  if (!t.trait) return '';
  if (t.trait.lifts)
    return `Lifts every other variety by ${(t.trait.lifts * 100).toFixed(1)}% per 10 owned.`;
  if (t.trait.season)
    return `Worth +${Math.round(SEASON_TRAIT * 100)}% in ${t.trait.season}.`;
  if (t.trait.feeds)
    return `+${(t.trait.per10 * 100).toFixed(0)}% ${t.trait.feeds === 'press' ? 'press' : 'cellar'} `
         + `capacity per 10 owned, up to +${Math.round(FED_CAP * 100)}% from all varieties.`;
  return '';
}

/* ---------------------------------------------------------------- ticking */
let offlineMode = false;
let autoTendCarry = 0;

function step(dt) {
  recalc();
  const p = production();

  // Presses take fruit straight off the trees rather than out of the barn.
  // Letting them eat the stock meant buying your first press could stall the
  // whole run - the fruit you spend and the fruit you press are the same fruit.
  const income = p.fruit;
  const pressed = Math.min(p.pressCap, income * MOD.pressShare);
  S.fruit += (income - pressed) * dt;
  const canPress = pressed * dt;
  const mustMade = canPress * MOD.pressYield;
  S.must += mustMade;
  S.stats.mustEver += mustMade;

  // Ageing: limited by cask capacity and must available.
  let cellarCap = p.cellarCap;
  if (offlineMode && hasCultivar('coldcellar')) cellarCap /= Math.max(0.01, MOD.offlineRate);
  const wantAge = cellarCap * dt;
  let canAge = Math.min(wantAge, S.must);
  // Cellar overflow: standing must slowly turns itself, cask or no cask.
  if (hasCultivar('overflow') && S.must > canAge) {
    canAge = Math.min(S.must, canAge + (S.must - canAge) * 0.002 * dt);
  }
  S.must -= canAge;
  const made = canAge * MOD.bottleValue;
  S.bottles += made;
  S.stats.bottlesEver += made;

  S.rates = { fruit: income - pressed, fruitGross: income,
              must: canPress > 0 ? mustMade / dt : 0,
              bottles: canAge > 0 ? made / dt : 0,
              pressed: pressed, aged: dt > 0 ? canAge / dt : 0,
              pressCap: p.pressCap, cellarCap: p.cellarCap };

  // Vigour builds while idle and is spent on a burst click.
  if (S.vigour < 1) S.vigour = Math.min(1, S.vigour + dt * 0.04 * MOD.vigourRate);

  // Seasons. Offline runs in coarse chunks, so dt can be many seasons long -
  // subtracting one length per call left the surplus in seasonTime, and it was
  // then paid off at ten frames a second on return: a strobing season indicator
  // and sixty lines of log. Advance the whole elapsed span at once.
  S.seasonTime += dt;
  if (S.seasonTime >= MOD.seasonLength) {
    const elapsed = Math.floor(S.seasonTime / MOD.seasonLength);
    S.seasonTime -= elapsed * MOD.seasonLength;
    S.season = (S.season + elapsed) % SEASONS.length;
    S.stats.seasonsSeen += elapsed;
    log(`<b>${SEASONS[S.season].name}</b> — ${SEASONS[S.season].effect.toLowerCase()}.`);
    paintSeason();
  }

  if (MOD.autoBuy) autoBuy();
  if (hasCultivar('handsfree')) {
    autoTendCarry += dt * 2;
    const owed = Math.floor(autoTendCarry);
    if (owed > 0) { autoTendCarry -= owed; creditTending(owed); }
  }
  checkAchievements();
}

/* One purchase per call, which online means ten a second. Offline the clock runs
   in sixty coarse chunks, so the barrow got sixty purchases for a whole night
   instead of hundreds of thousands: measured, an eight-hour absence bought 770
   trees where the same eight hours played bought 2,319, and ended on 0.0008% of
   the bottles. Offline, keep buying until the margin rule stops it - the same
   rule, applied until it bites, rather than once and then idle for five minutes. */
function autoBuy() {
  if (offlineMode) {
    // Bounded so a huge purse cannot stall the load; the margin rule normally
    // stops this long before the limit.
    for (let i = 0; i < 400; i++) if (!autoBuyOnce()) return;
    return;
  }
  autoBuyOnce();
}

function autoBuyOnce() {
  // Buys the cheapest useful thing, and only with a wide margin, so it can
  // never spend the fruit you were saving for a tier jump.
  const candidates = [];
  for (const t of TREES) candidates.push({ list: TREES, map: S.trees, item: t });
  for (const p of PRESSES) candidates.push({ list: PRESSES, map: S.presses, item: p });
  for (const c of CASKS) candidates.push({ list: CASKS, map: S.casks, item: c });
  let best = null;
  for (const c of candidates) {
    const cost = costOf(c.list, c.map, c.item, 1);
    const purse = S[currencyOf(c.list)];
    if (cost <= purse * 0.25 && (!best || cost > best.cost)) best = { ...c, cost };
  }
  if (!best) return false;
  S[currencyOf(best.list)] -= best.cost;
  best.map[best.item.id] = (best.map[best.item.id] || 0) + 1;
  return true;
}

function tend() {
  recalc();
  const p = production();
  // Clicking stays relevant because part of it scales with production.
  let gain = 1 * MOD.click + p.fruit * MOD.clickFromRate;
  let burst = false;
  if (S.vigour >= 1) {
    gain *= MOD.vigourPower;
    S.vigour = MOD.vigourKeep;
    burst = true;
    S.stats.bursts++;
  }
  S.fruit += gain;
  S.clicks++;
  S.stats.clicks++;        // kept for the achievements, which are lifetime
  S.stats.clicksEver = S.stats.clicks;
  return { gain, burst };
}

/** Hands free tends twice a second. Looping tend() for that was fine at ten
    frames a second and ruinous offline: a twenty-hour return ran 86,000 of them,
    each redoing a full recalc(), and blocked the load for eight seconds. This is
    arithmetically identical, not an approximation - vigour is topped up once per
    step, above, so however many tends a step owes, at most the first can burst,
    which is exactly what the loop did. */
function creditTending(count) {
  recalc();                       // the season may have turned earlier this step
  const p = production();
  const each = 1 * MOD.click + p.fruit * MOD.clickFromRate;
  let gain = each * count;
  if (S.vigour >= 1) {
    gain += each * (MOD.vigourPower - 1);   // the burst lands on one tend only
    S.vigour = MOD.vigourKeep;
    S.stats.bursts++;
  }
  S.fruit += gain;
  S.clicks += count;
  S.stats.clicks += count;
  S.stats.clicksEver = S.stats.clicks;
}

function buyUpgrade(u) {
  if (upgradeBought(u.id) || !u.need(S)) return false;
  if (S[u.currency] < u.cost) return false;
  S[u.currency] -= u.cost;
  S.upgrades[u.id] = true;
  recalc();
  log(`Bought <b>${u.name}</b>.`);
  return true;
}

/* -------------------------------------------------------------- prestige */
const VINTAGE_MIN = 1000;   // bottles before a vintage is worth anything

function terroirFor(bottles) {
  // Square-root curve: each vintage needs roughly four times the bottles of the
  // last to double the reward, which is what stops runs collapsing into one long
  // grind and keeps a fresh start feeling quick.
  if (bottles < VINTAGE_MIN) return 0;
  return Math.floor(Math.pow(bottles / VINTAGE_MIN, 0.45) * 3.5 * MOD.terroirGain);
}

function doVintage() {
  recalc();
  const gain = terroirFor(S.bottles);
  if (gain <= 0) return false;
  // 8 ranks x 0.05 plus Perennial roots is 0.65, so the cap fits that exactly
  // and Rootstock's last rank is worth buying.
  const keepTree = MOD.keepTree;
  const kept = {};
  if (keepTree > 0) {
    for (const t of TREES) {
      const n = Math.floor((S.trees[t.id] || 0) * keepTree);
      if (n > 0) kept[t.id] = n;
    }
  }
  const keptBottles = S.bottles * MOD.keepBottles;
  const startTrees = MOD.startTrees;

  S.stats.vintages++;
  S.stats.terroirEver += gain;
  S.stats.terroirAllTime = (S.stats.terroirAllTime || 0) + gain;
  S.stats.bestBottles = Math.max(S.stats.bestBottles || 0, S.bottles);
  S.stats.vintageHistory = (S.stats.vintageHistory || []).concat([{
    n: S.stats.vintages, bottles: S.bottles, terroir: gain,
    minutes: (Date.now() - (S.stats.runStarted || Date.now())) / 60000,
  }]).slice(-60);
  S.stats.bestVintage = Math.max(S.stats.bestVintage, gain);
  const carried = { terroir: S.terroir + gain, heirlooms: S.heirlooms,
                    seeds: S.seeds, cultivars: S.cultivars,
                    tree: S.tree, achievements: S.achievements,
                    stats: S.stats, settings: S.settings };
  S = freshState(carried);
  S.stats.runStarted = Date.now();
  S.trees = kept;
  if (startTrees > 0) S.trees.seedling = (S.trees.seedling || 0) + startTrees;
  S.bottles = keptBottles;
  log(`Vintage bottled. <b>+${fmt(gain)} terroir</b>.`);
  toast(`Vintage bottled — <b>+${fmt(gain)} terroir</b>`);
  return true;
}

function heirloomsFor(terroirEver) {
  if (terroirEver < 40000) return 0;
  return Math.floor(Math.pow(terroirEver / 40000, 0.34));
}

function doSuccession() {
  const gain = heirloomsFor(S.stats.terroirEver) - S.heirlooms;
  if (gain <= 0) return false;
  S.stats.successions++;
  S.stats.heirloomsEver = (S.stats.heirloomsEver || 0) + gain;
  const keptTerroir = hasCultivar('memory') ? Math.floor(S.terroir * 0.1) : 0;
  const carried = { terroir: keptTerroir, heirlooms: S.heirlooms + gain,
                    seeds: S.seeds, cultivars: S.cultivars,
                    tree: {}, achievements: S.achievements,
                    stats: S.stats, settings: S.settings };
  S = freshState(carried);
  log(`The estate passes to the next generation. <b>+${fmt(gain)} heirlooms</b>.`);
  toast(`Succession — <b>+${fmt(gain)} heirlooms</b>, +${fmt(gain * 25)}% to everything`);
  return true;
}

/* -------------------------------------------------------------- offline */
function applyOffline(seconds) {
  if (seconds < 60) return null;
  recalc();
  const capped = Math.min(seconds, MOD.offlineCap);
  const efficiency = MOD.offlineRate;
  const before = { fruit: S.fruit, must: S.must, bottles: S.bottles };

  // Run the real tick in coarse steps rather than a closed-form guess, so
  // offline earnings obey the same bottlenecks as playing does.
  const chunks = 60;
  const dt = (capped * efficiency) / chunks;
  offlineMode = true;
  for (let i = 0; i < chunks; i++) step(dt);
  offlineMode = false;

  S.stats.bestOffline = Math.max(S.stats.bestOffline, seconds);
  return {
    seconds, capped, efficiency,
    fruit: S.fruit - before.fruit,
    must: S.must - before.must,
    bottles: S.bottles - before.bottles,
  };
}

/* ------------------------------------------------------------ achievements */
function unlocked(name) {
  return ACHIEVEMENTS.some(a => a.unlock === name && S.achievements[a.id]);
}

/* Completion, in five strands. One number on its own would be opaque and a bit
   dishonest - the strands are wildly different lengths - so the panel shows the
   working and the headline is their plain average. */
/* What you are holding, not what you once held. 100% is a single estate that has
   every achievement and cultivar - which are permanent - and at the same moment
   a complete skill tree and every upgrade standing. Since a vintage takes the
   upgrades and a succession takes the tree, the figure falls back when you
   reset, and only the final run can carry it to the top.

   Note what "every upgrade" costs: the x100 tiers each need 100 of that
   building, so all 191 means 100 of every one of the 42 tiers at once. That is
   the hardest thing in the game by a wide margin, and it is meant to be. */
function completion() {
  const held = Object.values(S.tree).reduce((a, b) => a + b, 0);
  const bought = UPGRADES.filter(u => upgradeBought(u.id)).length;
  // Still recorded, for the Records list - just no longer what completion reads.
  S.stats.bestTreeRanks = Math.max(S.stats.bestTreeRanks || 0, held);
  S.stats.bestUpgrades = Math.max(S.stats.bestUpgrades || 0, bought);

  // Each ladder asked against its own map, rather than guessing which one a
  // given id belongs to.
  const ladders = [[TREES, S.trees], [PRESSES, S.presses], [CASKS, S.casks]];
  const varieties = ladders.reduce((a, [list]) => a + list.length, 0);
  const standing = ladders.reduce((a, [list, map]) =>
    a + list.filter(b => (map[b.id] || 0) > 0).length, 0);

  const strands = [
    { name: 'Achievements', got: ACHIEVEMENTS.filter(a => S.achievements[a.id]).length,
      of: ACHIEVEMENTS.length },
    { name: 'Cultivars', got: CULTIVARS.filter(c => hasCultivar(c.id)).length,
      of: CULTIVARS.length },
    { name: 'Skill tree', got: held, of: TREE.reduce((a, n) => a + n.ranks, 0) },
    { name: 'Upgrades', got: bought, of: UPGRADES.length },
    { name: 'Trees, presses and casks', got: standing, of: varieties },
  ];
  for (const s of strands) s.frac = Math.min(1, s.of ? s.got / s.of : 0);
  // Equal weight per strand: the alternative is weighting by count, which would
  // make the whole figure a measure of how many upgrades exist.
  const overall = strands.reduce((a, s) => a + s.frac, 0) / strands.length;
  return { strands, overall };
}

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (!S.achievements[a.id] && a.test(S)) {
      S.achievements[a.id] = true;
      toast(`<b>${a.name}</b> — ${a.reward || a.desc}`);
      log(`Achievement: <b>${a.name}</b>.`);
      if (activeTab === 'ach') paintAchievements();
    }
  }
}

/* ------------------------------------------------------------------ save */
const BACKUP_KEY = SAVE_KEY + '-backup';
const TAB_ID = Math.random().toString(36).slice(2, 10);

// Set before any deliberate reload. Importing or erasing then reloading would
// otherwise trip the unload handler, which writes the state still in memory
// straight over what was just put there - silently undoing both.
let saveLocked = false;
let clobberWarned = false;
let lastBackup = 0;

function lockSaving(reason) {
  saveLocked = true;
  if (reason) log(reason);
}

/** True if some other tab has written since we last did. Two tabs both
 *  autosaving will otherwise overwrite each other's progress.
 *  A counter rather than a timestamp: clocks are too coarse to tell two saves
 *  a second apart, and that is exactly when this matters. */
function anotherTabIsAhead() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw);
    return stored.writer && stored.writer !== TAB_ID
        && (stored.saveCount || 0) > (S.saveCount || 0);
  } catch (err) {
    return false;
  }
}

function save(force) {
  if (saveLocked && !force) return false;
  if (!force && anotherTabIsAhead()) {
    if (!clobberWarned) {
      clobberWarned = true;
      saveLocked = true;
      toast('<b>This tab has stopped saving.</b> The game is open in another tab, '
          + 'which is further along — close this one to avoid losing that progress.');
      log('Another tab is further along. <b>Saving stopped here</b> to protect it.');
    }
    return false;
  }
  S.lastSave = Date.now();
  S.writer = TAB_ID;
  S.saveCount = (S.saveCount || 0) + 1;
  try {
    const text = JSON.stringify(S);
    localStorage.setItem(SAVE_KEY, text);
    // A rolling backup, so a bad import or a mistake is recoverable.
    if (Date.now() - lastBackup > 180000) {
      lastBackup = Date.now();
      try { localStorage.setItem(BACKUP_KEY, text); } catch (err) { /* full */ }
    }
    return true;
  } catch (err) {
    toast('Could not save — the browser refused. Export a copy from Settings.');
    return false;
  }
}

function backupInfo() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { when: data.lastSave || 0, vintages: (data.stats || {}).vintages || 0,
             bottles: data.stats ? data.stats.bottlesEver : 0 };
  } catch (err) {
    return null;
  }
}

/* A save is just text in a browser store: it can be truncated by a crash mid
   write, edited by hand, or written by a version of the game that no longer
   matches this one. None of that should be able to produce a NaN that quietly
   poisons every number afterwards, and none of it should silently start a new
   game over the top of a real one. */

const NUMERIC = ['fruit','must','bottles','terroir','heirlooms','seeds','clicks',
                 'vigour','season','seasonTime','lastSave','saveCount'];

function num(value, fallback) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && isFinite(n) ? n : fallback;
}

/* Counts of things, keyed by id. Anything not on the list is from another
   version and is dropped rather than carried along for ever. */
function cleanCounts(map, ids, cap) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [id, value] of Object.entries(map)) {
    if (!ids.has(id)) continue;
    const n = Math.floor(num(value, 0));
    if (n <= 0) continue;
    out[id] = cap ? Math.min(n, cap(id)) : n;
  }
  return out;
}

function cleanFlags(map, ids) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [id, value] of Object.entries(map)) if (ids.has(id) && value) out[id] = true;
  return out;
}

function sanitise(data) {
  const fresh = freshState();
  const out = { ...fresh, ...data };
  for (const key of NUMERIC) out[key] = Math.max(0, num(data[key], fresh[key] || 0));
  out.season = Math.min(SEASONS.length - 1, Math.floor(out.season)) || 0;
  out.vigour = Math.min(1, out.vigour);

  const nodeRanks = new Map(TREE.map(n => [n.id, n.ranks]));
  out.trees   = cleanCounts(data.trees,   new Set(TREES.map(t => t.id)));
  out.presses = cleanCounts(data.presses, new Set(PRESSES.map(t => t.id)));
  out.casks   = cleanCounts(data.casks,   new Set(CASKS.map(t => t.id)));
  // Ranks are clamped to the node's current maximum: a node whose rank count has
  // been reduced since the save was written would otherwise keep paying out.
  out.tree = cleanCounts(data.tree, new Set(nodeRanks.keys()), id => nodeRanks.get(id));

  out.upgrades     = cleanFlags(data.upgrades,     new Set(UPGRADES.map(u => u.id)));
  out.cultivars    = cleanFlags(data.cultivars,    new Set(CULTIVARS.map(c => c.id)));
  out.achievements = cleanFlags(data.achievements, new Set(ACHIEVEMENTS.map(a => a.id)));

  out.stats = { ...fresh.stats };
  const buildingIds = new Set([...TREES, ...PRESSES, ...CASKS].map(b => b.id));
  for (const [key, value] of Object.entries(data.stats || {})) {
    if (!(key in fresh.stats)) continue;
    // Not every stat is a number: grownEver is a set of ids, and coercing it
    // would quietly wipe the record of everything ever planted.
    if (key === 'grownEver') out.stats.grownEver = cleanFlags(value, buildingIds);
    else if (key === 'vintageHistory') out.stats.vintageHistory = Array.isArray(value) ? value : [];
    else out.stats[key] = Math.max(0, num(value, fresh.stats[key]));
  }

  out.settings = { ...fresh.settings };
  for (const [key, value] of Object.entries(data.settings || {}))
    if (key in fresh.settings) out.settings[key] = value;

  return out;
}

function readSave(key) {
  let raw;
  try { raw = localStorage.getItem(key); } catch (err) { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    // An array parses fine and would merge into nonsense.
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data;
  } catch (err) { return null; }
}

let loadedFromBackup = false;

function load() {
  let data = readSave(SAVE_KEY);
  if (!data) {
    // The main save is unreadable. There is a rolling backup precisely for this,
    // and starting a fresh game over the top of a real one is the worst possible
    // response - within three minutes the backup would be overwritten too.
    data = readSave(BACKUP_KEY);
    if (!data) return null;
    loadedFromBackup = true;
  }
  S = sanitise(data);
  return S.lastSave || null;
}

/* =========================================================== interface */
const $ = id => document.getElementById(id);

function toast(html) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = html;
  $('toasts').append(node);
  setTimeout(() => node.remove(), 5200);
}

const LOG_MAX = 60;
function log(html) {
  const box = $('logBox');
  const line = document.createElement('div');
  line.className = 'log__line';
  const time = new Date().toTimeString().slice(0, 5);
  line.innerHTML = `<span style="opacity:.55">${time}</span> ${html}`;
  box.prepend(line);
  while (box.childElementCount > LOG_MAX) box.lastChild.remove();
}

// stage:true means the chain strip owns it, so it is not repeated as a chip.
const TABS = [
  { id:'grove',    label:'Grove',  stage:true },
  { id:'press',    label:'Press',  stage:true },
  { id:'cellar',   label:'Cellar', stage:true },
  { id:'upgrades', label:'Upgrades' },
  { id:'tree',     label:'Skill tree' },
  { id:'prestige', label:'Vintage' },
  { id:'stats',    label:'Records', needs:'stats' },
  { id:'ach',      label:'Achievements' },
  { id:'settings', label:'Settings' },
];

/* How much of each collection has been found, so a player can tell the
   difference between "that is all of them" and "there is more to come". Counts
   only - naming what is missing would give away the discovery. The denominator
   itself grows when a hidden tier is unlocked, which is the surprise intact. */
const tally = (n) => n < 100000 ? String(Math.round(n)) : fmt(n);

function discovered(what) {
  switch (what) {
    case 'trees': case 'presses': case 'casks': {
      const list = what === 'trees' ? TREES : what === 'presses' ? PRESSES : CASKS;
      const total = list.filter(b => !b.needsUnlock || unlocked(b.needsUnlock)).length;
      return [visibleBuildings(list, S[what]).length, total];
    }
    case 'upgrades': return [UPGRADES.filter(u => upgradeBought(u.id)).length, UPGRADES.length];
    case 'tree': return [Object.values(S.tree).reduce((a, b) => a + b, 0),
                         TREE.reduce((a, n) => a + n.ranks, 0)];
    case 'cultivars': return [CULTIVARS.filter(c => hasCultivar(c.id)).length, CULTIVARS.length];
    case 'ach': return [ACHIEVEMENTS.filter(a => S.achievements[a.id]).length, ACHIEVEMENTS.length];
    default: return null;
  }
}

/* The reveal rule, lifted out of buildingPanel so the counter and the list can
   never disagree about what is on show. */
function visibleBuildings(list, map) {
  return list.filter((item, index) => {
    if (item.needsUnlock && !unlocked(item.needsUnlock)) return false;
    const owned = map[item.id] || 0;
    const previous = index === 0 ? Infinity : (map[list[index - 1].id] || 0);
    return index === 0 || previous > 0 || owned > 0
        || S[currencyOf(list)] >= item.base * 0.35;
  });
}

const TAB_COUNTS = { upgrades: 'upgrades', tree: 'tree', prestige: 'cultivars', ach: 'ach' };

/* This paints ten times a second, so it must update the chips rather than
   rebuild them. Reassigning innerHTML destroys the spans inside, and a press
   that lands on one - the badge or the count - is thrown away when its target
   disappears before the release. That is why only the tab's name responded to a
   click: the name is a text node, so its event target is the button itself,
   which survives; the numbers beside it were replaced mid-press. */
function paintTabs() {
  const bar = $('tabs');
  if (!bar.childElementCount) {
    for (const t of TABS.filter(t => !t.stage)) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.tab = t.id;
      if (t.needs) btn.dataset.needs = t.needs;
      const label = document.createElement('span');
      label.className = 'tab__label';
      label.textContent = t.label;
      const badge = document.createElement('span');
      badge.className = 'tab__badge';
      badge.hidden = true;
      const count = document.createElement('span');
      count.className = 'tab__of';
      count.hidden = true;
      btn.append(label, badge, count);
      btn.addEventListener('click', () => switchTab(t.id));
      bar.append(btn);
    }
  }
  const spendable = TREE.filter(n => canAfford(n)).length;
  const buyable = availableUpgrades().filter(u => S[u.currency] >= u.cost).length;
  for (const btn of bar.children) {
    if (btn.dataset.needs) btn.hidden = !unlocked(btn.dataset.needs);
    btn.classList.toggle('is-on', btn.dataset.tab === activeTab);

    const badge = btn.querySelector('.tab__badge');
    const n = btn.dataset.tab === 'tree' ? spendable
            : btn.dataset.tab === 'upgrades' ? buyable : 0;
    badge.hidden = !n;
    badge.classList.toggle('tab__badge--must', btn.dataset.tab === 'upgrades');
    if (n) badge.textContent = n;

    const countEl = btn.querySelector('.tab__of');
    const count = TAB_COUNTS[btn.dataset.tab] && discovered(TAB_COUNTS[btn.dataset.tab]);
    countEl.hidden = !count;
    if (count) countEl.textContent = `${tally(count[0])}/${tally(count[1])}`;
  }
}

function switchTab(id) {
  activeTab = id;
  const map = { grove:'panelGrove', upgrades:'panelUpgrades', stats:'panelStats', press:'panelPress', cellar:'panelCellar',
                tree:'panelTree', prestige:'panelPrestige', ach:'panelAch',
                settings:'panelSettings' };
  for (const [tab, panel] of Object.entries(map)) $(panel).hidden = tab !== id;
  paintTabs();
  paintStages();
  refreshLive();
  // The tab strip scrolls sideways on a phone, so the tab just chosen - or the
  // one restored on load - may be off screen with nothing to show for it.
  const strip = $('tabs');
  strip.classList.toggle('is-scrollable', strip.scrollWidth > strip.clientWidth + 1);
  const chosen = [...strip.children].find(b => b.dataset.tab === id);
  if (chosen && chosen.scrollIntoView) {
    chosen.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  hideTip();
  if (id === 'tree') { drawTree(); }
  if (id === 'upgrades') paintUpgrades();
  if (id === 'stats') paintStats();
  if (id === 'prestige') paintPrestige();
  if (id === 'ach') paintAchievements();
  if (id === 'settings') paintSettings();
  // The panel has just been built with its live figures empty; fill them before
  // the first frame, or the tab flashes blank for a tenth of a second.
  refreshLive();
}

/* ------------------------------------------------------------ resources */
const RES = [
  { key:'fruit',   label:'Fruit'   },
  { key:'must',    label:'Must'    },
  { key:'bottles', label:'Bottles' },
  // Counted rather than measured, so shown whole: 6 heirlooms, not 6.0.
  { key:'terroir', label:'Terroir',   whole:true },
  { key:'heirlooms', label:'Heirlooms', whole:true },
  { key:'seeds',   label:'Seeds',     whole:true },
];

function paintResources() {
  const bar = $('resBar');
  if (!bar.childElementCount) {
    for (const r of RES) {
      const box = document.createElement('div');
      box.className = 'res__item';
      box.dataset.res = r.key;
      box.innerHTML = `<div class="res__label">${r.label}</div>
        <div class="res__value">0</div><div class="res__rate"></div>`;
      bar.append(box);
    }
  }
  for (const box of bar.children) {
    const key = box.dataset.res;
    const value = S[key] || 0;
    box.hidden = (key === 'terroir' && value === 0 && S.stats.vintages === 0)
              || (key === 'heirlooms' && value === 0 && S.stats.successions === 0)
              || (key === 'seeds' && value === 0 && !(S.stats.lineages > 0))
              || (key === 'must' && value === 0 && S.stats.mustEver === 0)
              || (key === 'bottles' && value === 0 && S.stats.bottlesEver === 0);
    box.querySelector('.res__value').textContent =
      RES.find(r => r.key === key).whole ? tally(value) : fmt(value);
    const rate = S.rates[key];
    const rateEl = box.querySelector('.res__rate');
    rateEl.textContent = rate === undefined ? '' : (rate > 0 ? '+' + fmt(rate) + '/s' : '');
    if (key === 'fruit') {
      const gross = S.rates.fruitGross || 0;
      const taken = Math.max(0, gross - (S.rates.fruit || 0));
      box.title = taken > 0
        ? `Trees make ${fmt(gross)}/s. The presses take ${fmt(taken)}/s of it straight off `
          + `the branch, so ${fmt(S.rates.fruit || 0)}/s reaches your stock. Improving the `
          + `presses takes more, not less — none of it is lost, it becomes must.`
        : 'Fruit reaching your stock.';
    }
  }
}

/** Which stage is actually holding you back. Three rates side by side leave the
 *  player to work it out; naming it turns the panel into a decision. */
function bottleneck() {
  const r = S.rates;
  const gross = r.fruitGross || 0;
  if (gross <= 0) return { where: 'grove', text: 'Nothing planted yet — tend, then buy a seedling.' };
  const wanted = gross * (MOD.pressShare || 0.5);
  if ((r.pressCap || 0) < wanted * 0.95) {
    return { where: 'press', text: 'The presses cannot keep up with the crop — buy presses.' };
  }
  if ((r.cellarCap || 0) < (r.must || 0) * 0.95) {
    return { where: 'cellar', text: 'Must is piling up faster than the cellar can age it — buy casks.' };
  }
  return { where: 'grove', text: 'The presses and cellar have spare capacity — grow the grove.' };
}

/* The three stages are the navigation and the status display at once. Each card
   answers the only question the game really poses - which stage is holding you
   back - by showing how full it is running, and the constriction is drawn rather
   than described. Built once, then updated in place: this repaints ten times a
   second and rebuilding the markup that often is wasteful. */
const STAGES = [
  { id:'grove',  label:'Grove',  noun:'trees',   store:'trees'   },
  { id:'press',  label:'Press',  noun:'presses', store:'presses' },
  { id:'cellar', label:'Cellar', noun:'casks',   store:'casks'   },
];

function buildStages() {
  const bar = $('chainBar');
  STAGES.forEach((st, i) => {
    if (i > 0) {
      const joint = document.createElement('span');
      joint.className = 'joint';
      joint.dataset.carries = i === 1 ? 'fruit' : 'must';
      bar.append(joint);
    }
    const card = document.createElement('button');
    card.className = 'stage';
    card.dataset.stage = st.id;
    card.innerHTML = `<span class="stage__label">${st.label}</span>
      <span class="stage__rate">0/s</span>
      <span class="stage__sub"><span class="stage__count">0</span><span
        class="stage__noun"> ${st.noun}</span><span class="stage__of"></span></span>
      <span class="stage__meter"><i></i></span>`;
    card.addEventListener('click', () => switchTab(st.id));
    bar.append(card);
  });
}

function paintStages() {
  const bar = $('chainBar');
  if (!bar.childElementCount) buildStages();
  const r = S.rates;
  const limit = bottleneck();
  const gross = r.fruitGross || 0;
  const diverted = Math.max(0, gross - (r.fruit || 0));

  // Grove has no ceiling, so its meter shows where the crop is going rather than
  // how full it is: the filled part is what the presses are taking. Press and
  // cellar show plain utilisation, and a full one is the constriction.
  const read = {
    grove:  { rate: gross,          fill: gross > 0 ? diverted / gross : 0 },
    press:  { rate: r.must || 0,    fill: r.pressCap  > 0 ? Math.min(1, (r.pressed || 0) / r.pressCap) : 0 },
    cellar: { rate: r.bottles || 0, fill: r.cellarCap > 0 ? Math.min(1, (r.aged || 0) / r.cellarCap) : 0 },
  };

  for (const card of bar.querySelectorAll('.stage')) {
    const st = STAGES.find(x => x.id === card.dataset.stage);
    const owned = Object.values(S[st.store] || {}).reduce((a, b) => a + b, 0);
    const d = read[st.id];
    const [found, total] = discovered(st.store);
    card.querySelector('.stage__rate').textContent = fmt(d.rate) + '/s';
    card.querySelector('.stage__count').textContent = fmt(owned);
    card.querySelector('.stage__of').textContent = ` · ${found}/${total}`;
    card.querySelector('.stage__meter i').style.width = (d.fill * 100).toFixed(1) + '%';
    card.classList.toggle('is-on', activeTab === st.id);
    card.classList.toggle('is-pinned', st.id !== 'grove' && limit.where === st.id);
  }
  const joints = bar.querySelectorAll('.joint');
  joints[0].classList.toggle('is-flowing', diverted > 0);
  joints[1].classList.toggle('is-flowing', (r.must || 0) > 0);

  paintAdvice(limit);
}

/* Its own function, and only written when the wording actually changes. It is
   not something you press, but rewriting a line of text ten times a second also
   cancels any attempt to select it. */
let adviceShown = null;
function paintAdvice(limit) {
  if (limit.text === adviceShown) return;
  adviceShown = limit.text;
  $('adviceLine').innerHTML = limit.text;
}

function paintSeason() {
  const s = SEASONS[S.season];
  $('seasonName').textContent = s.name;
  $('seasonEffect').textContent = s.effect;
  $('seasonArc').setAttribute('stroke', s.colour);
}

function paintSeasonArc() {
  const fraction = Math.min(1, S.seasonTime / (MOD.seasonLength || 180));
  $('seasonArc').setAttribute('stroke-dashoffset', String(94.2 * (1 - fraction)));
}

/* ------------------------------------------------------------ buildings */
function buildingPanel(panelId, list, mapKey, title, blurb) {
  const panel = $(panelId);
  const map = S[mapKey];
  if (!panel.dataset.built) {
    panel.dataset.built = '1';
    panel.innerHTML = `<p class="hint">${blurb}</p>
      <div class="buy-row">
        ${[1, 10, 100, 1000, 10000, 'Max'].map(n =>
          `<button data-buy="${n}" ${n === 1000 ? 'data-needs="bulk"'
                                   : n === 10000 ? 'data-needs="bulk10k"' : ''}>
             ${n === 'Max' ? 'Max' : '×' + n.toLocaleString('en-GB')}</button>`).join('')}
        <button data-best data-needs="buybest" title="Buy the best thing you can afford (B)">
          Buy best</button>
        <label class="toggle auto-toggle" data-auto hidden
               title="The Barrow buys for you. Turn it off while saving for a tier.">
          <input type="checkbox" data-auto-input> <span>Auto</span>
        </label>
      </div>
      <div class="group-title">${title}<span data-found class="group-title__of"></span></div>
      <div data-list></div>`;
    panel.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        buyAmount = btn.dataset.buy === 'Max' ? 'Max' : Number(btn.dataset.buy);
        paintBuildings();
      });
    });
  }
  panel.querySelectorAll('[data-buy]').forEach(btn =>
    btn.classList.toggle('is-on', String(buyAmount) === btn.dataset.buy));
  panel.querySelectorAll('[data-needs]').forEach(btn => {
    btn.hidden = !unlocked(btn.dataset.needs);
  });
  const autoWrap = panel.querySelector('[data-auto]');
  if (autoWrap) {
    autoWrap.hidden = !MOD.autoBuyUnlocked;
    const box = autoWrap.querySelector('[data-auto-input]');
    if (!box.dataset.wired) {
      box.dataset.wired = '1';
      box.addEventListener('change', (e) => {
        S.settings.autoBuy = e.target.checked;
        toast(e.target.checked ? 'The barrow is buying for you again.'
                               : 'Auto-buying off — your fruit is yours to spend.');
        recalc();
        paintBuildings();
      });
    }
    if (box.checked !== (S.settings.autoBuy !== false)) {
      box.checked = S.settings.autoBuy !== false;
    }
  }

  const bestBtn = panel.querySelector('[data-best]');
  if (bestBtn && !bestBtn.dataset.wired) {
    bestBtn.dataset.wired = '1';
    bestBtn.addEventListener('click', buyBest);
  }

  // Later tiers stay hidden until the one before is under way, which keeps the
  // early screen calm; the heading says how many are still to come.
  const shown = new Set(visibleBuildings(list, map).map(b => b.id));
  const [found, total] = discovered(mapKey);
  panel.querySelector('[data-found]').textContent =
    found >= total ? `all ${total} found` : `${found} of ${total} found`;

  const holder = panel.querySelector('[data-list]');
  list.forEach((item, index) => {
    const owned = map[item.id] || 0;
    let row = holder.querySelector(`[data-id="${item.id}"]`);
    if (!shown.has(item.id)) { if (row) row.remove(); return; }
    if (!row) {
      row = document.createElement('button');
      row.className = 'build';
      row.dataset.id = item.id;
      row.innerHTML = `<span class="build__icon">${item.glyph}</span>
        <span><span class="build__name"></span>
        <span class="build__desc"></span>
        <span class="build__trait"></span></span>
        <span class="build__right"><span class="build__cost"></span>
        <span class="build__owned"></span></span>`;
      // Look the collection up at click time rather than capturing it. Prestige
      // replaces the whole state object, and a captured reference would go on
      // writing into the discarded one - purchases vanishing until a reload.
      row.addEventListener('click', () => buy(list, mapKey, item));
      holder.append(row);
    }
    const currency = currencyOf(list);
    const purse = S[currency];
    const count = buyAmount === 'Max'
      ? Math.max(1, maxAffordable(list, map, item, purse)) : buyAmount;
    const cost = costOf(list, map, item, count);
    const each = list === TREES ? `${fmt(item.rate)} fruit/s`
               : list === PRESSES ? `${fmt(item.rate)} must/s`
               : `${fmt(item.rate)} bottles/s`;
    row.querySelector('.build__name').textContent = item.name;
    row.querySelector('.build__desc').textContent = `${item.desc} — ${each} each`;
    const traitEl = row.querySelector('.build__trait');
    const trait = traitText(item);
    traitEl.textContent = trait;
    traitEl.hidden = !trait;
    // A variety in its own season is the one thing here that changes minute to
    // minute, so it is worth marking rather than leaving the player to notice.
    traitEl.classList.toggle('is-live',
      !!(item.trait && item.trait.season === SEASONS[S.season].name));
    const costEl = row.querySelector('.build__cost');
    costEl.textContent = `${fmt(cost)} ${currency}${count > 1 ? ` ×${count}` : ''}`;
    costEl.classList.toggle('affordable', cost <= purse);
    row.querySelector('.build__owned').textContent = owned ? `owned ${owned}` : '';
    row.disabled = cost > purse;
  });
}

function buy(list, mapKey, item) {
  recalc();
  S.stats.grownEver = S.stats.grownEver || {};
  S.stats.grownEver[item.id] = true;
  const map = S[mapKey];
  const currency = currencyOf(list);
  const purse = S[currency];
  const count = buyAmount === 'Max' ? maxAffordable(list, map, item, purse) : buyAmount;
  if (count <= 0) return;
  const cost = costOf(list, map, item, count);
  if (cost > purse) return;
  S[currency] -= cost;
  map[item.id] = (map[item.id] || 0) + count;
  if ((map[item.id] === count) && count > 0) log(`Planted the first <b>${item.name}</b>.`);
  paintBuildings();
}

/** Buys the most expensive thing currently affordable, across all three shops.
 *  Late runs otherwise involve a lot of clicking through tiers to find it. */
function buyBest() {
  recalc();
  let best = null;
  for (const [list, key] of [[TREES, 'trees'], [PRESSES, 'presses'], [CASKS, 'casks']]) {
    for (const item of list) {
      if (item.needsUnlock && !unlocked(item.needsUnlock)) continue;
      const cost = costOf(list, S[key], item, 1);
      if (cost <= S[currencyOf(list)] && (!best || cost > best.cost)) {
        best = { list, key, item, cost };
      }
    }
  }
  if (!best) { toast('Nothing affordable just yet.'); return; }
  S[currencyOf(best.list)] -= best.cost;
  S[best.key][best.item.id] = (S[best.key][best.item.id] || 0) + 1;
  paintBuildings();
}

function paintBuildings() {
  buildingPanel('panelGrove', TREES, 'trees', 'Trees',
    'Trees make fruit. Fruit is the root of everything else here. Each variety '
    + 'also has a character of its own: some lift their neighbours, some come into '
    + 'their own for one season, some send part of the crop straight down the '
    + 'chain. A mixed orchard beats a stack of the newest thing.');
  buildingPanel('panelPress', PRESSES, 'presses', 'Presses',
    'Presses take fruit straight from the trees — up to half of what they produce, before it reaches your stock. Presses beyond that share sit idle, so grow the grove alongside them.');
  buildingPanel('panelCellar', CASKS, 'casks', 'Casks',
    'The cellar ages must into bottles, and casks are bought with must rather than fruit. Bottles are what a vintage is judged on.');
}

/* ------------------------------------------------------------ skill tree */
const TREE_SCALE = 62;
let view = { x: 0, y: 0, zoom: 1 };

/* Two separate readings, because they answer different questions. The fill says
   how far into this node you are; the ring says whether you can do anything
   about it right now. A node at 3/6 that you can afford keeps its "you have
   invested here" fill and gains an affordable ring - merging them into one
   green would lose the progress. */
function nodeState(node) {
  const r = rank(node.id);
  if (r >= node.ranks) return 'maxed';
  if (r > 0) return 'taken';
  return prerequisitesMet(node) ? 'fresh' : 'locked';
}

function paintTreeHud() {
  const [ranksBought, ranksTotal] = discovered('tree');
  $('treeSpend').textContent =
    `${fmt(S.terroir)} terroir · ${tally(ranksBought)}/${tally(ranksTotal)} learnt`;
  // Shift-click does this too; the toggle is for anything without a shift key.
  const on = !!S.settings.buyMaxNodes;
  const btn = $('treeBuyMax');
  btn.classList.toggle('is-on', on);
  btn.textContent = on ? 'Buy max: on' : 'Buy max';

  const all = $('treeBuyAll');
  const ranks = eachAffordableRank(false);
  all.disabled = ranks === 0;
  all.textContent = ranks ? `Buy all (${tally(ranks)})` : 'Buy all';
}

function nodeAfford(node) {
  if (rank(node.id) >= node.ranks) return 'done';
  if (!prerequisitesMet(node)) return 'shut';      // no price would help
  return S.terroir >= nodeCost(node) ? 'can-buy' : 'too-dear';
}

/* How many more ranks the terroir on hand would carry, given the cost climbs
   RANK_GROWTH per rank. */
function affordableRanks(node) {
  let purse = S.terroir, taken = 0, r = rank(node.id);
  if (!prerequisitesMet(node)) return 0;
  while (r + taken < node.ranks) {
    const cost = Math.ceil(node.cost * Math.pow(RANK_GROWTH, r + taken));
    if (purse < cost) break;
    purse -= cost; taken++;
  }
  return taken;
}

/* Cheapest rank first, across the whole tree, until the terroir runs out.
   Repeated rather than one pass, because a rank can satisfy another node's
   prerequisites and open something cheaper than whatever is left. Counting and
   buying share this loop so the button's number cannot disagree with what
   pressing it does. */
function eachAffordableRank(spend) {
  // When spending, the real state moves under us and there is nothing to model.
  // When only counting, the ranks and the purse are tracked here instead. Using
  // both at once double-counted every rank, so the button's number was half
  // again what pressing it actually bought.
  const virtual = {};
  let purse = S.terroir, taken = 0;
  const rankOf = id => rank(id) + (spend ? 0 : (virtual[id] || 0));
  for (let guard = 0; guard < 2000; guard++) {
    const money = spend ? S.terroir : purse;
    let best = null, bestCost = Infinity;
    for (const node of TREE) {
      const at = rankOf(node.id);
      if (at >= node.ranks) continue;
      if (!node.needs.every(id => rankOf(id) > 0)) continue;
      const cost = Math.ceil(node.cost * Math.pow(RANK_GROWTH, at));
      if (cost <= money && cost < bestCost) { best = node; bestCost = cost; }
    }
    if (!best) break;
    taken++;
    if (spend) buyNode(best, true);
    else { purse -= bestCost; virtual[best.id] = (virtual[best.id] || 0) + 1; }
  }
  return taken;
}

function buyAllNodes() {
  const bought = eachAffordableRank(true);
  if (bought) {
    recalc(); drawTree(); paintAll();
    toast(`<b>${bought}</b> rank${bought > 1 ? 's' : ''} learnt.`);
  }
  return bought;
}

/* Buy as far up the node as the purse reaches, rather than all-or-nothing. */
function buyNodeMax(node) {
  let bought = 0;
  while (buyNode(node, true)) bought++;
  if (bought) {
    recalc(); drawTree(); paintAll();
    toast(`<b>${node.name}</b> — ${bought} rank${bought > 1 ? 's' : ''} learnt.`);
  }
  return bought;
}

function prerequisitesMet(node) {
  if (node.needs.length && !node.needs.every(id => rank(id) > 0)) return false;
  if (node.needPoints) {
    for (const [branch, need] of Object.entries(node.needPoints)) {
      if (branchPoints(branch) < need) return false;
    }
  }
  return true;
}

/* Each rank costs this much more than the last. It lives here once because it
   was written out in five places, which is how a tuning number quietly stops
   agreeing with itself. Raised from 1.75 to 3.0: the whole tree went from 619k
   terroir to 42.2M, while the first rank of every node is untouched at 7.41k
   all told - the cost of finishing a node climbed, the cost of starting one
   did not. */
const RANK_GROWTH = 3.0;

function nodeCost(node) {
  // Each rank costs a little more than the last, so maxing a node is a real
  // commitment rather than an automatic follow-up.
  return Math.ceil(node.cost * Math.pow(RANK_GROWTH, rank(node.id)));
}

function canAfford(node) {
  return rank(node.id) < node.ranks && prerequisitesMet(node)
         && S.terroir >= nodeCost(node);
}

function effectText(node) {
  const NAMES = {
    treeMult:'tree output', pressMult:'press output', cellarMult:'cellar output',
    clickMult:'tending', allMult:'everything', pressYield:'must per fruit',
    bottleValue:'bottles per must', terroirGain:'terroir gained',
    cheapTrees:'tree cost reduction', treeSynergy:'per-tree synergy',
    vigourRate:'vigour build-up', vigourPower:'burst power', vigourKeep:'vigour kept after a burst',
    clickFromRate:'tending scales with fruit/s', offlineRate:'offline efficiency',
    offlineCap:'offline hours', seasonLength:'season length', autoBuy:'auto-buying',
    keepBottles:'bottles kept through a vintage', startTrees:'seedlings after a vintage',
    seasonSoften:'off-season penalty reduced', seasonBoost:'in-season bonus',
    keepTree:'trees kept through a vintage',
    pressShare:'share of the crop the presses may take',
  };
  /* Math.round on a small percentage throws the whole thing away: Coppice is
     0.004, which is 0.4% and rounded to "+0%" - a node advertising that it does
     nothing, while actually being one of the strongest in the tree. Keep enough
     decimals for the figure to survive. */
  const pct = (v) => {
    const n = v * 100;
    if (Math.abs(n) >= 10) return String(Math.round(n));
    if (Math.abs(n) >= 1) return n.toFixed(1).replace(/\.0$/, '');
    return n.toFixed(2).replace(/0$/, '');
  };
  return Object.entries(node.eff).map(([key, value]) => {
    const label = NAMES[key] || key;
    if (key === 'offlineCap') return `+${value}h ${label}`;
    if (key === 'startTrees') return `+${value} ${label}`;
    if (key === 'autoBuy') return `unlocks ${label}, which can be switched off`;
    if (key === 'seasonLength') return `${pct(value)}% ${label}`;
    // These two approach their ceiling rather than marching into it, so the
    // headline figure is what the first rank is worth, not the tenth.
    if (key === 'offlineRate' || key === 'vigourKeep')
      return `+${pct(value)}% ${label}, diminishing`;
    // Synergy is per tree owned, not a flat bonus - without saying so, "+0.4%"
    // reads as trivial when at 600 trees it is +240% a rank.
    if (key === 'treeSynergy') return `+${pct(value)}% tree output per tree owned`;
    return `+${pct(value)}% ${label}`;
  }).join(', ');
}

function drawTree() {
  const svg = $('treeSvg');
  const wrap = $('treeWrap');
  svg.innerHTML = '';
  const w = wrap.clientWidth || 800, h = wrap.clientHeight || 600;
  const cx = w / 2 + view.x, cy = h / 2 + view.y;
  const px = (n) => cx + n.x * TREE_SCALE * view.zoom;
  const py = (n) => cy + n.y * TREE_SCALE * view.zoom;

  const linkLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const nodeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.append(linkLayer, nodeLayer);

  for (const node of TREE) {
    for (const needId of node.needs) {
      const from = TREE_BY_ID[needId];
      if (!from) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', px(from)); line.setAttribute('y1', py(from));
      line.setAttribute('x2', px(node)); line.setAttribute('y2', py(node));
      line.setAttribute('class', 'tree-link'
        + (rank(node.id) ? ' is-taken' : prerequisitesMet(node) ? ' is-open' : ''));
      linkLayer.append(line);
    }
  }

  for (const node of TREE) {
    const state = nodeState(node);
    const r = (node.big ? 26 : 20) * view.zoom;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'node-hit');
    g.dataset.node = node.id;      // activation is resolved from this, not from a
                                   // listener, because drawTree replaces every
                                   // element and would take the listener with it

    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    shape.setAttribute('cx', px(node)); shape.setAttribute('cy', py(node));
    shape.setAttribute('r', r);
    shape.setAttribute('class', `node-body ${state} afford-${nodeAfford(node)}`);
    g.append(shape);

    if (state === 'maxed') {          // a doubled ring, so it reads without colour
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', px(node)); ring.setAttribute('cy', py(node));
      ring.setAttribute('r', r + 4.5 * view.zoom);
      ring.setAttribute('class', 'node-ring-done');
      g.append(ring);
    }

    const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    glyph.setAttribute('x', px(node)); glyph.setAttribute('y', py(node));
    glyph.setAttribute('class', 'node-glyph');
    glyph.style.fontSize = (node.big ? 19 : 15) * view.zoom + 'px';
    glyph.textContent = node.glyph;
    g.append(glyph);

    if (view.zoom > 0.75) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', px(node)); label.setAttribute('y', py(node) + r + 12 * view.zoom);
      label.setAttribute('class', 'node-name');
      label.style.fontSize = 10 * view.zoom + 'px';
      label.textContent = node.name;
      g.append(label);
    }

    if (node.ranks > 1) {
      const ranks = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      ranks.setAttribute('x', px(node)); ranks.setAttribute('y', py(node) - r - 5 * view.zoom);
      ranks.setAttribute('class', 'node-rank');
      ranks.style.fontSize = 9 * view.zoom + 'px';
      ranks.textContent = `${rank(node.id)}/${node.ranks}`;
      g.append(ranks);
    }

    g.addEventListener('mouseenter', (e) => { if (!coarsePointer()) showTip(node, e); });
    g.addEventListener('mousemove', (e) => { if (!coarsePointer()) positionTip(e); });
    g.addEventListener('mouseleave', () => { if (!coarsePointer()) hideTip(); });
    nodeLayer.append(g);
  }

  paintTreeHud();
}

let tipEl = null;
let tipNode = null;
/* A touch screen has no hover, so the tree needs a different grammar: first tap
   inspects a node, second tap on the same node learns it. Desktop keeps hover
   to inspect and one click to learn. */
// Guarded: if this throws, it throws inside the tree's pointer handler and takes
// every interaction with the tree down with it. Assume a mouse when unsure.
const coarsePointer = () =>
  !!(window.matchMedia && window.matchMedia('(hover: none)').matches);

function showTip(node, event) {
  hideTip();
  tipNode = node;
  tipEl = document.createElement('div');
  tipEl.className = 'tree-tip';
  const r = rank(node.id);
  const branchName = node.b === 'cross' ? 'Cross-branch' : BRANCHES[node.b].name;
  let needs = '';
  if (!prerequisitesMet(node)) {
    const missing = [];
    for (const id of node.needs) if (!rank(id)) missing.push(TREE_BY_ID[id].name);
    if (node.needPoints) {
      for (const [branch, need] of Object.entries(node.needPoints)) {
        if (branchPoints(branch) < need) {
          missing.push(`${need} points in ${BRANCHES[branch].name} (you have ${branchPoints(branch)})`);
        }
      }
    }
    needs = `<div class="need">Needs: ${missing.join(', ')}</div>`;
  }
  tipEl.innerHTML = `<div class="branch">${branchName}</div>
    <h4>${node.name}</h4>
    <div class="effect">${effectText(node)} <span style="color:var(--muted)">per rank</span></div>
    <div class="effect" style="color:var(--muted)">Rank ${r} of ${node.ranks}</div>
    ${r < node.ranks ? `<div class="cost">${fmt(nodeCost(node))} terroir</div>` : ''}
    ${needs}
    ${coarsePointer() && r < node.ranks && prerequisitesMet(node) && canAfford(node)
      ? '<div class="effect" style="color:var(--terroir)">Tap it again to learn it.</div>' : ''}`;
  $('treeWrap').append(tipEl);
  if (event && !coarsePointer()) positionTip(event);
  else tipEl.classList.add('is-sheet');
}

function positionTip(event) {
  if (!tipEl) return;
  const wrap = $('treeWrap').getBoundingClientRect();
  let x = event.clientX - wrap.left + 16;
  let y = event.clientY - wrap.top + 16;
  if (x + 300 > wrap.width) x = event.clientX - wrap.left - 306;
  if (y + 160 > wrap.height) y = Math.max(8, event.clientY - wrap.top - 170);
  tipEl.style.left = x + 'px';
  tipEl.style.top = y + 'px';
}

function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } tipNode = null; }

/* quiet: used by buyNodeMax, which reports once at the end rather than toasting
   and redrawing for every rank in a run of them. */
function buyNode(node, quiet) {
  if (rank(node.id) >= node.ranks) return false;
  if (!prerequisitesMet(node)) {
    if (!quiet) toast('Locked — select it to see what it needs.');
    return false;
  }
  const cost = nodeCost(node);
  if (S.terroir < cost) {
    if (!quiet) toast(`Needs ${fmt(cost)} terroir.`);
    return false;
  }
  S.terroir -= cost;
  S.stats.terroirSpent += cost;
  S.tree[node.id] = rank(node.id) + 1;
  recalc();
  log(`Learned <b>${node.name}</b> (rank ${rank(node.id)}).`);
  if (!quiet) { drawTree(); hideTip(); }
  checkAchievements();
  return true;
}

let treeDragMoved = false;

/* Pointer events rather than mouse events: one code path covers mouse, finger
   and pen, and it gives us the second finger for free, which is the only way to
   zoom on a phone - there is no wheel. */
function setupTreePanning() {
  const wrap = $('treeWrap');
  const active = new Map();          // pointerId -> latest position
  let startX = 0, startY = 0, originX = 0, originY = 0;
  let pinchStart = 0, zoomStart = 1, pressed = null, pressedId = null;

  const spread = () => {
    const [a, b] = [...active.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const setZoom = (z) => { view.zoom = Math.min(1.8, Math.max(0.45, z)); };

  wrap.addEventListener('pointerdown', (e) => {
    // Suppress the browser's own drag-and-select, but not on the HUD buttons,
    // which still need their ordinary click behaviour.
    if (!(e.target.closest && e.target.closest('button'))) e.preventDefault();
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 1) {
      treeDragMoved = false;
      startX = e.clientX; startY = e.clientY;
      originX = view.x; originY = view.y;
      wrap.classList.add('is-dragging');
      // Which node the press started on. Not a click listener on the node and
      // not pointer capture on the wrapper: capture retargets the derived click
      // to the capturing element, and drawTree rebuilds the whole svg on every
      // pointermove, so a single pixel of drift destroys the element that was
      // pressed. Either one on its own loses the click.
      pressed = e.target.closest ? e.target.closest('[data-node]') : null;
      pressedId = pressed ? pressed.dataset.node : null;
    } else if (active.size === 2) {
      pinchStart = spread(); zoomStart = view.zoom;
      treeDragMoved = true;         // a pinch is never a tap
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size >= 2) {
      if (pinchStart > 0) setZoom(zoomStart * (spread() / pinchStart));
      drawTree();
      return;
    }
    view.x = originX + (e.clientX - startX);
    view.y = originY + (e.clientY - startY);
    // A finger is never as still as a mouse, so the tap threshold has to be
    // looser than the 4px that was here, or every tap counts as a drag.
    if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 10) treeDragMoved = true;
    drawTree();
  });

  const release = (e) => {
    if (!active.has(e.pointerId)) return;
    active.delete(e.pointerId);
    if (active.size < 2) pinchStart = 0;
    if (active.size > 0) return;
    wrap.classList.remove('is-dragging');
    const id = pressedId;
    pressedId = null;
    if (treeDragMoved) { treeDragMoved = false; return; }   // that was a pan
    const node = id ? TREE_BY_ID[id] : null;
    if (!node) { hideTip(); return; }                       // bare canvas
    // On a touch screen the first tap reads the node and the second learns it;
    // with a mouse the tooltip is already open from hovering, so one press does.
    if (coarsePointer() && tipNode !== node) { showTip(node); return; }
    // Shift for a mouse; the HUD toggle for anything without a shift key.
    if (e.shiftKey || S.settings.buyMaxNodes) buyNodeMax(node);
    else buyNode(node);
  };
  wrap.addEventListener('pointerup', release);
  window.addEventListener('pointerup', release);       // finger lifted off the edge
  $('treeBuyMax').addEventListener('click', () => {
    S.settings.buyMaxNodes = !S.settings.buyMaxNodes;
    paintTreeHud();
  });
  $('treeBuyAll').addEventListener('click', () => buyAllNodes());
  wrap.addEventListener('dragstart', (e) => e.preventDefault());
  wrap.addEventListener('pointercancel', release);

  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(view.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
    drawTree();
  }, { passive: false });

  $('treeReset').addEventListener('click', () => {
    view = { x: 0, y: 0, zoom: 1 }; drawTree();
  });
  $('treeRespec').addEventListener('click', respec);
}

function respec() {
  const spent = TREE.reduce((total, n) => {
    let sum = 0;
    for (let i = 0; i < rank(n.id); i++) sum += Math.ceil(n.cost * Math.pow(RANK_GROWTH, i));
    return total + sum;
  }, 0);
  if (spent <= 0) { toast('Nothing to refund yet.'); return; }
  const refund = Math.floor(spent * 0.8);
  if (!confirm(`Refund every skill point for ${fmt(refund)} terroir? `
    + `That is 80% of the ${fmt(spent)} you spent — the rest is lost.`)) return;
  S.tree = {};
  S.terroir += refund;
  recalc();
  log(`Respecced for <b>${fmt(refund)} terroir</b>.`);
  drawTree();
}



/* ------------------------------------------------------- prestige panel */
/* These panels are built once when you open them, so their figures used to sit
   frozen until you left the tab and came back. They cannot simply be repainted
   on the tick - rebuilding markup underneath a press is what was swallowing
   clicks - so instead every live figure is marked in the template and only its
   text is rewritten. The markup, and anything you might be pressing, stays put.

   live('key') in a template, LIVE.key returning the string here. */
const LIVE = {};
const live = (key) => `<span data-live="${key}"></span>`;

/* Buttons need their label and whether they are pressable, not just a number. */
const LIVE_BTN = {};

function refreshLive() {
  const panel = [...document.querySelectorAll('.panel')].find(p => !p.hidden);
  if (!panel) return;
  // The strands are registered by name, so they survive the list changing.
  if (panel.id === 'panelStats')
    for (const s of completion().strands)
      LIVE['strand-' + s.name] = () => `${tally(s.got)} / ${tally(s.of)}`;
  for (const el of panel.querySelectorAll('[data-live]')) {
    const fn = LIVE[el.dataset.live];
    if (!fn) continue;
    const value = fn();
    if (el.textContent !== value) el.textContent = value;
  }
  for (const el of panel.querySelectorAll('[data-live-btn]')) {
    const fn = LIVE_BTN[el.dataset.liveBtn];
    if (!fn) continue;
    const { label, ready } = fn();
    if (el.textContent.trim() !== label) el.textContent = label;
    el.disabled = !ready;
  }
}

Object.assign(LIVE, {
  completionPct: () => {
    const pct = completion().overall * 100;
    // Never round up to 100 until it really is: seeing 100% with things left to
    // do is worse than seeing 99.9%.
    return (pct >= 100 ? 100 : Math.min(99.9, pct)).toFixed(1) + '%';
  },
  // Records
  runFor:       () => fmtTime((Date.now() - (S.stats.runStarted || Date.now())) / 1000),
  played:       () => fmtTime((Date.now() - S.stats.started) / 1000),
  holdingBack:  () => bottleneck().text.replace(/<[^>]+>/g, ''),
  terroirHour:  () => {
    const t = (Date.now() - S.stats.started) / 1000;
    const all = S.stats.terroirAllTime || S.stats.terroirEver || 0;
    return fmt(t > 0 ? all / (t / 3600) : 0) + ' / hour';
  },
  allTerroir:   () => fmt(S.stats.terroirAllTime || S.stats.terroirEver || 0),
  bestBottles:  () => fmt(S.stats.bestBottles || 0),
  bestRanks:    () => `${tally(S.stats.bestTreeRanks || 0)} / ${TREE.reduce((a, n) => a + n.ranks, 0)}`,
  bestUpgrades: () => `${tally(S.stats.bestUpgrades || 0)} / ${UPGRADES.length}`,
  everGrown:    () => `${tally(Object.keys(S.stats.grownEver || {}).length)} / ${
                        TREES.length + PRESSES.length + CASKS.length}`,
  bottlesRun:   () => fmt(S.bottles),
  vintageGain:  () => fmt(terroirFor(S.bottles)),
  nextTerroir:  () => fmt(Math.pow((terroirFor(S.bottles) + 1) / (3.5 * MOD.terroirGain), 1 / 0.45)
                          * VINTAGE_MIN) + ' bottles',
  vintages:     () => String(S.stats.vintages),
  bestVintage:  () => fmt(S.stats.bestVintage),
  terroirLine:  () => fmt(S.stats.terroirEver),
  // Heirlooms and seeds are counted, not measured - tally, never fmt.
  heirloomsNow: () => tally(S.heirlooms),
  heirWaiting:  () => tally(Math.max(0, heirloomsFor(S.stats.terroirEver) - S.heirlooms)),
  successions:  () => String(S.stats.successions),
  seedsNow:     () => tally(S.seeds),
  seedWaiting:  () => tally(Math.max(0, seedsFor(S.stats.heirloomsEver || 0) - (S.stats.seedsClaimed || 0))),
  lineages:     () => String(S.stats.lineages || 0),
  heirloomsEver:() => tally(S.stats.heirloomsEver || 0),
});
Object.assign(LIVE_BTN, {
  vintage: () => {
    const gain = terroirFor(S.bottles);
    return { ready: gain > 0,
      label: gain > 0 ? `Bottle the vintage for ${fmt(gain)} terroir`
                      : `Not ready — needs ${fmt(VINTAGE_MIN)} bottles` };
  },
  succession: () => {
    const gain = heirloomsFor(S.stats.terroirEver) - S.heirlooms;
    return { ready: gain > 0,
      label: gain > 0 ? `Hand it on for ${tally(gain)} heirlooms`
        : `Not yet — needs ${fmt(40000 * Math.pow(S.heirlooms + 1, 1 / 0.34))} lifetime terroir` };
  },
  lineage: () => {
    const gain = seedsFor(S.stats.heirloomsEver || 0) - (S.stats.seedsClaimed || 0);
    return { ready: gain > 0,
      label: gain > 0 ? `Begin a new lineage for ${tally(gain)} seed${gain > 1 ? 's' : ''}`
                      : 'Not yet — earn more heirlooms first' };
  },
});

function paintPrestige() {
  recalc();
  // the figures below are filled by refreshLive once the markup is in place
  const gain = terroirFor(S.bottles);
  const need = VINTAGE_MIN;
  const heirGain = heirloomsFor(S.stats.terroirEver) - S.heirlooms;
  const seedGain = seedsFor(S.stats.heirloomsEver || 0) - (S.stats.seedsClaimed || 0);
  // Must invert terroirFor exactly. It used 3 where the payout uses 3.5, and
  // squared where the payout raises to 0.45, so it reported a threshold below
  // the player's current bottles - a target already passed.
  const nextTerroir = Math.pow((gain + 1) / (3.5 * MOD.terroirGain), 1 / 0.45)
                        * VINTAGE_MIN;

  $('panelPrestige').innerHTML = `
    <div class="prestige-card">
      <h3>Bottle the vintage</h3>
      <p class="hint" style="margin:6px 0 0">
        Ends the run. Fruit, must, presses, casks and trees go; terroir, the skill tree and
        achievements stay. Terroir is what buys skill nodes, so a vintage is how you get
        stronger — not a setback.
      </p>
      <div class="datum" style="margin-top:12px">
        <span>Bottles this run</span><span>${live('bottlesRun')}</span></div>
      <div class="datum"><span>Terroir if you bottle now</span>
        <span style="color:var(--terroir)">${live('vintageGain')}</span></div>
      <div class="datum"><span>Next terroir at</span>
        <span>${live('nextTerroir')}</span></div>
      <div class="datum"><span>Vintages bottled</span><span>${live('vintages')}</span></div>
      <div class="datum"><span>Best single vintage</span><span>${live('bestVintage')}</span></div>
      <button class="big-btn" id="doVintage" data-live-btn="vintage"></button>
    </div>

    <div class="prestige-card">
      <h3>Succession</h3>
      <p class="hint" style="margin:6px 0 0">
        The deeper reset. Hand the estate to the next generation: terroir and the whole skill
        tree go, and you gain heirlooms. Each heirloom is a permanent <b>+25% to everything</b>,
        through every vintage that follows. Only worth doing once a run has slowed right down.
      </p>
      <div class="datum" style="margin-top:12px">
        <span>Terroir earned this lineage</span><span>${live('terroirLine')}</span></div>
      <div class="datum"><span>Heirlooms held</span>
        <span style="color:var(--heirloom)">${live('heirloomsNow')}</span></div>
      <div class="datum"><span>Heirlooms waiting</span>
        <span style="color:var(--heirloom)">${live('heirWaiting')}</span></div>
      <div class="datum"><span>Successions</span><span>${live('successions')}</span></div>
      <button class="big-btn heir" id="doSuccession" data-live-btn="succession"></button>
    </div>

    ${(S.stats.heirloomsEver || 0) > 0 || S.seeds > 0 || S.stats.lineages ? `
    <div class="prestige-card">
      <h3>Lineage</h3>
      <p class="hint" style="margin:6px 0 0">
        The last reset, and the slowest. Heirlooms, terroir, the tree and the lifetime
        terroir behind your heirlooms all go, and you gain <b>seeds</b>. Seeds establish
        <b>cultivars</b> — permanent changes to how the estate works rather than another
        multiplier. Heirlooms are earned again from nothing, which goes quicker second time
        round, because the cultivars stay. Nothing here is worth rushing.
      </p>
      <div class="datum" style="margin-top:12px">
        <span>Heirlooms earned, all time</span><span>${live('heirloomsEver')}</span></div>
      <div class="datum"><span>Seeds held</span>
        <span style="color:var(--bottle)">${live('seedsNow')}</span></div>
      <div class="datum"><span>Seeds waiting</span>
        <span style="color:var(--bottle)">${live('seedWaiting')}</span></div>
      <div class="datum"><span>Lineages</span><span>${live('lineages')}</span></div>
      <button class="big-btn seed" id="doLineage" data-live-btn="lineage"></button>
    </div>

    <div class="prestige-card">
      <h3>Cultivars<span class="group-title__of">${
        discovered('cultivars').map(tally).join(' of ')} established</span></h3>
      <p class="hint" style="margin:6px 0 12px">
        Bought with seeds and kept for ever, through every reset there is.</p>
      <div id="cultivarList"></div>
    </div>` : ''}`;

  $('doVintage').addEventListener('click', () => {
    if (!confirm('Bottle the vintage? Everything but terroir, the tree and achievements resets.')) return;
    if (doVintage()) { paintAll(); switchTab('tree'); }
  });
  const list = $('cultivarList');
  if (list) {
    for (const c of CULTIVARS) {
      const owned = hasCultivar(c.id);
      const row = document.createElement('button');
      row.className = 'build';
      row.disabled = owned || S.seeds < c.cost;
      row.style.opacity = owned ? '.6' : '';
      row.innerHTML = `<span class="build__icon">${c.glyph}</span>
        <span><span class="build__name">${c.name}</span>
        <span class="build__desc">${c.desc}</span></span>
        <span class="build__right"><span class="build__cost${
          !owned && S.seeds >= c.cost ? ' affordable' : ''}">
          ${owned ? 'established' : fmt(c.cost) + ' seed' + (c.cost === 1 ? '' : 's')}
        </span></span>`;
      if (!owned) row.addEventListener('click', () => { if (buyCultivar(c)) paintPrestige(); });
      list.append(row);
    }
  }
  const lineageBtn = $('doLineage');
  if (lineageBtn) {
    lineageBtn.addEventListener('click', () => {
      if (!confirm('Begin a new lineage? Heirlooms, terroir, the whole skill tree and the '
        + 'lifetime terroir behind your heirlooms all reset. Seeds and cultivars are permanent.')) return;
      if (doLineage()) { paintAll(); switchTab('prestige'); }
    });
  }

  $('doSuccession').addEventListener('click', () => {
    if (!confirm('Hand the estate on? Terroir AND the whole skill tree reset. '
      + 'Heirlooms are permanent.')) return;
    if (doSuccession()) { paintAll(); switchTab('grove'); }
  });
}

/* Rebuilt once, then updated in place. This runs every second while the tab is
   open, and tearing the whole panel down that often meant a press that happened
   to span a repaint was simply discarded - the row it began on no longer
   existed by the time the button came up. Rows are keyed by upgrade id and only
   touched when the set of upgrades actually changes. */
/* Cheapest first, repeatedly, until nothing more can be bought. Repeating
   matters because buying an upgrade can unlock another one, and because the
   currencies are separate - running out of fruit does not stop a must upgrade.
   No confirmation: every upgrade is a permanent gain for this run, so unlike a
   respec there is nothing here to regret. */
function buyAllUpgrades() {
  let bought = 0;
  for (let pass = 0; pass < 60; pass++) {
    const affordable = availableUpgrades()
      .filter(u => S[u.currency] >= u.cost)
      .sort((a, b) => a.cost - b.cost);
    if (!affordable.length) break;
    for (const u of affordable) if (S[u.currency] >= u.cost && buyUpgrade(u)) bought++;
  }
  return bought;
}

function paintUpgrades() {
  const panel = $('panelUpgrades');
  const open = availableUpgrades().sort((a, b) => a.cost - b.cost);
  const done = UPGRADES.filter(u => upgradeBought(u.id));

  if (!panel.querySelector('[data-open]')) {
    panel.innerHTML = `<p class="hint" data-hint></p>
      <div class="buy-row"><button data-buyall>Buy all you can afford</button></div>
      <div class="group-title">Available</div>
      <div data-open></div>
      <div class="group-title" style="margin-top:22px" data-done-title hidden>Already bought</div>
      <div data-done></div>
      <p class="hint" data-empty style="margin:0" hidden>
        Nothing new just yet. Upgrades unlock as you buy more buildings and tend more often —
        the requirement is written on each one.</p>`;
  }

  panel.querySelector('[data-hint]').innerHTML =
    `Upgrades are bought once and last until you bottle the vintage. They are where a run's
     pace comes from — a doubling is nearly always worth more than one more building.
     <b>${done.length}</b> of <b>${UPGRADES.length}</b> bought,
     <b>${open.length}</b> available now.`;
  const all = panel.querySelector('[data-buyall]');
  if (!all.dataset.wired) {
    all.dataset.wired = '1';
    all.addEventListener('click', () => {
      const n = buyAllUpgrades();
      if (n) toast(`<b>${n}</b> upgrade${n > 1 ? 's' : ''} bought.`);
      paintUpgrades(); paintAll();
    });
  }
  // Cheapest first, so a run of small ones is never blocked by one dear one.
  const affordableNow = open.filter(u => S[u.currency] >= u.cost).length;
  all.disabled = affordableNow === 0;
  all.textContent = affordableNow
    ? `Buy all you can afford (${affordableNow})` : 'Nothing affordable yet';
  panel.querySelector('[data-empty]').hidden = open.length > 0;
  panel.querySelector('[data-done-title]').hidden = done.length === 0;

  syncRows(panel.querySelector('[data-open]'), open, (u) => {
    const row = document.createElement('button');
    row.className = 'build';
    row.dataset.id = u.id;
    row.innerHTML = `<span class="build__icon">${u.glyph}</span>
      <span><span class="build__name">${u.name}</span>
      <span class="build__desc">${u.desc}</span></span>
      <span class="build__right"><span class="build__cost"></span></span>`;
    row.addEventListener('click', () => { if (buyUpgrade(u)) { paintUpgrades(); paintAll(); } });
    return row;
  }, (row, u) => {
    // The only thing that changes tick to tick is whether you can afford it.
    const affordable = S[u.currency] >= u.cost;
    row.disabled = !affordable;
    const cost = row.querySelector('.build__cost');
    cost.textContent = `${fmt(u.cost)} ${u.currency}`;
    cost.classList.toggle('affordable', affordable);
  });

  syncRows(panel.querySelector('[data-done]'), done, (u) => {
    const row = document.createElement('div');
    row.className = 'build';
    row.dataset.id = u.id;
    row.style.opacity = '.55';
    row.style.cursor = 'default';
    row.innerHTML = `<span class="build__icon">${u.glyph}</span>
      <span><span class="build__name">${u.name}</span>
      <span class="build__desc">${u.desc}</span></span>
      <span class="build__right"><span class="build__owned">bought</span></span>`;
    return row;
  }, () => {});
}

/* Bring a list of rows into line with a list of items, keyed by id, touching the
   DOM only where it has actually changed. Nodes are never moved unless the order
   genuinely differs, because moving a node mid-press loses the press just as
   surely as removing it. */
function syncRows(box, items, make, update) {
  const have = new Map([...box.children].map(el => [el.dataset.id, el]));
  const wanted = items.map(item => item.id);
  for (const [id, el] of have) if (!wanted.includes(id)) el.remove();

  let previous = null;
  for (const item of items) {
    let row = have.get(item.id);
    if (!row) { row = make(item); }
    update(row, item);
    const shouldFollow = previous ? previous.nextElementSibling : box.firstElementChild;
    if (shouldFollow !== row) box.insertBefore(row, shouldFollow);
    previous = row;
  }
}


function paintStats() {
  const history = (S.stats.vintageHistory || []).slice().reverse();
  const played = (Date.now() - S.stats.started) / 1000;
  const allTerroir = S.stats.terroirAllTime || S.stats.terroirEver || 0;
  const perHour = played > 0 ? (allTerroir / (played / 3600)) : 0;
  const runFor = (Date.now() - (S.stats.runStarted || Date.now())) / 1000;
  const limit = bottleneck();

  const peak = Math.max(1, ...history.map(h => h.terroir || 0));
  const bars = history.slice(0, 24).reverse().map(h => {
    const height = Math.max(2, Math.round((h.terroir / peak) * 100));
    return `<div class="chart__bar" style="height:${height}%"
      title="Vintage ${h.n}: ${fmt(h.bottles)} bottles, ${fmt(h.terroir)} terroir,
      ${fmtTime((h.minutes || 0) * 60)}"></div>`;
  }).join('');

  $('panelStats').innerHTML = `
    <p class="hint">Where the estate has got to, and how quickly.</p>

    <div class="group-title">Completion</div>
    <div class="completion">
      <div class="completion__figure"><span data-live="completionPct"></span></div>
      <div class="completion__rows">${completion().strands.map(s => `
        <div class="datum">
          <span>${s.name}</span>
          <span data-live="strand-${s.name}"></span>
        </div>`).join('')}</div>
    </div>
    <p class="hint" style="margin:10px 0 0; font-size:12.5px">
      The tree goes at a succession and the upgrades go at every vintage, so those two count
      what the estate is holding right now. Upgrades go at every vintage and the skill tree
      goes at every succession, so the figure falls back when you reset — only a final run,
      with every cultivar already established, can carry it to the top. Each strand counts
      equally, whatever its length.</p>

    <div class="group-title" style="margin-top:20px">This run</div>
    <div class="datum"><span>Running for</span><span>${live('runFor')}</span></div>
    <div class="datum"><span>Bottles</span><span>${live('bottlesRun')}</span></div>
    <div class="datum"><span>Terroir if bottled now</span><span>${live('vintageGain')}</span></div>
    <div class="datum"><span>Holding you back</span><span>${live('holdingBack')}</span></div>

    <div class="group-title" style="margin-top:20px">All time</div>
    <div class="datum"><span>Time played</span><span>${live('played')}</span></div>
    <div class="datum"><span>Vintages bottled</span><span>${live('vintages')}</span></div>
    <div class="datum"><span>Best single vintage</span><span>${fmt(S.stats.bestVintage)} terroir</span></div>
    <div class="datum"><span>Most bottles in a run</span><span>${live('bestBottles')}</span></div>
    <div class="datum"><span>Skill tree, at its deepest</span><span>${live('bestRanks')}</span></div>
    <div class="datum"><span>Upgrades, at their most</span><span>${live('bestUpgrades')}</span></div>
    <div class="datum"><span>Varieties ever grown</span><span>${live('everGrown')}</span></div>
    <div class="datum"><span>Terroir per hour</span><span>${live('terroirHour')}</span></div>
    <div class="datum"><span>Successions</span><span>${S.stats.successions}</span></div>
    <div class="datum"><span>Lineages</span><span>${S.stats.lineages || 0}</span></div>
    <div class="datum"><span>Tended, all time</span><span>${fmt(S.stats.clicks)}</span></div>
    <div class="datum"><span>Longest time away</span><span>${fmtTime(S.stats.bestOffline)}</span></div>

    ${history.length ? `<div class="group-title" style="margin-top:22px">
      Terroir per vintage, most recent 24</div>
      <div class="chart">${bars}</div>
      <p class="hint" style="margin-top:8px">Each bar is one vintage; hover for the detail.
        Rising bars mean the tree is paying for itself.</p>` : ''}`;
}

function paintAchievements() {
  const got = ACHIEVEMENTS.filter(a => S.achievements[a.id]).length;
  $('panelAch').innerHTML = `
    <p class="hint">${got} of ${ACHIEVEMENTS.length} earned — together worth
      <b>+${Math.round(achievementBonus() * 100)}%</b> to everything.</p>
    <div class="ach-grid">
      ${ACHIEVEMENTS.map(a => `
        <div class="ach ${S.achievements[a.id] ? 'is-got' : ''}">
          <div class="ach__name">${S.achievements[a.id] ? a.name : '???'}</div>
          <div class="ach__desc">${a.desc}</div>
          <div class="ach__bonus">+${Math.round(a.bonus * 100)}% to everything</div>
        </div>`).join('')}
    </div>`;
}

function paintSettings() {
  recalc();
  const played = (Date.now() - S.stats.started) / 1000;
  const backup = backupInfo();
  $('panelSettings').innerHTML = `
    <p class="hint">The game saves to this browser every 10 seconds and when you leave the page.
      Export a copy before clearing your browser data — that is the only way it can be lost.</p>
    <div class="setting">
      <input type="checkbox" id="setLog" ${S.settings.showLog ? 'checked' : ''}>
      <label for="setLog">Show the log down the left</label>
    </div>
    ${MOD.autoBuyUnlocked ? `<div class="setting">
      <input type="checkbox" id="setAuto" ${S.settings.autoBuy !== false ? 'checked' : ''}>
      <label for="setAuto">Let the barrow buy for me (the Estate skill node)</label>
    </div>` : ''}
    <div class="setting">
      <label for="setNotation">Big numbers</label>
      <select id="setNotation" class="mini-select">
        <option value="short" ${S.settings.notation === 'short' ? 'selected' : ''}>
          Names — 1.52Qa</option>
        <option value="scientific" ${S.settings.notation === 'scientific' ? 'selected' : ''}>
          Scientific — 1.52e15</option>
        <option value="engineering" ${S.settings.notation === 'engineering' ? 'selected' : ''}>
          Engineering — 1.52e15 in threes</option>
      </select>
    </div>
    <p class="hint" style="margin-top:4px">
      In the skill tree, <b>shift</b> and a click learns as many ranks as you can
      afford at once — or turn on <b>Buy max</b> in the tree's own bar.</p>
      <p class="hint" style="margin:10px 0 0">
      Keys: <b>Space</b> tends, <b>B</b> buys the best you can afford,
      <b>1</b>–<b>9</b> move between the stages and the rest, in the order they
      appear on screen.</p>
    <div class="group-title" style="margin-top:20px">Your estate</div>
    <!-- terroirAllTime survives a lineage; terroirEver is the fuel and does not. -->
    <div class="datum"><span>Time played</span><span>${live('played')}</span></div>
    <div class="datum"><span>Times tended, all time</span><span>${fmt(S.stats.clicks)}</span></div>
    <div class="datum"><span>Times tended this run</span><span>${fmt(S.clicks)}</span></div>
    <div class="datum"><span>Bottles, all time</span><span>${fmt(S.stats.bottlesEver)}</span></div>
    <div class="datum"><span>Terroir, all time</span><span>${live('allTerroir')}</span></div>
    <div class="datum"><span>Longest time away</span><span>${fmtTime(S.stats.bestOffline)}</span></div>

    <div class="group-title" style="margin-top:20px">Save</div>
    <p class="hint" style="margin-bottom:10px">
      A backup is kept automatically every few minutes, and again just before any import or
      erase — so a wrong file or a slip of the hand can be undone.
      ${backup ? `The backup is from <b>${fmtTime((Date.now() - backup.when) / 1000)} ago</b>,
        with ${backup.vintages} vintage${backup.vintages === 1 ? '' : 's'} bottled.`
        : 'No backup has been taken yet.'}
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button class="btn" id="btnExport">Copy save to clipboard</button>
      <button class="btn" id="btnImport">Import from the box</button>
      <button class="btn" id="btnRestore" ${backup ? '' : 'disabled'}>Restore the backup</button>
      <button class="btn danger" id="btnWipe">Erase everything</button>
    </div>
    <textarea id="saveBox" rows="4" placeholder="Paste a save here, then press Import"></textarea>`;

  const autoBox = $('setAuto');
  if (autoBox) {
    autoBox.addEventListener('change', e => {
      S.settings.autoBuy = e.target.checked;
      recalc();
      paintBuildings();
    });
  }
  $('setNotation').addEventListener('change', e => {
    S.settings.notation = e.target.value;
    paintAll();
  });
  $('setLog').addEventListener('change', e => {
    S.settings.showLog = e.target.checked;
    $('logBox').hidden = !e.target.checked;
    $('logToggle').hidden = !e.target.checked;
    if (!e.target.checked) document.body.classList.remove('log-open');
  });
  $('btnExport').addEventListener('click', async () => {
    const text = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    $('saveBox').value = text;
    try { await navigator.clipboard.writeText(text); toast('Save copied to the clipboard.'); }
    catch (err) { toast('Copy it from the box below.'); }
  });
  $('btnImport').addEventListener('click', () => {
    const text = $('saveBox').value.trim();
    if (!text) { toast('Paste a save into the box first.'); return; }
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(text))));
      if (!data.stats) throw new Error('not a save');
      // Keep what is there now, in case the import turns out to be the wrong file.
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch (e2) { /* full */ }
      lockSaving();
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      location.reload();
    } catch (err) { toast('That does not look like a save file.'); }
  });
  const restore = $('btnRestore');
  if (restore && backup) {
    restore.addEventListener('click', () => {
      if (!confirm(`Restore the backup from ${fmtTime((Date.now() - backup.when) / 1000)} ago? `
        + 'Whatever you have now will be swapped out for it.')) return;
      const raw = localStorage.getItem(BACKUP_KEY);
      if (!raw) { toast('The backup has gone.'); return; }
      // Swap them, so restoring by mistake is itself undoable.
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch (e) { /* full */ }
      lockSaving();
      localStorage.setItem(SAVE_KEY, raw);
      location.reload();
    });
  }

  $('btnWipe').addEventListener('click', () => {
    if (!confirm('Erase this estate completely? There is no undo.')) return;
    if (!confirm('Really? Everything — vintages, heirlooms, the lot.')) return;
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch (e2) { /* full */ }
    lockSaving();
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  });
}

/* ------------------------------------------------------------- painting */
function paintAll() {
  recalc();
  paintResources();
  paintStages();
  paintSeason();
  paintTabs();
  paintBuildings();
  $('logBox').hidden = !S.settings.showLog;
  $('logToggle').hidden = !S.settings.showLog;
  const p = production();
  const gain = 1 * MOD.click + p.fruit * MOD.clickFromRate;
  $('tendGain').textContent = `+${fmt(gain)} fruit`
    + (S.vigour >= 1 ? ` — burst ready (×${fmt(MOD.vigourPower, 1)})` : '');
  const box = $('vigourBox');
  box.hidden = sumEffect('vigourRate') === 0 && S.stats.bursts === 0 && S.vigour < 0.999;
  $('vigourFill').style.width = (S.vigour * 100).toFixed(1) + '%';
  $('vigourText').textContent = Math.floor(S.vigour * 100) + '%';
  box.classList.toggle('is-full', S.vigour >= 1);
}

/* ------------------------------------------------------------------ boot */
function setupKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      const { gain, burst } = tend();
      if (burst) toast(`Burst! <b>+${fmt(gain)} fruit</b>`);
      paintAll();
      return;
    }
    if (e.key.toLowerCase() === 'b' && unlocked('buybest')) { buyBest(); return; }
    const digit = Number(e.key);
    if (digit >= 1 && digit <= 9) {
      // Numbered in reading order: the three stages, then the chips.
      const open = TABS.filter(t => !t.needs || unlocked(t.needs));
      if (open[digit - 1]) switchTab(open[digit - 1].id);
    }
  });
}

function boot() {
  const lastSave = load();
  recalc();

  $('tendBtn').addEventListener('click', () => {
    const { gain, burst } = tend();
    if (burst) toast(`Burst! <b>+${fmt(gain)} fruit</b>`);
    paintAll();
  });
  setupTreePanning();
  setupKeys();
  // Both of these only appear below 900px; on desktop the CSS keeps the log
  // open and the chain expanded, so the handlers simply never matter.
  $('logToggle').addEventListener('click', () => {
    document.body.classList.toggle('log-open');
  });
  $('welcomeClose').addEventListener('click', () => { $('welcome').hidden = true; });
  switchTab('grove');

  if (lastSave) {
    const away = (Date.now() - lastSave) / 1000;
    const result = applyOffline(away);
    if (result) {
      $('welcome').hidden = false;
      $('welcomeTitle').textContent = 'While you were away';
      const capped = result.seconds > result.capped;
      $('welcomeBody').innerHTML =
        `You were gone <b>${fmtTime(result.seconds)}</b>` +
        (capped ? `, and the estate ran for the first <b>${fmtTime(result.capped)}</b> of it
          — the cellar book only stretches so far.` : '.') +
        `<br><br>The orchard carried on at <b>${Math.round(result.efficiency * 100)}%</b>
        and brought in <b>${fmt(result.fruit)} fruit</b>,
        <b>${fmt(result.must)} must</b> and <b>${fmt(result.bottles)} bottles</b>.`;
    }
  } else {
    log('You inherit a neglected orchard and a cellar full of empty racks.');
    log('Tend the trees to get the first fruit in.');
  }

  // Recovering silently would be worse than not recovering: the player needs to
  // know some minutes are missing, and why, before they carry on over the top.
  if (loadedFromBackup) {
    log('<b>The main save could not be read.</b> Restored from the backup, '
      + 'which may be up to three minutes behind.');
    toast('<b>Save recovered from backup.</b> You may have lost the last few minutes.');
  }

  paintAll();
  let last = performance.now();
  let tickCount = 0;
  setInterval(() => {
    tickCount++;
    const now = performance.now();
    const dt = Math.min(1, (now - last) / 1000);
    last = now;
    step(dt);
    paintResources();
    paintStages();
    paintSeasonArc();
    if (activeTab === 'grove' || activeTab === 'press' || activeTab === 'cellar') paintBuildings();
    if (activeTab === 'upgrades' && tickCount % 10 === 0) paintUpgrades();
    // Figures only, never markup: the panels that are built once still keep
    // their numbers current while you sit on them.
    if (tickCount % 5 === 0) refreshLive();
    const p = production();
    const gain = 1 * MOD.click + p.fruit * MOD.clickFromRate;
    $('tendGain').textContent = `+${fmt(gain)} fruit`
      + (S.vigour >= 1 ? ` — burst ready (×${fmt(MOD.vigourPower, 1)})` : '');
    $('vigourFill').style.width = (S.vigour * 100).toFixed(1) + '%';
    $('vigourText').textContent = Math.floor(S.vigour * 100) + '%';
    $('vigourBox').classList.toggle('is-full', S.vigour >= 1);
    if ($('vigourBox').hidden && S.vigour >= 1) $('vigourBox').hidden = false;
    paintTabs();
  }, TICK_MS);

  // Wrap these rather than passing save directly: a listener is handed the Event
  // as its first argument, which would land in save()'s `force` parameter and
  // override the lock that protects an import or an erase from being undone.
  setInterval(() => save(), 10000);
  window.addEventListener('beforeunload', () => save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}

boot();

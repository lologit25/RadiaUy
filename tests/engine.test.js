const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/engine.js');

// ---------- helpers ----------
function feed(brain, from, to, fn) {           // 20 frames por segundo
  for (let i = Math.round(from * 20); i < Math.round(to * 20); i++) { const t = i / 20; brain.pushFrame(Object.assign({ t }, fn(t))); }
}
const jitter = t => Math.sin(t * 37.1) * 0.8;
const content = t => ({ db: -20 + jitter(t), centroid: 1500 + 80 * Math.sin(t * 3) });
const adAt = start => t => { const k = (t - start) % 5; return k < 0.25 ? { db: -80, centroid: 0 } : { db: -14 + jitter(t), centroid: 2400 }; };
const talk = t => { const ph = t % 2.5; if (ph > 2.1) return { db: -38, centroid: 900 }; return (t * 1000) % 210 < 150 ? { db: -18, centroid: 1300 } : { db: -30, centroid: 1100 }; };
const st = (id, category, delay, brain) => ({ id, category, delay, brain: brain || new E.Brain() });

// ---------- match por franja ----------
test('match: géneros opuestos dan bajo, afines dan alto', () => {
  assert.strictEqual(E.match('periodistico', 'periodistico'), 100);
  assert.ok(E.match('tango', 'urbano') < 35, 'tango vs urbano');
  assert.ok(E.match('periodistico', 'urbano') < 30, 'periodístico vs urbano');
  assert.ok(E.match('periodistico', 'deportes') > 70, 'periodístico vs deportes');
  assert.ok(E.match('rock', 'pop') > 70, 'rock vs pop');
  assert.ok(E.match('tango', 'folclore') > 80, 'tango vs folclore');
});
test('match: lo que se mide en vivo corrige el perfil', () => {
  assert.ok(E.match('pop', 'periodistico', { talkA: 0.9 }) > E.match('pop', 'periodistico') + 20);
});
test('franjas y perfil por franja', () => {
  assert.strictEqual(E.slotAt(7).id, 'manana');
  assert.strictEqual(E.slotAt(23).id, 'noche');
  assert.strictEqual(E.slotAt(3).id, 'madrugada');
  assert.strictEqual(E.categoryAt({ profile: { manana: 'magazine', '*': 'rock' } }, 8), 'magazine');
  assert.strictEqual(E.categoryAt({ profile: { manana: 'magazine', '*': 'rock' } }, 22), 'rock');
});
test('inferCategory lee etiquetas del directorio', () => {
  assert.strictEqual(E.inferCategory({ name: 'Radio X', tags: 'news,talk' }), 'periodistico');
  assert.strictEqual(E.inferCategory({ name: 'FM Tango', tags: '' }), 'tango');
  assert.strictEqual(E.inferCategory({ name: 'La Kalle', tags: 'cumbia,tropical' }), 'tropical');
  assert.strictEqual(E.inferCategory({ name: 'Sin datos', tags: '' }), 'pop');
});
test('transición: más corta y sin mezcla cuando el match es bajo', () => {
  const hi = E.transitionStyle(90), lo = E.transitionStyle(20);
  assert.strictEqual(hi.mode, 'cross'); assert.strictEqual(lo.mode, 'dip'); assert.ok(lo.dur < hi.dur);
});

// ---------- detector ----------
test('detector: encuentra la tanda, con inicio y fin cercanos a los reales', () => {
  const b = new E.Brain();
  feed(b, 0, 60, content); assert.strictEqual(b.isAdAt(30), false);
  feed(b, 60, 80, adAt(60));
  assert.ok(b.isAdAt(70), 'debería marcar tanda a los 70 s');
  assert.ok(b.detectedAt - 60 <= 5.5, 'latencia de detección ' + (b.detectedAt - 60));
  assert.ok(Math.abs(b.iv[0].s - 60) <= 2, 'inicio estimado ' + b.iv[0].s);
  feed(b, 80, 100, content);
  assert.strictEqual(b.isAdAt(95), false);
  assert.ok(Math.abs(b.iv[0].e - 80) <= 3, 'fin estimado ' + b.iv[0].e);
  assert.strictEqual(b.nextAdStart(10), b.iv[0].s);
});
test('detector: no marca tanda en charla sostenida ni en cambio de tema', () => {
  const b = new E.Brain(); feed(b, 0, 120, talk); assert.strictEqual(b.iv.length, 0);
  assert.ok(b.talk > 0.5, 'debería medir habla, midió ' + b.talk);
  const m = new E.Brain();
  feed(m, 0, 60, content); feed(m, 60, 60.6, () => ({ db: -80, centroid: 0 }));
  feed(m, 60.6, 120, t => ({ db: -19 + jitter(t), centroid: 1700 }));
  assert.strictEqual(m.iv.length, 0); assert.ok(m.talk < 0.3, 'música midió habla ' + m.talk);
});
test('detector: una “tanda” eterna se corta y se recalibra', () => {
  const b = new E.Brain({ maxBreak: 30 });
  feed(b, 0, 20, content); feed(b, 20, 90, t => ({ db: -13 + jitter(t), centroid: 2500 }));
  assert.strictEqual(b.isAdAt(89), false);
});
test('marca manual abre y cierra una tanda', () => {
  const b = new E.Brain({ breakLen: 100 });
  b.markAd(50); assert.ok(b.isAdAt(60)); assert.ok(!b.isAdAt(160));
  b.markClear(80); assert.ok(!b.isAdAt(81));
});

// ---------- horarios aprendidos ----------
test('horarios: aprende los minutos de tanda y los recuerda', () => {
  const s = new E.Schedule();
  assert.ok(s.p(15) < 0.2); assert.strictEqual(s.confident(15), false);
  for (let v = 0; v < 5; v++) for (let i = 0; i < 60; i++) { s.observe(15, true, 1); s.observe(40, false, 1); }
  assert.ok(s.p(15) > 0.65); assert.ok(s.p(40) < 0.1); assert.ok(s.confident(15));
  const r = new E.Schedule(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(r.p(15), s.p(15));
});
test('sin análisis de audio, el horario aprendido abre la tanda', () => {
  const s = new E.Schedule(); for (let i = 0; i < 300; i++) s.observe(15, true, 1);
  const b = new E.Brain(); b.tickClock(1000, 15, s); assert.ok(b.isAdAt(1001));
  for (let i = 0; i < 300; i++) s.observe(16, false, 1);
  b.tickClock(1060, 16, s); assert.ok(!b.isAdAt(1061));
});

// ---------- director ----------
function trio() {
  const main = st('main', 'periodistico', 12), a = st('a', 'deportes', 12), b = st('b', 'urbano', 12);
  return { main, a, b, d: new E.Director({ stations: [main, a, b], mainId: 'main' }) };
}
test('director: se va antes de que la tanda llegue al oído y elige el mejor match', () => {
  const { main, d } = trio();
  main.brain.iv.push({ s: 100, e: null, src: 'audio' });      // se oiría a los 112
  assert.strictEqual(d.tick(105), null, 'todavía falta');
  let act = null, at = null;
  for (let t = 105; t < 112 && !act; t += 0.1) { act = d.tick(t); at = t; }
  assert.ok(act && act.type === 'switch', 'tiene que cambiar');
  assert.strictEqual(act.to, 'a'); assert.strictEqual(act.reason, 'ad');
  assert.ok(at + act.style.dur <= 112, 'la transición termina antes de la tanda: ' + at);
  assert.strictEqual(d.current, 'a');
});
test('director: si la mejor opción está en tanda, usa la otra', () => {
  const { main, a, d } = trio();
  main.brain.iv.push({ s: 100, e: null }); a.brain.iv.push({ s: 95, e: null });
  let act = null; for (let t = 105; t < 113 && !act; t += 0.1) act = d.tick(t);
  assert.strictEqual(act.to, 'b');
});
test('director: todas en tanda → baja el volumen y lo sube al salir', () => {
  const { main, a, b, d } = trio();
  [main, a, b].forEach(s => s.brain.iv.push({ s: 100, e: 140 }));
  let acts = []; for (let t = 105; t < 170; t += 0.1) { const x = d.tick(t); if (x) acts.push(x.type + (x.to ? ':' + x.to : '')); }
  assert.strictEqual(acts[0], 'duck'); assert.ok(acts.includes('unduck'), acts.join());
});
test('director: vuelve a la favorita cuando termina su tanda, sin ping-pong', () => {
  const { main, d } = trio();
  main.brain.iv.push({ s: 100, e: 150 });                     // tanda oída de 112 a 162
  const acts = []; for (let t = 105; t < 200; t += 0.1) { const x = d.tick(t); if (x) acts.push({ t, to: x.to, reason: x.reason }); }
  assert.strictEqual(acts.length, 2, JSON.stringify(acts));
  assert.strictEqual(acts[1].to, 'main'); assert.strictEqual(acts[1].reason, 'return');
  assert.ok(acts[1].t >= 162 && acts[1].t <= 162 + 10, 'volvió a ' + acts[1].t);
});
test('director: una emisora caída no es candidata y se abandona', () => {
  const { main, a, d } = trio();
  a.ok = false; main.brain.iv.push({ s: 100, e: null });
  let act = null; for (let t = 105; t < 113 && !act; t += 0.1) act = d.tick(t);
  assert.strictEqual(act.to, 'b');
  const z = trio(); z.main.ok = false; assert.strictEqual(z.d.tick(10).type, 'switch');
});
test('director: si el usuario elige una emisora a mano, no lo devuelve hasta que ahí haya tanda', () => {
  const { a, d } = trio();
  const act = d.force('a', 10); assert.strictEqual(act.reason, 'manual');
  for (let t = 10; t < 60; t += 0.1) assert.strictEqual(d.tick(t), null);
  a.brain.iv.push({ s: 60, e: 90 });                         // se oiría a los 72
  let back = null; for (let t = 60; t < 73 && !back; t += 0.1) back = d.tick(t);
  assert.strictEqual(back.to, 'main');
});

// ---------- detector v2: tanda = segmentos cortos de timbre distinto, sin depender del volumen ----------
function rnd(seed) { let a = seed * 2654435761 >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shapeOf = seed => { const r = rnd(seed); return Array.from({ length: 8 }, () => -30 + (r() - .5) * 14); };
function flat(shape, t, wob = 1) { return { db: -18 + Math.sin(t * 5.3) * .5, centroid: 1500, bands: shape.map((v, k) => v + Math.sin(t * (1.7 + k)) * wob) }; }
function feedSegs(b, segs) { for (const [from, to, seed] of segs) { const sh = shapeOf(seed); feed(b, from, to, t => flat(sh, t)); } }

test('v2: detecta una tanda de volumen parejo por sus segmentos cortos, con inicio y fin cercanos', () => {
  const b = new E.Brain();
  feedSegs(b, [[0, 120, 1], [120, 140, 2], [140, 165, 3], [165, 185, 4], [185, 200, 5], [200, 300, 1]]);
  const iv = b.iv.filter(i => i.src === 'cuts');
  assert.strictEqual(iv.length, 1, JSON.stringify(b.iv));
  assert.ok(Math.abs(iv[0].s - 120) <= 3, 'inicio ' + iv[0].s);
  assert.ok(iv[0].known - 120 <= 40, 'se supo a los ' + (iv[0].known - 120) + ' s');
  assert.ok(iv[0].e != null && Math.abs(iv[0].e - 200) <= 4, 'fin ' + iv[0].e);
  assert.ok(!b.isAdAt(100) && b.isAdAt(150) && !b.isAdAt(260));
});
test('v2: un cambio de tema o dos temas largos seguidos no son tanda', () => {
  const b = new E.Brain();
  feedSegs(b, [[0, 180, 1], [180, 380, 6], [380, 560, 7]]);
  assert.strictEqual(b.iv.length, 0, JSON.stringify(b.iv));
});
test('v2: dos voces alternando en una charla no son tanda', () => {
  const b = new E.Brain(), v1 = shapeOf(11), v2 = v1.map((x, k) => x + (k % 2 ? 3 : -3));
  feed(b, 0, 300, t => flat(Math.floor(t / 3) % 2 ? v1 : v2, t));
  assert.strictEqual(b.iv.length, 0, JSON.stringify(b.iv));
});
test('v2: sin datos de bandas no hace nada (compatibilidad)', () => {
  const b = new E.Brain(); feed(b, 0, 60, content); assert.strictEqual(b.cuts.length, 0);
});
test('v2: un inserto corto que vuelve al mismo sonido (estrofa-estribillo-estrofa, locutor entre temas) no es tanda', () => {
  const b = new E.Brain();
  feedSegs(b, [[0, 120, 1], [120, 140, 2], [140, 260, 1], [260, 285, 3], [285, 400, 1]]);
  assert.strictEqual(b.iv.length, 0, JSON.stringify(b.iv));
});
test('v2: música con variación periódica moderada no genera cortes', () => {
  const b = new E.Brain(), base = shapeOf(21);
  feed(b, 0, 300, t => flat(base.map((v, k) => v + 3.5 * Math.sin(2 * Math.PI * t / 8.6 + k)), t));
  assert.strictEqual(b.iv.length, 0, JSON.stringify(b.cuts));
});

// ---------- volver a la favorita ----------
test('v2: la tanda se cierra cuando vuelve el sonido del programa, aunque el programa tenga cortes frecuentes', () => {
  const b = new E.Brain();
  feedSegs(b, [[0, 120, 1], [120, 140, 2], [140, 165, 3], [165, 185, 4], [185, 200, 5],
    [200, 225, 1], [225, 240, 8], [240, 262, 1], [262, 280, 9], [280, 305, 1], [305, 320, 10], [320, 420, 1]]);
  const iv = b.iv.filter(i => i.src === 'cuts');
  assert.strictEqual(iv.length, 1, JSON.stringify(b.iv));
  assert.ok(iv[0].e != null && Math.abs(iv[0].e - 200) <= 4, 'fin ' + iv[0].e);
  assert.ok(iv[0].closedAt - 200 <= 30, 'se supo que terminó a los ' + (iv[0].closedAt - 200) + ' s');
});
test('v2: una tanda nunca dura más que el tope, y después hay un respiro sin tandas nuevas', () => {
  const b = new E.Brain({ maxBreak: 200 }), segs = [[0, 120, 1]];
  for (let t = 120, k = 30; t < 700; t += 20, k++) segs.push([t, t + 20, k]);
  feedSegs(b, segs);
  const first = b.iv[0];
  assert.ok(first.e != null && first.e - first.s <= 215, 'duró ' + (first.e - first.s));
  for (let t = first.e + 5; t < first.e + 85; t += 5) assert.ok(!b.isAdAt(t), 'respiro en ' + t);
});

// ---------- radio de reserva cuando todas las favoritas están en tanda ----------
function quad() {
  const main = st('main', 'periodistico', 12), a = st('a', 'deportes', 12), b = st('b', 'urbano', 12);
  const r = Object.assign(st('r', 'magazine', 12), { tier: 1 });
  return { main, a, b, r, d: new E.Director({ stations: [main, a, b, r], mainId: 'main' }) };
}
const runD = (d, from, to) => { const acts = []; for (let t = from; t < to; t += 0.1) { const x = d.tick(t); if (x) acts.push(Object.assign({ t: +t.toFixed(1) }, x)); } return acts; };
test('reserva: no se usa mientras haya una favorita limpia', () => {
  const { main, d } = quad(); main.brain.iv.push({ s: 100, e: 160 });
  const acts = runD(d, 105, 200);
  assert.deepStrictEqual(acts.map(x => x.to), ['a', 'main']);
});
test('reserva: si las tres favoritas están en tanda, pasa a la reserva en vez de bajar el volumen', () => {
  const { main, a, b, d } = quad();
  [main, a, b].forEach(s => s.brain.iv.push({ s: 100, e: 200 }));
  const acts = runD(d, 105, 125);
  assert.strictEqual(acts.length, 1, JSON.stringify(acts));
  assert.strictEqual(acts[0].type, 'switch'); assert.strictEqual(acts[0].to, 'r'); assert.strictEqual(acts[0].reason, 'ad');
});
test('reserva: se abandona apenas una favorita queda limpia, y la principal tiene prioridad', () => {
  const { main, a, b, d } = quad();
  main.brain.iv.push({ s: 100, e: 220 }); a.brain.iv.push({ s: 100, e: 160 }); b.brain.iv.push({ s: 100, e: 300 });
  const acts = runD(d, 105, 280);
  assert.deepStrictEqual(acts.map(x => x.to), ['r', 'a', 'main'], JSON.stringify(acts));
  assert.ok(acts[1].t >= 172 && acts[1].t <= 185, 'a la favorita alternativa en ' + acts[1].t);
  assert.ok(acts[2].t >= 232 && acts[2].t <= 245, 'a la principal en ' + acts[2].t);
});
test('reserva: si la reserva también está en tanda, baja el volumen como último recurso', () => {
  const { main, a, b, r, d } = quad();
  [main, a, b, r].forEach(s => s.brain.iv.push({ s: 100, e: 200 }));
  assert.strictEqual(runD(d, 105, 125)[0].type, 'duck');
});
test('director: una emisora que perdió la señal no es destino', () => {
  const { main, a, d } = trio(); a.live = false; main.brain.iv.push({ s: 100, e: null });
  assert.strictEqual(runD(d, 105, 113)[0].to, 'b');
});

// ---------- con avisos reconocidos uno por uno ----------
test('director: no vuelve a la favorita en el hueco entre dos avisos de la misma tanda', () => {
  const main = st('main', 'periodistico', 45), a = st('a', 'deportes', 45), d = new E.Director({ stations: [main, a], mainId: 'main' });
  main.brain.iv.push({ s: 100, e: 125, src: 'fp' }, { s: 150, e: 175, src: 'fp' });       // aviso conocido, aviso desconocido de 25 s, aviso conocido
  const acts = runD(d, 120, 260);
  assert.deepStrictEqual(acts.map(x => x.to), ['a', 'main'], JSON.stringify(acts));
  assert.ok(acts[1].t >= 175 + 45, 'volvió a los ' + acts[1].t);
});
test('detector: con la detección estimada apagada, las reglas de volumen y de cortes no marcan tandas', () => {
  const b = new E.Brain({ heur: false });
  feed(b, 0, 60, content); feed(b, 60, 80, adAt(60)); feed(b, 80, 100, content);
  feedSegs(b, [[100, 220, 1], [220, 240, 2], [240, 265, 3], [265, 285, 4], [285, 400, 1]]);
  assert.strictEqual(b.iv.length, 0, JSON.stringify(b.iv)); assert.ok(b.cuts.length >= 3, 'los cortes igual se registran');
});

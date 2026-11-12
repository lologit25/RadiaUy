const test = require('node:test'), assert = require('node:assert'), fs = require('fs');
const FP = require('../src/fp.js');
const have = fs.existsSync('/tmp/fx/marks.json');
const M = have ? JSON.parse(fs.readFileSync('/tmp/fx/marks.json')) : {};
const pcm = n => { const b = fs.readFileSync('/tmp/fx/' + n + '.f32'); return new Float32Array(b.buffer, b.byteOffset, b.length >> 2); };
const span = (n, k) => M[n].find(m => m[0] === k);
/** Alimenta una emisión de a trozos de ~2 s, como hace el reproductor. Devuelve los eventos emitidos. */
function air(mem, name, t0) {
  const x = pcm(name), ev = []; mem.onEvent = e => ev.push(Object.assign({}, e, { at: mem.now }));
  for (let i = 0; i < x.length; i += 88200) mem.push(x.subarray(i, Math.min(x.length, i + 88200)), 44100, t0 + i / 44100);
  mem.flush(); return ev;
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, msg + ': ' + a.toFixed(2) + ' vs ' + b.toFixed(2));

test('huella: el mismo aviso en dos emisiones distintas da huellas casi iguales; audio distinto no', { skip: !have }, () => {
  const fpOf = (n, from, to) => { const f = new FP.Fingerprinter(44100), x = pcm(n); return f.push(x.subarray(Math.round(from * 44100), Math.round(to * 44100))).fps; };
  const a = span('e1', 'ad1'), b = span('e2', 'ad1'), c = span('e2', 'ad4');
  const A = fpOf('e1', a[1] + 2, a[1] + 12), B = fpOf('e2', b[1] + 2, b[1] + 12), C = fpOf('e2', c[1] + 2, c[1] + 12), P = fpOf('e1', 5, 15);
  const same = FP.ber(A, 0, B, 0, Math.min(A.length, B.length) - 2), other = FP.ber(A, 0, C, 0, Math.min(A.length, C.length) - 2), prog = FP.ber(A, 0, P, 0, Math.min(A.length, P.length) - 2);
  assert.ok(same < 0.2, 'mismo aviso ' + same.toFixed(3)); assert.ok(other > 0.4, 'otro aviso ' + other.toFixed(3)); assert.ok(prog > 0.4, 'programa ' + prog.toFixed(3));
  assert.ok(A.length > 190 && A.length < 230, 'unos 21 cuadros por segundo: ' + A.length);
});

test('repetición: la primera vez no marca nada; la segunda reconoce los avisos repetidos con sus bordes', { skip: !have }, () => {
  const mem = new FP.AdMemory();
  assert.deepStrictEqual(air(mem, 'e1', 1000).filter(e => e.type === 'ad'), [], 'primera emisión: nada conocido todavía');
  const ev = air(mem, 'e2', 2000).filter(e => e.type === 'ad');
  assert.strictEqual(ev.length, 2, JSON.stringify(ev));
  const a2 = span('e2', 'ad2'), a1 = span('e2', 'ad1');
  near(ev[0].s, 2000 + a2[1], 1.5, 'inicio aviso 2'); near(ev[0].e, 2000 + a2[2], 1.5, 'fin aviso 2');
  near(ev[1].s, 2000 + a1[1], 1.5, 'inicio aviso 1'); near(ev[1].e, 2000 + a1[2], 1.5, 'fin aviso 1');
  assert.strictEqual(mem.library.length, 2);
});

test('biblioteca: a partir de la tercera emisión, el aviso se reconoce en sus primeros segundos y se predice su final', { skip: !have }, () => {
  const mem = new FP.AdMemory(); air(mem, 'e1', 1000); air(mem, 'e2', 2000);
  const ev = air(mem, 'e3', 3000).filter(e => e.type === 'ad'), by = k => { const m = span('e3', k); return ev.find(e => Math.abs(e.s - (3000 + m[1])) < 2); };
  for (const k of ['ad1', 'ad2']) {
    const m = span('e3', k), e = by(k); assert.ok(e, k + ' reconocido: ' + JSON.stringify(ev));
    assert.ok(e.at - (3000 + m[1]) <= 6, k + ' se supo a los ' + (e.at - 3000 - m[1]).toFixed(1) + ' s de empezar');
    near(e.e, 3000 + m[2], 1.5, 'fin previsto de ' + k);
  }
  const m4 = span('e3', 'ad4'), e4 = by('ad4'); assert.ok(e4, 'el aviso 4 (segunda vez) también se marca'); near(e4.e, 3000 + m4[2], 1.5, 'fin aviso 4');
  const m5 = span('e3', 'ad5'); assert.ok(!ev.some(e => e.s < 3000 + m5[2] - 2 && e.e > 3000 + m5[1] + 2), 'el aviso 5 es nuevo: no se marca');
  assert.ok(!ev.some(e => e.e < 3000 + 28 || e.s > 3000 + m4[2] + 2), 'nada marcado dentro del programa: ' + JSON.stringify(ev));
});

test('una canción que se repite no es publicidad', { skip: !have }, () => {
  const mem = new FP.AdMemory(); air(mem, 'm1', 1000);
  assert.deepStrictEqual(air(mem, 'm2', 2000).filter(e => e.type === 'ad'), []);
  assert.strictEqual(mem.library.filter(l => l.kind === 'ad').length, 0);
});

test('enseñar: un toque en "Esto es publicidad" alcanza para reconocer ese aviso la próxima vez', { skip: !have }, () => {
  const mem = new FP.AdMemory(), m = span('e2', 'ad4'); air(mem, 'e2', 2000);
  mem.teach(2000 + m[1] + 4);                                   // el usuario toca a los 4 s de empezado el aviso 4
  const ev = air(mem, 'e3', 3000).filter(e => e.type === 'ad'), m3 = span('e3', 'ad4');
  assert.ok(ev.some(e => e.s < 3000 + m3[1] + 8 && e.e > 3000 + m3[1] + 8), JSON.stringify(ev));
});

test('lo aprendido se guarda y se recupera', { skip: !have }, () => {
  const mem = new FP.AdMemory(); air(mem, 'e1', 1000); air(mem, 'e2', 2000);
  const saved = JSON.parse(JSON.stringify(mem.exportLibrary())), again = new FP.AdMemory(); again.importLibrary(saved);
  const ev = air(again, 'e3', 3000).filter(e => e.type === 'ad');
  assert.ok(ev.length >= 2, JSON.stringify(ev));
});

test('el historial de lo escuchado sobrevive entre sesiones: un aviso oído ayer se reconoce hoy', { skip: !have }, () => {
  const a = new FP.AdMemory(); air(a, 'e1', 1000);
  const b = new FP.AdMemory(); b.importHistoryRaw(a.exportHistoryRaw()); b.importLibrary(a.exportLibrary());
  const ev = air(b, 'e2', 50).filter(e => e.type === 'ad');
  assert.strictEqual(ev.length, 2, JSON.stringify(ev));
});

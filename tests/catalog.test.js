const test = require('node:test'), assert = require('node:assert');
const C = require('../src/stations.js');
test('catálogo real: más de 90 radios, ids únicos, sin duplicados por nombre', () => {
  assert.ok(C.length >= 90, 'hay ' + C.length);
  assert.strictEqual(new Set(C.map(s => s.id)).size, C.length);
  const n = C.map(s => s.name.toLowerCase());
  assert.strictEqual(new Set(n).size, n.length);
});
test('catálogo real: cada radio tiene streams y prefiere https', () => {
  for (const s of C) {
    assert.ok(s.urls.length >= 1, s.name);
    if (s.urls.some(u => u.startsWith('https:'))) assert.ok(s.urls[0].startsWith('https:'), s.name + ' ' + s.urls[0]);
  }
});
test('catálogo real: están las grandes de Montevideo, sin duplicar', () => {
  for (const k of ['Océano FM', 'Del Sol FM', 'Azul FM', 'Radio Sarandí', 'El Espectador', 'Radio Carve', 'Carve Deportiva', 'Radio Universal', 'Radio Monte Carlo', 'Radio Disney', 'Radio Uruguay'])
    assert.strictEqual(C.filter(s => s.name === k).length, 1, k);
  assert.ok(!C.some(s => /pip[ií] cuc[uú] \(|onlineradiobox/i.test(s.name + s.urls.join())));
});

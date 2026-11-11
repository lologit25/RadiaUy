const test = require('node:test'), assert = require('node:assert'), fs = require('fs');
const SP = require('../src/stream.js');
function run(file, min = 2.5) {
  const data = fs.readFileSync(file), sp = new SP.FrameSplitter(), chunks = []; let i = 0, seed = 7;
  while (i < data.length) { seed = (seed * 16807) % 2147483647; const n = 1 + seed % 4000; sp.push(new Uint8Array(data.subarray(i, i + n))); i += n; let c; while ((c = sp.takeChunk(min))) chunks.push(c); }
  return { sp, chunks, size: data.length };
}
for (const [file, codec, spf, sr] of [['/tmp/sine128.mp3', 'mp3', 1152, 44100], ['/tmp/sine64.mp3', 'mp3', 576, 22050], ['/tmp/sine.aac', 'aac', 1024, 44100]]) {
  test('lector de streams: ' + file + ' se parte en cuadros completos sin perder audio', () => {
    const { sp, chunks, size } = run(file);
    assert.strictEqual(sp.codec, codec);
    assert.ok(chunks.length >= 6, 'trozos ' + chunks.length);
    const dur = chunks.reduce((a, c) => a + c.dur, 0) + sp.pendingDur();
    assert.ok(Math.abs(dur - 20) < 0.25, 'duración total ' + dur);
    assert.ok(sp.bytesIn - sp.skipped > size * 0.97, 'bytes útiles');
    chunks.forEach((c, k) => {
      assert.strictEqual(c.bytes[0], 0xFF, 'cada trozo empieza en un cuadro');
      assert.ok(c.dur >= 2.5 && c.dur < 3.2, 'duración del trozo ' + c.dur);
      if (k === 0) assert.strictEqual(c.skip, 0); else assert.ok(c.skip > 0 && c.skip < 0.4, 'solape ' + c.skip);
      assert.ok(Math.abs(c.skip * sr / spf - Math.round(c.skip * sr / spf)) < 1e-6, 'el solape son cuadros enteros');
    });
  });
}
test('lector de streams: ignora basura intercalada y se resincroniza', () => {
  const data = fs.readFileSync('/tmp/sine128.mp3'), sp = new SP.FrameSplitter();
  sp.push(new Uint8Array([1, 2, 3, 0xFF, 0x00, 9, 9])); sp.push(new Uint8Array(data.subarray(0, 50000)));
  sp.push(new Uint8Array(300).fill(0x55)); sp.push(new Uint8Array(data.subarray(50000)));
  let dur = 0, c; while ((c = sp.takeChunk(1))) dur += c.dur;
  assert.ok(dur > 18.5 && dur < 20.2, 'duración ' + dur);
});
test('lector de streams: lo que no es mp3 ni aac no produce trozos', () => {
  const sp = new SP.FrameSplitter(); sp.push(new Uint8Array(200000).map((_, i) => (i * 37) % 251));
  assert.strictEqual(sp.takeChunk(1), null); assert.ok(sp.skipped > 100000);
});

test('empalme: encuentra la continuación exacta aunque el decodificador agregue un retraso desconocido', () => {
  let a = 12345; const rnd = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648 - .5; };
  const sig = new Float32Array(40000); for (let i = 1; i < sig.length; i++) sig[i] = .9 * sig[i - 1] + rnd() * .2;      // audio "real": no periódico
  const W = 1024, tail = sig.slice(20000 - W, 20000);
  for (const delay of [0, 529, 1105, -700, 2257]) {
    const x = sig.slice(8000 - delay);                         // el trozo nuevo llega corrido `delay` muestras
    assert.strictEqual(SP.spliceAt(x, tail, 12000, W, 3200), 12000 + delay, 'retraso ' + delay);
  }
  assert.strictEqual(SP.spliceAt(new Float32Array(40000).map(rnd), tail, 12000, W, 3200), 12000, 'sin coincidencia usa la posición esperada');
});

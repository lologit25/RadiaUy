/* RADIA · lector de streams: parte un flujo MP3 o AAC (ADTS) en trozos de cuadros completos,
   listos para decodificar con Web Audio. Cada trozo repite los últimos cuadros del anterior ("solape")
   para que el decodificador arranque en régimen; al reproducir se saltean esos `skip` segundos. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadiaStream = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = [[11025, 12000, 8000], null, [22050, 24000, 16000], [44100, 48000, 32000]];
  const ASR = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

  /** Lee un encabezado de cuadro en b[i]. Devuelve { len (bytes), dur (s), codec } o null. */
  function header(b, i) {
    if (b[i] !== 0xFF) return null;
    const b1 = b[i + 1], b2 = b[i + 2];
    if ((b1 & 0xF6) === 0xF0) {                                  // AAC en ADTS
      const sr = ASR[(b2 >> 2) & 15]; if (!sr) return null;
      const len = ((b[i + 3] & 3) << 11) | (b[i + 4] << 3) | (b[i + 5] >> 5);
      return len < 7 ? null : { len, dur: 1024 / sr, codec: 'aac' };
    }
    if ((b1 & 0xE0) !== 0xE0) return null;                       // MPEG audio, capa III
    const ver = (b1 >> 3) & 3, layer = (b1 >> 1) & 3, bi = b2 >> 4, si = (b2 >> 2) & 3;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) return null;
    const sr = SR[ver][si], br = (ver === 3 ? BR1 : BR2)[bi] * 1000, pad = (b2 >> 1) & 1;
    return { len: Math.floor((ver === 3 ? 144 : 72) * br / sr) + pad, dur: (ver === 3 ? 1152 : 576) / sr, codec: 'mp3' };
  }

  class FrameSplitter {
    constructor() { this.buf = new Uint8Array(0); this.pos = 0; this.frames = []; this.dur = 0; this.overlap = null; this.overlapDur = 0; this.codec = null; this.bytesIn = 0; this.skipped = 0; }
    push(u8) {
      this.bytesIn += u8.length;
      const n = new Uint8Array(this.buf.length + u8.length); n.set(this.buf); n.set(u8, this.buf.length); this.buf = n;
      const b = this.buf; let i = this.pos;
      while (i + 7 <= b.length) {
        const h = header(b, i);
        if (h && (!this.codec || h.codec === this.codec)) {
          if (i + h.len + 7 > b.length) break;                    // falta el cuadro siguiente para confirmar
          const nx = header(b, i + h.len);
          if (nx && nx.codec === h.codec) { this.codec = h.codec; this.frames.push({ off: i, len: h.len, dur: h.dur }); this.dur += h.dur; i += h.len; continue; }
        }
        i++; this.skipped++;
      }
      this.pos = i;
    }
    pendingDur() { return this.dur; }
    /** Devuelve { bytes, skip, dur, codec } cuando hay al menos `min` segundos nuevos; si no, null. */
    takeChunk(min) {
      if (this.dur < min || !this.frames.length) return null;
      const F = this.frames, size = F.reduce((a, f) => a + f.len, 0), ov = this.overlap;
      const bytes = new Uint8Array((ov ? ov.length : 0) + size); let o = 0;
      if (ov) { bytes.set(ov); o = ov.length; }
      for (const f of F) { bytes.set(this.buf.subarray(f.off, f.off + f.len), o); o += f.len; }
      const out = { bytes, skip: ov ? this.overlapDur : 0, dur: this.dur, codec: this.codec };
      let k = F.length, ob = 0, od = 0, n = 0;                    // solape para el próximo trozo
      while (k > 0 && n < 16 && od < .25) { k--; ob += F[k].len; od += F[k].dur; n++; }        // ~0,25 s: alcanza para empalmar con exactitud
      this.overlap = bytes.slice(bytes.length - ob); this.overlapDur = od;
      this.buf = this.buf.slice(this.pos); this.pos = 0; this.frames = []; this.dur = 0;
      return out;
    }
  }
  /** Empalme exacto: busca en el trozo nuevo dónde continúa el final del anterior (`tail`), cerca de la posición esperada.
      Devuelve la muestra desde la que hay que reproducir. No depende de cuánto retraso agregue cada decodificador. */
  function spliceAt(x, tail, expected, W, R) {
    let best = -1, bestE = Infinity, e0 = 1e-9;
    for (let i = 0; i < W; i += 4) e0 += tail[i] * tail[i];
    const exp = expected - W, max = x.length - W - 1;
    for (let d = 0; d <= R; d++) for (const p of d ? [exp - d, exp + d] : [exp]) {
      if (p < 0 || p > max) continue;
      let e = 0; const lim = bestE * .98;
      for (let i = 0; i < W; i += 4) { const q = x[p + i] - tail[i]; e += q * q; if (e >= lim) break; }
      if (e < lim) { bestE = e; best = p; }
    }
    return best >= 0 && bestE < .05 * e0 ? best + W : expected;
  }
  return { header, FrameSplitter, spliceAt };
});

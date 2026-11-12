/* RADIA · reconocedor de avisos por huella acústica.
   Idea (la misma que usan Shazam y los sistemas de monitoreo de radio): un aviso se emite muchas veces y siempre suena igual.
   - Fingerprinter: convierte el audio en ~21 huellas de 32 bits por segundo (Haitsma-Kalker: signo de las diferencias de
     energía entre 33 bandas de 300 a 2000 Hz y entre cuadros consecutivos). Resiste recodificación y cambios de volumen.
   - AdMemory: recuerda las huellas de lo escuchado. Si un tramo de entre 6 y 100 s vuelve a sonar, es un aviso: lo guarda en
     la biblioteca. Desde entonces lo reconoce en sus primeros segundos y sabe cuándo termina. Las canciones (repeticiones largas) no cuentan. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadiaFP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const N = 2048, HOP = 256, NB = 33;

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  const pop = x => { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
  /** Proporción de bits distintos entre dos tiras de huellas (0 = idénticas, 0,5 = sin relación). */
  function ber(A, ia, B, ib, n) { let d = 0; for (let i = 0; i < n; i++) d += pop(A[ia + i] ^ B[ib + i]); return d / (32 * n); }

  class Fingerprinter {
    constructor(sr) {
      this.sr = sr; this.dec = Math.max(1, Math.round(sr / 5512)); this.fs = sr / this.dec; this.frameDur = HOP / this.fs;
      this.buf = new Float32Array(N); this.fill = 0; this.acc = 0; this.accN = 0; this.k = 0; this.prev = null;
      this.re = new Float64Array(N); this.im = new Float64Array(N); this.win = new Float64Array(N);
      for (let i = 0; i < N; i++) this.win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
      this.edge = []; for (let m = 0; m <= NB; m++) { let b = Math.round(300 * Math.pow(2000 / 300, m / NB) / (this.fs / N)); if (m && b <= this.edge[m - 1]) b = this.edge[m - 1] + 1; this.edge.push(b); }
    }
    /** Devuelve { fps, firstK }: las huellas nuevas y el número de cuadro de la primera. El cuadro k empieza en k·HOP muestras (ya diezmadas). */
    push(x) {
      const out = [], firstK = this.k < 1 ? 1 : this.k;
      for (let i = 0; i < x.length; i++) {
        this.acc += x[i]; if (++this.accN < this.dec) continue;
        this.buf[this.fill++] = this.acc / this.dec; this.acc = 0; this.accN = 0;
        if (this.fill < N) continue;
        const re = this.re, im = this.im; for (let j = 0; j < N; j++) { re[j] = this.buf[j] * this.win[j]; im[j] = 0; }
        fft(re, im);
        const d = new Float64Array(NB - 1); let last = 0;
        for (let m = 0; m < NB; m++) { let e = 0; for (let b = this.edge[m]; b < this.edge[m + 1]; b++) e += re[b] * re[b] + im[b] * im[b]; if (m) d[m - 1] = last - e; last = e; }
        if (this.prev) { let f = 0; for (let m = 0; m < NB - 1; m++) if (d[m] - this.prev[m] > 0) f |= (1 << m); out.push(f >>> 0); }
        this.prev = d; this.k++;
        this.buf.copyWithin(0, HOP); this.fill = N - HOP;
      }
      return { fps: Uint32Array.from(out), firstK };
    }
  }

  const b64 = u32 => { const b = new Uint8Array(u32.buffer, u32.byteOffset, u32.byteLength); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = s => { const r = atob(s), b = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return new Uint32Array(b.buffer, 0, b.length >> 2); };

  class AdMemory {
    constructor(o = {}) {
      this.o = Object.assign({ cap: 1 << 19, block: 64, step: 8, thr: .25, keep: .33, minAd: 6, maxAd: 100, excl: 600, lost: 2.5, bridge: 15, fd: HOP / 5512.5 }, o);
      this.h = new Uint32Array(this.o.cap); this.ht = new Float64Array(this.o.cap); this.n = 0; this.seg0 = 0;
      this.T = Math.max(1 << 14, this.o.cap >> 1); this.keys = new Uint32Array(this.T); this.vals = new Int32Array(this.T); this.used = 0;
      this.library = []; this.libIndex = new Map(); this.seq = 0;
      this.fp = null; this.expect = null; this.t0 = 0; this.run = null; this.cover = 0; this.sinceQ = 0; this.pending = []; this.onEvent = null; this.now = 0;
    }
    // ---- índice de lo escuchado (uno de cada 4 cuadros, tabla de direccionamiento abierto) ----
    _slot(f) { return (Math.imul(f ^ (f >>> 15), 0x9E3779B1) >>> 13) & (this.T - 1); }
    _insert(f, g) {
      if (f === 0 || f === 0xFFFFFFFF) return;
      if (this.used > this.T * .6) this._rebuild();
      let s = this._slot(f); while (this.vals[s] !== 0) s = (s + 1) & (this.T - 1);
      this.keys[s] = f; this.vals[s] = g + 1; this.used++;
    }
    _rebuild() {
      this.vals.fill(0); this.used = 0; const lo = Math.max(0, this.n - this.o.cap);
      for (let g = lo + ((4 - lo % 4) % 4); g < this.n; g += 4) { const f = this.h[g % this.o.cap]; if (f === 0 || f === 0xFFFFFFFF) continue; let s = this._slot(f); while (this.vals[s] !== 0) s = (s + 1) & (this.T - 1); this.keys[s] = f; this.vals[s] = g + 1; this.used++; }
    }
    _lookup(f, fn) { let s = this._slot(f), tries = 0; const lo = this.n - this.o.cap; while (this.vals[s] !== 0 && tries++ < 48) { if (this.keys[s] === f) { const g = this.vals[s] - 1; if (g >= lo && this.h[g % this.o.cap] === f) fn(g); } s = (s + 1) & (this.T - 1); } }
    _at(g) { return this.h[g % this.o.cap]; }
    _time(g) { return this.ht[g % this.o.cap]; }
    _emit(e) { if (this.onEvent) this.onEvent(e); }

    /** Audio nuevo: x (mono), su frecuencia de muestreo y el instante t (s) de su primera muestra. */
    push(x, sr, t) {
      if (!this.fp || this.fp.sr !== sr || this.expect == null || Math.abs(t - this.expect) > .25) { this._break(); this.fp = new Fingerprinter(sr); this.t0 = t; this.o.fd = this.fp.frameDur; }
      this.expect = t + x.length / sr;
      const r = this.fp.push(x);
      for (let i = 0; i < r.fps.length; i++) this._frame(r.fps[i], this.t0 + ((r.firstK + i) * HOP + N / 2) / this.fp.fs);
      this.now = this.expect;
    }
    flush() { this._break(); }
    _break() { if (this.run) this._finish(this.run, this.run.edge != null ? this.run.edge : this.run.last); this.seg0 = this.n; this.sinceQ = 0; this.expect = null; }
    _frame(f, t) {
      const g = this.n; this.h[g % this.o.cap] = f; this.ht[g % this.o.cap] = t; if (g % 4 === 0) this._insert(f, g); this.n++;
      if (this.pending.length && t >= this.pending[0].t1 + .5) { const p = this.pending.shift(); this._learnTimes(p.t0, p.t1); }
      if (++this.sinceQ >= this.o.step && this.n - this.seg0 >= this.o.block) { this.sinceQ = 0; this._query(); }
    }
    /** BER entre n cuadros actuales desde c y el otro lado de la alineación (biblioteca o historial). null si se sale de rango. */
    _cmp(r, c, n) {
      let d = 0;
      if (r.lib) { const p = c - r.off, F = r.lib.fps; if (p < 0 || p + n > F.length) return null; for (let i = 0; i < n; i++) d += pop(this._at(c + i) ^ F[p + i]); }
      else { const p = c - r.off; if (p < this.n - this.o.cap || p < 0 || p + n > c) return null; for (let i = 0; i < n; i++) d += pop(this._at(c + i) ^ this._at(p + i)); }
      return d / (32 * n);
    }
    _query() {
      const o = this.o, end = this.n;
      if (this.run) {
        const r = this.run, m = 24, e = this._cmp(r, end - m, m);
        if (!r.lib) { const known = this._search(true); if (known) { this.run = null; return this._start(known); } }   // si resulta ser un aviso ya conocido, manda la biblioteca
        if (e != null && e < o.keep) { r.last = end; r.edge = null; return; }
        if (e == null && r.lib && end - r.off >= r.lib.fps.length) return this._finish(r, Math.min(end, r.off + r.lib.fps.length));
        if ((end - r.last) * o.fd < o.lost) return;
        if (r.lib) this._finish(r, this._edge(r, r.last, +1));
        else {
          // Repetición sin biblioteca: no se cierra enseguida. Si la coincidencia se retoma en el mismo punto (una canción
          // interrumpida por una cortina, por ejemplo), sigue siendo el mismo tramo largo y no un aviso.
          if (r.edge == null) r.edge = this._edge(r, r.last, +1);
          if ((end - r.last) * o.fd >= o.bridge) this._finish(r, r.edge);
          else return;
        }
      }
      const hit = this._search(false); if (hit) this._start(hit);
    }
    /** Cada cuadro del bloque vota por las alineaciones donde su huella aparece exacta; se verifican las más votadas. */
    _search(libOnly) {
      const o = this.o, end = this.n, b0 = end - o.block; if (b0 < this.cover || b0 < this.seg0) return null;
      const votes = new Map(), tNow = this._time(end - 1);
      for (let i = b0; i < end; i++) {
        const f = this._at(i), L = this.libIndex.get(f);
        if (L) for (const code of L) { const li = Math.floor(code / 65536), off = i - (code % 65536), k = 'L' + li + ':' + off; const v = votes.get(k); if (v) v.n++; else votes.set(k, { n: 1, lib: this.library[li], off }); }
        if (!libOnly) this._lookup(f, g => {
          const t = this._time(g); if (g >= b0 || (t >= 0 && tNow - t < o.excl)) return;       // la misma emisión reciente no cuenta como repetición
          const k = 'H' + (i - g), v = votes.get(k); if (v) v.n++; else votes.set(k, { n: 1, lib: null, off: i - g });
        });
      }
      let best = null;
      for (const c of [...votes.values()].sort((a, b) => b.n - a.n).slice(0, 16)) {
        if (c.lib && c.lib.kind !== 'ad') continue;
        const e = this._cmp(c, b0, o.block); if (e == null || e >= o.thr) continue;
        if (!best || (c.lib && !best.lib) || (!!c.lib === !!best.lib && e < best.e)) best = { lib: c.lib, off: c.off, e };
      }
      return best;
    }
    _start(best) {
      const o = this.o, b0 = this.n - o.block, r = this.run = { lib: best.lib, off: best.off, start: b0, last: this.n, edge: null };
      r.start = this._edge(r, b0, -1);
      if (r.lib) {
        r.lib.hits++; r.lib.at = Date.now();
        r.ev = { type: 'ad', src: 'lib', id: r.lib.id, s: this._time(r.start), e: this._time(r.start) + (r.lib.fps.length - (r.start - r.off)) * o.fd };
        this._emit(r.ev);
      }
    }
    /** Afina un borde: avanza (dir=+1) o retrocede (dir=-1) de a 4 cuadros mientras la coincidencia se mantenga. */
    _edge(r, g, dir) {
      const w = 16;
      for (let k = 0; k < 6000; k++) {
        const c = dir < 0 ? g - 4 : g + 4 - w; if (c < this.seg0 || c < this.cover || c + w > this.n) break;
        const e = this._cmp(r, c, w); if (e == null || e >= .35) break;
        g += 4 * dir;
      }
      return g;
    }
    _finish(r, last) {
      this.run = null; this.cover = Math.max(this.cover, last); const o = this.o, len = (last - r.start) * o.fd;
      if (r.lib) { const e = this._time(Math.max(r.start, last - 1)); if (Math.abs(e - r.ev.e) > 1) this._emit({ type: 'end', id: r.lib.id, s: r.ev.s, e }); return; }
      if (len < o.minAd || len > o.maxAd) return;                          // muy corto (cortina) o muy largo (canción, repetición de programa)
      const lib = this._learn(r.start, last, 'ad');
      this._emit({ type: 'ad', src: 'rep', id: lib.id, s: this._time(r.start), e: this._time(last - 1) });
    }
    _learn(g0, g1, kind) {
      const fps = new Uint32Array(g1 - g0); for (let i = 0; i < fps.length; i++) fps[i] = this._at(g0 + i);
      return this._addLib({ id: ++this.seq, kind, fps, hits: 1, at: Date.now() });
    }
    _addLib(lib) {
      const li = this.library.length; this.library.push(lib); this.seq = Math.max(this.seq, lib.id);
      for (let p = 0; p < lib.fps.length && p < 65536; p += 2) { const f = lib.fps[p]; if (f === 0 || f === 0xFFFFFFFF) continue; const a = this.libIndex.get(f); if (a) a.push(li * 65536 + p); else this.libIndex.set(f, [li * 65536 + p]); }
      return lib;
    }
    /** El usuario avisa que en el instante t suena publicidad: se aprende el tramo de 4 s antes a 12 s después. */
    teach(t) { const p = { t0: t - 4, t1: t + 12 }; if (this.now >= p.t1 + .5) this._learnTimes(p.t0, p.t1); else this.pending.push(p); }
    _learnTimes(t0, t1) {
      let g1 = this.n; while (g1 > this.seg0 && this._time(g1 - 1) > t1) g1--;
      let g0 = g1; while (g0 > this.seg0 && this._time(g0 - 1) >= t0) g0--;
      if ((g1 - g0) * this.o.fd >= this.o.minAd) { const lib = this._learn(g0, g1, 'ad'); lib.manual = true; this._emit({ type: 'learned', id: lib.id }); }
    }
    // ---- guardar y recuperar ----
    exportLibrary() { return this.library.map(l => ({ id: l.id, kind: l.kind, hits: l.hits, at: l.at, manual: !!l.manual, fps: b64(l.fps) })); }
    importLibrary(arr) { for (const l of arr || []) { try { this._addLib({ id: l.id, kind: l.kind, hits: l.hits || 1, at: l.at || 0, manual: !!l.manual, fps: unb64(l.fps).slice() }); } catch (e) { /* entrada dañada */ } } }
    importLibraryRaw(arr) { for (const l of arr || []) if (l && l.fps && l.fps.length) this._addLib({ id: l.id, kind: l.kind || 'ad', hits: l.hits || 1, at: l.at || 0, manual: !!l.manual, fps: l.fps }); }
    exportHistory(maxFrames) { const n = Math.min(maxFrames || this.o.cap, this.n, this.o.cap), u = new Uint32Array(n); for (let i = 0; i < n; i++) u[i] = this._at(this.n - n + i); return b64(u); }
    importHistory(s) { let u; try { u = unb64(s); } catch (e) { return; } this._break(); for (let i = 0; i < u.length; i++) { const g = this.n; this.h[g % this.o.cap] = u[i]; this.ht[g % this.o.cap] = -1; if (g % 4 === 0) this._insert(u[i], g); this.n++; } this.seg0 = this.n; }
    exportHistoryRaw(maxFrames) { const n = Math.min(maxFrames || this.o.cap, this.n, this.o.cap), u = new Uint32Array(n); for (let i = 0; i < n; i++) u[i] = this._at(this.n - n + i); return u; }
    importHistoryRaw(u) { if (!u || !u.length) return; this._break(); for (let i = 0; i < u.length; i++) { const g = this.n; this.h[g % this.o.cap] = u[i]; this.ht[g % this.o.cap] = -1; if (g % 4 === 0) this._insert(u[i], g); this.n++; } this.seg0 = this.cover = this.n; }
    stats() { return { avisos: this.library.filter(l => l.kind === 'ad').length, minutos: Math.round(Math.min(this.n, this.o.cap) * this.o.fd / 60) }; }
  }
  return { Fingerprinter, AdMemory, ber, fft, HOP, N };
});

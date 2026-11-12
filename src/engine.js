/* RADIA · motor: match por franja, detector de tanda, horarios aprendidos y director de cambios.
   Lógica pura (sin DOM ni audio) para poder probarla con Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadiaEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  // ---------- franjas ----------
  const SLOTS = [
    { id: 'madrugada', label: 'Madrugada', from: 0, to: 6 },
    { id: 'manana', label: 'Mañana', from: 6, to: 10 },
    { id: 'mediamanana', label: 'Media mañana', from: 10, to: 13 },
    { id: 'tarde', label: 'Tarde', from: 13, to: 17 },
    { id: 'regreso', label: 'Regreso', from: 17, to: 20 },
    { id: 'noche', label: 'Noche', from: 20, to: 24 }
  ];
  const slotAt = h => SLOTS.find(s => h >= s.from && h < s.to) || SLOTS[0];

  // ---------- tipos de contenido: [habla, energía, modernidad, latinidad] ----------
  const CATS = {
    periodistico: { label: 'Periodístico', v: [1, .35, .5, .5] },
    deportes: { label: 'Deportes', v: [1, .7, .5, .5] },
    magazine: { label: 'Magazine', v: [.75, .6, .6, .5] },
    religioso: { label: 'Religiosa', v: [.8, .2, .2, .5] },
    pop: { label: 'Pop', v: [.1, .65, .8, .4] },
    rock: { label: 'Rock', v: [.1, .8, .65, .15] },
    retro: { label: 'Clásicos', v: [.1, .5, .3, .45] },
    tropical: { label: 'Tropical', v: [.1, .85, .55, 1] },
    urbano: { label: 'Urbano', v: [.05, .9, 1, .9] },
    electronica: { label: 'Electrónica', v: [0, .9, 1, .1] },
    tango: { label: 'Tango', v: [.1, .35, 0, .7] },
    folclore: { label: 'Folclore', v: [.1, .4, .05, .8] },
    jazz: { label: 'Jazz', v: [.05, .35, .3, .1] },
    clasica: { label: 'Clásica', v: [.05, .2, 0, 0] }
  };
  const vec = c => (CATS[c] || CATS.pop).v;
  const blendTalk = (nominal, measured) => measured == null ? nominal : nominal * .5 + measured * .5;

  /** Match 0-100 entre dos contenidos. talkA/talkB: proporción de habla medida en vivo (opcional). */
  function match(a, b, o = {}) {
    const A = vec(a), B = vec(b);
    const ta = blendTalk(A[0], o.talkA), tb = blendTalk(B[0], o.talkB);
    const dt = ta - tb, de = A[1] - B[1], dm = A[2] - B[2], dl = A[3] - B[3];
    const music = (1 - ta) * (1 - tb);                 // el género solo pesa si en las dos suena música
    const d = Math.sqrt(1.4 * dt * dt + .5 * de * de + .9 * music * (dm * dm + dl * dl));
    return Math.round(100 * clamp(1 - d / 1.1));
  }
  const categoryAt = (station, hour) => {
    const p = station.profile || {};
    return p[slotAt(hour).id] || p['*'] || 'pop';
  };
  const RULES = [
    ['deportes', /sport|deport|f[uú]tbol/], ['periodistico', /news|noticia|talk|informa|periodis|actualidad/],
    ['religioso', /christian|cristian|cat[oó]lic|gospel|religio|evang|mar[ií]a\b/], ['tango', /tango/],
    ['folclore', /folk|folcl|gauch/], ['clasica', /classical|cl[aá]sica/], ['jazz', /jazz|blues/],
    ['urbano', /reggaet|reguet|urban|trap|hip.?hop/], ['tropical', /cumbia|tropical|salsa|plena/],
    ['rock', /rock|metal|indie|alternativ/], ['electronica', /electr|dance|house|techno/],
    ['retro', /oldies|[789]0s|retro|classic hits|rom[aá]ntic|melod|recuerdo/], ['pop', /pop|hits|top ?40/]
  ];
  function inferCategory(st) {
    const text = ((st.tags || '') + ' ' + (st.name || '')).toLowerCase();
    for (const [cat, re] of RULES) if (re.test(text)) return cat;
    return 'pop';
  }
  /** Cuanto menor el match, más corta la transición; por debajo de 40 no se mezclan las dos señales. */
  function transitionStyle(m, o = {}) {
    if (o.bothTalk) return { mode: 'cross', dur: 1.2 };
    if (m >= 70) return { mode: 'cross', dur: 3 };
    if (m >= 40) return { mode: 'cross', dur: 1.8 };
    return { mode: 'dip', dur: 1.6 };
  }

  // ---------- horarios aprendidos (probabilidad de tanda por minuto de la hora) ----------
  class Schedule {
    constructor(d) {
      this.ad = (d && d.ad) ? d.ad.slice() : new Array(60).fill(0);
      this.tot = (d && d.tot) ? d.tot.slice() : new Array(60).fill(0);
    }
    observe(minute, isAd, dt) { this.tot[minute] += dt; if (isAd) this.ad[minute] += dt; }
    p(minute) { return (this.ad[minute] + 60 * .1) / (this.tot[minute] + 60); }
    confident(minute) { return this.tot[minute] >= 180; }
    toJSON() { return { ad: this.ad.map(Math.round), tot: this.tot.map(Math.round) }; }
  }

  // ---------- detector por emisora ----------
  class Brain {
    constructor(o = {}) {
      this.o = Object.assign({ gapDb: -50, win: 3, enter: .6, enterHold: 1.5, exitHold: 5, maxBreak: 300, breakLen: 150, rest: 90,
        seg: 5, novMin: 3.5, warm: 20, minSeg: 6, maxSeg: 45, closeAfter: 50 }, o);
      this.blocks = []; this.cuts = []; this.cutInfo = []; this.acc = null; this.open2 = null; this.ret = null; this.restUntil = -1e9; this.prog = null;
      this.frames = []; this.iv = []; this.bounds = [];
      this.base = null; this.baseC = null; this.talk = null; this.p = 0;
      this.open = null; this.gapStart = null; this.riseT = null; this.hiSince = null; this.calmSince = null;
      this.lastT = null; this.analysisT = -1e9; this.detectedAt = null;
    }
    /** Un frame del vivo: { t (s), db (nivel RMS), centroid (Hz) } */
    pushFrame(f) {
      const o = this.o, t = f.t, dt = this.lastT == null ? .05 : clamp(t - this.lastT, 0, 1);
      this.lastT = t; this.analysisT = t;
      f.amp = Math.pow(10, f.db / 20);
      if (f.bands) this._v2(f);
      const fr = this.frames; fr.push(f);
      while (fr.length && fr[0].t < t - 40) fr.shift();
      // silencios cortos = costuras entre avisos
      if (f.db < o.gapDb) { if (this.gapStart == null) this.gapStart = t; }
      else if (this.gapStart != null) {
        const len = t - this.gapStart;
        if (len >= .12 && len <= 1.5 && this.base != null) this.bounds.push(this.gapStart);
        this.gapStart = null;
      }
      while (this.bounds.length && this.bounds[0] < t - 10) this.bounds.shift();
      while (this.iv.length && this.iv[0].e != null && this.iv[0].e < t - 900) this.iv.shift();
      if (t - fr[0].t < o.win) return;
      let n = 0, sum = 0, c = 0, all = 0, sumAll = 0, i0 = fr.length;
      for (let i = fr.length - 1; i >= 0 && fr[i].t >= t - o.win; i--) {
        const g = fr[i]; i0 = i; all++; sumAll += g.amp;
        if (g.db >= o.gapDb) { n++; sum += g.amp; c += g.centroid || 0; }
      }
      if (n < 10) return;
      const loud = 20 * Math.log10(sum / n), cent = c / n, meanAll = sumAll / all;
      let low = 0; for (let i = i0; i < fr.length; i++) if (fr[i].amp < .5 * meanAll) low++;
      if (this.base == null) { this.base = loud; this.baseC = cent || 1; return; }
      const s1 = clamp((loud - this.base - 1.5) / 3.5);                     // más fuerte que el contenido
      const s2 = clamp(this.bounds.length / 3);                             // costuras recientes
      const s3 = clamp((cent / this.baseC - 1.12) / .4);                    // más brillante
      const raw = 1 - (1 - .6 * s1) * (1 - .55 * s2) * (1 - .5 * s3);
      this.p += (raw - this.p) * clamp(dt / 1);
      if (!this.open) {
        if (raw > .25) { if (this.riseT == null) this.riseT = t; } else if (raw < .12) this.riseT = null;
        if (this.p > o.enter && !(t < this.restUntil) && o.heur !== false) {
          if (this.hiSince == null) this.hiSince = t;
          if (t - this.hiSince >= o.enterHold) {
            const s = Math.max((this.riseT == null ? t : this.riseT) - 1, t - 10);
            this.open = { s, e: null, src: 'audio' }; this.iv.push(this.open);
            this.calmSince = null; this.detectedAt = t;
          }
        } else this.hiSince = null;
        if (!this.open && this.p < .35) {                                   // solo el contenido mueve la referencia
          const a = clamp(dt / 45);
          this.base += (loud - this.base) * a; this.baseC += (cent - this.baseC) * a;
          const ti = clamp((low / all - .1) / .3);
          this.talk = this.talk == null ? ti : this.talk + (ti - this.talk) * clamp(dt / 20);
        }
      } else if (this.open.src === 'audio') {
        if (s1 < .3 && s3 < .3) {
          if (this.calmSince == null) this.calmSince = t;
          if (t - this.calmSince >= o.exitHold) this._close(this.calmSince - 1);
        } else this.calmSince = null;
        if (this.open && t - this.open.s > o.maxBreak) { this._close(t); this.base = loud; this.baseC = cent; this.p = 0; this.restUntil = t + o.rest; }
      }
    }
    // --- v2: la tanda como sucesión de segmentos cortos de timbre distinto (no depende del volumen) ---
    _v2(f) {
      let a = this.acc;
      if (a && f.t - a.t0 >= 1) { this._block(a); a = null; }
      if (!a) a = this.acc = { t0: f.t, n: 0, sum: new Array(f.bands.length).fill(0), amp: [] };
      a.n++; for (let k = 0; k < a.sum.length; k++) a.sum[k] += f.bands[k]; a.amp.push(f.amp);
    }
    _block(a) {
      if (a.n < 3) return;                                                   // pestaña en segundo plano: muy pocos datos
      const o = this.o, L = o.seg, B = this.blocks, avg = x => x.reduce((p, c) => p + c, 0) / x.length;
      const m = a.sum.map(x => x / a.n), mean = avg(m), am = avg(a.amp);
      B.push({ t: a.t0, shape: m.map(x => x - mean), talk: a.amp.filter(x => x < .5 * am).length / a.n, nov: 0 });
      if (B.length > 240) B.shift();
      if (B.length < 2 * L + 4) return;
      const c = B.length - L, K = B[c].shape.length; let d = 0, ta = 0, tb = 0;
      for (let k = 0; k < K; k++) { let x = 0, y = 0; for (let i = 0; i < L; i++) { x += B[c - 1 - i].shape[k]; y += B[c + i].shape[k]; } d += Math.pow((x - y) / L, 2); }
      for (let i = 0; i < L; i++) { ta += B[c - 1 - i].talk; tb += B[c + i].talk; }
      B[c].nov = Math.sqrt(d / K) + 4 * Math.abs(ta - tb) / L;               // cuánto cambió el sonido en este punto
      const p = c - 2, v = B[p].nov; let peak = v > 0;
      for (let i = p - 2; i <= p + 2; i++) if (i !== p && (i < p ? B[i].nov > v : B[i].nov >= v)) peak = false;
      // umbral que se adapta a cuánto varía normalmente esta radio (mediana + desvío robusto)
      const hist = B.slice(Math.max(0, p - 120), p).map(x => x.nov).filter(x => x > 0).sort((x, y) => x - y), med = hist.length ? hist[hist.length >> 1] : 0;
      const dev = hist.map(x => Math.abs(x - med)).sort((x, y) => x - y), mad = dev.length ? dev[dev.length >> 1] : 0;
      const thr = Math.max(o.novMin, med + 3 * mad, 1.8 * med);
      const last = this.cuts[this.cuts.length - 1];
      if (peak && hist.length >= o.warm && v > thr && (last == null || B[p].t - last >= 5)) {
        const t = B[p].t, mean = (from) => { const r = new Array(K).fill(0); for (let i = 0; i < L; i++) for (let k = 0; k < K; k++) r[k] += B[from + i].shape[k] / L; return r; };
        const info = { t, v, before: mean(p - L), after: mean(p) }, prev = this.cutInfo[this.cutInfo.length - 1];
        this.cuts.push(t); this.cutInfo.push(info); if (this.cuts.length > 60) { this.cuts.shift(); this.cutInfo.shift(); }
        // si lo que suena ahora se parece a lo de antes del corte anterior, fue un inserto dentro del mismo programa
        const back = prev ? Math.sqrt(prev.before.reduce((q, x, k) => q + Math.pow(x - info.after[k], 2), 0) / K) : 0;
        if (!this.open2 && last != null && t - last >= o.minSeg && t - last <= o.maxSeg && back > Math.max(2, .5 * v) && !(a.t0 < this.restUntil) && o.heur !== false
            && !(this.prog && this._far(info.before, this.prog) < Math.max(1.5, .45 * v))) {      // ...y el segmento corto no es el propio programa      // un segmento corto y lo que sigue es otra cosa: tanda
          // firma del programa: cómo sonaba en los 15 s previos a la tanda. Sirve para reconocer cuándo vuelve.
          const pre = B.filter(x => x.t >= last - 15 && x.t < last), sig = new Array(K).fill(0);
          for (const x of pre) for (let k = 0; k < K; k++) sig[k] += x.shape[k] / pre.length;
          this.open2 = { s: Math.max(last, this.restUntil), e: null, src: 'cuts', known: a.t0 + 1, sig: pre.length >= 5 ? sig : prev.before, lim: Math.max(1.5, .45 * prev.v) };
          this.prog = this.open2.sig;
          this.iv.push(this.open2); this.detectedAt = a.t0 + 1; this.ret = null;
        } else if (this.open2 && this._far(info.after, this.open2.sig) < this.open2.lim) this.ret = t;      // ¿volvió el programa en este corte?
      }
      if (this.open2) {
        const end = this.cuts[this.cuts.length - 1], done = (e, rest) => { this.open2.e = e; this.open2.closedAt = a.t0 + 1; this.open2 = null; this.ret = null; if (rest) this.restUntil = a.t0 + o.rest; };
        if (this.ret != null && B[p].t - this.ret >= 15) {                                      // 15 s seguidos sonando como el programa: terminó la tanda
          const seg = B.filter(x => x.t >= this.ret && x.t < this.ret + 15), m = new Array(K).fill(0);
          for (const x of seg) for (let k = 0; k < K; k++) m[k] += x.shape[k] / seg.length;
          if (this._far(m, this.open2.sig) < this.open2.lim) done(this.ret); else this.ret = null;
        }
        if (this.open2 && B[p].t - end > o.closeAfter) done(end);                               // un tramo largo y estable: volvió el programa
        else if (this.open2 && B[p].t - this.open2.s > o.maxBreak) done(B[p].t, true);          // tope: ninguna tanda dura tanto; el detector se toma un respiro
      }
    }
    _far(x, y) { let q = 0; for (let k = 0; k < x.length; k++) q += Math.pow(x[k] - y[k], 2); return Math.sqrt(q / x.length); }
    _close(e) {
      if (!this.open) return;
      this.open.e = Math.max(e, this.open.s + 1);
      this.open = null; this.hiSince = null; this.riseT = null; this.calmSince = null;
    }
    hasAnalysis(t) { return t - this.analysisT < 3; }
    /** Sin audio analizable: abre y cierra la tanda según el horario aprendido. */
    tickClock(t, minute, sched) {
      if (this.hasAnalysis(t)) return;
      if (this.open && this.open.src === 'audio') this._close(t);
      const p = sched.p(minute);
      if (!this.open) { if (sched.confident(minute) && p > .65) { this.open = { s: t, e: null, src: 'prior' }; this.iv.push(this.open); } }
      else if (this.open.src === 'prior' && p < .4) this._close(t);
    }
    /** El usuario avisa: “esto es publicidad” (th = instante que está oyendo). */
    markAd(th) { if (!this.isAdAt(th)) this.iv.push({ s: th - 2, e: th - 2 + this.o.breakLen, src: 'manual' }); }
    markClear(th) {
      for (const iv of this.iv) if (iv.s <= th && (iv.e == null || th < iv.e)) {
        if (iv.src === 'manual') this.o.breakLen = Math.max(20, .5 * this.o.breakLen + .5 * (th - iv.s));
        iv.e = th; if (iv === this.open) this._close(th);
      }
    }
    isAdAt(t) { for (const iv of this.iv) if (iv.s <= t && (iv.e == null || t < iv.e)) return true; return false; }
    nextAdStart(t) { let m = null; for (const iv of this.iv) if (iv.s > t && (m == null || iv.s < m)) m = iv.s; return m; }
    isQuietAt(t) {
      const fr = this.frames; if (!fr.length || this.base == null || t < fr[0].t) return false;
      let lo = 0, hi = fr.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (fr[mid].t < t) lo = mid + 1; else hi = mid; }
      return fr[lo].db < this.base - 10;
    }
  }

  // ---------- director: decide cuándo y a dónde cambiar ----------
  class Director {
    constructor(o) {
      this.stations = o.stations; this.mainId = o.mainId; this.current = o.mainId;
      this.margin = o.margin == null ? .8 : o.margin; this.maxWait = o.maxWait == null ? 8 : o.maxWait;
      this.dwell = o.dwell == null ? 4 : o.dwell;
      this.lockUntil = 0; this.ducked = false; this.returnSince = null; this.hold = null;
    }
    get(id) { return this.stations.find(s => s.id === id); }
    heard(s, now) { return now - (s.delay || 0); }
    inAd(s, now) { return s.brain.isAdAt(this.heard(s, now)); }
    /** Segundos hasta que el oyente escucharía tanda en s (0 = ya, Infinity = nada a la vista). */
    tta(s, now) {
      if (s.ok === false || s.live === false || this.inAd(s, now)) return 0;
      const h = this.heard(s, now), n = s.brain.nextAdStart(h);
      return n == null ? Infinity : n - h;
    }
    clean(s, now, far) { return s.ok !== false && s.live !== false && this.tta(s, now) > Math.min(far ? 40 : 8, Math.max(0, (s.delay || 0) - (far ? 5 : 2))); }
    matchOf(a, b) { return match(a.category, b.category, { talkA: a.brain.talk, talkB: b.brain.talk }); }
    styleOf(a, b) {
      const m = this.matchOf(a, b);
      return Object.assign({ match: m }, transitionStyle(m, { bothTalk: vec(a.category)[0] > .6 && vec(b.category)[0] > .6 }));
    }
    _go(to, style, reason, now) {
      const from = this.current; this.current = to.id; this.returnSince = null; this.ducked = false;
      this.lockUntil = now + style.dur + this.dwell;
      return { type: 'switch', from, to: to.id, style, reason };
    }
    /** Cambio pedido por el usuario. */
    force(id, now) { const cur = this.get(this.current), to = this.get(id); if (!to || to === cur) return null; const a = this._go(to, this.styleOf(cur, to), 'manual', now); this.hold = id === this.mainId ? null : id; return a; }
    tick(now) {
      if (now < this.lockUntil) return null;
      const cur = this.get(this.current), main = this.get(this.mainId), fav = s => !s.tier;
      const clean = this.stations.filter(s => s !== cur && this.clean(s, now));
      const favs = clean.filter(fav), pool = favs.length ? favs : clean;                      // la reserva solo entra si no queda favorita limpia
      const best = !pool.length ? null : pool.includes(main) ? main : pool.reduce((a, b) => this.matchOf(cur, b) > this.matchOf(cur, a) ? b : a);
      const t = this.tta(cur, now);
      if (t < Infinity) {                                                                     // viene (o ya está) la tanda en la que suena
        if (best) {
          const style = this.styleOf(cur, best);
          if (t <= style.dur + this.margin) { this.hold = null; return this._go(best, style, 'ad', now); }
        } else if (t === 0 && !this.ducked && cur.ok !== false) { this.ducked = true; return { type: 'duck' }; }
        return null;
      }
      if (this.ducked) { this.ducked = false; return { type: 'unduck' }; }
      // volver: a la principal desde cualquier lado; desde la reserva, a la mejor favorita limpia
      const home = cur !== main && this.hold !== cur.id && this.clean(main, now, true) ? main :      // para volver se pide un tramo largo sin avisos a la vista
        (cur.tier && favs.length ? best : null);
      if (home) {
        if (this.returnSince == null) this.returnSince = now;
        if (cur.brain.isQuietAt(this.heard(cur, now)) || now - this.returnSince >= this.maxWait || !cur.brain.frames.length)
          return this._go(home, this.styleOf(cur, home), 'return', now);
      } else this.returnSince = null;
      return null;
    }
  }

  return { SLOTS, CATS, slotAt, match, categoryAt, inferCategory, transitionStyle, Schedule, Brain, Director, clamp };
});

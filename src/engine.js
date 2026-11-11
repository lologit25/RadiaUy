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
      this.o = Object.assign({ gapDb: -50, win: 3, enter: .6, enterHold: 1.5, exitHold: 5, maxBreak: 480, breakLen: 150 }, o);
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
        if (this.p > o.enter) {
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
        if (this.open && t - this.open.s > o.maxBreak) { this._close(t); this.base = loud; this.baseC = cent; this.p = 0; }
      }
    }
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
      if (s.ok === false || this.inAd(s, now)) return 0;
      const h = this.heard(s, now), n = s.brain.nextAdStart(h);
      return n == null ? Infinity : n - h;
    }
    clean(s, now) { return s.ok !== false && this.tta(s, now) > Math.min(8, Math.max(0, (s.delay || 0) - 2)); }
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
      const cur = this.get(this.current), main = this.get(this.mainId);
      const others = this.stations.filter(s => s !== cur && this.clean(s, now));
      const t = this.tta(cur, now);
      if (t < Infinity) {
        if (others.length) {
          const best = others.includes(main) ? main : others.reduce((a, b) => this.matchOf(cur, b) > this.matchOf(cur, a) ? b : a);
          const style = this.styleOf(cur, best);
          if (t <= style.dur + this.margin) { this.hold = null; return this._go(best, style, 'ad', now); }
        } else if (t === 0 && !this.ducked && cur.ok !== false) { this.ducked = true; return { type: 'duck' }; }
        return null;
      }
      if (this.ducked) { this.ducked = false; return { type: 'unduck' }; }
      if (cur !== main && this.hold !== cur.id && this.clean(main, now)) {
        if (this.returnSince == null) this.returnSince = now;
        if (cur.brain.isQuietAt(this.heard(cur, now)) || now - this.returnSince >= this.maxWait || !cur.brain.frames.length)
          return this._go(main, this.styleOf(cur, main), 'return', now);
      } else this.returnSince = null;
      return null;
    }
  }

  return { SLOTS, CATS, slotAt, match, categoryAt, inferCategory, transitionStyle, Schedule, Brain, Director, clamp };
});

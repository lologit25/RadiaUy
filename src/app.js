/* RADIA · interfaz y audio. El motor (match, detector, director) vive en engine.js. */
(function () {
  'use strict';
  const E = window.RadiaEngine;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const ICON = {
    play: '<svg viewBox="0 0 30 30"><path d="M9 5.5v19a1 1 0 0 0 1.5.86l16-9.5a1 1 0 0 0 0-1.72l-16-9.5A1 1 0 0 0 9 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 30 30"><rect x="6.5" y="5" width="6" height="20" rx="1.6"/><rect x="17.5" y="5" width="6" height="20" rx="1.6"/></svg>',
    star: '<svg viewBox="0 0 22 22"><path d="M11 1.8l2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L11 15.8 5.3 19l1.4-6.3L1.9 8.4l6.4-.7z"/></svg>',
    plus: '<svg viewBox="0 0 22 22"><path d="M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 5v3h3v2h-3v3h-2v-3H7v-2h3V7z"/></svg>',
    minus: '<svg viewBox="0 0 22 22"><path d="M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM7 10h8v2H7z"/></svg>',
    playS: '<svg viewBox="0 0 22 22"><path d="M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 7l6 4-6 4z"/></svg>',
    stopS: '<svg viewBox="0 0 22 22"><path d="M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 8h6v6H8z"/></svg>',
    tune: '<svg viewBox="0 0 22 22"><path d="M3 6h9.2a2.5 2.5 0 0 0 4.6 0H19V4.5h-2.2a2.5 2.5 0 0 0-4.6 0H3zm0 6.75h2.2a2.5 2.5 0 0 0 4.6 0H19v-1.5H9.8a2.5 2.5 0 0 0-4.6 0H3zM3 19h7.2a2.5 2.5 0 0 0 4.6 0H19v-1.5h-4.2a2.5 2.5 0 0 0-4.6 0H3z"/></svg>'
  };

  // Catálogo de demostración. Perfiles por franja aproximados: se editan desde Emisoras.
  const SEED = [
    ['oceano', 'Océano FM', '93.9 FM', { '*': 'pop', manana: 'magazine', regreso: 'magazine' }, ['oceano']],
    ['delsol', 'Del Sol', '99.5 FM', { '*': 'rock', manana: 'magazine', mediamanana: 'magazine', regreso: 'magazine' }, ['del sol']],
    ['azul', 'Azul FM', '101.9 FM', { '*': 'pop', manana: 'magazine' }, ['azul fm']],
    ['sarandi', 'Radio Sarandí', '690 AM', { '*': 'periodistico' }, ['sarandi']],
    ['espectador', 'El Espectador', '810 AM', { '*': 'periodistico' }, ['espectador']],
    ['carve', 'Radio Carve', '850 AM', { '*': 'periodistico' }, ['carve']],
    ['universal', 'Radio Universal', '970 AM', { '*': 'periodistico', regreso: 'deportes' }, ['universal 970', 'radio universal']],
    ['sport', 'Sport 890', '890 AM', { '*': 'deportes' }, ['sport 890']],
    ['montecarlo', 'Radio Monte Carlo', '930 AM', { '*': 'magazine', manana: 'periodistico' }, ['monte carlo', 'montecarlo']],
    ['radiomundo', 'Radiomundo', '1170 AM', { '*': 'periodistico' }, ['radiomundo']],
    ['uruguay', 'Radio Uruguay', '1050 AM', { '*': 'periodistico' }, ['radio uruguay']],
    ['m24', 'M24', '97.9 FM', { '*': 'periodistico' }, ['m24']],
    ['clarin', 'Radio Clarín', '580 AM', { '*': 'tango', tarde: 'folclore' }, ['clarin']],
    ['clasica', 'Clásica', '650 AM', { '*': 'clasica' }, ['clasica 650', 'radio clasica']],
    ['babel', 'Babel', '97.1 FM', { '*': 'jazz' }, ['babel']],
    ['delsur', 'Emisora del Sur', '94.7 FM', { '*': 'folclore' }, ['emisora del sur']],
    ['disney', 'Radio Disney', '91.9 FM', { '*': 'pop' }, ['disney']],
    ['cero', 'Radio Cero', '104.3 FM', { '*': 'pop' }, ['radio cero']],
    ['metropolis', 'Metrópolis FM', '104.9 FM', { '*': 'retro' }, ['metropolis']],
    ['alfa', 'Alfa FM', '96.3 FM', { '*': 'retro' }, ['alfa fm']],
    ['galaxia', 'Galaxia FM', '105.9 FM', { '*': 'tropical' }, ['galaxia']]
  ];

  // ---------- estado guardado en el dispositivo ----------
  const KEY = 'radia.v1';
  const BRIDGE = '';                       // dirección del puente incluida en esta publicación (vacío = sin puente)
  const IN_CLAUDE = /claude|anthropic/i.test(location.hostname) || /claude/i.test(document.referrer);
  const DEF = () => ({ mode: IN_CLAUDE ? 'demo' : 'live', favs: { demo: ['d-oceano', 'd-delsol', 'd-azul'], live: [] }, main: { demo: 'd-oceano', live: null },
    delay: 45, v: 3, proxy: '', profiles: {}, custom: [], sched: {}, probe: {}, stats: { avoided: 0, heard: 0, switches: 0 }, catalog: [], catalogAt: 0, tap: null });
  let S = DEF();
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.favs && j.main) { S = Object.assign(S, j); S.probe = S.probe || {}; if (j.v !== 3) { S.delay = 45; S.v = 3; S.probe = {}; } } } catch (e) { /* sin almacenamiento: se sigue en memoria */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* idem */ } };
  const PX = () => S.proxy || BRIDGE;
  const lookahead = () => S.mode === 'demo' ? 12 : S.delay;
  const scheds = {};
  const sched = id => scheds[id] || (scheds[id] = new E.Schedule(S.sched[id]));

  // ---------- catálogo ----------
  let catalogState = 'idle';
  const demoStations = () => SEED.map(([k, name, freq, profile]) => ({ id: 'd-' + k, name, freq, profile, demo: true }));
  const EXTRA = [
    [['fm hit'], { '*': 'urbano', manana: 'magazine' }], [['inolvidable'], { '*': 'retro' }], [['la diaria', 'radio oriental', 'radio america', 'nacional (la treinta)', 'continente', 'uniradio'], { '*': 'periodistico' }],
    [['carve deportiva', 'espacio sport'], { '*': 'deportes' }], [['radio rural'], { '*': 'periodistico', madrugada: 'folclore' }], [['aire fm', 'futura'], { '*': 'pop', manana: 'magazine' }],
    [['radio maria', 'nuevo tiempo', 'felicidad', 'celestial', 'kairos'], { '*': 'religioso' }], [['cultura'], { '*': 'periodistico' }]
  ];
  function seedProfile(st) {
    const n = norm(st.name);
    const x = EXTRA.find(e => e[0].some(k => n.includes(k))); if (x) return x[1];
    const hit = SEED.find(s => s[4].some(k => n.includes(k))); return hit ? hit[3] : null;
  }
  function dress(st) {
    st.profile = S.profiles[st.id] || st.profile || seedProfile(st) || { '*': E.inferCategory(st) };
    if (!st.freq) { const m = /(\d{2,3}[.,]\d|\b\d{3,4}\b)\s*(fm|am)?/i.exec(st.name); st.freq = m ? m[1].replace(',', '.') + (m[2] ? ' ' + m[2].toUpperCase() : '') : ''; }
    return st;
  }
  const BUILTIN = (window.RadiaStations || []).map(x => Object.assign({}, x, { urls: x.urls.slice() }));
  function liveStations() {
    const seen = new Set(BUILTIN.map(s => norm(s.name)));
    const extra = S.catalog.filter(s => !seen.has(norm(s.name)) && seen.add(norm(s.name))).map(s => Object.assign({}, s, { urls: s.urls || [s.url] }));
    return S.custom.map(s => Object.assign({}, s, { urls: s.urls || [s.url] })).concat(BUILTIN, extra);
  }
  let cache = null, cacheKey = '';
  const stations = () => {
    const k = S.mode + S.catalog.length + S.custom.length + JSON.stringify(S.profiles);
    if (k !== cacheKey) { cacheKey = k; cache = (S.mode === 'demo' ? demoStations() : liveStations()).map(dress); }
    return cache;
  };
  const byId = id => stations().find(s => s.id === id);
  const favs = () => S.favs[S.mode].map(byId).filter(Boolean);
  const mainId = () => { const f = favs(); return f.some(s => s.id === S.main[S.mode]) ? S.main[S.mode] : (f[0] && f[0].id) || null; };
  const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const catOf = st => E.categoryAt(st, hourNow());
  const catLabel = c => (E.CATS[c] || E.CATS.pop).label;
  const HUES = [212, 232, 252, 272, 296, 328, 348, 12, 28, 168, 188, 200];
  const hue = st => { let h = 7; for (const ch of st.name) h = (h * 31 + ch.charCodeAt(0)) % 9973; return HUES[h % HUES.length]; };
  const artText = st => { const p = (st.freq || '').split(' '); if (p[0]) return [p[0], p[1] || '']; return [st.name.replace(/radio|fm|am/gi, '').trim().slice(0, 2).toUpperCase() || 'FM', '']; };
  function blocked(st) {
    if (st.demo) return '';
    if (location.protocol === 'https:' && !PX() && !st.urls.some(u => /^https:/.test(u))) return 'Necesita el puente de audio';
    if (st.hls && !document.createElement('audio').canPlayType('application/vnd.apple.mpegurl')) return 'Formato no compatible con este navegador';
    return '';
  }
  async function loadCatalog(force) {
    if (!force && S.catalog.length && Date.now() - S.catalogAt < 7 * 864e5) { catalogState = 'ok'; return true; }
    catalogState = 'loading'; renderStations();
    for (const h of ['de1', 'de2', 'fi1', 'nl1', 'all']) {
      try {
        const c = new AbortController(), to = setTimeout(() => c.abort(), 7000);
        const r = await fetch('https://' + h + '.api.radio-browser.info/json/stations/search?countrycode=UY&hidebroken=true&order=votes&reverse=true&limit=500', { signal: c.signal });
        clearTimeout(to);
        if (!r.ok) continue;
        const j = await r.json(); if (!Array.isArray(j) || !j.length) continue;
        const seen = new Set();
        S.catalog = j.filter(x => x.url_resolved && !seen.has(norm(x.name)) && seen.add(norm(x.name)))
          .map(x => ({ id: x.stationuuid, name: String(x.name).trim(), urls: [x.url_resolved], tags: x.tags || '', hls: !!x.hls }));
        S.catalogAt = Date.now(); save(); catalogState = 'ok'; renderAll(); return true;
      } catch (e) { /* probar el siguiente servidor */ }
    }
    catalogState = 'ok'; renderAll(); return false;
  }

  // ---------- audio de demostración (sintético, con tandas programadas) ----------
  const TALKY = { periodistico: 1, deportes: 1, magazine: 1, religioso: 1 };
  const MUSIC = {
    pop: { bpm: 112, wave: 'triangle', cut: 2200, hat: 1, kick: [0, 4] }, rock: { bpm: 132, wave: 'sawtooth', cut: 2600, hat: 1, kick: [0, 4] },
    retro: { bpm: 100, wave: 'triangle', cut: 1600, hat: 1, kick: [0, 4] }, tropical: { bpm: 96, wave: 'square', cut: 2000, hat: 1, kick: [0, 3, 4, 7] },
    urbano: { bpm: 92, wave: 'sawtooth', cut: 1800, hat: 1, kick: [0, 3, 4, 6] }, electronica: { bpm: 126, wave: 'sawtooth', cut: 3000, hat: 1, kick: [0, 2, 4, 6] },
    tango: { bpm: 64, wave: 'sawtooth', cut: 1200, minor: 1, kick: [] }, folclore: { bpm: 84, wave: 'triangle', cut: 1500, kick: [] },
    jazz: { bpm: 104, wave: 'triangle', cut: 1400, hat: 1, kick: [] }, clasica: { bpm: 60, wave: 'sine', cut: 1800, kick: [] },
    magazine: { bpm: 100, wave: 'triangle', cut: 1400, bed: 1, kick: [] }
  };
  const VOW = [[700, 1200], [400, 2000], [300, 2500], [500, 900], [350, 800]];
  class Synth {
    constructor(ctx, out, noise, spec) {
      Object.assign(this, spec); this.ctx = ctx;
      let a = spec.seed >>> 0; this.r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      this.talky = !!TALKY[spec.category]; this.m = MUSIC[spec.category] || (this.talky ? null : MUSIC.pop);
      this.bus = ctx.createGain(); this.bus.connect(out);
      this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = this.m ? this.m.cut : 1500; this.lp.connect(this.bus);
      this.vo = ctx.createOscillator(); this.vo.type = 'sawtooth';
      this.f1 = ctx.createBiquadFilter(); this.f2 = ctx.createBiquadFilter(); this.f1.type = this.f2.type = 'bandpass'; this.f1.Q.value = this.f2.Q.value = 5;
      this.vg = ctx.createGain(); this.vg.gain.value = 0;
      this.vo.connect(this.f1); this.vo.connect(this.f2); this.f1.connect(this.vg); this.f2.connect(this.vg); this.vg.connect(this.bus); this.vo.start();
      this.noise = noise; this.ns = ctx.createBufferSource(); this.ns.buffer = noise; this.ns.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1500;
      this.ng = ctx.createGain(); this.ng.gain.value = 0; this.ns.connect(nf); nf.connect(this.ng); this.ng.connect(this.bus); this.ns.start();
      this.t0 = ctx.currentTime; this.next = this.vt = this.t0 + .06; this.step = 0; this.spot = 0; this.sy = 0; this.phrase = 9;
      this.sd = this.m ? 60 / this.m.bpm / 2 : .25; this.root = 110 * Math.pow(2, (spec.seed % 7) / 12); this.f0 = 105 + (spec.seed % 5) * 9;
      this.phase = ((this.period - this.adLen - this.firstAd) % this.period + this.period) % this.period;
    }
    tau(t) { return ((t - this.t0 + this.phase) % this.period + this.period) % this.period; }
    isAd(t) { return t >= this.t0 && this.tau(t) >= this.period - this.adLen; }
    spotPos(t) { return (this.tau(t) - (this.period - this.adLen)) % 5; }
    note(f, t, d, type, lv, dest) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + .015); g.gain.setValueAtTime(lv, t + Math.max(.02, d - .04)); g.gain.linearRampToValueAtTime(0, t + d);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + .03);
    }
    hit(t, d, lv, hz) {
      const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = hz;
      g.gain.setValueAtTime(lv, t); g.gain.linearRampToValueAtTime(0, t + d); s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, this.r()); s.stop(t + d + .02);
    }
    kick(t, lv) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + .12);
      g.gain.setValueAtTime(lv, t); g.gain.linearRampToValueAtTime(0, t + .14); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + .16);
    }
    syll(t, d, f0, F, lv) {
      this.vo.frequency.setValueAtTime(f0, t); this.f1.frequency.setValueAtTime(F[0], t); this.f2.frequency.setValueAtTime(F[1], t);
      const g = this.vg.gain; g.setValueAtTime(0, t); g.linearRampToValueAtTime(lv, t + .02); g.setValueAtTime(lv, t + d - .03); g.linearRampToValueAtTime(0, t + d);
    }
    content(t) {
      const m = this.m; if (!m) return;
      const bar = Math.floor(this.step / 8) % 4, prog = m.minor ? [0, 5, 7, 3] : [0, 7, 9, 5], root = this.root * Math.pow(2, prog[bar] / 12);
      const third = (m.minor || prog[bar] === 9) ? 3 : 4, lv = m.bed ? .03 : .06, s = this.step % 8;
      if (this.step % 4 === 0) for (const iv of [0, third, 7]) this.note(root * Math.pow(2, iv / 12), t, this.sd * 4 * .97, m.wave, lv, this.lp);
      if (m.bed) return;
      if ([0, 3, 4, 6].includes(s)) this.note(root / 2, t, this.sd * .9, 'triangle', .16, this.bus);
      if (m.hat && s % 2 === 1) this.hit(t, .04, .05, 6000);
      if (m.kick.includes(s)) this.kick(t, .28);
    }
    adStep(t) {
      if (this.spotPos(t) < .3) { this.spot = 0; return; }
      const f = 880 * Math.pow(2, ([0, 4, 7, 12, 7, 4, 9, 12][this.spot % 8] + this.seed % 5) / 12);
      this.note(f, t, .13, 'square', .11, this.bus); if (this.spot === 0) this.note(f * 1.5, t, .3, 'square', .13, this.bus);
      this.hit(t, .05, .09, 5000); if (this.spot % 2 === 0) this.kick(t, .3);
      this.spot++;
    }
    pump() {
      const now = this.ctx.currentTime, hz = now + (document.hidden ? 1.6 : .4);
      while (this.next < hz) {
        const ad = this.isAd(this.next);
        if (this.next >= now) { if (ad) this.adStep(this.next); else this.content(this.next); }
        this.next += ad ? .2 : this.sd; this.step++;
      }
      while (this.vt < hz) {
        const t = this.vt, r = this.r;
        if (this.isAd(t)) {
          const k = this.spotPos(t);
          if (k < .3) this.vt = t + (.3 - k) + .01;
          else { const d = .08 + r() * .05; if (t >= now) this.syll(t, d, 200 + r() * 60, VOW[r() * 5 | 0].map(x => x * 1.3), .9); this.vt = t + d + .03; }
        } else if (this.talky) {
          const d = .11 + r() * .12; if (t >= now) this.syll(t, d, this.f0 * (.9 + r() * .25), VOW[r() * 5 | 0], .55);
          let gap = .04 + r() * .05; if (++this.sy >= this.phrase) { this.sy = 0; this.phrase = 7 + (r() * 6 | 0); gap = .35 + r() * .3; }
          this.vt = t + d + gap;
        } else this.vt = t + .2;
      }
      this.ng.gain.setValueAtTime(this.talky && !this.isAd(hz) ? .07 : 0, hz);
    }
    stop() { try { this.vo.stop(); this.ns.stop(); } catch (e) { /* ya detenido */ } this.bus.disconnect(); }
  }

  // ---------- reproductor ----------
  // Regla de la casa: suena una sola emisora por vez. P.on es la que tiene la salida (ninguna mientras pasa el audio logo)
  // y P.next la que está por entrar. Todo lo demás queda en cero o directamente cerrado.
  const P = { ctx: null, chans: [], dir: null, playing: false, log: [], truth: 0, note: null, on: null, next: null, seq: 0, tap: null, outId: null };
  window.__radia = { P, S, E };
  const chan = id => P.chans.find(c => c.id === id);
  const curChan = () => P.dir && chan(P.dir.current);
  const wanted = ch => !!ch && (ch.id === P.on || ch.id === P.next);
  const C = E.CHANGE, IDENT_MIN = 1.15;

  // Para anticipar la tanda hay que abrir el stream de una emisora aunque no se escuche, y callarlo con una ganancia de Web Audio.
  // Safari (y todo navegador de iPhone y iPad) no le entrega a Web Audio el audio de un stream en vivo: suena por fuera y ninguna
  // ganancia lo calla. Por eso una emisora solo se abre en segundo plano donde se comprobó que el análisis recibe su audio.
  // Con ?directo en la dirección se fuerza ese modo de una sola conexión en cualquier navegador, para probarlo.
  const UA = navigator.userAgent;
  const APPLE = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /^((?!chrom|android|crios|fxios|edg).)*safari/i.test(UA);
  const NO_TAP = APPLE || /[?&]directo\b/.test(location.search);
  const tapKnown = () => NO_TAP ? false : S.tap && S.tap.ok && S.tap.ua === UA ? true : null;

  function graph(ch) {
    const c = P.ctx; ch.input = c.createGain(); ch.an = c.createAnalyser(); ch.an.fftSize = 1024; ch.an.smoothingTimeConstant = .3;
    ch.look = lookahead(); ch.dl = c.createDelay(ch.look + 1); ch.dl.delayTime.value = ch.look;
    ch.gL = c.createGain(); ch.gD = c.createGain(); ch.gL.gain.value = ch.gD.gain.value = 0;
    ch.input.connect(ch.an); ch.input.connect(ch.gL); ch.gL.connect(P.master);        // directo: suena ya, sin anticipación
    ch.input.connect(ch.dl); ch.dl.connect(ch.gD); ch.gD.connect(P.master);           // demorado: da margen para ver venir la tanda
    ch.g = ch.gL; ch.delay = 0; ch.liveAt = null; ch.level = 0; ch.fadeEnd = 0; ch.zeroed = true;
  }
  /** Al entrar a una emisora: usa la salida demorada si ya juntó margen; si no, la directa. */
  function tap(ch) {
    if (!ch.an) return;
    const use = ch.delay ? ch.gD : ch.gL, other = ch.delay ? ch.gL : ch.gD, t = P.ctx.currentTime;
    try { other.gain.cancelScheduledValues(0); other.gain.setValueAtTime(0, t); } catch (e) { /* nada */ }
    ch.g = use;
  }
  function ungraph(ch) { ch.g = null; for (const k of ['src', 'input', 'an', 'dl', 'gL', 'gD']) if (ch[k]) { try { ch[k].disconnect(); } catch (e) { /* ya suelto */ } ch[k] = null; } ch.delay = 0; }
  /** Corte duro de las dos salidas de una emisora analizada. */
  function zero(ch) {
    if (!ch.an) return; const t = P.ctx.currentTime;
    for (const g of [ch.gL, ch.gD]) { try { g.gain.cancelScheduledValues(0); g.gain.setValueAtTime(0, t); } catch (e) { /* nada */ } }
    ch.level = 0; ch.zeroed = true;
  }
  const usable = st => st.urls.filter(u => PX() || location.protocol !== 'https:' || /^https:/.test(u));
  const via = u => PX() ? PX().replace(/\/+$/, '') + '/s?u=' + encodeURIComponent(u) : u;

  // ---------- emisoras analizadas: cada una con su stream dentro del grafo ----------
  function closeStream(ch) {
    clearTimeout(ch.wd);
    if (ch.el) { const el = ch.el; ch.el = null; try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* nada */ } }
    ungraph(ch); ch.heard = false; if (P.outId !== ch.id) ch.live = false;
  }
  /** Abre el stream dentro del grafo para poder analizarlo. Si ninguna de sus direcciones lo permite, la emisora queda como directa. */
  function openStream(ch, k = 0) {
    const list = usable(ch.st);
    if (k >= list.length) { ch.direct = true; if (!ch.wasLive) ch.nocors = true; if (wanted(ch)) openDirect(ch); else check(ch); return; }
    const el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous'; el.src = via(list[k]);
    el.muted = P.tap !== true && P.on !== ch.id;                   // sin análisis comprobado, espera callada a que termine el audio logo
    ch.el = el; ch.live = false; ch.heard = false;
    graph(ch); ch.src = P.ctx.createMediaElementSource(el); ch.src.connect(ch.input);
    if (P.on === ch.id) fade(ch, P.dir && P.dir.ducked ? .18 : 1, C.in);                // se reabrió la que está al aire
    el.addEventListener('playing', () => { if (ch.el !== el) return; if (!ch.live) ch.liveAt = P.ctx.currentTime; ch.live = ch.ok = ch.wasLive = true; note(ch.id, { ok: true, cors: true }); });
    const fail = () => { if (ch.el !== el) return; closeStream(ch); openStream(ch, k + 1); };   // siguiente dirección
    el.addEventListener('error', fail);
    clearTimeout(ch.wd); ch.wd = setTimeout(() => { if (ch.el === el && !ch.live) fail(); }, 15000);
    el.play().catch(() => { /* se reintenta al tocar reproducir */ });
  }
  /** El análisis ya se comprobó en este navegador: recién ahora las demás emisoras se abren en segundo plano. */
  function openBackground() { for (const ch of P.chans) if (!ch.demo && !ch.direct && !ch.el && ch.ok !== false) openStream(ch); }
  function proven() {
    P.heardAny = true; if (P.tap === true) return;
    P.tap = true; S.tap = { ok: true, ua: UA }; save();
    for (const ch of P.chans) if (ch.el) ch.el.muted = false;      // con el grafo comprobado, las calla la ganancia y se pueden analizar
    openBackground();
  }
  /** El stream avanza pero al grafo no le llega nada: ese audio no se puede analizar ni callar con ganancias. Pasa a salida directa. */
  function deaf(ch) {
    const all = !P.heardAny;                                       // si a ninguna le llegó audio, este navegador no sirve para ninguna
    if (all) { P.tap = false; S.tap = null; save(); }
    for (const c of P.chans) {
      if (c.demo || c.direct || c.ok === false || !(all || c === ch)) continue;
      closeStream(c); c.direct = true;
      if (wanted(c)) openDirect(c); else check(c);
    }
  }
  /** Una emisora que no se abre en segundo plano: ¿su servidor responde? (se pregunta sin reproducirla) */
  async function check(ch) {
    for (const u of usable(ch.st)) {
      const c = new AbortController(), to = setTimeout(() => c.abort(), 8000);
      try { await fetch(via(u), { mode: 'no-cors', signal: c.signal, cache: 'no-store' }); clearTimeout(to); c.abort(); return; }
      catch (e) { clearTimeout(to); }
    }
    if (chan(ch.id) === ch && !ch.live && !wanted(ch)) { ch.ok = false; note(ch.id, { ok: false }); }
  }

  // ---------- emisoras sin análisis: un único reproductor directo ----------
  // Al ser uno solo es imposible que dos de estas emisoras suenen juntas. Se habilita con el toque de Reproducir (iPhone lo exige)
  // y después cambia de emisora cambiando de dirección.
  const OUT = new Audio(); OUT.preload = 'none'; let outVol = 1;
  const SILENCE = (() => {
    const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), s = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
    try { return URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); } catch (e) { return ''; }
  })();
  const setVol = v => { outVol = v; try { OUT.volume = E.clamp(v); } catch (e) { /* iPhone no deja mover el volumen */ } };
  function unlock() {
    if (P.outId || !SILENCE) return;
    OUT.muted = false; setVol(1); OUT.src = SILENCE; const p = OUT.play(); if (p && p.catch) p.catch(() => { /* nada */ });
  }
  function openDirect(ch, k = 0) {
    const list = usable(ch.st), prev = chan(P.outId);
    if (k >= list.length) { ch.ok = false; ch.live = false; note(ch.id, { ok: false }); if (prev === ch) closeDirect(); return; }
    clearTimeout(P.outWd); clearInterval(P.outFade); if (prev && prev !== ch) prev.live = false;
    P.outId = ch.id; P.outK = k; ch.live = false;
    OUT.muted = P.on !== ch.id; setVol(P.on === ch.id ? 1 : 0);                           // entra callada si todavía pasa el audio logo
    OUT.src = via(list[k]);
    P.outWd = setTimeout(() => { if (P.outId === ch.id && P.outK === k && !ch.live) openDirect(ch, k + 1); }, 15000);
    const p = OUT.play(); if (p && p.catch) p.catch(() => { /* se reintenta al tocar reproducir */ });
  }
  function closeDirect() {
    clearTimeout(P.outWd); clearInterval(P.outFade);
    const ch = chan(P.outId); if (ch) ch.live = false; P.outId = null;
    try { OUT.pause(); OUT.removeAttribute('src'); OUT.load(); } catch (e) { /* nada */ }
    OUT.muted = true;
  }
  OUT.addEventListener('playing', () => { const ch = chan(P.outId); if (!ch) return; ch.live = ch.ok = true; note(ch.id, ch.nocors ? { ok: true, cors: false } : { ok: true }); });
  OUT.addEventListener('error', () => { const ch = chan(P.outId); if (ch) openDirect(ch, P.outK + 1); });
  /** Fundido del reproductor directo. En iPhone el volumen no se mueve: ahí entra y sale silenciándose, con un corte limpio. */
  function fadeDirect(to, dur) {
    clearInterval(P.outFade); const from = OUT.muted ? 0 : outVol, start = performance.now();
    if (to > 0) OUT.muted = false;
    const tick = () => {
      const x = E.clamp((performance.now() - start) / (dur * 1000)); setVol(from + (to - from) * x);
      if (x >= 1) { clearInterval(P.outFade); OUT.muted = to === 0 || (to < .5 && Math.abs(OUT.volume - to) > .05); }
    };
    tick(); P.outFade = setInterval(tick, 30);
  }

  /** Sube o baja una emisora por su propia salida: la ganancia del grafo si se analiza; el reproductor directo si no. */
  function fade(ch, to, dur) {
    if (!ch) return; ch.target = to;
    if (ch.g) {
      const g = ch.g.gain, t = P.ctx.currentTime, from = t < ch.fadeEnd ? g.value : ch.level;
      ch.level = to; ch.fadeEnd = t + dur + .05; ch.zeroed = false;
      try {
        g.cancelScheduledValues(t); g.setValueAtTime(from, t);
        const n = 24, curve = new Float32Array(n);
        for (let i = 0; i < n; i++) { const x = i / (n - 1); curve[i] = from + (to - from) * (to > from ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2)); }
        g.setValueCurveAtTime(curve, t + .01, Math.max(.05, dur));
      } catch (e) { try { g.cancelScheduledValues(0); g.setValueAtTime(to, t + dur); } catch (e2) { g.value = to; } }
    } else if (P.outId === ch.id) fadeDirect(to, dur);
  }
  /** Garantía dura, diez veces por segundo: lo que no es la emisora al aire queda en cero, y el reproductor directo
      solo existe para la que suena o está por entrar. */
  function enforce() {
    const t = P.ctx.currentTime;
    for (const ch of P.chans) if (ch.an && ch.id !== P.on && !ch.zeroed && t >= ch.fadeEnd) zero(ch);
    if (P.outId && P.outId !== P.on && P.outId !== P.next && performance.now() >= (P.outHold || 0)) closeDirect();
  }
  function note(id, r) { const o = S.probe[id] || {}; S.probe[id] = Object.assign(o, r, { at: Date.now() }); if (!r.ok) delete S.probe[id].cors; save(); }
  function log(text) { const d = new Date(); P.log.unshift({ time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), text }); P.log.length = Math.min(P.log.length, 5); }

  // ---------- audio logo: sintonizador, dos notas y la locutora ("Radia sintoniza …") ----------
  const V = { voice: null, count: 0, u: null, t: null, nodes: [] };
  Object.assign(window.__radia, { V, OUT });
  const FEM = /sabina|helena|laura|elvira|dalia|paulina|m[oó]nica|marisol|valentina|elena|camila|paloma|luciana|catalina|sof[ií]a|isabel|ang[eé]lica|soledad|francisca|ximena|salom[eé]|andrea|karla|lorena|marta|teresa|tania|paola|luc[ií]a|flo\b|sandy|shelley|google espa[nñ]ol|female|femenin|mujer/i;
  const MAS = /pablo|ra[uú]l|jorge|diego|juan|carlos|mateo|tom[aá]s|[aá]lvaro|alonso|enrique|miguel|andr[eé]s|lorenzo|gonzalo|marcelo|emilio|luis|rodrigo|federico|roberto|mario|alex|v[ií]ctor|sebasti[aá]n|javier|manuel|eddy|reed|rocko|grandpa|\bmale|masculin|hombre/i;
  /** Elige la voz en español: primero mujer, después la más cercana al Río de la Plata y la de mejor calidad. */
  function pickVoice() {
    let vs = []; try { vs = speechSynthesis.getVoices() || []; } catch (e) { /* sin voces */ }
    let best = null, top = -1e9;
    for (const v of vs) {
      const lang = String(v.lang).replace('_', '-').toLowerCase(); if (!/^es(-|$)/.test(lang)) continue;
      let sc = lang === 'es-uy' ? 6 : lang === 'es-ar' ? 5 : lang === 'es-es' || lang === 'es' ? 3 : 4;
      if (FEM.test(v.name)) sc += 10; if (MAS.test(v.name)) sc -= 20;
      if (/natural|neural|premium|enhanced|mejorad|siri/i.test(v.name)) sc += 3;
      if (v.localService) sc += 1;
      if (sc > top) { top = sc; best = v; }
    }
    V.count = vs.length; V.voice = best;
  }
  if (window.speechSynthesis) { pickVoice(); try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) { speechSynthesis.onvoiceschanged = pickVoice; } }
  /** iPhone solo deja hablar si la primera frase sale de un toque: se manda una muda al tocar Reproducir. */
  function primeVoice() {
    if (V.primed || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return; V.primed = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'es-US'; speechSynthesis.speak(u); } catch (e) { /* sin voz */ }
  }
  /** La locutora. Avisa una sola vez: cuando terminó, cuando falló o si no arrancó a tiempo. */
  function say(text, done) {
    const ss = window.speechSynthesis; let fired = false, wd;
    const fin = () => { if (fired) return; fired = true; clearTimeout(wd); done(); };
    const giveUp = () => { try { ss.cancel(); } catch (e) { /* nada */ } fin(); };
    if (!ss || !window.SpeechSynthesisUtterance || (V.count && !V.voice)) return fin();      // sin voz en español: queda solo el sintonizador
    try {
      if (ss.speaking || ss.pending) ss.cancel();
      const u = new SpeechSynthesisUtterance(text); V.u = u;       // se guarda: si el navegador recicla el objeto, nunca avisa que terminó
      if (V.voice) { u.voice = V.voice; u.lang = V.voice.lang; } else u.lang = 'es-US';
      u.rate = 1.22; u.pitch = 1.05; u.volume = 1;
      u.onstart = () => { clearTimeout(wd); wd = setTimeout(giveUp, 4500); };
      u.onend = u.onerror = fin;
      // Muchas voces avisan el final recién después de un silencio largo. Si la voz marca las palabras, alcanza con dejar
      // terminar la última: se estima cuánto dura por el ritmo que traía (las siglas y los números se deletrean: pesan más).
      const lastAt = text.lastIndexOf(' ') + 1, last = text.slice(lastAt), weight = /^[A-ZÑ0-9.]+$/.test(last) ? last.length * 3 : last.length;
      let first = null;
      u.onboundary = e => {
        if (fired || (e.name && e.name !== 'word')) return; const now = performance.now();
        if (!first) first = [now, e.charIndex];
        if (e.charIndex < lastAt) return;
        const pace = e.charIndex > first[1] ? (now - first[0]) / (e.charIndex - first[1]) : 70;
        clearTimeout(wd); wd = setTimeout(fin, E.clamp(pace * weight, 320, 1300) + 100);
      };
      wd = setTimeout(giveUp, 1600);                               // no arrancó: sigue solo con el sintonizador
      ss.speak(u);
    } catch (e) { fin(); }
  }
  /** Barrido de sintonizador (estática que recorre el dial y silbidos entre emisoras) que engancha en las dos notas de RADIA. */
  function tuner(t) {
    const c = P.ctx, out = P.fx, nodes = [];
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = P.noise; n.loop = true; bp.type = 'bandpass'; bp.Q.value = 1.6;
    const f = bp.frequency; f.setValueAtTime(500, t); f.exponentialRampToValueAtTime(3800, t + .16); f.exponentialRampToValueAtTime(800, t + .28); f.exponentialRampToValueAtTime(2600, t + .42);
    const g = ng.gain; g.setValueAtTime(0, t); g.linearRampToValueAtTime(.9, t + .04); g.setValueAtTime(.9, t + .3); g.linearRampToValueAtTime(.12, t + .46); g.linearRampToValueAtTime(0, t + .8);
    n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t, Math.random() * 1.2); n.stop(t + .85); nodes.push(n);
    const tone = (at, f0, f1, d, lv, type, ring) => {
      const o = c.createOscillator(), og = c.createGain(), a = t + at; o.type = type; o.frequency.setValueAtTime(f0, a);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, a + d);
      og.gain.setValueAtTime(0, a); og.gain.linearRampToValueAtTime(lv, a + .012);
      if (ring) og.gain.exponentialRampToValueAtTime(.0006, a + d); else { og.gain.setValueAtTime(lv, a + d * .7); og.gain.linearRampToValueAtTime(0, a + d); }
      o.connect(og); og.connect(out); o.start(a); o.stop(a + d + .03); nodes.push(o);
    };
    tone(.02, 3000, 480, .16, .09, 'sine'); tone(.2, 420, 2300, .12, .075, 'sine'); tone(.32, 1700, 900, .1, .06, 'sine');   // silbidos del dial
    for (const [at, hz, d] of [[.42, 987.77, .5], [.55, 1318.51, .75]]) { tone(at, hz, hz, d, .22, 'sine', true); tone(at, hz / 2, hz / 2, d * .7, .07, 'triangle', true); }
    return nodes;
  }
  /** Corta lo que quede del audio logo anterior (un cambio encima de otro, o pausa). */
  function hush() {
    clearTimeout(V.t); try { if (window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel(); } catch (e) { /* nada */ }
    for (const n of V.nodes) { try { n.stop(); } catch (e) { /* ya terminó */ } } V.nodes = [];
  }
  const spoken = st => String(st.name).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+[-–—]\s+.*$/, '').replace(/\s+/g, ' ').trim();
  /** Audio logo entre emisoras, de unos 2 s. Se cumple cuando la locutora terminó de decir a qué emisora llegamos. */
  function ident(st, seq) {
    return new Promise(res => {
      const t0 = performance.now(); hush();
      V.nodes = tuner(P.ctx.currentTime + .04);
      V.t = setTimeout(() => {
        if (seq !== P.seq || !P.playing) return res();
        say('Radia sintoniza ' + spoken(st), () => setTimeout(res, Math.max(60, IDENT_MIN * 1000 - (performance.now() - t0))));
      }, 150);
    });
  }
  /** Deja lista, todavía en silencio, la emisora que está por entrar. */
  function ready(ch) {
    if (ch.an || ch.ok === false) { if (P.outId && P.outId !== ch.id) closeDirect(); return; }
    if (ch.direct || P.tap === false) { ch.direct = true; if (P.outId !== ch.id) openDirect(ch); }
    else { if (P.outId) closeDirect(); openStream(ch); }           // el análisis todavía no se comprobó acá: esta emisora hace la prueba
  }
  /** Todo cambio de emisora es igual: se apaga la que suena, pasa el audio logo y recién entonces entra la nueva. Nunca se pisan. */
  function tune(to, from) {
    const seq = ++P.seq;
    P.on = null; P.next = to.id; clearTimeout(P.swapT);
    if (from && from !== to) fade(from, 0, C.out);
    for (const ch of P.chans) if (ch !== from) zero(ch);
    P.outHold = performance.now() + C.out * 1000 + 80;
    if (from) P.swapT = setTimeout(() => { if (seq === P.seq && P.playing) ready(to); }, C.out * 1000 + 60); else ready(to);
    ident(to.st, seq).then(() => {
      if (seq !== P.seq || !P.playing) return;
      P.on = to.id; P.next = null; if (to.el) to.el.muted = false;
      tap(to); fade(to, P.dir.ducked ? .18 : 1, C.in);
      if (P.ctx.state !== 'running') P.ctx.resume().catch(() => { /* vuelve con el próximo toque */ });
    });
  }

  async function play() {
    if (P.playing || P.starting) return;
    stopPreview();
    const list = favs();
    if (!list.length) { go('emisoras'); toast('Elegí al menos una emisora.'); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('Este navegador no puede reproducir audio de esta forma.'); return; }
    unlock(); primeVoice();                                        // dentro del toque: así iPhone habilita el reproductor y la voz
    if (!P.ctx) {
      P.ctx = new AC(); P.comp = P.ctx.createDynamicsCompressor(); P.comp.connect(P.ctx.destination);
      P.fx = P.ctx.createGain(); P.fx.connect(P.comp);
      const len = P.ctx.sampleRate * 2; P.noise = P.ctx.createBuffer(1, len, P.ctx.sampleRate);
      const d = P.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    P.starting = true;
    try { await P.ctx.resume(); } catch (e) { /* seguirá suspendido hasta un toque */ }
    P.starting = false;
    if (P.playing) return;
    P.master = P.ctx.createGain(); P.master.connect(P.comp);
    P.tap = tapKnown(); P.heardAny = false; P.on = P.next = null;
    const main = mainId(); P.mainIndex = list.findIndex(s => s.id === main);
    P.chans = list.map((st, i) => makeChan(st, i, st.id === main));
    P.dir = new E.Director({ stations: P.chans, mainId: main });
    P.playing = true; P.truth = 0; P.note = null;
    for (const ch of P.chans) {
      if (ch.demo || ch.ok === false) continue;
      if (ch.direct) { if (ch.id !== main) check(ch); }
      else if (ch.id === main || P.tap === true) openStream(ch);   // sin comprobar el análisis, solo se abre la favorita
    }
    const m = chan(main);
    if (m.ok === false) P.on = main; else tune(m, null);            // arranca con el audio logo: "Radia sintoniza …"
    P.timers = [setInterval(features, 50), setInterval(control, 100), setInterval(second, 1000)];
    media(); paint(); renderStations();
  }
  function makeChan(st, i, isMain) {
    const demo = !!st.demo;
    const ch = { id: st.id, st, demo, ok: true, live: false, delay: 0, target: 0, level: 0, fadeEnd: 0, zeroed: true, category: catOf(st), brain: new E.Brain(demo ? { maxBreak: 60, breakLen: 20 } : {}) };
    if (blocked(st)) { ch.ok = false; return ch; }
    if (demo) {
      graph(ch); ch.live = true; ch.liveAt = P.ctx.currentTime;
      const order = isMain ? 0 : i + (i < P.mainIndex ? 1 : 0);
      ch.synth = new Synth(P.ctx, ch.input, P.noise, { category: ch.category, seed: hue(st) + 3, period: [80, 95, 110][order], adLen: [22, 24, 20][order], firstAd: [22, 75, 125][order] });
    } else if (st.hls || P.tap === false) ch.direct = true;        // HLS nunca pasa por el grafo
    return ch;
  }
  function stop() {
    if (!P.playing) return;
    P.timers.forEach(clearInterval); P.playing = false; P.seq++; P.on = P.next = null; clearTimeout(P.swapT); hush();
    for (const ch of P.chans) { if (ch.synth) ch.synth.stop(); closeStream(ch); }
    closeDirect();
    try { P.master.disconnect(); } catch (e) { /* ya suelto */ }
    P.chans = []; P.dir = null; persist(); paint();
  }
  const restart = () => { if (P.playing) { stop(); play(); } };
  function persist() { for (const id in scheds) S.sched[id] = scheds[id].toJSON(); save(); }

  const tbuf = new Float32Array(1024), fbuf = new Float32Array(512);
  const EDGES = [50, 100, 200, 400, 800, 1600, 3200, 6400, 12000];
  function features() {
    const t = P.ctx.currentTime, hzPerBin = P.ctx.sampleRate / 1024;
    for (const ch of P.chans) {
      if (!ch.an || !ch.live) continue;
      ch.an.getFloatTimeDomainData(tbuf); let s = 0; for (let i = 0; i < 1024; i++) s += tbuf[i] * tbuf[i];
      if (ch.el && !ch.heard) {                                    // ¿de verdad le llega este stream al grafo?
        if (s > 0) { ch.heard = true; proven(); }
        else if (ch.el.muted) ch.liveAt = t;                       // callada a propósito: la prueba empieza cuando le toque sonar
        else if (P.ctx.state === 'running' && t - ch.liveAt > 3 && !ch.el.paused && ch.el.currentTime > 3) { deaf(ch); continue; }
      }
      ch.an.getFloatFrequencyData(fbuf); let num = 0, den = 0;
      for (let i = 1; i < 512; i++) { const m = Math.pow(10, fbuf[i] / 20); num += i * m; den += m; }
      const bands = [];
      for (let k = 0; k < 8; k++) {
        const lo = Math.max(1, Math.round(EDGES[k] / hzPerBin)), hi = Math.min(511, Math.max(lo + 1, Math.round(EDGES[k + 1] / hzPerBin))); let pw = 0;
        for (let i = lo; i < hi; i++) pw += Math.pow(10, fbuf[i] / 10);
        bands.push(10 * Math.log10(pw / (hi - lo) + 1e-12));
      }
      ch.brain.pushFrame({ t, db: 10 * Math.log10(s / 1024 + 1e-12), centroid: den ? num / den * hzPerBin : 0, bands });
    }
  }
  function control() {
    const now = P.ctx.currentTime, minute = new Date().getMinutes(), h = hourNow();
    for (const ch of P.chans) {
      ch.category = E.categoryAt(ch.st, h);
      if (ch.synth) ch.synth.pump(); else if (ch.ok) ch.brain.tickClock(now, minute, sched(ch.id));
      if (ch.an && ch.id !== P.dir.current) ch.delay = ch.liveAt != null && now - ch.liveAt >= ch.look + 1 ? ch.look : 0;
    }
    const a = P.dir.tick(now); if (a) apply(a);
    enforce();
  }
  function apply(a) {
    if (a.type === 'switch') {
      const f = chan(a.from), t = chan(a.to);
      tune(t, f);
      S.stats.switches++;
      const txt = a.reason === 'ad' ? (f.ok === false ? f.st.name + ' quedó sin señal.' : 'Tanda en ' + f.st.name + '.') + ' Pasamos a ' + t.st.name + ', match ' + a.style.match + '%.'
        : a.reason === 'return' ? 'Terminó la tanda. Volvemos a ' + t.st.name + '.' : 'Elegiste ' + t.st.name + '.';
      log(txt); P.note = { at: Date.now(), text: txt }; media();
    } else if (a.type === 'duck') { if (P.on) fade(curChan(), .18, .8); log('Todas tus emisoras están en tanda. Bajamos el volumen.'); }
    else if (a.type === 'unduck') { if (P.on) fade(curChan(), 1, .8); }
    paint();
  }
  function second() {
    const now = P.ctx.currentTime, cur = curChan(), main = chan(P.dir.mainId), onAir = P.on === cur.id;
    if (onAir && P.dir.inAd(cur, now)) S.stats.heard++;
    else if (cur !== main && (P.dir.inAd(main, now) || main.ok === false)) S.stats.avoided++;
    if (onAir && cur.synth && cur.synth.isAd(now - cur.delay)) P.truth++;
    diagTick(now);
    if (S.mode === 'live') { const d = new Date(Date.now() - 8000); for (const ch of P.chans) if (ch.live) sched(ch.id).observe(d.getMinutes(), ch.brain.isAdAt(now - 8), 1); if (Math.round(now) % 30 === 0) persist(); }
    else if (Math.round(now) % 15 === 0) save();
  }
  function media() {
    if (!('mediaSession' in navigator) || !curChan()) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: curChan().st.name, artist: 'RADIA', album: 'Sin publicidad' });
      navigator.mediaSession.setActionHandler('play', play); navigator.mediaSession.setActionHandler('pause', stop);
    } catch (e) { /* sin controles del sistema */ }
  }

  // ---------- qué radios dejan analizar su audio ----------
  let scanning = false;
  async function probeOne(st) {
    const u = usable(st)[0]; if (!u) return;
    const hit = async mode => {
      const c = new AbortController(), to = setTimeout(() => c.abort(), 8000);
      try { const r = await fetch(via(u), { mode, signal: c.signal, cache: 'no-store' }); clearTimeout(to); c.abort(); return mode === 'no-cors' || r.ok; }
      catch (e) { clearTimeout(to); return false; }
    };
    const w = PX() ? 1 : 0;
    if (await hit('cors')) return note(st.id, { ok: true, cors: true, via: w });
    if (!w && await hit('no-cors')) return note(st.id, { ok: true, cors: false, via: w });
    note(st.id, { ok: false, via: w });
  }
  async function scan(force) {
    if (S.mode !== 'live' || IN_CLAUDE || scanning) return;
    const w = PX() ? 1 : 0, fresh = st => { const p = S.probe[st.id]; return p && p.via === w && Date.now() - p.at < 3 * 864e5; };
    const todo = stations().filter(st => !blocked(st) && (force || !fresh(st))); if (!todo.length) return;
    scanning = true; let i = 0;
    const run = async () => { while (i < todo.length) { await probeOne(todo[i++]); if (i % 8 === 0) renderStations(); } };
    await Promise.all([run(), run(), run(), run()]); scanning = false; renderStations();
  }

  // ---------- diagnóstico para calibrar con radios reales ----------
  const DG = { rows: [], marks: [] };
  function diagTick(now) {
    if (Math.round(now) % 2) return;
    P.chans.forEach((ch, i) => {
      if (!ch.an || !ch.live) return; const B = ch.brain.blocks, b = B[B.length - 1]; if (!b) return;
      const nv = B[B.length - ch.brain.o.seg];
      DG.rows.push([Math.round(now), i, Math.round(ch.brain.frames.length ? ch.brain.frames[ch.brain.frames.length - 1].db : 0), Math.round(b.talk * 100), nv ? Math.round(nv.nov * 10) : 0, b.shape.map(Math.round).join(','), ch.brain.isAdAt(now) ? 'A' : '-'].join('|'));
    });
    if (DG.rows.length > 540) DG.rows.splice(0, DG.rows.length - 540);
  }
  function diagText() {
    const now = P.ctx ? Math.round(P.ctx.currentTime) : 0;
    const head = { radia: 4, ua: navigator.userAgent, modo: S.mode, margen: lookahead(), puente: !!PX(), ahora: now, suena: P.dir ? P.dir.current : null, alAire: P.on, analisis: P.tap, marcas: DG.marks,
      radios: P.chans.map(c => ({ n: c.st.name, analiza: !!c.an, directa: !!c.direct, abierta: !!(c.el || c.synth || P.outId === c.id), senal: c.ok !== false && !!c.live, demora: c.delay, cortes: c.brain.cuts.map(Math.round), tandas: c.brain.iv.map(v => [Math.round(v.s), v.e == null ? null : Math.round(v.e), v.src]) })) };
    return 'RADIA-DIAG ' + JSON.stringify(head) + '\n' + DG.rows.join('\n');
  }

  // ---------- probar una emisora ----------
  const PV = { id: null, el: null };
  function stopPreview() { if (PV.el) { PV.el.pause(); PV.el.removeAttribute('src'); try { PV.el.load(); } catch (e) { /* nada */ } } clearTimeout(PV.t); PV.id = null; PV.el = null; }
  function preview(id) {
    if (PV.id === id) { stopPreview(); renderStations(); return; }
    stopPreview(); if (P.playing) stop();
    const st = byId(id), list = usable(st); PV.id = id; renderStations();
    const attempt = (k, cors) => {
      if (PV.id !== id) return;
      if (k >= list.length) { if (cors) return attempt(0, false); note(id, { ok: false }); toast(st.name + ' no respondió.'); PV.id = null; renderStations(); return; }
      const el = new Audio(); if (cors) el.crossOrigin = 'anonymous'; el.src = via(list[k]); PV.el = el;
      const next = () => { if (PV.el !== el) return; clearTimeout(PV.t); try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* nada */ } attempt(k + 1, cors); };
      el.onerror = next; clearTimeout(PV.t); PV.t = setTimeout(next, 12000);
      el.onplaying = () => {
        if (PV.el !== el) return; clearTimeout(PV.t); note(id, { ok: true, cors });
        toast(cors ? st.name + ' suena y RADIA puede anticipar sus tandas.' : st.name + ' suena, pero no deja analizar su audio: cambia por horario y avisos.');
        renderStations(); PV.t = setTimeout(() => { stopPreview(); renderStations(); }, 20000);
      };
      el.play().catch(next);
    };
    attempt(0, true);
  }

  // ---------- interfaz ----------
  let toastT;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('is-on'), 2600); }
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function matchWithMain(st) {
    const m = byId(mainId()); if (!m || m.id === st.id) return null;
    const a = chan(m.id), b = chan(st.id);
    return E.match(catOf(m), catOf(st), { talkA: a && a.brain.talk, talkB: b && b.brain.talk });
  }

  function paint() {
    const list = favs(), now = P.ctx ? P.ctx.currentTime : 0, cur = P.playing ? curChan() : null;
    const shown = cur ? cur.st : byId(mainId());
    $('#app').classList.toggle('is-playing', P.playing);
    $('#btnPlay').innerHTML = P.playing ? ICON.pause : ICON.play; $('#btnPlay').setAttribute('aria-label', P.playing ? 'Pausar' : 'Reproducir');
    $('#btnAd').disabled = $('#btnNext').disabled = !P.playing; $('#btnNext').disabled = !P.playing || list.length < 2;
    const pill = $('#modePill'); pill.textContent = S.mode === 'demo' ? 'Demo' : 'En vivo'; pill.classList.toggle('is-live', S.mode === 'live');
    if (shown) {
      const [a, b] = artText(shown); $('#artFreq').textContent = a; $('#artBand').textContent = b; $('#art').style.setProperty('--h', hue(shown));
      $('#npName').textContent = shown.name; $('#npSub').textContent = catLabel(catOf(shown)) + ', franja ' + E.slotAt(hourNow()).label.toLowerCase();
    } else { $('#artFreq').textContent = '–'; $('#artBand').textContent = ''; $('#npName').textContent = 'Elegí tus emisoras'; $('#npSub').textContent = 'Una favorita y hasta dos alternativas'; }
    // estado
    const st = $('#status'); let html = '', warn = false;
    if (!list.length) html = 'Todavía no hay emisoras elegidas.';
    else if (!P.playing) html = S.mode === 'demo' ? 'Demo con audio sintético: las tandas llegan cada minuto y pico para que veas los cambios.' : 'RADIA escucha tus emisoras unos segundos antes que vos y cambia cuando viene la tanda.';
    else {
      const t = P.dir.tta(cur, now), main = chan(P.dir.mainId);
      if (P.note && Date.now() - P.note.at < 4500) html = '<b>' + esc(P.note.text) + '</b>';
      else if (P.dir.ducked) { html = '<b>Todas en tanda.</b> Volumen bajo hasta que alguna vuelva.'; warn = true; }
      else if (!P.on && P.next) html = '<b>Radia sintoniza ' + esc(cur.st.name) + '.</b>';
      else if (cur.ok && !cur.live) html = 'Conectando con ' + esc(cur.st.name) + '…';
      else if (t < Infinity && t > 0) { html = '<b>Tanda detectada.</b> Cambio en ' + Math.max(1, Math.round(t)) + ' s.'; warn = true; }
      else if (cur !== main && P.dir.hold === cur.id) html = 'Elegiste ' + esc(cur.st.name) + '. RADIA se queda acá hasta que venga su tanda.';
      else if (cur !== main) html = esc(main.st.name) + (main.ok === false ? ' está sin señal.' : ' está en tanda. Volvemos apenas termine.');
      else html = cur.delay ? '<b>Sin publicidad a la vista.</b> Vas ' + cur.delay + ' s detrás del vivo.'
        : cur.an ? '<b>En directo.</b> RADIA ya analiza esta radio; la anticipación empieza con el primer cambio.'
        : P.tap === false && !cur.nocors ? '<b>Sonando sin análisis.</b> Este navegador no deja analizar el audio en vivo: RADIA cambia por horario aprendido, por tus avisos o a mano.'
        : '<b>Sonando sin análisis.</b> Esta radio no deja analizar su audio: no hay cambio automático sin el puente.';
    }
    st.innerHTML = html; st.classList.toggle('is-warn', warn);
    // radar
    $('#radar').innerHTML = list.map(s => {
      const ch = chan(s.id), isMain = s.id === mainId(), m = matchWithMain(s);
      let blocks = '', cls = '', blind = !ch || !ch.an;
      if (ch) {
        const heard = now - ch.delay, span = ch.delay || 1;
        if (ch.delay) for (const iv of ch.brain.iv) { const a = E.clamp((iv.s - heard) / span), b = E.clamp(((iv.e == null ? now : Math.min(iv.e, now)) - heard) / span); if (b > a) blocks += '<i style="left:' + (a * 100).toFixed(1) + '%;width:' + ((b - a) * 100).toFixed(1) + '%"></i>'; }
        if (ch.ok === false) cls = ' is-down'; else if (ch.brain.isAdAt(heard)) cls = ' is-ad';
        if (cur === ch) cls += ' is-current';
      }
      const meta = ch && ch.ok === false ? (blocked(s) || 'Sin señal') : isMain ? 'Favorita' : m == null ? '' : 'Match ' + m + '%';
      return '<button class="lane' + cls + '" data-lane="' + esc(s.id) + '" aria-label="Escuchar ' + esc(s.name) + '">' +
        '<span class="lane-name"><i class="dot"></i>' + (isMain ? ICON.star : '') + '<span>' + esc(s.name) + '</span></span>' +
        '<span class="lane-meta' + (m != null && m < 40 ? ' is-low' : '') + '">' + esc(meta) + '</span>' +
        '<span class="track' + (P.playing && blind ? ' is-blind' : '') + '">' + blocks + '</span></button>';
    }).join('') || '<div class="empty">Sumá emisoras desde la pestaña Emisoras.</div>';
    $('#radarKey').hidden = !list.length; $('#keyLive').textContent = 'El vivo, ' + lookahead() + ' s adelante';
    // contadores
    $('#stAvoided').textContent = mmss(S.stats.avoided); $('#stSwitches').textContent = S.stats.switches;
    const demoPlaying = P.playing && S.mode === 'demo';
    $('#stHeard').textContent = (demoPlaying ? P.truth : S.stats.heard) + ' s'; $('#stHeardLabel').textContent = demoPlaying ? 'Se coló (real)' : 'Se coló';
    $('#log').innerHTML = P.log.map(l => '<li><time>' + l.time + '</time><span>' + esc(l.text) + '</span></li>').join('');
  }

  function row(st, inFav) {
    const isMain = st.id === mainId(), m = matchWithMain(st), why = blocked(st);
    const pr = S.probe[st.id], tested = !st.demo && pr ? (pr.ok ? (pr.cors ? 'con anticipación' : 'suena, sin anticipación') : 'sin señal la última vez') : '';
    const sub = why || (tested && !inFav ? catLabel(catOf(st)) + ', ' + tested : '') || (inFav ? catLabel(catOf(st)) + (isMain ? ', favorita' : m != null ? ', match ' + m + '%' : '')
      : catLabel(catOf(st)) + (st.freq ? ', ' + st.freq : '') + (m != null ? ', match ' + m + '%' : ''));
    const [a] = artText(st);
    return '<div class="row"><span class="chip" style="--h:' + hue(st) + '">' + esc(a) + '</span>' +
      '<span class="row-main"><b>' + esc(st.name) + '</b><small class="' + ((m != null && m < 40) || why ? 'is-low' : '') + '">' + esc(sub) + '</small></span>' +
      (inFav ? '<button class="icon" data-prog="' + esc(st.id) + '" aria-label="Programación de ' + esc(st.name) + '">' + ICON.tune + '</button>' +
        '<button class="icon is-star' + (isMain ? ' is-on' : '') + '" data-main="' + esc(st.id) + '" aria-pressed="' + isMain + '" aria-label="Marcar ' + esc(st.name) + ' como favorita">' + ICON.star + '</button>' +
        '<button class="icon is-remove" data-fav="' + esc(st.id) + '" aria-label="Quitar ' + esc(st.name) + '">' + ICON.minus + '</button>'
        : (st.demo || why ? '' : '<button class="icon' + (PV.id === st.id ? ' is-on' : '') + '" data-try="' + esc(st.id) + '" aria-label="Probar ' + esc(st.name) + '">' + (PV.id === st.id ? ICON.stopS : ICON.playS) + '</button>') +
        '<button class="icon" data-fav="' + esc(st.id) + '" aria-label="Agregar ' + esc(st.name) + '">' + ICON.plus + '</button>') + '</div>';
  }
  function renderStations() {
    const list = favs(), ids = new Set(list.map(s => s.id)), q = norm($('#search').value), slot = E.slotAt(hourNow());
    $('#slotPill').textContent = slot.label + ', ' + slot.from + ' a ' + slot.to + ' h';
    $('#favList').innerHTML = list.map(s => row(s, true)).join('') || '<div class="empty">Tocá el signo más de una emisora para sumarla. La primera queda como favorita.</div>';
    const low = list.filter(s => { const m = matchWithMain(s); return m != null && m < 40; });
    $('#favNote').textContent = low.length ? 'Match bajo con ' + low.map(s => s.name).join(' y ') + ' en esta franja: el cambio de clima se va a notar.'
      : list.length ? 'La estrella marca la favorita: RADIA siempre vuelve a ella cuando termina su tanda.' : '';
    const rank = s => { const p = S.probe[s.id]; return blocked(s) ? 4 : !p ? 2 : p.ok ? (p.cors ? 0 : 1) : 3; };
    const rest = stations().filter(s => !ids.has(s.id) && (!q || norm(s.name).includes(q)));
    if (S.mode === 'live') rest.sort((a, b) => rank(a) - rank(b));
    $('#catTitle').textContent = S.mode === 'demo' ? 'Catálogo de demostración' : 'Uruguay, ' + (S.catalog.length + S.custom.length) + ' emisoras';
    $('#catList').innerHTML = rest.slice(0, 120).map(s => row(s, false)).join('') ||
      '<div class="empty">' + (q ? 'Ninguna emisora coincide con la búsqueda.' : 'No quedan emisoras por sumar.') + '</div>';
    $('#catNote').textContent = S.mode === 'demo' ? 'En la demo el audio es sintético y los perfiles son aproximados. Los nombres sirven para probar el match.'
      : (rest.length > 120 ? 'Se muestran 120. Usá el buscador para ver el resto. ' : '') + (IN_CLAUDE ? 'Dentro de Claude las radios reales no suenan: abrí RADIA en tu navegador. '
          : (() => { const all = stations(), ok = all.filter(s => S.probe[s.id] && S.probe[s.id].cors).length, seen = all.filter(s => S.probe[s.id]).length;
              return (scanning ? 'Revisando radios, ' + seen + ' de ' + all.length + '. ' : seen ? ok + ' de ' + seen + ' radios revisadas dejan anticipar sus tandas' + (PX() ? ' con el puente. ' : '; el resto necesita el puente (Ajustes). ') : '') + 'Primero van las que permiten cambio automático. '; })()) + 'Streams del directorio abierto radio-browser.info.';
  }
  function renderSettings() {
    for (const b of document.querySelectorAll('#segMode button')) b.setAttribute('aria-pressed', b.dataset.mode === S.mode);
    $('#modeNote').textContent = S.mode === 'demo' ? 'Audio sintético con tandas programadas, para ver cómo trabaja el motor en cualquier lado.' : (IN_CLAUDE ? 'Dentro de Claude los streams externos están bloqueados: abrí RADIA en tu navegador para escuchar radios reales.' : 'Radios reales de Uruguay. Las que dejan analizar su audio se anticipan; el resto cambia por horario aprendido y por tus avisos.');
    $('#delay').value = S.delay; $('#delayVal').textContent = S.delay + ' s'; $('#proxy').value = S.proxy; $('#proxy').placeholder = BRIDGE || 'https://tu-puente.workers.dev';
  }
  function renderAll() { paint(); renderStations(); renderSettings(); }

  function openSheet(id) {
    const st = byId(id); if (!st) return;
    $('#shTitle').textContent = st.name;
    $('#shRows').innerHTML = E.SLOTS.map(sl => '<div class="row"><label for="sl-' + sl.id + '">' + sl.label + ', ' + sl.from + ' a ' + sl.to + ' h</label><span style="flex:1"></span><select id="sl-' + sl.id + '" data-slot="' + sl.id + '">' +
      Object.keys(E.CATS).map(c => '<option value="' + c + '"' + ((st.profile[sl.id] || st.profile['*']) === c ? ' selected' : '') + '>' + E.CATS[c].label + '</option>').join('') + '</select></div>').join('');
    $('#shRows').onchange = () => { const p = {}; for (const s of document.querySelectorAll('#shRows select')) p[s.dataset.slot] = s.value; S.profiles[id] = p; save(); renderAll(); };
    $('#sheet').showModal();
  }
  function go(name) { if (!['escuchar', 'emisoras', 'ajustes'].includes(name)) name = 'escuchar'; if (location.hash !== '#' + name) location.hash = name; else route(); }
  function route() {
    let name = location.hash.slice(1); if (!['escuchar', 'emisoras', 'ajustes'].includes(name)) name = 'escuchar';
    for (const v of document.querySelectorAll('.view')) v.classList.toggle('is-on', v.id === 'v-' + name);
    for (const a of document.querySelectorAll('.tabs a')) { if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
    if (name === 'emisoras' && S.mode === 'live' && catalogState === 'idle') loadCatalog();
    if (name === 'emisoras') scan();
    renderAll(); window.scrollTo(0, 0);
  }
  function setMode(m) {
    if (m === S.mode) return; stop(); S.mode = m; save(); renderAll();
    if (m === 'live') loadCatalog().then(ok => { if (!ok) toast('Sin acceso al directorio de radios desde acá.'); });
  }

  // ---------- eventos ----------
  $('#btnPlay').onclick = () => { stopPreview(); P.playing ? stop() : play(); };
  $('#btnAd').onclick = () => {
    const cur = curChan(); if (!cur) return;
    cur.brain.markAd(P.ctx.currentTime - cur.delay); DG.marks.push([Math.round(P.ctx.currentTime), P.chans.indexOf(cur)]);
    if (S.mode === 'live') sched(cur.id).observe(new Date().getMinutes(), true, 30);
    toast('Anotado. RADIA lo usa para aprender los horarios de ' + cur.st.name + '.');
  };
  $('#btnNext').onclick = () => {
    if (!P.playing) return; const i = P.chans.indexOf(curChan());
    for (let k = 1; k < P.chans.length; k++) { const c = P.chans[(i + k) % P.chans.length]; if (c.ok !== false) { const a = P.dir.force(c.id, P.ctx.currentTime); if (a) apply(a); return; } }
  };
  $('#radar').onclick = e => {
    const b = e.target.closest('[data-lane]'); if (!b) return;
    if (!P.playing) { toast('Tocá reproducir para empezar.'); return; }
    const c = chan(b.dataset.lane); if (!c || c.ok === false) { toast('Esa emisora no está disponible ahora.'); return; }
    const a = P.dir.force(c.id, P.ctx.currentTime); if (a) apply(a);
  };
  $('#v-emisoras').onclick = e => {
    const tr = e.target.closest('[data-try]'); if (tr) return preview(tr.dataset.try);
    const f = e.target.closest('[data-fav]'), m = e.target.closest('[data-main]'), p = e.target.closest('[data-prog]');
    const list = S.favs[S.mode];
    if (p) return openSheet(p.dataset.prog);
    if (m) { S.main[S.mode] = m.dataset.main; }
    else if (f) {
      const id = f.dataset.fav, i = list.indexOf(id);
      if (i >= 0) { list.splice(i, 1); if (S.main[S.mode] === id) S.main[S.mode] = list[0] || null; }
      else if (list.length >= 3) return toast('Máximo tres. Quitá una para sumar otra.');
      else { list.push(id); if (!S.main[S.mode]) S.main[S.mode] = id; }
    } else return;
    save(); restart(); renderAll();
  };
  $('#search').oninput = renderStations;
  $('#segMode').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); };
  $('#delay').oninput = e => { S.delay = +e.target.value; $('#delayVal').textContent = S.delay + ' s'; };
  $('#delay').onchange = () => { save(); restart(); paint(); };
  $('#proxy').onchange = e => { S.proxy = e.target.value.trim(); save(); restart(); renderAll(); scan(true); };
  $('#diag').onclick = async () => {
    const text = diagText();
    try { await navigator.clipboard.writeText(text); toast('Diagnóstico copiado. Pegalo en el chat con Claude.'); }
    catch (e) { $('#shTitle').textContent = 'Diagnóstico'; $('#shRows').innerHTML = '<textarea readonly style="width:100%;height:40vh;border:0;background:none;color:inherit;font:12px ui-monospace,monospace;padding:12px">' + esc(text) + '</textarea>'; $('#sheet').showModal(); const ta = $('#shRows textarea'); ta.focus(); ta.select(); }
  };
  $('#cAdd').onclick = () => {
    const name = $('#cName').value.trim(), url = $('#cUrl').value.trim();
    if (!name || !/^https?:\/\/.+/.test(url)) return toast('Completá el nombre y una dirección que empiece con http.');
    S.custom.unshift({ id: 'c-' + Date.now(), name, urls: [url], tags: '' }); $('#cName').value = $('#cUrl').value = ''; save();
    toast(name + ' agregada. Está en Radios en vivo.'); renderAll();
  };
  $('#reload').onclick = () => { if (S.mode !== 'live') return toast('Pasá a Radios en vivo para actualizar la lista.'); loadCatalog(true).then(ok => toast(ok ? 'Lista actualizada.' : 'No se pudo actualizar desde acá.')); };
  $('#reset').onclick = () => { S.sched = {}; for (const k in scheds) delete scheds[k]; S.stats = { avoided: 0, heard: 0, switches: 0 }; save(); renderAll(); toast('Aprendizaje borrado.'); };
  $('#shDone').onclick = () => { $('#sheet').close(); restart(); };
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', persist);
  setInterval(() => { if (P.playing) paint(); }, 250);
  route();
})();

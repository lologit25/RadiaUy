/* RADIA · interfaz y audio. El motor (match, detector, director) vive en engine.js. */
(function () {
  'use strict';
  const E = window.RadiaEngine, FP = window.RadiaFP;
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

  // Perfiles por franja de las radios más conocidas (aproximados; se editan desde Emisoras).
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
  const DEF = () => ({ mode: 'live', favs: { live: [] }, main: { live: null },
    delay: 60, v: 4, agg: false, proxy: '', profiles: {}, custom: [], sched: {}, probe: {}, stats: { avoided: 0, heard: 0, switches: 0 }, catalog: [], catalogAt: 0 });
  let S = DEF();
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.favs && j.main) { S = Object.assign(S, j); S.probe = S.probe || {}; S.mode = 'live'; if (j.v !== 4) { S.delay = 60; S.v = 4; S.agg = false; } } } catch (e) { /* sin almacenamiento: se sigue en memoria */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* idem */ } };
  const PX = () => S.proxy || BRIDGE;
  const lookahead = () => S.delay;
  const scheds = {};
  const sched = id => scheds[id] || (scheds[id] = new E.Schedule(S.sched[id]));

  // ---------- catálogo ----------
  let catalogState = 'idle';
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
    if (k !== cacheKey) { cacheKey = k; cache = liveStations().map(dress); }
    return cache;
  };
  const byId = id => stations().find(s => s.id === id);
  const favs = () => S.favs.live.map(byId).filter(Boolean);
  const mainId = () => { const f = favs(); return f.some(s => s.id === S.main.live) ? S.main.live : (f[0] && f[0].id) || null; };
  const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const catOf = st => E.categoryAt(st, hourNow());
  const catLabel = c => (E.CATS[c] || E.CATS.pop).label;
  const HUES = [212, 232, 252, 272, 296, 328, 348, 12, 28, 168, 188, 200];
  const hue = st => { let h = 7; for (const ch of st.name) h = (h * 31 + ch.charCodeAt(0)) % 9973; return HUES[h % HUES.length]; };
  const artText = st => { const p = (st.freq || '').split(' '); if (p[0]) return [p[0], p[1] || '']; return [st.name.replace(/radio|fm|am/gi, '').trim().slice(0, 2).toUpperCase() || 'FM', '']; };
  function blocked(st) {
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

  // ---------- reproductor ----------
  const P = { ctx: null, chans: [], dir: null, playing: false, log: [], note: null, skip: {} };
  window.__radia = { P, S, E };
  const chan = id => P.chans.find(c => c.id === id);
  const curChan = () => P.dir && chan(P.dir.current);

  function graph(ch) {
    const c = P.ctx; ch.input = c.createGain(); ch.an = c.createAnalyser(); ch.an.fftSize = 1024; ch.an.smoothingTimeConstant = .3;
    ch.look = lookahead(); ch.dl = c.createDelay(ch.look + 1); ch.dl.delayTime.value = ch.look;
    ch.gL = c.createGain(); ch.gD = c.createGain(); ch.gL.gain.value = ch.gD.gain.value = 0;
    ch.input.connect(ch.an); ch.input.connect(ch.gL); ch.gL.connect(P.master);        // directo: suena ya, sin anticipación
    ch.input.connect(ch.dl); ch.dl.connect(ch.gD); ch.gD.connect(P.master);           // demorado: da margen para ver venir la tanda
    ch.g = ch.gL; ch.delay = 0; ch.liveAt = null;
  }
  /** Al entrar a una emisora: usa la salida demorada si ya juntó margen; si no, la directa. */
  function tap(ch) {
    if (!ch.an) return;
    const use = ch.delay ? ch.gD : ch.gL, other = ch.delay ? ch.gL : ch.gD, t = P.ctx.currentTime;
    try { other.gain.cancelScheduledValues(t); other.gain.setValueAtTime(0, t); } catch (e) { /* nada */ }
    ch.g = use;
  }
  function ungraph(ch) { ch.g = null; for (const k of ['src', 'input', 'an', 'dl', 'gL', 'gD']) if (ch[k]) { try { ch[k].disconnect(); } catch (e) { /* ya suelto */ } ch[k] = null; } ch.delay = 0; }
  const usable = st => st.urls.filter(u => PX() || location.protocol !== 'https:' || /^https:/.test(u));
  const via = u => PX() ? PX().replace(/\/+$/, '') + '/s?u=' + encodeURIComponent(u) : u;
  const SP = window.RadiaStream;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const decode = buf => new Promise((res, rej) => { try { const p = P.ctx.decodeAudioData(buf, res, rej); if (p && p.catch) p.catch(rej); } catch (e) { rej(e); } });
  /** Motor propio. El navegador no toca el stream: RADIA lo baja, lo decodifica y lo programa en Web Audio.
      Así el análisis ve el audio real también en iPhone, donde el reproductor nativo entrega ceros al analizador. */
  async function ownEngine(ch, k = 0) {
    const list = usable(ch.st);
    if (ch.gone) return;
    if (k >= list.length) {                                        // ningún stream sirvió con el motor propio
      ungraph(ch); ch.own = false; ch.why = ch.readable ? 'formato' : 'permiso';
      return openStream(ch, !!ch.readable, 0);
    }
    if (!ch.an) graph(ch);
    ch.own = true; ch.why = 'conectando'; ch.tail = null;
    const ac = new AbortController(); ch.abort = ac; let got = 0, bad = 0, lastOk = performance.now();
    const wd = setInterval(() => { if (performance.now() - lastOk > 15000) ac.abort(); }, 3000);
    try {
      const r = await fetch(via(list[k]), { signal: ac.signal, cache: 'no-store' });
      if (!r.ok || !r.body) throw new Error('http');
      ch.readable = true;
      const sp = new SP.FrameSplitter(), rd = r.body.getReader();
      for (;;) {
        const { value, done } = await rd.read(); if (done) throw new Error('fin');
        sp.push(value);
        if (!sp.codec && sp.bytesIn > 300000) throw new Error('formato');
        let c;
        while ((c = sp.takeChunk(got ? 2 : 1))) {
          let buf; try { buf = await decode(c.bytes.buffer); } catch (e) { if (++bad >= 3 && !got) throw new Error('formato'); continue; }
          if (ch.gone || ch.abort !== ac) return;
          const now = P.ctx.currentTime, x = buf.getChannelData(0), sr = buf.sampleRate, W = 1024;
          // colchón: el stream llega en tiempo real, así que se reproduce con ~2 s de reserva para que nunca falte el trozo siguiente
          if (!(ch.next > now + .05)) { ch.next = now + (got ? 1.2 : 1.8); ch.tail = null; if (got) ch.cortes = (ch.cortes || 0) + 1; }
          // Cada trozo suena de a hasta b. b queda G muestras antes del final (ahí el decodificador deja audio incompleto).
          // Los últimos Xs de un trozo se funden con los primeros Xs del siguiente: es el mismo audio, así que la suma es exacta
          // aunque el reloj difiera una muestra. El punto a se busca por coincidencia con el final del trozo anterior.
          const G = Math.round(.06 * sr), Xs = Math.round(.008 * sr), b = x.length - G, joined = !!ch.tail;
          let a = Math.round(c.skip * sr);
          if (joined) { a = a - G - Xs; if (a >= W) a = SP.spliceAt(x, ch.tail, a, W, 3200); a = Math.max(0, a); }
          if (b - a < 4 * Xs) continue;
          ch.tail = b - Xs - W > a ? x.slice(b - Xs - W, b - Xs) : null;
          const T = ch.next, len = (b - a) / sr, X = Xs / sr;
          const src = P.ctx.createBufferSource(), g = P.ctx.createGain(); src.buffer = buf; src.connect(g); g.connect(ch.input);
          if (joined) { g.gain.value = 0; g.gain.setValueAtTime(0, T); g.gain.linearRampToValueAtTime(1, T + X); } else g.gain.setValueAtTime(1, T);
          g.gain.setValueAtTime(1, T + len - X); g.gain.linearRampToValueAtTime(0, T + len);
          src.start(T, a / sr, len); ch.next = T + len - X;
          if (ch.mem) { try { ch.mem.push(x.subarray(a, b - Xs), sr, T); } catch (e) { /* el reconocedor nunca debe cortar el audio */ } }
          lastOk = performance.now(); if (++got === 10) ch.retries = 0;
          if (!ch.live) { ch.live = true; ch.ok = true; ch.why = ''; ch.codec = sp.codec; if (ch.liveAt == null) ch.liveAt = now; note(ch.id, { ok: true, cors: true }); }
          while (ch.next - P.ctx.currentTime > 12 && !ch.gone) await sleep(400);
        }
      }
    } catch (e) {
      if (ch.gone || ch.abort !== ac) return;
      ch.live = false;
      if (got > 0 && (ch.retries = (ch.retries || 0) + 1) <= 5) { await sleep(1000); return ownEngine(ch, k); }   // se cortó: reconectar
      return ownEngine(ch, k + 1);
    } finally { clearInterval(wd); }
  }
  function openStream(ch, cors, k = 0) {
    const list = usable(ch.st);
    if (ch.gone) return;
    if (k >= list.length) { if (cors) return openStream(ch, false, 0); ch.ok = false; ch.live = false; note(ch.id, { ok: false }); return; }
    const el = new Audio(); el.preload = 'none'; if (cors) el.crossOrigin = 'anonymous';
    el.src = via(list[k]);
    ch.el = el; ch.live = false;
    if (cors) { graph(ch); ch.src = P.ctx.createMediaElementSource(el); ch.src.connect(ch.input); }
    else { el.muted = !(ch.target > 0); try { el.volume = ch.target > 0 ? 1 : 0; } catch (e) { /* iPhone */ } }
    el.addEventListener('playing', () => {
      if (!ch.live && ch.an) ch.liveAt = P.ctx.currentTime; ch.live = true; ch.ok = true; note(ch.id, { ok: true, cors: !!cors });
      // Defecto de Safari/Chrome en iPhone: suena, pero el analizador recibe solo ceros. Si pasa, se sigue sin análisis y sin doble audio.
      if (cors) setTimeout(() => {
        if (ch.el !== el || !ch.an) return; const t = P.ctx.currentTime, fr = ch.brain.frames.filter(f => f.t > t - 3);
        if (fr.length > 15 && fr.every(f => f.db < -90)) { ch.why = 'ceros'; ungraph(ch); el.pause(); el.removeAttribute('src'); try { el.load(); } catch (e) { /* nada */ } openStream(ch, false, 0); }
      }, 6500);
    });
    const fail = () => {
      if (ch.el !== el) return; clearTimeout(ch.wd);
      if (cors) ungraph(ch); el.removeAttribute('src'); try { el.load(); } catch (e) { /* nada */ }
      openStream(ch, cors, k + 1);       // siguiente stream; al final, sin análisis (se escucha igual, sin anticipación)
    };
    el.addEventListener('error', fail);
    clearTimeout(ch.wd); ch.wd = setTimeout(() => { if (ch.el === el && !ch.live) fail(); }, 15000);
    el.play().catch(() => { /* se reintenta al tocar reproducir */ });
  }
  // ---------- memoria de avisos (huella acústica), guardada en el dispositivo ----------
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('radia', 1); r.onupgradeneeded = () => r.result.createObjectStore('mem'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  async function loadMem(ch) {
    try {
      const d = await db(), rec = await new Promise((res, rej) => { const q = d.transaction('mem').objectStore('mem').get(ch.id); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      if (rec && !ch.gone) { ch.mem.importLibraryRaw(rec.lib); ch.mem.importHistoryRaw(rec.hist); }
    } catch (e) { /* sin almacenamiento: aprende solo durante esta sesión */ }
    ch.memReady = true;
  }
  async function saveMem(ch) {
    if (!ch.mem || !ch.memReady) return;
    try { const d = await db(); d.transaction('mem', 'readwrite').objectStore('mem').put({ at: Date.now(), lib: ch.mem.library.map(l => ({ id: l.id, kind: l.kind, hits: l.hits, at: l.at, manual: !!l.manual, fps: l.fps })), hist: ch.mem.exportHistoryRaw() }, ch.id); }
    catch (e) { /* idem */ }
  }
  /** El reconocedor avisa: aviso reconocido (con inicio y fin), fin corregido o aviso recién aprendido. */
  function onFp(ch, e) {
    const iv = ch.brain.iv;
    if (e.type === 'ad') {
      const prev = iv.filter(v => v.src === 'fp').pop();
      const gap = window.__radia.gap == null ? 45 : window.__radia.gap;                                   // un hueco corto entre dos avisos conocidos es otro aviso de la misma tanda
      if (prev && e.s - prev.e > .5 && e.s - prev.e <= gap) iv.push({ s: prev.e, e: e.s, src: 'gap' });
      iv.push({ s: e.s, e: e.e, src: 'fp', id: e.id });
    } else if (e.type === 'end') { const v = iv.find(x => x.src === 'fp' && x.id === e.id && Math.abs(x.s - e.s) < .01); if (v) v.e = e.e; }
  }
  const knownAds = () => P.chans.reduce((a, c) => a + (c.mem ? c.mem.library.length : 0), 0);
  function makeChan(st) {
    const ch = { id: st.id, st, ok: true, delay: 0, target: 0, category: catOf(st), brain: new E.Brain({ heur: !!S.agg }) };
    if (FP) { ch.mem = new FP.AdMemory({ cap: 1 << 18, excl: window.__radia.excl || 600 }); ch.mem.onEvent = e => onFp(ch, e); loadMem(ch); }
    if (blocked(st)) { ch.ok = false; return ch; }
    if (window.__radia.noOwn || !SP || !window.ReadableStream) openStream(ch, true); else ownEngine(ch);
    return ch;
  }
  function kill(ch) {
    saveMem(ch); ch.gone = true; if (ch.abort) ch.abort.abort(); clearInterval(ch.fade); clearTimeout(ch.wd);
    if (ch.el) { ch.el.pause(); ch.el.removeAttribute('src'); try { ch.el.load(); } catch (e) { /* nada */ } ch.el = null; }
    ungraph(ch);
  }
  // ---------- radio de reserva: la de mejor match fuera de tus favoritas, lista por si las tres caen en tanda ----------
  function reserveCandidates() {
    const m = byId(mainId()), mine = new Set(S.favs.live); if (!m) return [];
    return stations().filter(s => !mine.has(s.id) && !blocked(s) && !(P.skip[s.id] > Date.now() - 6e5) && S.probe[s.id] && S.probe[s.id].ok && S.probe[s.id].cors)
      .map(s => ({ s, m: E.match(catOf(m), catOf(s)) })).sort((a, b) => b.m - a.m).map(x => x.s);
  }
  function tendReserve(now) {
    const r = P.chans.find(c => c.tier), age = Date.now() - (P.reserveAt || 0);
    if (r) {
      if (P.dir.current === r.id || age < 30000) return;
      if (r.ok !== false && r.live && !P.dir.inAd(r, now)) return;             // sirve: se queda
      P.skip[r.id] = Date.now(); kill(r); P.chans.splice(P.chans.indexOf(r), 1);   // caída o en tanda: probar la siguiente
    } else if (age < 8000) return;
    P.reserveAt = Date.now();
    const c = reserveCandidates()[0]; if (!c) return;
    const ch = makeChan(c); ch.tier = 1; P.chans.push(ch);
  }
  function setGain(ch, to, dur, offset = 0) {
    if (!ch) return; ch.target = to;
    if (ch.g) {
      const g = ch.g.gain, t = P.ctx.currentTime + offset, from = offset ? (to > .5 ? 0 : g.value) : g.value;
      try {
        g.cancelScheduledValues(t); g.setValueAtTime(from, t);
        const n = 24, curve = new Float32Array(n);
        for (let i = 0; i < n; i++) { const x = i / (n - 1); curve[i] = from + (to - from) * (to > from ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2)); }
        g.setValueCurveAtTime(curve, t + .01, Math.max(.05, dur));
      } catch (e) { g.cancelScheduledValues(0); g.setValueAtTime(to, P.ctx.currentTime + offset + dur); }
    } else if (ch.el) {
      clearInterval(ch.fade); const el = ch.el, start = performance.now() + offset * 1000, from = el.muted ? 0 : el.volume;
      const tick = () => {
        const x = E.clamp((performance.now() - start) / (dur * 1000)), v = from + (to - from) * x;
        try { el.volume = E.clamp(v); } catch (e) { /* iPhone no deja mover el volumen */ }
        // En iPhone el volumen no cambia: se silencia en la mitad del fundido (corte limpio) y solo se activa cuando le toca sonar
        el.muted = to > from ? x < .5 && offset > 0 && performance.now() < start : v < .5;
        if (x >= 1) { el.muted = to === 0; clearInterval(ch.fade); }
      };
      tick(); ch.fade = setInterval(tick, 40);
    }
  }
  function note(id, r) { const o = S.probe[id] || {}; S.probe[id] = Object.assign(o, r, { at: Date.now() }); if (!r.ok) delete S.probe[id].cors; save(); }
  function log(text) { const d = new Date(); P.log.unshift({ time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), text }); P.log.length = Math.min(P.log.length, 5); }

  async function play() {
    if (P.playing || P.starting) return;
    const list = favs();
    if (!list.length) { go('emisoras'); toast('Elegí al menos una emisora.'); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('Este navegador no puede reproducir audio de esta forma.'); return; }
    // iPhone: Web Audio queda mudo con el interruptor de silencio salvo que haya un <audio> sonando o la sesión sea de reproducción
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* sin API */ }
    try {
      if (!P.keep) { const n = 4000, w = new Uint8Array(44 + n), v = new DataView(w.buffer); w.fill(128, 44);
        [[0, 0x52494646], [8, 0x57415645], [12, 0x666d7420], [36, 0x64617461]].forEach(([o, x]) => v.setUint32(o, x));
        v.setUint32(4, 36 + n, true); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); v.setUint32(40, n, true);
        P.keep = new Audio(URL.createObjectURL(new Blob([w], { type: 'audio/wav' }))); P.keep.loop = true; P.keep.setAttribute('playsinline', ''); }
      P.keep.play().catch(() => { /* sin permiso: se sigue igual */ });
    } catch (e) { /* sin Blob/Audio */ }
    if (!P.ctx) {
      P.ctx = new AC(); P.comp = P.ctx.createDynamicsCompressor(); P.comp.connect(P.ctx.destination);
      const len = P.ctx.sampleRate * 2; P.noise = P.ctx.createBuffer(1, len, P.ctx.sampleRate);
      const d = P.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    P.starting = true;
    try { await P.ctx.resume(); } catch (e) { /* seguirá suspendido hasta un toque */ }
    P.starting = false;
    if (P.playing) return;
    P.master = P.ctx.createGain(); P.master.connect(P.comp);
    const main = mainId(); P.mainIndex = list.findIndex(s => s.id === main);
    P.chans = list.map(makeChan); P.reserveAt = 0; scan();
    P.dir = new E.Director({ stations: P.chans, mainId: main });
    setGain(chan(main), 1, .5);
    P.playing = true; P.note = null;
    P.timers = [setInterval(features, 50), setInterval(control, 100), setInterval(second, 1000)];
    media(); paint(); renderStations();
  }
  function stop() {
    if (!P.playing) return;
    P.timers.forEach(clearInterval); P.playing = false;
    if (P.keep) P.keep.pause();
    P.chans.forEach(kill);
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
      if (ch.ok) ch.brain.tickClock(now, minute, sched(ch.id));
      if (ch.an && ch.id !== P.dir.current) ch.delay = ch.liveAt != null && now - ch.liveAt >= ch.look + 1 ? ch.look : 0;
    }
    const a = P.dir.tick(now); if (a) apply(a);
  }
  function apply(a) {
    if (a.type === 'switch') {
      const f = chan(a.from), t = chan(a.to), d = a.style.dur;
      tap(t);
      if (a.style.mode === 'cross') { setGain(f, 0, d); setGain(t, 1, d); } else { setGain(f, 0, d / 2); setGain(t, 1, d / 2, d / 2); }
      S.stats.switches++;
      const txt = a.reason === 'ad' ? (f.ok === false || f.live === false ? f.st.name + ' quedó sin señal.' : t.tier ? 'Tus emisoras están en tanda.' : 'Tanda en ' + f.st.name + '.') + ' Pasamos a ' + t.st.name + (t.tier ? ' (reserva)' : '') + ', match ' + a.style.match + '%.'
        : a.reason === 'return' ? 'Terminó la tanda. Volvemos a ' + t.st.name + '.' : 'Elegiste ' + t.st.name + '.';
      log(txt); P.note = { at: Date.now(), text: txt }; media();
    } else if (a.type === 'duck') { setGain(curChan(), .18, .8); log('Todas tus emisoras están en tanda. Bajamos el volumen.'); }
    else if (a.type === 'unduck') setGain(curChan(), 1, .8);
    paint();
  }
  function second() {
    const now = P.ctx.currentTime, cur = curChan(), main = chan(P.dir.mainId);
    if (P.dir.inAd(cur, now)) S.stats.heard++;
    else if (cur !== main && (P.dir.inAd(main, now) || main.ok === false)) S.stats.avoided++;
    tendReserve(now);
    if (Math.round(now) % 120 === 0) P.chans.forEach(saveMem);
    diagTick(now);
    { const d = new Date(Date.now() - 8000); for (const ch of P.chans) if (ch.live) sched(ch.id).observe(d.getMinutes(), ch.brain.isAdAt(now - 8), 1); if (Math.round(now) % 30 === 0) persist(); }
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
    if (IN_CLAUDE || scanning) return;
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
    const head = { radia: 3, ua: navigator.userAgent, margen: lookahead(), puente: !!PX(), ahora: now, suena: P.dir ? P.dir.current : null, marcas: DG.marks,
      estimada: !!S.agg, radios: P.chans.map(c => ({ n: c.st.name, reserva: !!c.tier, memoria: c.mem ? c.mem.stats() : null, avisos: c.brain.iv.filter(v => v.src === 'fp').length, analiza: !!c.an, motor: c.own ? 'propio' : c.el ? 'nativo' : '-', codec: c.codec || '', porque: c.why || '', senal: c.ok !== false && !!c.live, demora: c.delay, cortes: c.brain.cuts.map(Math.round), tandas: c.brain.iv.map(v => [Math.round(v.s), v.e == null ? null : Math.round(v.e), v.src]) })) };
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
      const next = () => { if (PV.el !== el) return; clearTimeout(PV.t); el.removeAttribute('src'); attempt(k + 1, cors); };
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
    $('#modePill').classList.toggle('is-live', P.playing);
    if (shown) {
      const [a, b] = artText(shown); $('#artFreq').textContent = a; $('#artBand').textContent = b; $('#art').style.setProperty('--h', hue(shown));
      $('#npName').textContent = shown.name; $('#npSub').textContent = catLabel(catOf(shown)) + ', franja ' + E.slotAt(hourNow()).label.toLowerCase();
    } else { $('#artFreq').textContent = '–'; $('#artBand').textContent = ''; $('#npName').textContent = 'Elegí tus emisoras'; $('#npSub').textContent = 'Una favorita y hasta dos alternativas'; }
    // estado
    const st = $('#status'); let html = '', warn = false;
    if (!list.length) html = 'Todavía no hay emisoras elegidas.';
    else if (!P.playing) html = IN_CLAUDE ? 'Dentro de Claude las radios no suenan. Abrí RADIA en tu navegador.' : 'RADIA escucha tus emisoras antes que vos y cambia cuando viene la tanda.';
    else {
      const t = P.dir.tta(cur, now), main = chan(P.dir.mainId);
      if (P.note && Date.now() - P.note.at < 4500) html = '<b>' + esc(P.note.text) + '</b>';
      else if (P.dir.ducked) { html = '<b>Todas en tanda.</b> Volumen bajo hasta que alguna vuelva.'; warn = true; }
      else if (cur.ok && !cur.live) html = 'Conectando con ' + esc(cur.st.name) + '…';
      else if (t < Infinity && t > 0) { html = '<b>Tanda detectada.</b> Cambio en ' + Math.max(1, Math.round(t)) + ' s.'; warn = true; }
      else if (cur !== main) html = esc(main.st.name) + (main.ok === false ? ' está sin señal.' : ' está en tanda. Volvemos apenas termine.');
      else html = cur.delay ? '<b>Sin publicidad a la vista.</b> Vas ' + cur.delay + ' s detrás del vivo.'
        : cur.an ? (cur.mem && !cur.mem.library.length && !S.agg ? '<b>Aprendiendo.</b> Todavía no conozco avisos de esta radio. Tocá “Esto es publicidad” cuando suene uno.' : '<b>En directo.</b> La anticipación empieza con el primer cambio de emisora.')
        : cur.why === 'formato' || cur.why === 'ceros' ? '<b>Sonando sin análisis.</b> El formato de esta radio no se puede analizar en este navegador.'
        : '<b>Sonando sin análisis.</b> Esta radio no da permiso para leer su audio: hace falta el puente (Ajustes).';
    }
    st.innerHTML = html; st.classList.toggle('is-warn', warn);
    // radar
    const lanes = list.concat(P.chans.filter(c => c.tier).map(c => c.st));
    $('#radar').innerHTML = lanes.map(s => {
      const ch = chan(s.id), isMain = s.id === mainId(), m = matchWithMain(s);
      let blocks = '', cls = '', blind = !ch || !ch.an;
      if (ch) {
        const heard = now - ch.delay, span = ch.delay || 1;
        if (ch.delay) for (const iv of ch.brain.iv) { const a = E.clamp((iv.s - heard) / span), b = E.clamp(((iv.e == null ? now : Math.min(iv.e, now)) - heard) / span); if (b > a) blocks += '<i style="left:' + (a * 100).toFixed(1) + '%;width:' + ((b - a) * 100).toFixed(1) + '%"></i>'; }
        if (ch.ok === false) cls = ' is-down'; else if (ch.brain.isAdAt(heard)) cls = ' is-ad';
        if (cur === ch) cls += ' is-current';
      }
      const ana = !ch || ch.ok === false ? '' : !ch.live ? ', conectando' : !ch.an ? ', sin análisis' : ch.mem ? ', ' + ch.mem.library.length + (ch.mem.library.length === 1 ? ' aviso' : ' avisos') : ', analiza';
      const meta = ch && ch.ok === false ? (blocked(s) || 'Sin señal') : (isMain ? 'Favorita' : (ch && ch.tier ? 'Reserva, ' : '') + (m == null ? '' : (ch && ch.tier ? 'match ' : 'Match ') + m + '%')) + ana;
      return '<button class="lane' + cls + '" data-lane="' + esc(s.id) + '" aria-label="Escuchar ' + esc(s.name) + '">' +
        '<span class="lane-name"><i class="dot"></i>' + (isMain ? ICON.star : '') + '<span>' + esc(s.name) + '</span></span>' +
        '<span class="lane-meta' + (m != null && m < 40 ? ' is-low' : '') + '">' + esc(meta) + '</span>' +
        '<span class="track' + (P.playing && blind ? ' is-blind' : '') + '">' + blocks + '</span></button>';
    }).join('') || '<div class="empty">Sumá emisoras desde la pestaña Emisoras.</div>';
    $('#memNote').textContent = !P.playing ? '' : 'RADIA conoce ' + knownAds() + ' avisos de estas radios. Aprende uno cuando se repite o cuando tocás “Esto es publicidad”.';
    $('#radarKey').hidden = !list.length; $('#keyLive').textContent = 'El vivo, ' + lookahead() + ' s adelante';
    // contadores
    $('#stAvoided').textContent = mmss(S.stats.avoided); $('#stSwitches').textContent = S.stats.switches;
    $('#stHeard').textContent = S.stats.heard + ' s';
    $('#log').innerHTML = P.log.map(l => '<li><time>' + l.time + '</time><span>' + esc(l.text) + '</span></li>').join('');
  }

  function row(st, inFav) {
    const isMain = st.id === mainId(), m = matchWithMain(st), why = blocked(st);
    const pr = S.probe[st.id], tested = pr ? (pr.ok ? (pr.cors ? 'con anticipación' : 'suena, sin anticipación') : 'sin señal la última vez') : '';
    const sub = why || (tested && !inFav ? catLabel(catOf(st)) + ', ' + tested : '') || (inFav ? catLabel(catOf(st)) + (isMain ? ', favorita' : m != null ? ', match ' + m + '%' : '')
      : catLabel(catOf(st)) + (st.freq ? ', ' + st.freq : '') + (m != null ? ', match ' + m + '%' : ''));
    const [a] = artText(st);
    return '<div class="row"><span class="chip" style="--h:' + hue(st) + '">' + esc(a) + '</span>' +
      '<span class="row-main"><b>' + esc(st.name) + '</b><small class="' + ((m != null && m < 40) || why ? 'is-low' : '') + '">' + esc(sub) + '</small></span>' +
      (inFav ? '<button class="icon" data-prog="' + esc(st.id) + '" aria-label="Programación de ' + esc(st.name) + '">' + ICON.tune + '</button>' +
        '<button class="icon is-star' + (isMain ? ' is-on' : '') + '" data-main="' + esc(st.id) + '" aria-pressed="' + isMain + '" aria-label="Marcar ' + esc(st.name) + ' como favorita">' + ICON.star + '</button>' +
        '<button class="icon is-remove" data-fav="' + esc(st.id) + '" aria-label="Quitar ' + esc(st.name) + '">' + ICON.minus + '</button>'
        : (why ? '' : '<button class="icon' + (PV.id === st.id ? ' is-on' : '') + '" data-try="' + esc(st.id) + '" aria-label="Probar ' + esc(st.name) + '">' + (PV.id === st.id ? ICON.stopS : ICON.playS) + '</button>') +
        '<button class="icon" data-fav="' + esc(st.id) + '" aria-label="Agregar ' + esc(st.name) + '">' + ICON.plus + '</button>') + '</div>';
  }
  function renderStations() {
    const list = favs(), ids = new Set(list.map(s => s.id)), q = norm($('#search').value), slot = E.slotAt(hourNow());
    $('#slotPill').textContent = slot.label + ', ' + slot.from + ' a ' + slot.to + ' h';
    $('#favList').innerHTML = list.map(s => row(s, true)).join('') || '<div class="empty">Tocá el signo más de una emisora para sumarla. La primera queda como favorita.</div>';
    const low = list.filter(s => { const m = matchWithMain(s); return m != null && m < 40; });
    $('#favNote').textContent = low.length ? 'Match bajo con ' + low.map(s => s.name).join(' y ') + ' en esta franja: el cambio se va a notar. RADIA lo hace corto y sin mezclar.'
      : list.length ? 'La estrella marca la favorita: RADIA siempre vuelve a ella cuando termina su tanda.' : '';
    const rank = s => { const p = S.probe[s.id]; return blocked(s) ? 4 : !p ? 2 : p.ok ? (p.cors ? 0 : 1) : 3; };
    const rest = stations().filter(s => !ids.has(s.id) && (!q || norm(s.name).includes(q)));
    rest.sort((a, b) => rank(a) - rank(b));
    $('#catTitle').textContent = 'Uruguay, ' + (S.catalog.length + S.custom.length) + ' emisoras';
    $('#catList').innerHTML = rest.slice(0, 120).map(s => row(s, false)).join('') ||
      '<div class="empty">' + (q ? 'Ninguna emisora coincide con la búsqueda.' : 'No quedan emisoras por sumar.') + '</div>';
    $('#catNote').textContent = (rest.length > 120 ? 'Se muestran 120. Usá el buscador para ver el resto. ' : '') + (IN_CLAUDE ? 'Dentro de Claude las radios reales no suenan: abrí RADIA en tu navegador. '
          : (() => { const all = stations(), ok = all.filter(s => S.probe[s.id] && S.probe[s.id].cors).length, seen = all.filter(s => S.probe[s.id]).length;
              return (scanning ? 'Revisando radios, ' + seen + ' de ' + all.length + '. ' : seen ? ok + ' de ' + seen + ' radios revisadas dejan anticipar sus tandas' + (PX() ? ' con el puente. ' : '; el resto necesita el puente (Ajustes). ') : '') + 'Primero van las que permiten cambio automático. '; })()) + 'Streams del directorio abierto radio-browser.info.';
  }
  function renderSettings() {
    $('#agg').checked = !!S.agg; $('#delay').value = S.delay; $('#delayVal').textContent = S.delay + ' s'; $('#proxy').value = S.proxy; $('#proxy').placeholder = BRIDGE || 'https://tu-puente.workers.dev';
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
    if (name === 'emisoras' && catalogState === 'idle') loadCatalog();
    if (name === 'emisoras') scan();
    renderAll(); window.scrollTo(0, 0);
  }
  // ---------- eventos ----------
  $('#btnPlay').onclick = () => { stopPreview(); P.playing ? stop() : play(); };
  $('#btnAd').onclick = () => {
    const cur = curChan(); if (!cur) return;
    const heard = P.ctx.currentTime - cur.delay; cur.brain.markAd(heard); if (cur.mem) cur.mem.teach(heard); DG.marks.push([Math.round(P.ctx.currentTime), P.chans.indexOf(cur)]);
    sched(cur.id).observe(new Date().getMinutes(), true, 30);
    toast(cur.mem ? 'Aprendido. La próxima vez que suene este aviso, RADIA lo corta sola.' : 'Anotado. Esta radio no se puede analizar, así que RADIA solo aprende su horario.');
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
    const list = S.favs.live;
    if (p) return openSheet(p.dataset.prog);
    if (m) { S.main.live = m.dataset.main; }
    else if (f) {
      const id = f.dataset.fav, i = list.indexOf(id);
      if (i >= 0) { list.splice(i, 1); if (S.main.live === id) S.main.live = list[0] || null; }
      else if (list.length >= 3) return toast('Máximo tres. Quitá una para sumar otra.');
      else { list.push(id); if (!S.main.live) S.main.live = id; }
    } else return;
    save(); restart(); renderAll();
  };
  $('#search').oninput = renderStations;
  $('#agg').onchange = e => { S.agg = e.target.checked; save(); restart(); renderAll(); };
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
    toast(name + ' agregada.'); renderAll();
  };
  $('#reload').onclick = () => { loadCatalog(true).then(ok => toast(ok ? 'Lista actualizada.' : 'No se pudo actualizar desde acá.')); };
  $('#reset').onclick = () => { stop(); db().then(d => d.transaction('mem', 'readwrite').objectStore('mem').clear()).catch(() => {}); S.sched = {}; for (const k in scheds) delete scheds[k]; S.stats = { avoided: 0, heard: 0, switches: 0 }; save(); renderAll(); toast('Aprendizaje borrado.'); };
  $('#shDone').onclick = () => { $('#sheet').close(); restart(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P.playing && P.ctx.state !== 'running') P.ctx.resume().catch(() => {}); });
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', () => { persist(); P.chans.forEach(saveMem); });
  setInterval(() => { if (P.playing) paint(); }, 250);
  route();
})();

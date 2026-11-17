/* Prueba de punta a punta del conocimiento compartido (no corre con `node --test`; necesita /tmp/fx de tools_fixtures.py, Chromium y ~7 min).
   3 navegadores aprenden de una radio con avisos y los comparten; un cuarto, recién llegado, debe cortar la tanda desde la primera vez.
   Un control sin compartir mide cuánto se escucharía sin esto. Se mide la señal de salida: los avisos de r3t llevan una marca de 2,4 kHz. */
import http from 'node:http'; import fs from 'node:fs'; import { createRequire } from 'node:module';
import { start } from '../../puente/dev-server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const LEARN = +process.env.LEARN_S || 175, RUN = +process.env.RUN_S || 140;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const files = { x: '/tmp/fx/r3t.mp3', y: '/tmp/fx/r2.mp3' };
const radio = http.createServer((req, res) => {
  const f = files[req.url.slice(1).split('?')[0]]; if (!f) { res.writeHead(404); return res.end(); }
  const buf = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  let p = 0; const t = setInterval(() => { res.write(buf.subarray(p, p + 800)); p = (p + 800) % buf.length; }, 100); req.on('close', () => clearInterval(t));   // 8 kB/s = 64 kbps, en tiempo real
});
const page = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(new URL('../../dist/index.html', import.meta.url))); });
const listen = (s, p) => new Promise(r => s.listen(p, '127.0.0.1', r));
const REC = () => {   // mide lo que llega a los parlantes: segundos con la marca de 2,4 kHz (= aviso) y segundos con sonido
  const orig = AudioNode.prototype.connect; window.__rec = { ad: 0, snd: 0, n: 0 };
  AudioNode.prototype.connect = function (dst, ...r) {
    const res = orig.call(this, dst, ...r);
    try {
      const c = this.context; if (dst === c.destination && !c.__tap && !(this instanceof ScriptProcessorNode)) {
        const sp = c.createScriptProcessor(4096, 1, 1); c.__tap = sp; const N = 4096, w = 2 * Math.PI * 2400 / c.sampleRate, co = 2 * Math.cos(w);
        sp.onaudioprocess = e => { const x = e.inputBuffer.getChannelData(0); let s1 = 0, s2 = 0, e2 = 0; for (let i = 0; i < N; i++) { const s0 = x[i] + co * s1 - s2; s2 = s1; s1 = s0; e2 += x[i] * x[i]; }
          const amp = 2 * Math.sqrt(s1 * s1 + s2 * s2 - co * s1 * s2) / N, dt = N / c.sampleRate; window.__rec.n += dt; if (e2 / N > 1e-5) window.__rec.snd += dt; if (amp > .02) window.__rec.ad += dt; };
        orig.call(sp, c.destination); orig.call(this, sp);
      } else if (dst === c.destination && c.__tap && !(this instanceof ScriptProcessorNode)) orig.call(this, c.__tap);
    } catch (e) { /* sin medición */ }
    return res;
  };
};
const mkState = share => JSON.stringify({ v: 4, mode: 'live', delay: 60, agg: false, share, proxy: 'http://127.0.0.1:8901', favs: { live: ['uy-e2e00001', 'uy-e2e00002'] }, main: { live: 'uy-e2e00001' }, profiles: {}, probe: {}, sched: {}, stats: { avoided: 0, heard: 0, switches: 0 }, catalog: [], catalogAt: 0,
  custom: [{ id: 'uy-e2e00001', name: 'Radio X', urls: ['http://127.0.0.1:8903/x'], tags: '' }, { id: 'uy-e2e00002', name: 'Radio Y', urls: ['http://127.0.0.1:8903/y'], tags: '' }] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function device(browser, name, share) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } }), pg = await ctx.newPage();
  await ctx.route(u => /\/s\?u=/.test(u.href) && !/127\.0\.0\.1/.test(decodeURIComponent(u.search)), r => r.abort());   // el catálogo real no existe en el entorno de prueba
  pg.on('pageerror', e => log(name, 'ERROR de página:', e.message)); pg.on('response', r => { if (r.status() >= 400 && !globalThis.__seen?.has(r.url())) { (globalThis.__seen ??= new Set()).add(r.url()); log(name, r.status(), r.url().slice(0, 120)); } }); pg.on('console', m => { if (false) log(name, 'consola:', m.text().slice(0, 160)); });
  await pg.addInitScript(REC); await pg.addInitScript(s => { if (!localStorage.getItem('radia.v1')) localStorage.setItem('radia.v1', s); }, mkState(share));
  await pg.goto('http://127.0.0.1:8902/'); await pg.evaluate(() => { window.__radia.excl = 5; }); await pg.click('#btnPlay'); log(name, 'reproduciendo'); return { name, ctx, pg };
}
const snap = d => d.pg.evaluate(() => ({ rec: { ...window.__rec }, libs: window.__radia.P.chans.map(c => c.mem ? c.mem.library.map(l => ({ k: l.kind, sid: !!l.sid, sh: !!l.shared, n: l.fps.length })) : null) }));
const srv = await start(8901, { MIN_DEVICES: '3' }); await listen(radio, 8903); await listen(page, 8902);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let ok = true; const fail = m => { ok = false; log('FALLA:', m); };
try {
  log('arrancan 3 dispositivos que aprenden y 1 control sin compartir'); const L = [], C = await device(browser, 'control', false);
  for (let i = 1; i <= 3; i++) L.push(await device(browser, 'D' + i, true));
  await sleep(LEARN * 1000);
  const lib = await (await fetch('http://127.0.0.1:8901/lib?station=uy-e2e00001')).json(), cand = await (await fetch('http://127.0.0.1:8901/cand?station=uy-e2e00001')).json();
  log('servidor: confiables', lib.trusted.length, 'candidatos', cand.cands.map(c => c.v).join(','));
  for (const d of L) log(d.name, JSON.stringify((await snap(d)).libs[0]));
  const base = await snap(C); log('control (sin compartir) escuchó', base.rec.ad.toFixed(1), 's de avisos en', base.rec.n.toFixed(0), 's');
  if (!lib.trusted.length) fail('el servidor no tiene avisos confiables');
  for (const d of [C, ...L]) await d.ctx.close();
  // control 2: dispositivo nuevo SIN compartir (mide la línea de base de una primera escucha) y dispositivo nuevo CON lo compartido
  const N0 = await device(browser, 'nuevo-sin-compartir', false), N1 = await device(browser, 'nuevo-con-compartido', true);
  await sleep(RUN * 1000);
  const a = await snap(N0), b = await snap(N1);
  log('nuevo SIN compartido: avisos escuchados', a.rec.ad.toFixed(1), 's de', a.rec.n.toFixed(0), '| biblioteca', JSON.stringify(a.libs[0]));
  log('nuevo CON compartido: avisos escuchados', b.rec.ad.toFixed(1), 's de', b.rec.n.toFixed(0), '| biblioteca', JSON.stringify(b.libs[0]));
  if (!(b.libs[0] && b.libs[0].some(l => l.sh))) fail('el dispositivo nuevo no recibió avisos compartidos');
  if (!(b.rec.ad < a.rec.ad - 15)) fail('compartir no redujo lo bastante la publicidad escuchada');
  if (b.rec.ad > 20) fail('con lo compartido todavía se escuchan más de 20 s de avisos');
  if (b.rec.snd < b.rec.n * .5) fail('casi no hubo sonido de salida');
} catch (e) { fail(e.stack || e); }
await browser.close(); srv.close(); radio.closeAllConnections(); radio.close(); page.close();
log(ok ? 'PASÓ' : 'NO PASÓ'); process.exit(ok ? 0 : 1);

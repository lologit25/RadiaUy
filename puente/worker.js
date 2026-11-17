/* RADIA · puente de audio para Cloudflare Workers (plan gratuito).
   Reenvía el stream de una radio agregando permiso CORS, para que RADIA pueda analizarlo y anticipar las tandas.
   Solo acepta los servidores de las radios del catálogo. Generado por tools_catalog.py + este encabezado. */
export const HOSTS = ["1063fm.ddns.net", "198.49.65.43", "24deagosto-zikoxweb.radioca.st", "27383.live.streamtheworld.com", "970universal-3.nty.uy", "a3.asurahosting.com", "america-2.nty.uy", "as100.globalhost1.com", "azul-1.nty.uy", "azul-2.nty.uy", "cento02.mipanelradio.com", "cloudstream2036.conectarhosting.com", "comodin.uy", "cordialidad-zikoxweb2.radioca.st", "cx10continente.com", "delsol-1.nty.uy", "dreamsiteradiocp.com", "emisiones.com.uy", "emisora.unorte.edu.uy", "espectador-1.nty.uy", "hit-1.nty.uy", "icecast15.innovanexo.com", "icecasthd.net", "inolvidable-1.nty.uy", "inolvidable-2.nty.uy", "medios.ciudaddigital.com.uy", "metropolis-web-1.nty.uy", "oceano-2.nty.uy", "one.cloudstreaming.eu", "panel.streamenviron.com", "playerservices.streamtheworld.com", "radio.cimaspeed.com", "radio.dl.uy", "radio.hostlagarto.com", "radio.solumedia.com.ar", "radioclarin-zikoxweb.radioca.st", "radiolatina.live", "radioonline.netgate.com.uy", "radios-online.info", "radios.iwstreaming.uy", "radios.solumedia.com", "radiosar.com", "rincon2-zikoxweb.radioca.st", "rinconam-zikoxweb.radioca.st", "rr5100.globalhost1.com", "s1.radiosenialesfm.com", "s7.myradiostream.com", "salida.stream.com.uy", "server-uk1.radioseninternet.net", "server-usa2.radioseninternet.net", "server.laradio.online", "sh1.radioonlinehd.com", "sp.dattavolt.com", "sp3.servidorrprivado.com", "srv2.radiostreamuy.com", "stm.gmpro.top", "stm1.ifantasy.com.br", "stream-151.zeno.fm", "stream-30.zeno.fm", "stream.rcast.net", "stream.zeno.fm", "stream1.enperspectiva.net", "stream20.usastreams.com", "streaming.gostreaming.com.ar", "streaming.radiosenlinea.com.ar", "streaming01.shockmedia.com.ar", "streaming1.hostingmontevideo.com", "streaming1.locucionar.com", "streaming2.locucionar.com", "streaming3.hostingmontevideo.com", "streaming6.locucionar.com", "streamingcasazorrilla.innovanexo.com", "streamingraddios.online", "streamradio.novotempo.com", "uniradio.edu.uy", "usa15.ciudaddigital.com.uy", "usa2.fastcast4u.com"];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
const say = (status, text) => new Response(text, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
const json = (obj, status = 200, cache = 'no-store') => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });

/* ---------- Biblioteca compartida (D1) ----------
   Cada dispositivo sube solo huellas acústicas (unos 2 KB por aviso, nunca audio) y el id de la emisora.
   Una huella pasa a "confiable" recién cuando la confirman al menos MIN_DEVICES dispositivos distintos (y MIN_IPS redes distintas):
   así un solo usuario, o un bot, no puede inyectar avisos falsos. Si varios usuarios reportan que no era publicidad, se bloquea. */
const MIN_DEVICES = 3, MIN_IPS = 2, MAX_ADS = 20000, RATE = 120, MIN_FRAMES = 126, MAX_FRAMES = 2100;
const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : d; };
const STATION = /^(uy-[0-9a-z]{4,16}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const DEV = /^[0-9a-f]{32}$/, ADID = /^[0-9a-f]{24}$/;
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
const inited = new WeakSet();
async function init(db) {
  if (inited.has(db)) return;
  await db.exec("CREATE TABLE IF NOT EXISTS ads (id TEXT PRIMARY KEY, station TEXT NOT NULL, fps TEXT NOT NULL, frames INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'cand', made INTEGER NOT NULL, trusted_at INTEGER)");
  await db.exec('CREATE INDEX IF NOT EXISTS ads_st ON ads(station, status)');
  await db.exec('CREATE TABLE IF NOT EXISTS votes (ad TEXT NOT NULL, dev TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (ad, dev))');
  await db.exec('CREATE TABLE IF NOT EXISTS reports (ad TEXT NOT NULL, dev TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (ad, dev))');
  await db.exec('CREATE TABLE IF NOT EXISTS rl (ip TEXT NOT NULL, hour INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, hour))');
  inited.add(db);
}
/** Huella válida: 126–2100 cuadros (6–100 s), ni silencio ni ruido constante. Devuelve la cantidad de cuadros o 0. */
function frames(b64) {
  if (typeof b64 !== 'string' || b64.length > 12000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return 0;
  let bin; try { bin = atob(b64); } catch (e) { return 0; }
  if (bin.length % 4) return 0;
  const n = bin.length / 4; if (n < MIN_FRAMES || n > MAX_FRAMES) return 0;
  const seen = new Set(); let flat = 0;
  for (let i = 0; i < n; i++) {
    const w = (bin.charCodeAt(4 * i) | bin.charCodeAt(4 * i + 1) << 8 | bin.charCodeAt(4 * i + 2) << 16 | bin.charCodeAt(4 * i + 3) << 24) >>> 0;
    if (w === 0 || w === 0xFFFFFFFF) flat++; seen.add(w);
  }
  return flat / n < .2 && seen.size / n >= .5 ? n : 0;
}
async function ipHash(request, env) { return hex(await sha((env.SALT || 'radia') + '|' + (request.headers.get('CF-Connecting-IP') || 'local'))).slice(0, 16); }
async function limited(db, ip, env) {
  const hour = Math.floor(Date.now() / 3600000);
  await db.prepare('INSERT INTO rl (ip, hour, n) VALUES (?, ?, 1) ON CONFLICT(ip, hour) DO UPDATE SET n = n + 1').bind(ip, hour).run();
  const r = await db.prepare('SELECT n FROM rl WHERE ip = ? AND hour = ?').bind(ip, hour).first();
  return r.n > num(env.RATE, RATE);
}
async function body(request) {
  const t = await request.text(); if (t.length > 40000) return null;
  try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
}
async function promote(db, id, env) {
  const md = num(env.MIN_DEVICES, MIN_DEVICES), mi = num(env.MIN_IPS, MIN_IPS);
  await db.prepare("UPDATE ads SET status = 'trusted', trusted_at = ? WHERE id = ? AND status = 'cand' AND (SELECT COUNT(DISTINCT dev) FROM votes WHERE ad = ?) >= ? AND (SELECT COUNT(DISTINCT ip) FROM votes WHERE ad = ?) >= ?").bind(Date.now(), id, id, md, id, mi).run();
}
async function addVote(db, id, dev, ip, env) {
  await db.prepare('INSERT OR IGNORE INTO votes (ad, dev, ip, at) VALUES (?, ?, ?, ?)').bind(id, dev, ip, Date.now()).run();
  await promote(db, id, env);
}
async function cleanup(db) {
  if (Math.random() > .02) return;
  const old = Date.now() - 30 * 86400000;
  await db.prepare("DELETE FROM ads WHERE status = 'cand' AND made < ? AND (SELECT COUNT(*) FROM votes WHERE ad = ads.id) < 2").bind(old).run();
  await db.prepare('DELETE FROM votes WHERE ad NOT IN (SELECT id FROM ads)').run();
  await db.prepare('DELETE FROM reports WHERE ad NOT IN (SELECT id FROM ads)').run();
  await db.prepare('DELETE FROM rl WHERE hour < ?').bind(Math.floor(Date.now() / 3600000) - 48).run();
}
async function shared(request, env, url) {
  const db = env.DB; if (!db) return say(503, 'Falta la base de datos (D1) enlazada como DB');
  await init(db);
  const m = request.method, p = url.pathname;
  if (m === 'GET' && (p === '/lib' || p === '/cand')) {
    const st = url.searchParams.get('station') || ''; if (!STATION.test(st)) return say(400, 'Emisora inválida');
    if (p === '/lib') {
      const t = (await db.prepare("SELECT id, fps FROM ads WHERE station = ? AND status = 'trusted' ORDER BY trusted_at DESC LIMIT 200").bind(st).all()).results;
      const b = (await db.prepare("SELECT id FROM ads WHERE station = ? AND status = 'blocked'").bind(st).all()).results;
      return json({ trusted: t, blocked: b.map(r => r.id), t: Date.now() }, 200, 'public, max-age=120');
    }
    const c = (await db.prepare("SELECT a.id, a.fps, (SELECT COUNT(*) FROM votes v WHERE v.ad = a.id) AS v FROM ads a WHERE a.station = ? AND a.status = 'cand' ORDER BY v DESC, a.made DESC LIMIT 80").bind(st).all()).results;
    return json({ cands: c });
  }
  if (m !== 'POST' || (p !== '/vote' && p !== '/report')) return say(404, 'Uso: /lib, /cand, /vote, /report');
  const o = await body(request); if (!o) return say(400, 'Cuerpo inválido');
  if (!STATION.test(o.station || '')) return say(400, 'Emisora inválida');
  if (!DEV.test(o.dev || '')) return say(400, 'Dispositivo inválido');
  const ip = await ipHash(request, env);
  if (await limited(db, ip, env)) return say(429, 'Demasiadas solicitudes');
  await cleanup(db);
  if (p === '/report') {
    if (!ADID.test(o.id || '')) return say(400, 'Aviso inválido');
    const ad = await db.prepare('SELECT status FROM ads WHERE id = ? AND station = ?').bind(o.id, o.station).first();
    if (!ad) return say(404, 'Aviso desconocido');
    await db.prepare('INSERT OR IGNORE INTO reports (ad, dev, ip, at) VALUES (?, ?, ?, ?)').bind(o.id, o.dev, ip, Date.now()).run();
    const r = await db.prepare('SELECT COUNT(DISTINCT dev) AS d FROM reports WHERE ad = ?').bind(o.id).first();
    const v = await db.prepare('SELECT COUNT(DISTINCT dev) AS d FROM votes WHERE ad = ?').bind(o.id).first();
    let blocked = false;
    if (r.d >= 3 && r.d * 2 >= v.d) { await db.prepare("UPDATE ads SET status = 'blocked' WHERE id = ?").bind(o.id).run(); blocked = true; }
    return json({ ok: true, blocked });
  }
  const confirm = Array.isArray(o.confirm) ? o.confirm.slice(0, 10) : [], add = Array.isArray(o.add) ? o.add.slice(0, 3) : [];
  if (confirm.some(id => !ADID.test(id || ''))) return say(400, 'Aviso inválido');
  let confirmed = 0; const created = [];
  for (const id of confirm) {
    const ad = await db.prepare("SELECT status FROM ads WHERE id = ? AND station = ?").bind(id, o.station).first();
    if (ad && ad.status !== 'blocked') { await addVote(db, id, o.dev, ip, env); confirmed++; }
  }
  for (const a of add) {
    const n = frames(a && a.fps); if (!n) return say(400, 'Huella inválida');
    const id = hex(await sha(o.station + '|' + a.fps)).slice(0, 24);
    const ex = await db.prepare('SELECT status FROM ads WHERE id = ?').bind(id).first();
    if (ex && ex.status === 'blocked') continue;
    if (!ex) {
      const tot = await db.prepare('SELECT COUNT(*) AS n FROM ads').first();
      if (tot.n >= MAX_ADS) return say(503, 'Biblioteca llena');
      await db.prepare("INSERT OR IGNORE INTO ads (id, station, fps, frames, status, made) VALUES (?, ?, ?, ?, 'cand', ?)").bind(id, o.station, a.fps, n, Date.now()).run();
    }
    await addVote(db, id, o.dev, ip, env); created.push(id);
  }
  return json({ ok: true, confirmed, ids: created });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/health') return say(200, env.DB ? 'ok db' : 'ok');
    if (['/lib', '/cand', '/vote', '/report'].includes(url.pathname)) { try { return await shared(request, env, url); } catch (e) { return say(500, 'Error interno'); } }
    if (request.method !== 'GET' || url.pathname !== '/s') return say(404, 'Uso: /s?u=<stream>');
    let target; try { target = new URL(url.searchParams.get('u')); } catch (e) { return say(400, 'Dirección inválida'); }
    if (!/^https?:$/.test(target.protocol)) return say(400, 'Solo http o https');
    const extra = String(env.EXTRA_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!HOSTS.includes(target.hostname) && !extra.includes(target.hostname)) return say(403, 'Radio fuera del catálogo');
    let up;
    try { up = await fetch(target.href, { headers: { 'User-Agent': 'RADIA-puente/1.0' }, redirect: 'follow', signal: request.signal }); }
    catch (e) { return say(502, 'La radio no respondió'); }
    const type = up.headers.get('content-type') || '';
    if (!up.ok || !/^audio\/|ogg|mpegurl|aac/i.test(type)) { try { await up.body.cancel(); } catch (e) { /* ya cerrado */ } return say(502, 'El destino no es un stream de audio'); }
    return new Response(up.body, { status: 200, headers: { ...CORS, 'Content-Type': type, 'Cache-Control': 'no-store' } });
  }
};

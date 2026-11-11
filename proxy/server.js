/* RADIA · puente de audio. Reenvía un stream de radio agregando permiso CORS,
   para que el navegador pueda analizarlo (y para servir por https radios que emiten en http).
   Sin dependencias: `node server.js`. Variables: PORT, ALLOW_ORIGIN, ALLOW_HOSTS, MAX_STREAMS. */
const http = require('http'), https = require('https'), dns = require('dns').promises, net = require('net');
const PORT = process.env.PORT || 8787;
const ORIGIN = process.env.ALLOW_ORIGIN || '*';                       // poné acá la dirección de tu RADIA
const HOSTS = (process.env.ALLOW_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX = +(process.env.MAX_STREAMS || 12);
const PRIVATE_OK = process.env.ALLOW_PRIVATE === '1';                 // solo para pruebas locales
let active = 0;

const isPrivate = ip => net.isIPv6(ip) ? /^(::1$|f[cd]|fe80|::ffff:(10|127|192\.168|169\.254)\.)/i.test(ip)
  : /^(10|127|0)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip);

async function fetchStream(target, hops, req, res) {
  let u; try { u = new URL(target); } catch (e) { return fail(res, 400, 'Dirección inválida'); }
  if (!/^https?:$/.test(u.protocol)) return fail(res, 400, 'Solo http o https');
  if (HOSTS.length && !HOSTS.includes(u.hostname)) return fail(res, 403, 'Host no permitido');
  if (!PRIVATE_OK) {
    try { const addrs = await dns.lookup(u.hostname, { all: true }); if (addrs.some(a => isPrivate(a.address))) return fail(res, 403, 'Destino no permitido'); }
    catch (e) { return fail(res, 502, 'No se pudo resolver el host'); }
  }
  const up = (u.protocol === 'https:' ? https : http).get(u, { headers: { 'User-Agent': 'RADIA-puente/1.0', 'Icy-MetaData': '0' }, timeout: 12000 }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume(); if (hops >= 5) return fail(res, 502, 'Demasiadas redirecciones');
      return fetchStream(new URL(r.headers.location, u).href, hops + 1, req, res);
    }
    const type = r.headers['content-type'] || '';
    if (r.statusCode !== 200 || !/^audio\/|ogg|mpegurl|aac/i.test(type)) { r.destroy(); return fail(res, 502, 'El destino no es un stream de audio'); }
    active++; let done = false; const end = () => { if (!done) { done = true; active--; up.destroy(); } };
    res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': ORIGIN, 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    r.pipe(res); req.on('close', end); r.on('close', end); r.on('error', end);
  });
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', () => { if (!res.headersSent) fail(res, 502, 'La radio no respondió'); });
}
function fail(res, code, msg) { if (res.headersSent) return; res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': ORIGIN }); res.end(msg); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return fail(res, 200, 'ok ' + active + '/' + MAX);
  if (req.method !== 'GET' || url.pathname !== '/s' || !url.searchParams.get('u')) return fail(res, 404, 'Uso: /s?u=<stream>');
  if (active >= MAX) return fail(res, 503, 'Puente ocupado');
  fetchStream(url.searchParams.get('u'), 0, req, res);
});
if (require.main === module) server.listen(PORT, () => console.log('Puente RADIA escuchando en el puerto ' + PORT));
module.exports = { server, isPrivate };

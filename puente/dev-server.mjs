/* Servidor local para pruebas: corre el Worker real sobre SQLite. Uso: node puente/dev-server.mjs [puerto] */
import http from 'node:http'; import worker from './worker.js'; import { memoryD1 } from './d1-shim.mjs';
export function start(port = 8901, env = {}) {
  const e = { DB: memoryD1(), MIN_IPS: '1', EXTRA_HOSTS: '127.0.0.1', ...env };
  const srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const ac = new AbortController(); res.on('close', () => ac.abort());
    const r = await worker.fetch(new Request('http://' + req.headers.host + req.url, { method: req.method, headers: { ...req.headers, 'CF-Connecting-IP': req.socket.remoteAddress }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), signal: ac.signal }), e);
    res.writeHead(r.status, Object.fromEntries(r.headers)); if (!r.body) return res.end();
    const rd = r.body.getReader(); try { for (;;) { const { done, value } = await rd.read(); if (done) break; if (!res.write(value)) await new Promise(k => res.once('drain', k)); } } catch (x) { /* cortado */ } res.end();
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({ srv, env: e, close: () => { srv.closeAllConnections(); srv.close(); } })));
}
if (import.meta.url === 'file://' + process.argv[1]) start(+process.argv[2] || 8901).then(() => console.log('RADIA dev-server en :' + (process.argv[2] || 8901)));

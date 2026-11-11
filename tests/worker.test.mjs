import test from 'node:test'; import assert from 'node:assert'; import http from 'node:http';
import worker from '../puente/worker.js';
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s.address().port)));
test('puente Cloudflare: reenvía audio con permiso, rechaza hosts ajenos y lo que no es audio', async () => {
  const radio = http.createServer((req, res) => {
    if (req.url === '/page') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>'); }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); const t = setInterval(() => res.write(Buffer.alloc(1000, 1)), 10); req.on('close', () => clearInterval(t));
  });
  const port = await listen(radio), env = { EXTRA_HOSTS: '127.0.0.1' };
  const call = (path, e = env) => worker.fetch(new Request('https://puente.test' + path), e);
  const ok = await call('/s?u=' + encodeURIComponent('http://127.0.0.1:' + port + '/live'));
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.headers.get('access-control-allow-origin'), '*'); assert.strictEqual(ok.headers.get('content-type'), 'audio/mpeg');
  const rd = ok.body.getReader(); let n = 0; while (n < 3000) n += (await rd.read()).value.length; await rd.cancel();
  assert.strictEqual((await call('/s?u=' + encodeURIComponent('http://127.0.0.1:' + port + '/page'))).status, 502);
  assert.strictEqual((await call('/s?u=' + encodeURIComponent('http://127.0.0.1:' + port + '/live'), {})).status, 403, 'host fuera de la lista');
  assert.strictEqual((await call('/s?u=' + encodeURIComponent('https://evil.example/x'))).status, 403);
  assert.strictEqual((await call('/s?u=nada')).status, 400);
  assert.strictEqual((await call('/health')).status, 200);
  radio.closeAllConnections(); radio.close();
});
test('puente Cloudflare: la lista de hosts cubre todas las radios del catálogo', async () => {
  const { createRequire } = await import('node:module'); const C = createRequire(import.meta.url)('../src/stations.js');
  const { HOSTS } = await import('../puente/worker.js');
  for (const s of C) for (const u of s.urls) assert.ok(HOSTS.includes(new URL(u).hostname), s.name + ' ' + u);
});

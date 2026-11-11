const test = require('node:test'), assert = require('node:assert'), http = require('http');
process.env.ALLOW_PRIVATE = '1';
const { server, isPrivate } = require('../proxy/server.js');
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const get = (port, path) => new Promise((res, rej) => http.get({ port, path, host: '127.0.0.1' }, r => {
  let n = 0; r.on('data', d => { n += d.length; if (n >= 3000) r.destroy(); }); r.on('close', () => res({ status: r.statusCode, headers: r.headers, bytes: n })); }).on('error', rej));

test('puente: reenvía audio con permiso CORS, sigue redirecciones y rechaza lo que no es audio', async () => {
  const radio = http.createServer((req, res) => {
    if (req.url === '/redir') { res.writeHead(302, { Location: '/live' }); return res.end(); }
    if (req.url === '/page') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>'); }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); const t = setInterval(() => res.write(Buffer.alloc(1000, 1)), 10); req.on('close', () => clearInterval(t));
  });
  const rp = await listen(radio), pp = await listen(server), u = p => '/s?u=' + encodeURIComponent('http://127.0.0.1:' + rp + p);
  const a = await get(pp, u('/live'));
  assert.strictEqual(a.status, 200); assert.strictEqual(a.headers['access-control-allow-origin'], '*'); assert.strictEqual(a.headers['content-type'], 'audio/mpeg'); assert.ok(a.bytes >= 3000);
  assert.strictEqual((await get(pp, u('/redir'))).status, 200);
  assert.strictEqual((await get(pp, u('/page'))).status, 502);
  assert.strictEqual((await get(pp, '/s?u=' + encodeURIComponent('file:///etc/passwd'))).status, 400);
  assert.strictEqual((await get(pp, '/health')).status, 200);
  radio.closeAllConnections(); radio.close(); server.closeAllConnections(); server.close();
});
test('puente: reconoce direcciones privadas', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1']) assert.ok(isPrivate(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '200.40.1.1']) assert.ok(!isPrivate(ip), ip);
});

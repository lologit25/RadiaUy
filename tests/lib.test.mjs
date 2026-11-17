import test from 'node:test'; import assert from 'node:assert';
import worker from '../puente/worker.js'; import { memoryD1 } from '../puente/d1-shim.mjs';
const ST = 'uy-abcd1234', dev = n => String(n).padStart(32, '0').replace(/0/g, 'a').slice(0, 31) + (n % 16).toString(16);
const devs = n => ('d' + n).padEnd(32, 'e');
const fp = (seed, n = 400) => { const u = new Uint32Array(n); let x = seed * 2654435761 >>> 0 || 1; for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; u[i] = x; } return Buffer.from(u.buffer).toString('base64'); };
const mk = (extra = {}) => { const env = { DB: memoryD1(), SALT: 's', ...extra }; let ip = '1.1.1.1';
  const call = (path, init = {}, h = {}) => worker.fetch(new Request('https://w.test' + path, { ...init, headers: { 'CF-Connecting-IP': ip, ...h } }), env);
  const post = (path, o, i) => { if (i) ip = i; return call(path, { method: 'POST', body: JSON.stringify(o) }); };
  return { env, call, post, setIp: i => { ip = i; } }; };

test('lib: sin base de datos enlazada responde 503; /health indica el estado', async () => {
  const r = await worker.fetch(new Request('https://w.test/lib?station=' + ST), {}); assert.strictEqual(r.status, 503);
  assert.match(await (await worker.fetch(new Request('https://w.test/health'), { DB: memoryD1() })).text(), /db/);
});
test('lib: CORS y preflight', async () => {
  const w = mk(); const r = await w.call('/vote', { method: 'OPTIONS' }); assert.strictEqual(r.status, 204);
  assert.strictEqual(r.headers.get('access-control-allow-origin'), '*'); assert.match(r.headers.get('access-control-allow-methods'), /POST/);
});
test('lib: una huella solo es confiable con 3 dispositivos y 2 redes distintas', async () => {
  const w = mk(); const f = fp(1);
  let r = await (await w.post('/vote', { station: ST, dev: devs(1), add: [{ fps: f }] }, '1.1.1.1')).json(); assert.strictEqual(r.ids.length, 1); const id = r.ids[0];
  assert.match(id, /^[0-9a-f]{24}$/);
  let lib = await (await w.call('/lib?station=' + ST)).json(); assert.strictEqual(lib.trusted.length, 0);
  let c = await (await w.call('/cand?station=' + ST)).json(); assert.strictEqual(c.cands.length, 1); assert.strictEqual(c.cands[0].v, 1);
  await w.post('/vote', { station: ST, dev: devs(1), confirm: [id] }, '1.1.1.1'); // mismo dispositivo: no suma
  await w.post('/vote', { station: ST, dev: devs(2), confirm: [id] }, '1.1.1.1');
  await w.post('/vote', { station: ST, dev: devs(3), confirm: [id] }, '1.1.1.1'); // 3 dispositivos pero una sola red
  lib = await (await w.call('/lib?station=' + ST)).json(); assert.strictEqual(lib.trusted.length, 0, 'una sola red no alcanza');
  await w.post('/vote', { station: ST, dev: devs(4), confirm: [id] }, '2.2.2.2');
  lib = await (await w.call('/lib?station=' + ST)).json(); assert.strictEqual(lib.trusted.length, 1); assert.strictEqual(lib.trusted[0].id, id); assert.strictEqual(lib.trusted[0].fps, f);
  assert.match((await w.call('/lib?station=' + ST)).headers.get('cache-control'), /max-age/);
  const other = await (await w.call('/lib?station=uy-otra0001')).json(); assert.strictEqual(other.trusted.length, 0, 'por emisora');
});
test('lib: el mismo dispositivo repitiendo no confirma nada', async () => {
  const w = mk({ MIN_IPS: '1' }); const f = fp(2);
  for (let i = 0; i < 5; i++) await w.post('/vote', { station: ST, dev: devs(1), add: [{ fps: f }] });
  assert.strictEqual((await (await w.call('/lib?station=' + ST)).json()).trusted.length, 0);
});
test('lib: rechaza huellas inválidas (corta, larga, vacía, constante, no base64)', async () => {
  const w = mk(); const bad = [fp(3, 50), fp(3, 2500), 'AAAA'.repeat(200), '!!!', 'x', Buffer.alloc(1600, 255).toString('base64'), Buffer.alloc(1600, 0).toString('base64')];
  for (const f of bad) assert.strictEqual((await w.post('/vote', { station: ST, dev: devs(1), add: [{ fps: f }] })).status, 400, f.slice(0, 10));
  assert.strictEqual((await w.post('/vote', { station: 'c-123', dev: devs(1), add: [{ fps: fp(4) }] })).status, 400, 'emisora propia no se comparte');
  assert.strictEqual((await w.post('/vote', { station: ST, dev: 'corto', add: [{ fps: fp(4) }] })).status, 400);
  assert.strictEqual((await w.post('/vote', { station: ST, dev: devs(1), confirm: ['zz'] })).status, 400);
  assert.strictEqual((await w.call('/vote', { method: 'POST', body: 'no es json' })).status, 400);
  assert.strictEqual((await w.call('/lib?station=%27%3B')).status, 400);
});
test('lib: reportes bloquean un aviso confiable y no vuelve a entrar', async () => {
  const w = mk({ MIN_DEVICES: '3', MIN_IPS: '1' }); const f = fp(5);
  const id = (await (await w.post('/vote', { station: ST, dev: devs(1), add: [{ fps: f }] })).json()).ids[0];
  for (const n of [2, 3]) await w.post('/vote', { station: ST, dev: devs(n), confirm: [id] });
  assert.strictEqual((await (await w.call('/lib?station=' + ST)).json()).trusted.length, 1);
  let r = await (await w.post('/report', { station: ST, dev: devs(1), id })).json(); assert.strictEqual(r.blocked, false);
  await w.post('/report', { station: ST, dev: devs(1), id }); // repetido: no cuenta
  r = await (await w.post('/report', { station: ST, dev: devs(2), id })).json(); assert.strictEqual(r.blocked, false);
  r = await (await w.post('/report', { station: ST, dev: devs(3), id })).json(); assert.strictEqual(r.blocked, true);
  const lib = await (await w.call('/lib?station=' + ST)).json(); assert.strictEqual(lib.trusted.length, 0); assert.deepStrictEqual(lib.blocked, [id]);
  await w.post('/vote', { station: ST, dev: devs(9), add: [{ fps: f }] });
  assert.strictEqual((await (await w.call('/lib?station=' + ST)).json()).trusted.length, 0, 'bloqueado sigue bloqueado');
  assert.strictEqual((await w.post('/report', { station: ST, dev: devs(4), id: 'a'.repeat(24) })).status, 404);
});
test('lib: límite por hora y por red', async () => {
  const w = mk({ RATE: '5' }); let last;
  for (let i = 0; i < 7; i++) last = (await w.post('/vote', { station: ST, dev: devs(1), confirm: [] }, '9.9.9.9')).status;
  assert.strictEqual(last, 429);
  assert.strictEqual((await w.post('/vote', { station: ST, dev: devs(1), confirm: [] }, '8.8.8.8')).status, 200, 'otra red sigue pudiendo');
});
test('lib: confirmar un id inexistente o de otra emisora no cuenta', async () => {
  const w = mk({ MIN_IPS: '1' }); const id = (await (await w.post('/vote', { station: ST, dev: devs(1), add: [{ fps: fp(6) }] })).json()).ids[0];
  const r = await (await w.post('/vote', { station: 'uy-otra0001', dev: devs(2), confirm: [id, 'b'.repeat(24)] })).json(); assert.strictEqual(r.confirmed, 0);
});

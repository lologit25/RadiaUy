/* Imita la API de Cloudflare D1 sobre node:sqlite, para probar el Worker sin Cloudflare. Solo para pruebas y desarrollo. */
import { DatabaseSync } from 'node:sqlite';
export function memoryD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  const stmt = (sql, args = []) => ({
    sql, args,
    bind(...a) { return stmt(sql, a); },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    async first(col) { const r = db.prepare(sql).get(...args); if (!r) return null; return col ? r[col] : { ...r }; },
    async all() { return { success: true, results: db.prepare(sql).all(...args).map(r => ({ ...r })) }; }
  });
  return {
    prepare: sql => stmt(sql),
    async exec(sql) { db.exec(sql); return { count: 1 }; },
    async batch(list) { db.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    close() { db.close(); }
  };
}

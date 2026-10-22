/**
 * =============================================================================
 * LOCAL CLOUDFLARE D1 ADAPTER (Node 22+ built-in `node:sqlite`)
 * =============================================================================
 * WHY THIS EXISTS:
 *   Cloudflare Workers provides `env.DB` (Cloudflare D1 SQLite) in production.
 *   For local development (`node server.js`) and automated tests (`npm test`)
 *   with zero external packages or plain-text mocks, this adapter wraps Node 22's
 *   built-in `node:sqlite` (`DatabaseSync`) with the exact `D1Database` API:
 *     - db.prepare(sql).bind(...values).first(colName?)
 *     - db.prepare(sql).bind(...values).all()   -> { success: true, results, meta }
 *     - db.prepare(sql).bind(...values).run()   -> { success: true, results, meta }
 *     - db.prepare(sql).bind(...values).raw()
 *     - db.batch(statements)                    -> atomic SQLite transaction!
 *     - db.exec(sql)
 *
 *   Result: Local preview and tests enforce genuine SQLite constraints, Foreign Keys,
 *   ON DELETE CASCADE, UNIQUE indexes, and binary BLOB columns!
 * =============================================================================
 */

import { DatabaseSync } from 'node:sqlite';

function normalizeParam(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function normalizeRow(row) {
  if (!row) return null;
  // Convert null-prototype objects from node:sqlite into normal plain objects
  const plain = { ...row };
  for (const [k, v] of Object.entries(plain)) {
    if (v instanceof Uint8Array && !Buffer.isBuffer(v)) {
      plain[k] = new Uint8Array(v);
    }
  }
  return plain;
}

class LocalD1PreparedStatement {
  #sqlite;
  #sql;
  #params;

  constructor(sqlite, sql, params = []) {
    this.#sqlite = sqlite;
    this.#sql = sql;
    this.#params = params;
  }

  bind(...values) {
    return new LocalD1PreparedStatement(
      this.#sqlite,
      this.#sql,
      values.map(normalizeParam),
    );
  }

  #runSync() {
    const stmt = this.#sqlite.prepare(this.#sql);
    const trimmed = this.#sql.trim();
    const returnsRows = /^(SELECT|WITH|PRAGMA)\b/i.test(trimmed) || /\bRETURNING\b/i.test(trimmed);

    if (returnsRows) {
      const rows = stmt.all(...this.#params).map(normalizeRow);
      return {
        success: true,
        results: rows,
        meta: {
          changes: rows.length,
          last_row_id: 0,
          duration: 0,
          rows_read: rows.length,
          rows_written: /\b(INSERT|UPDATE|DELETE)\b/i.test(trimmed) ? rows.length : 0,
        },
      };
    }

    const info = stmt.run(...this.#params);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(info.changes || 0),
        last_row_id: Number(info.lastInsertRowid || 0),
        duration: 0,
        rows_read: 0,
        rows_written: Number(info.changes || 0),
      },
    };
  }

  async first(colName) {
    const out = this.#runSync();
    const row = out.results[0] ?? null;
    if (!row) return null;
    return colName !== undefined ? (row[colName] ?? null) : row;
  }

  async all() {
    return this.#runSync();
  }

  async run() {
    return this.#runSync();
  }

  async raw() {
    const out = this.#runSync();
    return out.results.map((r) => Object.values(r));
  }

  _executeSync() {
    return this.#runSync();
  }
}

export class LocalD1Database {
  #sqlite;

  constructor(filename = ':memory:') {
    this.#sqlite = new DatabaseSync(filename);
    this.#sqlite.exec('PRAGMA foreign_keys = ON;');
    this.#sqlite.exec('PRAGMA busy_timeout = 5000;');
    if (filename !== ':memory:') {
      this.#sqlite.exec('PRAGMA journal_mode = WAL;');
    }
  }

  prepare(sql) {
    return new LocalD1PreparedStatement(this.#sqlite, sql);
  }

  async batch(statements) {
    this.#sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const results = statements.map((stmt) => stmt._executeSync());
      this.#sqlite.exec('COMMIT;');
      return results;
    } catch (err) {
      try {
        this.#sqlite.exec('ROLLBACK;');
      } catch {
        // ignore rollback error if transaction already aborted
      }
      throw err;
    }
  }

  async exec(sql) {
    this.#sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  close() {
    this.#sqlite.close();
  }
}

export function createLocalD1(filename = ':memory:') {
  return new LocalD1Database(filename);
}

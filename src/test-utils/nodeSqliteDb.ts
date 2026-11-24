/**
 * Adaptador de TESTE: implementa o subconjunto da API do expo-sqlite usado
 * pelo app sobre o SQLite embutido do Node.js (node:sqlite). Assim os testes
 * executam o SQL REAL do banco local (migrações, outbox, coalescência) fora do
 * aparelho. Nunca é importado pelo aplicativo.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { LocalDb } from '@/data/local/database';

type Params = unknown[] | [Record<string, unknown>];

function normalize(params: Params): SQLInputValue[] | [Record<string, SQLInputValue>] {
  if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    const obj = params[0] as Record<string, unknown>;
    const out: Record<string, SQLInputValue> = {};
    for (const [k, v] of Object.entries(obj)) out[k.replace(/^[$:@]/, '')] = (v === undefined ? null : v) as SQLInputValue;
    return [out];
  }
  const flat = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
  return flat.map((v) => (v === undefined ? null : v)) as SQLInputValue[];
}

export function createNodeSqliteDb(): LocalDb & { close(): void } {
  const db = new DatabaseSync(':memory:');
  const run = (sql: string, params: Params) => {
    const stmt = db.prepare(sql);
    const r = stmt.run(...(normalize(params) as SQLInputValue[]));
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  };
  const all = (sql: string, params: Params) => db.prepare(sql).all(...(normalize(params) as SQLInputValue[]));

  const api = {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, ...params: Params) {
      return run(sql, params);
    },
    async getFirstAsync<T>(sql: string, ...params: Params) {
      return ((all(sql, params)[0] as T | undefined) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, ...params: Params) {
      return all(sql, params) as T[];
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async prepareAsync(sql: string) {
      const stmt = db.prepare(sql);
      return {
        async executeAsync(...params: Params) {
          stmt.run(...(normalize(params) as SQLInputValue[]));
          return { getAllAsync: async () => [], getFirstAsync: async () => null };
        },
        async finalizeAsync() {
          /* nada a liberar no node:sqlite */
        },
      };
    },
    close() {
      db.close();
    },
  };
  return api as unknown as LocalDb & { close(): void };
}

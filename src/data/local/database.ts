/**
 * Banco local (SQLite) — base do funcionamento offline-first.
 *
 * Todas as operações são assíncronas (expo-sqlite executa as consultas em uma
 * thread nativa), evitando bloquear a thread de JavaScript/UI.
 */
import * as SQLite from 'expo-sqlite';

export type LocalDb = SQLite.SQLiteDatabase;

const DB_NAME = 'eduvinculo.db';
const SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      grade TEXT,
      shift TEXT NOT NULL,
      school_year INTEGER NOT NULL,
      student_count INTEGER,
      owner_key TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS classrooms_owner_idx ON classrooms (owner_key, name);

    CREATE TABLE IF NOT EXISTS roster (
      classroom_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      registration_code TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (classroom_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS roster_position_idx ON roster (classroom_id, position);

    CREATE TABLE IF NOT EXISTS roster_meta (
      classroom_id TEXT PRIMARY KEY NOT NULL,
      fetched_at INTEGER NOT NULL,
      last_opened_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT NOT NULL,
      classroom_id TEXT NOT NULL,
      lesson_date TEXT NOT NULL,
      lesson_slot INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      server_version INTEGER NOT NULL DEFAULT 0,
      sync_state TEXT NOT NULL,
      sync_error TEXT,
      conflict_id TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (classroom_id, lesson_date, lesson_slot)
    );
    CREATE INDEX IF NOT EXISTS sessions_classroom_date_idx ON sessions (classroom_id, lesson_date DESC);
    CREATE INDEX IF NOT EXISTS sessions_sync_idx ON sessions (sync_state);

    CREATE TABLE IF NOT EXISTS records (
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      PRIMARY KEY (session_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS records_student_idx ON records (student_id);

    -- Fila de operações pendentes (outbox). op_id = chave de idempotência no servidor.
    CREATE TABLE IF NOT EXISTS outbox (
      op_id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      base_version INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outbox_ready_idx ON outbox (state, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS outbox_entity_idx ON outbox (entity_id);

    -- Cache genérico de respostas (dashboards, notificações) com data de validade.
    CREATE TABLE IF NOT EXISTS query_cache (
      key TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS perf_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS perf_metrics_name_idx ON perf_metrics (name, created_at DESC);
  `,
};

let dbPromise: Promise<LocalDb> | null = null;

export async function migrate(db: LocalDb): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < SCHEMA_VERSION) {
    const next = version + 1;
    const sql = MIGRATIONS[next];
    if (!sql) throw new Error(`Migração local ${next} ausente`);
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

/** Abre (uma única vez) e migra o banco local. */
export function getLocalDb(): Promise<LocalDb> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(db);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Remove todos os dados locais (logout / troca de usuário) — LGPD. */
export async function wipeLocalData(): Promise<void> {
  const db = await getLocalDb();
  await db.execAsync(`
    DELETE FROM classrooms; DELETE FROM roster; DELETE FROM roster_meta; DELETE FROM sessions;
    DELETE FROM records; DELETE FROM outbox; DELETE FROM query_cache; DELETE FROM sync_state;
  `);
}

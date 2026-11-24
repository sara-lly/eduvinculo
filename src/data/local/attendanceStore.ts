/**
 * Persistência local de turmas, listas de estudantes, chamadas e fila de
 * sincronização. A interface permite testar o motor de sincronização com uma
 * implementação em memória.
 */
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  Classroom,
  LocalSyncState,
  RosterStudent,
  SessionStatus,
} from '@/domain/types';
import { getLocalDb, type LocalDb } from './database';

export interface OutboxOp {
  opId: string;
  kind: 'attendance_session';
  entityId: string; // id local da sessão
  payload: SessionPayload;
  baseVersion: number;
  state: 'pending' | 'inflight' | 'failed';
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
}

export interface SessionPayload {
  session: { id: string; classroomId: string; lessonDate: string; lessonSlot: number; status: SessionStatus };
  records: AttendanceRecord[];
}

export interface SessionWithRecords {
  session: AttendanceSession;
  records: Map<string, AttendanceStatus>;
  notes: Map<string, string>;
}

export interface ServerSessionSnapshot {
  id: string;
  schoolId: string;
  classroomId: string;
  lessonDate: string;
  lessonSlot: number;
  status: SessionStatus;
  version: number;
  updatedAt: string;
  records: AttendanceRecord[];
}

export interface AttendanceStore {
  // Turmas e listas
  saveClassrooms(ownerKey: string, classrooms: Classroom[]): Promise<void>;
  listClassrooms(ownerKey: string): Promise<Classroom[]>;
  getRoster(classroomId: string): Promise<RosterStudent[]>;
  replaceRoster(classroomId: string, students: RosterStudent[]): Promise<void>;
  rosterFetchedAt(classroomId: string): Promise<number | null>;
  // Chamadas
  getSession(classroomId: string, lessonDate: string, lessonSlot: number): Promise<SessionWithRecords | null>;
  getSessionById(id: string): Promise<SessionWithRecords | null>;
  listSessions(classroomId: string, limit: number): Promise<(AttendanceSession & { absentCount: number; recordCount: number })[]>;
  /** Registros de chamadas CONCLUÍDAS da turma desde a data (para cálculo offline de alertas). */
  completedRecords(classroomId: string, since: string): Promise<{ studentId: string; lessonDate: string; lessonSlot: number; status: AttendanceStatus }[]>;
  /** Grava a chamada localmente E enfileira a operação de sincronização, de forma atômica. */
  saveSessionAndEnqueue(session: AttendanceSession, records: AttendanceRecord[], newOpId: string): Promise<void>;
  mergeServerSessions(snapshots: ServerSessionSnapshot[]): Promise<number>;
  markSessionSynced(localId: string, serverId: string, version: number, status: SessionStatus): Promise<void>;
  markSessionState(localId: string, state: LocalSyncState, error?: string | null, conflictId?: string | null): Promise<void>;
  // Outbox
  readyOps(now: number, limit: number): Promise<OutboxOp[]>;
  markOp(opId: string, patch: Partial<Pick<OutboxOp, 'state' | 'attempts' | 'nextAttemptAt' | 'lastError'>>): Promise<void>;
  deleteOp(opId: string): Promise<void>;
  resetInflight(): Promise<void>;
  listOps(): Promise<OutboxOp[]>;
  pendingCount(): Promise<number>;
  // Estado de sincronização
  getSyncValue(key: string): Promise<string | null>;
  setSyncValue(key: string, value: string): Promise<void>;
  // Manutenção do cache
  pruneCache(now: number, historyDays: number, unusedRosterDays: number): Promise<void>;
}

interface SessionRow {
  id: string;
  school_id: string;
  classroom_id: string;
  lesson_date: string;
  lesson_slot: number;
  status: SessionStatus;
  server_version: number;
  sync_state: LocalSyncState;
  sync_error: string | null;
  updated_at: string;
}

function rowToSession(r: SessionRow): AttendanceSession {
  return {
    id: r.id,
    schoolId: r.school_id,
    classroomId: r.classroom_id,
    lessonDate: r.lesson_date,
    lessonSlot: r.lesson_slot,
    status: r.status,
    serverVersion: r.server_version,
    syncState: r.sync_state,
    syncError: r.sync_error,
    updatedAt: r.updated_at,
  };
}

interface OutboxRow {
  op_id: string;
  kind: 'attendance_session';
  entity_id: string;
  payload: string;
  base_version: number;
  state: OutboxOp['state'];
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
}

function rowToOp(r: OutboxRow): OutboxOp {
  return {
    opId: r.op_id,
    kind: r.kind,
    entityId: r.entity_id,
    payload: JSON.parse(r.payload) as SessionPayload,
    baseVersion: r.base_version,
    state: r.state,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

export class SqliteAttendanceStore implements AttendanceStore {
  constructor(private readonly dbProvider: () => Promise<LocalDb> = getLocalDb) {}

  private db() {
    return this.dbProvider();
  }

  async saveClassrooms(ownerKey: string, classrooms: Classroom[]): Promise<void> {
    const db = await this.db();
    const now = Date.now();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM classrooms WHERE owner_key = ?', ownerKey);
      const stmt = await db.prepareAsync(
        `INSERT OR REPLACE INTO classrooms (id, school_id, name, grade, shift, school_year, student_count, owner_key, cached_at)
         VALUES ($id, $school, $name, $grade, $shift, $year, $count, $owner, $now)`,
      );
      try {
        for (const c of classrooms) {
          await stmt.executeAsync({
            $id: c.id, $school: c.schoolId, $name: c.name, $grade: c.grade, $shift: c.shift,
            $year: c.schoolYear, $count: c.studentCount ?? null, $owner: ownerKey, $now: now,
          });
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });
  }

  async listClassrooms(ownerKey: string): Promise<Classroom[]> {
    const db = await this.db();
    const rows = await db.getAllAsync<{
      id: string; school_id: string; name: string; grade: string | null; shift: Classroom['shift'];
      school_year: number; student_count: number | null;
    }>('SELECT * FROM classrooms WHERE owner_key = ? ORDER BY name', ownerKey);
    return rows.map((r) => ({
      id: r.id, schoolId: r.school_id, name: r.name, grade: r.grade, shift: r.shift,
      schoolYear: r.school_year, active: true, studentCount: r.student_count ?? undefined,
    }));
  }

  async getRoster(classroomId: string): Promise<RosterStudent[]> {
    const db = await this.db();
    await db.runAsync(
      'UPDATE roster_meta SET last_opened_at = ? WHERE classroom_id = ?', Date.now(), classroomId);
    const rows = await db.getAllAsync<{ student_id: string; full_name: string; registration_code: string }>(
      'SELECT student_id, full_name, registration_code FROM roster WHERE classroom_id = ? ORDER BY position',
      classroomId,
    );
    return rows.map((r) => ({ studentId: r.student_id, fullName: r.full_name, registrationCode: r.registration_code }));
  }

  async replaceRoster(classroomId: string, students: RosterStudent[]): Promise<void> {
    const db = await this.db();
    const now = Date.now();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM roster WHERE classroom_id = ?', classroomId);
      // Prepared statement reutilizado: muito mais rápido que N INSERTs avulsos (turmas de 500).
      const stmt = await db.prepareAsync(
        'INSERT INTO roster (classroom_id, student_id, full_name, registration_code, position) VALUES ($c, $s, $n, $r, $p)',
      );
      try {
        for (let i = 0; i < students.length; i++) {
          const s = students[i]!;
          await stmt.executeAsync({ $c: classroomId, $s: s.studentId, $n: s.fullName, $r: s.registrationCode, $p: i });
        }
      } finally {
        await stmt.finalizeAsync();
      }
      await db.runAsync(
        `INSERT INTO roster_meta (classroom_id, fetched_at, last_opened_at) VALUES (?, ?, ?)
         ON CONFLICT(classroom_id) DO UPDATE SET fetched_at = excluded.fetched_at`,
        classroomId, now, now,
      );
    });
  }

  async rosterFetchedAt(classroomId: string): Promise<number | null> {
    const db = await this.db();
    const row = await db.getFirstAsync<{ fetched_at: number }>(
      'SELECT fetched_at FROM roster_meta WHERE classroom_id = ?', classroomId);
    return row?.fetched_at ?? null;
  }

  private async loadRecords(db: LocalDb, sessionId: string) {
    const rows = await db.getAllAsync<{ student_id: string; status: AttendanceStatus; note: string | null }>(
      'SELECT student_id, status, note FROM records WHERE session_id = ?', sessionId);
    const records = new Map<string, AttendanceStatus>();
    const notes = new Map<string, string>();
    for (const r of rows) {
      records.set(r.student_id, r.status);
      if (r.note) notes.set(r.student_id, r.note);
    }
    return { records, notes };
  }

  async getSession(classroomId: string, lessonDate: string, lessonSlot: number): Promise<SessionWithRecords | null> {
    const db = await this.db();
    const row = await db.getFirstAsync<SessionRow>(
      'SELECT * FROM sessions WHERE classroom_id = ? AND lesson_date = ? AND lesson_slot = ?',
      classroomId, lessonDate, lessonSlot);
    if (!row) return null;
    return { session: rowToSession(row), ...(await this.loadRecords(db, row.id)) };
  }

  async getSessionById(id: string): Promise<SessionWithRecords | null> {
    const db = await this.db();
    const row = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', id);
    if (!row) return null;
    return { session: rowToSession(row), ...(await this.loadRecords(db, row.id)) };
  }

  async listSessions(classroomId: string, limit: number) {
    const db = await this.db();
    // Agregação feita pelo SQLite (thread nativa), não em JavaScript.
    const rows = await db.getAllAsync<SessionRow & { absent_count: number; record_count: number }>(
      `SELECT s.*,
              (SELECT COUNT(*) FROM records r WHERE r.session_id = s.id AND r.status = 'absent') AS absent_count,
              (SELECT COUNT(*) FROM records r WHERE r.session_id = s.id) AS record_count
         FROM sessions s
        WHERE s.classroom_id = ?
        ORDER BY s.lesson_date DESC, s.lesson_slot DESC
        LIMIT ?`,
      classroomId, limit);
    return rows.map((r) => ({ ...rowToSession(r), absentCount: r.absent_count, recordCount: r.record_count }));
  }

  async completedRecords(classroomId: string, since: string) {
    const db = await this.db();
    const rows = await db.getAllAsync<{ student_id: string; lesson_date: string; lesson_slot: number; status: AttendanceStatus }>(
      `SELECT r.student_id, s.lesson_date, s.lesson_slot, r.status
         FROM records r JOIN sessions s ON s.id = r.session_id
        WHERE s.classroom_id = ? AND s.status = 'completed' AND s.lesson_date >= ?`,
      classroomId, since);
    return rows.map((r) => ({ studentId: r.student_id, lessonDate: r.lesson_date, lessonSlot: r.lesson_slot, status: r.status }));
  }

  async saveSessionAndEnqueue(session: AttendanceSession, records: AttendanceRecord[], newOpId: string): Promise<void> {
    const db = await this.db();
    const payload: SessionPayload = {
      session: {
        id: session.id, classroomId: session.classroomId, lessonDate: session.lessonDate,
        lessonSlot: session.lessonSlot, status: session.status,
      },
      records,
    };
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO sessions (id, school_id, classroom_id, lesson_date, lesson_slot, status, server_version, sync_state, sync_error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, sync_state = 'pending', sync_error = NULL,
                                       conflict_id = NULL, updated_at = excluded.updated_at`,
        session.id, session.schoolId, session.classroomId, session.lessonDate, session.lessonSlot,
        session.status, session.serverVersion, session.updatedAt);
      await db.runAsync('DELETE FROM records WHERE session_id = ?', session.id);
      const stmt = await db.prepareAsync(
        'INSERT INTO records (session_id, student_id, status, note) VALUES ($sid, $st, $status, $note)');
      try {
        for (const r of records) {
          await stmt.executeAsync({ $sid: session.id, $st: r.studentId, $status: r.status, $note: r.note ?? null });
        }
      } finally {
        await stmt.finalizeAsync();
      }

      // Coalescência: uma operação pendente que NUNCA foi enviada pode ser
      // substituída (mesmo op_id). Se já houve tentativa, o servidor pode tê-la
      // processado — então criamos uma nova operação com novo op_id.
      const existing = await db.getFirstAsync<{ op_id: string; attempts: number; state: string }>(
        `SELECT op_id, attempts, state FROM outbox WHERE entity_id = ? AND state != 'inflight' ORDER BY created_at DESC LIMIT 1`,
        session.id);
      if (existing && existing.attempts === 0 && existing.state === 'pending') {
        await db.runAsync('UPDATE outbox SET payload = ?, base_version = ? WHERE op_id = ?',
          JSON.stringify(payload), session.serverVersion, existing.op_id);
      } else {
        if (existing) await db.runAsync(`DELETE FROM outbox WHERE op_id = ?`, existing.op_id);
        await db.runAsync(
          `INSERT INTO outbox (op_id, kind, entity_id, payload, base_version, state, attempts, next_attempt_at, created_at)
           VALUES (?, 'attendance_session', ?, ?, ?, 'pending', 0, 0, ?)`,
          newOpId, session.id, JSON.stringify(payload), session.serverVersion, Date.now());
      }
    });
  }

  async mergeServerSessions(snapshots: ServerSessionSnapshot[]): Promise<number> {
    if (snapshots.length === 0) return 0;
    const db = await this.db();
    let merged = 0;
    await db.withTransactionAsync(async () => {
      for (const s of snapshots) {
        const local = await db.getFirstAsync<{ id: string; sync_state: LocalSyncState; server_version: number }>(
          'SELECT id, sync_state, server_version FROM sessions WHERE classroom_id = ? AND lesson_date = ? AND lesson_slot = ?',
          s.classroomId, s.lessonDate, s.lessonSlot);
        // Nunca sobrescreve alterações locais ainda não sincronizadas.
        if (local && local.sync_state !== 'synced') continue;
        if (local && local.server_version >= s.version && local.id === s.id) continue;
        if (local && local.id !== s.id) {
          await db.runAsync('DELETE FROM records WHERE session_id = ?', local.id);
          await db.runAsync('DELETE FROM sessions WHERE id = ?', local.id);
        }
        await db.runAsync(
          `INSERT INTO sessions (id, school_id, classroom_id, lesson_date, lesson_slot, status, server_version, sync_state, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', ?)
           ON CONFLICT(id) DO UPDATE SET status = excluded.status, server_version = excluded.server_version,
                                         sync_state = 'synced', sync_error = NULL, updated_at = excluded.updated_at`,
          s.id, s.schoolId, s.classroomId, s.lessonDate, s.lessonSlot, s.status, s.version, s.updatedAt);
        await db.runAsync('DELETE FROM records WHERE session_id = ?', s.id);
        for (const r of s.records) {
          await db.runAsync('INSERT INTO records (session_id, student_id, status, note) VALUES (?, ?, ?, ?)',
            s.id, r.studentId, r.status, r.note ?? null);
        }
        merged++;
      }
    });
    return merged;
  }

  async markSessionSynced(localId: string, serverId: string, version: number, status: SessionStatus): Promise<void> {
    const db = await this.db();
    await db.withTransactionAsync(async () => {
      if (serverId !== localId) {
        // Outro aparelho criou a mesma chamada antes: adota o id do servidor.
        await db.runAsync('DELETE FROM records WHERE session_id = ?', serverId);
        await db.runAsync('DELETE FROM sessions WHERE id = ?', serverId);
        await db.runAsync('UPDATE records SET session_id = ? WHERE session_id = ?', serverId, localId);
        await db.runAsync('UPDATE sessions SET id = ? WHERE id = ?', serverId, localId);
        await db.runAsync('UPDATE outbox SET entity_id = ? WHERE entity_id = ?', serverId, localId);
      }
      const stillPending = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM outbox WHERE entity_id = ?`, serverId);
      await db.runAsync(
        `UPDATE sessions SET server_version = ?, status = ?, sync_state = ?, sync_error = NULL, conflict_id = NULL WHERE id = ?`,
        version, status, (stillPending?.n ?? 0) > 0 ? 'pending' : 'synced', serverId);
    });
  }

  async markSessionState(localId: string, state: LocalSyncState, error: string | null = null, conflictId: string | null = null) {
    const db = await this.db();
    await db.runAsync('UPDATE sessions SET sync_state = ?, sync_error = ?, conflict_id = ? WHERE id = ?',
      state, error, conflictId, localId);
  }

  async readyOps(now: number, limit: number): Promise<OutboxOp[]> {
    const db = await this.db();
    const rows = await db.getAllAsync<OutboxRow>(
      `SELECT * FROM outbox WHERE state = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT ?`, now, limit);
    return rows.map(rowToOp);
  }

  async markOp(opId: string, patch: Partial<Pick<OutboxOp, 'state' | 'attempts' | 'nextAttemptAt' | 'lastError'>>) {
    const db = await this.db();
    const current = await db.getFirstAsync<OutboxRow>('SELECT * FROM outbox WHERE op_id = ?', opId);
    if (!current) return;
    await db.runAsync(
      'UPDATE outbox SET state = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE op_id = ?',
      patch.state ?? current.state,
      patch.attempts ?? current.attempts,
      patch.nextAttemptAt ?? current.next_attempt_at,
      patch.lastError === undefined ? current.last_error : patch.lastError,
      opId);
  }

  async deleteOp(opId: string) {
    const db = await this.db();
    await db.runAsync('DELETE FROM outbox WHERE op_id = ?', opId);
  }

  async resetInflight() {
    const db = await this.db();
    await db.runAsync(`UPDATE outbox SET state = 'pending' WHERE state = 'inflight'`);
  }

  async listOps(): Promise<OutboxOp[]> {
    const db = await this.db();
    return (await db.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY created_at')).map(rowToOp);
  }

  async pendingCount(): Promise<number> {
    const db = await this.db();
    const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox`);
    return row?.n ?? 0;
  }

  async getSyncValue(key: string) {
    const db = await this.db();
    return (await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', key))?.value ?? null;
  }

  async setSyncValue(key: string, value: string) {
    const db = await this.db();
    await db.runAsync(
      'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }

  /**
   * Política de expiração do cache:
   *  - chamadas sincronizadas com mais de `historyDays` dias são removidas;
   *  - listas de estudantes não abertas há `unusedRosterDays` dias são removidas;
   *  - respostas em cache com mais de 7 dias são descartadas.
   * Dados pendentes de sincronização NUNCA são removidos.
   */
  async pruneCache(now: number, historyDays: number, unusedRosterDays: number) {
    const db = await this.db();
    const cutoffDate = new Date(now - historyDays * 86_400_000).toISOString().slice(0, 10);
    const rosterCutoff = now - unusedRosterDays * 86_400_000;
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `DELETE FROM records WHERE session_id IN (SELECT id FROM sessions WHERE sync_state = 'synced' AND lesson_date < ?)`,
        cutoffDate);
      await db.runAsync(`DELETE FROM sessions WHERE sync_state = 'synced' AND lesson_date < ?`, cutoffDate);
      await db.runAsync(
        `DELETE FROM roster WHERE classroom_id IN (SELECT classroom_id FROM roster_meta WHERE last_opened_at < ?)
           AND classroom_id NOT IN (SELECT classroom_id FROM sessions WHERE sync_state != 'synced')`,
        rosterCutoff);
      await db.runAsync(
        `DELETE FROM roster_meta WHERE last_opened_at < ?
           AND classroom_id NOT IN (SELECT classroom_id FROM sessions WHERE sync_state != 'synced')`,
        rosterCutoff);
      await db.runAsync('DELETE FROM query_cache WHERE cached_at < ?', now - 7 * 86_400_000);
    });
  }
}

export const attendanceStore: AttendanceStore = new SqliteAttendanceStore();

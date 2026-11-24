/**
 * Testes do motor de sincronização com o SQL REAL do banco local
 * (SqliteAttendanceStore + migrações), sobre node:sqlite.
 */
import { AppError } from '@/core/errors';
import { migrate } from '@/data/local/database';
import { SqliteAttendanceStore, type OutboxOp } from '@/data/local/attendanceStore';
import type { AttendanceSession } from '@/domain/types';
import { createNodeSqliteDb } from '@/test-utils/nodeSqliteDb';
import { backoffDelay, SyncEngine, type AttendanceRemote, type RemoteSyncResult } from './syncEngine';

jest.mock('expo-sqlite', () => ({}));

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function session(overrides: Partial<AttendanceSession> = {}): AttendanceSession {
  return {
    id: uuid(), schoolId: 'school-1', classroomId: 'class-1', lessonDate: '2026-11-24', lessonSlot: 1,
    status: 'draft', serverVersion: 0, syncState: 'pending', updatedAt: new Date().toISOString(), ...overrides,
  };
}

/** "Servidor" falso que reproduz a idempotência por op_id da RPC real. */
class FakeRemote implements AttendanceRemote {
  calls: OutboxOp[] = [];
  processed = new Map<string, RemoteSyncResult>();
  version = 0;
  failNext: (() => Error) | null = null;
  failAfterApply = false;
  conflictNext = false;
  delayMs = 0;

  async syncSession(op: OutboxOp): Promise<RemoteSyncResult> {
    this.calls.push(op);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failNext) {
      const make = this.failNext;
      this.failNext = null;
      throw make();
    }
    const prev = this.processed.get(op.opId);
    if (prev) return { ...prev, replayed: true };
    let result: RemoteSyncResult;
    if (this.conflictNext) {
      this.conflictNext = false;
      result = { status: 'conflict', sessionId: op.payload.session.id, conflictId: 'conflict-1' };
    } else {
      this.version += 1;
      result = { status: 'applied', sessionId: op.payload.session.id, version: this.version, sessionStatus: op.payload.session.status };
    }
    this.processed.set(op.opId, result);
    if (this.failAfterApply) {
      this.failAfterApply = false;
      throw new Error('Network request failed'); // resposta perdida depois de aplicar
    }
    return result;
  }
}

async function setup() {
  const db = createNodeSqliteDb();
  await migrate(db);
  const store = new SqliteAttendanceStore(async () => db);
  const remote = new FakeRemote();
  let now = 1_000_000;
  const engine = new SyncEngine(store, remote, () => now);
  return { db, store, remote, engine, advance: (ms: number) => (now += ms) };
}

describe('SyncEngine + SqliteAttendanceStore', () => {
  it('salva offline, persiste na fila e sincroniza depois', async () => {
    const { store, remote, engine } = await setup();
    const s = session();
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'absent' }], uuid());

    expect(await store.pendingCount()).toBe(1);
    expect((await store.getSessionById(s.id))?.session.syncState).toBe('pending');

    const report = await engine.syncNow();
    expect(report.applied).toBe(1);
    expect(remote.calls).toHaveLength(1);
    expect(await store.pendingCount()).toBe(0);
    const saved = await store.getSessionById(s.id);
    expect(saved?.session.syncState).toBe('synced');
    expect(saved?.session.serverVersion).toBe(1);
    expect(saved?.records.get('st-1')).toBe('absent');
  });

  it('coalesce edições antes do envio: uma única operação na fila', async () => {
    const { store, remote, engine } = await setup();
    const s = session();
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'present' }], uuid());
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'late' }], uuid());
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'absent' }], uuid());
    expect(await store.pendingCount()).toBe(1);
    await engine.syncNow();
    expect(remote.calls).toHaveLength(1);
    expect(remote.calls[0]?.payload.records[0]?.status).toBe('absent');
  });

  it('sem rede: mantém a fila, aplica backoff e reenvia ao reconectar', async () => {
    const { store, remote, engine } = await setup();
    await store.saveSessionAndEnqueue(session(), [{ studentId: 'st-1', status: 'present' }], uuid());
    remote.failNext = () => new Error('Network request failed');

    const r1 = await engine.syncNow();
    expect(r1.stoppedByNetwork).toBe(true);
    const [op] = await store.listOps();
    expect(op?.attempts).toBe(1);
    expect(op?.nextAttemptAt).toBeGreaterThan(1_000_000);

    // Antes do backoff vencer, nada é enviado.
    const r2 = await engine.syncNow();
    expect(r2.processed).toBe(0);

    // Conexão restaurada: ignora o backoff.
    const r3 = await engine.onConnectivityRestored();
    expect(r3.applied).toBe(1);
    expect(await store.pendingCount()).toBe(0);
  });

  it('é idempotente quando a resposta se perde após o servidor aplicar', async () => {
    const { store, remote, engine } = await setup();
    const s = session();
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'absent' }], uuid());
    remote.failAfterApply = true;

    await engine.syncNow(); // servidor aplicou, mas o app não recebeu a resposta
    expect(await store.pendingCount()).toBe(1);
    await engine.onConnectivityRestored(); // reenvia o MESMO op_id

    expect(remote.calls).toHaveLength(2);
    expect(remote.calls[0]?.opId).toBe(remote.calls[1]?.opId);
    expect(remote.version).toBe(1); // aplicado uma única vez
    expect((await store.getSessionById(s.id))?.session.syncState).toBe('synced');
  });

  it('nova edição após uma tentativa gera NOVA operação (não reaproveita op_id já enviado)', async () => {
    const { store, remote, engine } = await setup();
    const s = session();
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'absent' }], uuid());
    remote.failAfterApply = true;
    await engine.syncNow();
    const [first] = await store.listOps();

    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'justified' }], uuid());
    const ops = await store.listOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.opId).not.toBe(first?.opId);

    await engine.onConnectivityRestored();
    expect(remote.calls.at(-1)?.payload.records[0]?.status).toBe('justified');
  });

  it('chamadas simultâneas de syncNow compartilham a mesma execução (single-flight)', async () => {
    const { store, remote, engine } = await setup();
    await store.saveSessionAndEnqueue(session(), [{ studentId: 'st-1', status: 'present' }], uuid());
    remote.delayMs = 20;
    const [a, b, c] = await Promise.all([engine.syncNow(), engine.syncNow(), engine.syncNow()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(remote.calls).toHaveLength(1);
  });

  it('conflito: marca a chamada e não reenvia nem descarta dados locais', async () => {
    const { store, remote, engine } = await setup();
    const s = session({ serverVersion: 1 });
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'absent' }], uuid());
    remote.conflictNext = true;
    const r = await engine.syncNow();
    expect(r.conflicts).toBe(1);
    const saved = await store.getSessionById(s.id);
    expect(saved?.session.syncState).toBe('conflict');
    expect(saved?.records.get('st-1')).toBe('absent');
    expect(await store.pendingCount()).toBe(0);
  });

  it('erro definitivo (permissão) fica visível e pode ser reenviado manualmente', async () => {
    const { store, remote, engine } = await setup();
    const s = session();
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'present' }], uuid());
    remote.failNext = () => new AppError('Sem permissão para registrar esta chamada', 'forbidden', false);
    const r = await engine.syncNow();
    expect(r.failed).toBe(1);
    expect((await store.getSessionById(s.id))?.session.syncState).toBe('error');
    const [op] = await store.listOps();
    expect(op?.state).toBe('failed');

    await engine.retryOp(op!.opId);
    const r2 = await engine.syncNow();
    expect(r2.applied).toBe(1);
  });

  it('adota o id do servidor quando outro aparelho criou a mesma chamada', async () => {
    const { store, remote, engine } = await setup();
    const s = session();
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'present' }], uuid());
    remote.syncSession = async () => ({ status: 'applied', sessionId: 'server-session-id', version: 3, sessionStatus: 'completed' });
    await engine.syncNow();
    expect(await store.getSessionById(s.id)).toBeNull();
    const adopted = await store.getSessionById('server-session-id');
    expect(adopted?.session.serverVersion).toBe(3);
    expect(adopted?.records.get('st-1')).toBe('present');
  });

  it('merge do servidor nunca sobrescreve alterações locais pendentes', async () => {
    const { store } = await setup();
    const s = session();
    await store.saveSessionAndEnqueue(s, [{ studentId: 'st-1', status: 'absent' }], uuid());
    const merged = await store.mergeServerSessions([{
      id: 'other-id', schoolId: 'school-1', classroomId: s.classroomId, lessonDate: s.lessonDate, lessonSlot: 1,
      status: 'completed', version: 5, updatedAt: new Date().toISOString(), records: [{ studentId: 'st-1', status: 'present' }],
    }]);
    expect(merged).toBe(0);
    expect((await store.getSession(s.classroomId, s.lessonDate, 1))?.records.get('st-1')).toBe('absent');
  });

  it('política de cache remove histórico antigo sincronizado, mas preserva pendências', async () => {
    const { store, engine } = await setup();
    const old = session({ lessonDate: '2025-01-10' });
    await store.saveSessionAndEnqueue(old, [{ studentId: 'st-1', status: 'present' }], uuid());
    await engine.syncNow();
    const pendingOld = session({ lessonDate: '2025-01-11' });
    await store.saveSessionAndEnqueue(pendingOld, [{ studentId: 'st-1', status: 'present' }], uuid());

    await store.pruneCache(Date.parse('2026-11-24T12:00:00Z'), 60, 30);
    expect(await store.getSessionById(old.id)).toBeNull();
    expect(await store.getSessionById(pendingOld.id)).not.toBeNull();
  });

  it('lista de turma grande é gravada e lida na ordem', async () => {
    const { store } = await setup();
    const roster = Array.from({ length: 500 }, (_, i) => ({ studentId: `s${i}`, fullName: `Estudante ${i}`, registrationCode: `M${i}` }));
    await store.replaceRoster('class-500', roster);
    const loaded = await store.getRoster('class-500');
    expect(loaded).toHaveLength(500);
    expect(loaded[499]?.studentId).toBe('s499');
    expect(await store.rosterFetchedAt('class-500')).not.toBeNull();
  });
});

describe('backoffDelay', () => {
  it('cresce exponencialmente e respeita o teto de 10 minutos', () => {
    const fixed = () => 0.5; // jitter neutro
    expect(backoffDelay(1, fixed)).toBe(5_000);
    expect(backoffDelay(2, fixed)).toBe(10_000);
    expect(backoffDelay(3, fixed)).toBe(20_000);
    expect(backoffDelay(20, fixed)).toBe(600_000);
  });
});

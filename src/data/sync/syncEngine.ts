/**
 * Motor de sincronização offline-first.
 *
 *  - Processa a fila (outbox) em ordem, uma operação por vez.
 *  - Single-flight: chamadas simultâneas de syncNow() compartilham a mesma execução
 *    (evita envios duplicados quando a rede volta e o usuário toca em "sincronizar").
 *  - Idempotência: cada operação carrega um op_id; o servidor devolve o mesmo
 *    resultado em reenvios.
 *  - Falhas de rede: backoff exponencial com jitter; a fila é preservada.
 *  - Erros definitivos (permissão/validação): a chamada fica marcada com erro para
 *    revisão do usuário — nada é descartado silenciosamente.
 *  - Conflitos: a chamada fica marcada como "conflito"; o servidor guarda as duas
 *    versões para revisão.
 */
import { AppError, isNetworkError, toAppError } from '@/core/errors';
import type { AttendanceStore, OutboxOp } from '../local/attendanceStore';

export interface RemoteSyncResult {
  status: 'applied' | 'conflict';
  sessionId: string;
  version?: number;
  sessionStatus?: 'draft' | 'completed';
  conflictId?: string;
  replayed?: boolean;
}

export interface AttendanceRemote {
  syncSession(op: OutboxOp, signal?: AbortSignal): Promise<RemoteSyncResult>;
}

export interface SyncReport {
  processed: number;
  applied: number;
  conflicts: number;
  failed: number;
  stoppedByNetwork: boolean;
  remaining: number;
}

export interface SyncStatus {
  running: boolean;
  pending: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;

export function backoffDelay(attempts: number, random = Math.random): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exp * (0.8 + random() * 0.4)); // ±20% de jitter
}

export class SyncEngine {
  private running: Promise<SyncReport> | null = null;
  private listeners = new Set<(s: SyncStatus) => void>();
  private status: SyncStatus = { running: false, pending: 0, lastSyncAt: null, lastError: null };
  private abort: AbortController | null = null;

  constructor(
    private readonly store: AttendanceStore,
    private readonly remote: AttendanceRemote,
    private readonly now: () => number = Date.now,
    private readonly batchSize = 25,
  ) {}

  subscribe(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private emit(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l(this.status));
  }

  async refreshPendingCount(): Promise<number> {
    const pending = await this.store.pendingCount();
    this.emit({ pending });
    return pending;
  }

  /** Inicia (ou reaproveita) uma sincronização. */
  syncNow(): Promise<SyncReport> {
    if (this.running) return this.running;
    this.abort = new AbortController();
    this.emit({ running: true });
    this.running = this.run(this.abort.signal)
      .then(async (report) => {
        const pending = await this.store.pendingCount();
        this.emit({
          running: false,
          pending,
          lastSyncAt: report.stoppedByNetwork ? this.status.lastSyncAt : this.now(),
          lastError: report.stoppedByNetwork ? 'Sem conexão. As chamadas serão enviadas quando a internet voltar.' :
            report.failed > 0 ? 'Algumas chamadas não puderam ser sincronizadas. Verifique os detalhes.' : null,
        });
        return report;
      })
      .catch((error) => {
        this.emit({ running: false, lastError: toAppError(error).message });
        throw error;
      })
      .finally(() => {
        this.running = null;
        this.abort = null;
      });
    return this.running;
  }

  /** Cancela a sincronização em andamento (ex.: logout). */
  cancel(): void {
    this.abort?.abort();
  }

  /** A conexão voltou: ignora o tempo de espera (backoff) e sincroniza já. */
  async onConnectivityRestored(): Promise<SyncReport> {
    const ops = await this.store.listOps();
    for (const op of ops) {
      if (op.state === 'pending' && op.nextAttemptAt > 0) await this.store.markOp(op.opId, { nextAttemptAt: 0 });
    }
    return this.syncNow();
  }

  /** Reenvia uma operação que falhou definitivamente (ação "Tentar novamente"). */
  async retryOp(opId: string): Promise<void> {
    await this.store.markOp(opId, { state: 'pending', nextAttemptAt: 0, lastError: null });
    const op = (await this.store.listOps()).find((o) => o.opId === opId);
    if (op) await this.store.markSessionState(op.entityId, 'pending');
    await this.refreshPendingCount();
  }

  private async run(signal: AbortSignal): Promise<SyncReport> {
    const report: SyncReport = { processed: 0, applied: 0, conflicts: 0, failed: 0, stoppedByNetwork: false, remaining: 0 };
    await this.store.resetInflight();

    for (;;) {
      const ops = await this.store.readyOps(this.now(), this.batchSize);
      if (ops.length === 0) break;
      for (const op of ops) {
        if (signal.aborted) return report;
        const outcome = await this.process(op, signal);
        report.processed++;
        if (outcome === 'applied') report.applied++;
        else if (outcome === 'conflict') report.conflicts++;
        else if (outcome === 'failed') report.failed++;
        else if (outcome === 'network') {
          report.stoppedByNetwork = true;
          report.remaining = await this.store.pendingCount();
          return report;
        }
      }
      if (ops.length < this.batchSize) break;
    }
    report.remaining = await this.store.pendingCount();
    return report;
  }

  private async process(op: OutboxOp, signal: AbortSignal): Promise<'applied' | 'conflict' | 'failed' | 'network'> {
    await this.store.markOp(op.opId, { state: 'inflight' });
    try {
      const result = await this.remote.syncSession(op, signal);
      await this.store.deleteOp(op.opId);
      if (result.status === 'conflict') {
        await this.store.markSessionState(
          op.entityId, 'conflict',
          'Esta chamada foi alterada por outra pessoa. A coordenação ou o professor deve revisar as duas versões.',
          result.conflictId ?? null);
        return 'conflict';
      }
      await this.store.markSessionSynced(op.entityId, result.sessionId, result.version ?? op.baseVersion + 1,
        result.sessionStatus ?? op.payload.session.status);
      return 'applied';
    } catch (error) {
      const appError = error instanceof AppError ? error : toAppError(error);
      if (isNetworkError(error) || appError.kind === 'network' || appError.kind === 'auth' || signal.aborted) {
        const attempts = op.attempts + 1;
        await this.store.markOp(op.opId, {
          state: 'pending',
          attempts,
          nextAttemptAt: this.now() + backoffDelay(attempts),
          lastError: appError.message,
        });
        return 'network';
      }
      await this.store.markOp(op.opId, { state: 'failed', attempts: op.attempts + 1, lastError: appError.message });
      await this.store.markSessionState(op.entityId, 'error', appError.message);
      return 'failed';
    }
  }
}

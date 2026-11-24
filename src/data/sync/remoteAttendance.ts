import { rpc } from '../remote/supabase';
import type { OutboxOp } from '../local/attendanceStore';
import type { AttendanceRemote, RemoteSyncResult } from './syncEngine';

interface RpcSyncResult {
  status: 'applied' | 'conflict';
  session_id: string;
  version?: number;
  session_status?: 'draft' | 'completed';
  conflict_id?: string;
  replayed?: boolean;
}

/** Implementação real: chama a RPC idempotente sync_attendance_session. */
export const supabaseAttendanceRemote: AttendanceRemote = {
  async syncSession(op: OutboxOp, signal?: AbortSignal): Promise<RemoteSyncResult> {
    const { session, records } = op.payload;
    const r = await rpc<RpcSyncResult>(
      'sync_attendance_session',
      {
        p_op_id: op.opId,
        p_session: {
          id: session.id,
          classroom_id: session.classroomId,
          lesson_date: session.lessonDate,
          lesson_slot: session.lessonSlot,
          status: session.status,
        },
        p_records: records.map((x) => ({ student_id: x.studentId, status: x.status, note: x.note ?? null })),
        p_base_version: op.baseVersion,
      },
      signal,
    );
    return {
      status: r.status,
      sessionId: r.session_id,
      version: r.version,
      sessionStatus: r.session_status,
      conflictId: r.conflict_id,
      replayed: r.replayed,
    };
  },
};

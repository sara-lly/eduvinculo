/**
 * Repositório de frequência (offline-first).
 *
 * Leitura: devolve dados do SQLite local; quando há conexão, atualiza o cache
 * antes (respeitando a validade) — o servidor nunca é consultado sem
 * necessidade.
 * Escrita: grava localmente + enfileira; a sincronização acontece em seguida,
 * sem bloquear a interface.
 */
import { config } from '@/core/config';
import { addDays, todayIso } from '@/core/dates';
import { isNetworkError, toAppError } from '@/core/errors';
import { newId } from '@/core/id';
import { measureAsync, recordMetric } from '@/core/perf';
import { yieldToUI } from '@/core/scheduling';
import { detectAlerts } from '@/domain/alerts';
import type {
  ActiveContext,
  AttendanceRecord,
  AttendanceRules,
  AttendanceSession,
  AttendanceStatus,
  Classroom,
  RosterStudent,
  SessionStatus,
  StudentAlert,
} from '@/domain/types';
import { attendanceStore, type ServerSessionSnapshot } from '../local/attendanceStore';
import { rpc, supabase, unwrap } from '../remote/supabase';
import { syncEngine } from '../sync';

const ROSTER_PAGE = 200;
const SESSIONS_PAGE = 100;

type SchoolCtx = Extract<ActiveContext, { kind: 'school' }>;

interface ClassroomRow {
  id: string;
  school_id: string;
  name: string;
  grade: string | null;
  shift: Classroom['shift'];
  school_year: number;
  active: boolean;
  classroom_students?: { count: number }[];
}

function mapClassroom(r: ClassroomRow): Classroom {
  return {
    id: r.id,
    schoolId: r.school_id,
    name: r.name,
    grade: r.grade,
    shift: r.shift,
    schoolYear: r.school_year,
    active: r.active,
    studentCount: r.classroom_students?.[0]?.count,
  };
}

function ownerKey(ctx: SchoolCtx) {
  return `${ctx.membershipId}`;
}

export interface ConflictItem {
  id: string;
  sessionId: string;
  classroomName: string;
  lessonDate: string;
  submittedByName: string;
  createdAt: string;
  differences: { studentId: string; studentName: string; server: AttendanceStatus | null; submitted: AttendanceStatus }[];
}

export const attendanceRepository = {
  /** Turmas do professor (vinculadas) ou da escola (coordenação). */
  async listClassrooms(ctx: SchoolCtx, opts: { userId: string; preferCache?: boolean }): Promise<{ data: Classroom[]; offline: boolean }> {
    const key = ownerKey(ctx);
    if (opts.preferCache) {
      const cached = await attendanceStore.listClassrooms(key);
      if (cached.length) return { data: cached, offline: false };
    }
    try {
      let rows: ClassroomRow[];
      if (ctx.role === 'teacher') {
        const res = await supabase
          .from('classrooms')
          .select('id, school_id, name, grade, shift, school_year, active, classroom_students(count), classroom_teachers!inner(teacher_id)')
          .eq('school_id', ctx.schoolId)
          .eq('active', true)
          .eq('classroom_teachers.teacher_id', opts.userId)
          .eq('classroom_teachers.active', true)
          .eq('classroom_students.active', true)
          .order('name');
        rows = unwrap<ClassroomRow[]>(res);
      } else {
        const res = await supabase
          .from('classrooms')
          .select('id, school_id, name, grade, shift, school_year, active, classroom_students(count)')
          .eq('school_id', ctx.schoolId)
          .eq('active', true)
          .eq('classroom_students.active', true)
          .order('name');
        rows = unwrap<ClassroomRow[]>(res);
      }
      const data = rows.map(mapClassroom);
      await attendanceStore.saveClassrooms(key, data);
      return { data, offline: false };
    } catch (error) {
      if (isNetworkError(error)) {
        return { data: await attendanceStore.listClassrooms(key), offline: true };
      }
      throw toAppError(error);
    }
  },

  /**
   * Lista de estudantes da turma. Usa o cache local se estiver dentro da validade;
   * caso contrário baixa do servidor em páginas de 200 (turmas grandes).
   */
  async getRoster(classroomId: string, opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<{ data: RosterStudent[]; fromCache: boolean; offline: boolean }> {
    const fetchedAt = await attendanceStore.rosterFetchedAt(classroomId);
    const fresh = fetchedAt !== null && Date.now() - fetchedAt < config.rosterCacheTtlMs;
    if (fresh && !opts.force) {
      return { data: await attendanceStore.getRoster(classroomId), fromCache: true, offline: false };
    }
    try {
      const all: RosterStudent[] = [];
      for (let from = 0; ; from += ROSTER_PAGE) {
        let q = supabase
          .from('students')
          .select('id, full_name, registration_code, classroom_students!inner(classroom_id)')
          .eq('classroom_students.classroom_id', classroomId)
          .eq('classroom_students.active', true)
          .eq('active', true)
          .order('full_name')
          .order('id')
          .range(from, from + ROSTER_PAGE - 1);
        if (opts.signal) q = q.abortSignal(opts.signal);
        const page = unwrap<{ id: string; full_name: string; registration_code: string }[]>(await q);
        for (const s of page) all.push({ studentId: s.id, fullName: s.full_name, registrationCode: s.registration_code });
        if (page.length < ROSTER_PAGE) break;
      }
      await attendanceStore.replaceRoster(classroomId, all);
      return { data: all, fromCache: false, offline: false };
    } catch (error) {
      if (isNetworkError(error) && fetchedAt !== null) {
        return { data: await attendanceStore.getRoster(classroomId), fromCache: true, offline: true };
      }
      throw toAppError(error);
    }
  },

  /**
   * Sincronização incremental das chamadas da turma: baixa somente as sessões
   * alteradas desde o último cursor (updated_at), em páginas.
   */
  async refreshSessions(classroomId: string, signal?: AbortSignal): Promise<{ downloaded: number; offline: boolean }> {
    const cursorKey = `sessions_cursor:${classroomId}`;
    const since = addDays(todayIso(), -config.localHistoryDays);
    let cursor = (await attendanceStore.getSyncValue(cursorKey)) ?? '1970-01-01T00:00:00Z';
    let downloaded = 0;
    try {
      for (;;) {
        let q = supabase
          .from('attendance_sessions')
          .select('id, school_id, classroom_id, lesson_date, lesson_slot, status, version, updated_at, attendance_records(student_id, status, note)')
          .eq('classroom_id', classroomId)
          .gte('lesson_date', since)
          .gt('updated_at', cursor)
          .order('updated_at')
          .limit(SESSIONS_PAGE);
        if (signal) q = q.abortSignal(signal);
        const rows = unwrap<{
          id: string; school_id: string; classroom_id: string; lesson_date: string; lesson_slot: number;
          status: SessionStatus; version: number; updated_at: string;
          attendance_records: { student_id: string; status: AttendanceStatus; note: string | null }[];
        }[]>(await q);
        const snapshots: ServerSessionSnapshot[] = rows.map((r) => ({
          id: r.id, schoolId: r.school_id, classroomId: r.classroom_id, lessonDate: r.lesson_date,
          lessonSlot: r.lesson_slot, status: r.status, version: r.version, updatedAt: r.updated_at,
          records: r.attendance_records.map((x) => ({ studentId: x.student_id, status: x.status, note: x.note })),
        }));
        downloaded += await attendanceStore.mergeServerSessions(snapshots);
        const last = rows[rows.length - 1];
        if (last) {
          cursor = last.updated_at;
          await attendanceStore.setSyncValue(cursorKey, cursor);
        }
        if (rows.length < SESSIONS_PAGE) break;
      }
      return { downloaded, offline: false };
    } catch (error) {
      if (isNetworkError(error)) return { downloaded, offline: true };
      throw toAppError(error);
    }
  },

  getLocalSession(classroomId: string, lessonDate: string, lessonSlot = 1) {
    return attendanceStore.getSession(classroomId, lessonDate, lessonSlot);
  },

  getLocalSessionById(id: string) {
    return attendanceStore.getSessionById(id);
  },

  listLocalSessions(classroomId: string, limit = 60) {
    return attendanceStore.listSessions(classroomId, limit);
  },

  /**
   * Salva a chamada: grava localmente (instantâneo, funciona offline) e dispara
   * a sincronização em segundo plano. O tempo é registrado para o relatório de
   * desempenho.
   */
  async saveSession(input: {
    sessionId?: string;
    schoolId: string;
    classroomId: string;
    lessonDate: string;
    lessonSlot: number;
    status: SessionStatus;
    serverVersion: number;
    records: AttendanceRecord[];
  }): Promise<AttendanceSession> {
    const session: AttendanceSession = {
      id: input.sessionId ?? newId(),
      schoolId: input.schoolId,
      classroomId: input.classroomId,
      lessonDate: input.lessonDate,
      lessonSlot: input.lessonSlot,
      status: input.status,
      serverVersion: input.serverVersion,
      syncState: 'pending',
      updatedAt: new Date().toISOString(),
    };
    await measureAsync('attendance.save_local', () =>
      attendanceStore.saveSessionAndEnqueue(session, input.records, newId()), { students: input.records.length });
    void syncEngine.refreshPendingCount();
    // Sem await: a interface não espera a rede.
    void measureAsync('attendance.sync', () => syncEngine.syncNow(), { students: input.records.length }).catch(() => undefined);
    return session;
  },

  /**
   * Faltas recorrentes calculadas NO APARELHO (sem internet), com o algoritmo
   * otimizado O(n log n) de src/domain/alerts.ts sobre o histórico local.
   */
  async localAlerts(classroomId: string, rules: AttendanceRules, asOf: string): Promise<StudentAlert[]> {
    const [records, roster] = await Promise.all([
      attendanceStore.completedRecords(classroomId, addDays(asOf, -rules.periodDays + 1)),
      attendanceStore.getRoster(classroomId),
    ]);
    const names = new Map(roster.map((s) => [s.studentId, s.fullName]));
    await yieldToUI(); // cede a vez à interface antes do processamento
    const t0 = performance.now();
    const result = detectAlerts(records.filter((r) => names.has(r.studentId)), rules, asOf, { onlyFlagged: true });
    recordMetric('alerts.local_compute', performance.now() - t0, 'ms', { records: records.length, students: roster.length });
    return result.map((a) => ({
      ...a,
      studentName: names.get(a.studentId) ?? 'Estudante',
      classroomId,
      classroomName: '',
    }));
  },

  async listConflicts(schoolId: string): Promise<ConflictItem[]> {
    const res = await supabase
      .from('attendance_conflicts')
      .select('id, session_id, created_at, submitted_payload, server_snapshot, submitted_by, attendance_sessions(lesson_date, classroom_id, classrooms(name)), profiles:submitted_by(full_name)')
      .eq('school_id', schoolId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = unwrap<{
      id: string; session_id: string; created_at: string;
      submitted_payload: { records: { student_id: string; status: AttendanceStatus }[] };
      server_snapshot: { records: { student_id: string; status: AttendanceStatus }[] };
      attendance_sessions: { lesson_date: string; classrooms: { name: string } | null } | null;
      profiles: { full_name: string } | null;
    }[]>(res);

    const studentIds = new Set<string>();
    const items = rows.map((r) => {
      const server = new Map(r.server_snapshot.records.map((x) => [x.student_id, x.status]));
      const differences = r.submitted_payload.records
        .filter((x) => server.get(x.student_id) !== x.status)
        .map((x) => {
          studentIds.add(x.student_id);
          return { studentId: x.student_id, studentName: '', server: server.get(x.student_id) ?? null, submitted: x.status };
        });
      return {
        id: r.id,
        sessionId: r.session_id,
        classroomName: r.attendance_sessions?.classrooms?.name ?? 'Turma',
        lessonDate: r.attendance_sessions?.lesson_date ?? '',
        submittedByName: r.profiles?.full_name ?? 'Usuário',
        createdAt: r.created_at,
        differences,
      };
    });
    if (studentIds.size) {
      const names = unwrap<{ id: string; full_name: string }[]>(
        await supabase.from('students').select('id, full_name').in('id', Array.from(studentIds)));
      const byId = new Map(names.map((n) => [n.id, n.full_name]));
      for (const item of items) for (const d of item.differences) d.studentName = byId.get(d.studentId) ?? 'Estudante';
    }
    return items;
  },

  async resolveConflict(conflictId: string, accept: boolean): Promise<void> {
    await rpc('resolve_attendance_conflict', { p_conflict: conflictId, p_accept: accept });
  },
};

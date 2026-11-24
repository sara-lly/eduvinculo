import { isNetworkError } from '@/core/errors';
import type { AttendanceStatus, AttendanceSummary, StudentAlert } from '@/domain/types';
import { networkFirst } from '../local/queryCache';
import { rpc, supabase, unwrap } from '../remote/supabase';

export interface TeacherDashboard {
  classrooms: { id: string; name: string; student_count: number }[];
  pending_sessions: { classroom_id: string; classroom_name: string; lesson_date: string; lesson_slot: number; starts_at: string; subject: string }[];
  completed_last_7_days: number;
  next_lessons: { classroom_id: string; classroom_name: string; lesson_date: string; starts_at: string; ends_at: string; subject: string; lesson_slot: number }[];
  flagged_students: { student_id: string; student_name: string; classroom_name: string; reasons: string[] }[];
  __fromCache?: number;
}

export interface SchoolDashboard {
  total_students: number;
  total_classrooms: number;
  sessions_completed: number;
  total_records: number;
  absences: number;
  late: number;
  justified: number;
  attendance_percent: number | null;
  classrooms: { id: string; name: string; absences: number; attendance_percent: number | null }[];
  daily: { date: string; attendance_percent: number }[];
  open_followups: number;
  open_conflicts: number;
  flagged_students: number;
  __fromCache?: number;
}

interface SummaryRow {
  total: number; present: number; absent: number; late: number; justified: number;
  attendance_percent: number | null; min_records_for_percent: number; min_attendance_percent: number;
  monthly: { month: string; total: number; absent: number; percent: number }[];
  days: { date: string; slot: number; status: AttendanceStatus; note: string | null }[];
}

interface AlertRow {
  student_id: string; student_name: string; classroom_id: string; classroom_name: string;
  total_records: number; absences: number; consecutive_absences: number; week_absences: number;
  attendance_percent: number | null; reasons: string[];
}

export const dashboardRepository = {
  teacher(schoolId: string, signal?: AbortSignal) {
    return networkFirst(`teacher_dashboard:${schoolId}`,
      () => rpc<TeacherDashboard>('get_teacher_dashboard', { p_school: schoolId }, signal), isNetworkError);
  },

  school(schoolId: string, from: string, to: string, signal?: AbortSignal) {
    return networkFirst(`school_dashboard:${schoolId}:${from}:${to}`,
      () => rpc<SchoolDashboard>('get_school_dashboard', { p_school: schoolId, p_from: from, p_to: to }, signal),
      isNetworkError);
  },

  async studentSummary(studentId: string, from: string, to: string, signal?: AbortSignal): Promise<AttendanceSummary & { __fromCache?: number }> {
    const r = await networkFirst(`student_summary:${studentId}:${from}:${to}`,
      () => rpc<SummaryRow>('get_student_attendance_summary', { p_student: studentId, p_from: from, p_to: to }, signal),
      isNetworkError);
    return {
      total: r.total, present: r.present, absent: r.absent, late: r.late, justified: r.justified,
      attendancePercent: r.attendance_percent === null ? null : Number(r.attendance_percent),
      minRecordsForPercent: r.min_records_for_percent,
      minAttendancePercent: Number(r.min_attendance_percent),
      monthly: r.monthly.map((m) => ({ ...m, percent: Number(m.percent) })),
      days: r.days,
      __fromCache: r.__fromCache,
    };
  },

  async alerts(schoolId: string, opts: { classroomId?: string; onlyFlagged?: boolean } = {}, signal?: AbortSignal): Promise<StudentAlert[]> {
    const rows = await networkFirst(`alerts:${schoolId}:${opts.classroomId ?? 'all'}:${opts.onlyFlagged ?? true}`, async () => {
      let q = supabase.rpc('compute_student_alerts', {
        p_school: schoolId,
        p_classroom: opts.classroomId ?? null,
        p_only_flagged: opts.onlyFlagged ?? true,
      });
      if (signal) q = q.abortSignal(signal);
      return unwrap<AlertRow[]>(await q);
    }, isNetworkError);
    return rows.map((r) => ({
      studentId: r.student_id, studentName: r.student_name, classroomId: r.classroom_id, classroomName: r.classroom_name,
      totalRecords: r.total_records, absences: r.absences, consecutiveAbsences: r.consecutive_absences,
      weekAbsences: r.week_absences, attendancePercent: r.attendance_percent === null ? null : Number(r.attendance_percent),
      reasons: r.reasons,
    }));
  },

  /** Relatório por estudante (coordenação). */
  async report(schoolId: string, from: string, to: string, classroomId?: string) {
    const rows = unwrap<{
      classroom_id: string; classroom_name: string; student_id: string; student_name: string; registration_code: string;
      total: number; present: number; absent: number; late: number; justified: number; attendance_percent: number | null;
    }[]>(await supabase.rpc('get_attendance_report', { p_school: schoolId, p_from: from, p_to: to, p_classroom: classroomId ?? null }));
    return rows.map((r) => ({ ...r, attendance_percent: r.attendance_percent === null ? null : Number(r.attendance_percent) }));
  },
};

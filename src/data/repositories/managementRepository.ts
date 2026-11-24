/** Gestão escolar (coordenação/direção). Todas as permissões são verificadas pelo banco (RLS/RPC). */
import { config } from '@/core/config';
import { toAppError } from '@/core/errors';
import type { AttendanceRules, CalendarEvent, Classroom, Guardian, MembershipRole, Student } from '@/domain/types';
import { rpc, supabase, unwrap } from '../remote/supabase';

export interface TeacherItem {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string | null;
  active: boolean;
  classrooms: { linkId: string; classroomId: string; classroomName: string; subject: string }[];
}

export interface InviteItem {
  id: string;
  role: MembershipRole;
  label: string | null;
  codeHint: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  revoked: boolean;
  createdAt: string;
}

export const managementRepository = {
  // ------------------------------------------------------------------ Turmas
  async listClassrooms(schoolId: string, includeInactive = false): Promise<Classroom[]> {
    let q = supabase
      .from('classrooms')
      .select('id, school_id, name, grade, shift, school_year, active, classroom_students(count)')
      .eq('school_id', schoolId)
      .eq('classroom_students.active', true)
      .order('name');
    if (!includeInactive) q = q.eq('active', true);
    const rows = unwrap<{ id: string; school_id: string; name: string; grade: string | null; shift: Classroom['shift'];
      school_year: number; active: boolean; classroom_students: { count: number }[] }[]>(await q);
    return rows.map((r) => ({
      id: r.id, schoolId: r.school_id, name: r.name, grade: r.grade, shift: r.shift, schoolYear: r.school_year,
      active: r.active, studentCount: r.classroom_students[0]?.count ?? 0,
    }));
  },

  async saveClassroom(schoolId: string, input: { id?: string; name: string; grade: string; shift: Classroom['shift']; schoolYear: number }, userId: string) {
    const row = { name: input.name, grade: input.grade || null, shift: input.shift, school_year: input.schoolYear };
    if (input.id) unwrap(await supabase.from('classrooms').update(row).eq('id', input.id));
    else unwrap(await supabase.from('classrooms').insert({ ...row, school_id: schoolId, created_by: userId }));
  },

  async setClassroomActive(id: string, active: boolean) {
    unwrap(await supabase.from('classrooms').update({ active }).eq('id', id));
  },

  // -------------------------------------------------------------- Estudantes
  /** Busca paginada no servidor (não carrega a escola inteira). */
  async searchStudents(schoolId: string, opts: { search?: string; classroomId?: string; page: number; includeInactive?: boolean }): Promise<{ items: Student[]; hasMore: boolean }> {
    const from = opts.page * config.pageSize;
    const embed = opts.classroomId ? 'classroom_students!inner(classroom_id, active, classrooms(name))' : 'classroom_students(classroom_id, active, classrooms(name))';
    let q = supabase
      .from('students')
      .select(`id, school_id, full_name, registration_code, birth_date, active, user_id, ${embed}`)
      .eq('school_id', schoolId)
      .order('full_name')
      .order('id')
      .range(from, from + config.pageSize);
    if (!opts.includeInactive) q = q.eq('active', true);
    if (opts.classroomId) q = q.eq('classroom_students.classroom_id', opts.classroomId).eq('classroom_students.active', true);
    const term = opts.search?.trim();
    if (term) q = q.or(`full_name.ilike.%${term.replace(/[%,()]/g, ' ')}%,registration_code.ilike.%${term.replace(/[%,()]/g, ' ')}%`);
    const rows = unwrap<{ id: string; school_id: string; full_name: string; registration_code: string; birth_date: string | null;
      active: boolean; user_id: string | null;
      classroom_students: { classroom_id: string; active: boolean; classrooms: { name: string } | null }[] }[]>(await q);
    const items = rows.slice(0, config.pageSize).map((r) => {
      const current = r.classroom_students.find((c) => c.active);
      return {
        id: r.id, schoolId: r.school_id, fullName: r.full_name, registrationCode: r.registration_code, birthDate: r.birth_date,
        active: r.active, hasAccount: !!r.user_id, classroomId: current?.classroom_id ?? null,
        classroomName: current?.classrooms?.name ?? null,
      };
    });
    return { items, hasMore: rows.length > config.pageSize };
  },

  async getStudent(id: string): Promise<Student & { guardians: { id: string; fullName: string; relationship: string; hasAccount: boolean }[] }> {
    const r = unwrap<{ id: string; school_id: string; full_name: string; registration_code: string; birth_date: string | null;
      active: boolean; user_id: string | null;
      classroom_students: { classroom_id: string; active: boolean; classrooms: { name: string } | null }[];
      student_guardians?: { relationship: string; active: boolean; guardians: { id: string; full_name: string; user_id: string | null } | null }[] }>(
      await supabase.from('students')
        .select('id, school_id, full_name, registration_code, birth_date, active, user_id, classroom_students(classroom_id, active, classrooms(name)), student_guardians(relationship, active, guardians(id, full_name, user_id))')
        .eq('id', id).single());
    const current = r.classroom_students.find((c) => c.active);
    return {
      id: r.id, schoolId: r.school_id, fullName: r.full_name, registrationCode: r.registration_code, birthDate: r.birth_date,
      active: r.active, hasAccount: !!r.user_id, classroomId: current?.classroom_id ?? null, classroomName: current?.classrooms?.name ?? null,
      guardians: (r.student_guardians ?? []).filter((g) => g.active && g.guardians).map((g) => ({
        id: g.guardians!.id, fullName: g.guardians!.full_name, relationship: g.relationship, hasAccount: !!g.guardians!.user_id,
      })),
    };
  },

  async createStudent(schoolId: string, input: { fullName: string; registrationCode: string; birthDate: string | null; classroomId: string | null }, userId: string) {
    const { data, error } = await supabase.from('students')
      .insert({ school_id: schoolId, full_name: input.fullName, registration_code: input.registrationCode, birth_date: input.birthDate, created_by: userId })
      .select('id').single();
    if (error) {
      if (error.code === '23505') throw toAppError({ code: '23505', message: 'Já existe um estudante com esta matrícula.' });
      throw toAppError(error);
    }
    if (input.classroomId) {
      unwrap(await supabase.from('classroom_students').insert({ classroom_id: input.classroomId, student_id: data.id, school_id: schoolId, created_by: userId }));
    }
    return data.id as string;
  },

  async updateStudent(id: string, input: { fullName: string; registrationCode: string; birthDate: string | null }) {
    unwrap(await supabase.from('students').update({ full_name: input.fullName, registration_code: input.registrationCode, birth_date: input.birthDate }).eq('id', id));
  },

  transferStudent(studentId: string, toClassroomId: string) {
    return rpc<string>('transfer_student', { p_student: studentId, p_to_classroom: toClassroomId });
  },

  setStudentActive(studentId: string, active: boolean) {
    return rpc<void>('set_student_active', { p_student: studentId, p_active: active });
  },

  // ------------------------------------------------------------ Professores
  async listTeachers(schoolId: string): Promise<TeacherItem[]> {
    const memberships = unwrap<{ id: string; user_id: string; active: boolean; profiles: { full_name: string; email: string | null } | null }[]>(
      await supabase.from('school_memberships').select('id, user_id, active, profiles(full_name, email)')
        .eq('school_id', schoolId).eq('role', 'teacher').order('created_at'));
    const links = unwrap<{ id: string; teacher_id: string; subject: string; classroom_id: string; classrooms: { name: string; active: boolean } | null }[]>(
      await supabase.from('classroom_teachers').select('id, teacher_id, subject, classroom_id, classrooms(name, active)')
        .eq('school_id', schoolId).eq('active', true));
    return memberships
      .map((m) => ({
        membershipId: m.id, userId: m.user_id, fullName: m.profiles?.full_name || 'Sem nome', email: m.profiles?.email ?? null,
        active: m.active,
        classrooms: links.filter((l) => l.teacher_id === m.user_id && l.classrooms?.active)
          .map((l) => ({ linkId: l.id, classroomId: l.classroom_id, classroomName: l.classrooms!.name, subject: l.subject })),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  },

  async assignTeacher(schoolId: string, classroomId: string, teacherId: string, subject: string, userId: string) {
    const { error } = await supabase.from('classroom_teachers')
      .upsert({ school_id: schoolId, classroom_id: classroomId, teacher_id: teacherId, subject, active: true, created_by: userId },
        { onConflict: 'classroom_id,teacher_id,subject' });
    if (error) throw toAppError(error);
  },

  async unassignTeacher(linkId: string) {
    unwrap(await supabase.from('classroom_teachers').update({ active: false }).eq('id', linkId));
  },

  async setMembershipActive(membershipId: string, active: boolean) {
    unwrap(await supabase.from('school_memberships').update({ active }).eq('id', membershipId));
  },

  // ----------------------------------------------------------- Responsáveis
  async listGuardians(schoolId: string, search?: string): Promise<Guardian[]> {
    let q = supabase.from('guardians')
      .select('id, school_id, full_name, email, phone, active, user_id, student_guardians(relationship, active, students(id, full_name))')
      .eq('school_id', schoolId).order('full_name').limit(200);
    const term = search?.trim();
    if (term) q = q.ilike('full_name', `%${term.replace(/[%,()]/g, ' ')}%`);
    const rows = unwrap<{ id: string; school_id: string; full_name: string; email: string | null; phone: string | null; active: boolean;
      user_id: string | null; student_guardians: { relationship: string; active: boolean; students: { id: string; full_name: string } | null }[] }[]>(await q);
    return rows.map((r) => ({
      id: r.id, schoolId: r.school_id, fullName: r.full_name, email: r.email, phone: r.phone, active: r.active, hasAccount: !!r.user_id,
      students: r.student_guardians.filter((s) => s.active && s.students)
        .map((s) => ({ id: s.students!.id, fullName: s.students!.full_name, relationship: s.relationship })),
    }));
  },

  async createGuardian(schoolId: string, input: { fullName: string; email: string; phone: string; relationship: string; studentId: string }, userId: string) {
    const { data, error } = await supabase.from('guardians')
      .insert({ school_id: schoolId, full_name: input.fullName, email: input.email || null, phone: input.phone || null, created_by: userId })
      .select('id').single();
    if (error) throw toAppError(error);
    unwrap(await supabase.from('student_guardians')
      .insert({ school_id: schoolId, student_id: input.studentId, guardian_id: data.id, relationship: input.relationship, created_by: userId }));
    return data.id as string;
  },

  async linkGuardian(schoolId: string, guardianId: string, studentId: string, relationship: string, userId: string) {
    const { error } = await supabase.from('student_guardians')
      .upsert({ school_id: schoolId, student_id: studentId, guardian_id: guardianId, relationship, active: true, created_by: userId },
        { onConflict: 'student_id,guardian_id' });
    if (error) throw toAppError(error);
  },

  async setGuardianActive(id: string, active: boolean) {
    unwrap(await supabase.from('guardians').update({ active }).eq('id', id));
  },

  // ---------------------------------------------------------------- Convites
  createInvite(input: { schoolId: string; role: MembershipRole; studentId?: string; guardianId?: string; label?: string; validDays?: number; maxUses?: number }) {
    return rpc<{ id: string; code: string; expires_at: string }>('create_invite', {
      p_school: input.schoolId, p_role: input.role, p_student: input.studentId ?? null, p_guardian: input.guardianId ?? null,
      p_label: input.label ?? null, p_valid_days: input.validDays ?? 7, p_max_uses: input.maxUses ?? 1,
    });
  },

  async listInvites(schoolId: string): Promise<InviteItem[]> {
    const rows = unwrap<{ id: string; role: MembershipRole; label: string | null; code_hint: string; expires_at: string;
      max_uses: number; used_count: number; revoked: boolean; created_at: string }[]>(
      await supabase.from('invitations').select('id, role, label, code_hint, expires_at, max_uses, used_count, revoked, created_at')
        .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(100));
    return rows.map((r) => ({
      id: r.id, role: r.role, label: r.label, codeHint: r.code_hint, expiresAt: r.expires_at, maxUses: r.max_uses,
      usedCount: r.used_count, revoked: r.revoked, createdAt: r.created_at,
    }));
  },

  async revokeInvite(id: string) {
    unwrap(await supabase.from('invitations').update({ revoked: true }).eq('id', id));
  },

  // ------------------------------------------------------------------ Regras
  async getRules(schoolId: string): Promise<AttendanceRules> {
    const r = unwrap<Record<string, unknown>>(await supabase.from('attendance_rules').select('*').eq('school_id', schoolId).single());
    return {
      schoolId,
      minAttendancePercent: Number(r.min_attendance_percent),
      consecutiveAbsencesThreshold: Number(r.consecutive_absences_threshold),
      weeklyAbsencesThreshold: Number(r.weekly_absences_threshold),
      periodDays: Number(r.period_days),
      periodAbsencesThreshold: Number(r.period_absences_threshold),
      minRecordsForPercent: Number(r.min_records_for_percent),
      lateCountsAsPresent: Boolean(r.late_counts_as_present),
      justifiedCountsAsPresent: Boolean(r.justified_counts_as_present),
      notifyGuardiansOnAbsence: Boolean(r.notify_guardians_on_absence),
      notifyGuardiansOnAlert: Boolean(r.notify_guardians_on_alert),
      teacherEditWindowDays: Number(r.teacher_edit_window_days),
    };
  },

  async saveRules(rules: AttendanceRules, userId: string) {
    unwrap(await supabase.from('attendance_rules').update({
      min_attendance_percent: rules.minAttendancePercent,
      consecutive_absences_threshold: rules.consecutiveAbsencesThreshold,
      weekly_absences_threshold: rules.weeklyAbsencesThreshold,
      period_days: rules.periodDays,
      period_absences_threshold: rules.periodAbsencesThreshold,
      min_records_for_percent: rules.minRecordsForPercent,
      late_counts_as_present: rules.lateCountsAsPresent,
      justified_counts_as_present: rules.justifiedCountsAsPresent,
      notify_guardians_on_absence: rules.notifyGuardiansOnAbsence,
      notify_guardians_on_alert: rules.notifyGuardiansOnAlert,
      teacher_edit_window_days: rules.teacherEditWindowDays,
      updated_by: userId,
    }).eq('school_id', rules.schoolId));
  },

  // -------------------------------------------------------------- Calendário
  async calendarEvents(schoolId: string, from: string, to: string): Promise<CalendarEvent[]> {
    const rows = unwrap<{ id: string; title: string; description: string | null; event_date: string; event_type: CalendarEvent['eventType']; classroom_id: string | null }[]>(
      await supabase.from('calendar_events').select('id, title, description, event_date, event_type, classroom_id')
        .eq('school_id', schoolId).eq('active', true).gte('event_date', from).lte('event_date', to).order('event_date'));
    return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, eventDate: r.event_date, eventType: r.event_type, classroomId: r.classroom_id }));
  },

  async createCalendarEvent(schoolId: string, input: { title: string; description: string; eventDate: string; eventType: CalendarEvent['eventType']; classroomId?: string | null }, userId: string) {
    unwrap(await supabase.from('calendar_events').insert({
      school_id: schoolId, title: input.title, description: input.description || null, event_date: input.eventDate,
      event_type: input.eventType, classroom_id: input.classroomId || null, created_by: userId,
    }));
  },

  async schoolInfo(schoolId: string) {
    return unwrap<{ id: string; name: string; city: string; state: string; address: string | null; phone: string | null; email: string | null; inep_code: string | null; status: string }>(
      await supabase.from('schools').select('id, name, city, state, address, phone, email, inep_code, status').eq('id', schoolId).single());
  },
};

import type { Followup, FollowupStatus } from '@/domain/types';
import { supabase, unwrap } from '../remote/supabase';

interface FollowupRow {
  id: string; school_id: string; student_id: string; identified_at: string; reason: string; situation: string | null;
  assigned_to: string | null; actions_taken: string | null; next_followup_date: string | null; status: FollowupStatus;
  outcome: string | null; updated_at: string;
  students: { full_name: string } | null;
  assignee: { full_name: string } | null;
}

const SELECT = 'id, school_id, student_id, identified_at, reason, situation, assigned_to, actions_taken, next_followup_date, status, outcome, updated_at, students(full_name), assignee:assigned_to(full_name)';

const map = (r: FollowupRow): Followup => ({
  id: r.id, schoolId: r.school_id, studentId: r.student_id, studentName: r.students?.full_name ?? 'Estudante',
  identifiedAt: r.identified_at, reason: r.reason, situation: r.situation, assignedTo: r.assigned_to,
  assignedToName: r.assignee?.full_name ?? null, actionsTaken: r.actions_taken, nextFollowupDate: r.next_followup_date,
  status: r.status, outcome: r.outcome, updatedAt: r.updated_at,
});

export interface FollowupInput {
  studentId: string;
  reason: string;
  situation: string;
  actionsTaken: string;
  nextFollowupDate: string | null;
  status: FollowupStatus;
  outcome: string;
}

/** Acompanhamento pedagógico — acesso restrito pela RLS à coordenação/direção. */
export const followupRepository = {
  async list(schoolId: string, status: 'active' | 'closed'): Promise<Followup[]> {
    let q = supabase.from('pedagogical_followups').select(SELECT).eq('school_id', schoolId).order('updated_at', { ascending: false }).limit(100);
    q = status === 'closed' ? q.eq('status', 'closed') : q.neq('status', 'closed');
    return unwrap<FollowupRow[]>(await q).map(map);
  },

  async listForStudent(studentId: string): Promise<Followup[]> {
    return unwrap<FollowupRow[]>(await supabase.from('pedagogical_followups').select(SELECT).eq('student_id', studentId)
      .order('identified_at', { ascending: false })).map(map);
  },

  async get(id: string): Promise<Followup> {
    return map(unwrap<FollowupRow>(await supabase.from('pedagogical_followups').select(SELECT).eq('id', id).single()));
  },

  async create(schoolId: string, input: FollowupInput, userId: string): Promise<void> {
    unwrap(await supabase.from('pedagogical_followups').insert({
      school_id: schoolId, student_id: input.studentId, reason: input.reason, situation: input.situation || null,
      actions_taken: input.actionsTaken || null, next_followup_date: input.nextFollowupDate, status: input.status,
      outcome: input.outcome || null, assigned_to: userId, created_by: userId, updated_by: userId,
      closed_at: input.status === 'closed' ? new Date().toISOString() : null,
    }));
  },

  async update(id: string, input: FollowupInput, userId: string): Promise<void> {
    unwrap(await supabase.from('pedagogical_followups').update({
      reason: input.reason, situation: input.situation || null, actions_taken: input.actionsTaken || null,
      next_followup_date: input.nextFollowupDate, status: input.status, outcome: input.outcome || null,
      updated_by: userId, closed_at: input.status === 'closed' ? new Date().toISOString() : null,
    }).eq('id', id));
  },

  /** Observações de professores sobre um estudante (autor + coordenação). */
  async notes(studentId: string) {
    return unwrap<{ id: string; note: string; created_at: string; author_id: string; profiles: { full_name: string } | null }[]>(
      await supabase.from('pedagogical_notes').select('id, note, created_at, author_id, profiles:author_id(full_name)')
        .eq('student_id', studentId).order('created_at', { ascending: false }).limit(50));
  },

  async addNote(schoolId: string, studentId: string, note: string, userId: string) {
    unwrap(await supabase.from('pedagogical_notes').insert({ school_id: schoolId, student_id: studentId, note, author_id: userId }));
  },
};

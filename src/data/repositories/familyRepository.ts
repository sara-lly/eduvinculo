/** Dados vistos por responsáveis e estudantes (a RLS limita aos próprios vínculos). */
import { isNetworkError } from '@/core/errors';
import type { Student } from '@/domain/types';
import { networkFirst } from '../local/queryCache';
import { supabase, unwrap } from '../remote/supabase';

export const familyRepository = {
  async myStudents(userId: string, schoolId: string): Promise<Student[]> {
    return networkFirst(`family_students:${userId}:${schoolId}`, async () => {
      const rows = unwrap<{ id: string; school_id: string; full_name: string; registration_code: string; birth_date: string | null;
        active: boolean; user_id: string | null;
        classroom_students: { classroom_id: string; active: boolean; classrooms: { name: string } | null }[] }[]>(
        await supabase.from('students')
          .select('id, school_id, full_name, registration_code, birth_date, active, user_id, classroom_students(classroom_id, active, classrooms(name))')
          .eq('school_id', schoolId)
          .eq('active', true)
          .order('full_name'));
      return rows.map((r) => {
        const current = r.classroom_students.find((c) => c.active);
        return {
          id: r.id, schoolId: r.school_id, fullName: r.full_name, registrationCode: r.registration_code, birthDate: r.birth_date,
          active: r.active, hasAccount: !!r.user_id, classroomId: current?.classroom_id ?? null,
          classroomName: current?.classrooms?.name ?? null,
        };
      });
    }, isNetworkError);
  },
};

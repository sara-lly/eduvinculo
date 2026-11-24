/** Administração da plataforma — sem acesso a dados pessoais de estudantes. */
import type { MembershipRole, SchoolStatus } from '@/domain/types';
import { rpc, supabase, unwrap } from '../remote/supabase';

export interface SchoolOverview {
  id: string;
  name: string;
  city: string;
  state: string;
  status: SchoolStatus;
  inep_code: string | null;
  created_at: string;
  students: number;
  classrooms: number;
  staff: number;
  teachers: number;
  guardians: number;
}

export interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  changedFields: string[] | null;
  createdAt: string;
  actorName: string | null;
  schoolName: string | null;
}

export const adminRepository = {
  overview: () => rpc<SchoolOverview[]>('get_platform_overview'),

  async createSchool(input: { name: string; city: string; state: string; inepCode: string }, userId: string) {
    unwrap(await supabase.from('schools').insert({
      name: input.name, city: input.city, state: input.state, inep_code: input.inepCode || null,
      timezone: 'America/Sao_Paulo', created_by: userId,
    }));
  },

  async setSchoolStatus(id: string, status: SchoolStatus) {
    unwrap(await supabase.from('schools').update({ status }).eq('id', id));
  },

  setPlatformAdmin: (email: string, value: boolean) => rpc<void>('set_platform_admin', { p_email: email, p_value: value }),

  async listAdmins() {
    return unwrap<{ id: string; full_name: string; email: string | null }[]>(
      await supabase.from('profiles').select('id, full_name, email').eq('is_platform_admin', true).order('full_name'));
  },

  createManagementInvite: (schoolId: string, role: Extract<MembershipRole, 'coordinator' | 'director'>, label: string) =>
    rpc<{ id: string; code: string; expires_at: string }>('create_invite', {
      p_school: schoolId, p_role: role, p_label: label || null, p_valid_days: 14, p_max_uses: 1,
    }),

  async auditLogs(opts: { schoolId?: string; page: number }): Promise<{ items: AuditEntry[]; hasMore: boolean }> {
    const size = 50;
    let q = supabase.from('audit_logs')
      .select('id, action, entity, entity_id, changed_fields, created_at, profiles:actor_id(full_name), schools(name)')
      .order('created_at', { ascending: false })
      .range(opts.page * size, opts.page * size + size);
    if (opts.schoolId) q = q.eq('school_id', opts.schoolId);
    const rows = unwrap<{ id: number; action: string; entity: string; entity_id: string | null; changed_fields: string[] | null;
      created_at: string; profiles: { full_name: string } | null; schools: { name: string } | null }[]>(await q);
    return {
      items: rows.slice(0, size).map((r) => ({
        id: r.id, action: r.action, entity: r.entity, entityId: r.entity_id, changedFields: r.changed_fields,
        createdAt: r.created_at, actorName: r.profiles?.full_name ?? null, schoolName: r.schools?.name ?? null,
      })),
      hasMore: rows.length > size,
    };
  },
};

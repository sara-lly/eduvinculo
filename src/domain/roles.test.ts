import { areaForContext, availableContexts, can } from './roles';
import type { ActiveContext, Membership } from './types';

const m = (role: Membership['role'], schoolStatus: Membership['schoolStatus'] = 'active', schoolId = 'school-1'): Membership => ({
  id: `${schoolId}-${role}`, schoolId, role, schoolName: `Escola ${schoolId}`, schoolCity: 'Teresina', schoolState: 'PI',
  schoolStatus, schoolTimezone: 'America/Fortaleza',
});
const ctx = (role: Membership['role']): ActiveContext => ({ kind: 'school', membershipId: role, schoolId: 'school-1', schoolName: 'E', role, timezone: 'America/Sao_Paulo' });

describe('controle de acesso na interface', () => {
  it('cada papel vai para a sua área', () => {
    expect(areaForContext(ctx('teacher'))).toBe('teacher');
    expect(areaForContext(ctx('director'))).toBe('coordinator');
    expect(areaForContext(ctx('coordinator'))).toBe('coordinator');
    expect(areaForContext(ctx('guardian'))).toBe('guardian');
    expect(areaForContext(ctx('student'))).toBe('student');
    expect(areaForContext({ kind: 'platform_admin' })).toBe('admin');
  });

  it('professor registra chamada, mas não vê acompanhamento pedagógico nem gestão', () => {
    expect(can(ctx('teacher'), 'record_attendance')).toBe(true);
    expect(can(ctx('teacher'), 'view_followups')).toBe(false);
    expect(can(ctx('teacher'), 'manage_school')).toBe(false);
  });

  it('responsável e estudante não registram chamada nem veem dados internos', () => {
    for (const role of ['guardian', 'student'] as const) {
      expect(can(ctx(role), 'record_attendance')).toBe(false);
      expect(can(ctx(role), 'view_followups')).toBe(false);
      expect(can(ctx(role), 'view_reports')).toBe(false);
    }
  });

  it('administrador da plataforma não acessa funções escolares', () => {
    const admin: ActiveContext = { kind: 'platform_admin' };
    expect(can(admin, 'manage_platform')).toBe(true);
    expect(can(admin, 'record_attendance')).toBe(false);
    expect(can(admin, 'view_followups')).toBe(false);
    expect(can(null, 'record_attendance')).toBe(false);
  });

  it('múltiplos vínculos geram contextos distintos; escolas suspensas são ocultadas', () => {
    const list = availableContexts([m('teacher'), m('guardian'), m('coordinator', 'suspended', 'school-2')], true);
    expect(list.map((c) => (c.kind === 'school' ? `${c.schoolId}:${c.role}` : 'admin'))).toEqual(['admin', 'school-1:teacher', 'school-1:guardian']);
  });
});

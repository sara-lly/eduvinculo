/** Papéis, rótulos e capacidades (controle de navegação no app). */
import type { ActiveContext, Membership, MembershipRole } from './types';

export const ROLE_LABEL: Record<MembershipRole, string> = {
  director: 'Direção',
  coordinator: 'Coordenação',
  teacher: 'Professor(a)',
  guardian: 'Responsável',
  student: 'Estudante',
};

export type Area = 'coordinator' | 'teacher' | 'guardian' | 'student' | 'admin';

export function areaForRole(role: MembershipRole): Area {
  switch (role) {
    case 'director':
    case 'coordinator':
      return 'coordinator';
    case 'teacher':
      return 'teacher';
    case 'guardian':
      return 'guardian';
    case 'student':
      return 'student';
  }
}

export function areaForContext(ctx: ActiveContext): Area {
  return ctx.kind === 'platform_admin' ? 'admin' : areaForRole(ctx.role);
}

export function isStaffRole(role: MembershipRole): boolean {
  return role === 'director' || role === 'coordinator';
}

/**
 * Capacidades exibidas na interface. A autorização REAL acontece no banco
 * (RLS + RPCs); aqui apenas evitamos mostrar opções que seriam negadas.
 */
export function can(ctx: ActiveContext | null, action:
  | 'manage_school' | 'record_attendance' | 'view_followups' | 'manage_rules' | 'publish_announcement'
  | 'view_reports' | 'manage_platform' | 'resolve_conflicts'): boolean {
  if (!ctx) return false;
  if (ctx.kind === 'platform_admin') return action === 'manage_platform';
  const staff = isStaffRole(ctx.role);
  switch (action) {
    case 'manage_school':
    case 'view_followups':
    case 'manage_rules':
    case 'publish_announcement':
    case 'view_reports':
      return staff;
    case 'record_attendance':
    case 'resolve_conflicts':
      return staff || ctx.role === 'teacher';
    case 'manage_platform':
      return false;
  }
}

/** Contextos disponíveis para escolha (uma entrada por escola + papel). */
export function availableContexts(memberships: Membership[], isPlatformAdmin: boolean): ActiveContext[] {
  const list: ActiveContext[] = memberships
    .filter((m) => m.schoolStatus === 'active')
    .map((m) => ({
      kind: 'school' as const,
      membershipId: m.id,
      schoolId: m.schoolId,
      schoolName: m.schoolName,
      role: m.role,
      timezone: m.schoolTimezone,
    }));
  if (isPlatformAdmin) list.unshift({ kind: 'platform_admin' });
  return list;
}

export function contextKey(ctx: ActiveContext): string {
  return ctx.kind === 'platform_admin' ? 'platform_admin' : ctx.membershipId;
}

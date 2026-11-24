/**
 * Regras de negócio da frequência (puras, sem dependência de UI ou banco).
 * As mesmas regras são aplicadas no servidor (SQL); aqui elas permitem
 * feedback imediato e funcionamento offline.
 */
import type { AttendanceRecord, AttendanceRules, AttendanceStatus, RosterStudent } from './types';

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Presente',
  absent: 'Ausente',
  late: 'Atrasado',
  justified: 'Falta justificada',
};

export const STATUS_SHORT: Record<AttendanceStatus, string> = {
  present: 'P',
  absent: 'F',
  late: 'A',
  justified: 'J',
};

export const STATUS_ORDER: AttendanceStatus[] = ['present', 'absent', 'late', 'justified'];

export interface AttendanceCounts {
  total: number;
  present: number;
  absent: number;
  late: number;
  justified: number;
}

export function countStatuses(statuses: Iterable<AttendanceStatus>): AttendanceCounts {
  const c: AttendanceCounts = { total: 0, present: 0, absent: 0, late: 0, justified: 0 };
  for (const s of statuses) {
    c.total++;
    c[s]++;
  }
  return c;
}

/**
 * Percentual de frequência. Retorna null quando não há registros suficientes,
 * para não exibir percentuais enganosos (ex.: "0%" após uma única falta).
 */
export function attendancePercent(
  counts: AttendanceCounts,
  rules: Pick<AttendanceRules, 'lateCountsAsPresent' | 'justifiedCountsAsPresent' | 'minRecordsForPercent'>,
): number | null {
  if (counts.total === 0 || counts.total < rules.minRecordsForPercent) return null;
  const ok =
    counts.present +
    (rules.lateCountsAsPresent ? counts.late : 0) +
    (rules.justifiedCountsAsPresent ? counts.justified : 0);
  return Math.round((ok * 1000) / counts.total) / 10;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export interface CompletenessResult {
  complete: boolean;
  missing: RosterStudent[];
  recorded: number;
  total: number;
}

/** Uma chamada só pode ser concluída quando todos os estudantes têm registro. */
export function checkCompleteness(
  roster: readonly RosterStudent[],
  records: ReadonlyMap<string, AttendanceStatus>,
): CompletenessResult {
  const missing: RosterStudent[] = [];
  for (const s of roster) {
    if (!records.has(s.studentId)) missing.push(s);
  }
  return { complete: missing.length === 0 && roster.length > 0, missing, recorded: roster.length - missing.length, total: roster.length };
}

/** Marca todos os estudantes ainda sem registro como presentes (ação "todos presentes"). */
export function fillRemainingAsPresent(
  roster: readonly RosterStudent[],
  records: ReadonlyMap<string, AttendanceStatus>,
): Map<string, AttendanceStatus> {
  const next = new Map(records);
  for (const s of roster) if (!next.has(s.studentId)) next.set(s.studentId, 'present');
  return next;
}

/** Próximo status ao tocar repetidamente no estudante: P → F → A → J → P. */
export function cycleStatus(current: AttendanceStatus | undefined): AttendanceStatus {
  if (!current) return 'present';
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length] ?? 'present';
}

export function recordsToPayload(records: ReadonlyMap<string, AttendanceStatus>, notes?: ReadonlyMap<string, string>): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  records.forEach((status, studentId) => {
    const note = notes?.get(studentId)?.trim();
    out.push({ studentId, status, note: note ? note.slice(0, 500) : null });
  });
  return out;
}

/**
 * Identificação de faltas recorrentes (acompanhamento preventivo).
 *
 * Importante: o resultado DESCREVE fatos ("2 faltas consecutivas") para que a
 * equipe pedagógica avalie o caso. O sistema não classifica o estudante nem
 * toma decisões automaticamente.
 *
 * Mesmos critérios da função SQL public.compute_student_alerts.
 */
import { addDays, diffDays, weekdayOf, type IsoDate } from '@/core/dates';
import { attendancePercent, countStatuses, formatPercent } from './attendance';
import type { AttendanceRules, AttendanceStatus } from './types';

export interface AlertInputRecord {
  studentId: string;
  lessonDate: IsoDate;
  lessonSlot: number;
  status: AttendanceStatus;
}

export interface StudentAlertResult {
  studentId: string;
  totalRecords: number;
  absences: number;
  consecutiveAbsences: number;
  weekAbsences: number;
  attendancePercent: number | null;
  reasons: string[];
}

/** Segunda-feira da semana (ISO) que contém a data. */
export function startOfIsoWeek(iso: IsoDate): IsoDate {
  const dow = weekdayOf(iso); // 0 = domingo
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

function buildReasons(r: Omit<StudentAlertResult, 'reasons' | 'studentId'>, rules: AttendanceRules): string[] {
  const reasons: string[] = [];
  if (r.consecutiveAbsences >= rules.consecutiveAbsencesThreshold) {
    reasons.push(`${r.consecutiveAbsences} faltas consecutivas`);
  }
  if (r.weekAbsences >= rules.weeklyAbsencesThreshold) {
    reasons.push(`${r.weekAbsences} faltas nesta semana`);
  }
  if (r.absences >= rules.periodAbsencesThreshold) {
    reasons.push(`${r.absences} faltas nos últimos ${rules.periodDays} dias`);
  }
  if (r.attendancePercent !== null && r.attendancePercent < rules.minAttendancePercent) {
    reasons.push(
      `Frequência de ${formatPercent(r.attendancePercent)} (mínimo configurado: ${formatPercent(rules.minAttendancePercent)})`,
    );
  }
  return reasons;
}

/**
 * Versão otimizada: O(n log n) no total — agrupa uma vez por estudante,
 * ordena cada grupo uma vez e calcula tudo em uma única passada.
 */
export function detectAlerts(
  records: readonly AlertInputRecord[],
  rules: AttendanceRules,
  asOf: IsoDate,
  options: { onlyFlagged?: boolean } = {},
): StudentAlertResult[] {
  const periodStart = addDays(asOf, -rules.periodDays + 1);
  const weekStart = startOfIsoWeek(asOf);
  const byStudent = new Map<string, AlertInputRecord[]>();

  for (const r of records) {
    if (r.lessonDate > asOf || r.lessonDate < periodStart) continue;
    let list = byStudent.get(r.studentId);
    if (!list) {
      list = [];
      byStudent.set(r.studentId, list);
    }
    list.push(r);
  }

  const out: StudentAlertResult[] = [];
  byStudent.forEach((list, studentId) => {
    list.sort((a, b) => (a.lessonDate === b.lessonDate ? b.lessonSlot - a.lessonSlot : a.lessonDate < b.lessonDate ? 1 : -1));
    let consecutive = 0;
    let streakOpen = true;
    let weekAbsences = 0;
    const statuses: AttendanceStatus[] = [];
    for (const r of list) {
      statuses.push(r.status);
      if (streakOpen) {
        if (r.status === 'absent') consecutive++;
        else streakOpen = false;
      }
      if (r.status === 'absent' && r.lessonDate >= weekStart) weekAbsences++;
    }
    const counts = countStatuses(statuses);
    const base = {
      totalRecords: counts.total,
      absences: counts.absent,
      consecutiveAbsences: consecutive,
      weekAbsences,
      attendancePercent: attendancePercent(counts, rules),
    };
    const reasons = buildReasons(base, rules);
    if (!options.onlyFlagged || reasons.length > 0) out.push({ studentId, ...base, reasons });
  });

  return out.sort((a, b) => b.reasons.length - a.reasons.length || b.consecutiveAbsences - a.consecutiveAbsences);
}

/**
 * Implementação ingênua, mantida SOMENTE como referência para o benchmark
 * (scripts/benchmark-domain.ts): para cada estudante percorre todos os
 * registros novamente e reordena — O(estudantes × registros).
 */
export function detectAlertsNaive(
  records: readonly AlertInputRecord[],
  rules: AttendanceRules,
  asOf: IsoDate,
): StudentAlertResult[] {
  const ids = Array.from(new Set(records.map((r) => r.studentId)));
  return ids
    .map((studentId) => {
      const mine = records
        .filter((r) => r.studentId === studentId)
        .filter((r) => r.lessonDate <= asOf && diffDays(asOf, r.lessonDate) < rules.periodDays)
        .sort((a, b) => (a.lessonDate === b.lessonDate ? b.lessonSlot - a.lessonSlot : a.lessonDate < b.lessonDate ? 1 : -1));
      let consecutive = 0;
      for (const r of mine) {
        if (r.status !== 'absent') break;
        consecutive++;
      }
      const weekStart = startOfIsoWeek(asOf);
      const counts = countStatuses(mine.map((r) => r.status));
      const base = {
        totalRecords: counts.total,
        absences: counts.absent,
        consecutiveAbsences: consecutive,
        weekAbsences: mine.filter((r) => r.status === 'absent' && r.lessonDate >= weekStart).length,
        attendancePercent: attendancePercent(counts, rules),
      };
      return { studentId, ...base, reasons: buildReasons(base, rules) };
    })
    .sort((a, b) => b.reasons.length - a.reasons.length || b.consecutiveAbsences - a.consecutiveAbsences);
}

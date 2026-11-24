import { addDays } from '@/core/dates';
import { detectAlerts, detectAlertsNaive, startOfIsoWeek, type AlertInputRecord } from './alerts';
import { DEFAULT_RULES, type AttendanceRules, type AttendanceStatus } from './types';

const rules: AttendanceRules = { schoolId: 's', ...DEFAULT_RULES };
const ASOF = '2026-11-25'; // quarta-feira

function history(studentId: string, statuses: AttendanceStatus[], lastDate = ASOF): AlertInputRecord[] {
  // statuses em ordem cronológica, terminando em lastDate (um registro por dia)
  return statuses.map((status, i) => ({ studentId, status, lessonSlot: 1, lessonDate: addDays(lastDate, i - statuses.length + 1) }));
}

describe('identificação de faltas recorrentes', () => {
  it('semana ISO começa na segunda-feira', () => {
    expect(startOfIsoWeek('2026-11-25')).toBe('2026-11-23');
    expect(startOfIsoWeek('2026-11-29')).toBe('2026-11-23'); // domingo
    expect(startOfIsoWeek('2026-11-23')).toBe('2026-11-23');
  });

  it('sinaliza faltas consecutivas recentes, com motivo descritivo', () => {
    const r = detectAlerts(history('a', ['present', 'present', 'present', 'absent', 'absent']), rules, ASOF, { onlyFlagged: true });
    expect(r).toHaveLength(1);
    expect(r[0]?.consecutiveAbsences).toBe(2);
    expect(r[0]?.reasons).toContain('2 faltas consecutivas');
  });

  it('faltas antigas seguidas de presença NÃO contam como consecutivas', () => {
    const r = detectAlerts(history('a', ['absent', 'absent', 'present', 'present', 'present', 'present', 'present', 'present', 'present']), rules, ASOF);
    expect(r[0]?.consecutiveAbsences).toBe(0);
    expect(r[0]?.reasons).toEqual([]);
  });

  it('sinaliza 3 faltas na mesma semana', () => {
    // seg, ter, qua da semana de ASOF, intercaladas com presença
    const recs: AlertInputRecord[] = [
      { studentId: 'a', lessonDate: '2026-11-23', lessonSlot: 1, status: 'absent' },
      { studentId: 'a', lessonDate: '2026-11-23', lessonSlot: 2, status: 'present' },
      { studentId: 'a', lessonDate: '2026-11-24', lessonSlot: 1, status: 'absent' },
      { studentId: 'a', lessonDate: '2026-11-24', lessonSlot: 2, status: 'present' },
      { studentId: 'a', lessonDate: '2026-11-25', lessonSlot: 1, status: 'absent' },
      { studentId: 'a', lessonDate: '2026-11-25', lessonSlot: 2, status: 'present' },
    ];
    const r = detectAlerts(recs, rules, ASOF);
    expect(r[0]?.weekAbsences).toBe(3);
    expect(r[0]?.reasons).toContain('3 faltas nesta semana');
  });

  it('sinaliza frequência abaixo do mínimo configurável', () => {
    const statuses: AttendanceStatus[] = ['present', 'absent', 'present', 'absent', 'present', 'present', 'absent', 'present'];
    const r = detectAlerts(history('a', statuses), { ...rules, minAttendancePercent: 80, weeklyAbsencesThreshold: 99 }, ASOF);
    expect(r[0]?.attendancePercent).toBe(62.5);
    expect(r[0]?.reasons.some((x) => x.startsWith('Frequência de 62,5%'))).toBe(true);
  });

  it('critérios são configuráveis pela escola (não fixos no código)', () => {
    const recs = history('a', ['present', 'absent', 'absent']);
    expect(detectAlerts(recs, rules, ASOF, { onlyFlagged: true })).toHaveLength(1);
    expect(detectAlerts(recs, { ...rules, consecutiveAbsencesThreshold: 3, weeklyAbsencesThreshold: 9 }, ASOF, { onlyFlagged: true })).toHaveLength(0);
  });

  it('ignora registros fora do período e no futuro', () => {
    const recs: AlertInputRecord[] = [
      { studentId: 'a', lessonDate: addDays(ASOF, -40), lessonSlot: 1, status: 'absent' },
      { studentId: 'a', lessonDate: addDays(ASOF, 1), lessonSlot: 1, status: 'absent' },
      { studentId: 'a', lessonDate: ASOF, lessonSlot: 1, status: 'present' },
    ];
    expect(detectAlerts(recs, rules, ASOF)[0]?.totalRecords).toBe(1);
  });

  it('versão otimizada produz o MESMO resultado da versão ingênua', () => {
    const statuses: AttendanceStatus[] = ['present', 'absent', 'late', 'justified'];
    const recs: AlertInputRecord[] = [];
    for (let s = 0; s < 40; s++) {
      for (let d = 0; d < 30; d++) {
        const h = (s * 31 + d * 17) % 23;
        recs.push({ studentId: `st${s}`, lessonDate: addDays(ASOF, -d), lessonSlot: 1, status: statuses[h % 7 === 0 ? 1 : h % 11 === 0 ? 2 : 0]! });
      }
    }
    const fast = detectAlerts(recs, rules, ASOF).sort((a, b) => a.studentId.localeCompare(b.studentId));
    const slow = detectAlertsNaive(recs, rules, ASOF).sort((a, b) => a.studentId.localeCompare(b.studentId));
    expect(fast).toEqual(slow);
  });
});

import {
  attendancePercent,
  checkCompleteness,
  countStatuses,
  cycleStatus,
  fillRemainingAsPresent,
  formatPercent,
  recordsToPayload,
} from './attendance';
import { DEFAULT_RULES, type AttendanceStatus } from './types';

const roster = [
  { studentId: 'a', fullName: 'Ana', registrationCode: '1' },
  { studentId: 'b', fullName: 'Bia', registrationCode: '2' },
  { studentId: 'c', fullName: 'Caio', registrationCode: '3' },
];

describe('cálculo de frequência', () => {
  it('conta os status', () => {
    expect(countStatuses(['present', 'absent', 'late', 'justified', 'present'])).toEqual({
      total: 5, present: 2, absent: 1, late: 1, justified: 1,
    });
  });

  it('aplica as regras da escola (atraso e justificada contam como presença)', () => {
    const c = countStatuses(['present', 'present', 'late', 'justified', 'absent']);
    expect(attendancePercent(c, DEFAULT_RULES)).toBe(80);
    expect(attendancePercent(c, { ...DEFAULT_RULES, justifiedCountsAsPresent: false })).toBe(60);
    expect(attendancePercent(c, { ...DEFAULT_RULES, lateCountsAsPresent: false, justifiedCountsAsPresent: false })).toBe(40);
  });

  it('não exibe percentual enganoso com poucos registros', () => {
    expect(attendancePercent(countStatuses(['absent']), DEFAULT_RULES)).toBeNull();
    expect(attendancePercent(countStatuses([]), { ...DEFAULT_RULES, minRecordsForPercent: 1 })).toBeNull();
  });

  it('arredonda com uma casa decimal e formata no padrão brasileiro', () => {
    const c = countStatuses(['present', 'present', 'absent', 'present', 'present', 'present']);
    const p = attendancePercent(c, DEFAULT_RULES);
    expect(p).toBe(83.3);
    expect(formatPercent(p)).toBe('83,3%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('registro de chamada', () => {
  it('identifica chamada incompleta e lista quem falta', () => {
    const records = new Map<string, AttendanceStatus>([['a', 'present']]);
    const r = checkCompleteness(roster, records);
    expect(r.complete).toBe(false);
    expect(r.missing.map((s) => s.studentId)).toEqual(['b', 'c']);
    expect(r.recorded).toBe(1);
  });

  it('chamada sem estudantes nunca é considerada completa', () => {
    expect(checkCompleteness([], new Map()).complete).toBe(false);
  });

  it('"restantes presentes" não altera quem já foi marcado', () => {
    const records = new Map<string, AttendanceStatus>([['b', 'absent']]);
    const filled = fillRemainingAsPresent(roster, records);
    expect(filled.get('a')).toBe('present');
    expect(filled.get('b')).toBe('absent');
    expect(checkCompleteness(roster, filled).complete).toBe(true);
    expect(records.size).toBe(1); // imutável
  });

  it('cicla os status na ordem P → F → A → J → P', () => {
    expect(cycleStatus(undefined)).toBe('present');
    expect(cycleStatus('present')).toBe('absent');
    expect(cycleStatus('absent')).toBe('late');
    expect(cycleStatus('late')).toBe('justified');
    expect(cycleStatus('justified')).toBe('present');
  });

  it('gera payload com observações limitadas e sem espaços', () => {
    const payload = recordsToPayload(new Map([['a', 'justified']]), new Map([['a', `  atestado ${'x'.repeat(600)}`]]));
    expect(payload[0]?.note?.startsWith('atestado')).toBe(true);
    expect(payload[0]?.note?.length).toBe(500);
  });
});

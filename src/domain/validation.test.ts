import {
  announcementSchema,
  brDateToIso,
  followupSchema,
  guardianSchema,
  inviteCodeSchema,
  loginSchema,
  registerSchema,
  rulesSchema,
} from './validation';

describe('validação de formulários', () => {
  it('login exige e-mail válido e senha', () => {
    expect(loginSchema.safeParse({ email: 'x', password: '' }).success).toBe(false);
    const ok = loginSchema.safeParse({ email: '  Professora@EduVinculo.demo ', password: 'Demo@2026' });
    expect(ok.success && ok.data.email).toBe('professora@eduvinculo.demo');
  });

  it('cadastro exige senha forte, confirmação e aceite da política', () => {
    const base = { fullName: 'Maria Teste', email: 'maria@teste.demo', password: 'senha1234', confirmPassword: 'senha1234', acceptPrivacy: true };
    expect(registerSchema.safeParse(base).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, password: 'curta1', confirmPassword: 'curta1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'semnumeros', confirmPassword: 'semnumeros' }).success).toBe(false);
    const mismatch = registerSchema.safeParse({ ...base, confirmPassword: 'outra1234' });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(['confirmPassword']);
    expect(registerSchema.safeParse({ ...base, acceptPrivacy: false }).success).toBe(false);
  });

  it('código de convite é normalizado', () => {
    const r = inviteCodeSchema.safeParse({ code: ' demo-resp-2026 ' });
    expect(r.success && r.data.code).toBe('DEMO-RESP-2026');
    expect(inviteCodeSchema.safeParse({ code: 'abc' }).success).toBe(false);
  });

  it('comunicado para turma exige a turma', () => {
    const base = { title: 'Reunião', body: 'Texto do comunicado', audience: 'classroom' as const, classroomId: '', requiresAck: false };
    expect(announcementSchema.safeParse(base).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, audience: 'all' }).success).toBe(true);
  });

  it('acompanhamento só pode ser encerrado com resultado descrito', () => {
    const base = { studentId: '30000000-0000-4000-a000-000000000001', reason: 'Faltas', situation: '', actionsTaken: '', nextFollowupDate: '', status: 'closed' as const, outcome: '' };
    expect(followupSchema.safeParse(base).success).toBe(false);
    expect(followupSchema.safeParse({ ...base, outcome: 'Família contatada; frequência normalizada.' }).success).toBe(true);
    expect(followupSchema.safeParse({ ...base, status: 'open', nextFollowupDate: '31/02/2026x' }).success).toBe(false);
  });

  it('responsável: e-mail opcional, mas válido quando informado', () => {
    const base = { fullName: 'José Teste', email: '', phone: '', relationship: 'pai', studentId: '30000000-0000-4000-a000-000000000001' };
    expect(guardianSchema.safeParse(base).success).toBe(true);
    expect(guardianSchema.safeParse({ ...base, email: 'invalido' }).success).toBe(false);
  });

  it('regras de frequência têm limites', () => {
    const ok = {
      minAttendancePercent: '75', consecutiveAbsencesThreshold: '2', weeklyAbsencesThreshold: '3', periodDays: '30',
      periodAbsencesThreshold: '5', minRecordsForPercent: '5', teacherEditWindowDays: '7', lateCountsAsPresent: true,
      justifiedCountsAsPresent: true, notifyGuardiansOnAbsence: true, notifyGuardiansOnAlert: true,
    };
    const parsed = rulesSchema.safeParse(ok);
    expect(parsed.success && parsed.data.minAttendancePercent).toBe(75);
    expect(rulesSchema.safeParse({ ...ok, minAttendancePercent: '120' }).success).toBe(false);
    expect(rulesSchema.safeParse({ ...ok, periodDays: '3' }).success).toBe(false);
  });

  it('converte datas DD/MM/AAAA e rejeita datas inexistentes', () => {
    expect(brDateToIso('24/11/2026')).toBe('2026-11-24');
    expect(brDateToIso('31/02/2026')).toBeNull();
    expect(brDateToIso('2026-11-24')).toBeNull();
  });
});

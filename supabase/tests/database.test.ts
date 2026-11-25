/**
 * Testes de integração do banco (migrations + seed + RLS + RPCs) em PGlite.
 * Executar: npm run test:db
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDb, IDS, type TestDb } from './harness';

let t: TestDb;

before(async () => {
  t = await createTestDb();
});
after(async () => {
  await t.db.close();
});

async function count(userId: string, table: string, where = 'true'): Promise<number> {
  const rows = await t.as<{ n: number }>(userId, `select count(*)::int as n from public.${table} where ${where}`);
  return rows[0].n;
}

async function schoolToday(): Promise<string> {
  const r = await t.admin<{ d: string }>(`select public.school_today($1)::text as d`, [IDS.school1]);
  return r[0].d;
}

async function rosterOf(classroomId: string): Promise<string[]> {
  const rows = await t.admin<{ student_id: string }>(
    `select student_id from classroom_students where classroom_id = $1 and active order by student_id`,
    [classroomId],
  );
  return rows.map((r) => r.student_id);
}

function sync(userId: string, opts: {
  opId?: string; sessionId?: string; classroomId: string; date: string; status?: 'draft' | 'completed';
  records: { student_id: string; status: string; note?: string }[]; baseVersion?: number;
}) {
  return t.as<{ result: Record<string, unknown> }>(
    userId,
    `select public.sync_attendance_session($1, $2::jsonb, $3::jsonb, $4) as result`,
    [
      opts.opId ?? randomUUID(),
      JSON.stringify({ id: opts.sessionId ?? randomUUID(), classroom_id: opts.classroomId, lesson_date: opts.date, lesson_slot: 1, status: opts.status ?? 'draft' }),
      JSON.stringify(opts.records),
      opts.baseVersion ?? 0,
    ],
  ).then((r) => r[0].result);
}

describe('Isolamento de dados (RLS)', () => {
  it('usuário anônimo não lê nenhuma tabela', async () => {
    await assert.rejects(t.asAnon('select * from public.students'), /permission denied/);
    await assert.rejects(t.asAnon('select * from public.schools'), /permission denied/);
  });

  it('coordenação de outra escola não enxerga estudantes nem turmas da escola 1', async () => {
    assert.equal(await count(IDS.coordinator2, 'students', `school_id = '${IDS.school1}'`), 0);
    assert.equal(await count(IDS.coordinator2, 'classrooms', `school_id = '${IDS.school1}'`), 0);
    assert.equal(await count(IDS.coordinator2, 'attendance_records', `school_id = '${IDS.school1}'`), 0);
    assert.equal(await count(IDS.coordinator2, 'students'), 20);
  });

  it('coordenação enxerga apenas a própria escola', async () => {
    assert.equal(await count(IDS.coordinator, 'students', `school_id = '${IDS.school2}'`), 0);
    assert.equal(await count(IDS.coordinator, 'students'), 655);
  });

  it('professor vê somente estudantes das turmas vinculadas', async () => {
    assert.equal(await count(IDS.caio, 'students'), 25);
    assert.equal(await count(IDS.caio, 'classroom_students', `classroom_id = '${IDS.class6A}'`), 0);
    assert.equal(await count(IDS.marina, 'students'), 630);
    assert.equal(await count(IDS.marina, 'attendance_sessions', `classroom_id = '${IDS.class8C}'`), 0);
  });

  it('responsável vê somente os estudantes sob sua responsabilidade', async () => {
    const rows = await t.as<{ id: string }>(IDS.rita, 'select id from public.students order by full_name');
    assert.deepEqual(rows.map((r) => r.id).sort(), [IDS.studentAnaClara, IDS.studentLucas].sort());
    assert.equal(await count(IDS.rita, 'attendance_records', `student_id not in ('${IDS.studentLucas}', '${IDS.studentAnaClara}')`), 0);
    assert.ok((await count(IDS.rita, 'attendance_records')) > 0);
  });

  it('estudante vê somente a si mesmo', async () => {
    const rows = await t.as<{ id: string }>(IDS.lucas, 'select id from public.students');
    assert.deepEqual(rows.map((r) => r.id), [IDS.studentLucas]);
  });

  it('administrador da plataforma não acessa dados pessoais de estudantes', async () => {
    assert.equal(await count(IDS.admin, 'students'), 0);
    assert.equal(await count(IDS.admin, 'attendance_records'), 0);
    assert.equal(await count(IDS.admin, 'schools'), 2);
  });

  it('acompanhamento pedagógico é restrito à coordenação/direção', async () => {
    assert.equal(await count(IDS.marina, 'pedagogical_followups'), 0);
    assert.equal(await count(IDS.rita, 'pedagogical_followups'), 0);
    assert.equal(await count(IDS.lucas, 'pedagogical_followups'), 0);
    assert.equal(await count(IDS.coordinator, 'pedagogical_followups'), 2);
    assert.equal(await count(IDS.director, 'pedagogical_followups'), 2);
    assert.equal(await count(IDS.coordinator2, 'pedagogical_followups'), 0);
  });

  it('não é possível escrever registros de frequência diretamente (somente via RPC)', async () => {
    const [session] = await t.admin<{ id: string }>(
      `select id from attendance_sessions where classroom_id = $1 limit 1`, [IDS.class6A]);
    await assert.rejects(
      t.as(IDS.marina, `insert into public.attendance_records (session_id, school_id, student_id, status, recorded_by)
                        values ($1, $2, $3, 'present', $4)`, [session.id, IDS.school1, IDS.studentLucas, IDS.marina]),
      /permission denied/);
    await assert.rejects(
      t.as(IDS.marina, `update public.attendance_records set status = 'present' where student_id = $1`, [IDS.studentLucas]),
      /permission denied/);
  });

  it('usuário não consegue se promover a administrador', async () => {
    await assert.rejects(
      t.as(IDS.rita, `update public.profiles set is_platform_admin = true where id = $1`, [IDS.rita]),
      /Alteração não permitida/);
  });

  it('responsável não consegue criar vínculo de coordenação para si', async () => {
    await assert.rejects(
      t.as(IDS.rita, `insert into public.school_memberships (school_id, user_id, role) values ($1, $2, 'coordinator')`,
        [IDS.school1, IDS.rita]),
      /row-level security/);
  });

  it('coordenação não consegue suspender a própria escola', async () => {
    await assert.rejects(
      t.as(IDS.coordinator, `update public.schools set status = 'suspended' where id = $1`, [IDS.school1]),
      /administração da plataforma/);
  });

  it('vínculo de estudante a responsável não pode misturar escolas', async () => {
    const [other] = await t.admin<{ id: string }>(`select id from students where school_id = $1 limit 1`, [IDS.school2]);
    await assert.rejects(
      t.admin(`insert into student_guardians (student_id, guardian_id) values ($1, $2)`, [other.id, IDS.guardianRita]),
      /escolas diferentes/);
  });
});

describe('Registro de frequência', () => {
  it('professor registra, conclui e o reenvio é idempotente', async () => {
    const date = await schoolToday();
    const roster = await rosterOf(IDS.class6A);
    const records = roster.map((id) => ({ student_id: id, status: id === IDS.studentLucas ? 'absent' : 'present' }));
    const opId = randomUUID();

    const first = await sync(IDS.marina, { opId, classroomId: IDS.class6A, date, status: 'completed', records });
    assert.equal(first.status, 'applied');
    assert.equal(first.session_status, 'completed');

    const replay = await sync(IDS.marina, { opId, classroomId: IDS.class6A, date, status: 'completed', records });
    assert.equal(replay.replayed, true);
    assert.equal(replay.session_id, first.session_id);

    const [{ n }] = await t.admin<{ n: number }>(
      `select count(*)::int as n from attendance_records where session_id = $1`, [first.session_id]);
    assert.equal(n, roster.length);
    const [{ s }] = await t.admin<{ s: number }>(
      `select count(*)::int as s from attendance_sessions where classroom_id = $1 and lesson_date = $2`, [IDS.class6A, date]);
    assert.equal(s, 1);
  });

  it('falta gera notificação para a responsável, sem duplicar em reenvios', async () => {
    const date = await schoolToday();
    const rows = await t.as<{ n: number }>(IDS.rita,
      `select count(*)::int as n from notifications where type = 'absence' and student_id = $1 and occurrence_date = $2`,
      [IDS.studentLucas, date]);
    assert.equal(rows[0].n, 1);
  });

  it('Lucas aparece nos alertas de faltas recorrentes com os motivos', async () => {
    const rows = await t.as<{ student_id: string; reasons: string[] }>(IDS.coordinator,
      `select * from public.compute_student_alerts($1)`, [IDS.school1]);
    const lucas = rows.find((r) => r.student_id === IDS.studentLucas);
    assert.ok(lucas, 'Lucas deveria estar sinalizado');
    assert.ok(lucas.reasons.some((r) => r.includes('faltas consecutivas')));
  });

  it('professor só recebe alertas das próprias turmas', async () => {
    const rows = await t.as<{ classroom_id: string }>(IDS.caio,
      `select * from public.compute_student_alerts($1, null, null, null, false)`, [IDS.school1]);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.classroom_id === IDS.class8C));
  });

  it('impede concluir chamada incompleta', async () => {
    const roster = await rosterOf(IDS.class8C);
    const [{ d }] = await t.admin<{ d: string }>(`select (public.school_today($1) - 0)::text as d`, [IDS.school1]);
    await assert.rejects(
      sync(IDS.caio, { classroomId: IDS.class8C, date: d, status: 'completed',
        records: roster.slice(0, 5).map((id) => ({ student_id: id, status: 'present' })) }),
      /Chamada incompleta/);
    // Rascunho parcial é permitido.
    const draft = await sync(IDS.caio, { classroomId: IDS.class8C, date: d, status: 'draft',
      records: roster.slice(0, 5).map((id) => ({ student_id: id, status: 'present' })) });
    assert.equal(draft.status, 'applied');
    assert.equal(draft.session_status, 'draft');
  });

  it('professor não registra chamada de turma que não leciona', async () => {
    const date = await schoolToday();
    const roster = await rosterOf(IDS.class6A);
    await assert.rejects(
      sync(IDS.caio, { classroomId: IDS.class6A, date, records: roster.map((id) => ({ student_id: id, status: 'present' })) }),
      /Sem permissão/);
  });

  it('não permite chamada em data futura nem fora da janela do professor', async () => {
    const roster = await rosterOf(IDS.class100);
    const records = roster.map((id) => ({ student_id: id, status: 'present' }));
    const [{ future, old }] = await t.admin<{ future: string; old: string }>(
      `select (public.school_today($1) + 1)::text as future, (public.school_today($1) - 30)::text as old`, [IDS.school1]);
    await assert.rejects(sync(IDS.marina, { classroomId: IDS.class100, date: future, records }), /Sem permissão/);
    await assert.rejects(sync(IDS.marina, { classroomId: IDS.class100, date: old, records }), /Sem permissão/);
    // A coordenação pode corrigir datas passadas.
    const ok = await sync(IDS.coordinator, { classroomId: IDS.class100, date: old, records });
    assert.equal(ok.status, 'applied');
  });

  it('rejeita estudantes que não pertencem à turma', async () => {
    const date = await schoolToday();
    await assert.rejects(
      sync(IDS.marina, { classroomId: IDS.class100, date, records: [{ student_id: IDS.studentAnaClara, status: 'present' }] }),
      /não pertencem a esta turma/);
  });

  it('edição concorrente gera conflito sem sobrescrever e pode ser resolvida', async () => {
    const roster = await rosterOf(IDS.class500);
    const [{ d }] = await t.admin<{ d: string }>(`select (public.school_today($1) - 2)::text as d`, [IDS.school1]);
    const allPresent = roster.map((id) => ({ student_id: id, status: 'present' }));

    const v1 = await sync(IDS.marina, { classroomId: IDS.class500, date: d, status: 'completed', records: allPresent });
    assert.equal(v1.status, 'applied');

    // Coordenação corrige a partir da versão atual.
    const coordEdit = allPresent.map((r, i) => (i === 0 ? { ...r, status: 'justified' } : r));
    const v2 = await sync(IDS.coordinator, { classroomId: IDS.class500, date: d, status: 'completed', records: coordEdit, baseVersion: v1.version as number });
    assert.equal(v2.status, 'applied');

    // Professora (offline) envia edição baseada na versão antiga.
    const teacherEdit = allPresent.map((r, i) => (i === 0 ? { ...r, status: 'absent' } : r));
    const conflict = await sync(IDS.marina, { classroomId: IDS.class500, date: d, status: 'completed', records: teacherEdit, baseVersion: v1.version as number });
    assert.equal(conflict.status, 'conflict');

    const [kept] = await t.admin<{ status: string }>(
      `select status from attendance_records where session_id = $1 and student_id = $2`, [v1.session_id, roster[0]]);
    assert.equal(kept.status, 'justified', 'o dado da coordenação não pode ser sobrescrito silenciosamente');

    await t.as(IDS.coordinator, `select public.resolve_attendance_conflict($1, true)`, [conflict.conflict_id]);
    const [after] = await t.admin<{ status: string }>(
      `select status from attendance_records where session_id = $1 and student_id = $2`, [v1.session_id, roster[0]]);
    assert.equal(after.status, 'absent');
    const [c] = await t.admin<{ status: string }>(`select status from attendance_conflicts where id = $1`, [conflict.conflict_id]);
    assert.equal(c.status, 'accepted');
  });

  it('responsável vê apenas chamadas concluídas', async () => {
    const drafts = await t.as<{ n: number }>(IDS.rita,
      `select count(*)::int as n from attendance_sessions where status = 'draft'`);
    assert.equal(drafts[0].n, 0);
  });
});

describe('Convites e primeiro acesso', () => {
  const newTeacher = randomUUID();
  const newGuardian = randomUUID();

  it('coordenação cria convite de professor e o código é resgatado uma vez', async () => {
    const [{ invite }] = await t.as<{ invite: { code: string } }>(IDS.coordinator,
      `select public.create_invite($1, 'teacher') as invite`, [IDS.school1]);
    assert.match(invite.code, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

    const [stored] = await t.admin<{ n: number }>(
      `select count(*)::int as n from invitations where code_hash = $1`, [invite.code]);
    assert.equal(stored.n, 0, 'o código em texto puro não pode ser armazenado');

    await t.createUser(newTeacher, 'novo.professor@presenca.demo', 'Novo Professor');
    const [{ r }] = await t.as<{ r: { role: string } }>(newTeacher, `select public.redeem_invite($1) as r`, [invite.code.toLowerCase()]);
    assert.equal(r.role, 'teacher');

    const other = randomUUID();
    await t.createUser(other, 'outro@presenca.demo', 'Outro');
    await assert.rejects(t.as(other, `select public.redeem_invite($1)`, [invite.code]), /inválido ou expirado/);
  });

  it('responsável/professor não cria convites', async () => {
    await assert.rejects(t.as(IDS.rita, `select public.create_invite($1, 'teacher')`, [IDS.school1]), /Acesso negado/);
    await assert.rejects(t.as(IDS.coordinator, `select public.create_invite($1, 'coordinator')`, [IDS.school1]), /administração da plataforma/);
  });

  it('convite de responsável vincula a conta ao cadastro correto', async () => {
    await t.createUser(newGuardian, 'jose@presenca.demo', 'José');
    assert.equal(await count(newGuardian, 'students'), 0);
    await t.as(newGuardian, `select public.redeem_invite('DEMO-RESP-2026')`);
    const rows = await t.as<{ id: string }>(newGuardian, 'select id from public.students');
    assert.deepEqual(rows.map((r) => r.id), [IDS.studentLucas]);
  });

  it('código inválido é rejeitado', async () => {
    await assert.rejects(t.as(newGuardian, `select public.redeem_invite('XXXX-YYYY-ZZZZ')`), /inválido ou expirado/);
  });
});

describe('Comunicados, notificações e dashboards', () => {
  it('responsável recebe comunicados e confirma ciência', async () => {
    const rows = await t.as<{ id: string; requires_ack: boolean }>(IDS.rita, 'select id, requires_ack from public.announcements');
    assert.equal(rows.length, 2);
    const ack = rows.find((r) => r.requires_ack)!;
    await t.as(IDS.rita, `select public.mark_announcement_read($1, true)`, [ack.id]);
    const [rec] = await t.as<{ acknowledged_at: string | null }>(IDS.rita,
      `select acknowledged_at from announcement_recipients where announcement_id = $1`, [ack.id]);
    assert.ok(rec.acknowledged_at);
  });

  it('estudante da escola 2 não recebe comunicados da escola 1', async () => {
    assert.equal(await count(IDS.coordinator2, 'announcements'), 0);
  });

  it('notificação de um usuário não pode ser marcada por outro', async () => {
    const [n] = await t.admin<{ id: string }>(`select id from notifications where recipient_id = $1 limit 1`, [IDS.rita]);
    await t.as(IDS.marina, `select public.mark_notification_read($1)`, [n.id]);
    const [after] = await t.admin<{ read_at: string | null }>(`select read_at from notifications where id = $1`, [n.id]);
    assert.equal(after.read_at, null);
  });

  it('dashboard da escola é restrito à coordenação/direção', async () => {
    const [{ d }] = await t.as<{ d: Record<string, unknown> }>(IDS.coordinator,
      `select public.get_school_dashboard($1, current_date - 30, current_date) as d`, [IDS.school1]);
    assert.equal(d.total_students, 655);
    assert.ok(Number(d.attendance_percent) > 50);
    await assert.rejects(
      t.as(IDS.marina, `select public.get_school_dashboard($1, current_date - 30, current_date)`, [IDS.school1]), /Acesso negado/);
    await assert.rejects(
      t.as(IDS.coordinator2, `select public.get_school_dashboard($1, current_date - 30, current_date)`, [IDS.school1]), /Acesso negado/);
  });

  it('dashboard do professor lista turmas e chamadas pendentes', async () => {
    const [{ d }] = await t.as<{ d: { classrooms: unknown[]; pending_sessions: unknown[] } }>(IDS.caio,
      `select public.get_teacher_dashboard($1) as d`, [IDS.school1]);
    assert.equal(d.classrooms.length, 1);
    assert.ok(Array.isArray(d.pending_sessions));
  });

  it('resumo de frequência respeita o vínculo', async () => {
    const [{ s }] = await t.as<{ s: { total: number; attendance_percent: number | null } }>(IDS.rita,
      `select public.get_student_attendance_summary($1, current_date - 60, current_date) as s`, [IDS.studentLucas]);
    assert.ok(s.total > 0);
    await assert.rejects(
      t.as(IDS.caio, `select public.get_student_attendance_summary($1, current_date - 60, current_date)`, [IDS.studentLucas]),
      /Acesso negado/);
  });

  it('percentual não é exibido quando há poucos registros', async () => {
    const [{ s }] = await t.as<{ s: { total: number; attendance_percent: number | null } }>(IDS.rita,
      `select public.get_student_attendance_summary($1, current_date - 2, current_date) as s`, [IDS.studentLucas]);
    assert.ok(s.total < 5);
    assert.equal(s.attendance_percent, null);
  });

  it('administração vê visão geral sem dados pessoais', async () => {
    const [{ o }] = await t.as<{ o: Record<string, unknown>[] }>(IDS.admin, `select public.get_platform_overview() as o`);
    assert.equal(o.length, 2);
    assert.ok(!JSON.stringify(o).includes('Lucas'));
    await assert.rejects(t.as(IDS.coordinator, `select public.get_platform_overview()`), /Acesso negado/);
  });

  it('operações sensíveis ficam registradas na auditoria', async () => {
    const rows = await t.as<{ n: number }>(IDS.coordinator,
      `select count(*)::int as n from audit_logs where entity = 'school_memberships'`);
    assert.ok(rows[0].n > 0);
    assert.equal(await count(IDS.marina, 'audit_logs'), 0);
  });

  it('funções internas não podem ser chamadas pelo app', async () => {
    await assert.rejects(t.as(IDS.coordinator, `select public.purge_expired_data()`), /permission denied/);
  });
});

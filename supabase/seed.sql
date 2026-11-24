-- =============================================================================
-- EduVínculo — dados de demonstração (100% fictícios)
-- -----------------------------------------------------------------------------
-- Nenhum nome, e-mail ou documento pertence a pessoas reais. Os e-mails usam o
-- domínio reservado ".demo", que não recebe mensagens.
-- Senha de todas as contas de demonstração: Demo@2026
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Contas (auth.users + auth.identities)
-- -----------------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'admin@eduvinculo.demo',        'Administração EduVínculo'),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'coordenacao@eduvinculo.demo',  'Helena Prado (Coordenação)'),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'direcao@eduvinculo.demo',      'Roberto Antunes (Direção)'),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'professora@eduvinculo.demo',   'Marina Duarte'),
      ('00000000-0000-4000-a000-000000000005'::uuid, 'professor@eduvinculo.demo',    'Caio Ribeiro'),
      ('00000000-0000-4000-a000-000000000006'::uuid, 'responsavel@eduvinculo.demo',  'Rita Moura'),
      ('00000000-0000-4000-a000-000000000007'::uuid, 'estudante@eduvinculo.demo',    'Lucas Moura'),
      ('00000000-0000-4000-a000-000000000009'::uuid, 'coordenacao2@eduvinculo.demo', 'Sônia Freitas (Coordenação)')
    ) as t(id, email, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', '')
    on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now())
    on conflict do nothing;
  end loop;
end;
$$;

update public.profiles set is_platform_admin = true where id = '00000000-0000-4000-a000-000000000001';

-- -----------------------------------------------------------------------------
-- Escolas (Teresina-PI)
-- -----------------------------------------------------------------------------
insert into public.schools (id, name, inep_code, city, state, timezone, address, phone, email, created_by) values
  ('10000000-0000-4000-a000-000000000001', 'Escola Municipal Vínculo do Saber', '99000001', 'Teresina', 'PI',
   'America/Fortaleza', 'Rua Fictícia das Flores, 100 — Bairro Exemplo', '(86) 0000-0001', 'contato@vinculodosaber.demo',
   '00000000-0000-4000-a000-000000000001'),
  ('10000000-0000-4000-a000-000000000002', 'Escola Estadual Horizonte Azul', '99000002', 'Teresina', 'PI',
   'America/Fortaleza', 'Avenida Imaginária, 200 — Bairro Modelo', '(86) 0000-0002', 'contato@horizonteazul.demo',
   '00000000-0000-4000-a000-000000000001');

-- Regras: a escola 1 usa os valores padrão (75%, 2 consecutivas, 3/semana, 5 em 30 dias).

insert into public.school_memberships (school_id, user_id, role) values
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'coordinator'),
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', 'director'),
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004', 'teacher'),
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000005', 'teacher'),
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006', 'guardian'),
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000007', 'student'),
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000009', 'coordinator');

-- -----------------------------------------------------------------------------
-- Turmas
-- -----------------------------------------------------------------------------
insert into public.classrooms (id, school_id, name, grade, shift, school_year) values
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '6º Ano A', '6º ano', 'morning', extract(year from current_date)::int),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', '8º Ano C', '8º ano', 'afternoon', extract(year from current_date)::int),
  ('20000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', 'Turma de Teste — 100 estudantes', 'Benchmark', 'morning', extract(year from current_date)::int),
  ('20000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000001', 'Turma de Teste — 500 estudantes', 'Benchmark', 'morning', extract(year from current_date)::int),
  ('20000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000002', '9º Ano A', '9º ano', 'morning', extract(year from current_date)::int);

insert into public.classroom_teachers (classroom_id, teacher_id, subject) values
  ('20000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004', 'Matemática'),
  ('20000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004', 'Matemática'),
  ('20000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000004', 'Matemática'),
  ('20000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000005', 'Língua Portuguesa');

insert into public.class_schedules (classroom_id, weekday, starts_at, ends_at, lesson_slot, subject, teacher_id)
select '20000000-0000-4000-a000-000000000001'::uuid, d, '07:00'::time, '07:50'::time, 1, 'Matemática', '00000000-0000-4000-a000-000000000004'::uuid
  from generate_series(1, 5) d
union all
select '20000000-0000-4000-a000-000000000002'::uuid, d, '13:00'::time, '13:50'::time, 1, 'Língua Portuguesa', '00000000-0000-4000-a000-000000000005'::uuid
  from generate_series(1, 5) d
union all
select '20000000-0000-4000-a000-000000000003'::uuid, d, '09:00'::time, '09:50'::time, 1, 'Matemática', '00000000-0000-4000-a000-000000000004'::uuid
  from unnest(array[1, 3]) d
union all
select '20000000-0000-4000-a000-000000000004'::uuid, d, '10:00'::time, '10:50'::time, 1, 'Matemática', '00000000-0000-4000-a000-000000000004'::uuid
  from unnest(array[2, 4]) d;

-- -----------------------------------------------------------------------------
-- Estudantes fictícios (nomes gerados por combinação)
-- -----------------------------------------------------------------------------
insert into public.students (id, school_id, full_name, registration_code, birth_date, user_id) values
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'Lucas Moura Teixeira', 'VS-2026-0001', '2014-03-12', '00000000-0000-4000-a000-000000000007'),
  ('30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'Ana Clara Moura Teixeira', 'VS-2026-0002', '2012-08-30', null);

create temporary table _names as
select array['Alice','Miguel','Helena','Arthur','Laura','Heitor','Valentina','Bernardo','Sophia','Davi',
             'Isabella','Gabriel','Manuela','Pedro','Júlia','Samuel','Lorena','Enzo','Cecília','Rafael',
             'Beatriz','Lorenzo','Mariana','Benício','Lívia','Matheus','Giovanna','Gustavo','Yasmin','Nicolas',
             'Clara','Joaquim','Luísa','Murilo','Antonella','Vicente','Maria Eduarda','Isaac','Elisa','Otávio'] as firsts,
       array['Silva','Sousa','Carvalho','Araújo','Lima','Oliveira','Pereira','Rodrigues','Alves','Nascimento',
             'Costa','Ribeiro','Martins','Barbosa','Rocha','Fernandes','Gomes','Monteiro','Cardoso','Teles',
             'Batista','Moreira','Freitas','Castro','Mendes','Pinheiro','Viana','Campos','Nunes','Brito'] as lasts;

-- Gera estudantes: 28 (6º A, + Lucas = 29... completados para 30), 24 (8º C, + Ana Clara = 25), 100, 500 e 20 (escola 2).
create temporary table _gen as
select g.classroom_id, g.school_id, g.prefix, i,
       n.firsts[1 + (i * 7 + g.seed) % 40] || ' ' || n.lasts[1 + (i * 11 + g.seed) % 30] || ' ' || n.lasts[1 + (i * 17 + g.seed * 3) % 30] as full_name
  from (values
          ('20000000-0000-4000-a000-000000000001'::uuid, '10000000-0000-4000-a000-000000000001'::uuid, 'VS-6A', 29, 1),
          ('20000000-0000-4000-a000-000000000002'::uuid, '10000000-0000-4000-a000-000000000001'::uuid, 'VS-8C', 24, 2),
          ('20000000-0000-4000-a000-000000000003'::uuid, '10000000-0000-4000-a000-000000000001'::uuid, 'VS-T100', 100, 3),
          ('20000000-0000-4000-a000-000000000004'::uuid, '10000000-0000-4000-a000-000000000001'::uuid, 'VS-T500', 500, 4),
          ('20000000-0000-4000-a000-000000000005'::uuid, '10000000-0000-4000-a000-000000000002'::uuid, 'HA-9A', 20, 5)
       ) as g(classroom_id, school_id, prefix, qty, seed)
 cross join _names n
 cross join lateral generate_series(1, g.qty) i;

insert into public.students (school_id, full_name, registration_code, birth_date)
select school_id, full_name, prefix || '-' || lpad(i::text, 4, '0'),
       make_date(2010 + (i % 4), 1 + (i % 12), 1 + (i % 28))
  from _gen;

insert into public.classroom_students (classroom_id, student_id, start_date)
select g.classroom_id, s.id, date_trunc('year', current_date)::date
  from _gen g
  join public.students s on s.registration_code = g.prefix || '-' || lpad(g.i::text, 4, '0') and s.school_id = g.school_id;

insert into public.classroom_students (classroom_id, student_id, start_date) values
  ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', date_trunc('year', current_date)::date),
  ('20000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000002', date_trunc('year', current_date)::date);

-- -----------------------------------------------------------------------------
-- Responsáveis
-- -----------------------------------------------------------------------------
insert into public.guardians (id, school_id, full_name, email, phone, user_id) values
  ('40000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'Rita Moura', 'responsavel@eduvinculo.demo', '(86) 90000-0006', '00000000-0000-4000-a000-000000000006'),
  ('40000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'José Moura Teixeira', 'jose.moura@eduvinculo.demo', '(86) 90000-0008', null);

insert into public.student_guardians (student_id, guardian_id, relationship) values
  ('30000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', 'mãe'),
  ('30000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000001', 'mãe'),
  ('30000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', 'pai');

-- -----------------------------------------------------------------------------
-- Histórico de frequência: dias úteis das últimas 6 semanas (exceto hoje,
-- para que a chamada de hoje apareça como pendente na demonstração).
-- -----------------------------------------------------------------------------
create temporary table _days as
select d::date as d
  from generate_series(current_date - 42, current_date - 1, interval '1 day') d
 where extract(isodow from d) between 1 and 5;

insert into public.attendance_sessions (id, school_id, classroom_id, lesson_date, lesson_slot, status, version, recorded_by, updated_by, completed_at)
select gen_random_uuid(), c.school_id, c.id, dd.d, 1, 'completed', 1, t.teacher_id, t.teacher_id, dd.d + time '08:00'
  from public.classrooms c
  join public.classroom_teachers t on t.classroom_id = c.id
  join _days dd on true
 where c.id in ('20000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000002',
                '20000000-0000-4000-a000-000000000003', '20000000-0000-4000-a000-000000000004')
   and (c.id in ('20000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000002')
        or (c.id = '20000000-0000-4000-a000-000000000003' and extract(isodow from dd.d) in (1, 3))
        or (c.id = '20000000-0000-4000-a000-000000000004' and extract(isodow from dd.d) in (2, 4)));

-- Distribuição determinística: ~88% presença, ~5% atraso, ~4% falta, ~3% justificada.
-- Alguns estudantes (índice terminado em 3) têm mais faltas, para gerar alertas.
insert into public.attendance_records (session_id, school_id, student_id, status, recorded_by)
select s.id, s.school_id, cs.student_id,
       case
         when st.id = '30000000-0000-4000-a000-000000000001' then
           case when s.lesson_date in (select d from _days order by d desc limit 2) then 'absent'
                when (abs(hashtext(st.id::text || s.lesson_date::text)) % 100) < 15 then 'absent'
                else 'present' end
         when right(st.registration_code, 1) = '3' and (abs(hashtext(st.id::text || s.lesson_date::text)) % 100) < 35 then 'absent'
         else case
           when (abs(hashtext(st.id::text || s.lesson_date::text)) % 100) < 88 then 'present'
           when (abs(hashtext(st.id::text || s.lesson_date::text)) % 100) < 93 then 'late'
           when (abs(hashtext(st.id::text || s.lesson_date::text)) % 100) < 97 then 'absent'
           else 'justified' end
       end::public.attendance_status,
       s.recorded_by
  from public.attendance_sessions s
  join public.classroom_students cs on cs.classroom_id = s.classroom_id and cs.active
  join public.students st on st.id = cs.student_id;

-- Gera notificações (faltas e alertas) das duas últimas chamadas do 6º Ano A e 8º Ano C.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.attendance_sessions
     where classroom_id in ('20000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000002')
       and lesson_date >= (select max(d) from _days) - 3
     order by lesson_date
  loop
    perform public.process_completed_session(v_id);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Comunicados, calendário, acompanhamento pedagógico
-- -----------------------------------------------------------------------------
select public.publish_announcement('10000000-0000-4000-a000-000000000001',
  'Reunião de pais e responsáveis',
  'Convidamos todas as famílias para a reunião bimestral na próxima sexta-feira, às 18h, no auditório da escola. Pauta: frequência escolar, avaliações e projetos do bimestre.',
  'all', null, true);
select public.publish_announcement('10000000-0000-4000-a000-000000000001',
  'Feira de Ciências do 6º Ano',
  'Os estudantes do 6º Ano A apresentarão seus projetos na quadra da escola. Familiares são bem-vindos.',
  'classroom', '20000000-0000-4000-a000-000000000001', false);

insert into public.calendar_events (school_id, classroom_id, title, description, event_date, event_type) values
  ('10000000-0000-4000-a000-000000000001', null, 'Reunião de pais e responsáveis', 'Auditório, 18h', current_date + 4, 'meeting'),
  ('10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', 'Feira de Ciências', 'Quadra da escola', current_date + 9, 'event'),
  ('10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', 'Avaliação de Matemática', 'Conteúdo: frações', current_date + 6, 'exam'),
  ('10000000-0000-4000-a000-000000000001', null, 'Feriado municipal (fictício)', 'Sem aulas', current_date + 14, 'holiday');

insert into public.pedagogical_followups (school_id, student_id, identified_at, reason, situation, assigned_to, actions_taken, next_followup_date, status, created_by)
values
  ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', current_date - 1,
   'Faltas consecutivas identificadas pelo sistema',
   'Duas faltas consecutivas nas últimas aulas de Matemática.',
   '00000000-0000-4000-a000-000000000002',
   'Contato telefônico agendado com a responsável.', current_date + 2, 'open',
   '00000000-0000-4000-a000-000000000002');

insert into public.pedagogical_followups (school_id, student_id, identified_at, reason, situation, assigned_to, actions_taken, status, outcome, closed_at, created_by)
select '10000000-0000-4000-a000-000000000001', s.id, current_date - 20,
       'Frequência abaixo do mínimo configurado', 'Atrasos recorrentes no primeiro horário.',
       '00000000-0000-4000-a000-000000000002', 'Conversa com a família e ajuste do transporte escolar.',
       'closed', 'Frequência normalizada nas semanas seguintes.', now() - interval '5 days',
       '00000000-0000-4000-a000-000000000002'
  from public.students s where s.registration_code = 'VS-6A-0003';

-- -----------------------------------------------------------------------------
-- Convites de demonstração (códigos documentados no README)
-- -----------------------------------------------------------------------------
insert into public.invitations (school_id, role, code_hash, code_hint, guardian_id, student_id, label, expires_at, max_uses, created_by) values
  ('10000000-0000-4000-a000-000000000001', 'teacher', public.hash_invite_code('DEMO-PROF-2026'), '2026', null, null,
   'Convite de demonstração — professores', now() + interval '365 days', 20, '00000000-0000-4000-a000-000000000002'),
  ('10000000-0000-4000-a000-000000000001', 'guardian', public.hash_invite_code('DEMO-RESP-2026'), '2026',
   '40000000-0000-4000-a000-000000000002', null, 'José Moura Teixeira (pai de Lucas)', now() + interval '365 days', 1,
   '00000000-0000-4000-a000-000000000002'),
  ('10000000-0000-4000-a000-000000000001', 'student', public.hash_invite_code('DEMO-ALUNO-2026'), '2026', null,
   '30000000-0000-4000-a000-000000000002', 'Ana Clara Moura Teixeira', now() + interval '365 days', 1,
   '00000000-0000-4000-a000-000000000002');

drop table _names;
drop table _gen;
drop table _days;

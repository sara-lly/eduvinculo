-- =============================================================================
-- Presença+ — 0005: funções RPC (regras de negócio no servidor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Contexto do usuário (1 ida ao servidor em vez de N consultas)
-- -----------------------------------------------------------------------------
create or replace function public.get_my_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'created_at' from public.profiles p where p.id = auth.uid()),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'school_id', m.school_id, 'role', m.role,
               'school_name', s.name, 'school_city', s.city, 'school_state', s.state,
               'school_status', s.status, 'school_timezone', s.timezone)
             order by s.name, m.role)
        from public.school_memberships m
        join public.schools s on s.id = m.school_id
       where m.user_id = auth.uid() and m.active), '[]'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Convites
-- -----------------------------------------------------------------------------
create or replace function public.normalize_invite_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.hash_invite_code(p_code text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(public.normalize_invite_code(p_code), 'UTF8')), 'hex');
$$;

create or replace function public.create_invite(
  p_school uuid,
  p_role public.membership_role,
  p_student uuid default null,
  p_guardian uuid default null,
  p_label text default null,
  p_valid_days int default 7,
  p_max_uses int default 1)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_raw   text;
  v_code  text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if p_role in ('director', 'coordinator') then
    if not public.is_platform_admin() then
      raise exception 'Somente a administração da plataforma pode convidar a gestão escolar' using errcode = '42501';
    end if;
  elsif not public.is_school_staff(p_school) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_valid_days not between 1 and 60 then
    raise exception 'Validade deve estar entre 1 e 60 dias' using errcode = '22023';
  end if;
  if p_student is not null and not exists (select 1 from public.students where id = p_student and school_id = p_school and active) then
    raise exception 'Estudante não encontrado nesta escola' using errcode = '22023';
  end if;
  if p_guardian is not null and not exists (select 1 from public.guardians where id = p_guardian and school_id = p_school and active) then
    raise exception 'Responsável não encontrado nesta escola' using errcode = '22023';
  end if;

  -- 12 caracteres hexadecimais (48 bits) a partir de um UUID v4 aleatório.
  v_raw := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);
  v_exp := now() + make_interval(days => p_valid_days);

  insert into public.invitations (school_id, role, code_hash, code_hint, student_id, guardian_id, label, expires_at, max_uses, created_by)
  values (p_school, p_role, public.hash_invite_code(v_code), right(v_raw, 4), p_student, p_guardian,
          left(p_label, 120), v_exp, p_max_uses, auth.uid())
  returning id into v_id;

  -- O código é exibido apenas uma vez; somente o hash fica armazenado.
  return jsonb_build_object('id', v_id, 'code', v_code, 'expires_at', v_exp);
end;
$$;

create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  inv    public.invitations;
  sch    public.schools;
begin
  if v_uid is null then
    raise exception 'Autenticação necessária' using errcode = '28000';
  end if;

  select * into inv from public.invitations
   where code_hash = public.hash_invite_code(p_code)
   for update;

  if not found or inv.revoked or inv.expires_at < now() or inv.used_count >= inv.max_uses then
    -- Mensagem única para não revelar se o código existe.
    raise exception 'Código de convite inválido ou expirado' using errcode = '22023';
  end if;

  select * into sch from public.schools where id = inv.school_id;
  if sch.status <> 'active' then
    raise exception 'Escola indisponível no momento' using errcode = '22023';
  end if;

  if inv.role = 'student' then
    if exists (select 1 from public.students where id = inv.student_id and user_id is not null and user_id <> v_uid) then
      raise exception 'Este estudante já possui uma conta vinculada' using errcode = '22023';
    end if;
    update public.students set user_id = v_uid where id = inv.student_id;
  elsif inv.role = 'guardian' then
    if exists (select 1 from public.guardians where id = inv.guardian_id and user_id is not null and user_id <> v_uid) then
      raise exception 'Este responsável já possui uma conta vinculada' using errcode = '22023';
    end if;
    update public.guardians set user_id = v_uid where id = inv.guardian_id;
  end if;

  insert into public.school_memberships (school_id, user_id, role, created_by)
  values (inv.school_id, v_uid, inv.role, inv.created_by)
  on conflict (school_id, user_id, role) do update set active = true;

  update public.invitations set used_count = used_count + 1 where id = inv.id;

  return jsonb_build_object('school_id', inv.school_id, 'school_name', sch.name, 'role', inv.role);
end;
$$;

-- -----------------------------------------------------------------------------
-- Notificações (uso interno)
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_school uuid, p_recipient uuid, p_student uuid, p_type public.notification_type,
  p_title text, p_body text, p_date date, p_dedupe text, p_data jsonb default '{}'::jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  pref        public.notification_preferences;
  v_id        uuid;
  v_push      boolean;
begin
  select * into pref from public.notification_preferences where user_id = p_recipient and school_id = p_school;
  if found and (
       (p_type = 'absence' and not pref.absence_alerts)
    or (p_type = 'recurrent_absence' and not pref.recurrent_alerts)
    or (p_type = 'announcement' and not pref.announcements)) then
    return null;
  end if;

  insert into public.notifications (school_id, recipient_id, student_id, type, title, body, occurrence_date, dedupe_key, data)
  values (p_school, p_recipient, p_student, p_type, left(p_title, 160), left(p_body, 1000), p_date, p_dedupe, coalesce(p_data, '{}'::jsonb))
  on conflict (recipient_id, dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    return null; -- já notificado (deduplicação)
  end if;

  insert into public.notification_deliveries (notification_id, school_id, recipient_id, channel, status, attempts, sent_at)
  values (v_id, p_school, p_recipient, 'in_app', 'sent', 1, now());

  v_push := coalesce(pref.push_enabled, true) and exists (select 1 from public.push_tokens where user_id = p_recipient);
  insert into public.notification_deliveries (notification_id, school_id, recipient_id, channel, status, next_attempt_at)
  values (v_id, p_school, p_recipient, 'push', case when v_push then 'pending' else 'skipped' end,
          case when v_push then now() end);

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Faltas recorrentes (critérios configuráveis em attendance_rules)
-- Nunca rotula o estudante: apenas descreve os fatos que motivaram a atenção.
-- -----------------------------------------------------------------------------
create or replace function public.compute_student_alerts(
  p_school uuid,
  p_classroom uuid default null,
  p_student uuid default null,
  p_as_of date default null,
  p_only_flagged boolean default true)
returns table (
  student_id uuid, student_name text, classroom_id uuid, classroom_name text,
  total_records int, absences int, consecutive_absences int, week_absences int,
  attendance_percent numeric, reasons text[])
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_staff    boolean := public.is_service_context() or public.is_school_staff(p_school);
  v_teacher  boolean := public.has_school_role(p_school, array['teacher']::public.membership_role[]);
  r          public.attendance_rules;
  v_as_of    date;
  v_week     date;
begin
  if not v_staff and not v_teacher then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into r from public.attendance_rules where school_id = p_school;
  v_as_of := coalesce(p_as_of, public.school_today(p_school));
  v_week := date_trunc('week', v_as_of)::date;

  return query
  with enr as (
    select cs.student_id, cs.classroom_id
      from public.classroom_students cs
     where cs.school_id = p_school
       and cs.active
       and (p_classroom is null or cs.classroom_id = p_classroom)
       and (p_student is null or cs.student_id = p_student)
       and (v_staff or public.teaches_classroom(cs.classroom_id))
  ), recs as (
    select ar.student_id, s.lesson_date, ar.status,
           row_number() over (partition by ar.student_id order by s.lesson_date desc, s.lesson_slot desc) as rn
      from public.attendance_records ar
      join public.attendance_sessions s on s.id = ar.session_id
      join enr on enr.student_id = ar.student_id
     where s.school_id = p_school
       and s.status = 'completed'
       and s.lesson_date <= v_as_of
       and s.lesson_date > v_as_of - r.period_days
  ), agg as (
    select recs.student_id,
           count(*)::int as total,
           count(*) filter (where recs.status = 'absent')::int as abs_count,
           coalesce(min(recs.rn) filter (where recs.status <> 'absent') - 1, count(*))::int as consec,
           count(*) filter (where recs.status = 'absent' and recs.lesson_date >= v_week)::int as week_abs,
           count(*) filter (where recs.status = 'present'
                              or (recs.status = 'late' and r.late_counts_as_present)
                              or (recs.status = 'justified' and r.justified_counts_as_present))::int as present_eq
      from recs
     group by recs.student_id
  ), scored as (
    select enr.student_id as sid, st.full_name as sname, enr.classroom_id as cid, c.name as cname,
           coalesce(a.total, 0) as total, coalesce(a.abs_count, 0) as abs_count,
           coalesce(a.consec, 0) as consec, coalesce(a.week_abs, 0) as week_abs,
           case when coalesce(a.total, 0) >= r.min_records_for_percent
                then round(a.present_eq * 100.0 / a.total, 1) end as pct
      from enr
      join public.students st on st.id = enr.student_id
      join public.classrooms c on c.id = enr.classroom_id
      left join agg a on a.student_id = enr.student_id
  ), reasoned as (
    select scored.*,
           array_remove(array[
             case when consec >= r.consecutive_absences_threshold
                  then format('%s faltas consecutivas', consec) end,
             case when week_abs >= r.weekly_absences_threshold
                  then format('%s faltas nesta semana', week_abs) end,
             case when abs_count >= r.period_absences_threshold
                  then format('%s faltas nos últimos %s dias', abs_count, r.period_days) end,
             case when pct is not null and pct < r.min_attendance_percent
                  then format('Frequência de %s%% (mínimo configurado: %s%%)',
                              replace(pct::text, '.', ','), replace(r.min_attendance_percent::text, '.', ',')) end
           ], null) as why
      from scored
  )
  select sid, sname, cid, cname, total, abs_count, consec, week_abs, pct, why
    from reasoned
   where not p_only_flagged or cardinality(why) > 0
   order by cardinality(why) desc, consec desc, sname;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pós-processamento de uma chamada concluída (uso interno)
-- -----------------------------------------------------------------------------
create or replace function public.process_completed_session(p_session uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s    public.attendance_sessions;
  sch  public.schools;
  r    public.attendance_rules;
  rec  record;
  g    record;
  a    record;
  v_first text;
  v_date  text;
begin
  select * into s from public.attendance_sessions where id = p_session;
  if not found or s.status <> 'completed' then
    return;
  end if;
  select * into sch from public.schools where id = s.school_id;
  select * into r from public.attendance_rules where school_id = s.school_id;
  v_date := to_char(s.lesson_date, 'DD/MM/YYYY');

  for rec in
    select ar.student_id, st.full_name
      from public.attendance_records ar
      join public.students st on st.id = ar.student_id
     where ar.session_id = p_session and ar.status = 'absent'
  loop
    v_first := split_part(rec.full_name, ' ', 1);

    if r.notify_guardians_on_absence then
      for g in
        select distinct gu.user_id
          from public.student_guardians sg
          join public.guardians gu on gu.id = sg.guardian_id
         where sg.student_id = rec.student_id and sg.active and gu.active and gu.user_id is not null
      loop
        perform public.enqueue_notification(
          s.school_id, g.user_id, rec.student_id, 'absence',
          format('%s — falta registrada', sch.name),
          format('%s teve falta registrada na aula de %s.', v_first, v_date),
          s.lesson_date,
          format('absence:%s:%s', s.id, rec.student_id),
          jsonb_build_object('session_id', s.id));
      end loop;
    end if;

    for a in select * from public.compute_student_alerts(s.school_id, null, rec.student_id, s.lesson_date, true) loop
      for g in
        select distinct m.user_id from public.school_memberships m
         where m.school_id = s.school_id and m.active and m.role in ('director', 'coordinator')
      loop
        perform public.enqueue_notification(
          s.school_id, g.user_id, rec.student_id, 'recurrent_absence',
          format('%s — frequência requer atenção', sch.name),
          format('%s (%s): %s.', a.student_name, a.classroom_name, array_to_string(a.reasons, '; ')),
          s.lesson_date,
          format('alert:%s:%s', rec.student_id, to_char(s.lesson_date, 'IYYY-IW')),
          jsonb_build_object('reasons', to_jsonb(a.reasons)));
      end loop;

      if r.notify_guardians_on_alert then
        for g in
          select distinct gu.user_id
            from public.student_guardians sg
            join public.guardians gu on gu.id = sg.guardian_id
           where sg.student_id = rec.student_id and sg.active and gu.active and gu.user_id is not null
        loop
          perform public.enqueue_notification(
            s.school_id, g.user_id, rec.student_id, 'recurrent_absence',
            format('%s — acompanhamento de frequência', sch.name),
            format('A escola identificou ausências recorrentes de %s até %s. A coordenação está à disposição para conversar.', v_first, v_date),
            s.lesson_date,
            format('alert:%s:%s', rec.student_id, to_char(s.lesson_date, 'IYYY-IW')),
            '{}'::jsonb);
        end loop;
      end if;
    end loop;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sincronização idempotente de chamada (offline-first)
--   p_op_id:        id único da operação gerado no aparelho
--   p_session:      { id, classroom_id, lesson_date, lesson_slot, status }
--   p_records:      [{ student_id, status, note }]
--   p_base_version: versão do servidor que o aparelho conhecia (0 = nova)
-- -----------------------------------------------------------------------------
create or replace function public.sync_attendance_session(
  p_op_id uuid, p_session jsonb, p_records jsonb, p_base_version int default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_prev       jsonb;
  v_classroom  public.classrooms;
  v_date       date := (p_session ->> 'lesson_date')::date;
  v_slot       smallint := coalesce((p_session ->> 'lesson_slot')::smallint, 1);
  v_status     public.session_status := coalesce(p_session ->> 'status', 'draft')::public.session_status;
  v_missing    int;
  v_conflict   uuid;
  v_result     jsonb;
  s            public.attendance_sessions;
begin
  if v_uid is null then
    raise exception 'Autenticação necessária' using errcode = '28000';
  end if;

  -- 1) Idempotência: operação já processada? devolve o mesmo resultado.
  select result into v_prev from public.processed_ops where op_id = p_op_id and user_id = v_uid;
  if found then
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  select * into v_classroom from public.classrooms where id = (p_session ->> 'classroom_id')::uuid and active;
  if not found then
    raise exception 'Turma não encontrada' using errcode = 'P0002';
  end if;
  if not public.can_edit_session(v_classroom.id, v_date) then
    raise exception 'Sem permissão para registrar esta chamada' using errcode = '42501';
  end if;
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'Formato inválido' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_records) as x(student_id uuid)
     where not exists (
       select 1 from public.classroom_students cs
        where cs.classroom_id = v_classroom.id and cs.student_id = x.student_id and cs.active)) then
    raise exception 'Há estudantes que não pertencem a esta turma' using errcode = '22023';
  end if;

  -- 2) Sessão existente? Bloqueia a linha para serializar edições simultâneas.
  select * into s from public.attendance_sessions
   where classroom_id = v_classroom.id and lesson_date = v_date and lesson_slot = v_slot
   for update;

  if found then
    -- 3) Conflito: outra pessoa alterou depois da versão que este aparelho conhecia.
    if s.version <> coalesce(p_base_version, 0) and s.updated_by is distinct from v_uid then
      insert into public.attendance_conflicts (school_id, session_id, submitted_by, base_version, server_version, submitted_payload, server_snapshot)
      values (s.school_id, s.id, v_uid, coalesce(p_base_version, 0), s.version,
              jsonb_build_object('session', p_session, 'records', p_records),
              jsonb_build_object(
                'session', to_jsonb(s),
                'records', coalesce((select jsonb_agg(jsonb_build_object('student_id', ar.student_id, 'status', ar.status, 'note', ar.note))
                                       from public.attendance_records ar where ar.session_id = s.id), '[]'::jsonb)))
      returning id into v_conflict;

      v_result := jsonb_build_object('status', 'conflict', 'session_id', s.id, 'server_version', s.version, 'conflict_id', v_conflict);
      insert into public.processed_ops (op_id, user_id, result) values (p_op_id, v_uid, v_result);
      return v_result;
    end if;
  else
    insert into public.attendance_sessions (id, school_id, classroom_id, lesson_date, lesson_slot, status, version, recorded_by, updated_by)
    values (coalesce((p_session ->> 'id')::uuid, gen_random_uuid()), v_classroom.school_id, v_classroom.id, v_date, v_slot, 'draft', 0, v_uid, v_uid)
    returning * into s;
  end if;

  -- 4) Upsert dos registros (somente linhas realmente alteradas são escritas).
  insert into public.attendance_records (session_id, school_id, student_id, status, note, recorded_by, updated_by)
  select s.id, s.school_id, x.student_id, x.status, nullif(trim(x.note), ''), v_uid, v_uid
    from jsonb_to_recordset(p_records) as x(student_id uuid, status public.attendance_status, note text)
  on conflict (session_id, student_id) do update
     set status = excluded.status, note = excluded.note, updated_by = v_uid
   where public.attendance_records.status is distinct from excluded.status
      or public.attendance_records.note is distinct from excluded.note;

  -- 5) Chamada só pode ser concluída com todos os estudantes registrados.
  if v_status = 'completed' or s.status = 'completed' then
    select count(*) into v_missing
      from public.classroom_students cs
     where cs.classroom_id = v_classroom.id and cs.active and cs.start_date <= v_date
       and not exists (select 1 from public.attendance_records ar where ar.session_id = s.id and ar.student_id = cs.student_id);
    if v_missing > 0 then
      raise exception 'Chamada incompleta: % estudante(s) sem registro', v_missing using errcode = '23514';
    end if;
  end if;

  update public.attendance_sessions
     set status = case when s.status = 'completed' then 'completed'::public.session_status else v_status end,
         version = s.version + 1,
         updated_by = v_uid,
         completed_at = case when s.status <> 'completed' and v_status = 'completed' then now() else s.completed_at end
   where id = s.id
   returning * into s;

  if s.status = 'completed' then
    perform public.process_completed_session(s.id);
  end if;

  v_result := jsonb_build_object(
    'status', 'applied', 'session_id', s.id, 'version', s.version,
    'session_status', s.status, 'updated_at', s.updated_at);
  insert into public.processed_ops (op_id, user_id, result) values (p_op_id, v_uid, v_result);
  return v_result;
end;
$$;

create or replace function public.resolve_attendance_conflict(p_conflict uuid, p_accept boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  c      public.attendance_conflicts;
  s      public.attendance_sessions;
begin
  select * into c from public.attendance_conflicts where id = p_conflict for update;
  if not found or c.status <> 'open' then
    raise exception 'Conflito não encontrado ou já resolvido' using errcode = 'P0002';
  end if;
  select * into s from public.attendance_sessions where id = c.session_id for update;
  if not public.can_edit_session(s.classroom_id, s.lesson_date) then
    raise exception 'Sem permissão para resolver este conflito' using errcode = '42501';
  end if;

  if p_accept then
    insert into public.attendance_records (session_id, school_id, student_id, status, note, recorded_by, updated_by)
    select s.id, s.school_id, x.student_id, x.status, nullif(trim(x.note), ''), c.submitted_by, v_uid
      from jsonb_to_recordset(c.submitted_payload -> 'records') as x(student_id uuid, status public.attendance_status, note text)
      join public.classroom_students cs on cs.student_id = x.student_id and cs.classroom_id = s.classroom_id and cs.active
    on conflict (session_id, student_id) do update
       set status = excluded.status, note = excluded.note, updated_by = v_uid;

    update public.attendance_sessions set version = version + 1, updated_by = v_uid where id = s.id returning * into s;
    if s.status = 'completed' then
      perform public.process_completed_session(s.id);
    end if;
  end if;

  update public.attendance_conflicts
     set status = case when p_accept then 'accepted' else 'rejected' end,
         resolved_by = v_uid, resolved_at = now()
   where id = c.id;

  return jsonb_build_object('status', case when p_accept then 'accepted' else 'rejected' end, 'session_version', s.version);
end;
$$;

-- -----------------------------------------------------------------------------
-- Histórico / resumo de frequência de um estudante
-- -----------------------------------------------------------------------------
create or replace function public.get_student_attendance_summary(p_student uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school  uuid;
  r         public.attendance_rules;
  v_result  jsonb;
begin
  if not public.can_view_student(p_student) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  select school_id into v_school from public.students where id = p_student;
  select * into r from public.attendance_rules where school_id = v_school;

  with recs as (
    select s.lesson_date, s.lesson_slot, ar.status, ar.note
      from public.attendance_records ar
      join public.attendance_sessions s on s.id = ar.session_id
     where ar.student_id = p_student
       and s.status = 'completed'
       and s.lesson_date between p_from and p_to
  ), counts as (
    select count(*)::int as total,
           count(*) filter (where status = 'present')::int as present,
           count(*) filter (where status = 'absent')::int as absent,
           count(*) filter (where status = 'late')::int as late,
           count(*) filter (where status = 'justified')::int as justified,
           count(*) filter (where status = 'present'
                              or (status = 'late' and r.late_counts_as_present)
                              or (status = 'justified' and r.justified_counts_as_present))::int as present_eq
      from recs
  )
  select jsonb_build_object(
    'total', c.total, 'present', c.present, 'absent', c.absent, 'late', c.late, 'justified', c.justified,
    'attendance_percent', case when c.total >= r.min_records_for_percent then round(c.present_eq * 100.0 / c.total, 1) end,
    'min_records_for_percent', r.min_records_for_percent,
    'min_attendance_percent', r.min_attendance_percent,
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'total', m.total, 'absent', m.absent, 'percent', m.pct) order by m.month)
        from (
          select to_char(lesson_date, 'YYYY-MM') as month, count(*)::int as total,
                 count(*) filter (where status = 'absent')::int as absent,
                 round(count(*) filter (where status = 'present'
                                          or (status = 'late' and r.late_counts_as_present)
                                          or (status = 'justified' and r.justified_counts_as_present)) * 100.0 / count(*), 1) as pct
            from recs group by 1) m), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('date', lesson_date, 'slot', lesson_slot, 'status', status, 'note', note)
                       order by lesson_date desc, lesson_slot desc)
        from recs), '[]'::jsonb))
    into v_result
    from counts c;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Dashboards
-- -----------------------------------------------------------------------------
create or replace function public.get_school_dashboard(p_school uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r         public.attendance_rules;
  v_result  jsonb;
begin
  if not public.is_school_staff(p_school) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into r from public.attendance_rules where school_id = p_school;

  with sess as (
    select id, classroom_id, lesson_date from public.attendance_sessions
     where school_id = p_school and status = 'completed' and lesson_date between p_from and p_to
  ), rec as (
    select ar.status, sess.classroom_id, sess.lesson_date,
           (ar.status = 'present'
            or (ar.status = 'late' and r.late_counts_as_present)
            or (ar.status = 'justified' and r.justified_counts_as_present)) as ok
      from public.attendance_records ar
      join sess on sess.id = ar.session_id
  )
  select jsonb_build_object(
    'total_students', (select count(*) from public.students where school_id = p_school and active),
    'total_classrooms', (select count(*) from public.classrooms where school_id = p_school and active),
    'sessions_completed', (select count(*) from sess),
    'total_records', (select count(*) from rec),
    'absences', (select count(*) from rec where status = 'absent'),
    'late', (select count(*) from rec where status = 'late'),
    'justified', (select count(*) from rec where status = 'justified'),
    'attendance_percent', (select case when count(*) >= r.min_records_for_percent
                                       then round(count(*) filter (where ok) * 100.0 / count(*), 1) end from rec),
    'classrooms', coalesce((
      select jsonb_agg(x order by (x ->> 'absences')::int desc)
        from (select jsonb_build_object('id', c.id, 'name', c.name,
                       'absences', count(*) filter (where rec.status = 'absent'),
                       'attendance_percent', round(count(*) filter (where rec.ok) * 100.0 / nullif(count(*), 0), 1)) as x
                from rec join public.classrooms c on c.id = rec.classroom_id
               group by c.id, c.name
               order by count(*) filter (where rec.status = 'absent') desc
               limit 5) t), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.lesson_date, 'attendance_percent', d.pct) order by d.lesson_date)
        from (select lesson_date, round(count(*) filter (where ok) * 100.0 / count(*), 1) as pct
                from rec group by lesson_date) d), '[]'::jsonb),
    'open_followups', (select count(*) from public.pedagogical_followups where school_id = p_school and status <> 'closed'),
    'open_conflicts', (select count(*) from public.attendance_conflicts where school_id = p_school and status = 'open'),
    'flagged_students', (select count(*) from public.compute_student_alerts(p_school))
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_teacher_dashboard(p_school uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_today  date := public.school_today(p_school);
  v_now    time := (now() at time zone coalesce((select timezone from public.schools where id = p_school), 'America/Sao_Paulo'))::time;
  r        public.attendance_rules;
  v_result jsonb;
begin
  if not public.has_school_role(p_school, array['teacher']::public.membership_role[]) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into r from public.attendance_rules where school_id = p_school;

  with mine as (
    select distinct c.id, c.name
      from public.classroom_teachers ct
      join public.classrooms c on c.id = ct.classroom_id and c.active
     where ct.teacher_id = v_uid and ct.active and c.school_id = p_school
  ), days as (
    select d::date as d from generate_series(v_today - least(6, r.teacher_edit_window_days), v_today, interval '1 day') d
  ), pending as (
    select mine.id as classroom_id, mine.name, days.d, cs.lesson_slot, cs.starts_at, cs.subject
      from mine
      join public.class_schedules cs on cs.classroom_id = mine.id and cs.active
      join days on extract(dow from days.d) = cs.weekday
     where (days.d < v_today or cs.starts_at <= v_now)
       and not exists (
         select 1 from public.attendance_sessions s
          where s.classroom_id = mine.id and s.lesson_date = days.d and s.lesson_slot = cs.lesson_slot
            and s.status = 'completed')
  ), upcoming as (
    select mine.id as classroom_id, mine.name, (v_today + o)::date as d, cs.starts_at, cs.ends_at, cs.subject, cs.lesson_slot
      from mine
      join public.class_schedules cs on cs.classroom_id = mine.id and cs.active
      join generate_series(0, 6) o on extract(dow from v_today + o) = cs.weekday
     where o > 0 or cs.starts_at > v_now
     order by 3, 4
     limit 5
  )
  select jsonb_build_object(
    'classrooms', coalesce((
      select jsonb_agg(jsonb_build_object('id', mine.id, 'name', mine.name,
               'student_count', (select count(*) from public.classroom_students cs where cs.classroom_id = mine.id and cs.active))
             order by mine.name)
        from mine), '[]'::jsonb),
    'pending_sessions', coalesce((
      select jsonb_agg(jsonb_build_object('classroom_id', classroom_id, 'classroom_name', name, 'lesson_date', d,
                                          'lesson_slot', lesson_slot, 'starts_at', starts_at, 'subject', subject)
             order by d desc, starts_at)
        from pending), '[]'::jsonb),
    'completed_last_7_days', (
      select count(*) from public.attendance_sessions s
       where s.classroom_id in (select id from mine) and s.status = 'completed' and s.lesson_date > v_today - 7),
    'next_lessons', coalesce((
      select jsonb_agg(jsonb_build_object('classroom_id', classroom_id, 'classroom_name', name, 'lesson_date', d,
                                          'starts_at', starts_at, 'ends_at', ends_at, 'subject', subject, 'lesson_slot', lesson_slot))
        from upcoming), '[]'::jsonb),
    'flagged_students', coalesce((
      select jsonb_agg(jsonb_build_object('student_id', a.student_id, 'student_name', a.student_name,
                                          'classroom_name', a.classroom_name, 'reasons', a.reasons))
        from (select * from public.compute_student_alerts(p_school) limit 10) a), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_attendance_report(p_school uuid, p_from date, p_to date, p_classroom uuid default null)
returns table (
  classroom_id uuid, classroom_name text, student_id uuid, student_name text, registration_code text,
  total int, present int, absent int, late int, justified int, attendance_percent numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r public.attendance_rules;
begin
  if not public.is_school_staff(p_school) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  select * into r from public.attendance_rules where school_id = p_school;

  return query
  select c.id, c.name, st.id, st.full_name, st.registration_code,
         count(ar.id)::int,
         count(ar.id) filter (where ar.status = 'present')::int,
         count(ar.id) filter (where ar.status = 'absent')::int,
         count(ar.id) filter (where ar.status = 'late')::int,
         count(ar.id) filter (where ar.status = 'justified')::int,
         case when count(ar.id) >= r.min_records_for_percent then
           round(count(ar.id) filter (where ar.status = 'present'
                                        or (ar.status = 'late' and r.late_counts_as_present)
                                        or (ar.status = 'justified' and r.justified_counts_as_present)) * 100.0 / count(ar.id), 1)
         end
    from public.classroom_students cs
    join public.classrooms c on c.id = cs.classroom_id
    join public.students st on st.id = cs.student_id
    left join public.attendance_sessions s
      on s.classroom_id = c.id and s.status = 'completed' and s.lesson_date between p_from and p_to
    left join public.attendance_records ar on ar.session_id = s.id and ar.student_id = st.id
   where cs.school_id = p_school and cs.active
     and (p_classroom is null or c.id = p_classroom)
   group by c.id, c.name, st.id, st.full_name, st.registration_code
   order by c.name, st.full_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- Comunicados
-- -----------------------------------------------------------------------------
create or replace function public.publish_announcement(
  p_school uuid, p_title text, p_body text, p_audience text,
  p_classroom uuid default null, p_requires_ack boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_sch  text;
  u      record;
begin
  if not (public.is_service_context() or public.is_school_staff(p_school)) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_audience = 'classroom' and not exists (select 1 from public.classrooms where id = p_classroom and school_id = p_school) then
    raise exception 'Turma inválida' using errcode = '22023';
  end if;
  select name into v_sch from public.schools where id = p_school;

  insert into public.announcements (school_id, title, body, audience, classroom_id, requires_ack, published_by)
  values (p_school, trim(p_title), trim(p_body), p_audience, case when p_audience = 'classroom' then p_classroom end,
          p_requires_ack, auth.uid())
  returning id into v_id;

  for u in
    select distinct x.user_id from (
      select m.user_id from public.school_memberships m
       where m.school_id = p_school and m.active
         and (p_audience = 'all'
              or (p_audience = 'guardians' and m.role = 'guardian')
              or (p_audience = 'students' and m.role = 'student')
              or (p_audience = 'teachers' and m.role = 'teacher'))
      union
      select g.user_id from public.classroom_students cs
        join public.student_guardians sg on sg.student_id = cs.student_id and sg.active
        join public.guardians g on g.id = sg.guardian_id and g.active
       where p_audience = 'classroom' and cs.classroom_id = p_classroom and cs.active and g.user_id is not null
      union
      select st.user_id from public.classroom_students cs
        join public.students st on st.id = cs.student_id and st.active
       where p_audience = 'classroom' and cs.classroom_id = p_classroom and cs.active and st.user_id is not null
      union
      select ct.teacher_id from public.classroom_teachers ct
       where p_audience = 'classroom' and ct.classroom_id = p_classroom and ct.active
      union
      select auth.uid() where auth.uid() is not null
    ) x
    where x.user_id is not null
  loop
    insert into public.announcement_recipients (school_id, announcement_id, user_id)
    values (p_school, v_id, u.user_id) on conflict do nothing;
    if u.user_id is distinct from auth.uid() then
      perform public.enqueue_notification(p_school, u.user_id, null, 'announcement',
        format('%s — novo comunicado', v_sch), left(trim(p_title), 160),
        public.school_today(p_school), format('announcement:%s', v_id),
        jsonb_build_object('announcement_id', v_id));
    end if;
  end loop;

  return v_id;
end;
$$;

create or replace function public.mark_announcement_read(p_announcement uuid, p_acknowledge boolean default false)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.announcement_recipients
     set read_at = coalesce(read_at, now()),
         acknowledged_at = case when p_acknowledge then coalesce(acknowledged_at, now()) else acknowledged_at end
   where announcement_id = p_announcement and user_id = auth.uid();
  update public.notifications
     set read_at = coalesce(read_at, now())
   where recipient_id = auth.uid() and dedupe_key = 'announcement:' || p_announcement;
$$;

create or replace function public.mark_notification_read(p_notification uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.notifications set read_at = coalesce(read_at, now())
   where id = p_notification and recipient_id = auth.uid();
$$;

create or replace function public.mark_all_notifications_read(p_school uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.notifications set read_at = now()
   where recipient_id = auth.uid() and school_id = p_school and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gestão escolar
-- -----------------------------------------------------------------------------
create or replace function public.transfer_student(p_student uuid, p_to_classroom uuid, p_date date default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_school  uuid;
  v_date    date;
  v_id      uuid;
begin
  select school_id into v_school from public.students where id = p_student and active;
  if v_school is null or not public.is_school_staff(v_school) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.classrooms where id = p_to_classroom and school_id = v_school and active) then
    raise exception 'Turma de destino inválida' using errcode = '22023';
  end if;
  v_date := coalesce(p_date, public.school_today(v_school));

  update public.classroom_students
     set active = false, end_date = greatest(start_date, v_date)
   where student_id = p_student and active;

  insert into public.classroom_students (school_id, classroom_id, student_id, start_date, created_by)
  values (v_school, p_to_classroom, p_student, v_date, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_student_active(p_student uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.students where id = p_student;
  if v_school is null or not public.is_school_staff(v_school) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update public.students set active = p_active where id = p_student;
  if not p_active then
    update public.classroom_students set active = false, end_date = greatest(start_date, public.school_today(v_school))
     where student_id = p_student and active;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Administração da plataforma (sem acesso a dados pessoais de estudantes)
-- -----------------------------------------------------------------------------
create or replace function public.get_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'name', s.name, 'city', s.city, 'state', s.state, 'status', s.status,
             'inep_code', s.inep_code, 'created_at', s.created_at,
             'students', (select count(*) from public.students st where st.school_id = s.id and st.active),
             'classrooms', (select count(*) from public.classrooms c where c.school_id = s.id and c.active),
             'staff', (select count(*) from public.school_memberships m where m.school_id = s.id and m.active and m.role in ('director', 'coordinator')),
             'teachers', (select count(*) from public.school_memberships m where m.school_id = s.id and m.active and m.role = 'teacher'),
             'guardians', (select count(*) from public.school_memberships m where m.school_id = s.id and m.active and m.role = 'guardian'))
           order by s.name)
      from public.schools s), '[]'::jsonb);
end;
$$;

create or replace function public.set_platform_admin(p_email text, p_value boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_target uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select id into v_target from public.profiles where lower(email) = lower(trim(p_email));
  if v_target is null then
    raise exception 'Usuário não encontrado. Peça que a pessoa crie a conta primeiro.' using errcode = 'P0002';
  end if;
  if v_target = auth.uid() and not p_value then
    raise exception 'Você não pode remover o seu próprio acesso administrativo' using errcode = '22023';
  end if;
  update public.profiles set is_platform_admin = p_value where id = v_target;
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), case when p_value then 'grant_admin' else 'revoke_admin' end, 'profiles', v_target, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Retenção de dados (executar periodicamente via pg_cron ou job externo)
-- -----------------------------------------------------------------------------
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ops int; v_deliv int; v_notif int; v_audit int;
begin
  if not public.is_service_context() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  delete from public.processed_ops where created_at < now() - interval '30 days';
  get diagnostics v_ops = row_count;
  delete from public.notification_deliveries d using public.notifications n
   where d.notification_id = n.id and n.created_at < now() - interval '365 days';
  get diagnostics v_deliv = row_count;
  delete from public.notifications where created_at < now() - interval '365 days';
  get diagnostics v_notif = row_count;
  delete from public.audit_logs where created_at < now() - interval '5 years';
  get diagnostics v_audit = row_count;
  return jsonb_build_object('processed_ops', v_ops, 'deliveries', v_deliv, 'notifications', v_notif, 'audit_logs', v_audit);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios de execução
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function
  public.enqueue_notification(uuid, uuid, uuid, public.notification_type, text, text, date, text, jsonb),
  public.process_completed_session(uuid),
  public.purge_expired_data()
from authenticated;

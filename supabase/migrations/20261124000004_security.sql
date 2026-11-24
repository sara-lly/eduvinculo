-- =============================================================================
-- EduVínculo — 0004: autenticação, funções de autorização e Row Level Security
-- =============================================================================
-- Princípios:
--   * Toda tabela de dados tem RLS habilitado. Sem política = acesso negado.
--   * O papel "anon" não acessa nenhuma tabela.
--   * Escritas sensíveis (chamada, convites, comunicados, leitura de
--     notificações) acontecem somente por funções RPC que validam permissões.
--   * O administrador da plataforma NÃO enxerga dados de estudantes
--     (minimização de acesso — LGPD).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfil criado automaticamente no cadastro (auth.users -> public.profiles)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 160),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Contexto de execução
-- -----------------------------------------------------------------------------
-- Verdadeiro quando a chamada NÃO vem de um usuário final (service_role,
-- migrations, seed, jobs agendados).
create or replace function public.is_service_context()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role'
           is distinct from 'authenticated'
     and coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role'
           is distinct from 'anon';
$$;

create or replace function public.school_today(p_school uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
            (select timezone from public.schools where id = p_school), 'America/Sao_Paulo'))::date;
$$;

-- -----------------------------------------------------------------------------
-- Funções de autorização (security definer evita recursão de RLS)
-- -----------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_platform_admin and p.active from public.profiles p where p.id = auth.uid()),
    false);
$$;

create or replace function public.has_school_role(p_school uuid, p_roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.school_memberships m
      join public.schools s on s.id = m.school_id
      join public.profiles p on p.id = m.user_id
     where m.school_id = p_school
       and m.user_id = auth.uid()
       and m.active
       and p.active
       and s.status = 'active'
       and m.role = any (p_roles));
$$;

create or replace function public.is_school_staff(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_school_role(p_school, array['director', 'coordinator']::public.membership_role[]);
$$;

create or replace function public.is_school_member(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_school_role(p_school, enum_range(null::public.membership_role));
$$;

-- Membro mesmo se a escola estiver suspensa (para exibir o aviso de suspensão).
create or replace function public.is_school_member_any_status(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.school_memberships m
     where m.school_id = p_school and m.user_id = auth.uid() and m.active);
$$;

create or replace function public.teaches_classroom(p_classroom uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.classroom_teachers ct
     where ct.classroom_id = p_classroom
       and ct.teacher_id = auth.uid()
       and ct.active
       and public.has_school_role(ct.school_id, array['teacher']::public.membership_role[]));
$$;

create or replace function public.teaches_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.classroom_students cs
      join public.classroom_teachers ct on ct.classroom_id = cs.classroom_id and ct.active
     where cs.student_id = p_student
       and cs.active
       and ct.teacher_id = auth.uid()
       and public.has_school_role(ct.school_id, array['teacher']::public.membership_role[]));
$$;

create or replace function public.is_guardian_of(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.student_guardians sg
      join public.guardians g on g.id = sg.guardian_id
     where sg.student_id = p_student
       and sg.active
       and g.active
       and g.user_id = auth.uid()
       and public.has_school_role(g.school_id, array['guardian']::public.membership_role[]));
$$;

create or replace function public.is_student_self(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.students s
     where s.id = p_student
       and s.active
       and s.user_id = auth.uid()
       and public.has_school_role(s.school_id, array['student']::public.membership_role[]));
$$;

create or replace function public.can_view_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.students s where s.id = p_student and public.is_school_staff(s.school_id))
      or public.teaches_student(p_student)
      or public.is_guardian_of(p_student)
      or public.is_student_self(p_student);
$$;

create or replace function public.can_view_classroom(p_classroom uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.classrooms c where c.id = p_classroom and public.is_school_staff(c.school_id))
      or public.teaches_classroom(p_classroom)
      or exists (
        select 1 from public.classroom_students cs
         where cs.classroom_id = p_classroom
           and cs.active
           and (public.is_guardian_of(cs.student_id) or public.is_student_self(cs.student_id)));
$$;

create or replace function public.can_view_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.school_memberships target
      join public.school_memberships me
        on me.school_id = target.school_id and me.user_id = auth.uid() and me.active
     where target.user_id = p_profile
       and target.active
       and (me.role in ('director', 'coordinator')
            or target.role in ('director', 'coordinator', 'teacher')));
$$;

-- Professor pode editar chamadas das suas turmas dentro da janela configurada;
-- coordenação/direção pode editar qualquer data passada da escola.
create or replace function public.can_edit_session(p_classroom uuid, p_lesson_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.classrooms c
      join public.attendance_rules r on r.school_id = c.school_id
     where c.id = p_classroom
       and c.active
       and p_lesson_date <= public.school_today(c.school_id)
       and (
         public.is_school_staff(c.school_id)
         or (public.teaches_classroom(p_classroom)
             and p_lesson_date >= public.school_today(c.school_id) - r.teacher_edit_window_days)));
$$;

create or replace function public.can_view_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attendance_sessions s
     where s.id = p_session
       and (public.is_school_staff(s.school_id) or public.teaches_classroom(s.classroom_id)));
$$;

create or replace function public.session_is_completed(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.attendance_sessions where id = p_session and status = 'completed');
$$;

create or replace function public.is_family_of_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attendance_records r
     where r.session_id = p_session
       and (public.is_guardian_of(r.student_id) or public.is_student_self(r.student_id)))
     and public.session_is_completed(p_session);
$$;

create or replace function public.is_announcement_recipient(p_announcement uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.announcement_recipients
     where announcement_id = p_announcement and user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Proteções contra escalonamento de privilégio
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_context() or public.is_platform_admin() then
    return new;
  end if;
  if new.is_platform_admin is distinct from old.is_platform_admin
     or new.active is distinct from old.active
     or new.email is distinct from old.email then
    raise exception 'Alteração não permitida' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.guard_school_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_context() or public.is_platform_admin() then
    return new;
  end if;
  if new.status is distinct from old.status or new.inep_code is distinct from old.inep_code then
    raise exception 'Somente a administração da plataforma pode alterar este campo' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger schools_guard before update on public.schools
  for each row execute function public.guard_school_update();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'schools', 'profiles', 'school_memberships', 'attendance_rules', 'classrooms', 'students',
    'guardians', 'student_guardians', 'classroom_students', 'classroom_teachers', 'class_schedules',
    'calendar_events', 'invitations', 'attendance_sessions', 'attendance_records',
    'attendance_conflicts', 'processed_ops', 'pedagogical_followups', 'pedagogical_notes',
    'announcements', 'announcement_recipients', 'notifications', 'notification_deliveries',
    'notification_preferences', 'push_tokens', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Escolas
create policy schools_select on public.schools for select to authenticated
  using (public.is_platform_admin() or public.is_school_member_any_status(id));
create policy schools_insert on public.schools for insert to authenticated
  with check (public.is_platform_admin());
create policy schools_update on public.schools for update to authenticated
  using (public.is_platform_admin() or public.is_school_staff(id))
  with check (public.is_platform_admin() or public.is_school_staff(id));

-- Perfis
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin() or public.can_view_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

-- Vínculos
create policy memberships_select on public.school_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_school_staff(school_id) or public.is_platform_admin());
create policy memberships_insert on public.school_memberships for insert to authenticated
  with check (
    public.is_platform_admin()
    or (public.is_school_staff(school_id) and role in ('teacher', 'guardian', 'student')));
create policy memberships_update on public.school_memberships for update to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_staff(school_id) and role in ('teacher', 'guardian', 'student')))
  with check (
    public.is_platform_admin()
    or (public.is_school_staff(school_id) and role in ('teacher', 'guardian', 'student')));

-- Regras de frequência
create policy rules_select on public.attendance_rules for select to authenticated
  using (public.is_school_member(school_id));
create policy rules_update on public.attendance_rules for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

-- Turmas
create policy classrooms_select on public.classrooms for select to authenticated
  using (public.can_view_classroom(id));
create policy classrooms_insert on public.classrooms for insert to authenticated
  with check (public.is_school_staff(school_id));
create policy classrooms_update on public.classrooms for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

-- Estudantes
create policy students_select on public.students for select to authenticated
  using (public.can_view_student(id));
create policy students_insert on public.students for insert to authenticated
  with check (public.is_school_staff(school_id));
create policy students_update on public.students for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

-- Responsáveis
create policy guardians_select on public.guardians for select to authenticated
  using (public.is_school_staff(school_id) or user_id = auth.uid());
create policy guardians_insert on public.guardians for insert to authenticated
  with check (public.is_school_staff(school_id));
create policy guardians_update on public.guardians for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

create policy student_guardians_select on public.student_guardians for select to authenticated
  using (
    public.is_school_staff(school_id)
    or exists (select 1 from public.guardians g where g.id = guardian_id and g.user_id = auth.uid()));
create policy student_guardians_insert on public.student_guardians for insert to authenticated
  with check (public.is_school_staff(school_id));
create policy student_guardians_update on public.student_guardians for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

-- Matrículas em turmas
create policy classroom_students_select on public.classroom_students for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.teaches_classroom(classroom_id)
    or public.is_guardian_of(student_id)
    or public.is_student_self(student_id));
create policy classroom_students_insert on public.classroom_students for insert to authenticated
  with check (public.is_school_staff(school_id));
create policy classroom_students_update on public.classroom_students for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

-- Professores x turmas
create policy classroom_teachers_select on public.classroom_teachers for select to authenticated
  using (public.is_school_member(school_id));
create policy classroom_teachers_insert on public.classroom_teachers for insert to authenticated
  with check (public.is_school_staff(school_id));
create policy classroom_teachers_update on public.classroom_teachers for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

-- Grade horária e calendário
create policy class_schedules_select on public.class_schedules for select to authenticated
  using (public.is_school_member(school_id));
create policy class_schedules_write on public.class_schedules for insert to authenticated
  with check (public.is_school_staff(school_id));
create policy class_schedules_update on public.class_schedules for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

create policy calendar_events_select on public.calendar_events for select to authenticated
  using (public.is_school_member(school_id));
create policy calendar_events_insert on public.calendar_events for insert to authenticated
  with check (public.is_school_staff(school_id));
create policy calendar_events_update on public.calendar_events for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

-- Convites (criação e resgate somente via RPC)
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_school_staff(school_id) or public.is_platform_admin());
create policy invitations_update on public.invitations for update to authenticated
  using (public.is_school_staff(school_id) or public.is_platform_admin())
  with check (public.is_school_staff(school_id) or public.is_platform_admin());

-- Frequência (escrita somente via RPC sync_attendance_session)
create policy sessions_select on public.attendance_sessions for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.teaches_classroom(classroom_id)
    or public.is_family_of_session(id));

create policy records_select on public.attendance_records for select to authenticated
  using (
    public.is_school_staff(school_id)
    or public.can_view_session(session_id)
    or ((public.is_guardian_of(student_id) or public.is_student_self(student_id))
        and public.session_is_completed(session_id)));

create policy conflicts_select on public.attendance_conflicts for select to authenticated
  using (
    public.is_school_staff(school_id)
    or submitted_by = auth.uid()
    or public.can_view_session(session_id));

-- Acompanhamento pedagógico: somente coordenação/direção.
create policy followups_select on public.pedagogical_followups for select to authenticated
  using (public.is_school_staff(school_id));
create policy followups_insert on public.pedagogical_followups for insert to authenticated
  with check (public.is_school_staff(school_id) and created_by = auth.uid());
create policy followups_update on public.pedagogical_followups for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

create policy notes_select on public.pedagogical_notes for select to authenticated
  using (public.is_school_staff(school_id) or author_id = auth.uid());
create policy notes_insert on public.pedagogical_notes for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.students s where s.id = student_id and s.school_id = pedagogical_notes.school_id)
    and (public.is_school_staff(school_id) or public.teaches_student(student_id)));
create policy notes_update on public.pedagogical_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- Comunicados (publicação via RPC)
create policy announcements_select on public.announcements for select to authenticated
  using (public.is_school_staff(school_id) or public.is_announcement_recipient(id));
create policy announcements_update on public.announcements for update to authenticated
  using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));

create policy announcement_recipients_select on public.announcement_recipients for select to authenticated
  using (user_id = auth.uid() or public.is_school_staff(school_id));

-- Notificações
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = auth.uid() or public.is_school_staff(school_id));

create policy deliveries_select on public.notification_deliveries for select to authenticated
  using (recipient_id = auth.uid() or public.is_school_staff(school_id));

create policy preferences_all on public.notification_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_school_member(school_id));

create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Auditoria (somente leitura)
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_platform_admin() or (school_id is not null and public.is_school_staff(school_id)));

-- -----------------------------------------------------------------------------
-- Privilégios de tabela
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on
  public.schools, public.profiles, public.school_memberships, public.classrooms, public.students,
  public.guardians, public.student_guardians, public.classroom_students, public.classroom_teachers,
  public.class_schedules, public.calendar_events, public.pedagogical_followups,
  public.pedagogical_notes, public.notification_preferences, public.push_tokens
  to authenticated;
grant update on public.attendance_rules, public.invitations, public.announcements to authenticated;
grant delete on public.push_tokens to authenticated;
revoke select on public.processed_ops from authenticated;

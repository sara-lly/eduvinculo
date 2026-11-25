-- =============================================================================
-- Presença+ — 0006: otimização de desempenho das políticas RLS
-- -----------------------------------------------------------------------------
-- Problema medido (scripts/benchmark-db.ts): nas políticas originais, funções
-- como can_view_student(id) eram executadas UMA VEZ POR LINHA. Uma responsável
-- consultando "students" fazia o banco avaliar ~655 chamadas, cada uma com
-- várias subconsultas.
--
-- Solução: funções que devolvem o CONJUNTO de ids permitidos para o usuário
-- atual, chamadas dentro de "(select ...)". O PostgreSQL avalia esse trecho
-- uma única vez por consulta (InitPlan) e usa o resultado como filtro,
-- permitindo também o uso dos índices.
-- =============================================================================

create or replace function public.my_staff_school_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m.school_id), '{}')
    from public.school_memberships m
    join public.schools s on s.id = m.school_id and s.status = 'active'
    join public.profiles p on p.id = m.user_id and p.active
   where m.user_id = auth.uid() and m.active and m.role in ('director', 'coordinator');
$$;

create or replace function public.my_teacher_classroom_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct ct.classroom_id), '{}')
    from public.classroom_teachers ct
    join public.school_memberships m
      on m.school_id = ct.school_id and m.user_id = ct.teacher_id and m.role = 'teacher' and m.active
    join public.schools s on s.id = ct.school_id and s.status = 'active'
    join public.profiles p on p.id = ct.teacher_id and p.active
   where ct.teacher_id = auth.uid() and ct.active;
$$;

create or replace function public.my_teacher_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct cs.student_id), '{}')
    from public.classroom_students cs
   where cs.active and cs.classroom_id = any (public.my_teacher_classroom_ids());
$$;

-- Estudantes sob responsabilidade do usuário + o próprio cadastro de estudante.
create or replace function public.my_family_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x.id), '{}') from (
    select sg.student_id as id
      from public.student_guardians sg
      join public.guardians g on g.id = sg.guardian_id and g.active
      join public.school_memberships m
        on m.school_id = g.school_id and m.user_id = g.user_id and m.role = 'guardian' and m.active
      join public.schools s on s.id = g.school_id and s.status = 'active'
     where g.user_id = auth.uid() and sg.active
    union
    select st.id
      from public.students st
      join public.school_memberships m
        on m.school_id = st.school_id and m.user_id = st.user_id and m.role = 'student' and m.active
      join public.schools s on s.id = st.school_id and s.status = 'active'
     where st.user_id = auth.uid() and st.active
  ) x;
$$;

grant execute on function
  public.my_staff_school_ids(), public.my_teacher_classroom_ids(),
  public.my_teacher_student_ids(), public.my_family_student_ids()
to authenticated;

-- Estudantes
drop policy students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (
    school_id = any ((select public.my_staff_school_ids())::uuid[])
    or id = any ((select public.my_teacher_student_ids())::uuid[])
    or id = any ((select public.my_family_student_ids())::uuid[]));

-- Turmas
drop policy classrooms_select on public.classrooms;
create policy classrooms_select on public.classrooms for select to authenticated
  using (
    school_id = any ((select public.my_staff_school_ids())::uuid[])
    or id = any ((select public.my_teacher_classroom_ids())::uuid[])
    or exists (
      select 1 from public.classroom_students cs
       where cs.classroom_id = classrooms.id and cs.active
         and cs.student_id = any ((select public.my_family_student_ids())::uuid[])));

-- Matrículas
drop policy classroom_students_select on public.classroom_students;
create policy classroom_students_select on public.classroom_students for select to authenticated
  using (
    school_id = any ((select public.my_staff_school_ids())::uuid[])
    or classroom_id = any ((select public.my_teacher_classroom_ids())::uuid[])
    or student_id = any ((select public.my_family_student_ids())::uuid[]));

-- Sessões visíveis por professores (turmas vinculadas) e por famílias (somente
-- chamadas concluídas que contenham registros dos seus estudantes).
-- Calculadas em funções security definer para evitar recursão entre as
-- políticas de attendance_sessions e attendance_records.
create or replace function public.my_teacher_session_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(s.id), '{}')
    from public.attendance_sessions s
   where s.classroom_id = any (public.my_teacher_classroom_ids());
$$;

create or replace function public.my_family_session_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct s.id), '{}')
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id and s.status = 'completed'
   where r.student_id = any (public.my_family_student_ids());
$$;

grant execute on function public.my_teacher_session_ids(), public.my_family_session_ids() to authenticated;

-- Sessões de chamada
drop policy sessions_select on public.attendance_sessions;
create policy sessions_select on public.attendance_sessions for select to authenticated
  using (
    school_id = any ((select public.my_staff_school_ids())::uuid[])
    or classroom_id = any ((select public.my_teacher_classroom_ids())::uuid[])
    or id = any ((select public.my_family_session_ids())::uuid[]));

-- Registros de frequência
drop policy records_select on public.attendance_records;
create policy records_select on public.attendance_records for select to authenticated
  using (
    school_id = any ((select public.my_staff_school_ids())::uuid[])
    or session_id = any ((select public.my_teacher_session_ids())::uuid[])
    or (student_id = any ((select public.my_family_student_ids())::uuid[])
        and session_id = any ((select public.my_family_session_ids())::uuid[])));

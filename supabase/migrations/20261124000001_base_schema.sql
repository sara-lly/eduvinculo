-- =============================================================================
-- EduVínculo — 0001: tipos, utilitários e cadastro escolar
-- =============================================================================
-- Convenções:
--   * Toda tabela possui id (uuid), created_at e updated_at.
--   * Registros escolares não são excluídos fisicamente: usamos "active = false".
--   * Tabelas de associação carregam school_id (denormalizado e validado por
--     trigger) para simplificar as políticas de RLS e a auditoria.
-- =============================================================================

create type public.membership_role as enum ('director', 'coordinator', 'teacher', 'guardian', 'student');
create type public.school_status as enum ('active', 'suspended');

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escolas
-- -----------------------------------------------------------------------------
create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 3 and 160),
  inep_code   text unique check (inep_code ~ '^[0-9]{8}$'),
  city        text not null check (char_length(city) between 2 and 80),
  state       char(2) not null check (state ~ '^[A-Z]{2}$'),
  timezone    text not null default 'America/Sao_Paulo',
  address     text check (char_length(address) <= 240),
  phone       text check (char_length(phone) <= 30),
  email       text check (char_length(email) <= 160),
  status      public.school_status not null default 'active',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger schools_updated_at before update on public.schools
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text not null default '' check (char_length(full_name) <= 160),
  email              text check (char_length(email) <= 160),
  phone              text check (char_length(phone) <= 30),
  is_platform_admin  boolean not null default false,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Vínculos usuário x escola x papel (um usuário pode ter vários)
-- -----------------------------------------------------------------------------
create table public.school_memberships (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id),
  user_id     uuid not null references public.profiles (id),
  role        public.membership_role not null,
  active      boolean not null default true,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, user_id, role)
);
create index school_memberships_user_idx on public.school_memberships (user_id) where active;
create index school_memberships_school_role_idx on public.school_memberships (school_id, role) where active;
create trigger school_memberships_updated_at before update on public.school_memberships
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Regras de frequência configuráveis por escola
-- -----------------------------------------------------------------------------
create table public.attendance_rules (
  school_id                        uuid primary key references public.schools (id),
  min_attendance_percent           numeric(5,2) not null default 75 check (min_attendance_percent between 0 and 100),
  consecutive_absences_threshold   int not null default 2 check (consecutive_absences_threshold between 1 and 60),
  weekly_absences_threshold        int not null default 3 check (weekly_absences_threshold between 1 and 30),
  period_days                      int not null default 30 check (period_days between 7 and 366),
  period_absences_threshold        int not null default 5 check (period_absences_threshold between 1 and 200),
  min_records_for_percent          int not null default 5 check (min_records_for_percent between 1 and 200),
  late_counts_as_present           boolean not null default true,
  justified_counts_as_present      boolean not null default true,
  notify_guardians_on_absence      boolean not null default true,
  notify_guardians_on_alert        boolean not null default true,
  teacher_edit_window_days         int not null default 7 check (teacher_edit_window_days between 0 and 60),
  updated_by                       uuid references public.profiles (id),
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now()
);
create trigger attendance_rules_updated_at before update on public.attendance_rules
  for each row execute function public.set_updated_at();

-- Toda escola nasce com regras padrão.
create or replace function public.create_default_attendance_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attendance_rules (school_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger schools_default_rules after insert on public.schools
  for each row execute function public.create_default_attendance_rules();

-- -----------------------------------------------------------------------------
-- Turmas, estudantes, responsáveis
-- -----------------------------------------------------------------------------
create table public.classrooms (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id),
  name         text not null check (char_length(name) between 1 and 80),
  grade        text check (char_length(grade) <= 40),
  shift        text not null default 'morning' check (shift in ('morning', 'afternoon', 'evening', 'full')),
  school_year  int not null check (school_year between 2000 and 2100),
  active       boolean not null default true,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (school_id, name, school_year)
);
create index classrooms_school_idx on public.classrooms (school_id) where active;
create index classrooms_updated_idx on public.classrooms (school_id, updated_at);
create trigger classrooms_updated_at before update on public.classrooms
  for each row execute function public.set_updated_at();

create table public.students (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id),
  full_name          text not null check (char_length(full_name) between 3 and 160),
  registration_code  text not null check (char_length(registration_code) between 1 and 40),
  birth_date         date,
  user_id            uuid unique references public.profiles (id),
  active             boolean not null default true,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (school_id, registration_code)
);
create index students_school_idx on public.students (school_id) where active;
create index students_name_idx on public.students (school_id, lower(full_name));
create index students_updated_idx on public.students (school_id, updated_at);
create trigger students_updated_at before update on public.students
  for each row execute function public.set_updated_at();

create table public.guardians (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id),
  full_name   text not null check (char_length(full_name) between 3 and 160),
  email       text check (char_length(email) <= 160),
  phone       text check (char_length(phone) <= 30),
  user_id     uuid references public.profiles (id),
  active      boolean not null default true,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, user_id)
);
create index guardians_school_idx on public.guardians (school_id) where active;
create index guardians_user_idx on public.guardians (user_id) where active;
create trigger guardians_updated_at before update on public.guardians
  for each row execute function public.set_updated_at();

create table public.student_guardians (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id),
  student_id         uuid not null references public.students (id),
  guardian_id        uuid not null references public.guardians (id),
  relationship       text not null default 'responsavel' check (char_length(relationship) <= 40),
  is_legal_guardian  boolean not null default true,
  active             boolean not null default true,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (student_id, guardian_id)
);
create index student_guardians_guardian_idx on public.student_guardians (guardian_id) where active;
create trigger student_guardians_updated_at before update on public.student_guardians
  for each row execute function public.set_updated_at();

create table public.classroom_students (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id),
  classroom_id  uuid not null references public.classrooms (id),
  student_id    uuid not null references public.students (id),
  start_date    date not null default current_date,
  end_date      date,
  active        boolean not null default true,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
-- Um estudante só pode estar matriculado ativamente em uma turma por vez.
create unique index classroom_students_one_active_idx on public.classroom_students (student_id) where active;
create index classroom_students_classroom_idx on public.classroom_students (classroom_id) where active;
create index classroom_students_updated_idx on public.classroom_students (school_id, updated_at);
create trigger classroom_students_updated_at before update on public.classroom_students
  for each row execute function public.set_updated_at();

create table public.classroom_teachers (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id),
  classroom_id  uuid not null references public.classrooms (id),
  teacher_id    uuid not null references public.profiles (id),
  subject       text not null default 'Geral' check (char_length(subject) between 1 and 60),
  active        boolean not null default true,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (classroom_id, teacher_id, subject)
);
create index classroom_teachers_teacher_idx on public.classroom_teachers (teacher_id) where active;
create trigger classroom_teachers_updated_at before update on public.classroom_teachers
  for each row execute function public.set_updated_at();

-- Grade horária: usada para calcular "próximas aulas" e "chamadas pendentes".
create table public.class_schedules (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id),
  classroom_id  uuid not null references public.classrooms (id),
  weekday       smallint not null check (weekday between 0 and 6), -- 0 = domingo
  starts_at     time not null,
  ends_at       time not null,
  lesson_slot   smallint not null default 1 check (lesson_slot between 1 and 10),
  subject       text not null default 'Geral',
  teacher_id    uuid references public.profiles (id),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (classroom_id, weekday, lesson_slot)
);
create index class_schedules_teacher_idx on public.class_schedules (teacher_id) where active;
create trigger class_schedules_updated_at before update on public.class_schedules
  for each row execute function public.set_updated_at();

create table public.calendar_events (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id),
  classroom_id  uuid references public.classrooms (id),
  title         text not null check (char_length(title) between 3 and 120),
  description   text check (char_length(description) <= 1000),
  event_date    date not null,
  event_type    text not null default 'event' check (event_type in ('holiday', 'exam', 'meeting', 'event', 'other')),
  active        boolean not null default true,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index calendar_events_school_date_idx on public.calendar_events (school_id, event_date) where active;
create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- Convites: primeiro acesso de professores, responsáveis, estudantes e coordenação.
-- O código em texto puro nunca é armazenado — somente o hash SHA-256.
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id),
  role         public.membership_role not null,
  code_hash    text not null unique,
  code_hint    text not null,
  student_id   uuid references public.students (id),
  guardian_id  uuid references public.guardians (id),
  label        text check (char_length(label) <= 120),
  expires_at   timestamptz not null,
  max_uses     int not null default 1 check (max_uses between 1 and 50),
  used_count   int not null default 0 check (used_count >= 0),
  revoked      boolean not null default false,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (role <> 'student' or student_id is not null),
  check (role <> 'guardian' or guardian_id is not null)
);
create index invitations_school_idx on public.invitations (school_id, created_at desc);
create trigger invitations_updated_at before update on public.invitations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Consistência entre escolas: tabelas de associação não podem misturar escolas.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_same_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
begin
  if tg_table_name in ('classroom_students', 'classroom_teachers', 'class_schedules') then
    select school_id into v_school from public.classrooms where id = new.classroom_id;
    if v_school is null then
      raise exception 'Turma inexistente' using errcode = '23503';
    end if;
    new.school_id := v_school;
    if tg_table_name = 'classroom_students' then
      -- to_jsonb evita referenciar um campo que não existe nas outras tabelas.
      if not exists (
        select 1 from public.students
         where id = (to_jsonb(new) ->> 'student_id')::uuid and school_id = v_school
      ) then
        raise exception 'Estudante e turma pertencem a escolas diferentes' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'student_guardians' then
    select school_id into v_school from public.students where id = new.student_id;
    if v_school is null then
      raise exception 'Estudante inexistente' using errcode = '23503';
    end if;
    new.school_id := v_school;
    if not exists (select 1 from public.guardians where id = new.guardian_id and school_id = v_school) then
      raise exception 'Responsável e estudante pertencem a escolas diferentes' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger classroom_students_same_school before insert or update on public.classroom_students
  for each row execute function public.enforce_same_school();
create trigger classroom_teachers_same_school before insert or update on public.classroom_teachers
  for each row execute function public.enforce_same_school();
create trigger class_schedules_same_school before insert or update on public.class_schedules
  for each row execute function public.enforce_same_school();
create trigger student_guardians_same_school before insert or update on public.student_guardians
  for each row execute function public.enforce_same_school();

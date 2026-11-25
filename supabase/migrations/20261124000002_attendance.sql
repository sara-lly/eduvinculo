-- =============================================================================
-- Presença+ — 0002: frequência, conflitos, acompanhamento pedagógico
-- =============================================================================

create type public.attendance_status as enum ('present', 'absent', 'late', 'justified');
create type public.session_status as enum ('draft', 'completed');
create type public.followup_status as enum ('open', 'in_progress', 'closed');

-- Uma chamada = uma turma + uma data + um horário (lesson_slot).
-- O id é gerado no aparelho (UUID v4) para permitir criação offline idempotente.
create table public.attendance_sessions (
  id            uuid primary key,
  school_id     uuid not null references public.schools (id),
  classroom_id  uuid not null references public.classrooms (id),
  lesson_date   date not null,
  lesson_slot   smallint not null default 1 check (lesson_slot between 1 and 10),
  status        public.session_status not null default 'draft',
  version       int not null default 0,
  recorded_by   uuid not null references public.profiles (id),
  updated_by    uuid references public.profiles (id),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (classroom_id, lesson_date, lesson_slot)
);
create index attendance_sessions_school_date_idx on public.attendance_sessions (school_id, lesson_date);
create index attendance_sessions_classroom_date_idx on public.attendance_sessions (classroom_id, lesson_date desc);
create index attendance_sessions_updated_idx on public.attendance_sessions (school_id, updated_at);
create trigger attendance_sessions_updated_at before update on public.attendance_sessions
  for each row execute function public.set_updated_at();

create table public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.attendance_sessions (id),
  school_id    uuid not null references public.schools (id),
  student_id   uuid not null references public.students (id),
  status       public.attendance_status not null,
  note         text check (char_length(note) <= 500),
  recorded_by  uuid not null references public.profiles (id),
  updated_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (session_id, student_id)
);
create index attendance_records_student_idx on public.attendance_records (student_id, session_id);
create index attendance_records_updated_idx on public.attendance_records (school_id, updated_at);
create trigger attendance_records_updated_at before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- Quando duas pessoas editam a mesma chamada a partir de versões diferentes,
-- a submissão "atrasada" NÃO sobrescreve: ela fica registrada aqui para revisão.
create table public.attendance_conflicts (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id),
  session_id         uuid not null references public.attendance_sessions (id),
  submitted_by       uuid not null references public.profiles (id),
  base_version       int not null,
  server_version     int not null,
  submitted_payload  jsonb not null,
  server_snapshot    jsonb not null,
  status             text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  resolved_by        uuid references public.profiles (id),
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index attendance_conflicts_school_idx on public.attendance_conflicts (school_id, status);
create trigger attendance_conflicts_updated_at before update on public.attendance_conflicts
  for each row execute function public.set_updated_at();

-- Idempotência: cada operação enviada pelo aparelho possui um op_id único.
-- Reenvios (toques repetidos, retentativas de sincronização) devolvem o mesmo resultado.
create table public.processed_ops (
  op_id       uuid primary key,
  user_id     uuid not null references public.profiles (id),
  result      jsonb not null,
  created_at  timestamptz not null default now()
);
create index processed_ops_created_idx on public.processed_ops (created_at);

-- Acompanhamento pedagógico (acesso restrito à coordenação/direção).
create table public.pedagogical_followups (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id),
  student_id          uuid not null references public.students (id),
  identified_at       date not null default current_date,
  reason              text not null check (char_length(reason) between 3 and 500),
  situation           text check (char_length(situation) <= 2000),
  assigned_to         uuid references public.profiles (id),
  actions_taken       text check (char_length(actions_taken) <= 4000),
  next_followup_date  date,
  status              public.followup_status not null default 'open',
  outcome             text check (char_length(outcome) <= 2000),
  closed_at           timestamptz,
  created_by          uuid references public.profiles (id),
  updated_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (status <> 'closed' or outcome is not null)
);
create index pedagogical_followups_school_status_idx on public.pedagogical_followups (school_id, status);
create index pedagogical_followups_student_idx on public.pedagogical_followups (student_id);
create trigger pedagogical_followups_updated_at before update on public.pedagogical_followups
  for each row execute function public.set_updated_at();

-- Observações pedagógicas de professores: visíveis ao autor e à coordenação.
create table public.pedagogical_notes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id),
  student_id  uuid not null references public.students (id),
  author_id   uuid not null references public.profiles (id),
  note        text not null check (char_length(note) between 3 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index pedagogical_notes_student_idx on public.pedagogical_notes (student_id, created_at desc);
create trigger pedagogical_notes_updated_at before update on public.pedagogical_notes
  for each row execute function public.set_updated_at();

-- =============================================================================
-- EduVínculo — 0003: comunicados, notificações e auditoria
-- =============================================================================

create type public.notification_type as enum ('absence', 'recurrent_absence', 'announcement', 'followup', 'system');

create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id),
  title         text not null check (char_length(title) between 3 and 120),
  body          text not null check (char_length(body) between 3 and 4000),
  audience      text not null check (audience in ('all', 'guardians', 'students', 'teachers', 'classroom')),
  classroom_id  uuid references public.classrooms (id),
  requires_ack  boolean not null default false,
  published_by  uuid references public.profiles (id),
  published_at  timestamptz not null default now(),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (audience <> 'classroom' or classroom_id is not null)
);
create index announcements_school_idx on public.announcements (school_id, published_at desc);
create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create table public.announcement_recipients (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id),
  announcement_id  uuid not null references public.announcements (id),
  user_id          uuid not null references public.profiles (id),
  read_at          timestamptz,
  acknowledged_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (announcement_id, user_id)
);
create index announcement_recipients_user_idx on public.announcement_recipients (user_id, created_at desc);
create trigger announcement_recipients_updated_at before update on public.announcement_recipients
  for each row execute function public.set_updated_at();

create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id),
  recipient_id     uuid not null references public.profiles (id),
  student_id       uuid references public.students (id),
  type             public.notification_type not null,
  title            text not null check (char_length(title) <= 160),
  body             text not null check (char_length(body) <= 1000),
  occurrence_date  date,
  dedupe_key       text not null,
  data             jsonb not null default '{}'::jsonb,
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Evita notificações duplicadas para o mesmo destinatário/evento.
  unique (recipient_id, dedupe_key)
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_school_idx on public.notifications (school_id, created_at desc);
create trigger notifications_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

-- Registro de tentativas de envio por canal (in-app / push).
create table public.notification_deliveries (
  id               uuid primary key default gen_random_uuid(),
  notification_id  uuid not null references public.notifications (id),
  school_id        uuid not null references public.schools (id),
  recipient_id     uuid not null references public.profiles (id),
  channel          text not null check (channel in ('in_app', 'push')),
  status           text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts         int not null default 0,
  last_error       text,
  next_attempt_at  timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (notification_id, channel)
);
create index notification_deliveries_pending_idx on public.notification_deliveries (status, next_attempt_at) where status = 'pending';
create trigger notification_deliveries_updated_at before update on public.notification_deliveries
  for each row execute function public.set_updated_at();

create table public.notification_preferences (
  user_id           uuid not null references public.profiles (id),
  school_id         uuid not null references public.schools (id),
  absence_alerts    boolean not null default true,
  recurrent_alerts  boolean not null default true,
  announcements     boolean not null default true,
  push_enabled      boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, school_id)
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id),
  token       text not null unique check (char_length(token) <= 255),
  platform    text not null check (platform in ('android', 'ios')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
create trigger push_tokens_updated_at before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auditoria
-- Registra QUEM fez O QUE e QUAIS campos mudaram — sem copiar os valores
-- (minimização de dados pessoais, LGPD art. 6º, III).
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  school_id       uuid references public.schools (id),
  actor_id        uuid references public.profiles (id),
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  changed_fields  text[],
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new     jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old     jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row     jsonb := coalesce(v_new, v_old);
  v_fields  text[];
  v_school  uuid;
  v_actor   uuid := nullif(coalesce(
                 current_setting('request.jwt.claim.sub', true),
                 current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_fields
      from jsonb_each(v_new) n
     where n.value is distinct from v_old -> n.key
       and n.key not in ('updated_at', 'version');
    if v_fields is null then
      return new;
    end if;
  end if;

  if tg_table_name = 'schools' then
    v_school := (v_row ->> 'id')::uuid;
  else
    v_school := (v_row ->> 'school_id')::uuid;
  end if;

  insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, changed_fields)
  values (
    v_school,
    case when exists (select 1 from public.profiles where id = v_actor) then v_actor end,
    lower(tg_op),
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid end,
    v_fields
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'schools', 'school_memberships', 'attendance_rules', 'classrooms', 'students', 'guardians',
    'student_guardians', 'classroom_students', 'classroom_teachers', 'invitations',
    'pedagogical_followups', 'pedagogical_notes', 'attendance_conflicts', 'announcements'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t || '_audit', t);
  end loop;
end;
$$;

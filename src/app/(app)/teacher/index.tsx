import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { addDays, formatTime, todayIso, WEEKDAYS, weekdayOf } from '@/core/dates';
import { markFirstScreen } from '@/core/perf';
import { dashboardRepository } from '@/data/repositories/dashboardRepository';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { useUnreadNotifications } from '@/features/bootstrap';
import { DateBadge, ProfileCard, QuickActions, SectionCard, SectionRow } from '@/features/home/homeComponents';
import { Screen, StatTile, TileGrid } from '@/ui/components/layout';
import { Badge } from '@/ui/components/primitives';
import { CachedDataNotice, ErrorState, LoadingState } from '@/ui/components/states';
import { colors } from '@/ui/theme';

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Hoje';
  if (iso === addDays(today, -1)) return 'Ontem';
  if (iso === addDays(today, 1)) return 'Amanhã';
  const w = WEEKDAYS[weekdayOf(iso)] ?? '';
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export default function TeacherDashboard() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const today = todayIso(ctx.timezone);
  const unread = useUnreadNotifications(ctx.schoolId, userId);
  const q = useQuery({
    queryKey: ['dashboard', 'teacher', ctx.schoolId],
    queryFn: ({ signal }) => dashboardRepository.teacher(ctx.schoolId, signal),
  });

  useEffect(() => {
    if (q.data) markFirstScreen('teacher_dashboard');
  }, [q.data]);

  // Pendências de hoje primeiro; depois as mais antigas.
  const pending = useMemo(() => {
    const list = [...(q.data?.pending_sessions ?? [])];
    return list.sort((a, b) => (a.lesson_date === b.lesson_date ? a.starts_at.localeCompare(b.starts_at) : b.lesson_date.localeCompare(a.lesson_date)));
  }, [q.data]);
  const firstPending = pending[0];

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;

  const openAttendance = (classroomId: string, date: string, slot: number) =>
    router.push({ pathname: '/attendance/[classroomId]', params: { classroomId, date, slot: String(slot) } });

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <ProfileCard subtitle={pending.length > 0
        ? `Você tem ${pending.length} chamada${pending.length > 1 ? 's' : ''} para registrar.`
        : 'Todas as chamadas estão em dia. 👏'} />
      <CachedDataNotice cachedAt={d.__fromCache} />

      <QuickActions actions={[
        {
          icon: 'create-outline', label: 'Fazer chamada',
          onPress: () => (firstPending ? openAttendance(firstPending.classroom_id, firstPending.lesson_date, firstPending.lesson_slot) : router.push('/teacher/classrooms')),
          badge: pending.length || undefined,
        },
        { icon: 'people-outline', label: 'Minhas turmas', onPress: () => router.push('/teacher/classrooms') },
        { icon: 'notifications-outline', label: 'Notificações', onPress: () => router.push('/teacher/notifications'), badge: unread || undefined },
        { icon: 'cloud-upload-outline', label: 'Sincronização', onPress: () => router.push('/sync-queue') },
      ]} />

      <TileGrid>
        <StatTile label="Turmas" value={String(d.classrooms.length)} icon="people-outline" />
        <StatTile label="Concluídas (7 dias)" value={String(d.completed_last_7_days)} icon="checkmark-done-outline" tone="success" />
      </TileGrid>

      <SectionCard title="Chamadas pendentes" icon="time-outline" count={pending.length} tone="warning"
        empty="Nenhuma chamada pendente nos últimos dias.">
        {pending.map((p) => (
          <SectionRow key={`${p.classroom_id}-${p.lesson_date}-${p.lesson_slot}`}
            leading={<DateBadge iso={p.lesson_date} highlight={p.lesson_date === today} />}
            title={p.classroom_name}
            subtitle={`${dayLabel(p.lesson_date, today)} · ${formatTime(p.starts_at)} · ${p.subject}`}
            right={p.lesson_date === today ? <Badge label="Hoje" tone="warning" /> : <Badge label="Atrasada" tone="danger" />}
            onPress={() => openAttendance(p.classroom_id, p.lesson_date, p.lesson_slot)} />
        ))}
      </SectionCard>

      <SectionCard title="Próximas aulas" icon="calendar-outline" count={d.next_lessons.length}
        empty="Nenhuma aula na grade dos próximos dias.">
        {d.next_lessons.map((l) => (
          <SectionRow key={`${l.classroom_id}-${l.lesson_date}-${l.lesson_slot}`}
            leading={<DateBadge iso={l.lesson_date} highlight={l.lesson_date === today} />}
            title={l.classroom_name}
            subtitle={`${dayLabel(l.lesson_date, today)} · ${formatTime(l.starts_at)}–${formatTime(l.ends_at)} · ${l.subject}`} />
        ))}
      </SectionCard>

      <SectionCard title="Atenção à frequência" icon="alert-circle-outline" count={d.flagged_students.length} tone="danger"
        empty="Nenhum estudante das suas turmas atingiu os critérios da escola.">
        {d.flagged_students.map((s) => (
          <SectionRow key={s.student_id}
            leading={<Ionicons name="person-circle-outline" size={34} color={colors.warning} />}
            title={s.student_name}
            subtitle={`${s.classroom_name} · ${s.reasons.join('; ')}`}
            onPress={() => router.push(`/students/${s.student_id}`)} />
        ))}
      </SectionCard>

      <SectionCard title="Minhas turmas" icon="school-outline" count={d.classrooms.length}
        action={{ label: 'Ver todas', onPress: () => router.push('/teacher/classrooms') }}>
        {d.classrooms.map((c) => (
          <SectionRow key={c.id} title={c.name} subtitle={`${c.student_count} estudantes`}
            onPress={() => router.push(`/classroom/${c.id}`)} />
        ))}
      </SectionCard>
    </Screen>
  );
}


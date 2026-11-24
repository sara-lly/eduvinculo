import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { formatDateBR, formatTime, WEEKDAYS, weekdayOf } from '@/core/dates';
import { markFirstScreen } from '@/core/perf';
import { dashboardRepository } from '@/data/repositories/dashboardRepository';
import { useSchoolContext, useSessionStore } from '@/features/auth/sessionStore';
import { ListItem, Screen, StatTile, TileGrid } from '@/ui/components/layout';
import { AppText, Badge, Card, SectionTitle } from '@/ui/components/primitives';
import { CachedDataNotice, EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

export default function TeacherDashboard() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const name = useSessionStore((s) => s.profile?.fullName?.split(' ')[0] ?? '');
  const q = useQuery({
    queryKey: ['dashboard', 'teacher', ctx.schoolId],
    queryFn: ({ signal }) => dashboardRepository.teacher(ctx.schoolId, signal),
  });

  useEffect(() => {
    if (q.data) markFirstScreen('teacher_dashboard');
  }, [q.data]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <AppText variant="title">{`Olá, ${name}!`}</AppText>
      <AppText variant="caption" style={{ marginBottom: spacing.md }}>Professor(a)</AppText>
      <CachedDataNotice cachedAt={d.__fromCache} />

      <TileGrid>
        <StatTile label="Turmas" value={String(d.classrooms.length)} icon="people-outline" />
        <StatTile label="Chamadas pendentes" value={String(d.pending_sessions.length)} icon="time-outline"
          tone={d.pending_sessions.length > 0 ? 'warning' : 'success'} />
        <StatTile label="Concluídas (7 dias)" value={String(d.completed_last_7_days)} icon="checkmark-done-outline" tone="success" />
        <StatTile label="Faltas recorrentes" value={String(d.flagged_students.length)} icon="alert-circle-outline"
          tone={d.flagged_students.length > 0 ? 'danger' : 'primary'} hint="Nas suas turmas" />
      </TileGrid>

      <SectionTitle title="Chamadas pendentes" />
      {d.pending_sessions.length === 0 ? (
        <Card><AppText variant="caption">Nenhuma chamada pendente nos últimos dias. 👏</AppText></Card>
      ) : (
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {d.pending_sessions.slice(0, 8).map((p) => (
            <ListItem
              key={`${p.classroom_id}-${p.lesson_date}-${p.lesson_slot}`}
              icon="create-outline"
              title={p.classroom_name}
              subtitle={`${formatDateBR(p.lesson_date)} (${WEEKDAYS[weekdayOf(p.lesson_date)]}) · ${formatTime(p.starts_at)} · ${p.subject}`}
              onPress={() => router.push({ pathname: '/attendance/[classroomId]', params: { classroomId: p.classroom_id, date: p.lesson_date, slot: String(p.lesson_slot) } })}
            />
          ))}
        </View>
      )}

      <SectionTitle title="Próximas aulas" />
      {d.next_lessons.length === 0 ? (
        <Card><AppText variant="caption">Nenhuma aula na grade dos próximos dias.</AppText></Card>
      ) : (
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {d.next_lessons.map((l) => (
            <ListItem key={`${l.classroom_id}-${l.lesson_date}-${l.lesson_slot}`} icon="calendar-outline" title={l.classroom_name}
              subtitle={`${formatDateBR(l.lesson_date)} · ${formatTime(l.starts_at)}–${formatTime(l.ends_at)} · ${l.subject}`} />
          ))}
        </View>
      )}

      <SectionTitle title="Estudantes com faltas recorrentes" />
      {d.flagged_students.length === 0 ? (
        <EmptyState icon="happy-outline" title="Nenhum alerta" message="Nenhum estudante das suas turmas atingiu os critérios configurados pela escola." />
      ) : (
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {d.flagged_students.map((s) => (
            <ListItem key={s.student_id} icon="person-outline" title={s.student_name}
              subtitle={`${s.classroom_name} · ${s.reasons.join('; ')}`}
              right={<Badge label="Atenção" tone="warning" />}
              onPress={() => router.push(`/students/${s.student_id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

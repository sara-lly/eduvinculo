import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { addDays, formatDateBR, todayIso } from '@/core/dates';
import { markFirstScreen } from '@/core/perf';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { familyRepository } from '@/data/repositories/familyRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext, useSessionStore, useUserId } from '@/features/auth/sessionStore';
import { StudentAttendanceView } from '@/features/students/StudentAttendanceView';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Button, Card, SectionTitle } from '@/ui/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

export default function StudentDashboard() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const name = useSessionStore((s) => s.profile?.fullName?.split(' ')[0] ?? '');
  const today = todayIso(ctx.timezone);
  const me = useQuery({ queryKey: ['family', userId, ctx.schoolId], queryFn: () => familyRepository.myStudents(userId, ctx.schoolId) });
  const announcements = useQuery({
    queryKey: ['announcements', userId, ctx.schoolId],
    queryFn: () => communicationRepository.announcements(userId, ctx.schoolId, false),
  });
  const events = useQuery({
    queryKey: ['calendar', ctx.schoolId, today, addDays(today, 30)],
    queryFn: () => managementRepository.calendarEvents(ctx.schoolId, today, addDays(today, 30)),
  });

  useEffect(() => {
    if (me.data) markFirstScreen('student_dashboard');
  }, [me.data]);

  if (me.isPending) return <LoadingState />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  const student = me.data[0];

  return (
    <Screen onRefresh={() => void Promise.all([me.refetch(), announcements.refetch(), events.refetch()])}>
      <AppText variant="title">{`Olá, ${name}!`}</AppText>
      {student ? (
        <AppText variant="caption" style={{ marginBottom: spacing.md }}>
          {`${student.classroomName ?? ''} · Matrícula ${student.registrationCode}`}
        </AppText>
      ) : null}
      {!student ? (
        <EmptyState title="Cadastro de estudante não encontrado" message="Procure a secretaria da escola." />
      ) : (
        <StudentAttendanceView studentId={student.id} schoolId={ctx.schoolId} timezone={ctx.timezone} compact />
      )}
      <SectionTitle title="Comunicados" action={<Button title="Ver todos" compact variant="ghost" onPress={() => router.push('/student/announcements')} />} />
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>
        {(announcements.data ?? []).slice(0, 3).map((a) => (
          <ListItem key={a.id} icon="megaphone-outline" title={a.title} subtitle={formatDateBR(a.publishedAt)}
            onPress={() => router.push(`/announcement/${a.id}`)} />
        ))}
        {announcements.data?.length === 0 ? <Card><AppText variant="caption">Nenhum comunicado.</AppText></Card> : null}
      </View>
      <SectionTitle title="Próximos eventos" />
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>
        {(events.data ?? []).slice(0, 4).map((e) => (
          <ListItem key={e.id} icon="calendar-outline" title={e.title} subtitle={formatDateBR(e.eventDate)} />
        ))}
        {events.data?.length === 0 ? <Card><AppText variant="caption">Nenhum evento nos próximos 30 dias.</AppText></Card> : null}
      </View>
    </Screen>
  );
}

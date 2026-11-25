import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { addDays, formatDateBR, todayIso } from '@/core/dates';
import { markFirstScreen } from '@/core/perf';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { familyRepository } from '@/data/repositories/familyRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { DateBadge, ProfileCard, QuickActions, SectionCard, SectionRow } from '@/features/home/homeComponents';
import { StudentAttendanceView } from '@/features/students/StudentAttendanceView';
import { Screen } from '@/ui/components/layout';
import { Badge } from '@/ui/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/ui/components/states';

export default function StudentDashboard() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
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
      <ProfileCard subtitle={student ? `${student.classroomName ?? ''} · Matrícula ${student.registrationCode}` : undefined} />
      <QuickActions actions={[
        { icon: 'checkmark-done-outline', label: 'Minha frequência', onPress: () => router.push('/student/history') },
        { icon: 'megaphone-outline', label: 'Comunicados', onPress: () => router.push('/student/announcements') },
        { icon: 'calendar-outline', label: 'Calendário', onPress: () => router.push('/student/calendar') },
      ]} />
      {!student ? (
        <EmptyState title="Cadastro de estudante não encontrado" message="Procure a secretaria da escola." />
      ) : (
        <StudentAttendanceView studentId={student.id} schoolId={ctx.schoolId} timezone={ctx.timezone} compact />
      )}
      <SectionCard title="Comunicados" icon="megaphone-outline" count={announcements.data?.length}
        action={{ label: 'Ver todos', onPress: () => router.push('/student/announcements') }} empty="Nenhum comunicado.">
        {(announcements.data ?? []).slice(0, 6).map((a) => (
          <SectionRow key={a.id} title={a.title} subtitle={formatDateBR(a.publishedAt)}
            right={!a.readAt ? <Badge label="Novo" tone="info" /> : undefined}
            onPress={() => router.push(`/announcement/${a.id}`)} />
        ))}
      </SectionCard>
      <SectionCard title="Próximos eventos" icon="calendar-outline" count={events.data?.length} empty="Nenhum evento nos próximos 30 dias.">
        {(events.data ?? []).map((e) => (
          <SectionRow key={e.id} leading={<DateBadge iso={e.eventDate} />} title={e.title} subtitle={e.description ?? undefined} />
        ))}
      </SectionCard>
    </Screen>
  );
}

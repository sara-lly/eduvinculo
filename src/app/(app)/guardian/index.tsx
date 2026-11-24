import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { addDays, formatDateBR, formatRelativeBR, todayIso } from '@/core/dates';
import { markFirstScreen } from '@/core/perf';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { familyRepository } from '@/data/repositories/familyRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext, useSessionStore, useUserId } from '@/features/auth/sessionStore';
import { StudentAttendanceView } from '@/features/students/StudentAttendanceView';
import { ChipSelect } from '@/ui/components/forms';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Button, Card, SectionTitle } from '@/ui/components/primitives';
import { CachedDataNotice, EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

export default function GuardianDashboard() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const name = useSessionStore((s) => s.profile?.fullName?.split(' ')[0] ?? '');
  const today = todayIso(ctx.timezone);
  const students = useQuery({ queryKey: ['family', userId, ctx.schoolId], queryFn: () => familyRepository.myStudents(userId, ctx.schoolId) });
  const [selected, setSelected] = useState<string | null>(null);
  const studentId = selected ?? students.data?.[0]?.id ?? null;

  const notifications = useQuery({
    queryKey: ['notifications', 'list', userId, ctx.schoolId, 'preview'],
    queryFn: () => communicationRepository.notificationsPage(userId, ctx.schoolId),
  });
  const announcements = useQuery({
    queryKey: ['announcements', userId, ctx.schoolId],
    queryFn: () => communicationRepository.announcements(userId, ctx.schoolId, false),
  });
  const events = useQuery({
    queryKey: ['calendar', ctx.schoolId, today, addDays(today, 30)],
    queryFn: () => managementRepository.calendarEvents(ctx.schoolId, today, addDays(today, 30)),
  });

  useEffect(() => {
    if (students.data) markFirstScreen('guardian_dashboard');
  }, [students.data]);

  if (students.isPending) return <LoadingState />;
  if (students.isError) return <ErrorState error={students.error} onRetry={() => void students.refetch()} />;

  return (
    <Screen onRefresh={() => void Promise.all([students.refetch(), notifications.refetch(), announcements.refetch()])}>
      <AppText variant="title">{`Olá, ${name}!`}</AppText>
      <AppText variant="caption" style={{ marginBottom: spacing.md }}>Acompanhe a vida escolar com a escola.</AppText>
      <CachedDataNotice cachedAt={(students.data as { __fromCache?: number }).__fromCache} />

      {students.data.length === 0 ? (
        <EmptyState icon="people-outline" title="Nenhum estudante vinculado"
          message="Peça à escola um código de convite para vincular seu(s) filho(s) ou dependente(s)."
          action={{ label: 'Tenho um código', onPress: () => router.push('/invite') }} />
      ) : (
        <>
          {students.data.length > 1 ? (
            <ChipSelect value={studentId ?? ''} onChange={setSelected}
              options={students.data.map((s) => ({ value: s.id, label: s.fullName.split(' ')[0] ?? s.fullName }))} />
          ) : null}
          {students.data.filter((s) => s.id === studentId).map((s) => (
            <Card key={s.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push(`/students/${s.id}`)}
              accessibilityLabel={`Ver detalhes de ${s.fullName}`}>
              <AppText variant="subtitle">{s.fullName}</AppText>
              <AppText variant="caption">{`${s.classroomName ?? 'Sem turma'} · Matrícula ${s.registrationCode}`}</AppText>
              <AppText variant="caption" style={{ marginTop: 4 }}>Toque para ver o histórico completo</AppText>
            </Card>
          ))}
          {studentId ? <StudentAttendanceView key={studentId} studentId={studentId} schoolId={ctx.schoolId} timezone={ctx.timezone} compact /> : null}
        </>
      )}

      <SectionTitle title="Últimas notificações" action={<Button title="Ver todas" compact variant="ghost" onPress={() => router.push('/guardian/notifications')} />} />
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>
        {(notifications.data?.items ?? []).slice(0, 4).map((n) => (
          <ListItem key={n.id} icon={n.readAt ? 'mail-open-outline' : 'mail-unread-outline'} title={n.title}
            subtitle={`${n.body} · ${formatRelativeBR(n.createdAt)}`} onPress={() => router.push(`/notification/${n.id}`)} />
        ))}
        {notifications.data?.items.length === 0 ? <Card><AppText variant="caption">Nenhuma notificação.</AppText></Card> : null}
      </View>

      <SectionTitle title="Comunicados" action={<Button title="Ver todos" compact variant="ghost" onPress={() => router.push('/guardian/announcements')} />} />
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>
        {(announcements.data ?? []).slice(0, 3).map((a) => (
          <ListItem key={a.id} icon="megaphone-outline" title={a.title}
            subtitle={`${formatDateBR(a.publishedAt)}${a.requiresAck && !a.acknowledgedAt ? ' · confirmação pendente' : ''}`}
            onPress={() => router.push(`/announcement/${a.id}`)} />
        ))}
        {announcements.data?.length === 0 ? <Card><AppText variant="caption">Nenhum comunicado.</AppText></Card> : null}
      </View>

      <SectionTitle title="Próximas atividades" />
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>
        {(events.data ?? []).slice(0, 5).map((e) => (
          <ListItem key={e.id} icon="calendar-outline" title={e.title} subtitle={`${formatDateBR(e.eventDate)}${e.description ? ` · ${e.description}` : ''}`} />
        ))}
        {events.data?.length === 0 ? <Card><AppText variant="caption">Nenhuma atividade nos próximos 30 dias.</AppText></Card> : null}
      </View>
    </Screen>
  );
}

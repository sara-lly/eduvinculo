import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { addDays, formatDateBR, formatRelativeBR, todayIso } from '@/core/dates';
import { markFirstScreen } from '@/core/perf';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { familyRepository } from '@/data/repositories/familyRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { useUnreadNotifications } from '@/features/bootstrap';
import { DateBadge, ProfileCard, QuickActions, SectionCard, SectionRow } from '@/features/home/homeComponents';
import { StudentAttendanceView } from '@/features/students/StudentAttendanceView';
import { Screen } from '@/ui/components/layout';
import { AppText, Badge } from '@/ui/components/primitives';
import { CachedDataNotice, EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { colors, fonts, radius, shadow, spacing } from '@/ui/theme';

export default function GuardianDashboard() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const today = todayIso(ctx.timezone);
  const unread = useUnreadNotifications(ctx.schoolId, userId);
  const students = useQuery({ queryKey: ['family', userId, ctx.schoolId], queryFn: () => familyRepository.myStudents(userId, ctx.schoolId) });
  const [selected, setSelected] = useState<string | null>(null);
  const studentId = selected ?? students.data?.[0]?.id ?? null;
  const current = students.data?.find((s) => s.id === studentId);

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
  const pendingAck = (announcements.data ?? []).filter((a) => a.requiresAck && !a.acknowledgedAt).length;

  return (
    <Screen onRefresh={() => void Promise.all([students.refetch(), notifications.refetch(), announcements.refetch()])}>
      <ProfileCard subtitle={students.data.length > 0
        ? `Acompanhando ${students.data.length} estudante${students.data.length > 1 ? 's' : ''}.`
        : undefined} />
      <CachedDataNotice cachedAt={(students.data as { __fromCache?: number }).__fromCache} />

      <QuickActions actions={[
        { icon: 'notifications-outline', label: 'Notificações', onPress: () => router.push('/guardian/notifications'), badge: unread || undefined },
        { icon: 'megaphone-outline', label: 'Comunicados', onPress: () => router.push('/guardian/announcements'), badge: pendingAck || undefined },
        { icon: 'options-outline', label: 'Preferências', onPress: () => router.push('/settings/notifications') },
      ]} />

      {students.data.length === 0 ? (
        <EmptyState icon="people-outline" title="Nenhum estudante vinculado"
          message="Peça à escola um código de convite para vincular seu(s) filho(s) ou dependente(s)."
          action={{ label: 'Tenho um código', onPress: () => router.push('/invite') }} />
      ) : (
        <>
          {/* Seletor de estudante: um cartão por filho(a) */}
          <View style={styles.kids}>
            {students.data.map((s) => {
              const active = s.id === studentId;
              return (
                <Pressable key={s.id} onPress={() => setSelected(s.id)} accessibilityRole="tab" accessibilityState={{ selected: active }}
                  accessibilityLabel={`${s.fullName}, ${s.classroomName ?? 'sem turma'}`}
                  style={[styles.kid, active && styles.kidActive]}>
                  <View style={[styles.kidAvatar, active && { backgroundColor: '#fff' }]}>
                    <AppText style={styles.kidInitial}>{s.fullName[0]}</AppText>
                  </View>
                  <AppText style={[styles.kidName, active && { color: '#fff' }]} numberOfLines={1}>{s.fullName.split(' ')[0]}</AppText>
                  <AppText style={[styles.kidClass, active && { color: '#DCE8FF' }]} numberOfLines={1}>{s.classroomName ?? 'Sem turma'}</AppText>
                </Pressable>
              );
            })}
          </View>
          {current ? (
            <Pressable onPress={() => router.push(`/students/${current.id}`)} style={styles.detailLink} accessibilityRole="button">
              <AppText style={styles.detailText}>{`Ver histórico completo de ${current.fullName.split(' ')[0]}`}</AppText>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
          {studentId ? <StudentAttendanceView key={studentId} studentId={studentId} schoolId={ctx.schoolId} timezone={ctx.timezone} compact /> : null}
        </>
      )}

      <SectionCard title="Últimas notificações" icon="notifications-outline" count={unread} tone="warning"
        action={{ label: 'Ver todas', onPress: () => router.push('/guardian/notifications') }} empty="Nenhuma notificação.">
        {(notifications.data?.items ?? []).slice(0, 6).map((n) => (
          <SectionRow key={n.id}
            leading={<Ionicons name={n.readAt ? 'mail-open-outline' : 'mail-unread-outline'} size={24} color={n.readAt ? colors.disabled : colors.primary} />}
            title={n.title} subtitle={`${n.body} · ${formatRelativeBR(n.createdAt)}`}
            onPress={() => router.push(`/notification/${n.id}`)} />
        ))}
      </SectionCard>

      <SectionCard title="Comunicados" icon="megaphone-outline" count={pendingAck} tone="warning"
        action={{ label: 'Ver todos', onPress: () => router.push('/guardian/announcements') }} empty="Nenhum comunicado.">
        {(announcements.data ?? []).slice(0, 6).map((a) => (
          <SectionRow key={a.id} title={a.title} subtitle={formatDateBR(a.publishedAt)}
            right={a.requiresAck && !a.acknowledgedAt ? <Badge label="Confirmar" tone="warning" /> : !a.readAt ? <Badge label="Novo" tone="info" /> : undefined}
            onPress={() => router.push(`/announcement/${a.id}`)} />
        ))}
      </SectionCard>

      <SectionCard title="Próximas atividades" icon="calendar-outline" count={events.data?.length} empty="Nenhuma atividade nos próximos 30 dias.">
        {(events.data ?? []).map((e) => (
          <SectionRow key={e.id} leading={<DateBadge iso={e.eventDate} />} title={e.title} subtitle={e.description ?? undefined} />
        ))}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kids: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' },
  kid: {
    flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 2, ...shadow,
  },
  kidActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  kidAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kidInitial: { fontFamily: fonts.brand, fontSize: 18, color: colors.primary },
  kidName: { fontFamily: fonts.brand, fontSize: 17, color: colors.text },
  kidClass: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.semibold },
  detailLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingVertical: spacing.md },
  detailText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 14 },
});

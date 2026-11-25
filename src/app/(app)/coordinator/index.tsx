import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { addDays, formatDateBR, todayIso } from '@/core/dates';
import { markFirstScreen } from '@/core/perf';
import { dashboardRepository } from '@/data/repositories/dashboardRepository';
import { formatPercent } from '@/domain/attendance';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ChipSelect } from '@/ui/components/forms';
import { MiniBarChart, Screen, StatTile, TileGrid } from '@/ui/components/layout';
import { AppText, Badge, Card } from '@/ui/components/primitives';
import { CachedDataNotice, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { spacing } from '@/ui/theme';
import { ProfileCard, QuickActions, SectionCard, SectionRow } from '@/features/home/homeComponents';

type Period = '7' | '30' | '90';

export default function CoordinatorDashboard() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const today = todayIso(ctx.timezone);
  const [period, setPeriod] = useState<Period>('30');
  const from = addDays(today, -Number(period) + 1);
  const q = useQuery({
    queryKey: ['dashboard', 'school', ctx.schoolId, from, today],
    queryFn: ({ signal }) => dashboardRepository.school(ctx.schoolId, from, today, signal),
  });

  useEffect(() => {
    if (q.data) markFirstScreen('coordinator_dashboard');
  }, [q.data]);

  const daily = useMemo(() => (q.data?.daily ?? []).map((d) => ({ label: formatDateBR(d.date).slice(0, 5), value: Number(d.attendance_percent) })), [q.data]);

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <ProfileCard subtitle={`Painel da escola · ${formatDateBR(from)} a ${formatDateBR(today)}`} />
      <QuickActions actions={[
        { icon: 'alert-circle-outline', label: 'Faltas recorrentes', onPress: () => router.push('/coordinator/alerts'), badge: q.data?.flagged_students || undefined },
        { icon: 'clipboard-outline', label: 'Acompanhamento', onPress: () => router.push('/coordinator/followups'), badge: q.data?.open_followups || undefined },
        { icon: 'megaphone-outline', label: 'Comunicado', onPress: () => router.push('/announcement/new') },
        { icon: 'document-text-outline', label: 'Relatórios', onPress: () => router.push('/reports') },
      ]} />
      <View style={{ height: spacing.lg }} />
      <ChipSelect<Period> value={period} onChange={setPeriod} options={[
        { value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' },
      ]} />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <>
          <CachedDataNotice cachedAt={q.data.__fromCache} />
          {q.data.open_conflicts > 0 ? (
            <Card onPress={() => router.push('/conflicts')} style={{ marginBottom: spacing.sm }}>
              <InlineMessage tone="danger" text={`${q.data.open_conflicts} conflito(s) de chamada aguardando revisão. Toque para revisar.`} />
            </Card>
          ) : null}
          <TileGrid>
            <StatTile label="Estudantes" value={String(q.data.total_students)} icon="people-outline" hint={`${q.data.total_classrooms} turmas`} />
            <StatTile label="Frequência média" value={formatPercent(q.data.attendance_percent === null ? null : Number(q.data.attendance_percent))}
              icon="trending-up-outline" tone="success" hint={`${q.data.sessions_completed} chamadas concluídas`} />
            <StatTile label="Faltas no período" value={String(q.data.absences)} icon="close-circle-outline" tone="danger"
              hint={`${q.data.late} atrasos · ${q.data.justified} justificadas`} />
            <StatTile label="Atenção à frequência" value={String(q.data.flagged_students)} icon="alert-circle-outline" tone="warning"
              hint="Estudantes nos critérios da escola" />
            <StatTile label="Acompanhamentos abertos" value={String(q.data.open_followups)} icon="clipboard-outline" />
          </TileGrid>

          <SectionCard title="Evolução da frequência (%)" icon="trending-up-outline" tone="success">
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
              {daily.length > 0 ? <MiniBarChart data={daily} threshold={75} /> : <AppText variant="caption">Sem chamadas no período.</AppText>}
            </View>
          </SectionCard>

          <SectionCard title="Turmas com mais ausências" icon="podium-outline" count={q.data.classrooms.length} tone="danger"
            empty="Sem dados no período." maxVisible={5}>
            {q.data.classrooms.map((c, i) => (
              <SectionRow key={c.id} title={`${i + 1}. ${c.name}`}
                subtitle={`Frequência ${formatPercent(c.attendance_percent === null ? null : Number(c.attendance_percent))}`}
                right={<Badge label={`${c.absences} faltas`} tone={c.absences > 0 ? 'danger' : 'success'} />}
                onPress={() => router.push(`/classroom/${c.id}`)} />
            ))}
          </SectionCard>

        </>
      )}
    </Screen>
  );
}

import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDateBR, todayIso } from '@/core/dates';
import { isNetworkError } from '@/core/errors';
import { managementRepository } from '@/data/repositories/managementRepository';
import { DEFAULT_RULES } from '@/domain/types';
import { attendanceRepository } from '@/data/repositories/attendanceRepository';
import { dashboardRepository } from '@/data/repositories/dashboardRepository';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { ChipSelect } from '@/ui/components/forms';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button } from '@/ui/components/primitives';
import { EmptyState, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

type Tab = 'students' | 'history' | 'alerts';

export default function ClassroomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('students');

  const classrooms = useQuery({
    queryKey: ['classrooms', ctx.membershipId],
    queryFn: () => attendanceRepository.listClassrooms(ctx, { userId, preferCache: true }),
    staleTime: Infinity,
  });
  const classroom = classrooms.data?.data.find((c) => c.id === id);
  const roster = useQuery({ queryKey: ['roster', id], queryFn: ({ signal }) => attendanceRepository.getRoster(id, { signal }) });
  const sessions = useQuery({
    queryKey: ['local-sessions', id],
    queryFn: () => attendanceRepository.listLocalSessions(id, 60),
    networkMode: 'always',
    enabled: tab === 'history',
  });
  const alerts = useQuery({
    queryKey: ['alerts', ctx.schoolId, id],
    // Online: cálculo no servidor. Offline: cálculo local com o histórico salvo no aparelho.
    queryFn: async ({ signal }) => {
      try {
        return { items: await dashboardRepository.alerts(ctx.schoolId, { classroomId: id }, signal), local: false };
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        const rules = await managementRepository.getRules(ctx.schoolId).catch(() => ({ schoolId: ctx.schoolId, ...DEFAULT_RULES }));
        return { items: await attendanceRepository.localAlerts(id, rules, todayIso(ctx.timezone)), local: true };
      }
    },
    enabled: tab === 'alerts',
  });

  // Histórico: sincronização incremental ao abrir a aba (cancelada ao sair).
  useEffect(() => {
    if (tab !== 'history') return;
    const controller = new AbortController();
    void attendanceRepository.refreshSessions(id, controller.signal)
      .then(() => qc.invalidateQueries({ queryKey: ['local-sessions', id] }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [tab, id, qc]);

  const alertIds = useMemo(() => new Set((alerts.data?.items ?? []).map((a) => a.studentId)), [alerts.data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: classroom?.name ?? 'Turma' }} />
      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        <Button title="Fazer chamada de hoje" onPress={() => router.push(`/attendance/${id}`)} />
        <ChipSelect<Tab> value={tab} onChange={setTab} options={[
          { value: 'students', label: `Estudantes${roster.data ? ` (${roster.data.data.length})` : ''}` },
          { value: 'history', label: 'Histórico' },
          { value: 'alerts', label: 'Faltas recorrentes' },
        ]} />
        {roster.data?.offline ? <InlineMessage tone="warning" text="Sem conexão — lista salva no aparelho." /> : null}
      </View>

      {tab === 'students' ? (
        roster.isPending ? <LoadingState /> : roster.isError ? <ErrorState error={roster.error} onRetry={() => void roster.refetch()} /> : (
          <FlashList
            data={roster.data.data}
            keyExtractor={(s) => s.studentId}
            onRefresh={() => void roster.refetch()}
            refreshing={roster.isRefetching}
            renderItem={({ item, index }) => (
              <ListItem title={`${index + 1}. ${item.fullName}`} subtitle={`Matrícula ${item.registrationCode}`}
                right={alertIds.has(item.studentId) ? <Badge label="Atenção" tone="warning" /> : undefined}
                onPress={() => router.push(`/students/${item.studentId}`)} />
            )}
            ListEmptyComponent={<EmptyState title="Nenhum estudante matriculado" />}
          />
        )
      ) : null}

      {tab === 'history' ? (
        sessions.isPending ? <LoadingState /> : (
          <FlashList
            data={sessions.data ?? []}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <ListItem
                icon={item.status === 'completed' ? 'checkmark-done-outline' : 'create-outline'}
                title={`${formatDateBR(item.lessonDate)}${item.lessonSlot > 1 ? ` · aula ${item.lessonSlot}` : ''}`}
                subtitle={`${item.status === 'completed' ? 'Concluída' : 'Rascunho'} · ${item.recordCount} registros · ${item.absentCount} faltas`}
                right={item.syncState !== 'synced' ? <Badge label={item.syncState === 'pending' ? 'Pendente' : item.syncState === 'conflict' ? 'Conflito' : 'Erro'} tone={item.syncState === 'pending' ? 'warning' : 'danger'} /> : undefined}
                onPress={() => router.push({ pathname: '/attendance/[classroomId]', params: { classroomId: id, date: item.lessonDate, slot: String(item.lessonSlot) } })}
              />
            )}
            ListEmptyComponent={<EmptyState icon="time-outline" title="Sem chamadas nos últimos 60 dias" message="O histórico fica salvo no aparelho para consulta offline." />}
          />
        )
      ) : null}

      {tab === 'alerts' ? (
        alerts.isPending ? <LoadingState /> : alerts.isError ? <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} /> : (
          <FlashList
            data={alerts.data.items}
            ListHeaderComponent={alerts.data.local ? <View style={{ padding: spacing.md }}><InlineMessage tone="warning" text="Sem conexão — alertas calculados no aparelho com o histórico salvo (últimos 60 dias)." /></View> : null}
            keyExtractor={(a) => a.studentId}
            renderItem={({ item }) => (
              <ListItem icon="alert-circle-outline" title={item.studentName} subtitle={item.reasons.join('; ')}
                onPress={() => router.push(`/students/${item.studentId}`)} />
            )}
            ListEmptyComponent={<EmptyState icon="happy-outline" title="Nenhum alerta nesta turma" message="Critérios definidos pela coordenação da escola." />}
          />
        )
      ) : null}
    </View>
  );
}

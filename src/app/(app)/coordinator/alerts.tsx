import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { formatPercent } from '@/domain/attendance';
import { dashboardRepository } from '@/data/repositories/dashboardRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { Card, AppText, Button, Row, Badge } from '@/ui/components/primitives';
import { EmptyState, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

/** Faltas recorrentes: apresenta FATOS e permite à equipe avaliar cada caso. */
export default function AlertsScreen() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const q = useQuery({ queryKey: ['alerts', ctx.schoolId, 'all'], queryFn: ({ signal }) => dashboardRepository.alerts(ctx.schoolId, {}, signal) });

  if (q.isPending) return <LoadingState label="Analisando a frequência…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlashList
        data={q.data}
        keyExtractor={(a) => a.studentId}
        onRefresh={() => void q.refetch()}
        refreshing={q.isRefetching}
        contentContainerStyle={{ padding: spacing.md }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.sm }}>
            <InlineMessage tone="info" text="Lista gerada a partir dos critérios configurados pela escola. Ela não classifica estudantes: serve para a equipe pedagógica avaliar e decidir o acompanhamento." />
            <Button title="Ajustar critérios" variant="ghost" compact onPress={() => router.push('/management/rules')} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/students/${item.studentId}`)} accessibilityLabel={`${item.studentName}. ${item.reasons.join('. ')}`}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="label" style={{ flex: 1 }}>{item.studentName}</AppText>
              <Badge label={item.classroomName} tone="primary" />
            </Row>
            {item.reasons.map((r) => <AppText key={r} style={{ color: colors.warning, marginTop: 4 }}>{`• ${r}`}</AppText>)}
            <AppText variant="caption" style={{ marginTop: 4 }}>
              {`${item.totalRecords} aulas no período · frequência ${formatPercent(item.attendancePercent)}`}
            </AppText>
            <Row style={{ marginTop: spacing.sm }}>
              <Button title="Registrar acompanhamento" compact variant="secondary"
                onPress={() => router.push({ pathname: '/followup/[id]', params: { id: 'new', studentId: item.studentId, reason: `Frequência: ${item.reasons.join('; ')}` } })} />
            </Row>
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon="happy-outline" title="Nenhum estudante nos critérios de atenção" message="A frequência está dentro dos parâmetros configurados." />}
      />
    </View>
  );
}

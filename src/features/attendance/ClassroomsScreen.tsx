import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { attendanceRepository } from '@/data/repositories/attendanceRepository';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button } from '@/ui/components/primitives';
import { EmptyState, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

const SHIFT = { morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite', full: 'Integral' } as const;

export default function ClassroomsScreen() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const q = useQuery({
    queryKey: ['classrooms', ctx.membershipId],
    queryFn: () => attendanceRepository.listClassrooms(ctx, { userId }),
  });

  if (q.isPending) return <LoadingState label="Carregando turmas…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {q.data.offline ? (
        <View style={{ padding: spacing.md }}>
          <InlineMessage tone="warning" icon="cloud-offline-outline" text="Sem conexão — exibindo turmas salvas no aparelho." />
        </View>
      ) : null}
      <FlashList
        data={q.data.data}
        keyExtractor={(c) => c.id}
        onRefresh={() => void q.refetch()}
        refreshing={q.isRefetching}
        renderItem={({ item }) => (
          <ListItem
            icon="people-outline"
            title={item.name}
            subtitle={`${SHIFT[item.shift]} · ${item.studentCount ?? '—'} estudantes · ${item.schoolYear}`}
            right={
              <Button title="Chamada" compact onPress={() => router.push(`/attendance/${item.id}`)}
                accessibilityLabel={`Fazer chamada da turma ${item.name}`} />
            }
            onPress={() => router.push(`/classroom/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon="people-outline" title="Nenhuma turma vinculada"
            message="Peça à coordenação para vincular você às suas turmas." />
        }
        ListHeaderComponent={q.data.data.length > 0 ? (
          <View style={{ padding: spacing.md }}>
            <Badge label={`${q.data.data.length} turma(s)`} tone="primary" />
          </View>
        ) : null}
      />
    </View>
  );
}

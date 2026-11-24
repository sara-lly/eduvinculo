import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button, Row } from '@/ui/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

export default function ManageClassrooms() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const q = useQuery({ queryKey: ['management', 'classrooms', ctx.schoolId, 'all'], queryFn: () => managementRepository.listClassrooms(ctx.schoolId, true) });

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md }}>
        <Button title="Nova turma" onPress={() => router.push('/management/classroom-form')} />
      </View>
      <FlashList
        data={q.data}
        keyExtractor={(c) => c.id}
        onRefresh={() => void q.refetch()}
        refreshing={q.isRefetching}
        renderItem={({ item }) => (
          <ListItem
            title={item.name}
            subtitle={`${item.grade ?? ''} · ${item.studentCount ?? 0} estudantes · ${item.schoolYear}`}
            right={
              <Row>
                {!item.active ? <Badge label="Inativa" tone="danger" /> : (
                  <Button title="Chamada" compact variant="secondary" onPress={() => router.push(`/attendance/${item.id}`)} />
                )}
              </Row>
            }
            onPress={() => router.push({ pathname: '/management/classroom-form', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={<EmptyState title="Nenhuma turma cadastrada" />}
      />
    </View>
  );
}

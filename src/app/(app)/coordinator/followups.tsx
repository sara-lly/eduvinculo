import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { formatDateBR } from '@/core/dates';
import { followupRepository } from '@/data/repositories/followupRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ChipSelect } from '@/ui/components/forms';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button } from '@/ui/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

const STATUS = { open: { label: 'Aberto', tone: 'warning' }, in_progress: { label: 'Em andamento', tone: 'info' }, closed: { label: 'Encerrado', tone: 'success' } } as const;

export default function FollowupsScreen() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const [filter, setFilter] = useState<'active' | 'closed'>('active');
  const q = useQuery({ queryKey: ['followups', ctx.schoolId, filter], queryFn: () => followupRepository.list(ctx.schoolId, filter) });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        <ChipSelect value={filter} onChange={setFilter} options={[{ value: 'active', label: 'Em aberto' }, { value: 'closed', label: 'Encerrados' }]} />
        <Button title="Novo acompanhamento" onPress={() => router.push({ pathname: '/followup/[id]', params: { id: 'new' } })} />
      </View>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <FlashList
          data={q.data}
          keyExtractor={(f) => f.id}
          onRefresh={() => void q.refetch()}
          refreshing={q.isRefetching}
          renderItem={({ item }) => (
            <ListItem icon="clipboard-outline" title={item.studentName}
              subtitle={`${item.reason}\nIdentificado em ${formatDateBR(item.identifiedAt)}${item.nextFollowupDate ? ` · próximo: ${formatDateBR(item.nextFollowupDate)}` : ''}`}
              right={<Badge label={STATUS[item.status].label} tone={STATUS[item.status].tone} />}
              onPress={() => router.push(`/followup/${item.id}`)} />
          )}
          ListEmptyComponent={<EmptyState icon="clipboard-outline" title="Nenhum acompanhamento" message="Registros internos, visíveis apenas à coordenação e direção." />}
        />
      )}
    </View>
  );
}

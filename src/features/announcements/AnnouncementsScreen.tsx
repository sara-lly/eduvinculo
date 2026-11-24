import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { formatDateBR } from '@/core/dates';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { isStaffRole } from '@/domain/roles';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button } from '@/ui/components/primitives';
import { CachedDataNotice, EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

export default function AnnouncementsScreen() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const staff = isStaffRole(ctx.role);
  const q = useQuery({
    queryKey: ['announcements', userId, ctx.schoolId],
    queryFn: () => communicationRepository.announcements(userId, ctx.schoolId, staff),
  });

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
        <CachedDataNotice cachedAt={(q.data as { __fromCache?: number }).__fromCache} />
        {staff ? <Button title="Novo comunicado" onPress={() => router.push('/announcement/new')} style={{ marginBottom: spacing.md }} /> : null}
      </View>
      <FlashList
        data={q.data}
        keyExtractor={(a) => a.id}
        onRefresh={() => void q.refetch()}
        refreshing={q.isRefetching}
        renderItem={({ item }) => (
          <ListItem
            icon="megaphone-outline"
            title={item.title}
            subtitle={staff
              ? `${formatDateBR(item.publishedAt)} · ${item.recipientsCount ?? 0} destinatários${item.requiresAck ? ` · ${item.acknowledgedCount ?? 0} confirmaram ciência` : ''}`
              : `${formatDateBR(item.publishedAt)}${item.requiresAck && !item.acknowledgedAt ? ' · confirmação de ciência pendente' : ''}`}
            right={!staff && !item.readAt ? <Badge label="Novo" tone="info" /> : item.requiresAck && !item.acknowledgedAt && !staff ? <Badge label="Confirmar" tone="warning" /> : undefined}
            onPress={() => router.push(`/announcement/${item.id}`)}
          />
        )}
        ListEmptyComponent={<EmptyState icon="megaphone-outline" title="Nenhum comunicado" message="Os comunicados da escola aparecerão aqui." />}
      />
    </View>
  );
}

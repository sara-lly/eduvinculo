import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDateBR, formatRelativeBR } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import type { AppNotification } from '@/domain/types';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { AppText, Button } from '@/ui/components/primitives';
import { CachedDataNotice, EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { colors, spacing } from '@/ui/theme';

const ICONS: Record<AppNotification['type'], 'alert-circle-outline' | 'warning-outline' | 'megaphone-outline' | 'clipboard-outline' | 'information-circle-outline'> = {
  absence: 'alert-circle-outline',
  recurrent_absence: 'warning-outline',
  announcement: 'megaphone-outline',
  followup: 'clipboard-outline',
  system: 'information-circle-outline',
};

const NotificationRow = memo(function NotificationRow({ item, onOpen }: { item: AppNotification; onOpen: (n: AppNotification) => void }) {
  const unread = !item.readAt;
  return (
    <Pressable onPress={() => onOpen(item)} style={({ pressed }) => [styles.row, unread && styles.unread, pressed && { opacity: 0.8 }]}
      accessibilityRole="button" accessibilityLabel={`${unread ? 'Não lida. ' : ''}${item.title}. ${item.body}`}>
      <Ionicons name={ICONS[item.type]} size={22} color={item.type === 'absence' || item.type === 'recurrent_absence' ? colors.warning : colors.primary} />
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={2}>{item.title}</AppText>
        <AppText variant="caption" numberOfLines={2}>{item.body}</AppText>
        <AppText variant="caption" style={{ marginTop: 2 }}>
          {item.occurrenceDate ? `Ocorrência: ${formatDateBR(item.occurrenceDate)} · ` : ''}{formatRelativeBR(item.createdAt)}
        </AppText>
      </View>
      {unread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
});

export default function NotificationsScreen() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list', userId, ctx.schoolId],
    queryFn: ({ pageParam }) => communicationRepository.notificationsPage(userId, ctx.schoolId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const fromCache = query.data?.pages[0]?.fromCache;

  const markAll = useMutation({
    mutationFn: () => communicationRepository.markAllRead(ctx.schoolId),
    onSuccess: (n) => {
      toast.success(n > 0 ? `${n} notificação(ões) marcadas como lidas.` : 'Nenhuma notificação pendente.');
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const open = useCallback((n: AppNotification) => router.push(`/notification/${n.id}`), [router]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md, paddingBottom: 0 }}>
        <CachedDataNotice cachedAt={fromCache} />
      </View>
      <FlashList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <NotificationRow item={item} onOpen={open} />}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={items.some((i) => !i.readAt) ? (
          <Button title="Marcar todas como lidas" variant="ghost" onPress={() => markAll.mutate()} loading={markAll.isPending} />
        ) : null}
        ListEmptyComponent={<EmptyState icon="notifications-off-outline" title="Nenhuma notificação" message="Avisos de faltas e comunicados aparecerão aqui." />}
        ListFooterComponent={query.isFetchingNextPage ? <LoadingState label="Carregando mais…" /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, alignItems: 'flex-start',
  },
  unread: { backgroundColor: '#F2F7FF' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, marginTop: 6 },
});

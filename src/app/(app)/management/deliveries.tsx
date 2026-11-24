import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { formatDateTimeBR } from '@/core/dates';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ListItem } from '@/ui/components/layout';
import { Badge } from '@/ui/components/primitives';
import { EmptyState, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

const STATUS = {
  sent: { l: 'Enviada', t: 'success' }, pending: { l: 'Pendente', t: 'warning' }, failed: { l: 'Falhou', t: 'danger' }, skipped: { l: 'Não aplicável', t: 'neutral' },
} as const;

/** Registro de tentativas de envio (in-app e push). */
export default function DeliveriesScreen() {
  const ctx = useSchoolContext();
  const q = useQuery({ queryKey: ['deliveries', ctx.schoolId], queryFn: () => communicationRepository.deliveries(ctx.schoolId) });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md }}>
        <InlineMessage tone="info" text="“Não aplicável” = destinatário sem push ativo; a notificação continua disponível no app." />
      </View>
      <FlashList
        data={q.data}
        keyExtractor={(d) => d.id}
        onRefresh={() => void q.refetch()}
        refreshing={q.isRefetching}
        renderItem={({ item }) => {
          const s = STATUS[item.status as keyof typeof STATUS] ?? STATUS.pending;
          return (
            <ListItem title={item.notifications?.title ?? 'Notificação'}
              subtitle={`${item.channel === 'push' ? 'Push' : 'No app'} · ${item.attempts} tentativa(s) · ${formatDateTimeBR(item.created_at, ctx.timezone)}${item.last_error ? `\nErro: ${item.last_error}` : ''}`}
              right={<Badge label={s.l} tone={s.t} />} />
          );
        }}
        ListEmptyComponent={<EmptyState title="Nenhum envio registrado" />}
      />
    </View>
  );
}

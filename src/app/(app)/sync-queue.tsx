import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { formatDateBR, formatRelativeBR } from '@/core/dates';
import { attendanceStore } from '@/data/local/attendanceStore';
import { syncEngine } from '@/data/sync';
import { useSessionStore } from '@/features/auth/sessionStore';
import { useIsOnline, useSyncStatus } from '@/features/sync/hooks';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Badge, Button, Card, SectionTitle } from '@/ui/components/primitives';
import { InlineMessage, SyncPill } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

/** Fila de sincronização: transparência sobre o que ainda não foi enviado. */
export default function SyncQueueScreen() {
  const online = useIsOnline();
  const status = useSyncStatus();
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useSessionStore((s) => s.activeContext);
  const ops = useQuery({ queryKey: ['outbox'], queryFn: () => attendanceStore.listOps(), networkMode: 'always' });

  useEffect(() => {
    if (!status.running) void ops.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.running, status.pending]);

  const syncNow = async () => {
    try {
      const r = await syncEngine.onConnectivityRestored();
      if (r.stoppedByNetwork) toast.info('Sem conexão. Tentaremos novamente automaticamente.');
      else toast.success(`${r.applied} enviada(s)${r.conflicts ? `, ${r.conflicts} conflito(s)` : ''}${r.failed ? `, ${r.failed} com erro` : ''}.`);
      void qc.invalidateQueries({ queryKey: ['local-session'] });
    } catch {
      toast.error('Não foi possível sincronizar agora.');
    }
  };

  return (
    <Screen>
      <Card style={{ gap: spacing.sm }}>
        <SyncPill pending={status.pending} running={status.running} offline={!online} />
        <AppText variant="caption">
          {status.lastSyncAt ? `Última sincronização ${formatRelativeBR(new Date(status.lastSyncAt).toISOString())}` : 'Nenhuma sincronização nesta sessão.'}
        </AppText>
        {status.lastError ? <InlineMessage tone="warning" text={status.lastError} /> : null}
        <Button title="Sincronizar agora" onPress={() => void syncNow()} loading={status.running} disabled={!online} />
      </Card>
      <AppText variant="caption" style={{ marginTop: spacing.md }}>
        Chamadas registradas sem internet ficam salvas neste aparelho e são enviadas automaticamente quando a conexão volta (inclusive em
        segundo plano, quando o sistema permite). Reenvios não geram duplicidade.
      </AppText>

      <SectionTitle title={`Fila (${ops.data?.length ?? 0})`} />
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>
        {(ops.data ?? []).map((op) => (
          <ListItem
            key={op.opId}
            icon="document-text-outline"
            title={`Chamada de ${formatDateBR(op.payload.session.lessonDate)} · ${op.payload.records.length} registros`}
            subtitle={`${op.payload.session.status === 'completed' ? 'Concluída' : 'Rascunho'} · ${op.attempts} tentativa(s)${op.lastError ? `\n${op.lastError}` : ''}`}
            right={op.state === 'failed'
              ? <Button title="Reenviar" compact variant="secondary" onPress={() => void syncEngine.retryOp(op.opId).then(() => syncNow())} />
              : <Badge label={op.state === 'inflight' ? 'Enviando' : 'Pendente'} tone="warning" />}
            onPress={() => router.push({ pathname: '/attendance/[classroomId]', params: { classroomId: op.payload.session.classroomId, date: op.payload.session.lessonDate, slot: String(op.payload.session.lessonSlot) } })}
          />
        ))}
        {ops.data?.length === 0 ? <Card><AppText variant="caption">Tudo sincronizado. ✔</AppText></Card> : null}
      </View>
      {ctx?.kind === 'school' && ctx.role !== 'guardian' && ctx.role !== 'student' ? (
        <Button title="Ver conflitos de chamada" variant="ghost" onPress={() => router.push('/conflicts')} style={{ marginTop: spacing.md }} />
      ) : null}
    </Screen>
  );
}

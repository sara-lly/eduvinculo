import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { formatDateBR, formatDateTimeBR } from '@/core/dates';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { useSessionStore } from '@/features/auth/sessionStore';
import { Screen } from '@/ui/components/layout';
import { AppText, Badge, Button, Card } from '@/ui/components/primitives';
import { ErrorState, LoadingState } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

const TYPE_LABEL = {
  absence: 'Falta registrada',
  recurrent_absence: 'Acompanhamento de frequência',
  announcement: 'Comunicado',
  followup: 'Acompanhamento',
  system: 'Sistema',
} as const;

export default function NotificationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const ctx = useSessionStore((s) => s.activeContext);
  const q = useQuery({ queryKey: ['notification', id], queryFn: () => communicationRepository.notification(id) });

  // Marca como lida ao abrir (uma vez por notificação).
  useEffect(() => {
    if (q.data && !q.data.readAt) {
      void communicationRepository.markNotificationRead(q.data.id)
        .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
        .catch(() => undefined);
    }
  }, [q.data, qc]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const n = q.data;
  const announcementId = typeof n.data.announcement_id === 'string' ? n.data.announcement_id : null;
  const reasons = Array.isArray(n.data.reasons) ? (n.data.reasons as string[]) : [];
  const timezone = ctx?.kind === 'school' ? ctx.timezone : undefined;

  return (
    <Screen>
      <Card style={{ gap: spacing.sm }}>
        <Badge label={TYPE_LABEL[n.type]} tone={n.type === 'absence' || n.type === 'recurrent_absence' ? 'warning' : 'primary'} />
        <AppText variant="subtitle">{n.title}</AppText>
        <AppText>{n.body}</AppText>
        {reasons.length > 0 ? (
          <AppText variant="caption">{`Motivos identificados: ${reasons.join('; ')}`}</AppText>
        ) : null}
        {n.occurrenceDate ? <AppText variant="caption">{`Data da ocorrência: ${formatDateBR(n.occurrenceDate)}`}</AppText> : null}
        <AppText variant="caption">{`Recebida em ${formatDateTimeBR(n.createdAt, timezone)}`}</AppText>
      </Card>
      {announcementId ? (
        <Button title="Abrir comunicado" style={{ marginTop: spacing.lg }} onPress={() => router.push(`/announcement/${announcementId}`)} />
      ) : null}
      {n.studentId && ctx?.kind === 'school' && ctx.role !== 'student' ? (
        <Button title="Ver frequência do estudante" variant="secondary" style={{ marginTop: spacing.md }}
          onPress={() => router.push(`/students/${n.studentId}`)} />
      ) : null}
      {n.type === 'recurrent_absence' ? (
        <AppText variant="caption" style={{ marginTop: spacing.lg }}>
          Este aviso descreve fatos registrados na frequência. Ele não é uma avaliação do estudante; a equipe pedagógica analisa cada caso.
        </AppText>
      ) : null}
    </Screen>
  );
}

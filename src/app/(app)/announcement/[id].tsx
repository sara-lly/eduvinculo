import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { formatDateTimeBR } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { isStaffRole } from '@/domain/roles';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { Screen } from '@/ui/components/layout';
import { AppText, Badge, Button, Card } from '@/ui/components/primitives';
import { EmptyState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

const AUDIENCE = { all: 'Toda a escola', guardians: 'Responsáveis', students: 'Estudantes', teachers: 'Professores', classroom: 'Turma' } as const;

export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = useSchoolContext();
  const userId = useUserId();
  const qc = useQueryClient();
  const staff = isStaffRole(ctx.role);
  // Reaproveita a lista em cache (sem nova requisição se ainda estiver válida).
  const list = useQuery({
    queryKey: ['announcements', userId, ctx.schoolId],
    queryFn: () => communicationRepository.announcements(userId, ctx.schoolId, staff),
  });
  const a = useMemo(() => list.data?.find((x) => x.id === id), [list.data, id]);

  useEffect(() => {
    if (a && !a.readAt && !staff) {
      void communicationRepository.markAnnouncementRead(a.id, false)
        .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
        .catch(() => undefined);
    }
  }, [a, staff, qc]);

  const ack = useMutation({
    mutationFn: () => communicationRepository.markAnnouncementRead(id, true),
    onSuccess: () => {
      toast.success('Ciência confirmada. Obrigado!');
      void qc.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  if (list.isPending) return <LoadingState />;
  if (!a) return <EmptyState title="Comunicado não encontrado" message="Ele pode ter sido removido pela escola." />;

  return (
    <Screen>
      <Card style={{ gap: spacing.sm }}>
        <Badge label={AUDIENCE[a.audience]} tone="primary" />
        <AppText variant="title">{a.title}</AppText>
        <AppText variant="caption">{`${ctx.schoolName} · ${formatDateTimeBR(a.publishedAt, ctx.timezone)}`}</AppText>
        <AppText style={{ marginTop: spacing.sm, lineHeight: 22 }}>{a.body}</AppText>
      </Card>
      {staff && a.requiresAck ? (
        <InlineMessage tone="info" text={`${a.acknowledgedCount ?? 0} de ${a.recipientsCount ?? 0} destinatários confirmaram ciência.`} />
      ) : null}
      {!staff && a.requiresAck ? (
        a.acknowledgedAt ? (
          <InlineMessage tone="success" text={`Ciência confirmada em ${formatDateTimeBR(a.acknowledgedAt, ctx.timezone)}.`} />
        ) : (
          <Button title="Confirmar que li e estou ciente" onPress={() => ack.mutate()} loading={ack.isPending} style={{ marginTop: spacing.lg }} />
        )
      ) : null}
    </Screen>
  );
}

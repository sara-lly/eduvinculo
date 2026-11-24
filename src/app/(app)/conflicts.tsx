import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { formatDateBR, formatRelativeBR } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { attendanceRepository } from '@/data/repositories/attendanceRepository';
import { STATUS_LABEL } from '@/domain/attendance';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { Screen } from '@/ui/components/layout';
import { AppText, Button, Card, Row } from '@/ui/components/primitives';
import { EmptyState, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

/**
 * Conflitos de chamada: quando duas pessoas editam a mesma chamada a partir de
 * versões diferentes, nada é sobrescrito. Aqui se escolhe qual versão manter;
 * ambas ficam registradas na auditoria.
 */
export default function ConflictsScreen() {
  const ctx = useSchoolContext();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['conflicts', ctx.schoolId], queryFn: () => attendanceRepository.listConflicts(ctx.schoolId) });

  const resolve = (id: string, accept: boolean) => {
    Alert.alert(accept ? 'Aplicar versão enviada' : 'Manter versão atual',
      accept ? 'Os registros enviados substituirão os atuais nesta chamada.' : 'A versão enviada será descartada (permanece no histórico de auditoria).',
      [{ text: 'Cancelar', style: 'cancel' }, {
        text: 'Confirmar', onPress: async () => {
          setBusy(id);
          try {
            await attendanceRepository.resolveConflict(id, accept);
            toast.success('Conflito resolvido.');
            void qc.invalidateQueries({ queryKey: ['conflicts'] });
            void qc.invalidateQueries({ queryKey: ['dashboard'] });
          } catch (e) {
            toast.error(toAppError(e).message);
          } finally {
            setBusy(null);
          }
        },
      }]);
  };

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) return <EmptyState icon="git-compare-outline" title="Nenhum conflito pendente" message="Edições simultâneas da mesma chamada aparecerão aqui para revisão." />;

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <InlineMessage tone="info" text="Nenhum dado foi sobrescrito automaticamente. Compare as versões e decida." />
      {q.data.map((c) => (
        <Card key={c.id} style={{ marginBottom: spacing.md, gap: 6 }}>
          <AppText variant="label">{`${c.classroomName} · ${formatDateBR(c.lessonDate)}`}</AppText>
          <AppText variant="caption">{`Enviado por ${c.submittedByName} ${formatRelativeBR(c.createdAt)}`}</AppText>
          {c.differences.length === 0 ? <AppText variant="caption">Sem diferenças nos registros (apenas versão desatualizada).</AppText> : null}
          {c.differences.slice(0, 20).map((d) => (
            <AppText key={d.studentId} style={{ fontSize: 14 }}>
              {`• ${d.studentName}: atual “${d.server ? STATUS_LABEL[d.server] : 'sem registro'}” → enviado “${STATUS_LABEL[d.submitted]}”`}
            </AppText>
          ))}
          <View style={{ height: spacing.sm }} />
          <Row>
            <Button title="Manter atual" variant="secondary" compact style={{ flex: 1 }} disabled={busy === c.id} onPress={() => resolve(c.id, false)} />
            <Button title="Aplicar enviada" compact style={{ flex: 1 }} loading={busy === c.id} onPress={() => resolve(c.id, true)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

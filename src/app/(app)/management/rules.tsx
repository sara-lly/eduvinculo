import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { toAppError } from '@/core/errors';
import { managementRepository } from '@/data/repositories/managementRepository';
import { rulesSchema, type RulesForm } from '@/domain/validation';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { FormSection, FormSwitchField, FormTextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { Button } from '@/ui/components/primitives';
import { ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';

/** Critérios de faltas recorrentes e de notificação — configuráveis pela escola. */
export default function RulesScreen() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rules', ctx.schoolId], queryFn: () => managementRepository.getRules(ctx.schoolId) });
  const { control, handleSubmit, reset, formState } = useForm<z.input<typeof rulesSchema>, unknown, RulesForm>({ resolver: zodResolver(rulesSchema) });

  useEffect(() => {
    if (q.data) reset(q.data);
  }, [q.data, reset]);

  const save = handleSubmit(async (v) => {
    try {
      await managementRepository.saveRules({ schoolId: ctx.schoolId, ...v }, userId);
      toast.success('Regras atualizadas.');
      await qc.invalidateQueries({ queryKey: ['rules'] });
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  });

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <Screen>
      <InlineMessage tone="info" text="Os critérios abaixo apenas sinalizam situações para avaliação da equipe pedagógica. Nenhuma decisão é tomada automaticamente." />
      <FormSection title="Critérios de atenção">
        <FormTextField control={control} name="consecutiveAbsencesThreshold" label="Faltas consecutivas" keyboardType="number-pad" />
        <FormTextField control={control} name="weeklyAbsencesThreshold" label="Faltas na mesma semana" keyboardType="number-pad" />
        <FormTextField control={control} name="periodAbsencesThreshold" label="Faltas no período" keyboardType="number-pad" />
        <FormTextField control={control} name="periodDays" label="Período analisado (dias)" keyboardType="number-pad" />
        <FormTextField control={control} name="minAttendancePercent" label="Frequência mínima (%)" keyboardType="decimal-pad" />
        <FormTextField control={control} name="minRecordsForPercent" label="Registros mínimos para exibir percentual" keyboardType="number-pad"
          hint="Evita percentuais enganosos quando há poucas aulas registradas." />
      </FormSection>
      <FormSection title="Cálculo da frequência">
        <FormSwitchField control={control} name="lateCountsAsPresent" label="Atraso conta como presença" />
        <FormSwitchField control={control} name="justifiedCountsAsPresent" label="Falta justificada conta como presença" />
      </FormSection>
      <FormSection title="Notificações aos responsáveis">
        <FormSwitchField control={control} name="notifyGuardiansOnAbsence" label="Notificar a cada falta registrada" />
        <FormSwitchField control={control} name="notifyGuardiansOnAlert" label="Notificar quando houver faltas recorrentes" />
      </FormSection>
      <FormSection title="Correções">
        <FormTextField control={control} name="teacherEditWindowDays" label="Dias em que professores podem corrigir chamadas" keyboardType="number-pad" />
      </FormSection>
      <Button title="Salvar regras" onPress={() => void save()} loading={formState.isSubmitting} />
    </Screen>
  );
}

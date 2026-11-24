import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { formatDateBR } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { followupRepository } from '@/data/repositories/followupRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { brDateToIso, followupSchema, type FollowupForm } from '@/domain/validation';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { FormChipSelect, FormTextField, TextField } from '@/ui/components/forms';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Button, Card } from '@/ui/components/primitives';
import { ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

/** Criação/edição de acompanhamento pedagógico (restrito à coordenação pela RLS). */
export default function FollowupScreen() {
  const params = useLocalSearchParams<{ id: string; studentId?: string; reason?: string }>();
  const isNew = params.id === 'new';
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();
  const [studentSearch, setStudentSearch] = useState('');

  const existing = useQuery({ queryKey: ['followup', params.id], queryFn: () => followupRepository.get(params.id), enabled: !isNew });
  const studentResults = useQuery({
    queryKey: ['management', 'students', ctx.schoolId, studentSearch, 'followup'],
    queryFn: () => managementRepository.searchStudents(ctx.schoolId, { search: studentSearch, page: 0 }),
    enabled: isNew && !params.studentId && studentSearch.trim().length >= 2,
  });
  const preselected = useQuery({
    queryKey: ['student', params.studentId],
    queryFn: () => managementRepository.getStudent(params.studentId!),
    enabled: isNew && !!params.studentId,
  });

  const { control, handleSubmit, reset, setValue, watch, formState } = useForm<FollowupForm>({
    resolver: zodResolver(followupSchema),
    defaultValues: {
      studentId: params.studentId ?? '', reason: params.reason ?? '', situation: '', actionsTaken: '',
      nextFollowupDate: '', status: 'open', outcome: '',
    },
  });
  const studentId = watch('studentId');
  const status = watch('status');

  useEffect(() => {
    const f = existing.data;
    if (!f) return;
    reset({
      studentId: f.studentId, reason: f.reason, situation: f.situation ?? '', actionsTaken: f.actionsTaken ?? '',
      nextFollowupDate: f.nextFollowupDate ? formatDateBR(f.nextFollowupDate) : '', status: f.status, outcome: f.outcome ?? '',
    });
  }, [existing.data, reset]);

  const submit = handleSubmit(async (v) => {
    const input = {
      studentId: v.studentId, reason: v.reason, situation: v.situation, actionsTaken: v.actionsTaken,
      nextFollowupDate: v.nextFollowupDate ? brDateToIso(v.nextFollowupDate) : null, status: v.status, outcome: v.outcome,
    };
    try {
      if (isNew) await followupRepository.create(ctx.schoolId, input, userId);
      else await followupRepository.update(params.id, input, userId);
      toast.success(v.status === 'closed' ? 'Acompanhamento encerrado.' : 'Acompanhamento salvo.');
      await qc.invalidateQueries({ queryKey: ['followups'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      router.back();
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  });

  if (!isNew && existing.isPending) return <LoadingState />;
  if (!isNew && existing.isError) return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  const studentName = existing.data?.studentName ?? preselected.data?.fullName
    ?? studentResults.data?.items.find((s) => s.id === studentId)?.fullName;

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'Novo acompanhamento' : 'Acompanhamento' }} />
      <InlineMessage tone="info" icon="lock-closed-outline" text="Registro interno e confidencial: visível somente à coordenação e à direção." />
      {studentName ? (
        <Card style={{ marginBottom: spacing.md }}>
          <AppText variant="label">{studentName}</AppText>
          {!isNew ? <AppText variant="caption">{`Identificado em ${formatDateBR(existing.data?.identifiedAt)} · Responsável: ${existing.data?.assignedToName ?? '—'}`}</AppText> : null}
        </Card>
      ) : (
        <>
          <TextField label="Buscar estudante" value={studentSearch} onChangeText={setStudentSearch} placeholder="Nome ou matrícula" />
          {(studentResults.data?.items ?? []).slice(0, 8).map((s) => (
            <ListItem key={s.id} title={s.fullName} subtitle={s.classroomName ?? undefined} onPress={() => setValue('studentId', s.id, { shouldValidate: true })} />
          ))}
          <Controller control={control} name="studentId" render={({ fieldState }) => fieldState.error ? <InlineMessage tone="danger" text={fieldState.error.message ?? ''} /> : <></>} />
        </>
      )}
      <FormTextField control={control} name="reason" label="Motivo do acompanhamento" multiline />
      <FormTextField control={control} name="situation" label="Situação identificada" multiline />
      <FormTextField control={control} name="actionsTaken" label="Providências adotadas" multiline />
      <FormTextField control={control} name="nextFollowupDate" label="Próximo acompanhamento (DD/MM/AAAA)" keyboardType="numbers-and-punctuation" maxLength={10} />
      <FormChipSelect control={control} name="status" label="Situação atual" options={[
        { value: 'open', label: 'Aberto' }, { value: 'in_progress', label: 'Em andamento' }, { value: 'closed', label: 'Encerrado' },
      ]} />
      {status === 'closed' ? <FormTextField control={control} name="outcome" label="Resultado do acompanhamento" multiline /> : null}
      <Button title="Salvar" onPress={() => void submit()} loading={formState.isSubmitting} />
    </Screen>
  );
}

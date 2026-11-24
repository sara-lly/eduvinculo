import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from 'react-native';
import { formatDateBR } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { managementRepository } from '@/data/repositories/managementRepository';
import { brDateToIso, studentSchema, type StudentForm } from '@/domain/validation';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { FormChipSelect, FormTextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { AppText, Button } from '@/ui/components/primitives';
import { InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

/** Cadastro/edição de estudante; mudar a turma de um estudante existente = transferência. */
export default function StudentFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();
  const classrooms = useQuery({ queryKey: ['management', 'classrooms', ctx.schoolId], queryFn: () => managementRepository.listClassrooms(ctx.schoolId) });
  const existing = useQuery({ queryKey: ['student', id], queryFn: () => managementRepository.getStudent(id!), enabled: !!id });

  const { control, handleSubmit, reset, formState } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    defaultValues: { fullName: '', registrationCode: '', birthDate: '', classroomId: '' },
  });

  useEffect(() => {
    const s = existing.data;
    if (s) reset({ fullName: s.fullName, registrationCode: s.registrationCode, birthDate: s.birthDate ? formatDateBR(s.birthDate) : '', classroomId: s.classroomId ?? '' });
  }, [existing.data, reset]);

  const persist = async (v: StudentForm) => {
    const birthDate = v.birthDate ? brDateToIso(v.birthDate) : null;
    if (v.birthDate && !birthDate) {
      toast.error('Data de nascimento inválida.');
      return;
    }
    try {
      if (id && existing.data) {
        await managementRepository.updateStudent(id, { fullName: v.fullName, registrationCode: v.registrationCode, birthDate });
        if (v.classroomId && v.classroomId !== existing.data.classroomId) {
          await managementRepository.transferStudent(id, v.classroomId);
        }
      } else {
        await managementRepository.createStudent(ctx.schoolId, { fullName: v.fullName, registrationCode: v.registrationCode, birthDate, classroomId: v.classroomId || null }, userId);
      }
      toast.success('Estudante salvo.');
      await qc.invalidateQueries({ queryKey: ['management'] });
      void qc.invalidateQueries({ queryKey: ['student', id] });
      void qc.invalidateQueries({ queryKey: ['roster'] });
      router.back();
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  };

  const onSubmit = handleSubmit(async (v) => {
    const transferring = !!id && !!existing.data?.classroomId && v.classroomId !== existing.data.classroomId && !!v.classroomId;
    if (transferring) {
      const target = classrooms.data?.find((c) => c.id === v.classroomId)?.name ?? 'nova turma';
      await new Promise<void>((resolve) => Alert.alert('Transferir estudante',
        `Transferir de ${existing.data?.classroomName} para ${target} a partir de hoje? O histórico da turma anterior é preservado.`,
        [{ text: 'Cancelar', style: 'cancel', onPress: () => resolve() }, { text: 'Transferir', onPress: () => void persist(v).finally(resolve) }]));
      return;
    }
    await persist(v);
  });

  if (id && existing.isPending) return <LoadingState />;
  return (
    <Screen>
      {id ? <AppText variant="caption" style={{ marginBottom: spacing.md }}>Alterar a turma registra uma transferência com data de hoje.</AppText> : null}
      <FormTextField control={control} name="fullName" label="Nome completo" />
      <FormTextField control={control} name="registrationCode" label="Matrícula" autoCapitalize="characters" />
      <FormTextField control={control} name="birthDate" label="Data de nascimento (DD/MM/AAAA, opcional)" keyboardType="numbers-and-punctuation" maxLength={10} />
      <FormChipSelect control={control} name="classroomId" label="Turma"
        options={(classrooms.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      <InlineMessage tone="info" text="Colete somente os dados necessários. CPF, endereço e dados de saúde não são solicitados pelo sistema." />
      <Button title="Salvar" onPress={() => void onSubmit()} loading={formState.isSubmitting} />
    </Screen>
  );
}

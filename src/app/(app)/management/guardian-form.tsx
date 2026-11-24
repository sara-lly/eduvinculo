import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Share } from 'react-native';
import { toAppError } from '@/core/errors';
import { managementRepository } from '@/data/repositories/managementRepository';
import { guardianSchema, type GuardianForm } from '@/domain/validation';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { FormTextField, TextField } from '@/ui/components/forms';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Button, Card, SectionTitle } from '@/ui/components/primitives';
import { InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

/**
 * Cadastro de responsável + vínculo com estudante. O acesso ao app só é
 * liberado com o convite gerado aqui (validação administrativa).
 */
export default function GuardianFormScreen() {
  const params = useLocalSearchParams<{ guardianId?: string; studentId?: string }>();
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();
  const [studentSearch, setStudentSearch] = useState('');
  const [linkStudentId, setLinkStudentId] = useState('');
  const [relationship, setRelationship] = useState('');

  const guardians = useQuery({ queryKey: ['management', 'guardians', ctx.schoolId, ''], queryFn: () => managementRepository.listGuardians(ctx.schoolId), enabled: !!params.guardianId });
  const guardian = guardians.data?.find((g) => g.id === params.guardianId);
  const preselected = useQuery({ queryKey: ['student', params.studentId], queryFn: () => managementRepository.getStudent(params.studentId!), enabled: !!params.studentId });
  const results = useQuery({
    queryKey: ['management', 'students', ctx.schoolId, studentSearch, 'guardian-form'],
    queryFn: () => managementRepository.searchStudents(ctx.schoolId, { search: studentSearch, page: 0 }),
    enabled: studentSearch.trim().length >= 2,
  });

  const { control, handleSubmit, setValue, watch, formState } = useForm<GuardianForm>({
    resolver: zodResolver(guardianSchema),
    defaultValues: { fullName: '', email: '', phone: '', relationship: '', studentId: params.studentId ?? '' },
  });
  const chosenStudent = watch('studentId');

  const invite = async (guardianId: string) => {
    try {
      const r = await managementRepository.createInvite({ schoolId: ctx.schoolId, role: 'guardian', guardianId, validDays: 7 });
      Alert.alert('Convite gerado', `${r.code}\n\nVálido por 7 dias, uso único. Entregue ao responsável. O código não será exibido novamente.`, [
        { text: 'Compartilhar', onPress: () => void Share.share({ message: `Seu código de acesso ao EduVínculo (${ctx.schoolName}): ${r.code}` }) },
        { text: 'OK' },
      ]);
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  };

  const create = handleSubmit(async (v) => {
    try {
      const id = await managementRepository.createGuardian(ctx.schoolId, v, userId);
      toast.success('Responsável cadastrado e vinculado.');
      await qc.invalidateQueries({ queryKey: ['management', 'guardians'] });
      void qc.invalidateQueries({ queryKey: ['student'] });
      Alert.alert('Gerar convite de acesso?', 'O responsável precisa de um código para acessar o app.', [
        { text: 'Agora não', onPress: () => router.back() },
        { text: 'Gerar convite', onPress: () => void invite(id).then(() => router.back()) },
      ]);
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  });

  const link = async () => {
    if (!guardian) return;
    try {
      await managementRepository.linkGuardian(ctx.schoolId, guardian.id, linkStudentId, relationship.trim() || 'responsável', userId);
      toast.success('Vínculo criado.');
      setLinkStudentId('');
      void qc.invalidateQueries({ queryKey: ['management', 'guardians'] });
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  };

  const studentPicker = (selected: string, onPick: (id: string) => void) => (
    <>
      <TextField label="Buscar estudante" value={studentSearch} onChangeText={setStudentSearch} placeholder="Nome ou matrícula" />
      {(results.data?.items ?? []).slice(0, 6).map((s) => (
        <ListItem key={s.id} title={`${selected === s.id ? '✓ ' : ''}${s.fullName}`} subtitle={s.classroomName ?? undefined} onPress={() => onPick(s.id)} />
      ))}
    </>
  );

  if (params.guardianId) {
    if (guardians.isPending) return <LoadingState />;
    if (!guardian) return <Screen><InlineMessage tone="danger" text="Responsável não encontrado." /></Screen>;
    return (
      <Screen>
        <Card style={{ gap: 4 }}>
          <AppText variant="subtitle">{guardian.fullName}</AppText>
          <AppText variant="caption">{[guardian.email, guardian.phone].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}</AppText>
          <AppText variant="caption">{guardian.hasAccount ? 'Possui acesso ao app' : 'Ainda sem acesso ao app'}</AppText>
        </Card>
        {!guardian.hasAccount ? <Button title="Gerar convite de acesso" style={{ marginTop: spacing.md }} onPress={() => void invite(guardian.id)} /> : null}
        <SectionTitle title="Estudantes vinculados" />
        {guardian.students.map((s) => <ListItem key={s.id} title={s.fullName} subtitle={s.relationship} onPress={() => router.push(`/students/${s.id}`)} />)}
        <SectionTitle title="Vincular outro estudante" />
        {studentPicker(linkStudentId, setLinkStudentId)}
        <TextField label="Parentesco" value={relationship} onChangeText={setRelationship} placeholder="mãe, pai, avó, tutor…" />
        <Button title="Vincular" variant="secondary" disabled={!linkStudentId} onPress={() => void link()} />
        <Button title={guardian.active ? 'Desativar cadastro' : 'Reativar cadastro'} variant={guardian.active ? 'danger' : 'success'} style={{ marginTop: spacing.xl }}
          onPress={() => void managementRepository.setGuardianActive(guardian.id, !guardian.active)
            .then(() => { toast.success('Cadastro atualizado.'); void qc.invalidateQueries({ queryKey: ['management', 'guardians'] }); })
            .catch((e) => toast.error(toAppError(e).message))} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FormTextField control={control} name="fullName" label="Nome completo" />
      <FormTextField control={control} name="email" label="E-mail (opcional)" keyboardType="email-address" autoCapitalize="none" />
      <FormTextField control={control} name="phone" label="Telefone (opcional)" keyboardType="phone-pad" />
      <FormTextField control={control} name="relationship" label="Parentesco" placeholder="mãe, pai, avó, tutor…" />
      {preselected.data ? (
        <Card style={{ marginBottom: spacing.md }}><AppText variant="label">{`Estudante: ${preselected.data.fullName}`}</AppText></Card>
      ) : (
        <>
          {studentPicker(chosenStudent, (id) => setValue('studentId', id, { shouldValidate: true }))}
          {formState.errors.studentId ? <InlineMessage tone="danger" text={formState.errors.studentId.message ?? ''} /> : null}
        </>
      )}
      <Button title="Cadastrar" onPress={() => void create()} loading={formState.isSubmitting} />
    </Screen>
  );
}

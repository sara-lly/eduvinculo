import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, View } from 'react-native';
import { todayIso } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { managementRepository } from '@/data/repositories/managementRepository';
import { classroomSchema, type ClassroomForm } from '@/domain/validation';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { ChipSelect, FormChipSelect, FormTextField, TextField } from '@/ui/components/forms';
import { ListItem, Screen } from '@/ui/components/layout';
import { Button, SectionTitle } from '@/ui/components/primitives';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';
import type { z } from 'zod';

export default function ClassroomFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();
  const classrooms = useQuery({ queryKey: ['management', 'classrooms', ctx.schoolId, 'all'], queryFn: () => managementRepository.listClassrooms(ctx.schoolId, true) });
  const teachers = useQuery({ queryKey: ['management', 'teachers', ctx.schoolId], queryFn: () => managementRepository.listTeachers(ctx.schoolId), enabled: !!id });
  const current = classrooms.data?.find((c) => c.id === id);
  const [teacherId, setTeacherId] = useState('');
  const [subject, setSubject] = useState('');

  const { control, handleSubmit, reset, formState } = useForm<z.input<typeof classroomSchema>, unknown, ClassroomForm>({
    resolver: zodResolver(classroomSchema),
    defaultValues: { name: '', grade: '', shift: 'morning', schoolYear: Number(todayIso(ctx.timezone).slice(0, 4)) },
  });

  useEffect(() => {
    if (current) reset({ name: current.name, grade: current.grade ?? '', shift: current.shift, schoolYear: current.schoolYear });
  }, [current, reset]);

  const save = handleSubmit(async (v) => {
    try {
      await managementRepository.saveClassroom(ctx.schoolId, { id, ...v }, userId);
      toast.success('Turma salva.');
      await qc.invalidateQueries({ queryKey: ['management'] });
      void qc.invalidateQueries({ queryKey: ['classrooms'] });
      router.back();
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  });

  const assign = async () => {
    try {
      await managementRepository.assignTeacher(ctx.schoolId, id!, teacherId, subject.trim() || 'Geral', userId);
      toast.success('Professor vinculado.');
      setSubject('');
      void qc.invalidateQueries({ queryKey: ['management', 'teachers'] });
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  };

  const linked = (teachers.data ?? []).flatMap((t) => t.classrooms.filter((c) => c.classroomId === id).map((c) => ({ ...c, teacher: t.fullName })));

  return (
    <Screen>
      <FormTextField control={control} name="name" label="Nome da turma" placeholder="Ex.: 7º Ano B" />
      <FormTextField control={control} name="grade" label="Série/ano" />
      <FormChipSelect control={control} name="shift" label="Turno" options={[
        { value: 'morning', label: 'Manhã' }, { value: 'afternoon', label: 'Tarde' }, { value: 'evening', label: 'Noite' }, { value: 'full', label: 'Integral' },
      ]} />
      <FormTextField control={control} name="schoolYear" label="Ano letivo" keyboardType="number-pad" maxLength={4} />
      <Button title="Salvar turma" onPress={() => void save()} loading={formState.isSubmitting} />

      {id && current ? (
        <>
          <SectionTitle title="Professores da turma" />
          {linked.map((l) => (
            <ListItem key={l.linkId} icon="person-outline" title={l.teacher} subtitle={l.subject}
              right={<Button title="Remover" compact variant="ghost" onPress={() => Alert.alert('Remover vínculo', `Remover ${l.teacher} desta turma?`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Remover', style: 'destructive', onPress: () => void managementRepository.unassignTeacher(l.linkId).then(() => qc.invalidateQueries({ queryKey: ['management', 'teachers'] })).catch((e) => toast.error(toAppError(e).message)) },
              ])} />} />
          ))}
          <View style={{ marginTop: spacing.sm }}>
            <ChipSelect label="Vincular professor" value={teacherId} onChange={setTeacherId}
              options={(teachers.data ?? []).filter((t) => t.active).map((t) => ({ value: t.userId, label: t.fullName }))} />
            <TextField label="Disciplina" value={subject} onChangeText={setSubject} placeholder="Ex.: Matemática" />
            <Button title="Vincular" variant="secondary" disabled={!teacherId} onPress={() => void assign()} />
          </View>
          <Button title={current.active ? 'Desativar turma' : 'Reativar turma'} variant={current.active ? 'danger' : 'success'} style={{ marginTop: spacing.xl }}
            onPress={() => Alert.alert(current.active ? 'Desativar turma' : 'Reativar turma', 'O histórico de frequência é preservado.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Confirmar', onPress: () => void managementRepository.setClassroomActive(current.id, !current.active).then(() => { toast.success('Turma atualizada.'); void qc.invalidateQueries({ queryKey: ['management'] }); router.back(); }).catch((e) => toast.error(toAppError(e).message)) },
            ])} />
        </>
      ) : null}
    </Screen>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useForm, useWatch } from 'react-hook-form';
import { toAppError } from '@/core/errors';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { announcementSchema, type AnnouncementForm } from '@/domain/validation';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { FormChipSelect, FormSwitchField, FormTextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { Button } from '@/ui/components/primitives';
import { toast } from '@/ui/components/toast';

export default function NewAnnouncement() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const qc = useQueryClient();
  const classrooms = useQuery({ queryKey: ['management', 'classrooms', ctx.schoolId], queryFn: () => managementRepository.listClassrooms(ctx.schoolId) });
  const { control, handleSubmit, formState } = useForm<AnnouncementForm>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { title: '', body: '', audience: 'all', classroomId: '', requiresAck: false },
  });
  const audience = useWatch({ control, name: 'audience' });

  const publish = (v: AnnouncementForm) =>
    new Promise<void>((resolve) => {
      Alert.alert('Publicar comunicado', 'Os destinatários receberão uma notificação. Deseja publicar?', [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve() },
        {
          text: 'Publicar',
          onPress: async () => {
            try {
              await communicationRepository.publishAnnouncement({ schoolId: ctx.schoolId, ...v, classroomId: v.audience === 'classroom' ? v.classroomId : null });
              toast.success('Comunicado publicado.');
              await qc.invalidateQueries({ queryKey: ['announcements'] });
              router.back();
            } catch (e) {
              toast.error(toAppError(e).message);
            } finally {
              resolve();
            }
          },
        },
      ]);
    });

  return (
    <Screen>
      <FormTextField control={control} name="title" label="Título" maxLength={120} />
      <FormTextField control={control} name="body" label="Mensagem" multiline maxLength={4000} />
      <FormChipSelect control={control} name="audience" label="Destinatários" options={[
        { value: 'all', label: 'Toda a escola' },
        { value: 'guardians', label: 'Responsáveis' },
        { value: 'students', label: 'Estudantes' },
        { value: 'teachers', label: 'Professores' },
        { value: 'classroom', label: 'Uma turma' },
      ]} />
      {audience === 'classroom' ? (
        <FormChipSelect control={control} name="classroomId" label="Turma"
          options={(classrooms.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      ) : null}
      <FormSwitchField control={control} name="requiresAck" label="Solicitar confirmação de ciência"
        description="Os destinatários poderão confirmar que leram o comunicado." />
      <Button title="Publicar" onPress={() => void handleSubmit(publish)()} loading={formState.isSubmitting} />
    </Screen>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { toAppError } from '@/core/errors';
import { adminRepository } from '@/data/repositories/adminRepository';
import { schoolSchema, type SchoolForm } from '@/domain/validation';
import { useUserId } from '@/features/auth/sessionStore';
import { FormTextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { Button } from '@/ui/components/primitives';
import { InlineMessage } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';

export default function AdminSchoolForm() {
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();
  const { control, handleSubmit, formState } = useForm<SchoolForm>({
    resolver: zodResolver(schoolSchema),
    defaultValues: { name: '', city: 'Teresina', state: 'PI', inepCode: '' },
  });
  const save = handleSubmit(async (v) => {
    try {
      await adminRepository.createSchool(v, userId);
      toast.success('Escola cadastrada. Gere um convite para a coordenação.');
      await qc.invalidateQueries({ queryKey: ['admin'] });
      router.back();
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  });
  return (
    <Screen>
      <InlineMessage tone="info" text="As regras de frequência padrão (75%, 2 faltas consecutivas, 3 por semana) são criadas automaticamente e podem ser ajustadas pela coordenação." />
      <FormTextField control={control} name="name" label="Nome da escola" />
      <FormTextField control={control} name="city" label="Cidade" />
      <FormTextField control={control} name="state" label="UF" autoCapitalize="characters" maxLength={2} />
      <FormTextField control={control} name="inepCode" label="Código INEP (opcional)" keyboardType="number-pad" maxLength={8} />
      <Button title="Cadastrar" onPress={() => void save()} loading={formState.isSubmitting} />
    </Screen>
  );
}

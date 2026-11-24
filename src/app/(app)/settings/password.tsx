import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { toAppError } from '@/core/errors';
import { authRepository } from '@/data/repositories/authRepository';
import { changePasswordSchema, type ChangePasswordForm } from '@/domain/validation';
import { FormTextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { Button } from '@/ui/components/primitives';
import { toast } from '@/ui/components/toast';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { control, handleSubmit, formState, reset } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const save = handleSubmit(async (v) => {
    try {
      await authRepository.updatePassword(v.password);
      reset();
      toast.success('Senha alterada.');
      router.back();
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  });
  return (
    <Screen>
      <FormTextField control={control} name="password" label="Nova senha" secureTextEntry autoComplete="new-password"
        hint="Mínimo de 8 caracteres, com letras e números." />
      <FormTextField control={control} name="confirmPassword" label="Confirme a nova senha" secureTextEntry autoComplete="new-password" />
      <Button title="Alterar senha" onPress={() => void save()} loading={formState.isSubmitting} />
    </Screen>
  );
}

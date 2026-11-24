import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toAppError } from '@/core/errors';
import { authRepository } from '@/data/repositories/authRepository';
import { profileSchema, type ProfileForm } from '@/domain/validation';
import { useSessionStore } from '@/features/auth/sessionStore';
import { FormTextField, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { Button } from '@/ui/components/primitives';
import { toast } from '@/ui/components/toast';

export default function ProfileScreen() {
  const profile = useSessionStore((s) => s.profile);
  const loadContext = useSessionStore((s) => s.loadContext);
  const { control, handleSubmit, formState } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: profile?.fullName ?? '', phone: profile?.phone ?? '' },
  });

  const save = handleSubmit(async (v) => {
    if (!profile) return;
    try {
      await authRepository.updateProfile(profile.id, v.fullName, v.phone);
      toast.success('Perfil atualizado.');
      await loadContext();
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  });

  return (
    <Screen>
      <TextField label="E-mail" value={profile?.email ?? ''} editable={false} hint="Para alterar o e-mail, procure a escola." />
      <FormTextField control={control} name="fullName" label="Nome completo" />
      <FormTextField control={control} name="phone" label="Telefone (opcional)" keyboardType="phone-pad" />
      <Button title="Salvar" onPress={() => void save()} loading={formState.isSubmitting} />
    </Screen>
  );
}

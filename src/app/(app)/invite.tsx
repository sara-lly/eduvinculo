import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toAppError } from '@/core/errors';
import { authRepository } from '@/data/repositories/authRepository';
import { ROLE_LABEL } from '@/domain/roles';
import { inviteCodeSchema, type InviteCodeForm } from '@/domain/validation';
import { useSessionStore } from '@/features/auth/sessionStore';
import { FormTextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { AppText, Button } from '@/ui/components/primitives';
import { InlineMessage } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

/** Primeiro acesso: vincula a conta a uma escola por código seguro (validado no servidor). */
export default function InviteScreen() {
  const router = useRouter();
  const loadContext = useSessionStore((s) => s.loadContext);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<InviteCodeForm>({
    resolver: zodResolver(inviteCodeSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = handleSubmit(async ({ code }) => {
    setError(null);
    try {
      const r = await authRepository.redeemInvite(code);
      toast.success(`Vínculo criado: ${ROLE_LABEL[r.role]} — ${r.schoolName}`);
      await loadContext();
      router.replace('/select-context');
    } catch (e) {
      setError(toAppError(e).message);
    }
  });

  return (
    <Screen>
      <AppText variant="caption" style={{ marginBottom: spacing.lg }}>
        O código de convite é entregue pela escola e vincula sua conta ao estudante, à turma ou à função correta. Cada código tem validade
        e número de usos limitados.
      </AppText>
      {error ? <InlineMessage tone="danger" text={error} /> : null}
      <FormTextField control={control} name="code" label="Código de convite" autoCapitalize="characters" autoCorrect={false}
        placeholder="XXXX-XXXX-XXXX" onSubmitEditing={() => void onSubmit()} />
      <Button title="Validar código" onPress={() => void onSubmit()} loading={formState.isSubmitting} />
    </Screen>
  );
}

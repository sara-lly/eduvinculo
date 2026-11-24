import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toAppError } from '@/core/errors';
import { authRepository } from '@/data/repositories/authRepository';
import { registerSchema, type RegisterForm } from '@/domain/validation';
import { FormTextField, SwitchField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { AppText, Button } from '@/ui/components/primitives';
import { InlineMessage } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const { control, handleSubmit, formState } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '', acceptPrivacy: false },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const { needsConfirmation } = await authRepository.signUp(v.fullName, v.email, v.password);
      if (needsConfirmation) setConfirmationSent(true);
      // Sem confirmação: a sessão é criada e o app segue para o resgate do convite.
    } catch (e) {
      setError(toAppError(e).message);
    }
  });

  if (confirmationSent) {
    return (
      <Screen>
        <InlineMessage tone="success" text="Conta criada! Enviamos um e-mail de confirmação. Depois de confirmar, entre com seu e-mail e senha e informe o código de convite da escola." />
        <Button title="Ir para o login" onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="caption" style={{ marginBottom: spacing.lg }}>
        Responsáveis, estudantes e professores criam a conta e, em seguida, informam o código de convite fornecido pela escola. Sem o
        convite, nenhum dado escolar fica acessível.
      </AppText>
      {error ? <InlineMessage tone="danger" text={error} /> : null}
      <FormTextField control={control} name="fullName" label="Nome completo" autoComplete="name" textContentType="name" />
      <FormTextField control={control} name="email" label="E-mail" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <FormTextField control={control} name="password" label="Senha" secureTextEntry autoComplete="new-password"
        hint="Mínimo de 8 caracteres, com letras e números." />
      <FormTextField control={control} name="confirmPassword" label="Confirme a senha" secureTextEntry autoComplete="new-password" />
      <Controller
        control={control}
        name="acceptPrivacy"
        render={({ field: { value, onChange }, fieldState }) => (
          <>
            <SwitchField label="Li e aceito a Política de Privacidade" value={value} onValueChange={onChange}
              description="Seus dados são usados somente para o acompanhamento escolar." />
            {fieldState.error ? <InlineMessage tone="danger" text={fieldState.error.message ?? ''} /> : null}
          </>
        )}
      />
      <Link href="/privacy" asChild>
        <Button title="Ler a Política de Privacidade" variant="ghost" compact />
      </Link>
      <Button title="Criar conta" onPress={() => void onSubmit()} loading={formState.isSubmitting} style={{ marginTop: spacing.md }} />
    </Screen>
  );
}

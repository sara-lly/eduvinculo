import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toAppError } from '@/core/errors';
import { authRepository } from '@/data/repositories/authRepository';
import { forgotPasswordSchema, resetPasswordSchema, type ForgotPasswordForm, type ResetPasswordForm } from '@/domain/validation';
import { FormTextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { AppText, Button } from '@/ui/components/primitives';
import { InlineMessage } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

/**
 * Recuperação de senha em 2 etapas: (1) e-mail com código de 6 dígitos;
 * (2) código + nova senha. Requer o template de e-mail "Reset Password"
 * do Supabase com {{ .Token }} (ver README).
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);

  const emailForm = useForm<ForgotPasswordForm>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const resetForm = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '', code: '', password: '', confirmPassword: '' },
  });

  const sendCode = emailForm.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await authRepository.requestPasswordReset(email);
      resetForm.setValue('email', email);
      setStep('code');
    } catch (e) {
      setError(toAppError(e).message);
    }
  });

  const reset = resetForm.handleSubmit(async (v) => {
    setError(null);
    try {
      await authRepository.resetPasswordWithCode(v.email, v.code, v.password);
      toast.success('Senha alterada com sucesso.');
      router.replace('/');
    } catch (e) {
      setError(toAppError(e).message);
    }
  });

  return (
    <Screen>
      {error ? <InlineMessage tone="danger" text={error} /> : null}
      {step === 'email' ? (
        <>
          <AppText variant="caption" style={{ marginBottom: spacing.lg }}>
            Informe o e-mail da sua conta. Se ele estiver cadastrado, você receberá um código para criar uma nova senha.
          </AppText>
          <FormTextField control={emailForm.control} name="email" label="E-mail" keyboardType="email-address" autoCapitalize="none" />
          <Button title="Enviar código" onPress={() => void sendCode()} loading={emailForm.formState.isSubmitting} />
        </>
      ) : (
        <>
          <InlineMessage tone="info" text="Se o e-mail estiver cadastrado, você receberá um código. Verifique também a caixa de spam." />
          <FormTextField control={resetForm.control} name="code" label="Código recebido" keyboardType="number-pad" maxLength={8} />
          <FormTextField control={resetForm.control} name="password" label="Nova senha" secureTextEntry hint="Mínimo de 8 caracteres, com letras e números." />
          <FormTextField control={resetForm.control} name="confirmPassword" label="Confirme a nova senha" secureTextEntry />
          <Button title="Alterar senha" onPress={() => void reset()} loading={resetForm.formState.isSubmitting} />
          <Button title="Reenviar código" variant="ghost" onPress={() => setStep('email')} />
        </>
      )}
    </Screen>
  );
}

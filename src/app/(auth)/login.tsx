import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError } from '@/core/errors';
import { authRepository } from '@/data/repositories/authRepository';
import { loginSchema, type LoginForm } from '@/domain/validation';
import { useIsOnline } from '@/features/sync/hooks';
import { Brand } from '@/ui/components/brand';
import { FormTextField } from '@/ui/components/forms';
import { AppText, Button } from '@/ui/components/primitives';
import { InlineMessage } from '@/ui/components/states';
import { colors, radius, shadow, spacing } from '@/ui/theme';

export default function LoginScreen() {
  const online = useIsOnline();
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { control, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await authRepository.signIn(values.email, values.password);
      // A navegação acontece automaticamente quando a sessão muda (rotas protegidas).
    } catch (e) {
      setError(toAppError(e).message);
    }
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Brand />
          </View>
          <View style={styles.form}>
            <AppText variant="subtitle" style={{ marginBottom: spacing.xs }}>Entrar na sua conta</AppText>
            {!online ? <InlineMessage tone="warning" text="Você está offline. É preciso internet para entrar pela primeira vez." /> : null}
            {error ? <InlineMessage tone="danger" text={error} /> : null}
            <FormTextField
              control={control}
              name="email"
              label="E-mail"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <FormTextField
              control={control}
              name="password"
              label="Senha"
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
            />
            <Button title="Entrar" onPress={() => void onSubmit()} loading={formState.isSubmitting} />
            <Link href="/forgot-password" asChild>
              <Button title="Esqueci minha senha" variant="ghost" />
            </Link>
          </View>
          <View style={styles.footer}>
            <AppText variant="caption">Recebeu um código de convite da escola?</AppText>
            <Link href="/register" asChild>
              <Button title="Criar conta (primeiro acesso)" variant="secondary" />
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  hero: { backgroundColor: colors.primaryLight, borderRadius: radius.xl, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  form: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, ...shadow },
  footer: { alignItems: 'stretch', gap: spacing.sm },
});

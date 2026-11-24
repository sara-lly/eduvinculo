/** Splash: decide para onde ir conforme sessão e contexto. */
import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { config } from '@/core/config';
import { authRepository } from '@/data/repositories/authRepository';
import { useSessionStore } from '@/features/auth/sessionStore';
import { areaForContext } from '@/domain/roles';
import { Brand } from '@/ui/components/brand';
import { Button } from '@/ui/components/primitives';
import { InlineMessage, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

export default function Index() {
  const status = useSessionStore((s) => s.status);
  const session = useSessionStore((s) => s.session);
  const ctx = useSessionStore((s) => s.activeContext);
  const error = useSessionStore((s) => s.error);
  const loadContext = useSessionStore((s) => s.loadContext);

  if (!config.isBackendConfigured) {
    return (
      <SafeAreaView style={styles.screen}>
        <Brand />
        <View style={{ marginTop: spacing.xl }}>
          <InlineMessage tone="warning" text="Backend não configurado. Crie o arquivo .env com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY e reinicie o Expo (veja o README, seção “Configuração do backend”)." />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'initializing' || (session && status === 'loadingContext')) {
    return (
      <SafeAreaView style={styles.screen}>
        <Brand />
        <LoadingState label="Preparando seu acesso…" />
      </SafeAreaView>
    );
  }
  if (!session) return <Redirect href="/login" />;
  if (status === 'error') {
    return (
      <SafeAreaView style={styles.screen}>
        <Brand />
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <InlineMessage tone="danger" text={error ?? 'Não foi possível carregar seu perfil.'} />
          <Button title="Tentar novamente" onPress={() => void loadContext()} />
          <Button title="Sair" variant="ghost" onPress={() => void authRepository.signOut()} />
        </View>
      </SafeAreaView>
    );
  }
  if (!ctx) return <Redirect href="/select-context" />;
  return <Redirect href={`/${areaForContext(ctx)}`} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, justifyContent: 'center' },
});

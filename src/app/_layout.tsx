import '@/data/sync/backgroundSync'; // registra a tarefa em segundo plano no escopo global
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppBootstrap, useSignedInEffects } from '@/features/bootstrap';
import { useSessionStore } from '@/features/auth/sessionStore';
import { queryClient } from '@/features/queryClient';
import { ToastHost } from '@/ui/components/toast';
import { colors } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  useAppBootstrap();
  useSignedInEffects();
  const status = useSessionStore((s) => s.status);
  const signedIn = useSessionStore((s) => !!s.session);

  useEffect(() => {
    if (status !== 'initializing') void SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="privacy" options={{ headerShown: true, title: 'Política de Privacidade', headerTintColor: colors.primary }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <RootNavigator />
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

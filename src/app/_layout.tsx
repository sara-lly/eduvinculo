import '@/data/sync/backgroundSync'; // registra a tarefa em segundo plano no escopo global
import { Fredoka_500Medium } from '@expo-google-fonts/fredoka/500Medium';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppBootstrap, useSignedInEffects } from '@/features/bootstrap';
import { useSessionStore } from '@/features/auth/sessionStore';
import { queryClient } from '@/features/queryClient';
import { ToastHost } from '@/ui/components/toast';
import { colors, fonts } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  useAppBootstrap();
  useSignedInEffects();
  const status = useSessionStore((s) => s.status);
  const signedIn = useSessionStore((s) => !!s.session);

  useEffect(() => {
    if (status !== 'initializing' && fontsReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [status, fontsReady]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="privacy" options={{ headerShown: true, title: 'Política de Privacidade', headerTintColor: colors.primary, headerTitleStyle: { fontFamily: fonts.brand } }} />
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
  // Somente os pesos usados são carregados (menos memória e abertura mais rápida).
  const [loaded, error] = useFonts({
    Fredoka_500Medium, Fredoka_600SemiBold, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
  });
  const fontsReady = loaded || !!error; // se falhar, segue com a fonte do sistema
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <RootNavigator fontsReady={fontsReady} />
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

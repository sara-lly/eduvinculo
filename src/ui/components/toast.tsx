/** Mensagens rápidas de sucesso/erro (toast) com estado global mínimo. */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, radius, spacing } from '../theme';
import { AppText } from './primitives';

type Tone = 'success' | 'error' | 'info';

interface ToastState {
  message: string | null;
  tone: Tone;
  id: number;
  show(message: string, tone?: Tone): void;
  hide(): void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  id: 0,
  show: (message, tone = 'info') => set((s) => ({ message, tone, id: s.id + 1 })),
  hide: () => set({ message: null }),
}));

export const toast = {
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (m: string) => useToast.getState().show(m, 'error'),
  info: (m: string) => useToast.getState().show(m, 'info'),
};

export function ToastHost() {
  const { message, tone, id, hide } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, tone === 'error' ? 5000 : 3000);
    return () => clearTimeout(timer); // limpeza ao desmontar/trocar mensagem
  }, [message, id, tone, hide]);
  if (!message) return null;
  const bg = tone === 'success' ? colors.success : tone === 'error' ? colors.danger : colors.primaryDark;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 24 }]}>
      <View style={[styles.toast, { backgroundColor: bg }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
        <AppText style={{ color: '#fff', fontWeight: '600' }}>{message}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  toast: { borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: 480 },
});

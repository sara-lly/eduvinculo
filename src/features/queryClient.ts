import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { AppState } from 'react-native';
import { AppError } from '@/core/errors';

/**
 * Cache em memória limitado: dados não usados são descartados após 5 min
 * (gcTime), mantendo o consumo de memória baixo em aparelhos de entrada.
 * Requisições idênticas simultâneas são deduplicadas pelo TanStack Query.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        if (error instanceof AppError && !error.retryable) return false;
        return failureCount < 2;
      },
    },
    mutations: { networkMode: 'offlineFirst', retry: false },
  },
});

let wired = false;
/** Conecta o TanStack Query aos eventos de rede e de foco do app. */
export function wireQueryManagers(onReconnect: () => void): () => void {
  if (wired) return () => undefined;
  wired = true;
  onlineManager.setEventListener((setOnline) => {
    const sub = addNetworkStateListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      const wasOnline = onlineManager.isOnline();
      setOnline(online);
      if (online && !wasOnline) onReconnect();
    });
    return () => sub.remove();
  });
  const appStateSub = AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
    if (status === 'active') onReconnect();
  });
  return () => {
    appStateSub.remove();
    wired = false;
  };
}

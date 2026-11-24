/**
 * Efeitos globais do app: sessão do Supabase, rede ↔ sincronização,
 * tarefa em segundo plano, manutenção do cache e notificações.
 * Cada efeito devolve sua função de limpeza (sem listeners duplicados).
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { config } from '@/core/config';
import { runWhenIdle } from '@/core/scheduling';
import { attendanceStore } from '@/data/local/attendanceStore';
import { communicationRepository } from '@/data/repositories/communicationRepository';
import { bindAuthRefreshToAppState, supabase } from '@/data/remote/supabase';
import { syncEngine } from '@/data/sync';
import { registerBackgroundSync } from '@/data/sync/backgroundSync';
import { useSessionStore } from './auth/sessionStore';
import { configureNotifications, registerPushToken, showGenericLocalNotification } from './notifications/pushNotifications';
import { wireQueryManagers } from './queryClient';

export function useAppBootstrap(): void {
  const setSession = useSessionStore((s) => s.setSession);

  // Sessão (restaurada do armazenamento seguro) + eventos de login/logout.
  useEffect(() => {
    if (!config.isBackendConfigured) {
      setSession(null);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => mounted && setSession(data.session)).catch(() => mounted && setSession(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSession(session);
    });
    const unbindRefresh = bindAuthRefreshToAppState();
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      unbindRefresh();
    };
  }, [setSession]);

  // Rede/foco → TanStack Query e motor de sincronização.
  useEffect(() => {
    const unwire = wireQueryManagers(() => {
      if (useSessionStore.getState().session) void syncEngine.onConnectivityRestored().catch(() => undefined);
    });
    return unwire;
  }, []);

  // Tarefas de baixa prioridade após a primeira renderização (não atrasam a abertura do app).
  useEffect(() => {
    return runWhenIdle(() => {
      void configureNotifications();
      void registerBackgroundSync();
      void attendanceStore.pruneCache(Date.now(), config.localHistoryDays, 30).catch(() => undefined);
      void syncEngine.refreshPendingCount().catch(() => undefined);
    });
  }, []);
}

/** Ao entrar com uma sessão válida: sincroniza pendências e registra o push. */
export function useSignedInEffects(): void {
  const userId = useSessionStore((s) => s.session?.user.id);
  useEffect(() => {
    if (!userId) return;
    void syncEngine.syncNow().catch(() => undefined);
    void registerPushToken(userId).catch(() => undefined);
  }, [userId]);
}

/**
 * Verifica novas notificações periodicamente enquanto o app está aberto
 * (refetchInterval pausa automaticamente em segundo plano) e mostra um aviso
 * local GENÉRICO quando chegam novas.
 */
export function useUnreadNotifications(schoolId: string | null, userId: string | null) {
  const previous = useRef<number | null>(null);
  const query = useQuery({
    queryKey: ['notifications', 'unread', userId, schoolId],
    queryFn: () => communicationRepository.unreadCount(userId!, schoolId!),
    enabled: !!schoolId && !!userId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  useEffect(() => {
    const count = query.data;
    if (count === undefined) return;
    if (previous.current !== null && count > previous.current) {
      void showGenericLocalNotification(count - previous.current);
    }
    previous.current = count;
  }, [query.data]);
  return query.data ?? 0;
}

/**
 * Estado global de autenticação e contexto ativo (Zustand).
 * Componentes assinam apenas as fatias que usam (seletores), evitando
 * re-renderizações desnecessárias.
 */
import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { toAppError } from '@/core/errors';
import { authRepository } from '@/data/repositories/authRepository';
import { availableContexts, contextKey } from '@/domain/roles';
import type { ActiveContext, Membership, Profile } from '@/domain/types';

const ACTIVE_CONTEXT_KEY = 'eduvinculo.active_context';

export type AuthStatus = 'initializing' | 'signedOut' | 'loadingContext' | 'ready' | 'error';

interface SessionState {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  activeContext: ActiveContext | null;
  error: string | null;
  setSession(session: Session | null): void;
  loadContext(): Promise<void>;
  selectContext(ctx: ActiveContext): Promise<void>;
  clearContext(): Promise<void>;
  reset(): void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'initializing',
  session: null,
  profile: null,
  memberships: [],
  activeContext: null,
  error: null,

  setSession(session) {
    const previous = get().session;
    if (!session) {
      set({ session: null, status: 'signedOut', profile: null, memberships: [], activeContext: null, error: null });
      return;
    }
    set({ session });
    // Recarrega o contexto somente quando o usuário muda (renovação de token não recarrega).
    if (previous?.user.id !== session.user.id || get().status === 'initializing' || get().status === 'signedOut') {
      void get().loadContext();
    }
  },

  async loadContext() {
    set({ status: 'loadingContext', error: null });
    try {
      const { profile, memberships } = await authRepository.getContext();
      const contexts = availableContexts(memberships, profile.isPlatformAdmin);
      const savedKey = await SecureStore.getItemAsync(ACTIVE_CONTEXT_KEY).catch(() => null);
      let active = contexts.find((c) => contextKey(c) === savedKey) ?? null;
      if (!active && contexts.length === 1) active = contexts[0]!;
      set({ profile, memberships, activeContext: active, status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: toAppError(error, 'Não foi possível carregar seu perfil.').message });
    }
  },

  async selectContext(ctx) {
    await SecureStore.setItemAsync(ACTIVE_CONTEXT_KEY, contextKey(ctx)).catch(() => undefined);
    set({ activeContext: ctx });
  },

  async clearContext() {
    await SecureStore.deleteItemAsync(ACTIVE_CONTEXT_KEY).catch(() => undefined);
    set({ activeContext: null });
  },

  reset() {
    set({ status: 'signedOut', session: null, profile: null, memberships: [], activeContext: null, error: null });
  },
}));

/** Contexto de escola ativo (lança se usado fora de uma área escolar). */
export function useSchoolContext(): Extract<ActiveContext, { kind: 'school' }> {
  const ctx = useSessionStore((s) => s.activeContext);
  if (!ctx || ctx.kind !== 'school') {
    throw new Error('Contexto escolar indisponível');
  }
  return ctx;
}

export function useUserId(): string {
  return useSessionStore((s) => s.session?.user.id ?? '');
}

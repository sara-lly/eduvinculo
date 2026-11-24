import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';
import { config } from '@/core/config';
import { AppError, toAppError } from '@/core/errors';
import { secureSessionStorage } from './secureSessionStorage';

/**
 * Cliente Supabase único do app. Usa SOMENTE a chave pública (anon);
 * toda autorização é garantida por RLS e funções no banco.
 */
export const supabase: SupabaseClient = createClient(
  config.isBackendConfigured ? config.supabaseUrl : 'https://not-configured.invalid',
  config.isBackendConfigured ? config.supabaseAnonKey : 'not-configured-key-placeholder-000000',
  {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
    global: { headers: { 'x-client-info': 'eduvinculo-mobile' } },
  },
);

// Renovação do token somente com o app em primeiro plano (economia de bateria/rede).
let appStateSub: { remove(): void } | null = null;
export function bindAuthRefreshToAppState(): () => void {
  appStateSub?.remove();
  const handler = (state: AppStateStatus) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };
  appStateSub = AppState.addEventListener('change', handler);
  handler((AppState.currentState ?? 'active') as AppStateStatus);
  return () => {
    appStateSub?.remove();
    appStateSub = null;
  };
}

export function assertBackendConfigured(): void {
  if (!config.isBackendConfigured) {
    throw new AppError(
      'Backend não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no arquivo .env (veja o README).',
      'unknown',
      false,
    );
  }
}

/** Chamada RPC tipada com conversão de erros e suporte a cancelamento. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  assertBackendConfigured();
  let query = supabase.rpc(fn, args);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data as T;
}

/** Converte o resultado { data, error } do PostgREST em dado ou AppError. */
export function unwrap<T>(result: { data: unknown; error: unknown }): T {
  if (result.error) throw toAppError(result.error);
  return result.data as T;
}

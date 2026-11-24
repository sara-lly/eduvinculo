/**
 * Cache persistente de respostas do servidor (dashboards, notificações,
 * histórico). Permite exibir os últimos dados conhecidos quando offline.
 */
import { getLocalDb } from './database';

export interface CachedValue<T> {
  value: T;
  cachedAt: number;
}

export async function readCache<T>(key: string): Promise<CachedValue<T> | null> {
  try {
    const db = await getLocalDb();
    const row = await db.getFirstAsync<{ json: string; cached_at: number }>(
      'SELECT json, cached_at FROM query_cache WHERE key = ?', key);
    if (!row) return null;
    return { value: JSON.parse(row.json) as T, cachedAt: row.cached_at };
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    `INSERT INTO query_cache (key, json, cached_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET json = excluded.json, cached_at = excluded.cached_at`,
    key, JSON.stringify(value), Date.now());
}

/**
 * Estratégia "rede primeiro, cache como reserva": tenta o servidor; em caso
 * de falha de rede devolve a última resposta salva (marcada como offline).
 */
export async function networkFirst<T>(
  key: string,
  fetcher: () => Promise<T>,
  isNetworkError: (e: unknown) => boolean,
): Promise<T & { __fromCache?: number }> {
  try {
    const value = await fetcher();
    void writeCache(key, value).catch(() => undefined);
    return value as T & { __fromCache?: number };
  } catch (error) {
    if (isNetworkError(error)) {
      const cached = await readCache<T>(key);
      if (cached) {
        const v = cached.value as T & { __fromCache?: number };
        if (v && typeof v === 'object') return Object.assign(Array.isArray(v) ? [...v] : { ...v }, { __fromCache: cached.cachedAt }) as T & { __fromCache?: number };
        return v;
      }
    }
    throw error;
  }
}

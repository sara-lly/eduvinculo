/**
 * Armazenamento seguro da sessão do Supabase.
 *
 * O token fica no Keychain (iOS) / Keystore (Android) via expo-secure-store.
 * Como alguns aparelhos rejeitam valores grandes (~2 KB), o valor é dividido
 * em partes de 1800 caracteres.
 */
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${k}.n`);
    if (!countRaw) return null;
    const count = Number(countRaw);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    const previous = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(`${k}.n`, String(count));
    for (let i = count; i < previous; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
  },

  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};

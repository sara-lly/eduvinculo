import * as Crypto from 'expo-crypto';

/** UUID v4 gerado com fonte criptográfica do sistema (usado para ids offline e idempotência). */
export function newId(): string {
  return Crypto.randomUUID();
}

/**
 * Configuração do aplicativo a partir de variáveis EXPO_PUBLIC_*.
 * Somente valores públicos podem existir aqui — nunca chaves administrativas.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const config = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined,
  isBackendConfigured: /^https:\/\/.+/.test(url) && anonKey.length > 20 && !url.includes('SEU-PROJETO'),
  /** Tamanho de página para listas paginadas no servidor. */
  pageSize: 50,
  /** Tempo de validade do cache local de turmas e listas de estudantes. */
  rosterCacheTtlMs: 12 * 60 * 60 * 1000,
  /** Janela de histórico de chamadas mantida no aparelho. */
  localHistoryDays: 60,
  /** Fuso horário padrão (Brasília). */
  defaultTimezone: 'America/Sao_Paulo',
  appName: 'Presença+',
  slogan: 'Escola, família e estudante conectados.',
} as const;

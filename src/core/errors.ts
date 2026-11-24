/**
 * Tratamento de erros: converte erros do Supabase/PostgREST/rede em mensagens
 * claras em português, sem expor detalhes internos ao usuário.
 */
export type ErrorKind = 'network' | 'auth' | 'forbidden' | 'validation' | 'conflict' | 'not_found' | 'unknown';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly kind: ErrorKind,
    public readonly retryable: boolean,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

const NETWORK_PATTERNS = /network request failed|failed to fetch|fetch failed|timeout|timed out|aborted|ECONN|ENOTFOUND/i;

export function isNetworkError(error: unknown): boolean {
  if (error instanceof AppError) return error.kind === 'network';
  const msg = (error as PgLikeError)?.message ?? String(error);
  return NETWORK_PATTERNS.test(msg);
}

export function toAppError(error: unknown, fallback = 'Não foi possível concluir a operação.'): AppError {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as PgLikeError;
  const message = e.message ?? '';

  if (isNetworkError(error)) {
    return new AppError('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 'network', true, error);
  }
  switch (e.code) {
    case '42501':
      return new AppError(friendly(message) ?? 'Você não tem permissão para esta ação.', 'forbidden', false, error);
    case '28000':
    case 'PGRST301':
      return new AppError('Sua sessão expirou. Entre novamente.', 'auth', false, error);
    case '22023':
    case '23514':
    case '23505':
    case '22P02':
      return new AppError(friendly(message) ?? 'Dados inválidos.', 'validation', false, error);
    case 'P0002':
      return new AppError(friendly(message) ?? 'Registro não encontrado.', 'not_found', false, error);
  }
  if (e.status === 401 || /invalid login credentials/i.test(message)) {
    return new AppError('E-mail ou senha incorretos.', 'auth', false, error);
  }
  if (/email not confirmed/i.test(message)) {
    return new AppError('Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).', 'auth', false, error);
  }
  if (/user already registered/i.test(message)) {
    return new AppError('Já existe uma conta com este e-mail.', 'validation', false, error);
  }
  if (/rate limit/i.test(message)) {
    return new AppError('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 'validation', true, error);
  }
  if (e.status && e.status >= 500) {
    return new AppError('O servidor está indisponível no momento. Tente novamente em instantes.', 'network', true, error);
  }
  return new AppError(fallback, 'unknown', false, error);
}

/** Mensagens levantadas pelas nossas funções SQL já estão em português. */
function friendly(message: string): string | undefined {
  if (!message) return undefined;
  if (/[áéíóúãõç]|^(Sem|Acesso|Chamada|Turma|Código|Estudante|Responsável|Há|Somente|Dados|Este|Escola|Validade|Você|Usuário|Período|Conflito|Alteração|Autenticação)/.test(message)) {
    return message;
  }
  return undefined;
}

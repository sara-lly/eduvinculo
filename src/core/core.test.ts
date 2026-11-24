import { addDays, diffDays, formatDateBR, formatDateTimeBR, formatLongDateBR, monthGrid, toLocalIsoDate } from './dates';
import { AppError, isNetworkError, toAppError } from './errors';

describe('datas no padrão brasileiro', () => {
  it('converte instantes para a data local de Brasília (UTC-3)', () => {
    // 02:30 UTC de 25/11 ainda é 24/11 em Brasília
    expect(toLocalIsoDate(new Date('2026-11-25T02:30:00Z'), 'America/Sao_Paulo')).toBe('2026-11-24');
    expect(toLocalIsoDate(new Date('2026-11-25T03:30:00Z'), 'America/Fortaleza')).toBe('2026-11-25');
    expect(toLocalIsoDate(new Date('2026-11-25T03:30:00Z'), 'America/Manaus')).toBe('2026-11-24');
  });

  it('formata datas', () => {
    expect(formatDateBR('2026-11-24')).toBe('24/11/2026');
    expect(formatLongDateBR('2026-11-24')).toBe('terça-feira, 24 de novembro');
    expect(formatDateTimeBR('2026-11-24T17:05:00Z', 'America/Sao_Paulo')).toBe('24/11/2026 às 14:05');
    expect(formatDateBR(null)).toBe('—');
  });

  it('aritmética de datas atravessa meses e anos', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-11-24', '2026-11-01')).toBe(23);
  });

  it('monta a grade do calendário com semanas completas', () => {
    const grid = monthGrid(2026, 10); // novembro/2026 começa num domingo
    expect(grid[0]).toBe('2026-11-01');
    expect(grid.length % 7).toBe(0);
    expect(grid.filter(Boolean)).toHaveLength(30);
  });
});

describe('tratamento de erros', () => {
  it('erros de rede viram mensagem amigável e são reenviáveis', () => {
    const e = toAppError(new TypeError('Network request failed'));
    expect(e.kind).toBe('network');
    expect(e.retryable).toBe(true);
    expect(isNetworkError(e)).toBe(true);
  });

  it('permissão negada do banco (42501) mantém a mensagem em português do servidor', () => {
    const e = toAppError({ code: '42501', message: 'Sem permissão para registrar esta chamada' });
    expect(e.kind).toBe('forbidden');
    expect(e.message).toBe('Sem permissão para registrar esta chamada');
  });

  it('não expõe mensagens técnicas em inglês', () => {
    const e = toAppError({ code: '42501', message: 'new row violates row-level security policy' });
    expect(e.message).toBe('Você não tem permissão para esta ação.');
    expect(toAppError({ message: 'Invalid login credentials', status: 400 }).message).toBe('E-mail ou senha incorretos.');
  });

  it('preserva AppError existentes', () => {
    const original = new AppError('x', 'validation', false);
    expect(toAppError(original)).toBe(original);
  });
});

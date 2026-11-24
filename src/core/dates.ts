/**
 * Datas no padrão brasileiro.
 *
 * Desde 2019 o Brasil não adota horário de verão, portanto os fusos usados
 * pelas escolas possuem deslocamento fixo. Isso evita depender de dados de
 * fuso horário do motor JavaScript (Hermes) e mantém o cálculo barato.
 */
const FIXED_OFFSETS_MIN: Record<string, number> = {
  'America/Sao_Paulo': -180,
  'America/Fortaleza': -180,
  'America/Recife': -180,
  'America/Bahia': -180,
  'America/Belem': -180,
  'America/Manaus': -240,
  'America/Cuiaba': -240,
  'America/Porto_Velho': -240,
  'America/Boa_Vista': -240,
  'America/Rio_Branco': -300,
  'America/Noronha': -120,
};

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export { WEEKDAYS, WEEKDAYS_SHORT, MONTHS };

/** Data ISO (AAAA-MM-DD). */
export type IsoDate = string;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Converte um instante para a data local da escola (AAAA-MM-DD). */
export function toLocalIsoDate(date: Date, timezone = 'America/Sao_Paulo'): IsoDate {
  const offset = FIXED_OFFSETS_MIN[timezone] ?? -180;
  const shifted = new Date(date.getTime() + offset * 60_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function todayIso(timezone?: string): IsoDate {
  return toLocalIsoDate(new Date(), timezone);
}

/** Interpreta AAAA-MM-DD como data de calendário (meio-dia UTC, sem ambiguidade de fuso). */
export function parseIsoDate(iso: IsoDate): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIsoDate(a).getTime() - parseIsoDate(b).getTime()) / 86_400_000);
}

export function weekdayOf(iso: IsoDate): number {
  return parseIsoDate(iso).getUTCDay();
}

/** 24/11/2026 */
export function formatDateBR(iso: IsoDate | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** terça-feira, 24 de novembro */
export function formatLongDateBR(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

/** 24/11/2026 às 14:05 (no fuso da escola) */
export function formatDateTimeBR(isoTimestamp: string | null | undefined, timezone?: string): string {
  if (!isoTimestamp) return '—';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '—';
  const offset = FIXED_OFFSETS_MIN[timezone ?? 'America/Sao_Paulo'] ?? -180;
  const s = new Date(date.getTime() + offset * 60_000);
  return `${pad(s.getUTCDate())}/${pad(s.getUTCMonth() + 1)}/${s.getUTCFullYear()} às ${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
}

/** "há 5 min", "ontem", "24/11/2026" */
export function formatRelativeBR(isoTimestamp: string, now = Date.now()): string {
  const t = new Date(isoTimestamp).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return formatDateBR(new Date(t).toISOString());
}

export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]?.slice(0, 3)}/${String(y).slice(2)}`;
}

export function formatTime(hhmmss: string | null | undefined): string {
  return hhmmss ? hhmmss.slice(0, 5) : '';
}

/** Dias do mês para montar um calendário (semana começando no domingo). */
export function monthGrid(year: number, month0: number): (IsoDate | null)[] {
  const first = new Date(Date.UTC(year, month0, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0, 12)).getUTCDate();
  const cells: (IsoDate | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month0 + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Instrumentação de desempenho.
 *
 * Mede operações reais no aparelho (tempo de salvar chamada, sincronizar,
 * carregar listas, primeira tela) e grava em SQLite para consulta na tela
 * "Desempenho" (Configurações). Os valores NÃO são inventados: cada linha é uma
 * medição de performance.now() no próprio dispositivo.
 */
import { getLocalDb } from '@/data/local/database';

export interface PerfSample {
  name: string;
  value: number;
  unit: 'ms' | 'fps' | 'count';
  meta?: Record<string, unknown>;
  createdAt: number;
}

/** Instante em que o módulo de instrumentação foi carregado (início do JS). */
export const JS_START = Date.now();

const buffer: PerfSample[] = [];
const MAX_BUFFER = 200;

export function recordMetric(name: string, value: number, unit: PerfSample['unit'] = 'ms', meta?: Record<string, unknown>): void {
  const sample: PerfSample = { name, value: Math.round(value * 10) / 10, unit, meta, createdAt: Date.now() };
  buffer.push(sample);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  // Persistência assíncrona, sem bloquear quem mediu.
  void getLocalDb()
    .then((db) =>
      db.runAsync('INSERT INTO perf_metrics (name, value, unit, meta, created_at) VALUES (?, ?, ?, ?, ?)',
        sample.name, sample.value, sample.unit, meta ? JSON.stringify(meta) : null, sample.createdAt))
    .catch(() => undefined);
}

export async function measureAsync<T>(name: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    recordMetric(name, performance.now() - t0, 'ms', meta);
  }
}

let firstScreenRecorded = false;
/** Registra uma única vez o tempo do início do JS até a primeira tela útil. */
export function markFirstScreen(screen: string): void {
  if (firstScreenRecorded) return;
  firstScreenRecorded = true;
  recordMetric('startup.js_to_first_screen', Date.now() - JS_START, 'ms', { screen });
}

export async function readMetrics(limit = 300): Promise<PerfSample[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ name: string; value: number; unit: PerfSample['unit']; meta: string | null; created_at: number }>(
    'SELECT name, value, unit, meta, created_at FROM perf_metrics ORDER BY created_at DESC LIMIT ?', limit);
  return rows.map((r) => ({
    name: r.name, value: r.value, unit: r.unit, createdAt: r.created_at,
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : undefined,
  }));
}

export async function clearMetrics(): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync('DELETE FROM perf_metrics');
  buffer.length = 0;
}

export interface MetricSummary {
  name: string;
  unit: string;
  count: number;
  median: number;
  p90: number;
  min: number;
  max: number;
}

export function summarize(samples: PerfSample[]): MetricSummary[] {
  const groups = new Map<string, PerfSample[]>();
  for (const s of samples) {
    const key = `${s.name}|${s.unit}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => {
      const [name, unit] = key.split('|') as [string, string];
      const values = list.map((s) => s.value).sort((a, b) => a - b);
      const at = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 0;
      return { name, unit, count: values.length, median: at(0.5), p90: at(0.9), min: values[0] ?? 0, max: values[values.length - 1] ?? 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

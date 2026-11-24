/**
 * Agenda trabalho de baixa prioridade para quando a thread de JavaScript
 * estiver ociosa (após a primeira renderização e animações), sem atrasar
 * a abertura do app. Devolve a função de cancelamento.
 */
export function runWhenIdle(fn: () => void, timeoutMs = 2000): () => void {
  const g = globalThis as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof g.requestIdleCallback === 'function') {
    const id = g.requestIdleCallback(fn, { timeout: timeoutMs });
    return () => g.cancelIdleCallback?.(id);
  }
  const t = setTimeout(fn, 0);
  return () => clearTimeout(t);
}

/** Cede a vez para a interface (útil entre blocos de processamento pesado). */
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Sincronização em segundo plano (quando suportada pelo sistema).
 * O Android executa a tarefa em intervalos mínimos de ~15 minutos, de forma
 * inexata, respeitando bateria e economia de dados.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { config } from '@/core/config';
import { syncEngine } from './index';

export const BACKGROUND_SYNC_TASK = 'presencaplus-attendance-sync';

// Deve ser definida no escopo global do módulo (exigência do TaskManager).
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    if (!config.isBackendConfigured) return BackgroundTask.BackgroundTaskResult.Success;
    const pending = await syncEngine.refreshPendingCount();
    if (pending === 0) return BackgroundTask.BackgroundTaskResult.Success;
    const report = await syncEngine.syncNow();
    return report.failed > 0 ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
    }
    return true;
  } catch (error) {
    console.warn('[sync] Sincronização em segundo plano indisponível neste ambiente', error);
    return false;
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
  } catch {
    // ignorado: ambiente sem suporte
  }
}

import { useNetworkState } from 'expo-network';
import { useSyncExternalStore } from 'react';
import { syncEngine } from '@/data/sync';
import type { SyncStatus } from '@/data/sync/syncEngine';

export function useIsOnline(): boolean {
  const state = useNetworkState();
  // Enquanto o estado é desconhecido, assume online (evita banner falso no início).
  return state.isConnected !== false && state.isInternetReachable !== false;
}

const subscribe = (cb: () => void) => syncEngine.subscribe(cb);
const getSnapshot = (): SyncStatus => syncEngine.getStatus();

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

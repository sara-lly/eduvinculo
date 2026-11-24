/**
 * Notificações no aparelho.
 *
 * Privacidade: o conteúdo exibido na tela bloqueada é sempre genérico
 * ("Você tem uma nova notificação da escola"). O detalhe só aparece dentro do
 * app, após login. O app funciona normalmente se a permissão for negada.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Platform } from 'react-native';
import { config } from '@/core/config';
import { communicationRepository } from '@/data/repositories/communicationRepository';

export const GENERIC_TITLE = 'EduVínculo';
export const GENERIC_BODY = 'Você tem uma nova notificação da escola. Abra o app para ver.';

let configured = false;

export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Avisos da escola',
      importance: AndroidImportance.DEFAULT,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    }).catch(() => undefined);
  }
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<boolean> {
  const p = await Notifications.requestPermissionsAsync();
  return p.granted;
}

/**
 * Registra o token de push no servidor. Requer development build/APK e
 * EXPO_PUBLIC_EAS_PROJECT_ID; no Expo Go o push remoto não é suportado
 * (Android, SDK 53+), então apenas as notificações locais funcionam.
 */
export async function registerPushToken(userId: string): Promise<'registered' | 'unsupported' | 'denied'> {
  if (!Device.isDevice || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'unsupported';
  const projectId = config.easProjectId ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  if (!projectId) return 'unsupported';
  const status = await getPermissionStatus();
  if (status !== 'granted') return 'denied';
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await communicationRepository.registerPushToken(userId, data, Platform.OS === 'ios' ? 'ios' : 'android');
    return 'registered';
  } catch (error) {
    console.warn('[push] Falha ao registrar token', error);
    return 'unsupported';
  }
}

/** Notificação local genérica (sem dados sensíveis). */
export async function showGenericLocalNotification(count: number): Promise<void> {
  const status = await getPermissionStatus().catch(() => 'denied' as const);
  if (status !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: GENERIC_TITLE,
      body: count > 1 ? `Você tem ${count} novas notificações da escola. Abra o app para ver.` : GENERIC_BODY,
    },
    trigger: null,
  }).catch(() => undefined);
}

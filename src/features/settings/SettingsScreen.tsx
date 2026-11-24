import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { wipeLocalData } from '@/data/local/database';
import { attendanceStore } from '@/data/local/attendanceStore';
import { authRepository } from '@/data/repositories/authRepository';
import { syncEngine } from '@/data/sync';
import { unregisterBackgroundSync } from '@/data/sync/backgroundSync';
import { availableContexts, ROLE_LABEL } from '@/domain/roles';
import { useSessionStore } from '@/features/auth/sessionStore';
import { queryClient } from '@/features/queryClient';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Button, SectionTitle } from '@/ui/components/primitives';
import { spacing } from '@/ui/theme';

async function performLogout() {
  syncEngine.cancel();
  await unregisterBackgroundSync();
  await authRepository.signOut();
  await useSessionStore.getState().clearContext();
  queryClient.clear();
  // LGPD: remove dados escolares guardados no aparelho.
  await wipeLocalData().catch(() => undefined);
  await syncEngine.refreshPendingCount().catch(() => undefined);
}

export default function SettingsScreen() {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile);
  const ctx = useSessionStore((s) => s.activeContext);
  const memberships = useSessionStore((s) => s.memberships);
  const [loggingOut, setLoggingOut] = useState(false);
  const canSwitch = availableContexts(memberships, profile?.isPlatformAdmin ?? false).length > 1;
  const isSchool = ctx?.kind === 'school';
  const showNotificationsLink = isSchool && (ctx.role === 'coordinator' || ctx.role === 'director' || ctx.role === 'student');

  const logout = async () => {
    const pending = await attendanceStore.pendingCount();
    const doIt = async () => {
      setLoggingOut(true);
      try {
        await performLogout();
      } finally {
        setLoggingOut(false);
      }
    };
    if (pending > 0) {
      Alert.alert(
        'Há chamadas não sincronizadas',
        `${pending} chamada(s) ainda não foram enviadas ao servidor. Se sair agora, elas serão perdidas. Conecte-se à internet e sincronize antes de sair.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sincronizar agora', onPress: () => void syncEngine.syncNow().catch(() => undefined) },
          { text: 'Sair mesmo assim', style: 'destructive', onPress: () => void doIt() },
        ],
      );
      return;
    }
    Alert.alert('Sair da conta', 'Os dados guardados neste aparelho serão apagados.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void doIt() },
    ]);
  };

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg }}>
        <AppText variant="title">{profile?.fullName || 'Minha conta'}</AppText>
        <AppText variant="caption">{profile?.email}</AppText>
        {ctx?.kind === 'school' ? <AppText variant="caption">{`${ROLE_LABEL[ctx.role]} — ${ctx.schoolName}`}</AppText> : null}
      </View>

      <SectionTitle title="  Conta" />
      <ListItem icon="person-outline" title="Perfil" onPress={() => router.push('/settings/profile')} />
      <ListItem icon="key-outline" title="Alterar senha" onPress={() => router.push('/settings/password')} />
      {canSwitch ? (
        <ListItem icon="swap-horizontal-outline" title="Trocar escola ou perfil" onPress={() => router.push('/select-context')} />
      ) : null}
      <ListItem icon="ticket-outline" title="Adicionar vínculo (código de convite)" onPress={() => router.push('/invite')} />

      {isSchool ? (
        <>
          <SectionTitle title="  Escola" />
          {showNotificationsLink ? (
            <ListItem icon="notifications-outline" title="Notificações" onPress={() => router.push('/notifications')} />
          ) : null}
          <ListItem icon="options-outline" title="Preferências de notificação" onPress={() => router.push('/settings/notifications')} />
          <ListItem icon="school-outline" title="Informações da escola" onPress={() => router.push('/settings/school')} />
        </>
      ) : null}

      <SectionTitle title="  Aplicativo" />
      <ListItem icon="cloud-upload-outline" title="Sincronização" subtitle="Fila de envios e estado offline" onPress={() => router.push('/sync-queue')} />
      <ListItem icon="speedometer-outline" title="Desempenho (diagnóstico)" subtitle="Métricas medidas neste aparelho" onPress={() => router.push('/settings/performance')} />
      <ListItem icon="shield-checkmark-outline" title="Política de privacidade" onPress={() => router.push('/privacy')} />

      <View style={{ padding: spacing.lg }}>
        <Button title="Sair" variant="danger" onPress={() => void logout()} loading={loggingOut} />
      </View>
    </Screen>
  );
}

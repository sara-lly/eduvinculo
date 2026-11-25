/**
 * Abas de cada área (perfil). Mostra somente as opções autorizadas para o
 * papel ativo e redireciona se o contexto não corresponder à área.
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { areaForContext, type Area } from '@/domain/roles';
import { useSessionStore } from '@/features/auth/sessionStore';
import { useUnreadNotifications } from '@/features/bootstrap';
import { useIsOnline, useSyncStatus } from '@/features/sync/hooks';
import { SyncPill } from '@/ui/components/states';
import { colors, fonts } from '@/ui/theme';

export interface TabDef {
  name: string;
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  showUnread?: boolean;
}

function HeaderSync() {
  const router = useRouter();
  const online = useIsOnline();
  const { pending, running } = useSyncStatus();
  return (
    <View style={{ marginRight: 12 }}>
      <SyncPill pending={pending} running={running} offline={!online} onPress={() => router.push('/sync-queue')} />
    </View>
  );
}

export function AreaTabs({ area, tabs }: { area: Area; tabs: TabDef[] }) {
  const ctx = useSessionStore((s) => s.activeContext);
  const userId = useSessionStore((s) => s.session?.user.id ?? null);
  const schoolId = ctx?.kind === 'school' ? ctx.schoolId : null;
  const unread = useUnreadNotifications(schoolId, userId);

  if (!ctx || areaForContext(ctx) !== area) return <Redirect href="/" />;
  const headerTitle = ctx.kind === 'school' ? ctx.schoolName : 'Administração';

  return (
    <Tabs
      screenOptions={{
        headerTitle,
        headerTitleStyle: { fontSize: 18, color: colors.primary, fontFamily: fonts.brand },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerRight: () => <HeaderSync />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.bold },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6 },
        sceneStyle: { backgroundColor: colors.background },
        // Telas de abas não visitadas não são montadas (economia de memória).
        lazy: true,
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color as string} size={size} />,
            tabBarBadge: t.showUnread && unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
            tabBarAccessibilityLabel: t.showUnread && unread > 0 ? `${t.title}, ${unread} não lidas` : t.title,
          }}
        />
      ))}
    </Tabs>
  );
}

import { AreaTabs } from '@/features/navigation/AreaTabs';

export default function GuardianLayout() {
  return (
    <AreaTabs
      area="guardian"
      tabs={[
        { name: 'index', title: 'Início', icon: 'home-outline' },
        { name: 'announcements', title: 'Comunicados', icon: 'megaphone-outline' },
        { name: 'notifications', title: 'Notificações', icon: 'notifications-outline', showUnread: true },
        { name: 'settings', title: 'Mais', icon: 'menu-outline' },
      ]}
    />
  );
}

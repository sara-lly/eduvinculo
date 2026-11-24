import { AreaTabs } from '@/features/navigation/AreaTabs';

export default function StudentLayout() {
  return (
    <AreaTabs
      area="student"
      tabs={[
        { name: 'index', title: 'Início', icon: 'home-outline' },
        { name: 'history', title: 'Frequência', icon: 'checkmark-done-outline' },
        { name: 'announcements', title: 'Comunicados', icon: 'megaphone-outline' },
        { name: 'calendar', title: 'Calendário', icon: 'calendar-outline' },
        { name: 'settings', title: 'Mais', icon: 'menu-outline', showUnread: true },
      ]}
    />
  );
}

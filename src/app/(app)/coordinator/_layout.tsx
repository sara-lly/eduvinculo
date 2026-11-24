import { AreaTabs } from '@/features/navigation/AreaTabs';

export default function CoordinatorLayout() {
  return (
    <AreaTabs
      area="coordinator"
      tabs={[
        { name: 'index', title: 'Painel', icon: 'stats-chart-outline' },
        { name: 'management', title: 'Gestão', icon: 'briefcase-outline' },
        { name: 'alerts', title: 'Faltas', icon: 'alert-circle-outline' },
        { name: 'followups', title: 'Acompanh.', icon: 'clipboard-outline' },
        { name: 'settings', title: 'Mais', icon: 'menu-outline', showUnread: true },
      ]}
    />
  );
}

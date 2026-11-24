import { AreaTabs } from '@/features/navigation/AreaTabs';

export default function TeacherLayout() {
  return (
    <AreaTabs
      area="teacher"
      tabs={[
        { name: 'index', title: 'Início', icon: 'home-outline' },
        { name: 'classrooms', title: 'Turmas', icon: 'people-outline' },
        { name: 'notifications', title: 'Notificações', icon: 'notifications-outline', showUnread: true },
        { name: 'settings', title: 'Mais', icon: 'menu-outline' },
      ]}
    />
  );
}

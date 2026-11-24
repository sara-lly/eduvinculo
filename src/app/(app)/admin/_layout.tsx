import { AreaTabs } from '@/features/navigation/AreaTabs';

export default function AdminLayout() {
  return (
    <AreaTabs
      area="admin"
      tabs={[
        { name: 'index', title: 'Escolas', icon: 'business-outline' },
        { name: 'audit', title: 'Auditoria', icon: 'document-text-outline' },
        { name: 'settings', title: 'Mais', icon: 'menu-outline' },
      ]}
    />
  );
}

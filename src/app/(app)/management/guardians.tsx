import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { TextField } from '@/ui/components/forms';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button } from '@/ui/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

export default function ManageGuardians() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search);
  const q = useQuery({ queryKey: ['management', 'guardians', ctx.schoolId, term], queryFn: () => managementRepository.listGuardians(ctx.schoolId, term) });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md }}>
        <TextField label="Buscar" value={search} onChangeText={setSearch} placeholder="Nome do responsável" />
        <Button title="Novo responsável" onPress={() => router.push('/management/guardian-form')} />
      </View>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <FlashList
          data={q.data}
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => (
            <ListItem icon="home-outline" title={item.fullName}
              subtitle={item.students.map((s) => `${s.fullName} (${s.relationship})`).join(', ') || 'Sem estudantes vinculados'}
              right={!item.active ? <Badge label="Inativo" tone="danger" /> : item.hasAccount ? <Badge label="App" tone="success" /> : <Badge label="Sem conta" />}
              onPress={() => router.push({ pathname: '/management/guardian-form', params: { guardianId: item.id } })} />
          )}
          ListEmptyComponent={<EmptyState title="Nenhum responsável encontrado" />}
        />
      )}
    </View>
  );
}

import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { View } from 'react-native';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ChipSelect, TextField } from '@/ui/components/forms';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button } from '@/ui/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

/** Lista de estudantes com busca e paginação no servidor (não carrega a escola inteira). */
export default function ManageStudents() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.trim());
  const [classroomId, setClassroomId] = useState('');
  const classrooms = useQuery({ queryKey: ['management', 'classrooms', ctx.schoolId], queryFn: () => managementRepository.listClassrooms(ctx.schoolId) });

  const q = useInfiniteQuery({
    queryKey: ['management', 'students', ctx.schoolId, term, classroomId],
    queryFn: ({ pageParam, signal }) => {
      void signal;
      return managementRepository.searchStudents(ctx.schoolId, { search: term, classroomId: classroomId || undefined, page: pageParam, includeInactive: true });
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md }}>
        <TextField label="Buscar" value={search} onChangeText={setSearch} placeholder="Nome ou matrícula" />
        <ChipSelect value={classroomId} onChange={(v) => setClassroomId(v === classroomId ? '' : v)}
          options={[{ value: '', label: 'Todas' }, ...(classrooms.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <Button title="Novo estudante" onPress={() => router.push('/management/student-form')} />
      </View>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <FlashList
          data={items}
          keyExtractor={(s) => s.id}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <ListItem title={item.fullName} subtitle={`Matrícula ${item.registrationCode} · ${item.classroomName ?? 'Sem turma'}`}
              right={!item.active ? <Badge label="Inativo" tone="danger" /> : item.hasAccount ? <Badge label="App" tone="success" /> : undefined}
              onPress={() => router.push(`/students/${item.id}`)} />
          )}
          ListEmptyComponent={<EmptyState title="Nenhum estudante encontrado" />}
          ListFooterComponent={q.isFetchingNextPage ? <LoadingState label="Carregando mais…" /> : null}
        />
      )}
    </View>
  );
}

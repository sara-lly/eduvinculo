import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { View } from 'react-native';
import { formatDateTimeBR } from '@/core/dates';
import { adminRepository } from '@/data/repositories/adminRepository';
import { useSessionStore } from '@/features/auth/sessionStore';
import { ListItem } from '@/ui/components/layout';
import { EmptyState, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { colors, spacing } from '@/ui/theme';

const ACTION = { insert: 'criou', update: 'alterou', delete: 'removeu', grant_admin: 'concedeu admin', revoke_admin: 'revogou admin' } as const;
const ENTITY: Record<string, string> = {
  schools: 'escola', school_memberships: 'vínculo', attendance_rules: 'regras de frequência', classrooms: 'turma', students: 'estudante',
  guardians: 'responsável', student_guardians: 'vínculo responsável/estudante', classroom_students: 'matrícula', classroom_teachers: 'vínculo professor/turma',
  invitations: 'convite', pedagogical_followups: 'acompanhamento', pedagogical_notes: 'observação', attendance_conflicts: 'conflito de chamada',
  announcements: 'comunicado', profiles: 'perfil',
};

/** Auditoria: quem fez o quê e quais campos mudaram (sem valores pessoais). */
export default function AuditScreen() {
  const ctx = useSessionStore((s) => s.activeContext);
  const q = useInfiniteQuery({
    queryKey: ['audit', ctx?.kind === 'school' ? ctx.schoolId : 'all'],
    queryFn: ({ pageParam }) => adminRepository.auditLogs({ schoolId: ctx?.kind === 'school' ? ctx.schoolId : undefined, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md }}>
        <InlineMessage tone="info" text="A auditoria registra autor, ação e campos alterados — sem copiar os valores (minimização de dados)." />
      </View>
      <FlashList
        data={items}
        keyExtractor={(a) => String(a.id)}
        onRefresh={() => void q.refetch()}
        refreshing={q.isRefetching}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        renderItem={({ item }) => (
          <ListItem icon="document-text-outline"
            title={`${item.actorName ?? 'Sistema'} ${ACTION[item.action as keyof typeof ACTION] ?? item.action} ${ENTITY[item.entity] ?? item.entity}`}
            subtitle={`${formatDateTimeBR(item.createdAt)}${item.schoolName ? ` · ${item.schoolName}` : ''}${item.changedFields?.length ? `\nCampos: ${item.changedFields.join(', ')}` : ''}`} />
        )}
        ListEmptyComponent={<EmptyState title="Nenhum registro de auditoria" />}
      />
    </View>
  );
}

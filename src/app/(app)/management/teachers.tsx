import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert, View } from 'react-native';
import { toAppError } from '@/core/errors';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button } from '@/ui/components/primitives';
import { EmptyState, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { colors, spacing } from '@/ui/theme';

export default function ManageTeachers() {
  const ctx = useSchoolContext();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['management', 'teachers', ctx.schoolId], queryFn: () => managementRepository.listTeachers(ctx.schoolId) });

  const toggle = (membershipId: string, name: string, active: boolean) =>
    Alert.alert(active ? 'Desativar acesso' : 'Reativar acesso', `${active ? 'Desativar' : 'Reativar'} o acesso de ${name} a esta escola?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: active ? 'destructive' : 'default', onPress: () => void managementRepository.setMembershipActive(membershipId, !active)
        .then(() => { toast.success('Acesso atualizado.'); void qc.invalidateQueries({ queryKey: ['management', 'teachers'] }); })
        .catch((e) => toast.error(toAppError(e).message)) },
    ]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md }}>
        <InlineMessage tone="info" text="Novos professores entram com um código de convite. Depois, vincule-os às turmas na tela da turma." />
        <Button title="Gerar convite para professor" onPress={() => router.push({ pathname: '/management/invites', params: { role: 'teacher' } })} />
      </View>
      <FlashList
        data={q.data}
        keyExtractor={(t) => t.membershipId}
        renderItem={({ item }) => (
          <ListItem icon="person-outline" title={item.fullName}
            subtitle={`${item.email ?? ''}\n${item.classrooms.length ? item.classrooms.map((c) => `${c.classroomName} (${c.subject})`).join(', ') : 'Sem turmas vinculadas'}`}
            right={item.active ? <Badge label="Ativo" tone="success" /> : <Badge label="Inativo" tone="danger" />}
            onPress={() => toggle(item.membershipId, item.fullName, item.active)} />
        )}
        ListEmptyComponent={<EmptyState title="Nenhum professor" message="Gere um convite para o primeiro acesso." />}
      />
    </View>
  );
}

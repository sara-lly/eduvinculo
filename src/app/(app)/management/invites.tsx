import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { formatDateBR } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { managementRepository } from '@/data/repositories/managementRepository';
import { ROLE_LABEL } from '@/domain/roles';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ChipSelect, TextField } from '@/ui/components/forms';
import { ListItem } from '@/ui/components/layout';
import { Badge, Button } from '@/ui/components/primitives';
import { EmptyState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { colors, spacing } from '@/ui/theme';

/**
 * Convites de professores. (Convites de responsáveis e estudantes são gerados
 * a partir do cadastro de cada um, para garantir o vínculo correto.)
 */
export default function InvitesScreen() {
  const ctx = useSchoolContext();
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [uses, setUses] = useState<'1' | '5' | '20'>('1');
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());
  const q = useQuery({ queryKey: ['invites', ctx.schoolId], queryFn: () => managementRepository.listInvites(ctx.schoolId) });

  const create = async () => {
    setCreating(true);
    try {
      const r = await managementRepository.createInvite({ schoolId: ctx.schoolId, role: 'teacher', label: label.trim() || undefined, validDays: 7, maxUses: Number(uses) });
      setLabel('');
      void qc.invalidateQueries({ queryKey: ['invites'] });
      Alert.alert('Convite de professor', `${r.code}\n\nVálido por 7 dias, até ${uses} uso(s). Ele não será exibido novamente.`, [
        { text: 'Compartilhar', onPress: () => void Share.share({ message: `Código de acesso de professor ao EduVínculo (${ctx.schoolName}): ${r.code}` }) },
        { text: 'OK' },
      ]);
    } catch (e) {
      toast.error(toAppError(e).message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = (id: string) => Alert.alert('Revogar convite', 'O código deixará de funcionar imediatamente.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Revogar', style: 'destructive', onPress: () => void managementRepository.revokeInvite(id)
      .then(() => { toast.success('Convite revogado.'); void qc.invalidateQueries({ queryKey: ['invites'] }); })
      .catch((e) => toast.error(toAppError(e).message)) },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md }}>
        <InlineMessage tone="info" text="Somente o hash do código fica salvo no servidor: anote ou compartilhe o código no momento em que ele for exibido." />
        <TextField label="Identificação (opcional)" value={label} onChangeText={setLabel} placeholder="Ex.: Prof. de Ciências — 2026" />
        <ChipSelect label="Número de usos" value={uses} onChange={setUses} options={[{ value: '1', label: '1' }, { value: '5', label: '5' }, { value: '20', label: '20' }]} />
        <Button title="Gerar convite de professor" onPress={() => void create()} loading={creating} />
      </View>
      {q.isPending ? <LoadingState /> : (
        <FlashList
          data={q.data ?? []}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => {
            const expired = new Date(item.expiresAt).getTime() < now;
            const exhausted = item.usedCount >= item.maxUses;
            const state = item.revoked ? { l: 'Revogado', t: 'danger' as const } : expired ? { l: 'Expirado', t: 'neutral' as const } : exhausted ? { l: 'Utilizado', t: 'success' as const } : { l: 'Ativo', t: 'info' as const };
            return (
              <ListItem title={`${ROLE_LABEL[item.role]} · final ${item.codeHint}`}
                subtitle={`${item.label ?? ''}\nUsos: ${item.usedCount}/${item.maxUses} · expira em ${formatDateBR(item.expiresAt.slice(0, 10))}`}
                right={<Badge label={state.l} tone={state.t} />}
                onPress={state.l === 'Ativo' ? () => revoke(item.id) : undefined} />
            );
          }}
          ListEmptyComponent={<EmptyState title="Nenhum convite gerado" />}
        />
      )}
    </View>
  );
}

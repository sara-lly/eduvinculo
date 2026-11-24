import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { toAppError } from '@/core/errors';
import { adminRepository, type SchoolOverview } from '@/data/repositories/adminRepository';
import { TextField } from '@/ui/components/forms';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Badge, Button, Card, Row, SectionTitle } from '@/ui/components/primitives';
import { ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

/** Administração da plataforma: escolas (somente contagens — sem dados pessoais de estudantes). */
export default function AdminSchools() {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminRepository.overview });
  const admins = useQuery({ queryKey: ['admin', 'admins'], queryFn: adminRepository.listAdmins });
  const [adminEmail, setAdminEmail] = useState('');

  const toggleStatus = (s: SchoolOverview) => {
    const next = s.status === 'active' ? 'suspended' : 'active';
    Alert.alert(next === 'suspended' ? 'Suspender escola' : 'Reativar escola',
      next === 'suspended' ? `Usuários de ${s.name} perderão o acesso até a reativação. Os dados são preservados.` : `Reativar o acesso de ${s.name}?`,
      [{ text: 'Cancelar', style: 'cancel' }, {
        text: 'Confirmar', style: next === 'suspended' ? 'destructive' : 'default',
        onPress: () => void adminRepository.setSchoolStatus(s.id, next)
          .then(() => { toast.success('Situação atualizada.'); void qc.invalidateQueries({ queryKey: ['admin'] }); })
          .catch((e) => toast.error(toAppError(e).message)),
      }]);
  };

  const inviteManagement = async (s: SchoolOverview, role: 'coordinator' | 'director') => {
    try {
      const r = await adminRepository.createManagementInvite(s.id, role, `${role === 'director' ? 'Direção' : 'Coordenação'} — ${s.name}`);
      Alert.alert('Convite de gestão escolar', `${r.code}\n\nVálido por 14 dias, uso único.`, [
        { text: 'Compartilhar', onPress: () => void Share.share({ message: `Código de acesso (${role === 'director' ? 'direção' : 'coordenação'}) — ${s.name}: ${r.code}` }) },
        { text: 'OK' },
      ]);
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  };

  const grantAdmin = async () => {
    try {
      await adminRepository.setPlatformAdmin(adminEmail, true);
      toast.success('Acesso administrativo concedido.');
      setAdminEmail('');
      void qc.invalidateQueries({ queryKey: ['admin', 'admins'] });
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  };

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <InlineMessage tone="info" text="Por minimização de dados (LGPD), a administração da plataforma vê apenas contagens — nunca dados de estudantes." />
      <Button title="Cadastrar escola" onPress={() => router.push('/admin-school-form')} />
      <SectionTitle title={`Escolas (${q.data.length})`} />
      {q.data.map((s) => (
        <Card key={s.id} style={{ marginBottom: spacing.sm, gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="label" style={{ flex: 1 }}>{s.name}</AppText>
            <Badge label={s.status === 'active' ? 'Ativa' : 'Suspensa'} tone={s.status === 'active' ? 'success' : 'danger'} />
          </Row>
          <AppText variant="caption">{`${s.city}-${s.state}${s.inep_code ? ` · INEP ${s.inep_code}` : ''}`}</AppText>
          <AppText variant="caption">{`${s.students} estudantes · ${s.classrooms} turmas · ${s.teachers} professores · ${s.guardians} responsáveis · ${s.staff} gestores`}</AppText>
          <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <Button title="Convite coordenação" compact variant="secondary" onPress={() => void inviteManagement(s, 'coordinator')} />
            <Button title="Convite direção" compact variant="secondary" onPress={() => void inviteManagement(s, 'director')} />
            <Button title={s.status === 'active' ? 'Suspender' : 'Reativar'} compact variant={s.status === 'active' ? 'danger' : 'success'} onPress={() => toggleStatus(s)} />
          </Row>
        </Card>
      ))}
      <SectionTitle title="Administradores da plataforma" />
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>
        {(admins.data ?? []).map((a) => <ListItem key={a.id} icon="shield-checkmark-outline" title={a.full_name || 'Sem nome'} subtitle={a.email ?? ''} />)}
      </View>
      <TextField label="Conceder acesso administrativo (e-mail de conta existente)" value={adminEmail} onChangeText={setAdminEmail}
        keyboardType="email-address" autoCapitalize="none" />
      <Button title="Conceder acesso" variant="secondary" disabled={!adminEmail.includes('@')} onPress={() => Alert.alert('Conceder acesso administrativo',
        `Conceder acesso de administração da plataforma a ${adminEmail}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Conceder', onPress: () => void grantAdmin() }])} />
    </Screen>
  );
}

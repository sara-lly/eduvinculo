import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { formatDateBR, formatRelativeBR } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { followupRepository } from '@/data/repositories/followupRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { isStaffRole } from '@/domain/roles';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { StudentAttendanceView } from '@/features/students/StudentAttendanceView';
import { TextField } from '@/ui/components/forms';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Badge, Button, Card, SectionTitle } from '@/ui/components/primitives';
import { ErrorState, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { spacing } from '@/ui/theme';

const FOLLOWUP_STATUS = { open: 'Aberto', in_progress: 'Em andamento', closed: 'Encerrado' } as const;

export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();
  const staff = isStaffRole(ctx.role);
  const teacher = ctx.role === 'teacher';
  const [note, setNote] = useState('');

  const student = useQuery({ queryKey: ['student', id], queryFn: () => managementRepository.getStudent(id) });
  const followups = useQuery({ queryKey: ['followups', 'student', id], queryFn: () => followupRepository.listForStudent(id), enabled: staff });
  const notes = useQuery({ queryKey: ['notes', id], queryFn: () => followupRepository.notes(id), enabled: staff || teacher });

  const addNote = useMutation({
    mutationFn: () => followupRepository.addNote(ctx.schoolId, id, note.trim(), userId),
    onSuccess: () => {
      setNote('');
      toast.success('Observação registrada.');
      void qc.invalidateQueries({ queryKey: ['notes', id] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const createInvite = async (kind: 'student' | 'guardian', guardianId?: string) => {
    try {
      const r = await managementRepository.createInvite({
        schoolId: ctx.schoolId, role: kind, studentId: kind === 'student' ? id : undefined, guardianId,
        label: kind === 'student' ? student.data?.fullName : undefined, validDays: 7,
      });
      Alert.alert('Código de convite gerado', `${r.code}\n\nVálido por 7 dias e para um único uso. Entregue este código pessoalmente. Ele não será exibido novamente.`, [
        { text: 'Compartilhar', onPress: () => void Share.share({ message: `Código de convite EduVínculo (${ctx.schoolName}): ${r.code}` }) },
        { text: 'OK' },
      ]);
      void qc.invalidateQueries({ queryKey: ['invites'] });
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  };

  const toggleActive = () => {
    const s = student.data;
    if (!s) return;
    Alert.alert(s.active ? 'Desativar cadastro' : 'Reativar cadastro',
      s.active ? 'O estudante sairá das listas de chamada. O histórico de frequência é preservado.' : 'O estudante voltará a aparecer nos cadastros.',
      [{ text: 'Cancelar', style: 'cancel' }, {
        text: 'Confirmar', style: s.active ? 'destructive' : 'default', onPress: async () => {
          try {
            await managementRepository.setStudentActive(s.id, !s.active);
            toast.success(s.active ? 'Cadastro desativado.' : 'Cadastro reativado.');
            void qc.invalidateQueries({ queryKey: ['student', id] });
            void qc.invalidateQueries({ queryKey: ['management'] });
          } catch (e) {
            toast.error(toAppError(e).message);
          }
        },
      }]);
  };

  if (student.isPending) return <LoadingState />;
  if (student.isError) return <ErrorState error={student.error} onRetry={() => void student.refetch()} />;
  const s = student.data;

  return (
    <Screen>
      <Stack.Screen options={{ title: s.fullName.split(' ')[0] ?? 'Estudante' }} />
      <Card style={{ gap: 4, marginBottom: spacing.md }}>
        <AppText variant="subtitle">{s.fullName}</AppText>
        <AppText variant="caption">{`Matrícula ${s.registrationCode}${s.classroomName ? ` · ${s.classroomName}` : ''}`}</AppText>
        {s.birthDate && staff ? <AppText variant="caption">{`Nascimento: ${formatDateBR(s.birthDate)}`}</AppText> : null}
        {!s.active ? <Badge label="Cadastro desativado" tone="danger" /> : null}
      </Card>

      <StudentAttendanceView studentId={id} schoolId={ctx.schoolId} timezone={ctx.timezone} />

      {staff ? (
        <>
          <SectionTitle title="Responsáveis" />
          <View style={{ borderRadius: 14, overflow: 'hidden' }}>
            {s.guardians.map((g) => (
              <ListItem key={g.id} icon="person-outline" title={g.fullName} subtitle={`${g.relationship} · ${g.hasAccount ? 'com acesso ao app' : 'sem conta vinculada'}`}
                right={!g.hasAccount ? <Button title="Convite" compact variant="secondary" onPress={() => void createInvite('guardian', g.id)} /> : undefined} />
            ))}
            {s.guardians.length === 0 ? <Card><AppText variant="caption">Nenhum responsável vinculado.</AppText></Card> : null}
          </View>
          <Button title="Vincular responsável" variant="ghost" onPress={() => router.push({ pathname: '/management/guardian-form', params: { studentId: id } })} />

          <SectionTitle title="Acompanhamento pedagógico" action={
            <Button title="Novo" compact onPress={() => router.push({ pathname: '/followup/[id]', params: { id: 'new', studentId: id } })} />
          } />
          {(followups.data ?? []).map((f) => (
            <ListItem key={f.id} icon="clipboard-outline" title={f.reason} subtitle={`${formatDateBR(f.identifiedAt)} · ${FOLLOWUP_STATUS[f.status]}`}
              onPress={() => router.push(`/followup/${f.id}`)} />
          ))}
          {followups.data?.length === 0 ? <Card><AppText variant="caption">Nenhum acompanhamento registrado.</AppText></Card> : null}
        </>
      ) : null}

      {staff || teacher ? (
        <>
          <SectionTitle title={teacher ? 'Minhas observações' : 'Observações dos professores'} />
          <AppText variant="caption" style={{ marginBottom: spacing.sm }}>
            Visíveis somente ao autor e à coordenação. Registre fatos objetivos, sem julgamentos.
          </AppText>
          <TextField label="Nova observação" value={note} onChangeText={setNote} multiline maxLength={2000} />
          <Button title="Registrar observação" variant="secondary" disabled={note.trim().length < 3} loading={addNote.isPending}
            onPress={() => addNote.mutate()} />
          {(notes.data ?? []).map((n) => (
            <Card key={n.id} style={{ marginTop: spacing.sm }}>
              <AppText>{n.note}</AppText>
              <AppText variant="caption">{`${n.profiles?.full_name ?? 'Autor'} · ${formatRelativeBR(n.created_at)}`}</AppText>
            </Card>
          ))}
        </>
      ) : null}

      {staff ? (
        <>
          <SectionTitle title="Ações administrativas" />
          <View style={{ gap: spacing.sm }}>
            {!s.hasAccount && s.active ? <Button title="Gerar convite de acesso do estudante" variant="secondary" onPress={() => void createInvite('student')} /> : null}
            <Button title="Editar / transferir de turma" variant="secondary" onPress={() => router.push({ pathname: '/management/student-form', params: { id } })} />
            <Button title={s.active ? 'Desativar cadastro' : 'Reativar cadastro'} variant={s.active ? 'danger' : 'success'} onPress={toggleActive} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

/**
 * Registro de chamada (offline-first).
 *
 * Desempenho:
 *  - FlashList virtualiza a lista (turmas de 500 estudantes sem travar);
 *  - AttendanceRow é memoizada e recebe um callback estável: marcar um
 *    estudante re-renderiza apenas a linha alterada;
 *  - a busca usa useDeferredValue para não bloquear a digitação;
 *  - salvar grava no SQLite (thread nativa) e a sincronização roda em
 *    segundo plano, sem esperar a rede.
 */
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, formatDateBR, formatLongDateBR, todayIso } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { recordMetric } from '@/core/perf';
import { attendanceRepository } from '@/data/repositories/attendanceRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { checkCompleteness, countStatuses, fillRemainingAsPresent, recordsToPayload, STATUS_LABEL } from '@/domain/attendance';
import { isStaffRole } from '@/domain/roles';
import { DEFAULT_RULES, type AttendanceStatus, type RosterStudent } from '@/domain/types';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { useIsOnline, useSyncStatus } from '@/features/sync/hooks';
import { AttendanceRow, DateStepper, StatusLegend } from '@/ui/components/attendance';
import { ProgressBar } from '@/ui/components/layout';
import { AppText, Badge, Button, Row } from '@/ui/components/primitives';
import { ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';
import { colors, radius, spacing } from '@/ui/theme';

export default function AttendanceScreen() {
  const params = useLocalSearchParams<{ classroomId: string; date?: string; slot?: string }>();
  const classroomId = params.classroomId;
  const ctx = useSchoolContext();
  const userId = useUserId();
  const router = useRouter();
  const qc = useQueryClient();
  const online = useIsOnline();
  const sync = useSyncStatus();
  const tz = ctx.timezone;
  const today = todayIso(tz);
  const [date, setDate] = useState(params.date && params.date <= today ? params.date : today);
  const slot = Number(params.slot ?? 1) || 1;
  const [mountedAt] = useState(() => performance.now());

  const classrooms = useQuery({
    queryKey: ['classrooms', ctx.membershipId],
    queryFn: () => attendanceRepository.listClassrooms(ctx, { userId, preferCache: true }),
    staleTime: Infinity,
  });
  const classroom = classrooms.data?.data.find((c) => c.id === classroomId);

  const rules = useQuery({
    queryKey: ['rules', ctx.schoolId],
    queryFn: () => managementRepository.getRules(ctx.schoolId),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const editWindow = isStaffRole(ctx.role) ? 365 : (rules.data?.teacherEditWindowDays ?? DEFAULT_RULES.teacherEditWindowDays);

  const roster = useQuery({
    queryKey: ['roster', classroomId],
    queryFn: ({ signal }) => attendanceRepository.getRoster(classroomId, { signal }),
  });

  // Atualização incremental do histórico local (cancelada se a tela fechar).
  useEffect(() => {
    const controller = new AbortController();
    void attendanceRepository.refreshSessions(classroomId, controller.signal)
      .then(() => qc.invalidateQueries({ queryKey: ['local-session', classroomId] }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [classroomId, qc]);

  const localSession = useQuery({
    queryKey: ['local-session', classroomId, date, slot],
    queryFn: () => attendanceRepository.getLocalSession(classroomId, date, slot),
    networkMode: 'always',
  });

  // Atualiza o estado de sincronização exibido quando o motor termina.
  useEffect(() => {
    if (!sync.running) void qc.invalidateQueries({ queryKey: ['local-session', classroomId] });
  }, [sync.running, classroomId, qc]);

  const [records, setRecords] = useState<Map<string, AttendanceStatus>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const loadedKey = useRef<string | null>(null);

  // Carrega os registros salvos ao trocar de data (sem sobrescrever edições em andamento).
  useEffect(() => {
    const key = `${date}|${slot}|${localSession.data?.session.id ?? 'new'}|${localSession.data?.session.serverVersion ?? 0}`;
    if (localSession.isPending || (dirty && loadedKey.current?.startsWith(`${date}|${slot}|`))) return;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setRecords(new Map(localSession.data?.records ?? []));
    setDirty(false);
  }, [localSession.data, localSession.isPending, date, slot, dirty]);

  const students: RosterStudent[] = useMemo(() => roster.data?.data ?? [], [roster.data]);

  // Mede o tempo até a lista estar pronta (relatório de desempenho).
  const measured = useRef(false);
  useEffect(() => {
    if (!measured.current && students.length > 0) {
      measured.current = true;
      recordMetric('attendance.screen_ready', performance.now() - mountedAt, 'ms', { students: students.length, fromCache: roster.data?.fromCache });
    }
  }, [students.length, roster.data?.fromCache, mountedAt]);

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return students;
    return students.filter((s) => s.fullName.toLocaleLowerCase('pt-BR').includes(term) || s.registrationCode.toLowerCase().includes(term));
  }, [students, deferredSearch]);

  const indexById = useMemo(() => new Map(students.map((s, i) => [s.studentId, i])), [students]);

  const session = localSession.data?.session;
  const completed = session?.status === 'completed';
  const counts = useMemo(() => countStatuses(records.values()), [records]);
  const completeness = useMemo(() => checkCompleteness(students, records), [students, records]);
  const tooOld = date < addDays(today, -editWindow);

  // Callback estável: não recria função por linha nem por renderização.
  const onChange = useCallback((studentId: string, status: AttendanceStatus) => {
    setRecords((prev) => {
      if (prev.get(studentId) === status) return prev; // evita atualização de estado desnecessária
      const next = new Map(prev);
      next.set(studentId, status);
      return next;
    });
    setDirty(true);
  }, []);

  const markRemainingPresent = useCallback(() => {
    setRecords((prev) => fillRemainingAsPresent(students, prev));
    setDirty(true);
  }, [students]);

  const changeDate = (d: string) => {
    const go = () => {
      setDirty(false);
      loadedKey.current = null;
      setDate(d);
    };
    if (dirty) {
      Alert.alert('Alterações não salvas', 'Deseja descartar as marcações desta data?', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: go },
      ]);
    } else go();
  };

  const save = async (status: 'draft' | 'completed') => {
    if (saving) return; // proteção contra toques repetidos
    if (status === 'completed' && !completeness.complete) {
      setConfirmOpen(false);
      Alert.alert('Chamada incompleta', `Faltam ${completeness.missing.length} estudante(s) sem registro. Marque todos antes de concluir ou salve como rascunho.`);
      return;
    }
    setSaving(true);
    try {
      await attendanceRepository.saveSession({
        sessionId: session?.id,
        schoolId: ctx.schoolId,
        classroomId,
        lessonDate: date,
        lessonSlot: slot,
        status: completed ? 'completed' : status,
        serverVersion: session?.serverVersion ?? 0,
        records: recordsToPayload(records),
      });
      setDirty(false);
      loadedKey.current = null;
      setConfirmOpen(false);
      await qc.invalidateQueries({ queryKey: ['local-session', classroomId] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(online
        ? status === 'completed' ? 'Chamada concluída. Sincronizando com a escola…' : 'Rascunho salvo.'
        : 'Salvo no aparelho (offline). Será enviado quando a internet voltar.');
      if (status === 'completed') router.back();
    } catch (e) {
      toast.error(toAppError(e, 'Não foi possível salvar a chamada.').message);
    } finally {
      setSaving(false);
    }
  };

  const absentNames = useMemo(
    () => students.filter((s) => records.get(s.studentId) === 'absent').map((s) => s.fullName),
    [students, records],
  );

  if (roster.isPending) return <LoadingState label="Carregando lista de estudantes…" />;
  if (roster.isError) return <ErrorState error={roster.error} onRetry={() => void roster.refetch()} />;

  const syncBadge = session ? {
    synced: { label: 'Sincronizada', tone: 'success' as const },
    pending: { label: online ? 'Enviando…' : 'Pendente (offline)', tone: 'warning' as const },
    conflict: { label: 'Conflito', tone: 'danger' as const },
    error: { label: 'Erro ao enviar', tone: 'danger' as const },
  }[session.syncState] : null;

  const header = (
    <View style={styles.header}>
      <DateStepper value={date} onChange={changeDate} maxDate={today} minDate={addDays(today, -editWindow)} />
      <Row style={{ flexWrap: 'wrap', marginTop: spacing.sm }}>
        {completed ? <Badge label="Concluída" tone="success" /> : session ? <Badge label="Rascunho" tone="neutral" /> : <Badge label="Nova chamada" tone="info" />}
        {syncBadge ? <Badge label={syncBadge.label} tone={syncBadge.tone} /> : null}
        {roster.data.offline ? <Badge label="Lista salva no aparelho" tone="warning" /> : null}
      </Row>
      {session?.syncState === 'conflict' ? (
        <InlineMessage tone="danger" text="Outra pessoa alterou esta chamada. Nada foi sobrescrito: as duas versões aguardam revisão em “Conflitos de chamada”." />
      ) : null}
      {session?.syncState === 'error' ? <InlineMessage tone="danger" text={session.syncError ?? 'Erro ao sincronizar.'} /> : null}
      {tooOld ? <InlineMessage tone="warning" text="Esta data está fora do período de edição permitido para professores." /> : null}
      <View style={{ marginTop: spacing.sm, gap: 6 }}>
        <AppText variant="caption">
          {`${completeness.recorded}/${completeness.total} registrados · ${counts.present} presentes · ${counts.absent} faltas · ${counts.late} atrasos · ${counts.justified} justificadas`}
        </AppText>
        <ProgressBar value={completeness.recorded} max={completeness.total || 1} tone={completeness.complete ? colors.success : colors.accent}
          label="Progresso da chamada" />
      </View>
      <StatusLegend />
      <Row>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar estudante ou matrícula"
          placeholderTextColor={colors.disabled}
          accessibilityLabel="Buscar estudante"
          style={styles.search}
        />
        {completeness.missing.length > 0 && !tooOld ? (
          <Button title="Restantes: presente" compact variant="secondary" onPress={markRemainingPresent} />
        ) : null}
      </Row>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: classroom?.name ?? 'Chamada' }} />
      <FlashList
        data={filtered}
        keyExtractor={(s) => s.studentId}
        extraData={records}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <AttendanceRow
            studentId={item.studentId}
            name={item.fullName}
            registrationCode={item.registrationCode}
            index={indexById.get(item.studentId) ?? 0}
            status={records.get(item.studentId)}
            disabled={tooOld || saving}
            onChange={onChange}
          />
        )}
        ListEmptyComponent={<AppText variant="caption" style={{ padding: spacing.lg }}>
          {students.length === 0 ? 'Nenhum estudante matriculado nesta turma.' : 'Nenhum estudante encontrado na busca.'}
        </AppText>}
      />
      <View style={styles.footer}>
        <Button title="Salvar rascunho" variant="secondary" style={{ flex: 1 }} disabled={tooOld || completed || !dirty}
          loading={saving && !confirmOpen} onPress={() => void save('draft')} />
        <Button title={completed ? 'Salvar correção' : 'Concluir chamada'} style={{ flex: 1.3 }} disabled={tooOld || saving || students.length === 0 || (completed && !dirty)}
          onPress={() => setConfirmOpen(true)} />
      </View>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal} accessibilityViewIsModal>
            <AppText variant="subtitle">{completed ? 'Confirmar correção' : 'Confirmar chamada'}</AppText>
            <AppText variant="caption">{`${classroom?.name ?? ''} · ${formatDateBR(date)} (${formatLongDateBR(date)})`}</AppText>
            {!completeness.complete ? (
              <InlineMessage tone="danger" text={`${completeness.missing.length} estudante(s) sem registro: ${completeness.missing.slice(0, 5).map((s) => s.fullName).join(', ')}${completeness.missing.length > 5 ? '…' : ''}`} />
            ) : null}
            <AppText>{`${STATUS_LABEL.present}: ${counts.present}\n${STATUS_LABEL.absent}: ${counts.absent}\n${STATUS_LABEL.late}: ${counts.late}\n${STATUS_LABEL.justified}: ${counts.justified}`}</AppText>
            {absentNames.length > 0 ? (
              <ScrollView style={{ maxHeight: 140 }}>
                <AppText variant="caption">{`Ausentes: ${absentNames.join(', ')}`}</AppText>
              </ScrollView>
            ) : null}
            <AppText variant="caption">
              Ao concluir, os responsáveis dos estudantes ausentes poderão ser notificados conforme as regras da escola.
            </AppText>
            <Row style={{ marginTop: spacing.md }}>
              <Button title="Voltar" variant="ghost" style={{ flex: 1 }} onPress={() => setConfirmOpen(false)} />
              <Button title="Confirmar" style={{ flex: 1 }} loading={saving} disabled={!completeness.complete}
                onPress={() => void save('completed')} />
            </Row>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.background },
  search: {
    flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.surface, color: colors.text,
  },
  footer: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
});

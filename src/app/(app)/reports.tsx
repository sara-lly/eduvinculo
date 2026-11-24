import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { addDays, formatDateBR, todayIso } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { dashboardRepository } from '@/data/repositories/dashboardRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { formatPercent } from '@/domain/attendance';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ChipSelect } from '@/ui/components/forms';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Badge, Button, Card, SectionTitle } from '@/ui/components/primitives';
import { ErrorState, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';

type Period = '30' | '90' | 'year';

/** Relatório de frequência por estudante, exportável em CSV (compartilhamento nativo). */
export default function ReportsScreen() {
  const ctx = useSchoolContext();
  const today = todayIso(ctx.timezone);
  const [period, setPeriod] = useState<Period>('30');
  const [classroomId, setClassroomId] = useState('');
  const from = period === 'year' ? `${today.slice(0, 4)}-01-01` : addDays(today, -Number(period) + 1);
  const classrooms = useQuery({ queryKey: ['management', 'classrooms', ctx.schoolId], queryFn: () => managementRepository.listClassrooms(ctx.schoolId) });
  const rules = useQuery({ queryKey: ['rules', ctx.schoolId], queryFn: () => managementRepository.getRules(ctx.schoolId) });
  const minPercent = rules.data?.minAttendancePercent ?? 75;
  const q = useQuery({
    queryKey: ['report', ctx.schoolId, from, today, classroomId],
    queryFn: () => dashboardRepository.report(ctx.schoolId, from, today, classroomId || undefined),
    enabled: !!classroomId,
  });

  const summary = useMemo(() => {
    const rows = q.data ?? [];
    const total = rows.reduce((a, r) => a + r.total, 0);
    const absent = rows.reduce((a, r) => a + r.absent, 0);
    const below = rows.filter((r) => r.attendance_percent !== null && r.attendance_percent < minPercent).length;
    return { total, absent, below, students: rows.length };
  }, [q.data, minPercent]);

  const exportCsv = async () => {
    const rows = q.data ?? [];
    const header = 'Turma;Estudante;Matrícula;Aulas;Presenças;Faltas;Atrasos;Justificadas;Frequência (%)';
    const lines = rows.map((r) => [r.classroom_name, r.student_name, r.registration_code, r.total, r.present, r.absent, r.late, r.justified,
      r.attendance_percent === null ? '' : String(r.attendance_percent).replace('.', ',')].join(';'));
    try {
      await Share.share({
        title: `Frequência ${formatDateBR(from)} a ${formatDateBR(today)}`,
        message: [`Relatório de frequência — ${ctx.schoolName} — ${formatDateBR(from)} a ${formatDateBR(today)}`, header, ...lines].join('\n'),
      });
    } catch (e) {
      toast.error(toAppError(e).message);
    }
  };

  return (
    <Screen>
      <ChipSelect<Period> label="Período" value={period} onChange={setPeriod} options={[
        { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }, { value: 'year', label: 'Ano letivo' },
      ]} />
      <ChipSelect label="Turma" value={classroomId} onChange={setClassroomId}
        options={(classrooms.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      {!classroomId ? <Card><AppText variant="caption">Selecione uma turma para gerar o relatório.</AppText></Card> : q.isPending ? <LoadingState /> : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card>
            <AppText variant="label">{`${summary.students} estudantes · ${summary.total} registros · ${summary.absent} faltas`}</AppText>
            <AppText variant="caption">{`${summary.below} estudante(s) abaixo do mínimo da escola (${formatPercent(minPercent)}) no período`}</AppText>
          </Card>
          <Button title="Exportar (CSV)" variant="secondary" onPress={() => void exportCsv()} style={{ marginVertical: 12 }} />
          <SectionTitle title="Por estudante" />
          <View style={{ borderRadius: 14, overflow: 'hidden' }}>
            {(q.data ?? []).map((r) => (
              <ListItem key={r.student_id} title={r.student_name}
                subtitle={`${r.total} aulas · ${r.absent} faltas · ${r.late} atrasos · ${r.justified} justificadas`}
                right={<Badge label={formatPercent(r.attendance_percent)} tone={r.attendance_percent === null ? 'neutral' : r.attendance_percent < minPercent ? 'danger' : 'success'} />} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

/**
 * Visão de frequência de um estudante (usada por professor, coordenação,
 * responsável e pelo próprio estudante). O servidor aplica as permissões.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { addDays, formatDateBR, monthLabel, todayIso } from '@/core/dates';
import { dashboardRepository } from '@/data/repositories/dashboardRepository';
import { managementRepository } from '@/data/repositories/managementRepository';
import { formatPercent, STATUS_LABEL } from '@/domain/attendance';
import { AttendanceCalendar } from '@/ui/components/attendance';
import { ChipSelect } from '@/ui/components/forms';
import { ListItem, MiniBarChart, StatTile, TileGrid } from '@/ui/components/layout';
import { AppText, Badge, Card, SectionTitle } from '@/ui/components/primitives';
import { CachedDataNotice, ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { spacing, statusColors } from '@/ui/theme';

type Period = '30' | '90' | 'year';

export function StudentAttendanceView({ studentId, schoolId, timezone, showEvents = false, compact = false }: {
  studentId: string; schoolId: string; timezone: string; showEvents?: boolean; compact?: boolean;
}) {
  const today = todayIso(timezone);
  const [period, setPeriod] = useState<Period>('90');
  const from = period === 'year' ? `${today.slice(0, 4)}-01-01` : addDays(today, -Number(period) + 1);
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));

  const summary = useQuery({
    queryKey: ['student-summary', studentId, from, today],
    queryFn: ({ signal }) => dashboardRepository.studentSummary(studentId, from, today, signal),
  });
  const monthFrom = `${month.y}-${String(month.m + 1).padStart(2, '0')}-01`;
  const monthTo = addDays(`${month.m === 11 ? month.y + 1 : month.y}-${String(month.m === 11 ? 1 : month.m + 2).padStart(2, '0')}-01`, -1);
  const events = useQuery({
    queryKey: ['calendar', schoolId, monthFrom, monthTo],
    queryFn: () => managementRepository.calendarEvents(schoolId, monthFrom, monthTo),
    enabled: showEvents,
  });
  const monthDays = useQuery({
    queryKey: ['student-summary', studentId, monthFrom, monthTo],
    queryFn: ({ signal }) => dashboardRepository.studentSummary(studentId, monthFrom, monthTo > today ? today : monthTo, signal),
    enabled: monthFrom <= today,
  });

  const chart = useMemo(() => (summary.data?.monthly ?? []).map((m) => ({ label: monthLabel(m.month), value: m.percent })), [summary.data]);

  if (summary.isPending) return <LoadingState />;
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  const s = summary.data;
  const belowMin = s.attendancePercent !== null && s.attendancePercent < s.minAttendancePercent;

  const shiftMonth = (delta: number) => setMonth(({ y, m }) => {
    const total = y * 12 + m + delta;
    return { y: Math.floor(total / 12), m: total % 12 };
  });

  return (
    <View style={{ gap: spacing.sm }}>
      <CachedDataNotice cachedAt={s.__fromCache} />
      <ChipSelect<Period> value={period} onChange={setPeriod} options={[
        { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }, { value: 'year', label: 'Ano letivo' },
      ]} />
      <TileGrid>
        <StatTile label="Frequência" value={formatPercent(s.attendancePercent)} tone={s.attendancePercent === null ? 'primary' : belowMin ? 'danger' : 'success'}
          hint={s.attendancePercent === null ? `Disponível após ${s.minRecordsForPercent} registros` : `Mínimo da escola: ${formatPercent(s.minAttendancePercent)}`} />
        <StatTile label="Presenças" value={String(s.present)} tone="success" />
        <StatTile label="Faltas" value={String(s.absent)} tone={s.absent > 0 ? 'danger' : 'primary'} />
        <StatTile label="Atrasos" value={String(s.late)} tone="warning" />
        <StatTile label="Faltas justificadas" value={String(s.justified)} />
        <StatTile label="Aulas registradas" value={String(s.total)} />
      </TileGrid>
      {belowMin ? <InlineMessage tone="warning" text="A frequência está abaixo do mínimo configurado pela escola no período." /> : null}

      {chart.length > 1 && !compact ? (
        <>
          <SectionTitle title="Evolução mensal" />
          <Card><MiniBarChart data={chart} threshold={s.minAttendancePercent} /></Card>
        </>
      ) : null}

      <SectionTitle title="Calendário" />
      <Card>
        <AttendanceCalendar
          year={month.y}
          month0={month.m}
          days={(monthDays.data?.days ?? []).map((d) => ({ date: d.date, status: d.status }))}
          events={(events.data ?? []).map((e) => ({ date: e.eventDate, title: e.title }))}
          onPrev={() => shiftMonth(-1)}
          onNext={monthFrom < today.slice(0, 8) + '01' || showEvents ? () => shiftMonth(1) : undefined}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
          {(['present', 'absent', 'late', 'justified'] as const).map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: statusColors[k].fg }} />
              <AppText variant="caption">{STATUS_LABEL[k]}</AppText>
            </View>
          ))}
        </View>
      </Card>
      {showEvents && (events.data?.length ?? 0) > 0 ? (
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {events.data!.map((e) => (
            <ListItem key={e.id} icon="calendar-outline" title={e.title} subtitle={`${formatDateBR(e.eventDate)}${e.description ? ` · ${e.description}` : ''}`} />
          ))}
        </View>
      ) : null}

      {!compact ? (
        <>
          <SectionTitle title="Registros recentes" />
          <View style={{ borderRadius: 14, overflow: 'hidden' }}>
            {s.days.slice(0, 15).map((d) => (
              <ListItem key={`${d.date}-${d.slot}`} title={formatDateBR(d.date)} subtitle={d.note ?? undefined}
                right={<Badge label={STATUS_LABEL[d.status]} tone={d.status === 'present' ? 'success' : d.status === 'absent' ? 'danger' : d.status === 'late' ? 'warning' : 'info'} />} />
            ))}
            {s.days.length === 0 ? <Card><AppText variant="caption">Nenhum registro no período.</AppText></Card> : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

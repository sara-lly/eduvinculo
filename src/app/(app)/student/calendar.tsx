import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { addDays, formatDateBR, todayIso } from '@/core/dates';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { AttendanceCalendar } from '@/ui/components/attendance';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Badge, Card, SectionTitle } from '@/ui/components/primitives';
import { ErrorState, LoadingState } from '@/ui/components/states';

const TYPE = { holiday: 'Feriado', exam: 'Avaliação', meeting: 'Reunião', event: 'Evento', other: 'Outro' } as const;

/** Calendário escolar (eventos publicados pela escola). */
export default function StudentCalendar() {
  const ctx = useSchoolContext();
  const today = todayIso(ctx.timezone);
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const from = `${month.y}-${String(month.m + 1).padStart(2, '0')}-01`;
  const to = addDays(`${month.m === 11 ? month.y + 1 : month.y}-${String(month.m === 11 ? 1 : month.m + 2).padStart(2, '0')}-01`, -1);
  const q = useQuery({ queryKey: ['calendar', ctx.schoolId, from, to], queryFn: () => managementRepository.calendarEvents(ctx.schoolId, from, to) });
  const shift = (d: number) => setMonth(({ y, m }) => ({ y: Math.floor((y * 12 + m + d) / 12), m: (y * 12 + m + d) % 12 }));

  return (
    <Screen>
      <Card>
        <AttendanceCalendar year={month.y} month0={month.m} days={[]}
          events={(q.data ?? []).map((e) => ({ date: e.eventDate, title: e.title }))}
          onPrev={() => shift(-1)} onNext={() => shift(1)} />
      </Card>
      <SectionTitle title="Eventos do mês" />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {q.data.map((e) => (
            <ListItem key={e.id} icon="calendar-outline" title={e.title}
              subtitle={`${formatDateBR(e.eventDate)}${e.description ? ` · ${e.description}` : ''}`}
              right={<Badge label={TYPE[e.eventType]} tone={e.eventType === 'holiday' ? 'success' : e.eventType === 'exam' ? 'warning' : 'primary'} />} />
          ))}
          {q.data.length === 0 ? <Card><AppText variant="caption">Nenhum evento neste mês.</AppText></Card> : null}
        </View>
      )}
    </Screen>
  );
}

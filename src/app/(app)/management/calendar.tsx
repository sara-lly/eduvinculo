import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { addDays, formatDateBR, todayIso } from '@/core/dates';
import { toAppError } from '@/core/errors';
import { managementRepository } from '@/data/repositories/managementRepository';
import type { CalendarEvent } from '@/domain/types';
import { brDateToIso } from '@/domain/validation';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { ChipSelect, TextField } from '@/ui/components/forms';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Button, Card, SectionTitle } from '@/ui/components/primitives';
import { LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';

export default function ManageCalendar() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const qc = useQueryClient();
  const today = todayIso(ctx.timezone);
  const q = useQuery({ queryKey: ['calendar', ctx.schoolId, today, addDays(today, 120)], queryFn: () => managementRepository.calendarEvents(ctx.schoolId, today, addDays(today, 120)) });
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CalendarEvent['eventType']>('event');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const iso = brDateToIso(date);
    if (title.trim().length < 3 || !iso) {
      toast.error('Informe título e data válida (DD/MM/AAAA).');
      return;
    }
    setSaving(true);
    try {
      await managementRepository.createCalendarEvent(ctx.schoolId, { title: title.trim(), description, eventDate: iso, eventType: type }, userId);
      toast.success('Evento adicionado.');
      setTitle(''); setDate(''); setDescription('');
      void qc.invalidateQueries({ queryKey: ['calendar'] });
    } catch (e) {
      toast.error(toAppError(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <TextField label="Título" value={title} onChangeText={setTitle} maxLength={120} />
      <TextField label="Data (DD/MM/AAAA)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} />
      <TextField label="Descrição (opcional)" value={description} onChangeText={setDescription} />
      <ChipSelect label="Tipo" value={type} onChange={setType} options={[
        { value: 'event', label: 'Evento' }, { value: 'exam', label: 'Avaliação' }, { value: 'meeting', label: 'Reunião' },
        { value: 'holiday', label: 'Feriado' }, { value: 'other', label: 'Outro' },
      ]} />
      <Button title="Adicionar ao calendário" onPress={() => void save()} loading={saving} />
      <SectionTitle title="Próximos 120 dias" />
      {q.isPending ? <LoadingState /> : (
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {(q.data ?? []).map((e) => <ListItem key={e.id} icon="calendar-outline" title={e.title} subtitle={formatDateBR(e.eventDate)} />)}
          {q.data?.length === 0 ? <Card><AppText variant="caption">Nenhum evento.</AppText></Card> : null}
        </View>
      )}
    </Screen>
  );
}

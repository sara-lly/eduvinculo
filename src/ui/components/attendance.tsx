/** Componentes de frequência: linha de estudante na chamada, calendário, seletor de data. */
import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { addDays, formatDateBR, formatLongDateBR, MONTHS, monthGrid, todayIso, WEEKDAYS_SHORT, type IsoDate } from '@/core/dates';
import { STATUS_LABEL, STATUS_ORDER, STATUS_SHORT } from '@/domain/attendance';
import type { AttendanceStatus } from '@/domain/types';
import { colors, MIN_TOUCH, radius, spacing, statusColors } from '../theme';
import { AppText } from './primitives';

export const ATTENDANCE_ROW_HEIGHT = 76;

interface AttendanceRowProps {
  studentId: string;
  name: string;
  registrationCode: string;
  index: number;
  status: AttendanceStatus | undefined;
  disabled?: boolean;
  onChange: (studentId: string, status: AttendanceStatus) => void;
}

/**
 * Linha da chamada. Memoizada com comparação por valor: ao marcar um estudante,
 * somente a linha dele re-renderiza (e não as outras 499 numa turma grande).
 * `onChange` é estável (useCallback no pai) e recebe o id — sem closures por linha.
 */
export const AttendanceRow = memo(function AttendanceRow({ studentId, name, registrationCode, index, status, disabled, onChange }: AttendanceRowProps) {
  return (
    <View style={styles.row} accessibilityLabel={`${index + 1}. ${name}. ${status ? STATUS_LABEL[status] : 'Sem registro'}`}>
      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <AppText variant="label" numberOfLines={1}>{`${index + 1}. ${name}`}</AppText>
        <AppText variant="caption" numberOfLines={1}>Matrícula {registrationCode}</AppText>
      </View>
      <View style={styles.statusGroup} accessibilityRole="radiogroup">
        {STATUS_ORDER.map((s) => {
          const selected = s === status;
          const c = statusColors[s];
          return (
            <Pressable
              key={s}
              disabled={disabled}
              onPress={() => onChange(studentId, s)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${STATUS_LABEL[s]} para ${name}`}
              hitSlop={4}
              style={[styles.statusButton, { borderColor: c.fg }, selected && { backgroundColor: c.fg }]}
            >
              <AppText style={{ color: selected ? '#fff' : c.fg, fontWeight: '800', fontSize: 15 }}>{STATUS_SHORT[s]}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

export function StatusLegend() {
  return (
    <View style={styles.legend}>
      {STATUS_ORDER.map((s) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={[styles.legendDot, { backgroundColor: statusColors[s].fg }]} />
          <AppText variant="caption">{`${STATUS_SHORT[s]} = ${STATUS_LABEL[s]}`}</AppText>
        </View>
      ))}
    </View>
  );
}

export function DateStepper({ value, onChange, maxDate = todayIso(), minDate }: {
  value: IsoDate; onChange: (d: IsoDate) => void; maxDate?: IsoDate; minDate?: IsoDate;
}) {
  const canNext = value < maxDate;
  const canPrev = !minDate || value > minDate;
  return (
    <View style={styles.stepper}>
      <Pressable disabled={!canPrev} onPress={() => onChange(addDays(value, -1))} accessibilityRole="button"
        accessibilityLabel="Dia anterior" style={[styles.stepBtn, !canPrev && { opacity: 0.3 }]}>
        <Ionicons name="chevron-back" size={22} color={colors.primary} />
      </Pressable>
      <View style={{ alignItems: 'center', flex: 1 }} accessible accessibilityLabel={`Data da aula: ${formatLongDateBR(value)}`}>
        <AppText variant="label">{formatDateBR(value)}</AppText>
        <AppText variant="caption">{formatLongDateBR(value)}{value === todayIso() ? ' (hoje)' : ''}</AppText>
      </View>
      <Pressable disabled={!canNext} onPress={() => onChange(addDays(value, 1))} accessibilityRole="button"
        accessibilityLabel="Próximo dia" style={[styles.stepBtn, !canNext && { opacity: 0.3 }]}>
        <Ionicons name="chevron-forward" size={22} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** Calendário mensal de frequência. Cada dia mostra o "pior" status do dia. */
export function AttendanceCalendar({ year, month0, days, events, onPrev, onNext }: {
  year: number; month0: number;
  days: { date: IsoDate; status: AttendanceStatus }[];
  events?: { date: IsoDate; title: string }[];
  onPrev?: () => void; onNext?: () => void;
}) {
  const byDate = useMemo(() => {
    const rank: Record<AttendanceStatus, number> = { present: 0, justified: 1, late: 2, absent: 3 };
    const m = new Map<string, AttendanceStatus>();
    for (const d of days) {
      const prev = m.get(d.date);
      if (!prev || rank[d.status] > rank[prev]) m.set(d.date, d.status);
    }
    return m;
  }, [days]);
  const eventDates = useMemo(() => new Set((events ?? []).map((e) => e.date)), [events]);
  const cells = useMemo(() => monthGrid(year, month0), [year, month0]);

  return (
    <View>
      <View style={styles.calHeader}>
        {onPrev ? <Pressable onPress={onPrev} accessibilityLabel="Mês anterior" accessibilityRole="button" style={styles.stepBtn}><Ionicons name="chevron-back" size={20} color={colors.primary} /></Pressable> : <View style={styles.stepBtn} />}
        <AppText variant="subtitle" style={{ textTransform: 'capitalize' }}>{`${MONTHS[month0]} de ${year}`}</AppText>
        {onNext ? <Pressable onPress={onNext} accessibilityLabel="Próximo mês" accessibilityRole="button" style={styles.stepBtn}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></Pressable> : <View style={styles.stepBtn} />}
      </View>
      <View style={styles.calRow}>
        {WEEKDAYS_SHORT.map((w) => <AppText key={w} style={styles.calWeekday}>{w}</AppText>)}
      </View>
      <View style={styles.calGrid}>
        {cells.map((iso, i) => {
          const status = iso ? byDate.get(iso) : undefined;
          const c = status ? statusColors[status] : null;
          return (
            <View key={iso ?? `e${i}`} style={styles.calCell}
              accessible={!!iso}
              accessibilityLabel={iso ? `${formatDateBR(iso)}: ${status ? STATUS_LABEL[status] : 'sem registro'}${eventDates.has(iso) ? ', com evento' : ''}` : undefined}>
              {iso ? (
                <View style={[styles.calDay, c && { backgroundColor: c.bg, borderColor: c.fg }]}>
                  <AppText style={{ fontSize: 13, color: c ? c.fg : colors.text, fontWeight: c ? '700' : '400' }}>{Number(iso.slice(8))}</AppText>
                  {eventDates.has(iso) ? <View style={styles.eventDot} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ATTENDANCE_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  statusGroup: { flexDirection: 'row', gap: 6 },
  statusButton: {
    width: MIN_TOUCH - 4, height: MIN_TOUCH - 4, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingVertical: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.xs,
  },
  stepBtn: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  calRow: { flexDirection: 'row' },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  calDay: { flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  eventDot: { position: 'absolute', bottom: 3, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
});

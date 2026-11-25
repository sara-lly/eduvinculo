/** Estrutura de telas, itens de lista e indicadores visuais. */
import { Ionicons } from '@expo/vector-icons';
import { memo, type ComponentProps, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, MIN_TOUCH, radius, shadow, spacing } from '../theme';
import { AppText } from './primitives';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true, style, edges = ['bottom'] }: {
  children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; padded?: boolean;
  style?: StyleProp<ViewStyle>; edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.padded, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.padded, style]}>{children}</View>
  );
  return <SafeAreaView edges={edges} style={styles.screen}>{content}</SafeAreaView>;
}

export const ListItem = memo(function ListItem({ title, subtitle, icon, right, onPress, accessibilityLabel }: {
  title: string; subtitle?: string; icon?: IconName; right?: ReactNode; onPress?: () => void; accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.item, pressed && onPress ? { backgroundColor: '#EEF3FA' } : null]}
    >
      {icon ? (
        <View style={styles.itemIcon}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={2}>{title}</AppText>
        {subtitle ? <AppText variant="caption" numberOfLines={3}>{subtitle}</AppText> : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.disabled} /> : null}
    </Pressable>
  );
});

export function StatTile({ label, value, hint, tone = 'primary', icon }: {
  label: string; value: string; hint?: string; tone?: 'primary' | 'success' | 'warning' | 'danger'; icon?: IconName;
}) {
  const fg = { primary: colors.primary, success: colors.success, warning: colors.warning, danger: colors.danger }[tone];
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
        <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>{label}</AppText>
      </View>
      <AppText style={{ fontSize: 28, fontFamily: fonts.brand, color: fg, marginTop: 4 }}>{value}</AppText>
      {hint ? <AppText variant="caption" numberOfLines={2}>{hint}</AppText> : null}
    </View>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function ProgressBar({ value, max = 100, tone = colors.primary, label }: { value: number; max?: number; tone?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: tone }]} />
      </View>
    </View>
  );
}

/** Gráfico de barras simples com Views (sem bibliotecas pesadas de gráficos). */
export function MiniBarChart({ data, max = 100, height = 110, threshold }: {
  data: { label: string; value: number }[]; max?: number; height?: number; threshold?: number;
}) {
  if (data.length === 0) return null;
  return (
    <View accessible accessibilityLabel={`Gráfico: ${data.map((d) => `${d.label} ${d.value.toFixed(0)}%`).join(', ')}`}>
      <View style={[styles.chart, { height }]}>
        {threshold !== undefined ? (
          <View style={[styles.threshold, { bottom: (threshold / max) * height }]} />
        ) : null}
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={styles.barSlot}>
            <View style={[styles.bar, {
              height: Math.max(2, (Math.min(d.value, max) / max) * height),
              backgroundColor: threshold !== undefined && d.value < threshold ? colors.warning : colors.accent,
            }]} />
          </View>
        ))}
      </View>
      <View style={styles.chartLabels}>
        {data.map((d, i) => (
          <AppText key={`${d.label}-l-${i}`} style={styles.chartLabel} numberOfLines={1}>
            {data.length > 8 && i % Math.ceil(data.length / 6) !== 0 ? '' : d.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

export function HeaderButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} style={styles.headerButton}>
      <Ionicons name={icon} size={22} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  padded: { padding: spacing.lg, paddingBottom: spacing.xxl },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface, minHeight: MIN_TOUCH + 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  itemIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tile: {
    flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, ...shadow,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, borderBottomWidth: 1, borderBottomColor: colors.border },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  threshold: { position: 'absolute', left: 0, right: 0, height: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.danger },
  chartLabels: { flexDirection: 'row', gap: 3, marginTop: 4 },
  chartLabel: { flex: 1, fontSize: 10, color: colors.textMuted, textAlign: 'center', fontFamily: fonts.regular },
  headerButton: { padding: 6, minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});

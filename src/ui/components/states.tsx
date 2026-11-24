/** Estados de carregamento, vazio, erro e indicadores de conexão/sincronização. */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { formatRelativeBR } from '@/core/dates';
import { AppError } from '@/core/errors';
import { colors, radius, spacing } from '../theme';
import { AppText, Button } from './primitives';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="caption" style={{ marginTop: spacing.md }}>{label}</AppText>
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, message, action }: {
  icon?: IconName; title: string; message?: string; action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={colors.disabled} />
      <AppText variant="subtitle" style={styles.centerText}>{title}</AppText>
      {message ? <AppText variant="caption" style={styles.centerText}>{message}</AppText> : null}
      {action ? <Button title={action.label} onPress={action.onPress} style={{ marginTop: spacing.lg }} variant="secondary" /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof AppError ? error.message : error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
  const offline = error instanceof AppError && error.kind === 'network';
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={44} color={offline ? colors.warning : colors.danger} />
      <AppText variant="subtitle" style={styles.centerText}>{offline ? 'Sem conexão' : 'Não foi possível carregar'}</AppText>
      <AppText variant="caption" style={styles.centerText}>{message}</AppText>
      {onRetry ? <Button title="Tentar novamente" onPress={onRetry} variant="secondary" style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

export function InlineMessage({ tone, text, icon }: { tone: 'info' | 'success' | 'warning' | 'danger'; text: string; icon?: IconName }) {
  const map = {
    info: { bg: colors.infoBg, fg: colors.info, icon: 'information-circle-outline' as IconName },
    success: { bg: colors.successBg, fg: colors.success, icon: 'checkmark-circle-outline' as IconName },
    warning: { bg: colors.warningBg, fg: colors.warning, icon: 'warning-outline' as IconName },
    danger: { bg: colors.dangerBg, fg: colors.danger, icon: 'alert-circle-outline' as IconName },
  }[tone];
  return (
    <View style={[styles.inline, { backgroundColor: map.bg }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Ionicons name={icon ?? map.icon} size={18} color={map.fg} />
      <AppText style={{ color: map.fg, flex: 1, fontSize: 14 }}>{text}</AppText>
    </View>
  );
}

/** Aviso de dados exibidos a partir do cache (offline). */
export function CachedDataNotice({ cachedAt }: { cachedAt?: number | null }) {
  if (!cachedAt) return null;
  return <InlineMessage tone="warning" icon="cloud-offline-outline" text={`Sem conexão — exibindo dados salvos ${formatRelativeBR(new Date(cachedAt).toISOString())}.`} />;
}

export function SyncPill({ pending, running, offline, onPress }: { pending: number; running: boolean; offline: boolean; onPress?: () => void }) {
  let label = 'Sincronizado';
  let icon: IconName = 'cloud-done-outline';
  let fg: string = colors.success;
  let bg: string = colors.successBg;
  if (running) {
    label = 'Sincronizando…';
    icon = 'sync-outline';
    fg = colors.info;
    bg = colors.infoBg;
  } else if (pending > 0) {
    label = offline ? `${pending} pendente(s) — offline` : `${pending} pendente(s)`;
    icon = 'cloud-upload-outline';
    fg = colors.warning;
    bg = colors.warningBg;
  } else if (offline) {
    label = 'Offline';
    icon = 'cloud-offline-outline';
    fg = colors.textMuted;
    bg = '#EEF2F7';
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Estado da sincronização: ${label}`}
      style={[styles.pill, { backgroundColor: bg }]}
    >
      <Ionicons name={icon} size={15} color={fg} />
      <AppText style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, minHeight: 220 },
  centerText: { textAlign: 'center', marginTop: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
});

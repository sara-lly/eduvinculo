/**
 * Componentes da tela inicial (todos os perfis):
 *  - ProfileCard: cartão de boas-vindas com avatar, papel, escola, data e sincronização;
 *  - QuickActions: atalhos grandes para as tarefas mais comuns;
 *  - SectionCard: seção agrupada num cartão, com ícone, contador, "ver todos" e
 *    limite de itens visíveis (expande/recolhe).
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatLongDateBR, todayIso } from '@/core/dates';
import { ROLE_LABEL } from '@/domain/roles';
import { useSessionStore } from '@/features/auth/sessionStore';
import { useIsOnline, useSyncStatus } from '@/features/sync/hooks';
import { AppText, Badge } from '@/ui/components/primitives';
import { colors, fonts, MIN_TOUCH, radius, shadow, spacing } from '@/ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => !/^(de|da|do|dos|das|e)$/i.test(p));
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Cartão de perfil no topo da tela inicial. */
export function ProfileCard({ subtitle }: { subtitle?: string }) {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile);
  const ctx = useSessionStore((s) => s.activeContext);
  const online = useIsOnline();
  const { pending, running } = useSyncStatus();
  const fullName = profile?.fullName?.trim() || 'Usuário';
  const firstName = fullName.split(' ')[0];
  const role = ctx?.kind === 'school' ? ROLE_LABEL[ctx.role] : 'Administração';
  const school = ctx?.kind === 'school' ? ctx.schoolName : 'Plataforma Presença+';
  const timezone = ctx?.kind === 'school' ? ctx.timezone : undefined;

  const sync = running
    ? { icon: 'sync-outline' as IconName, text: 'Sincronizando…' }
    : pending > 0
      ? { icon: 'cloud-upload-outline' as IconName, text: `${pending} pendente(s)${online ? '' : ' · offline'}` }
      : online
        ? { icon: 'cloud-done-outline' as IconName, text: 'Tudo sincronizado' }
        : { icon: 'cloud-offline-outline' as IconName, text: 'Sem conexão' };

  return (
    <View style={styles.profile} accessible accessibilityLabel={`${greeting()}, ${firstName}. ${role}, ${school}. ${sync.text}`}>
      <View style={styles.profileTop}>
        <Pressable onPress={() => router.push('/settings/profile')} accessibilityRole="button" accessibilityLabel="Abrir perfil"
          style={styles.avatar}>
          <AppText style={styles.avatarText}>{initials(fullName)}</AppText>
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText style={styles.hello}>{`${greeting()},`}</AppText>
          <AppText style={styles.name} numberOfLines={1}>{firstName}</AppText>
        </View>
        <Pressable onPress={() => router.push('/sync-queue')} accessibilityRole="button" accessibilityLabel={`Sincronização: ${sync.text}`}
          style={styles.syncChip} hitSlop={6}>
          <Ionicons name={sync.icon} size={16} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.tags}>
        <View style={styles.tag}>
          <Ionicons name="person-circle-outline" size={14} color="#DCE8FF" />
          <AppText style={styles.tagText}>{role}</AppText>
        </View>
        <View style={[styles.tag, { flexShrink: 1 }]}>
          <Ionicons name="school-outline" size={14} color="#DCE8FF" />
          <AppText style={styles.tagText} numberOfLines={1}>{school}</AppText>
        </View>
      </View>

      <View style={styles.profileBottom}>
        <AppText style={styles.date}>{formatLongDateBR(todayIso(timezone))}</AppText>
        <AppText style={styles.sync}>{sync.text}</AppText>
      </View>
      {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
    </View>
  );
}

export interface QuickAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
}

/** Atalhos grandes (até 4 por linha). */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.actions}>
      {actions.map((a) => (
        <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button"
          accessibilityLabel={a.badge ? `${a.label}, ${a.badge}` : a.label}
          style={({ pressed }) => [styles.action, pressed && { transform: [{ scale: 0.97 }] }]}>
          <View style={styles.actionIcon}>
            <Ionicons name={a.icon} size={22} color={colors.primary} />
            {a.badge ? (
              <View style={styles.actionBadge}><AppText style={styles.actionBadgeText}>{a.badge > 99 ? '99+' : a.badge}</AppText></View>
            ) : null}
          </View>
          <AppText style={styles.actionLabel} numberOfLines={2}>{a.label}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Seção em cartão. Mostra até `maxVisible` itens; o restante aparece ao tocar
 * em "Mostrar mais" (evita telas longas e renderizações desnecessárias).
 */
export function SectionCard({ title, icon, count, tone = 'primary', action, empty, maxVisible = 3, children }: {
  title: string;
  icon: IconName;
  count?: number;
  tone?: 'primary' | 'warning' | 'danger' | 'success';
  action?: { label: string; onPress: () => void };
  empty?: string;
  maxVisible?: number;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const visible = expanded ? items : items.slice(0, maxVisible);
  const hidden = items.length - visible.length;
  const iconColor = { primary: colors.primary, warning: colors.warning, danger: colors.danger, success: colors.success }[tone];
  const iconBg = { primary: colors.primaryLight, warning: colors.warningBg, danger: colors.dangerBg, success: colors.successBg }[tone];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <AppText variant="subtitle" style={{ flex: 1 }} accessibilityRole="header">{title}</AppText>
        {count !== undefined ? <Badge label={String(count)} tone={count > 0 && tone !== 'primary' ? (tone === 'success' ? 'success' : tone) : 'neutral'} /> : null}
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={action.label}>
            <AppText style={styles.sectionAction}>{action.label}</AppText>
          </Pressable>
        ) : null}
      </View>
      {items.length === 0 ? (
        <AppText variant="caption" style={styles.sectionEmpty}>{empty ?? 'Nada por aqui.'}</AppText>
      ) : (
        <View>
          {visible.map((child, i) => (
            <View key={i} style={i > 0 ? styles.divider : undefined}>{child}</View>
          ))}
        </View>
      )}
      {items.length > maxVisible ? (
        <Pressable onPress={() => setExpanded((e) => !e)} style={styles.more} accessibilityRole="button">
          <AppText style={styles.sectionAction}>{expanded ? 'Mostrar menos' : `Mostrar mais ${hidden}`}</AppText>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Linha compacta usada dentro do SectionCard. */
export function SectionRow({ title, subtitle, leading, right, onPress }: {
  title: string; subtitle?: string; leading?: ReactNode; right?: ReactNode; onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: colors.primarySoft } : null]}>
      {leading}
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={1}>{title}</AppText>
        {subtitle ? <AppText variant="caption" numberOfLines={2}>{subtitle}</AppText> : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.disabled} /> : null}
    </Pressable>
  );
}

/** Selo de data (dia/mês) para listas de aulas e eventos. */
export function DateBadge({ iso, highlight = false }: { iso: string; highlight?: boolean }) {
  const [, m, d] = iso.split('-');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return (
    <View style={[styles.dateBadge, highlight && { backgroundColor: colors.primary }]}>
      <AppText style={[styles.dateDay, highlight && { color: '#fff' }]}>{d}</AppText>
      <AppText style={[styles.dateMonth, highlight && { color: '#DCE8FF' }]}>{months[Number(m) - 1]}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  profile: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow,
    shadowOpacity: 0.2,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#7CF0A6',
  },
  avatarText: { fontFamily: fonts.brand, fontSize: 22, color: colors.primary },
  hello: { color: '#DCE8FF', fontSize: 14, fontFamily: fonts.semibold },
  name: { color: '#fff', fontSize: 26, fontFamily: fonts.brand },
  syncChip: {
    width: MIN_TOUCH - 4, height: MIN_TOUCH - 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  tags: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '100%',
  },
  tagText: { color: '#fff', fontSize: 13, fontFamily: fonts.semibold },
  profileBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)', paddingTop: spacing.sm,
  },
  date: { color: '#DCE8FF', fontSize: 13, fontFamily: fonts.semibold, textTransform: 'capitalize' },
  sync: { color: '#DCE8FF', fontSize: 12, fontFamily: fonts.regular },
  subtitle: { color: '#fff', fontSize: 14, fontFamily: fonts.regular },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  action: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: 6,
    alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, ...shadow, minHeight: 88,
  },
  actionIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  actionBadge: {
    position: 'absolute', top: -6, right: -8, backgroundColor: colors.danger, borderRadius: radius.pill,
    minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  actionBadgeText: { color: '#fff', fontSize: 10, fontFamily: fonts.extrabold },
  actionLabel: { fontSize: 12, fontFamily: fonts.bold, color: colors.text, textAlign: 'center' },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', ...shadow,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  sectionIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionAction: { color: colors.primary, fontSize: 13, fontFamily: fonts.bold },
  sectionEmpty: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: MIN_TOUCH + 8 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  dateBadge: { width: 46, height: 50, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontFamily: fonts.brand, fontSize: 18, color: colors.primary, lineHeight: 20 },
  dateMonth: { fontFamily: fonts.bold, fontSize: 11, color: colors.primary, textTransform: 'uppercase' },
});

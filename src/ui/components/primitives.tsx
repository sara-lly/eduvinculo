/** Componentes básicos reutilizáveis (texto, botão, cartão, badge). */
import { memo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, fontForWeight, MIN_TOUCH, radius, shadow, spacing, typography } from '../theme';

type Variant = keyof typeof typography;

/**
 * Texto do app. Se o estilo pedir um peso (fontWeight) e não definir família,
 * escolhe o arquivo da Nunito correspondente (necessário no Android).
 */
export function AppText({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const weightFamily = flat.fontWeight && !flat.fontFamily ? { fontFamily: fontForWeight(flat.fontWeight), fontWeight: 'normal' as const } : null;
  return <Text {...rest} style={[typography[variant], style, weightFamily]} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

const buttonPalette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.textOnPrimary, border: colors.primary },
  secondary: { bg: colors.primarySoft, fg: colors.primary, border: colors.primaryLight },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.danger, fg: colors.textOnPrimary, border: colors.danger },
  success: { bg: colors.success, fg: colors.textOnPrimary, border: colors.success },
};

export const Button = memo(function Button({ title, variant = 'primary', loading, disabled, icon, style, compact, ...rest }: ButtonProps) {
  const p = buttonPalette[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={title}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: p.bg, borderColor: p.border, opacity: isDisabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'primary' && !isDisabled ? shadow : null,
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : icon}
      <Text style={[styles.buttonText, compact && { fontSize: 14 }, { color: p.fg }]}>{title}</Text>
    </Pressable>
  );
});

export function Card({ children, style, onPress, accessibilityLabel }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.primarySoft }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary' }) {
  const map = {
    neutral: { bg: '#EEF2F7', fg: colors.textMuted },
    success: { bg: colors.successBg, fg: colors.success },
    warning: { bg: colors.warningBg, fg: colors.warning },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    info: { bg: colors.infoBg, fg: colors.info },
    primary: { bg: colors.primaryLight, fg: colors.primary },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

export function Row({ children, style, gap = spacing.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm }} />;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <AppText variant="subtitle" accessibilityRole="header">{title}</AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH + 6,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonCompact: { minHeight: MIN_TOUCH - 4, paddingHorizontal: spacing.md },
  buttonText: { fontSize: 16, fontFamily: fonts.bold },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow,
  },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontFamily: fonts.bold },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
});

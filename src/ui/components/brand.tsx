import { StyleSheet, Text, View } from 'react-native';
import { config } from '@/core/config';
import { colors, fonts, radius, spacing } from '../theme';
import { AppText } from './primitives';

/** Nome da marca em Fredoka, com o "+" em verde. */
export function BrandName({ size = 34, light = false }: { size?: number; light?: boolean }) {
  const base = config.appName.replace(/\+$/, '');
  return (
    <Text accessibilityRole="header" accessibilityLabel={config.appName}
      style={[styles.name, { fontSize: size, color: light ? '#fff' : colors.primary }]}>
      {base}
      <Text style={{ color: colors.brandPlus }}>+</Text>
    </Text>
  );
}

/** Selo da marca: "P+" arredondado (sem depender de imagem). */
export function BrandMark({ size = 72 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.32 }]} accessible={false}>
      <Text style={[styles.markText, { fontSize: size * 0.46 }]}>
        P<Text style={{ color: '#7CF0A6' }}>+</Text>
      </Text>
    </View>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <BrandMark size={compact ? 56 : 76} />
      <View style={{ height: spacing.md }} />
      <BrandName size={compact ? 28 : 36} />
      <AppText style={styles.slogan}>{config.slogan}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: fonts.brand, letterSpacing: 0.3 },
  mark: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  markText: { fontFamily: fonts.brand, color: '#fff', includeFontPadding: false },
  slogan: { fontSize: 15, color: colors.textMuted, marginTop: 4, textAlign: 'center', borderRadius: radius.md },
});

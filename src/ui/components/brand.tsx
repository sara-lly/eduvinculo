import { Image, StyleSheet, View } from 'react-native';
import { config } from '@/core/config';
import { colors, spacing } from '../theme';
import { AppText } from './primitives';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Image
        source={require('../../../assets/icon.png')}
        style={[styles.logo, compact && { width: 56, height: 56 }]}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <AppText style={[styles.title, compact && { fontSize: 24 }]} accessibilityRole="header">
        {config.appName}
      </AppText>
      <AppText style={styles.slogan}>{config.slogan}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 88, height: 88, borderRadius: 20, marginBottom: spacing.md },
  title: { fontSize: 30, fontWeight: '800', color: colors.primary },
  slogan: { fontSize: 15, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
});

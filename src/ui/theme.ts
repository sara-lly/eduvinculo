/**
 * Identidade visual do Presença+.
 * Azul-escuro (marca), azul-claro (apoio), verde (estados positivos).
 * Contrastes verificados para texto sobre fundo claro (WCAG AA).
 *
 * Tipografia: Fredoka (marca e títulos — arredondada e acolhedora) e
 * Nunito (textos — arredondada e muito legível).
 */
import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  primary: '#0B3D91', // azul-escuro
  primaryDark: '#082B66',
  primaryLight: '#E8F0FF', // azul-claro (fundos)
  primarySoft: '#F2F6FF',
  accent: '#3B82F6', // azul-claro (destaques)
  brandPlus: '#16A34A', // verde do "+" da marca
  success: '#15803D',
  successBg: '#DCFCE7',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  info: '#1D4ED8',
  infoBg: '#DBEAFE',
  background: '#F4F7FC',
  surface: '#FFFFFF',
  border: '#E2E8F2',
  text: '#0F172A',
  textMuted: '#526079',
  textOnPrimary: '#FFFFFF',
  disabled: '#94A3B8',
} as const;

export const statusColors = {
  present: { fg: colors.success, bg: colors.successBg },
  absent: { fg: colors.danger, bg: colors.dangerBg },
  late: { fg: colors.warning, bg: colors.warningBg },
  justified: { fg: colors.info, bg: colors.infoBg },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 } as const;

/** Famílias carregadas em src/app/_layout.tsx. */
export const fonts = {
  brand: 'Fredoka_600SemiBold',
  brandMedium: 'Fredoka_500Medium',
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

/**
 * No Android, fontes customizadas não "engordam" com fontWeight: é preciso
 * escolher o arquivo do peso. Esta função converte fontWeight em família.
 */
export function fontForWeight(weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '500':
    case '600':
    case 'semibold':
      return fonts.semibold;
    case '700':
    case 'bold':
      return fonts.bold;
    case '800':
    case '900':
      return fonts.extrabold;
    default:
      return fonts.regular;
  }
}

export const typography = {
  title: { fontSize: 24, fontFamily: fonts.brand, color: colors.text, letterSpacing: 0.2 },
  subtitle: { fontSize: 18, fontFamily: fonts.brandMedium, color: colors.text },
  body: { fontSize: 15, fontFamily: fonts.regular, color: colors.text },
  caption: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted },
  label: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
} satisfies Record<string, TextStyle>;

/** Sombra suave e consistente (iOS + Android). */
export const shadow: ViewStyle = {
  shadowColor: '#0B3D91',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

/** Área mínima de toque recomendada (acessibilidade). */
export const MIN_TOUCH = 44;

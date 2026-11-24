/**
 * Identidade visual do EduVínculo.
 * Azul-escuro (marca), azul-claro (apoio), verde (estados positivos).
 * Contrastes verificados para texto sobre fundo claro (WCAG AA).
 */
export const colors = {
  primary: '#0B3D91', // azul-escuro
  primaryDark: '#082B66',
  primaryLight: '#E3EEFF', // azul-claro (fundos)
  accent: '#3B82F6', // azul-claro (destaques)
  success: '#15803D',
  successBg: '#DCFCE7',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  info: '#1D4ED8',
  infoBg: '#DBEAFE',
  background: '#F5F8FC',
  surface: '#FFFFFF',
  border: '#D6DEEA',
  text: '#0F172A',
  textMuted: '#475569',
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
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const typography = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  subtitle: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
};

/** Área mínima de toque recomendada (acessibilidade). */
export const MIN_TOUCH = 44;

// src/theme/index.js — 전체 디자인 토큰

export const Colors = {
  // 주요 색상
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  primarySurface: '#EFF6FF',

  // 보조 색상
  secondary: '#7C3AED',
  secondarySurface: '#F5F3FF',

  // 시맨틱
  success: '#059669',
  successSurface: '#ECFDF5',
  warning: '#D97706',
  warningSurface: '#FFFBEB',
  error: '#DC2626',
  errorSurface: '#FEF2F2',

  // 텍스트
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textDisabled: '#94A3B8',
  textInverse: '#FFFFFF',

  // 서피스
  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E2E8F0',
  divider: '#F1F5F9',

  // 장비 상태
  statusAvailable: '#059669',
  statusRented: '#1E40AF',
  statusOverdue: '#DC2626',
  statusMaintenance: '#D97706',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const Shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const Typography = {
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: '#0F172A' },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: '#0F172A' },
  h3: { fontSize: 18, fontWeight: '600', color: '#0F172A' },
  h4: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  body: { fontSize: 15, fontWeight: '400', color: '#0F172A' },
  bodySmall: { fontSize: 13, fontWeight: '400', color: '#475569' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, color: '#475569' },
  caption: { fontSize: 11, fontWeight: '400', color: '#94A3B8' },
};

/**
 * Paleta para el código que no puede leer variables CSS (estilos de mapa, canvas del escáner,
 * meta theme-color). Espeja los tokens de src/app/globals.css: si cambia uno, cambia el otro.
 */
export const PALETTE = {
  forest900: '#1b3527',
  forest700: '#2a5239',
  forest600: '#3a6b4a',
  forest500: '#3f7f55',
  olive500: '#858f52',
  sage300: '#c5d4b6',
  cream50: '#faf8f2',
  stone100: '#efede7',
  stone400: '#aaa59a',
  stone600: '#5f5b53',
  white: '#ffffff',
  ochre500: '#cf9a2a',
  clay500: '#b4443a',
  slate500: '#6f8a82',
} as const;

/** Roles de color para mapas y gráficos. */
export const COLORS = {
  primary: PALETTE.forest700,
  secondary: PALETTE.forest600,
  inverse: PALETTE.forest900,
  success: PALETTE.forest500,
  warning: PALETTE.ochre500,
  danger: PALETTE.clay500,
  info: PALETTE.slate500,
  muted: PALETTE.stone400,
  textSecondary: PALETTE.stone600,
  mapBackground: PALETTE.stone100,
  markerRing: PALETTE.white,
} as const;

/** Colores del overlay del escáner (sobre video): alto contraste, misma familia de estados. */
export const SCANNER_OVERLAY = {
  confirmed: '#5fc483',
  tentative: '#e2b54a',
  rejected: '#e0705f',
  line: 'rgba(255,255,255,0.9)',
} as const;

/**
 * Resolve a CSS custom property to its computed value.
 * Handles nested var() references (e.g., --eeg-text → --base01 → #586e75).
 */
export function resolveCssVar(name: string): string {
  const styles = getComputedStyle(document.documentElement);
  const value = styles.getPropertyValue(name).trim();
  if (value.startsWith('var(')) {
    const inner = value.slice(4, -1).trim();
    return styles.getPropertyValue(inner).trim();
  }
  return value;
}

/**
 * Get the current theme's color tokens for chart rendering.
 * Safe to call at render time; reads live CSS custom properties.
 */
export function getChartThemeColors() {
  const text = resolveCssVar('--color-eeg-text') || '#586e75';
  const textMuted = resolveCssVar('--color-eeg-text-muted') || '#657b83';
  const border = resolveCssVar('--color-eeg-border') || '#93a1a1';
  const surface = resolveCssVar('--color-eeg-surface') || '#eee8d5';
  const background = resolveCssVar('--color-eeg-bg') || '#fdf6e3';
  const textDark = resolveCssVar('--color-base02') || '#073642';
  const theme = document.documentElement.dataset.theme || 'solarized-light';
  const gridAlpha = theme === 'one-dark' ? 0.35 : 0.2;
  return {
    text,
    textMuted,
    border,
    surface,
    background,
    textDark,
    gridLine: hexToRgba(border, gridAlpha),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

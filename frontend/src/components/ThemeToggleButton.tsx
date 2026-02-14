import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { cn } from '../utils/cn';

type ThemeId = 'solarized-light' | 'minimal-light' | 'one-dark';

const THEME_ORDER: ThemeId[] = ['solarized-light', 'minimal-light', 'one-dark'];

const THEME_LABELS: Record<ThemeId, string> = {
  'solarized-light': 'Solarized Light',
  'minimal-light': 'Minimal Light',
  'one-dark': 'One Dark',
};

function getStoredTheme(): ThemeId {
  const stored = localStorage.getItem('eeg-theme');
  if (stored === 'minimal-light' || stored === 'one-dark' || stored === 'solarized-light') {
    return stored;
  }
  return 'solarized-light';
}

export function ThemeToggleButton({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeId>(getStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('eeg-theme', theme);
    window.dispatchEvent(new Event('eeg-theme-change'));
  }, [theme]);

  const handleToggle = () => {
    const index = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(index + 1) % THEME_ORDER.length]);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        'h-8 w-8 rounded-md flex items-center justify-center',
        'text-eeg-text-muted hover:text-eeg-text',
        'hover:bg-eeg-hover transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eeg-active focus-visible:ring-offset-2 focus-visible:ring-offset-eeg-bg',
        className
      )}
      title={`主题：${THEME_LABELS[theme]}`}
      aria-label="切换主题"
    >
      <Palette size={16} />
    </button>
  );
}

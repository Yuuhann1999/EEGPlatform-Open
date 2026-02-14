import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';

export function MainLayout() {
  useEffect(() => {
    const storedTheme = localStorage.getItem('eeg-theme');
    document.documentElement.dataset.theme = storedTheme || 'solarized-light';
  }, []);

  return (
    <div className="flex h-screen bg-eeg-bg overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

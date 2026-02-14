import { NavLink } from 'react-router-dom';
import { Brain, FolderOpen, LineChart } from 'lucide-react';
import { cn } from '../../utils/cn';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/', icon: <FolderOpen size={22} />, label: '预处理' },
  { to: '/visualization', icon: <LineChart size={22} />, label: '可视化' },
  // 批处理功能尚未完成，暂时隐藏
  // { to: '/batch', icon: <Layers size={22} />, label: '批处理' },
  // 导出功能尚未完成，暂时隐藏
  // { to: '/export', icon: <Download size={22} />, label: '导出' },
];

export function Sidebar() {
  return (
    <aside className="w-[72px] h-screen bg-eeg-sidebar border-r border-eeg-border flex flex-col">
      {/* Logo区域 */}
      <div className="h-16 flex items-center justify-center border-b border-eeg-border">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-eeg-active to-eeg-accent flex items-center justify-center shadow-sm">
          <Brain size={20} className="text-white" />
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center py-3 px-2 rounded-lg',
                    'transition-all duration-200 group',
                    isActive
                      ? 'bg-eeg-active/20 text-eeg-accent'
                      : 'text-eeg-text-muted hover:bg-eeg-hover hover:text-eeg-text'
                  )
                }
              >
                <span className="mb-1">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

    </aside>
  );
}

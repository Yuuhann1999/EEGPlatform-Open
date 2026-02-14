import { Tag } from 'lucide-react';
import type { EventTrigger } from '../../types/eeg';

interface EventsPanelProps {
  events: EventTrigger[];
}

export function EventsPanel({ events }: EventsPanelProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-4 text-eeg-text-muted text-sm">
        未检测到事件标记
      </div>
    );
  }

  const totalEvents = events.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="space-y-3">
      {/* 统计摘要 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-eeg-text-muted">事件类型</span>
        <span className="text-eeg-text">{events.length} 种 / 共 {totalEvents} 个</span>
      </div>

      {/* 事件列表 */}
      <div className="space-y-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-center justify-between p-2 bg-eeg-surface rounded-lg border border-eeg-border hover:bg-eeg-hover transition-colors"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: event.color || 'var(--color-eeg-active)' }}
              />
              <span className="text-sm text-eeg-text font-mono">
                {event.label || `Event ${event.id}`}
              </span>
              <span className="text-xs text-eeg-text-muted">
                (ID: {event.id})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-eeg-accent font-medium">
                {event.count}
              </span>
              <span className="text-xs text-eeg-text-muted">次</span>
            </div>
          </div>
        ))}
      </div>

      {/* 提示 */}
      <div className="text-xs text-eeg-text-muted flex items-center gap-1.5 pt-2 border-t border-eeg-border">
        <Tag size={12} />
        <span>可在预处理页面编辑事件标签</span>
      </div>
    </div>
  );
}

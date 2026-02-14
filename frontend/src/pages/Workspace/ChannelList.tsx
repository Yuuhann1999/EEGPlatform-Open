import { cn } from '../../utils/cn';
import type { ChannelInfo } from '../../types/eeg';

interface ChannelListProps {
  channels: ChannelInfo[];
  onToggleBad?: (channelName: string) => void;
}

export function ChannelList({ channels, onToggleBad }: ChannelListProps) {
  const eegChannels = channels.filter(ch => ch.type === 'EEG');
  const otherChannels = channels.filter(ch => ch.type !== 'EEG');

  return (
    <div className="space-y-4">
      {/* EEG 通道 */}
      <div>
        <h4 className="text-sm font-medium text-eeg-text-muted mb-2">
          EEG 通道 ({eegChannels.length})
        </h4>
        <div className="grid grid-cols-4 gap-1.5">
          {eegChannels.map((channel) => (
            <button
              key={channel.name}
              onClick={() => onToggleBad?.(channel.name)}
              className={cn(
                'px-2 py-1 text-xs rounded border transition-colors',
                channel.isBad
                  ? 'bg-eeg-error/10 border-eeg-error/30 text-eeg-error line-through'
                  : 'bg-eeg-surface border-eeg-border text-eeg-text hover:bg-eeg-hover'
              )}
            >
              {channel.name}
            </button>
          ))}
        </div>
      </div>

      {/* 其他通道 */}
      {otherChannels.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-eeg-text-muted mb-2">
            其他通道 ({otherChannels.length})
          </h4>
          <div className="grid grid-cols-4 gap-1.5">
            {otherChannels.map((channel) => (
              <div
                key={channel.name}
                className="px-2 py-1 text-xs rounded border border-eeg-border bg-eeg-surface text-eeg-text-muted"
              >
                {channel.name} ({channel.type})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

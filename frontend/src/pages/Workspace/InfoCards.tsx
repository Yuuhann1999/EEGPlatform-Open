import { User, Clock, Activity, AlertCircle } from 'lucide-react';
import { Card } from '../../components/ui';
import { formatDuration, formatSampleRate } from '../../utils/format';
import type { EEGDataInfo } from '../../types/eeg';

interface InfoCardsProps {
  data: EEGDataInfo;
}

export function InfoCards({ data }: InfoCardsProps) {
  const cards = [
    {
      icon: <User size={20} className="text-eeg-accent" />,
      label: '受试者ID',
      value: data.subjectId,
    },
    {
      icon: <Activity size={20} className="text-cyan-400" />,
      label: '采样率',
      value: formatSampleRate(data.sampleRate),
    },
    {
      icon: <Clock size={20} className="text-emerald-400" />,
      label: '时长',
      value: formatDuration(data.duration),
    },
    {
      icon: <AlertCircle size={20} className="text-eeg-error" />,
      label: '坏道数',
      value: data.badChannels.length.toString(),
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <Card key={index} className="flex items-center gap-3">
          <div className="p-2 bg-eeg-bg rounded-lg">
            {card.icon}
          </div>
          <div>
            <p className="text-xs text-eeg-text-muted">{card.label}</p>
            <p className="text-lg font-semibold text-eeg-text">{card.value}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}


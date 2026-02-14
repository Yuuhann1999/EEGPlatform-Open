import { useEffect, useRef } from 'react';
import { Alert } from '../../components/ui';
import type { ChannelInfo } from '../../types/eeg';
import { getElectrodePositions } from '../../mock/eegData';

interface MontagePreviewProps {
  channels: ChannelInfo[];
  selectedChannels?: string[];
  onSelectChannel?: (channelName: string) => void;
  hasMontage?: boolean;
}

// Solarized Light color palette
const COLORS = {
  base01: '#586e75',
  base00: '#657b83',
  base1: '#93a1a1',
  base2: '#eee8d5',
  base3: '#fdf6e3',
  red: '#dc322f',
  blue: '#268bd2',
  cyan: '#2aa198',
};

export function MontagePreview({ 
  channels, 
  selectedChannels = [], 
  onSelectChannel: _onSelectChannel,
  hasMontage = false
}: MontagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const electrodePositions = getElectrodePositions();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 30;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 如果没有定位信息，不绘制详细内容
    if (!hasMontage) return;

    // 绘制头部轮廓 - Solarized Light
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.base1;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制鼻子（顶部标记）
    ctx.beginPath();
    ctx.moveTo(centerX - 15, centerY - radius + 5);
    ctx.lineTo(centerX, centerY - radius - 15);
    ctx.lineTo(centerX + 15, centerY - radius + 5);
    ctx.strokeStyle = COLORS.base1;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制耳朵
    // 左耳
    ctx.beginPath();
    ctx.ellipse(centerX - radius - 5, centerY, 8, 20, 0, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.base1;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 右耳
    ctx.beginPath();
    ctx.ellipse(centerX + radius + 5, centerY, 8, 20, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 绘制电极点
    const eegChannels = channels.filter(ch => ch.type === 'EEG');
    
    eegChannels.forEach(channel => {
      const pos = electrodePositions[channel.name];
      if (!pos) return;

      const x = centerX + (pos.x - 0.5) * radius * 2 * 0.85;
      const y = centerY + (pos.y - 0.5) * radius * 2 * 0.85;

      // 电极圆点 - Solarized colors
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      
      if (channel.isBad) {
        ctx.fillStyle = COLORS.red;
        ctx.strokeStyle = COLORS.red;
      } else if (selectedChannels.includes(channel.name)) {
        ctx.fillStyle = COLORS.blue;
        ctx.strokeStyle = COLORS.cyan;
      } else {
        ctx.fillStyle = COLORS.base01; // Dark fill for contrast on light bg
        ctx.strokeStyle = COLORS.cyan;
      }
      
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();

      // 电极标签 - Solarized text
      ctx.font = '9px Inter, sans-serif';
      ctx.fillStyle = channel.isBad ? COLORS.red : COLORS.base00;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(channel.name, x, y + 18);
    });

  }, [channels, selectedChannels, hasMontage]);

  if (!hasMontage) {
    return (
      <div className="relative bg-eeg-bg rounded-lg p-4 h-[340px] flex flex-col items-center justify-center text-center border border-eeg-border">
        <Alert
          variant="info"
          title="未加载电极定位信息"
          description="当前数据未包含电极坐标。请在预处理步骤中加载标准定位文件（如 Standard 10-20）或自定义定位。"
          className="max-w-[240px]"
        />
      </div>
    );
  }

  return (
    <div className="relative bg-eeg-bg rounded-lg p-4 border border-eeg-border">
      <h4 className="text-sm font-medium text-eeg-text-muted mb-3">电极拓扑图</h4>
      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={280}
          height={300}
          className="rounded"
        />
      </div>
      
      {/* 图例 */}
      <div className="flex justify-center gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.base01, border: `2px solid ${COLORS.cyan}` }} />
          <span className="text-eeg-text-muted">正常</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.red }} />
          <span className="text-eeg-text-muted">坏道</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.blue }} />
          <span className="text-eeg-text-muted">选中</span>
        </div>
      </div>
    </div>
  );
}

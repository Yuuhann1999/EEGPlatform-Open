import { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Ruler, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '../../components/ui';
import { useEEGStore } from '../../stores/eegStore';
import type { WaveformData } from '../../types/eeg';

interface WaveformViewerProps {
  data: WaveformData | null;
  preProcessingData?: WaveformData | null; // 处理前的波形数据（用于叠加对比）
  onBadChannelToggle?: (channelName: string) => void;
  showOverlay?: boolean;
  totalDuration?: number;
  onTimeRangeChange?: (start: number, end: number) => void;
}

// 预设的幅值比例
const SCALE_OPTIONS = [
  { value: 0.2, label: '500 µV' },
  { value: 0.5, label: '200 µV' },
  { value: 1, label: '100 µV' },
  { value: 2, label: '50 µV' },
  { value: 5, label: '20 µV' },
  { value: 10, label: '10 µV' },
];

// 显示时长选项
const DURATION_OPTIONS = [
  { value: 5, label: '5 秒' },
  { value: 10, label: '10 秒' },
  { value: 20, label: '20 秒' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '60 秒' },
];

export function WaveformViewer({ 
  data, 
  preProcessingData,
  onBadChannelToggle, 
  showOverlay = false,
  totalDuration = 300,
  onTimeRangeChange 
}: WaveformViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [displayDuration, setDisplayDuration] = useState(10);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouseX, setLastMouseX] = useState(0);
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  
  // 从store获取事件映射
  const { events: storeEvents } = useEEGStore();
  
  // 创建事件ID到label的映射
  const eventLabelMap = useCallback((eventId: number): string => {
    const storeEvent = storeEvents.find(e => e.id === eventId);
    return storeEvent?.label || `event_${eventId}`;
  }, [storeEvents]);

  // 固定每个通道的高度（不再动态压缩）
  const channelHeight = 40;
  const leftPadding = 60;
  const rightPadding = 20;
  const topPadding = 20;
  const bottomPadding = 30;

  // 检测是否是epoch模式
  const isEpochMode = data?.isEpoch || false;
  const nEpochs = data?.nEpochs || 0;
  
  // 在epoch模式下，currentTime表示epoch索引，displayDuration表示要显示的epoch数量
  const actualTotalDuration = isEpochMode ? nEpochs : (totalDuration || (data ? data.timeRange[1] : 300));

  useEffect(() => {
    const handleThemeChange = () => setThemeTick(t => t + 1);
    window.addEventListener('eeg-theme-change', handleThemeChange);
    return () => window.removeEventListener('eeg-theme-change', handleThemeChange);
  }, []);

  // 绘制波形
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resolveVar = (styles: CSSStyleDeclaration, name: string): string => {
      const value = styles.getPropertyValue(name).trim();
      if (value.startsWith('var(')) {
        const inner = value.slice(4, -1).trim();
        return styles.getPropertyValue(inner).trim();
      }
      return value;
    };

    const width = container.clientWidth;
    const numChannels = data.channels.length;
    
    // 固定每个通道的高度，计算总高度
    const dynamicChannelHeight = channelHeight;
    const totalHeight = topPadding + numChannels * dynamicChannelHeight + bottomPadding;
    
    // Canvas 高度根据通道数动态调整（按设备像素比提升清晰度）
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(totalHeight * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${totalHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const styles = getComputedStyle(document.documentElement);
    const colors = {
      bg: resolveVar(styles, '--color-eeg-bg'),
      surface: resolveVar(styles, '--color-eeg-surface'),
      border: resolveVar(styles, '--color-eeg-border'),
      text: resolveVar(styles, '--color-eeg-text'),
      textMuted: resolveVar(styles, '--color-eeg-text-muted'),
      active: resolveVar(styles, '--color-eeg-active'),
      accent: resolveVar(styles, '--color-eeg-accent'),
      success: resolveVar(styles, '--color-eeg-success'),
      warning: resolveVar(styles, '--color-eeg-warning'),
      error: resolveVar(styles, '--color-eeg-error'),
      processing: resolveVar(styles, '--color-eeg-processing'),
    };

    // 清空画布
    ctx.fillStyle = colors.bg || '#fdf6e3';
    ctx.fillRect(0, 0, width, totalHeight);

    const drawWidth = width - leftPadding - rightPadding;

    // 绘制时间轴（底部）
    ctx.strokeStyle = colors.border || '#93a1a1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftPadding, totalHeight - bottomPadding);
    ctx.lineTo(width - rightPadding, totalHeight - bottomPadding);
    ctx.stroke();

    // 时间刻度
    const timeRange = data.timeRange;
    const viewDuration = timeRange[1] - timeRange[0];
    
    ctx.font = '10px JetBrains Mono';
    ctx.fillStyle = colors.textMuted || '#586e75';
    ctx.textAlign = 'center';
    
    for (let i = 0; i <= 10; i++) {
      const x = leftPadding + (drawWidth * i) / 10;
      const time = timeRange[0] + (viewDuration * i) / 10;
      ctx.fillText(`${time.toFixed(1)}s`, x, totalHeight - 10);
      
      // 垂直网格线
      ctx.strokeStyle = colors.border || '#93a1a1';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, topPadding);
      ctx.lineTo(x, totalHeight - bottomPadding);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 绘制每个通道
    data.channels.forEach((channel, index) => {
      const y = topPadding + index * dynamicChannelHeight + dynamicChannelHeight / 2;
      
      // 通道背景 - Solarized hover
      if (hoveredChannel === channel.name) {
        ctx.fillStyle = colors.surface || '#eee8d5';
        ctx.fillRect(leftPadding, y - dynamicChannelHeight / 2 + 1, drawWidth, dynamicChannelHeight - 2);
      }

      // 通道名称
      ctx.font = '10px Inter';
      ctx.fillStyle = channel.isBad ? (colors.error || '#dc322f') : (colors.text || '#657b83');
      ctx.textAlign = 'right';
      ctx.fillText(channel.name, leftPadding - 8, y + 3);

      if (channel.isBad) {
        ctx.strokeStyle = colors.error || '#dc322f';
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = dynamicChannelHeight - 6;
        ctx.beginPath();
        ctx.moveTo(leftPadding, y);
        ctx.lineTo(width - rightPadding, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // 绘制波形（支持epoch模式，NaN作为分隔符）
      ctx.strokeStyle = channel.isBad ? (colors.error || '#dc322f') : (colors.active || '#268bd2');
      ctx.lineWidth = 1;
      
      const uVPerPixel = 100 / (dynamicChannelHeight / 2) / scale;
      const samplesPerPixel = Math.max(1, Math.floor(channel.data.length / drawWidth));
      
      let pathStarted = false;
      let lastX = 0;

      for (let px = 0; px < drawWidth; px++) {
        const sampleIndex = Math.floor(px * samplesPerPixel);
        if (sampleIndex >= channel.data.length) break;

        const value = channel.data[sampleIndex];
        
        // 检查是否是epoch分隔符（使用特殊标记值 -1e10）
        const SEPARATOR_VALUE = -1e10;
        if (value === SEPARATOR_VALUE || (isNaN(value) && value !== null && value !== undefined)) {
          // 如果之前有路径，先绘制
          if (pathStarted) {
            ctx.stroke();
            pathStarted = false;
          }
          
          // 绘制epoch分隔线
          const screenX = leftPadding + px;
          ctx.strokeStyle = colors.border || '#93a1a1';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(screenX, y - dynamicChannelHeight / 2);
          ctx.lineTo(screenX, y + dynamicChannelHeight / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // 恢复波形颜色
          ctx.strokeStyle = channel.isBad ? (colors.error || '#dc322f') : (colors.active || '#268bd2');
          continue;
        }
        
        // **关键改变：不再裁剪幅值，允许波形超出通道边界**
        const pixelOffset = value / uVPerPixel;
        // 移除 clamp，直接使用原始偏移
        const screenY = y - pixelOffset;
        const screenX = leftPadding + px;

        if (!pathStarted) {
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          pathStarted = true;
        } else {
          // 检查是否需要开始新路径（如果跳过了NaN）
          if (Math.abs(screenX - lastX) > samplesPerPixel * 2) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
          } else {
            ctx.lineTo(screenX, screenY);
          }
        }
        
        lastX = screenX;
      }
      
      // 绘制最后一段路径
      if (pathStarted) {
        ctx.stroke();
      }

      // 叠加处理前的波形
      if (showOverlay && preProcessingData) {
        const preChannel = preProcessingData.channels.find(ch => ch.name === channel.name);
        if (preChannel) {
          ctx.strokeStyle = colors.warning || '#cb4b16';
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1;
          ctx.beginPath();
          
          const preSamplesPerPixel = Math.max(1, Math.floor(preChannel.data.length / drawWidth));
          
          for (let px = 0; px < drawWidth; px++) {
            const sampleIndex = Math.floor(px * preSamplesPerPixel);
            if (sampleIndex >= preChannel.data.length) break;
             
            const value = preChannel.data[sampleIndex];
            const pixelOffset = value / uVPerPixel;
            // 同样不裁剪
            const screenY = y - pixelOffset;
            const screenX = leftPadding + px;

            if (px === 0) ctx.moveTo(screenX, screenY);
            else ctx.lineTo(screenX, screenY);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    });

    // 绘制事件标记
    if (data.events && data.events.length > 0) {
      data.events.forEach(event => {
        // 确保事件时间在显示范围内
        if (event.time < timeRange[0] || event.time > timeRange[1]) {
          return;
        }
        
        const eventX = leftPadding + ((event.time - timeRange[0]) / viewDuration) * drawWidth;
        if (eventX >= leftPadding && eventX <= width - rightPadding) {
          // 根据事件ID选择颜色
          const eventColors: Record<number, string> = {
            1: colors.success || '#859900',
            2: colors.active || '#268bd2',
            3: colors.warning || '#b58900',
            4: colors.error || '#dc322f',
          };
          const eventColor = eventColors[event.id] || colors.textMuted || '#586e75';
          
          ctx.strokeStyle = eventColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(eventX, topPadding);
          ctx.lineTo(eventX, totalHeight - bottomPadding);
          ctx.stroke();
          
          // 绘制事件标签 - 使用store中的映射
          ctx.fillStyle = eventColor;
          ctx.font = '9px Inter';
          ctx.textAlign = 'center';
          const label = eventLabelMap(event.id);
          ctx.fillText(label, eventX, topPadding - 5);
          
          // 在底部也显示事件标记
          ctx.fillRect(eventX - 1, totalHeight - bottomPadding, 2, 5);
        }
      });
    }

    // Scale Bar (右下角)
    const uV50Height = 50 / (100 / (dynamicChannelHeight / 2) / scale);
    ctx.strokeStyle = colors.text || '#657b83';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width - 40, totalHeight - bottomPadding - 10);
    ctx.lineTo(width - 40, totalHeight - bottomPadding - 10 - uV50Height);
    ctx.stroke();
    ctx.fillStyle = colors.textMuted || '#586e75';
    ctx.font = '9px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('50µV', width - 35, totalHeight - bottomPadding - 10 - uV50Height / 2 + 3);

  }, [data, preProcessingData, scale, showOverlay, hoveredChannel, eventLabelMap, themeTick]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // 处理滚轮 - 按 Ctrl 缩放幅值，否则允许正常滚动
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(prev => Math.max(0.1, Math.min(10, prev * delta)));
    }
    // 不按 Ctrl 时，允许正常滚动（不阻止默认行为）
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMouseX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!canvas || !data || !scrollContainer) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const channelIndex = Math.floor((y - topPadding) / channelHeight);
    
    if (channelIndex >= 0 && channelIndex < data.channels.length) {
      setHoveredChannel(data.channels[channelIndex].name);
    } else {
      setHoveredChannel(null);
    }

    if (isDragging) {
      const delta = (e.clientX - lastMouseX) / canvas.width;
      const timeShift = delta * displayDuration;
      const newTime = Math.max(0, Math.min(actualTotalDuration - displayDuration, currentTime - timeShift));
      setCurrentTime(newTime);
      setLastMouseX(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredChannel(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!data || !onBadChannelToggle) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < leftPadding) {
      const channelIndex = Math.floor((y - topPadding) / channelHeight);
      if (channelIndex >= 0 && channelIndex < data.channels.length) {
        onBadChannelToggle(data.channels[channelIndex].name);
      }
    }
  };

  // 时间跳转（在epoch模式下，time表示epoch索引）
  const jumpToTime = (time: number) => {
    const newTime = Math.max(0, Math.min(actualTotalDuration - displayDuration, time));
    setCurrentTime(newTime);
    if (onTimeRangeChange) {
      // 在epoch模式下，传递epoch索引；否则传递时间
      onTimeRangeChange(newTime, newTime + displayDuration);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    jumpToTime(newTime);
  };

  const handleDurationChange = (duration: number) => {
    // 在epoch模式下，限制duration为合理的epoch数量
    const maxDuration = isEpochMode ? Math.min(duration, 20) : duration;
    setDisplayDuration(maxDuration);
    if (onTimeRangeChange) {
      onTimeRangeChange(currentTime, currentTime + maxDuration);
    }
  };

  const skipForward = () => jumpToTime(currentTime + displayDuration);
  const skipBackward = () => jumpToTime(currentTime - displayDuration);

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-eeg-text-muted">
        <p>请先加载数据文件</p>
      </div>
    );
  }

  const maxSliderValue = Math.max(0.1, actualTotalDuration - displayDuration);
  const sliderPercent = (currentTime / maxSliderValue) * 100;

  return (
    <div className="h-full flex flex-col bg-eeg-bg rounded-lg overflow-hidden border border-eeg-border">
      {/* 工具栏 - 固定高度 */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-eeg-border bg-eeg-surface">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Ruler size={16} className="text-eeg-text-muted" />
            <select
              value={SCALE_OPTIONS.find(opt => Math.abs(opt.value - scale) < 0.1)?.value || scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-xs text-eeg-text"
            >
              {SCALE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="w-px h-4 bg-eeg-border" />

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.min(10, s * 1.2))}>
              <ZoomIn size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.max(0.1, s / 1.2))}>
              <ZoomOut size={16} />
            </Button>
          </div>
        </div>

        <select 
          className="bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-xs text-eeg-text"
          value={displayDuration}
          onChange={(e) => handleDurationChange(parseInt(e.target.value))}
        >
          {DURATION_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>显示 {opt.label}</option>
          ))}
        </select>
      </div>

      {/* 波形区域 - 占据剩余空间，可滚动 */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-eeg-border scrollbar-track-eeg-surface"
        onWheel={handleWheel}
      >
        <div 
          ref={containerRef}
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          <canvas ref={canvasRef} className="block w-full" />
        </div>
      </div>

      {/* 时间进度条 - 固定高度 */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-eeg-border bg-eeg-surface">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={skipBackward} title="后退">
              <SkipBack size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={skipForward} title="前进">
              <SkipForward size={14} />
            </Button>
          </div>

          <div className="text-xs text-eeg-text font-mono min-w-[70px]">
            {isEpochMode ? (
              <>Epoch {Math.round(currentTime)} / {nEpochs}</>
            ) : (
              <>{formatTime(currentTime)} / {formatTime(actualTotalDuration)}</>
            )}
          </div>

          <div className="flex-1 relative h-5 flex items-center">
            <input
              type="range"
              min={0}
              max={maxSliderValue}
              step={isEpochMode ? 1 : 0.1}
              value={currentTime}
              onChange={handleSliderChange}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer slider-solarized"
              style={{
                background: `linear-gradient(to right, var(--color-eeg-active) ${sliderPercent}%, var(--color-eeg-surface) ${sliderPercent}%)`
              }}
            />
          </div>

          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={actualTotalDuration}
              step={1}
              value={Math.round(currentTime)}
              onChange={(e) => jumpToTime(parseFloat(e.target.value) || 0)}
              className="w-14 bg-eeg-bg border border-eeg-border rounded px-1.5 py-0.5 text-xs text-eeg-text text-center"
            />
            <span className="text-xs text-eeg-text-muted">{isEpochMode ? '#' : 's'}</span>
          </div>
        </div>
      </div>

      {/* 底部图例 - 固定高度 */}
      <div className="flex-shrink-0 h-7 px-4 border-t border-eeg-border bg-eeg-surface flex items-center gap-4 text-xs">
        {/* 波形图例 */}
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 rounded" style={{ backgroundColor: 'var(--color-eeg-active)' }} />
          <span className="text-eeg-text">当前</span>
        </div>
        {showOverlay && preProcessingData && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: 'var(--color-eeg-warning)' }} />
            <span className="text-eeg-text">处理前</span>
          </div>
        )}
        
        <div className="w-px h-4 bg-eeg-border" />
        
        {/* 事件图例 - 使用store中的映射 */}
        <span className="text-eeg-text-muted">事件:</span>
        {data.events && data.events.length > 0 ? (
          [...new Set(data.events.map(e => e.id))].map(id => (
            <div key={id} className="flex items-center gap-1">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: getEventColorVar(id) }}
              />
              <span className="text-eeg-text">{eventLabelMap(id)}</span>
            </div>
          ))
        ) : (
          <span className="text-eeg-text-muted">无</span>
        )}
      </div>

      <style>{`
        .slider-solarized::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--color-eeg-active);
          cursor: pointer;
          border: 2px solid var(--color-eeg-bg);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .slider-solarized::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--color-eeg-active);
          cursor: pointer;
          border: 2px solid var(--color-eeg-bg);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getEventColorVar(eventId: number): string {
  const colorMap: Record<number, string> = {
    1: 'var(--color-eeg-success)',
    2: 'var(--color-eeg-active)',
    3: 'var(--color-eeg-warning)',
    4: 'var(--color-eeg-error)',
  };
  return colorMap[eventId] || 'var(--color-eeg-text-muted)';
}

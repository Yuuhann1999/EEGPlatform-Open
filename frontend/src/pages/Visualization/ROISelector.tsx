import { useRef, useEffect, useState, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useEEGStore } from '../../stores/eegStore';
import { getElectrodePositions } from '../../mock/eegData';

interface ROISelectorProps {
  selectedChannels: string[];
  onSelectionChange: (channels: string[]) => void;
}

export function ROISelector({ selectedChannels, onSelectionChange }: ROISelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const didDragRef = useRef(false);
  const CANVAS_SIZE = 220;
  const { roiPresets, currentData } = useEEGStore();
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1); // 缩放级别：0.5, 1, 1.5, 2
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // 平移偏移
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const handleThemeChange = () => setThemeTick(t => t + 1);
    window.addEventListener('eeg-theme-change', handleThemeChange);
    return () => window.removeEventListener('eeg-theme-change', handleThemeChange);
  }, []);
  
  // 使用实际数据的通道位置，如果没有则使用默认位置
  const electrodePositions = useMemo(() => {
    if (currentData && currentData.channels && currentData.channels.length > 0) {
      const positions: Record<string, { x: number; y: number }> = {};
      currentData.channels.forEach(ch => {
        if (ch.position) {
          // 将3D位置转换为2D显示坐标（与Canvas静态地形图一致）
          // MNE坐标系统：x=左右，y=前后，z=上下
          const x3d = ch.position.x || 0;
          const y3d = ch.position.y || 0;
          const z3d = ch.position.z || 0;

          // 归一化到单位球面（与Canvas静态地形图一致）
          const r3d = Math.sqrt(x3d * x3d + y3d * y3d + z3d * z3d);
          if (r3d < 0.01) return; // 跳过无效位置

          const x_norm = x3d / r3d;
          const y_norm = y3d / r3d;
          const z_norm = z3d / r3d;

          // 只显示上半球和侧面电极（z > -0.5，允许看到A1/A2等耳部电极）
          if (z_norm < -0.5) return;

          // 映射到[0,1]范围（前额在上方）
          const normalizedX = 0.5 + x_norm * 0.5;
          const normalizedY = 0.5 - y_norm * 0.5; // y轴反转

          positions[ch.name] = { x: normalizedX, y: normalizedY };
        }
      });
      
      // 如果有位置信息的通道，使用它们；否则回退到默认位置
      if (Object.keys(positions).length > 0) {
        return positions;
      }
    }
    
    // 回退到默认位置
    return getElectrodePositions();
  }, [currentData]);

  // 根据实际数据通道过滤预设区域
  const availableChannels = useMemo(() => {
    if (!currentData || !currentData.channels) return [];
    return currentData.channels
      .filter(ch => ch.type === 'EEG' && !ch.isBad)
      .map(ch => ch.name);
  }, [currentData]);

  // 动态过滤预设区域，只保留实际存在的通道
  const filteredPresets = useMemo(() => {
    return roiPresets.map(preset => ({
      ...preset,
      channels: preset.channels.filter(ch => availableChannels.includes(ch))
    })).filter(preset => preset.channels.length > 0); // 只保留至少有一个通道的预设
  }, [roiPresets, availableChannels]);

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    if (presetId) {
      const preset = filteredPresets.find(p => p.id === presetId);
      if (preset) {
        onSelectionChange(preset.channels);
      }
    } else {
      onSelectionChange([]);
    }
  };

  const toggleChannel = (channelName: string) => {
    if (selectedChannels.includes(channelName)) {
      onSelectionChange(selectedChannels.filter(ch => ch !== channelName));
    } else {
      onSelectionChange([...selectedChannels, channelName]);
    }
    setSelectedPreset('');
  };

  const handleZoomIn = () => {
    setZoom(prev => {
      const next = Math.min(prev + 0.5, 3);
      setPan(p => clampPan(p, next));
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoom(prev => {
      const next = Math.max(prev - 0.5, 0.5);
      setPan(p => clampPan(p, next));
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const getCanvasSize = () => {
    return { width: CANVAS_SIZE, height: CANVAS_SIZE };
  };

  const clampPan = (p: { x: number; y: number }, z: number) => {
    const { width, height } = getCanvasSize();
    const radius = Math.min(width, height) / 2 - 25;
    const maxPan = Math.max(0, radius * (z - 1));
    return {
      x: Math.max(-maxPan, Math.min(maxPan, p.x)),
      y: Math.max(-maxPan, Math.min(maxPan, p.y)),
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = CANVAS_SIZE;
    const logicalHeight = CANVAS_SIZE;
    canvas.width = Math.floor(logicalWidth * dpr);
    canvas.height = Math.floor(logicalHeight * dpr);
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = logicalWidth;
    const height = logicalHeight;
    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;
    const radius = (Math.min(width, height) / 2 - 25) * zoom;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const resolveVar = (name: string): string => {
      const value = styles.getPropertyValue(name).trim();
      if (value.startsWith('var(')) {
        const inner = value.slice(4, -1).trim();
        return styles.getPropertyValue(inner).trim();
      }
      return value;
    };
    const colors = {
      border: resolveVar('--color-eeg-border'),
      surface: resolveVar('--color-eeg-surface'),
      text: resolveVar('--color-eeg-text'),
      textMuted: resolveVar('--color-eeg-text-muted'),
      active: resolveVar('--color-eeg-active'),
      accent: resolveVar('--color-eeg-accent'),
    };

    // 绘制头部轮廓
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = colors.border || '#93a1a1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制鼻子
    ctx.beginPath();
    ctx.moveTo(centerX - 10, centerY - radius + 3);
    ctx.lineTo(centerX, centerY - radius - 10);
    ctx.lineTo(centerX + 10, centerY - radius + 3);
    ctx.strokeStyle = colors.border || '#93a1a1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 获取实际数据中存在的通道名称（只显示EEG通道）
    const availableChannels = currentData?.channels
      .filter(ch => ch.type === 'EEG' && !ch.isBad)
      .map(ch => ch.name) || Object.keys(electrodePositions);
    
    // 绘制电极点（只显示实际数据中存在的通道）
    Object.entries(electrodePositions).forEach(([name, pos]) => {
      // 只显示实际数据中存在的通道
      if (!availableChannels.includes(name)) return;
      
      // 调整间距，使通道显示不那么拥挤
      const spacingFactor = 0.85; // 增大间距因子，使显示更宽松，避免重叠
      const x = centerX + (pos.x - 0.5) * radius * 2 * spacingFactor;
      const y = centerY + (pos.y - 0.5) * radius * 2 * spacingFactor;

      const isSelected = selectedChannels.includes(name);

      // 电极圆点
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      
      if (isSelected) {
        ctx.fillStyle = colors.active || '#268bd2';
        ctx.strokeStyle = colors.accent || '#2aa198';
      } else {
        ctx.fillStyle = colors.surface || '#eee8d5';
        ctx.strokeStyle = colors.textMuted || '#93a1a1';
      }
      
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();

      // 电极标签
      ctx.font = '9px Inter';
      ctx.fillStyle = isSelected ? (colors.active || '#268bd2') : (colors.text || '#657b83');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x, y);
    });
  }, [selectedChannels, electrodePositions, currentData, zoom, pan, themeTick]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 拖拽结束后的 click 事件直接忽略，避免误触发点选
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);

    const width = CANVAS_SIZE;
    const height = CANVAS_SIZE;
    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;
    // 与绘制逻辑保持一致
    const radius = (Math.min(width, height) / 2 - 25) * zoom;

    // 获取实际数据中存在的通道名称
    const availableChannels = currentData?.channels
      .filter(ch => ch.type === 'EEG' && !ch.isBad)
      .map(ch => ch.name) || Object.keys(electrodePositions);
    
    // 检查点击位置是否在某个电极上
    for (const [name, pos] of Object.entries(electrodePositions)) {
      // 只处理实际数据中存在的通道
      if (!availableChannels.includes(name)) continue;
      
      const spacingFactor = 0.85; // 与绘制时的间距因子保持一致
      const ex = centerX + (pos.x - 0.5) * radius * 2 * spacingFactor;
      const ey = centerY + (pos.y - 0.5) * radius * 2 * spacingFactor;
      
      const distance = Math.sqrt(Math.pow(x - ex, 2) + Math.pow(y - ey, 2));
      if (distance <= 12) {
        toggleChannel(name);
        break;
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    didDragRef.current = false;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current) return;
    const dragThreshold = 3;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    
    if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
    didDragRef.current = true;

    const newPan = { x: dragStateRef.current.panX + dx, y: dragStateRef.current.panY + dy };
    setPan(clampPan(newPan, zoom));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStateRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => {
      const next = Math.max(0.5, Math.min(3, prev + delta));
      setPan(p => clampPan(p, next));
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* 头部拓扑选择器 */}
      <div className="bg-eeg-bg rounded-lg p-3 relative overflow-hidden">
        {/* 缩放控制按钮 */}
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          <button
            onClick={handleZoomIn}
            className="p-1.5 bg-eeg-surface border border-eeg-border rounded hover:bg-eeg-hover transition-colors"
            title="放大"
          >
            <ZoomIn size={14} className="text-eeg-text" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 bg-eeg-surface border border-eeg-border rounded hover:bg-eeg-hover transition-colors"
            title="缩小"
          >
            <ZoomOut size={14} className="text-eeg-text" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 bg-eeg-surface border border-eeg-border rounded hover:bg-eeg-hover transition-colors"
            title="重置视图"
          >
            <Maximize2 size={14} className="text-eeg-text" />
          </button>
        </div>
        
        <div className="mx-auto w-[220px] h-[220px]">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className={`block w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
        </div>
        
        {/* 缩放提示 */}
        <div className="text-xs text-eeg-text-muted text-center mt-2">
          缩放: {(zoom * 100).toFixed(0)}% | 拖拽平移 | 滚轮缩放
        </div>
      </div>

      {/* 已选通道 */}
      <div className="text-sm">
        <span className="text-eeg-text-muted">已选通道: </span>
        <span className="text-eeg-accent">
          {selectedChannels.length > 0 
            ? `${selectedChannels.join(', ')} (共 ${selectedChannels.length} 个)`
            : '无'}
        </span>
      </div>

      {/* 预设选择 */}
      <div>
        <label className="block text-sm font-medium text-eeg-text-muted mb-1.5">
          预设区域
        </label>
        <select
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="w-full bg-eeg-bg border border-eeg-border rounded-md px-3 py-2 text-sm text-eeg-text"
        >
          <option value="">自定义选择</option>
          {filteredPresets.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({preset.channels.length}个)
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

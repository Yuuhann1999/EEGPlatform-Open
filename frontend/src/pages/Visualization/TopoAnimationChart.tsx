import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Alert } from '../../components/ui';
import { visualizationApi } from '../../services/api';
import type { TopoAnimationResponse } from '../../services/api';
// @ts-ignore - gifshot 没有类型定义
import gifshot from 'gifshot';

interface TopoAnimationChartProps {
  sessionId: string | null;
  startTime: number;
  endTime: number;
  frameInterval?: number;
  renderStyle?: 'canvas' | 'mne'; // 新增：渲染风格
  onRegisterExport?: (fn: () => void) => void;
}

export function TopoAnimationChart({
  sessionId,
  startTime,
  endTime,
  frameInterval = 20,
  renderStyle = 'canvas',  // 新增：渲染风格（canvas 或 mne）
  onRegisterExport
}: TopoAnimationChartProps) {
  // 根据 renderStyle 设置 renderMode
  const renderMode = renderStyle === 'mne' ? 'image' : 'data';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animation, setAnimation] = useState<TopoAnimationResponse | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // 获取动画数据
  useEffect(() => {
    if (!sessionId) {
      setAnimation(null);
      return;
    }

    const fetchAnimation = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await visualizationApi.getTopoAnimation(
          sessionId, startTime, endTime, frameInterval, renderMode
        );
        setAnimation(data);
        setCurrentFrame(0);
      } catch (err: any) {
        console.error('获取动画数据失败:', err);
        setError(err.message || '获取动画数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchAnimation();
  }, [sessionId, startTime, endTime, frameInterval, renderMode]);

  // 播放逻辑
  useEffect(() => {
    if (!isPlaying || !animation) return;

    // 根据 playbackSpeed 调整播放速度
    const actualInterval = animation.interval_ms / playbackSpeed;
    const timer = setInterval(() => {
      setCurrentFrame(prev => (prev >= animation.frame_count - 1) ? 0 : prev + 1);
    }, actualInterval);

    return () => clearInterval(timer);
  }, [isPlaying, animation, playbackSpeed]);

  // 绘制当前帧（仅 Canvas 风格）
  useEffect(() => {
    if (!animation || !canvasRef.current || animation.render_mode === 'image') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frame = animation.frames[currentFrame];
    if (frame.values) {
      drawTopoFrame(ctx, canvas, animation, frame.values);
    }
  }, [animation, currentFrame]);

  // GIF 导出状态
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // 生成 GIF 的函数
  const exportGif = useCallback(async () => {
    if (!animation || animation.frames.length === 0) return;
    
    setExportError(null);
    setExporting(true);
    setExportProgress(0);
    
    try {
      // 收集所有帧的图像
      const images: string[] = [];
      // 根据当前播放速度调整帧延迟：速度越快，延迟越短
      const frameDelay = (animation.interval_ms / playbackSpeed) / 10; // gifshot 使用 1/10 秒为单位
      
      if (animation.render_mode === 'image') {
        // MNE 风格：直接使用 base64 图像
        for (let i = 0; i < animation.frames.length; i++) {
          const frame = animation.frames[i];
          if (frame.image_base64) {
            images.push(`data:image/png;base64,${frame.image_base64}`);
          }
          setExportProgress((i + 1) / animation.frames.length * 50);
        }
      } else {
        // Canvas 风格：需要逐帧渲染到 canvas 并转换为图像
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 600;
        tempCanvas.height = 500;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) throw new Error('无法创建 Canvas 上下文');
        
        for (let i = 0; i < animation.frames.length; i++) {
          const frame = animation.frames[i];
          if (frame.values) {
            drawTopoFrame(ctx, tempCanvas, animation, frame.values);
            // 添加时间标签
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(tempCanvas.width - 80, tempCanvas.height - 30, 75, 25);
            ctx.fillStyle = 'white';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${frame.time_ms.toFixed(0)} ms`, tempCanvas.width - 10, tempCanvas.height - 12);
            images.push(tempCanvas.toDataURL('image/png'));
          }
          setExportProgress((i + 1) / animation.frames.length * 50);
        }
      }
      
      if (images.length === 0) {
        throw new Error('没有可导出的帧');
      }
      
      // 使用 gifshot 生成 GIF
      setExportProgress(60);
      
      gifshot.createGIF({
        images,
        gifWidth: 600,
        gifHeight: 500,
        interval: frameDelay / 100, // 转换为秒
        numFrames: images.length,
        frameDuration: 1,
        sampleInterval: 10,
        progressCallback: (progress: number) => {
          setExportProgress(60 + progress * 40);
        },
      }, (obj: { error: boolean; errorMsg?: string; image?: string }) => {
        setExporting(false);
        setExportProgress(0);
        
        if (obj.error) {
          console.error('GIF 生成失败:', obj.errorMsg);
          setExportError(`GIF 生成失败: ${obj.errorMsg || '未知错误'}`);
          return;
        }
        
        // 下载 GIF
        const a = document.createElement('a');
        a.href = obj.image!;
        a.download = `Topo-Animation-${animation.frames[0]?.time_ms.toFixed(0)}-${animation.frames[animation.frames.length - 1]?.time_ms.toFixed(0)}ms-${playbackSpeed}x.gif`;
        a.click();
      });
    } catch (err: any) {
      setExporting(false);
      setExportProgress(0);
      console.error('导出 GIF 失败:', err);
      setExportError(`导出 GIF 失败: ${err.message || '未知错误'}`);
    }
  }, [animation, playbackSpeed]);

  // 注册导出（导出 GIF）
  useEffect(() => {
    if (!onRegisterExport) return;
    onRegisterExport(exportGif);
  }, [onRegisterExport, exportGif]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="info" title="提示" description="请先在工作区加载数据文件" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-eeg-accent" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="error" title="获取数据失败" description={error} />
      </div>
    );
  }

  if (!animation || animation.frames.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="info" title="提示" description="无动画数据" />
      </div>
    );
  }

  const frame = animation.frames[currentFrame];

  return (
    <div className="h-full flex">
      {/* 左侧控制面板 */}
      <div className="w-72 border-r border-eeg-border bg-eeg-surface p-4 overflow-auto">
        <h3 className="text-sm font-semibold text-eeg-text mb-4">动画控制</h3>
        {exportError && (
          <div className="mb-4">
            <Alert variant="error" title="导出失败" description={exportError} />
          </div>
        )}

        {/* 播放/暂停 */}
        <div className="mb-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={'w-full py-2 px-4 rounded font-medium transition-colors ' +
              (isPlaying
                ? 'bg-eeg-accent text-white hover:bg-eeg-accent/90'
                : 'bg-eeg-border text-eeg-text hover:bg-eeg-border/80')
            }
          >
            {isPlaying ? '⏸ 暂停' : '▶ 播放'}
          </button>
        </div>

        {/* 进度条 */}
        <div className="mb-4">
          <label className="block text-xs text-eeg-text-muted mb-2">
            进度: {currentFrame + 1} / {animation.frame_count} 帧
          </label>
          <input
            type="range"
            min={0}
            max={animation.frame_count - 1}
            value={currentFrame}
            onChange={(e) => {
              setCurrentFrame(parseInt(e.target.value));
              setIsPlaying(false);
            }}
            className="w-full"
          />
        </div>

        {/* 播放速度 */}
        <div className="mb-4">
          <label className="block text-xs text-eeg-text-muted mb-2">
            播放速度: {playbackSpeed.toFixed(2)}x
          </label>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-eeg-text-muted mt-1">
            <span>0.25x</span>
            <span>1x</span>
            <span>4x</span>
          </div>
        </div>

        {/* 时间信息 */}
        <div className="p-3 bg-eeg-bg rounded border border-eeg-border">
          <div className="text-xs text-eeg-text-muted mb-1">当前时间点</div>
          <div className="text-lg font-semibold text-eeg-text">
            {frame.time_ms.toFixed(0)} ms
          </div>
        </div>

        {/* 统计信息 */}
        <div className="mt-4 text-xs text-eeg-text-muted space-y-1">
          <div>总时长: {animation.duration_ms.toFixed(0)} ms</div>
          <div>帧间隔: {animation.interval_ms.toFixed(0)} ms</div>
          <div>帧数: {animation.frame_count}</div>
        </div>

        {/* 导出进度 */}
        {exporting && (
          <div className="mt-4 p-3 bg-eeg-bg rounded border border-eeg-border">
            <div className="text-xs text-eeg-text-muted mb-2">正在生成 GIF...</div>
            <div className="w-full bg-eeg-border rounded-full h-2">
              <div
                className="bg-eeg-accent h-2 rounded-full transition-all"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <div className="text-xs text-eeg-text-muted mt-1 text-right">
              {exportProgress.toFixed(0)}%
            </div>
          </div>
        )}

      </div>

      {/* 右侧渲染区域 */}
      <div className="flex-1 flex flex-col items-center justify-center bg-eeg-bg p-6">
        {animation.render_mode === 'image' ? (
          // MNE 风格：显示图片帧（MNE已内置colorbar和时间显示）
          <div className="relative">
            {frame.image_base64 && (
              <img
                src={'data:image/png;base64,' + frame.image_base64}
                alt={`Frame ${currentFrame}`}
                className="border border-eeg-border rounded"
                style={{ maxWidth: '600px', maxHeight: '500px' }}
              />
            )}
            {/* MNE风格时间显示（在图片内右下角） */}
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {frame.time_ms.toFixed(0)} ms
            </div>
          </div>
        ) : (
          // Canvas 风格：显示 Canvas + 颜色条
          <div className="flex flex-col items-center">
            <div className="relative border border-eeg-border rounded bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                width={600}
                height={500}
              />
              {/* Canvas风格时间显示（画框内右下角） */}
              <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
                {frame.time_ms.toFixed(0)} ms
              </div>
            </div>
            {/* Canvas 风格的颜色条（画框外底部居中） */}
            {animation.render_mode === 'data' && frame.values && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs font-medium text-eeg-text">
                  {Math.min(...frame.values).toFixed(1)} µV
                </span>
                <div className="relative w-48 h-3 rounded border border-eeg-border overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(to right, #268bd2 0%, #93a1a1 25%, #fdf6e3 50%, #cb4b16 75%, #dc322f 100%)'
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-eeg-text">
                  {Math.max(...frame.values).toFixed(1)} µV
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Canvas 渲染单帧地形图（与静态地形图完全一致）
function drawTopoFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  animation: TopoAnimationResponse,
  values: number[]
) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;

  // 清空画布 - 使用Solarized背景色
  ctx.fillStyle = '#fdf6e3'; // base3
  ctx.fillRect(0, 0, width, height);

  // 计算颜色范围
  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const valueRange = valueMax - valueMin || 1;

  // 准备数据点
  const dataPoints: Array<{ x: number; y: number; value: number; name: string }> = [];

  // 确保 positions 和 channel_names 存在
  const positions = animation.positions ?? [];
  const channelNames = animation.channel_names ?? [];

  positions.forEach((pos, idx) => {
    const x3d = pos.x;
    const y3d = pos.y;
    const z3d = pos.z;

    // 归一化到单位球面
    const r3d = Math.sqrt(x3d * x3d + y3d * y3d + z3d * z3d);
    if (r3d < 0.01) return;

    const x_norm = x3d / r3d;
    const y_norm = y3d / r3d;
    const z_norm = z3d / r3d;

    // 只显示上半球的电极
    if (z_norm < -0.5) return; // 允许A1/A2等耳部电极显示

    // 映射到显示坐标
    const scaleFactor = radius * 0.95;
    const displayX = centerX + x_norm * scaleFactor;
    const displayY = centerY - y_norm * scaleFactor;

    dataPoints.push({
      x: displayX,
      y: displayY,
      value: values[idx],
      name: channelNames[idx] ?? `Ch${idx}`
    });
  });

  if (dataPoints.length === 0) {
    ctx.fillStyle = '#586e75'; // base01
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('缺少电极定位信息', centerX, centerY);
    return;
  }

  // Solarized配色方案 - RdBu_r (红-白-蓝)
  const getColor = (normalized: number): [number, number, number] => {
    if (normalized < 0.5) {
      // 蓝色到白色
      const t = normalized * 2;
      const r = Math.round(38 + (253 - 38) * t);
      const g = Math.round(139 + (246 - 139) * t);
      const b = Math.round(210 + (227 - 210) * t);
      return [r, g, b];
    } else {
      // 白色到红色
      const t = (normalized - 0.5) * 2;
      const r = Math.round(253 - (253 - 220) * t);
      const g = Math.round(246 - (246 - 50) * t);
      const b = Math.round(227 - (227 - 47) * t);
      return [r, g, b];
    }
  };

  // 使用双线性插值进行平滑渲染（高斯权重）
  const interpolate = (px: number, py: number): number => {
    let weightSum = 0;
    let valueSum = 0;

    for (const point of dataPoints) {
      const dist = Math.sqrt((px - point.x) ** 2 + (py - point.y) ** 2);
      // 使用高斯权重，更平滑的插值
      const sigma = radius * 0.3;
      const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      weightSum += weight;
      valueSum += point.value * weight;
    }

    return weightSum > 0 ? valueSum / weightSum : valueMin;
  };

  // 逐像素渲染热图（与静态地形图完全一致）
  const imageData = ctx.createImageData(width, height);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      const dx = px - centerX;
      const dy = py - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 只在头部圆形内绘制
      if (dist <= radius) {
        const value = interpolate(px, py);
        const normalized = Math.max(0, Math.min(1, (value - valueMin) / valueRange));
        const [r, g, b] = getColor(normalized);

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // 绘制等高线 (contour lines) - MNE/EEGLAB风格
  const contourLevels = 8;
  for (let i = 1; i < contourLevels; i++) {
    const level = valueMin + (valueRange * i / contourLevels);
    ctx.strokeStyle = 'rgba(88, 110, 117, 0.3)'; // base01 with transparency
    ctx.lineWidth = 0.5;

    // 简化的等高线绘制：在圆周上采样点
    const samples = 360;
    ctx.beginPath();
    let firstPoint = true;
    for (let angle = 0; angle <= 360; angle += 360 / samples) {
      const rad = (angle * Math.PI) / 180;
      for (let r = 0; r <= radius; r += 2) {
        const px = centerX + r * Math.cos(rad);
        const py = centerY + r * Math.sin(rad);
        const value = interpolate(px, py);

        if (Math.abs(value - level) < valueRange * 0.05) {
          if (firstPoint) {
            ctx.moveTo(px, py);
            firstPoint = false;
          } else {
            ctx.lineTo(px, py);
          }
          break;
        }
      }
    }
    ctx.stroke();
  }

  // 绘制头部轮廓 - 加粗线条
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#586e75'; // base01
  ctx.lineWidth = 2;
  ctx.stroke();

  // 绘制鼻子指示 - MNE风格
  ctx.beginPath();
  ctx.moveTo(centerX - 10, centerY - radius);
  ctx.lineTo(centerX, centerY - radius - 15);
  ctx.lineTo(centerX + 10, centerY - radius);
  ctx.strokeStyle = '#586e75'; // base01
  ctx.lineWidth = 2;
  ctx.stroke();

  // 绘制耳朵轮廓
  const earWidth = 12;
  const earHeight = 25;
  // 左耳
  ctx.beginPath();
  ctx.ellipse(centerX - radius, centerY, earWidth / 2, earHeight / 2, 0, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.stroke();
  // 右耳
  ctx.beginPath();
  ctx.ellipse(centerX + radius, centerY, earWidth / 2, earHeight / 2, 0, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();

  // 绘制电极点和标签 - 黑色小圆点
  dataPoints.forEach(point => {
    // 电极圆点 - 黑色实心点
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#073642'; // base02 (dark)
    ctx.fill();

    // 电极标签 - 小字体
    ctx.font = 'bold 8px Inter';
    ctx.fillStyle = '#073642'; // base02
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(point.name, point.x, point.y + 10);
  });
}

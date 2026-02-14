import { useEffect, useState, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Loader2 } from 'lucide-react';
import { Alert } from '../../components/ui';
import { visualizationApi } from '../../services/api';
import { useEEGStore } from '../../stores/eegStore';
import type { ERPData, PSDData, TopomapData, TFRJobResponse } from '../../services/api';

function resolveCssVar(name: string): string {
  const styles = getComputedStyle(document.documentElement);
  const value = styles.getPropertyValue(name).trim();
  if (value.startsWith('var(')) {
    const inner = value.slice(4, -1).trim();
    return styles.getPropertyValue(inner).trim();
  }
  return value;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getChartThemeColors() {
  const text = resolveCssVar('--color-eeg-text') || '#586e75';
  const textMuted = resolveCssVar('--color-eeg-text-muted') || '#657b83';
  const border = resolveCssVar('--color-eeg-border') || '#93a1a1';
  const surface = resolveCssVar('--color-eeg-surface') || '#eee8d5';
  const theme = document.documentElement.dataset.theme || 'solarized-light';
  const gridAlpha = theme === 'one-dark' ? 0.35 : 0.2;
  return {
    text,
    textMuted,
    border,
    surface,
    gridLine: hexToRgba(border, gridAlpha),
  };
}

// ============ ERP Chart ============

interface ERPChartProps {
  sessionId: string | null;
  channels: string[];
  displayMode: 'butterfly' | 'average';
  onRegisterExport?: (fn: () => void) => void;
}

export function ERPChart({ sessionId, channels, displayMode, onRegisterExport }: ERPChartProps) {
  const [erpData, setErpData] = useState<ERPData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const singleChartRef = useRef<any>(null);
  const multiChartRefs = useRef<Record<string, any>>({});
  const chartTheme = getChartThemeColors();

  // 从store获取事件映射
  const { events: storeEvents } = useEEGStore();

  // 创建从event_id到label的映射函数
  const getEventLabel = useMemo(() => {
    return (conditionName: string): string => {
      // conditionName格式类似 "event_1" 或 "event_2"
      const match = conditionName.match(/event_(\d+)/);
      if (match) {
        const eventId = parseInt(match[1]);
        const storeEvent = storeEvents.find(e => e.id === eventId);
        if (storeEvent?.label) {
          return storeEvent.label;
        }
      }
      return conditionName;
    };
  }, [storeEvents]);

  useEffect(() => {
    if (!sessionId || !channels || channels.length === 0) {
      setErpData(null);
      setError(null);
      return;
    }

    const fetchERPData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 确保channels是有效的字符串数组
        const validChannels = channels.filter(ch => typeof ch === 'string' && ch.length > 0);
        if (validChannels.length === 0) {
          setError('没有有效的通道可供选择');
          setErpData(null);
          return;
        }

        // 根据displayMode决定是否获取每个通道的数据
        const perChannel = displayMode === 'butterfly';
        const data = await visualizationApi.getERPData(sessionId, validChannels, undefined, perChannel);
        setErpData(data);
      } catch (err: any) {
        console.error('获取ERP数据失败:', err);
        const errorMessage = err?.message || err?.detail || '获取ERP数据失败';
        setError(errorMessage);
        setErpData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchERPData();
  }, [sessionId, channels?.join(','), displayMode]);

  // 注册导出：average 导出单张；butterfly 导出每个通道一张
  useEffect(() => {
    if (!onRegisterExport) return;
    onRegisterExport(() => {
      if (displayMode === 'butterfly') {
        const keys = Object.keys(multiChartRefs.current);
        keys.forEach((ch) => {
          const inst = multiChartRefs.current[ch]?.getEchartsInstance?.();
          if (!inst) return;
          const dataUrl = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fdf6e3' });
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `ERP-${ch}.png`;
          a.click();
        });
        return;
      }

      const inst = singleChartRef.current?.getEchartsInstance?.();
      if (!inst) return;
      const dataUrl = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: chartTheme.surface });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `ERP-average.png`;
      a.click();
    });
  }, [onRegisterExport, displayMode]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="info" title="提示" description="请先在工作区加载数据文件" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="warning" title="提示" description="请选择至少一个通道" />
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

  if (!erpData || !erpData.conditions || Object.keys(erpData.conditions).length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="warning" title="提示" description="无法获取 ERP 数据，请确保已创建 Epochs" />
      </div>
    );
  }

  // 准备图表数据
  const conditionNames = Object.keys(erpData.conditions);

  // 安全检查：确保times数组存在
  if (!erpData.times || erpData.times.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="error" title="数据异常" description="ERP 数据格式错误：缺少时间轴数据" />
      </div>
    );
  }

  // 找到0ms的位置索引（必须在series构建之前定义）
  // 由于xAxis使用category类型，需要使用数组索引而不是时间值
  const zeroTimeIndex = erpData.times.findIndex(t => t === 0) ??
    erpData.times.findIndex(t => Math.abs(t) < 0.5) ??
    erpData.times.findIndex(t => t >= 0) ??
    Math.max(0, erpData.times.findIndex(t => t >= 0));

  // 如果是butterfly模式且有channel_data，显示多个独立的图表
  if (displayMode === 'butterfly' && erpData.channel_data && Object.keys(erpData.channel_data).length > 0) {
    // 获取所有通道名称（从第一个事件的数据中）
    const firstEventName = Object.keys(erpData.channel_data)[0];
    const channelNames = Object.keys(erpData.channel_data[firstEventName]);

    // 计算布局：根据通道数量动态调整
    const nChannels = channelNames.length;
    let cols = 2; // 默认2列
    if (nChannels <= 2) cols = 1;
    else if (nChannels <= 4) cols = 2;
    else if (nChannels <= 6) cols = 3;
    else cols = 3; // 最多3列

    return (
      <div className="h-full overflow-auto p-4">
        <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {channelNames.map((channelName) => {
            const colors = ['#859900', '#268bd2', '#dc322f', '#6c71c4', '#cb4b16']; // Solarized Accents
            const series: any[] = [];
            const legendData: string[] = [];

            conditionNames.forEach((conditionName, idx) => {
              const condition = erpData.channel_data![conditionName][channelName];
              const color = colors[idx % colors.length];
              const displayLabel = getEventLabel(conditionName);

              legendData.push(displayLabel);

              // 主线
              const mainSeries: any = {
                name: displayLabel,
                type: 'line',
                data: condition.data,
                smooth: true,
                lineStyle: { color, width: 2 },
                itemStyle: { color },
                symbol: 'none',
              };

              // 只在第一个series中添加0ms处的虚线标记
              if (conditionName === conditionNames[0] && zeroTimeIndex >= 0) {
                mainSeries.markLine = {
                  silent: true,
                  lineStyle: {
                    color: chartTheme.border,
                    type: 'dashed',
                    width: 2,
                  },
                  data: [
                    {
                      xAxis: zeroTimeIndex,
                      label: {
                        show: false, // 不显示标签
                      },
                    }
                  ],
                };
              }

              series.push(mainSeries);
            });

            const option = {
              backgroundColor: 'transparent',
              grid: {
                left: 50,
                right: 15,
                top: 30,
                bottom: 40,
              },
              legend: {
                data: legendData,
                top: 5,
                textStyle: {
                  color: chartTheme.textMuted,
                  fontSize: 10
                },
              },
              tooltip: {
                trigger: 'axis',
                backgroundColor: chartTheme.surface,
                borderColor: chartTheme.border,
                textStyle: { color: chartTheme.text },
                formatter: (params: any) => {
                  const time = params[0].axisValue;
                  let html = `<div style="font-weight: 600; margin-bottom: 4px; color: ${chartTheme.text};">${time} ms</div>`;
                  params.forEach((p: any) => {
                    if (p.seriesName && !p.seriesName.includes('area')) {
                      html += `<div style="display: flex; align-items: center; gap: 6px; color: ${chartTheme.textMuted};">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${p.color};"></span>
                        ${p.seriesName}: ${p.value.toFixed(2)} µV
                      </div>`;
                    }
                  });
                  return html;
                },
              },
              xAxis: {
                type: 'category',
                data: erpData.times,
                name: 'Time (ms)',
                nameLocation: 'center',
                nameGap: 25,
                nameTextStyle: { color: chartTheme.text, fontSize: 10 },
                axisLine: { lineStyle: { color: chartTheme.border } },
                axisLabel: {
                  color: chartTheme.textMuted,
                  interval: 'auto',
                  fontSize: 9,
                },
                splitLine: { show: false },
              },
              yAxis: {
                type: 'value',
                name: 'Amplitude (µV)',
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: { color: chartTheme.text, fontSize: 10 },
                axisLine: { lineStyle: { color: chartTheme.border } },
                axisLabel: { color: chartTheme.textMuted, fontSize: 9 },
                splitLine: { lineStyle: { color: chartTheme.gridLine } },
              },
              series,
            };

            return (
              <div key={channelName} className="bg-eeg-bg rounded border border-eeg-border p-2">
                <div className="text-xs font-medium text-eeg-text mb-2 text-center">{channelName}</div>
                <ReactECharts
                  ref={(r: any) => { if (r) multiChartRefs.current[channelName] = r; }}
                  key={channelName}
                  option={option}
                  style={{ height: '250px', width: '100%' }}
                  opts={{ renderer: 'canvas' }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 平均模式：显示通道平均后的ERP
  const colors = ['#859900', '#268bd2', '#dc322f', '#6c71c4', '#cb4b16']; // Solarized

  const series: any[] = [];
  const legendData: string[] = [];

  conditionNames.forEach((conditionName, idx) => {
    const condition = erpData.conditions[conditionName];
    const color = colors[idx % colors.length];
    const displayLabel = getEventLabel(conditionName);

    legendData.push(displayLabel);

    // 主线
    const mainSeries: any = {
      name: displayLabel,
      type: 'line',
      data: condition.data,
      smooth: true,
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      symbol: 'none',
    };

    // 只在第一个series中添加0ms处的虚线标记
    if (conditionName === conditionNames[0] && zeroTimeIndex >= 0) {
      mainSeries.markLine = {
        silent: true,
        lineStyle: {
          color: chartTheme.border,
          type: 'dashed',
          width: 2,
        },
        data: [
          {
            xAxis: zeroTimeIndex,
            label: {
              show: false, // 不显示标签
            },
          }
        ],
      };
    }

    series.push(mainSeries);
  });

  const option = {
    backgroundColor: 'transparent',
    grid: {
      left: 60,
      right: 20,
      top: 40,
      bottom: 50,
    },
    legend: {
      data: legendData,
      textStyle: { color: chartTheme.textMuted },
      top: 10,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartTheme.surface,
      borderColor: chartTheme.border,
      textStyle: { color: chartTheme.text },
      formatter: (params: any) => {
        const time = params[0].axisValue;
        let html = `<div style="font-weight: 600; margin-bottom: 4px; color: ${chartTheme.text};">${time} ms</div>`;
        params.forEach((p: any) => {
          if (p.seriesName && !p.seriesName.includes('area')) {
            html += `<div style="display: flex; align-items: center; gap: 6px; color: ${chartTheme.textMuted};">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${p.color};"></span>
              ${p.seriesName}: ${p.value.toFixed(2)} µV
            </div>`;
          }
        });
        return html;
      },
    },
    xAxis: {
      type: 'category',
      data: erpData.times,
      name: 'Time (ms)',
      nameLocation: 'center',
      nameGap: 30,
      nameTextStyle: { color: chartTheme.text },
      axisLine: { lineStyle: { color: chartTheme.border } },
      axisLabel: {
        color: chartTheme.textMuted,
        interval: 'auto',
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Amplitude (µV)',
      nameLocation: 'center',
      nameGap: 40,
      nameTextStyle: { color: chartTheme.text },
      axisLine: { lineStyle: { color: chartTheme.border } },
      axisLabel: { color: chartTheme.textMuted },
      splitLine: { lineStyle: { color: chartTheme.gridLine } },
    },
    series,
  };

  return (
    <ReactECharts
      ref={singleChartRef}
      key="erp-average"
      option={option}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge={true}
    />
  );
}

// ============ PSD Chart ============

interface PSDChartProps {
  sessionId: string | null;
  channels: string[];
  displayMode: 'butterfly' | 'average';
  fmin?: number;
  fmax?: number;
  onRegisterExport?: (fn: () => void) => void;
}

export function PSDChart({
  sessionId,
  channels,
  displayMode,
  fmin = 1,
  fmax = 50,
  onRegisterExport
}: PSDChartProps) {
  const [psdData, setPsdData] = useState<PSDData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<any>(null);
  const chartTheme = getChartThemeColors();

  useEffect(() => {
    if (!sessionId || !channels || channels.length === 0) {
      setPsdData(null);
      setError(null);
      return;
    }

    const fetchPSDData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 确保channels是有效的字符串数组
        const validChannels = channels.filter(ch => typeof ch === 'string' && ch.length > 0);
        if (validChannels.length === 0) {
          setError('没有有效的通道可供选择');
          setPsdData(null);
          return;
        }

        // 根据displayMode决定是否平均
        const average = displayMode === 'average';
        const data = await visualizationApi.getPSDData(sessionId, validChannels, fmin, fmax, average);
        setPsdData(data);
      } catch (err: any) {
        console.error('获取PSD数据失败:', err);
        const errorMessage = err?.message || err?.detail || '获取PSD数据失败';
        setError(errorMessage);
        setPsdData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPSDData();
  }, [sessionId, channels?.join(','), displayMode, fmin, fmax]);

  useEffect(() => {
    if (!onRegisterExport) return;
    onRegisterExport(() => {
      const inst = chartRef.current?.getEchartsInstance?.();
      if (!inst) return;
      const dataUrl = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: chartTheme.surface });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `PSD-${displayMode}-${fmin}-${fmax}Hz.png`;
      a.click();
    });
  }, [onRegisterExport, displayMode, fmin, fmax]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="info" title="提示" description="请先在工作区加载数据文件" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="warning" title="提示" description="请选择至少一个通道" />
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

  if (!psdData || psdData.frequencies.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="info" title="提示" description="无法获取 PSD 数据" />
      </div>
    );
  }

  // 准备图表数据
  const colors = ['#6c71c4', '#859900', '#268bd2', '#dc322f', '#cb4b16', '#93a1a1']; // Solarized
  const series: any[] = [];
  const legendData: string[] = [];

  if (displayMode === 'butterfly' && psdData.channels) {
    // Butterfly View: 显示每个通道的PSD
    Object.entries(psdData.channels).forEach(([chName, chPower], idx) => {
      const color = colors[idx % colors.length];
      legendData.push(chName);
      series.push({
        name: chName,
        type: 'line',
        data: chPower,
        smooth: true,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        symbol: 'none',
      });
    });
  } else {
    // Average View: 显示平均PSD
    series.push({
      type: 'line',
      data: psdData.power,
      smooth: true,
      lineStyle: { color: '#6c71c4', width: 2 }, // Violet
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(108, 113, 196, 0.3)' },
            { offset: 1, color: 'rgba(108, 113, 196, 0.05)' },
          ],
        },
      },
      symbol: 'none',
    });
  }

  const option = {
    backgroundColor: 'transparent',
    grid: {
      left: 60,
      right: 20,
      top: 40,
      bottom: 50,
    },
    legend: displayMode === 'butterfly' && psdData.channels ? {
      data: legendData,
      textStyle: { color: chartTheme.textMuted },
      top: 10,
      type: 'scroll',
    } : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartTheme.surface,
      borderColor: chartTheme.border,
      textStyle: { color: chartTheme.text },
      formatter: (params: any) => {
        const freq = params[0].axisValue;
        let html = `<div style="color: ${chartTheme.text};"><strong>${freq} Hz</strong></div>`;
        params.forEach((p: any) => {
          html += `<div style="display: flex; align-items: center; gap: 6px; color: ${chartTheme.textMuted};">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${p.color};"></span>
            ${p.seriesName || 'Power'}: ${p.value.toFixed(2)} dB
          </div>`;
        });
        return html;
      },
    },
    xAxis: {
      type: 'category',
      data: psdData.frequencies.map(f => {
        // 根据数值大小决定小数位数
        if (f >= 10) return f.toFixed(0);  // 10以上不显示小数
        return f.toFixed(1);  // 10以下显示1位小数
      }),
      name: 'Frequency (Hz)',
      nameLocation: 'center',
      nameGap: 30,
      nameTextStyle: { color: chartTheme.text },
      axisLine: { lineStyle: { color: chartTheme.border } },
      axisLabel: {
        color: chartTheme.textMuted,
        interval: 'auto',
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Power (dB)',
      nameLocation: 'center',
      nameGap: 40,
      nameTextStyle: { color: chartTheme.text },
      axisLine: { lineStyle: { color: chartTheme.border } },
      axisLabel: { color: chartTheme.textMuted },
      splitLine: { lineStyle: { color: chartTheme.gridLine } },
    },
    series,
  };

  return (
    <ReactECharts
      ref={chartRef}
      key={`psd-${displayMode}-${fmin}-${fmax}`}
      option={option}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
}

// ============ Topo Chart ============

interface TopoChartProps {
  sessionId: string | null;
  mode: 'potential' | 'power';
  timePoint: number;
  freqBand?: [number, number];
  timeWindow?: [number, number | undefined];
  onRegisterExport?: (fn: () => void) => void;
  renderStyle?: 'canvas' | 'mne'; // 新增：渲染风格
  // 以下参数仅用于 MNE 风格
  interpolation?: 'linear' | 'cubic' | 'spline';
  contours?: number;
  sensors?: boolean;
  // 内部使用（根据 renderStyle 自动设置）
  renderMode?: 'data' | 'image';
}

export function TopoChart({
  sessionId,
  mode,
  timePoint,
  freqBand,
  timeWindow,
  onRegisterExport,
  renderStyle = 'canvas', // 新增：默认 Canvas 风格
  interpolation = 'linear',
  contours = 8,
  sensors = true,
  renderMode // 内部使用，根据 renderStyle 自动设置
}: TopoChartProps) {
  // 根据 renderStyle 自动设置 renderMode
  const effectiveRenderMode = renderMode || (renderStyle === 'mne' ? 'image' : 'data');
  const [topoData, setTopoData] = useState<TopomapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 重要：所有hooks必须在条件返回之前调用，否则会导致"Rendered more hooks"错误
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 注册导出（支持 Canvas 和 MNE 两种风格）
  useEffect(() => {
    if (!onRegisterExport) return;
    onRegisterExport(() => {
      const suffix = mode === 'power'
        ? `power-${(freqBand?.[0] ?? 0)}-${(freqBand?.[1] ?? 0)}Hz`
        : `potential-${timePoint}ms`;

      // MNE 风格：导出 base64 图像
      if (effectiveRenderMode === 'image' && topoData?.image_base64) {
        const a = document.createElement('a');
        a.href = `data:image/png;base64,${topoData.image_base64}`;
        a.download = `Topomap-MNE-${suffix}.png`;
        a.click();
        return;
      }

      // Canvas 风格：导出 canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Topomap-${suffix}.png`;
      a.click();
    });
  }, [onRegisterExport, mode, timePoint, (freqBand || []).join(','), effectiveRenderMode, topoData?.image_base64]);

  // 数据获取useEffect
  useEffect(() => {
    if (!sessionId) {
      setTopoData(null);
      return;
    }

    const fetchTopoData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 根据模式传递不同的参数，并携带新增的可视化参数
        const data = mode === 'potential'
          ? await visualizationApi.getTopomapData(
            sessionId, timePoint, undefined, undefined,
            interpolation, contours, sensors, effectiveRenderMode
          )
          : await visualizationApi.getTopomapData(
            sessionId, undefined, freqBand, undefined,  // 功率地形图：不使用timePoint和timeWindow
            interpolation, contours, sensors, effectiveRenderMode
          );
        console.log('[DEBUG] 功率地形图请求参数:', {
          mode, freqBand, fmin: freqBand?.[0], fmax: freqBand?.[1], renderStyle, effectiveRenderMode
        });
        setTopoData(data);
      } catch (err: any) {
        console.error('获取地形图数据失败:', err);
        setError(err.message || '获取地形图数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchTopoData();
  }, [
    sessionId,
    mode,
    timePoint,
    freqBand?.[0], freqBand?.[1], // 展开数组元素以确保正确追踪变化
    timeWindow?.[0], timeWindow?.[1],
    interpolation, contours, sensors, effectiveRenderMode
  ]);

  // Canvas绘制useEffect - 必须在所有条件返回之前定义
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !topoData || topoData.channel_names.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 40;

    // 清空画布 - 使用Solarized背景色
    ctx.fillStyle = '#fdf6e3'; // base3
    ctx.fillRect(0, 0, width, height);

    // 准备数据点（只使用有位置信息的通道）
    const dataPoints: Array<{ x: number; y: number; value: number; name: string }> = [];
    topoData.channel_names.forEach((chName, idx) => {
      const pos = topoData.positions[idx];
      if (pos && !(pos.x === 0 && pos.y === 0)) {
        // 将3D坐标转换为2D显示坐标
        // MNE坐标系统：x=左右（右为正），y=前后（前为正），z=上下（上为正）
        const x3d = pos.x;
        const y3d = pos.y;
        const z3d = pos.z || 0;

        // 使用MNE标准的球面投影方法
        // 电极坐标已经是单位球面上的点（半径约为0.085-0.095）
        const r3d = Math.sqrt(x3d * x3d + y3d * y3d + z3d * z3d);
        if (r3d < 0.01) return; // 跳过无效位置（接近原点）

        // 归一化到单位球面
        const x_norm = x3d / r3d;
        const y_norm = y3d / r3d;
        const z_norm = z3d / r3d;

        // 使用正交投影（从顶部向下看）
        // 这是最直观的投影方式，保持电极间的相对位置
        // 投影半径 = sqrt(x² + y²) / r，z坐标决定是否可见
        const _proj_radius = Math.sqrt(x_norm * x_norm + y_norm * y_norm);
        void _proj_radius; // 预留给将来使用

        // 只显示上半球和侧面电极（z > -0.5，允许看到A1/A2等耳部电极）
        if (z_norm < -0.5) return;

        // 映射到显示坐标
        // 缩放因子：让电极充满整个圆形区域
        const scaleFactor = radius * 0.95;
        const displayX = centerX + x_norm * scaleFactor;
        const displayY = centerY - y_norm * scaleFactor; // y轴反转：前额在上

        dataPoints.push({
          x: displayX,
          y: displayY,
          value: topoData.values[idx],
          name: chName,
        });
      }
    });

    if (dataPoints.length === 0) {
      // 没有任何有效电极位置时，给出提示而不是空白
      ctx.fillStyle = '#586e75'; // base01
      ctx.font = '12px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('缺少电极定位信息（请先设置 Montage）', centerX, centerY);
      return;
    }

    // Solarized配色方案 - RdBu_r (红-白-蓝)
    const getColor = (normalized: number): [number, number, number] => {
      // 使用MNE/EEGLAB风格的RdBu_r配色：蓝色(负) -> 白色(0) -> 红色(正)
      if (normalized < 0.5) {
        // 蓝色到白色
        const t = normalized * 2;
        const r = Math.round(38 + (253 - 38) * t);    // #268bd2 -> white
        const g = Math.round(139 + (246 - 139) * t);
        const b = Math.round(210 + (227 - 210) * t);
        return [r, g, b];
      } else {
        // 白色到红色
        const t = (normalized - 0.5) * 2;
        const r = Math.round(253 - (253 - 220) * t);  // white -> #dc322f
        const g = Math.round(246 - (246 - 50) * t);
        const b = Math.round(227 - (227 - 47) * t);
        return [r, g, b];
      }
    };

    // 使用双线性插值进行平滑渲染
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

      return weightSum > 0 ? valueSum / weightSum : topoData.vmin;
    };

    // 渲染热图
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
          const normalized = Math.max(0, Math.min(1, (value - topoData.vmin) / (topoData.vmax - topoData.vmin)));
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
    const valueRange = topoData.vmax - topoData.vmin;
    for (let i = 1; i < contourLevels; i++) {
      const level = topoData.vmin + (valueRange * i / contourLevels);
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
      ctx.fillText(point.name, point.x, point.y - 10);
    });
  }, [topoData]); // 确保依赖项正确

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

  if (!topoData || topoData.channel_names.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Alert variant="warning" title="提示" description="无法获取地形图数据，请确保已设置电极定位" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="text-center mb-6">
        <h3 className="text-lg font-medium text-eeg-text mb-2">
          {mode === 'potential' ? '电位地形图' : '功率地形图'}
          {renderMode === 'image' && <span className="ml-2 text-sm text-eeg-accent">(MNE渲染)</span>}
        </h3>
        <p className="text-sm text-eeg-text-muted">
          {mode === 'potential'
            ? `时间点: ${timePoint} ms`
            : `频段: ${freqBand?.[0]}-${freqBand?.[1]} Hz${timeWindow && (timeWindow[0] > 0 || timeWindow[1])
              ? ` | 时间窗: ${timeWindow[0]}-${timeWindow[1] || '∞'}s`
              : ''
            }`}
        </p>
      </div>

      {/* 双模式渲染 */}
      {effectiveRenderMode === 'image' && topoData?.image_base64 ? (
        // MNE 风格：显示 MNE 渲染的 PNG
        <div className="relative">
          <img
            src={`data:image/png;base64,${topoData.image_base64}`}
            alt={`${mode === 'potential' ? '电位' : '功率'}地形图 (MNE风格)`}
            className="border border-eeg-border rounded-lg"
            style={{ maxWidth: '500px', maxHeight: '500px' }}
          />
        </div>
      ) : (
        // Canvas 风格：保持 Canvas 自绘渲染
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            className="border border-eeg-border rounded-lg"
          />
        </div>
      )}

      {/* 颜色条 - Solarized RdBu_r风格 (仅在 Canvas 风格时显示，MNE 已有内置 colorbar) */}
      {effectiveRenderMode !== 'image' && (
        <div className="mt-6 flex items-center gap-4">
          <span className="text-xs font-medium text-eeg-text">
            {topoData.vmin.toFixed(1)} {mode === 'power' ? 'dB' : 'µV'}
          </span>
          <div className="relative w-64 h-4 rounded border border-eeg-border overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to right, #268bd2 0%, #93a1a1 25%, #fdf6e3 50%, #cb4b16 75%, #dc322f 100%)'
              }}
            />
          </div>
          <span className="text-xs font-medium text-eeg-text">
            {topoData.vmax.toFixed(1)} {mode === 'power' ? 'dB' : 'µV'}
          </span>
        </div>
      )}
    </div>
  );
}

// ============ TFR Chart ============

export function TFRChart({ onRegisterExport }: { onRegisterExport?: (fn: () => void) => void } = {}) {
  const { sessionId, selectedROI, currentData, events, displayMode } = useEEGStore();

  const availableEpochEventIds = currentData?.epochEventIds || [];
  const [eventId, setEventId] = useState<number | 'all'>('all');
  const [fmin, setFmin] = useState(1);
  const [fmax, setFmax] = useState(40);
  const [nCycles, setNCycles] = useState(7);
  const [baselineStart, setBaselineStart] = useState(-0.2);
  const [baselineEnd, setBaselineEnd] = useState(0);
  const [baselineMode, setBaselineMode] = useState<'logratio' | 'ratio' | 'zscore' | 'percent'>('logratio');
  const [decim, setDecim] = useState(2);

  // 新增：渲染风格
  const [renderStyle, setRenderStyle] = useState<'canvas' | 'mne'>('mne'); // 默认使用 MNE 风格

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<TFRJobResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const roiChannels = selectedROI.length > 0
    ? selectedROI
    : (currentData?.channels?.filter(ch => ch.type === 'EEG' && !ch.isBad).map(ch => ch.name) || []);

  // 多通道视图(butterfly)：渲染多个通道的小窗 TFR
  // 平均图(average)：ROI/全EEG平均 TFR
  const tfrMode: 'multi' | 'roi' = displayMode === 'butterfly' ? 'multi' : 'roi';
  const MAX_MULTI_CHANNELS = 12;
  const channels = tfrMode === 'multi' ? roiChannels.slice(0, MAX_MULTI_CHANNELS) : roiChannels;

  const canRun = Boolean(sessionId) && Boolean(currentData?.hasEpochs) && channels.length > 0;

  // 参数提示：根据 epoch 长度推算 n_cycles 上限
  const epochLen = currentData?.epochTmin != null && currentData?.epochTmax != null
    ? Math.max(0, (currentData.epochTmax as number) - (currentData.epochTmin as number))
    : null;
  const maxNCycles = epochLen ? Math.max(1, Math.floor(epochLen * Math.max(1, fmin) * 0.9 * 10) / 10) : null;
  const nCyclesWarning = maxNCycles != null && nCycles > maxNCycles
    ? `当前 epoch 长度约 ${(epochLen as number).toFixed(2)}s；在 fmin=${fmin}Hz 时建议 n_cycles ≤ ${maxNCycles}，否则可能报“wavelet longer than signal”。`
    : null;

  useEffect(() => {
    if (!jobId) return;
    setPolling(true);
    let timer: any = null;

    const tick = async () => {
      try {
        const data = await visualizationApi.getTFRJob(jobId);
        setJob(data);
        if (data.status === 'completed' || data.status === 'error') {
          setPolling(false);
          if (timer) clearInterval(timer);
        }
      } catch (e: any) {
        setPolling(false);
        if (timer) clearInterval(timer);
        setErr(e?.message || '查询任务失败');
      }
    };

    tick();
    timer = setInterval(tick, 1200);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [jobId]);

  const submit = async () => {
    if (!canRun || !sessionId) return;
    setSubmitting(true);
    setErr(null);
    setJob(null);
    try {
      const res = await visualizationApi.startTFRJob({
        sessionId,
        channels,
        eventId: eventId === 'all' ? undefined : eventId,
        fmin,
        fmax,
        nCycles,
        baseline: [baselineStart, baselineEnd],
        baselineMode,
        decim,
        // 新增：渲染模式
        renderMode: renderStyle === 'mne' ? 'image' : 'data',
        colormap: 'RdBu_r',
      });
      setJobId(res.job_id);
    } catch (e: any) {
      setErr(e?.message || '提交任务失败');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!jobId) return;
    try {
      await visualizationApi.cancelTFRJob(jobId);
      setPolling(false);
      // 立即更新状态
      setJob(prev => prev ? { ...prev, status: 'error', error: '任务已被取消' } : null);
    } catch (e: any) {
      setErr(e?.message || '取消任务失败');
    }
  };

  const result = job?.status === 'completed' ? job.result : null;

  const powerUnit = useMemo(() => {
    if (baselineMode === 'percent') return '%';
    if (baselineMode === 'zscore') return 'z-score';
    if (baselineMode === 'ratio') return 'ratio';
    if (baselineMode === 'logratio') return 'dB';  // logratio 实际上是 10*log10，即 dB
    return 'a.u.';
  }, [baselineMode]);

  const buildHeatmapOption = useMemo(() => {
    return (times: number[], freqs: number[], power: number[][], vmin: number, vmax: number, title?: string, showVisualMap?: boolean) => {
      const data: Array<[number, number, number]> = [];
      for (let fi = 0; fi < freqs.length; fi++) {
        for (let ti = 0; ti < times.length; ti++) {
          data.push([ti, fi, power[fi][ti]]);
        }
      }

      // 对称化颜色范围（diverging colormap）
      const absMax = Math.max(Math.abs(vmin), Math.abs(vmax));
      const symVmin = -absMax;
      const symVmax = absMax;

      // 找到 0ms 的位置用于标记线
      const zeroTimeIdx = times.findIndex(t => t >= 0);

      return {
        backgroundColor: 'transparent',
        title: title ? { text: title, left: 8, top: 6, textStyle: { color: '#586e75', fontSize: 11, fontWeight: 600 } } : undefined,
        grid: { left: 50, right: showVisualMap ? 45 : 12, top: title ? 26 : 16, bottom: 40 },
        tooltip: {
          trigger: 'item',
          backgroundColor: '#eee8d5', // base2
          borderColor: '#93a1a1', // base1
          textStyle: { color: '#657b83' }, // base00
          formatter: (p: any) => {
            const ti = p.data[0];
            const fi = p.data[1];
            const v = p.data[2];
            const t = times[ti];
            const f = freqs[fi];
            return `<div style="font-weight:600;color:#586e75;margin-bottom:4px;">${t.toFixed(0)} ms, ${f.toFixed(1)} Hz</div>` +
              `<div style="color:#657b83;">Power: ${Number(v).toFixed(3)} ${powerUnit}</div>`;
          }
        },
        xAxis: {
          type: 'category',
          data: times.map(t => t.toFixed(0)),
          name: 'Time (ms)',
          nameLocation: 'center',
          nameGap: 26,
          nameTextStyle: { color: '#586e75', fontSize: 10 },
          axisLine: { lineStyle: { color: '#93a1a1' } },
          axisLabel: { color: '#586e75', fontSize: 9, interval: 'auto' },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'category',
          data: freqs.map(f => f.toFixed(1)),
          name: 'Frequency (Hz)',
          nameLocation: 'center',
          nameGap: 42,
          nameTextStyle: { color: '#586e75', fontSize: 10 },
          axisLine: { lineStyle: { color: '#93a1a1' } },
          axisLabel: { color: '#586e75', fontSize: 9, interval: 'auto' },
          splitLine: { show: false },
        },
        visualMap: {
          min: symVmin,
          max: symVmax,
          calculable: false,  // 不可拖动调整
          show: showVisualMap,  // 只控制是否显示，但颜色映射始终生效
          orient: 'vertical',
          right: 2,
          top: 'center',
          itemWidth: 8,   // 更细
          itemHeight: 80, // 更短
          text: showVisualMap ? [`${powerUnit}`, ''] : undefined,
          textStyle: { color: '#586e75', fontSize: 8 },
          textGap: 4,
          inRange: {
            // RdBu_r 科研配色（蓝 -> 白 -> 红）
            color: [
              '#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0',
              '#f7f7f7',
              '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'
            ],
          },
        },
        series: [
          {
            name: 'TFR',
            type: 'heatmap',
            data,
            progressive: 1000,
            emphasis: { itemStyle: { borderColor: '#586e75', borderWidth: 1 } },
            // 添加 0ms 标记线
            markLine: zeroTimeIdx >= 0 ? {
              silent: true,
              symbol: 'none',
              lineStyle: {
                color: '#000000',
                type: 'dashed',
                width: 1.5,
              },
              data: [{ xAxis: zeroTimeIdx }],
              label: { show: false },
            } : undefined,
          }
        ]
      };
    };
  }, [powerUnit]);

  const singleChartRef = useRef<any>(null);
  const multiRefs = useRef<Record<string, any>>({});

  // 注册导出：支持 Canvas 和 MNE 两种风格
  useEffect(() => {
    if (!onRegisterExport) return;
    onRegisterExport(() => {
      // MNE 风格：导出 base64 图像
      if (result?.render_mode === 'image') {
        if (tfrMode === 'roi' && result.image_base64) {
          const a = document.createElement('a');
          a.href = `data:image/png;base64,${result.image_base64}`;
          a.download = `TFR-MNE-ROIavg-${fmin}-${fmax}Hz-${baselineMode}.png`;
          a.click();
          return;
        }

        if (tfrMode === 'multi' && result.images_by_channel) {
          Object.entries(result.images_by_channel).forEach(([ch, imgBase64]) => {
            const a = document.createElement('a');
            a.href = `data:image/png;base64,${imgBase64}`;
            a.download = `TFR-MNE-${ch}-${fmin}-${fmax}Hz-${baselineMode}.png`;
            a.click();
          });
          return;
        }
        return;
      }

      // Canvas 风格：导出 ECharts 图像
      if (tfrMode === 'roi') {
        const inst = singleChartRef.current?.getEchartsInstance?.();
        if (!inst) return;
        const dataUrl = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fdf6e3' });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `TFR-ROIavg-${fmin}-${fmax}Hz-${baselineMode}.png`;
        a.click();
        return;
      }

      Object.keys(multiRefs.current).forEach((ch) => {
        const inst = multiRefs.current[ch]?.getEchartsInstance?.();
        if (!inst) return;
        const dataUrl = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fdf6e3' });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `TFR-${ch}-${fmin}-${fmax}Hz-${baselineMode}.png`;
        a.click();
      });
    });
  }, [onRegisterExport, tfrMode, fmin, fmax, baselineMode, result]);

  // 切换风格时自动重新提交（如果之前已有结果）
  const prevRenderStyleRef = useRef(renderStyle);
  useEffect(() => {
    if (prevRenderStyleRef.current !== renderStyle && result) {
      // 风格变化且已有计算结果，自动重新提交
      submit();
    }
    prevRenderStyleRef.current = renderStyle;
  }, [renderStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex">
      {/* Left: controls */}
      <div className="w-72 border-r border-eeg-border bg-eeg-surface p-3 overflow-auto">
        <div className="space-y-3">
          {/* 渲染风格 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-eeg-text-muted w-8">风格</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="tfrRenderStyle" checked={renderStyle === 'mne'} onChange={() => setRenderStyle('mne')} className="w-3.5 h-3.5" />
              <span className="text-sm text-eeg-text">MNE</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="tfrRenderStyle" checked={renderStyle === 'canvas'} onChange={() => setRenderStyle('canvas')} className="w-3.5 h-3.5" />
              <span className="text-sm text-eeg-text">Canvas</span>
            </label>
          </div>

          {/* 事件 */}
          <div>
            <label className="block text-xs text-eeg-text-muted mb-1">事件</label>
            <select value={eventId} onChange={(e) => setEventId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))} className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text">
              <option value="all">所有</option>
              {availableEpochEventIds.map((id) => {
                const ev = events.find(e => e.id === id);
                return <option key={id} value={id}>{ev?.label || `event_${id}`}</option>;
              })}
            </select>
          </div>

          {/* 频率范围 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-eeg-text-muted mb-1">fmin (Hz)</label>
              <input type="number" value={fmin} onChange={(e) => setFmin(parseFloat(e.target.value) || 1)} className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
            </div>
            <div>
              <label className="block text-xs text-eeg-text-muted mb-1">fmax (Hz)</label>
              <input type="number" value={fmax} onChange={(e) => setFmax(parseFloat(e.target.value) || 40)} className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
            </div>
          </div>

          {/* n_cycles & decim */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-eeg-text-muted mb-1">n_cycles</label>
              <input type="number" value={nCycles} onChange={(e) => setNCycles(parseFloat(e.target.value) || 7)} step="0.5" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
            </div>
            <div>
              <label className="block text-xs text-eeg-text-muted mb-1">decim</label>
              <input type="number" value={decim} onChange={(e) => setDecim(parseInt(e.target.value) || 2)} step="1" min="1" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
            </div>
          </div>

          {/* baseline */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-eeg-text-muted mb-1">baseline起 (s)</label>
              <input type="number" value={baselineStart} onChange={(e) => setBaselineStart(parseFloat(e.target.value) || -0.2)} step="0.05" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
            </div>
            <div>
              <label className="block text-xs text-eeg-text-muted mb-1">baseline止 (s)</label>
              <input type="number" value={baselineEnd} onChange={(e) => setBaselineEnd(parseFloat(e.target.value) || 0)} step="0.05" className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text" />
            </div>
          </div>

          {/* baseline mode */}
          <div>
            <label className="block text-xs text-eeg-text-muted mb-1">baseline mode</label>
            <select value={baselineMode} onChange={(e) => setBaselineMode(e.target.value as any)} className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-sm text-eeg-text">
              <option value="logratio">logratio</option>
              <option value="ratio">ratio</option>
              <option value="zscore">zscore</option>
              <option value="percent">percent</option>
            </select>
          </div>

          {/* 警告信息（统一提示样式） */}
          {nCyclesWarning && (
            <Alert variant="warning" title="提示" description={nCyclesWarning} className="text-xs" />
          )}
          {!currentData?.hasEpochs && (
            <Alert variant="error" title="需要先分段" description="请先完成分段步骤后再继续。" className="text-xs" />
          )}
          {tfrMode === 'multi' && roiChannels.length > MAX_MULTI_CHANNELS && (
            <Alert variant="warning" title="通道数量受限" description={`多通道最多 ${MAX_MULTI_CHANNELS} 个`} className="text-xs" />
          )}

          {err && (
            <Alert variant="error" title="计算失败" description={err} className="text-xs" />
          )}

          <button
            disabled={!canRun || submitting}
            onClick={submit}
            className="w-full bg-eeg-active text-white rounded py-2 text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? '提交中...' : '提交后台计算'}
          </button>

          {job?.status === 'running' && (
            <button
              onClick={cancel}
              className="w-full bg-eeg-error text-white rounded py-2 text-sm font-medium hover:brightness-110 transition-colors"
            >
              取消任务
            </button>
          )}

          {job && (
            <div className="text-xs text-eeg-text-muted space-y-1">
              <div>任务: {job.job_id}</div>
              <div>状态: {job.status} {polling ? '(轮询中)' : ''}</div>
              <div>进度: {(job.progress * 100).toFixed(0)}%</div>
              {job.status === 'error' && (
                <Alert variant="error" title="任务失败" description={job.error || undefined} className="text-xs" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: chart */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="h-full bg-eeg-bg rounded-lg border border-eeg-border overflow-auto">
          {!result ? (
            <div className="h-full flex items-center justify-center text-eeg-text-muted">
              {job?.status === 'running' ? (
                <div className="text-center space-y-3">
                  <Loader2 className="animate-spin text-eeg-accent mx-auto mb-2" size={28} />
                  <div className="text-sm">计算中... {(job.progress * 100).toFixed(0)}%</div>
                  <div className="text-xs text-eeg-text-muted max-w-md mx-auto">
                    {job.progress < 0.75
                      ? '正在进行 Morlet 小波变换，这可能需要几十秒到几分钟，请耐心等待...'
                      : job.progress < 0.85
                        ? '正在应用 baseline 校正...'
                        : '正在渲染图像，即将完成...'}
                  </div>
                  <div className="text-xs text-eeg-text-muted">
                    <Alert
                      variant="info"
                      title="提示"
                      description="如果等待时间过长，可以尝试降低 fmax 或增加 decim 参数"
                      className="text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center text-sm">
                  <Alert variant="info" title="提示" description="提交任务后将在这里显示时频热力图" />
                </div>
              )}
            </div>
          ) : (
            <div className="h-full w-full overflow-auto">
              {/* MNE 风格：显示后端渲染的图像 */}
              {result.render_mode === 'image' && result.image_base64 ? (
                <>
                  {tfrMode === 'roi' && (
                    <div className="h-full flex items-center justify-center p-4">
                      <img
                        src={`data:image/png;base64,${result.image_base64}`}
                        alt="TFR ROI Average (MNE)"
                        className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                        style={{ backgroundColor: 'white' }}
                      />
                    </div>
                  )}
                  {tfrMode === 'multi' && result.images_by_channel && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {Object.entries(result.images_by_channel).slice(0, MAX_MULTI_CHANNELS).map(([chName, imgBase64]) => (
                        <div key={chName} className="bg-white rounded-lg border border-eeg-border shadow-sm overflow-hidden">
                          <img
                            src={`data:image/png;base64,${imgBase64}`}
                            alt={`TFR ${chName} (MNE)`}
                            className="w-full h-auto"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Canvas 风格：显示 ECharts 热力图 */
                <>
                  {tfrMode === 'roi' && (
                    <ReactECharts
                      ref={singleChartRef}
                      option={(() => {
                        const times = result.times;
                        const freqs = result.freqs;
                        const power = result.power;
                        let vmin = Number.POSITIVE_INFINITY;
                        let vmax = Number.NEGATIVE_INFINITY;
                        for (let fi = 0; fi < freqs.length; fi++) {
                          for (let ti = 0; ti < times.length; ti++) {
                            const v = power[fi][ti];
                            if (v < vmin) vmin = v;
                            if (v > vmax) vmax = v;
                          }
                        }
                        return buildHeatmapOption(times, freqs, power, vmin, vmax, 'ROI 平均', true);
                      })()}
                      style={{ height: '100%', width: '100%' }}
                      opts={{ renderer: 'canvas' }}
                    />
                  )}

                  {tfrMode === 'multi' && (
                    <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {(() => {
                        const times = result.times;
                        const freqs = result.freqs;
                        const chNames = result.channel_names || [];
                        const perCh = result.power_by_channel || [];
                        const n = Math.min(chNames.length, perCh.length);
                        const showN = Math.min(n, MAX_MULTI_CHANNELS);
                        let vmin = Number.POSITIVE_INFINITY;
                        let vmax = Number.NEGATIVE_INFINITY;
                        for (let ci = 0; ci < showN; ci++) {
                          const mat = perCh[ci];
                          if (!mat) continue;
                          for (let fi = 0; fi < freqs.length; fi++) {
                            for (let ti = 0; ti < times.length; ti++) {
                              const v = mat[fi]?.[ti];
                              if (v !== undefined && v < vmin) vmin = v;
                              if (v !== undefined && v > vmax) vmax = v;
                            }
                          }
                        }
                        return Array.from({ length: showN }).map((_, idx) => {
                          const ch = chNames[idx] || `CH${idx + 1}`;
                          const mat = perCh[idx];
                          if (!mat) return null;
                          return (
                            <div key={ch} className="bg-eeg-bg rounded-md border border-eeg-border overflow-hidden" style={{ aspectRatio: '4/3' }}>
                              <ReactECharts
                                ref={(r: any) => { if (r) multiRefs.current[ch] = r; }}
                                option={buildHeatmapOption(times, freqs, mat, vmin, vmax, ch, true)}
                                style={{ height: '100%', width: '100%' }}
                                opts={{ renderer: 'canvas' }}
                              />
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

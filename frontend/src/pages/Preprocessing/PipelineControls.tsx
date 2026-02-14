import { useState, useEffect } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import * as Checkbox from '@radix-ui/react-checkbox';
import { 
  ChevronDown, 
  Undo2, 
  Redo2, 
  Scissors, 
  Radio, 
  Filter, 
  Zap,
  GitBranch,
  Layers,
  Activity,
  Check,
  Loader2,
  Tag,
  Copy
} from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { useEEGStore } from '../../stores/eegStore';

interface PipelineControlsProps {
  onAction?: (action: string, params: Record<string, unknown>) => Promise<boolean>;
  onUndo?: () => Promise<void>;
  onRedo?: () => Promise<void>;
  isProcessing?: boolean;
  onOpenBatchProcessing?: () => void;
}

export function PipelineControls({ onAction, onUndo, onRedo, isProcessing = false, onOpenBatchProcessing }: PipelineControlsProps) {
  const { 
    pipelineSteps, 
    currentStepIndex, 
    undoPipelineStep, 
    redoPipelineStep, 
    addPipelineStep,
    events,
    updateEventLabel
  } = useEEGStore();
  
  const [cropMin, setCropMin] = useState('0');
  const [cropMax, setCropMax] = useState('');
  
  // 滤波参数
  const [lowcut, setLowcut] = useState('0.1');
  const [highcut, setHighcut] = useState('40');
  const [notch, setNotch] = useState('50');

  // 重采样参数
  const [targetSampleRate, setTargetSampleRate] = useState('250');

  // ICA 参数
  const [icaThreshold, setIcaThreshold] = useState(0.9);
  const [icaComponents, setIcaComponents] = useState({
    eyeBlink: true,
    muscle: true,
    heart: false,
    channelNoise: false,
  });

  // 重参考参数
  const [reference, setReference] = useState('average');
  const [customRef, setCustomRef] = useState('');

  // 事件映射参数
  const [eventMappings, setEventMappings] = useState<Record<number, string>>({});

  // 分段参数
  const [selectedEpochEventIds, setSelectedEpochEventIds] = useState<number[]>([]);
  const [epochTmin, setEpochTmin] = useState('-0.2');
  const [epochTmax, setEpochTmax] = useState('0.8');
  const [rejectThreshold, setRejectThreshold] = useState('100');

  // 当 events 变化时，默认全选所有事件
  useEffect(() => {
    if (events.length > 0 && selectedEpochEventIds.length === 0) {
      setSelectedEpochEventIds(events.map(e => e.id));
    }
  }, [events]);

  // Montage 参数
  const [montageName, setMontageName] = useState('standard_1020');

  const canUndo = currentStepIndex >= 0;
  const canRedo = currentStepIndex < pipelineSteps.length - 1;

  const handleApply = async (type: string, params: Record<string, unknown>) => {
    // 调用后端 API
    if (onAction) {
      const success = await onAction(type, params);
      if (success) {
        // 成功后记录到 pipeline
        addPipelineStep({
          id: `${type}-${Date.now()}`,
          type: type as any,
          params,
          timestamp: new Date().toISOString(),
          status: 'applied',
        });
      }
    } else {
      // 如果没有 onAction，仅添加到本地 store（演示模式）
      addPipelineStep({
        id: `${type}-${Date.now()}`,
        type: type as any,
        params,
        timestamp: new Date().toISOString(),
        status: 'applied',
      });
    }
  };

  const toggleEpochEvent = (eventId: number) => {
    setSelectedEpochEventIds(prev => 
      prev.includes(eventId) 
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  const handleEventMappingChange = (eventId: number, newLabel: string) => {
    setEventMappings(prev => ({
      ...prev,
      [eventId]: newLabel
    }));
  };

  const applyEventMappings = () => {
    // 更新store中的events label
    Object.entries(eventMappings).forEach(([eventIdStr, label]) => {
      const eventId = parseInt(eventIdStr);
      updateEventLabel(eventId, label);
    });
    // 清空临时映射
    setEventMappings({});
  };

  return (
    <div className="h-full flex flex-col bg-eeg-surface border-r border-eeg-border">
      {/* 顶部撤销/重做 */}
      <div className="p-3 border-b border-eeg-border flex gap-2">
        <Button 
          variant="secondary" 
          size="sm" 
          className="flex-1"
          disabled={!canUndo || isProcessing}
          onClick={async () => {
            if (onUndo) {
              await onUndo();
            }
            undoPipelineStep();
          }}
        >
          <Undo2 size={14} className="mr-1" />
          撤销
        </Button>
        <Button 
          variant="secondary" 
          size="sm" 
          className="flex-1"
          disabled={!canRedo || isProcessing}
          onClick={async () => {
            if (onRedo) {
              await onRedo();
            }
            redoPipelineStep();
          }}
        >
          重做
          <Redo2 size={14} className="ml-1" />
        </Button>
      </div>

      {/* 手风琴菜单 */}
      <div className="flex-1 overflow-auto">
        <Accordion.Root type="single" collapsible className="p-2 space-y-1">
          {/* 数据裁剪 */}
          <AccordionItem value="crop" icon={<Scissors size={16} />} title="数据裁剪">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="起始 (s)"
                  value={cropMin}
                  onChange={(e) => setCropMin(e.target.value)}
                  type="number"
                  placeholder="0"
                />
                <Input
                  label="结束 (s)"
                  value={cropMax}
                  onChange={(e) => setCropMax(e.target.value)}
                  type="number"
                  placeholder="末尾"
                />
              </div>
              <Button 
                size="sm" 
                className="w-full"
                disabled={isProcessing}
                onClick={() => handleApply('crop', { 
                  tmin: parseFloat(cropMin) || 0, 
                  tmax: cropMax ? parseFloat(cropMax) : null 
                })}
              >
                {isProcessing ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                应用
              </Button>
            </div>
          </AccordionItem>

          {/* 电极定位 */}
          <AccordionItem value="channel" icon={<Radio size={16} />} title="电极定位">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-eeg-text mb-1.5">
                  加载标准定位
                </label>
                <select
                  value={montageName}
                  onChange={(e) => setMontageName(e.target.value)}
                  className="w-full bg-eeg-bg border border-eeg-border rounded-md px-3 py-2 text-sm text-eeg-text"
                >
                  <option value="standard_1020">Standard 10-20</option>
                  <option value="standard_1010">Standard 10-10</option>
                  <option value="standard_1005">Standard 10-05</option>
                  <option value="biosemi64">BioSemi 64</option>
                  <option value="biosemi128">BioSemi 128</option>
                </select>
              </div>
              <Button 
                variant="secondary" 
                size="sm" 
                className="w-full"
                disabled={isProcessing}
                onClick={() => handleApply('montage', { montageName })}
              >
                应用电极定位
              </Button>
            </div>
          </AccordionItem>

          {/* 滤波 (独立) */}
          <AccordionItem value="filter" icon={<Filter size={16} />} title="滤波 (Filter)">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="高通 (Hz)"
                  value={lowcut}
                  onChange={(e) => setLowcut(e.target.value)}
                  type="number"
                  placeholder="0.1"
                />
                <Input
                  label="低通 (Hz)"
                  value={highcut}
                  onChange={(e) => setHighcut(e.target.value)}
                  type="number"
                  placeholder="40"
                />
              </div>
              <Input
                label="陷波 (Hz)"
                value={notch}
                onChange={(e) => setNotch(e.target.value)}
                type="number"
                placeholder="50 (工频干扰)"
              />
              <Button 
                size="sm" 
                className="w-full"
                disabled={isProcessing}
                onClick={() => handleApply('filter', { 
                  lowcut: lowcut ? parseFloat(lowcut) : null, 
                  highcut: highcut ? parseFloat(highcut) : null,
                  notch: notch ? parseFloat(notch) : null
                })}
              >
                {isProcessing ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                应用滤波
              </Button>
            </div>
          </AccordionItem>

          {/* 重采样 (独立) */}
          <AccordionItem value="resample" icon={<Activity size={16} />} title="重采样 (Resample)">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-eeg-text mb-1.5">
                  目标采样率
                </label>
                <select
                  value={targetSampleRate}
                  onChange={(e) => setTargetSampleRate(e.target.value)}
                  className="w-full bg-eeg-bg border border-eeg-border rounded-md px-3 py-2 text-sm text-eeg-text"
                >
                  <option value="128">128 Hz</option>
                  <option value="250">250 Hz</option>
                  <option value="500">500 Hz</option>
                  <option value="1000">1000 Hz</option>
                </select>
              </div>
              <Button 
                size="sm" 
                className="w-full"
                disabled={isProcessing}
                onClick={() => handleApply('resample', { 
                  sampleRate: parseInt(targetSampleRate)
                })}
              >
                {isProcessing ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                应用重采样
              </Button>
            </div>
          </AccordionItem>

          {/* 全自动 ICA */}
          <AccordionItem value="ica" icon={<Zap size={16} />} title="全自动 ICA">
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-eeg-text-muted mb-2">
                  去除伪迹类别
                </label>
                {[
                  { key: 'eyeBlink', label: 'Eye Blink (眼电)' },
                  { key: 'muscle', label: 'Muscle (肌电)' },
                  { key: 'heart', label: 'Heart (心电)' },
                  { key: 'channelNoise', label: 'Channel Noise' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={icaComponents[key as keyof typeof icaComponents]}
                      onChange={(e) => setIcaComponents(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="w-4 h-4 rounded border-eeg-border bg-eeg-bg text-eeg-active focus:ring-eeg-active"
                    />
                    <span className="text-sm text-eeg-text">{label}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-eeg-text-muted mb-2">
                  阈值: {icaThreshold.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="0.99"
                  step="0.01"
                  value={icaThreshold}
                  onChange={(e) => setIcaThreshold(parseFloat(e.target.value))}
                  className="w-full accent-eeg-active"
                />
              </div>
              <Button 
                size="sm" 
                className="w-full"
                disabled={isProcessing}
                onClick={() => handleApply('ica', { components: icaComponents, threshold: icaThreshold })}
              >
                {isProcessing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Zap size={14} className="mr-1" />}
                运行自动 ICA
              </Button>
              <p className="text-xs text-eeg-text-muted">
                需要安装 mne-icalabel 库以获得最佳效果
              </p>
            </div>
          </AccordionItem>

          {/* 重参考 */}
          <AccordionItem value="reference" icon={<GitBranch size={16} />} title="重参考">
            <div className="space-y-3">
              <select
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full bg-eeg-bg border border-eeg-border rounded-md px-3 py-2 text-sm text-eeg-text"
              >
                <option value="average">CAR (平均参考)</option>
                <option value="a1a2">A1/A2 (双耳/乳突)</option>
                <option value="custom">自定义电极</option>
              </select>
              {reference === 'custom' && (
                <Input 
                  placeholder="例如: TP9, TP10" 
                  value={customRef}
                  onChange={(e) => setCustomRef(e.target.value)}
                />
              )}
              <Button 
                size="sm" 
                className="w-full"
                disabled={isProcessing}
                onClick={() => handleApply('rereference', { 
                  method: reference,
                  customRef: reference === 'custom' ? customRef.split(',').map(s => s.trim()) : undefined
                })}
              >
                {isProcessing ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                应用
              </Button>
            </div>
          </AccordionItem>

          {/* 事件重命名 */}
          <AccordionItem value="eventMapping" icon={<Tag size={16} />} title="事件重命名">
            <div className="space-y-3">
              <div className="max-h-48 overflow-y-auto border border-eeg-border rounded-md bg-eeg-bg p-2 space-y-2">
                {events.map(event => (
                  <div key={event.id} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: event.color || '#58a6ff' }}
                    />
                    <span className="text-xs text-eeg-text-muted w-10 flex-shrink-0">
                      {event.id}
                    </span>
                    <Input
                      value={eventMappings[event.id] !== undefined ? eventMappings[event.id] : (event.label || `event_${event.id}`)}
                      onChange={(e) => handleEventMappingChange(event.id, e.target.value)}
                      placeholder={`event_${event.id}`}
                      className="text-xs flex-1"
                    />
                    <span className="text-xs text-eeg-text-muted w-8 text-right flex-shrink-0">
                      ×{event.count}
                    </span>
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="text-xs text-eeg-text-muted text-center py-2">
                    无事件数据
                  </div>
                )}
              </div>
              <Button 
                size="sm" 
                variant="secondary"
                className="w-full"
                disabled={isProcessing || Object.keys(eventMappings).length === 0}
                onClick={applyEventMappings}
              >
                保存
              </Button>
            </div>
          </AccordionItem>

          {/* 分段 (多选事件) */}
          <AccordionItem value="epoch" icon={<Layers size={16} />} title="分段 (Epoching)">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-eeg-text mb-2">
                  选择目标事件
                </label>
                <div className="max-h-32 overflow-y-auto border border-eeg-border rounded-md bg-eeg-bg p-2 space-y-1">
                  {events.map(event => (
                     <div key={event.id} className="flex items-center gap-2">
                      <Checkbox.Root
                        className="flex h-4 w-4 appearance-none items-center justify-center rounded bg-eeg-surface border border-eeg-border data-[state=checked]:bg-eeg-active data-[state=checked]:border-eeg-active outline-none"
                        checked={selectedEpochEventIds.includes(event.id)}
                        onCheckedChange={() => toggleEpochEvent(event.id)}
                        id={`event-${event.id}`}
                      >
                        <Checkbox.Indicator className="text-white">
                          <Check size={10} strokeWidth={4} />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                      <label 
                        htmlFor={`event-${event.id}`} 
                        className="text-sm text-eeg-text cursor-pointer select-none flex-1 flex items-center gap-2"
                      >
                         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: event.color }} />
                         {event.label || `Event ${event.id}`} 
                         <span className="text-eeg-text-muted text-xs">({event.count})</span>
                      </label>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <div className="text-xs text-eeg-text-muted text-center py-2">
                      无事件数据，请先加载数据
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="起始 (s)"
                  value={epochTmin}
                  onChange={(e) => setEpochTmin(e.target.value)}
                  type="number"
                  step="0.1"
                />
                <Input
                  label="结束 (s)"
                  value={epochTmax}
                  onChange={(e) => setEpochTmax(e.target.value)}
                  type="number"
                  step="0.1"
                />
              </div>
              <Input
                label="坏段阈值 (µV)"
                value={rejectThreshold}
                onChange={(e) => setRejectThreshold(e.target.value)}
                type="number"
                placeholder="100"
              />
              <Button 
                size="sm" 
                className="w-full"
                disabled={isProcessing || selectedEpochEventIds.length === 0}
                onClick={() => handleApply('epoch', { 
                  eventIds: selectedEpochEventIds,
                  tmin: parseFloat(epochTmin),
                  tmax: parseFloat(epochTmax),
                  baseline: [parseFloat(epochTmin), 0],
                  reject: rejectThreshold ? parseFloat(rejectThreshold) : null
                })}
              >
                {isProcessing ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                应用分段
              </Button>
            </div>
          </AccordionItem>

          {/* 批量预处理入口 */}
          <div className="mt-4 pt-4 border-t border-eeg-border">
            <div className="group relative overflow-hidden rounded-xl border border-eeg-border bg-eeg-surface hover:border-eeg-active/50 transition-all duration-300">
              {/* 背景渐变效果 */}
              <div className="absolute inset-0 bg-gradient-to-br from-eeg-active/5 via-transparent to-eeg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* 顶部强调条 */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-eeg-active via-eeg-accent to-eeg-active opacity-60" />

              <div className="relative p-3">
                <div className="flex items-start gap-3">
                  {/* 左侧图标区域 */}
                  <div className="flex-shrink-0">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-lg bg-eeg-active/10 border border-eeg-active/20 flex items-center justify-center group-hover:scale-105 group-hover:bg-eeg-active/15 transition-all duration-300">
                        <Copy size={20} className="text-eeg-accent" />
                      </div>
                      {/* 装饰性小点 */}
                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-eeg-success border-2 border-eeg-surface" />
                    </div>
                  </div>
                  
                  {/* 中间内容区域 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-semibold text-eeg-text">
                        批量预处理
                      </h3>
                    </div>
                    <p className="text-xs text-eeg-text-muted leading-relaxed line-clamp-2">
                      多文件统一流程，一键执行并导出结果
                    </p>
                  </div>
                </div>

                {/* 底部按钮区域 */}
                <div className="mt-3 flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1 group-hover:shadow-lg group-hover:shadow-eeg-active/20 transition-shadow duration-300"
                    onClick={onOpenBatchProcessing}
                  >
                    <Copy size={16} className="mr-2" />
                    开始批量处理
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Accordion.Root>
      </div>
    </div>
  );
}

function AccordionItem({ 
  value, 
  icon, 
  title, 
  children 
}: { 
  value: string; 
  icon: React.ReactNode; 
  title: string; 
  children: React.ReactNode;
}) {
  return (
    <Accordion.Item value={value} className="bg-eeg-bg rounded-lg overflow-hidden">
      <Accordion.Header>
        <Accordion.Trigger className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-eeg-text hover:bg-eeg-hover transition-colors group">
          <div className="flex items-center gap-2">
            <span className="text-eeg-accent">{icon}</span>
            {title}
          </div>
          <ChevronDown 
            size={16} 
            className="text-eeg-text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" 
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="px-3 pb-3 pt-1 data-[state=open]:animate-slide-in">
        {children}
      </Accordion.Content>
    </Accordion.Item>
  );
}

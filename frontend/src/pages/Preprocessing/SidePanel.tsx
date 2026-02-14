import { useState } from 'react';
import { History, Check, X, ChevronRight } from 'lucide-react';
import { Alert } from '../../components/ui';
import { cn } from '../../utils/cn';
import { useEEGStore } from '../../stores/eegStore';
import { formatTimestamp } from '../../utils/format';
import type { PipelineStep } from '../../types/eeg';

export function SidePanel() {
  const { pipelineSteps, currentStepIndex } = useEEGStore();
  const [isCollapsed, setIsCollapsed] = useState(true);  // 默认收起
  const [selectedStep, setSelectedStep] = useState<PipelineStep | null>(null);

  if (isCollapsed) {
    return (
      <div className="w-10 border-l border-eeg-border bg-eeg-surface flex flex-col items-center py-4">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 hover:bg-eeg-hover rounded text-eeg-text-muted hover:text-eeg-text"
          title="展开面板"
        >
          <History size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-eeg-border bg-eeg-surface flex flex-col relative">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-eeg-border">
        <div className="flex items-center gap-2 text-sm font-medium text-eeg-text">
          <History size={14} className="text-eeg-accent" />
          操作历史
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 hover:bg-eeg-hover rounded text-eeg-text-muted hover:text-eeg-text"
          title="收起面板"
        >
          <X size={16} />
        </button>
      </div>

      {/* 操作历史内容 */}
      <div className="flex-1 flex flex-col overflow-hidden">
          {pipelineSteps.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-eeg-text-muted p-4">
              <div className="text-center">
                <History size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无操作记录</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* 左侧：操作列表 */}
              <div className="w-1/2 border-r border-eeg-border overflow-y-auto p-2">
                <div className="space-y-1">
                  {pipelineSteps.map((step, index) => (
                    <div
                      key={step.id}
                      onClick={() => setSelectedStep(step)}
                      className={cn(
                        'flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors',
                        selectedStep?.id === step.id
                          ? 'bg-eeg-active/20 border border-eeg-active/50'
                          : index <= currentStepIndex && step.status === 'applied'
                          ? 'bg-eeg-bg hover:bg-eeg-hover'
                          : 'bg-eeg-bg/50 opacity-50'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                        step.status === 'applied' 
                          ? 'bg-eeg-success text-white' 
                          : step.status === 'undone'
                          ? 'bg-eeg-text-muted text-eeg-bg'
                          : 'bg-eeg-warning text-white'
                      )}>
                        {step.status === 'applied' ? (
                          <Check size={10} />
                        ) : (
                          <X size={10} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-eeg-text truncate">
                          {getStepLabel(step.type)}
                        </p>
                        <p className="text-[10px] text-eeg-text-muted">
                          {formatTimestamp(step.timestamp)}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-eeg-text-muted flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>

              {/* 右侧：详情面板 */}
              <div className="w-1/2 overflow-y-auto p-3">
                {selectedStep ? (
                  <StepDetails step={selectedStep} />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <Alert variant="info" title="提示" description="选择操作查看详情" />
                  </div>
                )}
              </div>
            </div>
          )}
      </div>

      
    </div>
  );
}

// 操作详情组件
function StepDetails({ step }: { step: PipelineStep }) {
  const params = step.params;
  const result = params._result as Record<string, unknown> | undefined;

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div>
        <h4 className="text-sm font-medium text-eeg-text">{getStepLabel(step.type)}</h4>
        <p className="text-[10px] text-eeg-text-muted">{formatTimestamp(step.timestamp)}</p>
      </div>

      {/* 参数 */}
      <div className="space-y-2">
        <h5 className="text-xs font-medium text-eeg-text-muted">参数</h5>
        <div className="bg-eeg-bg rounded-lg p-2 space-y-1">
          {renderParams(step.type, params)}
        </div>
      </div>

      {/* 结果 */}
      {result && (
        <div className="space-y-2">
          <h5 className="text-xs font-medium text-eeg-text-muted">结果</h5>
          <div className="bg-eeg-success/10 border border-eeg-success/30 rounded-lg p-2 space-y-1">
            {renderResult(step.type, result)}
          </div>
        </div>
      )}
    </div>
  );
}

// 渲染参数
function renderParams(type: string, params: Record<string, unknown>) {
  const items: { label: string; value: string }[] = [];

  switch (type) {
    case 'filter':
      if (params.lowcut) items.push({ label: '高通', value: `${params.lowcut} Hz` });
      if (params.highcut) items.push({ label: '低通', value: `${params.highcut} Hz` });
      if (params.notch) items.push({ label: '陷波', value: `${params.notch} Hz` });
      break;

    case 'resample':
      items.push({ label: '目标采样率', value: `${params.sampleRate} Hz` });
      break;

    case 'rereference':
      const methodLabels: Record<string, string> = {
        average: '平均参考 (CAR)',
        a1a2: 'A1/A2 双耳参考',
        custom: '自定义参考',
      };
      items.push({ label: '方法', value: methodLabels[params.method as string] || String(params.method) });
      if (params.customRef) {
        items.push({ label: '参考电极', value: (params.customRef as string[]).join(', ') });
      }
      break;

    case 'ica':
      const components = params.components as Record<string, boolean> | undefined;
      if (components) {
        const selected = [];
        if (components.eyeBlink) selected.push('眼电');
        if (components.muscle) selected.push('肌电');
        if (components.heart) selected.push('心电');
        if (components.channelNoise) selected.push('噪声');
        items.push({ label: '去除类型', value: selected.join(', ') || '无' });
      }
      items.push({ label: '阈值', value: String(params.threshold) });
      break;

    case 'epoch':
      items.push({ label: '事件 ID', value: (params.eventIds as number[])?.join(', ') || '-' });
      items.push({ label: '时间窗', value: `${params.tmin}s ~ ${params.tmax}s` });
      if (params.reject) items.push({ label: '拒绝阈值', value: `${params.reject} µV` });
      break;

    case 'crop':
      items.push({ label: '起始', value: `${params.tmin}s` });
      items.push({ label: '结束', value: params.tmax ? `${params.tmax}s` : '末尾' });
      break;

    case 'montage':
      items.push({ label: '定位系统', value: String(params.montageName) });
      break;

    case 'bad_channel':
      items.push({ label: '通道', value: String(params.channelName) });
      items.push({ label: '操作', value: params.isBad ? '标记为坏道' : '取消坏道' });
      break;

    default:
      Object.entries(params).forEach(([key, value]) => {
        if (key !== '_result' && value !== undefined && value !== null) {
          items.push({ label: key, value: String(value) });
        }
      });
  }

  if (items.length === 0) {
    return <p className="text-xs text-eeg-text-muted">无参数</p>;
  }

  return items.map((item, idx) => (
    <div key={idx} className="flex justify-between text-xs">
      <span className="text-eeg-text-muted">{item.label}</span>
      <span className="text-eeg-text font-mono">{item.value}</span>
    </div>
  ));
}

// 渲染结果
function renderResult(type: string, result: Record<string, unknown>) {
  const items: { label: string; value: string; highlight?: boolean }[] = [];

  switch (type) {
    case 'ica':
      if (result.excluded_ics) {
        const ics = result.excluded_ics as number[];
        items.push({ 
          label: '去除成分', 
          value: ics.length > 0 ? `IC ${ics.join(', ')}` : '无',
          highlight: true
        });
        items.push({ label: '去除数量', value: `${ics.length} 个` });
      }
      break;

    case 'epoch':
      if (result.n_epochs !== undefined) {
        items.push({ label: '保留 Epochs', value: `${result.n_epochs} 个`, highlight: true });
      }
      if (result.n_dropped !== undefined) {
        items.push({ label: '剔除 Epochs', value: `${result.n_dropped} 个` });
      }
      break;

    case 'filter':
      items.push({ label: '状态', value: '滤波完成', highlight: true });
      break;

    case 'resample':
      items.push({ label: '状态', value: '重采样完成', highlight: true });
      if (result.original_sfreq) {
        items.push({ label: '原采样率', value: `${result.original_sfreq} Hz` });
      }
      break;

    case 'rereference':
      items.push({ label: '状态', value: '重参考完成', highlight: true });
      break;

    case 'montage':
      items.push({ label: '状态', value: '定位加载成功', highlight: true });
      if (result.matched_channels) {
        items.push({ label: '匹配通道', value: `${result.matched_channels} 个` });
      }
      break;

    default:
      Object.entries(result).forEach(([key, value]) => {
        items.push({ label: key, value: String(value) });
      });
  }

  if (items.length === 0) {
    return <p className="text-xs text-eeg-success">操作成功</p>;
  }

  return items.map((item, idx) => (
    <div key={idx} className="flex justify-between text-xs">
      <span className={item.highlight ? 'text-eeg-success' : 'text-eeg-text-muted'}>{item.label}</span>
      <span className={cn('font-mono', item.highlight ? 'text-eeg-success font-medium' : 'text-eeg-text')}>
        {item.value}
      </span>
    </div>
  ));
}

function getStepLabel(type: string): string {
  const labels: Record<string, string> = {
    crop: '数据裁剪',
    resample: '重采样',
    filter: '滤波',
    rereference: '重参考',
    ica: '自动 ICA',
    epoch: '分段',
    bad_channel: '坏道标记',
    drop_channel: '删除通道',
    montage: '电极定位',
  };
  return labels[type] || type;
}

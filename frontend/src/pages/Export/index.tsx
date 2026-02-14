import { useState } from 'react';
import { Check, Plus, Trash2, Download, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { cn } from '../../utils/cn';
import { mockFiles, mockEvents } from '../../mock/eegData';
import { useEEGStore } from '../../stores/eegStore';
import type { ExportRule, MetricType } from '../../types/eeg';

const steps = [
  { id: 1, title: '选择数据', description: '选择参与统计的被试文件' },
  { id: 2, title: '定义条件', description: '选择要导出的实验条件' },
  { id: 3, title: '定义特征', description: '配置特征提取规则' },
  { id: 4, title: '完成', description: '预览并导出结果' },
];

const metricOptions: { value: MetricType; label: string; type: 'time' | 'freq' }[] = [
  { value: 'mean_amplitude', label: 'Mean Amplitude (平均幅值)', type: 'time' },
  { value: 'peak_amplitude_positive', label: 'Peak Amplitude + (正峰值)', type: 'time' },
  { value: 'peak_amplitude_negative', label: 'Peak Amplitude - (负峰值)', type: 'time' },
  { value: 'peak_latency', label: 'Peak Latency (峰值潜伏期)', type: 'time' },
  { value: 'spectral_power', label: 'Spectral Power (频谱功率)', type: 'freq' },
  { value: 'spectral_entropy', label: 'Spectral Entropy (频谱熵)', type: 'freq' },
  { value: 'frequency_ratio', label: 'Frequency Ratio (频率比值)', type: 'freq' },
];

export function ExportPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [rules, setRules] = useState<ExportRule[]>([
    { 
      id: '1', 
      roi: 'frontal', 
      metric: 'mean_amplitude',
      timeWindow: [200, 400],
      freqBand: [8, 12]
    },
  ]);

  const { roiPresets } = useEEGStore();

  const toggleFile = (fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const toggleCondition = (condition: string) => {
    setSelectedConditions(prev =>
      prev.includes(condition)
        ? prev.filter(c => c !== condition)
        : [...prev, condition]
    );
  };

  const addRule = () => {
    setRules(prev => [
      ...prev,
      { 
        id: String(Date.now()), 
        roi: 'frontal', 
        metric: 'mean_amplitude',
        timeWindow: [0, 500],
        freqBand: [8, 12]
      },
    ]);
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<ExportRule>) => {
    setRules(prev =>
      prev.map(r => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const nextStep = () => setCurrentStep(prev => Math.min(4, prev + 1));
  const prevStep = () => setCurrentStep(prev => Math.max(1, prev - 1));

  // 获取当前指标的参数类型
  const getMetricType = (metric: MetricType) => {
    return metricOptions.find(opt => opt.value === metric)?.type || 'time';
  };

  // 生成列名
  const getColumnName = (condition: string, rule: ExportRule) => {
    const roiName = roiPresets.find(p => p.id === rule.roi)?.name || rule.roi;
    const type = getMetricType(rule.metric);
    const param = type === 'time' 
      ? `${rule.timeWindow?.[0]}-${rule.timeWindow?.[1]}ms`
      : `${rule.freqBand?.[0]}-${rule.freqBand?.[1]}Hz`;
    
    return `${condition}_${roiName}_${param}`;
  };

  // ... (Steps 1, 2, 4 保持不变，重点修改 Step 3)
  
  return (
    <div className="h-full flex flex-col">
      {/* 顶部进度指示 (保持不变) */}
      <div className="border-b border-eeg-border bg-eeg-surface px-6 py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between max-w-3xl mx-auto">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                        currentStep > step.id
                          ? 'bg-eeg-success text-white'
                          : currentStep === step.id
                          ? 'bg-eeg-active text-white'
                          : 'bg-eeg-bg text-eeg-text-muted border border-eeg-border'
                      )}
                    >
                      {currentStep > step.id ? <Check size={18} /> : step.id}
                    </div>
                    <div className="mt-2 text-center">
                      <div className={cn(
                        'text-sm font-medium',
                        currentStep >= step.id ? 'text-eeg-text' : 'text-eeg-text-muted'
                      )}>
                        {step.title}
                      </div>
                      <div className="text-xs text-eeg-text-muted hidden sm:block">
                        {step.description}
                      </div>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        'w-20 h-0.5 mx-4 mt-[-24px]',
                        currentStep > step.id ? 'bg-eeg-success' : 'bg-eeg-border'
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0">
            <ThemeToggleButton />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Step 1: 选择数据 (略微简化显示) */}
          {currentStep === 1 && (
            <Card>
              <h3 className="text-lg font-semibold text-eeg-text mb-4">选择参与统计的被试</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-4">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFiles(mockFiles.map(f => f.id))}>全选</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFiles([])}>清空</Button>
                  <span className="text-sm text-eeg-text-muted ml-auto">已选择 {selectedFiles.length} 个文件</span>
                </div>
                {mockFiles.map(file => (
                  <label key={file.id} className={cn('flex items-center gap-3 p-3 rounded-lg cursor-pointer', selectedFiles.includes(file.id) ? 'bg-eeg-active/20 border border-eeg-active/50' : 'bg-eeg-bg hover:bg-eeg-hover')}>
                    <input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={() => toggleFile(file.id)} className="w-4 h-4 rounded bg-eeg-bg text-eeg-active focus:ring-eeg-active" />
                    <span className="text-sm text-eeg-text">{file.name}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {/* Step 2: 定义条件 (略微简化显示) */}
          {currentStep === 2 && (
            <Card>
               <h3 className="text-lg font-semibold text-eeg-text mb-4">选择实验条件</h3>
               <div className="space-y-2">
                {mockEvents.filter(e => e.label).map(event => (
                  <label key={event.id} className={cn('flex items-center gap-3 p-3 rounded-lg cursor-pointer', selectedConditions.includes(event.label!) ? 'bg-eeg-active/20 border border-eeg-active/50' : 'bg-eeg-bg hover:bg-eeg-hover')}>
                    <input type="checkbox" checked={selectedConditions.includes(event.label!)} onChange={() => toggleCondition(event.label!)} className="w-4 h-4 rounded bg-eeg-bg text-eeg-active focus:ring-eeg-active" />
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: event.color }} />
                    <span className="text-sm text-eeg-text">{event.label}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {/* Step 3: 定义特征 (重点修改) */}
          {currentStep === 3 && (
            <Card>
              <h3 className="text-lg font-semibold text-eeg-text mb-4">定义特征提取规则</h3>
              <p className="text-sm text-eeg-text-muted mb-4">
                添加特征提取规则，每条规则将生成一个导出列
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-eeg-border text-eeg-text-muted">
                      <th className="text-left py-2 px-2 font-medium w-1/4">ROI 区域</th>
                      <th className="text-left py-2 px-2 font-medium w-1/4">指标类型</th>
                      <th className="text-left py-2 px-2 font-medium w-1/3">参数配置</th>
                      <th className="text-left py-2 px-2 font-medium w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => {
                      const metricType = getMetricType(rule.metric);
                      return (
                        <tr key={rule.id} className="border-b border-eeg-border/50">
                          <td className="py-2 px-2">
                            <select
                              value={rule.roi}
                              onChange={(e) => updateRule(rule.id, { roi: e.target.value })}
                              className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1.5 text-eeg-text"
                            >
                              {roiPresets.map(preset => (
                                <option key={preset.id} value={preset.id}>{preset.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={rule.metric}
                              onChange={(e) => updateRule(rule.id, { metric: e.target.value as MetricType })}
                              className="w-full bg-eeg-bg border border-eeg-border rounded px-2 py-1.5 text-eeg-text"
                            >
                              {metricOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            {metricType === 'time' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-eeg-text-muted">时间窗:</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={rule.timeWindow?.[0] ?? 0}
                                    onChange={(e) => updateRule(rule.id, { 
                                      timeWindow: [parseInt(e.target.value), rule.timeWindow?.[1] ?? 0] 
                                    })}
                                    className="w-16 bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-eeg-text text-xs"
                                  />
                                  <span className="text-eeg-text-muted">-</span>
                                  <input
                                    type="number"
                                    value={rule.timeWindow?.[1] ?? 0}
                                    onChange={(e) => updateRule(rule.id, { 
                                      timeWindow: [rule.timeWindow?.[0] ?? 0, parseInt(e.target.value)] 
                                    })}
                                    className="w-16 bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-eeg-text text-xs"
                                  />
                                  <span className="text-xs text-eeg-text-muted">ms</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-eeg-text-muted">频段:</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={rule.freqBand?.[0] ?? 0}
                                    onChange={(e) => updateRule(rule.id, { 
                                      freqBand: [parseFloat(e.target.value), rule.freqBand?.[1] ?? 0] 
                                    })}
                                    className="w-16 bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-eeg-text text-xs"
                                  />
                                  <span className="text-eeg-text-muted">-</span>
                                  <input
                                    type="number"
                                    value={rule.freqBand?.[1] ?? 0}
                                    onChange={(e) => updateRule(rule.id, { 
                                      freqBand: [rule.freqBand?.[0] ?? 0, parseFloat(e.target.value)] 
                                    })}
                                    className="w-16 bg-eeg-bg border border-eeg-border rounded px-2 py-1 text-eeg-text text-xs"
                                  />
                                  <span className="text-xs text-eeg-text-muted">Hz</span>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <button
                              onClick={() => removeRule(rule.id)}
                              className="p-1.5 text-eeg-text-muted hover:text-eeg-error transition-colors"
                              disabled={rules.length <= 1}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Button variant="secondary" size="sm" className="mt-4" onClick={addRule}>
                <Plus size={14} className="mr-1" />
                添加新规则
              </Button>
            </Card>
          )}

          {/* Step 4: 完成 */}
          {currentStep === 4 && (
            <Card>
              <h3 className="text-lg font-semibold text-eeg-text mb-4">导出预览</h3>
              {/* 配置摘要 */}
              <div className="space-y-4 mb-6">
                <div className="p-3 bg-eeg-bg rounded-lg">
                  <h4 className="text-sm font-medium text-eeg-text-muted mb-2">配置摘要</h4>
                  <p className="text-sm text-eeg-text">
                    将被试 ({selectedFiles.length}) × 条件 ({selectedConditions.length}) × 规则 ({rules.length}) 导出为宽格式表格。
                  </p>
                </div>
              </div>

              {/* 预览表格 */}
              <div className="overflow-x-auto mb-6">
                <h4 className="text-sm font-medium text-eeg-text mb-2">输出预览</h4>
                <table className="w-full text-xs border border-eeg-border">
                  <thead>
                    <tr className="bg-eeg-bg">
                      <th className="border border-eeg-border px-2 py-1.5 text-left text-eeg-text">Subject</th>
                      {selectedConditions.flatMap(cond =>
                        rules.map(rule => (
                          <th key={`${cond}-${rule.id}`} className="border border-eeg-border px-2 py-1.5 text-left text-eeg-text truncate max-w-[150px]" title={getColumnName(cond, rule)}>
                            {getColumnName(cond, rule)}
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedFiles.slice(0, 3).map((fileId) => {
                      const file = mockFiles.find(f => f.id === fileId);
                      return (
                        <tr key={fileId}>
                          <td className="border border-eeg-border px-2 py-1.5 text-eeg-text">
                            {file?.name.split('_')[0]}
                          </td>
                          {selectedConditions.flatMap(cond =>
                            rules.map(rule => (
                              <td key={`${cond}-${rule.id}`} className="border border-eeg-border px-2 py-1.5 text-eeg-text-muted">
                                {(Math.random() * 10 - 5).toFixed(2)}
                              </td>
                            ))
                          )}
                        </tr>
                      );
                    })}
                    {selectedFiles.length > 3 && (
                      <tr>
                         <td colSpan={1 + selectedConditions.length * rules.length} className="border border-eeg-border px-2 py-1.5 text-eeg-text-muted text-center">...</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <Button className="flex-1" disabled title="功能开发中">
                  <Download size={16} className="mr-1.5" />导出为 CSV
                </Button>
                <Button variant="secondary" className="flex-1" disabled title="功能开发中">
                  <Download size={16} className="mr-1.5" />导出为 Excel
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* 底部导航 (保持不变) */}
      <div className="border-t border-eeg-border bg-eeg-surface px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between">
          <Button variant="secondary" onClick={prevStep} disabled={currentStep === 1}>
            <ChevronLeft size={16} className="mr-1" />
            上一步
          </Button>
          {currentStep < 4 ? (
            <Button onClick={nextStep}>
              下一步
              <ChevronRight size={16} className="ml-1" />
            </Button>
          ) : (
            <Button disabled title="功能开发中">
              <Download size={16} className="mr-1.5" />
              生成并导出
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

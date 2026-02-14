import React, { useState, useEffect } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Tabs from '@radix-ui/react-tabs';
import { 
  X, 
  Check, 
  FolderOpen, 
  Play, 
  Loader2, 
  FileText, 
  Settings,
  Download,
  FolderSearch,
  Layers,
  Filter,
  Activity,
  Zap,
  GitBranch,
  Scissors,
  Radio,
  Tag,
  RefreshCw
} from 'lucide-react';
import { Alert, Button, Input } from './ui';
import { FolderBrowser } from './FolderBrowser';
import { workspaceApi } from '../services/api';
import type { EEGFile } from '../types/eeg';

export interface BatchProcessingConfig {
  selectedFiles: string[];
  preprocessingSteps: PreprocessingStep[];
  outputDir: string;
  outputFormat: 'fif' | 'set' | 'edf';
  exportEpochs: boolean;
}

export interface PreprocessingStep {
  id: string;
  type: 'montage' | 'filter' | 'resample' | 'rereference' | 'ica' | 'crop' | 'epoch' | 'bad_channel';
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface BatchJobProgress {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  currentFile: string | null;
  currentStep: string | null;
  progress: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  errorMessage: string | null;
  results: BatchFileResult[];
}

export interface BatchFileResult {
  filePath: string;
  fileName: string;
  status: 'success' | 'failed' | 'pending';
  outputPath?: string;
  error?: string;
  processingTime?: number;
}

interface BatchProcessingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onReset?: () => void;
  files: EEGFile[];
  workspacePath: string;
  onStartBatch: (config: BatchProcessingConfig) => Promise<void>;
  batchProgress?: BatchJobProgress;
}

interface EventInfo {
  id: number;
  count: number;
  label: string | null;
  color: string | null;
}

const defaultPreprocessingSteps: PreprocessingStep[] = [
  {
    id: 'montage',
    type: 'montage',
    enabled: true,
    params: { montageName: 'standard_1020' }
  },
  {
    id: 'filter',
    type: 'filter',
    enabled: true,
    params: { lowcut: 0.1, highcut: 40, notch: 50 }
  },
  {
    id: 'resample',
    type: 'resample',
    enabled: false,
    params: { sampleRate: 250 }
  },
  {
    id: 'rereference',
    type: 'rereference',
    enabled: true,
    params: { method: 'average', customRef: [] }
  },
  {
    id: 'ica',
    type: 'ica',
    enabled: false,
    params: { 
      components: { eyeBlink: true, muscle: true, heart: false, channelNoise: false },
      threshold: 0.9 
    }
  },
  {
    id: 'crop',
    type: 'crop',
    enabled: false,
    params: { tmin: 0, tmax: null }
  },
  {
    id: 'epoch',
    type: 'epoch',
    enabled: false,
    params: { 
      eventIds: [],
      eventMappings: {},
      tmin: -0.2,
      tmax: 0.8,
      baseline: [-0.2, 0],
      reject: 100
    }
  }
];

export function BatchProcessingDialog({
  isOpen,
  onClose,
  onReset,
  files,
  workspacePath,
  onStartBatch,
  batchProgress
}: BatchProcessingDialogProps) {
  const [activeTab, setActiveTab] = useState('files');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [preprocessingSteps, setPreprocessingSteps] = useState<PreprocessingStep[]>(defaultPreprocessingSteps);
  const [outputDir, setOutputDir] = useState('');
  const [outputFormat, setOutputFormat] = useState<'fif' | 'set' | 'edf'>('fif');
  const [exportEpochs, setExportEpochs] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [eventMappings, setEventMappings] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (workspacePath && !outputDir) {
      setOutputDir(`${workspacePath}/batch_output`);
    }
  }, [workspacePath, outputDir]);

  useEffect(() => {
    if (isOpen) {
      setLoadError(null);
      setFormError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedFiles.length > 0 && events.length === 0 && !isLoadingEvents) {
      loadEventsFromFirstFile();
    }
  }, [selectedFiles]);

  const loadEventsFromFirstFile = async () => {
    if (selectedFiles.length === 0) return;
    
    setIsLoadingEvents(true);
    setLoadError(null);
    
    try {
      const firstFile = selectedFiles[0];
      const result = await workspaceApi.loadData(firstFile);
      
      if (result.events && result.events.length > 0) {
        setEvents(result.events);
        const initialMappings: Record<number, string> = {};
        result.events.forEach(e => {
          if (e.label) {
            initialMappings[e.id] = e.label;
          }
        });
        setEventMappings(initialMappings);
        
        updateStepParams('epoch', { 
          eventIds: result.events.map(e => e.id),
          eventMappings: initialMappings
        });
      } else {
        setEvents([]);
      }
    } catch (error) {
      console.error('加载事件信息失败:', error);
      setLoadError('无法读取选中文件的事件信息，请确保文件格式正确');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
      setEvents([]);
      setEventMappings({});
      updateStepParams('epoch', { eventIds: [], eventMappings: {} });
    } else {
      setSelectedFiles(files.map(f => f.path));
    }
  };

  const toggleFileSelection = (filePath: string) => {
    setSelectedFiles(prev => {
      const newSelection = prev.includes(filePath)
        ? prev.filter(p => p !== filePath)
        : [...prev, filePath];
      
      if (newSelection.length === 0) {
        setEvents([]);
        setEventMappings({});
        updateStepParams('epoch', { eventIds: [], eventMappings: {} });
      }
      
      return newSelection;
    });
  };

  const toggleStep = (stepId: string) => {
    setPreprocessingSteps(prev => 
      prev.map(step => 
        step.id === stepId ? { ...step, enabled: !step.enabled } : step
      )
    );
  };

  const updateStepParams = (stepId: string, newParams: Record<string, unknown>) => {
    setPreprocessingSteps(prev => 
      prev.map(step => 
        step.id === stepId ? { ...step, params: { ...step.params, ...newParams } } : step
      )
    );
  };

  const handleEventMappingChange = (eventId: number, newLabel: string) => {
    setEventMappings(prev => {
      const updated = { ...prev, [eventId]: newLabel };
      updateStepParams('epoch', { eventMappings: updated });
      return updated;
    });
  };

  const toggleEpochEvent = (eventId: number) => {
    const epochStep = preprocessingSteps.find(s => s.id === 'epoch');
    const currentIds = (epochStep?.params?.eventIds as number[]) || [];
    
    const newIds = currentIds.includes(eventId)
      ? currentIds.filter(id => id !== eventId)
      : [...currentIds, eventId];
    
    updateStepParams('epoch', { eventIds: newIds });
  };

  const resetAllState = () => {
    setActiveTab('files');
    setSelectedFiles([]);
    setPreprocessingSteps(defaultPreprocessingSteps);
    setOutputDir(`${workspacePath}/batch_output`);
    setOutputFormat('fif');
    setExportEpochs(false);
    setEvents([]);
    setEventMappings({});
    setLoadError(null);
    
    if (onReset) {
      onReset();
    }
  };

  const handleStartBatch = async () => {
    if (selectedFiles.length === 0) {
      setFormError('请至少选择一个文件');
      return;
    }

    if (!outputDir.trim()) {
      setFormError('请选择输出目录');
      return;
    }

    const enabledSteps = preprocessingSteps.filter(s => s.enabled);
    if (enabledSteps.length === 0) {
      setFormError('请至少启用一个预处理步骤');
      return;
    }

    const epochStep = preprocessingSteps.find(s => s.id === 'epoch');
    if (epochStep?.enabled) {
      const eventIds = epochStep.params?.eventIds as number[] || [];
      if (eventIds.length === 0) {
        setFormError('请至少选择一个要分段的事件');
        setActiveTab('params');
        return;
      }
    }

    if (exportEpochs && !epochStep?.enabled) {
      setFormError('要导出 Epochs 数据，必须先启用分段步骤');
      setExportEpochs(false);
      return;
    }

    setFormError(null);
    setIsStarting(true);
    try {
      await onStartBatch({
        selectedFiles,
        preprocessingSteps: enabledSteps,
        outputDir,
        outputFormat,
        exportEpochs
      });
    } catch (error) {
      console.error('启动批量处理失败:', error);
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = () => {
    if (batchProgress?.status === 'running') {
      if (!confirm('批量处理正在进行中，确定要关闭吗？')) {
        return;
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  const isRunning = batchProgress?.status === 'running';
  const isCompleted = batchProgress?.status === 'completed';
  const hasFailed = batchProgress?.status === 'failed';
  const isCancelled = batchProgress?.status === 'cancelled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-eeg-surface border border-eeg-border rounded-xl shadow-2xl shadow-[var(--color-eeg-shadow)] w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-eeg-border bg-gradient-to-r from-eeg-surface via-eeg-surface to-eeg-active/5">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-eeg-active via-eeg-accent to-eeg-active opacity-70" />
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="p-2.5 bg-eeg-active/15 rounded-xl border border-eeg-active/25 shadow-lg shadow-eeg-active/10">
                <Layers size={22} className="text-eeg-accent" />
              </div>
              {(isRunning || isCompleted) && (
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-eeg-surface ${
                  isRunning ? 'bg-eeg-active animate-pulse' : 'bg-eeg-success'
                }`} />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-eeg-text flex items-center gap-2">
                批量预处理
                {isRunning && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-eeg-active text-white rounded-full animate-pulse">
                    处理中
                  </span>
                )}
                {isCompleted && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-eeg-success text-white rounded-full">
                    已完成
                  </span>
                )}
                {hasFailed && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-eeg-error text-white rounded-full">
                    失败
                  </span>
                )}
              </h2>
              <p className="text-xs text-eeg-text-muted mt-0.5">
                {isRunning 
                  ? `正在处理: ${batchProgress?.currentFile || ''}` 
                  : `已选择 ${selectedFiles.length} 个文件，共 ${preprocessingSteps.filter(s => s.enabled).length} 个步骤`
                }
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2.5 hover:bg-eeg-hover rounded-xl transition-all duration-200 text-eeg-text-muted hover:text-eeg-text hover:shadow-md"
          >
            <X size={20} />
          </button>
        </div>

        {formError && (
          <div className="px-6 pt-4">
            <Alert variant="warning" title="参数检查未通过" description={formError} />
          </div>
        )}

        {(isRunning || isCompleted || hasFailed || isCancelled) && batchProgress && (
          <div className="px-6 py-4 bg-gradient-to-r from-eeg-surface/80 via-eeg-surface to-eeg-surface/80 border-b border-eeg-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {isRunning && <Loader2 size={16} className="animate-spin text-eeg-accent" />}
                <span className="text-sm font-medium text-eeg-text">
                  {isRunning ? '正在批量处理...' : isCompleted ? '处理完成' : hasFailed ? '处理失败' : '已取消'}
                </span>
              </div>
              <span className="text-sm font-semibold text-eeg-accent bg-eeg-active/10 px-3 py-1 rounded-full border border-eeg-active/20">
                {batchProgress.completedFiles} / {batchProgress.totalFiles}
                <span className="text-eeg-text-muted ml-1 font-normal">
                  ({Math.round(batchProgress.progress)}%)
                </span>
              </span>
            </div>
            <div className="w-full h-2.5 bg-eeg-bg rounded-full overflow-hidden border border-eeg-border/50 shadow-inner">
              <div 
                className={`h-full transition-all duration-500 ease-out rounded-full shadow-lg ${
                  hasFailed ? 'bg-gradient-to-r from-eeg-error to-eeg-error/80' : 
                  isCompleted ? 'bg-gradient-to-r from-eeg-success to-eeg-success/80' : 
                  isCancelled ? 'bg-gradient-to-r from-eeg-warning to-eeg-warning/80' : 
                  'bg-gradient-to-r from-eeg-active via-eeg-accent to-eeg-active'
                }`}
                style={{ width: `${batchProgress.progress}%` }}
              />
            </div>
            {batchProgress.errorMessage && (
              <div className="mt-3">
                <Alert variant="error" title="处理失败" description={batchProgress.errorMessage} />
              </div>
            )}
            {hasFailed && batchProgress.failedFiles > 0 && (
              <div className="mt-3">
                <Alert
                  variant="error"
                  title={`${batchProgress.failedFiles} 个文件处理失败`}
                  description="请检查文件格式是否正确，或查看导出设置页面的详细信息"
                />
              </div>
            )}
          </div>
        )}

        <Tabs.Root 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <Tabs.List className="flex border-b border-eeg-border px-6 bg-eeg-surface/50 gap-1">
            <TabTrigger value="files" icon={<FileText size={16} />} label="数据选择" 
              badge={selectedFiles.length > 0 ? selectedFiles.length : undefined} />
            <TabTrigger value="params" icon={<Settings size={16} />} label="参数设置" />
            <TabTrigger value="export" icon={<Download size={16} />} label="导出设置" />
          </Tabs.List>

          <div className="flex-1 overflow-auto p-6">
            <Tabs.Content value="files" className="h-full">
              <FileSelectionTab 
                files={files}
                workspacePath={workspacePath}
                selectedFiles={selectedFiles}
                onToggleSelectAll={toggleSelectAll}
                onToggleFile={toggleFileSelection}
                isLoadingEvents={isLoadingEvents}
                loadError={loadError}
              />
            </Tabs.Content>

            <Tabs.Content value="params" className="h-full">
              <ParameterSettingsTab 
                steps={preprocessingSteps}
                events={events}
                eventMappings={eventMappings}
                onToggleStep={toggleStep}
                onUpdateParams={updateStepParams}
                onEventMappingChange={handleEventMappingChange}
                onToggleEpochEvent={toggleEpochEvent}
              />
            </Tabs.Content>

            <Tabs.Content value="export" className="h-full">
              <ExportSettingsTab 
                outputDir={outputDir}
                onOutputDirChange={setOutputDir}
                outputFormat={outputFormat}
                onFormatChange={setOutputFormat}
                exportEpochs={exportEpochs}
                onExportEpochsChange={setExportEpochs}
                onBrowse={() => setIsBrowserOpen(true)}
                hasEpochStep={preprocessingSteps.find(s => s.id === 'epoch')?.enabled || false}
                batchProgress={batchProgress}
              />
            </Tabs.Content>
          </div>
        </Tabs.Root>

        <div className="flex items-center justify-between px-6 py-4 border-t border-eeg-border bg-gradient-to-r from-eeg-surface via-eeg-surface to-eeg-active/5 rounded-b-xl">
          <div className="flex items-center gap-3">
            {isRunning ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-eeg-active/10 rounded-full border border-eeg-active/20">
                <Loader2 size={14} className="animate-spin text-eeg-accent" />
                <span className="text-sm font-medium text-eeg-text">正在处理中...</span>
              </div>
            ) : isCompleted ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-eeg-success/10 rounded-full border border-eeg-success/20">
                <div className="w-2 h-2 rounded-full bg-eeg-success" />
                <span className="text-sm font-medium text-eeg-success">
                  完成: {batchProgress?.completedFiles} 成功
                  {batchProgress?.failedFiles ? `, ${batchProgress.failedFiles} 失败` : ''}
                </span>
              </div>
            ) : hasFailed ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-eeg-error/10 rounded-full border border-eeg-error/20">
                <div className="w-2 h-2 rounded-full bg-eeg-error" />
                <span className="text-sm font-medium text-eeg-error">
                  失败: {batchProgress?.completedFiles || 0} 成功, {batchProgress?.failedFiles || 0} 失败
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-eeg-bg rounded-full border border-eeg-border">
                  <FileText size={14} className="text-eeg-accent" />
                  <span className="text-sm text-eeg-text">{selectedFiles.length} 个文件</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-eeg-bg rounded-full border border-eeg-border">
                  <Settings size={14} className="text-eeg-accent" />
                  <span className="text-sm text-eeg-text">{preprocessingSteps.filter(s => s.enabled).length} 个步骤</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex gap-3">
            <Button 
              variant="secondary" 
              onClick={handleClose}
              disabled={isStarting}
              className="hover:shadow-md transition-shadow"
            >
              {isRunning ? '隐藏窗口' : '关闭'}
            </Button>
            
            {!isRunning && !isCompleted && !hasFailed && (
              <Button 
                onClick={handleStartBatch}
                disabled={selectedFiles.length === 0 || isStarting}
                isLoading={isStarting}
                className="shadow-lg shadow-eeg-active/20 hover:shadow-xl hover:shadow-eeg-active/30 transition-all"
              >
                <Play size={16} className="mr-2" />
                一键批量预处理
              </Button>
            )}
            
            {(isCompleted || hasFailed) && (
              <Button 
                variant="secondary"
                onClick={resetAllState}
                className="hover:shadow-md transition-shadow"
              >
                <RefreshCw size={16} className="mr-2" />
                新的批量任务
              </Button>
            )}
          </div>
        </div>
      </div>

      <FolderBrowser
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onSelect={(path) => {
          setOutputDir(path);
          setIsBrowserOpen(false);
        }}
      />
    </div>
  );
}

function TabTrigger({ 
  value, 
  icon, 
  label, 
  badge 
}: { 
  value: string; 
  icon: React.ReactNode; 
  label: string;
  badge?: number;
}) {
  return (
    <Tabs.Trigger 
      value={value}
      className="group relative flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium text-eeg-text-muted border-b-2 border-transparent data-[state=active]:text-eeg-accent data-[state=active]:border-eeg-active hover:text-eeg-text transition-all duration-200 rounded-t-lg hover:bg-eeg-hover/30"
    >
      <span className="transition-transform duration-200 group-hover:scale-110 group-data-[state=active]:scale-110">
        {icon}
      </span>
      <span className="group-data-[state=active]:font-semibold">{label}</span>
      {badge !== undefined && (
        <span className="ml-1 px-2 py-0.5 text-[10px] font-semibold bg-eeg-active text-white rounded-full shadow-sm group-data-[state=active]:animate-pulse">
          {badge}
        </span>
      )}
    </Tabs.Trigger>
  );
}

interface FileSelectionTabProps {
  files: EEGFile[];
  workspacePath: string;
  selectedFiles: string[];
  onToggleSelectAll: () => void;
  onToggleFile: (path: string) => void;
  isLoadingEvents: boolean;
  loadError: string | null;
}

function FileSelectionTab({ 
  files, 
  workspacePath,
  selectedFiles, 
  onToggleSelectAll, 
  onToggleFile,
  isLoadingEvents,
  loadError
}: FileSelectionTabProps) {
  const allSelected = files.length > 0 && selectedFiles.length === files.length;
  const someSelected = selectedFiles.length > 0 && selectedFiles.length < files.length;

  return (
    <div className="space-y-4">
      <div className="p-3 bg-eeg-surface border border-eeg-border rounded-lg">
        <label className="text-xs text-eeg-text-muted uppercase tracking-wider font-medium">工作区路径</label>
        <div className="flex items-center gap-2 mt-1 text-sm text-eeg-text">
          <FolderSearch size={16} className="text-eeg-accent" />
          <span className="font-mono truncate">{workspacePath || '未设置'}</span>
        </div>
      </div>

      {loadError && (
        <Alert variant="error" title="读取失败" description={loadError} />
      )}

      {isLoadingEvents && (
        <div className="p-3 bg-eeg-active/5 border border-eeg-active/20 rounded-lg flex items-center gap-2 text-sm text-eeg-text">
          <Loader2 size={16} className="animate-spin text-eeg-accent" />
          正在读取选中文件的事件信息...
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox.Root
            className="flex h-5 w-5 appearance-none items-center justify-center rounded bg-eeg-surface border-2 border-eeg-border data-[state=checked]:bg-eeg-active data-[state=checked]:border-eeg-active outline-none transition-colors"
            checked={allSelected}
            onCheckedChange={onToggleSelectAll}
          >
            <Checkbox.Indicator className="text-white">
              <Check size={12} strokeWidth={3} />
            </Checkbox.Indicator>
          </Checkbox.Root>
          <span className="text-sm text-eeg-text font-medium">
            {allSelected ? '取消全选' : '全选所有文件'}
          </span>
          {someSelected && (
            <span className="text-xs text-eeg-accent">
              已选 {selectedFiles.length} / {files.length}
            </span>
          )}
        </div>
        
        <div className="text-xs text-eeg-text-muted">
          共 {files.length} 个文件
        </div>
      </div>

      <div className="border border-eeg-border rounded-lg bg-eeg-surface overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          {files.length === 0 ? (
            <div className="p-8 text-center text-eeg-text-muted">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p>暂无扫描到的文件</p>
              <p className="text-xs mt-1">请先在工作区扫描文件夹</p>
            </div>
          ) : (
            <div className="divide-y divide-eeg-border">
              {files.map((file, index) => (
                <FileListItem 
                  key={file.id}
                  file={file}
                  index={index}
                  isSelected={selectedFiles.includes(file.path)}
                  onToggle={() => onToggleFile(file.path)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-eeg-active/5 border border-eeg-active/20 rounded-lg">
          <div className="text-sm">
            <span className="text-eeg-text-muted">已选择 </span>
            <span className="font-semibold text-eeg-accent">{selectedFiles.length}</span>
            <span className="text-eeg-text-muted"> 个文件</span>
          </div>
          <div className="w-px h-4 bg-eeg-border" />
          <div className="text-sm text-eeg-text-muted">
            预计处理时间: {Math.ceil(selectedFiles.length * 0.5)} 分钟
          </div>
        </div>
      )}
    </div>
  );
}

function FileListItem({ 
  file, 
  index, 
  isSelected, 
  onToggle 
}: { 
  file: EEGFile; 
  index: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const formatColors: Record<string, string> = {
    edf: 'bg-eeg-active/15 text-eeg-active',
    set: 'bg-eeg-success/15 text-eeg-success',
    fif: 'bg-eeg-accent/15 text-eeg-accent'
  };

  const formatLabels: Record<string, string> = {
    edf: 'EDF',
    set: 'SET',
    fif: 'FIF'
  };

  return (
    <div 
      className={`flex items-center gap-3 px-4 py-3 hover:bg-eeg-hover/50 transition-colors cursor-pointer ${
        isSelected ? 'bg-eeg-active/5' : ''
      }`}
      onClick={onToggle}
    >
      <Checkbox.Root
        className="flex h-4 w-4 appearance-none items-center justify-center rounded bg-eeg-bg border border-eeg-border data-[state=checked]:bg-eeg-active data-[state=checked]:border-eeg-active outline-none"
        checked={isSelected}
        onCheckedChange={onToggle}
      >
        <Checkbox.Indicator className="text-white">
          <Check size={10} strokeWidth={4} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      
      <span className="text-xs text-eeg-text-muted w-6 text-right">{index + 1}</span>
      
      <FileText size={16} className="text-eeg-accent flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <div className="text-sm text-eeg-text truncate">{file.name}</div>
        <div className="text-xs text-eeg-text-muted truncate">{file.path}</div>
      </div>
      
      <span className={`px-2 py-0.5 text-xs rounded font-medium ${formatColors[file.format] || 'bg-eeg-border/40 text-eeg-text-muted'}`}>
        {formatLabels[file.format] || file.format.toUpperCase()}
      </span>
      
      <span className="text-xs text-eeg-text-muted w-20 text-right">
        {(file.size / 1024 / 1024).toFixed(1)} MB
      </span>
    </div>
  );
}

interface ParameterSettingsTabProps {
  steps: PreprocessingStep[];
  events: EventInfo[];
  eventMappings: Record<number, string>;
  onToggleStep: (id: string) => void;
  onUpdateParams: (id: string, params: Record<string, unknown>) => void;
  onEventMappingChange: (eventId: number, label: string) => void;
  onToggleEpochEvent: (eventId: number) => void;
}

function ParameterSettingsTab({ 
  steps, 
  events,
  eventMappings,
  onToggleStep, 
  onUpdateParams,
  onEventMappingChange,
  onToggleEpochEvent
}: ParameterSettingsTabProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-eeg-text-muted mb-4">
        选择要应用的预处理步骤，并设置每个步骤的参数。步骤将按照顺序依次执行。
      </div>

      <div className="space-y-3">
        <StepCard 
          step={steps.find(s => s.id === 'montage')!}
          icon={<Radio size={18} />}
          title="电极定位 (Montage)"
          description="加载标准电极位置信息"
          onToggle={() => onToggleStep('montage')}
        >
          <MontageParams 
            params={steps.find(s => s.id === 'montage')!.params}
            onChange={(p) => onUpdateParams('montage', p)}
          />
        </StepCard>

        <StepCard 
          step={steps.find(s => s.id === 'filter')!}
          icon={<Filter size={18} />}
          title="滤波 (Filter)"
          description="应用高通、低通和陷波滤波器"
          onToggle={() => onToggleStep('filter')}
        >
          <FilterParams 
            params={steps.find(s => s.id === 'filter')!.params}
            onChange={(p) => onUpdateParams('filter', p)}
          />
        </StepCard>

        <StepCard 
          step={steps.find(s => s.id === 'resample')!}
          icon={<Activity size={18} />}
          title="重采样 (Resample)"
          description="降低采样率以减少数据量"
          onToggle={() => onToggleStep('resample')}
        >
          <ResampleParams 
            params={steps.find(s => s.id === 'resample')!.params}
            onChange={(p) => onUpdateParams('resample', p)}
          />
        </StepCard>

        <StepCard 
          step={steps.find(s => s.id === 'rereference')!}
          icon={<GitBranch size={18} />}
          title="重参考 (Rereference)"
          description="重新设置参考电极"
          onToggle={() => onToggleStep('rereference')}
        >
          <RereferenceParams 
            params={steps.find(s => s.id === 'rereference')!.params}
            onChange={(p) => onUpdateParams('rereference', p)}
          />
        </StepCard>

        <StepCard 
          step={steps.find(s => s.id === 'ica')!}
          icon={<Zap size={18} />}
          title="全自动 ICA"
          description="自动识别并去除伪迹成分"
          onToggle={() => onToggleStep('ica')}
        >
          <ICAParams 
            params={steps.find(s => s.id === 'ica')!.params}
            onChange={(p) => onUpdateParams('ica', p)}
          />
        </StepCard>

        <StepCard 
          step={steps.find(s => s.id === 'crop')!}
          icon={<Scissors size={18} />}
          title="数据裁剪 (Crop)"
          description="裁剪数据的时间范围"
          onToggle={() => onToggleStep('crop')}
        >
          <CropParams 
            params={steps.find(s => s.id === 'crop')!.params}
            onChange={(p) => onUpdateParams('crop', p)}
          />
        </StepCard>

        <StepCard 
          step={steps.find(s => s.id === 'epoch')!}
          icon={<Layers size={18} />}
          title="分段 (Epoching)"
          description="根据事件将数据分段"
          onToggle={() => onToggleStep('epoch')}
        >
          <EpochParams 
            step={steps.find(s => s.id === 'epoch')!}
            events={events}
            eventMappings={eventMappings}
            onChange={(p) => onUpdateParams('epoch', p)}
            onEventMappingChange={onEventMappingChange}
            onToggleEpochEvent={onToggleEpochEvent}
          />
        </StepCard>
      </div>
    </div>
  );
}

function StepCard({ 
  step, 
  icon, 
  title, 
  description, 
  children,
  onToggle
}: { 
  step: PreprocessingStep;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${
      step.enabled ? 'border-eeg-active bg-eeg-active/5' : 'border-eeg-border bg-eeg-surface'
    }`}>
      <div 
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-eeg-hover/30 transition-colors"
        onClick={onToggle}
      >
        <Checkbox.Root
          className="flex h-5 w-5 appearance-none items-center justify-center rounded bg-eeg-bg border-2 border-eeg-border data-[state=checked]:bg-eeg-active data-[state=checked]:border-eeg-active outline-none"
          checked={step.enabled}
          onCheckedChange={onToggle}
        >
          <Checkbox.Indicator className="text-white">
            <Check size={12} strokeWidth={3} />
          </Checkbox.Indicator>
        </Checkbox.Root>
        
        <span className={`${step.enabled ? 'text-eeg-accent' : 'text-eeg-text-muted'}`}>
          {icon}
        </span>
        
        <div className="flex-1">
          <div className={`font-medium ${step.enabled ? 'text-eeg-text' : 'text-eeg-text-muted'}`}>
            {title}
          </div>
          <div className="text-xs text-eeg-text-muted">{description}</div>
        </div>
        
        <div className={`px-2 py-1 text-xs rounded-full ${
          step.enabled ? 'bg-eeg-active text-white' : 'bg-eeg-border text-eeg-text-muted'
        }`}>
          {step.enabled ? '已启用' : '已禁用'}
        </div>
      </div>
      
      {step.enabled && (
        <div className="px-4 pb-4 pt-2 border-t border-eeg-border/50">
          {children}
        </div>
      )}
    </div>
  );
}

function MontageParams({ params, onChange }: { params: any, onChange: (p: any) => void }) {
  return (
    <div>
      <label className="block text-sm text-eeg-text mb-2">电极定位系统</label>
      <select
        value={params.montageName}
        onChange={(e) => onChange({ montageName: e.target.value })}
        className="w-full bg-eeg-bg border border-eeg-border rounded-md px-3 py-2 text-sm text-eeg-text"
      >
        <option value="standard_1020">Standard 10-20</option>
        <option value="standard_1010">Standard 10-10</option>
        <option value="standard_1005">Standard 10-05</option>
        <option value="biosemi64">BioSemi 64</option>
        <option value="biosemi128">BioSemi 128</option>
      </select>
    </div>
  );
}

function FilterParams({ params, onChange }: { params: any, onChange: (p: any) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className="block text-xs text-eeg-text-muted mb-1">高通 (Hz)</label>
        <Input
          type="number"
          value={params.lowcut}
          onChange={(e) => onChange({ lowcut: parseFloat(e.target.value) })}
          className="text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-eeg-text-muted mb-1">低通 (Hz)</label>
        <Input
          type="number"
          value={params.highcut}
          onChange={(e) => onChange({ highcut: parseFloat(e.target.value) })}
          className="text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-eeg-text-muted mb-1">陷波 (Hz)</label>
        <Input
          type="number"
          value={params.notch}
          onChange={(e) => onChange({ notch: parseFloat(e.target.value) })}
          className="text-sm"
        />
      </div>
    </div>
  );
}

function ResampleParams({ params, onChange }: { params: any, onChange: (p: any) => void }) {
  return (
    <div>
      <label className="block text-sm text-eeg-text mb-2">目标采样率 (Hz)</label>
      <select
        value={params.sampleRate}
        onChange={(e) => onChange({ sampleRate: parseInt(e.target.value) })}
        className="w-full bg-eeg-bg border border-eeg-border rounded-md px-3 py-2 text-sm text-eeg-text"
      >
        <option value={128}>128 Hz</option>
        <option value={250}>250 Hz</option>
        <option value={500}>500 Hz</option>
        <option value={1000}>1000 Hz</option>
      </select>
    </div>
  );
}

function RereferenceParams({ params, onChange }: { params: any, onChange: (p: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-eeg-text mb-2">参考方式</label>
        <select
          value={params.method}
          onChange={(e) => onChange({ method: e.target.value })}
          className="w-full bg-eeg-bg border border-eeg-border rounded-md px-3 py-2 text-sm text-eeg-text"
        >
          <option value="average">CAR (平均参考)</option>
          <option value="a1a2">A1/A2 (双耳/乳突)</option>
          <option value="custom">自定义电极</option>
        </select>
      </div>
      {params.method === 'custom' && (
        <div>
          <label className="block text-xs text-eeg-text-muted mb-1">自定义电极 (逗号分隔)</label>
          <Input
            value={params.customRef?.join(', ') || ''}
            onChange={(e) => onChange({ customRef: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
            placeholder="例如: TP9, TP10"
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

function ICAParams({ params, onChange }: { params: any, onChange: (p: any) => void }) {
  const components = params.components;
  
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-eeg-text mb-2">去除伪迹类别</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'eyeBlink', label: '眼电 (Eye Blink)' },
            { key: 'muscle', label: '肌电 (Muscle)' },
            { key: 'heart', label: '心电 (Heart)' },
            { key: 'channelNoise', label: '通道噪声' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 p-2 rounded bg-eeg-bg border border-eeg-border cursor-pointer hover:border-eeg-accent/50">
              <input
                type="checkbox"
                checked={components[key]}
                onChange={(e) => onChange({ 
                  components: { ...components, [key]: e.target.checked }
                })}
                className="accent-eeg-active"
              />
              <span className="text-sm text-eeg-text">{label}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div>
        <label className="block text-sm text-eeg-text mb-1">
          阈值: {params.threshold.toFixed(2)}
        </label>
        <input
          type="range"
          min="0.5"
          max="0.99"
          step="0.01"
          value={params.threshold}
          onChange={(e) => onChange({ threshold: parseFloat(e.target.value) })}
          className="w-full accent-eeg-active"
        />
        <div className="flex justify-between text-xs text-eeg-text-muted mt-1">
          <span>0.5</span>
          <span>0.99</span>
        </div>
      </div>
    </div>
  );
}

function CropParams({ params, onChange }: { params: any, onChange: (p: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs text-eeg-text-muted mb-1">起始时间 (s)</label>
        <Input
          type="number"
          value={params.tmin}
          onChange={(e) => onChange({ tmin: parseFloat(e.target.value) })}
          className="text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-eeg-text-muted mb-1">结束时间 (s)</label>
        <Input
          type="number"
          value={params.tmax || ''}
          onChange={(e) => onChange({ tmax: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="末尾"
          className="text-sm"
        />
      </div>
    </div>
  );
}

interface EpochParamsProps {
  step: PreprocessingStep;
  events: EventInfo[];
  eventMappings: Record<number, string>;
  onChange: (p: any) => void;
  onEventMappingChange: (eventId: number, label: string) => void;
  onToggleEpochEvent: (eventId: number) => void;
}

function EpochParams({ step, events, eventMappings, onChange, onEventMappingChange, onToggleEpochEvent }: EpochParamsProps) {
  const selectedIds = (step.params?.eventIds as number[]) || [];
  
  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <Alert variant="warning" title="提示" description="请先选择数据文件以加载事件信息" />
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-eeg-text mb-2">
              事件重命名
            </label>
            <div className="max-h-32 overflow-y-auto border border-eeg-border rounded-md bg-eeg-bg p-2 space-y-2">
              {events.map(event => (
                <div key={event.id} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: event.color || '#58a6ff' }}
                  />
                  <span className="text-xs text-eeg-text-muted w-10 flex-shrink-0">
                    ID: {event.id}
                  </span>
                  <Input
                    value={eventMappings[event.id] !== undefined ? eventMappings[event.id] : (event.label || `event_${event.id}`)}
                    onChange={(e) => onEventMappingChange(event.id, e.target.value)}
                    placeholder={`event_${event.id}`}
                    className="text-xs flex-1"
                  />
                  <span className="text-xs text-eeg-text-muted w-8 text-right flex-shrink-0">
                    ×{event.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-eeg-text mb-2">
              选择要分段的事件 <span className="text-eeg-error">*</span>
            </label>
            <div className="max-h-32 overflow-y-auto border border-eeg-border rounded-md bg-eeg-bg p-2 space-y-1">
              {events.map(event => (
                <div key={event.id} className="flex items-center gap-2">
                  <Checkbox.Root
                    className="flex h-4 w-4 appearance-none items-center justify-center rounded bg-eeg-surface border border-eeg-border data-[state=checked]:bg-eeg-active data-[state=checked]:border-eeg-active outline-none"
                    checked={selectedIds.includes(event.id)}
                    onCheckedChange={() => onToggleEpochEvent(event.id)}
                    id={`batch-event-${event.id}`}
                  >
                    <Checkbox.Indicator className="text-white">
                      <Check size={10} strokeWidth={4} />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  <label 
                    htmlFor={`batch-event-${event.id}`} 
                    className="text-sm text-eeg-text cursor-pointer select-none flex-1 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: event.color || '#58a6ff' }} />
                    {eventMappings[event.id] || event.label || `Event ${event.id}`} 
                    <span className="text-eeg-text-muted text-xs">({event.count})</span>
                  </label>
                </div>
              ))}
            </div>
            {selectedIds.length === 0 && (
              <div className="mt-2 text-xs text-eeg-error">
                请至少选择一个事件进行分段
              </div>
            )}
          </div>
        </>
      )}
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-eeg-text-muted mb-1">起始 (s)</label>
          <Input
            type="number"
            step="0.1"
            value={String(step.params?.tmin ?? -0.2)}
            onChange={(e) => onChange({ tmin: parseFloat(e.target.value) })}
            className="text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-eeg-text-muted mb-1">结束 (s)</label>
          <Input
            type="number"
            step="0.1"
            value={String(step.params?.tmax ?? 0.8)}
            onChange={(e) => onChange({ tmax: parseFloat(e.target.value) })}
            className="text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-eeg-text-muted mb-1">坏段阈值 (µV)</label>
        <Input
          type="number"
          value={String(step.params?.reject ?? 100)}
          onChange={(e) => onChange({ reject: parseFloat(e.target.value) })}
          className="text-sm"
        />
      </div>
    </div>
  );
}

interface ExportSettingsTabProps {
  outputDir: string;
  onOutputDirChange: (path: string) => void;
  outputFormat: 'fif' | 'set' | 'edf';
  onFormatChange: (format: 'fif' | 'set' | 'edf') => void;
  exportEpochs: boolean;
  onExportEpochsChange: (value: boolean) => void;
  onBrowse: () => void;
  hasEpochStep: boolean;
  batchProgress?: BatchJobProgress;
}

function ExportSettingsTab({ 
  outputDir, 
  onOutputDirChange,
  outputFormat, 
  onFormatChange,
  exportEpochs,
  onExportEpochsChange,
  onBrowse,
  hasEpochStep,
  batchProgress
}: ExportSettingsTabProps) {
  const hasFailedFiles = batchProgress?.failedFiles && batchProgress.failedFiles > 0;
  
  return (
    <div className="space-y-6">
      {hasFailedFiles && (
        <Alert
          variant="error"
          title="部分文件处理失败"
          description={`${batchProgress?.failedFiles} 个文件处理失败。失败原因可能包括：文件格式不兼容或损坏、事件标记与预期不符、内存不足或处理超时。请检查输出目录中的错误日志或重新尝试。`}
        />
      )}

      <div className="p-4 bg-eeg-surface border border-eeg-border rounded-lg">
        <label className="block text-sm font-medium text-eeg-text mb-3">
          输出目录
        </label>
        <div className="flex gap-2">
          <Input
            value={outputDir}
            onChange={(e) => onOutputDirChange(e.target.value)}
            placeholder="选择输出文件夹"
            leftIcon={<FolderOpen size={16} />}
            className="flex-1"
          />
          <Button variant="secondary" onClick={onBrowse}>
            浏览
          </Button>
        </div>
        <p className="text-xs text-eeg-text-muted mt-2">
          处理后的文件将保存到此目录，保持原始文件名
        </p>
      </div>

      <div className="p-4 bg-eeg-surface border border-eeg-border rounded-lg">
        <label className="block text-sm font-medium text-eeg-text mb-3">
          导出格式
        </label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'fif', label: 'FIF', desc: 'MNE 原生（推荐）' },
            { value: 'set', label: 'SET', desc: 'EEGLAB 格式' },
            { value: 'edf', label: 'EDF', desc: '标准格式' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => onFormatChange(f.value as any)}
              className={`p-3 rounded-lg border text-left transition-all ${
                outputFormat === f.value
                  ? 'border-eeg-accent bg-eeg-active/10 text-eeg-accent'
                  : 'border-eeg-border hover:border-eeg-accent/50 text-eeg-text'
              }`}
            >
              <div className="font-medium text-sm">{f.label}</div>
              <div className="text-xs text-eeg-text-muted mt-1">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 bg-eeg-surface border border-eeg-border rounded-lg">
        <label className="block text-sm font-medium text-eeg-text mb-3">
          导出内容
        </label>
        <div className="space-y-2">
          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
            !exportEpochs ? 'border-eeg-accent bg-eeg-active/10' : 'border-eeg-border'
          }`}>
            <input
              type="radio"
              checked={!exportEpochs}
              onChange={() => onExportEpochsChange(false)}
              className="accent-eeg-active"
            />
            <div>
              <div className="text-sm font-medium text-eeg-text">Raw 数据</div>
              <div className="text-xs text-eeg-text-muted">连续数据（所有预处理后的数据）</div>
            </div>
          </label>
          <label className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
            exportEpochs && hasEpochStep ? 'border-eeg-accent bg-eeg-active/10' : 'border-eeg-border'
          } ${!hasEpochStep ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="radio"
              checked={exportEpochs && hasEpochStep}
              onChange={() => hasEpochStep && onExportEpochsChange(true)}
              disabled={!hasEpochStep}
              className="accent-eeg-active"
            />
            <div>
              <div className="text-sm font-medium text-eeg-text">
                Epochs 数据
                {!hasEpochStep && <span className="text-eeg-error ml-2 text-xs">(未启用分段步骤)</span>}
              </div>
              <div className="text-xs text-eeg-text-muted">
                {hasEpochStep ? '分段后的数据' : '请先启用分段步骤才能导出 Epochs'}
              </div>
            </div>
          </label>
        </div>
      </div>

      <div className="p-4 bg-eeg-active/5 border border-eeg-active/20 rounded-lg">
        <div className="flex items-start gap-3">
          <Tag size={18} className="text-eeg-accent mt-0.5" />
          <div>
            <div className="text-sm font-medium text-eeg-text mb-1">文件命名规则</div>
            <div className="text-xs text-eeg-text-muted space-y-1">
              <p>原始文件名: <code className="bg-eeg-bg px-1 rounded">subject_01.set</code></p>
              <p>输出文件名: <code className="bg-eeg-bg px-1 rounded">subject_01_processed.{outputFormat}</code></p>
              <p className="mt-2 text-eeg-accent">
                所有文件将自动添加 "_processed" 后缀以区分原始数据
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

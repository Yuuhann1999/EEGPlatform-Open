import { useState, useEffect, useCallback, useRef } from 'react';
import { Eye, EyeOff, Loader2, FileAudio, Clock, Radio, Activity, FolderSearch, Search, FolderOpen, ChevronDown, ChevronRight, FileText, Circle, Download } from 'lucide-react';
import { Alert, Button, Input } from '../../components/ui';
import { FolderBrowser } from '../../components/FolderBrowser';
import { ExportDialog } from '../../components/ExportDialog';
import { BatchProcessingDialog, type BatchProcessingConfig, type BatchJobProgress } from '../../components/BatchProcessingDialog';
import { PipelineControls } from './PipelineControls';
import { WaveformViewer } from './WaveformViewer';
import { SidePanel } from './SidePanel';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { useEEGStore } from '../../stores/eegStore';
import { waveformApi, preprocessingApi, workspaceApi, batchApi, type BatchJobStatus } from '../../services/api';
import { generateMockWaveform, mockFiles, mockDataInfo, mockEvents } from '../../mock/eegData';
import type { WaveformData, EEGFile } from '../../types/eeg';
import { formatDuration } from '../../utils/format';
import { cn } from '../../utils/cn';
import { convertApiDataInfo, convertApiEvents } from '../../utils/apiMappers';

export function PreprocessingPage() {
  const [showOverlay, setShowOverlay] = useState(false);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // 批量处理状态
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchJobProgress | undefined>(undefined);

  // 自动清除成功消息
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // 工作区状态
  const [workspacePath, setWorkspacePath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [useApi, setUseApi] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

  
  // 使用ref跟踪epoch模式，避免依赖循环
  const isEpochModeRef = useRef(false);
  
  const { 
    sessionId,
    selectedFile,
    selectFile,
    files,
    setFiles,
    waveformData,
    preProcessingWaveform,
    setWaveformData, 
    savePreProcessingWaveform,
    clearPreProcessingWaveform,
    toggleBadChannel,
    currentData,
    setCurrentData,
    viewTimeRange,
    setViewTimeRange,
    updateMontageStatus,
    setSessionId,
    events: _events,
    setEvents,
    isLoading: _isLoading,
    setLoading,
  } = useEEGStore();

  // 选择文件夹
  const handleSelectFolder = async (path: string) => {
    setWorkspacePath(path);
    setIsBrowserOpen(false);
    if (path.trim()) {
      setIsScanning(true);
      setError(null);
      
      try {
        if (useApi) {
          const result = await workspaceApi.scanDirectory(path);
          const convertedFiles: EEGFile[] = result.files.map(f => ({
            id: f.id,
            name: f.name,
            path: f.path,
            format: f.format,
            size: f.size,
            status: f.status,
            modifiedAt: f.modified_at,
          }));
          setFiles(convertedFiles);
          
          if (convertedFiles.length === 0) {
            setError('未找到支持的 EEG 文件 (.edf, .set, .fif)');
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          setFiles(mockFiles);
        }
      } catch (err: any) {
        console.warn('API 调用失败，使用 Mock 数据:', err);
        setError('无法连接到后端服务，已切换到演示模式');
        setFiles(mockFiles);
        setUseApi(false);
      } finally {
        setIsScanning(false);
      }
    }
  };

  // 加载文件
  const handleLoadFile = useCallback(async (file: EEGFile) => {
    setLoading(true);
    setError(null);
    selectFile(file);
    
    try {
      if (useApi) {
        const result = await workspaceApi.loadData(file.path);
        setSessionId(result.session_id);
        setCurrentData(convertApiDataInfo(result.info));
        setEvents(convertApiEvents(result.events));
      } else {
        await new Promise(resolve => setTimeout(resolve, 300));
        setCurrentData(mockDataInfo);
        setEvents(mockEvents);
      }
    } catch (err: any) {
      console.warn('加载数据失败:', err);
      setError(`加载失败: ${err.message || '未知错误'}，已切换到演示模式`);
      setCurrentData(mockDataInfo);
      setEvents(mockEvents);
      setUseApi(false);
    } finally {
      setLoading(false);
    }
  }, [useApi, setSessionId, setCurrentData, setEvents, setLoading, selectFile]);

  // 从后端获取波形数据
  const fetchWaveform = useCallback(async (startTime: number = 0, duration: number = 10, forceEpochMode?: boolean) => {
    if (!sessionId) {
      const data = generateMockWaveform(startTime, startTime + duration, 250);
      setWaveformData(data);
      return;
    }

    setIsLoadingWaveform(true);
    setError(null);
    
    try {
      const isEpochMode = forceEpochMode !== undefined ? forceEpochMode : isEpochModeRef.current;
      const actualDuration = isEpochMode ? Math.min(duration, 20) : duration;
      const actualStartTime = isEpochMode ? Math.max(0, Math.floor(startTime)) : startTime;
      
      const response = await waveformApi.getWaveform(sessionId, actualStartTime, actualDuration);
      
      const convertedData: WaveformData = {
        timeRange: response.time_range,
        sampleRate: response.sample_rate,
        channels: response.channels.map(ch => ({
          name: ch.name,
          data: ch.data,
          isBad: ch.is_bad,
        })),
        events: response.events.map(e => ({
          time: e.time,
          id: e.id,
          label: e.label || undefined,
        })),
        isEpoch: response.is_epoch || false,
        nEpochs: response.n_epochs,
      };
      
      isEpochModeRef.current = convertedData.isEpoch || false;
      setWaveformData(convertedData);
    } catch (err: any) {
      console.error('获取波形数据失败:', err);
      
      const isSessionError = (err as any)?.status === 404 || 
                            (err.message && (err.message.includes('会话不存在') || err.message.includes('404') || err.message.includes('Session') || err.message.includes('不存在')));
      
      if (isSessionError) {
        setError('会话已失效（可能因为后端重启），请返回工作区重新加载数据文件');
        setSessionId(null);
        setWaveformData(null);
      } else {
        setError(`加载波形失败: ${err.message}`);
        const data = generateMockWaveform(startTime, startTime + duration, 250);
        setWaveformData(data);
      }
    } finally {
      setIsLoadingWaveform(false);
    }
  }, [sessionId, setWaveformData, setSessionId]);

  const isInitializedRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (sessionId) {
      if (lastSessionIdRef.current !== sessionId) {
        isInitializedRef.current = false;
        lastSessionIdRef.current = sessionId;
      }
      isInitializedRef.current = true;
      fetchWaveform(viewTimeRange[0], viewTimeRange[1] - viewTimeRange[0]);
    } else {
      isInitializedRef.current = false;
      lastSessionIdRef.current = null;
    }
  }, [sessionId, fetchWaveform]);

  const waveformDataRef = useRef(waveformData);
  const sessionIdRef = useRef(sessionId);
  const fetchWaveformRef = useRef(fetchWaveform);
  
  useEffect(() => {
    waveformDataRef.current = waveformData;
    sessionIdRef.current = sessionId;
    fetchWaveformRef.current = fetchWaveform;
  }, [waveformData, sessionId, fetchWaveform]);

  useEffect(() => {
    if (isInitializedRef.current && sessionIdRef.current && waveformDataRef.current) {
      const start = viewTimeRange[0];
      const duration = viewTimeRange[1] - viewTimeRange[0];
      const forceEpochMode = waveformDataRef.current.isEpoch || false;
      fetchWaveformRef.current(start, duration, forceEpochMode);
    }
  }, [viewTimeRange]);

  const refreshDataInfo = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      const result = await workspaceApi.getSessionInfo(sessionId);
      if (result.info) {
        setCurrentData({
          subjectId: result.info.subject_id,
          measurementDate: result.info.measurement_date || '',
          duration: result.info.duration,
          fileSize: result.info.file_size,
          channelCount: result.info.channel_count,
          sampleRate: result.info.sample_rate,
          highpassFilter: result.info.highpass_filter,
          lowpassFilter: result.info.lowpass_filter,
          badChannels: result.info.bad_channels,
          hasMontage: result.info.has_montage,
          hasEpochs: (result.info as any).has_epochs ?? false,
          epochEventIds: (result.info as any).epoch_event_ids ?? [],
          epochTmin: (result.info as any).epoch_tmin ?? null,
          epochTmax: (result.info as any).epoch_tmax ?? null,
          channels: result.info.channels.map(ch => ({
            name: ch.name,
            type: ch.type,
            isBad: ch.is_bad,
            position: ch.position || undefined,
          })),
        });
      }
    } catch (err: any) {
      console.error('刷新数据信息失败:', err);
      const isSessionError = (err as any)?.status === 404 || 
                            (err.message && (err.message.includes('会话不存在') || err.message.includes('404') || err.message.includes('Session') || err.message.includes('不存在')));
      
      if (isSessionError) {
        setError('会话已失效，请返回工作区重新加载数据文件');
        setSessionId(null);
      }
    }
  }, [sessionId, setCurrentData, setSessionId, setError]);

  const handlePreprocessingAction = useCallback(async (
    action: string, 
    params: Record<string, unknown>
  ): Promise<boolean> => {
    if (!sessionId) {
      setError('请先加载数据文件');
      return false;
    }

    setIsProcessing(true);
    setError(null);
    savePreProcessingWaveform();

    try {
      let result;
      
      switch (action) {
        case 'filter':
          result = await preprocessingApi.applyFilter(
            sessionId,
            params.lowcut as number | null,
            params.highcut as number | null,
            params.notch as number | null
          );
          break;
        
        case 'resample':
          result = await preprocessingApi.applyResample(
            sessionId,
            params.sampleRate as number
          );
          break;
        
        case 'rereference':
          result = await preprocessingApi.applyRereference(
            sessionId,
            params.method as 'average' | 'a1a2' | 'custom',
            params.customRef as string[] | undefined
          );
          break;
        
        case 'ica':
          const excludeLabels = [];
          const components = params.components as Record<string, boolean>;
          if (components.eyeBlink) excludeLabels.push('eye blink');
          if (components.muscle) excludeLabels.push('muscle artifact');
          if (components.heart) excludeLabels.push('heart beat');
          if (components.channelNoise) excludeLabels.push('channel noise');
          
          result = await preprocessingApi.applyICA(
            sessionId,
            excludeLabels,
            params.threshold as number
          );
          break;
        
        case 'epoch':
          const eventIds = (params.eventIds as number[]) || [];
          result = await preprocessingApi.createEpochs(
            sessionId,
            eventIds,
            params.tmin as number,
            params.tmax as number,
            params.baseline as [number, number] | null,
            params.reject as number | null
          );
          break;
        
        case 'crop':
          result = await preprocessingApi.cropData(
            sessionId,
            params.tmin as number,
            params.tmax as number | null
          );
          break;
        
        case 'montage':
          result = await preprocessingApi.setMontage(
            sessionId,
            params.montageName as string
          );
          if (result.success) {
            updateMontageStatus(true);
          }
          break;
        
        case 'bad_channel':
          result = await preprocessingApi.setBadChannel(
            sessionId,
            params.channelName as string,
            params.isBad as boolean
          );
          break;
        
        default:
          throw new Error(`未知操作: ${action}`);
      }

      if (result.success) {
        params._result = result.data || {};
        
        if (action === 'epoch') {
          const nEpochs = result.data?.n_epochs || 0;
          
          if (nEpochs === 0) {
            const suggestion = result.data?.suggestion || '建议降低reject阈值或检查数据质量';
            setError(`⚠ ${result.message || '所有epochs都被剔除'}。${suggestion}`);
          } else {
            isEpochModeRef.current = true;
            setViewTimeRange([0, 10]);
            try {
              await fetchWaveform(0, 10, true);
            } catch (waveformErr: any) {
              console.warn('刷新波形失败（不影响主操作）:', waveformErr);
              const isSessionError = (waveformErr as any)?.status === 404 || 
                                    (waveformErr.message && (waveformErr.message.includes('会话不存在') || waveformErr.message.includes('404') || waveformErr.message.includes('Session') || waveformErr.message.includes('不存在')));
              if (isSessionError) {
                setError('⚠ 操作成功，但会话已失效（可能因为后端重启）。请返回工作区重新加载数据文件。');
                setSessionId(null);
              }
            }
          }
        } else {
          try {
            // 如果已经处于 epoch 模式（分段后），后续操作（如重参考）也应刷新 epoch 波形
            const forceEpochMode = isEpochModeRef.current;
            await fetchWaveform(viewTimeRange[0], viewTimeRange[1] - viewTimeRange[0], forceEpochMode);
          } catch (waveformErr: any) {
            console.warn('刷新波形失败（不影响主操作）:', waveformErr);
            const isSessionError = (waveformErr as any)?.status === 404 || 
                                  (waveformErr.message && (waveformErr.message.includes('会话不存在') || waveformErr.message.includes('404') || waveformErr.message.includes('Session') || waveformErr.message.includes('不存在')));
            if (isSessionError) {
              setError('⚠ 操作成功，但会话已失效（可能因为后端重启）。请返回工作区重新加载数据文件。');
              setSessionId(null);
            }
          }
        }
        
        if (['crop', 'resample', 'filter', 'ica', 'rereference', 'epoch', 'montage'].includes(action)) {
          try {
            await refreshDataInfo();
          } catch (refreshErr: any) {
            console.warn('刷新数据信息失败（不影响主操作）:', refreshErr);
            const isSessionError = (refreshErr as any)?.status === 404 || 
                                  (refreshErr.message && (refreshErr.message.includes('会话不存在') || refreshErr.message.includes('404') || refreshErr.message.includes('Session') || refreshErr.message.includes('不存在')));
            if (isSessionError) {
              setError('⚠ 操作成功，但会话已失效（可能因为后端重启）。请返回工作区重新加载数据文件。');
              setSessionId(null);
            }
          }
        }
        
        return true;
      } else {
        setError(result.message || '操作失败');
        return false;
      }
    } catch (err: any) {
      console.error(`预处理操作 ${action} 失败:`, err);
      
      const isSessionError = err?.status === 404 || 
                            (err.message && (err.message.includes('会话不存在') || err.message.includes('404') || err.message.includes('Session') || err.message.includes('不存在')));
      
      const isEpochError = err.message && (
        err.message.includes('所有epochs都被剔除') || 
        err.message.includes('epochs都被剔除') ||
        err.message.includes('超出范围')
      );
      
      if (isSessionError) {
        setError('会话已失效，请重新加载数据文件');
        setSessionId(null);
      } else if (isEpochError && action === 'epoch') {
        const errorMsg = err.message || '所有epochs都被剔除';
        setError(`⚠ ${errorMsg}。建议：降低坏段阈值（例如提高到 50-100 µV）或检查数据质量。`);
      } else {
        setError(`操作失败: ${err.message || '未知错误'}`);
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, fetchWaveform, viewTimeRange, setSessionId]);

  const handleUndo = useCallback(async () => {
    if (!sessionId) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const result = await preprocessingApi.undo(sessionId);
      if (result.success) {
        clearPreProcessingWaveform();
        await refreshDataInfo();
        isEpochModeRef.current = false;
        setViewTimeRange([0, 10]);
        await fetchWaveform(0, 10, false);
      } else {
        setError(result.message || '撤销失败');
      }
    } catch (err: any) {
      console.error('撤销失败:', err);
      setError(`撤销失败: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, fetchWaveform, refreshDataInfo, clearPreProcessingWaveform]);

  const handleRedo = useCallback(async () => {
    if (!sessionId) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const result = await preprocessingApi.redo(sessionId);
      if (result.success) {
        await fetchWaveform(0, viewTimeRange[1] - viewTimeRange[0]);
        await refreshDataInfo();
      } else {
        setError(result.message || '重做失败');
      }
    } catch (err: any) {
      console.error('重做失败:', err);
      setError(`重做失败: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, fetchWaveform, viewTimeRange, refreshDataInfo]);

  const handleTimeRangeChange = useCallback((start: number, end: number) => {
    setViewTimeRange([start, end]);
  }, [setViewTimeRange]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const statusColors = {
    unprocessed: 'text-eeg-text-muted',
    processing: 'text-eeg-processing animate-pulse',
    completed: 'text-eeg-success',
  };

  // 批量预处理处理函数
  const handleStartBatchProcessing = async (config: BatchProcessingConfig) => {
    console.log('开始批量预处理:', config);
    
    try {
      // 调用后端 API 启动批量处理任务
      const response = await batchApi.startBatch({
        file_paths: config.selectedFiles,
        preprocessing_steps: config.preprocessingSteps,
        output_dir: config.outputDir,
        output_format: config.outputFormat,
        export_epochs: config.exportEpochs
      });
      
      const jobId = response.job_id;
      console.log('批量处理任务已启动, jobId:', jobId);
      
      // 初始化本地进度状态
      const totalFiles = config.selectedFiles.length;
      const initialProgress: BatchJobProgress = {
        totalFiles,
        completedFiles: 0,
        failedFiles: 0,
        currentFile: null,
        currentStep: null,
        progress: 0,
        status: 'running',
        errorMessage: null,
        results: config.selectedFiles.map(path => ({
          filePath: path,
          fileName: path.split('/').pop() || path,
          status: 'pending'
        }))
      };
      setBatchProgress(initialProgress);
      
      // 使用 SSE 订阅实时进度
      const eventSource = batchApi.subscribeProgress(
        jobId,
        (status: BatchJobStatus) => {
          // 转换后端状态到前端格式
          const progress: BatchJobProgress = {
            totalFiles: status.total_files,
            completedFiles: status.completed_files,
            failedFiles: status.failed_files,
            currentFile: status.current_file,
            currentStep: status.current_step,
            progress: status.progress,
            status: status.status,
            errorMessage: status.error_message,
            results: status.results.map(r => ({
              filePath: r.file_path,
              fileName: r.file_name,
              status: r.status,
              outputPath: r.output_path,
              error: r.error,
              processingTime: r.processing_time
            }))
          };
          setBatchProgress(progress);
          
          // 如果任务完成，关闭 EventSource
          if (['completed', 'failed', 'cancelled'].includes(status.status)) {
            eventSource.close();
            if (status.status === 'completed') {
              setSuccess(`批量处理完成！成功: ${status.completed_files} 个文件${status.failed_files > 0 ? `, 失败: ${status.failed_files} 个文件` : ''}`);
            } else if (status.status === 'failed') {
              setError(`批量处理失败: ${status.error_message || '未知错误'}`);
            }
          }
        },
        (error) => {
          console.error('SSE 连接错误:', error);
          eventSource.close();
        }
      );
      
    } catch (error) {
      console.error('启动批量处理失败:', error);
      setError(`启动批量处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 文件夹浏览对话框 */}
      <FolderBrowser
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onSelect={handleSelectFolder}
      />

      {/* 顶部数据信息栏 - 浓缩显示 */}
      <div className="flex-shrink-0 h-10 px-4 bg-eeg-surface border-b border-eeg-border flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm">
          <FileAudio size={16} className="text-eeg-accent" />
          <span className="text-eeg-text font-medium">
            {selectedFile?.name || '未选择文件'}
          </span>
        </div>
        
        {currentData && (
          <>
            <div className="w-px h-5 bg-eeg-border" />
            
            <div className="flex items-center gap-4 text-xs text-eeg-text-muted">
              <span className="flex items-center gap-1">
                <Radio size={12} />
                {currentData.channelCount} 通道
              </span>
              <span className="flex items-center gap-1">
                <Activity size={12} />
                {currentData.sampleRate} Hz
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatDuration(currentData.duration)}
              </span>
              {currentData.badChannels.length > 0 && (
                <span className="flex items-center gap-1 text-eeg-error">
                  {currentData.badChannels.length} 坏道
                </span>
              )}
            </div>
          </>
        )}
        
        <div className="ml-auto flex items-center gap-4">
          {!sessionId && (
            <span className="text-xs text-eeg-warning">
              请先选择并加载数据文件
            </span>
          )}

          {/* API状态 */}
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${useApi ? 'bg-eeg-success' : 'bg-eeg-warning'}`} />
            <span className="text-eeg-text-muted">
              {useApi ? '后端已连接' : '演示模式'}
            </span>
          </div>

          {/* 主题切换 */}
          <ThemeToggleButton />
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 左栏：文件浏览 + 操作流程 */}
        <div className="w-64 flex-shrink-0 flex flex-col border-r border-eeg-border">
          {/* 文件选择区域 - 可折叠 */}
          <div className="flex-shrink-0 border-b border-eeg-border">
            {/* 路径输入 */}
            <div className="p-2 space-y-2">
              <div className="flex gap-1">
                <Input
                  value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  placeholder="输入或选择文件夹路径"
                  leftIcon={<FolderSearch size={14} />}
                  className="text-xs"
                />
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => setIsBrowserOpen(true)}
                  title="浏览"
                  className="px-2"
                >
                  <FolderOpen size={14} />
                </Button>
              </div>
              
              <Button 
                className="w-full" 
                size="sm"
                onClick={() => handleSelectFolder(workspacePath)}
                isLoading={isScanning}
                disabled={!workspacePath.trim()}
              >
                <Search size={14} className="mr-1" />
                扫描
              </Button>
            </div>
            
            {/* 文件树 - 紧凑显示 */}
            {files.length > 0 && (
              <div className="max-h-48 overflow-auto px-2 pb-2">
                <div
                  className="flex items-center gap-1 px-1 py-1 cursor-pointer hover:bg-eeg-hover rounded text-xs"
                  onClick={() => toggleFolder('root')}
                >
                  {expandedFolders.has('root') ? (
                    <ChevronDown size={12} className="text-eeg-text-muted" />
                  ) : (
                    <ChevronRight size={12} className="text-eeg-text-muted" />
                  )}
                  <span className="text-eeg-text font-medium">文件 ({files.length})</span>
                </div>
                
                {expandedFolders.has('root') && (
                  <div className="ml-3 space-y-0.5">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className={cn(
                          'flex items-center gap-1 px-1 py-1 rounded cursor-pointer transition-colors text-xs',
                          selectedFile?.id === file.id
                            ? 'bg-eeg-active/20 text-eeg-accent'
                            : 'hover:bg-eeg-hover'
                        )}
                        onClick={() => selectFile(file)}
                        onDoubleClick={() => handleLoadFile(file)}
                        title="双击加载"
                      >
                        <FileText size={12} className="text-eeg-accent flex-shrink-0" />
                        <span className="text-eeg-text truncate flex-1">{file.name}</span>
                        <Circle size={6} className={cn('fill-current flex-shrink-0', statusColors[file.status])} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 预处理操作面板 */}
          <div className="flex-1 min-h-0 overflow-auto">
            <PipelineControls 
              onAction={handlePreprocessingAction}
              onUndo={handleUndo}
              onRedo={handleRedo}
              isProcessing={isProcessing}
              onOpenBatchProcessing={() => setShowBatchDialog(true)}
            />
          </div>
        </div>

        {/* 中栏：实时波形浏览器 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 顶部工具条 */}
          <div className="h-12 border-b border-eeg-border bg-eeg-surface px-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-medium text-eeg-text">波形浏览器</h2>
              {sessionId ? (
                <span className="text-xs text-eeg-success flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-eeg-success" />
                  实时数据
                </span>
              ) : (
                <span className="text-xs text-eeg-warning flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-eeg-warning" />
                  演示模式
                </span>
              )}
              {isLoadingWaveform && (
                <Loader2 size={14} className="animate-spin text-eeg-accent" />
              )}
              {isProcessing && (
                <span className="text-xs text-eeg-accent flex items-center gap-1">
                  <Loader2 size={14} className="animate-spin" />
                  处理中...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowExportDialog(true)}
                disabled={!sessionId}
                title="导出当前处理阶段的数据"
              >
                <Download size={16} className="mr-1.5" />
                导出
              </Button>
              <Button
                variant={showOverlay ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setShowOverlay(!showOverlay)}
              >
                {showOverlay ? <Eye size={16} className="mr-1.5" /> : <EyeOff size={16} className="mr-1.5" />}
                叠加对比
              </Button>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mx-4 mt-2">
              <Alert variant="error" title="错误" description={error} />
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className="mx-4 mt-2">
              <Alert variant="success" title="成功" description={success} />
            </div>
          )}

          {/* 波形视图 */}
          <div className="flex-1 min-h-0 p-4">
            <WaveformViewer 
              data={waveformData}
              preProcessingData={showOverlay ? preProcessingWaveform : null}
              onBadChannelToggle={toggleBadChannel}
              showOverlay={showOverlay}
              totalDuration={currentData?.duration}
              onTimeRangeChange={handleTimeRangeChange}
            />
          </div>
        </div>

        {/* 右栏：辅助面板 */}
        <SidePanel />
      </div>

      {/* 导出对话框 */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        sessionId={sessionId}
        hasEpochs={currentData?.hasEpochs ?? false}
      />

      {/* 批量预处理对话框 */}
      <BatchProcessingDialog
        isOpen={showBatchDialog}
        onClose={() => {
          setShowBatchDialog(false);
        }}
        onReset={() => {
          setBatchProgress(undefined);
        }}
        files={files}
        workspacePath={workspacePath}
        onStartBatch={handleStartBatchProcessing}
        batchProgress={batchProgress}
      />
    </div>
  );
}

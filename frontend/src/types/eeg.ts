// EEG 数据类型定义

export interface EEGFile {
  id: string;
  name: string;
  path: string;
  format: 'edf' | 'set' | 'fif';
  size: number;
  status: 'unprocessed' | 'processing' | 'completed';
  modifiedAt: string;
}

export interface EEGDataInfo {
  subjectId: string;
  measurementDate: string;
  duration: number; // seconds
  fileSize: number; // bytes
  channelCount: number;
  sampleRate: number;
  highpassFilter: number | null;
  lowpassFilter: number | null;
  badChannels: string[];
  channels: ChannelInfo[];
  hasMontage: boolean; // 新增：是否包含电极定位信息
  hasEpochs?: boolean; // 是否已分段（epochs）
  epochEventIds?: number[]; // epochs中包含的事件ID（用于TFR/ERP选择）
  epochTmin?: number | null; // seconds
  epochTmax?: number | null; // seconds
}

export interface ChannelInfo {
  name: string;
  type: 'EEG' | 'EOG' | 'EMG' | 'ECG' | 'STIM' | 'OTHER';
  isBad: boolean;
  position?: ElectrodePosition;
}

export interface ElectrodePosition {
  x: number;
  y: number;
  z?: number;
}

export interface EventTrigger {
  id: number;
  count: number;
  label?: string;
  color?: string;
}

export interface WaveformData {
  timeRange: [number, number];
  sampleRate: number;
  channels: {
    name: string;
    data: number[];
    isBad: boolean;
  }[];
  events?: {
    time: number;
    id: number;
    label?: string;
  }[];
  isEpoch?: boolean;  // 是否为epoch模式
  nEpochs?: number;  // epoch模式下，epoch总数
}

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  params: Record<string, unknown>;
  timestamp: string;
  status: 'pending' | 'applied' | 'undone';
}

export type PipelineStepType = 
  | 'crop'
  | 'resample' // 独立
  | 'filter'   // 独立
  | 'rereference'
  | 'ica'
  | 'epoch'
  | 'bad_channel'
  | 'drop_channel';

export interface ROIPreset {
  id: string;
  name: string;
  channels: string[];
}

export interface ExportRule {
  id: string;
  roi: string;
  metric: MetricType;
  // 参数根据 metric 类型动态变化
  timeWindow?: [number, number]; // 用于时域特征 (ms)
  freqBand?: [number, number];   // 用于频域特征 (Hz)
}

export type MetricType = 
  | 'mean_amplitude'
  | 'peak_amplitude_positive'
  | 'peak_amplitude_negative'
  | 'peak_latency'
  | 'spectral_power'
  | 'spectral_entropy'
  | 'frequency_ratio';

export interface BatchJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  totalFiles: number;
  completedFiles: number;
  errors: BatchError[];
  logs: BatchLog[];
}

export interface BatchError {
  file: string;
  message: string;
  timestamp: string;
}

export interface BatchLog {
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
}

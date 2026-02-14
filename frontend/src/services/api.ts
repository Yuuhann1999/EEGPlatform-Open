/**
 * API 服务层 - 封装与后端的所有通信
 */

// 动态获取 API 地址：打包后使用同源地址，开发时使用 8088 端口
const isDev = window.location.port === '5173';  // Vite 开发服务器端口
export const API_BASE_URL = isDev 
  ? 'http://localhost:8088/api'  // 开发模式
  : `${window.location.origin}/api`;  // 生产模式（打包后）

// ============ 通用请求方法 ============

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '请求失败' }));
    const errorMessage = error.detail || error.message || `HTTP ${response.status}`;
    const errorWithStatus = new Error(errorMessage);
    (errorWithStatus as any).status = response.status;
    throw errorWithStatus;
  }

  return response.json();
}

// ============ 类型定义 ============

export interface FileInfo {
  id: string;
  name: string;
  path: string;
  format: 'edf' | 'set' | 'fif';
  size: number;
  status: 'unprocessed' | 'processing' | 'completed';
  modified_at: string;
}

export interface ChannelInfo {
  name: string;
  type: 'EEG' | 'EOG' | 'EMG' | 'ECG' | 'STIM' | 'OTHER';
  is_bad: boolean;
  position: { x: number; y: number; z: number } | null;
}

export interface EEGDataInfo {
  subject_id: string;
  measurement_date: string | null;
  duration: number;
  file_size: number;
  channel_count: number;
  sample_rate: number;
  highpass_filter: number | null;
  lowpass_filter: number | null;
  bad_channels: string[];
  channels: ChannelInfo[];
  has_montage: boolean;
  has_epochs?: boolean;
  epoch_event_ids?: number[];
  epoch_tmin?: number | null;
  epoch_tmax?: number | null;
}

export interface EventInfo {
  id: number;
  count: number;
  label: string | null;
  color: string | null;
}

export interface WaveformChannel {
  name: string;
  data: number[];
  is_bad: boolean;
}

export interface WaveformEvent {
  time: number;
  id: number;
  label: string | null;
}

export interface WaveformData {
  time_range: [number, number];
  sample_rate: number;
  channels: WaveformChannel[];
  events: WaveformEvent[];
  is_epoch?: boolean;
  n_epochs?: number;
}

export interface ERPData {
  times: number[];
  conditions: Record<string, { data: number[]; stderr: number[] }>;
  channel_data?: Record<string, Record<string, { data: number[]; stderr: number[] }>>; // {event_name: {channel_name: {data, stderr}}}
}

export interface PSDData {
  frequencies: number[];
  power: number[]; // 平均模式
  channels?: Record<string, number[]>; // Butterfly模式：{channel_name: [power...]}
}

export interface TopomapData {
  channel_names: string[];
  positions: Array<{ x: number; y: number; z: number }>; // 新增 z 坐标
  values: number[];
  vmin: number;
  vmax: number;
  image_base64?: string; // 新增：MNE渲染的PNG图像（base64编码）
}

export interface TopoAnimationFrame {
  time_ms: number;
  values?: number[];  // 每个通道的电位值 - Canvas风格
  image_base64?: string;  // MNE渲染的PNG图像 - MNE风格
}

export interface TopoAnimationResponse {
  frames: TopoAnimationFrame[];
  channel_names?: string[];  // 通道名称列表 - Canvas风格
  positions?: Array<{ x: number; y: number; z: number }>;  // 电极位置 - Canvas风格
  frame_count: number;
  duration_ms: number;
  interval_ms: number;
  render_mode: 'data' | 'image';  // 标识渲染模式
}

export interface TFRResult {
  times: number[]; // ms
  freqs: number[]; // Hz
  power: number[][]; // [freq][time] (channels avg)
  channel_names?: string[];
  power_by_channel?: number[][][]; // [ch][freq][time]
  // MNE 渲染模式输出
  image_base64?: string; // ROI平均图像（base64 PNG）
  images_by_channel?: Record<string, string>; // 每通道图像 {ch_name: base64}
  vmin?: number; // 实际颜色范围
  vmax?: number;
  render_mode?: 'data' | 'image';
}

export interface TFRStartResponse {
  job_id: string;
}

export interface TFRJobResponse {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  error?: string | null;
  result?: TFRResult | null;
}

export interface OperationResponse {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface BrowseItem {
  name: string;
  path: string;
  type: 'drive' | 'directory' | 'file' | 'parent';
  extension?: string;
  size?: number;
}

export interface CommonPath {
  name: string;
  path: string;
}

// ============ 文件系统 API ============

export const filesystemApi = {
  /**
   * 浏览目录
   */
  async browse(path?: string): Promise<{ items: BrowseItem[]; current_path: string }> {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return request(`/filesystem/browse${params}`);
  },

  /**
   * 获取用户主目录
   */
  async getHomeDirectory(): Promise<{ path: string }> {
    return request('/filesystem/home');
  },

  /**
   * 获取常用路径
   */
  async getCommonPaths(): Promise<{ paths: CommonPath[] }> {
    return request('/filesystem/common-paths');
  },
};

// ============ 工作区 API ============

export const workspaceApi = {
  /**
   * 扫描目录
   */
  async scanDirectory(path: string): Promise<{ files: FileInfo[]; total_count: number }> {
    return request('/workspace/scan', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  /**
   * 加载数据文件
   */
  async loadData(filePath: string): Promise<{
    info: EEGDataInfo;
    events: EventInfo[];
    session_id: string;
  }> {
    return request('/workspace/load', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    });
  },

  /**
   * 获取会话信息
   */
  async getSessionInfo(sessionId: string): Promise<{
    info: EEGDataInfo;
    events: EventInfo[];
    history: unknown[];
  }> {
    return request(`/workspace/session/${sessionId}/info`);
  },

  /**
   * 关闭会话
   */
  async closeSession(sessionId: string): Promise<{ message: string }> {
    return request(`/workspace/session/${sessionId}`, {
      method: 'DELETE',
    });
  },
};

// ============ 波形数据 API ============

export const waveformApi = {
  /**
   * 获取波形数据
   */
  async getWaveform(
    sessionId: string,
    startTime: number = 0,
    duration: number = 10,
    targetSampleRate: number = 250
  ): Promise<WaveformData> {
    return request('/waveform/get', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        start_time: startTime,
        duration: duration,
        target_sample_rate: targetSampleRate,
      }),
    });
  },
};

// ============ 预处理 API ============

export const preprocessingApi = {
  /**
   * 应用滤波
   */
  async applyFilter(
    sessionId: string,
    lFreq: number | null,
    hFreq: number | null,
    notchFreq: number | null
  ): Promise<OperationResponse> {
    return request('/preprocessing/filter', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        l_freq: lFreq,
        h_freq: hFreq,
        notch_freq: notchFreq,
      }),
    });
  },

  /**
   * 应用重采样
   */
  async applyResample(
    sessionId: string,
    targetSfreq: number
  ): Promise<OperationResponse> {
    return request('/preprocessing/resample', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        target_sfreq: targetSfreq,
      }),
    });
  },

  /**
   * 应用重参考
   */
  async applyRereference(
    sessionId: string,
    method: 'average' | 'a1a2' | 'custom',
    customRef?: string[]
  ): Promise<OperationResponse> {
    return request('/preprocessing/rereference', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        method,
        custom_ref: customRef,
      }),
    });
  },

  /**
   * 应用 ICA
   */
  async applyICA(
    sessionId: string,
    excludeLabels: string[],
    threshold: number,
    nComponents?: number
  ): Promise<OperationResponse> {
    return request('/preprocessing/ica', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        exclude_labels: excludeLabels,
        threshold,
        n_components: nComponents,
      }),
    });
  },

  /**
   * 创建 Epochs
   */
  async createEpochs(
    sessionId: string,
    eventIds: number[],
    tmin: number,
    tmax: number,
    baseline: [number, number] | null,
    rejectThreshold: number | null
  ): Promise<OperationResponse> {
    return request('/preprocessing/epochs', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        event_ids: eventIds,
        tmin,
        tmax,
        baseline,
        reject_threshold: rejectThreshold,
      }),
    });
  },

  /**
   * 裁剪数据
   */
  async cropData(
    sessionId: string,
    tmin: number,
    tmax: number | null
  ): Promise<OperationResponse> {
    return request('/preprocessing/crop', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        tmin,
        tmax,
      }),
    });
  },

  /**
   * 设置坏道
   */
  async setBadChannel(
    sessionId: string,
    channelName: string,
    isBad: boolean
  ): Promise<OperationResponse> {
    return request('/preprocessing/bad-channel', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        channel_name: channelName,
        is_bad: isBad,
      }),
    });
  },

  /**
   * 设置电极定位
   */
  async setMontage(
    sessionId: string,
    montageName: string
  ): Promise<OperationResponse> {
    return request('/preprocessing/montage', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        montage_name: montageName,
      }),
    });
  },

  /**
   * 撤销上一步操作
   */
  async undo(sessionId: string): Promise<OperationResponse> {
    return request('/preprocessing/undo', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  /**
   * 重做上一步撤销的操作
   */
  async redo(sessionId: string): Promise<OperationResponse> {
    return request('/preprocessing/redo', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  },
};

// ============ 可视化 API ============

export const visualizationApi = {
  /**
   * 获取 ERP 数据
   */
  async getERPData(
    sessionId: string,
    channels: string[],
    eventIds?: number[],
    perChannel?: boolean
  ): Promise<ERPData> {
    return request('/visualization/erp', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        channels,
        event_ids: eventIds,
        per_channel: perChannel || false,
      }),
    });
  },

  /**
   * 获取 PSD 数据
   */
  async getPSDData(
    sessionId: string,
    channels: string[],
    fmin: number = 1,
    fmax: number = 50,
    average: boolean = true
  ): Promise<PSDData> {
    return request('/visualization/psd', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        channels,
        fmin,
        fmax,
        average,
      }),
    });
  },

  /**
   * 获取地形图数据
   */
  async getTopomapData(
    sessionId: string,
    timePoint?: number, // ms
    freqBand?: [number, number], // Hz
    timeWindow?: [number, number | undefined], // seconds
    interpolation?: 'linear' | 'cubic' | 'spline', // 新增：插值方法
    contours?: number, // 新增：等高线数量
    sensors?: boolean, // 新增：是否显示电极标记
    renderMode?: 'data' | 'image' // 新增：渲染模式
  ): Promise<TopomapData> {
    return request('/visualization/topomap', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        time_point: timePoint,
        freq_band: freqBand,
        time_window: timeWindow,
        interpolation: interpolation || 'linear', // 新增
        contours: contours || 8, // 新增
        sensors: sensors !== undefined ? sensors : true, // 新增
        render_mode: renderMode || 'data', // 新增
      }),
    });
  },

  /**
   * 提交 TFR 后台任务（支持 Canvas/MNE 双渲染模式）
   */
  async startTFRJob(params: {
    sessionId: string;
    channels: string[];
    eventId?: number;
    fmin: number;
    fmax: number;
    nCycles: number;
    baseline?: [number, number];
    baselineMode: 'logratio' | 'ratio' | 'zscore' | 'percent';
    decim: number;
    // 新增：渲染模式相关参数
    renderMode?: 'data' | 'image';
    colormap?: string;
    vmin?: number;
    vmax?: number;
  }): Promise<TFRStartResponse> {
    return request('/visualization/tfr/start', {
      method: 'POST',
      body: JSON.stringify({
        session_id: params.sessionId,
        channels: params.channels,
        event_id: params.eventId,
        fmin: params.fmin,
        fmax: params.fmax,
        n_cycles: params.nCycles,
        baseline: params.baseline,
        baseline_mode: params.baselineMode,
        decim: params.decim,
        render_mode: params.renderMode || 'data',
        colormap: params.colormap || 'RdBu_r',
        vmin: params.vmin,
        vmax: params.vmax,
      }),
    });
  },

  /**
   * 获取地形图动画帧
   */
  async getTopoAnimation(
    sessionId: string,
    startTime: number,
    endTime: number,
    frameInterval: number = 20,
    renderMode: 'data' | 'image' = 'data',  // 新增：渲染模式
    interpolation: 'linear' | 'cubic' | 'spline' = 'linear',
    contours: number = 8,
    sensors: boolean = true
  ): Promise<TopoAnimationResponse> {
    return request('/visualization/topomap/animation', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        start_time: startTime,
        end_time: endTime,
        frame_interval: frameInterval,
        render_mode: renderMode,  // 新增
        interpolation,
        contours,
        sensors,
      }),
    });
  },

  /**
   * 查询 TFR 任务状态/结果
   */
  async getTFRJob(jobId: string): Promise<TFRJobResponse> {
    return request(`/visualization/tfr/${jobId}`, {
      method: 'GET',
    });
  },

  /**
   * 取消 TFR 任务
   */
  async cancelTFRJob(jobId: string): Promise<{ success: boolean; message: string }> {
    return request(`/visualization/tfr/${jobId}/cancel`, {
      method: 'POST',
    });
  },
};

// ============ 批量处理 API ============

export interface PreprocessingStepConfig {
  id: string;
  type: 'montage' | 'filter' | 'resample' | 'rereference' | 'ica' | 'crop' | 'epoch' | 'bad_channel';
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface BatchProcessingRequest {
  file_paths: string[];
  preprocessing_steps: PreprocessingStepConfig[];
  output_dir: string;
  output_format: 'fif' | 'set' | 'edf';
  export_epochs: boolean;
}

export interface BatchFileResult {
  file_path: string;
  file_name: string;
  status: 'success' | 'failed' | 'pending';
  output_path?: string;
  error?: string;
  processing_time?: number;
}

export interface BatchJobStatus {
  job_id: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_files: number;
  completed_files: number;
  failed_files: number;
  current_file: string | null;
  current_step: string | null;
  progress: number;
  error_message: string | null;
  results: BatchFileResult[];
  created_at: string;
  updated_at: string | null;
}

export interface BatchProcessingResponse {
  job_id: string;
  message: string;
  total_files: number;
}

export const batchApi = {
  /**
   * 启动批量处理任务
   */
  async startBatch(batchRequest: BatchProcessingRequest): Promise<BatchProcessingResponse> {
    return request('/batch/start', {
      method: 'POST',
      body: JSON.stringify(batchRequest),
    });
  },

  /**
   * 获取批量处理任务状态
   */
  async getBatchStatus(jobId: string): Promise<BatchJobStatus> {
    return request(`/batch/status/${jobId}`);
  },

  /**
   * 取消批量处理任务
   */
  async cancelBatch(jobId: string): Promise<{ message: string; job_id: string }> {
    return request(`/batch/cancel/${jobId}`, {
      method: 'POST',
    });
  },

  /**
   * 订阅批量处理进度 (SSE)
   * 返回 EventSource 实例，前端需要自行管理连接
   */
  subscribeProgress(jobId: string, onProgress: (status: BatchJobStatus) => void, onError?: (error: Event) => void): EventSource {
    const eventSource = new EventSource(`${API_BASE_URL}/batch/progress/${jobId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const status: BatchJobStatus = JSON.parse(event.data);
        onProgress(status);
      } catch (e) {
        console.error('解析进度数据失败:', e);
      }
    };
    
    if (onError) {
      eventSource.onerror = onError;
    }
    
    return eventSource;
  },
};

// ============ 导出 API ============

export interface DataExportRequest {
  session_id: string;
  format: 'fif' | 'set' | 'edf';
  output_path?: string;
  export_epochs?: boolean;
}

export interface DataExportResponse {
  success: boolean;
  message: string;
  data?: {
    output_path: string;
    format: string;
    data_type: string;
    file_size: number;
    file_size_mb: number;
  };
}

export const exportApi = {
  /**
   * 导出 EEG 数据
   */
  async exportData(params: DataExportRequest): Promise<DataExportResponse> {
    return request('/export/data', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * 导出并直接下载文件
   */
  async downloadData(params: DataExportRequest): Promise<Blob> {
    const url = `${API_BASE_URL}/export/download`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '请求失败' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.blob();
  },
};

// ============ 导出 ============

export default {
  filesystem: filesystemApi,
  workspace: workspaceApi,
  waveform: waveformApi,
  preprocessing: preprocessingApi,
  visualization: visualizationApi,
  export: exportApi,
};

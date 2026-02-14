import type { EEGFile, EEGDataInfo, EventTrigger, WaveformData, ChannelInfo } from '../types/eeg';

// 标准 10-20 系统电极位置（归一化坐标）
const ELECTRODE_POSITIONS: Record<string, { x: number; y: number }> = {
  'Fp1': { x: 0.35, y: 0.1 },
  'Fp2': { x: 0.65, y: 0.1 },
  'F7': { x: 0.15, y: 0.25 },
  'F3': { x: 0.35, y: 0.25 },
  'Fz': { x: 0.5, y: 0.25 },
  'F4': { x: 0.65, y: 0.25 },
  'F8': { x: 0.85, y: 0.25 },
  'T7': { x: 0.1, y: 0.5 },
  'C3': { x: 0.3, y: 0.5 },
  'Cz': { x: 0.5, y: 0.5 },
  'C4': { x: 0.7, y: 0.5 },
  'T8': { x: 0.9, y: 0.5 },
  'TP9': { x: 0.05, y: 0.65 },
  'P7': { x: 0.15, y: 0.75 },
  'P3': { x: 0.35, y: 0.75 },
  'Pz': { x: 0.5, y: 0.75 },
  'P4': { x: 0.65, y: 0.75 },
  'P8': { x: 0.85, y: 0.75 },
  'TP10': { x: 0.95, y: 0.65 },
  'O1': { x: 0.35, y: 0.9 },
  'Oz': { x: 0.5, y: 0.92 },
  'O2': { x: 0.65, y: 0.9 },
};

// 模拟通道信息
const MOCK_CHANNELS: ChannelInfo[] = Object.keys(ELECTRODE_POSITIONS).map((name) => ({
  name,
  type: 'EEG' as const,
  isBad: name === 'F7' || name === 'T8', // 模拟2个坏道
  position: ELECTRODE_POSITIONS[name]
}));

// 添加额外通道
MOCK_CHANNELS.push(
  { name: 'EOG1', type: 'EOG', isBad: false },
  { name: 'EOG2', type: 'EOG', isBad: false },
  { name: 'ECG', type: 'ECG', isBad: false },
  { name: 'STIM', type: 'STIM', isBad: false }
);

// 模拟文件列表
export const mockFiles: EEGFile[] = [
  {
    id: '1',
    name: 'Sub-001_task-P300.edf',
    path: 'D:/Data/Exp1/Sub-001_task-P300.edf',
    format: 'edf',
    size: 524288000,
    status: 'completed',
    modifiedAt: '2024-12-10T14:30:00'
  },
  {
    id: '2',
    name: 'Sub-002_task-P300.edf',
    path: 'D:/Data/Exp1/Sub-002_task-P300.edf',
    format: 'edf',
    size: 512000000,
    status: 'processing',
    modifiedAt: '2024-12-10T15:20:00'
  },
  {
    id: '3',
    name: 'Sub-003_task-P300.set',
    path: 'D:/Data/Exp1/Sub-003_task-P300.set',
    format: 'set',
    size: 498000000,
    status: 'unprocessed',
    modifiedAt: '2024-12-11T09:15:00'
  },
  {
    id: '4',
    name: 'Sub-004_task-P300.fif',
    path: 'D:/Data/Exp1/Sub-004_task-P300.fif',
    format: 'fif',
    size: 620000000,
    status: 'unprocessed',
    modifiedAt: '2024-12-11T10:45:00'
  },
  {
    id: '5',
    name: 'Sub-005_task-P300.edf',
    path: 'D:/Data/Exp1/Sub-005_task-P300.edf',
    format: 'edf',
    size: 545000000,
    status: 'unprocessed',
    modifiedAt: '2024-12-11T11:30:00'
  },
];

// 模拟数据信息
export const mockDataInfo: EEGDataInfo = {
  subjectId: 'Sub-001',
  measurementDate: '2024-12-10',
  duration: 930, // 15:30
  fileSize: 524288000,
  channelCount: MOCK_CHANNELS.length,
  sampleRate: 1000,
  highpassFilter: 0.1,
  lowpassFilter: null,
  badChannels: MOCK_CHANNELS.filter(ch => ch.isBad).map(ch => ch.name),
  channels: MOCK_CHANNELS,
  hasMontage: false // 模拟初始无定位信息
};

// 模拟事件触发器
export const mockEvents: EventTrigger[] = [
  { id: 1, count: 150, label: 'Target', color: '#3fb950' },
  { id: 2, count: 450, label: 'Standard', color: '#58a6ff' },
  { id: 3, count: 50, label: 'Distractor', color: '#d29922' },
  { id: 255, count: 10, label: 'Boundary', color: '#8b949e' },
];

// 生成模拟波形数据
export function generateMockWaveform(
  startTime: number, 
  endTime: number, 
  sampleRate: number = 250
): WaveformData {
  const duration = endTime - startTime;
  const numSamples = Math.floor(duration * sampleRate);
  
  const channels = MOCK_CHANNELS
    .filter(ch => ch.type === 'EEG')
    .map(ch => {
      const data: number[] = [];
      for (let i = 0; i < numSamples; i++) {
        const t = startTime + i / sampleRate;
        // 模拟 EEG 信号：多频率叠加 + 噪声
        const alpha = 20 * Math.sin(2 * Math.PI * 10 * t); // 10 Hz alpha
        const beta = 10 * Math.sin(2 * Math.PI * 20 * t);  // 20 Hz beta
        const theta = 15 * Math.sin(2 * Math.PI * 5 * t);  // 5 Hz theta
        const noise = (Math.random() - 0.5) * 30;
        
        // 坏道信号更大、更乱
        const badChannelNoise = ch.isBad ? (Math.random() - 0.5) * 150 : 0;
        
        data.push(alpha + beta + theta + noise + badChannelNoise);
      }
      return {
        name: ch.name,
        data,
        isBad: ch.isBad
      };
    });

  // 模拟事件标记
  const events: WaveformData['events'] = [];
  const avgEventInterval = 2; // 平均每2秒一个事件
  let currentTime = startTime + Math.random() * avgEventInterval;
  
  while (currentTime < endTime) {
    const eventId = Math.random() < 0.25 ? 1 : 2; // 25% Target, 75% Standard
    events.push({
      time: currentTime,
      id: eventId,
      label: eventId === 1 ? 'Target' : 'Standard'
    });
    currentTime += avgEventInterval * (0.5 + Math.random());
  }

  return {
    timeRange: [startTime, endTime],
    sampleRate,
    channels,
    events
  };
}

// 获取电极位置
export function getElectrodePositions() {
  return ELECTRODE_POSITIONS;
}

// 模拟 ERP 数据
export function generateMockERPData(condition: string) {
  const times: number[] = [];
  const data: number[] = [];
  const stderr: number[] = [];
  
  for (let t = -200; t <= 800; t += 4) {
    times.push(t);
    
    // 模拟 P300 成分
    let value = 0;
    
    if (condition === 'Target') {
      // N100
      if (t >= 80 && t <= 150) {
        value -= 5 * Math.exp(-Math.pow(t - 100, 2) / 400);
      }
      // P200
      if (t >= 150 && t <= 250) {
        value += 4 * Math.exp(-Math.pow(t - 200, 2) / 600);
      }
      // P300
      if (t >= 250 && t <= 500) {
        value += 10 * Math.exp(-Math.pow(t - 350, 2) / 4000);
      }
    } else {
      // Standard: 只有小的 N100 和 P200
      if (t >= 80 && t <= 150) {
        value -= 3 * Math.exp(-Math.pow(t - 100, 2) / 400);
      }
      if (t >= 150 && t <= 250) {
        value += 2 * Math.exp(-Math.pow(t - 200, 2) / 600);
      }
    }
    
    // 添加噪声
    value += (Math.random() - 0.5) * 1;
    data.push(value);
    stderr.push(0.5 + Math.random() * 0.5);
  }
  
  return { times, data, stderr };
}

// 模拟 PSD 数据
export function generateMockPSDData() {
  const frequencies: number[] = [];
  const power: number[] = [];
  
  for (let f = 1; f <= 50; f += 0.5) {
    frequencies.push(f);
    
    // 1/f 背景 + 频段峰值
    let p = 100 / f;
    
    // Alpha 峰 (8-12 Hz)
    if (f >= 7 && f <= 13) {
      p += 30 * Math.exp(-Math.pow(f - 10, 2) / 4);
    }
    
    // Beta 峰 (15-25 Hz)
    if (f >= 13 && f <= 27) {
      p += 10 * Math.exp(-Math.pow(f - 20, 2) / 15);
    }
    
    // 添加噪声
    p += Math.random() * 5;
    power.push(Math.log10(p) * 10); // dB
  }
  
  return { frequencies, power };
}

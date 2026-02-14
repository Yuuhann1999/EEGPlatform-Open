import { create } from 'zustand';
import type { 
  EEGFile, 
  EEGDataInfo, 
  EventTrigger, 
  PipelineStep, 
  WaveformData,
  ROIPreset,
  BatchJob
} from '../types/eeg';

interface EEGState {
  // 会话状态
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;

  // 工作区状态
  workspacePath: string | null;
  files: EEGFile[];
  selectedFile: EEGFile | null;
  currentData: EEGDataInfo | null;

  // 波形状态
  waveformData: WaveformData | null;
  preProcessingWaveform: WaveformData | null; // 处理前的波形（用于叠加对比）
  viewTimeRange: [number, number];
  
  // 事件映射
  events: EventTrigger[];
  
  // Pipeline 状态
  pipelineSteps: PipelineStep[];
  currentStepIndex: number;
  
  // 可视化状态
  selectedROI: string[];
  roiPresets: ROIPreset[];
  displayMode: 'butterfly' | 'average';
  chartType: 'erp' | 'psd' | 'topo' | 'tfr';
  
  // 批处理状态
  batchJob: BatchJob | null;

  // Actions
  setSessionId: (sessionId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWorkspacePath: (path: string) => void;
  setFiles: (files: EEGFile[]) => void;
  selectFile: (file: EEGFile | null) => void;
  setCurrentData: (data: EEGDataInfo | null) => void;
  setWaveformData: (data: WaveformData | null) => void;
  savePreProcessingWaveform: () => void;
  clearPreProcessingWaveform: () => void;
  setViewTimeRange: (range: [number, number]) => void;
  setEvents: (events: EventTrigger[]) => void;
  updateEventLabel: (id: number, label: string) => void;
  addPipelineStep: (step: PipelineStep) => void;
  undoPipelineStep: () => void;
  redoPipelineStep: () => void;
  setSelectedROI: (channels: string[]) => void;
  setDisplayMode: (mode: 'butterfly' | 'average') => void;
  setChartType: (type: 'erp' | 'psd' | 'topo' | 'tfr') => void;
  toggleBadChannel: (channelName: string) => void;
  setBatchJob: (job: BatchJob | null) => void;
  resetSession: () => void;
  updateMontageStatus: (hasMontage: boolean) => void;
}

export const useEEGStore = create<EEGState>((set) => ({
  // 初始状态
  sessionId: null,
  isLoading: false,
  error: null,
  workspacePath: null,
  files: [],
  selectedFile: null,
  currentData: null,
  waveformData: null,
  preProcessingWaveform: null,
  viewTimeRange: [0, 10],
  events: [],
  pipelineSteps: [],
  currentStepIndex: -1,
  selectedROI: [],
  roiPresets: [
    { id: 'frontal', name: 'Frontal', channels: ['Fp1', 'Fp2', 'F3', 'F4', 'Fz', 'F7', 'F8'] },
    { id: 'central', name: 'Central', channels: ['C3', 'C4', 'Cz'] },
    { id: 'parietal', name: 'Parietal', channels: ['P3', 'P4', 'Pz', 'P7', 'P8'] },
    { id: 'occipital', name: 'Occipital', channels: ['O1', 'O2', 'Oz'] },
    { id: 'temporal', name: 'Temporal', channels: ['T7', 'T8', 'TP9', 'TP10'] },
  ],
  displayMode: 'butterfly',
  chartType: 'erp',
  batchJob: null,

  // Actions
  setSessionId: (sessionId) => set({ sessionId }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error }),
  
  setWorkspacePath: (path) => set({ workspacePath: path }),
  
  setFiles: (files) => set({ files }),
  
  selectFile: (file) => set({ selectedFile: file }),
  
  setCurrentData: (data) => set({ currentData: data }),
  
  setWaveformData: (data) => set({ waveformData: data }),

  savePreProcessingWaveform: () => set((state) => ({
    preProcessingWaveform: state.waveformData ? { ...state.waveformData } : null
  })),

  clearPreProcessingWaveform: () => set({ preProcessingWaveform: null }),
  
  setViewTimeRange: (range) => set({ viewTimeRange: range }),
  
  setEvents: (events) => set({ events }),
  
  updateEventLabel: (id, label) => set((state) => ({
    events: state.events.map(e => e.id === id ? { ...e, label } : e)
  })),
  
  addPipelineStep: (step) => set((state) => {
    const newSteps = [...state.pipelineSteps.slice(0, state.currentStepIndex + 1), step];
    return {
      pipelineSteps: newSteps,
      currentStepIndex: newSteps.length - 1
    };
  }),
  
  undoPipelineStep: () => set((state) => {
    if (state.currentStepIndex >= 0) {
      const updatedSteps = [...state.pipelineSteps];
      updatedSteps[state.currentStepIndex] = {
        ...updatedSteps[state.currentStepIndex],
        status: 'undone'
      };
      return {
        pipelineSteps: updatedSteps,
        currentStepIndex: state.currentStepIndex - 1
      };
    }
    return state;
  }),
  
  redoPipelineStep: () => set((state) => {
    if (state.currentStepIndex < state.pipelineSteps.length - 1) {
      const newIndex = state.currentStepIndex + 1;
      const updatedSteps = [...state.pipelineSteps];
      updatedSteps[newIndex] = {
        ...updatedSteps[newIndex],
        status: 'applied'
      };
      return {
        pipelineSteps: updatedSteps,
        currentStepIndex: newIndex
      };
    }
    return state;
  }),
  
  setSelectedROI: (channels) => set({ selectedROI: channels }),
  
  setDisplayMode: (mode) => set({ displayMode: mode }),
  
  setChartType: (type) => set({ chartType: type }),
  
  toggleBadChannel: (channelName) => set((state) => {
    if (!state.currentData) return state;
    
    const updatedChannels = state.currentData.channels.map(ch => 
      ch.name === channelName ? { ...ch, isBad: !ch.isBad } : ch
    );
    
    const badChannels = updatedChannels.filter(ch => ch.isBad).map(ch => ch.name);
    
    return {
      currentData: {
        ...state.currentData,
        channels: updatedChannels,
        badChannels
      }
    };
  }),
  
  setBatchJob: (job) => set({ batchJob: job }),
  
  resetSession: () => set({
    sessionId: null,
    currentData: null,
    waveformData: null,
    events: [],
    pipelineSteps: [],
    currentStepIndex: -1,
    error: null,
  }),

  updateMontageStatus: (hasMontage) => set((state) => {
    if (!state.currentData) return state;
    return {
      currentData: {
        ...state.currentData,
        hasMontage,
      }
    };
  }),
}));

import type { EEGDataInfo as ApiEEGDataInfo, EventInfo as ApiEventInfo } from '../services/api';
import type { EEGDataInfo, EventTrigger } from '../types/eeg';

/**
 * 将后端 EEGDataInfo 转换为前端状态结构
 */
export function convertApiDataInfo(apiInfo: ApiEEGDataInfo): EEGDataInfo {
  return {
    subjectId: apiInfo.subject_id,
    measurementDate: apiInfo.measurement_date || '',
    duration: apiInfo.duration,
    fileSize: apiInfo.file_size,
    channelCount: apiInfo.channel_count,
    sampleRate: apiInfo.sample_rate,
    highpassFilter: apiInfo.highpass_filter,
    lowpassFilter: apiInfo.lowpass_filter,
    badChannels: apiInfo.bad_channels,
    hasMontage: apiInfo.has_montage,
    hasEpochs: apiInfo.has_epochs ?? false,
    epochEventIds: apiInfo.epoch_event_ids ?? [],
    epochTmin: apiInfo.epoch_tmin ?? null,
    epochTmax: apiInfo.epoch_tmax ?? null,
    channels: apiInfo.channels.map((ch) => ({
      name: ch.name,
      type: ch.type,
      isBad: ch.is_bad,
      position: ch.position || undefined,
    })),
  };
}

/**
 * 将后端事件列表转换为前端状态结构
 */
export function convertApiEvents(apiEvents: ApiEventInfo[]): EventTrigger[] {
  return apiEvents.map((e) => ({
    id: e.id,
    count: e.count,
    label: e.label || undefined,
    color: e.color || undefined,
  }));
}

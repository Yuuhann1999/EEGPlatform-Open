"""EEG 数据处理服务 - 封装 MNE-Python 操作"""
import os
import traceback
from pathlib import Path
from typing import Optional
import numpy as np
import mne
from mne.preprocessing import ICA

from ..config import settings
from ..schemas import (
    EEGDataInfo, ChannelInfo, EventInfo, 
    WaveformChannel, WaveformEvent, WaveformResponse,
    ERPData, PSDData, TopomapData
)
from .session_manager import session_manager, EEGSession

# 抑制 MNE 的日志输出
mne.set_log_level('WARNING')

class EEGService:
    """EEG 数据处理服务"""
    
    # ============ 文件扫描 ============
    
    @staticmethod
    def scan_directory(directory: str) -> list[dict]:
        """扫描目录中的 EEG 文件"""
        supported_extensions = {'.edf', '.set', '.fif', '.bdf', '.gdf'}
        files = []
        
        dir_path = Path(directory)
        if not dir_path.exists():
            raise FileNotFoundError(f"目录不存在: {directory}")
        
        for file_path in dir_path.rglob('*'):
            if file_path.suffix.lower() in supported_extensions:
                try:
                    stat = file_path.stat()
                    ext = file_path.suffix.lower()[1:]  # 去掉点
                    if ext == 'bdf':
                        ext = 'edf'  # BDF 归类为 EDF
                    if ext == 'gdf':
                        ext = 'edf'
                    
                    files.append({
                        "id": str(hash(str(file_path)))[-8:],
                        "name": file_path.name,
                        "path": str(file_path),
                        "format": ext,
                        "size": stat.st_size,
                        "status": "unprocessed",
                        "modified_at": stat.st_mtime
                    })
                except Exception as e:
                    print(f"跳过文件 {file_path}: {e}")
        
        return files
    
    # ============ 数据加载 ============
    
    @staticmethod
    def load_raw(file_path: str) -> tuple[str, mne.io.Raw]:
        """加载原始 EEG 数据"""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")
        
        ext = path.suffix.lower()
        
        print(f"正在加载文件: {file_path}, 格式: {ext}")
        
        try:
            # 根据格式选择加载方法
            if ext == '.edf':
                raw = mne.io.read_raw_edf(file_path, preload=True)
            elif ext == '.bdf':
                raw = mne.io.read_raw_bdf(file_path, preload=True)
            elif ext == '.set':
                # EEGLAB .set 文件可能使用不同的 MATLAB 格式
                raw = None
                last_error = None
                errors = []
                
                # 方法1: 标准 MNE 方式
                is_hdf5_format = False
                try:
                    raw = mne.io.read_raw_eeglab(file_path, preload=True)
                    print("使用标准 MNE 方式加载成功")
                except Exception as e1:
                    last_error = e1
                    error_msg = str(e1)
                    errors.append(f"标准方式: {error_msg}")
                    print(f"标准方式加载失败: {e1}")
                    
                    # 检查错误消息是否提示需要 HDF reader (MATLAB v7.3)
                    if 'HDF' in error_msg or 'v7.3' in error_msg or 'h5py' in error_msg.lower():
                        is_hdf5_format = True
                        print("从错误消息检测到 HDF5/MATLAB v7.3 格式")
                
                # 方法2: 使用 uint16_codec='latin1' 处理编码问题
                if raw is None and not is_hdf5_format:
                    try:
                        raw = mne.io.read_raw_eeglab(file_path, preload=True, uint16_codec='latin1')
                        print("使用 latin1 编码加载成功")
                    except Exception as e2:
                        last_error = e2
                        error_msg = str(e2)
                        errors.append(f"latin1编码: {error_msg}")
                        print(f"latin1 编码失败: {e2}")
                        
                        # 检查错误消息是否提示需要 HDF reader
                        if 'HDF' in error_msg or 'v7.3' in error_msg or 'h5py' in error_msg.lower():
                            is_hdf5_format = True
                            print("从错误消息检测到 HDF5/MATLAB v7.3 格式")
                
                # 方法3: 检测并处理 HDF5 格式 (MATLAB v7.3)
                if raw is None:
                    # 如果还没有检测到HDF5格式，尝试用h5py检测
                    if not is_hdf5_format:
                        try:
                            import h5py
                            try:
                                with h5py.File(file_path, 'r') as f:
                                    is_hdf5_format = True
                                    print("使用 h5py 检测到 HDF5 格式的 .set 文件")
                            except (OSError, IOError) as h5_err:
                                # 不是HDF5格式或无法打开，但可能仍然是v7.3格式
                                print(f"HDF5检测失败: {h5_err}")
                            except Exception as h5_err:
                                print(f"HDF5检测异常: {h5_err}")
                        except ImportError:
                            print("h5py未安装，跳过HDF5检测")
                    
                    # 如果检测到HDF5格式，尝试使用mat73加载
                    # 或者如果标准方法失败且错误提示需要HDF reader，也尝试mat73
                    if is_hdf5_format or (last_error and ('HDF' in str(last_error) or 'v7.3' in str(last_error) or 'h5py' in str(last_error).lower())):
                        # 先检查mat73是否可用
                        mat73_available = False
                        try:
                            import mat73
                            mat73_available = True
                        except ImportError as import_err:
                            errors.append(f"mat73未安装: {import_err}")
                            print(f"mat73未安装: {import_err}")
                            print("提示: 请运行 'pip install mat73' 来支持MATLAB v7.3格式")
                            last_error = import_err
                        
                        # 如果mat73可用，尝试加载
                        if mat73_available and raw is None:
                            try:
                                print("尝试使用 mat73 加载 HDF5 格式...")
                                mat_data = mat73.loadmat(file_path)
                                
                                # 从 EEGLAB 结构中提取数据
                                eeg = None
                                if isinstance(mat_data, dict):
                                    if 'EEG' in mat_data:
                                        eeg = mat_data['EEG']
                                    elif len(mat_data) == 1:
                                        # 可能只有一个键，直接使用
                                        eeg = list(mat_data.values())[0]
                                    else:
                                        eeg = mat_data
                                else:
                                    eeg = mat_data
                                
                                if eeg is None:
                                    raise ValueError("无法从MAT文件中提取EEG结构")
                                
                                # 提取数据 - 支持多种可能的字段名
                                data = None
                                for key in ['data', 'DATA', 'Data']:
                                    if key in eeg:
                                        data = eeg[key]
                                        break
                                
                                if data is None:
                                    raise ValueError("无法找到数据字段 (data/DATA/Data)")
                                
                                data = np.array(data)
                                
                                # 提取采样率
                                srate = None
                                for key in ['srate', 'SRATE', 'Srate', 'sampling_rate', 'sfreq']:
                                    if key in eeg:
                                        srate = float(eeg[key])
                                        break
                                
                                if srate is None:
                                    srate = 256.0  # 默认采样率
                                    print(f"警告: 未找到采样率信息，使用默认值 {srate} Hz")
                                
                                # 获取通道名称
                                chanlocs = None
                                for key in ['chanlocs', 'CHANLOCS', 'Chanlocs', 'channels']:
                                    if key in eeg:
                                        chanlocs = eeg[key]
                                        break
                                
                                ch_names = []
                                if chanlocs is not None:
                                    try:
                                        if isinstance(chanlocs, dict):
                                            # 单个通道信息字典
                                            if 'labels' in chanlocs:
                                                ch_names = [str(chanlocs['labels'])]
                                            elif 'label' in chanlocs:
                                                ch_names = [str(chanlocs['label'])]
                                        elif isinstance(chanlocs, (list, np.ndarray)):
                                            # 通道信息数组
                                            for ch in chanlocs:
                                                if isinstance(ch, dict):
                                                    # 尝试多种可能的字段名
                                                    label = None
                                                    for lbl_key in ['labels', 'label', 'Labels', 'Label']:
                                                        if lbl_key in ch:
                                                            label = str(ch[lbl_key])
                                                            break
                                                    if label:
                                                        ch_names.append(label)
                                                    else:
                                                        ch_names.append(f'Ch{len(ch_names)}')
                                                elif isinstance(ch, str):
                                                    ch_names.append(ch)
                                                else:
                                                    ch_names.append(f'Ch{len(ch_names)}')
                                    except Exception as ch_err:
                                        print(f"解析通道信息失败: {ch_err}")
                                
                                # 如果通道名称数量不匹配，根据数据维度生成
                                if data.ndim == 1:
                                    data = data.reshape(1, -1)
                                elif data.ndim == 3:
                                    # epochs 格式，拼接所有epochs
                                    n_epochs, n_chans, n_samples = data.shape
                                    data = data.reshape(n_chans, -1)
                                
                                n_channels = data.shape[0]
                                
                                # 确保通道名称数量匹配
                                if len(ch_names) != n_channels:
                                    ch_names = [f'Ch{i+1}' for i in range(n_channels)]
                                
                                # 创建 MNE Info 对象
                                # 尝试检测通道类型
                                ch_types = ['eeg'] * n_channels
                                
                                # 检查是否有其他类型的通道信息
                                if chanlocs is not None:
                                    try:
                                        if isinstance(chanlocs, (list, np.ndarray)):
                                            for i, ch in enumerate(chanlocs):
                                                if i >= len(ch_types):
                                                    break
                                                if isinstance(ch, dict):
                                                    ch_type = ch.get('type', ch.get('Type', 'eeg'))
                                                    if isinstance(ch_type, str):
                                                        ch_type_lower = ch_type.lower()
                                                        if 'eog' in ch_type_lower:
                                                            ch_types[i] = 'eog'
                                                        elif 'ecg' in ch_type_lower:
                                                            ch_types[i] = 'ecg'
                                                        elif 'emg' in ch_type_lower:
                                                            ch_types[i] = 'emg'
                                                        elif 'stim' in ch_type_lower or 'trigger' in ch_type_lower:
                                                            ch_types[i] = 'stim'
                                    except:
                                        pass
                                
                                info = mne.create_info(
                                    ch_names=ch_names,
                                    sfreq=srate,
                                    ch_types=ch_types
                                )
                                
                                # 创建 Raw 对象 (数据单位转换为 V)
                                # 检查数据范围，判断单位
                                data_max = np.abs(data).max()
                                if data_max > 1e3:  # 如果最大值超过1000，可能是µV
                                    data = data * 1e-6  # µV -> V
                                elif data_max > 1:  # 如果最大值超过1，可能是mV
                                    data = data * 1e-3  # mV -> V
                                # 否则假设已经是V
                                
                                raw = mne.io.RawArray(data, info)
                                print(f"使用 mat73 成功加载 HDF5 格式: {len(ch_names)} 通道, {data.shape[1]/srate:.1f}s")
                            except Exception as e3:
                                error_msg = str(e3)
                                errors.append(f"mat73加载: {error_msg}")
                                print(f"mat73 加载失败: {e3}")
                                traceback.print_exc()
                                # 继续尝试其他方法，不立即抛出错误
                                last_error = e3
                    
                    # 方法4: 尝试使用 pymatreader 作为备选
                    if raw is None:
                        pymatreader_available = False
                        try:
                            from pymatreader import read_mat
                            pymatreader_available = True
                        except ImportError as import_err:
                            errors.append(f"pymatreader未安装: {import_err}")
                            print(f"pymatreader未安装: {import_err}")
                            print("提示: 请运行 'pip install pymatreader' 来支持MATLAB格式")
                        
                        if pymatreader_available:
                            try:
                                print("尝试使用 pymatreader 加载...")
                                mat_data = read_mat(file_path)
                                
                                # 提取EEG数据
                                eeg = mat_data.get('EEG') or mat_data
                                
                                if 'data' in eeg or 'DATA' in eeg:
                                    data = np.array(eeg.get('data') or eeg.get('DATA'))
                                    srate = float(eeg.get('srate', eeg.get('SRATE', 256)))
                                    
                                    # 处理数据维度
                                    if data.ndim == 1:
                                        data = data.reshape(1, -1)
                                    elif data.ndim == 3:
                                        data = data.reshape(data.shape[0], -1)
                                    
                                    # 获取通道名称
                                    chanlocs = eeg.get('chanlocs') or eeg.get('CHANLOCS')
                                    if chanlocs:
                                        ch_names = []
                                        if isinstance(chanlocs, list):
                                            for ch in chanlocs:
                                                if isinstance(ch, dict):
                                                    ch_names.append(str(ch.get('labels', ch.get('label', f'Ch{len(ch_names)}'))))
                                                else:
                                                    ch_names.append(f'Ch{len(ch_names)}')
                                        else:
                                            ch_names = [f'Ch{i+1}' for i in range(data.shape[0])]
                                    else:
                                        ch_names = [f'Ch{i+1}' for i in range(data.shape[0])]
                                    
                                    # 确保通道数匹配
                                    if len(ch_names) != data.shape[0]:
                                        ch_names = [f'Ch{i+1}' for i in range(data.shape[0])]
                                    
                                    # 创建MNE对象
                                    info = mne.create_info(ch_names=ch_names, sfreq=srate, ch_types='eeg')
                                    
                                    # 单位转换
                                    if np.abs(data).max() > 1e3:
                                        data = data * 1e-6
                                    elif np.abs(data).max() > 1:
                                        data = data * 1e-3
                                    
                                    raw = mne.io.RawArray(data, info)
                                    print(f"使用 pymatreader 成功加载: {len(ch_names)} 通道")
                            except Exception as e4:
                                error_msg = str(e4)
                                errors.append(f"pymatreader: {error_msg}")
                                print(f"pymatreader 加载失败: {e4}")
                
                # 如果所有方法都失败，抛出详细错误
                if raw is None:
                    error_summary = "\n".join([f"  - {e}" for e in errors])
                    raise ValueError(
                        f"无法加载 .set 文件。已尝试的方法：\n{error_summary}\n\n"
                        f"建议：\n"
                        f"1. 确保文件是有效的EEGLAB .set格式\n"
                        f"2. 如果是MATLAB v7.3格式，请确保已安装: pip install mat73\n"
                        f"3. 在EEGLAB中重新保存为旧版格式: pop_saveset(EEG, 'filename', 'your_file.set', 'version', '7')"
                    )
            elif ext in ['.fif', '.fif.gz']:
                raw = mne.io.read_raw_fif(file_path, preload=True)
            elif ext == '.gdf':
                raw = mne.io.read_raw_gdf(file_path, preload=True)
            else:
                raise ValueError(f"不支持的文件格式: {ext}")
            
            print(f"文件加载成功: {len(raw.ch_names)} 个通道, {raw.times[-1]:.2f} 秒")

            # 检测是否为分段后的数据（不支持）
            file_name = path.name.lower()
            epochs_keywords = ['epoch', 'epo', 'segment', 'segmented', 'evoked', 'average']

            # 1. 检查文件名是否包含分段关键词
            is_likely_epochs = any(keyword in file_name for keyword in epochs_keywords)

            # 2. 对于 FIF 格式，检查文件是否包含 Epochs 对象
            if ext == '.fif':
                try:
                    # 尝试读取是否包含 epochs
                    from mne import read_epochs
                    test_epochs = read_epochs(file_path, preload=False, verbose=False)
                    if test_epochs is not None:
                        is_likely_epochs = True
                        print(f"警告: FIF 文件包含 Epochs 数据")
                except:
                    # 无法读取 epochs，说明是 Raw 数据（正常情况）
                    pass

            # 3. 检查加载的对象类型
            # MNE-Python 中，如果文件包含 epochs，read_raw 可能返回 EpochsArray 而非 Raw
            if not isinstance(raw, mne.io.BaseRaw):
                is_likely_epochs = True
                print(f"警告: 加载的对象类型为 {type(raw).__name__}，不是 BaseRaw")

            # 如果检测到是分段数据，抛出错误
            if is_likely_epochs:
                raise ValueError(
                    f"不支持直接加载分段后的数据（Epochs）。\n"
                    f"文件 '{path.name}' 或文件内容表明这是已经分段的数据。\n\n"
                    f"建议：\n"
                    f"1. 请加载原始的连续数据（Raw）\n"
                    f"2. 如果需要处理分段数据，请先在 EEGLAB/MNE 中导出为连续数据格式"
                )

            # 创建会话
            session_id = session_manager.create_session(file_path)
            session = session_manager.get_session(session_id)
            session.raw = raw
            session.add_history("load", {"file_path": file_path})

            return session_id, raw
        except Exception as e:
            print(f"加载文件失败: {e}")
            traceback.print_exc()
            raise
    
    @staticmethod
    def get_data_info(session: EEGSession) -> EEGDataInfo:
        """获取数据信息"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        info = raw.info
        
        # 构建通道信息
        channels = []
        for ch_idx, ch_name in enumerate(info['ch_names']):
            try:
                ch_type = mne.channel_type(info, ch_idx)
                type_map = {
                    'eeg': 'EEG', 'eog': 'EOG', 'emg': 'EMG', 
                    'ecg': 'ECG', 'stim': 'STIM', 'misc': 'OTHER',
                    'bio': 'OTHER', 'resp': 'OTHER', 'seeg': 'EEG',
                    'ecog': 'EEG', 'dbs': 'EEG', 'fnirs_cw_amplitude': 'OTHER',
                    'fnirs_fd_ac_amplitude': 'OTHER', 'fnirs_fd_phase': 'OTHER',
                    'fnirs_od': 'OTHER', 'exci': 'OTHER', 'ias': 'OTHER',
                    'syst': 'OTHER', 'hbo': 'OTHER', 'hbr': 'OTHER',
                }
                ch_type_str = type_map.get(ch_type, 'OTHER')
            except Exception:
                ch_type_str = 'OTHER'
            
            # 获取位置
            position = None
            try:
                if info['chs'][ch_idx].get('loc') is not None:
                    loc = info['chs'][ch_idx]['loc'][:3]
                    if not np.all(loc == 0) and not np.any(np.isnan(loc)):
                        position = {"x": float(loc[0]), "y": float(loc[1]), "z": float(loc[2])}
            except Exception:
                pass
            
            channels.append(ChannelInfo(
                name=ch_name,
                type=ch_type_str,
                is_bad=ch_name in raw.info['bads'],
                position=position
            ))
        
        # 检查是否有 montage
        has_montage = any(ch.position is not None for ch in channels)
        
        # 获取滤波信息
        highpass = info.get('highpass', None)
        lowpass = info.get('lowpass', None)
        
        # 获取受试者 ID
        subject_info = info.get('subject_info', {}) or {}
        subject_id = subject_info.get('his_id') or subject_info.get('id') or Path(session.file_path).stem
        
        # 获取测量日期
        meas_date = info.get('meas_date')
        measurement_date = None
        if meas_date is not None:
            try:
                measurement_date = str(meas_date)[:10]  # 只取日期部分
            except:
                pass
        
        # 检查是否有 epochs
        has_epochs = session.epochs is not None
        epoch_event_ids = []
        epoch_tmin = None
        epoch_tmax = None
        if has_epochs and session.epochs is not None:
            # 从 epochs 中提取事件 ID
            event_id_map = session.epochs.event_id
            epoch_event_ids = [int(v.split('_')[-1]) if isinstance(v, str) else int(v)
                              for v in event_id_map.values()]
            epoch_tmin = session.epochs.tmin
            epoch_tmax = session.epochs.tmax

        return EEGDataInfo(
            subject_id=str(subject_id),
            measurement_date=measurement_date,
            duration=float(raw.times[-1]),
            file_size=os.path.getsize(session.file_path),
            channel_count=len(info['ch_names']),
            sample_rate=float(info['sfreq']),
            highpass_filter=float(highpass) if highpass and highpass > 0 else None,
            lowpass_filter=float(lowpass) if lowpass and lowpass < info['sfreq']/2 else None,
            bad_channels=list(raw.info['bads']),
            channels=channels,
            has_montage=has_montage,
            has_epochs=has_epochs,
            epoch_event_ids=epoch_event_ids,
            epoch_tmin=epoch_tmin,
            epoch_tmax=epoch_tmax
        )
    
    @staticmethod
    def get_events(session: EEGSession) -> list[EventInfo]:
        """获取事件信息"""
        raw = session.raw
        if raw is None:
            return []
        
        events = None
        
        # 方法1: 尝试从 stim 通道获取事件
        stim_picks = mne.pick_types(raw.info, stim=True)
        if len(stim_picks) > 0:
            stim_ch_name = raw.ch_names[stim_picks[0]]
            try:
                events = mne.find_events(raw, stim_channel=stim_ch_name, shortest_event=1)
                print(f"从 STIM 通道 {stim_ch_name} 获取到 {len(events)} 个事件")
            except Exception as e:
                print(f"从 STIM 通道获取事件失败: {e}")
        
        # 方法2: 尝试从 annotations 获取事件
        if events is None or len(events) == 0:
            try:
                if raw.annotations and len(raw.annotations) > 0:
                    events, event_id = mne.events_from_annotations(raw)
                    print(f"从 Annotations 获取到 {len(events)} 个事件")
            except Exception as e:
                print(f"从 Annotations 获取事件失败: {e}")
        
        if events is None or len(events) == 0:
            print("未检测到任何事件")
            return []
        
        # 统计每个事件ID的出现次数
        unique_ids, counts = np.unique(events[:, 2], return_counts=True)
        
        # 生成颜色
        colors = ['#3fb950', '#58a6ff', '#d29922', '#f85149', '#a855f7', '#8b949e']
        
        event_infos = []
        for i, (event_id, count) in enumerate(zip(unique_ids, counts)):
            event_infos.append(EventInfo(
                id=int(event_id),
                count=int(count),
                label=None,  # 标签由前端设置
                color=colors[i % len(colors)]
            ))
        
        return event_infos
    
    # ============ 波形数据 ============
    
    @staticmethod
    def get_waveform(
        session: EEGSession, 
        start_time: float, 
        duration: float,
        target_sfreq: int = 250
    ) -> WaveformResponse:
        """获取波形数据（降采样），如果有epochs则返回epoch数据"""
        # 优先使用epochs数据
        if session.epochs is not None:
            return eeg_service._get_epoch_waveform(
                session.epochs,
                start_time,
                duration,
                target_sfreq
            )
        
        # 否则使用raw数据
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        # 计算时间范围
        end_time = min(start_time + duration, raw.times[-1])
        start_time = max(0, start_time)
        
        # 获取数据
        start_idx = int(start_time * raw.info['sfreq'])
        end_idx = int(end_time * raw.info['sfreq'])
        
        data, times = raw[:, start_idx:end_idx]
        
        # 降采样
        if raw.info['sfreq'] > target_sfreq:
            factor = int(raw.info['sfreq'] / target_sfreq)
            data = data[:, ::factor]
            times = times[::factor]
        
        # 只返回 EEG 通道
        eeg_picks = mne.pick_types(raw.info, eeg=True, exclude=[])
        
        channels = []
        for idx in eeg_picks[:settings.MAX_CHANNELS_DISPLAY]:
            ch_name = raw.ch_names[idx]
            ch_data = data[idx, :] * 1e6  # 转换为 µV
            channels.append(WaveformChannel(
                name=ch_name,
                data=ch_data.tolist(),
                is_bad=ch_name in raw.info['bads']
            ))
        
        # 获取时间范围内的事件
        events_list = []
        try:
            # 先尝试从annotations获取
            if raw.annotations and len(raw.annotations) > 0:
                for ann in raw.annotations:
                    ann_time = float(ann['onset'])
                    if start_time <= ann_time <= end_time:
                        # 尝试从description中提取事件ID
                        event_id = 0
                        try:
                            # annotations的description可能是事件ID
                            event_id = int(ann['description'])
                        except:
                            pass
                        events_list.append(WaveformEvent(
                            time=ann_time,
                            id=event_id,
                            label=ann.get('description', None)
                        ))
            else:
                # 从STIM通道获取
                stim_picks = mne.pick_types(raw.info, stim=True)
                if len(stim_picks) > 0:
                    stim_ch_name = raw.ch_names[stim_picks[0]]
                    events = mne.find_events(raw, stim_channel=stim_ch_name, shortest_event=1)
                    for event in events:
                        event_time = event[0] / raw.info['sfreq']
                        if start_time <= event_time <= end_time:
                            events_list.append(WaveformEvent(
                                time=float(event_time),
                                id=int(event[2]),
                                label=None
                            ))
        except Exception as e:
            print(f"获取波形事件失败: {e}")
        
        return WaveformResponse(
            time_range=(float(start_time), float(end_time)),
            sample_rate=target_sfreq,
            channels=channels,
            events=events_list,
            is_epoch=False
        )
    
    @staticmethod
    def _get_epoch_waveform(
        epochs: mne.Epochs,
        start_time: float,
        duration: float,
        target_sfreq: int = 250
    ) -> WaveformResponse:
        """获取epoch波形数据（一段一段显示）
        
        Args:
            start_time: 起始epoch索引（为了兼容API，这里作为epoch索引使用）
            duration: 要显示的epoch数量
        """
        import numpy as np
        
        # 检查epochs是否为空
        if len(epochs) == 0:
            raise ValueError(
                "所有epochs都被剔除了！无法显示波形。"
                "可能原因：reject阈值太严格或数据质量较差。"
                "建议：降低坏段阈值、检查坏道，或在分段前进行滤波和ICA处理。"
            )
        
        # 将start_time和duration解释为epoch索引和数量
        start_epoch_idx = max(0, int(start_time))
        n_epochs_to_show = min(int(duration), len(epochs) - start_epoch_idx)
        end_epoch_idx = start_epoch_idx + n_epochs_to_show
        
        if start_epoch_idx >= len(epochs):
            raise ValueError(f"起始epoch索引 {start_epoch_idx} 超出范围（总共 {len(epochs)} 个epochs）")
        
        if n_epochs_to_show <= 0:
            raise ValueError(f"没有可显示的epochs")
        
        # 获取epoch数据
        epochs_data = epochs.get_data(copy=False)
        selected_epochs = epochs_data[start_epoch_idx:end_epoch_idx]
        
        # 获取epoch的时间信息
        tmin = epochs.tmin
        tmax = epochs.tmax
        epoch_duration = tmax - tmin
        sfreq = epochs.info['sfreq']
        
        # 只返回 EEG 通道
        eeg_picks = mne.pick_types(epochs.info, eeg=True, exclude=[])
        
        channels = []
        for idx in eeg_picks[:settings.MAX_CHANNELS_DISPLAY]:
            ch_name = epochs.ch_names[idx]
            
            # 将所有epoch的数据拼接起来，epoch之间用特殊标记值分隔（用于前端识别）
            # 使用一个非常小的值作为分隔标记（-1e10，远小于正常EEG数据范围）
            SEPARATOR_VALUE = -1e10
            all_epoch_data = []
            for epoch_idx in range(selected_epochs.shape[0]):
                epoch_ch_data = selected_epochs[epoch_idx, idx, :] * 1e6  # 转换为 µV
                
                # 降采样
                if sfreq > target_sfreq:
                    factor = int(sfreq / target_sfreq)
                    epoch_ch_data = epoch_ch_data[::factor]
                
                all_epoch_data.extend(epoch_ch_data.tolist())
                
                # 在epoch之间添加分隔标记（除了最后一个）
                if epoch_idx < selected_epochs.shape[0] - 1:
                    all_epoch_data.append(SEPARATOR_VALUE)
            
            channels.append(WaveformChannel(
                name=ch_name,
                data=all_epoch_data,
                is_bad=ch_name in epochs.info['bads']
            ))
        
        # 计算总时间范围
        total_duration = selected_epochs.shape[0] * epoch_duration
        start_time = start_epoch_idx * epoch_duration
        end_time = start_time + total_duration
        
        # 获取事件信息（从epoch的event_id）
        events_list = []
        try:
            for epoch_idx in range(start_epoch_idx, end_epoch_idx):
                if epoch_idx < len(epochs.events):
                    event_id = int(epochs.events[epoch_idx, 2])
                    # 计算事件在显示时间轴上的位置
                    relative_epoch_idx = epoch_idx - start_epoch_idx
                    event_time = start_time + relative_epoch_idx * epoch_duration
                    
                    # 获取事件标签
                    event_label = None
                    if epochs.event_id:
                        for label, eid in epochs.event_id.items():
                            if eid == event_id:
                                event_label = label
                                break
                    
                    events_list.append(WaveformEvent(
                        time=float(event_time),
                        id=event_id,
                        label=event_label
                    ))
        except Exception as e:
            print(f"获取epoch事件失败: {e}")
        
        return WaveformResponse(
            time_range=(float(start_time), float(end_time)),
            sample_rate=target_sfreq,
            channels=channels,
            events=events_list,
            is_epoch=True,
            n_epochs=len(epochs)
        )
    
    # ============ 预处理操作 ============
    
    @staticmethod
    def apply_filter(
        session: EEGSession,
        l_freq: Optional[float] = None,
        h_freq: Optional[float] = None,
        notch_freq: Optional[float] = None
    ):
        """应用滤波"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        # 保存状态到撤销栈
        session.save_state("filter", {
            "l_freq": l_freq, 
            "h_freq": h_freq, 
            "notch_freq": notch_freq
        })
        
        # 带通滤波
        if l_freq is not None or h_freq is not None:
            raw.filter(l_freq=l_freq, h_freq=h_freq, fir_design='firwin')
        
        # 陷波滤波
        if notch_freq is not None:
            raw.notch_filter(freqs=notch_freq)
        
        session.add_history("filter", {
            "l_freq": l_freq, 
            "h_freq": h_freq, 
            "notch_freq": notch_freq
        })
    
    @staticmethod
    def apply_resample(session: EEGSession, target_sfreq: float):
        """应用重采样"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        # 保存状态到撤销栈
        session.save_state("resample", {"target_sfreq": target_sfreq})
        
        raw.resample(sfreq=target_sfreq)
        session.add_history("resample", {"target_sfreq": target_sfreq})
    
    @staticmethod
    def apply_rereference(
        session: EEGSession,
        method: str = "average",
        custom_ref: Optional[list[str]] = None
    ):
        """应用重参考"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        # 保存状态到撤销栈
        session.save_state("rereference", {"method": method, "custom_ref": custom_ref})
        
        if method == "average":
            raw.set_eeg_reference(ref_channels='average', projection=False)
        elif method == "a1a2":
            # A1/A2 参考 - 尝试常见的命名
            a1_names = ['A1', 'M1', 'TP9']
            a2_names = ['A2', 'M2', 'TP10']
            
            ref_channels = []
            for name in a1_names:
                if name in raw.ch_names:
                    ref_channels.append(name)
                    break
            for name in a2_names:
                if name in raw.ch_names:
                    ref_channels.append(name)
                    break
            
            if len(ref_channels) == 2:
                raw.set_eeg_reference(ref_channels=ref_channels, projection=False)
            else:
                raise ValueError("未找到 A1/A2 或 TP9/TP10 电极")
        elif method == "custom" and custom_ref:
            raw.set_eeg_reference(ref_channels=custom_ref, projection=False)
        
        session.add_history("rereference", {"method": method, "custom_ref": custom_ref})
    
    @staticmethod
    def set_bad_channel(session: EEGSession, channel_name: str, is_bad: bool):
        """设置坏道"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        if is_bad:
            if channel_name not in raw.info['bads']:
                raw.info['bads'].append(channel_name)
        else:
            if channel_name in raw.info['bads']:
                raw.info['bads'].remove(channel_name)
        
        session.add_history("set_bad_channel", {
            "channel_name": channel_name, 
            "is_bad": is_bad
        })
    
    @staticmethod
    def set_montage(session: EEGSession, montage_name: str = "standard_1020") -> dict:
        """设置电极定位，返回匹配信息"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        try:
            montage = mne.channels.make_standard_montage(montage_name)
            montage_ch_names = set(montage.ch_names)
            raw_ch_names = set(raw.ch_names)
            
            # 找出匹配的通道
            matched = montage_ch_names & raw_ch_names
            unmatched = raw_ch_names - montage_ch_names
            
            # 设置 raw 的 montage
            raw.set_montage(montage, on_missing='warn')
            
            # ★ 同步更新 epochs 的 montage（如果存在）
            if session.epochs is not None:
                try:
                    session.epochs.set_montage(montage, on_missing='warn')
                    print(f"[MONTAGE] 已同步更新 epochs 的电极定位")
                except Exception as e:
                    print(f"[MONTAGE] 更新 epochs montage 失败: {e}")
            
            session.add_history("set_montage", {"montage_name": montage_name})
            
            return {
                "matched_channels": len(matched),
                "unmatched_channels": len(unmatched),
                "matched_list": list(matched)[:10],  # 只返回前10个
                "unmatched_list": list(unmatched)[:10]
            }
        except Exception as e:
            raise ValueError(f"设置 montage 失败: {str(e)}")
    
    @staticmethod
    def apply_ica(
        session: EEGSession,
        n_components: Optional[int] = None,
        exclude_labels: list[str] = None,
        threshold: float = 0.9
    ):
        """应用 ICA 自动去伪迹"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        # 保存状态到撤销栈
        session.save_state("ica", {
            "n_components": n_components,
            "exclude_labels": exclude_labels,
            "threshold": threshold
        })
        
        # 创建 ICA 对象
        if n_components is None:
            n_components = min(20, len(mne.pick_types(raw.info, eeg=True)) - 1)
        
        ica = ICA(n_components=n_components, random_state=42)
        ica.fit(raw)
        
        # 使用 mne-icalabel 自动识别伪迹
        excluded_ics = []
        try:
            from mne_icalabel import label_components
            import numpy as np
            
            labels = label_components(raw, ica, method='iclabel')
            
            # 根据阈值和标签类型排除成分
            # mne-icalabel 的标签映射
            label_map = {
                'eye blink': ['eye', 'eye blink'],
                'muscle artifact': ['muscle', 'muscle artifact'],
                'heart beat': ['heart', 'heart beat'],
                'channel noise': ['channel noise', 'line noise']
            }
            
            # 获取标签和概率数组
            label_names = labels.get('labels', [])
            y_pred_proba = labels.get('y_pred_proba', None)
            
            if y_pred_proba is None or len(label_names) == 0:
                print("警告: label_components 返回的数据格式不正确")
                raise ValueError("无法获取标签概率数据")
            
            # 转换为 numpy 数组并确保是 2D
            y_pred_proba = np.asarray(y_pred_proba)
            if y_pred_proba.ndim == 1:
                # 如果只有一行，需要重新整形
                y_pred_proba = y_pred_proba.reshape(1, -1)
            
            n_ics = y_pred_proba.shape[0]
            n_labels = len(label_names)
            
            # 遍历每个 IC 成分
            for ic_idx in range(n_ics):
                # 获取该成分的所有标签概率
                try:
                    probs_row = y_pred_proba[ic_idx]
                    
                    # 确保 probs_row 是数组或可迭代对象
                    if isinstance(probs_row, (int, float, np.integer, np.floating)):
                        # 如果是标量，跳过（不应该发生）
                        print(f"警告: IC {ic_idx} 的概率是标量，跳过")
                        continue
                    
                    # 转换为数组
                    probs_array = np.asarray(probs_row).flatten()
                    
                    # 遍历每个标签
                    for label_idx, label_name in enumerate(label_names):
                        if label_idx >= len(probs_array):
                            break
                        
                        prob = float(probs_array[label_idx])
                        
                        # 检查是否需要排除此标签
                        should_check = False
                        if exclude_labels is None or len(exclude_labels) == 0:
                            # 如果没有指定，检查所有伪迹类型
                            should_check = True
                        else:
                            # 检查标签是否在排除列表中
                            label_lower = label_name.lower()
                            for exclude_label in exclude_labels:
                                exclude_lower = exclude_label.lower()
                                # 检查是否匹配（支持部分匹配）
                                if (exclude_lower in label_lower or 
                                    label_lower in exclude_lower):
                                    should_check = True
                                    break
                        
                        # 如果概率超过阈值，标记为排除
                        if should_check and prob > threshold:
                            if ic_idx not in excluded_ics:
                                excluded_ics.append(ic_idx)
                            break  # 一个成分只需要匹配一个标签即可
                except Exception as e:
                    print(f"处理 IC {ic_idx} 时出错: {e}")
                    continue
                            
        except ImportError:
            # 如果没有 mne-icalabel，使用简单的 EOG 相关方法
            print("mne-icalabel 未安装，使用 EOG 检测方法")
            try:
                eog_indices, eog_scores = ica.find_bads_eog(raw, threshold=threshold)
                excluded_ics = list(eog_indices) if eog_indices is not None else []
            except Exception as e:
                print(f"EOG 检测失败: {e}")
                excluded_ics = []
        except Exception as e:
            print(f"ICA 标签识别失败: {e}")
            import traceback
            traceback.print_exc()
            # 如果自动识别失败，返回空列表（不排除任何成分）
            excluded_ics = []
        
        # 应用 ICA
        ica.exclude = excluded_ics
        ica.apply(raw)
        
        session.add_history("ica", {
            "n_components": n_components,
            "excluded_ics": excluded_ics,
            "threshold": threshold
        })
        
        return excluded_ics
    
    @staticmethod
    def create_epochs(
        session: EEGSession,
        event_ids: list[int],
        tmin: float = -0.2,
        tmax: float = 0.8,
        baseline: Optional[tuple] = (-0.2, 0),
        reject_threshold: Optional[float] = 100.0
    ):
        """创建 Epochs"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        # 保存状态到撤销栈
        session.save_state("epochs", {
            "event_ids": event_ids,
            "tmin": tmin,
            "tmax": tmax,
            "baseline": baseline,
            "reject_threshold": reject_threshold
        })
        
        # 获取事件 - 通过 STIM 通道类型查找
        events = None
        stim_picks = mne.pick_types(raw.info, stim=True)
        if len(stim_picks) > 0:
            stim_ch_name = raw.ch_names[stim_picks[0]]
            try:
                events = mne.find_events(raw, stim_channel=stim_ch_name, shortest_event=1)
                print(f"从 STIM 通道 {stim_ch_name} 获取到 {len(events)} 个事件")
            except Exception as e:
                print(f"从 STIM 通道获取事件失败: {e}")
        
        # 如果没有从 STIM 通道获取到事件，尝试从 annotations 获取
        if events is None or len(events) == 0:
            try:
                if raw.annotations and len(raw.annotations) > 0:
                    events, _ = mne.events_from_annotations(raw)
                    print(f"从 Annotations 获取到 {len(events)} 个事件")
            except Exception as e:
                print(f"从 Annotations 获取事件失败: {e}")
        
        if events is None or len(events) == 0:
            raise ValueError("未检测到任何事件，无法创建 Epochs")
        
        # 只保留指定的事件 ID
        mask = np.isin(events[:, 2], event_ids)
        filtered_events = events[mask]
        
        if len(filtered_events) == 0:
            raise ValueError(f"未找到指定事件 ID {event_ids} 的事件")
        
        # 构建事件 ID 字典
        event_id_dict = {f"event_{eid}": eid for eid in event_ids if eid in filtered_events[:, 2]}
        
        # 设置拒绝阈值
        reject = None
        if reject_threshold:
            reject = dict(eeg=reject_threshold * 1e-6)  # µV -> V
        
        # 创建 epochs
        n_events_before = len(filtered_events)
        epochs = mne.Epochs(
            raw, filtered_events, event_id=event_id_dict,
            tmin=tmin, tmax=tmax,
            baseline=baseline,
            reject=reject,
            preload=True
        )
        
        n_epochs_after = len(epochs)
        n_dropped = n_events_before - n_epochs_after
        
        # 保存epochs对象（即使为空，也保存，这样用户可以调整参数后重试）
        session.epochs = epochs
        
        # 如果所有epochs都被剔除，给出警告但不抛出错误
        if n_epochs_after == 0:
            # 使用ASCII安全的字符，避免编码错误
            print(f"警告: 所有 {n_events_before} 个epochs都被剔除了！")
            print(f"可能原因: reject阈值 {reject_threshold} uV 太严格，或数据质量较差")
            print("建议: 尝试降低reject阈值或检查数据质量")
            # 不抛出错误，而是返回成功但提示用户调整参数
        
        session.add_history("epochs", {
            "event_ids": event_ids,
            "tmin": tmin,
            "tmax": tmax,
            "baseline": baseline,
            "reject_threshold": reject_threshold,
            "n_epochs": n_epochs_after,
            "n_dropped": n_dropped
        })
        
        return {"n_epochs": n_epochs_after, "n_dropped": n_dropped}
    
    @staticmethod
    def rename_events(session: EEGSession, event_mappings: dict[int, str]) -> None:
        """重命名事件标签
        
        Args:
            session: EEG 会话
            event_mappings: 事件 ID 到新标签的映射字典
        """
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        # 处理 annotations 中的事件重命名
        if raw.annotations and len(raw.annotations) > 0:
            # 创建新的 descriptions 列表
            new_descriptions = list(raw.annotations.description)
            
            for i, desc in enumerate(new_descriptions):
                # 尝试将 description 转换为整数事件 ID
                try:
                    event_id = int(desc)
                    if event_id in event_mappings:
                        new_descriptions[i] = event_mappings[event_id]
                except ValueError:
                    # 如果不是数字，检查是否已经在映射中
                    pass
            
            # 创建新的 annotations
            new_annotations = mne.Annotations(
                onset=raw.annotations.onset,
                duration=raw.annotations.duration,
                description=new_descriptions,
                orig_time=raw.annotations.orig_time
            )
            
            # 替换原始数据中的 annotations
            raw.set_annotations(new_annotations)
            print(f"已重命名 {len(event_mappings)} 个事件标签")
        
        # 如果已经有 epochs，也需要更新 epochs 的事件 ID 字典
        if session.epochs is not None:
            epochs = session.epochs
            # 获取当前的事件 ID 字典
            current_event_id = epochs.event_id.copy()
            
            # 创建新的事件 ID 字典，使用新的标签
            new_event_id = {}
            for old_key, event_val in current_event_id.items():
                if event_val in event_mappings:
                    new_key = event_mappings[event_val]
                    new_event_id[new_key] = event_val
                else:
                    new_event_id[old_key] = event_val
            
            # 更新 epochs 的事件 ID
            epochs.event_id = new_event_id
    
    # ============ 可视化数据 ============
    
    @staticmethod
    def get_erp_data(
        session: EEGSession,
        channels: list[str],
        event_ids: Optional[list[int]] = None,
        per_channel: bool = False
    ) -> ERPData:
        """获取 ERP 数据
        
        Args:
            per_channel: 如果为True，返回每个通道的ERP数据；如果为False，返回通道平均后的ERP数据
        """
        epochs = session.epochs
        if epochs is None:
            raise ValueError("请先创建 Epochs")
        
        # 过滤出实际存在的通道
        available_channels = [ch for ch in channels if ch in epochs.ch_names]
        if len(available_channels) == 0:
            raise ValueError(f"所选通道 {channels} 在数据中不存在。可用通道: {epochs.ch_names[:10]}...")
        
        # 选择通道
        epochs_picked = epochs.copy().pick_channels(available_channels)
        
        times_ms = (epochs.times * 1000).tolist()  # 转换为 ms
        
        # 按条件计算 ERP
        conditions = {}
        channel_data = {} if per_channel else None
        
        for event_name in epochs.event_id.keys():
            evoked = epochs_picked[event_name].average()
            
            if per_channel:
                # 返回每个通道的数据
                channel_data[event_name] = {}
                for ch_idx, ch_name in enumerate(available_channels):
                    ch_data = evoked.data[ch_idx, :] * 1e6  # 转换为 µV
                    
                    # 计算标准误（该通道在所有epochs上的标准差）
                    epoch_data = epochs_picked[event_name].get_data() * 1e6
                    ch_epoch_data = epoch_data[:, ch_idx, :]
                    stderr = ch_epoch_data.std(axis=0) / np.sqrt(len(ch_epoch_data))
                    
                    channel_data[event_name][ch_name] = {
                        "data": ch_data.tolist(),
                        "stderr": stderr.tolist()
                    }
                
                # 同时计算平均后的数据（用于兼容）
                data = evoked.data.mean(axis=0) * 1e6
                epoch_data = epochs_picked[event_name].get_data() * 1e6
                stderr = epoch_data.mean(axis=1).std(axis=0) / np.sqrt(len(epoch_data))
                conditions[event_name] = {
                    "data": data.tolist(),
                    "stderr": stderr.tolist()
                }
            else:
                # 返回通道平均后的数据
                data = evoked.data.mean(axis=0) * 1e6  # 平均通道，转换为 µV
                
                # 计算标准误
                epoch_data = epochs_picked[event_name].get_data() * 1e6
                stderr = epoch_data.mean(axis=1).std(axis=0) / np.sqrt(len(epoch_data))
                
                conditions[event_name] = {
                    "data": data.tolist(),
                    "stderr": stderr.tolist()
                }
        
        return ERPData(
            times=times_ms,
            conditions=conditions,
            channel_data=channel_data
        )
    
    @staticmethod
    def get_psd_data(
        session: EEGSession,
        channels: list[str],
        fmin: float = 1.0,
        fmax: float = 50.0,
        average: bool = True
    ) -> PSDData:
        """获取 PSD 数据
        
        Args:
            session: EEG会话
            channels: 通道列表
            fmin: 最小频率
            fmax: 最大频率
            average: 是否平均所有通道（True=Average View, False=Butterfly View）
        """
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")
        
        # 过滤出实际存在的通道
        available_channels = [ch for ch in channels if ch in raw.ch_names]
        if len(available_channels) == 0:
            raise ValueError(f"所选通道 {channels} 在数据中不存在。可用通道: {raw.ch_names[:10]}...")
        
        # 选择通道
        picks = mne.pick_channels(raw.ch_names, include=available_channels)
        
        # 计算 PSD
        psd = raw.compute_psd(fmin=fmin, fmax=fmax, picks=picks)
        psds, freqs = psd.get_data(return_freqs=True)
        
        # 平均所有通道，转换为 dB（总是计算，用于Average View）
        mean_psd = psds.mean(axis=0)
        psd_db = 10 * np.log10(mean_psd)
        
        if average:
            # Average View: 只返回平均值
            return PSDData(
                frequencies=freqs.tolist(),
                power=psd_db.tolist(),
                channels=None
            )
        else:
            # Butterfly View: 返回每个通道的PSD
            channel_psds = {}
            for idx, ch_name in enumerate(channels):
                if idx < psds.shape[0]:
                    ch_psd_db = 10 * np.log10(psds[idx, :])
                    channel_psds[ch_name] = ch_psd_db.tolist()
            
            return PSDData(
                frequencies=freqs.tolist(),
                power=psd_db.tolist(),  # 仍然提供平均值作为备用
                channels=channel_psds
            )

    @staticmethod
    def get_available_montages() -> list[dict]:
        """获取可用的标准脑模板列表

        Returns:
            蒙特卡信息列表，每个元素包含：
            - name: 蒙特卡名称
            - channel_count: 通道数量
            - sample_channels: 前5个通道名示例
        """
        standard_montages = [
            "standard_1020",
            "standard_1005",
            "standard_alphabetic",
            "standard_prefixed",
            "standard_postfixed",
            "biosemi16",
            "biosemi32",
            "biosemi64",
            "easycap-M1",
            "easycap-M10"
        ]

        montage_info = []
        for name in standard_montages:
            try:
                montage = mne.channels.make_standard_montage(name)
                montage_info.append({
                    "name": name,
                    "channel_count": len(montage.ch_names),
                    "sample_channels": montage.ch_names[:5]
                })
            except Exception:
                # 跳过无法加载的蒙特卡
                pass

        return montage_info

    @staticmethod
    def get_topomap_data(
        session: EEGSession,
        time_point: Optional[float] = None,
        freq_band: Optional[tuple[float, float]] = None,
        time_window: Optional[tuple[float, Optional[float]]] = None,
        interpolation: str = 'linear',
        contours: int = 8,
        sensors: bool = True,
        render_mode: str = 'data'
    ) -> TopomapData:
        """获取地形图数据

        Args:
            session: EEG会话
            time_point: 时间点（ms），用于电位地形图
            freq_band: 频率范围（Hz），用于功率地形图
            time_window: 时间窗（start, end），用于功率地形图
            interpolation: 插值方法 ('linear', 'cubic', 'spline')
            contours: 等高线数量
            sensors: 是否显示电极标记
            render_mode: 渲染模式 ('data' | 'image')

        Returns:
            TopomapData: 包含通道名、位置、值、范围和可选的图像
        """
        epochs = session.epochs
        raw = session.raw

        if epochs is None:
            raise ValueError(
                "地形图功能需要先创建 Epochs。\n"
                "原因：地形图用于显示分段后的数据分布（ERP 或功率谱）。\n"
                "建议：请先进行分段（Epoching）操作，然后查看地形图。"
            )

        # ===== 地形图：基于 Epochs 数据 =====

        # 提取通道名称和位置（只需提取一次）
        ch_names = epochs.ch_names
        positions = []
        for ch_idx, ch_name in enumerate(ch_names):
            if ch_idx < len(epochs.info['chs']):
                ch_info = epochs.info['chs'][ch_idx]
                if ch_info['loc'] is not None and len(ch_info['loc']) >= 3:
                    positions.append({
                        "x": float(ch_info['loc'][0]),
                        "y": float(ch_info['loc'][1]),
                        "z": float(ch_info['loc'][2]) if len(ch_info['loc']) > 2 else 0.0
                    })
                else:
                    positions.append({"x": 0.0, "y": 0.0, "z": 0.0})
            else:
                positions.append({"x": 0.0, "y": 0.0, "z": 0.0})

        # 计算地形图数据
        if time_point is not None:
            # ===== 电位地形图：显示特定时间点的 ERP =====
            evoked = epochs.average()
            time_sec = time_point / 1000.0
            time_idx = np.argmin(np.abs(evoked.times - time_sec))
            data = evoked.data[:, time_idx] * 1e6  # 转换为 µV

        else:
            # ===== 功率地形图：显示频段功率分布 =====
            print(f"[DEBUG] 功率地形图 - freq_band: {freq_band}")
            if freq_band is not None:
                # 用户指定了频段
                print(f"[DEBUG] 使用指定频段: {freq_band[0]}-{freq_band[1]} Hz")
                epochs_psd = epochs.compute_psd(fmin=freq_band[0], fmax=freq_band[1])
            else:
                # 使用所有频段（不限制）
                print(f"[DEBUG] 使用全频段")
                epochs_psd = epochs.compute_psd()

            # 获取 PSD 数据并平均
            # get_data() 返回 (n_epochs, n_channels, n_freqs)
            psds, freqs = epochs_psd.get_data(return_freqs=True)
            print(f"[DEBUG] PSD原始形状: {psds.shape}")  # 应该是 (n_epochs, n_channels, n_freqs)

            # 先对 epochs 维度求平均，再对 freqs 维度求平均，得到 (n_channels,)
            data = psds.mean(axis=(0, 2)) * 1e12  # 先对 epochs 和 freqs 求平均
            print(f"[DEBUG] 数据形状: {data.shape}, 数据范围: {data.min():.2e} - {data.max():.2e}")

        # 计算值的范围
        vmin = float(np.min(data))
        vmax = float(np.max(data))

        # 图像生成（如果请求）
        image_base64 = None
        if render_mode == 'image':
            import io
            import base64
            import matplotlib
            matplotlib.use('Agg')  # 使用非交互式后端
            import matplotlib.pyplot as plt
            from matplotlib.backends.backend_agg import FigureCanvasAgg

            # 归一化电极位置（与前端Canvas静态地形图一致）
            # 为 A1/A2 设置正确的耳朵位置
            pos_array_normalized = []
            valid_ch_names = []
            for ch_name, p in zip(ch_names, positions):
                x3d, y3d, z3d = p['x'], p['y'], p['z']
                r3d = np.sqrt(x3d**2 + y3d**2 + z3d**2)

                # A1/A2 位置修正：如果位置无效，手动设置到耳朵位置
                if ch_name.upper() in ['A1', 'A2']:
                    if r3d < 0.01:  # 位置数据无效
                        # A1 在左耳，A2 在右耳（标准 10-20 系统位置）
                        if ch_name.upper() == 'A1':
                            x3d, y3d, z3d = -0.5, 0.0, 0.0
                        else:  # A2
                            x3d, y3d, z3d = 0.5, 0.0, 0.0
                        r3d = np.sqrt(x3d**2 + y3d**2 + z3d**2)

                # 跳过其他无效位置
                if r3d < 0.01:
                    continue

                # 归一化到单位球面
                x_norm = x3d / r3d
                y_norm = y3d / r3d
                z_norm = z3d / r3d

                # 只显示上半球和侧面电极（z > -0.5，允许A1/A2等耳部电极）
                if z_norm < -0.5:
                    continue

                pos_array_normalized.append([x_norm, y_norm])
                valid_ch_names.append(ch_name)

            if not pos_array_normalized or not valid_ch_names:
                raise ValueError("缺少有效电极位置，无法生成 MNE 地形图。请先设置 Montage。")

            pos_array = np.array(pos_array_normalized)
            valid_data = data[[ch_names.index(ch) for ch in valid_ch_names]]

            # 创建图形
            fig, ax = plt.subplots(figsize=(7, 5))  # 稍微加宽以容纳 colorbar

            # 使用 MNE 绘制地形图
            im, _ = mne.viz.plot_topomap(
                data=valid_data,
                pos=pos_array,
                axes=ax,
                cmap='RdBu_r',
                contours=contours,
                sensors=sensors,
                names=valid_ch_names if sensors else None,
                show=False
            )

            # 添加 colorbar
            cbar = plt.colorbar(im, ax=ax, shrink=0.6)
            cbar.set_label('Amplitude (µV)', fontsize=10)
            cbar.ax.tick_params(labelsize=8)

            # 转换为 base64
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
            buf.seek(0)
            image_base64 = base64.b64encode(buf.read()).decode('utf-8')
            plt.close(fig)

        return TopomapData(
            channel_names=ch_names,
            positions=positions,
            values=data.tolist(),
            vmin=vmin,
            vmax=vmax,
            image_base64=image_base64
        )

    @staticmethod
    def get_topomap_animation_frames(
        session: EEGSession,
        start_time: float,  # ms
        end_time: float,    # ms
        frame_interval: float = 20.0,  # ms
        render_mode: str = 'data',  # 'data' 或 'image'
        interpolation: str = 'linear',  # 保留参数（未使用）
        contours: int = 8,
        sensors: bool = True
    ) -> dict:
        """获取地形图动画帧数据（支持电位地形图，返回数据或图片）

        Args:
            session: EEG会话
            start_time: 起始时间（ms）
            end_time: 结束时间（ms）
            frame_interval: 帧间隔（ms）
            render_mode: 'data'=返回Canvas数据, 'image'=返回MNE图片

        Returns:
            render_mode='data': {
                frames: [{time_ms: float, values: list[float]}, ...],
                channel_names: list[str],
                positions: list[dict],
                frame_count: int,
                duration_ms: float,
                interval_ms: float,
                render_mode: 'data'
            }
            render_mode='image': {
                frames: [{time_ms: float, image_base64: str}, ...],
                frame_count: int,
                duration_ms: float,
                interval_ms: float,
                render_mode: 'image'
            }
        """
        epochs = session.epochs
        if epochs is None:
            raise ValueError(
                "地形图动画需要先创建 Epochs。\n"
                "原因：动画基于 ERP 数据随时间的变化。\n"
                "建议：请先进行分段（Epoching）操作。"
            )

        # 提取通道名称和位置
        ch_names = epochs.ch_names
        positions = []
        for ch_idx, ch_name in enumerate(ch_names):
            if ch_idx < len(epochs.info['chs']):
                ch_info = epochs.info['chs'][ch_idx]
                if ch_info['loc'] is not None and len(ch_info['loc']) >= 3:
                    positions.append({
                        "x": float(ch_info['loc'][0]),
                        "y": float(ch_info['loc'][1]),
                        "z": float(ch_info['loc'][2]) if len(ch_info['loc']) > 2 else 0.0
                    })
                else:
                    positions.append({"x": 0.0, "y": 0.0, "z": 0.0})
            else:
                positions.append({"x": 0.0, "y": 0.0, "z": 0.0})

        # 计算 ERP 平均
        evoked = epochs.average()

        # 生成时间点序列
        start_sec = start_time / 1000.0
        end_sec = end_time / 1000.0
        interval_sec = frame_interval / 1000.0

        time_points_sec = np.arange(start_sec, end_sec + interval_sec, interval_sec)

        # 只保留在 evoked.times 范围内的时间点
        valid_mask = (time_points_sec >= evoked.times[0]) & (time_points_sec <= evoked.times[-1])
        time_points_sec = time_points_sec[valid_mask]

        if len(time_points_sec) == 0:
            raise ValueError(
                f"指定的时间范围 {start_time}-{end_time} ms 超出了 ERP 数据范围 "
                f"{evoked.times[0]*1000:.0f}-{evoked.times[-1]*1000:.0f} ms"
            )

        if render_mode == 'data':
            # Canvas 风格：返回数据
            frames = []
            for time_sec in time_points_sec:
                time_ms = time_sec * 1000.0
                time_idx = np.argmin(np.abs(evoked.times - time_sec))
                data = evoked.data[:, time_idx] * 1e6  # µV

                frames.append({
                    "time_ms": float(time_ms),
                    "values": data.astype(float).tolist()
                })

            return {
                "frames": frames,
                "channel_names": ch_names,
                "positions": positions,
                "frame_count": len(frames),
                "duration_ms": float(end_time - start_time),
                "interval_ms": float(frame_interval),
                "render_mode": "data"
            }

        else:
            # MNE 风格：生成图片帧
            import io
            import base64
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            from matplotlib.backends.backend_agg import FigureCanvasAgg

            # 归一化电极位置（与前端Canvas静态地形图一致）
            # 为 A1/A2 设置正确的耳朵位置
            pos_array_normalized = []
            valid_ch_names = []
            for ch_name, p in zip(ch_names, positions):
                x3d, y3d, z3d = p['x'], p['y'], p['z']
                r3d = np.sqrt(x3d**2 + y3d**2 + z3d**2)

                # A1/A2 位置修正：如果位置无效，手动设置到耳朵位置
                if ch_name.upper() in ['A1', 'A2']:
                    if r3d < 0.01:  # 位置数据无效
                        # A1 在左耳，A2 在右耳（标准 10-20 系统位置）
                        if ch_name.upper() == 'A1':
                            x3d, y3d, z3d = -0.5, 0.0, 0.0
                        else:  # A2
                            x3d, y3d, z3d = 0.5, 0.0, 0.0
                        r3d = np.sqrt(x3d**2 + y3d**2 + z3d**2)

                # 跳过其他无效位置
                if r3d < 0.01:
                    continue

                # 归一化到单位球面
                x_norm = x3d / r3d
                y_norm = y3d / r3d
                z_norm = z3d / r3d

                # 只显示上半球和侧面电极（z > -0.5，允许A1/A2等耳部电极）
                if z_norm < -0.5:
                    continue

                pos_array_normalized.append([x_norm, y_norm])
                valid_ch_names.append(ch_name)

            if not pos_array_normalized or not valid_ch_names:
                raise ValueError("缺少有效电极位置，无法生成 MNE 动画。请先设置 Montage。")

            pos_array = np.array(pos_array_normalized)

            frames = []
            for time_sec in time_points_sec:
                time_ms = time_sec * 1000.0
                time_idx = np.argmin(np.abs(evoked.times - time_sec))
                data = evoked.data[:, time_idx] * 1e6  # µV

                # 过滤到有效通道的数据
                valid_data = data[[ch_names.index(ch) for ch in valid_ch_names]]

                # 生成单帧图像（添加 colorbar）
                fig, ax = plt.subplots(figsize=(7, 5))  # 稍微加宽以容纳 colorbar
                im, _ = mne.viz.plot_topomap(
                    data=valid_data,
                    pos=pos_array,
                    axes=ax,
                    cmap='RdBu_r',
                    contours=contours,
                    sensors=sensors,
                    names=valid_ch_names if sensors else None,
                    show=False
                )

                # 添加 colorbar
                cbar = plt.colorbar(im, ax=ax, shrink=0.6)
                cbar.set_label('Amplitude (µV)', fontsize=10)
                cbar.ax.tick_params(labelsize=8)

                buf = io.BytesIO()
                fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
                buf.seek(0)
                img_base64 = base64.b64encode(buf.read()).decode('utf-8')
                plt.close(fig)

                frames.append({
                    "time_ms": float(time_ms),
                    "image_base64": img_base64
                })

            return {
                "frames": frames,
                "frame_count": len(frames),
                "duration_ms": float(end_time - start_time),
                "interval_ms": float(frame_interval),
                "render_mode": "image"
            }

    @staticmethod
    def crop_data(session: EEGSession, tmin: float, tmax: Optional[float] = None):
        """裁剪数据"""
        raw = session.raw
        if raw is None:
            raise ValueError("会话中没有加载的数据")

        # 保存状态到撤销栈
        session.save_state("crop", {"tmin": tmin, "tmax": tmax})

        raw.crop(tmin=tmin, tmax=tmax)
        session.add_history("crop", {"tmin": tmin, "tmax": tmax})

    # ============ 数据导出 ============

    @staticmethod
    def export_data(
        session: EEGSession,
        format: str,
        output_path: Optional[str] = None,
        export_epochs: bool = False
    ) -> dict:
        """导出 EEG 数据到指定格式

        Args:
            session: EEG 会话
            format: 导出格式 ('fif', 'set', 'edf', 'bdf')
            output_path: 输出路径（可选，默认自动生成）
            export_epochs: 是否导出 epochs 而非 raw

        Returns:
            dict: 包含输出文件路径和导出信息
        """
        import os
        from pathlib import Path

        # 获取导出对象
        if export_epochs:
            if session.epochs is None:
                raise ValueError(
                    "未找到 Epochs 数据。请先创建 Epochs，或者设置 export_epochs=False 导出 Raw 数据。"
                )
            data_obj = session.epochs
            data_type = "epochs"
        else:
            if session.raw is None:
                raise ValueError("会话中没有加载的数据")
            data_obj = session.raw
            data_type = "raw"

        # 生成输出路径
        if output_path is None:
            base_name = Path(session.file_path).stem
            output_dir = Path(session.file_path).parent
            ext = "." + format
            output_path = str(output_dir / f"{base_name}_exported_{data_type}{ext}")

        output_path = str(output_path)

        # 根据格式导出
        if format == 'fif':
            # FIF 格式 - MNE 原生
            data_obj.save(output_path, overwrite=True, verbose=False)

        elif format in ('edf', 'set'):
            # 其他格式 - 使用 mne.export
            # mne.export.export_raw() 需要标准的 Raw 对象，不能是 RawArray
            # 策略：先保存为临时 FIF 文件，再读取为标准 Raw，然后导出

            import tempfile

            # 准备要导出的数据
            if export_epochs:
                # 将 epochs 转换回 raw（拼接所有 epoch）
                # Epochs 数据形状: (n_epochs, n_channels, n_times)
                data_array = data_obj.get_data()
                n_epochs, n_channels, n_times = data_array.shape
                # 重塑为 (n_channels, n_epochs * n_times)
                data_reshaped = data_array.transpose(1, 0, 2).reshape(n_channels, -1)

                info = data_obj.info.copy()
                raw_temp = mne.io.RawArray(data_reshaped, info)
                data_to_export = raw_temp
            else:
                data_to_export = data_obj

            # 检查依赖包
            if format == 'edf':
                try:
                    import edfio
                except ImportError:
                    raise ImportError(
                        "导出 EDF 格式需要安装 edfio 包。\n"
                        "请运行: pip install edfio"
                    )
            elif format == 'set':
                try:
                    import eeglabio
                except ImportError:
                    raise ImportError(
                        "导出 SET 格式需要安装 eeglabio 包。\n"
                        "请运行: pip install eeglabio"
                    )

            # 检查 mne.export 是否可用
            try:
                from mne import export
            except ImportError:
                raise ImportError(
                    "导出 EDF/SET 格式需要安装 mne-export 包。\n"
                    "请运行: pip install mne-export"
                )

            # 创建临时 FIF 文件
            with tempfile.NamedTemporaryFile(suffix='.fif', delete=False) as tmp_fif:
                tmp_path = tmp_fif.name

            try:
                # 先保存为临时 FIF 文件（确保数据是标准 Raw 格式）
                data_to_export.save(tmp_path, overwrite=True, verbose=False)

                # 重新读取为标准 Raw 对象
                raw_standard = mne.io.read_raw_fif(tmp_path, preload=True, verbose=False)

                # 映射格式名称
                fmt_map = {
                    'edf': 'edf',
                    'set': 'eeglab'
                }
                fmt = fmt_map.get(format, format)

                # 导出为目标格式
                try:
                    export.export_raw(
                        output_path,  # 第一个参数是文件路径
                        raw_standard,  # 第二个参数是 Raw 对象
                        fmt=fmt,
                        overwrite=True,
                        verbose=False
                    )
                except TypeError as e:
                    # 旧版本 mne.export 可能不支持 overwrite 参数
                    if 'overwrite' in str(e):
                        # 先删除现有文件
                        if os.path.exists(output_path):
                            os.remove(output_path)
                        export.export_raw(
                            output_path,
                            raw_standard,
                            fmt=fmt,
                            verbose=False
                        )
                    else:
                        raise
            finally:
                # 清理临时文件
                try:
                    os.remove(tmp_path)
                except:
                    pass

        else:
            raise ValueError(f"不支持的导出格式: {format}")

        # 返回结果信息
        file_size = os.path.getsize(output_path)
        return {
            "output_path": output_path,
            "format": format,
            "data_type": data_type,
            "file_size": file_size,
            "file_size_mb": round(file_size / (1024 * 1024), 2)
        }

# 全局服务实例
eeg_service = EEGService()

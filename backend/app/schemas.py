"""Pydantic 数据模型"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

# ============ 文件系统 ============

class FileInfo(BaseModel):
    """文件信息"""
    id: str
    name: str
    path: str
    format: Literal["edf", "set", "fif"]
    size: int  # bytes
    status: Literal["unprocessed", "processing", "completed"] = "unprocessed"
    modified_at: datetime

class ScanRequest(BaseModel):
    """目录扫描请求"""
    path: str = Field(..., description="要扫描的本地目录路径")

class ScanResponse(BaseModel):
    """目录扫描响应"""
    files: list[FileInfo]
    total_count: int

# ============ EEG 数据信息 ============

class ChannelInfo(BaseModel):
    """通道信息"""
    name: str
    type: Literal["EEG", "EOG", "EMG", "ECG", "STIM", "OTHER"]
    is_bad: bool = False
    position: Optional[dict] = None  # {x, y, z}

class EEGDataInfo(BaseModel):
    """EEG 数据概要信息"""
    subject_id: str
    measurement_date: Optional[str] = None
    duration: float  # seconds
    file_size: int
    channel_count: int
    sample_rate: float
    highpass_filter: Optional[float] = None
    lowpass_filter: Optional[float] = None
    bad_channels: list[str] = []
    channels: list[ChannelInfo]
    has_montage: bool = False
    has_epochs: bool = False  # 是否已分段
    epoch_event_ids: list[int] = []  # epochs中包含的事件ID（用于TFR/ERP选择）
    epoch_tmin: Optional[float] = None  # seconds
    epoch_tmax: Optional[float] = None  # seconds

class EventInfo(BaseModel):
    """事件信息"""
    id: int
    count: int
    label: Optional[str] = None
    color: Optional[str] = None

class LoadDataRequest(BaseModel):
    """加载数据请求"""
    file_path: str

class LoadDataResponse(BaseModel):
    """加载数据响应"""
    info: EEGDataInfo
    events: list[EventInfo]
    session_id: str  # 用于后续操作的会话标识

# ============ 波形数据 ============

class WaveformRequest(BaseModel):
    """波形数据请求"""
    session_id: str
    start_time: float = 0.0  # seconds
    duration: float = 10.0   # seconds
    target_sample_rate: int = 250  # 降采样率

class WaveformChannel(BaseModel):
    """单通道波形数据"""
    name: str
    data: list[float]
    is_bad: bool

class WaveformEvent(BaseModel):
    """波形中的事件标记"""
    time: float
    id: int
    label: Optional[str] = None

class WaveformResponse(BaseModel):
    """波形数据响应"""
    time_range: tuple[float, float]
    sample_rate: int
    channels: list[WaveformChannel]
    events: list[WaveformEvent] = []
    is_epoch: bool = False  # 是否为epoch模式
    n_epochs: Optional[int] = None  # epoch模式下，epoch总数

# ============ 预处理操作 ============

class FilterRequest(BaseModel):
    """滤波请求"""
    session_id: str
    l_freq: Optional[float] = Field(None, description="高通截止频率 (Hz)")
    h_freq: Optional[float] = Field(None, description="低通截止频率 (Hz)")
    notch_freq: Optional[float] = Field(None, description="陷波频率 (Hz)")

class ResampleRequest(BaseModel):
    """重采样请求"""
    session_id: str
    target_sfreq: float = Field(..., description="目标采样率 (Hz)")

class RereferenceRequest(BaseModel):
    """重参考请求"""
    session_id: str
    method: Literal["average", "a1a2", "custom"] = "average"
    custom_ref: Optional[list[str]] = None  # 自定义参考电极

class ICARequest(BaseModel):
    """ICA 请求"""
    session_id: str
    n_components: Optional[int] = None
    exclude_labels: list[str] = Field(
        default=["eye blink", "muscle artifact"],
        description="要排除的成分类型"
    )
    threshold: float = Field(0.9, ge=0.5, le=0.99)

class EpochRequest(BaseModel):
    """分段请求"""
    session_id: str
    event_ids: list[int]  # 要分段的事件ID列表
    tmin: float = -0.2
    tmax: float = 0.8
    baseline: Optional[tuple[float, float]] = (-0.2, 0)
    reject_threshold: Optional[float] = 100.0  # µV

class CropRequest(BaseModel):
    """裁剪请求"""
    session_id: str
    tmin: float
    tmax: Optional[float] = None

class BadChannelRequest(BaseModel):
    """标记/取消坏道请求"""
    session_id: str
    channel_name: str
    is_bad: bool

class SetMontageRequest(BaseModel):
    """设置电极定位请求"""
    session_id: str
    montage_name: str = "standard_1020"  # 或自定义路径

# ============ 可视化数据 ============

class ERPRequest(BaseModel):
    """ERP 数据请求"""
    session_id: str
    channels: list[str]  # ROI 通道
    event_ids: Optional[list[int]] = None
    baseline: Optional[tuple[float, float]] = (-0.2, 0)
    per_channel: bool = False  # 如果为True，返回每个通道的ERP数据

class ERPData(BaseModel):
    """ERP 数据"""
    times: list[float]  # ms
    conditions: dict[str, dict]  # {condition_name: {data: [], stderr: []}}
    channel_data: Optional[dict[str, dict]] = None  # {channel_name: {condition_name: {data: [], stderr: []}}}

class PSDRequest(BaseModel):
    """PSD 数据请求"""
    session_id: str
    channels: list[str]
    fmin: float = 1.0
    fmax: float = 50.0
    average: bool = True  # True=Average View, False=Butterfly View

class PSDData(BaseModel):
    """PSD 数据"""
    frequencies: list[float]
    power: list[float]  # dB (平均模式)
    channels: Optional[dict[str, list[float]]] = None  # {channel_name: [power...]} (Butterfly模式)

class TopomapRequest(BaseModel):
    """地形图数据请求"""
    session_id: str
    time_point: Optional[float] = None  # ms
    freq_band: Optional[tuple[float, float]] = None  # Hz
    time_window: Optional[tuple[float, Optional[float]]] = None  # seconds (start, end)

    # 新增：可视化参数
    interpolation: Literal["linear", "cubic", "spline"] = "linear"
    contours: int = Field(8, ge=0, le=20)
    sensors: bool = True
    render_mode: Literal["data", "image"] = "data"  # 默认保持旧行为

class TopomapData(BaseModel):
    """地形图数据"""
    channel_names: list[str]
    positions: list[dict]  # [{x, y}, ...]
    values: list[float]
    vmin: float
    vmax: float
    image_base64: Optional[str] = None  # 新增：PNG图像的base64编码（MNE渲染）

class TopoAnimationRequest(BaseModel):
    """地形图动画请求"""
    session_id: str
    start_time: float = Field(..., description="起始时间，单位ms")
    end_time: float = Field(..., description="结束时间，单位ms")
    frame_interval: float = Field(20.0, description="帧间隔，单位ms")
    render_mode: Literal["data", "image"] = Field("data", description="渲染模式：data=Canvas数据，image=MNE图片")
    interpolation: Literal["linear", "cubic", "spline"] = "linear"
    contours: int = Field(8, ge=0, le=20)
    sensors: bool = True

class TopoAnimationFrame(BaseModel):
    """单帧动画数据"""
    time_ms: float
    values: Optional[list[float]] = None  # 每个通道的电位值（µV）- Canvas风格
    image_base64: Optional[str] = None  # MNE渲染的PNG图像 - MNE风格

class TopoAnimationResponse(BaseModel):
    """地形图动画响应"""
    frames: list[TopoAnimationFrame]
    channel_names: Optional[list[str]] = None  # 通道名称列表 - Canvas风格
    positions: Optional[list[dict]] = None  # 电极位置 - Canvas风格
    frame_count: int
    duration_ms: float
    interval_ms: float
    render_mode: Literal['data', 'image'] = 'data'  # 标识渲染模式

# ============ TFR ============

class TFRRequest(BaseModel):
    """TFR 任务请求（支持 Canvas/MNE 双渲染风格）"""
    session_id: str
    channels: list[str]
    event_id: Optional[int] = None
    fmin: float = 1.0
    fmax: float = 40.0
    n_cycles: float = 7.0
    baseline: Optional[tuple[float, float]] = (-0.2, 0.0)  # seconds
    baseline_mode: Literal["logratio", "ratio", "zscore", "percent"] = "logratio"
    decim: int = 2
    # 新增：渲染模式
    render_mode: Literal["data", "image"] = "data"  # data=Canvas数据, image=MNE图像
    # 新增：MNE 渲染参数
    colormap: str = "RdBu_r"  # MNE colormap
    vmin: Optional[float] = None  # 颜色映射最小值（自动计算则为None）
    vmax: Optional[float] = None  # 颜色映射最大值（自动计算则为None）


class TFRStartResponse(BaseModel):
    job_id: str


class TFRResult(BaseModel):
    times: list[float]  # ms
    freqs: list[float]  # Hz
    power: list[list[float]]  # [freq][time] (channels avg)
    channel_names: list[str] = []  # picks后的通道名（用于多通道小窗显示）
    power_by_channel: list[list[list[float]]] = []  # [ch][freq][time]
    # 新增：MNE 渲染输出
    image_base64: Optional[str] = None  # MNE渲染的PNG图像（base64编码）
    images_by_channel: Optional[dict[str, str]] = None  # 每通道MNE图像 {ch_name: base64}
    vmin: Optional[float] = None  # 实际使用的颜色范围
    vmax: Optional[float] = None
    render_mode: Literal["data", "image"] = "data"


class TFRJobResponse(BaseModel):
    job_id: str
    status: Literal["pending", "running", "completed", "error"]
    progress: float = 0.0
    error: Optional[str] = None
    result: Optional[TFRResult] = None

# ============ 特征导出 ============

class ExportRule(BaseModel):
    """导出规则"""
    roi_channels: list[str]
    metric: Literal[
        "mean_amplitude", 
        "peak_amplitude_positive",
        "peak_amplitude_negative", 
        "peak_latency",
        "spectral_power",
        "spectral_entropy",
        "frequency_ratio"
    ]
    time_window: Optional[tuple[float, float]] = None  # ms
    freq_band: Optional[tuple[float, float]] = None    # Hz

class ExportRequest(BaseModel):
    """特征导出请求"""
    session_ids: list[str]  # 多个被试
    conditions: list[str]   # 条件名称
    rules: list[ExportRule]
    output_format: Literal["csv", "xlsx"] = "csv"

class OperationResponse(BaseModel):
    """通用操作响应"""
    success: bool
    message: str
    data: Optional[dict] = None

# ============ EEG 数据导出 ============

class DataExportRequest(BaseModel):
    """EEG 数据导出请求"""
    session_id: str
    format: Literal["fif", "set", "edf"]
    output_path: Optional[str] = None  # 可选，不指定则自动生成
    export_epochs: bool = False  # 是否导出 epochs 而非 raw


# ============ 批量预处理 ============

class PreprocessingStepConfig(BaseModel):
    """预处理步骤配置"""
    id: str
    type: Literal["montage", "filter", "resample", "rereference", "ica", "crop", "epoch", "bad_channel"]
    enabled: bool
    params: dict


class BatchProcessingRequest(BaseModel):
    """批量处理请求"""
    file_paths: list[str]  # 要处理的文件路径列表
    preprocessing_steps: list[PreprocessingStepConfig]  # 预处理步骤配置
    output_dir: str  # 输出目录
    output_format: Literal["fif", "set", "edf"] = "fif"  # 输出格式
    export_epochs: bool = False  # 是否导出 epochs


class BatchFileResult(BaseModel):
    """单个文件的处理结果"""
    file_path: str
    file_name: str
    status: Literal["success", "failed", "pending"]
    output_path: Optional[str] = None
    error: Optional[str] = None
    processing_time: Optional[float] = None  # 处理耗时（秒）


class BatchJobStatus(BaseModel):
    """批量任务状态"""
    job_id: str
    status: Literal["idle", "running", "completed", "failed", "cancelled"]
    total_files: int
    completed_files: int
    failed_files: int
    current_file: Optional[str] = None
    current_step: Optional[str] = None
    progress: float  # 0-100
    error_message: Optional[str] = None
    results: list[BatchFileResult]
    created_at: datetime
    updated_at: Optional[datetime] = None


class BatchProcessingResponse(BaseModel):
    """批量处理响应"""
    job_id: str
    message: str
    total_files: int


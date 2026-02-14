"""应用配置"""
import sys
from pydantic_settings import BaseSettings
from pathlib import Path

def get_cache_dir() -> Path:
    """
    获取缓存目录路径
    - 打包环境：exe 所在目录的 .mne_project_cache
    - 开发环境：项目根目录的 .mne_project_cache
    """
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包环境：使用 exe 所在目录
        exe_dir = Path(sys.executable).parent
        return exe_dir / ".mne_project_cache"
    else:
        # 开发环境：使用项目根目录
        return Path(__file__).parent.parent.parent / ".mne_project_cache"

class Settings(BaseSettings):
    """应用设置"""
    
    # 应用信息
    APP_NAME: str = "EEGAnalysis API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 服务器配置
    HOST: str = "127.0.0.1"
    PORT: int = 8088  # 使用 8088 避免常见端口冲突
    
    # CORS 配置（开发模式需要跨域，打包后同源访问不需要）
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "http://localhost:8088",
        "http://127.0.0.1:8088",
    ]
    
    # 缓存目录
    CACHE_DIR: Path = get_cache_dir()
    
    # 数据处理配置
    DEFAULT_SAMPLE_RATE: int = 250  # 默认降采样率
    WAVEFORM_CHUNK_DURATION: float = 10.0  # 每次返回的波形时长(秒)
    MAX_CHANNELS_DISPLAY: int = 64  # 最大同时显示的通道数
    TFR_N_JOBS: int = 1  # TFR 计算并行度（默认单进程，减少中断时资源告警）
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()

# 确保缓存目录存在
settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)

"""应用配置"""
import sys
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from typing import Optional

def get_cache_dir() -> Path:
    """
    获取缓存目录路径
    - 打包环境：exe 所在目录的 .mne_project_cache
    - 开发环境：项目根目录的 .mne_project_cache
    """
    if getattr(sys, 'frozen', False):
        exe_dir = Path(sys.executable).parent
        return exe_dir / ".mne_project_cache"
    else:
        return Path(__file__).parent.parent.parent / ".mne_project_cache"

class Settings(BaseSettings):
    """应用设置"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # 应用信息
    APP_NAME: str = "EEGAnalysis API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # 服务器配置
    HOST: str = "127.0.0.1"
    PORT: int = 8088

    # CORS 配置
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8088",
        "http://127.0.0.1:8088",
    ]
    CORS_ORIGIN_REGEX: Optional[str] = r"https://.*\.vercel\.app"

    # 缓存目录
    CACHE_DIR: Path = get_cache_dir()
    UPLOAD_DIR: Path = CACHE_DIR / "uploads"

    # 数据处理配置
    DEFAULT_SAMPLE_RATE: int = 250
    WAVEFORM_CHUNK_DURATION: float = 10.0
    MAX_CHANNELS_DISPLAY: int = 64
    TFR_N_JOBS: int = 1
    MAX_UPLOAD_SIZE_MB: int = 100
    SUPPORTED_UPLOAD_EXTENSIONS: list[str] = [".edf", ".bdf", ".gdf", ".set", ".fif"]
    MAX_UNDO_STACK: int = 10
    ENABLE_ICLABEL: bool = True
    ICA_FIT_MAX_SFREQ: float = 250.0
    ICA_FIT_MAX_DURATION_SECONDS: Optional[float] = None
    LOG_REQUESTS: bool = False

settings = Settings()

# 确保缓存目录存在
settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

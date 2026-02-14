"""FastAPI 主应用"""
import sys
import io
import os
from pathlib import Path

# 设置标准输出编码为UTF-8，避免Windows GBK编码错误
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import settings
from .api import workspace, waveform, preprocessing, visualization, filesystem, export, batch

# 判断是否为打包环境
def get_base_path():
    """获取基础路径（支持 PyInstaller 打包）"""
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后的路径
        return Path(sys._MEIPASS)
    else:
        # 开发环境
        return Path(__file__).parent.parent.parent

BASE_PATH = get_base_path()
FRONTEND_DIST = BASE_PATH / "frontend" / "dist"

# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="本地化脑电数据预处理与可视化分析平台 API",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(workspace.router, prefix="/api")
app.include_router(waveform.router, prefix="/api")
app.include_router(preprocessing.router, prefix="/api")
app.include_router(visualization.router, prefix="/api")
app.include_router(filesystem.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(batch.router, prefix="/api/batch")

# 挂载前端静态文件（如果存在）
if FRONTEND_DIST.exists():
    # 挂载 assets 目录
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    
    # 保存路径到变量（避免闭包问题）
    _index_file = FRONTEND_DIST / "index.html"
    
    @app.get("/")
    async def serve_frontend():
        """服务前端首页"""
        if _index_file.exists():
            return FileResponse(str(_index_file))
        return {"name": settings.APP_NAME, "status": "running", "docs": "/docs"}
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA 路由支持 - 所有非 API 路由返回 index.html"""
        # 跳过 API 和文档路由
        if full_path.startswith(("api/", "docs", "redoc", "openapi.json", "health")):
            raise HTTPException(status_code=404, detail="Not found")
        
        # 尝试返回静态文件
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        
        # 否则返回 index.html（SPA 路由）
        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return {"error": "Not found"}
else:
    @app.get("/")
    async def root():
        """根路由（开发模式）"""
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running",
            "docs": "/docs",
            "note": "Frontend not bundled. Run frontend dev server separately."
        }

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}

# 启动和关闭事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    print(f"[START] {settings.APP_NAME} v{settings.APP_VERSION} starting...")
    print(f"[CACHE] {settings.CACHE_DIR}")
    print(f"[DOCS] http://{settings.HOST}:{settings.PORT}/docs")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    from .services.session_manager import session_manager
    # 清理所有会话
    for sid in list(session_manager.get_all_sessions().keys()):
        session_manager.remove_session(sid)
    print("[SHUTDOWN] Application closed")

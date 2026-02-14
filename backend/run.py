"""启动脚本 - 支持开发和打包两种模式"""
import sys
import multiprocessing
import webbrowser
import threading
import time

# Windows 打包环境下必须调用 freeze_support
if sys.platform == 'win32':
    multiprocessing.freeze_support()


def is_frozen():
    """判断是否为 PyInstaller 打包环境"""
    return getattr(sys, 'frozen', False)


def open_browser(url: str, delay: float = 1.5):
    """延迟打开浏览器"""
    def _open():
        time.sleep(delay)
        webbrowser.open(url)
    threading.Thread(target=_open, daemon=True).start()

if __name__ == "__main__":
    import uvicorn
    from app.config import settings

    # 打包模式下禁用热重载，并自动打开浏览器
    if is_frozen():
        url = f"http://{settings.HOST}:{settings.PORT}"
        
        print(f"\n{'='*50}")
        print(f"  EEG Platform v{settings.APP_VERSION}")
        print(f"  正在启动服务器...")
        print(f"  浏览器将自动打开: {url}")
        print(f"  按 Ctrl+C 关闭服务器")
        print(f"{'='*50}\n")
        
        open_browser(url)
        
        # 打包模式：直接导入 app 对象
        from app.main import app
        uvicorn.run(
            app,
            host=settings.HOST,
            port=settings.PORT,
            reload=False,
            log_level="info"
        )
    else:
        # 开发模式：使用字符串导入（支持热重载）
        uvicorn.run(
            "app.main:app",
            host=settings.HOST,
            port=settings.PORT,
            reload=settings.DEBUG,
            log_level="info"
        )

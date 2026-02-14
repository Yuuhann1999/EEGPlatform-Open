# Runtime hook for MNE-Python
# 在 MNE 导入前修复 lazy_loader 的兼容性问题

import sys
import os

# 检查是否在 PyInstaller 环境中
if getattr(sys, 'frozen', False):
    # 设置环境变量
    os.environ['LAZY_LOADER_SKIP_STUB_CHECK'] = '1'
    
    # ★ 核心修复：Monkey-patch lazy_loader.attach_stub
    try:
        import lazy_loader as _lazy_loader
        
        _original_attach_stub = _lazy_loader.attach_stub
        
        def _patched_attach_stub(package_name, filename):
            """
            修复版 attach_stub：在 PyInstaller 环境下跳过 stub 文件检查
            """
            try:
                return _original_attach_stub(package_name, filename)
            except (ValueError, FileNotFoundError, OSError, TypeError) as e:
                # PyInstaller 环境下可能找不到 .pyi 文件
                # 返回空的 __getattr__ 和 __dir__
                import importlib
                
                def __getattr__(name):
                    # 动态导入子模块
                    try:
                        submod = importlib.import_module(f"{package_name}.{name}")
                        return submod
                    except ImportError:
                        raise AttributeError(f"module '{package_name}' has no attribute '{name}'")
                
                def __dir__():
                    return []
                
                return __getattr__, __dir__
        
        # 应用补丁
        _lazy_loader.attach_stub = _patched_attach_stub
        
    except ImportError:
        # lazy_loader 未安装，跳过
        pass
    except Exception as e:
        print(f"[rthook] Warning: Failed to patch lazy_loader: {e}")


# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec 文件 - EEG Platform 打包配置
使用方法: pyinstaller EEGPlatform.spec
"""

import sys
import os
from pathlib import Path

# 获取 MNE 数据目录（包含标准脑模板等）
import mne
mne_path = Path(mne.__file__).parent

# 收集 MNE 的数据文件
mne_datas = [
    (str(mne_path / 'channels' / 'data'), 'mne/channels/data'),
    (str(mne_path / 'data'), 'mne/data'),
]

# 如果存在 icons 目录也包含
icons_path = mne_path / 'icons'
if icons_path.exists():
    mne_datas.append((str(icons_path), 'mne/icons'))

# ★ 关键：收集 MNE 的所有 .pyi stub 文件（lazy_loader 需要）
for pyi_file in mne_path.rglob('*.pyi'):
    rel_path = pyi_file.relative_to(mne_path.parent)
    dest_dir = str(rel_path.parent)
    mne_datas.append((str(pyi_file), dest_dir))
    print(f"  包含 stub: {rel_path}")

block_cipher = None

# 收集数据文件
datas = [
    ('frontend/dist', 'frontend/dist'),
    *mne_datas,
]

a = Analysis(
    ['backend/run.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[
        # FastAPI 和 Uvicorn
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        
        # MNE 相关（显式列出所有子模块避免 lazy_loader 问题）
        'mne',
        'mne.io',
        'mne.io.edf',
        'mne.io.eeglab',
        'mne.io.fiff',
        'mne.preprocessing',
        'mne.preprocessing.ica',
        'mne.viz',
        'mne.viz.topomap',
        'mne.channels',
        'mne.channels.montage',
        'mne.time_frequency',
        'mne.filter',
        'mne.epochs',
        'mne.evoked',
        'mne.baseline',
        'mne_icalabel',
        
        # lazy_loader（MNE 的依赖）
        'lazy_loader',
        
        # 科学计算
        'numpy',
        'scipy',
        'scipy.special._ufuncs_cxx',
        'scipy.linalg.cython_blas',
        'scipy.linalg.cython_lapack',
        'scipy.sparse.csgraph._validation',
        'sklearn',
        'sklearn.utils._typedefs',
        'sklearn.utils._heap',
        'sklearn.utils._sorting',
        'sklearn.utils._vector_sentinel',
        'sklearn.neighbors._partition_nodes',
        
        # 数据处理
        'pandas',
        'h5py',
        'mat73',
        'pymatreader',
        
        # Pydantic
        'pydantic',
        'pydantic_settings',
        
        # 绘图（MNE 地形图需要）
        'matplotlib',
        'matplotlib.backends.backend_agg',
        
        # 其他
        'multiprocessing',
        'encodings',
    ],
    hookspath=['hooks'],  # ★ 添加自定义 hooks 目录
    hooksconfig={},
    runtime_hooks=['hooks/rthook_mne.py'],  # ★ 运行时 hook，修复 lazy_loader
    excludes=[
        # 排除不需要的大型包
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
        'IPython',
        'jupyter',
        'notebook',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='EEGPlatform',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # 显示控制台窗口（方便查看日志）
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # 可以添加图标: icon='icon.ico'
)

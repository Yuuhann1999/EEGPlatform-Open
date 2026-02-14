# PyInstaller hook for MNE-Python
# 收集 MNE 的所有数据文件和 stub 文件

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# 收集所有 MNE 子模块
hiddenimports = collect_submodules('mne')

# 收集 MNE 的数据文件（包括 .pyi stub 文件）
datas = collect_data_files('mne', include_py_files=True)




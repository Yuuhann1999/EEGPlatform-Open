# PyInstaller hook for lazy_loader
# 确保 lazy_loader 正确打包

from PyInstaller.utils.hooks import collect_data_files

# 收集 lazy_loader 的所有文件
datas = collect_data_files('lazy_loader')




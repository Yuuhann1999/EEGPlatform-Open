# 打包发布指南

将 EEGPlatform 打包为单个可执行文件（无需安装 Python 或 Node.js）。

## 前置要求

- Python 3.9+
- Node.js + npm
- PyInstaller（`pip install pyinstaller`）

## 快速打包

```powershell
# Windows PowerShell
.\build.ps1
```

脚本自动完成前端构建 + PyInstaller 打包，输出 `dist/EEGPlatform.exe`。

## 手动打包

### 步骤 1：构建前端

```powershell
cd frontend
npm install    # 如果还没安装依赖
npm run build
# 检查: frontend/dist/ 目录应包含 index.html 和 assets/
```

### 步骤 2：检查后端依赖

```powershell
cd ..
# 激活虚拟环境
# macOS/Linux: source .venv/bin/activate
# Windows: .\.venv\Scripts\Activate.ps1

pip install -r backend/requirements.txt
pip install pyinstaller
```

### 步骤 3：PyInstaller 打包

```powershell
pyinstaller EEGPlatform.spec --noconfirm
```

输出文件：`dist/EEGPlatform.exe`（约 200–500 MB，因为包含了 MNE-Python 和全部依赖）。

### 步骤 4：测试打包结果

```powershell
.\dist\EEGPlatform.exe
# 浏览器访问 http://127.0.0.1:8088
```

## 常见问题

| 问题 | 解决 |
|------|------|
| 前端构建失败 | 检查 Node.js ≥ 16，`node_modules` 是否存在，重新 `npm install` |
| PyInstaller 打包失败 | 确保 `pip install -r backend/requirements.txt` 全部装好，查看控制台错误日志 |
| 打包后无法运行 | 确认 `frontend/dist/` 目录存在且完整，查看控制台错误信息 |
| 文件太大 | 正常现象，MNE-Python 及其依赖占用大部分体积 |

## 清理重建

```powershell
Remove-Item -Recurse -Force build
Remove-Item -Recurse -Force dist
# 然后重新运行打包命令
```

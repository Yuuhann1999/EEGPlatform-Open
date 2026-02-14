<# 
.SYNOPSIS
    EEG Platform 打包脚本
.DESCRIPTION
    将 FastAPI 后端 + React 前端打包为单个可执行文件
.EXAMPLE
    .\build.ps1
#>

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EEG Platform 打包工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Python 环境
Write-Host "[1/5] 检查 Python 环境..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  错误: 未找到 Python，请确保已安装并添加到 PATH" -ForegroundColor Red
    exit 1
}

# 检查 Node.js 环境
Write-Host "[2/5] 检查 Node.js 环境..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    $npmVersion = npm --version 2>&1
    Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "  npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  错误: 未找到 Node.js，请确保已安装" -ForegroundColor Red
    exit 1
}

# 安装 PyInstaller（如果未安装）
Write-Host "[3/5] 检查/安装 PyInstaller..." -ForegroundColor Yellow
pip show pyinstaller > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  安装 PyInstaller..." -ForegroundColor Gray
    pip install pyinstaller
}
Write-Host "  PyInstaller 已就绪" -ForegroundColor Green

# 构建前端
Write-Host "[4/5] 构建前端..." -ForegroundColor Yellow
Push-Location frontend
try {
    # 安装依赖（如果 node_modules 不存在）
    if (-not (Test-Path "node_modules")) {
        Write-Host "  安装 npm 依赖..." -ForegroundColor Gray
        npm install
    }
    
    # 构建
    Write-Host "  执行 npm run build..." -ForegroundColor Gray
    npm run build
    
    if (-not (Test-Path "dist/index.html")) {
        throw "前端构建失败：dist/index.html 不存在"
    }
    Write-Host "  前端构建完成" -ForegroundColor Green
} finally {
    Pop-Location
}

# 使用 PyInstaller 打包
Write-Host "[5/5] PyInstaller 打包..." -ForegroundColor Yellow
Write-Host "  这可能需要几分钟，请耐心等待..." -ForegroundColor Gray

# 关闭正在运行的 EEGPlatform.exe（如果存在）
$exeProcess = Get-Process -Name "EEGPlatform" -ErrorAction SilentlyContinue
if ($exeProcess) {
    Write-Host "  检测到正在运行的 EEGPlatform.exe，正在关闭..." -ForegroundColor Yellow
    $exeProcess | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# 清理旧的构建文件
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "dist") { 
    # 如果 dist 目录被占用，尝试强制删除
    try {
        Remove-Item -Recurse -Force "dist" -ErrorAction Stop
    } catch {
        Write-Host "  警告: 无法删除 dist 目录，可能被占用。请手动关闭相关程序后重试。" -ForegroundColor Yellow
        Write-Host "  继续打包，但可能会覆盖现有文件..." -ForegroundColor Yellow
    }
}

# 执行打包
pyinstaller EEGPlatform.spec --noconfirm

if ($LASTEXITCODE -ne 0) {
    Write-Host "  打包失败！" -ForegroundColor Red
    exit 1
}

# 检查输出
$exePath = "dist/EEGPlatform.exe"
if (Test-Path $exePath) {
    $fileInfo = Get-Item $exePath
    $sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  打包成功！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  输出文件: $exePath" -ForegroundColor White
    Write-Host "  文件大小: $sizeMB MB" -ForegroundColor White
    Write-Host ""
    Write-Host "  使用方法:" -ForegroundColor Yellow
    Write-Host "    1. 将 dist/EEGPlatform.exe 复制到目标电脑" -ForegroundColor Gray
    Write-Host "    2. 双击运行" -ForegroundColor Gray
    Write-Host "    3. 打开浏览器访问 http://127.0.0.1:8088" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "  打包失败：未找到输出文件" -ForegroundColor Red
    exit 1
}



# EEGPlatform 一键启动脚本
# 同时启动后端 (FastAPI/Uvicorn) 和前端 (Vite)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    EEGPlatform 启动脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 获取脚本所在目录
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# 启动后端
Write-Host "[1/2] 启动后端服务 (FastAPI)..." -ForegroundColor Yellow
$backendPath = Join-Path $ProjectRoot "backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; .\\.venv\\Scripts\\python.exe run.py"

# 等待一秒让后端先启动
Start-Sleep -Seconds 1

# 启动前端
Write-Host "[2/2] 启动前端服务 (Vite)..." -ForegroundColor Yellow
$frontendPath = Join-Path $ProjectRoot "frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "    两个服务已在新窗口中启动！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "后端地址: http://localhost:8088" -ForegroundColor Magenta
Write-Host "前端地址: http://localhost:5173" -ForegroundColor Magenta
Write-Host ""
Write-Host "提示: 关闭各自的 PowerShell 窗口即可停止服务" -ForegroundColor Gray

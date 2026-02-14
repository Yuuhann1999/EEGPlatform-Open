"""文件系统浏览 API"""
from fastapi import APIRouter, HTTPException
from pathlib import Path
from typing import Optional
import os
import string

router = APIRouter(prefix="/filesystem", tags=["文件系统"])

@router.get("/browse")
async def browse_directory(path: Optional[str] = None):
    """
    浏览目录结构
    - 如果 path 为空，返回系统根目录/驱动器列表
    - 如果 path 有值，返回该目录下的子目录和文件
    """
    
    if path is None or path == "":
        # Windows: 返回驱动器列表
        if os.name == 'nt':
            drives = []
            for letter in string.ascii_uppercase:
                drive = f"{letter}:/"
                if os.path.exists(drive):
                    drives.append({
                        "name": f"{letter}:",
                        "path": drive,
                        "type": "drive"
                    })
            return {"items": drives, "current_path": ""}
        else:
            # Linux/Mac: 返回根目录
            return {"items": [{"name": "/", "path": "/", "type": "directory"}], "current_path": ""}
    
    # 检查路径是否存在
    dir_path = Path(path)
    if not dir_path.exists():
        raise HTTPException(status_code=404, detail=f"路径不存在: {path}")
    
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail=f"不是目录: {path}")
    
    items = []
    
    # 添加返回上级目录选项
    parent = dir_path.parent
    if parent != dir_path:  # 不是根目录
        items.append({
            "name": "..",
            "path": str(parent),
            "type": "parent"
        })
    
    try:
        for entry in sorted(dir_path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            try:
                item = {
                    "name": entry.name,
                    "path": str(entry),
                    "type": "directory" if entry.is_dir() else "file"
                }
                
                # 如果是文件，添加扩展名信息
                if entry.is_file():
                    item["extension"] = entry.suffix.lower()
                    item["size"] = entry.stat().st_size
                
                items.append(item)
            except PermissionError:
                # 跳过无权限访问的项
                continue
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"无权限访问: {path}")
    
    return {
        "items": items,
        "current_path": str(dir_path)
    }

@router.get("/home")
async def get_home_directory():
    """获取用户主目录"""
    home = str(Path.home())
    return {"path": home}

@router.get("/common-paths")
async def get_common_paths():
    """获取常用路径，包括所有可用磁盘"""
    paths = []
    
    # 用户主目录
    home = Path.home()
    paths.append({"name": "主目录", "path": str(home)})
    
    # 桌面
    desktop = home / "Desktop"
    if desktop.exists():
        paths.append({"name": "桌面", "path": str(desktop)})
    
    # 文档
    documents = home / "Documents"
    if documents.exists():
        paths.append({"name": "文档", "path": str(documents)})
    
    # 下载
    downloads = home / "Downloads"
    if downloads.exists():
        paths.append({"name": "下载", "path": str(downloads)})
    
    # Windows: 添加所有可用磁盘
    if os.name == 'nt':
        for letter in string.ascii_uppercase:
            drive_path = f"{letter}:/"
            if os.path.exists(drive_path):
                paths.append({"name": f"{letter}:", "path": drive_path})
    else:
        # Linux/Mac: 添加根目录和常用挂载点
        paths.append({"name": "/", "path": "/"})
        if os.path.exists("/mnt"):
            paths.append({"name": "/mnt", "path": "/mnt"})
        if os.path.exists("/media"):
            paths.append({"name": "/media", "path": "/media"})
    
    return {"paths": paths}

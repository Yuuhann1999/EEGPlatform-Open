"""工作区 API - 文件扫描和数据加载"""
import traceback
from fastapi import APIRouter, HTTPException
from datetime import datetime

from ..schemas import (
    ScanRequest, ScanResponse, FileInfo,
    LoadDataRequest, LoadDataResponse
)
from ..services.eeg_service import eeg_service
from ..services.session_manager import session_manager

router = APIRouter(prefix="/workspace", tags=["工作区"])

@router.post("/scan", response_model=ScanResponse)
async def scan_directory(request: ScanRequest):
    """扫描目录中的 EEG 文件"""
    try:
        files_data = eeg_service.scan_directory(request.path)
        files = [
            FileInfo(
                id=f["id"],
                name=f["name"],
                path=f["path"],
                format=f["format"],
                size=f["size"],
                status=f["status"],
                modified_at=datetime.fromtimestamp(f["modified_at"])
            )
            for f in files_data
        ]
        return ScanResponse(files=files, total_count=len(files))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"扫描目录失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"扫描失败: {str(e)}")

@router.post("/load", response_model=LoadDataResponse)
async def load_data(request: LoadDataRequest):
    """加载 EEG 数据文件"""
    try:
        print(f"开始加载文件: {request.file_path}")
        
        session_id, raw = eeg_service.load_raw(request.file_path)
        print(f"文件加载成功, session_id: {session_id}")
        
        session = session_manager.get_session(session_id)
        
        print("正在获取数据信息...")
        info = eeg_service.get_data_info(session)
        print(f"数据信息: {info.channel_count} 通道, {info.duration:.1f}s")
        
        print("正在获取事件信息...")
        events = eeg_service.get_events(session)
        print(f"事件信息: {len(events)} 种事件类型")
        
        return LoadDataResponse(
            info=info,
            events=events,
            session_id=session_id
        )
    except FileNotFoundError as e:
        print(f"文件未找到: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        print(f"值错误: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"加载数据失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"加载失败: {str(e)}")

@router.get("/session/{session_id}/info")
async def get_session_info(session_id: str):
    """获取会话信息"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    try:
        info = eeg_service.get_data_info(session)
        events = eeg_service.get_events(session)
        
        return {
            "info": info,
            "events": events,
            "history": session.processing_history
        }
    except Exception as e:
        print(f"获取会话信息失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"获取信息失败: {str(e)}")

@router.delete("/session/{session_id}")
async def close_session(session_id: str):
    """关闭会话"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    session_manager.remove_session(session_id)
    return {"message": "会话已关闭"}

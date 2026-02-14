"""批量预处理 API - 批量处理 EEG 数据文件"""
import asyncio
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from datetime import datetime

from ..schemas import (
    BatchProcessingRequest,
    BatchProcessingResponse,
    BatchJobStatus
)
from ..services.batch_processing_service import batch_processing_service

router = APIRouter(tags=["批量预处理"])


def _status_to_dict(status: BatchJobStatus) -> dict:
    """统一序列化批处理状态，避免 SSE 分支重复构造字典"""
    return {
        "job_id": status.job_id,
        "status": status.status,
        "total_files": status.total_files,
        "completed_files": status.completed_files,
        "failed_files": status.failed_files,
        "current_file": status.current_file,
        "current_step": status.current_step,
        "progress": status.progress,
        "error_message": status.error_message,
        "results": [
            {
                "file_path": r.file_path,
                "file_name": r.file_name,
                "status": r.status,
                "output_path": r.output_path,
                "error": r.error,
                "processing_time": r.processing_time
            }
            for r in status.results
        ],
        "created_at": status.created_at.isoformat() if status.created_at else None,
        "updated_at": status.updated_at.isoformat() if status.updated_at else None
    }


@router.post("/start", response_model=BatchProcessingResponse)
async def start_batch_processing(
    request: BatchProcessingRequest,
    background_tasks: BackgroundTasks
):
    """
    启动批量预处理任务
    创建任务后立即返回 job_id，实际处理在后台执行
    """
    try:
        # 创建任务
        job_id = await batch_processing_service.create_job(request)
        
        # 在后台启动处理
        background_tasks.add_task(batch_processing_service.start_job, job_id)
        
        return BatchProcessingResponse(
            job_id=job_id,
            message="批量处理任务已启动",
            total_files=len(request.file_paths)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动批量处理失败: {str(e)}")


@router.get("/status/{job_id}", response_model=BatchJobStatus)
async def get_batch_status(job_id: str):
    """
    获取批量处理任务状态
    """
    status = await batch_processing_service.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return status


@router.post("/cancel/{job_id}")
async def cancel_batch_job(job_id: str):
    """
    取消批量处理任务
    """
    success = await batch_processing_service.cancel_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400, 
            detail="任务不存在或已完成/已取消"
        )
    
    return {"message": "任务已取消", "job_id": job_id}


@router.get("/progress/{job_id}")
async def stream_batch_progress(job_id: str):
    """
    实时推送批量处理进度 (SSE - Server-Sent Events)
    前端可以使用 EventSource 连接此端点接收实时进度更新
    """
    job = batch_processing_service._jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    async def event_generator():
        """生成 SSE 事件流"""
        queue = asyncio.Queue()
        
        # 定义回调函数
        def on_progress(status: BatchJobStatus):
            try:
                asyncio.create_task(queue.put(_status_to_dict(status)))
            except Exception as e:
                print(f"进度回调错误: {e}")
        
        # 订阅进度更新
        batch_processing_service.subscribe_progress(job_id, on_progress)
        
        try:
            # 立即发送当前状态
            current_status = await batch_processing_service.get_job_status(job_id)
            if current_status:
                yield f"data: {json.dumps(_status_to_dict(current_status), ensure_ascii=False)}\n\n"
            
            # 持续监听进度更新
            while True:
                try:
                    # 等待队列中的更新，设置超时以便检查任务状态
                    status_dict = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"data: {json.dumps(status_dict, ensure_ascii=False)}\n\n"
                    
                    # 如果任务已完成或失败，结束流
                    if status_dict["status"] in ["completed", "failed", "cancelled"]:
                        break
                        
                except asyncio.TimeoutError:
                    # 超时检查任务是否还存在
                    job_status = await batch_processing_service.get_job_status(job_id)
                    if not job_status or job_status.status in ["completed", "failed", "cancelled"]:
                        # 发送最终状态并结束
                        if job_status:
                            yield f"data: {json.dumps(_status_to_dict(job_status), ensure_ascii=False)}\n\n"
                        break
                    # 继续等待
                    continue
                    
        finally:
            # 取消订阅
            batch_processing_service.unsubscribe_progress(job_id, on_progress)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # 禁用 Nginx 缓冲
        }
    )

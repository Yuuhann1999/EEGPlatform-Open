"""可视化数据 API"""
from fastapi import APIRouter, HTTPException, BackgroundTasks

from ..schemas import (
    ERPRequest, ERPData,
    PSDRequest, PSDData,
    TopomapRequest, TopomapData,
    TopoAnimationRequest, TopoAnimationResponse,
    TFRRequest, TFRStartResponse, TFRJobResponse
)
from ..services.eeg_service import eeg_service
from ..services.session_manager import session_manager
from ..services.tfr_jobs import tfr_job_manager

router = APIRouter(prefix="/visualization", tags=["可视化"])

def get_session_or_404(session_id: str):
    """获取会话或抛出 404"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session

@router.post("/erp", response_model=ERPData)
async def get_erp_data(request: ERPRequest):
    """获取 ERP 数据"""
    session = get_session_or_404(request.session_id)
    try:
        erp_data = eeg_service.get_erp_data(
            session,
            channels=request.channels,
            event_ids=request.event_ids,
            per_channel=request.per_channel
        )
        return erp_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 ERP 数据失败: {str(e)}")

@router.post("/psd", response_model=PSDData)
async def get_psd_data(request: PSDRequest):
    """获取 PSD 数据"""
    session = get_session_or_404(request.session_id)
    try:
        psd_data = eeg_service.get_psd_data(
            session,
            channels=request.channels,
            fmin=request.fmin,
            fmax=request.fmax,
            average=request.average
        )
        return psd_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 PSD 数据失败: {str(e)}")

@router.post("/topomap", response_model=TopomapData)
async def get_topomap_data(request: TopomapRequest):
    """获取地形图数据"""
    session = get_session_or_404(request.session_id)
    try:
        topomap_data = eeg_service.get_topomap_data(
            session,
            time_point=request.time_point,
            freq_band=request.freq_band,
            time_window=request.time_window,
            interpolation=request.interpolation,
            contours=request.contours,
            sensors=request.sensors,
            render_mode=request.render_mode
        )
        return topomap_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取地形图数据失败: {str(e)}")

@router.get("/topomap/montages")
async def get_available_montages():
    """获取可用的标准脑模板列表"""
    try:
        montages = eeg_service.get_available_montages()
        return {"montages": montages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取蒙特卡列表失败: {str(e)}")


@router.post("/topomap/animation", response_model=TopoAnimationResponse)
async def get_topomap_animation(request: TopoAnimationRequest):
    """获取地形图动画帧（仅支持电位地形图，支持 Canvas/MNE 两种风格）"""
    session = get_session_or_404(request.session_id)
    try:
        animation = eeg_service.get_topomap_animation_frames(
            session,
            request.start_time,
            request.end_time,
            request.frame_interval,
            request.render_mode,  # 新增：渲染模式
            request.interpolation,
            request.contours,
            request.sensors
        )
        return animation
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取动画数据失败: {str(e)}")


@router.post("/tfr/start", response_model=TFRStartResponse)
async def start_tfr_job(request: TFRRequest, background_tasks: BackgroundTasks):
    """提交 TFR 后台任务（Morlet，支持 Canvas/MNE 双渲染模式）"""
    session = get_session_or_404(request.session_id)
    try:
        job_id = tfr_job_manager.create_job()
        background_tasks.add_task(
            tfr_job_manager.run_morlet_job,
            job_id,
            session,
            request.channels,
            request.event_id,
            request.fmin,
            request.fmax,
            request.n_cycles,
            request.baseline,
            request.baseline_mode,
            request.decim,
            request.render_mode,  # 新增：渲染模式
            request.colormap,     # 新增：colormap
            request.vmin,         # 新增：vmin
            request.vmax,         # 新增：vmax
        )
        return TFRStartResponse(job_id=job_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交 TFR 任务失败: {str(e)}")


@router.get("/tfr/{job_id}", response_model=TFRJobResponse)
async def get_tfr_job(job_id: str):
    """查询 TFR 任务状态/结果"""
    job = tfr_job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    return TFRJobResponse(
        job_id=job.job_id,
        status=job.status,
        progress=job.progress,
        error=job.error,
        result=job.result,
    )


@router.post("/tfr/{job_id}/cancel")
async def cancel_tfr_job(job_id: str):
    """取消 TFR 任务"""
    success = tfr_job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="任务不存在或无法取消")
    return {"success": True, "message": "任务已取消"}

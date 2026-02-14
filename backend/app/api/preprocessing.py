"""预处理 API"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..schemas import (
    FilterRequest, ResampleRequest, RereferenceRequest,
    ICARequest, EpochRequest, CropRequest,
    BadChannelRequest, SetMontageRequest,
    OperationResponse
)
from ..services.eeg_service import eeg_service
from ..services.session_manager import session_manager

router = APIRouter(prefix="/preprocessing", tags=["预处理"])

class UndoRedoRequest(BaseModel):
    session_id: str

def get_session_or_404(session_id: str):
    """获取会话或抛出 404"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session

@router.post("/undo", response_model=OperationResponse)
async def undo_operation(request: UndoRedoRequest):
    """撤销上一步操作"""
    session = get_session_or_404(request.session_id)
    try:
        if session.undo():
            # 获取新的数据信息
            info = eeg_service.get_data_info(session)
            return OperationResponse(
                success=True,
                message="撤销成功",
                data={
                    "can_undo": session.can_undo(),
                    "can_redo": session.can_redo(),
                    "duration": info.duration if info else None,
                    "sample_rate": info.sample_rate if info else None,
                }
            )
        else:
            return OperationResponse(
                success=False,
                message="没有可撤销的操作"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"撤销失败: {str(e)}")

@router.post("/redo", response_model=OperationResponse)
async def redo_operation(request: UndoRedoRequest):
    """重做上一步撤销的操作"""
    session = get_session_or_404(request.session_id)
    try:
        if session.redo():
            # 获取新的数据信息
            info = eeg_service.get_data_info(session)
            return OperationResponse(
                success=True,
                message="重做成功",
                data={
                    "can_undo": session.can_undo(),
                    "can_redo": session.can_redo(),
                    "duration": info.duration if info else None,
                    "sample_rate": info.sample_rate if info else None,
                }
            )
        else:
            return OperationResponse(
                success=False,
                message="没有可重做的操作"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重做失败: {str(e)}")

@router.post("/filter", response_model=OperationResponse)
async def apply_filter(request: FilterRequest):
    """应用滤波"""
    session = get_session_or_404(request.session_id)
    try:
        original_sfreq = session.raw.info['sfreq'] if session.raw else None
        eeg_service.apply_filter(
            session,
            l_freq=request.l_freq,
            h_freq=request.h_freq,
            notch_freq=request.notch_freq
        )
        return OperationResponse(
            success=True,
            message=f"滤波成功",
            data={
                "l_freq": request.l_freq,
                "h_freq": request.h_freq,
                "notch_freq": request.notch_freq
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"滤波失败: {str(e)}")

@router.post("/resample", response_model=OperationResponse)
async def apply_resample(request: ResampleRequest):
    """应用重采样"""
    session = get_session_or_404(request.session_id)
    try:
        original_sfreq = session.raw.info['sfreq'] if session.raw else None
        eeg_service.apply_resample(session, request.target_sfreq)
        return OperationResponse(
            success=True,
            message=f"重采样成功: {original_sfreq} Hz → {request.target_sfreq} Hz",
            data={
                "original_sfreq": original_sfreq,
                "target_sfreq": request.target_sfreq
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重采样失败: {str(e)}")

@router.post("/rereference", response_model=OperationResponse)
async def apply_rereference(request: RereferenceRequest):
    """应用重参考"""
    session = get_session_or_404(request.session_id)
    try:
        eeg_service.apply_rereference(
            session,
            method=request.method,
            custom_ref=request.custom_ref
        )
        return OperationResponse(
            success=True,
            message=f"重参考成功: {request.method}",
            data={"method": request.method}
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重参考失败: {str(e)}")

@router.post("/ica", response_model=OperationResponse)
async def apply_ica(request: ICARequest):
    """应用自动 ICA"""
    session = get_session_or_404(request.session_id)
    try:
        excluded_ics = eeg_service.apply_ica(
            session,
            n_components=request.n_components,
            exclude_labels=request.exclude_labels,
            threshold=request.threshold
        )
        return OperationResponse(
            success=True,
            message=f"ICA 成功: 排除了 {len(excluded_ics)} 个成分",
            data={
                "excluded_ics": excluded_ics,
                "n_excluded": len(excluded_ics),
                "threshold": request.threshold
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ICA 失败: {str(e)}")

@router.post("/epochs", response_model=OperationResponse)
async def create_epochs(request: EpochRequest):
    """创建 Epochs"""
    session = get_session_or_404(request.session_id)
    try:
        result = eeg_service.create_epochs(
            session,
            event_ids=request.event_ids,
            tmin=request.tmin,
            tmax=request.tmax,
            baseline=request.baseline,
            reject_threshold=request.reject_threshold
        )
        
        # 如果所有epochs都被剔除，给出特殊提示
        if result['n_epochs'] == 0:
            return OperationResponse(
                success=True,
                message=f"分段完成，但所有 {result['n_dropped']} 个epochs都被剔除。建议降低reject阈值（当前: {request.reject_threshold} uV）或检查数据质量。",
                data={
                    "n_epochs": result['n_epochs'],
                    "n_dropped": result['n_dropped'],
                    "event_ids": request.event_ids,
                    "time_window": f"{request.tmin}s ~ {request.tmax}s",
                    "all_dropped": True,
                    "suggestion": f"建议将reject阈值提高到 {request.reject_threshold * 2} uV 或更高"
                }
            )
        
        return OperationResponse(
            success=True,
            message=f"分段成功: 保留 {result['n_epochs']} 个，剔除 {result['n_dropped']} 个",
            data={
                "n_epochs": result['n_epochs'],
                "n_dropped": result['n_dropped'],
                "event_ids": request.event_ids,
                "time_window": f"{request.tmin}s ~ {request.tmax}s"
            }
        )
    except Exception as e:
        # 安全地转换错误消息，避免编码错误
        error_msg = str(e)
        try:
            # 尝试编码为UTF-8，如果失败则使用ASCII安全版本
            error_msg.encode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            # 如果包含无法编码的字符，使用ASCII安全版本
            error_msg = error_msg.encode('ascii', errors='replace').decode('ascii')
        raise HTTPException(status_code=500, detail=f"分段失败: {error_msg}")

@router.post("/crop", response_model=OperationResponse)
async def crop_data(request: CropRequest):
    """裁剪数据"""
    session = get_session_or_404(request.session_id)
    try:
        original_duration = session.raw.times[-1] if session.raw else None
        eeg_service.crop_data(session, tmin=request.tmin, tmax=request.tmax)
        new_duration = session.raw.times[-1] if session.raw else None
        return OperationResponse(
            success=True,
            message=f"裁剪成功: {request.tmin}s - {request.tmax or '末尾'}",
            data={
                "original_duration": original_duration,
                "new_duration": new_duration,
                "tmin": request.tmin,
                "tmax": request.tmax
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"裁剪失败: {str(e)}")

@router.post("/bad-channel", response_model=OperationResponse)
async def set_bad_channel(request: BadChannelRequest):
    """设置坏道"""
    session = get_session_or_404(request.session_id)
    try:
        eeg_service.set_bad_channel(
            session, 
            channel_name=request.channel_name, 
            is_bad=request.is_bad
        )
        status = "标记为坏道" if request.is_bad else "取消坏道标记"
        return OperationResponse(
            success=True,
            message=f"通道 {request.channel_name} 已{status}",
            data={
                "channel_name": request.channel_name,
                "is_bad": request.is_bad,
                "total_bad_channels": len(session.raw.info['bads']) if session.raw else 0
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"设置坏道失败: {str(e)}")

@router.post("/montage", response_model=OperationResponse)
async def set_montage(request: SetMontageRequest):
    """设置电极定位"""
    session = get_session_or_404(request.session_id)
    try:
        result = eeg_service.set_montage(session, montage_name=request.montage_name)
        return OperationResponse(
            success=True,
            message=f"电极定位设置成功: 匹配 {result['matched_channels']} 个通道",
            data={
                "montage_name": request.montage_name,
                "matched_channels": result['matched_channels'],
                "unmatched_channels": result['unmatched_channels'],
                "matched_list": result['matched_list'],
                "unmatched_list": result['unmatched_list']
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"设置电极定位失败: {str(e)}")

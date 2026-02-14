"""波形数据 API"""
from fastapi import APIRouter, HTTPException

from ..schemas import WaveformRequest, WaveformResponse
from ..services.eeg_service import eeg_service
from ..services.session_manager import session_manager

router = APIRouter(prefix="/waveform", tags=["波形数据"])

@router.post("/get", response_model=WaveformResponse)
async def get_waveform(request: WaveformRequest):
    """获取波形数据（分段加载）"""
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    try:
        waveform = eeg_service.get_waveform(
            session,
            start_time=request.start_time,
            duration=request.duration,
            target_sfreq=request.target_sample_rate
        )
        return waveform
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取波形失败: {str(e)}")


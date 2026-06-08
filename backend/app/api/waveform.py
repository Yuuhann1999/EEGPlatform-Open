"""波形数据 API"""
from fastapi import APIRouter

from ..schemas import WaveformRequest, WaveformResponse
from ..services.eeg_service import eeg_service
from .deps import get_session_or_404

router = APIRouter(prefix="/waveform", tags=["波形数据"])

@router.post("/get", response_model=WaveformResponse)
async def get_waveform(request: WaveformRequest):
    """获取波形数据（分段加载）"""
    session = get_session_or_404(request.session_id)
    
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


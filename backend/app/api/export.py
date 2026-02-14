"""数据导出 API"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..schemas import DataExportRequest, OperationResponse
from ..services.eeg_service import eeg_service
from ..services.session_manager import session_manager

router = APIRouter(prefix="/export", tags=["数据导出"])


def get_session_or_404(session_id: str):
    """获取会话或抛出 404"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.post("/data", response_model=OperationResponse)
async def export_data(request: DataExportRequest):
    """导出 EEG 数据到指定格式

    支持格式:
    - fif: MNE 原生格式（推荐，保留所有信息）
    - set: EEGLAB 格式
    - edf: European Data Format
    """
    session = get_session_or_404(request.session_id)

    try:
        result = eeg_service.export_data(
            session,
            format=request.format,
            output_path=request.output_path,
            export_epochs=request.export_epochs
        )

        return OperationResponse(
            success=True,
            message=f"导出成功: {request.format.upper()} 格式",
            data=result
        )
    except ImportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.post("/download")
async def download_exported(request: DataExportRequest):
    """导出并直接下载文件"""
    session = get_session_or_404(request.session_id)

    try:
        result = eeg_service.export_data(
            session,
            format=request.format,
            output_path=request.output_path,
            export_epochs=request.export_epochs
        )

        output_path = result["output_path"]

        # 返回文件下载响应
        return FileResponse(
            path=output_path,
            filename=output_path.split("\\")[-1].split("/")[-1],
            media_type="application/octet-stream"
        )
    except ImportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")

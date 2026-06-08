"""工作区 API - 文件扫描和数据加载"""
import time
import traceback
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File

from ..config import settings
from ..schemas import (
    ScanRequest, ScanResponse,
    LoadDataRequest, LoadDataResponse
)
from ..services.eeg_service import eeg_service
from ..services.session_manager import session_manager

router = APIRouter(prefix="/workspace", tags=["工作区"])


def elapsed_ms(start_time: float) -> int:
    return int((time.perf_counter() - start_time) * 1000)


async def save_upload(upload_file: UploadFile, upload_path: Path, max_bytes: int, used_bytes: int = 0) -> int:
    """保存上传文件，并按总上传大小限制写入。"""
    total_size = 0
    with upload_path.open("wb") as output:
        while chunk := await upload_file.read(1024 * 1024):
            total_size += len(chunk)
            if used_bytes + total_size > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"文件过大，最大允许 {settings.MAX_UPLOAD_SIZE_MB}MB"
                )
            output.write(chunk)

    if total_size == 0:
        raise HTTPException(status_code=400, detail="上传文件为空")

    return total_size


async def load_file_response(file_path: str) -> LoadDataResponse:
    """加载 EEG 文件并返回会话信息"""
    load_start = time.perf_counter()
    print(f"开始加载文件: {file_path}")

    raw_start = time.perf_counter()
    session_id, _ = eeg_service.load_raw(file_path)
    print(f"[UPLOAD] MNE 加载完成 {elapsed_ms(raw_start)}ms, session_id: {session_id}")

    session = session_manager.get_session(session_id)

    info_start = time.perf_counter()
    info = eeg_service.get_data_info(session)
    print(f"[UPLOAD] 数据信息完成 {elapsed_ms(info_start)}ms: {info.channel_count} 通道, {info.duration:.1f}s")

    events_start = time.perf_counter()
    events = eeg_service.get_events(session)
    print(f"[UPLOAD] 事件信息完成 {elapsed_ms(events_start)}ms: {len(events)} 种事件类型")
    print(f"[UPLOAD] 加载响应总耗时 {elapsed_ms(load_start)}ms")

    return LoadDataResponse(
        info=info,
        events=events,
        session_id=session_id
    )

@router.post("/scan", response_model=ScanResponse)
async def scan_directory(_request: ScanRequest):
    """扫描目录中的 EEG 文件"""
    raise HTTPException(status_code=410, detail="公网模式不支持扫描服务器文件系统，请上传 EEG 文件")

@router.post("/load", response_model=LoadDataResponse)
async def load_data(_request: LoadDataRequest):
    """加载 EEG 数据文件"""
    raise HTTPException(status_code=410, detail="公网模式不支持按服务器路径加载文件，请上传 EEG 文件")


@router.post("/upload", response_model=LoadDataResponse)
async def upload_data(
    file: UploadFile = File(...),
    companion_files: list[UploadFile] | None = File(default=None),
):
    """上传并加载 EEG 数据文件"""
    request_start = time.perf_counter()
    original_name = Path(file.filename or "").name
    suffix = Path(original_name).suffix.lower()
    if suffix not in settings.SUPPORTED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式。支持: {', '.join(settings.SUPPORTED_UPLOAD_EXTENSIONS)}"
        )

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    upload_name = f"{uuid.uuid4().hex[:12]}_{original_name}"
    upload_path = settings.UPLOAD_DIR / upload_name
    saved_paths = [upload_path]

    try:
        save_start = time.perf_counter()
        total_size = await save_upload(file, upload_path, max_bytes)
        print(
            f"[UPLOAD] 主文件保存完成 {elapsed_ms(save_start)}ms: "
            f"{original_name} {total_size} bytes"
        )

        if suffix == ".set":
            set_stem = Path(original_name).stem.lower()
            for companion_file in companion_files or []:
                companion_name = Path(companion_file.filename or "").name
                companion_path = Path(companion_name)
                if companion_path.suffix.lower() != ".fdt" or companion_path.stem.lower() != set_stem:
                    continue

                saved_companion_path = upload_path.with_suffix(".fdt")
                saved_paths.append(saved_companion_path)
                companion_start = time.perf_counter()
                companion_size = await save_upload(companion_file, saved_companion_path, max_bytes, total_size)
                total_size += companion_size
                print(
                    f"[UPLOAD] FDT 伴随文件保存完成 {elapsed_ms(companion_start)}ms: "
                    f"{companion_name} {companion_size} bytes"
                )
                break
        print(f"[UPLOAD] 文件接收保存总耗时 {elapsed_ms(save_start)}ms: total={total_size} bytes")
    except HTTPException:
        for saved_path in saved_paths:
            saved_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
        for companion_file in companion_files or []:
            await companion_file.close()

    try:
        response = await load_file_response(str(upload_path))
        print(f"[UPLOAD] 请求总耗时 {elapsed_ms(request_start)}ms")
        return response
    except HTTPException:
        for saved_path in saved_paths:
            saved_path.unlink(missing_ok=True)
        raise
    except FileNotFoundError as e:
        for saved_path in saved_paths:
            saved_path.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        for saved_path in saved_paths:
            saved_path.unlink(missing_ok=True)
        traceback.print_exc()
        message = str(e)
        if suffix == ".set" and ".fdt" in message.lower():
            message = "这个 SET 文件需要同名 .fdt 数据文件，请在上传时同时选择 .set 和 .fdt"
        raise HTTPException(status_code=400, detail=message)
    except Exception as e:
        for saved_path in saved_paths:
            saved_path.unlink(missing_ok=True)
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

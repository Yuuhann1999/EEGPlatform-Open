"""批量预处理服务 - 管理批量处理任务"""
import uuid
import asyncio
import traceback
from pathlib import Path
from typing import Optional, Callable, AsyncGenerator
from datetime import datetime, timedelta
from dataclasses import dataclass, field

from ..schemas import (
    BatchProcessingRequest, 
    BatchJobStatus, 
    BatchFileResult,
    PreprocessingStepConfig
)
from ..services.eeg_service import eeg_service
from ..services.session_manager import session_manager


@dataclass
class BatchJob:
    job_id: str
    request: BatchProcessingRequest
    status: BatchJobStatus
    task: Optional[asyncio.Task] = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    progress_callbacks: list = field(default_factory=list)


class BatchProcessingService:
    def __init__(self):
        self._jobs: dict[str, BatchJob] = {}
        self._lock = asyncio.Lock()
    
    async def create_job(self, request: BatchProcessingRequest) -> str:
        job_id = str(uuid.uuid4())[:12]
        
        status = BatchJobStatus(
            job_id=job_id,
            status="idle",
            total_files=len(request.file_paths),
            completed_files=0,
            failed_files=0,
            current_file=None,
            current_step=None,
            progress=0.0,
            error_message=None,
            results=[
                BatchFileResult(
                    file_path=path,
                    file_name=Path(path).name,
                    status="pending"
                )
                for path in request.file_paths
            ],
            created_at=datetime.now(),
            updated_at=None
        )
        
        job = BatchJob(
            job_id=job_id,
            request=request,
            status=status
        )
        
        async with self._lock:
            self._jobs[job_id] = job
        
        return job_id
    
    async def start_job(self, job_id: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                raise ValueError(f"任务不存在: {job_id}")
            if job.status.status == "running":
                raise ValueError(f"任务正在运行中: {job_id}")
        
        job.task = asyncio.create_task(self._process_job(job))
    
    async def _process_job(self, job: BatchJob) -> None:
        job.status.status = "running"
        job.status.updated_at = datetime.now()
        
        await self._notify_progress(job)
        
        try:
            for i, file_path in enumerate(job.request.file_paths):
                if job.cancel_event.is_set():
                    job.status.status = "cancelled"
                    break
                
                file_name = Path(file_path).name
                job.status.current_file = file_name
                job.status.current_step = "loading"
                await self._notify_progress(job)
                
                start_time = datetime.now()
                
                try:
                    session_id, _ = eeg_service.load_raw(file_path)
                    session = session_manager.get_session(session_id)
                    
                    if not session:
                        raise Exception("会话创建失败")
                    
                    for step in job.request.preprocessing_steps:
                        if not step.enabled:
                            continue
                        
                        if job.cancel_event.is_set():
                            break
                        
                        job.status.current_step = step.type
                        await self._notify_progress(job)
                        
                        await self._execute_step(session, step)
                    
                    if job.cancel_event.is_set():
                        session_manager.remove_session(session_id)
                        break
                    
                    job.status.current_step = "exporting"
                    await self._notify_progress(job)
                    
                    output_path = await self._export_file(
                        session, 
                        file_name,
                        job.request.output_dir,
                        job.request.output_format,
                        job.request.export_epochs
                    )
                    
                    session_manager.remove_session(session_id)
                    
                    processing_time = (datetime.now() - start_time).total_seconds()
                    job.status.results[i] = BatchFileResult(
                        file_path=file_path,
                        file_name=file_name,
                        status="success",
                        output_path=output_path,
                        processing_time=processing_time
                    )
                    job.status.completed_files += 1
                    
                except Exception as e:
                    print(f"处理文件 {file_name} 失败: {e}")
                    traceback.print_exc()
                    
                    job.status.results[i] = BatchFileResult(
                        file_path=file_path,
                        file_name=file_name,
                        status="failed",
                        error=str(e)
                    )
                    job.status.failed_files += 1
                
                job.status.progress = ((i + 1) / job.status.total_files) * 100
                job.status.updated_at = datetime.now()
                await self._notify_progress(job)
            
            if job.status.status == "running":
                job.status.status = "completed"
                job.status.current_file = None
                job.status.current_step = None
                job.status.progress = 100.0
                job.status.updated_at = datetime.now()
                await self._notify_progress(job)
                
        except Exception as e:
            print(f"批量处理任务失败: {e}")
            traceback.print_exc()
            job.status.status = "failed"
            job.status.error_message = str(e)
            job.status.updated_at = datetime.now()
            await self._notify_progress(job)
    
    async def _execute_step(self, session, step: PreprocessingStepConfig) -> None:
        params = step.params
        
        if step.type == "montage":
            eeg_service.set_montage(session, params.get("montageName", "standard_1020"))
        elif step.type == "filter":
            eeg_service.apply_filter(
                session,
                l_freq=params.get("lowcut"),
                h_freq=params.get("highcut"),
                notch_freq=params.get("notch")
            )
        elif step.type == "resample":
            eeg_service.apply_resample(session, params.get("sampleRate", 250))
        elif step.type == "rereference":
            eeg_service.apply_rereference(
                session,
                method=params.get("method", "average"),
                custom_ref=params.get("customRef")
            )
        elif step.type == "ica":
            exclude_labels = []
            components = params.get("components", {})
            if components.get("eyeBlink"):
                exclude_labels.append("eye blink")
            if components.get("muscle"):
                exclude_labels.append("muscle artifact")
            if components.get("heart"):
                exclude_labels.append("heart beat")
            if components.get("channelNoise"):
                exclude_labels.append("channel noise")
            
            eeg_service.apply_ica(
                session,
                exclude_labels=exclude_labels,
                threshold=params.get("threshold", 0.9)
            )
        elif step.type == "crop":
            eeg_service.crop_data(
                session,
                tmin=params.get("tmin", 0),
                tmax=params.get("tmax")
            )
        elif step.type == "epoch":
            # 先应用事件重命名（如果有）
            event_mappings = params.get("eventMappings", {})
            if event_mappings:
                try:
                    eeg_service.rename_events(session, event_mappings)
                except Exception as e:
                    print(f"事件重命名失败: {e}")
            
            eeg_service.create_epochs(
                session,
                event_ids=params.get("eventIds", []),
                tmin=params.get("tmin", -0.2),
                tmax=params.get("tmax", 0.8),
                baseline=params.get("baseline", (-0.2, 0)),
                reject_threshold=params.get("reject", 100.0)
            )
        
        # 添加处理历史
        session.add_history(step.type, params)
    
    async def _export_file(
        self, 
        session, 
        original_filename: str,
        output_dir: str,
        output_format: str,
        export_epochs: bool
    ) -> str:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        base_name = Path(original_filename).stem
        output_filename = f"{base_name}_processed.{output_format}"
        full_output_path = output_path / output_filename
        
        if export_epochs and session.epochs is not None:
            data_to_export = session.epochs
        else:
            data_to_export = session.raw
        
        if output_format == "fif":
            data_to_export.save(str(full_output_path), overwrite=True)
        elif output_format == "set":
            import mne
            mne.export.export_raw(str(full_output_path), data_to_export, fmt="eeglab")
        elif output_format == "edf":
            import mne
            mne.export.export_raw(str(full_output_path), data_to_export, fmt="edf")
        
        return str(full_output_path)
    
    async def _notify_progress(self, job: BatchJob) -> None:
        for callback in job.progress_callbacks:
            try:
                callback(job.status)
            except Exception as e:
                print(f"进度回调失败: {e}")
    
    def subscribe_progress(self, job_id: str, callback) -> bool:
        job = self._jobs.get(job_id)
        if job:
            job.progress_callbacks.append(callback)
            return True
        return False
    
    def unsubscribe_progress(self, job_id: str, callback) -> bool:
        job = self._jobs.get(job_id)
        if job and callback in job.progress_callbacks:
            job.progress_callbacks.remove(callback)
            return True
        return False
    
    async def get_job_status(self, job_id: str) -> Optional[BatchJobStatus]:
        async with self._lock:
            job = self._jobs.get(job_id)
            return job.status if job else None
    
    async def cancel_job(self, job_id: str) -> bool:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if job.status.status not in ["running", "idle"]:
                return False
            
            job.cancel_event.set()
            
            if job.task and not job.task.done():
                job.task.cancel()
                try:
                    await job.task
                except asyncio.CancelledError:
                    pass
            
            job.status.status = "cancelled"
            job.status.updated_at = datetime.now()
            await self._notify_progress(job)
            
            return True
    
    async def cleanup_completed_jobs(self, max_age_hours: int = 24) -> int:
        cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
        jobs_to_remove = []
        
        async with self._lock:
            for job_id, job in self._jobs.items():
                if job.status.status in ["completed", "failed", "cancelled"]:
                    if job.status.updated_at and job.status.updated_at < cutoff_time:
                        jobs_to_remove.append(job_id)
            
            for job_id in jobs_to_remove:
                del self._jobs[job_id]
        
        return len(jobs_to_remove)


batch_processing_service = BatchProcessingService()

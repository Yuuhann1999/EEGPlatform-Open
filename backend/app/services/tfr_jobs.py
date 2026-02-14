"""TFR job manager - compute time-frequency representations in background.

支持双渲染模式：
- data: 返回数值数据，前端使用 ECharts 渲染
- image: 使用 MNE 原生 plot 生成科研级图像（base64 PNG）
"""

from __future__ import annotations

import sys
import uuid
import traceback
import io
import base64
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Literal

import numpy as np
import mne
import matplotlib
matplotlib.use('Agg')  # 非交互式后端
import matplotlib.pyplot as plt

# PyInstaller 打包环境检测
IS_FROZEN = getattr(sys, 'frozen', False)

from .session_manager import EEGSession
from ..config import settings


TFRStatus = Literal["pending", "running", "completed", "error"]


@dataclass
class TFRJob:
    job_id: str
    status: TFRStatus
    progress: float
    created_at: datetime
    updated_at: datetime
    error: Optional[str] = None
    result: Optional[dict] = None
    cancelled: bool = False  # 支持取消任务


class TFRJobManager:
    def __init__(self):
        self._jobs: dict[str, TFRJob] = {}

    def create_job(self) -> str:
        job_id = str(uuid.uuid4())[:8]
        now = datetime.now()
        self._jobs[job_id] = TFRJob(
            job_id=job_id,
            status="pending",
            progress=0.0,
            created_at=now,
            updated_at=now,
        )
        return job_id

    def get_job(self, job_id: str) -> Optional[TFRJob]:
        return self._jobs.get(job_id)

    def cancel_job(self, job_id: str) -> bool:
        """取消任务"""
        job = self._jobs.get(job_id)
        if job and job.status in ['pending', 'running']:
            job.cancelled = True
            job.status = 'error'
            job.error = '任务已被用户取消'
            job.progress = 1.0
            return True
        return False

    def _render_tfr_image(
        self,
        tfr_avg,  # mne.time_frequency.AverageTFR
        title: str,
        colormap: str,
        vmin: Optional[float],
        vmax: Optional[float],
        baseline_mode: str,
        figsize: tuple = (10, 6),
        dpi: int = 100,
    ) -> tuple[str, float, float]:
        """使用 MNE 原生方法渲染 TFR 图像，返回 base64 PNG"""
        # 确定单位标签
        unit_labels = {
            'logratio': 'Power (dB)',
            'ratio': 'Power (ratio)',
            'zscore': 'Power (z-score)',
            'percent': 'Power (%)',
        }
        unit_label = unit_labels.get(baseline_mode, 'Power')

        # 获取数据范围
        data = tfr_avg.data
        if vmin is None:
            vmin = float(np.percentile(data, 2))
        if vmax is None:
            vmax = float(np.percentile(data, 98))
        
        # 对称化颜色范围（对于 diverging colormap）
        if colormap in ['RdBu_r', 'RdBu', 'seismic', 'coolwarm']:
            abs_max = max(abs(vmin), abs(vmax))
            vmin, vmax = -abs_max, abs_max

        # 创建图形
        fig, ax = plt.subplots(figsize=figsize, dpi=dpi)
        
        # 使用 MNE 的 plot 方法
        # MNE 的 plot() 返回 Figure, 但我们需要更多控制，所以手动绘制
        times = tfr_avg.times * 1000  # 转换为 ms
        freqs = tfr_avg.freqs
        power = data.mean(axis=0)  # 跨通道平均 (n_freqs, n_times)
        
        # 绘制热力图
        extent = [times[0], times[-1], freqs[0], freqs[-1]]
        im = ax.imshow(
            power,
            aspect='auto',
            origin='lower',
            extent=extent,
            cmap=colormap,
            vmin=vmin,
            vmax=vmax,
            interpolation='bilinear',
        )
        
        # 添加 0ms 标记线
        if times[0] <= 0 <= times[-1]:
            ax.axvline(x=0, color='black', linestyle='--', linewidth=1.5, alpha=0.7)
        
        # 设置轴标签
        ax.set_xlabel('Time (ms)', fontsize=11)
        ax.set_ylabel('Frequency (Hz)', fontsize=11)
        ax.set_title(title, fontsize=12, fontweight='bold')
        
        # 添加颜色条
        cbar = fig.colorbar(im, ax=ax, shrink=0.8, pad=0.02)
        cbar.set_label(unit_label, fontsize=10)
        
        # 设置刻度字体大小
        ax.tick_params(labelsize=9)
        cbar.ax.tick_params(labelsize=9)
        
        # 调整布局
        fig.tight_layout()
        
        # 转换为 base64
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', 
                    facecolor='white', edgecolor='none')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        
        return img_base64, float(vmin), float(vmax)

    def _render_single_channel_tfr(
        self,
        power_2d: np.ndarray,  # (n_freqs, n_times)
        times_ms: np.ndarray,
        freqs: np.ndarray,
        channel_name: str,
        colormap: str,
        vmin: float,
        vmax: float,
        baseline_mode: str,
        figsize: tuple = (8, 5),
        dpi: int = 100,
    ) -> str:
        """渲染单通道 TFR 图像"""
        unit_labels = {
            'logratio': 'Power (dB)',
            'ratio': 'Power (ratio)',
            'zscore': 'Power (z-score)',
            'percent': 'Power (%)',
        }
        unit_label = unit_labels.get(baseline_mode, 'Power')

        fig, ax = plt.subplots(figsize=figsize, dpi=dpi)
        
        extent = [times_ms[0], times_ms[-1], freqs[0], freqs[-1]]
        im = ax.imshow(
            power_2d,
            aspect='auto',
            origin='lower',
            extent=extent,
            cmap=colormap,
            vmin=vmin,
            vmax=vmax,
            interpolation='bilinear',
        )
        
        # 添加 0ms 标记线
        if times_ms[0] <= 0 <= times_ms[-1]:
            ax.axvline(x=0, color='black', linestyle='--', linewidth=1.5, alpha=0.7)
        
        ax.set_xlabel('Time (ms)', fontsize=10)
        ax.set_ylabel('Frequency (Hz)', fontsize=10)
        ax.set_title(channel_name, fontsize=11, fontweight='bold')
        
        cbar = fig.colorbar(im, ax=ax, shrink=0.8, pad=0.02)
        cbar.set_label(unit_label, fontsize=9)
        
        ax.tick_params(labelsize=8)
        cbar.ax.tick_params(labelsize=8)
        
        fig.tight_layout()
        
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight',
                    facecolor='white', edgecolor='none')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        
        return img_base64

    def run_morlet_job(
        self,
        job_id: str,
        session: EEGSession,
        channels: list[str],
        event_id: Optional[int],
        fmin: float,
        fmax: float,
        n_cycles: float,
        baseline: Optional[tuple[float, float]],
        baseline_mode: str,
        decim: int,
        render_mode: str = "data",
        colormap: str = "RdBu_r",
        vmin: Optional[float] = None,
        vmax: Optional[float] = None,
    ) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return

        # 检查是否已取消
        if job.cancelled:
            return

        def _update(status: Optional[TFRStatus] = None, progress: Optional[float] = None, error: Optional[str] = None, result: Optional[dict] = None):
            now = datetime.now()
            job.updated_at = now
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = float(progress)
            if error is not None:
                job.error = error
            if result is not None:
                job.result = result

        try:
            _update(status="running", progress=0.05)

            epochs = session.epochs
            if epochs is None:
                raise ValueError("需要先完成分段（Epoching）才能进行时频分析")

            if not channels:
                raise ValueError("未选择通道")

            # Filter epochs by event_id (if provided)
            epochs_sel = epochs
            if event_id is not None:
                mask = epochs.events[:, 2] == int(event_id)
                if not np.any(mask):
                    raise ValueError(f"未找到 event_id={event_id} 的 epochs")
                epochs_sel = epochs[mask]

            picks = mne.pick_channels(epochs_sel.ch_names, include=channels, ordered=True)
            if len(picks) == 0:
                raise ValueError("所选通道在 epochs 中不存在")

            # Frequencies: 1 Hz step for minimal version
            if fmax <= fmin:
                raise ValueError("fmax 必须大于 fmin")
            freqs = np.arange(fmin, fmax + 1e-6, 1.0, dtype=float)
            if freqs.size < 2:
                freqs = np.linspace(fmin, fmax, num=8, dtype=float)

            decim = int(decim) if decim and int(decim) > 0 else 2

            # Guard: wavelet length must not exceed signal length.
            # Approx wavelet duration ~= n_cycles / fmin (seconds). Must be < epoch length.
            epoch_len = float(epochs_sel.tmax - epochs_sel.tmin)
            if epoch_len <= 0:
                raise ValueError("Epoch 时间窗无效，无法计算 TFR")
            # Safety factor to avoid edge cases
            max_cycles = max(1.0, epoch_len * float(np.min(freqs)) * 0.9)
            if n_cycles > max_cycles:
                # auto clamp, and also provide a helpful message
                n_cycles = float(max_cycles)

            _update(progress=0.15)

            from mne.time_frequency import tfr_morlet
            import time

            # 计算前打印信息
            n_epochs = len(epochs_sel)
            n_channels = len(picks)
            n_freqs = len(freqs)
            n_times = len(epochs_sel.times)
            decim = int(decim) if decim and int(decim) > 0 else 2
            # 打包环境强制单进程，开发环境可通过 TFR_N_JOBS 调整
            tfr_n_jobs = 1 if IS_FROZEN else max(1, int(settings.TFR_N_JOBS))
            print(
                f"[TFR] 开始计算: epochs={n_epochs}, channels={n_channels}, freqs={n_freqs}, "
                f"times={n_times//decim}, n_cycles={n_cycles}, render_mode={render_mode}, n_jobs={tfr_n_jobs}"
            )

            # Compute per-epoch (so baseline can be applied correctly), then average
            # 为了避免长时间无进度，按 batch 计算并更新进度
            start_compute = time.time()
            batch_size = 5 if n_epochs >= 10 else n_epochs
            sum_power_by_channel = None
            total_epochs = 0
            times_arr = None

            for start_idx in range(0, n_epochs, batch_size):
                if job.cancelled:
                    _update(status="error", progress=1.0, error="任务已被用户取消")
                    return

                end_idx = min(start_idx + batch_size, n_epochs)
                epochs_batch = epochs_sel[start_idx:end_idx]

                tfr_batch = tfr_morlet(
                    epochs_batch,
                    freqs=freqs,
                    n_cycles=n_cycles,
                    return_itc=False,
                    average=False,
                    picks=picks,
                    decim=decim,
                    n_jobs=tfr_n_jobs,
                )

                if baseline is not None:
                    tfr_batch.apply_baseline(baseline=baseline, mode=baseline_mode)

                # tfr_batch.data: (batch, n_channels, n_freqs, n_times)
                batch_data = tfr_batch.data
                batch_sum = batch_data.sum(axis=0)

                if sum_power_by_channel is None:
                    sum_power_by_channel = batch_sum
                    times_arr = tfr_batch.times
                else:
                    sum_power_by_channel += batch_sum

                total_epochs += (end_idx - start_idx)

                # 进度：0.15 -> 0.75
                progress = 0.15 + 0.6 * (total_epochs / max(1, n_epochs))
                _update(progress=progress)

            compute_time = time.time() - start_compute
            print(f"[TFR] 计算完成，耗时 {compute_time:.2f}秒")

            _update(progress=0.8)

            if sum_power_by_channel is None or total_epochs == 0 or times_arr is None:
                raise ValueError("TFR 计算失败：无有效 epochs")

            power_by_channel = (sum_power_by_channel / float(total_epochs))  # (n_channels, n_freqs, n_times)
            power = power_by_channel.mean(axis=0)  # (n_freqs, n_times) average channels
            channel_names_out = [epochs_sel.ch_names[i] for i in picks]

            # 时间和频率
            times_ms = (times_arr * 1000.0).tolist()
            freqs_out = freqs.tolist()

            # 根据 render_mode 决定输出
            if render_mode == "image":
                _update(progress=0.85)
                print(f"[TFR] 开始 MNE 风格图像渲染...")
                
                # 构建一个临时的 AverageTFR 对象用于渲染
                # 计算颜色范围
                data_flat = power_by_channel.flatten()
                if vmin is None:
                    actual_vmin = float(np.percentile(data_flat, 2))
                else:
                    actual_vmin = vmin
                if vmax is None:
                    actual_vmax = float(np.percentile(data_flat, 98))
                else:
                    actual_vmax = vmax
                
                # 对称化颜色范围（diverging colormap）
                if colormap in ['RdBu_r', 'RdBu', 'seismic', 'coolwarm']:
                    abs_max = max(abs(actual_vmin), abs(actual_vmax))
                    actual_vmin, actual_vmax = -abs_max, abs_max

                # 渲染 ROI 平均图
                img_base64 = self._render_single_channel_tfr(
                    power,
                    np.array(times_ms),
                    freqs,
                    f"ROI Average ({len(channel_names_out)} channels)",
                    colormap,
                    actual_vmin,
                    actual_vmax,
                    baseline_mode,
                    figsize=(10, 6),
                    dpi=100,
                )

                # 渲染每通道图像（多通道模式）
                images_by_channel = {}
                for ci, ch_name in enumerate(channel_names_out):
                    if job.cancelled:
                        _update(status="error", progress=1.0, error="任务已被用户取消")
                        return
                    ch_img = self._render_single_channel_tfr(
                        power_by_channel[ci],
                        np.array(times_ms),
                        freqs,
                        ch_name,
                        colormap,
                        actual_vmin,
                        actual_vmax,
                        baseline_mode,
                        figsize=(8, 5),
                        dpi=100,
                    )
                    images_by_channel[ch_name] = ch_img
                    # 更新进度: 0.85 -> 0.98
                    progress = 0.85 + 0.13 * ((ci + 1) / max(1, len(channel_names_out)))
                    _update(progress=progress)

                _update(
                    status="completed",
                    progress=1.0,
                    result={
                        "times": times_ms,
                        "freqs": freqs_out,
                        "power": power.astype(float).tolist(),
                        "channel_names": channel_names_out,
                        "power_by_channel": power_by_channel.astype(float).tolist(),
                        "image_base64": img_base64,
                        "images_by_channel": images_by_channel,
                        "vmin": actual_vmin,
                        "vmax": actual_vmax,
                        "render_mode": "image",
                    },
                )
            else:
                # data 模式：返回纯数值数据
                _update(
                    status="completed",
                    progress=1.0,
                    result={
                        "times": times_ms,
                        "freqs": freqs_out,
                        "power": power.astype(float).tolist(),
                        "channel_names": channel_names_out,
                        "power_by_channel": power_by_channel.astype(float).tolist(),
                        "render_mode": "data",
                    },
                )
        except Exception as e:
            traceback.print_exc()
            _update(status="error", progress=1.0, error=str(e))


tfr_job_manager = TFRJobManager()


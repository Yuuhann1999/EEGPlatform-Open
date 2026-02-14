"""使用真实样本 FIF 的后端集成测试。"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# 让 pytest 在任意工作目录下都能导入 backend/app
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402


SAMPLE_FIF_ENV = "EEG_TEST_FIF_PATH"
DEFAULT_SAMPLE_FIF = Path(
    "/Users/zeng/Documents/Project/EEGPlatform/"
    "高宛昀_20241016_120524_8c3715fc-62c6-4d57-8ff5-fe1c05d55e6c_processed.fif"
)
FALLBACK_SAMPLE_FIF = (
    Path(__file__).resolve().parents[2]
    / "高宛昀_20241016_120524_8c3715fc-62c6-4d57-8ff5-fe1c05d55e6c_processed.fif"
)


def _resolve_sample_fif_path() -> Path:
    """解析测试样本路径：环境变量优先，其次项目内默认路径。"""
    env_path = os.getenv(SAMPLE_FIF_ENV, "").strip()
    if env_path:
        return Path(env_path).expanduser().resolve()
    if DEFAULT_SAMPLE_FIF.exists():
        return DEFAULT_SAMPLE_FIF
    return FALLBACK_SAMPLE_FIF


@pytest.fixture()
def client() -> TestClient:
    """FastAPI 测试客户端。"""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def loaded_session(client: TestClient) -> dict:
    """加载样本数据并返回会话信息，测试结束后自动关闭会话。"""
    sample_fif_path = _resolve_sample_fif_path()
    if not sample_fif_path.exists():
        pytest.skip(
            f"未找到样本数据文件：{sample_fif_path}。"
            f"可通过环境变量 {SAMPLE_FIF_ENV} 指定。"
        )

    load_resp = client.post(
        "/api/workspace/load",
        json={"file_path": str(sample_fif_path)},
    )
    assert load_resp.status_code == 200, load_resp.text

    payload = load_resp.json()
    session_id = payload["session_id"]
    try:
        yield payload
    finally:
        client.delete(f"/api/workspace/session/{session_id}")


def _pick_eeg_channels(info: dict, max_channels: int = 12) -> list[str]:
    """从数据概要中提取 EEG 通道名。"""
    eeg_channels = [
        ch["name"]
        for ch in info["channels"]
        if ch["type"] == "EEG" and not ch["is_bad"]
    ]
    return eeg_channels[:max_channels]


def _create_epochs(client: TestClient, session_id: str, events: list[dict]) -> list[int]:
    """基于事件创建 Epochs，返回实际用于分段的事件 ID。"""
    if not events:
        pytest.skip("样本文件未检测到事件，无法执行 ERP/Topomap 分段测试。")

    # 取前两个事件 ID，避免测试耗时过长
    event_ids = [int(item["id"]) for item in events[:2]]
    epochs_resp = client.post(
        "/api/preprocessing/epochs",
        json={
            "session_id": session_id,
            "event_ids": event_ids,
            "tmin": -0.2,
            "tmax": 0.8,
            "baseline": [-0.2, 0],
            "reject_threshold": 300.0,
        },
    )
    assert epochs_resp.status_code == 200, epochs_resp.text
    result = epochs_resp.json()
    assert result["success"] is True
    return event_ids


def test_workspace_load_and_waveform(loaded_session: dict, client: TestClient):
    """验证加载与波形接口可正常返回。"""
    session_id = loaded_session["session_id"]
    info = loaded_session["info"]

    assert info["channel_count"] > 0
    assert info["sample_rate"] > 0

    waveform_resp = client.post(
        "/api/waveform/get",
        json={
            "session_id": session_id,
            "start_time": 0,
            "duration": 5,
            "target_sample_rate": 250,
        },
    )
    assert waveform_resp.status_code == 200, waveform_resp.text
    waveform = waveform_resp.json()

    assert len(waveform["channels"]) > 0
    assert waveform["sample_rate"] == 250
    assert waveform["time_range"][1] > waveform["time_range"][0]


def test_erp_and_topomap_visualization(loaded_session: dict, client: TestClient):
    """验证分段后 ERP 与地形图接口可正常返回。"""
    session_id = loaded_session["session_id"]
    info = loaded_session["info"]
    events = loaded_session["events"]
    _create_epochs(client, session_id, events)

    eeg_channels = _pick_eeg_channels(info, max_channels=10)
    assert len(eeg_channels) > 0

    erp_resp = client.post(
        "/api/visualization/erp",
        json={
            "session_id": session_id,
            "channels": eeg_channels,
            "per_channel": False,
        },
    )
    assert erp_resp.status_code == 200, erp_resp.text
    erp_data = erp_resp.json()

    assert len(erp_data["times"]) > 0
    assert len(erp_data["conditions"]) > 0
    for condition in erp_data["conditions"].values():
        assert len(condition["data"]) == len(erp_data["times"])
        assert len(condition["stderr"]) == len(erp_data["times"])

    topo_resp = client.post(
        "/api/visualization/topomap",
        json={
            "session_id": session_id,
            "time_point": 300,
            "render_mode": "data",
        },
    )
    assert topo_resp.status_code == 200, topo_resp.text
    topo = topo_resp.json()

    assert len(topo["channel_names"]) > 0
    assert len(topo["values"]) == len(topo["channel_names"])
    assert topo["vmin"] <= topo["vmax"]


def test_psd_visualization_average_and_butterfly(loaded_session: dict, client: TestClient):
    """验证 PSD 平均图与多通道图都可返回有效数据。"""
    session_id = loaded_session["session_id"]
    info = loaded_session["info"]
    eeg_channels = _pick_eeg_channels(info, max_channels=8)
    assert len(eeg_channels) > 0

    avg_resp = client.post(
        "/api/visualization/psd",
        json={
            "session_id": session_id,
            "channels": eeg_channels,
            "fmin": 1,
            "fmax": 45,
            "average": True,
        },
    )
    assert avg_resp.status_code == 200, avg_resp.text
    avg_data = avg_resp.json()
    assert len(avg_data["frequencies"]) > 0
    assert len(avg_data["power"]) == len(avg_data["frequencies"])

    butterfly_resp = client.post(
        "/api/visualization/psd",
        json={
            "session_id": session_id,
            "channels": eeg_channels,
            "fmin": 1,
            "fmax": 45,
            "average": False,
        },
    )
    assert butterfly_resp.status_code == 200, butterfly_resp.text
    butterfly_data = butterfly_resp.json()
    assert butterfly_data["channels"] is not None
    assert len(butterfly_data["channels"]) > 0


def test_preprocessing_chain_with_undo_redo(loaded_session: dict, client: TestClient):
    """验证预处理核心链路：滤波、重采样、重参考、撤销、重做。"""
    session_id = loaded_session["session_id"]
    raw_info = loaded_session["info"]
    original_sfreq = float(raw_info["sample_rate"])

    filter_resp = client.post(
        "/api/preprocessing/filter",
        json={
            "session_id": session_id,
            "l_freq": 1.0,
            "h_freq": 40.0,
            "notch_freq": 50.0,
        },
    )
    assert filter_resp.status_code == 200, filter_resp.text
    assert filter_resp.json()["success"] is True

    target_sfreq = 200.0 if original_sfreq > 200 else max(128.0, original_sfreq / 2)
    resample_resp = client.post(
        "/api/preprocessing/resample",
        json={"session_id": session_id, "target_sfreq": target_sfreq},
    )
    assert resample_resp.status_code == 200, resample_resp.text
    assert resample_resp.json()["success"] is True

    reref_resp = client.post(
        "/api/preprocessing/rereference",
        json={"session_id": session_id, "method": "average"},
    )
    assert reref_resp.status_code == 200, reref_resp.text
    assert reref_resp.json()["success"] is True

    session_info_resp = client.get(f"/api/workspace/session/{session_id}/info")
    assert session_info_resp.status_code == 200, session_info_resp.text
    session_info = session_info_resp.json()

    history_ops = [item["operation"] for item in session_info["history"]]
    assert "filter" in history_ops
    assert "resample" in history_ops
    assert "rereference" in history_ops
    assert float(session_info["info"]["sample_rate"]) == pytest.approx(target_sfreq, rel=0.05)

    undo_resp = client.post("/api/preprocessing/undo", json={"session_id": session_id})
    assert undo_resp.status_code == 200, undo_resp.text
    assert undo_resp.json()["success"] is True

    redo_resp = client.post("/api/preprocessing/redo", json={"session_id": session_id})
    assert redo_resp.status_code == 200, redo_resp.text
    assert redo_resp.json()["success"] is True


def test_tfr_background_job_data_mode(loaded_session: dict, client: TestClient):
    """验证 TFR 后台任务可提交、执行并返回结构化结果。"""
    session_id = loaded_session["session_id"]
    info = loaded_session["info"]
    events = loaded_session["events"]
    selected_event_ids = _create_epochs(client, session_id, events)

    eeg_channels = _pick_eeg_channels(info, max_channels=3)
    assert len(eeg_channels) > 0

    start_resp = client.post(
        "/api/visualization/tfr/start",
        json={
            "session_id": session_id,
            "channels": eeg_channels,
            "event_id": selected_event_ids[0],
            "fmin": 8.0,
            "fmax": 20.0,
            "n_cycles": 1.0,
            "baseline": [-0.2, 0.0],
            "baseline_mode": "logratio",
            "decim": 8,
            "render_mode": "data",
        },
    )
    assert start_resp.status_code == 200, start_resp.text
    job_id = start_resp.json()["job_id"]
    assert isinstance(job_id, str) and len(job_id) > 0

    # 轮询任务直到完成或错误（最长约 24 秒）
    job_payload = None
    for _ in range(120):
        status_resp = client.get(f"/api/visualization/tfr/{job_id}")
        assert status_resp.status_code == 200, status_resp.text
        job_payload = status_resp.json()
        if job_payload["status"] in {"completed", "error"}:
            break
        time.sleep(0.2)

    assert job_payload is not None
    assert job_payload["status"] == "completed", job_payload
    assert job_payload["result"] is not None

    result = job_payload["result"]
    assert result["render_mode"] == "data"
    assert len(result["times"]) > 0
    assert len(result["freqs"]) > 0
    assert len(result["power"]) == len(result["freqs"])
    assert len(result["power_by_channel"]) == len(result["channel_names"])

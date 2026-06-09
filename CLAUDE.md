# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EEGAnalysis Pro is a local EEG (electroencephalography) data preprocessing and visualization platform. It uses a decoupled frontend/backend architecture:

- **Backend**: FastAPI + MNE-Python, running at `http://127.0.0.1:8088`
- **Frontend**: React 19 + TypeScript + Vite, running at `http://localhost:5173` (dev)

## Development Commands

### Start both services (recommended)
```bash
./start.sh          # macOS/Linux
.\start.ps1         # Windows PowerShell
```

### Backend only
```bash
cd backend
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate
python3 run.py
```

### Frontend only
```bash
cd frontend
npm run dev
```

### Setup (first time)
```bash
# Backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

### Backend tests
```bash
cd backend
source .venv/bin/activate
pytest
# Single test:
pytest tests/test_foo.py::test_bar -v
```

### Frontend type check / lint
```bash
cd frontend
npm run build   # also type-checks
```

## Architecture

### Session Model
The central concept is a **session**. Loading an EEG file via `POST /api/workspace/load` returns a `session_id`. Every subsequent API call (waveform, preprocessing, visualization) requires this `session_id`. The backend holds the MNE `Raw`/`Epochs` object in memory keyed by session ID (2-hour timeout). Sessions support undo/redo (up to 10 steps) stored server-side.

- Session manager: `backend/app/services/session_manager.py` — singleton `SessionManager`, `EEGSession` per file
- EEG logic: `backend/app/services/eeg_service.py` — wraps all MNE operations
- Config: `backend/app/config.py` — `Settings` (pydantic-settings, reads `.env`)

### Backend API modules (`backend/app/api/`)
| Module | Prefix | Responsibility |
|--------|--------|----------------|
| `workspace.py` | `/api/workspace` | scan directory, load file, session info |
| `waveform.py` | `/api/waveform` | fetch raw/epoch waveform chunks |
| `preprocessing.py` | `/api/preprocessing` | filter, resample, re-reference, ICA, epoch, crop, bad channels, montage, undo/redo |
| `visualization.py` | `/api/visualization` | ERP, PSD, topomap, TFR (async job) |
| `batch.py` | `/api/batch` | batch preprocessing with SSE progress stream |
| `export.py` | `/api/export` | export to fif/set/edf |
| `filesystem.py` | `/api/filesystem` | directory browser for UI folder picker |

TFR is computed as a background thread job (`backend/app/services/tfr_jobs.py`). Start with `POST /api/visualization/tfr/start`, poll with `GET /api/visualization/tfr/{job_id}`.

Batch processing uses Server-Sent Events: `GET /api/batch/progress/{job_id}`.

### Frontend structure (`frontend/src/`)
- **`stores/eegStore.ts`** — single Zustand store holding all app state: session ID, file list, waveform data, pipeline steps, visualization config
- **`services/api.ts`** — all HTTP calls organized as `filesystemApi`, `workspaceApi`, `waveformApi`, `preprocessingApi`, `visualizationApi`, `exportApi`, `batchApi`. In dev mode (`port === '5173'`), points to `http://localhost:8088/api`; in production (bundled), uses same origin
- **`types/eeg.ts`** — shared TypeScript type definitions (camelCase on frontend, snake_case in API — mapped by `utils/apiMappers.ts`)
- **`pages/`** — three routes: `/` (Preprocessing + Workspace combined), `/visualization`, `/export`. Preprocessing page includes `PipelineBreadcrumb` (applied steps bar) and keyboard shortcuts (Cmd+Z/Y undo/redo, ←→ time pan, ± zoom)
- **`components/ui/`** — primitive UI components (Button, Card, Input, Alert)
- **`utils/cssTheme.ts`** — shared CSS variable resolution and chart theme colors, used by Charts and TopoAnimationChart

### Supported EEG formats
`.edf`, `.bdf` (treated as EDF), `.set` (EEGLAB), `.fif`, `.gdf`

### Key configuration
- Backend port: **8088** (configured in `backend/app/config.py`)
- Cache dir: `.mne_project_cache/` at project root (MNE temporary files)
- TFR parallelism: `TFR_N_JOBS=1` by default (set in `Settings` or `.env`)
- API docs (dev only): `http://127.0.0.1:8088/docs`

### Production / packaging
The backend (`run.py`) detects PyInstaller via `sys.frozen` and serves the frontend `dist/` as static files. In dev, frontend and backend are separate processes.

### UI patterns
- **Tooltips**: Use `InfoTooltip` (wraps Radix `<Tooltip.Provider>` + `<Tooltip.Portal>`) for popups inside scrollable containers (Accordion, etc.). Portal rendering avoids clipping from parent `overflow-hidden`.
- **Keyboard shortcuts**: Registered in page-level `useEffect`. Skip when focus is on INPUT/SELECT/TEXTAREA. Use `e.metaKey || e.ctrlKey` for cross-platform mod keys.
- **Chart theming**: Import `getChartThemeColors()` from `utils/cssTheme.ts` instead of hardcoding hex colors. It resolves CSS custom properties at runtime.

### ICA / ICLabel
ICA artifact detection uses `mne-icalabel` with `onnxruntime` as the inference backend (lightweight, no PyTorch needed). If no EOG channels exist in the montage, the service falls back to Fp1/Fp2 as proxy EOG channels. `excluded_ics` must be serialized as native Python `int` (not `numpy.int64`) for Pydantic compatibility.

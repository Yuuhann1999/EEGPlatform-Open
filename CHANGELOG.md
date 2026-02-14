# Changelog

本项目变更记录遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 新增 `LICENSE`、`CONTRIBUTING.md`、`CHANGELOG.md`，完善开源仓库基础配套。

### Removed
- 移除激活码与机器码相关模块，开源版默认开箱即用。

## [1.0.0] - 2026-02-12

### Added
- EEG 数据工作区扫描与文件加载能力（`edf/set/fif`）。
- 预处理流程（滤波、重采样、ICA、分段等）与波形浏览。
- 可视化分析能力（ERP、PSD、地形图、TFR）。
- 激活机制（机器码 + 激活码 + Web 激活页）。

### Changed
- 统一并优化三套主题风格与核心页面 UI 细节。

### Fixed
- 修复多项波形/事件显示与主题联动相关问题。

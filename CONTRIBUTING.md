# Contributing Guide

感谢你对 EEGAnalysis Pro（EEGPlatform）的关注与贡献。

## 贡献方式

- 提交 Bug：通过 GitHub Issues 描述问题、复现步骤与预期行为。
- 提交改进建议：在 Issue 中说明动机、方案和影响范围。
- 提交代码：Fork 后通过 Pull Request（PR）提交。

## 开发环境

### 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate
pip install -r requirements.txt
python3 run.py
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

## 提交前检查

请至少完成以下检查：

```bash
# 前端构建检查
cd frontend && npm run build

# 后端基础语法检查
cd ../backend && source .venv/bin/activate && python3 -m compileall app
```

## Pull Request 规范

- PR 标题清晰描述改动目的。
- 一个 PR 尽量只做一类改动（功能、修复或文档）。
- 描述中包含：
  - 改动内容
  - 影响范围
  - 验证方式
  - 如有 UI 变化，请附截图

## 代码与文档约定

- 保持改动最小化，避免无关重构。
- 保持命名一致、结构清晰。
- 文档优先使用中文，代码标识符保持英文。
- 不提交本地大文件、临时文件与敏感信息。

## 行为准则

请保持专业、尊重、建设性的沟通方式。

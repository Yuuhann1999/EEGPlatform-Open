import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { Alert, Button } from './ui';
import { exportApi } from '../services/api';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  hasEpochs: boolean;
}

export function ExportDialog({ isOpen, onClose, sessionId, hasEpochs }: ExportDialogProps) {
  const [format, setFormat] = useState<'fif' | 'set' | 'edf'>('fif');
  const [exportEpochs, setExportEpochs] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!sessionId) {
      setError('没有有效的会话 ID');
      return;
    }

    if (exportEpochs && !hasEpochs) {
      setError('当前数据没有 Epochs，请取消勾选"导出 Epochs"或先创建 Epochs');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      // 使用下载接口直接下载文件
      const blob = await exportApi.downloadData({
        session_id: sessionId,
        format,
        export_epochs: exportEpochs,
      });

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eeg_export_${exportEpochs ? 'epochs' : 'raw'}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err: any) {
      setError(err.message || '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-eeg-surface border border-eeg-border rounded-lg shadow-xl shadow-[var(--color-eeg-shadow)] w-full max-w-md mx-4">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-eeg-border">
          <h3 className="text-base font-medium text-eeg-text flex items-center gap-2">
            <Download size={18} />
            导出 EEG 数据
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-eeg-hover text-eeg-text-muted hover:text-eeg-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* 格式选择 */}
          <div>
            <label className="block text-sm font-medium text-eeg-text mb-2">
              导出格式
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'fif', label: 'FIF', desc: 'MNE 原生（推荐）' },
                { value: 'set', label: 'SET', desc: 'EEGLAB 格式' },
                { value: 'edf', label: 'EDF', desc: '标准格式' },
              ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value as any)}
                  className={`p-3 rounded border text-left transition-all ${
                    format === f.value
                      ? 'border-eeg-accent bg-eeg-accent/10 text-eeg-accent'
                      : 'border-eeg-border hover:border-eeg-accent/50 text-eeg-text hover:bg-eeg-hover'
                  }`}
                >
                  <div className="font-medium text-sm">{f.label}</div>
                  <div className="text-xs text-eeg-text-muted mt-0.5">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 导出选项 */}
          <div>
            <label className="block text-sm font-medium text-eeg-text mb-2">
              导出内容
            </label>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 p-3 rounded border cursor-pointer transition-all ${
                !exportEpochs ? 'border-eeg-accent bg-eeg-accent/10' : 'border-eeg-border'
              }`}>
                <input
                  type="radio"
                  checked={!exportEpochs}
                  onChange={() => setExportEpochs(false)}
                  className="accent-eeg-accent"
                />
                <div>
                  <div className="text-sm font-medium text-eeg-text">Raw 数据</div>
                  <div className="text-xs text-eeg-text-muted">当前处理阶段的连续数据</div>
                </div>
              </label>
              <label className={`flex items-center gap-2 p-3 rounded border cursor-pointer transition-all ${
                exportEpochs ? 'border-eeg-accent bg-eeg-accent/10' : 'border-eeg-border'
              } ${!hasEpochs ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input
                  type="radio"
                  checked={exportEpochs}
                  onChange={() => hasEpochs && setExportEpochs(true)}
                  disabled={!hasEpochs}
                  className="accent-eeg-accent"
                />
                <div>
                  <div className="text-sm font-medium text-eeg-text">Epochs 数据</div>
                  <div className="text-xs text-eeg-text-muted">
                    {hasEpochs ? '分段后的数据（拼接）' : '请先创建 Epochs'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <Alert variant="error" title="导出失败" description={error} />
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-2 px-4 py-3 border-t border-eeg-border">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            isLoading={isExporting}
            disabled={isExporting || (exportEpochs && !hasEpochs)}
            className="flex-1"
          >
            <Download size={16} className="mr-1.5" />
            导出并下载
          </Button>
        </div>
      </div>
    </div>
  );
}

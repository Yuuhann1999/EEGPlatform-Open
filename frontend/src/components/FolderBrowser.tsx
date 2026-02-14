import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  Folder, 
  FolderOpen, 
  HardDrive, 
  ArrowUp, 
  Home, 
  X,
  FileText,
  Loader2
} from 'lucide-react';
import { Button } from './ui';
import { cn } from '../utils/cn';
import { filesystemApi, type BrowseItem, type CommonPath } from '../services/api';

interface FolderBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function FolderBrowser({ isOpen, onClose, onSelect }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [commonPaths, setCommonPaths] = useState<CommonPath[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // 加载常用路径
  useEffect(() => {
    if (isOpen) {
      filesystemApi.getCommonPaths()
        .then(res => setCommonPaths(res.paths))
        .catch(() => setCommonPaths([]));
    }
  }, [isOpen]);

  // 浏览目录
  const browse = useCallback(async (path?: string) => {
    setIsLoading(true);
    setError(null);
    setSelectedPath(null);
    
    try {
      const result = await filesystemApi.browse(path);
      setItems(result.items);
      setCurrentPath(result.current_path);
    } catch (err: any) {
      setError(err.message || '无法访问该目录');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    if (isOpen) {
      browse();
    }
  }, [isOpen, browse]);

  // 处理双击
  const handleDoubleClick = (item: BrowseItem) => {
    if (item.type === 'directory' || item.type === 'drive' || item.type === 'parent') {
      browse(item.path);
    }
  };

  // 处理单击选择
  const handleClick = (item: BrowseItem) => {
    if (item.type === 'directory' || item.type === 'drive') {
      setSelectedPath(item.path);
    }
  };

  // 确认选择
  const handleConfirm = () => {
    if (selectedPath) {
      onSelect(selectedPath);
      onClose();
    } else if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  // 获取图标
  const getIcon = (item: BrowseItem) => {
    switch (item.type) {
      case 'drive':
        return <HardDrive size={18} className="text-eeg-accent" />;
      case 'parent':
        return <ArrowUp size={18} className="text-eeg-text-muted" />;
      case 'directory':
        return <Folder size={18} className="text-eeg-warning" />;
      case 'file':
        return <FileText size={18} className="text-eeg-text-muted" />;
      default:
        return <Folder size={18} />;
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-h-[80vh] bg-eeg-surface border border-eeg-border rounded-lg shadow-xl z-50 flex flex-col">
          {/* 标题栏 */}
          <div className="flex items-center justify-between p-4 border-b border-eeg-border">
            <Dialog.Title className="text-lg font-semibold text-eeg-text">
              选择文件夹
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 hover:bg-eeg-hover rounded transition-colors">
                <X size={20} className="text-eeg-text-muted" />
              </button>
            </Dialog.Close>
          </div>

          {/* 工具栏 */}
          <div className="flex items-center gap-2 p-3 border-b border-eeg-border bg-eeg-bg">
            {/* 当前路径 */}
            <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-eeg-surface border border-eeg-border rounded text-sm text-eeg-text overflow-hidden">
              <FolderOpen size={16} className="text-eeg-accent flex-shrink-0" />
              <span className="truncate">{currentPath || '我的电脑'}</span>
            </div>
            
            {/* 返回上级 */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                const parent = items.find(i => i.type === 'parent');
                if (parent) browse(parent.path);
              }}
              disabled={!items.some(i => i.type === 'parent')}
            >
              <ArrowUp size={16} />
            </Button>
            
            {/* 主目录 */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={async () => {
                const home = await filesystemApi.getHomeDirectory();
                browse(home.path);
              }}
            >
              <Home size={16} />
            </Button>
          </div>

          {/* 主体内容 */}
          <div className="flex-1 flex overflow-hidden">
            {/* 左侧快捷路径 */}
            <div className="w-40 border-r border-eeg-border p-2 overflow-y-auto">
              <div className="text-xs text-eeg-text-muted mb-2 px-2">快捷访问</div>
              {commonPaths.map((path, idx) => (
                <button
                  key={idx}
                  onClick={() => browse(path.path)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-eeg-text hover:bg-eeg-hover transition-colors text-left"
                >
                  <Folder size={14} className="text-eeg-warning flex-shrink-0" />
                  <span className="truncate">{path.name}</span>
                </button>
              ))}
            </div>

            {/* 右侧文件列表 */}
            <div className="flex-1 p-2 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={24} className="animate-spin text-eeg-accent" />
                </div>
              ) : error ? (
                <div className="text-center text-eeg-error py-8">
                  <p>{error}</p>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center text-eeg-text-muted py-8">
                  <p>空文件夹</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleClick(item)}
                      onDoubleClick={() => handleDoubleClick(item)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left',
                        selectedPath === item.path
                          ? 'bg-eeg-active/20 text-eeg-accent'
                          : 'text-eeg-text hover:bg-eeg-hover',
                        item.type === 'file' && 'opacity-50'
                      )}
                      disabled={item.type === 'file'}
                    >
                      {getIcon(item)}
                      <span className="truncate flex-1">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-between p-4 border-t border-eeg-border">
            <div className="text-sm text-eeg-text-muted">
              {selectedPath ? (
                <span>已选择: <span className="text-eeg-accent">{selectedPath}</span></span>
              ) : currentPath ? (
                <span>当前目录: <span className="text-eeg-text">{currentPath}</span></span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button onClick={handleConfirm}>
                选择此文件夹
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


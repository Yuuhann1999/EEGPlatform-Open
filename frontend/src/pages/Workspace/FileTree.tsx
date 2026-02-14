import { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  Folder, 
  FolderOpen,
  Circle
} from 'lucide-react';
import { cn } from '../../utils/cn';
import type { EEGFile } from '../../types/eeg';

interface FileTreeProps {
  files: EEGFile[];
  selectedFile: EEGFile | null;
  onSelectFile: (file: EEGFile) => void;
  onDoubleClickFile: (file: EEGFile) => void;
}

const statusColors = {
  unprocessed: 'text-eeg-text-muted',
  processing: 'text-eeg-processing animate-pulse',
  completed: 'text-eeg-success',
};

const statusLabels = {
  unprocessed: '未处理',
  processing: '处理中',
  completed: '已完成',
};

export function FileTree({ files, selectedFile, onSelectFile, onDoubleClickFile }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const getFileIcon = (_format: string) => {
    return <FileText size={16} className="text-eeg-accent" />;
  };

  return (
    <div className="h-full overflow-auto">
      {/* 根目录 */}
      <div
        className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-eeg-hover rounded-md"
        onClick={() => toggleFolder('root')}
      >
        {expandedFolders.has('root') ? (
          <>
            <ChevronDown size={16} className="text-eeg-text-muted" />
            <FolderOpen size={16} className="text-eeg-warning" />
          </>
        ) : (
          <>
            <ChevronRight size={16} className="text-eeg-text-muted" />
            <Folder size={16} className="text-eeg-warning" />
          </>
        )}
        <span className="text-sm text-eeg-text font-medium">Exp1</span>
        <span className="text-xs text-eeg-text-muted ml-auto">{files.length} 文件</span>
      </div>

      {/* 文件列表 */}
      {expandedFolders.has('root') && (
        <div className="ml-4 mt-1 space-y-0.5">
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors',
                selectedFile?.id === file.id
                  ? 'bg-eeg-active/15 text-eeg-accent border border-eeg-active/30'
                  : 'hover:bg-eeg-hover border border-transparent'
              )}
              onClick={() => onSelectFile(file)}
              onDoubleClick={() => onDoubleClickFile(file)}
            >
              <div className="w-4" /> {/* 缩进 */}
              {getFileIcon(file.format)}
              <span className="text-sm text-eeg-text truncate flex-1">{file.name}</span>
              <div className="flex items-center gap-1" title={statusLabels[file.status]}>
                <Circle size={8} className={cn('fill-current', statusColors[file.status])} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

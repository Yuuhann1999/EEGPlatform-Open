"""会话管理器 - 管理加载的 EEG 数据会话"""
import uuid
import copy
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta
import mne
from ..config import settings

MAX_UNDO_STACK = 10  # 最大撤销步数

class EEGSession:
    """单个 EEG 数据会话"""
    
    def __init__(self, session_id: str, file_path: str):
        self.session_id = session_id
        self.file_path = file_path
        self.raw: Optional[mne.io.Raw] = None
        self.epochs: Optional[mne.Epochs] = None
        self.created_at = datetime.now()
        self.last_accessed = datetime.now()
        self.processing_history: list[dict] = []
        # 撤销栈：保存 raw 数据的副本和epochs状态
        self._undo_stack: list[tuple[mne.io.Raw, dict, Optional[mne.Epochs]]] = []
        self._redo_stack: list[tuple[mne.io.Raw, dict, Optional[mne.Epochs]]] = []
    
    def touch(self):
        """更新最后访问时间"""
        self.last_accessed = datetime.now()
    
    def save_state(self, operation: str, params: dict):
        """保存当前状态到撤销栈（在执行操作前调用）"""
        if self.raw is not None:
            # 复制 raw 对象
            raw_copy = self.raw.copy()
            # 保存epochs的副本（如果有）—避免后续原地修改导致撤销失效
            epochs_ref = self.epochs.copy() if self.epochs is not None else None
            self._undo_stack.append((raw_copy, {
                "operation": operation,
                "params": params,
                "timestamp": datetime.now().isoformat()
            }, epochs_ref))
            # 限制栈大小
            if len(self._undo_stack) > MAX_UNDO_STACK:
                self._undo_stack.pop(0)
            # 清空重做栈
            self._redo_stack.clear()
    
    def undo(self) -> bool:
        """撤销上一步操作"""
        if not self._undo_stack:
            return False
        
        # 保存当前状态到重做栈（包括epochs状态）
        if self.raw is not None:
            current_history = self.processing_history[-1] if self.processing_history else None
            # 保存epochs的副本（如果有）
            epochs_ref = self.epochs.copy() if self.epochs is not None else None
            self._redo_stack.append((self.raw.copy(), current_history, epochs_ref))
        
        # 恢复上一个状态
        stack_item = self._undo_stack.pop()
        if len(stack_item) == 3:
            # 新格式：包含epochs状态
            prev_raw, prev_history, prev_epochs = stack_item
            self.epochs = prev_epochs
        else:
            # 旧格式：兼容性处理
            prev_raw, prev_history = stack_item
            # 如果撤销，清除epochs（因为epochs是基于raw数据创建的）
            self.epochs = None
        
        self.raw = prev_raw
        
        # 移除最后一个历史记录
        if self.processing_history:
            self.processing_history.pop()
        
        return True
    
    def redo(self) -> bool:
        """重做上一步撤销的操作"""
        if not self._redo_stack:
            return False
        
        # 保存当前状态到撤销栈（包括epochs状态）
        if self.raw is not None:
            current_history = self.processing_history[-1] if self.processing_history else None
            epochs_ref = self.epochs.copy() if self.epochs is not None else None
            self._undo_stack.append((self.raw.copy(), current_history, epochs_ref))
        
        # 恢复重做状态
        redo_item = self._redo_stack.pop()
        if len(redo_item) == 3:
            # 新格式：包含epochs状态
            redo_raw, redo_history, redo_epochs = redo_item
            self.epochs = redo_epochs
        else:
            # 旧格式：兼容性处理
            redo_raw, redo_history = redo_item
            self.epochs = None
        
        self.raw = redo_raw
        
        # 恢复历史记录
        if redo_history:
            self.processing_history.append(redo_history)
        
        return True
    
    def can_undo(self) -> bool:
        """是否可以撤销"""
        return len(self._undo_stack) > 0
    
    def can_redo(self) -> bool:
        """是否可以重做"""
        return len(self._redo_stack) > 0
    
    def add_history(self, operation: str, params: dict):
        """添加处理历史记录"""
        self.processing_history.append({
            "operation": operation,
            "params": params,
            "timestamp": datetime.now().isoformat()
        })

class SessionManager:
    """全局会话管理器"""
    
    _instance = None
    _sessions: dict[str, EEGSession] = {}
    SESSION_TIMEOUT = timedelta(hours=2)  # 会话超时时间
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def create_session(self, file_path: str) -> str:
        """创建新会话"""
        session_id = str(uuid.uuid4())[:8]
        self._sessions[session_id] = EEGSession(session_id, file_path)
        return session_id
    
    def get_session(self, session_id: str) -> Optional[EEGSession]:
        """获取会话"""
        session = self._sessions.get(session_id)
        if session:
            session.touch()
        return session
    
    def remove_session(self, session_id: str):
        """移除会话"""
        if session_id in self._sessions:
            del self._sessions[session_id]
    
    def cleanup_expired(self):
        """清理过期会话"""
        now = datetime.now()
        expired = [
            sid for sid, session in self._sessions.items()
            if now - session.last_accessed > self.SESSION_TIMEOUT
        ]
        for sid in expired:
            self.remove_session(sid)
    
    def get_all_sessions(self) -> dict[str, EEGSession]:
        """获取所有会话"""
        return self._sessions.copy()

# 全局单例
session_manager = SessionManager()


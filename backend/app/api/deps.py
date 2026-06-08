"""API 共享依赖"""
from fastapi import HTTPException

from ..services.session_manager import session_manager


def get_session_or_404(session_id: str):
    """获取会话或抛出 404"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session

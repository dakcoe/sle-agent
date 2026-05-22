from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from services.categorizer import get_categories, process_document
from auth import require_admin, get_current_user
from database import get_db
from jose import jwt, JWTError
import os
import json
import asyncio

router = APIRouter(prefix="/api")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-in-prod")
ALGORITHM = "HS256"


def _admin_from_token(token: str) -> dict:
    """SSE용: query param 토큰으로 admin 조회"""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (int(user_id),)).fetchone()
    db.close()
    if not user or user["role"] != "admin":
        raise ValueError("관리자 권한 없음")
    return dict(user)


@router.post("/process")
async def process_documents(admin=Depends(require_admin)):
    admin_id = admin["id"]
    categories = get_categories(admin_id)

    upload_dir = os.path.join(BASE_DIR, "..", "uploads", str(admin_id))
    if not os.path.exists(upload_dir):
        files = []
    else:
        files = [os.path.join(upload_dir, f) for f in os.listdir(upload_dir)]

    async def event_stream():
        total = len(files)
        if total == 0:
            yield f"data: {json.dumps({'status': 'done', 'progress': 100}, ensure_ascii=False)}\n\n"
            return

        for i, file_path in enumerate(files):
            progress_val = int((i / total) * 100)
            yield f"data: {json.dumps({'status': 'processing', 'file': os.path.basename(file_path), 'progress': progress_val}, ensure_ascii=False)}\n\n"
            process_document(file_path, categories, admin_id)
            await asyncio.sleep(0.1)

        yield f"data: {json.dumps({'status': 'done', 'progress': 100}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/process")
async def process_documents_sse(token: str = Query(...)):
    """EventSource용 GET 엔드포인트 (Authorization 헤더 불가)"""
    try:
        admin = _admin_from_token(token)
    except Exception:
        async def err():
            yield f"data: {json.dumps({'status': 'error', 'message': '인증 실패'})}\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")

    admin_id = admin["id"]
    categories = get_categories(admin_id)
    upload_dir = os.path.join(BASE_DIR, "..", "uploads", str(admin_id))
    files = [os.path.join(upload_dir, f) for f in os.listdir(upload_dir)] if os.path.exists(upload_dir) else []

    async def event_stream():
        total = len(files)
        if total == 0:
            yield f"data: {json.dumps({'status': 'done', 'progress': 100}, ensure_ascii=False)}\n\n"
            return
        for i, file_path in enumerate(files):
            progress_val = int((i / total) * 100)
            yield f"data: {json.dumps({'status': 'processing', 'file': os.path.basename(file_path), 'progress': progress_val}, ensure_ascii=False)}\n\n"
            process_document(file_path, categories, admin_id)
            await asyncio.sleep(0.1)
        yield f"data: {json.dumps({'status': 'done', 'progress': 100}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

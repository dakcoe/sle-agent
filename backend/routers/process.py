from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from services.categorizer import get_categories, process_document
import os
import json
import asyncio

router = APIRouter(prefix="/api")
UPLOAD_DIR = "uploads"

@router.post("/process")
async def process_documents():
    categories = get_categories()
    if not os.path.exists(UPLOAD_DIR):
        files = []
    else:
        files = [os.path.join(UPLOAD_DIR, f) for f in os.listdir(UPLOAD_DIR)]

    async def event_stream():
        total = len(files)
        if total == 0:
            yield f"data: {json.dumps({'status': 'done', 'progress': 100}, ensure_ascii=False)}\n\n"
            return

        for i, file_path in enumerate(files):
            # 클라이언트 화면에 실시간 피드백 전송
            progress_val = int((i / total) * 100)
            yield f"data: {json.dumps({'status': 'processing', 'file': os.path.basename(file_path), 'progress': progress_val}, ensure_ascii=False)}\n\n"
            
            # 동기식 문서 처리 블로킹을 비동기 이벤트 루프 내에서 조화롭게 처리하기 위해 run_in_executor 등으로 감싸거나,
            # 간단한 규모이므로 바로 호출하고 잠깐 대기 시간을 주어 스트림이 흘러가도록 보완
            process_document(file_path, categories)
            await asyncio.sleep(0.1)

        yield f"data: {json.dumps({'status': 'done', 'progress': 100}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.query_engine import run_query
from auth import get_current_user

router = APIRouter(prefix="/api")


class QueryRequest(BaseModel):
    question: str
    conversation_history: Optional[List[dict]] = []


@router.post("/query")
async def query(req: QueryRequest, current_user=Depends(get_current_user)):
    if current_user["role"] == "admin":
        admin_id = current_user["id"]
    else:
        admin_id = current_user.get("linked_admin_id")
        if not admin_id:
            raise HTTPException(status_code=400, detail="연결된 관리자가 없습니다")

    result = run_query(req.question, req.conversation_history, admin_id=admin_id)
    return result

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from services.query_engine import run_query

router = APIRouter(prefix="/api")

class QueryRequest(BaseModel):
    question: str
    conversation_history: Optional[List[dict]] = []

@router.post("/query")
async def query(req: QueryRequest):
    result = run_query(req.question, req.conversation_history)
    return result

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from services.categorizer import propose_categories, save_categories, get_categories
import os

router = APIRouter(prefix="/api")
UPLOAD_DIR = "uploads"

@router.post("/analyze")
async def analyze():
    if not os.path.exists(UPLOAD_DIR):
        return {"categories": []}
    files = [os.path.join(UPLOAD_DIR, f) for f in os.listdir(UPLOAD_DIR)]
    categories = propose_categories(files)
    return {"categories": categories}

class ConfirmRequest(BaseModel):
    categories: List[dict]

@router.post("/categories/confirm")
async def confirm_categories(req: ConfirmRequest):
    save_categories(req.categories)
    return {"status": "confirmed"}

@router.get("/categories")
async def read_categories():
    return {"categories": get_categories()}

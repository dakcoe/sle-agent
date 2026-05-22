from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from services.categorizer import propose_categories, save_categories, get_categories
from auth import require_admin, get_current_user
import os

router = APIRouter(prefix="/api")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@router.post("/analyze")
async def analyze(admin=Depends(require_admin)):
    upload_dir = os.path.join(BASE_DIR, "..", "uploads", str(admin["id"]))
    if not os.path.exists(upload_dir):
        return {"tree": []}
    files = [os.path.join(upload_dir, f) for f in os.listdir(upload_dir)]
    tree = propose_categories(files)
    return {"tree": tree}


class ConfirmRequest(BaseModel):
    tree: List[dict]


@router.post("/categories/confirm")
async def confirm_categories(req: ConfirmRequest, admin=Depends(require_admin)):
    save_categories(req.tree, admin_id=admin["id"])
    return {"status": "confirmed"}


@router.get("/categories")
async def read_categories(current_user=Depends(get_current_user)):
    if current_user["role"] == "admin":
        admin_id = current_user["id"]
    else:
        admin_id = current_user.get("linked_admin_id")
        if not admin_id:
            return {"tree": []}
    return {"tree": get_categories(admin_id=admin_id)}

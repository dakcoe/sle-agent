from fastapi import APIRouter, UploadFile, File, Depends
from typing import List
import shutil
import os
from auth import require_admin

router = APIRouter(prefix="/api")

ALLOWED_EXTENSIONS = {"pdf", "docx", "jpg", "jpeg", "png"}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...), admin=Depends(require_admin)):
    upload_dir = os.path.join(BASE_DIR, "..", "uploads", str(admin["id"]))
    os.makedirs(upload_dir, exist_ok=True)

    saved = []
    for file in files:
        if not file.filename:
            continue
        ext = file.filename.split(".")[-1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
        path = os.path.join(upload_dir, file.filename)
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        saved.append(file.filename)
    return {"uploaded_files": saved}


@router.get("/upload/list")
async def list_uploaded_files(admin=Depends(require_admin)):
    upload_dir = os.path.join(BASE_DIR, "..", "uploads", str(admin["id"]))
    if not os.path.exists(upload_dir):
        return {"files": []}
    files = sorted([
        f for f in os.listdir(upload_dir)
        if os.path.isfile(os.path.join(upload_dir, f))
    ])
    return {"files": files}

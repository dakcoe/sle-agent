from fastapi import APIRouter, UploadFile, File
from typing import List
import shutil
import os

router = APIRouter(prefix="/api")
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "docx", "jpg", "jpeg", "png"}

@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    saved = []
    for file in files:
        if not file.filename:
            continue
        ext = file.filename.split(".")[-1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
        path = os.path.join(UPLOAD_DIR, file.filename)
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        saved.append(file.filename)
    return {"uploaded_files": saved}

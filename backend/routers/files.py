from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from auth import require_admin
import os
import shutil

router = APIRouter(prefix="/api/files")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _base(admin_id: int) -> str:
    return os.path.realpath(os.path.join(BASE_DIR, "..", "storage", str(admin_id)))


def _safe(admin_id: int, rel: str) -> str:
    base = _base(admin_id)
    target = os.path.realpath(os.path.join(base, rel))
    if not target.startswith(base + os.sep) and target != base:
        raise HTTPException(status_code=403, detail="접근 불가 경로")
    return target


def _build_tree(path: str, rel: str = "") -> list:
    items = []
    try:
        entries = sorted(os.scandir(path), key=lambda e: (e.is_file(), e.name))
    except PermissionError:
        return items
    for entry in entries:
        if entry.name == "categories.json":
            continue
        rel_path = os.path.join(rel, entry.name).replace("\\", "/") if rel else entry.name
        if entry.is_dir():
            items.append({
                "type": "folder",
                "name": entry.name,
                "path": rel_path,
                "children": _build_tree(entry.path, rel_path)
            })
        elif entry.is_file() and entry.name.endswith(".txt"):
            items.append({"type": "file", "name": entry.name, "path": rel_path})
    return items


@router.get("/tree")
def get_tree(admin=Depends(require_admin)):
    base = os.path.join(BASE_DIR, "..", "storage", str(admin["id"]))
    if not os.path.exists(base):
        return {"tree": []}
    return {"tree": _build_tree(base)}


@router.get("/content")
def get_content(path: str, admin=Depends(require_admin)):
    full = _safe(admin["id"], path)
    if not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    with open(full, "r", encoding="utf-8") as f:
        content = f.read()
    return {"path": path, "content": content}


class WriteRequest(BaseModel):
    path: str
    content: str


@router.put("/content")
def write_content(req: WriteRequest, admin=Depends(require_admin)):
    full = _safe(admin["id"], req.path)
    if not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    with open(full, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"status": "saved"}


class MoveRequest(BaseModel):
    src: str
    dst: str


@router.post("/move")
def move_item(req: MoveRequest, admin=Depends(require_admin)):
    src = _safe(admin["id"], req.src)
    dst = _safe(admin["id"], req.dst)
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="원본을 찾을 수 없습니다")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(src, dst)
    return {"status": "moved"}


class MkdirRequest(BaseModel):
    path: str


@router.post("/mkdir")
def mkdir(req: MkdirRequest, admin=Depends(require_admin)):
    full = _safe(admin["id"], req.path)
    os.makedirs(full, exist_ok=True)
    return {"status": "created"}


class CreateFileRequest(BaseModel):
    path: str
    content: str = ""


@router.post("/file")
def create_file(req: CreateFileRequest, admin=Depends(require_admin)):
    full = _safe(admin["id"], req.path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"status": "created"}


@router.delete("/item")
def delete_item(path: str, admin=Depends(require_admin)):
    full = _safe(admin["id"], path)
    if not os.path.exists(full):
        raise HTTPException(status_code=404, detail="파일/폴더를 찾을 수 없습니다")
    if os.path.isdir(full):
        shutil.rmtree(full)
    else:
        os.remove(full)
    return {"status": "deleted"}

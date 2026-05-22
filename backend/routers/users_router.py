from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from auth import require_admin
from database import get_db

router = APIRouter(prefix="/api/users")


@router.get("/linked")
def get_linked_users(admin=Depends(require_admin)):
    db = get_db()
    rows = db.execute(
        "SELECT id, username, is_blocked, created_at FROM users WHERE linked_admin_id = ? AND role = 'user'",
        (admin["id"],)
    ).fetchall()
    db.close()
    return {"users": [dict(r) for r in rows]}


class BlockRequest(BaseModel):
    user_id: int
    blocked: bool


@router.post("/block")
def block_user(req: BlockRequest, admin=Depends(require_admin)):
    db = get_db()
    user = db.execute(
        "SELECT id FROM users WHERE id = ? AND linked_admin_id = ?",
        (req.user_id, admin["id"])
    ).fetchone()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    db.execute("UPDATE users SET is_blocked = ? WHERE id = ?", (1 if req.blocked else 0, req.user_id))
    db.commit()
    db.close()
    return {"status": "updated"}

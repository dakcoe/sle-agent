from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database import get_db, generate_admin_code
from auth import hash_password, verify_password, create_token, get_current_user
import os

router = APIRouter(prefix="/auth")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _ensure_dirs(admin_id: int):
    for folder in ("storage", "uploads"):
        path = os.path.join(BASE_DIR, "..", folder, str(admin_id))
        os.makedirs(path, exist_ok=True)


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    admin_code: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/register")
def register(req: RegisterRequest):
    if req.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="role은 'admin' 또는 'user'만 가능합니다")

    db = get_db()
    try:
        if db.execute("SELECT id FROM users WHERE username = ?", (req.username,)).fetchone():
            raise HTTPException(status_code=400, detail="이미 존재하는 사용자명")

        hashed = hash_password(req.password)

        if req.role == "admin":
            code = generate_admin_code()
            while db.execute("SELECT id FROM users WHERE admin_code = ?", (code,)).fetchone():
                code = generate_admin_code()

            cursor = db.execute(
                "INSERT INTO users (username, password, role, admin_code) VALUES (?, ?, ?, ?)",
                (req.username, hashed, "admin", code)
            )
            db.commit()
            user_id = cursor.lastrowid
            _ensure_dirs(user_id)
            return {"id": user_id, "username": req.username, "role": "admin", "admin_code": code}

        else:
            if not req.admin_code:
                raise HTTPException(status_code=400, detail="관리자 코드가 필요합니다")

            admin = db.execute(
                "SELECT id FROM users WHERE admin_code = ? AND role = 'admin'",
                (req.admin_code.strip().upper(),)
            ).fetchone()
            if not admin:
                raise HTTPException(status_code=400, detail="유효하지 않은 관리자 코드")

            cursor = db.execute(
                "INSERT INTO users (username, password, role, linked_admin_id) VALUES (?, ?, ?, ?)",
                (req.username, hashed, "user", admin["id"])
            )
            db.commit()
            user_id = cursor.lastrowid
            return {"id": user_id, "username": req.username, "role": "user"}
    finally:
        db.close()


@router.post("/login")
def login(req: LoginRequest):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (req.username,)).fetchone()
    db.close()

    if not user or not verify_password(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호 오류")
    if user["is_blocked"]:
        raise HTTPException(status_code=403, detail="접근이 차단된 계정입니다")

    token = create_token({"sub": str(user["id"]), "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"]
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    result = {
        "id": current_user["id"],
        "username": current_user["username"],
        "role": current_user["role"]
    }
    if current_user["role"] == "admin":
        result["admin_code"] = current_user["admin_code"]
    return result

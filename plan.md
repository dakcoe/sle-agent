# SLE B안 — AI 사내 규정 탐색 에이전트 (최종 확정 설계)

## 확정된 아키텍처 요약

| 항목 | 결정 사항 |
|------|-----------|
| LLM | Vertex AI (gemini-3.5-flash) |
| 백엔드 | FastAPI + GCP VM (포트 8000 방화벽 개방) |
| 프론트엔드 | Vercel (정적 배포) |
| DB | SQLite (사용자 관리) |
| 인증 | JWT (아이디/비밀번호) |
| 사용자 권한 | admin (업로드+관리) / user (질문만) |
| 문서 저장 | 사용자별 독립 파일 시스템 |

---

## 전체 폴더 구조

```
project/
├── backend/
│   ├── main.py
│   ├── database.py              # SQLite 연결 및 초기화
│   ├── models.py                # DB 테이블 정의
│   ├── auth.py                  # JWT 발급/검증, 비밀번호 해싱
│   ├── routers/
│   │   ├── auth.py              # /register, /login, /me
│   │   ├── upload.py            # 파일 업로드 (admin only)
│   │   ├── categories.py        # 카테고리 조회/확정 (admin only)
│   │   ├── process.py           # 문서 처리 (admin only)
│   │   └── query.py             # 질문 처리 (all users)
│   ├── services/
│   │   ├── file_parser.py
│   │   ├── categorizer.py
│   │   ├── query_engine.py
│   │   └── vertex_client.py     # Vertex AI 래퍼
│   ├── storage/                 # 사용자별 문서 저장소
│   │   └── {user_id}/
│   │       ├── categories.json
│   │       └── 복리후생/
│   │           └── 보상제도.txt
│   ├── uploads/                 # 임시 업로드 파일
│   │   └── {user_id}/
│   ├── sle.db                   # SQLite DB 파일
│   ├── requirements.txt
│   └── .env
└── frontend/
    ├── index.html               # 로그인 페이지
    ├── admin.html               # 관리자 페이지 (업로드/관리)
    ├── chat.html                # 질문 페이지 (모든 사용자)
    ├── style.css
    └── app.js
```

---

## DB 스키마 (SQLite)

```sql
-- 사용자 테이블
CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    UNIQUE NOT NULL,
    password    TEXT    NOT NULL,          -- bcrypt 해시
    role        TEXT    NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
    created_at  TEXT    DEFAULT (datetime('now'))
);
```

---

## API 엔드포인트 명세

### 인증 (auth)
```
POST /auth/register
  - 요청: { "username": str, "password": str, "role": "admin"|"user" }
  - 응답: { "id": int, "username": str, "role": str }
  - 주의: 프로토타입에서는 role 직접 지정 허용. 실서비스 시 admin 생성 제한 필요.

POST /auth/login
  - 요청: { "username": str, "password": str }
  - 응답: { "access_token": str, "token_type": "bearer", "role": str }

GET /auth/me
  - 헤더: Authorization: Bearer {token}
  - 응답: { "id": int, "username": str, "role": str }
```

### 문서 관리 (admin only)
```
POST /upload
  - 헤더: Authorization: Bearer {token} (admin only)
  - 파일 업로드 (multipart/form-data)
  - 응답: { "uploaded_files": [...] }

POST /analyze
  - 헤더: Authorization: Bearer {token} (admin only)
  - 업로드된 파일 분석 → 카테고리 초안 생성
  - 응답: { "categories": [...] }

POST /categories/confirm
  - 헤더: Authorization: Bearer {token} (admin only)
  - 요청: { "categories": [...] }
  - 응답: { "status": "confirmed" }

GET /categories
  - 헤더: Authorization: Bearer {token}
  - 현재 저장된 카테고리 구조 반환 (user도 조회 가능)

POST /process
  - 헤더: Authorization: Bearer {token} (admin only)
  - SSE로 처리 진행 상황 스트리밍
```

### 질문 처리
```
POST /query
  - 헤더: Authorization: Bearer {token} (모든 사용자)
  - 요청: { "question": str, "conversation_history": [...] }
  - 응답: { "answer", "source", "relevant_sections", "path_taken", "found" }
```

---

## 핵심 파일 구현

### .env
```
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
```

---

### vertex_client.py
```python
import vertexai
from vertexai.generative_models import GenerativeModel, Part
import json, os
from dotenv import load_dotenv

load_dotenv()

vertexai.init(
    project=os.getenv("GOOGLE_CLOUD_PROJECT"),
    location=os.getenv("GOOGLE_CLOUD_LOCATION"),
)

model = GenerativeModel("gemini-3.5-flash")

def call_vertex(prompt: str) -> str:
    response = model.generate_content(prompt)
    return response.text

def call_vertex_json(prompt: str) -> dict:
    for _ in range(2):
        try:
            response = model.generate_content(prompt)
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text.strip())
        except Exception:
            continue
    raise ValueError("Vertex AI JSON 파싱 실패")

def call_vertex_vision(image_path: str, prompt: str) -> str:
    with open(image_path, "rb") as f:
        image_data = f.read()
    image_part = Part.from_data(image_data, mime_type="image/jpeg")
    response = model.generate_content([prompt, image_part])
    return response.text
```

---

### database.py
```python
import sqlite3
import os

DB_PATH = "sle.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    UNIQUE NOT NULL,
            password    TEXT    NOT NULL,
            role        TEXT    NOT NULL DEFAULT 'user',
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()
```

---

### auth.py (루트)
```python
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from database import get_db
import os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "changeme")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 1440))

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="인증 실패")
    except JWTError:
        raise HTTPException(status_code=401, detail="인증 실패")

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    db.close()
    if user is None:
        raise HTTPException(status_code=401, detail="사용자 없음")
    return dict(user)

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="관리자 권한 필요")
    return current_user
```

---

### routers/auth.py
```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import get_db
from auth import hash_password, verify_password, create_token, get_current_user

router = APIRouter(prefix="/auth")

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "user"  # "admin" | "user"

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/register")
def register(req: RegisterRequest):
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (req.username,)).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="이미 존재하는 사용자명")
    hashed = hash_password(req.password)
    cursor = db.execute(
        "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
        (req.username, hashed, req.role)
    )
    db.commit()
    user_id = cursor.lastrowid
    db.close()
    return {"id": user_id, "username": req.username, "role": req.role}

@router.post("/login")
def login(req: LoginRequest):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (req.username,)).fetchone()
    db.close()
    if not user or not verify_password(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호 오류")
    token = create_token({"sub": str(user["id"]), "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "role": user["role"]}

@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["id"], "username": current_user["username"], "role": current_user["role"]}
```

---

### 스토리지 경로 규칙 (사용자별 독립)
모든 서비스 함수에서 user_id를 받아 경로에 포함:

```python
# categorizer.py, query_engine.py 전반에 적용
def get_storage_path(user_id: int) -> str:
    return f"storage/{user_id}"

def get_upload_path(user_id: int) -> str:
    path = f"uploads/{user_id}"
    os.makedirs(path, exist_ok=True)
    return path
```

모든 라우터에서 `current_user["id"]`를 서비스 함수에 전달:
```python
# 예시: routers/upload.py
@router.post("/upload")
async def upload(files: List[UploadFile], admin=Depends(require_admin)):
    return await upload_service(files, user_id=admin["id"])
```

---

### main.py
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import init_db
from routers import auth, upload, categories, process, query

app = FastAPI(title="SLE 규정 탐색 에이전트")

# Vercel 프론트엔드에서 오는 요청 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-app.vercel.app",  # 배포 후 실제 Vercel URL로 교체
        "http://localhost:3000",         # 로컬 개발용
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(categories.router)
app.include_router(process.router)
app.include_router(query.router)
```

---

### requirements.txt
```
fastapi
uvicorn[standard]
python-multipart
google-cloud-aiplatform
vertexai
pdfplumber
python-docx
Pillow
python-dotenv
passlib[bcrypt]
python-jose[cryptography]
```

---

## Vertex AI 사전 준비 (GCP)

```
1. GCP 콘솔 → API 및 서비스 → Vertex AI API 활성화
2. IAM → 서비스 계정 생성
   - 역할: Vertex AI 사용자 (roles/aiplatform.user)
3. 서비스 계정 → 키 만들기 → JSON 다운로드
4. 다운로드한 JSON을 backend/service-account.json으로 저장
5. .env에 GOOGLE_APPLICATION_CREDENTIALS=./service-account.json 설정
```

---

## 프론트엔드 구조 (Vercel)

### 페이지 구성
```
index.html   → 로그인 화면
admin.html   → 관리자 전용 (업로드, 카테고리 관리, 진행 상황)
chat.html    → 질문/답변 채팅 (모든 사용자)
```

### 인증 흐름
```
로그인 → JWT 토큰을 localStorage에 저장
모든 API 요청 헤더에 Authorization: Bearer {token} 포함
페이지 로드 시 /auth/me 호출로 토큰 유효성 검사
role이 'user'면 admin.html 접근 차단
```

### Vercel 환경변수
```
VITE_API_URL=http://[GCP_VM_외부_IP]:8000
```

또는 app.js에서 직접:
```javascript
const API_URL = "http://[GCP_VM_외부_IP]:8000";
```

---

## 배포

### GCP VM (백엔드)
```bash
# 방화벽: TCP 8000 포트 개방 (GCP 콘솔에서)

cd backend
pip install -r requirements.txt
# service-account.json 업로드
# .env 파일 생성

screen -S sle
uvicorn main:app --host 0.0.0.0 --port 8000
# Ctrl+A, D
```

### Vercel (프론트엔드)
```
1. GitHub에 frontend/ 폴더 푸시
2. Vercel에서 해당 레포 연결
3. 환경변수에 API_URL 설정
4. 배포 완료 후 main.py CORS allow_origins에 Vercel URL 추가
```

---

## 구현 순서

| 단계 | 작업 |
|------|------|
| 1 | DB 초기화, 사용자 등록/로그인 API, JWT 인증 미들웨어 |
| 2 | Vertex AI 클라이언트, 파일 파서 (사용자별 경로 적용) |
| 3 | 문서 처리 파이프라인 (업로드→분석→확정→저장) |
| 4 | 질문 처리 파이프라인 (우선순위→탐색→답변) |
| 5 | 프론트엔드 (로그인, 관리자, 채팅 페이지) |
| 6 | CORS 설정, Vercel 배포, 통합 테스트 |

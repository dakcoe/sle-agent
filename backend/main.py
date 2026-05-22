from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from routers import upload, categories, process, query
from routers.auth_router import router as auth_router
from routers.files import router as files_router
from routers.users_router import router as users_router
from database import init_db
import os

app = FastAPI(title="SLE 규정 탐색 에이전트")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


app.include_router(auth_router)
app.include_router(files_router)
app.include_router(users_router)
app.include_router(upload.router)
app.include_router(categories.router)
app.include_router(process.router)
app.include_router(query.router)

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
os.makedirs(frontend_dir, exist_ok=True)
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

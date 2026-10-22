import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, ensure_indexes  # noqa: E402
from routers import auth, customers, employees, expenses, inventory, orders, reports, services, settings, source  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    app.state.backup_task = asyncio.create_task(settings.auto_backup_loop())
    yield
    app.state.backup_task.cancel()
    client.close()


app = FastAPI(lifespan=lifespan, title="Laundry Lia Masohi API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Laundry Lia Masohi API", "ok": True}


for module in (auth, customers, services, orders, inventory, employees, expenses, reports, settings, source):
    api_router.include_router(module.router)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

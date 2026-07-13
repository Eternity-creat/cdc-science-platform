# ── SSL 修复：绕过 Windows 证书存储中可能存在的损坏证书 ──
# 必须在 dashscope / aiohttp 导入之前执行
import ssl as _ssl

def _safe_create_default_context(*args, **kwargs):
    """创建 SSL 上下文时不加载 Windows 系统证书存储，改用 certifi 证书包"""
    ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_CLIENT)
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except ImportError:
        # 如果没有 certifi，使用不验证的上下文（仅开发环境）
        ctx.check_hostname = False
        ctx.verify_mode = _ssl.CERT_NONE
    return ctx

_ssl.create_default_context = _safe_create_default_context
# ── SSL 修复结束 ──

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.agent import router as agent_router
from app.api.embedding import router as embedding_router
from app.core.config import settings
from loguru import logger
from pathlib import Path
import sys

logger.remove()
logger.add(
    sys.stderr,
    level=settings.LOG_LEVEL,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level}</level> | <level>{message}</level>"
)

app = FastAPI(
    title="CDC Article Agent",
    description="疾控科普文章生成智能体服务",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent_router)
app.include_router(embedding_router)

# ── 静态文件服务：本地上传的图片 ──
# 图片保存到 uploads/images/，通过 /uploads/images/xxx.jpg 访问
_project_root = Path(__file__).resolve().parent.parent  # cdc-agent/
_uploads_dir = _project_root / settings.UPLOAD_DIR / "images"
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/images", StaticFiles(directory=str(_uploads_dir)), name="uploaded_images")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "cdc-agent"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.AGENT_PORT,
        reload=True
    )

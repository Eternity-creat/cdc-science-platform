"""
Embedding 调试端点。

注意：生产环境的 embedding 计算已迁移到 Java 端（EmbeddingService.java），
Java 直接调用 DashScope REST API 并将向量写入 wiki_segment_embedding 表，
不再经过 Agent 中转。

本端点仅保留用于独立测试/调试 embedding 模型是否正常工作。
Agent 内部的 VectorStore 仍然使用 app.core.embedding.EmbeddingModel 做
内存中的相似度检索，两者不冲突。
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

router = APIRouter(prefix="/api/agent/embedding", tags=["embedding"])


class EmbeddingTestRequest(BaseModel):
    """仅用于调试测试，字段精简"""
    content: str


@router.post("/test")
async def test_embedding(request: EmbeddingTestRequest):
    """调试用：测试 DashScope Embedding 模型是否正常返回向量"""
    from app.core.embedding import EmbeddingModel

    logger.info(f"[调试] 测试 Embedding, text_len={len(request.content)}")

    try:
        model = EmbeddingModel()
        vector = model.encode_single(request.content)

        logger.info(f"[调试] Embedding 成功: dim={len(vector)}")
        return {
            "success": True,
            "model": model.model,
            "dimensions": len(vector),
            "sample": vector[:5],  # 只返回前 5 维做验证
        }
    except Exception as e:
        logger.error(f"[调试] Embedding 失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

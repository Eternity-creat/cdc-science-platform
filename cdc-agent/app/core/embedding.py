"""
CDC Agent - Embedding Client using OpenAI-compatible REST API.

支持任意 Embedding 模型名称（不再受 DashScope SDK 内部模型映射限制）。
同步接口，使用 httpx.Client 发送 HTTP 请求。
"""

import httpx
from typing import List
from app.core.config import settings
from loguru import logger


# DashScope OpenAI-compatible endpoint（从集中配置读取）
_DEFAULT_BASE_URL = settings.DEFAULT_BASE_URL

# 单次请求超时
_REQUEST_TIMEOUT_SECONDS = 30


class EmbeddingModel:
    """
    Embedding 模型客户端（OpenAI-compatible REST API）。

    模型配置优先从 Java 后端 cdc_llm_config 表读取（前端可管理），
    未配置时回退到 .env 中的 DASHSCOPE_API_KEY / EMBEDDING_MODEL。
    """

    def __init__(
        self,
        api_key: str = None,
        model: str = None,
        base_url: str = None,
    ):
        if api_key is None or model is None:
            try:
                from app.core.llm_pool import get_model_config
                config = get_model_config("embedding")
                self.model = model or config["model_name"]
                self.api_key = api_key or config["api_key"]
                self.base_url = (base_url or config.get("base_url") or _DEFAULT_BASE_URL).rstrip("/")
            except Exception as e:
                logger.debug(f"EmbeddingModel: 配置系统不可用，回退到 .env: {e}")
                self.model = model or settings.EMBEDDING_MODEL
                self.api_key = api_key or settings.DASHSCOPE_API_KEY
                self.base_url = (base_url or _DEFAULT_BASE_URL).rstrip("/")
        else:
            self.api_key = api_key
            self.model = model
            self.base_url = (base_url or _DEFAULT_BASE_URL).rstrip("/")

    def _build_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def encode(self, texts: List[str]) -> List[List[float]]:
        """
        对一组文本进行 Embedding 编码，返回向量列表。

        使用 OpenAI-compatible POST /embeddings 接口。
        """
        body = {
            "model": self.model,
            "input": texts,
        }

        try:
            with httpx.Client(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                response = client.post(
                    f"{self.base_url}/embeddings",
                    headers=self._build_headers(),
                    json=body,
                )
        except httpx.TimeoutException:
            raise EmbeddingError(f"Embedding 请求超时 ({_REQUEST_TIMEOUT_SECONDS}s)")
        except httpx.RequestError as e:
            raise EmbeddingError(f"Embedding 网络错误: {e}")

        if response.status_code != 200:
            try:
                err_body = response.json()
            except Exception:
                err_body = {"error": {"message": response.text}}

            from app.core.llm import _humanize_error
            human_msg = _humanize_error(response.status_code, err_body, self.model)
            logger.error(f"Embedding 调用失败 [{self.model}]: HTTP {response.status_code} - {human_msg}")
            raise EmbeddingError(f"Embedding 调用失败: {human_msg}")

        data = response.json()

        # OpenAI format: {"data": [{"embedding": [...], "index": 0}, ...]}
        items = data.get("data", [])
        if not items:
            raise EmbeddingError("Embedding 返回空结果")

        # 按 index 排序以保证顺序一致
        items.sort(key=lambda x: x.get("index", 0))
        return [item["embedding"] for item in items]

    def encode_single(self, text: str) -> List[float]:
        """对单条文本进行 Embedding 编码，返回一个向量。"""
        return self.encode([text])[0]


class EmbeddingError(Exception):
    pass

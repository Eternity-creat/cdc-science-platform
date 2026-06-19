"""
CDC Agent - LLM Client with production hardening.

Features:
- OpenAI-compatible REST API via httpx (async) — 支持任意模型名称
- Tenacity retry with exponential backoff (3 attempts, 2s/4s waits)
- Global concurrency control via asyncio.Semaphore(5)
- Per-request 60-second timeout
- Token usage tracking and accumulation
- 错误信息中文化，方便前端用户理解
"""

import asyncio
from typing import List, Dict, Optional, Any

import httpx
from loguru import logger
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

from app.core.config import settings


# ---------------------------------------------------------------------------
# Default base URL (from centralized config)
# ---------------------------------------------------------------------------

_DEFAULT_BASE_URL = settings.DEFAULT_BASE_URL


# ---------------------------------------------------------------------------
# Token usage tracker
# ---------------------------------------------------------------------------

class TokenUsage:
    """
    Accumulates token usage statistics across multiple LLM calls.

    Thread-safety note: this class is NOT thread-safe, but it is only
    mutated from the async event loop (one chat call at a time per instance),
    so no lock is needed in practice.
    """

    def __init__(self):
        self.prompt_tokens: int = 0
        self.completion_tokens: int = 0
        self.total_tokens: int = 0
        self.estimated_cost: float = 0.0
        self.request_count: int = 0

    def add_usage(
        self,
        prompt: int,
        completion: int,
        cost_per_1k: float = 0.002,
    ) -> None:
        """
        Accumulate usage from a single LLM call.

        Args:
            prompt: Number of prompt tokens consumed.
            completion: Number of completion tokens generated.
            cost_per_1k: Estimated cost per 1,000 total tokens (USD).
        """
        self.prompt_tokens += prompt
        self.completion_tokens += completion
        self.total_tokens += prompt + completion
        self.estimated_cost += (prompt + completion) / 1000.0 * cost_per_1k
        self.request_count += 1

    def summary(self) -> Dict[str, Any]:
        """Return a JSON-serialisable summary of accumulated usage."""
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "estimated_cost": round(self.estimated_cost, 6),
            "request_count": self.request_count,
        }

    def __repr__(self) -> str:
        return (
            f"TokenUsage(prompt={self.prompt_tokens}, "
            f"completion={self.completion_tokens}, "
            f"total={self.total_tokens}, "
            f"cost=${self.estimated_cost:.6f}, "
            f"requests={self.request_count})"
        )


# ---------------------------------------------------------------------------
# LLM Error
# ---------------------------------------------------------------------------

class LLMError(Exception):
    """Raised when the LLM API returns a non-200 response."""
    pass


def _humanize_error(status_code: int, body: dict, model: str) -> str:
    """将 OpenAI-compatible API 的错误信息翻译为更直观的中文提示。"""
    error_obj = body.get("error", {}) if isinstance(body, dict) else {}
    code = error_obj.get("code", "") or str(status_code)
    message = error_obj.get("message", "") or str(body)

    # 模型不存在 / 名称无效
    if status_code == 404 or "model_not_found" in code or "url error" in message:
        return (
            f"模型名称 '{model}' 无效或不受支持。"
            f"请在 DashScope 控制台 (bailian.console.aliyun.com) 确认模型标识，"
            f"常见文本模型: qwen-turbo / qwen-plus / qwen-max / deepseek-v3 / deepseek-r1"
        )
    # API Key 无效
    if status_code == 401 or "invalid_api_key" in code or "Incorrect API key" in message:
        return "API Key 无效，请在 LLM 配置页面检查 API Key 是否正确"
    # 频率限制
    if status_code == 429 or "rate_limit" in code.lower() or "Throttling" in message:
        return "API 调用频率超限，请稍后重试或联系管理员提升配额"
    # 配额不足
    if "quota" in message.lower() or "insufficient_quota" in code:
        return "API 配额已用尽，请检查 DashScope 账户余额或充值"
    # 参数错误
    if status_code == 400:
        return f"请求参数错误: {message}"
    # 服务端错误
    if status_code >= 500:
        return f"模型服务端异常 (HTTP {status_code})，请稍后重试"

    return message or f"未知错误 (HTTP {status_code}, code={code})"


# ---------------------------------------------------------------------------
# Concurrency & timeout constants
# ---------------------------------------------------------------------------

# Global semaphore: at most 5 concurrent LLM requests across the process.
_LLM_SEMAPHORE = asyncio.Semaphore(5)

# Per-request timeout in seconds.
# 推理模型（如 qwen3.7-plus / deepseek-r1）生成较慢，需要较长超时。
_REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=180.0, write=10.0, pool=10.0)


# ---------------------------------------------------------------------------
# Retry decorator (shared by both chat methods)
# ---------------------------------------------------------------------------

def _llm_retry():
    """
    Build a tenacity retry decorator configured for LLM calls.

    - Retries only on LLMError (not on TimeoutError or other exceptions).
    - 3 total attempts.
    - Exponential backoff: waits of ~2s then ~4s between attempts.
      (multiplier=2 => 2^1=2s, 2^2=4s; capped at max=8s)
    - Logs each retry via loguru.
    """
    return retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=8),
        retry=retry_if_exception_type(LLMError),
        before_sleep=before_sleep_log(logger, "WARNING"),
        reraise=True,
    )


# ---------------------------------------------------------------------------
# LLM Client
# ---------------------------------------------------------------------------

class LLMClient:
    """
    Async wrapper around OpenAI-compatible REST API with:
    - Concurrency control (Semaphore)
    - Per-request timeout
    - Automatic retry on transient LLM errors
    - Optional token usage accumulation
    - 支持任意模型名称（不再受 DashScope SDK 内部模型映射限制）
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = api_key or settings.DASHSCOPE_API_KEY
        self.model = model or settings.LLM_MODEL
        self.base_url = (base_url or _DEFAULT_BASE_URL).rstrip("/")

    def _build_headers(self) -> Dict[str, str]:
        """构建 OpenAI-compatible 请求头。"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Public: simple chat (returns content string)
    # ------------------------------------------------------------------

    async def chat(
        self,
        messages: List[Dict[str, str]],
        usage: Optional[TokenUsage] = None,
        **kwargs,
    ) -> str:
        """
        Send a chat completion request and return the assistant's content string.

        Args:
            messages: OpenAI-style message list.
            usage: Optional TokenUsage instance to accumulate stats into.
            **kwargs: Extra params merged into the request body (temperature, max_tokens, etc.)

        Returns:
            The assistant's message content as a string.

        Raises:
            LLMError: If the API returns a non-200 status (retried up to 3 times).
            asyncio.TimeoutError: If the call exceeds 60 seconds (NOT retried).
        """

        @_llm_retry()
        async def _call() -> str:
            body: Dict[str, Any] = {
                "model": self.model,
                "messages": messages,
            }
            # 把 kwargs 中的合法参数透传（temperature, max_tokens, top_p, stop, ...）
            body.update({k: v for k, v in kwargs.items() if v is not None})

            async with _LLM_SEMAPHORE:
                try:
                    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                        response = await client.post(
                            f"{self.base_url}/chat/completions",
                            headers=self._build_headers(),
                            json=body,
                        )
                except httpx.TimeoutException:
                    logger.warning(f"LLM请求超时 [{self.model}] (read={_REQUEST_TIMEOUT.read}s)")
                    raise LLMError(f"模型响应超时，请稍后重试或换一个更快的模型")

            if response.status_code != 200:
                try:
                    err_body = response.json()
                except Exception:
                    err_body = {"error": {"message": response.text}}
                human_msg = _humanize_error(response.status_code, err_body, self.model)
                logger.error(f"LLM调用失败 [{self.model}]: HTTP {response.status_code} - {human_msg}")
                raise LLMError(f"LLM调用失败: {human_msg}")

            data = response.json()

            # Accumulate token usage if a tracker was provided.
            if usage is not None:
                u = data.get("usage", {})
                usage.add_usage(
                    prompt=u.get("prompt_tokens", 0),
                    completion=u.get("completion_tokens", 0),
                )

            # 提取 assistant content
            choices = data.get("choices", [])
            if not choices:
                raise LLMError("LLM返回空 choices，未生成任何内容")
            return choices[0]["message"]["content"]

        return await _call()

    # ------------------------------------------------------------------
    # Public: chat with function/tool calling (returns full output dict)
    # ------------------------------------------------------------------

    async def chat_with_functions(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict[str, Any]],
        usage: Optional[TokenUsage] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Send a chat request with tool/function definitions.

        Args:
            messages: OpenAI-style message list.
            tools: Tool definitions for function calling (OpenAI format).
            usage: Optional TokenUsage instance to accumulate stats into.
            **kwargs: Extra params merged into the request body.

        Returns:
            Dict with keys: choices, usage (OpenAI-format response body).

        Raises:
            LLMError: If the API returns a non-200 status (retried up to 3 times).
            asyncio.TimeoutError: If the call exceeds 60 seconds (NOT retried).
        """

        @_llm_retry()
        async def _call() -> Dict[str, Any]:
            body: Dict[str, Any] = {
                "model": self.model,
                "messages": messages,
                "tools": tools,
            }
            body.update({k: v for k, v in kwargs.items() if v is not None})

            async with _LLM_SEMAPHORE:
                try:
                    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                        response = await client.post(
                            f"{self.base_url}/chat/completions",
                            headers=self._build_headers(),
                            json=body,
                        )
                except httpx.TimeoutException:
                    logger.warning(f"LLM Function Calling请求超时 [{self.model}] (read={_REQUEST_TIMEOUT.read}s)")
                    raise LLMError(f"模型响应超时，请稍后重试或换一个更快的模型")

            if response.status_code != 200:
                try:
                    err_body = response.json()
                except Exception:
                    err_body = {"error": {"message": response.text}}
                human_msg = _humanize_error(response.status_code, err_body, self.model)
                logger.error(f"LLM Function Calling调用失败 [{self.model}]: HTTP {response.status_code} - {human_msg}")
                raise LLMError(f"LLM调用失败: {human_msg}")

            data = response.json()

            # Accumulate token usage if a tracker was provided.
            if usage is not None:
                u = data.get("usage", {})
                usage.add_usage(
                    prompt=u.get("prompt_tokens", 0),
                    completion=u.get("completion_tokens", 0),
                )

            # 返回完整响应体（包含 choices / usage），与旧版 response.output 兼容
            # 旧调用方可能读 response.output["choices"][0]["message"]["tool_calls"]
            # 现在 data 本身就有 choices，因此包装一层 {"choices": [...], "usage": {...}}
            return data

        return await _call()

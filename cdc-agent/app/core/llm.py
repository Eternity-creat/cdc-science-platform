"""
CDC Agent - LLM Client with production hardening.

Features:
- OpenAI-compatible REST API via httpx (async) — 支持任意模型名称
- Tenacity retry with exponential backoff (3 attempts, 3s/9s waits)
- Outer rate-limit retry for 429 errors (30s/60s waits, 3 attempts)
- Global concurrency control via asyncio.Semaphore(5)
- Per-request 300-second timeout
- Token usage tracking and accumulation
- 错误信息中文化，方便前端用户理解
"""

import asyncio
import json
from typing import List, Dict, Optional, Any, AsyncIterator

import httpx
from loguru import logger
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    retry_if_exception_message,
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
# 动态 prompt 注入 Layer 1-4 写作知识后 prompt 较大，且长文生成（800+ 字）需要较长推理时间，
# 300s 与 Nginx proxy_read_timeout 对齐。
_REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)


# ---------------------------------------------------------------------------
# Retry decorator (shared by both chat methods)
# ---------------------------------------------------------------------------

def _llm_retry():
    """
    Build a tenacity retry decorator configured for LLM calls.

    - Retries only on LLMError (not on TimeoutError or other exceptions).
    - 3 total attempts.
    - Exponential backoff: waits of ~3s then ~6s between attempts.
      (multiplier=3 => 3^1=3s, 3^2=9s; capped at max=12s)
    - Logs each retry via loguru.
    """
    return retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=3, min=3, max=12),
        retry=retry_if_exception_type(LLMError),
        before_sleep=before_sleep_log(logger, "WARNING"),
        reraise=True,
    )


def _rate_limit_retry():
    """
    Outer retry specifically for 429 rate-limit errors (DashScope RPM/TPM 限制).

    - Only retries when the LLMError message contains rate-limit keywords.
    - 3 total attempts with 30s / 60s waits to outlast the rate-limit window.
    - Other LLMError (model errors, auth errors) are NOT retried here.
    """
    return retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=30, min=30, max=60),
        retry=retry_if_exception_message(match="频率超限|rate_limit|429"),
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
        extra_params: Optional[Dict[str, Any]] = None,
    ):
        self.api_key = api_key or settings.DASHSCOPE_API_KEY
        self.model = model or settings.LLM_MODEL
        self.base_url = (base_url or _DEFAULT_BASE_URL).rstrip("/")
        # 模型级额外参数（来自 DB cdc_llm_config.params），如 {"thinking": {"type": "disabled"}}
        self.extra_params = extra_params or {}

    def _build_headers(self, stream: bool = False) -> Dict[str, str]:
        """构建 OpenAI-compatible 请求头。"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if stream:
            headers["Accept"] = "text/event-stream"
        return headers

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
            # 注入配置级参数（如 thinking、temperature），再叠加调用级 kwargs
            body.update({k: v for k, v in self.extra_params.items() if v is not None})
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

        @_rate_limit_retry()
        async def _call_with_rate_limit_retry():
            return await _call()

        return await _call_with_rate_limit_retry()

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        usage: Optional[TokenUsage] = None,
        **kwargs,
    ) -> AsyncIterator[str]:
        """
        Stream chat completion deltas from an OpenAI-compatible endpoint.

        Yields:
            Text deltas as soon as the model returns them.
        """
        body: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
        }
        body.update({k: v for k, v in self.extra_params.items() if v is not None})
        body.update({k: v for k, v in kwargs.items() if v is not None})
        # Streaming is part of this method's contract and must not be
        # overridden by a saved model parameter.
        body["stream"] = True

        async with _LLM_SEMAPHORE:
            try:
                async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/chat/completions",
                        headers=self._build_headers(stream=True),
                        json=body,
                    ) as response:
                        if response.status_code != 200:
                            try:
                                err_body = json.loads((await response.aread()).decode("utf-8"))
                            except Exception:
                                err_body = {"error": {"message": response.reason_phrase}}
                            human_msg = _humanize_error(response.status_code, err_body, self.model)
                            logger.error(f"LLM流式调用失败 [{self.model}]: HTTP {response.status_code} - {human_msg}")
                            raise LLMError(f"LLM调用失败: {human_msg}")

                        received_events = 0
                        emitted_content = False

                        async for line in response.aiter_lines():
                            if not line or line.startswith(":"):
                                continue
                            if not line.startswith("data:"):
                                continue

                            payload = line[len("data:"):].strip()
                            if payload == "[DONE]":
                                break

                            try:
                                data = json.loads(payload)
                            except json.JSONDecodeError:
                                continue

                            received_events += 1

                            if usage is not None and data.get("usage"):
                                u = data.get("usage", {})
                                usage.add_usage(
                                    prompt=u.get("prompt_tokens", 0),
                                    completion=u.get("completion_tokens", 0),
                                )

                            choices = data.get("choices", [])
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {}) or {}
                            content = delta.get("content")
                            if isinstance(content, str) and content:
                                emitted_content = True
                                yield content
                            elif isinstance(content, list):
                                for part in content:
                                    if isinstance(part, dict) and part.get("text"):
                                        emitted_content = True
                                        yield str(part["text"])

                        if not emitted_content:
                            raise LLMError(
                                f"模型 {self.model} 未返回可用的 SSE 文本增量"
                                f"（收到 {received_events} 个事件）。请确认模型和 Base URL 支持 OpenAI 流式输出。"
                            )
            except httpx.TimeoutException:
                logger.warning(f"LLM流式请求超时 [{self.model}] (read={_REQUEST_TIMEOUT.read}s)")
                raise LLMError("模型响应超时，请稍后重试或换一个更快的模型")

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
            # 注入配置级参数（如 thinking、temperature），再叠加调用级 kwargs
            body.update({k: v for k, v in self.extra_params.items() if v is not None})
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

        @_rate_limit_retry()
        async def _call_with_rate_limit_retry():
            return await _call()

        return await _call_with_rate_limit_retry()

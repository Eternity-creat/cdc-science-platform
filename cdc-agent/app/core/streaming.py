"""Helpers for sending generation output in readable SSE units."""

import re
from contextvars import ContextVar, Token
from typing import Any, Awaitable, Callable, Dict, Optional


StreamCallback = Callable[[str], Awaitable[None]]
StreamEventCallback = Callable[[str, Dict[str, Any]], Awaitable[None]]
_stream_callback: ContextVar[Optional[StreamCallback]] = ContextVar(
    "cdc_stream_callback",
    default=None,
)
_stream_event_callback: ContextVar[Optional[StreamEventCallback]] = ContextVar(
    "cdc_stream_event_callback",
    default=None,
)


def set_stream_callback(callback: StreamCallback) -> Token:
    return _stream_callback.set(callback)


def reset_stream_callback(token: Token) -> None:
    _stream_callback.reset(token)


def get_stream_callback() -> Optional[StreamCallback]:
    return _stream_callback.get()


def set_stream_event_callback(callback: StreamEventCallback) -> Token:
    return _stream_event_callback.set(callback)


def reset_stream_event_callback(token: Token) -> None:
    _stream_event_callback.reset(token)


async def emit_stream_replace(content: str = "") -> None:
    callback = _stream_event_callback.get()
    if callback:
        await callback("replace", {"content": content})


class ParagraphStreamBuffer:
    """Collect model tokens and release only completed Markdown blocks."""

    _paragraph_boundary = re.compile(r"\r?\n[ \t]*\r?\n")

    def __init__(self) -> None:
        self._buffer = ""

    def push(self, delta: str) -> list[str]:
        self._buffer += delta
        completed: list[str] = []

        while match := self._paragraph_boundary.search(self._buffer):
            end = match.end()
            completed.append(self._buffer[:end])
            self._buffer = self._buffer[end:]

        if self._buffer.startswith("#") and "\n" in self._buffer:
            line_end = self._buffer.index("\n") + 1
            completed.append(self._buffer[:line_end])
            self._buffer = self._buffer[line_end:]

        return completed

    def flush(self) -> str:
        remaining = self._buffer
        self._buffer = ""
        return remaining

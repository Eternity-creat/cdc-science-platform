"""Helpers for sending generation output in readable SSE units."""

import re
from contextvars import ContextVar, Token
from typing import Awaitable, Callable, Optional


StreamCallback = Callable[[str], Awaitable[None]]
_stream_callback: ContextVar[Optional[StreamCallback]] = ContextVar(
    "cdc_stream_callback",
    default=None,
)


def set_stream_callback(callback: StreamCallback) -> Token:
    return _stream_callback.set(callback)


def reset_stream_callback(token: Token) -> None:
    _stream_callback.reset(token)


def get_stream_callback() -> Optional[StreamCallback]:
    return _stream_callback.get()


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

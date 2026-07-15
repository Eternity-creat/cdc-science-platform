import asyncio

import pytest

from app.core.streaming import (
    get_stream_callback,
    reset_stream_callback,
    set_stream_callback,
)
from app.skills.flow.fusion_skill import FusionGenerateSkill
from app.skills.flow.outline_skill import OutlineGenerateSkill


class FakeStreamingLlm:
    async def chat_stream(self, _messages):
        for delta in ["# 标题\n", "第一段", "内容。\n\n", "第二段内容。"]:
            await asyncio.sleep(0)
            yield delta


@pytest.mark.asyncio
async def test_stream_callback_propagates_into_created_task():
    received = []

    async def callback(text):
        received.append(text)

    token = set_stream_callback(callback)
    try:
        async def worker():
            current = get_stream_callback()
            assert current is callback
            await current("段落")

        await asyncio.create_task(worker())
    finally:
        reset_stream_callback(token)

    assert received == ["段落"]
    assert get_stream_callback() is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("skill_class", "result_field"),
    [
        (OutlineGenerateSkill, "article_outline"),
        (FusionGenerateSkill, "initial_draft"),
    ],
)
async def test_generation_skill_streams_completed_blocks_from_context(
    skill_class,
    result_field,
):
    received = []

    async def callback(text):
        received.append(text)

    skill = object.__new__(skill_class)
    skill.llm = FakeStreamingLlm()
    token = set_stream_callback(callback)
    try:
        result = await skill.execute({"_dynamic_prompt": "测试提示词"})
    finally:
        reset_stream_callback(token)

    assert result[result_field] == "# 标题\n第一段内容。\n\n第二段内容。"
    assert received == ["# 标题\n", "第一段内容。\n\n", "第二段内容。"]

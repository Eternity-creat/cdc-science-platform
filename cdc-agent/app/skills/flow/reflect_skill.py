from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.core.llm import LLMClient
from app.prompts.reflect_iterate import REFLECT_ITERATE_PROMPT
from loguru import logger


class ReflectIterateSkill(BaseSkill):
    """
    反思迭代 Skill
    
    用途: 事实核查失败时的自我修正
    
    输入: initial_draft, check_report, top_k_segment_list
    输出: initial_draft, retry_times
    """
    
    MAX_RETRIES = 3
    
    def __init__(self):
        self.llm = self.get_llm()
    
    @property
    def name(self) -> str:
        return "reflect_iterate"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "事实核查失败时的自我修正",
            "input_fields": ["initial_draft", "check_report", "top_k_segment_list"],
            "output_fields": ["initial_draft", "retry_times"],
            "category": "iteration"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行反思迭代（纯函数模式）"""
        new_state = {**state}

        draft = state.get("initial_draft", "")
        check_report = state.get("check_report", "")
        segments = state.get("top_k_segment_list", [])
        wiki_segments = state.get("wiki_segments", [])

        retry_times = state.get("retry_times", 0) + 1
        new_state["retry_times"] = retry_times

        if retry_times > self.MAX_RETRIES:
            logger.warning("ReflectIterateSkill: 超过最大重试次数")
            return new_state

        # 合并权威知识片段
        if wiki_segments:
            segment_content = "\n".join([f"- {s}" for s in wiki_segments])
        elif segments:
            segment_content = "\n".join([f"- {s.get('content', '')}" for s in segments])
        else:
            segment_content = "无权威片段"

        prompt = REFLECT_ITERATE_PROMPT.format(
            original_draft=draft,
            check_report=check_report,
            segment_content=segment_content
        )

        messages = [{"role": "user", "content": prompt}]
        response = await self.llm.chat(messages)
        new_state["initial_draft"] = response
        logger.info(f"ReflectIterateSkill: 第{retry_times}次迭代完成")

        return new_state

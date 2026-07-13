import json
from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.core.llm import LLMClient
from app.prompts.fact_check import FACT_CHECK_PROMPT
from app.utils import extract_json
from loguru import logger


class FactCheckSkill(BaseSkill):
    """
    事实核查 Skill
    
    用途: 验证生成内容的事实准确性
    
    输入: initial_draft, top_k_segment_list
    输出: is_fact_ok, check_report
    """
    
    def __init__(self):
        self.llm = self.get_llm()
    
    @property
    def name(self) -> str:
        return "fact_check"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "验证生成内容的事实准确性",
            "input_fields": ["initial_draft", "top_k_segment_list"],
            "output_fields": ["is_fact_ok", "check_report"],
            "category": "validation"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行事实核查（纯函数模式）"""
        new_state = {**state}
        
        draft = state.get("initial_draft", "")
        segments = state.get("top_k_segment_list", [])
        wiki_segments = state.get("wiki_segments", [])

        if not draft:
            logger.warning("FactCheckSkill: 未提供初稿内容")
            new_state["is_fact_ok"] = True
            return new_state

        # 限制片段数量，兼容 dict 和 WikiSegment
        if wiki_segments:
            segment_content = "\n".join([
                f"- {s.get('content', s) if hasattr(s, 'get') else s}"
                for s in wiki_segments[:10]
            ])
        elif segments:
            segment_content = "\n".join([
                f"- {s.get('content', '') if hasattr(s, 'get') else s}"
                for s in segments[:10]
            ])
        else:
            segment_content = ""
        
        prompt = FACT_CHECK_PROMPT.format(
            article_content=draft,
            segment_content=segment_content or "无权威片段"
        )
        
        messages = [{"role": "user", "content": prompt}]
        response = await self.llm.chat(messages)
        
        try:
            cleaned = extract_json(response)
            result = json.loads(cleaned)
            new_state["is_fact_ok"] = result.get("is_fact_ok", True)
            new_state["check_report"] = json.dumps(result, ensure_ascii=False)
            logger.info(f"FactCheckSkill: 校验完成 is_fact_ok={new_state['is_fact_ok']}")
        except json.JSONDecodeError as e:
            logger.error(f"FactCheckSkill: JSON解析失败 {e}")
            logger.debug(f"FactCheckSkill: 原始返回内容: {response[:200]}")
            new_state["is_fact_ok"] = True
        
        return new_state

import json
from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.core.llm import LLMClient
from app.prompts.intent_parse import INTENT_PARSE_PROMPT
from app.utils import extract_json
from loguru import logger


class IntentParseSkill(BaseSkill):
    """
    意图解析 Skill
    
    用途: 从自由文本中解析出结构化参数（实体、人群、场景）
    
    输入: user_text
    输出: entity_type, parsed_entity_name, parsed_population_name, parsed_scene_name, word_count
    """
    
    def __init__(self):
        self.llm = self.get_llm()
    
    @property
    def name(self) -> str:
        return "intent_parse"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "从自由文本中解析出结构化参数（实体、人群、场景）",
            "input_fields": ["user_text"],
            "output_fields": ["entity_type", "parsed_entity_name", "parsed_population_name", "parsed_scene_name", "word_count"],
            "category": "parsing"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行意图解析（纯函数模式）"""
        # 创建新状态，不修改原 state
        new_state = {**state}
        
        user_text = state.get("user_text", "")
        if not user_text:
            logger.warning("IntentParseSkill: 未提供用户文本")
            return new_state
        
        prompt = INTENT_PARSE_PROMPT.format(user_text=user_text)
        messages = [{"role": "user", "content": prompt}]
        
        response = await self.llm.chat(messages)
        try:
            cleaned = extract_json(response)
            parsed = json.loads(cleaned)
            new_state["parsed_entity_name"] = parsed.get("entity_name", "")
            new_state["entity_type"] = parsed.get("entity_type", "")
            new_state["parsed_population_name"] = parsed.get("population_name", "")
            new_state["parsed_scene_name"] = parsed.get("scene_name", "")
            if parsed.get("word_count"):
                new_state["word_count"] = parsed.get("word_count")
            logger.info(f"IntentParseSkill: 解析成功 - {parsed}")
        except json.JSONDecodeError as e:
            logger.error(f"IntentParseSkill: JSON解析失败 {e}")
            logger.debug(f"IntentParseSkill: 原始返回内容: {response[:200]}")
        
        return new_state

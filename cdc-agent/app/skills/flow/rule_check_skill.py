import json
from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.core.llm import LLMClient
from app.prompts.rule_check import RULE_CHECK_PROMPT
from app.utils import extract_json
from loguru import logger


class RuleCheckSkill(BaseSkill):
    """
    规则检查 Skill
    
    用途: 检查 must_include/must_not_say 规则
    
    输入: initial_draft, wiki_rule
    输出: rule_passed
    """
    
    def __init__(self):
        self.llm = self.get_llm()
    
    @property
    def name(self) -> str:
        return "rule_check"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "检查 must_include/must_not_say 规则",
            "input_fields": ["initial_draft", "wiki_rule"],
            "output_fields": ["rule_passed"],
            "category": "validation"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行规则检查（纯函数模式）"""
        new_state = {**state}
        
        draft = state.get("initial_draft", "")
        wiki_rule = state.get("wiki_rule", {})
        
        if not draft:
            logger.warning("RuleCheckSkill: 未提供初稿内容")
            new_state["rule_passed"] = True
            return new_state
        
        must_include = wiki_rule.get("must_include", []) if wiki_rule else []
        must_not_say = wiki_rule.get("must_not_say", []) if wiki_rule else []
        
        prompt = RULE_CHECK_PROMPT.format(
            article_content=draft,
            must_include=", ".join(must_include) if must_include else "无",
            must_not_say=", ".join(must_not_say) if must_not_say else "无"
        )
        
        messages = [{"role": "user", "content": prompt}]
        response = await self.llm.chat(messages)
        
        try:
            cleaned = extract_json(response)
            result = json.loads(cleaned)
            new_state["rule_passed"] = result.get("rule_passed", True)
            logger.info(f"RuleCheckSkill: 规则校验 rule_passed={new_state['rule_passed']}")
        except json.JSONDecodeError as e:
            logger.error(f"RuleCheckSkill: JSON解析失败 {e}")
            logger.debug(f"RuleCheckSkill: 原始返回内容: {response[:200]}")
            new_state["rule_passed"] = True
        
        return new_state

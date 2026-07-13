from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from loguru import logger


class TemplateExtractSkill(BaseSkill):
    """
    模板信息提取 Skill
    
    用途: 从传入数据中提取模板信息
    
    输入: template_name, template_purpose, template_tone, template_outline
    输出: match_template
    """
    
    @property
    def name(self) -> str:
        return "template_extract"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "从传入数据中提取模板信息",
            "input_fields": ["template_name", "template_purpose", "template_tone", "template_outline"],
            "output_fields": ["match_template"],
            "category": "retrieval"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行模板信息提取（纯函数模式）"""
        new_state = {**state}
        
        # 直接从传入数据中提取模板信息
        # 注意: 使用 `or` 而非 dict.get 的 default 参数，
        # 因为 Pydantic Optional 字段可能存在但值为 None，
        # dict.get("key", default) 在 key 存在时返回 None 而非 default
        new_state["match_template"] = {
            "id": state.get("template_id") or 1,
            "template_name": state.get("template_name") or "标准科普模板",
            "template_purpose": state.get("template_purpose") or "科普宣教",
            "template_tone": state.get("template_tone") or "专业、温和、通俗易懂",
            "template_outline": state.get("template_outline") or "1.概述\n2.正文\n3.结语"
        }
        logger.info(f"TemplateExtractSkill: 提取模板 {new_state['match_template']['template_name']}")
        
        return new_state

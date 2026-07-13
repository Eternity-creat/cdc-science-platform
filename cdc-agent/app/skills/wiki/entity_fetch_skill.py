from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from loguru import logger


class EntityFetchSkill(BaseSkill):
    """
    实体信息提取 Skill
    
    用途: 从传入数据中提取实体详细信息（alias, summary 等）
    
    输入: entity_name, entity_alias, entity_summary
    输出: main_wiki_entity
    """
    
    @property
    def name(self) -> str:
        return "entity_fetch"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "从传入数据中提取实体详细信息",
            "input_fields": ["entity_name", "entity_alias", "entity_summary"],
            "output_fields": ["main_wiki_entity"],
            "category": "retrieval"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行实体信息提取（纯函数模式）"""
        new_state = {**state}
        
        entity_name = state.get("entity_name")
        entity_alias = state.get("entity_alias", "")
        entity_summary = state.get("entity_summary", "")
        
        if not entity_name:
            logger.warning("EntityFetchSkill: 未找到实体名称")
            return new_state
        
        # 直接从传入数据中提取
        new_state["main_wiki_entity"] = {
            "id": state.get("entity_id") or 0,
            "entity_type": state.get("entity_type") or "general",
            "std_name": entity_name,
            "alias": entity_alias or "",
            "summary": entity_summary or ""
        }
        logger.info(f"EntityFetchSkill: 提取实体信息 {entity_name}")
        
        return new_state

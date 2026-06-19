from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from loguru import logger


class RelationFetchSkill(BaseSkill):
    """
    关联实体信息提取 Skill
    
    用途: 从传入数据中提取关联实体信息
    
    输入: related_entity_names (后端已传入)
    输出: related_wiki_list
    """
    
    @property
    def name(self) -> str:
        return "relation_fetch"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "从传入数据中提取关联实体信息",
            "input_fields": ["related_entity_names"],
            "output_fields": ["related_wiki_list"],
            "category": "retrieval"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行关联实体信息提取（纯函数模式）"""
        new_state = {**state}
        
        # 后端已经把关联实体信息传入，直接提取
        related_entity_names = state.get("related_entity_names", [])
        related_wiki_list = []
        
        for name in related_entity_names:
            related_wiki_list.append({
                "std_name": name,
                "relation": "相关"
            })
        
        new_state["related_wiki_list"] = related_wiki_list
        logger.info(f"RelationFetchSkill: 提取 {len(related_wiki_list)} 个关联实体")
        
        return new_state

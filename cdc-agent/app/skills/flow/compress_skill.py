from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.core.llm import LLMClient
from app.prompts.compress import COMPRESS_LOSSLESS_PROMPT, COMPRESS_SEMANTIC_PROMPT
from loguru import logger


class CompressSkill(BaseSkill):
    """
    输入压缩 Skill
    
    用途: 压缩用户输入，减少 token 消耗
    
    输入: user_text
    输出: user_text (压缩后)
    """
    
    def __init__(self):
        self.llm = self.get_llm()
    
    @property
    def name(self) -> str:
        return "compress"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "压缩用户输入，减少 token 消耗",
            "input_fields": ["user_text"],
            "output_fields": ["user_text"],
            "category": "parsing"
        }
    
    async def execute(self, state: Dict[str, Any], compress_type: str = "semantic") -> Dict[str, Any]:
        """执行输入压缩（纯函数模式）"""
        new_state = {**state}
        
        content = state.get("user_text", "")
        if not content:
            return new_state
        
        if compress_type == "lossless":
            prompt = COMPRESS_LOSSLESS_PROMPT.format(content=content)
        else:
            prompt = COMPRESS_SEMANTIC_PROMPT.format(content=content)
        
        messages = [{"role": "user", "content": prompt}]
        response = await self.llm.chat(messages)
        new_state["user_text"] = response
        logger.info(f"CompressSkill: {compress_type}压缩完成")
        
        return new_state

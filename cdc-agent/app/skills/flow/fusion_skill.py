from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.core.llm import LLMClient
from app.prompts.fusion_generate import FUSION_GENERATE_PROMPT
from loguru import logger


class FusionGenerateSkill(BaseSkill):
    """
    内容融合 Skill
    
    用途: 基于大纲和知识生成完整初稿
    
    输入: article_outline, entity_name, population_name, scene_name, template_*, top_k_segment_list, wiki_rule
    输出: initial_draft
    """
    
    def __init__(self):
        self.llm = self.get_llm()
    
    @property
    def name(self) -> str:
        return "fusion_generate"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "基于大纲和知识生成完整初稿",
            "input_fields": ["article_outline", "entity_name", "population_name", "scene_name", "template_*", "top_k_segment_list", "wiki_rule"],
            "output_fields": ["initial_draft"],
            "category": "generation"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行内容融合（纯函数模式）"""
        # 创建新状态，不修改原 state
        new_state = {**state}
        
        template = state.get("match_template", {})
        wiki_rule = state.get("wiki_rule", {})
        segments = state.get("top_k_segment_list", [])
        outline = state.get("article_outline", "")
        
        entity_name = state.get("parsed_entity_name") or state.get("entity_name", "")
        population_name = state.get("parsed_population_name") or state.get("population_name", "")
        scene_name = state.get("parsed_scene_name") or state.get("scene_name", "")
        word_count = state.get("word_count", 800)
        
        template_name = state.get("template_name", "") or template.get("template_name", "")
        template_tone = state.get("template_tone", "专业、温和、通俗易懂") or template.get("template_tone", "专业、温和、通俗易懂")
        
        must_include = state.get("must_include", []) or (wiki_rule.get("must_include", []) if wiki_rule else [])
        must_not_say = state.get("must_not_say", []) or (wiki_rule.get("must_not_say", []) if wiki_rule else [])
        
        if state.get("wiki_segments", []):
            wiki_segments = state.get("wiki_segments", [])
            segment_content = "\n".join([f"[知识{i+1}] {s}" for i, s in enumerate(wiki_segments)]) if wiki_segments else "无权威片段，请基于一般知识生成"
        else:
            segment_content = "\n".join([f"[知识{i+1}] {s.get('content', '')}" for i, s in enumerate(segments)]) if segments else "无权威片段，请基于一般知识生成"
        
        prompt = FUSION_GENERATE_PROMPT.format(
            article_outline=outline,
            template_name=template_name,
            template_tone=template_tone,
            word_count=word_count,
            segment_content=segment_content,
            entity_name=entity_name,
            population_name=population_name,
            scene_name=scene_name,
            must_include_points="\n".join(must_include) if must_include else "无",
            must_not_say_points="\n".join(must_not_say) if must_not_say else "无"
        )
        
        messages = [{"role": "user", "content": prompt}]
        response = await self.llm.chat(messages)
        new_state["initial_draft"] = response
        logger.info("FusionGenerateSkill: 初稿生成成功")
        
        return new_state

from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.core.llm import LLMClient
from app.prompts.outline_generate import OUTLINE_GENERATE_PROMPT
from loguru import logger


class OutlineGenerateSkill(BaseSkill):
    """
    大纲生成 Skill
    
    用途: 基于模板和知识生成文章大纲
    
    输入: entity_name, population_name, scene_name, template_*, top_k_segment_list, wiki_rule
    输出: article_outline
    """
    
    def __init__(self):
        self.llm = self.get_llm()
    
    @property
    def name(self) -> str:
        return "outline_generate"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "基于模板和知识生成文章大纲",
            "input_fields": ["entity_name", "population_name", "scene_name", "template_*", "top_k_segment_list", "wiki_rule"],
            "output_fields": ["article_outline"],
            "category": "generation"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行大纲生成（纯函数模式）"""
        # 创建新状态，不修改原 state
        new_state = {**state}

        # 优先使用节点层动态组装的 prompt（含 Skill 多层级知识注入）
        dynamic_prompt = state.get("_dynamic_prompt", "")
        if dynamic_prompt:
            prompt = dynamic_prompt
            logger.debug("OutlineGenerateSkill: 使用 _dynamic_prompt（动态组装）")
        else:
            # 回退：使用固定模板（向后兼容）
            template = state.get("match_template", {})
            wiki_rule = state.get("wiki_rule", {})
            segments = state.get("top_k_segment_list", [])

            entity_name = state.get("parsed_entity_name") or state.get("entity_name", "")
            population_name = state.get("parsed_population_name") or state.get("population_name", "")
            scene_name = state.get("parsed_scene_name") or state.get("scene_name", "")

            template_name = state.get("template_name", "") or template.get("template_name", "")
            template_purpose = state.get("template_purpose", "") or template.get("template_purpose", "")
            template_tone = state.get("template_tone", "专业、温和、通俗易懂") or template.get("template_tone", "专业、温和、通俗易懂")
            template_outline = state.get("template_outline", "") or template.get("template_outline", "")

            must_include = state.get("must_include", []) or (wiki_rule.get("must_include", []) if wiki_rule else [])
            must_not_say = state.get("must_not_say", []) or (wiki_rule.get("must_not_say", []) if wiki_rule else [])

            if state.get("wiki_segments", []):
                wiki_segments = state.get("wiki_segments", [])
                segment_content = "\n".join([f"- {s}" for s in wiki_segments[:10]]) if wiki_segments else "无"
            else:
                segment_content = "\n".join([f"- {s.get('content', '')}" for s in segments[:10]]) if segments else "无"

            prompt = OUTLINE_GENERATE_PROMPT.format(
                template_name=template_name,
                template_purpose=template_purpose,
                template_outline=template_outline,
                entity_name=entity_name,
                population_name=population_name,
                scene_name=scene_name,
                must_include_points="\n".join(must_include) if must_include else "无",
                must_not_say_points="\n".join(must_not_say) if must_not_say else "无",
                segment_content=segment_content,
                template_tone=template_tone
            )
            logger.debug("OutlineGenerateSkill: 使用固定模板（回退模式）")

        messages = [{"role": "user", "content": prompt}]
        stream_callback = state.get("_stream_callback")
        if stream_callback:
            chunks = []
            async for delta in self.llm.chat_stream(messages):
                chunks.append(delta)
                await stream_callback(delta)
            response = "".join(chunks)
        else:
            response = await self.llm.chat(messages)
        new_state["article_outline"] = response
        logger.info("OutlineGenerateSkill: 大纲生成成功")

        return new_state

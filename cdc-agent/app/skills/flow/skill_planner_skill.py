import json
from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.skills.writing.skill_loader import get_skill_loader
from app.utils import extract_json
from loguru import logger


class SkillPlannerSkill(BaseSkill):
    """
    写作技法规划 Skill

    用途: 根据实体类型、用户输入等信息，分类文章类型、选择受众画像、
          挑选写作技法，并预加载对应的蓝图、画像、技法卡片和质量基准内容。

    输入: entity_type, entity_name, population_name, scene_name, user_text,
          must_include, must_not_say
    输出: skill_plan (dict)
    """

    def __init__(self):
        self.llm = self.get_llm()

    @property
    def name(self) -> str:
        return "skill_planner"

    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "根据实体和用户输入，规划文章类型、受众画像和写作技法",
            "input_fields": [
                "entity_type", "entity_name", "population_name",
                "scene_name", "user_text", "must_include", "must_not_say"
            ],
            "output_fields": ["skill_plan"],
            "category": "parsing",
            "llm_config_type": "text_generation"
        }

    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行写作技法规划（纯函数模式）"""
        new_state = {**state}

        loader = get_skill_loader()
        index = loader.get_index()

        # 提取输入字段
        entity_type = state.get("entity_type", "")
        entity_name = state.get("entity_name", "") or state.get("parsed_entity_name", "")
        population_name = state.get("population_name", "") or state.get("parsed_population_name", "")
        scene_name = state.get("scene_name", "") or state.get("parsed_scene_name", "")
        user_text = state.get("user_text", "")
        must_include = state.get("must_include", [])
        must_not_say = state.get("must_not_say", [])

        # 构建可用文章类型描述
        article_types = index.get("article_types", {})
        type_descriptions = []
        for type_key, type_cfg in article_types.items():
            display = type_cfg.get("display_name", type_key)
            keywords = ", ".join(type_cfg.get("match_keywords", []))
            etypes = ", ".join(type_cfg.get("entity_types", []))
            type_descriptions.append(
                f"- {type_key} ({display}): 关键词=[{keywords}], 适用实体类型=[{etypes}]"
            )
        type_list_str = "\n".join(type_descriptions)

        # 构建可用受众描述
        audiences = index.get("audience_profiles", {})
        audience_list = ", ".join(audiences.keys())

        # 构建可用技法描述
        techniques = index.get("technique_cards", {})
        technique_list = ", ".join(techniques.keys())

        prompt = f"""你是一个 CDC 公众号科普文章的写作策划专家。
请根据以下信息，为这篇文章选择最合适的写作方案。

## 基本信息
- 实体类型: {entity_type}
- 实体名称: {entity_name}
- 目标人群: {population_name}
- 使用场景: {scene_name}
- 用户原始需求: {user_text}
- 必须包含的要点: {", ".join(must_include) if must_include else "无"}
- 禁止提及的内容: {", ".join(must_not_say) if must_not_say else "无"}

## 可选文章类型
{type_list_str}

## 可选受众画像
{audience_list}

## 可选写作技法（最多选 5 个，按优先级排列）
{technique_list}

## 要求
1. 选择最匹配的文章类型（article_type）
2. 选择最合适的受众画像（audience），如果目标人群明确则优先匹配
3. 选择最多 5 个写作技法（techniques），按使用优先级排列
4. 简要说明每个技法的使用计划（technique_plan）
5. 如果有特殊注意事项，写在 special_notes 中

请严格以 JSON 格式返回，不要包含其他内容：
```json
{{
    "article_type": "类型代码",
    "article_type_reason": "选择该类型的理由",
    "audience": "受众代码",
    "audience_reason": "选择该受众的理由",
    "techniques": ["技法1", "技法2", ...],
    "technique_plan": "技法使用计划说明",
    "special_notes": "特殊注意事项"
}}
```"""

        messages = [{"role": "user", "content": prompt}]

        try:
            response = await self.llm.chat(messages)
            cleaned = extract_json(response)
            plan_data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"SkillPlannerSkill: JSON 解析失败 {e}")
            logger.debug(f"SkillPlannerSkill: 原始返回内容: {response[:300]}")
            # 降级: 使用默认值
            default_type = list(article_types.keys())[0] if article_types else "disease_explainer"
            default_audience = article_types.get(default_type, {}).get("default_audience", "general_public")
            plan_data = {
                "article_type": default_type,
                "article_type_reason": "JSON 解析失败，使用默认类型",
                "audience": default_audience,
                "audience_reason": "JSON 解析失败，使用默认受众",
                "techniques": [],
                "technique_plan": "",
                "special_notes": ""
            }

        # 从 plan_data 中提取分类结果
        article_type = plan_data.get("article_type", "disease_explainer")
        audience = plan_data.get("audience", "general_public")
        technique_codes = plan_data.get("techniques", [])

        # 验证 article_type 是否在索引中，否则降级
        if article_type not in article_types:
            logger.warning(f"SkillPlannerSkill: 未知文章类型 {article_type}，降级为默认")
            article_type = list(article_types.keys())[0] if article_types else "disease_explainer"
            plan_data["article_type"] = article_type

        # 验证 audience 是否在索引中
        if audience not in audiences:
            logger.warning(f"SkillPlannerSkill: 未知受众 {audience}，降级为 general_public")
            audience = "general_public"
            plan_data["audience"] = audience

        # 预加载 Layer 2-5 内容
        blueprint_content = loader.get_blueprint(article_type)
        audience_content = loader.get_audience_profile(audience)
        techniques_content = loader.get_techniques(technique_codes)
        quality_benchmark = loader.get_quality_benchmark(article_type)

        # 构建完整的 skill_plan
        skill_plan = {
            "article_type": article_type,
            "article_type_reason": plan_data.get("article_type_reason", ""),
            "audience": audience,
            "audience_reason": plan_data.get("audience_reason", ""),
            "techniques": technique_codes,
            "technique_plan": plan_data.get("technique_plan", ""),
            "special_notes": plan_data.get("special_notes", ""),
            # 预加载内容
            "blueprint_content": blueprint_content,
            "audience_content": audience_content,
            "techniques_content": techniques_content,
            "quality_benchmark": quality_benchmark
        }

        new_state["skill_plan"] = skill_plan
        logger.info(
            f"SkillPlannerSkill: 规划完成 - "
            f"type={article_type}, audience={audience}, "
            f"techniques={technique_codes}"
        )

        return new_state

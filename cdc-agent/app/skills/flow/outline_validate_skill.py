import json
from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.skills.writing.skill_loader import get_skill_loader
from app.utils import extract_json
from loguru import logger


class OutlineValidateSkill(BaseSkill):
    """
    大纲校验 Skill

    用途: 在大纲生成后、初稿撰写前，检查大纲质量——
          是否覆盖所有 must_include 要点、是否包含蓝图要求的必要章节、
          章节顺序是否合理、子节是否充分。

    输入: article_outline, must_include, must_not_say, entity_name,
          entity_type, skill_plan
    输出: outline_valid (bool), outline_feedback (str)
    """

    def __init__(self):
        self.llm = self.get_llm()

    @property
    def name(self) -> str:
        return "outline_validate"

    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "校验文章大纲是否覆盖必要要点、是否符合蓝图结构要求",
            "input_fields": [
                "article_outline", "must_include", "must_not_say",
                "entity_name", "entity_type", "skill_plan"
            ],
            "output_fields": ["outline_valid", "outline_feedback"],
            "category": "validation",
            "llm_config_type": "text_generation"
        }

    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行大纲校验（纯函数模式）"""
        new_state = {**state}

        article_outline = state.get("article_outline", "")
        must_include = state.get("must_include", [])
        must_not_say = state.get("must_not_say", [])
        entity_name = state.get("entity_name", "") or state.get("parsed_entity_name", "")
        entity_type = state.get("entity_type", "")
        skill_plan = state.get("skill_plan", {})

        if not article_outline:
            logger.warning("OutlineValidateSkill: 未提供大纲内容，跳过校验")
            new_state["outline_valid"] = True
            new_state["outline_feedback"] = ""
            return new_state

        # 获取质量基准和蓝图信息
        quality_benchmark = skill_plan.get("quality_benchmark", "")
        blueprint_content = skill_plan.get("blueprint_content", "")
        article_type = skill_plan.get("article_type", "")

        # 如果 skill_plan 没有提供质量基准，尝试从 loader 获取
        if not quality_benchmark and article_type:
            loader = get_skill_loader()
            quality_benchmark = loader.get_quality_benchmark(article_type)

        # 获取蓝图的必要章节
        required_sections = []
        if article_type:
            loader = get_skill_loader()
            type_config = loader.get_article_type_config(article_type)
            required_sections = type_config.get("required_sections", [])

        prompt = f"""你是一个专业的 CDC 科普文章大纲审核专家。
请仔细审核以下文章大纲，判断其是否满足写作要求。

## 文章主题
- 实体: {entity_name}
- 类型: {entity_type}
- 文章类型: {article_type}

## 待审核大纲
{article_outline}

## 审核标准

### 1. 必须包含的要点
{chr(10).join(f"- {p}" for p in must_include) if must_include else "无特定要求"}

### 2. 蓝图要求的必要章节
{chr(10).join(f"- {s}" for s in required_sections) if required_sections else "无特定要求"}

### 3. 质量基准参考
{quality_benchmark if quality_benchmark else "无"}

## 审核要求
请从以下维度逐项检查：
1. **要点覆盖**: 大纲是否覆盖了所有"必须包含的要点"？哪些缺失？
2. **章节完整性**: 大纲是否包含蓝图要求的所有必要章节？哪些缺失？
3. **逻辑顺序**: 章节排列是否符合"是什么 -> 为什么 -> 怎么办"的认知逻辑？
4. **子节充分性**: 每个主节下是否有足够的子节支撑？
5. **禁止内容**: 大纲中是否有涉及"禁止提及"的内容？

禁止提及的内容: {", ".join(must_not_say) if must_not_say else "无"}

请严格以 JSON 格式返回审核结果：
```json
{{
    "outline_valid": true/false,
    "outline_feedback": "详细反馈意见",
    "missing_sections": ["缺失的章节或要点1", "缺失的章节或要点2"]
}}
```

注意：
- 如果所有必要章节和要点都已覆盖，outline_valid 为 true
- 如果有 2 个以上关键缺失，outline_valid 为 false
- outline_feedback 应具体指出问题和改进建议"""

        messages = [{"role": "user", "content": prompt}]

        try:
            response = await self.llm.chat(messages)
            cleaned = extract_json(response)
            result = json.loads(cleaned)
            new_state["outline_valid"] = result.get("outline_valid", True)
            new_state["outline_feedback"] = result.get("outline_feedback", "")
            logger.info(
                f"OutlineValidateSkill: 校验完成 - "
                f"valid={new_state['outline_valid']}"
            )
        except json.JSONDecodeError as e:
            logger.error(f"OutlineValidateSkill: JSON 解析失败 {e}")
            logger.debug(f"OutlineValidateSkill: 原始返回内容: {response[:300]}")
            # 解析失败时默认通过，避免阻塞流程
            new_state["outline_valid"] = True
            new_state["outline_feedback"] = ""

        return new_state

import json
from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.skills.writing.skill_loader import get_skill_loader
from app.utils import extract_json
from loguru import logger


class StyleCheckSkill(BaseSkill):
    """
    风格检查 Skill

    用途: 检查初稿的可读性和平台合规性——段落长度、开头吸引力、
          数据呈现方式、视觉锚点分布、语气一致性、微信公众号排版规范。

    输入: initial_draft, skill_plan, word_count
    输出: style_score (float 0-1), style_report (str)
    """

    def __init__(self):
        self.llm = self.get_llm()

    @property
    def name(self) -> str:
        return "style_check"

    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "检查初稿的可读性和微信公众号排版合规性",
            "input_fields": ["initial_draft", "skill_plan", "word_count"],
            "output_fields": ["style_score", "style_report"],
            "category": "validation",
            "llm_config_type": "text_generation"
        }

    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行风格检查（纯函数模式）"""
        new_state = {**state}

        draft = state.get("initial_draft", "")
        skill_plan = state.get("skill_plan", {})
        word_count = state.get("word_count", 0)

        if not draft:
            logger.warning("StyleCheckSkill: 未提供初稿内容")
            new_state["style_score"] = 0.8
            new_state["style_report"] = "未提供初稿内容，跳过风格检查"
            return new_state

        # 获取质量基准
        article_type = skill_plan.get("article_type", "")
        quality_benchmark = skill_plan.get("quality_benchmark", "")
        audience = skill_plan.get("audience", "")
        audience_content = skill_plan.get("audience_content", "")

        if not quality_benchmark and article_type:
            loader = get_skill_loader()
            quality_benchmark = loader.get_quality_benchmark(article_type)

        prompt = f"""你是一个资深的微信公众号内容编辑和 CDC 科普文章审稿专家。
请对以下科普文章初稿进行风格和可读性评估。

## 文章基本信息
- 文章类型: {article_type}
- 目标受众: {audience}
- 目标字数: {word_count}

## 待评估文章
{draft}

## 质量基准参考
{quality_benchmark if quality_benchmark else "无"}

## 受众画像参考
{audience_content if audience_content else "无"}

## 评估维度
请从以下 6 个维度逐项评分（每项 0-10 分）并给出具体反馈：

### 1. 段落长度 (paragraph_length)
- 移动端阅读最佳段落长度: 2-4 行
- 是否有超长段落（超过 5 行）需要拆分？

### 2. 开头吸引力 (opening_hook)
- 前 2 句话是否形成了有效的阅读钩子（hook）？
- 是否能吸引读者继续往下读？

### 3. 数据呈现 (data_presentation)
- 数据是否已转化为普通读者能理解的表达方式？
- 是否使用了类比、对比等手法让数据更直观？

### 4. 视觉锚点分布 (visual_anchors)
- 小标题、加粗、列表等视觉锚点是否分布合理？
- 读者快速浏览时能否抓住关键信息？

### 5. 语气一致性 (tone_consistency)
- 全文语气是否与目标受众匹配？
- 是否存在语气突然转变的段落？

### 6. 微信排版合规 (wechat_formatting)
- 是否符合微信公众号排版规范？
- 段落间距、标题层级、emoji使用是否恰当？

请严格以 JSON 格式返回评估结果：
```json
{{
    "style_score": 0.0-1.0,
    "style_report": "综合评估报告，包含各维度得分和改进建议",
    "issues": [
        {{"dimension": "维度名", "score": 8, "feedback": "具体反馈"}},
        ...
    ]
}}
```

注意:
- style_score 是 0-1 之间的综合得分（1.0 为满分）
- style_report 应包含具体的、可操作的改进建议
- 如果文章整体良好，也请指出亮点"""

        messages = [{"role": "user", "content": prompt}]

        try:
            response = await self.llm.chat(messages)
            cleaned = extract_json(response)
            result = json.loads(cleaned)
            new_state["style_score"] = float(result.get("style_score", 0.8))
            new_state["style_report"] = result.get("style_report", "")
            logger.info(
                f"StyleCheckSkill: 检查完成 - "
                f"score={new_state['style_score']}"
            )
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.error(f"StyleCheckSkill: JSON 解析失败 {e}")
            logger.debug(f"StyleCheckSkill: 原始返回内容: {response[:300]}")
            new_state["style_score"] = 0.8
            new_state["style_report"] = ""

        return new_state

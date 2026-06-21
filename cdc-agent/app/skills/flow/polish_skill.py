from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from loguru import logger


class PolishSkill(BaseSkill):
    """
    润色 Skill

    用途: 对初稿进行文笔润色——平滑段落过渡、消除冗余表达、
          统一全文语气、修正生硬措辞——但不改变任何事实内容、数据或引用。

    输入: initial_draft, skill_plan, entity_name
    输出: initial_draft (润色后的版本)
    """

    def __init__(self):
        self.llm = self.get_llm()

    @property
    def name(self) -> str:
        return "polish"

    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "润色文章风格，平滑过渡、消除冗余、统一语气，不改变事实内容",
            "input_fields": ["initial_draft", "skill_plan", "entity_name"],
            "output_fields": ["initial_draft"],
            "category": "generation",
            "llm_config_type": "text_generation"
        }

    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行文笔润色（纯函数模式）"""
        new_state = {**state}

        draft = state.get("initial_draft", "")
        skill_plan = state.get("skill_plan", {})
        entity_name = state.get("entity_name", "") or state.get("parsed_entity_name", "")

        if not draft:
            logger.warning("PolishSkill: 未提供初稿内容，跳过润色")
            return new_state

        audience = skill_plan.get("audience", "general_public")
        audience_content = skill_plan.get("audience_content", "")
        article_type = skill_plan.get("article_type", "")

        prompt = f"""你是一个资深的 CDC 公众号科普文章编辑。
请对以下科普文章进行文笔润色，使其更加流畅、专业、易读。

## 文章主题
{entity_name}

## 目标受众
{audience}

## 受众画像参考
{audience_content if audience_content else "无"}

## 待润色文章
{draft}

## 润色要求

### 必须做的:
1. **平滑段落过渡**: 确保段落之间有自然的衔接，使用恰当的过渡词或过渡句
2. **消除冗余表达**: 删除重复的词语、句子或段落，精简啰嗦的表达
3. **统一全文语气**: 确保全文语气一致，符合目标受众的阅读习惯
4. **修正生硬措辞**: 将不自然、生硬的表达替换为更流畅的说法
5. **优化句式变化**: 避免连续使用相同的句式结构，适当变换长短句搭配

### 绝对禁止:
1. **不得改变任何事实内容**: 所有数据、统计数字、医学信息必须原封不动保留
2. **不得改变任何引用**: 所有 {ref:N} 格式的引用标记必须完整保留在原位置
3. **不得增删章节**: 不得添加新的章节或删除已有的章节
4. **不得改变核心语义**: 润色只改变表达方式，不改变任何信息含义

请直接返回润色后的完整文章，不要添加任何说明文字、标记或注释。"""

        messages = [{"role": "user", "content": prompt}]

        response = await self.llm.chat(messages)
        new_state["initial_draft"] = response
        logger.info("PolishSkill: 润色完成")

        return new_state

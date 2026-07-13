import json
from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.utils import extract_json
from loguru import logger


class RuleReflectSkill(BaseSkill):
    """
    规则修正 Skill

    用途: 当 rule_check 发现违规（缺少 must_include 要点 / 包含 must_not_say 内容）时，
          由 LLM 对文章进行定向修正——补充缺失要点、删除/改写违规内容。

    输入: initial_draft, rule_check_report (JSON 字符串), must_include,
          must_not_say, top_k_segment_list
    输出: initial_draft (修正后的版本), rule_passed (True)
    """

    def __init__(self):
        self.llm = self.get_llm()

    @property
    def name(self) -> str:
        return "rule_reflect"

    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "根据规则检查报告修正文章：补充缺失要点、删除违规内容",
            "input_fields": [
                "initial_draft", "rule_check_report",
                "must_include", "must_not_say", "top_k_segment_list"
            ],
            "output_fields": ["initial_draft", "rule_passed"],
            "category": "iteration",
            "llm_config_type": "text_generation"
        }

    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """执行规则修正（纯函数模式）"""
        new_state = {**state}

        draft = state.get("initial_draft", "")
        rule_check_report = state.get("rule_check_report", "")
        must_include = state.get("must_include", [])
        must_not_say = state.get("must_not_say", [])
        segments = state.get("top_k_segment_list", [])

        if not draft:
            logger.warning("RuleReflectSkill: 未提供初稿内容")
            new_state["rule_passed"] = True
            return new_state

        # 解析 rule_check_report
        missing_points = []
        violated_rules = []
        if rule_check_report:
            try:
                report_str = extract_json(rule_check_report)
                report_data = json.loads(report_str)
                missing_points = report_data.get("missing_points", [])
                violated_rules = report_data.get("violated_rules", [])
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(f"RuleReflectSkill: 规则报告解析失败 {e}")
                # 如果 report 是纯文本，直接作为反馈使用
                missing_points = []
                violated_rules = []

        # 构建权威片段参考
        segment_content = ""
        if segments:
            segment_lines = []
            for i, s in enumerate(segments[:10], 1):
                content = s.get("content", "") if hasattr(s, 'get') else str(s)
                segment_lines.append(f"[片段{i}] {content}")
            segment_content = "\n".join(segment_lines)

        # 构建修正指令
        fix_instructions = []

        if missing_points:
            missing_list = "\n".join(f"  - {p}" for p in missing_points)
            fix_instructions.append(
                f"### 需要补充的要点\n以下内容在文章中缺失，请根据权威片段补充到合适的位置：\n{missing_list}"
            )

        if violated_rules:
            violated_list = "\n".join(f"  - {r}" for r in violated_rules)
            fix_instructions.append(
                f"### 需要修正的违规内容\n以下禁止提及的内容出现在了文章中，请删除或改写相关句子：\n{violated_list}"
            )

        if not fix_instructions:
            # 没有具体的解析结果，让 LLM 自行对照检查
            fix_instructions.append(
                "### 修正要求\n请对照下方的 must_include 和 must_not_say 列表，"
                "自行检查文章并做出相应修正。"
            )

        fix_section = "\n\n".join(fix_instructions)

        prompt = f"""你是一个 CDC 公众号科普文章的内容修正专家。
请根据规则检查报告，对以下文章进行定向修正。

## 待修正文章
{draft}

## 修正指令
{fix_section}

## 必须包含的要点 (must_include)
{chr(10).join(f"- {p}" for p in must_include) if must_include else "无"}

## 禁止提及的内容 (must_not_say)
{chr(10).join(f"- {p}" for p in must_not_say) if must_not_say else "无"}

## 权威参考片段
{segment_content if segment_content else "无"}

## 修正原则

### 补充要点时:
1. 优先使用权威片段中的内容来补充缺失要点
2. 将补充内容自然融入文章，放在最合适的章节位置
3. 补充内容要与上下文风格一致
4. 如有引用来源，添加对应的 {{ref:N}} 标记

### 删除/改写违规内容时:
1. 精准定位包含违规内容的句子
2. 可以整句删除，也可以改写为不含违规表述的句子
3. 改写时要保持上下文衔接自然
4. 不要误删与违规句子相邻的正常内容

### 通用要求:
1. **保留所有 {{ref:N}} 引用标记**，不要改变其位置或格式
2. **不改变文章的其他内容**，只修正上述指令指出的问题
3. **保持文章的整体结构和章节划分不变**

请直接返回修正后的完整文章，不要添加任何说明文字。"""

        messages = [{"role": "user", "content": prompt}]

        response = await self.llm.chat(messages)
        new_state["initial_draft"] = response
        new_state["rule_passed"] = True
        logger.info("RuleReflectSkill: 规则修正完成")

        return new_state

import json
from typing import Dict, Any
from app.skills.base import BaseSkill, SkillMetadata
from app.core.llm import LLMClient
from loguru import logger


class SectionAnalyzeSkill(BaseSkill):
    """
    段落分析 Skill
    
    用途: 分析生成的文章内容，识别需要配图的段落
    输入: initial_draft, article_outline, entity_name
    输出: article_sections (段落列表，标注 needs_image)
    """
    
    def __init__(self):
        self.llm = self.get_llm()
    
    @property
    def name(self) -> str:
        return "section_analyze"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "分析文章内容，识别需要配图的段落",
            "input_fields": ["initial_draft", "article_outline", "entity_name"],
            "output_fields": ["article_sections"],
            "category": "parsing"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        new_state = {**state}
        
        draft = state.get("initial_draft", "")
        outline = state.get("article_outline", "")
        entity_name = state.get("entity_name", "")
        
        if not draft:
            new_state["article_sections"] = []
            return new_state
        
        # 使用 LLM 分析哪些段落需要配图
        prompt = self._build_prompt(draft, outline, entity_name)
        messages = [{"role": "user", "content": prompt}]
        
        try:
            response = await self.llm.chat(messages)
            sections = self._parse_json(response)
            
            if not isinstance(sections, list):
                logger.warning(f"SectionAnalyzeSkill: LLM 返回非数组格式, type={type(sections).__name__}")
                sections = []
            
            new_state["article_sections"] = sections
            logger.info(f"SectionAnalyzeSkill: 识别出 {sum(1 for s in sections if s.get('needs_image'))} 个需要配图的段落 (共 {len(sections)} 个)")
            
        except Exception as e:
            logger.error(f"SectionAnalyzeSkill: 段落分析失败: {e}")
            new_state["article_sections"] = []
        
        return new_state
    
    def _parse_json(self, text: str) -> list:
        """
        从 LLM 响应中提取 JSON 数组。
        
        兼容以下常见格式：
        - 纯 JSON: [{...}, {...}]
        - Markdown 代码块: ```json\n[{...}]\n```
        - 前后有多余文字: "以下是分析结果：\n[{...}]\n希望对你有帮助"
        """
        if not text:
            return []
        
        cleaned = text.strip()
        
        # 去掉 markdown 代码块包裹
        if '```' in cleaned:
            # 提取 ``` 之间的内容
            parts = cleaned.split('```')
            for part in parts:
                part = part.strip()
                # 跳过 "json" 语言标记
                if part.startswith('json'):
                    part = part[4:].strip()
                if part.startswith('['):
                    cleaned = part
                    break
        
        # 尝试直接解析
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        
        # 尝试提取第一个 [ ... ] 块
        start = cleaned.find('[')
        end = cleaned.rfind(']')
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start:end + 1])
            except json.JSONDecodeError:
                pass
        
        logger.warning(f"SectionAnalyzeSkill: 无法从 LLM 响应中解析 JSON, 前200字符: {cleaned[:200]}")
        return []

    def _build_prompt(self, draft: str, outline: str, entity_name: str) -> str:
        return f"""分析以下健康科普文章，判断哪些段落适合配图。

文章主题：{entity_name}
文章大纲：{outline[:500] if outline else '无'}

文章内容：
{draft[:3000]}

请分析每个主要段落/章节，返回 JSON 数组格式：
[
  {{
    "index": 0,
    "title": "段落标题",
    "content": "段落摘要（50字内）",
    "needs_image": true/false,
    "reason": "需要/不需要配图的原因"
  }}
]

规则：
1. 标题、摘要、结尾段落通常不需要配图
2. 解释疾病症状、传播途径、预防措施、治疗方法的段落适合配图
3. 数据密集型段落（如统计数字）不适合配图
4. 一篇文章只需要 1 张配图（公众号推文篇幅短，一张封面级配图即可）
5. 选择最核心、最有视觉表现力的段落标注为需要配图

只返回 JSON 数组，不要其他文字。"""

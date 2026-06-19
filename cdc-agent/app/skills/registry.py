from typing import Dict, List, Optional
from loguru import logger
from app.skills.base import BaseSkill, SkillMetadata
from app.skills.flow.intent_parse_skill import IntentParseSkill
from app.skills.flow.compress_skill import CompressSkill
from app.skills.flow.template_extract_skill import TemplateExtractSkill
from app.skills.flow.outline_skill import OutlineGenerateSkill
from app.skills.flow.fusion_skill import FusionGenerateSkill
from app.skills.flow.fact_check_skill import FactCheckSkill
from app.skills.flow.rule_check_skill import RuleCheckSkill
from app.skills.flow.reflect_skill import ReflectIterateSkill
from app.skills.flow.section_analyze_skill import SectionAnalyzeSkill
from app.skills.flow.image_generate_skill import ImageGenerateSkill
from app.skills.wiki.entity_fetch_skill import EntityFetchSkill
from app.skills.wiki.relation_fetch_skill import RelationFetchSkill


class SkillRegistry:
    """
    技能注册表 - 12个技能标准化管理
    
    设计原则:
    1. 职责单一 - 每个 Skill 只做一件事
    2. 纯函数 - 不修改原 state，返回新 state
    3. 标准化 - 统一的元信息格式
    4. 可追溯 - 每个 Skill 有明确的输入输出定义
    
    分类:
    - parsing: 解析类 (intent_parse, compress)
    - retrieval: 检索类 (entity_fetch, relation_fetch, template_extract)
    - generation: 生成类 (outline_generate, fusion_generate)
    - validation: 验证类 (fact_check, rule_check)
    - iteration: 迭代类 (reflect_iterate)
    """
    
    _skills: Dict[str, BaseSkill] = {}
    _initialized: bool = False
    
    @classmethod
    def register(cls, skill: BaseSkill):
        """注册 Skill"""
        cls._skills[skill.name] = skill
    
    @classmethod
    def get_skill(cls, name: str) -> BaseSkill:
        """获取 Skill"""
        if not cls._initialized:
            cls._init_skills()
        return cls._skills.get(name)
    
    @classmethod
    def _init_skills(cls):
        """初始化所有 Skills"""
        if cls._initialized:
            return
        
        # 输入处理
        cls.register(IntentParseSkill())        # 1. 意图解析
        cls.register(CompressSkill())          # 2. 输入压缩
        
        # 数据提取
        cls.register(EntityFetchSkill())          # 3. 实体信息提取
        cls.register(RelationFetchSkill())       # 4. 关联实体信息提取
        cls.register(TemplateExtractSkill())     # 5. 模板信息提取
        
        # 内容生成
        cls.register(OutlineGenerateSkill())    # 6. 大纲生成
        cls.register(FusionGenerateSkill())      # 7. 内容融合
        
        # 质量控制
        cls.register(FactCheckSkill())          # 8. 事实核查
        cls.register(RuleCheckSkill())           # 9. 规则检查
        cls.register(ReflectIterateSkill())      # 10. 反思迭代
        
        # 配图生成
        cls.register(SectionAnalyzeSkill())      # 11. 段落分析（识别需要配图的段落）
        cls.register(ImageGenerateSkill())       # 12. 配图生成（SenseNova U1 Lite）
        
        cls._initialized = True
    
    @classmethod
    def list_skills(cls) -> List[str]:
        """列出所有 Skills"""
        if not cls._initialized:
            cls._init_skills()
        return list(cls._skills.keys())
    
    @classmethod
    def get_skill_info(cls, name: str) -> Optional[SkillMetadata]:
        """获取 Skill 元信息"""
        skill = cls.get_skill(name)
        if skill:
            return skill.metadata
        return None
    
    @classmethod
    def list_by_category(cls, category: str) -> List[BaseSkill]:
        """按分类获取 Skills"""
        if not cls._initialized:
            cls._init_skills()
        
        result = []
        for skill in cls._skills.values():
            if skill.metadata.get("category") == category:
                result.append(skill)
        return result
    
    @classmethod
    def get_all_metadata(cls) -> Dict[str, SkillMetadata]:
        """获取所有 Skills 的元信息"""
        if not cls._initialized:
            cls._init_skills()
        
        return {
            name: skill.metadata 
            for name, skill in cls._skills.items()
        }
    


from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from typing_extensions import TypedDict


class SkillMetadata(TypedDict, total=False):
    """Skill 元信息定义"""
    description: str           # Skill 用途说明
    input_fields: List[str]    # 输入字段列表
    output_fields: List[str]  # 输出字段列表
    category: str             # 分类: parsing/retrieval/generation/validation/iteration
    llm_config_type: str      # 关联的 LLM 配置类型


class BaseSkill(ABC):
    """
    Skill 基类 - 所有技能的基础抽象
    
    设计原则:
    1. 职责单一 - 每个 Skill 只做一件事
    2. 纯函数 - 不修改原 state，返回新 state
    3. 标准化 - 统一的输入输出格式
    4. 可测试 - 每个 Skill 可独立运行
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Skill 唯一标识"""
        pass
    
    @property
    @abstractmethod
    def metadata(self) -> SkillMetadata:
        """Skill 元信息"""
        pass
    
    @abstractmethod
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行 Skill
        
        Args:
            state: 输入状态
            
        Returns:
            新状态（不修改原 state）
        """
        pass
    
    def get_llm(self, config_type: str = None):
        """从共享池获取 LLM 客户端"""
        from app.core.llm_pool import get_llm_pool
        ct = config_type or self.metadata.get("llm_config_type", "text_generation")
        return get_llm_pool().get_client(ct)
    
    def _copy_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """创建 state 副本"""
        return {**state}

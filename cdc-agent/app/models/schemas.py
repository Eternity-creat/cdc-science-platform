from pydantic import BaseModel
from typing import Optional, List


class IntentParseResult(BaseModel):
    entity_type: str
    entity_name: str
    population_name: str
    scene_name: str
    word_count: int = 800


class WikiSegmentItem(BaseModel):
    id: int
    entity_id: int
    content: str
    source: Optional[str] = ""
    embedding: Optional[List[float]] = None  # 预计算的向量（来自 wiki_segment_embedding 表）


class AgentRequest(BaseModel):
    article_id: int
    step: str
    mode: int = 1
    
    # 实体信息
    entity_name: Optional[str] = ""
    entity_alias: Optional[str] = ""
    entity_summary: Optional[str] = ""
    
    # 人群和场景
    population_name: Optional[str] = ""
    scene_name: Optional[str] = ""
    
    # 模板信息
    template_name: Optional[str] = ""
    template_purpose: Optional[str] = ""
    template_tone: Optional[str] = ""
    template_outline: Optional[str] = ""
    
    word_count: int = 800
    
    # 关联实体ID列表
    entity_ids: Optional[List[int]] = []
    
    # Wiki知识（后端一次性传入）
    wiki_segments: Optional[List[WikiSegmentItem]] = []
    must_include: Optional[List[str]] = []
    must_not_say: Optional[List[str]] = []
    
    # 之前的内容（大纲或初稿）
    previous_content: Optional[str] = ""
    
    # 自由文本（用于意图解析）
    user_text: Optional[str] = ""


class RetrieveRequest(BaseModel):
    """向量检索请求"""
    entity_name: str
    population_name: Optional[str] = ""
    wiki_segments: List[WikiSegmentItem] = []
    top_k: int = 10


class RetrieveResponse(BaseModel):
    """向量检索响应"""
    top_k_segments: List[dict]
    used_segments: List[dict]


class FactCheckResult(BaseModel):
    is_fact_ok: bool
    errors: list
    ok_count: int
    error_count: int


class RuleCheckResult(BaseModel):
    rule_passed: bool
    missing_points: list
    violated_rules: list

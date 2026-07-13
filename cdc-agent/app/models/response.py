from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class QualityMetrics(BaseModel):
    fact_check_passed: bool = True
    rule_check_passed: bool = True
    retry_count: int = 0
    quality_score: Optional[float] = None

class TraceEntry(BaseModel):
    step_name: str
    status: str  # "success" | "error" | "skipped"
    cost_ms: int = 0
    detail: Optional[str] = None

class AgentResponse(BaseModel):
    """Agent 结构化响应 — 替代原来的纯文本返回"""
    content: str                          # 生成的内容（大纲或初稿）
    images: List[Dict[str, Any]] = []     # 配图列表（预留）
    quality_metrics: Optional[QualityMetrics] = None
    trace: List[TraceEntry] = []
    token_usage: Optional[Dict[str, Any]] = None  # {prompt_tokens, completion_tokens, total_tokens, estimated_cost}
    generation_meta: Optional[Dict[str, Any]] = None  # {model, total_cost_ms}

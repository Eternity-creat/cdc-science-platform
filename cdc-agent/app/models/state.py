"""
CDC Agent - State & Domain Models (Pydantic v2)

Migrated from TypedDict to Pydantic BaseModel for:
- Runtime validation of field types
- Default values (no more Annotated hacks for retry_times)
- Serializable via model_dump() / model_dump_json()

BACKWARD COMPATIBILITY NOTE:
    AgentState implements __getitem__, __setitem__, __contains__, keys(),
    and get() so that existing code using dict-style access continues to work:
        state["field"]           # __getitem__
        state["field"] = value   # __setitem__
        state.get("field", def)  # get()
        "field" in state         # __contains__

    However, skills that use `{**state}` to copy state will get a *shallow dict*
    where nested Pydantic model fields (e.g. wiki_rule, match_template) remain
    as Pydantic model instances rather than dicts.  This is functionally OK
    because those models also support dict-style access, but it is NOT a true
    deep copy.  New code should prefer:
        new_state = state.deep_copy()
    over:
        new_state = {**state}
"""

from __future__ import annotations

from typing import Optional, List, Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Domain sub-models
# ---------------------------------------------------------------------------


class WikiEntity(BaseModel):
    """A single entity from the wiki knowledge base."""

    id: int
    entity_type: str
    std_name: str
    alias: Optional[str] = None
    summary: Optional[str] = None

    def get(self, key: str, default: Any = None) -> Any:
        """Dict-style .get() for backward compatibility."""
        return getattr(self, key, default)


class WikiSegment(BaseModel):
    """A content segment belonging to a wiki entity."""

    id: int
    entity_id: int
    seg_type: Optional[str] = None
    content: str
    source: Optional[str] = None

    def get(self, key: str, default: Any = None) -> Any:
        """Dict-style .get() for backward compatibility."""
        return getattr(self, key, default)


class WikiRule(BaseModel):
    """Content rules (must-include / must-not-say) for an entity."""

    id: Optional[int] = None
    entity_id: Optional[int] = None
    must_include: Optional[List[str]] = None
    must_not_say: Optional[List[str]] = None

    def get(self, key: str, default: Any = None) -> Any:
        """Dict-style .get() for backward compatibility."""
        return getattr(self, key, default)


class ArticleTemplate(BaseModel):
    """Template definition for article generation."""

    id: Optional[int] = None
    template_name: str = ""
    template_code: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[str] = None
    applicable_diseases: Optional[str] = None
    applicable_audiences: Optional[str] = None
    applicable_scenarios: Optional[str] = None

    def get(self, key: str, default: Any = None) -> Any:
        """Dict-style .get() for backward compatibility."""
        return getattr(self, key, default)


class TraceStep(BaseModel):
    """A single step in the workflow execution trace."""

    step_name: str
    status: str
    result_detail: Optional[str] = None
    cost_ms: Optional[int] = None


# ---------------------------------------------------------------------------
# Token usage tracker (state-level, mirrors LLMClient's TokenUsage)
# ---------------------------------------------------------------------------


class TokenUsage(BaseModel):
    """
    Accumulates LLM token usage statistics within a single workflow run.

    This is the state-embedded version; it lives inside AgentState so that
    the workflow can report total usage at the end.
    """

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost: float = 0.0
    request_count: int = 0

    def add_usage(
        self,
        prompt: int,
        completion: int,
        cost_per_1k: float = 0.002,
    ) -> None:
        """
        Accumulate usage from a single LLM call.

        Args:
            prompt: Number of prompt (input) tokens.
            completion: Number of completion (output) tokens.
            cost_per_1k: Estimated cost per 1,000 total tokens (USD).
        """
        self.prompt_tokens += prompt
        self.completion_tokens += completion
        self.total_tokens += prompt + completion
        self.estimated_cost += (prompt + completion) / 1000.0 * cost_per_1k
        self.request_count += 1


# ---------------------------------------------------------------------------
# Agent State (top-level, used by LangGraph StateGraph)
# ---------------------------------------------------------------------------


class AgentState(BaseModel):
    """
    Top-level state object for the CDC Agent workflow.

    Supports dict-style access (__getitem__, __setitem__, get) for backward
    compatibility with existing skills and workflow nodes that were written
    against the old TypedDict version.

    New fields added in this migration:
        - wiki_segments: raw segments passed in from the API request
        - must_include: convenience copy of wiki_rule.must_include
        - must_not_say: convenience copy of wiki_rule.must_not_say
        - token_usage: accumulated LLM token usage for the run
    """

    # -- Core identifiers / mode -------------------------------------------
    mode: int = 0
    step: str = ""
    article_id: int = 0

    # -- User input --------------------------------------------------------
    entity_name: Optional[str] = None
    entity_alias: Optional[str] = None
    population_name: Optional[str] = None
    scene_name: Optional[str] = None
    template_name: Optional[str] = None
    template_purpose: Optional[str] = None
    template_tone: Optional[str] = None
    template_outline: Optional[str] = None
    word_count: Optional[int] = None
    user_text: Optional[str] = None

    # -- Parsed entities ---------------------------------------------------
    entity_type: Optional[str] = None
    parsed_entity_name: Optional[str] = None
    parsed_population_name: Optional[str] = None
    parsed_scene_name: Optional[str] = None

    # -- Wiki knowledge ----------------------------------------------------
    main_wiki_entity: Optional[WikiEntity] = None
    related_wiki_list: Optional[List[WikiEntity]] = None
    top_k_segment_list: Optional[List[WikiSegment]] = None
    wiki_rule: Optional[WikiRule] = None

    # -- NEW: raw segments from API (used by segment_filter_node) ----------
    wiki_segments: Optional[List[dict]] = None

    # -- segment_filter_node output (used by generation_meta) --------------
    cited_segment_ids: List[int] = Field(default_factory=list)
    cited_segment_count: int = 0

    # -- NEW: convenience copies from wiki_rule ----------------------------
    must_include: Optional[List[str]] = None
    must_not_say: Optional[List[str]] = None

    # -- Template & content ------------------------------------------------
    match_template: Optional[ArticleTemplate] = None
    article_outline: Optional[str] = None
    initial_draft: Optional[str] = None
    final_article: Optional[str] = None

    # -- Validation --------------------------------------------------------
    check_report: Optional[str] = None
    is_fact_ok: Optional[bool] = None
    rule_passed: Optional[bool] = None
    retry_times: int = 0

    # -- Confirmation flags ------------------------------------------------
    confirm_template: bool = False
    confirm_outline: bool = False
    confirm_draft: bool = False

    # -- Trace & usage -----------------------------------------------------
    flow_trace: Optional[List[TraceStep]] = None
    token_usage: TokenUsage = Field(default_factory=TokenUsage)

    # -- Skill 规划 (Writing Skill System) ---------------------------------
    skill_plan: Optional[dict] = None
    # skill_plan structure: {article_type, article_type_reason, audience, audience_reason,
    #   techniques, technique_plan, special_notes, blueprint_content,
    #   audience_content, techniques_content, quality_benchmark}

    # -- 质量评分 ----------------------------------------------------------
    style_score: Optional[float] = None       # 文风/可读性评分 (0-1)
    quality_score: Optional[float] = None     # 综合质量分 (0-1)
    style_report: Optional[str] = None        # 文风检查报告

    # -- 大纲校验 ----------------------------------------------------------
    outline_valid: Optional[bool] = None      # 大纲是否通过校验
    outline_feedback: Optional[str] = None    # 大纲校验反馈
    outline_retry_count: int = 0              # 大纲重新生成次数（最多 2 次）

    # -- 规则修正 ----------------------------------------------------------
    rule_check_report: Optional[str] = None   # 规则检查详细报告 JSON

    # -- Allow extra fields for forward-compat with agent.py builders ------
    model_config = {"extra": "allow"}

    # ------------------------------------------------------------------
    # Dict-style access (backward compatibility with TypedDict usage)
    # ------------------------------------------------------------------

    def __getitem__(self, key: str) -> Any:
        """Enable state["field"] access."""
        try:
            return getattr(self, key)
        except AttributeError:
            # Fall back to extra fields stored via model_config extra="allow"
            if key in self.model_extra:
                return self.model_extra[key]
            raise KeyError(key)

    def __setitem__(self, key: str, value: Any) -> None:
        """Enable state["field"] = value assignment."""
        if key in self.model_fields:
            object.__setattr__(self, key, value)
        else:
            # Store in model_extra for unknown keys
            if self.model_extra is None:
                object.__setattr__(self, '__pydantic_extra__', {})
            self.model_extra[key] = value

    def __contains__(self, key: str) -> bool:
        """Enable 'field' in state check."""
        if key in self.model_fields:
            return True
        return key in (self.model_extra or {})

    def get(self, key: str, default: Any = None) -> Any:
        """Dict-style .get() with a default value."""
        try:
            return self[key]
        except (KeyError, AttributeError):
            return default

    def keys(self) -> List[str]:
        """Return all field names (including extras) for iteration."""
        base_keys = list(self.model_fields.keys())
        extra_keys = list((self.model_extra or {}).keys())
        return base_keys + extra_keys

    # ------------------------------------------------------------------
    # Deep copy helper
    # ------------------------------------------------------------------

    def deep_copy(self) -> "AgentState":
        """
        Return a deep copy of this AgentState.

        Prefer this over `{**state}` or `dict(state)` which only produce
        shallow copies where nested Pydantic models are shared references.
        """
        return self.model_copy(deep=True)

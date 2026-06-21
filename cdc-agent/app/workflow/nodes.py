from typing import Dict, Any
from app.skills.registry import SkillRegistry
from app.models.state import AgentState
from app.skills.writing.skill_loader import get_skill_loader
from loguru import logger


async def intent_parse_node(state: AgentState) -> AgentState:
    """1. 意图解析：自由文本模式解析出实体，人群、场景"""
    skill = SkillRegistry.get_skill("intent_parse")
    result = await skill.execute(state)
    logger.info("节点 [1/12] intent_parse 完成")
    return result


async def compress_input_node(state: AgentState) -> AgentState:
    """2. 输入压缩：压缩用户输入，减少token消耗"""
    skill = SkillRegistry.get_skill("compress")
    result = await skill.execute(state, compress_type="semantic")
    logger.info("节点 [2/12] compress_input 完成")
    return result


async def skip_intent_node(state: AgentState) -> AgentState:
    """跳过意图解析（表单模式）"""
    logger.info("节点 [skip] skip_intent")
    # LangGraph 要求至少返回一个 state key
    return {"mode": state.get("mode", 0)}


async def entity_extract_node(state: AgentState) -> AgentState:
    """3. 实体获取：从知识库获取实体详细信息"""
    skill = SkillRegistry.get_skill("entity_fetch")
    result = await skill.execute(state)
    logger.info("节点 [3/12] entity_extract 完成")
    return result


async def wiki_relation_node(state: AgentState) -> AgentState:
    """4. 关联实体获取：根据主实体获取相关联的实体"""
    skill = SkillRegistry.get_skill("relation_fetch")
    result = await skill.execute(state)
    logger.info("节点 [4/12] wiki_relation 完成")
    return result


async def segment_filter_node(state: AgentState) -> AgentState:
    """5. 片段筛选：基于向量相似度从 wiki_segments 中选取相关内容。
    
    两种模式：
    - 预计算向量模式（推荐）：片段携带 embedding 字段时，只计算查询向量，用缓存向量做 top-k
    - 实时嵌入模式（兜底）：无 embedding 字段时，对所有片段实时计算 embedding
    
    注意：此节点与 template_load 并行执行，只返回修改的字段避免 LangGraph 并发冲突。
    """
    from app.tools.vector_store import VectorStore
    
    wiki_segments = state.get("wiki_segments", [])
    if not wiki_segments:
        logger.info("节点 [5/12] segment_filter 跳过，无wiki_segments")
        return {"top_k_segment_list": []}
    
    entity_name = state.get("entity_name", "")
    population_name = state.get("population_name", "")
    query_text = entity_name
    if population_name:
        query_text += " " + population_name
    
    # 检测是否有预计算向量
    has_embeddings = any(
        isinstance(seg, dict) and seg.get("embedding")
        for seg in wiki_segments
    )
    
    vector_store = VectorStore()
    
    if has_embeddings:
        # 快速路径：用 DB 缓存向量，只计算 1 次查询 embedding
        top_k_results = vector_store.search_with_embeddings(
            query_text=query_text,
            segments=wiki_segments,
            top_k=10
        )
        logger.info(f"节点 [5/12] segment_filter 完成（预计算向量模式），返回 {len(top_k_results)} 条")
    else:
        # 兜底路径：实时计算所有片段 embedding
        top_k_results = vector_store.search_in_memory(
            query_text=query_text,
            segments=wiki_segments,
            top_k=10
        )
        logger.info(f"节点 [5/12] segment_filter 完成（实时嵌入模式），返回 {len(top_k_results)} 条")
    
    return {"top_k_segment_list": top_k_results}


async def template_load_node(state: AgentState) -> AgentState:
    """6. 模板加载：从传入数据中提取模板信息
    
    注意：此节点与 segment_filter 并行执行，只返回 match_template 避免并发冲突。
    """
    skill = SkillRegistry.get_skill("template_extract")
    result = await skill.execute(state)
    logger.info("节点 [6/12] template_load 完成")
    return {"match_template": result.get("match_template")}


async def compress_knowledge_node(state: AgentState) -> AgentState:
    """7. 知识压缩：过滤与当前主题相关性低的知识片段，控制 token 消耗
    
    策略：对 top_k_segment_list 按相似度分数过滤，
    只保留距离 >= 中位数的片段，最多保留 8 条。
    """
    segments = state.get("top_k_segment_list", [])
    if not segments or len(segments) <= 5:
        logger.info("节点 [7/12] compress_knowledge 跳过（片段数不足）")
        return {"step": state.get("step", "")}
    
    # 按 distance 分数过滤（高分为更相关）
    # top_k_segment_list 可能是 dict 或 WikiSegment（Pydantic），两者都支持 .get()
    valid_segments = [s for s in segments if hasattr(s, 'get')]
    distances = [s.get("distance", 0) for s in valid_segments]
    if not distances:
        # 无距离信息时截断到前 8 条，避免全量灌入 prompt 导致 LLM 超时
        truncated = valid_segments[:8]
        logger.info(f"节点 [7/12] compress_knowledge 截断（无距离信息）: {len(segments)} → {len(truncated)} 条")
        return {
            "top_k_segment_list": truncated,
            "step": state.get("step", ""),
        }
    
    median_distance = sorted(distances)[len(distances) // 2]
    
    # 保留高于中位数的片段，最多 8 条
    filtered = [s for s in valid_segments if s.get("distance", 0) >= median_distance][:8]
    
    logger.info(f"节点 [7/12] compress_knowledge 完成: {len(segments)} → {len(filtered)} 条")
    return {
        "top_k_segment_list": filtered,
        "step": state.get("step", ""),
    }


async def outline_generate_node(state: AgentState) -> AgentState:
    """大纲生成：基于模板和知识生成文章大纲（动态 prompt 组装）"""
    from app.prompts.outline_generate import build_outline_prompt

    skill = SkillRegistry.get_skill("outline_generate")

    # 使用动态 prompt：把 build_outline_prompt 的结果注入 state
    dynamic_prompt = build_outline_prompt(state if isinstance(state, dict) else {**state})
    logger.info(f"节点 [outline_generate] prompt 长度: {len(dynamic_prompt)} 字符")
    state_for_skill = {**(state if isinstance(state, dict) else {**state}), "_dynamic_prompt": dynamic_prompt}

    result = await skill.execute(state_for_skill)
    logger.info("节点 [outline_generate] 完成")
    return result


async def fusion_generate_node(state: AgentState) -> AgentState:
    """内容融合：基于大纲和知识生成完整文章（动态 prompt 组装）"""
    from app.prompts.fusion_generate import build_fusion_prompt

    skill = SkillRegistry.get_skill("fusion_generate")

    # 使用动态 prompt
    dynamic_prompt = build_fusion_prompt(state if isinstance(state, dict) else {**state})
    logger.info(f"节点 [fusion_generate] prompt 长度: {len(dynamic_prompt)} 字符")
    state_for_skill = {**(state if isinstance(state, dict) else {**state}), "_dynamic_prompt": dynamic_prompt}

    result = await skill.execute(state_for_skill)
    logger.info("节点 [fusion_generate] 完成")
    return result


async def fact_check_node(state: AgentState) -> AgentState:
    """9. 事实核查 + 引用验证"""
    skill = SkillRegistry.get_skill("fact_check")
    result = await skill.execute(state)
    logger.info(f"节点 [9/12] fact_check 完成, is_fact_ok={result.get('is_fact_ok')}")
    return {
        "is_fact_ok": result.get("is_fact_ok"),
        "check_report": result.get("check_report"),
    }


async def rule_check_node(state: AgentState) -> AgentState:
    """10. 规则检查：检查must_include/must_not_say"""
    skill = SkillRegistry.get_skill("rule_check")
    result = await skill.execute(state)
    logger.info(f"节点 [10/12] rule_check 完成, rule_passed={result.get('rule_passed')}")
    return {
        "rule_passed": result.get("rule_passed"),
        "rule_check_report": result.get("rule_check_report", ""),  # 保存详细报告供 rule_reflect 使用
    }


async def reflect_iterate_node(state: AgentState) -> AgentState:
    """11. 反思迭代：局部修正模式（只重写出错的句子，保留正确内容）"""
    current_retry = state.get("retry_times", 0)
    new_state = {**state}
    new_state["retry_times"] = current_retry + 1
    
    skill = SkillRegistry.get_skill("reflect_iterate")
    result = await skill.execute(new_state)
    logger.info(f"节点 [reflect_iterate] 完成, 重试次数={new_state['retry_times']}")
    return result


async def finalize_node(state: AgentState) -> AgentState:
    """12. 完成：整理最终结果"""
    logger.info("节点 [12/12] finalize 完成")
    return {"confirm_draft": True}


async def skill_planner_node(state: AgentState) -> AgentState:
    """Skill 规划：分类文章类型、匹配受众、选择写作技法"""
    skill = SkillRegistry.get_skill("skill_planner")
    result = await skill.execute(state)
    logger.info("节点 [skill_planner] 完成")
    return result


async def outline_validate_node(state: AgentState) -> AgentState:
    """大纲质量校验：检查结构完整性和 must_include 覆盖"""
    skill = SkillRegistry.get_skill("outline_validate")
    result = await skill.execute(state)
    logger.info(f"节点 [outline_validate] 完成, valid={result.get('outline_valid')}")
    return {
        "outline_valid": result.get("outline_valid"),
        "outline_feedback": result.get("outline_feedback"),
    }


async def outline_regenerate_node(state: AgentState) -> AgentState:
    """大纲重新生成：带校验反馈重新生成大纲（最多 2 轮）"""
    skill = SkillRegistry.get_skill("outline_generate")
    # 把校验反馈注入 state 让 skill 知道需要改什么
    feedback = state.get("outline_feedback", "")
    retry_count = state.get("outline_retry_count", 0) + 1
    if feedback:
        state = {**state, "outline_regeneration_hint": feedback}
    result = await skill.execute(state)
    # 确保 retry_count 传递到下游 state
    result["outline_retry_count"] = retry_count
    logger.info(f"节点 [outline_regenerate] 大纲重新生成完成 (第{retry_count}次重试)")
    return result


async def style_check_node(state: AgentState) -> AgentState:
    """文风校验：检查可读性和平台规范合规性"""
    skill = SkillRegistry.get_skill("style_check")
    result = await skill.execute(state)
    logger.info(f"节点 [style_check] 完成, score={result.get('style_score')}")
    return {
        "style_score": result.get("style_score"),
        "style_report": result.get("style_report"),
    }


async def polish_node(state: AgentState) -> AgentState:
    """文笔润色：打磨过渡、消除重复、统一语气（不改事实）"""
    skill = SkillRegistry.get_skill("polish")
    result = await skill.execute(state)
    logger.info("节点 [polish] 润色完成")
    return result


async def rule_reflect_node(state: AgentState) -> AgentState:
    """规则修正：补充遗漏的 must_include / 删除 must_not_say 违规"""
    skill = SkillRegistry.get_skill("rule_reflect")
    result = await skill.execute(state)
    logger.info(f"节点 [rule_reflect] 完成, rule_passed={result.get('rule_passed')}")
    return result


def should_parse_intent(state: AgentState) -> str:
    """根据mode决定是否跳过意图解析"""
    mode = state.get("mode")
    user_text = state.get("user_text", "")
    
    if (mode == 1 or mode == "1") and not user_text:
        return "skip_intent_parse"
    else:
        return "do_intent_parse"


def check_fact_result(state: AgentState) -> str:
    """检查事实核查结果"""
    if state.get("is_fact_ok") == True:
        return "ok"
    elif state.get("retry_times", 0) >= 3:
        return "finalize"
    else:
        return "fail"


def check_rule_result(state: AgentState) -> str:
    """检查规则核查结果"""
    if state.get("rule_passed") == True:
        return "ok"
    return "fail"


async def epidemic_preprocess_node(state: AgentState) -> AgentState:
    """疫情/传染病预处理：时效性检查 + 数据精确度标注"""
    logger.info("节点 [epidemic_preprocess] 疫情/传染病专用预处理")
    entity_name = state.get("entity_name", "")
    
    # 标记为疫情类内容，后续 fact_check 会更严格检查数据时效性
    # 在 must_include 中自动追加疫情相关规则
    must_include = list(state.get("must_include") or [])
    if "最新疫情数据" not in must_include and "最新数据" not in must_include:
        must_include.append("最新疫情数据或监测数据")
    
    logger.info(f"节点 [epidemic_preprocess] 完成, entity={entity_name}")
    return {
        "must_include": must_include,
        "entity_type": "disease",
    }


async def vaccine_preprocess_node(state: AgentState) -> AgentState:
    """疫苗/药品预处理：通俗度检查 + 不良反应术语规范"""
    logger.info("节点 [vaccine_preprocess] 疫苗/药品专用预处理")
    entity_name = state.get("entity_name", "")
    
    # 追加疫苗相关规则
    must_include = list(state.get("must_include") or [])
    if "接种建议" not in str(must_include):
        must_include.append("接种建议或注意事项")
    
    must_not_say = list(state.get("must_not_say") or [])
    must_not_say.append("绝对安全")
    must_not_say.append("无任何副作用")
    
    logger.info(f"节点 [vaccine_preprocess] 完成, entity={entity_name}")
    return {
        "must_include": must_include,
        "must_not_say": must_not_say,
        "entity_type": "vaccine",
    }


async def general_preprocess_node(state: AgentState) -> AgentState:
    """通用预处理：直通节点"""
    logger.info("节点 [general_preprocess] 通用路径直通")
    return {"entity_type": state.get("entity_type") or "general"}


def route_by_entity_type(state: AgentState) -> str:
    """根据实体类型选择子路径"""
    entity_type = state.get("entity_type") or "general"
    if entity_type in ("disease", "epidemic", "infectious", "1"):
        return "epidemic_path"
    elif entity_type in ("vaccine", "drug", "medicine", "2"):
        return "vaccine_path"
    else:
        return "general_path"


def should_validate_outline(state: AgentState) -> str:
    """大纲校验结果路由：最多重新生成 2 次，超过则强制通过"""
    if state.get("outline_valid") == True:
        return "outline_ok"
    
    retry_count = state.get("outline_retry_count", 0)
    if retry_count >= 2:
        logger.warning(f"大纲校验连续 {retry_count} 次未通过，强制通过以继续流程")
        return "outline_ok"
    
    return "outline_fail"


def should_generate_outline(state: AgentState) -> str:
    """判断是否需要生成大纲：已有大纲则跳过，直接生成正文"""
    existing_outline = state.get("article_outline", "")
    if existing_outline and existing_outline.strip():
        logger.info("已有大纲，跳过大纲生成/校验，直接进入正文生成")
        return "skip_to_fusion"
    return "generate_outline"


def quality_gate(state: AgentState) -> str:
    """综合质量门控：根据事实核查、规则检查、文风评分决定下一步

    路由优先级：
    1. 重试超限 → 强制结束
    2. 规则不通过 → 先修规则（rule_reflect 只改文本不重新生成，更快）
    3. 事实不通过 → 反思修正 + 重新生成
    4. 文风低 → 润色
    5. 全通过 → 完成
    """
    is_fact_ok = state.get("is_fact_ok", False)
    rule_passed = state.get("rule_passed", False)
    style_score = state.get("style_score", 0.8)
    retry_times = state.get("retry_times", 0)

    # 重试超过 2 次，强制结束（避免多轮循环超时）
    if retry_times >= 2:
        logger.warning(f"quality_gate: 已重试 {retry_times} 次，强制结束")
        return "finalize"

    # 规则不通过 → 先修规则（比 reflect_iterate 快，不需要重新生成全文）
    if not rule_passed:
        return "rule_fail"

    # 事实不通过 → 反思修正
    if not is_fact_ok:
        return "fact_fail"
    
    # 文风评分较低 → 润色
    if style_score < 0.7:
        return "polish"
    
    # 全部通过 → 完成
    return "finalize"

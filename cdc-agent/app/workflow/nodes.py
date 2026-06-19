from typing import Dict, Any
from app.skills.registry import SkillRegistry
from app.models.state import AgentState
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
    """7. 知识压缩：压缩大量知识片段，处理LLM上下文限制"""
    logger.info("节点 [7/12] compress_knowledge 完成")
    return {"step": state.get("step", "")}


async def outline_generate_node(state: AgentState) -> AgentState:
    """7. 大纲生成：基于模板和知识生成文章大纲"""
    skill = SkillRegistry.get_skill("outline_generate")
    result = await skill.execute(state)
    logger.info("节点 [7/12] outline_generate 完成")
    return result


async def fusion_generate_node(state: AgentState) -> AgentState:
    """8. 内容融合：基于大纲和知识生成完整文章"""
    skill = SkillRegistry.get_skill("fusion_generate")
    result = await skill.execute(state)
    logger.info("节点 [8/12] fusion_generate 完成")
    return result


async def fact_check_node(state: AgentState) -> AgentState:
    """9. 事实核查：验证生成内容的事实准确性
    
    注意：此节点与 rule_check 并行执行，只返回核查结果字段避免并发冲突。
    """
    skill = SkillRegistry.get_skill("fact_check")
    result = await skill.execute(state)
    logger.info(f"节点 [9/12] fact_check 完成, is_fact_ok={result.get('is_fact_ok')}")
    return {
        "is_fact_ok": result.get("is_fact_ok"),
        "check_report": result.get("check_report"),
    }


async def rule_check_node(state: AgentState) -> AgentState:
    """10. 规则检查：检查must_include/must_not_say
    
    注意：此节点与 fact_check 并行执行，只返回 rule_passed 避免并发冲突。
    """
    skill = SkillRegistry.get_skill("rule_check")
    result = await skill.execute(state)
    logger.info(f"节点 [10/12] rule_check 完成, rule_passed={result.get('rule_passed')}")
    return {"rule_passed": result.get("rule_passed")}


async def reflect_iterate_node(state: AgentState) -> AgentState:
    """11. 反思迭代：事实核查失败时的自我修正"""
    current_retry = state.get("retry_times", 0)
    state["retry_times"] = current_retry + 1
    
    skill = SkillRegistry.get_skill("reflect_iterate")
    result = await skill.execute(state)
    logger.info(f"节点 [11/12] reflect_iterate 完成, 重试次数={state.get('retry_times')}")
    return result


async def finalize_node(state: AgentState) -> AgentState:
    """12. 完成：整理最终结果"""
    logger.info("节点 [12/12] finalize 完成")
    return {"confirm_draft": True}


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

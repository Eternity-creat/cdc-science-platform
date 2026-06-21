from langgraph.graph import StateGraph, END
from app.models.state import AgentState
from app.workflow.nodes import (
    # 入口阶段
    intent_parse_node, compress_input_node, skip_intent_node,
    # 数据提取
    entity_extract_node, wiki_relation_node,
    # 领域路由
    epidemic_preprocess_node, vaccine_preprocess_node, general_preprocess_node,
    # Skill 规划
    skill_planner_node,
    # 并行节点
    segment_filter_node, template_load_node,
    # 知识压缩 + 大纲
    compress_knowledge_node, outline_generate_node,
    # 大纲校验
    outline_validate_node, outline_regenerate_node,
    # 正文生成
    fusion_generate_node,
    # 三路并行校验
    fact_check_node, rule_check_node, style_check_node,
    # 修正节点
    reflect_iterate_node, rule_reflect_node,
    # 润色 + 完成
    polish_node, finalize_node,
    # 路由函数
    should_parse_intent, route_by_entity_type,
    should_validate_outline, quality_gate,
)


def _build_common_graph():
    """构建公共图（不含 outline_validate 的出边，由各工作流自行设置）"""
    g = StateGraph(AgentState)

    # ========== 入口阶段 ==========
    g.add_node("intent_parse", intent_parse_node)
    g.add_node("compress_input", compress_input_node)
    g.add_node("skip_intent", skip_intent_node)

    # ========== 数据提取 ==========
    g.add_node("entity_extract", entity_extract_node)
    g.add_node("wiki_relation", wiki_relation_node)

    # ========== 领域路由 ==========
    g.add_node("epidemic_preprocess", epidemic_preprocess_node)
    g.add_node("vaccine_preprocess", vaccine_preprocess_node)
    g.add_node("general_preprocess", general_preprocess_node)

    # ========== Skill 规划 ==========
    g.add_node("skill_planner", skill_planner_node)

    # ========== 并行：检索 + 模板 ==========
    g.add_node("segment_filter", segment_filter_node)
    g.add_node("template_load", template_load_node)

    # ========== 知识压缩 + 大纲 ==========
    g.add_node("compress_knowledge", compress_knowledge_node)
    g.add_node("outline_generate", outline_generate_node)

    # ========== 大纲校验 ==========
    g.add_node("outline_validate", outline_validate_node)
    g.add_node("outline_regenerate", outline_regenerate_node)

    # ========== 边 ==========
    g.add_conditional_edges("__start__", should_parse_intent, {
        "do_intent_parse": "intent_parse",
        "skip_intent_parse": "skip_intent"
    })

    g.add_edge("intent_parse", "compress_input")
    g.add_edge("compress_input", "entity_extract")
    g.add_edge("skip_intent", "entity_extract")
    g.add_edge("entity_extract", "wiki_relation")

    g.add_conditional_edges("wiki_relation", route_by_entity_type, {
        "epidemic_path": "epidemic_preprocess",
        "vaccine_path": "vaccine_preprocess",
        "general_path": "general_preprocess",
    })

    # 预处理 → Skill 规划 → 并行检索
    for preprocess in ["epidemic_preprocess", "vaccine_preprocess", "general_preprocess"]:
        g.add_edge(preprocess, "skill_planner")

    g.add_edge("skill_planner", "segment_filter")
    g.add_edge("skill_planner", "template_load")

    g.add_edge("segment_filter", "compress_knowledge")
    g.add_edge("template_load", "compress_knowledge")
    g.add_edge("compress_knowledge", "outline_generate")
    g.add_edge("outline_generate", "outline_validate")

    # 大纲重新生成后回到校验
    g.add_edge("outline_regenerate", "outline_validate")

    # 注意：outline_validate 的出边不在这里设置，由各工作流自行设置

    return g


def create_outline_workflow():
    """大纲工作流：... → 大纲校验 → (通过→END / 不通过→重新生成)"""
    g = _build_common_graph()

    g.add_conditional_edges("outline_validate", should_validate_outline, {
        "outline_ok": END,
        "outline_fail": "outline_regenerate",
    })

    return g.compile()


def create_draft_workflow():
    """
    完整工作流：
    ... → 大纲校验 → (通过→正文 / 不通过→重新生成)
    → 正文 → [事实核查 + 规则检查 + 文风检查](并行)
    → 质量门控 → (修正/润色/完成) → END
    """
    g = _build_common_graph()

    # ========== 正文 + 校验 + 修正节点 ==========
    g.add_node("fusion_generate", fusion_generate_node)
    g.add_node("fact_check", fact_check_node)
    g.add_node("rule_check", rule_check_node)
    g.add_node("style_check", style_check_node)
    g.add_node("reflect_iterate", reflect_iterate_node)
    g.add_node("rule_reflect", rule_reflect_node)
    g.add_node("polish", polish_node)
    g.add_node("finalize", finalize_node)

    # 大纲校验通过 → 正文生成；不通过 → 重新生成
    g.add_conditional_edges("outline_validate", should_validate_outline, {
        "outline_ok": "fusion_generate",
        "outline_fail": "outline_regenerate",
    })

    # 正文生成 → 三路并行校验
    g.add_edge("fusion_generate", "fact_check")
    g.add_edge("fusion_generate", "rule_check")
    g.add_edge("fusion_generate", "style_check")

    # 事实核查 → 质量门控（条件路由，统一决策）
    g.add_conditional_edges("fact_check", quality_gate, {
        "fact_fail": "reflect_iterate",
        "rule_fail": "rule_reflect",
        "polish": "polish",
        "finalize": "finalize",
    })

    # 反思迭代 → 判断是否继续
    g.add_conditional_edges("reflect_iterate",
        lambda state: "finalize" if state.get("retry_times", 0) >= 3 else "continue",
        {"continue": "fusion_generate", "finalize": "finalize"}
    )

    # 规则修正 → 回到正文重新生成
    g.add_edge("rule_reflect", "fusion_generate")

    # 润色 → 完成
    g.add_edge("polish", "finalize")

    # 完成 → END
    g.add_edge("finalize", END)

    return g.compile()


# Compile both workflows
outline_workflow = create_outline_workflow()
draft_workflow = create_draft_workflow()

# Backward compatibility
workflow = draft_workflow

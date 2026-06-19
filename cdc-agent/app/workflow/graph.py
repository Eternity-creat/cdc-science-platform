from langgraph.graph import StateGraph, END
from app.models.state import AgentState
from app.workflow.nodes import (
    intent_parse_node,
    compress_input_node,
    skip_intent_node,
    entity_extract_node,
    wiki_relation_node,
    segment_filter_node,
    template_load_node,
    compress_knowledge_node,
    outline_generate_node,
    fusion_generate_node,
    fact_check_node,
    rule_check_node,
    reflect_iterate_node,
    finalize_node,
    should_parse_intent,
    check_fact_result,
    check_rule_result,
    epidemic_preprocess_node,
    vaccine_preprocess_node,
    general_preprocess_node,
    route_by_entity_type
)


def _build_common_graph():
    """
    构建公共前段节点和边（入口 → 数据提取 → entity_type路由 → 并行筛选/模板 → 知识压缩 → 大纲生成）
    
    只注册两个工作流都需要的节点，不注册 fusion_generate 等后段节点。
    """
    g = StateGraph(AgentState)
    
    # ========== 入口阶段 ==========
    g.add_node("intent_parse", intent_parse_node)
    g.add_node("compress_input", compress_input_node)
    g.add_node("skip_intent", skip_intent_node)
    
    # ========== 数据提取阶段 ==========
    g.add_node("entity_extract", entity_extract_node)
    g.add_node("wiki_relation", wiki_relation_node)
    
    # ========== entity_type 条件路由 ==========
    g.add_node("epidemic_preprocess", epidemic_preprocess_node)
    g.add_node("vaccine_preprocess", vaccine_preprocess_node)
    g.add_node("general_preprocess", general_preprocess_node)
    
    # ========== 并行节点：片段筛选 + 模板加载 ==========
    g.add_node("segment_filter", segment_filter_node)
    g.add_node("template_load", template_load_node)
    
    # ========== 知识压缩 + 大纲生成 ==========
    g.add_node("compress_knowledge", compress_knowledge_node)
    g.add_node("outline_generate", outline_generate_node)
    
    # ========== 边 ==========
    # 入口：根据 mode 决定是否跳过意图解析
    g.add_conditional_edges(
        "__start__",
        should_parse_intent,
        {
            "do_intent_parse": "intent_parse",
            "skip_intent_parse": "skip_intent"
        }
    )
    
    g.add_edge("intent_parse", "compress_input")
    g.add_edge("compress_input", "entity_extract")
    g.add_edge("skip_intent", "entity_extract")
    g.add_edge("entity_extract", "wiki_relation")
    
    # wiki_relation → entity_type 条件路由 → 预处理节点
    g.add_conditional_edges(
        "wiki_relation",
        route_by_entity_type,
        {
            "epidemic_path": "epidemic_preprocess",
            "vaccine_path": "vaccine_preprocess",
            "general_path": "general_preprocess",
        }
    )
    
    # 预处理节点汇聚到 [segment_filter + template_load] 并行
    g.add_edge("epidemic_preprocess", "segment_filter")
    g.add_edge("epidemic_preprocess", "template_load")
    g.add_edge("vaccine_preprocess", "segment_filter")
    g.add_edge("vaccine_preprocess", "template_load")
    g.add_edge("general_preprocess", "segment_filter")
    g.add_edge("general_preprocess", "template_load")
    
    # 汇聚到知识压缩 → 大纲生成
    g.add_edge("segment_filter", "compress_knowledge")
    g.add_edge("template_load", "compress_knowledge")
    g.add_edge("compress_knowledge", "outline_generate")
    
    return g


def _add_draft_nodes(g):
    """为 draft 工作流添加后段节点（内容融合 → 事实核查/规则检查 → 反思迭代 → 完成）"""
    g.add_node("fusion_generate", fusion_generate_node)
    g.add_node("fact_check", fact_check_node)
    g.add_node("rule_check", rule_check_node)
    g.add_node("reflect_iterate", reflect_iterate_node)
    g.add_node("finalize", finalize_node)


def create_outline_workflow():
    """
    大纲工作流：从入口到大纲生成
    
    流程：
    入口 → 意图解析(可选) → 输入压缩 → 实体提取 → 关联实体获取
    → entity_type路由 → [片段筛选 + 模板加载](并行) → 知识压缩 → 大纲生成 → END
    """
    g = _build_common_graph()
    g.add_edge("outline_generate", END)
    return g.compile()


def create_draft_workflow():
    """
    完整工作流：从入口到终审完成
    
    流程：
    入口 → 意图解析(可选) → 输入压缩 → 实体提取 → 关联实体获取
    → entity_type路由 → [片段筛选 + 模板加载](并行) → 知识压缩 → 大纲生成
    → 内容融合 → [事实核查 + 规则检查](并行) → 反思迭代(如有问题) → 完成 → END
    """
    g = _build_common_graph()
    _add_draft_nodes(g)
    
    g.add_edge("outline_generate", "fusion_generate")
    
    # ========== 并行执行：事实核查 + 规则检查 ==========
    g.add_edge("fusion_generate", "fact_check")
    g.add_edge("fusion_generate", "rule_check")
    
    # 规则检查：只写入 state（rule_passed），不出边
    # finalize 节点从 state 中读取 rule_passed，无需 rule_check 直接触发
    # fact_check 的条件分支统一控制流程走向，避免并发写入 confirm_draft
    
    # ========== 事实核查结果处理（条件分支） ==========
    g.add_conditional_edges(
        "fact_check",
        check_fact_result,
        {
            "ok": "finalize",
            "fail": "reflect_iterate",
            "finalize": "finalize"
        }
    )
    
    # ========== 反思迭代：重试生成 ==========
    g.add_conditional_edges(
        "reflect_iterate",
        lambda state: "finalize" if state.get("retry_times", 0) >= 3 else "continue",
        {
            "continue": "fusion_generate",
            "finalize": "finalize"
        }
    )
    
    # ========== 完成 ==========
    g.add_edge("finalize", END)
    return g.compile()


# Compile both workflows
outline_workflow = create_outline_workflow()
draft_workflow = create_draft_workflow()

# Keep the old `workflow` for backward compatibility
workflow = draft_workflow

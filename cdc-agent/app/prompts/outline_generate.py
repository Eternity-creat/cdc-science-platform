# [DEPRECATED] 保留旧模板用于向后兼容，新代码请使用 build_outline_prompt()
OUTLINE_GENERATE_PROMPT = """你是专业的疾控科普文章写作助手。请根据以下信息生成文章大纲。

## 模板信息
- 模板名称：{template_name}
- 模板目的：{template_purpose}
- 模板结构：{template_outline}

## Wiki实体信息
- 主题：{entity_name}
- 目标人群：{population_name}
- 应用场景：{scene_name}

## Wiki必含要点（必须全部覆盖）
{must_include_points}

## Wiki禁止表述（绝对不能出现）
{must_not_say_points}

## 权威知识片段（可引用）
{segment_content}

## 文风要求
{template_tone}

## 要求
1. 严格遵循模板结构和必含要点
2. 绝对不能出现禁止表述的内容
3. 每个章节要有具体小节
4. 使用中文数字（一、二、三...）和阿拉伯数字结合
5. 直接输出大纲内容，不需要其他说明

## 输出格式
一、章节一名称
  1. 小节1
  2. 小节2
二、章节二名称
  1. 小节1
..."""


from app.skills.writing.skill_loader import get_skill_loader


def build_outline_prompt(state: dict) -> str:
    """
    动态组装大纲生成 prompt。

    注入 Layer 1 通用规则 + Layer 2 蓝图结构 + Layer 3 受众关注点。
    """
    skill_plan = state.get("skill_plan") or {}
    loader = get_skill_loader()

    article_type = skill_plan.get("article_type", "")
    audience = skill_plan.get("audience", "")

    universal_rules = loader.get_universal_rules()
    blueprint = skill_plan.get("blueprint_content") or (
        loader.get_blueprint(article_type) if article_type else ""
    )
    audience_profile = skill_plan.get("audience_content") or (
        loader.get_audience_profile(audience) if audience else ""
    )

    template_name = state.get("template_name", "")
    template_purpose = state.get("template_purpose", "")
    template_outline = state.get("template_outline", "")
    template_tone = state.get("template_tone", "专业、温和、通俗易懂")

    entity_name = state.get("parsed_entity_name") or state.get("entity_name", "")
    population_name = state.get("parsed_population_name") or state.get("population_name", "")
    scene_name = state.get("parsed_scene_name") or state.get("scene_name", "")

    must_include = state.get("must_include", []) or []
    must_not_say = state.get("must_not_say", []) or []

    segments = state.get("top_k_segment_list", [])
    wiki_segments = state.get("wiki_segments", [])
    if wiki_segments:
        segment_content = "\n".join([f"- {s}" for s in wiki_segments[:10]]) if wiki_segments else "无"
    else:
        segment_content = "\n".join([f"- {s.get('content', '')}" for s in segments[:10]]) if segments else "无"

    parts = [
        "你是专业的疾控科普文章写作助手。请根据以下信息生成文章大纲。",
        "",
    ]

    if universal_rules:
        parts.extend(["## 通用写作规范（摘要）", "# 请确保大纲符合以下底线规范：",
                       "# - 必须包含就医指引和免责声明",
                       "# - 章节顺序符合读者认知路径", ""])

    if blueprint:
        parts.extend(["## 文章类型蓝图（结构参考）", blueprint, ""])

    if audience_profile:
        # For outline, only inject the "关注点排序" section
        parts.extend(["## 目标受众关注点", audience_profile, ""])

    parts.extend([
        "## 模板信息",
        f"- 模板名称：{template_name}",
        f"- 模板目的：{template_purpose}",
        f"- 模板结构：{template_outline}",
        f"- 文风要求：{template_tone}",
        "",
        "## 实体信息",
        f"- 主题：{entity_name}",
        f"- 目标人群：{population_name}",
        f"- 应用场景：{scene_name}",
        "",
        "## 必含要点（必须全部覆盖）",
        "\n".join(must_include) if must_include else "无",
        "",
        "## 禁止表述（绝对不能出现）",
        "\n".join(must_not_say) if must_not_say else "无",
        "",
        "## 权威知识片段（可引用）",
        segment_content,
        "",
        "## 输出格式",
        "一、章节一名称",
        "  1. 小节1",
        "  2. 小节2",
        "二、章节二名称",
        "  1. 小节1",
        "...",
        "",
        "## 要求",
        "1. 严格遵循蓝图结构和必含要点",
        "2. 绝对不能出现禁止表述的内容",
        "3. 每个章节要有具体小节",
        "4. 使用中文数字（一、二、三...）和阿拉伯数字结合",
        "5. 直接输出大纲内容，不需要其他说明",
    ])

    return "\n".join(parts)

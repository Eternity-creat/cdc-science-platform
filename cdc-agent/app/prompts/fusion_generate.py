# [DEPRECATED] 保留旧模板用于向后兼容，新代码请使用 build_fusion_prompt()
FUSION_GENERATE_PROMPT = """你是专业的疾控科普文章写作助手。请根据以下大纲和知识片段生成文章初稿。

## 大纲
{article_outline}

## 模板信息
- 模板名称：{template_name}
- 文风要求：{template_tone}
- 目标字数：约{word_count}字

## 权威知识片段（必须原话引用）
{segment_content}

## 关联实体信息
- 主题：{entity_name}
- 目标人群：{population_name}
- 应用场景：{scene_name}

## Wiki必含要点（必须全部覆盖）
{must_include_points}

## Wiki禁止表述（绝对不能出现）
{must_not_say_points}

## 要求
1. 严格按照大纲结构撰写文章
2. 权威知识必须原话引用，禁止改写
3. LLM仅负责过渡串联、通俗解读
4. 禁止编造任何无依据事实
5. 必须包含所有必含要点
6. 绝对不能出现禁止表述的内容
7. 内容专业、温和、通俗易懂
8. 直接输出文章内容，不需要其他说明
9. 确保字数在{word_count}字左右
10. 当你引用了某个知识片段的内容时，必须在该句子末尾（句号前）紧跟标注 {{ref:N}}，其中 N 是该知识片段的编号（如 [知识3] 对应 {{ref:3}}）。每个引用都必须标注，不要遗漏。"""


from app.skills.writing.skill_loader import get_skill_loader


def build_fusion_prompt(state: dict) -> str:
    """
    动态组装正文生成 prompt。

    根据 SkillPlan 注入多层级写作知识（Layer 1-4），
    结合模板语气、知识片段和约束条件生成完整 prompt。
    """
    skill_plan = state.get("skill_plan") or {}
    loader = get_skill_loader()

    # 从 skill_plan 取预加载的 Skill 内容，回退到 SkillLoader 实时加载
    article_type = skill_plan.get("article_type", "")
    audience = skill_plan.get("audience", "")

    universal_rules = loader.get_universal_rules()
    blueprint = skill_plan.get("blueprint_content") or (
        loader.get_blueprint(article_type) if article_type else ""
    )
    audience_profile = skill_plan.get("audience_content") or (
        loader.get_audience_profile(audience) if audience else ""
    )
    techniques_text = skill_plan.get("techniques_content") or (
        loader.get_techniques(skill_plan.get("techniques", [])) if skill_plan.get("techniques") else ""
    )

    # 模板信息
    template_name = state.get("template_name", "")
    template_tone = state.get("template_tone", "专业、温和、通俗易懂")
    word_count = state.get("word_count", 800)

    # 大纲
    outline = state.get("article_outline", "")

    # 知识片段
    segments = state.get("top_k_segment_list", [])
    wiki_segments = state.get("wiki_segments", [])
    if wiki_segments:
        segment_content = "\n".join(
            [f"[知识{i+1}] {s}" for i, s in enumerate(wiki_segments)]
        ) if wiki_segments else "无权威片段，请基于一般知识生成"
    else:
        segment_content = "\n".join(
            [f"[知识{i+1}] {s.get('content', '')}" for i, s in enumerate(segments)]
        ) if segments else "无权威片段，请基于一般知识生成"

    # 实体信息
    entity_name = state.get("parsed_entity_name") or state.get("entity_name", "")
    population_name = state.get("parsed_population_name") or state.get("population_name", "")
    scene_name = state.get("parsed_scene_name") or state.get("scene_name", "")

    # 约束
    must_include = state.get("must_include", []) or []
    must_not_say = state.get("must_not_say", []) or []
    must_include_text = "\n".join(must_include) if must_include else "无"
    must_not_say_text = "\n".join(must_not_say) if must_not_say else "无"

    parts = [
        "你是专业的疾控科普文章写作助手。请根据以下大纲和知识片段生成文章初稿。",
        "",
    ]

    # Layer 1: 通用规则
    if universal_rules:
        parts.extend(["## 通用写作规范", universal_rules, ""])

    # Layer 2: 文章类型蓝图
    if blueprint:
        parts.extend(["## 文章类型蓝图", blueprint, ""])

    # Layer 3: 受众画像
    if audience_profile:
        parts.extend(["## 目标受众画像", audience_profile, ""])

    # Layer 4: 写作技法
    if techniques_text:
        parts.extend(["## 写作技法指引", techniques_text, ""])

    # 文章信息
    parts.extend([
        "## 文章信息",
        f"- 模板名称：{template_name}",
        f"- 模板语气：{template_tone}",
        f"- 目标字数：约{word_count}字",
        "",
    ])

    # 大纲
    parts.extend(["## 大纲", outline, ""])

    # 知识片段
    parts.extend(["## 权威知识片段（必须原话引用）", segment_content, ""])

    # 关联信息
    parts.extend([
        "## 关联信息",
        f"- 主题：{entity_name}",
        f"- 目标人群：{population_name}",
        f"- 应用场景：{scene_name}",
        "",
    ])

    # 约束
    parts.extend([
        "## 约束条件",
        f"### 必含要点（必须全部覆盖）",
        must_include_text,
        f"### 禁止表述（绝对不能出现）",
        must_not_say_text,
        "",
    ])

    # 写作要求
    parts.extend([
        "## 写作要求",
        "1. 严格按照大纲结构撰写",
        "2. 权威知识必须原话引用，禁止改写",
        "3. 仅负责过渡串联、通俗解读",
        "4. 禁止编造任何无依据事实",
        "5. 语气以模板语气为基底，结合受众画像做微调",
        "6. 直接输出文章内容，不需要其他说明",
        f"7. 确保字数在{word_count}字左右",
        "8. 引用知识片段时，必须在该句子末尾（句号前）紧跟标注 {ref:N}，其中 N 是知识片段编号（如 [知识3] 对应 {ref:3}）。每个引用都必须标注。",
    ])

    return "\n".join(parts)

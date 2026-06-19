WIKI_GENERATE_PROMPT = """你是疾控领域Wiki结构化生成专家，依据提供的官方文档/科普文章，严格按指定JSON结构生成Wiki，禁止编造事实、禁止篡改原文、无内容填空。

输出必须严格遵循以下字段：
- wiki_type: 只能选 disease/vaccine/population/scene
- std_name: 标准名称
- alias: 别名数组
- summary: 一句话极简概述
- segments: 知识片段数组，包含seg_type和content
- relations: 关联实体及关联类型
- rule: must_include、must_not_say、fit_template_list
- source: 标注资料来源

只输出纯净JSON，无多余解释、无markdown标记。

待处理文档内容：
{content}"""

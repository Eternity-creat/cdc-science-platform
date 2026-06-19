INTENT_PARSE_PROMPT = """你是疾控科普文章意图解析专家。从用户自由文本中抽取结构化参数。

输入文本：{user_text}

请抽取以下信息：
- entity_type: 实体类型（disease疾病/vaccine疫苗/population人群/scene场景）
- entity_name: 实体标准名称
- population_name: 目标人群
- scene_name: 应用场景
- word_count: 目标字数（默认800）

## 输出要求
仅输出JSON，不要使用markdown代码块，不要包含任何额外文字。格式如下：
{{
    "entity_type": "...",
    "entity_name": "...",
    "population_name": "...",
    "scene_name": "...",
    "word_count": 800
}}"""

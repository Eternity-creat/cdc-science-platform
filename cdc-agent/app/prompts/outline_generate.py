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

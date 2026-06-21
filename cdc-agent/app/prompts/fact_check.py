FACT_CHECK_PROMPT = """你是疾控科普文章事实校验专家。逐句核对文章内容与权威知识片段的一致性。

## 待校验文章
{article_content}

## 权威知识片段
{segment_content}

## 校验要求
1. 逐句检查文章内容是否与权威片段一致
2. 标记任何事实错误、篡改、编造
3. 事实错误标记格式：[事实错误] 错误描述
4. 完全正确则标记：[OK]

## 输出要求
仅输出JSON，不要使用markdown代码块，不要包含任何额外文字。格式如下：
{{
    "is_fact_ok": true或false,
    "errors": [
        {{"sentence": "错误句", "reason": "错误原因"}}
    ],
    "ok_count": 正确句数,
    "error_count": 错误句数
}}"""

ENHANCED_FACT_CHECK_PROMPT = """你是疾控科普文章事实校验专家。逐句核对文章内容与权威知识片段的一致性，同时验证引用标记的准确性。

## 待校验文章
{article_content}

## 权威知识片段
{segment_content}

## 校验要求

### 事实核查
1. 逐句检查文章内容是否与权威片段一致
2. 标记任何事实错误、篡改、编造
3. 事实错误标记格式：[事实错误] 错误描述
4. 完全正确则标记：[OK]

### 引用标记核查
5. 检查每个 {{ref:N}} 引用标记是否准确对应第 N 条知识片段
6. 标记引用错误：[引用错误] 标记 {{ref:N}} 但内容与第 N 条不符
7. 标记遗漏引用：[引用遗漏] 使用了知识片段内容但未标注 {{ref:N}}

## 输出要求
仅输出JSON，不要使用markdown代码块，不要包含任何额外文字。格式如下：
{{
    "is_fact_ok": true或false,
    "errors": [
        {{"sentence": "错误句", "reason": "错误原因", "type": "fact_error或citation_error"}}
    ],
    "citation_errors": [
        {{"sentence": "句子", "marked_ref": 3, "actual_ref": 5, "reason": "原因"}}
    ],
    "ok_count": 正确句数,
    "error_count": 错误句数
}}"""

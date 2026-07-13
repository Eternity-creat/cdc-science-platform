"""公共工具函数"""
import re


def extract_json(text: str) -> str:
    """从 LLM 返回中提取 JSON 字符串（兼容 markdown 代码块、前后多余文字等情况）"""
    text = text.strip()
    # 尝试提取 ```json ... ``` 或 ``` ... ``` 代码块
    match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # 尝试提取第一个 { ... } 块
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return match.group(0).strip()
    # 尝试提取第一个 [ ... ] 块（数组）
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if match:
        return match.group(0).strip()
    return text

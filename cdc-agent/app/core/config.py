from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional, List


class Settings(BaseSettings):
    """
    Agent 本地配置（从 .env 文件读取）。

    注意：以下 LLM 相关字段仅作为兜底默认值。
    正式运行时，模型名称、API Key、Base URL 优先从 Java 后端的
    cdc_llm_config 表读取（通过前端「LLM 配置」页面管理）。
    只有在 cdc_llm_config 表中没有对应类型的默认配置、或 Java 后端
    不可达时，才会回退到这里的值。
    """

    # 兜底：embedding 和文本生成共用的 API Key
    DASHSCOPE_API_KEY: str = ""
    # 兜底：文本生成模型（text_generation / fact_check / rule_check 等）
    LLM_MODEL: str = "qwen-turbo"
    # 兜底：向量嵌入模型（embedding）
    EMBEDDING_MODEL: str = "text-embedding-v2"

    LOG_LEVEL: str = "INFO"
    AGENT_PORT: int = 8001

    # 兜底：DashScope OpenAI-compatible API 地址（集中管理，各模块统一引用）
    DEFAULT_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    # 兜底：图片生成模型（image_generation，可选）
    SENSENOVA_API_KEY: str = ""
    SENSENOVA_BASE_URL: str = "https://api.sensenova.cn"

    # 图片本地存储目录（相对于 cdc-agent 根目录）
    UPLOAD_DIR: str = "uploads"

    # CORS 允许的源（逗号分隔），"*" 表示全部允许（仅适用于开发环境）
    CORS_ORIGINS: str = "*"

    # Java 后端地址（Agent 回调获取 LLM 配置用）
    JAVA_BACKEND_URL: str = "http://localhost:8080"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

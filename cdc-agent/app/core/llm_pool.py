"""LLM 客户端共享池 — 按 config_type 缓存客户端实例，支持 60s TTL 热刷新"""

import time
from typing import Dict, Tuple, Optional
from app.core.llm import LLMClient
from app.core.config import settings
from loguru import logger


class ConfigManager:
    """从 Java 后端获取 LLM 配置。
    
    前端 LLM 管理页面只有 3 个面板：文章生成、向量嵌入、图片生成。
    所有文本类 skill（fact_check、rule_check、intent_parse 等）共享
    text_generation 配置。当子类型在 DB 中找不到时，自动回退到
    text_generation。
    
    缓存带 60 秒 TTL，前端修改配置后最多 60 秒自动生效，无需重启 Agent。
    """

    # 文本生成子类型 — 前端不单独管理，统一使用 text_generation 配置
    _TEXT_SUB_TYPES = {"fact_check", "rule_check", "intent_parse", "reflect_iterate",
                       "skill_planner", "outline_validate", "style_check", "polish",
                       "rule_reflect", "outline_generate", "fusion_generate"}

    _CACHE_TTL = 60  # seconds
    
    def __init__(self, java_backend_url: str = None):
        self.java_url = java_backend_url or settings.JAVA_BACKEND_URL
        self._cache: Dict[str, Tuple[dict, float]] = {}
    
    def get_config(self, config_type: str) -> dict:
        """获取指定类型的默认 LLM 配置。
        
        查找顺序：
        1. 本地缓存（60 秒内有效）
        2. DB 中该类型的默认配置
        3. 若为文本子类型 → 回退到 text_generation
        4. 最终回退到本地 .env 默认值
        """
        # 检查缓存（带 TTL）
        if config_type in self._cache:
            cached_config, cached_at = self._cache[config_type]
            if time.time() - cached_at < self._CACHE_TTL:
                return cached_config
            logger.debug(f"ConfigManager: {config_type} 缓存过期，重新获取")
        
        # 尝试从 DB 获取该类型的配置
        config = self._fetch_from_db(config_type)
        
        # 文本子类型 fallback：DB 中没有 fact_check 等子类型 → 用 text_generation
        if config is None and config_type in self._TEXT_SUB_TYPES:
            logger.debug(f"ConfigManager: {config_type} 未配置，回退到 text_generation")
            config = self._fetch_from_db("text_generation")
        
        if config is not None:
            self._cache[config_type] = (config, time.time())
            return config
        
        # 最终回退到本地 .env 默认值
        default_model = settings.EMBEDDING_MODEL if config_type == "embedding" else settings.LLM_MODEL
        return {
            "model_name": default_model,
            "provider": "dashscope",
            "api_key": settings.DASHSCOPE_API_KEY,
            "base_url": settings.DEFAULT_BASE_URL,
        }
    
    def _fetch_from_db(self, config_type: str) -> Optional[dict]:
        """从 Java 后端获取指定类型的默认配置，未找到返回 None"""
        try:
            import httpx
            response = httpx.get(
                f"{self.java_url}/api/llm-config/default/{config_type}",
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                config = data.get("data")
                if config:
                    return config
        except Exception as e:
            logger.debug(f"ConfigManager: 无法从后端获取 {config_type} 配置: {e}")
        return None
    
    def refresh(self, config_type: str = None):
        if config_type:
            self._cache.pop(config_type, None)
        else:
            self._cache.clear()


class LLMClientPool:
    """LLM 客户端池 — 按 config_type 缓存，检测配置变更自动重建客户端"""
    
    def __init__(self, config_manager: ConfigManager):
        self.config_manager = config_manager
        self._clients: Dict[str, LLMClient] = {}
        self._client_keys: Dict[str, tuple] = {}
    
    def get_client(self, config_type: str = "text_generation") -> LLMClient:
        config = self.config_manager.get_config(config_type)

        model = _cfg(config, "model_name", "modelName", "model", default=settings.LLM_MODEL)
        api_key = _cfg(config, "api_key_encrypted", "apiKeyEncrypted", "api_key", "apiKey", default=settings.DASHSCOPE_API_KEY)
        base_url = _cfg(config, "base_url", "baseUrl", default=settings.DEFAULT_BASE_URL)
        extra_params = _parse_params(_cfg(config, "params"))

        # 缓存 key 包含 params hash，params 变更时自动重建客户端
        params_hash = _stable_hash(extra_params)
        current_key = (model, api_key, base_url, params_hash)

        if config_type in self._clients and self._client_keys.get(config_type) == current_key:
            return self._clients[config_type]

        if config_type in self._clients:
            logger.info(f"LLMClientPool: {config_type} 配置变更 (model={model})，重建客户端")

        self._clients[config_type] = LLMClient(
            api_key=api_key,
            model=model,
            base_url=base_url,
            extra_params=extra_params,
        )
        self._client_keys[config_type] = current_key
        return self._clients[config_type]
    
    def refresh(self, config_type: str = None):
        if config_type:
            self._clients.pop(config_type, None)
            self._client_keys.pop(config_type, None)
        else:
            self._clients.clear()
            self._client_keys.clear()
        self.config_manager.refresh(config_type)


# Global singleton
_pool: Optional[LLMClientPool] = None

def get_llm_pool() -> LLMClientPool:
    global _pool
    if _pool is None:
        _pool = LLMClientPool(ConfigManager())
    return _pool

def get_config_manager() -> ConfigManager:
    return get_llm_pool().config_manager

def _cfg(config: dict, *keys, default=None):
    """从配置字典中读取值，同时兼容 snake_case 和 camelCase 字段名。

    Java 后端 JSON 响应使用 camelCase（modelName, apiKeyEncrypted, baseUrl），
    而 Python 惯用 snake_case（model_name, api_key_encrypted, base_url）。
    本方法按优先级依次尝试所有候选 key，取第一个非 None 且非空字符串的值。
    """
    for key in keys:
        val = config.get(key)
        if val is not None and val != "":
            return val
    return default


def _parse_params(raw) -> dict:
    """解析配置中的 params 字段为 dict。

    支持三种输入：
    - None / 空字符串 → {}
    - JSON 字符串（'{"thinking": {"type": "disabled"}}'）→ dict
    - 已经是 dict → 原样返回
    """
    if raw is None or raw == "":
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        import json
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, ValueError):
            logger.warning(f"LLMClientPool: params 解析失败，忽略: {raw[:100]}")
            return {}
    return {}


def _stable_hash(obj) -> str:
    """对 dict 生成稳定的字符串 hash，用于缓存 key 比较。"""
    import json, hashlib
    if not obj:
        return ""
    canonical = json.dumps(obj, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(canonical.encode()).hexdigest()[:12]


def get_model_config(config_type: str) -> dict:
    """获取指定类型的模型配置（通用快捷方法）。
    
    优先从 Java 后端 cdc_llm_config 表读取前端管理的配置，
    未配置时回退到本地 .env 默认值。
    
    返回 dict 包含: model_name, api_key, base_url, provider, params
    
    注意：Java 后端返回 camelCase 字段名（modelName / apiKeyEncrypted / baseUrl），
    必须同时尝试 snake_case 和 camelCase 才能正确读取。
    """
    config = get_config_manager().get_config(config_type)
    
    # embedding 类型使用专用 fallback 模型，其他类型使用通用 LLM_MODEL
    default_model = settings.EMBEDDING_MODEL if config_type == "embedding" else settings.LLM_MODEL
    
    return {
        "model_name": _cfg(config, "model_name", "modelName", "model", default=default_model),
        "api_key": _cfg(config, "api_key_encrypted", "apiKeyEncrypted", "api_key", "apiKey", default=settings.DASHSCOPE_API_KEY),
        "base_url": _cfg(config, "base_url", "baseUrl", default=settings.DEFAULT_BASE_URL),
        "provider": _cfg(config, "provider", default="dashscope"),
        "params": _cfg(config, "params"),  # JSON string or dict, may be None
    }

"""
多层级写作 Skill 内容加载器

负责从 app/skills/writing/ 目录读取写作知识文件，
按层级（Layer 0-5）提供内容给 prompt 动态组装。
"""
import os
from pathlib import Path
from typing import List, Optional
from loguru import logger
import yaml


class SkillLoader:
    """
    写作 Skill 文件加载器。

    Layer 0 (索引) 和 Layer 1 (通用规则) 在初始化时加载并缓存。
    Layer 2-5 按需加载，首次读取后缓存。
    """

    # 相对于项目根目录的 Skill 文件路径
    SKILL_DIR = Path(__file__).parent  # app/skills/writing/

    _instance: Optional["SkillLoader"] = None

    def __new__(cls):
        """单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._cache: dict = {}
        self._index = self._load_index()
        self._universal = self._load_file("universal_rules.md")
        logger.info("SkillLoader 初始化完成")

    def _load_index(self) -> dict:
        """加载 Layer 0 元索引"""
        index_path = self.SKILL_DIR / "skill_index.yaml"
        if not index_path.exists():
            logger.warning(f"skill_index.yaml 不存在: {index_path}")
            return {}
        with open(index_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def _load_file(self, relative_path: str) -> str:
        """加载并缓存文件内容"""
        if relative_path in self._cache:
            return self._cache[relative_path]

        file_path = self.SKILL_DIR / relative_path
        if not file_path.exists():
            logger.warning(f"Skill 文件不存在: {file_path}")
            return ""

        content = file_path.read_text(encoding="utf-8")
        self._cache[relative_path] = content
        return content

    # ========== 公共接口 ==========

    def get_index(self) -> dict:
        """Layer 0: 返回元索引"""
        return self._index

    def get_universal_rules(self) -> str:
        """Layer 1: 返回通用规则（始终加载）"""
        return self._universal

    def get_blueprint(self, article_type: str) -> str:
        """Layer 2: 按文章类型加载蓝图"""
        type_config = self._index.get("article_types", {}).get(article_type, {})
        blueprint_path = type_config.get("blueprint", "")
        if not blueprint_path:
            logger.warning(f"未找到文章类型 {article_type} 的蓝图路径")
            return ""
        return self._load_file(blueprint_path)

    def get_audience_profile(self, audience: str) -> str:
        """Layer 3: 按受众加载画像"""
        audience_path = self._index.get("audience_profiles", {}).get(audience, "")
        if not audience_path:
            logger.warning(f"未找到受众 {audience} 的画像路径")
            return ""
        return self._load_file(audience_path)

    def get_techniques(self, technique_codes: List[str]) -> str:
        """Layer 4: 按技法列表批量加载"""
        technique_map = self._index.get("technique_cards", {})
        contents = []
        for code in technique_codes:
            path = technique_map.get(code, "")
            if path:
                contents.append(self._load_file(path))
            else:
                logger.warning(f"未找到技法卡片: {code}")
        return "\n\n---\n\n".join(contents)

    def get_quality_benchmark(self, article_type: str) -> str:
        """Layer 5: 按类型加载质量基准"""
        path = f"quality/{article_type}.md"
        return self._load_file(path)

    def get_article_type_config(self, article_type: str) -> dict:
        """获取文章类型的完整配置"""
        return self._index.get("article_types", {}).get(article_type, {})

    def list_article_types(self) -> List[str]:
        """列出所有文章类型"""
        return list(self._index.get("article_types", {}).keys())

    def list_techniques(self) -> List[str]:
        """列出所有技法卡片"""
        return list(self._index.get("technique_cards", {}).keys())

    def list_audiences(self) -> List[str]:
        """列出所有受众画像"""
        return list(self._index.get("audience_profiles", {}).keys())


def get_skill_loader() -> SkillLoader:
    """获取全局 SkillLoader 单例"""
    return SkillLoader()

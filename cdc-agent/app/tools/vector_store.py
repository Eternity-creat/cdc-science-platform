from typing import List, Dict, Any
from app.core.embedding import EmbeddingModel
from loguru import logger


class VectorStore:
    """向量检索引擎。
    
    支持两种模式：
    1. 预计算向量模式（推荐）：后端传入已存储在 wiki_segment_embedding 表的向量，
       Agent 只需计算查询向量，然后做余弦相似度排序。零额外 embedding 调用。
    2. 实时嵌入模式（兜底）：无缓存向量时，对所有片段实时计算 embedding 再排序。
    """
    
    def __init__(self):
        self.embedding_model = EmbeddingModel()

    def search_with_embeddings(
        self,
        query_text: str,
        segments: List[Dict[str, Any]],
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        使用预计算向量做 top-k 检索（推荐模式）。
        
        后端已将 wiki_segment_embedding 表中的向量随片段一起传入，
        Agent 只需计算查询向量，然后用余弦相似度排序。
        
        Args:
            query_text: 查询文本（仅这条会被实时嵌入）
            segments: 片段列表，每个片段需有 'embedding' 字段（List[float]）
            top_k: 返回前 K 条
            
        Returns:
            按相似度排序的 Top-K 片段
        """
        if not segments or not query_text:
            return []
        
        # 只计算查询文本的向量（1 次 API 调用）
        query_embedding = self.embedding_model.encode_single(query_text)
        
        # 用预计算向量做余弦相似度
        results = []
        for seg in segments:
            seg_embedding = seg.get("embedding")
            if not seg_embedding:
                continue
            similarity = self._cosine_similarity(query_embedding, seg_embedding)
            results.append({
                "id": seg.get("id"),
                "entity_id": seg.get("entity_id"),
                "content": seg.get("content", ""),
                "source": seg.get("source", ""),
                "distance": similarity
            })
        
        results.sort(key=lambda x: x["distance"], reverse=True)
        logger.debug(f"search_with_embeddings: {len(segments)} 条(含向量), 返回 top-{top_k}")
        return results[:top_k]

    def search_in_memory(
        self,
        query_text: str,
        segments: List[Dict[str, Any]],
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        实时嵌入模式（兜底）：对所有片段重新计算 embedding 再排序。
        
        仅在没有预计算向量时使用，会产生 N+1 次 embedding API 调用。
        """
        if not segments or not query_text:
            return []
        
        logger.info(f"search_in_memory: 无预计算向量，实时计算 {len(segments)} 条 embedding")
        texts = [s.get("content", "") for s in segments]
        
        query_embedding = self.embedding_model.encode_single(query_text)
        segment_embeddings = self.embedding_model.encode(texts)
        
        similarities = []
        for seg, emb in zip(segments, segment_embeddings):
            similarity = self._cosine_similarity(query_embedding, emb)
            similarities.append({
                "id": seg.get("id"),
                "entity_id": seg.get("entity_id"),
                "content": seg.get("content", ""),
                "source": seg.get("source", ""),
                "distance": similarity
            })
        
        similarities.sort(key=lambda x: x["distance"], reverse=True)
        return similarities[:top_k]

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """计算余弦相似度"""
        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0
        return dot_product / (norm_a * norm_b)

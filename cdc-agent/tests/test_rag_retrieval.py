from app.tools.rag_retrieval import (
    build_retrieval_query,
    prefilter_segments,
    retrieve_relevant_segments,
)
from app.tools.vector_store import VectorStore


class FakeEmbeddingModel:
    def encode_single(self, _text):
        return [1.0, 0.0]


def _vector_store_with_fake_query_embedding():
    store = object.__new__(VectorStore)
    store.embedding_model = FakeEmbeddingModel()
    return store


def test_layered_rag_filters_irrelevant_context_before_vector_ranking():
    segments = [
        {
            "id": 1,
            "entity_id": 101,
            "owner_entity_type": 1,
            "content": "流行性感冒可通过飞沫传播。",
            "embedding": [0.92, 0.08],
        },
        {
            "id": 2,
            "entity_id": 201,
            "owner_entity_type": 3,
            "content": "老年人感染流感后发生重症的风险更高。",
            "embedding": [0.86, 0.14],
        },
        {
            "id": 3,
            "entity_id": 201,
            "owner_entity_type": 3,
            "content": "老年人高血压饮食应注意控制盐摄入。",
            # 该无关片段故意设置为最高相似度，验证它在向量排序前已被排除。
            "embedding": [1.0, 0.0],
        },
        {
            "id": 4,
            "entity_id": 301,
            "owner_entity_type": 4,
            "content": "学校出现甲流聚集时应加强通风和健康监测。",
            "embedding": [0.82, 0.18],
        },
        {
            "id": 5,
            "entity_id": 301,
            "owner_entity_type": 4,
            "content": "学校糖尿病学生应按医嘱管理血糖。",
            "embedding": [0.99, 0.01],
        },
    ]
    state = {
        "entity_name": "流行性感冒",
        "entity_alias": "流感,甲流",
        "population_name": "老年人",
        "scene_name": "学校",
        "user_text": "最近流感高发，想给家里老人看看怎么预防",
        "wiki_segments": segments,
    }

    results, stats = retrieve_relevant_segments(
        state,
        vector_store=_vector_store_with_fake_query_embedding(),
        top_k=10,
    )

    assert stats == {
        "total": 5,
        "primary": 1,
        "context": 4,
        "context_kept": 2,
        "legacy": 0,
        "candidates": 3,
        "query": "流行性感冒 老年人相关 学校场景 最近流感高发，想给家里老人看看怎么预防",
        "mode": "precomputed",
    }
    assert [item["id"] for item in results] == [1, 2, 4]
    assert 3 not in [item["id"] for item in results]
    assert 5 not in [item["id"] for item in results]


def test_prefilter_keeps_legacy_segments_for_backward_compatibility():
    segments = [
        {"id": 1, "owner_entity_type": 1, "content": "主实体片段"},
        {"id": 2, "owner_entity_type": 3, "content": "与流感相关的人群片段"},
        {"id": 3, "owner_entity_type": 3, "content": "与糖尿病相关的人群片段"},
        {"id": 4, "content": "旧调用方未携带类型的片段"},
    ]

    candidates, stats = prefilter_segments(segments, "流行性感冒", "流感")

    assert [item["id"] for item in candidates] == [1, 2, 4]
    assert stats["context_kept"] == 1
    assert stats["legacy"] == 1


def test_query_uses_parsed_fields_and_limits_short_user_intent():
    query = build_retrieval_query({
        "parsed_entity_name": "流感",
        "parsed_population_name": "儿童",
        "parsed_scene_name": "学校",
        "user_text": "请介绍校园流感预防",
    })

    assert query == "流感 儿童相关 学校场景 请介绍校园流感预防"

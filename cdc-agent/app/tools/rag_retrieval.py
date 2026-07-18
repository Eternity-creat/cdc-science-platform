import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from loguru import logger


PRIMARY_ENTITY_TYPES = {1, 2}
CONTEXT_ENTITY_TYPES = {3, 4}


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _split_aliases(alias: str) -> List[str]:
    return [
        part.strip()
        for part in re.split(r"[,;\uFF0C\uFF1B\u3001]", alias or "")
        if part.strip()
    ]


def build_entity_keywords(entity_name: str, entity_alias: str = "") -> List[str]:
    """Build de-duplicated main-entity terms used to filter context segments."""
    terms = [_clean_text(entity_name), *_split_aliases(entity_alias)]
    seen = set()
    keywords = []
    for term in terms:
        normalized = term.casefold()
        if term and normalized not in seen:
            seen.add(normalized)
            keywords.append(term)
    return keywords


def _contains_any(content: str, keywords: Iterable[str]) -> bool:
    normalized_content = _clean_text(content).casefold()
    return any(keyword.casefold() in normalized_content for keyword in keywords if keyword)


def prefilter_segments(
    segments: List[Dict[str, Any]],
    entity_name: str,
    entity_alias: str = "",
    population_name: str = "",
    scene_name: str = "",
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """Keep primary-entity segments and topic-related population/scene segments."""
    entity_keywords = build_entity_keywords(entity_name, entity_alias)
    fallback_keywords = [
        value for value in (_clean_text(population_name), _clean_text(scene_name)) if value
    ]
    context_keywords = entity_keywords or fallback_keywords

    primary_segments = []
    context_segments = []
    legacy_segments = []
    filtered_context = []

    for segment in segments:
        owner_type = segment.get("owner_entity_type")
        if owner_type in PRIMARY_ENTITY_TYPES:
            primary_segments.append(segment)
        elif owner_type in CONTEXT_ENTITY_TYPES:
            context_segments.append(segment)
            if context_keywords and _contains_any(segment.get("content", ""), context_keywords):
                filtered_context.append(segment)
        else:
            # Backward compatibility for callers that have not yet supplied entity type.
            legacy_segments.append(segment)

    candidates = primary_segments + filtered_context + legacy_segments
    stats = {
        "total": len(segments),
        "primary": len(primary_segments),
        "context": len(context_segments),
        "context_kept": len(filtered_context),
        "legacy": len(legacy_segments),
        "candidates": len(candidates),
    }
    return candidates, stats


def build_retrieval_query(state: Dict[str, Any]) -> str:
    parts = []
    entity_name = _clean_text(state.get("entity_name") or state.get("parsed_entity_name"))
    population_name = _clean_text(state.get("population_name") or state.get("parsed_population_name"))
    scene_name = _clean_text(state.get("scene_name") or state.get("parsed_scene_name"))
    user_text = _clean_text(state.get("user_text"))

    if entity_name:
        parts.append(entity_name)
    if population_name:
        parts.append(f"{population_name}相关")
    if scene_name:
        parts.append(f"{scene_name}场景")
    if user_text and len(user_text) <= 200:
        parts.append(user_text[:100])

    return " ".join(parts)


def retrieve_relevant_segments(
    state: Dict[str, Any],
    vector_store: Optional[Any] = None,
    top_k: int = 10,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    segments = list(state.get("wiki_segments") or [])
    if not segments:
        return [], {
            "total": 0,
            "primary": 0,
            "context": 0,
            "context_kept": 0,
            "legacy": 0,
            "candidates": 0,
            "query": "",
            "mode": "empty",
        }

    candidates, stats = prefilter_segments(
        segments=segments,
        entity_name=state.get("entity_name") or state.get("parsed_entity_name") or "",
        entity_alias=state.get("entity_alias") or "",
        population_name=state.get("population_name") or state.get("parsed_population_name") or "",
        scene_name=state.get("scene_name") or state.get("parsed_scene_name") or "",
    )
    query_text = build_retrieval_query(state)
    stats["query"] = query_text

    if not candidates or not query_text:
        stats["mode"] = "empty"
        return [], stats

    if vector_store is None:
        from app.tools.vector_store import VectorStore
        vector_store = VectorStore()

    has_embeddings = all(segment.get("embedding") for segment in candidates)
    if has_embeddings:
        results = vector_store.search_with_embeddings(query_text, candidates, top_k=top_k)
        stats["mode"] = "precomputed"
    else:
        results = vector_store.search_in_memory(query_text, candidates, top_k=top_k)
        stats["mode"] = "realtime"

    logger.info(
        "RAG分层检索: total={} primary={} context={}->{} legacy={} candidates={} top_k={} mode={}",
        stats["total"],
        stats["primary"],
        stats["context"],
        stats["context_kept"],
        stats["legacy"],
        stats["candidates"],
        len(results),
        stats["mode"],
    )
    return results, stats

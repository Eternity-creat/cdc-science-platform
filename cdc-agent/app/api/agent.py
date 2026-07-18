from fastapi import APIRouter, HTTPException, Body, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from app.models.schemas import AgentRequest, RetrieveRequest, RetrieveResponse
from app.models.state import AgentState
from app.models.response import AgentResponse, QualityMetrics, TraceEntry
from app.workflow.graph import outline_workflow, draft_workflow
from app.skills.registry import SkillRegistry
from app.skills.flow.intent_parse_skill import IntentParseSkill
from app.skills.flow.section_analyze_skill import SectionAnalyzeSkill
from app.skills.flow.image_generate_skill import ImageGenerateSkill
from app.tools.rag_retrieval import retrieve_relevant_segments
from app.core.config import settings
from app.core.streaming import (
    reset_stream_callback,
    reset_stream_event_callback,
    set_stream_callback,
    set_stream_event_callback,
)
from loguru import logger
from pathlib import Path
import uuid
import time
import json
import asyncio

router = APIRouter(prefix="/api/agent", tags=["agent"])


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _image_upload_dir() -> Path:
    project_root = Path(__file__).resolve().parent.parent.parent
    upload_dir = project_root / settings.UPLOAD_DIR / "images"
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


@router.post("/parse-intent")
async def parse_intent(user_text: str = Body(..., embed=True)) -> dict:
    """意图解析接口：从自由文本中解析出结构化参数"""
    logger.info(f"接收到意图解析请求: user_text={user_text[:50]}...")
    
    try:
        intent_skill = IntentParseSkill()
        state = {"user_text": user_text}
        result_state = await intent_skill.execute(state)
        
        parsed = {
            "entity_type": result_state.get("entity_type", ""),
            "entity_name": result_state.get("parsed_entity_name", ""),
            "population_name": result_state.get("parsed_population_name", ""),
            "scene_name": result_state.get("parsed_scene_name", ""),
            "word_count": result_state.get("word_count", 800)
        }
        
        logger.info(f"意图解析完成: {parsed}")
        return parsed
        
    except Exception as e:
        logger.error("意图解析失败: {}", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    article_id: Optional[int] = Form(None),
    caption: Optional[str] = Form(None),
) -> dict:
    """上传用户本地配图，统一保存到 /uploads/images。"""
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="仅支持 JPG、PNG、WebP、GIF 图片")

    data = await file.read()
    max_size = 5 * 1024 * 1024
    if len(data) > max_size:
        raise HTTPException(status_code=400, detail="图片不能超过 5MB")

    ext = ALLOWED_IMAGE_TYPES[content_type]
    filename = f"article_{article_id or 'common'}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}{ext}"
    target = _image_upload_dir() / filename
    target.write_bytes(data)

    file_path = f"/uploads/images/{filename}"
    logger.info(f"用户配图上传完成: article_id={article_id}, path={file_path}, size={len(data)}")
    return {
        "file_path": file_path,
        "caption": caption or file.filename or "配图",
        "width": None,
        "height": None,
        "file_size": len(data),
        "generated_by": "manual_upload",
    }


@router.post("/retrieve", response_model=RetrieveResponse)
async def retrieve(request: RetrieveRequest) -> RetrieveResponse:
    """向量检索接口：从传入的 wiki_segments 中检索 Top-K 条。
    
    支持两种模式：
    - 片段携带 embedding 字段时：用预计算向量，只计算查询向量
    - 无 embedding 字段时：实时计算所有片段 embedding（兜底）
    """
    logger.info(f"接收到检索请求: entity={request.entity_name}, segments={len(request.wiki_segments)}")
    
    try:
        state = {
            "entity_name": request.entity_name,
            "entity_alias": request.entity_alias,
            "population_name": request.population_name,
            "scene_name": request.scene_name,
            "user_text": request.user_text,
            "wiki_segments": [s.model_dump() for s in request.wiki_segments],
        }
        top_k_results, stats = retrieve_relevant_segments(state, top_k=request.top_k)
        logger.info(
            "检索完成: 候选 {} -> {}, 返回 {} 条 ({})",
            stats["total"], stats["candidates"], len(top_k_results), stats["mode"]
        )
        
        return RetrieveResponse(
            top_k_segments=top_k_results,
            used_segments=top_k_results
        )
        
    except Exception as e:
        logger.error("检索失败: {}", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate(request: AgentRequest) -> AgentResponse:
    logger.info(f"接收到生成请求: article_id={request.article_id}, step={request.step}, mode={request.mode}, "
                f"entity={request.entity_name}, population={request.population_name}, "
                f"template={request.template_name}, segments={len(request.wiki_segments or [])}条")
    start_time = time.time()
    
    try:
        if request.step == "outline":
            state = _build_outline_state(request)
            # Convert to dict for LangGraph
            state_dict = state if isinstance(state, dict) else state.model_dump()
            result_state = await _run_langgraph(outline_workflow, state_dict)
            content = result_state.get("article_outline") or ""
        elif request.step == "draft":
            state = _build_draft_state(request)
            state_dict = state if isinstance(state, dict) else state.model_dump()
            result_state = await _run_langgraph(draft_workflow, state_dict)
            content = result_state.get("initial_draft") or ""
        else:
            raise ValueError(f"未知的step类型: {request.step}")
        
        cost_time = int((time.time() - start_time) * 1000)
        
        # Build trace from state
        trace_entries = result_state.get("flow_trace") or []
        trace_list = [TraceEntry(**t) if isinstance(t, dict) else t for t in trace_entries]
        
        # Build quality metrics
        quality = None
        if request.step == "draft":
            quality = QualityMetrics(
                fact_check_passed=result_state.get("is_fact_ok", True) or False,
                rule_check_passed=result_state.get("rule_passed", True) or False,
                retry_count=result_state.get("retry_times", 0),
            )
        
        # Build token usage
        token_data = None
        tu = result_state.get("token_usage")
        if tu:
            if hasattr(tu, 'summary'):
                token_data = tu.summary()
            elif hasattr(tu, 'model_dump'):
                # Pydantic model from state.py TokenUsage
                token_data = tu.model_dump()
            elif isinstance(tu, dict):
                token_data = tu
        
        logger.info(f"生成完成: article_id={request.article_id}, 耗时={cost_time}ms, 长度={len(content)}")
        
        return AgentResponse(
            content=content,
            quality_metrics=quality,
            trace=trace_list,
            token_usage=token_data,
            generation_meta={"total_cost_ms": cost_time, "content_length": len(content)}
        )
    
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error("生成失败: type={}, msg={}, traceback:\n{}", type(e).__name__, str(e) or "(空)", tb)
        # 返回详细错误信息方便调试
        detail_msg = f"{type(e).__name__}: {str(e) or '(无详细信息)'}"
        raise HTTPException(status_code=500, detail=detail_msg)


def _sse(event: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


@router.post("/generate/stream")
async def generate_stream(request: AgentRequest):
    """SSE 流式生成接口，输出 progress/delta/done/error 事件。"""

    async def event_generator():
        logger.info(
            f"接收到流式生成请求: article_id={request.article_id}, step={request.step}, "
            f"entity={request.entity_name}, segments={len(request.wiki_segments or [])}条"
        )
        start_time = time.time()
        result_state = {}
        streamed_chunks = []
        callback_token = None
        event_callback_token = None

        try:
            yield _sse("progress", {"message": "开始生成", "step": request.step})

            queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()

            async def stream_callback(delta: str):
                if delta:
                    await queue.put(("delta", {"delta": delta}))

            async def stream_event_callback(event: str, data: dict):
                await queue.put((event, data or {}))

            callback_token = set_stream_callback(stream_callback)
            event_callback_token = set_stream_event_callback(stream_event_callback)

            if request.step == "outline":
                state = _build_outline_state(request)
                state_dict = state if isinstance(state, dict) else state.model_dump()
                task = asyncio.create_task(_run_langgraph(outline_workflow, state_dict))
            elif request.step == "draft":
                state = _build_draft_state(request)
                state_dict = state if isinstance(state, dict) else state.model_dump()
                task = asyncio.create_task(_run_langgraph(draft_workflow, state_dict))
            else:
                raise ValueError(f"未知的step类型: {request.step}")

            while not task.done() or not queue.empty():
                try:
                    event, data = await asyncio.wait_for(queue.get(), timeout=0.2)
                    if event == "replace":
                        content = data.get("content", "")
                        streamed_chunks = [content] if content else []
                        yield _sse("replace", {"content": content})
                        continue

                    chunk = data.get("delta", "")
                    if chunk:
                        if not streamed_chunks:
                            first_chunk_ms = int((time.time() - start_time) * 1000)
                            logger.info(
                                f"SSE 首段到达: article_id={request.article_id}, "
                                f"step={request.step}, cost={first_chunk_ms}ms"
                            )
                        streamed_chunks.append(chunk)
                        yield _sse("delta", {"delta": chunk})
                except asyncio.TimeoutError:
                    yield _sse("progress", {"message": "生成中", "step": request.step})

            result_state = await task
            content = (
                result_state.get("article_outline")
                if request.step == "outline"
                else result_state.get("initial_draft")
            ) or ""

            full_text = "".join(streamed_chunks)
            if not full_text:
                raise RuntimeError(
                    "模型生成已结束，但没有收到任何实时 SSE 文本增量；"
                    "已拒绝使用生成完成后的伪流式输出"
                )
            elif full_text != content and content.startswith(full_text):
                tail = content[len(full_text):]
                if tail:
                    full_text += tail
                    yield _sse("delta", {"delta": tail})
            elif full_text != content:
                full_text = content
                yield _sse("replace", {"content": full_text})
            else:
                full_text = content

            cost_time = int((time.time() - start_time) * 1000)
            trace_entries = result_state.get("flow_trace") or []
            token_data = None
            tu = result_state.get("token_usage")
            if tu:
                if hasattr(tu, "summary"):
                    token_data = tu.summary()
                elif hasattr(tu, "model_dump"):
                    token_data = tu.model_dump()
                elif isinstance(tu, dict):
                    token_data = tu

            logger.info(
                f"流式生成完成: article_id={request.article_id}, step={request.step}, "
                f"耗时={cost_time}ms, 长度={len(full_text)}"
            )
            yield _sse("done", {
                "content": full_text,
                "trace": trace_entries,
                "token_usage": token_data,
                "generation_meta": {
                    "total_cost_ms": cost_time,
                    "content_length": len(full_text),
                },
            })

        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error("流式生成失败: type={}, msg={}, traceback:\n{}", type(e).__name__, str(e), tb)
            yield _sse("error", {"message": f"{type(e).__name__}: {str(e) or '(无详细信息)'}"})

        finally:
            if callback_token is not None:
                reset_stream_callback(callback_token)
            if event_callback_token is not None:
                reset_stream_event_callback(event_callback_token)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _run_langgraph(compiled_graph, state_dict: dict) -> dict:
    """
    使用 LangGraph astream 执行工作流
    
    Args:
        compiled_graph: LangGraph compiled state graph
        state_dict: Initial state as dict
        
    Returns:
        Final merged state after all nodes complete
    """
    result_state = dict(state_dict)
    
    async for event in compiled_graph.astream(state_dict, stream_mode="updates"):
        for node_name, node_output in event.items():
            if isinstance(node_output, dict):
                result_state.update(node_output)
                logger.debug(f"LangGraph 节点 [{node_name}] 完成")
    
    return result_state


def _build_outline_state(request: AgentRequest) -> AgentState:
    # 转换 wiki_segments 为 dict 列表（保留预计算的 embedding 向量）
    wiki_segments_list = []
    if request.wiki_segments:
        for s in request.wiki_segments:
            seg_dict = {
                "id": s.id,
                "entity_id": s.entity_id,
                "owner_entity_type": s.owner_entity_type,
                "content": s.content,
                "source": s.source or ""
            }
            if s.embedding:
                seg_dict["embedding"] = s.embedding
            wiki_segments_list.append(seg_dict)
    
    state: AgentState = {
        "mode": request.mode,
        "step": request.step,
        "article_id": request.article_id,
        "entity_name": request.entity_name or "",
        "entity_alias": request.entity_alias or "",
        "population_name": request.population_name or "",
        "scene_name": request.scene_name or "",
        "template_name": request.template_name or "",
        "template_purpose": request.template_purpose or "",
        "template_tone": request.template_tone or "",
        "template_outline": request.template_outline or "",
        "word_count": request.word_count or 800,
        "user_text": request.user_text or "",
        "entity_type": None,
        "parsed_entity_name": None,
        "parsed_population_name": None,
        "parsed_scene_name": None,
        "main_wiki_entity": None,
        "related_wiki_list": None,
        "top_k_segment_list": [],
        "wiki_rule": {
            "must_include": request.must_include or [],
            "must_not_say": request.must_not_say or []
        },
        "match_template": {
            "template_name": request.template_name or "",
            "template_purpose": request.template_purpose or "",
            "template_tone": request.template_tone or "",
            "template_outline": request.template_outline or ""
        },
        "article_outline": None,
        "initial_draft": None,
        "final_article": None,
        "check_report": None,
        "is_fact_ok": None,
        "rule_passed": None,
        "retry_times": 0,
        "confirm_template": False,
        "confirm_outline": False,
        "confirm_draft": False,
        "flow_trace": None,
        "wiki_segments": wiki_segments_list,
        "must_include": request.must_include or [],
        "must_not_say": request.must_not_say or []
    }
    return state


def _build_draft_state(request: AgentRequest) -> AgentState:
    state = _build_outline_state(request)
    # 将之前的大纲内容赋值给 article_outline，用于生成初稿
    state["article_outline"] = request.previous_content or ""
    return state


@router.get("/health")
async def health_check():
    return {"status": "healthy"}


class ImageGenerateRequest(BaseModel):
    article_id: Optional[int] = None
    draft_content: str
    style: Optional[str] = "health_science"
    max_images: Optional[int] = 1


@router.post("/generate-images")
async def generate_images(request: ImageGenerateRequest) -> dict:
    """配图生成接口：分析文章段落并生成配图"""
    logger.info(f"接收到配图生成请求: article_id={request.article_id}, 内容长度={len(request.draft_content)}")

    try:
        # Step 1: 分析段落，判断哪些需要配图
        section_skill = SectionAnalyzeSkill()
        state = {
            "initial_draft": request.draft_content,
            "article_id": request.article_id,
        }
        analyze_result = await section_skill.execute(state)
        sections = analyze_result.get("article_sections", [])
        logger.info(f"段落分析完成: 共 {len(sections)} 个段落")

        # Step 2: 生成配图
        image_skill = ImageGenerateSkill()
        image_state = {
            "article_sections": sections,
            "article_id": request.article_id,
            "image_style": request.style,
            "max_images": request.max_images,
        }
        image_result = await image_skill.execute(image_state)
        images = image_result.get("generated_images", [])
        logger.info(f"配图生成完成: 共 {len(images)} 张")

        return {
            "sections": sections,
            "images": images,
            "total": len(images),
        }

    except Exception as e:
        logger.error("配图生成失败: {}", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# 系统架构图（基于实际代码）

最后更新：2026-07-19

本图基于 v1.3.0 实际代码绘制，对应 `cdc-backend`、`cdc-agent`、`cdc-frontend`、`db/`、`deploy/`。和 [../ARCHITECTURE.md](../ARCHITECTURE.md) 文字描述保持一致。

## 1. 三服务容器视角（部署态）

```text
                  ┌────────────────────────────────────────┐
                  │         浏览器 (React SPA)              │
                  │   AppShell + 6 路由 + Radix UI         │
                  └──────────────┬─────────────────────────┘
                                 │  http://localhost:80
                                 ▼
                  ┌────────────────────────────────────────┐
                  │     nginx (cdc-nginx :80)              │
                  │   /api/*  → backend                    │
                  │   /api/agent/* → agent                 │
                  │   /uploads/*  → agent                  │
                  │   /*  → frontend                       │
                  └──────┬──────────┬───────────┬──────────┘
                         │          │           │
       ┌─────────────────┘          │           └──────────────────┐
       ▼                            ▼                              ▼
┌──────────────────┐       ┌──────────────────┐         ┌──────────────────┐
│ cdc-frontend     │       │ cdc-backend      │         │ cdc-agent        │
│ React 18 + Vite  │       │ Spring Boot 4    │         │ FastAPI +        │
│ (Nginx 内嵌)     │       │ Java 21 :8080    │         │ LangGraph :8001  │
│ 内嵌 nginx :80   │       │                  │         │                  │
└──────────────────┘       └────────┬─────────┘         └────────┬─────────┘
                                   │                            │
                                   │  MyBatis                  │  OpenAI 兼容
                                   │                            │
                                   ▼                            ▼
                          ┌──────────────────┐         ┌──────────────────┐
                          │  cdc-mysql :3306 │         │ DashScope (Qwen) │
                          │  cdc_knowledge   │         │  LLM + Embedding │
                          │  15 张表         │         │  + Image         │
                          └────────┬─────────┘         └──────────────────┘
                                   │                            ▲
                                   │                            │
                                   │  Embedding REST 直连       │
                                   └────────────────────────────┘
```

## 2. 后端 Java 组件视角

```text
                                    HTTP 请求
                                       │
                                       ▼
                       ┌──────────────────────────────────┐
                       │   Spring MVC Controllers (7 个)    │
                       │                                    │
                       │ ArticleController                 │ ←─ /api/article/{id}/*
                       │ ArticleGenerateController         │ ←─ /api/article/generate*
                       │ ArticleFormController             │ ←─ /api/article/form/dropdown
                       │ ArticleImageController            │ ←─ /api/article-image/*
                       │ WikiController                    │ ←─ /api/wiki/*
                       │ WikiUploadController              │ ←─ /api/wiki/upload/*
                       │ CdcLlmConfigController            │ ←─ /api/llm-config/*
                       │ CdcArticleTemplateController      │ ←─ /api/template/*
                       └────────────────┬─────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────┐
                       │   Service Layer (8 个)              │
                       │                                    │
                       │ ArticleServiceImpl                │
                       │  ├ buildContextFromArticle()      │
                       │  │  ├ WikiService.listAll/getById │
                       │  │  ├ CdcArticleRequestMapper     │
                       │  │  ├ WikiSegmentEmbeddingMapper  │
                       │  │  └ EmbeddingService            │
                       │  │     (惰性补算缺 embedding 的)   │
                       │  ├ streamGeneration()             │
                       │  │  └ AgentClient.streamOutline   │
                       │  │     / streamDraft              │
                       │  │     (SSE → 前端)               │
                       │  ├ saveManualContent()            │
                       │  │  (留痕：manual_edit)           │
                       │  ├ captureAutoSave()              │
                       │  │  (留痕：autosave_pending)      │
                       │  └ revertToModification()         │
                       │                                    │
                       │ WikiServiceImpl                   │
                       │  ├ add/update/deleteSegment       │
                       │  │  → publishEvent CREATED/UPDATED │
                       │  └ deleteSegment                  │
                       │     → publishEvent DELETED        │
                       │                                    │
                       │ WikiUploadServiceImpl             │
                       │  ├ uploadAndPreview()             │
                       │  │  (parseFile → PreviewDTO)      │
                       │  └ confirm()                      │
                       │     (deleteExistingEntity → DELETED│
                       │      insert new → CREATED)        │
                       │                                    │
                       │ EmbeddingService (NEW)            │
                       │  ├ computeEmbedding(text)         │
                       │  └ computeEmbeddingsWithCache()   │
                       │     (cdc_embedding_cache 哈希去重) │
                       │                                    │
                       │ ArticleImageService               │
                       │ CdcLlmConfigService               │
                       │ CdcArticleRequestService          │
                       │ CdcArticleTemplateService         │
                       └────────────────┬─────────────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  │                     │                     │
                  ▼                     ▼                     ▼
       ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
       │ AgentClient      │  │ MyBatis Mappers  │  │ Spring Events    │
       │ (httpx + Java 11 │  │ (14 个)           │  │                  │
       │  HttpClient SSE) │  │                  │  │ SegmentChanged   │
       │                  │  │ + cdc_upload_task│  │   Event          │
       │ buildParams()    │  │ + cdc_embedding  │  │       │          │
       │ buildAndCall()   │  │   _cache         │  │       ▼          │
       │ buildAndStream() │  │ + wiki_segment_  │  │ EmbeddingEvent   │
       │ handleSseMessage │  │   embedding      │  │ Listener         │
       └────────┬─────────┘  └──────────────────┘  │ (@Async)         │
                │                                    │                  │
                │ HTTP/SSE                           │ ┌──────────────┐ │
                ▼                                    │ │embeddingExec │ │
       ┌──────────────────┐                         │ │utor 线程池   │ │
       │ cdc-agent :8001  │                         │ └──────────────┘ │
       └──────────────────┘                         └──────────────────┘
```

## 3. Agent Python 组件视角

```text
                          HTTP 请求 (后端 AgentClient / 前端 fetch)
                                       │
                                       ▼
                       ┌──────────────────────────────────┐
                       │   FastAPI Routers                │
                       │                                    │
                       │ /api/agent/parse-intent            │ ←─ ArticleServiceImpl
                       │ /api/agent/retrieve                │ ←─ (调试用)
                       │ /api/agent/generate                │ ←─ 同步生成
                       │ /api/agent/generate/stream         │ ←─ 流式生成 (SSE)
                       │ /api/agent/generate-images         │ ←─ 配图
                       │ /api/agent/upload-image            │ ←─ 用户配图
                       │ /api/agent/embedding/test          │ ←─ 调试
                       │ /api/agent/health                  │ ←─ 健康检查
                       └────────────────┬─────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────┐
                       │   Workflow Layer (LangGraph)       │
                       │                                    │
                       │ outline_workflow (compiled)        │
                       │ draft_workflow   (compiled)        │
                       │                                    │
                       │ 公共节点：                          │
                       │   intent_parse / skip_intent       │
                       │   compress_input                    │
                       │   entity_extract                    │
                       │   wiki_relation                     │
                       │   preprocess (epidemic/vaccine/     │
                       │                general)             │
                       │   skill_planner                    │
                       │   segment_filter  ─┐                │
                       │   template_load   ─┴ 并行           │
                       │   compress_knowledge                │
                       │ draft 专属：                        │
                       │   outline_generate / outline_validate │
                       │     / outline_regenerate (≤2 重试) │
                       │   fusion_generate                   │
                       │   fact_check ‖ rule_check ‖         │
                       │     style_check  (并行)             │
                       │   quality_gate                      │
                       │     ├ rule_fail → rule_reflect     │
                       │     ├ fact_fail → reflect_iterate   │
                       │     │              (≤3 重试)        │
                       │     ├ style<0.7 → polish            │
                       │     └ finalize                     │
                       └────────────────┬─────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────┐
                       │   Node Registry (17 个已注册节点，   │
                       │     按注册名 name 列出)              │
                       │                                    │
                       │ parsing: intent_parse, compress      │
                       │ retrieval: entity_fetch,           │
                       │            relation_fetch,          │
                       │            template_extract        │
                       │ generation: outline_generate,      │
                       │              fusion_generate       │
                       │ validation: fact_check,            │
                       │             rule_check,            │
                       │             outline_validate,      │
                       │             style_check            │
                       │ iteration: reflect_iterate,        │
                       │             rule_reflect            │
                       │ polish: polish                     │
                       │ planning: skill_planner            │
                       │ image: section_analyze,            │
                       │        image_generate              │
                       └────────────────┬─────────────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  │                     │                     │
                  ▼                     ▼                     ▼
       ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
       │ Core Layer       │  │ Tools Layer      │  │ Writing 知识    │
       │                  │  │                  │  │ Knowledge        │
       │ LLMClient        │  │ VectorStore      │  │ (6 层)          │
       │  (httpx +        │  │  search_with_    │  │                  │
       │   asyncio.Sema-  │  │   embeddings     │  │ Layer 0 index    │
       │   phore(5) +     │  │                  │  │ Layer 1 univer-  │
       │   tenacity retry)│  │ RAGRetrieval     │  │   sal_rules      │
       │                  │  │  prefilter +     │  │ Layer 2 blue-    │
       │ LLMClientPool    │  │  retrieve_rele-  │  │   prints         │
       │  (60s TTL,       │  │  vant_segments   │  │ Layer 3 audi-    │
       │   ConfigManager) │  │                  │  │   ences          │
       │                  │  │ ContentFormat    │  │ Layer 4 tech-    │
       │ EmbeddingModel   │  │                  │  │   niques         │
       │  (text-embed-    │  │                  │  │ Layer 5 quality  │
       │   ding-v2)       │  │                  │  │                  │
       └────────┬─────────┘  └──────────────────┘  └──────────────────┘
                │
                │ OpenAI 兼容 REST
                ▼
       ┌──────────────────┐
       │ DashScope        │
       │ Qwen / Embedding │
       │ / Image          │
       └──────────────────┘
```

## 4. Embedding 数据生命周期（事件驱动）

```text
  任何 wiki_segment 写操作               异步线程 (embeddingExecutor)
  ─────────────────────────              ─────────────────────────────
  WikiUploadServiceImpl.confirm()
    ├ entityMapper.insert()
    └ segmentMapper.insert()
        ↓ publishEvent CREATED       EmbeddingEventListener.onSegmentChanged
                                       ├ computeContentHash (MD5)
                                       ├ EmbeddingService.computeEmbeddingsWithCache
                                       │    ├ 查 cdc_embedding_cache → 命中复用
                                       │    └ 未命中 → POST DashScope /embeddings
                                       │              ↓
                                       │            cdc_embedding_cache.upsert
                                       └ wiki_segment_embedding.upsert

  WikiServiceImpl.updateSegment()      ↗
    └ segmentMapper.update()
        ↓ publishEvent UPDATED

  WikiServiceImpl.deleteSegment()      EmbeddingEventListener.onSegmentChanged
    └ segmentMapper.delete()           └ handleDelete → deleteBySegmentId
        ↓ publishEvent DELETED           (删除 wiki_segment_embedding 记录)

  WikiUploadServiceImpl.confirm() 命中同名旧实体
    ├ deleteExistingEntity()
    │    └ for each old segment: publishEvent DELETED
    └ 触发上面 delete 链路
```

## 5. 文章生成 SSE 时序（draft 工作流）

```text
浏览器                nginx             Java Backend              Python Agent            DashScope
  │                     │                    │                         │                       │
  │ POST /article/{id}/                      │                         │                       │
  │ generate-draft/stream │────────────────► │                         │                       │
  │                       │                   │ buildContextFromArticle │                       │
  │                       │                   │   lazyComputeEmbeddings │ ─ POST /embeddings ─►│
  │                       │                   │   ↓                     │ ◄─ vectors ─────────│
  │                       │                   │ AgentClient.streamDraft│                       │
  │                       │                   │                         │                       │
  │                       │                   │ SSE POST                │                       │
  │                       │                   │ /api/agent/generate/    │                       │
  │                       │                   │ stream ────────────────► │                       │
  │                       │                   │                         │ skip_intent           │
  │                       │                   │                         │ entity_extract        │
  │                       │                   │                         │ wiki_relation         │
  │                       │                   │                         │ preprocess            │
  │                       │                   │                         │ skill_planner         │
  │                       │                   │                         │ segment_filter        │
  │                       │                   │                         │   (prefilter + cosine)│
  │                       │                   │                         │ template_load         │
  │                       │                   │                         │ compress_knowledge    │
  │                       │                   │                         │ fusion_generate ────► │
  │                       │                   │                         │ ◄─ LLM stream ───────│
  │                       │                   │ ◄─── SSE delta ──────── │                       │
  │ ◄── SSE progress ─── │ ◄───────────────── │                         │                       │
  │ ◄── SSE delta ────── │ ◄───────────────── │                         │                       │
  │ ◄── SSE delta ────── │ ◄───────────────── │                         │ fact_check           │
  │ ◄── SSE replace ──── │ ◄───────────────── │                         │   (必要时)           │
  │ ◄── SSE delta ────── │ ◄───────────────── │ ◄─── SSE delta ─────── │ rule_check (并行)    │
  │                       │                   │                         │ style_check          │
  │                       │                   │                         │ quality_gate          │
  │                       │                   │                         │   → reflect_iterate  │
  │                       │                   │                         │     或 polish        │
  │                       │                   │                         │     或 finalize      │
  │                       │                   │                         │                       │
  │ ◄── SSE done {content, │ ◄─────────────── │ persist status=3        │                       │
  │          citedSegmentCount,                │ update generation_meta  │                       │
  │          citedSegmentIds}                  │ saveTrace               │                       │
  │                       │                   │                         │                       │
  │ (前端写入 textarea，Workbench 显示)        │                         │                       │
```

## 6. 状态机视角

```text
        createArticle                  generate-outline                  generate-draft
  ─────────────────────►   ──────────────────────────►   ──────────────────────────►

   status=1              status=2                      status=3
   待生成大纲              大纲编辑中                     初稿编辑中

   ◄─────────────────  ◄──────────────────  ◄──────────────────
        regenerate         regenerate          regenerate
                                                          │
                                                          ▼ confirm-draft
                                                    status=4
                                                    终稿已确认

   所有 AI 步骤支持同步版 + /stream 版（SSE）：
     /generate-outline  ↔  /generate-outline/stream
     /generate-draft    ↔  /generate-draft/stream
     /regenerate-outline ↔ /regenerate-outline/stream
     /regenerate-draft  ↔  /regenerate-draft/stream

   修改历史 cdc_article_modification.operation_type：
     manual_edit          —— PUT /outline 或 /draft 触发
     ai_regenerate        —— regenerate-* 触发
     autosave_pending     —— autosave 触发
     revert               —— /revert 触发
```

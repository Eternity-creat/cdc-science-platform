package com.cdc.cdcbackend.service.impl;

import com.cdc.cdcbackend.common.PageResult;
import com.cdc.cdcbackend.dto.*;
import com.cdc.cdcbackend.entity.*;
import com.cdc.cdcbackend.mapper.*;
import com.cdc.cdcbackend.agent.AgentClient;
import com.cdc.cdcbackend.service.ArticleService;
import com.cdc.cdcbackend.service.EmbeddingService;
import com.cdc.cdcbackend.service.WikiService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import com.cdc.cdcbackend.config.AgentConfig;

@Service
public class ArticleServiceImpl implements ArticleService {

    private static final Logger log = LoggerFactory.getLogger(ArticleServiceImpl.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Resource
    private CdcArticleRequestMapper requestMapper;

    @Resource
    private CdcArticleMapper articleMapper;

    @Resource
    private CdcArticleModificationMapper modifyMapper;

    @Resource
    private CdcAgentTraceMapper traceMapper;

    @Resource
    private AgentClient agentClient;

    @Resource
    private WikiEntityMapper wikiEntityMapper;

    @Resource
    private WikiRuleMapper wikiRuleMapper;

    @Resource
    private WikiSegmentMapper segmentMapper;

    @Resource
    private WikiRelationMapper relationMapper;

    @Resource
    private CdcArticleTemplateMapper articleTemplateMapper;

    @Resource
    private WikiService wikiService;

    @Resource
    private AgentConfig agentConfig;

    @Resource
    private EmbeddingService embeddingService;

    @Resource
    private WikiSegmentEmbeddingMapper embeddingMapper;

    // BUG-NEW-12 fix: 注入 imageMapper 用于删除文章时级联清理配图
    @Resource
    private CdcArticleImageMapper articleImageMapper;

    @Override
    public Long createEmptyArticle(Long requestId, Long templateId) {
        CdcArticle article = new CdcArticle();
        article.setRequestId(requestId);
        article.setTemplateId(templateId);
        article.setStatus(1);
        article.setCreateTime(LocalDateTime.now());
        article.setUpdateTime(LocalDateTime.now());

        articleMapper.insert(article);
        return article.getId();
    }

    @Override
    public CdcArticle getArticle(Long id) {
        return articleMapper.getById(id);
    }

    // BUG-NEW-4 fix: 安全的 getArticle，不存在时抛出异常而非返回 null 导致 NPE
    private CdcArticle getArticleOrThrow(Long id) {
        CdcArticle article = articleMapper.getById(id);
        if (article == null) {
            throw new RuntimeException("文章不存在: id=" + id);
        }
        return article;
    }

    @Override
    public List<ArticleListItemDTO> listArticles() {
        return articleMapper.listAll();
    }

    @Override
    public PageResult<ArticleListItemDTO> listArticlesPaged(int page, int size, Integer status, String keyword) {
        // BUG-NEW-11 fix: 防止 page < 1 导致 offset 为负数
        page = Math.max(1, page);
        int offset = (page - 1) * size;
        long total = articleMapper.count(status, keyword);
        List<ArticleListItemDTO> list = articleMapper.listPaged(offset, size, status, keyword);
        return PageResult.of(list, total, page, size);
    }

    @Override
    public ArticleCreateResult createArticle(CdcArticleRequest request) {
        // 1. 保存请求记录
        request.setCreateTime(LocalDateTime.now());
        requestMapper.insert(request);

        // 2. 创建文章
        CdcArticle article = new CdcArticle();
        article.setRequestId(request.getId());
        article.setTemplateId(request.getTemplateId());
        article.setStatus(1);
        article.setCreateTime(LocalDateTime.now());
        article.setUpdateTime(LocalDateTime.now());
        articleMapper.insert(article);

        // 3. 获取上下文
        WikiTemplateContext context = buildContextFromArticle(article.getId());

        return new ArticleCreateResult(article.getId(), article.getStatus(), context);
    }

    @Override
    public WikiTemplateContext getContext(Long articleId) {
        return buildContextFromArticle(articleId);
    }

    private WikiTemplateContext buildContextFromArticle(Long articleId) {
        WikiTemplateContext context = new WikiTemplateContext();

        // 1. 查询请求记录
        CdcArticle article = articleMapper.getById(articleId);
        CdcArticleRequest req = requestMapper.getById(article.getRequestId());

        // 2. 查询实体
        WikiEntity entity = wikiEntityMapper.getById(req.getEntityId());
        WikiEntity population = wikiEntityMapper.getById(req.getPopulationId());
        WikiEntity scene = wikiEntityMapper.getById(req.getSceneId());
        CdcArticleTemplate template = articleTemplateMapper.getById(req.getTemplateId());

        // 设置实体信息
        if (entity != null) {
            WikiTemplateContext.WikiEntityInfo entityInfo = new WikiTemplateContext.WikiEntityInfo();
            entityInfo.setId(entity.getId());
            entityInfo.setStdName(entity.getStdName());
            entityInfo.setAlias(entity.getAlias());
            entityInfo.setSummary(entity.getSummary());
            context.setEntity(entityInfo);
        }

        if (population != null) {
            WikiTemplateContext.WikiEntityInfo popInfo = new WikiTemplateContext.WikiEntityInfo();
            popInfo.setId(population.getId());
            popInfo.setStdName(population.getStdName());
            popInfo.setAlias(population.getAlias());
            popInfo.setSummary(population.getSummary());
            context.setPopulation(popInfo);
        }

        if (scene != null) {
            WikiTemplateContext.WikiEntityInfo sceneInfo = new WikiTemplateContext.WikiEntityInfo();
            sceneInfo.setId(scene.getId());
            sceneInfo.setStdName(scene.getStdName());
            sceneInfo.setAlias(scene.getAlias());
            sceneInfo.setSummary(scene.getSummary());
            context.setScene(sceneInfo);
        }

        // 设置模板信息
        if (template != null) {
            WikiTemplateContext.TemplateInfo templateInfo = new WikiTemplateContext.TemplateInfo();
            templateInfo.setId(template.getId());
            templateInfo.setTemplateName(template.getTemplateName());
            templateInfo.setPurpose(template.getPurpose());
            templateInfo.setTone(template.getTone());
            templateInfo.setOutlineStructure(template.getOutlineStructure());
            context.setTemplate(templateInfo);
        }

        // 3. 查询关联实体
        List<Long> allEntityIds = new ArrayList<>();
        allEntityIds.add(req.getEntityId());

        if (req.getPopulationId() != null) {
            allEntityIds.add(req.getPopulationId());
        }
        if (req.getSceneId() != null) {
            allEntityIds.add(req.getSceneId());
        }

        // 获取主实体的关联实体
        List<WikiRelation> relations = relationMapper.listByFromEid(req.getEntityId());
        for (WikiRelation rel : relations) {
            allEntityIds.add(rel.getToEid());
        }

        context.setEntityIds(allEntityIds);

        // 4. 查询所有实体的片段（含预计算向量）
        List<WikiTemplateContext.WikiSegmentInfo> segments = new ArrayList<>();
        for (Long entityId : allEntityIds) {
            List<WikiSegmentEmbeddingDTO> segs = segmentMapper.listWithEmbeddingByEntityId(entityId);
            for (WikiSegmentEmbeddingDTO s : segs) {
                WikiTemplateContext.WikiSegmentInfo segInfo = new WikiTemplateContext.WikiSegmentInfo();
                segInfo.setId(s.getId());
                segInfo.setEntityId(s.getEntityId());
                segInfo.setContent(s.getContent());
                segInfo.setSource(s.getSource());
                segInfo.setEmbedding(s.getEmbedding());
                segments.add(segInfo);
            }
        }

        // 4.5 惰性补算：对缺少 embedding 的片段，批量计算并持久化
        lazyComputeEmbeddings(segments);

        context.setSegments(segments);

        // 5. 查询所有实体的规则
        List<String> mustInclude = new ArrayList<>();
        List<String> mustNotSay = new ArrayList<>();
        List<String> allRules = new ArrayList<>();

        for (Long entityId : allEntityIds) {
            List<WikiRule> rules = wikiRuleMapper.listByEntityId(entityId);
            for (WikiRule r : rules) {
                allRules.add(r.getContent());
                if ("MustInclude".equals(r.getRuleType())) {
                    mustInclude.add(r.getContent());
                } else if ("MustNotSay".equals(r.getRuleType())) {
                    mustNotSay.add(r.getContent());
                }
            }
        }
        context.setRules(allRules);
        context.setMustInclude(mustInclude);
        context.setMustNotSay(mustNotSay);

        return context;
    }

    /**
     * 惰性 embedding 补算：
     * 1. 从已有 segments 中筛出缺少 embedding 的条目
     * 2. 调用 EmbeddingService（带 cdc_embedding_cache 缓存）批量计算
     * 3. 写入 wiki_segment_embedding 表（持久化）
     * 4. 回填到内存中的 segment 对象，使后续 Agent 调用走预计算模式
     */
    private void lazyComputeEmbeddings(List<WikiTemplateContext.WikiSegmentInfo> segments) {
        // 筛选缺少 embedding 的片段
        List<WikiTemplateContext.WikiSegmentInfo> missing = segments.stream()
                .filter(s -> s.getEmbedding() == null || s.getEmbedding().isEmpty())
                .collect(Collectors.toList());

        if (missing.isEmpty()) {
            return;
        }

        log.info("惰性补算: 发现 {} 个片段缺少 embedding，开始计算...", missing.size());
        long start = System.currentTimeMillis();

        try {
            List<String> texts = missing.stream()
                    .map(WikiTemplateContext.WikiSegmentInfo::getContent)
                    .collect(Collectors.toList());
            List<Long> sourceIds = missing.stream()
                    .map(WikiTemplateContext.WikiSegmentInfo::getId)
                    .collect(Collectors.toList());

            // 带缓存的批量计算（先查 cdc_embedding_cache，未命中再调 API）
            List<List<Double>> vectors = embeddingService.computeEmbeddingsWithCache(
                    texts, "segment", sourceIds);

            String modelVersion = embeddingService.getModelVersion();
            int computed = 0;

            for (int i = 0; i < missing.size(); i++) {
                List<Double> vec = (i < vectors.size()) ? vectors.get(i) : null;
                if (vec == null || vec.isEmpty()) {
                    continue;
                }

                WikiTemplateContext.WikiSegmentInfo seg = missing.get(i);
                String embeddingJson = embeddingService.serializeVector(vec);

                // 持久化到 wiki_segment_embedding 表
                WikiSegmentEmbedding emb = new WikiSegmentEmbedding();
                emb.setSegmentId(seg.getId());
                emb.setEntityId(seg.getEntityId());
                emb.setContentHash(embeddingService.computeContentHash(seg.getContent()));
                emb.setEmbedding(embeddingJson);
                emb.setModelVersion(modelVersion);
                emb.setDimensions(vec.size());
                embeddingMapper.upsert(emb);

                // 回填到内存对象，Agent 调用时可直接使用
                seg.setEmbedding(embeddingJson);
                computed++;
            }

            int costMs = (int) (System.currentTimeMillis() - start);
            log.info("惰性补算完成: {}/{} 条成功, 耗时 {}ms", computed, missing.size(), costMs);

        } catch (Exception e) {
            log.error("惰性补算失败（不影响本次生成）: {}", e.getMessage(), e);
        }
    }

    @Override
    public String generateOutline(Long articleId) {
        CdcArticle article = getArticleOrThrow(articleId);
        CdcArticleRequest req = requestMapper.getById(article.getRequestId());

        WikiTemplateContext context = buildContextFromArticle(articleId);

        // 计时开始
        long start = System.currentTimeMillis();

        String outline = agentClient.generateOutline(articleId, req, context);

        int costTime = (int) (System.currentTimeMillis() - start);

        CdcArticle up = new CdcArticle();
        up.setId(articleId);
        up.setOutline(outline);
        up.setStatus(2);
        articleMapper.updateOutline(up);

        saveTrace(articleId, "generate_outline", req.toString(), outline, costTime);
        return outline;
    }

    @Override
    public String generateDraft(Long articleId) {
        CdcArticle article = getArticleOrThrow(articleId);
        CdcArticleRequest req = requestMapper.getById(article.getRequestId());

        WikiTemplateContext context = buildContextFromArticle(articleId);

        long start = System.currentTimeMillis();

        String previousContent = article.getOutline();

        String draft = agentClient.generateDraft(articleId, req, context, previousContent);

        int costTime = (int) (System.currentTimeMillis() - start);

        CdcArticle up = new CdcArticle();
        up.setId(articleId);
        up.setInitialDraft(draft);
        up.setStatus(3);
        articleMapper.updateInitialDraft(up);

        saveTrace(articleId, "generate_draft", req.toString(), draft, costTime);
        return draft;
    }

    @Override
    public SseEmitter generateOutlineStream(Long articleId) {
        return streamGeneration(articleId, "outline", false);
    }

    @Override
    public SseEmitter generateDraftStream(Long articleId) {
        return streamGeneration(articleId, "draft", false);
    }

    @Override
    public SseEmitter regenerateOutlineStream(Long articleId) {
        return streamGeneration(articleId, "outline", true);
    }

    @Override
    public SseEmitter regenerateDraftStream(Long articleId) {
        return streamGeneration(articleId, "draft", true);
    }

    private SseEmitter streamGeneration(Long articleId, String step, boolean regenerate) {
        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(() -> {
            CdcArticleModification pendingModification = null;
            try {
                CdcArticle article = getArticleOrThrow(articleId);
                CdcArticleRequest req = requestMapper.getById(article.getRequestId());
                WikiTemplateContext context = buildContextFromArticle(articleId);
                long start = System.currentTimeMillis();

                sendSse(emitter, "progress", Map.of(
                    "message", (regenerate ? "重新生成" : "生成") + ("outline".equals(step) ? "大纲" : "初稿")
                ));

                if (regenerate) {
                    pendingModification = createPendingRegenerateModification(article, step);
                }

                String previousContent = "draft".equals(step) ? article.getOutline() : null;
                String content = "outline".equals(step)
                    ? agentClient.streamOutline(articleId, req, context, chunk -> sendDelta(emitter, chunk))
                    : agentClient.streamDraft(articleId, req, context, previousContent, chunk -> sendDelta(emitter, chunk));

                int costTime = (int) (System.currentTimeMillis() - start);
                persistGeneratedContent(articleId, step, content);

                if (pendingModification != null) {
                    pendingModification.setAfterContent(content);
                    modifyMapper.updateById(pendingModification);
                }

                saveTrace(
                    articleId,
                    (regenerate ? "regenerate_" : "generate_") + step,
                    req.toString(),
                    content,
                    costTime
                );

                sendSse(emitter, "done", Map.of(
                    "content", content,
                    "costTime", costTime,
                    "step", step
                ));
                emitter.complete();
            } catch (Exception e) {
                log.error("SSE {} {} 失败: {}", regenerate ? "regenerate" : "generate", step, e.getMessage(), e);
                try {
                    sendSse(emitter, "error", Map.of("message", e.getMessage() == null ? "生成失败" : e.getMessage()));
                } finally {
                    emitter.complete();
                }
            }
        });
        return emitter;
    }

    private CdcArticleModification createPendingRegenerateModification(CdcArticle article, String step) {
        String before = "outline".equals(step) ? article.getOutline() : article.getInitialDraft();
        if (before == null) return null;

        CdcArticleModification m = new CdcArticleModification();
        m.setArticleId(article.getId());
        m.setModifyType("outline".equals(step) ? "outline" : "initial_draft");
        m.setOperationType("ai_regenerate");
        m.setBeforeContent(before);
        m.setAfterContent(null);
        m.setModifyTime(LocalDateTime.now());
        modifyMapper.insert(m);
        return m;
    }

    private void persistGeneratedContent(Long articleId, String step, String content) {
        CdcArticle up = new CdcArticle();
        up.setId(articleId);
        if ("outline".equals(step)) {
            up.setOutline(content);
            up.setStatus(2);
            articleMapper.updateOutline(up);
        } else {
            up.setInitialDraft(content);
            up.setStatus(3);
            articleMapper.updateInitialDraft(up);
        }
    }

    private void sendDelta(SseEmitter emitter, String delta) {
        sendSse(emitter, "delta", Map.of("delta", delta));
    }

    private void sendSse(SseEmitter emitter, String eventName, Object data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (IOException e) {
            throw new RuntimeException("SSE 发送失败: " + e.getMessage(), e);
        }
    }

    @Override
    public ArticleCreateResult generateFromText(String userText, Long templateId) {
        // 1. 调用 Agent 意图解析接口
        Map<String, Object> intentParams = new HashMap<>();
        intentParams.put("user_text", userText);

        RestTemplate restTemplate = new RestTemplate();
        String agentBaseUrl = agentConfig.getUrl();
        Map<String, Object> parsed = restTemplate.postForObject(
            agentBaseUrl + "/api/agent/parse-intent",
            intentParams,
            Map.class
        );

        if (parsed == null) {
            throw new RuntimeException("意图解析失败");
        }

        // 2. 根据解析结果查询数据库获取完整数据
        String entityName = (String) parsed.get("entity_name");
        String populationName = (String) parsed.get("population_name");
        String sceneName = (String) parsed.get("scene_name");
        Integer wordCount = (Integer) parsed.getOrDefault("word_count", 800);

        Integer entityType = getEntityType((String) parsed.get("entity_type"));

        WikiEntity entity = wikiEntityMapper.findByName(entityName, entityType);
        WikiEntity population = populationName != null ? wikiEntityMapper.findByName(populationName, 3) : null;
        WikiEntity scene = sceneName != null ? wikiEntityMapper.findByName(sceneName, 4) : null;

        if (entity == null) {
            throw new RuntimeException("未找到实体: " + entityName);
        }

        // 3. 创建请求记录
        CdcArticleRequest request = new CdcArticleRequest();
        request.setMode(2);
        request.setEntityType(entityType);
        request.setEntityId(entity.getId());
        request.setPopulationId(population != null ? population.getId() : null);
        request.setSceneId(scene != null ? scene.getId() : null);
        request.setTemplateId(templateId);
        request.setWordCount(wordCount);
        request.setUserText(userText);
        request.setCreateTime(LocalDateTime.now());
        requestMapper.insert(request);

        // 4. 创建文章
        CdcArticle article = new CdcArticle();
        article.setRequestId(request.getId());
        article.setTemplateId(templateId);
        article.setStatus(1);
        article.setCreateTime(LocalDateTime.now());
        article.setUpdateTime(LocalDateTime.now());
        articleMapper.insert(article);

        // 5. 获取上下文
        WikiTemplateContext context = buildContextFromArticle(article.getId());

        // 6. 生成大纲
        long start = System.currentTimeMillis();
        String outline = agentClient.generateOutline(article.getId(), request, context);
        int costTime = (int) (System.currentTimeMillis() - start);

        CdcArticle up = new CdcArticle();
        up.setId(article.getId());
        up.setOutline(outline);
        up.setStatus(2);
        articleMapper.updateOutline(up);

        saveTrace(article.getId(), "generate_outline", request.toString(), outline, costTime);

        return new ArticleCreateResult(article.getId(), article.getStatus(), context);
    }

    private Integer getEntityType(String typeStr) {
        if (typeStr == null) return 1;
        switch (typeStr.toLowerCase()) {
            case "disease": return 1;
            case "vaccine": return 2;
            case "population": return 3;
            case "scene": return 4;
            default: return 1;
        }
    }

    @Override
    @Transactional
    public boolean saveOutline(Long id, String newContent) {
        return saveManualContent(id, "outline", newContent, null);
    }

    @Override
    @Transactional
    public boolean saveDraft(Long id, String newContent) {
        return saveManualContent(id, "initial_draft", newContent, null);
    }

    @Override
    @Transactional
    public boolean confirmOutline(Long id, String content) {
        if (content != null) saveManualContent(id, "outline", content, 2);
        return true;
    }

    @Override
    public boolean confirmDraft(Long id) {
        CdcArticle article = getArticleOrThrow(id);
        if (article == null || article.getInitialDraft() == null) {
            throw new RuntimeException("文章不存在或尚无初稿");
        }

        // Use the current initialDraft (which user may have edited) as finalArticle
        CdcArticle up = new CdcArticle();
        up.setId(id);
        up.setFinalArticle(article.getInitialDraft());
        up.setStatus(4);
        return articleMapper.updateFinalArticle(up) > 0;
    }

    @Override
    public String regenerateOutline(Long articleId) {
        CdcArticle article = getArticleOrThrow(articleId);
        CdcArticleRequest req = requestMapper.getById(article.getRequestId());
        WikiTemplateContext context = buildContextFromArticle(articleId);

        // Save old outline to modification history
        if (article.getOutline() != null) {
            CdcArticleModification m = new CdcArticleModification();
            m.setArticleId(articleId);
            m.setModifyType("outline");
            m.setOperationType("ai_regenerate");
            m.setBeforeContent(article.getOutline());
            m.setAfterContent(null); // will be filled after generation
            m.setModifyTime(LocalDateTime.now());
            modifyMapper.insert(m);
        }

        long start = System.currentTimeMillis();
        String outline = agentClient.generateOutline(articleId, req, context);
        int costTime = (int) (System.currentTimeMillis() - start);

        // Update the modification record with the new content
        List<CdcArticleModification> mods = modifyMapper.listByArticleId(articleId);
        if (!mods.isEmpty()) {
            CdcArticleModification lastMod = mods.get(0);
            if ("ai_regenerate".equals(lastMod.getOperationType())) {
                lastMod.setAfterContent(outline);
                // BUG-NEW-5 fix: 用 updateById 替代 insert，避免重复插入记录
                modifyMapper.updateById(lastMod);
            }
        }

        CdcArticle up = new CdcArticle();
        up.setId(articleId);
        up.setOutline(outline);
        up.setStatus(2);
        articleMapper.updateOutline(up);

        saveTrace(articleId, "regenerate_outline", req.toString(), outline, costTime);
        return outline;
    }

    @Override
    public String regenerateDraft(Long articleId) {
        CdcArticle article = getArticleOrThrow(articleId);
        CdcArticleRequest req = requestMapper.getById(article.getRequestId());
        WikiTemplateContext context = buildContextFromArticle(articleId);

        // Save old draft to modification history
        if (article.getInitialDraft() != null) {
            CdcArticleModification m = new CdcArticleModification();
            m.setArticleId(articleId);
            m.setModifyType("initial_draft");
            m.setOperationType("ai_regenerate");
            m.setBeforeContent(article.getInitialDraft());
            m.setAfterContent(null);
            m.setModifyTime(LocalDateTime.now());
            modifyMapper.insert(m);
        }

        long start = System.currentTimeMillis();
        String previousContent = article.getOutline();
        String draft = agentClient.generateDraft(articleId, req, context, previousContent);
        int costTime = (int) (System.currentTimeMillis() - start);

        CdcArticle up = new CdcArticle();
        up.setId(articleId);
        up.setInitialDraft(draft);
        up.setStatus(3);
        articleMapper.updateInitialDraft(up);

        saveTrace(articleId, "regenerate_draft", req.toString(), draft, costTime);
        return draft;
    }

    @Override
    @Transactional
    public boolean autoSave(Long id, String field, String content) {
        String normalizedContent = normalizeContent(content);
        switch (field) {
            case "outline":
                return captureAutoSave(id, "outline", normalizedContent);
            case "initial_draft":
            case "draft":
                return captureAutoSave(id, "initial_draft", normalizedContent);
            case "final_article":
            case "final":
                CdcArticle up = new CdcArticle();
                up.setId(id);
                up.setFinalArticle(content);
                return articleMapper.autoSaveFinal(up) > 0;
            default:
                return false;
        }
    }

    /**
     * Auto-save updates the article immediately, but keeps the first value in a hidden
     * pending record so a later manual save can still produce a real before/after pair.
     */
    private boolean captureAutoSave(Long id, String modifyType, String content) {
        CdcArticle article = getArticleOrThrow(id);
        String current = normalizeContent(getContent(article, modifyType));
        CdcArticleModification pending = modifyMapper.getPending(id, modifyType);
        String baseline = pending == null ? current : normalizeContent(pending.getBeforeContent());

        if (pending == null && Objects.equals(current, content)) return true;

        if (pending == null) {
            pending = new CdcArticleModification();
            pending.setArticleId(id);
            pending.setModifyType(modifyType);
            pending.setOperationType("autosave_pending");
            pending.setBeforeContent(current);
            pending.setAfterContent(content);
            pending.setModifyTime(LocalDateTime.now());
            modifyMapper.insert(pending);
        } else {
            pending.setAfterContent(content);
            pending.setModifyTime(LocalDateTime.now());
            modifyMapper.updateById(pending);
        }

        return updateArticleContent(id, modifyType, content, null) > 0;
    }

    @Transactional
    private boolean saveManualContent(Long id, String modifyType, String rawContent, Integer status) {
        CdcArticle article = getArticleOrThrow(id);
        String content = normalizeContent(rawContent);
        String current = normalizeContent(getContent(article, modifyType));
        CdcArticleModification pending = modifyMapper.getPending(id, modifyType);
        String baseline = pending == null ? current : normalizeContent(pending.getBeforeContent());

        if (pending != null) {
            if (Objects.equals(baseline, content)) {
                modifyMapper.deleteById(pending.getId());
            } else {
                pending.setOperationType("manual_edit");
                pending.setAfterContent(content);
                pending.setModifyTime(LocalDateTime.now());
                modifyMapper.updateById(pending);
            }
        } else if (!Objects.equals(current, content)) {
            CdcArticleModification modification = new CdcArticleModification();
            modification.setArticleId(id);
            modification.setModifyType(modifyType);
            modification.setOperationType("manual_edit");
            modification.setBeforeContent(current);
            modification.setAfterContent(content);
            modification.setModifyTime(LocalDateTime.now());
            modifyMapper.insert(modification);
        }

        return updateArticleContent(id, modifyType, content, status) > 0;
    }

    private int updateArticleContent(Long id, String modifyType, String content, Integer status) {
        CdcArticle up = new CdcArticle();
        up.setId(id);
        up.setStatus(status);
        if ("outline".equals(modifyType)) {
            up.setOutline(content);
            return articleMapper.updateOutline(up);
        }
        up.setInitialDraft(content);
        return articleMapper.updateInitialDraft(up);
    }

    private String getContent(CdcArticle article, String modifyType) {
        return "outline".equals(modifyType) ? article.getOutline() : article.getInitialDraft();
    }

    private String normalizeContent(String content) {
        if (content == null) return "";
        String value = content;
        for (int i = 0; i < 6; i++) {
            String trimmed = value.trim();
            if (trimmed.length() < 2 || !trimmed.startsWith("\"") || !trimmed.endsWith("\"")) break;
            if (trimmed.startsWith("\"#") || trimmed.startsWith("\"##")) {
                value = trimmed.substring(1, trimmed.length() - 1);
                continue;
            }
            try {
                String decoded = objectMapper.readValue(trimmed, String.class);
                if (decoded == null) break;
                value = decoded;
            } catch (Exception e) {
                String inner = trimmed.substring(1, trimmed.length() - 1);
                if (!inner.contains("\\n") && !inner.contains("\\\"") && !inner.contains("\\\\")) break;
                value = inner
                        .replace("\\r\\n", "\n")
                        .replace("\\n", "\n")
                        .replace("\\\"", "\"")
                        .replace("\\\\", "\\");
            }
        }
        value = value.replace("\r\n", "\n");
        if (value.contains("\\n") && !value.contains("\n")) {
            value = value.replace("\\r\\n", "\n").replace("\\n", "\n");
        }
        return value;
    }

    @Override
    @Transactional
    public boolean revertToModification(Long articleId, Long modificationId) {
        CdcArticleModification mod = getModifications(articleId).stream()
                .filter(item -> Objects.equals(item.getId(), modificationId))
                .findFirst()
                .orElse(null);
        if (mod == null) {
            throw new RuntimeException("修改记录不存在");
        }

        CdcArticle article = getArticleOrThrow(articleId);
        String currentContent;
        // BUG-NEW-9 fix: beforeContent 可能为 null（首次创建时的修改记录）
        String restoreContent = mod.getBeforeContent();
        if (restoreContent == null) {
            throw new RuntimeException("该修改记录没有可回退的前一版本内容");
        }

        // Record this revert as a modification
        CdcArticleModification revertMod = new CdcArticleModification();
        revertMod.setArticleId(articleId);
        revertMod.setOperationType("revert");
        revertMod.setModifyTime(LocalDateTime.now());

        if ("outline".equals(mod.getModifyType())) {
            currentContent = normalizeContent(article.getOutline());
            restoreContent = normalizeContent(restoreContent);
            CdcArticleModification pending = modifyMapper.getPending(articleId, "outline");
            if (pending != null) modifyMapper.deleteById(pending.getId());
            revertMod.setModifyType("outline");
            revertMod.setBeforeContent(currentContent);
            revertMod.setAfterContent(restoreContent);
            modifyMapper.insert(revertMod);

            CdcArticle up = new CdcArticle();
            up.setId(articleId);
            up.setOutline(restoreContent);
            if (articleMapper.updateOutline(up) <= 0) {
                throw new RuntimeException("回退版本写入失败");
            }
            return true;
        } else if ("initial_draft".equals(mod.getModifyType())) {
            currentContent = normalizeContent(article.getInitialDraft());
            restoreContent = normalizeContent(restoreContent);
            CdcArticleModification pending = modifyMapper.getPending(articleId, "initial_draft");
            if (pending != null) modifyMapper.deleteById(pending.getId());
            revertMod.setModifyType("initial_draft");
            revertMod.setBeforeContent(currentContent);
            revertMod.setAfterContent(restoreContent);
            modifyMapper.insert(revertMod);

            CdcArticle up = new CdcArticle();
            up.setId(articleId);
            up.setInitialDraft(restoreContent);
            if (articleMapper.updateInitialDraft(up) <= 0) {
                throw new RuntimeException("回退版本写入失败");
            }
            return true;
        }

        return false;
    }

    @Override
    public boolean confirmFinal(Long id) {
        CdcArticle article = getArticleOrThrow(id);
        // BUG-NEW-3 fix: 校验初稿是否存在
        if (article.getInitialDraft() == null) {
            throw new RuntimeException("文章尚无初稿，无法确认终稿");
        }
        CdcArticle up = new CdcArticle();
        up.setId(id);
        up.setFinalArticle(article.getInitialDraft());
        up.setStatus(4);
        return articleMapper.updateFinalArticle(up) > 0;
    }

    @Override
    public List<CdcArticleModification> getModifications(Long articleId) {
        List<CdcArticleModification> modifications = new ArrayList<>(modifyMapper.listByArticleId(articleId));
        modifications.sort(Comparator
                .comparing(CdcArticleModification::getModifyTime, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(CdcArticleModification::getId, Comparator.nullsFirst(Comparator.naturalOrder())));

        Map<String, String> lastContent = new HashMap<>();
        Map<String, String> generatedContent = getGeneratedContent(articleId);
        List<CdcArticleModification> resolved = new ArrayList<>();

        for (CdcArticleModification modification : modifications) {
            String type = modification.getModifyType();
            String rawBefore = modification.getBeforeContent();
            String rawAfter = modification.getAfterContent();
            String before = normalizeContent(rawBefore);
            String after = normalizeContent(rawAfter);

            if ("manual_edit".equals(modification.getOperationType())
                    && isLegacyEscapingOnlyDifference(rawBefore, rawAfter, before, after)) {
                continue;
            }

            // Older clients auto-saved first and then wrote an encoded copy of the same text.
            // Reconstruct that record from the previous committed snapshot when possible.
            if ("manual_edit".equals(modification.getOperationType())
                    && Objects.equals(before, after)
                    && lastContent.containsKey(type)
                    && !Objects.equals(lastContent.get(type), after)) {
                before = lastContent.get(type);
            } else if ("manual_edit".equals(modification.getOperationType())
                    && Objects.equals(before, after)
                    && !lastContent.containsKey(type)) {
                before = generatedContent.get(type);
            }

            if (before == null) before = "";
            if (after == null) after = "";
            modification.setBeforeContent(before);
            modification.setAfterContent(after);

            // Do not show historical no-op saves that only changed JSON escaping.
            if (Objects.equals(before, after) && "manual_edit".equals(modification.getOperationType())) {
                continue;
            }

            resolved.add(modification);
            if (!after.isEmpty()) lastContent.put(type, after);
        }

        Collections.reverse(resolved);
        return resolved;
    }

    private boolean isLegacyEscapingOnlyDifference(String rawBefore, String rawAfter,
                                                   String before, String after) {
        boolean encoded = (rawBefore != null && rawBefore.trim().startsWith("\""))
                || (rawAfter != null && rawAfter.trim().startsWith("\""));
        if (!encoded || Objects.equals(before, after)) return false;
        return Objects.equals(before.replace("\\", "").replace("\"", ""),
                after.replace("\\", "").replace("\"", ""));
    }

    private Map<String, String> getGeneratedContent(Long articleId) {
        Map<String, String> generated = new HashMap<>();
        List<CdcAgentTrace> traces = new ArrayList<>(traceMapper.listByArticleId(articleId));
        traces.sort(Comparator.comparing(CdcAgentTrace::getId, Comparator.nullsFirst(Comparator.naturalOrder())));
        for (CdcAgentTrace trace : traces) {
            String type = "generate_outline".equals(trace.getStepName()) ? "outline"
                    : "generate_draft".equals(trace.getStepName()) ? "initial_draft" : null;
            if (type == null || generated.containsKey(type)) continue;
            try {
                Map<?, ?> payload = objectMapper.readValue(trace.getStepContent(), Map.class);
                Object result = payload.get("result");
                if (result != null) generated.put(type, normalizeContent(String.valueOf(result)));
            } catch (Exception ignored) {
                // Trace content is optional; the previous modification remains the fallback.
            }
        }
        return generated;
    }

    @Override
    public List<CdcAgentTrace> getAgentTrace(Long articleId) {
        return traceMapper.listByArticleId(articleId);
    }

    private void saveTrace(Long articleId, String stepName, String params, String result, int costTime) {
        CdcAgentTrace trace = new CdcAgentTrace();
        trace.setArticleId(articleId);
        trace.setStepName(stepName);

        // 使用 Jackson 构建合法 JSON，正确处理换行、引号等特殊字符
        String contentJson;
        try {
            Map<String, String> traceMap = new LinkedHashMap<>();
            traceMap.put("params", params != null ? params : "");
            traceMap.put("result", result != null ? result : "");
            contentJson = objectMapper.writeValueAsString(traceMap);
        } catch (Exception e) {
            log.warn("序列化 trace JSON 失败, 降级存储: {}", e.getMessage());
            contentJson = "{\"params\":\"\",\"result\":\"\"}";
        }
        trace.setStepContent(contentJson);

        trace.setCostTime(costTime);
        trace.setCreateTime(LocalDateTime.now());

        traceMapper.insert(trace);
    }

    @Override
    @org.springframework.transaction.annotation.Transactional
    public boolean deleteArticle(Long id) {
        // BUG-NEW-12 fix: 完整级联删除：配图 + 请求记录 + 留痕记录 + Agent 轨迹 + 文章本身
        CdcArticle article = articleMapper.getById(id);
        articleImageMapper.deleteByArticleId(id);
        modifyMapper.deleteByArticleId(id);
        traceMapper.deleteByArticleId(id);
        if (article != null && article.getRequestId() != null) {
            requestMapper.deleteById(article.getRequestId());
        }
        return articleMapper.deleteById(id) > 0;
    }
}

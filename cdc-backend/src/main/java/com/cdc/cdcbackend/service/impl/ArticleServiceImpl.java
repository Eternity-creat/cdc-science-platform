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
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
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

    @Override
    public List<ArticleListItemDTO> listArticles() {
        return articleMapper.listAll();
    }

    @Override
    public PageResult<ArticleListItemDTO> listArticlesPaged(int page, int size, Integer status, String keyword) {
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
        CdcArticle article = getArticle(articleId);
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
        CdcArticle article = getArticle(articleId);
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
    public boolean saveOutline(Long id, String newContent) {
        CdcArticle old = getArticle(id);

        CdcArticleModification m = new CdcArticleModification();
        m.setArticleId(id);
        m.setModifyType("outline");
        m.setOperationType("manual_edit");
        m.setBeforeContent(old.getOutline());
        m.setAfterContent(newContent);
        m.setModifyTime(LocalDateTime.now());
        modifyMapper.insert(m);

        CdcArticle up = new CdcArticle();
        up.setId(id);
        up.setOutline(newContent);
        return articleMapper.updateOutline(up) > 0;
    }

    @Override
    public boolean saveDraft(Long id, String newContent) {
        CdcArticle old = getArticle(id);

        CdcArticleModification m = new CdcArticleModification();
        m.setArticleId(id);
        m.setModifyType("initial_draft");
        m.setOperationType("manual_edit");
        m.setBeforeContent(old.getInitialDraft());
        m.setAfterContent(newContent);
        m.setModifyTime(LocalDateTime.now());
        modifyMapper.insert(m);

        CdcArticle up = new CdcArticle();
        up.setId(id);
        up.setInitialDraft(newContent);
        return articleMapper.updateInitialDraft(up) > 0;
    }

    @Override
    public boolean confirmOutline(Long id, String content) {
        // Save the outline and keep status=2
        CdcArticle old = getArticle(id);
        if (content != null && !content.equals(old.getOutline())) {
            CdcArticleModification m = new CdcArticleModification();
            m.setArticleId(id);
            m.setModifyType("outline");
            m.setOperationType("manual_edit");
            m.setBeforeContent(old.getOutline());
            m.setAfterContent(content);
            m.setModifyTime(LocalDateTime.now());
            modifyMapper.insert(m);

            CdcArticle up = new CdcArticle();
            up.setId(id);
            up.setOutline(content);
            up.setStatus(2);
            articleMapper.updateOutline(up);
        }
        return true;
    }

    @Override
    public boolean confirmDraft(Long id) {
        CdcArticle article = getArticle(id);
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
        CdcArticle article = getArticle(articleId);
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
                // Re-insert with updated afterContent
                modifyMapper.insert(lastMod);
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
        CdcArticle article = getArticle(articleId);
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
    public boolean autoSave(Long id, String field, String content) {
        CdcArticle up = new CdcArticle();
        up.setId(id);
        switch (field) {
            case "outline":
                up.setOutline(content);
                return articleMapper.autoSaveOutline(up) > 0;
            case "initial_draft":
            case "draft":
                up.setInitialDraft(content);
                return articleMapper.autoSaveDraft(up) > 0;
            case "final_article":
            case "final":
                up.setFinalArticle(content);
                return articleMapper.autoSaveFinal(up) > 0;
            default:
                return false;
        }
    }

    @Override
    public boolean revertToModification(Long articleId, Long modificationId) {
        CdcArticleModification mod = modifyMapper.getById(modificationId);
        if (mod == null || !mod.getArticleId().equals(articleId)) {
            throw new RuntimeException("修改记录不存在");
        }

        CdcArticle article = getArticle(articleId);
        String currentContent;
        String restoreContent = mod.getBeforeContent();

        // Record this revert as a modification
        CdcArticleModification revertMod = new CdcArticleModification();
        revertMod.setArticleId(articleId);
        revertMod.setOperationType("revert");
        revertMod.setModifyTime(LocalDateTime.now());

        if ("outline".equals(mod.getModifyType())) {
            currentContent = article.getOutline();
            revertMod.setModifyType("outline");
            revertMod.setBeforeContent(currentContent);
            revertMod.setAfterContent(restoreContent);
            modifyMapper.insert(revertMod);

            CdcArticle up = new CdcArticle();
            up.setId(articleId);
            up.setOutline(restoreContent);
            return articleMapper.updateOutline(up) > 0;
        } else if ("initial_draft".equals(mod.getModifyType())) {
            currentContent = article.getInitialDraft();
            revertMod.setModifyType("initial_draft");
            revertMod.setBeforeContent(currentContent);
            revertMod.setAfterContent(restoreContent);
            modifyMapper.insert(revertMod);

            CdcArticle up = new CdcArticle();
            up.setId(articleId);
            up.setInitialDraft(restoreContent);
            return articleMapper.updateInitialDraft(up) > 0;
        }

        return false;
    }

    @Override
    public boolean confirmFinal(Long id) {
        CdcArticle article = getArticle(id);
        CdcArticle up = new CdcArticle();
        up.setId(id);
        up.setFinalArticle(article.getInitialDraft());
        up.setStatus(4);
        return articleMapper.updateFinalArticle(up) > 0;
    }

    @Override
    public List<CdcArticleModification> getModifications(Long articleId) {
        return modifyMapper.listByArticleId(articleId);
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
        // 级联删除：留痕记录 + Agent 轨迹 + 文章本身
        modifyMapper.deleteByArticleId(id);
        traceMapper.deleteByArticleId(id);
        return articleMapper.deleteById(id) > 0;
    }
}

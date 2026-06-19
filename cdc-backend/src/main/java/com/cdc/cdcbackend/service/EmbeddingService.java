package com.cdc.cdcbackend.service;

import com.cdc.cdcbackend.config.DashScopeConfig;
import com.cdc.cdcbackend.entity.CdcEmbeddingCache;
import com.cdc.cdcbackend.entity.CdcLlmConfig;
import com.cdc.cdcbackend.mapper.CdcEmbeddingCacheMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Embedding 服务：Java 直接调用 DashScope REST API 计算文本向量。
 * 不再通过 Agent 中转，减少网络跳数和耦合。
 *
 * 模型配置优先从 cdc_llm_config 表读取（前端可管理），
 * 未配置时回退到 application.properties 中的 dashscope.* 默认值。
 *
 * 使用 OpenAI 兼容接口：POST {base_url}/embeddings
 */
@Service
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    /** DashScope embedding API 单次最大文本数 */
    private static final int BATCH_SIZE = 25;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Resource
    private CdcLlmConfigService llmConfigService;

    @Resource
    private DashScopeConfig dashScopeConfig;

    @Resource
    private CdcEmbeddingCacheMapper cacheMapper;

    /**
     * 计算单段文本的 embedding 向量
     *
     * @param text 待嵌入的文本
     * @return 向量列表（Float），失败返回 null
     */
    public List<Double> computeEmbedding(String text) {
        return computeEmbeddings(List.of(text)).stream().findFirst().orElse(null);
    }

    /**
     * 批量计算文本 embedding 向量
     *
     * @param texts 文本列表
     * @return 每个文本对应的向量列表
     */
    public List<List<Double>> computeEmbeddings(List<String> texts) {
        if (texts == null || texts.isEmpty()) {
            return Collections.emptyList();
        }

        // 从 cdc_llm_config 读取配置，前端可动态修改
        EmbeddingConfig config = getEmbeddingConfig();
        String url = config.baseUrl + "/embeddings";

        // 构建请求头
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(config.apiKey);

        // 构建请求体（OpenAI 兼容格式）
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", config.modelName);
        body.put("input", texts);

        try {
            String jsonBody = objectMapper.writeValueAsString(body);
            HttpEntity<String> request = new HttpEntity<>(jsonBody, headers);

            log.debug("调用 Embedding API: model={}, baseUrl={}, texts={}", config.modelName, config.baseUrl, texts.size());

            ResponseEntity<String> response = restTemplate.exchange(
                url,
                HttpMethod.POST,
                request,
                String.class
            );

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.error("Embedding API 返回异常: status={}", response.getStatusCode());
                return Collections.emptyList();
            }

            // 解析响应
            return parseEmbeddingResponse(response.getBody(), texts.size());

        } catch (Exception e) {
            log.error("Embedding API 调用失败: {}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    /**
     * 带缓存的批量 embedding 计算。
     *
     * 流程：
     * 1. 对每段文本算 MD5 哈希
     * 2. 批量查 cdc_embedding_cache，命中则直接复用
     * 3. 未命中的文本分批调 DashScope API（每批 ≤ 25 条）
     * 4. 新计算的向量写回 cache 表
     * 5. 按原始顺序返回所有向量
     *
     * @param texts      待计算文本列表
     * @param sourceType 来源类型 (segment/query/other)，仅用于 cache 标记
     * @param sourceIds  每条文本对应的来源 ID（可为 null）
     * @return 每段文本对应的向量，长度与 texts 一致；某条失败则对应位置为 null
     */
    public List<List<Double>> computeEmbeddingsWithCache(List<String> texts,
                                                          String sourceType,
                                                          List<Long> sourceIds) {
        if (texts == null || texts.isEmpty()) {
            return Collections.emptyList();
        }

        String modelVersion = getModelVersion();
        int n = texts.size();

        // 1. 算哈希
        List<String> hashes = texts.stream()
                .map(this::computeContentHash)
                .collect(Collectors.toList());

        // 2. 批量查缓存
        Map<String, List<Double>> cacheHit = new HashMap<>();
        try {
            List<CdcEmbeddingCache> cached = cacheMapper.listByHashesAndModel(hashes, modelVersion);
            for (CdcEmbeddingCache c : cached) {
                List<Double> vec = objectMapper.readValue(c.getEmbedding(), new TypeReference<List<Double>>() {});
                cacheHit.put(c.getContentHash(), vec);
            }
        } catch (Exception e) {
            log.warn("查询 embedding 缓存失败，全部走 API: {}", e.getMessage());
        }

        // 3. 区分命中 / 未命中
        int hitCount = 0;
        List<Integer> missIndices = new ArrayList<>();
        List<String> missTexts = new ArrayList<>();
        List<Double>[] results = new List[n];

        for (int i = 0; i < n; i++) {
            List<Double> cached = cacheHit.get(hashes.get(i));
            if (cached != null) {
                results[i] = cached;
                hitCount++;
            } else {
                missIndices.add(i);
                missTexts.add(texts.get(i));
            }
        }

        log.info("Embedding 缓存命中 {}/{}，需计算 {} 条", hitCount, n, missTexts.size());

        // 4. 分批调 API（每批 ≤ BATCH_SIZE）
        if (!missTexts.isEmpty()) {
            List<List<Double>> computed = new ArrayList<>();
            for (int start = 0; start < missTexts.size(); start += BATCH_SIZE) {
                int end = Math.min(start + BATCH_SIZE, missTexts.size());
                List<String> batch = missTexts.subList(start, end);
                List<List<Double>> batchResult = computeEmbeddings(batch);
                computed.addAll(batchResult);
            }

            // 5. 回填结果 + 写缓存
            for (int j = 0; j < missIndices.size(); j++) {
                int origIdx = missIndices.get(j);
                List<Double> vec = (j < computed.size()) ? computed.get(j) : null;
                results[origIdx] = vec;

                if (vec != null) {
                    try {
                        CdcEmbeddingCache cacheEntry = new CdcEmbeddingCache();
                        cacheEntry.setContentHash(hashes.get(origIdx));
                        cacheEntry.setEmbedding(objectMapper.writeValueAsString(vec));
                        cacheEntry.setModelVersion(modelVersion);
                        cacheEntry.setSourceType(sourceType);
                        cacheEntry.setSourceId(sourceIds != null && origIdx < sourceIds.size()
                                ? sourceIds.get(origIdx) : null);
                        cacheMapper.upsert(cacheEntry);
                    } catch (Exception e) {
                        log.warn("写入 embedding 缓存失败: {}", e.getMessage());
                    }
                }
            }
        }

        return Arrays.asList(results);
    }

    /**
     * 将向量序列化为 JSON 字符串（供 DB 存储使用）
     */
    public String serializeVector(List<Double> vector) {
        try {
            return objectMapper.writeValueAsString(vector);
        } catch (Exception e) {
            log.error("序列化向量失败: {}", e.getMessage());
            return "[]";
        }
    }

    /**
     * 计算文本的 MD5 哈希值（用于 content_hash）
     */
    public String computeContentHash(String content) {
        return org.springframework.util.DigestUtils.md5DigestAsHex(
            content.getBytes(StandardCharsets.UTF_8)
        );
    }

    /**
     * 获取当前使用的 embedding 模型名称（优先从 DB 读取）
     */
    public String getModelVersion() {
        return getEmbeddingConfig().modelName;
    }

    /**
     * 从 cdc_llm_config 表读取 embedding 类型的默认配置。
     * 未配置时回退到 application.properties 中的 dashscope.* 默认值。
     */
    private EmbeddingConfig getEmbeddingConfig() {
        try {
            CdcLlmConfig config = llmConfigService.getDefaultByType("embedding");
            if (config != null) {
                String apiKey = config.getApiKeyEncrypted();
                String baseUrl = config.getBaseUrl();
                log.debug("使用 DB embedding配置: model={}, provider={}", config.getModelName(), config.getProvider());
                return new EmbeddingConfig(
                    config.getModelName(),
                    (apiKey != null && !apiKey.isEmpty()) ? apiKey : dashScopeConfig.getApiKey(),
                    (baseUrl != null && !baseUrl.isEmpty()) ? baseUrl : dashScopeConfig.getBaseUrl()
                );
            }
        } catch (Exception e) {
            log.debug("获取 DB embedding 配置失败，使用默认值: {}", e.getMessage());
        }
        return new EmbeddingConfig(
            dashScopeConfig.getEmbeddingModel(),
            dashScopeConfig.getApiKey(),
            dashScopeConfig.getBaseUrl()
        );
    }

    /**
     * 内部配置 DTO
     */
    private record EmbeddingConfig(String modelName, String apiKey, String baseUrl) {}

    /**
     * 解析 OpenAI 兼容格式的 Embedding 响应
     *
     * 响应格式示例：
     * {
     *   "object": "list",
     *   "data": [
     *     {"object": "embedding", "embedding": [0.1, 0.2, ...], "index": 0}
     *   ],
     *   "model": "text-embedding-v2",
     *   "usage": {"prompt_tokens": 10, "total_tokens": 10}
     * }
     */
    private List<List<Double>> parseEmbeddingResponse(String responseBody, int expectedCount) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode dataNode = root.get("data");

            if (dataNode == null || !dataNode.isArray()) {
                log.error("Embedding 响应缺少 data 数组: {}", responseBody.substring(0, Math.min(200, responseBody.length())));
                return Collections.emptyList();
            }

            // 按 index 排序（DashScope 可能乱序返回）
            List<JsonNode> items = new ArrayList<>();
            dataNode.forEach(items::add);
            items.sort(Comparator.comparingInt(n -> n.has("index") ? n.get("index").asInt() : 0));

            List<List<Double>> results = new ArrayList<>();
            for (JsonNode item : items) {
                JsonNode embeddingNode = item.get("embedding");
                if (embeddingNode == null || !embeddingNode.isArray()) {
                    log.warn("单条 embedding 数据格式异常，跳过");
                    continue;
                }
                List<Double> vector = new ArrayList<>();
                embeddingNode.forEach(v -> vector.add(v.asDouble()));
                results.add(vector);
            }

            if (results.size() != expectedCount) {
                log.warn("Embedding 返回数量不匹配: expected={}, actual={}", expectedCount, results.size());
            }

            log.debug("Embedding 解析完成: count={}, dim={}", results.size(), results.isEmpty() ? 0 : results.get(0).size());
            return results;

        } catch (Exception e) {
            log.error("Embedding 响应解析失败: {}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }
}

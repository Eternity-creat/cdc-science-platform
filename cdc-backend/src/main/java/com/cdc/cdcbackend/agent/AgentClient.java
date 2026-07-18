package com.cdc.cdcbackend.agent;

import com.cdc.cdcbackend.config.AgentConfig;
import com.cdc.cdcbackend.dto.WikiTemplateContext;
import com.cdc.cdcbackend.entity.CdcArticleRequest;
import com.cdc.cdcbackend.entity.WikiEntity;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;
import java.util.*;

@Component
public class AgentClient {

    private static final Logger log = LoggerFactory.getLogger(AgentClient.class);
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Resource
    private AgentConfig agentConfig;

    public Map<String, Object> generateOutline(Long articleId, CdcArticleRequest req, WikiTemplateContext context) {
        return buildAndCall(articleId, req, context, "outline", null);
    }

    public Map<String, Object> generateDraft(Long articleId, CdcArticleRequest req, WikiTemplateContext context, String previousContent) {
        return buildAndCall(articleId, req, context, "draft", previousContent);
    }

    public Map<String, Object> streamOutline(Long articleId, CdcArticleRequest req, WikiTemplateContext context,
                                               Consumer<String> onChunk, Consumer<String> onReplace) {
        return buildAndStream(articleId, req, context, "outline", null, onChunk, onReplace);
    }

    public Map<String, Object> streamDraft(Long articleId, CdcArticleRequest req, WikiTemplateContext context,
                                             String previousContent, Consumer<String> onChunk, Consumer<String> onReplace) {
        return buildAndStream(articleId, req, context, "draft", previousContent, onChunk, onReplace);
    }

    private Map<String, Object> buildParams(Long articleId, CdcArticleRequest req, WikiTemplateContext context,
                                            String step, String previousContent) {
        Map<String, Object> params = new HashMap<>();

        params.put("article_id", articleId);
        params.put("step", step);
        params.put("mode", req.getMode() != null ? req.getMode() : 1);

        // 实体信息
        if (context.getEntity() != null) {
            params.put("entity_name", context.getEntity().getStdName());
            params.put("entity_alias", context.getEntity().getAlias());
            params.put("entity_summary", context.getEntity().getSummary());
        } else {
            params.put("entity_name", "");
            params.put("entity_alias", "");
            params.put("entity_summary", "");
        }

        // 人群和场景
        params.put("population_name", context.getPopulation() != null ? context.getPopulation().getStdName() : "");
        params.put("scene_name", context.getScene() != null ? context.getScene().getStdName() : "");

        // 模板信息
        if (context.getTemplate() != null) {
            params.put("template_name", context.getTemplate().getTemplateName());
            params.put("template_purpose", context.getTemplate().getPurpose());
            params.put("template_tone", context.getTemplate().getTone());
            params.put("template_outline", context.getTemplate().getOutlineStructure());
        } else {
            params.put("template_name", "");
            params.put("template_purpose", "");
            params.put("template_tone", "");
            params.put("template_outline", "");
        }

        params.put("word_count", req.getWordCount() != null ? req.getWordCount() : 800);

        // 关联实体ID列表
        params.put("entity_ids", context.getEntityIds() != null ? context.getEntityIds() : new ArrayList<>());

        // Wiki 知识片段（含预计算向量）
        if (context.getSegments() != null) {
            List<Map<String, Object>> segments = new ArrayList<>();
            for (WikiTemplateContext.WikiSegmentInfo s : context.getSegments()) {
                Map<String, Object> seg = new HashMap<>();
                seg.put("id", s.getId());
                seg.put("entity_id", s.getEntityId());
                seg.put("owner_entity_type", s.getEntityType());
                seg.put("content", s.getContent());
                seg.put("source", s.getSource());
                // 将 embedding JSON 字符串解析为 List，Agent 端期望 List[float]
                if (s.getEmbedding() != null && !s.getEmbedding().isEmpty()) {
                    try {
                        List<Double> vector = objectMapper.readValue(
                            s.getEmbedding(), new TypeReference<List<Double>>() {});
                        seg.put("embedding", vector);
                    } catch (Exception e) {
                        log.warn("解析 segment embedding 失败: id={}, error={}", s.getId(), e.getMessage());
                    }
                }
                segments.add(seg);
            }
            params.put("wiki_segments", segments);
        } else {
            params.put("wiki_segments", new ArrayList<>());
        }

        // 规则
        params.put("must_include", context.getMustInclude() != null ? context.getMustInclude() : new ArrayList<>());
        params.put("must_not_say", context.getMustNotSay() != null ? context.getMustNotSay() : new ArrayList<>());
        params.put("user_text", req.getUserText() != null ? req.getUserText() : "");

        // 之前的内容
        params.put("previous_content", previousContent);

        return params;
    }

    private Map<String, Object> buildAndCall(Long articleId, CdcArticleRequest req, WikiTemplateContext context,
                                String step, String previousContent) {
        Map<String, Object> params = buildParams(articleId, req, context, step, previousContent);
        String agentUrl = agentConfig.getUrl() + "/api/agent/generate";
        try {
            String rawResponse = restTemplate.postForObject(agentUrl, params, String.class);
            log.debug("Agent 原始响应 (前200字符): {}",
                rawResponse != null && rawResponse.length() > 200
                    ? rawResponse.substring(0, 200) + "..." : rawResponse);
            return extractResponse(rawResponse, step);
        } catch (Exception e) {
            log.error("调用 Agent 服务失败: {}", e.getMessage(), e);
            throw new RuntimeException("Agent 服务异常：" + e.getMessage(), e);
        }
    }

    private Map<String, Object> buildAndStream(Long articleId, CdcArticleRequest req, WikiTemplateContext context,
                                  String step, String previousContent, Consumer<String> onChunk, Consumer<String> onReplace) {
        Map<String, Object> params = buildParams(articleId, req, context, step, previousContent);
        String agentUrl = agentConfig.getUrl() + "/api/agent/generate/stream";

        try {
            String requestBody = objectMapper.writeValueAsString(params);
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(agentUrl))
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                .build();

            HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .build();
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String errorBody = new String(response.body().readAllBytes(), StandardCharsets.UTF_8);
                throw new RuntimeException("Agent SSE HTTP " + response.statusCode() + ": " + errorBody);
            }

            StringBuilder content = new StringBuilder();
            String currentEvent = "message";
            StringBuilder dataBuffer = new StringBuilder();
            String[] generationMetaHolder = new String[1]; // capture generation_meta from done event

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isEmpty()) {
                        handleSseMessage(currentEvent, dataBuffer.toString(), content, onChunk, onReplace, generationMetaHolder);
                        currentEvent = "message";
                        dataBuffer.setLength(0);
                        continue;
                    }
                    if (line.startsWith(":")) continue;
                    if (line.startsWith("event:")) {
                        currentEvent = line.substring("event:".length()).trim();
                    } else if (line.startsWith("data:")) {
                        if (dataBuffer.length() > 0) dataBuffer.append('\n');
                        dataBuffer.append(line.substring("data:".length()).trim());
                    }
                }
                if (dataBuffer.length() > 0) {
                    handleSseMessage(currentEvent, dataBuffer.toString(), content, onChunk, onReplace, generationMetaHolder);
                }
            }

            log.info("Agent SSE 完成 (step={}, 长度={})", step, content.length());
            Map<String, Object> result = new HashMap<>();
            result.put("content", content.toString());
            result.put("generationMeta", generationMetaHolder[0]);
            return result;
        } catch (Exception e) {
            log.error("调用 Agent SSE 服务失败: {}", e.getMessage(), e);
            throw new RuntimeException("Agent SSE 服务异常：" + e.getMessage(), e);
        }
    }

    private void handleSseMessage(String event, String data, StringBuilder content,
                                   Consumer<String> onChunk, Consumer<String> onReplace,
                                   String[] generationMetaHolder) throws Exception {
        if (data == null || data.isBlank()) return;
        if ("error".equals(event)) {
            JsonNode root = objectMapper.readTree(data);
            String message = root.has("message") ? root.get("message").asText() : data;
            throw new RuntimeException(message);
        }
        JsonNode root = objectMapper.readTree(data);

        if ("replace".equals(event)) {
            JsonNode contentNode = root.get("content");
            if (contentNode != null && contentNode.isTextual()) {
                String replacement = contentNode.asText();
                content.setLength(0);
                content.append(replacement);
                // 转发 replace 事件到前端，让前端清空累积内容并替换
                if (onReplace != null) {
                    onReplace.accept(replacement);
                }
            }
            return;
        }

        if ("done".equals(event)) {
            JsonNode contentNode = root.get("content");
            if (contentNode != null && contentNode.isTextual()) {
                String replacement = contentNode.asText();
                if (!replacement.equals(content.toString())) {
                    content.setLength(0);
                    content.append(replacement);
                }
            }
            // 从 done 事件中提取 generation_meta
            JsonNode metaNode = root.get("generation_meta");
            if (metaNode != null && metaNode.isObject()) {
                generationMetaHolder[0] = objectMapper.writeValueAsString(metaNode);
            }
            return;
        }

        if ("delta".equals(event)) {
            JsonNode deltaNode = root.get("delta");
            if (deltaNode == null || !deltaNode.isTextual()) return;

            String delta = deltaNode.asText();
            if (delta.isEmpty()) return;
            content.append(delta);
            if (onChunk != null) onChunk.accept(delta);
        }
    }

    /**
     * 从 Agent 结构化响应 (AgentResponse JSON) 中提取 content 和 generation_meta。
     *
     * 返回 Map: {"content": String, "generationMeta": String (JSON)}
     * generationMeta 可能为 null（如果 Agent 响应中没有该字段）。
     */
    private Map<String, Object> extractResponse(String rawResponse, String step) {
        Map<String, Object> result = new HashMap<>();
        result.put("content", "");
        result.put("generationMeta", null);

        if (rawResponse == null || rawResponse.isBlank()) {
            log.warn("Agent 返回空响应 (step={})", step);
            return result;
        }

        String trimmed = rawResponse.trim();
        if (!trimmed.startsWith("{")) {
            log.warn("Agent 响应非 JSON 格式 (step={}), 原样返回", step);
            result.put("content", rawResponse);
            return result;
        }

        try {
            JsonNode root = objectMapper.readTree(trimmed);
            JsonNode contentNode = root.get("content");

            if (contentNode != null && contentNode.isTextual()) {
                String content = contentNode.asText();
                log.info("成功提取 Agent 响应 content (step={}, 长度={})", step, content.length());
                result.put("content", content);
            }

            // 提取 generation_meta
            JsonNode metaNode = root.get("generation_meta");
            if (metaNode != null && metaNode.isObject()) {
                result.put("generationMeta", objectMapper.writeValueAsString(metaNode));
            }

            // 检查错误
            if (contentNode == null || !contentNode.isTextual()) {
                JsonNode detailNode = root.get("detail");
                if (detailNode != null) {
                    String errorMsg = detailNode.asText();
                    log.error("Agent 返回错误: {}", errorMsg);
                    throw new RuntimeException("Agent 错误：" + errorMsg);
                }
                log.warn("Agent 响应中未找到 content 字段 (step={}), 原样返回", step);
                result.put("content", rawResponse);
            }

            return result;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.warn("解析 Agent JSON 响应失败 (step={}): {}, 原样返回", step, e.getMessage());
            result.put("content", rawResponse);
            return result;
        }
    }
}

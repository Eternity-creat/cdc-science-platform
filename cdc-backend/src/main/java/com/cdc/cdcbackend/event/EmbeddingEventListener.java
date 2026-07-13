package com.cdc.cdcbackend.event;

import com.cdc.cdcbackend.entity.WikiSegmentEmbedding;
import com.cdc.cdcbackend.mapper.WikiSegmentEmbeddingMapper;
import com.cdc.cdcbackend.service.EmbeddingService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 片段变更事件监听器。
 *
 * 架构说明：Embedding 计算由 Java 直接调用 DashScope REST API 完成，
 * 不经过 Agent 中转。Agent 仅负责文章生成等重度 LLM 任务。
 *
 * 流程：
 * - CREATE/UPDATE → EmbeddingService 调 DashScope → 向量序列化 → mapper.upsert 入库
 * - DELETE → mapper.deleteBySegmentId 清除记录
 */
@Component
public class EmbeddingEventListener {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingEventListener.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Resource
    private EmbeddingService embeddingService;

    @Resource
    private WikiSegmentEmbeddingMapper wikiSegmentEmbeddingMapper;

    @Async("embeddingExecutor")
    @EventListener
    public void onSegmentChanged(SegmentChangedEvent event) {
        log.info("处理片段变更事件: segmentId={}, changeType={}", event.getSegmentId(), event.getChangeType());

        if (event.getChangeType() == SegmentChangedEvent.ChangeType.DELETED) {
            handleDelete(event);
        } else {
            handleCreateOrUpdate(event);
        }
    }

    /**
     * 删除片段时：直接清除数据库中的 embedding 记录
     */
    private void handleDelete(SegmentChangedEvent event) {
        try {
            wikiSegmentEmbeddingMapper.deleteBySegmentId(event.getSegmentId());
            log.info("Embedding 记录已删除: segmentId={}", event.getSegmentId());
        } catch (Exception e) {
            log.error("删除 embedding 记录失败: segmentId={}, error={}", event.getSegmentId(), e.getMessage(), e);
        }
    }

    /**
     * 创建/更新片段时：
     * 1. 计算 content_hash（MD5）
     * 2. 调用 DashScope Embedding API 获取向量
     * 3. 序列化向量并 upsert 到 wiki_segment_embedding 表
     */
    private void handleCreateOrUpdate(SegmentChangedEvent event) {
        try {
            // 1. 计算内容哈希
            String contentHash = embeddingService.computeContentHash(event.getContent());

            // 2. 直接调用 DashScope（不经过 Agent）
            List<Double> vector = embeddingService.computeEmbedding(event.getContent());
            if (vector == null || vector.isEmpty()) {
                log.error("Embedding 计算返回空向量: segmentId={}", event.getSegmentId());
                return;
            }

            log.info("Embedding 计算完成: segmentId={}, dim={}", event.getSegmentId(), vector.size());

            // 3. 序列化向量 → JSON 字符串
            String embeddingJson;
            try {
                embeddingJson = objectMapper.writeValueAsString(vector);
            } catch (JsonProcessingException e) {
                log.error("Embedding 向量序列化失败: segmentId={}", event.getSegmentId(), e);
                return;
            }

            // 4. 入库
            WikiSegmentEmbedding embedding = new WikiSegmentEmbedding();
            embedding.setSegmentId(event.getSegmentId());
            embedding.setEntityId(event.getEntityId());
            embedding.setContentHash(contentHash);
            embedding.setEmbedding(embeddingJson);
            embedding.setModelVersion(embeddingService.getModelVersion());
            embedding.setDimensions(vector.size());

            wikiSegmentEmbeddingMapper.upsert(embedding);
            log.info("Embedding 已入库: segmentId={}, entityId={}, model={}, dim={}",
                event.getSegmentId(), event.getEntityId(),
                embeddingService.getModelVersion(), vector.size());

        } catch (Exception e) {
            log.error("Embedding 计算/入库失败: segmentId={}, error={}", event.getSegmentId(), e.getMessage(), e);
        }
    }
}

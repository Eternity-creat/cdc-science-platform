package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 通用 Embedding 缓存实体。
 * 按 content_hash + model_version 去重，同一段文本不论来源均可复用。
 */
@Data
public class CdcEmbeddingCache {
    private Long id;
    private String contentHash;
    private String embedding;      // JSON 字符串
    private String modelVersion;
    private String sourceType;     // segment / query / other
    private Long sourceId;
    private LocalDateTime createdAt;
}

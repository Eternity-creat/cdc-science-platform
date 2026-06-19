package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class WikiSegmentEmbedding {
    private Long id;
    private Long segmentId;
    private Long entityId;
    private String contentHash;
    private String embedding;    // JSON 字符串，存储向量数组
    private String modelVersion;
    private Integer dimensions;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

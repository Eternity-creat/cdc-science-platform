package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CdcAgentTrace {
    private Long id;
    private Long articleId;
    private String stepName;
    private String stepContent;
    private Integer costTime;
    private String modelUsed;       // NEW: 使用的模型名称
    private String tokenUsage;      // NEW: JSON - token 用量
    private String qualityMetrics;  // NEW: JSON - 质量指标
    private LocalDateTime createTime;
}
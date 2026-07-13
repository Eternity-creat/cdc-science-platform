package com.cdc.cdcbackend.entity;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class CdcArticle {
    private Long id;
    private Long requestId;
    private Long templateId;
    private String outline;
    private String initialDraft;
    private String finalArticle;
    private Integer status;
    private String coverImage;         // NEW
    private String images;             // NEW: JSON
    private BigDecimal qualityScore;   // NEW
    private String readabilityLevel;   // NEW
    private String generationMeta;     // NEW: JSON
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}